#!/usr/bin/env python3
"""
Poddy Video-Learning POC — CLI entrypoint (EXPERIMENTAL).

Default mode is a DRY RUN: it prints the full plan (discovery queries, the exact
yt-dlp / ffmpeg commands, the chosen segments, the teacher script, and the
assembly steps) WITHOUT downloading anything or calling any paid API.

Quick start (safe, no network, no keys):

    python video_poc/main.py --topic "the water cycle for kids" --kids
    python video_poc/main.py --topic "how transistors work" --depth deep

Opt in to real work explicitly (READ THE LEGAL CAVEATS IN README FIRST):

    python video_poc/main.py --topic "..." --execute --allow-network \
        --allow-download --use-llm --avatar none

Run from the `backend/` directory so the `services.*` reuse import resolves; it
also works standalone (falls back to a vendored copy of the snapping logic).
"""
from __future__ import annotations

import argparse
import os
import sys

# Allow both `python video_poc/main.py` (from backend/) and `python main.py`
# (from inside video_poc/) by making the package importable either way.
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
for p in (_BACKEND, os.path.dirname(_BACKEND)):
    if p not in sys.path:
        sys.path.insert(0, p)

try:  # works when run as a script (python video_poc/main.py) — backend/ on path
    from video_poc.config import PipelineConfig, VideoProfile, depth_cfg
    from video_poc import pipeline
except ImportError:  # works when imported as a package module (video_poc.main)
    from .config import PipelineConfig, VideoProfile, depth_cfg  # type: ignore
    from . import pipeline  # type: ignore


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="video_poc",
        description="Poddy video-learning pipeline POC (dry-run by default; never scrapes unless told to).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        epilog="By default NOTHING is downloaded. See README.md for legal caveats (YouTube ToS / copyright / CC).",
    )
    ap.add_argument("--topic", default="the water cycle for kids",
                    help="What to build a lesson about.")
    ap.add_argument("--depth", default="standard", choices=["quick", "standard", "deep"],
                    help="More depth = more sources/segments.")
    ap.add_argument("--avatar", default="none", choices=["none", "sadtalker", "did"],
                    help="Narration renderer. 'none' = slate+TTS (default, no GPU).")
    ap.add_argument("--avatar-image", default=None,
                    help="Portrait image for talking-head avatar modes.")
    ap.add_argument("--kids", action="store_true",
                    help="Kids mode: simpler script, younger voice, stricter filtering.")
    ap.add_argument("--out-dir", default="/tmp/poddy_video_poc",
                    help="Where rendered media would be written (LIVE mode only).")

    # ── Danger flags (all default OFF) ──────────────────────────────────────
    ap.add_argument("--execute", action="store_true",
                    help="Actually RUN the plan instead of dry-run. Implies media work.")
    ap.add_argument("--allow-network", action="store_true",
                    help="Permit outbound requests (yt-dlp search/captions).")
    ap.add_argument("--allow-download", action="store_true",
                    help="Permit downloading media bytes (requires --allow-network).")
    ap.add_argument("--use-llm", action="store_true",
                    help="Call OpenAI for selection + teacher script (needs OPENAI_API_KEY).")
    ap.add_argument("--no-cc-filter", action="store_true",
                    help="Disable the Creative-Commons license filter (NOT recommended).")
    return ap


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)

    dry_run = not args.execute
    if args.allow_download and not args.allow_network:
        print("[config] --allow-download requires --allow-network; enabling network.")
        args.allow_network = True

    cfg = PipelineConfig(
        topic=args.topic,
        depth=args.depth,
        avatar=args.avatar,
        avatar_image=args.avatar_image,
        kids_mode=args.kids,
        out_dir=args.out_dir,
        allow_network=args.allow_network,
        allow_download=args.allow_download,
        use_llm=args.use_llm,
        require_cc_license=not args.no_cc_filter,
        profile=VideoProfile(),
    )

    if not dry_run:
        print("\n*** LIVE MODE ENABLED — this may download media and call paid APIs. ***")
        print("*** Ensure you have the right to use any source video (see README). ***\n")

    result = pipeline.run(cfg, dry_run=dry_run)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
