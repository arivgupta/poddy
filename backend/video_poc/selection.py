"""
Segment selection — pick the best teaching segments from each source's captions.

This MIRRORS backend/services/llm_curator.py:
  * Same prompt shape (information-dense, complete-sentence boundaries, reject
    intros/sponsors/housekeeping, rank by quality).
  * Same Whisper-style boundary snapping so LLM-chosen times land on real caption
    cue edges — the key trick that prevents mid-sentence cuts. For video this ALSO
    keeps audio and on-screen content aligned at the cut.

The OpenAI call is gated behind `use_llm`; offline we use a deterministic
heuristic selector so the dry-run plan is fully populated without spending tokens.

We reuse llm_curator.snap_clip_to_segments() when importable (run from backend/),
and fall back to a vendored copy so this package also works standalone.
"""
from __future__ import annotations

from typing import List, Dict, Tuple, Optional
import json
import os

# ── Reuse the real snapping logic when available; vendor a copy otherwise ──────
try:  # pragma: no cover - depends on run location
    from services.llm_curator import snap_clip_to_segments  # type: ignore
except Exception:  # noqa: BLE001
    def snap_clip_to_segments(  # type: ignore  # vendored fallback (same contract)
        start: float, end: float, segments: List[Tuple[float, float]],
        min_s: float = 20.0, max_s: float = 150.0,
    ) -> Optional[Tuple[float, float]]:
        if not segments:
            return (max(0.0, start), end) if end > start else None
        seg_starts = [s for s, _ in segments]
        seg_ends = [e for _, e in segments]
        audio_end = seg_ends[-1]
        ss = min(seg_starts, key=lambda x: abs(x - start))
        se = min(seg_ends, key=lambda x: abs(x - end))
        if se <= ss:
            later = [e for e in seg_ends if e > ss]
            if not later:
                return None
            se = min(later, key=lambda x: abs(x - (ss + min_s)))
        if se - ss < min_s:
            cands = [e for e in seg_ends if e > ss]
            if cands:
                se = min(cands, key=lambda x: abs(x - (ss + min_s)))
        if se - ss > max_s:
            cands = [e for e in seg_ends if ss < e <= ss + max_s] or \
                    [e for e in seg_ends if e > ss]
            se = min(cands, key=lambda x: abs(x - (ss + max_s)))
        ss = max(0.0, ss)
        se = min(se, audio_end)
        return (round(ss, 2), round(se, 2)) if se - ss > 0 else None


def _cues_to_segments(cues: List[Tuple[float, float, str]]) -> List[Tuple[float, float]]:
    return [(s, e) for s, e, _ in cues]


def _transcript_text(cues: List[Tuple[float, float, str]]) -> str:
    return "\n".join(f"{round(s, 2)}s - {round(e, 2)}s: {t}" for s, e, t in cues)


# ─────────────────────────────────────────────────────────────────────────────
# Heuristic (offline) selector — picks evenly spaced, in-bounds windows.
# Skips the first ~10% of the video (typical intro/housekeeping).
# ─────────────────────────────────────────────────────────────────────────────

def _heuristic_select(
    cues: List[Tuple[float, float, str]],
    n_clips: int,
    clip_min: float,
    clip_max: float,
) -> List[Dict]:
    if not cues:
        return []
    total = cues[-1][1]
    start_floor = total * 0.10
    target_len = min(clip_max, max(clip_min, (total - start_floor) / max(1, n_clips) * 0.7))
    def _title_at(t: float) -> str:
        """Derive a short title from the cue nearest a timestamp (POC heuristic)."""
        nearest = min(cues, key=lambda c: abs(c[0] - t))
        words = nearest[2].split()
        return " ".join(words[:5]).rstrip(".,!?") or "Key segment"

    clips: List[Dict] = []
    step = (total - start_floor) / max(1, n_clips)
    for i in range(n_clips):
        raw_start = start_floor + i * step
        raw_end = raw_start + target_len
        clips.append({
            "start_time": round(raw_start, 2),
            "end_time": round(raw_end, 2),
            "chapter_title": _title_at(raw_start),
            "summary": "Auto-selected information-dense segment (heuristic).",
            "quality_score": 7,
        })
    return clips


# ─────────────────────────────────────────────────────────────────────────────
# LLM selector — same prompt shape as llm_curator.extract_clips_from_source.
# ─────────────────────────────────────────────────────────────────────────────

def _llm_select(
    topic: str,
    cues: List[Tuple[float, float, str]],
    source_info: Dict,
    n_clips: int,
) -> List[Dict]:
    from openai import OpenAI  # lazy import
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"), max_retries=4, timeout=120.0)
    transcript = _transcript_text(cues)

    prompt = f"""You are a brilliant educational video editor building a lesson on: "{topic}"

Source video: {source_info.get('title', 'Unknown')} (by {source_info.get('uploader', '')})

Below is a timestamped caption transcript. Find the {n_clips} best teaching segments that:
1. START and END on complete sentence boundaries — NEVER cut mid-sentence (in VIDEO a bad cut is jarring both in audio AND on screen).
2. Are INFORMATION-DENSE: the speaker is explaining a mechanism, showing a worked example, or making a concrete point — not intro/outro/housekeeping.
3. Are {int(source_info.get('clip_min', 30))}-{int(source_info.get('clip_max', 120))} seconds long.
4. DIRECTLY serve the learning goal.
5. REJECT: channel intros, "smash like and subscribe", sponsor reads, small talk.

For each clip write a "chapter_title" (<=5 words) and a one-sentence "summary" of what the learner will learn.

TRANSCRIPT:
{transcript}

Return ONLY valid JSON:
{{"clips": [{{"start_time": 0.0, "end_time": 0.0, "chapter_title": "", "summary": "", "quality_score": 9}}]}}"""

    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a precision educational video editor. Output only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    data = json.loads(resp.choices[0].message.content)
    return data.get("clips", [])


def select_segments(
    topic: str,
    cues: List[Tuple[float, float, str]],
    source_info: Dict,
    *,
    n_clips: int,
    clip_min: float,
    clip_max: float,
    use_llm: bool = False,
) -> List[Dict]:
    """Return snapped, validated clip dicts for one source.

    Identical post-processing to llm_curator.extract_clips_from_source: snap every
    clip to real cue boundaries, drop anything that can't form a valid window, and
    annotate with source attribution (critical for citation back to the original).
    """
    src = {**source_info, "clip_min": clip_min, "clip_max": clip_max}
    if use_llm:
        try:
            raw_clips = _llm_select(topic, cues, src, n_clips)
        except Exception as e:  # noqa: BLE001
            print(f"  [selection] LLM selection failed ({e}); using heuristic")
            raw_clips = _heuristic_select(cues, n_clips, clip_min, clip_max)
    else:
        raw_clips = _heuristic_select(cues, n_clips, clip_min, clip_max)

    segments = _cues_to_segments(cues)
    out: List[Dict] = []
    for clip in raw_clips:
        try:
            start = float(clip.get("start_time", 0))
            end = float(clip.get("end_time", 0))
        except (TypeError, ValueError):
            continue
        snapped = snap_clip_to_segments(start, end, segments, min_s=clip_min, max_s=clip_max)
        if snapped is None:
            print(f"  [selection] dropping unusable clip ({start}-{end}s) from {src.get('title')}")
            continue
        clip["start_time"], clip["end_time"] = snapped
        clip["source_id"] = src.get("id", "")
        clip["source_title"] = src.get("title", "")
        clip["source_uploader"] = src.get("uploader", "")
        clip["source_url"] = src.get("webpage_url", "")
        clip["source_license"] = src.get("license", "")
        out.append(clip)
    print(f"  [selection] {len(out)} usable segments from {src.get('title')!r} "
          f"({len(raw_clips)} proposed)")
    return out
