"""
Transcript / caption acquisition + normalization.

For VIDEO we strongly prefer the source's own captions over re-running Whisper:
  * They are free and instant (no GPU / API cost).
  * Their timestamps are authored against the real video timeline, so cut points
    line up with what's on screen.

Strategy (real build):
  1. `yt-dlp --write-subs --write-auto-subs --sub-langs en --sub-format vtt
      --skip-download URL`  → grab manual subs if present, else auto-captions.
  2. Parse the .vtt cue list into (start, end, text) tuples.
  3. Re-emit in Poddy's canonical transcript line format
        "12.30s - 16.70s: some words"
     so we can reuse llm_curator.parse_transcript_segments() VERBATIM and snap
     LLM-chosen cut points to real cue boundaries — avoiding mid-sentence cuts.

NOTE on formats: json3/ttml/srv* have documented yt-dlp breakage in 2026
(`_UnsafeExtensionError`); VTT (or SRT) is the reliable choice.

The network step is gated; offline we synthesize a fake cue list so the rest of
the pipeline (selection, snapping, planning) is exercisable end-to-end.
"""
from __future__ import annotations

from typing import List, Dict, Tuple
import re


# ─────────────────────────────────────────────────────────────────────────────
# VTT parsing
# ─────────────────────────────────────────────────────────────────────────────

_VTT_TS = re.compile(
    r"(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*"
    r"(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})"
)


def _to_seconds(h, m, s, ms) -> float:
    return (int(h or 0) * 3600) + (int(m) * 60) + int(s) + (int(ms) / 1000.0)


def parse_vtt(vtt_text: str) -> List[Tuple[float, float, str]]:
    """Parse a WebVTT string into [(start_s, end_s, text)] cues."""
    cues: List[Tuple[float, float, str]] = []
    lines = vtt_text.splitlines()
    i = 0
    while i < len(lines):
        m = _VTT_TS.search(lines[i])
        if not m:
            i += 1
            continue
        start = _to_seconds(m.group(1), m.group(2), m.group(3), m.group(4))
        end = _to_seconds(m.group(5), m.group(6), m.group(7), m.group(8))
        i += 1
        text_parts: List[str] = []
        while i < len(lines) and lines[i].strip() and not _VTT_TS.search(lines[i]):
            # strip inline tags like <c> and <00:00:01.000>
            clean = re.sub(r"<[^>]+>", "", lines[i]).strip()
            if clean:
                text_parts.append(clean)
            i += 1
        text = " ".join(text_parts).strip()
        if end > start and text:
            cues.append((start, end, text))
    return cues


def cues_to_poddy_transcript(cues: List[Tuple[float, float, str]]) -> str:
    """Re-emit cues in Poddy's '12.30s - 16.70s: text' format.

    This is the SAME format llm_curator.parse_transcript_segments() consumes, so
    the existing Whisper-segment-snapping logic works unchanged on video captions.
    """
    return "\n".join(f"{round(s, 2)}s - {round(e, 2)}s: {t}" for s, e, t in cues)


def build_ytdlp_subs_command(url: str) -> List[str]:
    """argv for a metadata-only caption fetch (VTT, English, no media)."""
    return [
        "yt-dlp", "--skip-download",
        "--write-subs", "--write-auto-subs",
        "--sub-langs", "en.*", "--sub-format", "vtt",
        "--no-warnings", url,
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Offline synthetic captions (so dry-run exercises the whole chain)
# ─────────────────────────────────────────────────────────────────────────────

def fake_captions(topic: str, duration: int = 300) -> List[Tuple[float, float, str]]:
    """Deterministic placeholder cues for offline runs.

    Produces ~6s cues across the (claimed) duration with topic-flavored text so
    selection + snapping have realistic-looking boundaries to work with.
    """
    sentences = [
        f"Today we are going to explore {topic}.",
        "Let's start with the most important idea you need to understand.",
        "The key mechanism works step by step, like this.",
        "Here is a concrete worked example you can follow along with.",
        "Notice how each part connects to the part before it.",
        "A common misconception is worth clearing up right now.",
        "Let's look at why this matters in the real world.",
        "Now we can put the whole picture together.",
        "To recap, here are the main points to remember.",
        "That completes this part of the explanation.",
    ]
    cues: List[Tuple[float, float, str]] = []
    t = 4.0
    i = 0
    while t < duration - 6:
        s = sentences[i % len(sentences)]
        cues.append((round(t, 2), round(t + 6.0, 2), s))
        t += 6.0
        i += 1
    return cues


def get_transcript(
    candidate: Dict,
    *,
    allow_network: bool = False,
    dry_run: bool = True,
) -> List[Tuple[float, float, str]]:
    """Return caption cues for a candidate video.

    Dry-run/offline: prints the yt-dlp command it WOULD run, returns fake cues.
    Online: runs the real caption fetch (behind the flag) and parses VTT.
    """
    url = candidate.get("webpage_url", "")
    if dry_run or not allow_network:
        print(f"  [transcript] DRY RUN — would fetch captions for {candidate.get('title')!r}:")
        print(f"      $ {' '.join(build_ytdlp_subs_command(url))}")
        return fake_captions(candidate.get("note") or candidate.get("title", "the topic"),
                             duration=candidate.get("duration", 300))

    return _live_captions(candidate)


def _live_captions(candidate: Dict) -> List[Tuple[float, float, str]]:
    """Real caption fetch — guarded; needs network + yt-dlp."""
    import os
    import glob
    import subprocess
    import tempfile

    url = candidate.get("webpage_url", "")
    with tempfile.TemporaryDirectory() as td:
        out_tmpl = os.path.join(td, "%(id)s.%(ext)s")
        argv = build_ytdlp_subs_command(url) + ["-o", out_tmpl]
        try:
            subprocess.run(argv, capture_output=True, text=True, timeout=120, check=False)
        except Exception as e:  # noqa: BLE001
            print(f"  [transcript] caption fetch failed: {e}")
            return []
        vtts = glob.glob(os.path.join(td, "*.vtt"))
        if not vtts:
            print("  [transcript] no .vtt captions found for this video")
            return []
        with open(vtts[0], "r", encoding="utf-8", errors="ignore") as f:
            return parse_vtt(f.read())
