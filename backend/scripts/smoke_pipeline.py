#!/usr/bin/env python3
"""
End-to-end smoke test for the Poddy generation pipeline.

Runs every stage sequentially (title → source discovery → download/transcribe →
clip extraction → ordering → narration → stitch), prints per-stage timings, and
measures the final audio's integrated loudness — so a fresh Cloud Agent VM (with
OPENAI_API_KEY set and podcast-CDN egress open) can validate the whole pipeline
and produce a real MP3 with a single command:

    python backend/scripts/smoke_pipeline.py --topic "the science of deep sleep" --depth quick

It does NOT require the FastAPI server to be running — it calls the service layer
directly. ffmpeg must be on PATH (it is in the Docker image / Cloud Agent VM).
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request

# Make `services` importable whether run from repo root or backend/.
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(HERE)
sys.path.insert(0, BACKEND_DIR)

# Mirror main.py's DEPTH_CONFIG so this stays a standalone validator.
DEPTH_CONFIG = {
    "quick":    {"n_sources": 2, "n_clips": 4, "window": 35},
    "standard": {"n_sources": 3, "n_clips": 6, "window": 45},
    "deep":     {"n_sources": 5, "n_clips": 8, "window": 70},
}


def _hr(title):
    print("\n" + "─" * 70 + f"\n{title}\n" + "─" * 70)


def _http_code(url, headers=None, timeout=10):
    try:
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def preflight():
    _hr("PREFLIGHT")
    ok = True
    key = os.environ.get("OPENAI_API_KEY", "")
    print(f"OPENAI_API_KEY set: {'yes' if key else 'NO'} (len={len(key)})")
    if not key:
        print("  ✗ No API key. Add OPENAI_API_KEY as a Cloud Agent secret and start a NEW agent.")
        ok = False
    else:
        code = _http_code("https://api.openai.com/v1/models",
                          headers={"Authorization": f"Bearer {key}"})
        print(f"OpenAI reachable: HTTP {code}" + ("" if code == 200 else "  ✗ expected 200"))
        ok = ok and code == 200
    feed = _http_code("https://feeds.megaphone.fm/hubermanlab",
                      headers={"User-Agent": "Poddy/1.0"})
    print(f"Sample podcast feed (megaphone): HTTP {feed}"
          + ("" if feed and feed < 400 else "  ✗ egress likely blocked — open Network Access (allow-all)"))
    ok = ok and bool(feed) and feed < 400
    if subprocess.run(["which", "ffmpeg"], capture_output=True).returncode != 0:
        print("  ✗ ffmpeg not found on PATH")
        ok = False
    else:
        print("ffmpeg: found")
    return ok


def ffprobe_duration_ms(path):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return int(float(out) * 1000)
    except Exception:
        return 0


def measure_lufs(path):
    """Integrated loudness (LUFS) of the final mix via ffmpeg loudnorm analysis."""
    try:
        res = subprocess.run(
            ["ffmpeg", "-i", path, "-af", "loudnorm=print_format=json", "-f", "null", "-"],
            capture_output=True, text=True,
        )
        import re
        m = re.search(r"\{[^{}]*input_i[^{}]*\}", res.stderr, re.S)
        if m:
            return float(json.loads(m.group(0)).get("input_i", 0.0))
    except Exception:
        pass
    return None


def main():
    ap = argparse.ArgumentParser(description="Poddy end-to-end pipeline smoke test")
    ap.add_argument("--topic", default="the science of deep sleep")
    ap.add_argument("--depth", default="quick", choices=list(DEPTH_CONFIG))
    ap.add_argument("--out-dir", default=os.path.join("/tmp", "poddy_smoke"))
    ap.add_argument("--skip-preflight", action="store_true")
    args = ap.parse_args()

    if not args.skip_preflight and not preflight():
        print("\nPreflight failed — fix the above before running the full pipeline.")
        sys.exit(2)

    from services.ingestion import process_sources_parallel
    from services.discovery import discover_episode_candidates
    from services.llm_curator import (
        generate_title, curate_sources, extract_clips_from_source,
        order_and_deduplicate, write_transitions_batch,
    )
    from services.audio_engine import stitch_multi_source

    cfg = DEPTH_CONFIG[args.depth]
    job_dir = os.path.join(args.out_dir, str(int(time.time())))
    os.makedirs(job_dir, exist_ok=True)
    timings = {}

    def stage(name, fn):
        _hr(name)
        t = time.time()
        result = fn()
        dt = time.time() - t
        timings[name] = round(dt, 1)
        print(f"  ⏱  {name}: {dt:.1f}s")
        return result

    print(f"\nTopic: {args.topic!r}  |  Depth: {args.depth}  |  Out: {job_dir}")

    title = stage("Stage 0 — title", lambda: generate_title(args.topic))
    print(f"  Title: {title}")

    def _discover():
        grounded = discover_episode_candidates(
            args.topic, n_sources=cfg["n_sources"], n_extra=max(3, cfg["n_sources"]))
        if grounded:
            return grounded
        print("  Grounded discovery empty — falling back to recall")
        return curate_sources(args.topic, n_sources=cfg["n_sources"], n_extra=max(3, cfg["n_sources"]))
    sources = stage("Stage 1 — source discovery", _discover)
    print(f"  Candidates: {[(s.get('podcast_name'), s.get('resolved_episode_title') or s.get('episode_title_hint')) for s in sources]}")

    enriched = stage("Stage 2 — download + transcribe",
                     lambda: process_sources_parallel(
                         sources, job_dir, user_topic=args.topic,
                         target=cfg["n_sources"], window_minutes=cfg["window"]))
    print(f"  Sources ready: {[s.get('podcast_name') for s in enriched]}")
    if not enriched:
        print("  ✗ No sources could be downloaded/transcribed. Check egress.")
        sys.exit(1)

    def _extract():
        all_clips = []
        for src in enriched:
            try:
                clips = extract_clips_from_source(
                    topic=args.topic, transcript=src["transcript"],
                    source_info=src, n_clips=cfg["n_clips"])
            except Exception as e:
                print(f"  clip extraction failed for {src.get('podcast_name')}: {e}")
                continue
            for c in clips:
                c["audio_path"] = src["audio_path"]
            all_clips.extend(clips)
        return all_clips
    all_clips = stage("Stage 3 — clip extraction", _extract)
    print(f"  Clips extracted: {len(all_clips)}")

    ordered = stage("Stage 4 — ordering/dedupe",
                    lambda: order_and_deduplicate(args.topic, all_clips))
    print(f"  Clips after ordering: {len(ordered)}")

    plan = stage("Stage 5 — narration",
                 lambda: write_transitions_batch(args.topic, ordered))

    out_path, chapters = stage("Stage 6 — stitch",
                               lambda: stitch_multi_source(plan, job_dir))

    # ── Report ───────────────────────────────────────────────────────────────
    _hr("RESULT")
    dur_ms = ffprobe_duration_ms(out_path)
    lufs = measure_lufs(out_path)
    n_clip_ch = sum(1 for c in chapters if c.get("type") == "clip")
    print(f"  Output MP3:        {out_path}")
    print(f"  Duration:          {dur_ms/1000:.1f}s ({dur_ms} ms)")
    print(f"  Chapters:          {len(chapters)} ({n_clip_ch} clips + narration)")
    print(f"  Integrated loudness: {lufs} LUFS  (target ≈ -16)")
    print(f"  Sources used:      {sorted({c.get('source_podcast') for c in chapters if c.get('source_podcast')})}")
    print(f"  Stage timings (s): {json.dumps(timings)}")
    print(f"  Total:             {round(sum(timings.values()),1)}s")
    print("\n✅ Pipeline ran end-to-end. Play/inspect the MP3 above, and use it to record a real walkthrough.")


if __name__ == "__main__":
    main()
