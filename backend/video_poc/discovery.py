"""
Source discovery — find candidate YouTube videos for a topic via yt-dlp, filtered
to Creative Commons where possible.

This mirrors the *role* of backend/services/discovery.py (grounded search → ranked
candidates) but for video. The actual network call is gated behind
`PipelineConfig.allow_network`; with it off (the default) we return a small set of
hard-coded SAFE sample candidates (Blender open movies, NASA public-domain) and,
in dry-run, we only print the yt-dlp command we WOULD run.

Key yt-dlp facts this is built on (see docs):
  * `ytsearchN:QUERY` returns N results; it is NOT a regex.
  * YouTube's own CC filter lives in the search *URL* (sp=EgIwAQ%3D%3D). Passing
    that URL to yt-dlp restricts results to CC-licensed videos at the source.
  * `--match-filters "license~='(?i)creative commons'"` is a belt-and-suspenders
    second pass on the per-video `license` metadata field.
  * `--dump-json --skip-download` fetches metadata only (no media bytes).
"""
from __future__ import annotations

from typing import List, Dict, Optional
import json
import shlex


# YouTube search "sp" token that applies the *Creative Commons* feature filter.
# (This is the value the YouTube web UI sets when you tick "Creative Commons".)
YT_CC_SEARCH_URL = (
    "https://www.youtube.com/results?search_query={q}&sp=EgIwAQ%253D%253D"
)

# A tiny allow-list of genuinely safe, reusable sample sources for offline demos.
# Blender open movies are CC-BY; NASA footage is generally public domain. These
# are placeholders so the POC can show the pipeline shape without scraping.
SAFE_SAMPLES: List[Dict] = [
    {
        "id": "SAMPLE_bbb",
        "title": "Big Buck Bunny (Blender open movie)",
        "uploader": "Blender Foundation",
        "license": "Creative Commons Attribution",
        "duration": 596,
        "webpage_url": "https://peach.blender.org/",
        "note": "CC-BY open movie — safe reuse with attribution.",
    },
    {
        "id": "SAMPLE_sintel",
        "title": "Sintel (Blender open movie)",
        "uploader": "Blender Foundation",
        "license": "Creative Commons Attribution",
        "duration": 888,
        "webpage_url": "https://durian.blender.org/",
        "note": "CC-BY open movie — safe reuse with attribution.",
    },
    {
        "id": "SAMPLE_nasa",
        "title": "NASA b-roll (public domain)",
        "uploader": "NASA",
        "license": "Public Domain (US Gov work)",
        "duration": 300,
        "webpage_url": "https://www.nasa.gov/",
        "note": "US Government work — generally public domain.",
    },
]


def build_search_query_terms(topic: str, n: int) -> List[str]:
    """A few angle-varied search queries (mirrors discovery._generate_search_queries).

    In the real build these would come from a cheap LLM call; offline we synthesize
    deterministic variants so the dry-run plan is reproducible.
    """
    topic = topic.strip()
    return [
        topic,
        f"{topic} explained",
        f"{topic} for beginners",
    ][:max(1, n)]


def build_ytdlp_search_command(
    query: str,
    n_results: int,
    *,
    require_cc: bool = True,
    metadata_only: bool = True,
) -> List[str]:
    """Construct (but do not run) the yt-dlp argv for a license-aware search."""
    if require_cc:
        # Search inside YouTube's CC-filtered results URL, then double-check the
        # per-video license field. {q} must be URL-encoded by the caller in real use.
        target = YT_CC_SEARCH_URL.format(q=query.replace(" ", "+"))
    else:
        target = f"ytsearch{n_results}:{query}"

    argv = ["yt-dlp"]
    if require_cc:
        argv += ["--match-filters", "license~='(?i)creative commons'",
                 "--playlist-end", str(n_results)]
    if metadata_only:
        argv += ["--skip-download", "--dump-json", "--no-warnings"]
    argv += [target]
    return argv


def cmd_str(argv: List[str]) -> str:
    return " ".join(shlex.quote(a) for a in argv)


def discover_candidates(
    topic: str,
    n_sources: int,
    *,
    n_extra: int = 3,
    require_cc: bool = True,
    allow_network: bool = False,
    dry_run: bool = True,
) -> List[Dict]:
    """
    Return a ranked list of candidate video dicts.

    Offline / dry-run (default): returns SAFE_SAMPLES, never touches the network.
    Online (allow_network=True, dry_run=False): runs metadata-only yt-dlp search
    and parses the JSON lines. (Implemented but only reachable behind the flag.)
    """
    total = n_sources + max(0, n_extra)

    if dry_run or not allow_network:
        print("  [discovery] DRY RUN — would run yt-dlp metadata search:")
        for q in build_search_query_terms(topic, 3):
            argv = build_ytdlp_search_command(q, total, require_cc=require_cc)
            print(f"      $ {cmd_str(argv)}")
        print(f"  [discovery] returning {min(total, len(SAFE_SAMPLES))} SAFE offline samples instead")
        return SAFE_SAMPLES[:total]

    # ── Live path (only with explicit opt-in) ───────────────────────────────
    return _live_search(topic, total, require_cc=require_cc)


def _live_search(topic: str, total: int, *, require_cc: bool) -> List[Dict]:
    """Run a real metadata-only yt-dlp search. Guarded; needs network + yt-dlp."""
    import subprocess  # local import keeps module import-clean

    results: List[Dict] = []
    seen = set()
    for q in build_search_query_terms(topic, 3):
        argv = build_ytdlp_search_command(q, total, require_cc=require_cc)
        try:
            proc = subprocess.run(argv, capture_output=True, text=True, timeout=120)
        except Exception as e:  # noqa: BLE001 — surface but never crash the pipeline
            print(f"  [discovery] yt-dlp failed for {q!r}: {e}")
            continue
        for line in proc.stdout.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                meta = json.loads(line)
            except json.JSONDecodeError:
                continue
            vid = meta.get("id")
            if not vid or vid in seen:
                continue
            seen.add(vid)
            results.append({
                "id": vid,
                "title": meta.get("title", ""),
                "uploader": meta.get("uploader", ""),
                "license": meta.get("license", ""),
                "duration": meta.get("duration", 0),
                "webpage_url": meta.get("webpage_url", f"https://youtu.be/{vid}"),
                "note": "",
            })
            if len(results) >= total:
                return results
    return results
