"""
Pipeline orchestrator — ties the stages together.

Two modes:
  * DRY RUN (default): every stage prints the commands it WOULD run and returns
    plan data; nothing is downloaded and no media is written.
  * LIVE (--execute): actually renders a lesson.mp4. Media is acquired either by
    yt-dlp (real YouTube, --allow-download) or generated synthetically
    (--self-test, fully offline). Narration is real edge-tts over slates.

Stage map (mirrors backend/main.py run_pipeline, video edition):
  0. title                — display title for the lesson
  1. discovery            — yt-dlp license-filtered candidates (or synthetic)
  2. captions             — fetch/normalize transcripts per source
  3. segment selection    — LLM/heuristic pick + boundary snap
  4. order                — cross-source source-balanced ordering
  5. lesson plan          — teacher script: intro/bridges/checkpoints/recap/outro
  6. render narration     — slate + TTS (or talking-head avatar)
  7. cut + normalize clips— per-source segment extraction + canonicalize + lower-third
  8. concat + master      — assemble final lesson, loudness master to -16 LUFS
"""
from __future__ import annotations

from typing import List, Dict, Optional
import os

from .config import PipelineConfig, depth_cfg
from . import discovery, transcript, selection, pedagogy, avatar, video_engine


def _order_clips(all_clips: List[Dict]) -> List[Dict]:
    """Source-balanced round-robin ordering (mirrors llm_curator's diversity
    guarantee in spirit: every source appears). Best-quality first within a source.
    """
    by_source: Dict[str, List[Dict]] = {}
    for c in all_clips:
        by_source.setdefault(c.get("source_id", "?"), []).append(c)
    for clips in by_source.values():
        clips.sort(key=lambda x: x.get("quality_score", 5), reverse=True)
    queues = list(by_source.values())
    ordered: List[Dict] = []
    while any(queues):
        for q in queues:
            if q:
                ordered.append(q.pop(0))
    return ordered


def _synthetic_candidates(topic: str, n_sources: int) -> List[Dict]:
    """Stand-in 'sources' for --self-test: short, offline, attribution-clean."""
    palette = [
        ("Poddy Test Source A", 220),
        ("Poddy Test Source B", 294),
        ("Poddy Test Source C", 330),
        ("Poddy Test Source D", 392),
        ("Poddy Test Source E", 440),
    ]
    out: List[Dict] = []
    for i in range(n_sources):
        name, freq = palette[i % len(palette)]
        out.append({
            "id": f"SELFTEST_{i}",
            "title": name,
            "uploader": "Poddy self-test",
            "license": "Synthetic (no copyright)",
            "duration": 90,            # short so the self-test renders quickly
            "webpage_url": "",
            "note": f"synthetic source about {topic}",
            "_synthetic_freq": freq,
        })
    return out


def run(cfg: PipelineConfig, *, dry_run: bool = True) -> Dict:
    """Execute (or plan) the full pipeline. Returns a structured result dict."""
    d = depth_cfg(cfg.depth)
    if not dry_run:
        os.makedirs(cfg.out_dir, exist_ok=True)

    print("=" * 72)
    mode = "DRY RUN" if dry_run else ("LIVE · SELF-TEST" if cfg.self_test else "LIVE")
    print(f"Poddy VIDEO learning pipeline  —  {mode}")
    print(f"  topic         : {cfg.topic!r}")
    print(f"  depth         : {cfg.depth}  {d}")
    print(f"  avatar        : {cfg.avatar}")
    print(f"  kids_mode     : {cfg.kids_mode}")
    print(f"  require_cc    : {cfg.require_cc_license}")
    print(f"  allow_network : {cfg.allow_network}   allow_download: {cfg.allow_download}   use_llm: {cfg.use_llm}")
    print(f"  profile       : {cfg.profile.size}@{cfg.profile.fps} {cfg.profile.v_codec}/{cfg.profile.a_codec}")
    print(f"  out_dir       : {cfg.out_dir}")
    print("=" * 72)

    # ── Stage 1: discovery ──────────────────────────────────────────────────
    print("\n[1] DISCOVERY")
    if cfg.self_test:
        candidates = _synthetic_candidates(cfg.topic, d["n_sources"])
        print(f"  [discovery] SELF-TEST — using {len(candidates)} synthetic offline sources")
    else:
        candidates = discovery.discover_candidates(
            cfg.topic, d["n_sources"], n_extra=2,
            require_cc=cfg.require_cc_license,
            allow_network=cfg.allow_network, dry_run=dry_run,
        )
    for c in candidates:
        print(f"    - {c['title']}  [{c.get('license', '?')}]  {c.get('webpage_url', '')}")

    # ── Self-test: generate the synthetic source files up front ──────────────
    source_files: Dict[str, str] = {}
    if cfg.self_test and not dry_run:
        print("\n[1b] SYNTHESIZE OFFLINE SOURCE FOOTAGE")
        for c in candidates:
            sp = os.path.join(cfg.out_dir, f"src_{c['id']}.mp4")
            cmd = video_engine.make_synthetic_source_cmd(
                sp, float(c.get("duration", 90)), c["title"], cfg.profile,
                freq=c.get("_synthetic_freq", 220))
            ok = video_engine.run_ff(cmd, desc=f"synth {c['title']}")
            if ok:
                source_files[c["id"]] = sp
                print(f"    ✓ {os.path.basename(sp)}")

    # ── Stage 2+3: captions + selection per source ──────────────────────────
    print("\n[2/3] CAPTIONS + SEGMENT SELECTION")
    all_clips: List[Dict] = []
    for c in candidates[: d["n_sources"]]:
        if cfg.self_test:
            cues = transcript.fake_captions(c.get("note") or cfg.topic, duration=c.get("duration", 90))
        else:
            cues = transcript.get_transcript(c, allow_network=cfg.allow_network, dry_run=dry_run)
        clips = selection.select_segments(
            cfg.topic, cues, c,
            n_clips=d["n_clips"], clip_min=d["clip_min"], clip_max=d["clip_max"],
            use_llm=cfg.use_llm,
        )
        all_clips.extend(clips)

    if not all_clips:
        print("\n[!] No usable segments — aborting plan.")
        return {"ok": False, "reason": "no_segments", "candidates": candidates}

    # ── Stage 4: ordering ───────────────────────────────────────────────────
    print("\n[4] ORDERING (source-balanced)")
    ordered = _order_clips(all_clips)
    for i, c in enumerate(ordered):
        print(f"    {i + 1}. {c.get('chapter_title')}  "
              f"[{c['start_time']:.1f}-{c['end_time']:.1f}s]  ←  {c.get('source_title')}")

    # ── Stage 5: lesson plan / teacher script ───────────────────────────────
    print("\n[5] LESSON PLAN (teacher script)")
    plan = pedagogy.build_lesson_plan(cfg.topic, ordered, kids=cfg.kids_mode, use_llm=cfg.use_llm)
    for beat in plan:
        if beat["type"] == "narration":
            print(f"    ♪ [{beat['role']}] {beat['text'][:90]}")
        else:
            lt = beat.get("lower_third", {})
            print(f"    ▶ CLIP {beat.get('chapter_title')}  (lower-third: {lt.get('line1')})")

    # ── Stages 6+7: render narration + acquire/normalize clips ───────────────
    print("\n[6/7] RENDER NARRATION + CLIPS  (avatar=%s)" % cfg.avatar)
    renderer = avatar.get_renderer(cfg.avatar)
    voice = avatar.KIDS_VOICE if cfg.kids_mode else avatar.DEFAULT_VOICE
    segment_paths: List[str] = []
    attributions: List[Dict] = []
    narration_idx = clip_idx = 0

    for beat in plan:
        if beat["type"] == "narration":
            out = os.path.join(cfg.out_dir, f"narr_{narration_idx:02d}.mp4")
            narration_idx += 1
            renderer.render(beat, out, cfg.profile, voice=voice, dry_run=dry_run)
            if dry_run or os.path.exists(out):
                segment_paths.append(out)
            else:
                print(f"    [skip] narration segment not produced: {os.path.basename(out)}")
            continue

        # ── clip beat ────────────────────────────────────────────────────────
        clip_raw = os.path.join(cfg.out_dir, f"clip_{clip_idx:02d}_raw.mp4")
        clip_norm = os.path.join(cfg.out_dir, f"clip_{clip_idx:02d}.mp4")
        clip_idx += 1
        start, end = beat["start_time"], beat["end_time"]
        src_id = beat.get("source_id", "")

        if dry_run:
            if cfg.self_test:
                print(f"    [clip] DRY — would cut synthetic {src_id} {start:.1f}-{end:.1f}s")
            else:
                dl = video_engine.ytdlp_download_section_cmd(
                    beat.get("source_url", ""), start, end, clip_raw,
                    cookies_from_browser=cfg.cookies_from_browser, cookies_file=cfg.cookies_file)
                print(f"    [clip] DRY/GATED download: $ {' '.join(dl)}")
            norm = video_engine.normalize_clip_cmd(clip_raw, clip_norm, cfg.profile,
                                                   lower_third=beat.get("lower_third"))
            print(f"    [clip] normalize: $ {' '.join(norm)}")
            segment_paths.append(clip_norm)
            continue

        # LIVE acquisition of the raw segment
        acquired = False
        if cfg.self_test:
            src_file = source_files.get(src_id)
            if src_file:
                acquired = video_engine.run_ff(
                    video_engine.ffmpeg_cut_cmd(src_file, start, end, clip_raw),
                    desc=f"cut {src_id}")
        elif cfg.allow_download:
            acquired = video_engine.run_ff(
                video_engine.ytdlp_download_section_cmd(
                    beat.get("source_url", ""), start, end, clip_raw,
                    cookies_from_browser=cfg.cookies_from_browser, cookies_file=cfg.cookies_file),
                desc="yt-dlp section", timeout=300)
        else:
            print("    [clip] LIVE but no media source (need --self-test or --allow-download) — skipping clip")
            continue

        if not (acquired and os.path.exists(clip_raw)):
            print(f"    [skip] could not acquire clip {clip_idx - 1} from {beat.get('source_title')}")
            continue

        ok = video_engine.run_ff(
            video_engine.normalize_clip_cmd(clip_raw, clip_norm, cfg.profile,
                                            lower_third=beat.get("lower_third")),
            desc="normalize clip")
        if ok and os.path.exists(clip_norm):
            segment_paths.append(clip_norm)
            attributions.append({
                "title": beat.get("source_title", ""),
                "uploader": beat.get("lower_third", {}).get("line1", ""),
                "license": beat.get("source_license", ""),
                "url": beat.get("source_url", ""),
                "segment": f"{start:.0f}-{end:.0f}s",
            })
            print(f"    ✓ clip {clip_idx - 1}: {beat.get('chapter_title')}")
        else:
            print(f"    [skip] normalize failed for clip {clip_idx - 1}")

    # ── Stage 8: concat + master ────────────────────────────────────────────
    print("\n[8] CONCAT + MASTER")
    list_path = os.path.join(cfg.out_dir, "concat_list.txt")
    premaster = os.path.join(cfg.out_dir, "lesson_premaster.mp4")
    final_out = os.path.join(cfg.out_dir, "lesson.mp4")

    if dry_run:
        print(f"    concat list → {list_path}")
        print(f"    $ {' '.join(video_engine.concat_demuxer_cmd(list_path, premaster))}")
        print(f"    (fallback if params differ: concat filter, {len(segment_paths)} inputs)")
        print(f"    $ {' '.join(video_engine.master_loudness_cmd(premaster, final_out, cfg.profile))}")
        print("\n" + "=" * 72)
        print(f"PLAN COMPLETE → final lesson would be: {final_out}")
        print(f"  segments: {len(segment_paths)}  (narration + clips)")
        print("=" * 72)
        return {"ok": True, "candidates": candidates, "clips": ordered, "plan": plan,
                "segment_paths": segment_paths, "final_out": final_out, "dry_run": True}

    # LIVE assembly
    segment_paths = [p for p in segment_paths if os.path.exists(p)]
    if not segment_paths:
        print("[!] No renderable segments — aborting.")
        return {"ok": False, "reason": "no_segments_rendered"}

    video_engine.write_concat_list(segment_paths, list_path)
    # Try fast lossless concat first; fall back to a re-encode concat-filter if it
    # glitches (segments occasionally differ in subtle stream params).
    assembled = video_engine.run_ff(
        video_engine.concat_demuxer_cmd(list_path, premaster), desc="concat (copy)")
    if not (assembled and os.path.exists(premaster)):
        print("    concat -c copy failed; falling back to re-encoding concat filter")
        assembled = video_engine.run_ff(
            video_engine.concat_filter_cmd(segment_paths, premaster, cfg.profile),
            desc="concat (filter)", timeout=900)
    if not (assembled and os.path.exists(premaster)):
        print("[!] Concatenation failed.")
        return {"ok": False, "reason": "concat_failed", "segment_paths": segment_paths}

    mastered = video_engine.run_ff(
        video_engine.master_loudness_cmd(premaster, final_out, cfg.profile), desc="loudness master")
    if not (mastered and os.path.exists(final_out)):
        print("    master pass failed; using un-mastered assembly as final")
        os.replace(premaster, final_out)

    # Attribution manifest (citation back to sources — required for reuse).
    credits_path = os.path.join(cfg.out_dir, "CREDITS.txt")
    with open(credits_path, "w", encoding="utf-8") as f:
        f.write(f"Poddy video lesson — {cfg.topic}\n\nSources:\n")
        for a in attributions:
            f.write(f"  - {a['title']} ({a['uploader']}) [{a['license']}] {a['url']} @ {a['segment']}\n")
        if cfg.self_test:
            f.write("  (self-test: synthetic footage, no third-party content)\n")

    print("\n" + "=" * 72)
    print(f"DONE → {final_out}")
    print(f"  segments: {len(segment_paths)}  credits: {credits_path}")
    print("=" * 72)
    return {"ok": True, "candidates": candidates, "clips": ordered, "plan": plan,
            "segment_paths": segment_paths, "final_out": final_out,
            "credits": credits_path, "dry_run": False}
