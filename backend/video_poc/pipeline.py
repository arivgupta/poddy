"""
Pipeline orchestrator — ties the stages together and produces an executable PLAN.

Stage map (mirrors backend/main.py run_pipeline, video edition):
  0. title                — display title for the lesson
  1. discovery            — yt-dlp license-filtered candidates           (discovery.py)
  2. captions             — fetch/normalize transcripts per source       (transcript.py)
  3. segment selection    — LLM/heuristic pick + boundary snap           (selection.py)
  4. order                — cross-source pedagogical ordering            (here)
  5. lesson plan          — teacher script: intro/bridges/checkpoints…   (pedagogy.py)
  6. render narration     — slate / talking-head segments                (avatar.py)
  7. cut + normalize clips— per-source segment extraction + canonicalize (video_engine.py)
  8. concat + master      — assemble final lesson, loudness master       (video_engine.py)

In DRY RUN (default) every stage prints the commands it WOULD run and returns
plan data; nothing is downloaded and no media is written.
"""
from __future__ import annotations

from typing import List, Dict
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


def run(cfg: PipelineConfig, *, dry_run: bool = True) -> Dict:
    """Execute (or plan) the full pipeline. Returns a structured result dict."""
    d = depth_cfg(cfg.depth)
    os.makedirs(cfg.out_dir, exist_ok=True) if not dry_run else None

    print("=" * 72)
    print(f"Poddy VIDEO learning pipeline  —  {'DRY RUN' if dry_run else 'LIVE'}")
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
    candidates = discovery.discover_candidates(
        cfg.topic, d["n_sources"], n_extra=2,
        require_cc=cfg.require_cc_license,
        allow_network=cfg.allow_network, dry_run=dry_run,
    )
    for c in candidates:
        print(f"    - {c['title']}  [{c.get('license', '?')}]  {c.get('webpage_url', '')}")

    # ── Stage 2+3: captions + selection per source ──────────────────────────
    print("\n[2/3] CAPTIONS + SEGMENT SELECTION")
    all_clips: List[Dict] = []
    for c in candidates[: d["n_sources"]]:
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
    lp = plan[0].get("learning_path", []) if plan else []
    if lp:
        print(f"    ↳ learning-path forks: {lp}")

    # ── Stage 6: render narration segments ──────────────────────────────────
    print("\n[6] RENDER NARRATION  (avatar=%s)" % cfg.avatar)
    renderer = avatar.get_renderer(cfg.avatar)
    voice = avatar.KIDS_VOICE if cfg.kids_mode else avatar.DEFAULT_VOICE
    segment_paths: List[str] = []
    narration_idx = 0
    clip_idx = 0
    for beat in plan:
        if beat["type"] == "narration":
            out = os.path.join(cfg.out_dir, f"narr_{narration_idx:02d}.mp4")
            narration_idx += 1
            renderer.render(beat, out, cfg.profile, voice=voice, dry_run=dry_run)
            segment_paths.append(out)
        else:
            # ── Stage 7 (interleaved): acquire + normalize this clip ────────
            clip_raw = os.path.join(cfg.out_dir, f"clip_{clip_idx:02d}_raw.mp4")
            clip_norm = os.path.join(cfg.out_dir, f"clip_{clip_idx:02d}.mp4")
            clip_idx += 1
            if cfg.allow_download and not dry_run:
                dl = video_engine.ytdlp_download_section_cmd(
                    beat.get("source_url", ""), beat["start_time"], beat["end_time"], clip_raw)
                print(f"    [clip] download: $ {' '.join(dl)}")
            else:
                dl = video_engine.ytdlp_download_section_cmd(
                    beat.get("source_url", ""), beat["start_time"], beat["end_time"], clip_raw)
                print(f"    [clip] DRY/GATED download: $ {' '.join(dl)}")
            norm = video_engine.normalize_clip_cmd(
                clip_raw, clip_norm, cfg.profile, lower_third=beat.get("lower_third"))
            print(f"    [clip] normalize: $ {' '.join(norm)}")
            segment_paths.append(clip_norm)

    # ── Stage 8: concat + master ────────────────────────────────────────────
    print("\n[8] CONCAT + MASTER")
    list_path = os.path.join(cfg.out_dir, "concat_list.txt")
    premaster = os.path.join(cfg.out_dir, "lesson_premaster.mp4")
    final_out = os.path.join(cfg.out_dir, "lesson.mp4")
    print(f"    concat list → {list_path}")
    print(f"    $ {' '.join(video_engine.concat_demuxer_cmd(list_path, premaster))}")
    print(f"    (fallback if params differ: concat filter, {len(segment_paths)} inputs)")
    print(f"    $ {' '.join(video_engine.master_loudness_cmd(premaster, final_out, cfg.profile))}")

    print("\n" + "=" * 72)
    print(f"PLAN COMPLETE → final lesson would be: {final_out}")
    print(f"  segments: {len(segment_paths)}  (narration + clips)")
    print("=" * 72)

    return {
        "ok": True,
        "candidates": candidates,
        "clips": ordered,
        "plan": plan,
        "segment_paths": segment_paths,
        "final_out": final_out,
        "dry_run": dry_run,
    }
