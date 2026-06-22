from typing import List, Dict, Optional, Any, Tuple
import os
import re
import json
from openai import OpenAI

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not set.")
    return OpenAI(api_key=api_key)


def _parse_json(text: str) -> Any:
    """Strip markdown fences and parse JSON."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(text)


# ─────────────────────────────────────────────────────────────────────────────
# Clip boundary snapping
#
# The LLM picks start/end times by reading transcript text, so its numbers can
# land mid-word or drift from reality. We snap each clip to the nearest Whisper
# segment boundaries (which fall on natural pauses), clamp to the transcript's
# real extent, and enforce sane min/max durations — eliminating mid-sentence
# cuts and hallucinated timestamps.
# ─────────────────────────────────────────────────────────────────────────────

_SEG_RE = re.compile(r"^\s*([\d.]+)s\s*-\s*([\d.]+)s\s*:")


def parse_transcript_segments(transcript: str) -> List[Tuple[float, float]]:
    """Parse '12.3s - 16.7s: text' lines into sorted (start, end) tuples."""
    segs: List[Tuple[float, float]] = []
    for line in (transcript or "").splitlines():
        m = _SEG_RE.match(line)
        if not m:
            continue
        try:
            start, end = float(m.group(1)), float(m.group(2))
        except ValueError:
            continue
        if end > start:
            segs.append((start, end))
    segs.sort()
    return segs


def snap_clip_to_segments(
    start: float,
    end: float,
    segments: List[Tuple[float, float]],
    min_s: float = 45.0,
    max_s: float = 420.0,
) -> Optional[Tuple[float, float]]:
    """
    Snap a requested [start, end] window to Whisper segment boundaries.
    Returns a cleaned (start, end) or None if it can't form a valid clip.
    """
    if not segments:
        # No segment data — just sanity-clamp the raw request.
        if end - start <= 0:
            return None
        return (max(0.0, start), end)

    seg_starts = [s for s, _ in segments]
    seg_ends = [e for _, e in segments]
    audio_end = seg_ends[-1]

    snapped_start = min(seg_starts, key=lambda x: abs(x - start))
    snapped_end = min(seg_ends, key=lambda x: abs(x - end))

    # Ensure end is after start; if not, grow forward to satisfy the minimum.
    if snapped_end <= snapped_start:
        target = snapped_start + min_s
        later = [e for e in seg_ends if e > snapped_start]
        if not later:
            return None
        snapped_end = min(later, key=lambda x: abs(x - target))

    # Enforce a minimum length by extending the end (don't move the start).
    if snapped_end - snapped_start < min_s:
        target = snapped_start + min_s
        candidates = [e for e in seg_ends if e > snapped_start]
        if candidates:
            snapped_end = min(candidates, key=lambda x: abs(x - target))

    # Enforce a maximum length by trimming the end to the nearest segment edge.
    if snapped_end - snapped_start > max_s:
        target = snapped_start + max_s
        candidates = [e for e in seg_ends if snapped_start < e <= target] or \
                     [e for e in seg_ends if e > snapped_start]
        snapped_end = min(candidates, key=lambda x: abs(x - target))

    snapped_start = max(0.0, snapped_start)
    snapped_end = min(snapped_end, audio_end)
    if snapped_end - snapped_start <= 0:
        return None
    return (round(snapped_start, 2), round(snapped_end, 2))


# ─────────────────────────────────────────────────────────────────────────────
# Title generation (fast, cheap, runs first)
# ─────────────────────────────────────────────────────────────────────────────

def generate_title(topic: str) -> str:
    """Turn a natural-language prompt into a clean 3-6 word display title."""
    client = _client()
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.4,
        max_tokens=30,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a title generator. Given a user's topic or question, produce a clean, "
                    "concise title of 3-6 words. No quotes, no punctuation except colons if needed. "
                    "The title should sound like a podcast episode or documentary title.\n\n"
                    "Examples:\n"
                    '  "can you teach me about how sleep works" -> The Science of Sleep\n'
                    '  "I want to understand discipline and building habits" -> Building Unbreakable Discipline\n'
                    '  "what is quantum computing and why does it matter" -> Quantum Computing Explained\n'
                    '  "the neuroscience of motivation" -> The Neuroscience of Motivation\n'
                ),
            },
            {"role": "user", "content": topic},
        ],
    )
    title = resp.choices[0].message.content.strip().strip('"').strip("'")
    return title


# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Expert source discovery
# ─────────────────────────────────────────────────────────────────────────────

def curate_sources(topic: str, n_sources: int = 3, n_extra: int = 2) -> List[dict]:
    """
    Ask GPT-4o to recommend the best podcast episodes for a topic.
    n_sources controls how many distinct podcast sources we ultimately want;
    n_extra adds ranked backup candidates so the pipeline can backfill when a
    feed is dead or a download fails.

    Returns a ranked list of { podcast_name, episode_title_hint, unique_angle }.
    """
    total = n_sources + max(0, n_extra)

    prompt = f"""You are a world-class podcast research librarian with encyclopedic knowledge of every major English-language podcast ever recorded.

The user wants to deeply learn about: "{topic}"
Number of sources needed: {total} (ranked best-first; we will use the top {n_sources} and keep the rest as backups)

Your job is to identify the single best podcast episodes that cover this topic with maximum credibility, depth, and unique insight. Think of the episodes that would come up if you asked the world's best experts "what is the definitive audio resource on {topic}?"

DIVERSITY RULES (critical):
- Each source MUST be from a DIFFERENT podcast show — never repeat the same show
- Actively diversify across different types of podcasters: scientists, practitioners, journalists, entrepreneurs, patients/lived-experience, etc.
- Do NOT default to the same 3-5 "safe" shows every time. Dig deeper — there are thousands of great podcasts
- If the topic is scientific, include at least one non-academic voice (practitioner, journalist, author) for accessibility
- If the topic is practical/lifestyle, include at least one research-focused voice for credibility

QUALITY RULES:
- Prefer episodes that go deep on the science, mechanism, or practical protocol — NOT generic overviews
- Each source should offer a UNIQUE angle — no redundancy (e.g., if one covers mechanism, pick another for protocol, another for lived experience)
- Order them from most fundamental to most advanced/specific
- Use the EXACT podcast name as it appears on Apple Podcasts / Spotify so we can find it

Return ONLY valid JSON:
{{
  "sources": [
    {{
      "podcast_name": "Huberman Lab",
      "episode_title_hint": "master your sleep better alert",
      "unique_angle": "Neuroscience mechanism of sleep stages and adenosine clearance"
    }}
  ]
}}"""

    response = _client().chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an expert podcast curator. Output only valid JSON."},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    data = json.loads(response.choices[0].message.content)
    sources = data.get("sources", [])
    print(f"GPT-4o-mini recommended {len(sources)} sources: {[s['podcast_name'] for s in sources]}")
    return sources


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — Extract best clips from a single transcript
# ─────────────────────────────────────────────────────────────────────────────

def extract_clips_from_source(
    topic: str,
    transcript: str,
    source_info: dict,
    n_clips: int = 3,
) -> List[dict]:
    """
    Extract the top N timestamped clips from a single podcast transcript.
    Each clip is scored for information density and self-containedness.
    """
    prompt = f"""You are a brilliant podcast editor creating a curated audio documentary on: "{topic}"

Source podcast: {source_info.get('podcast_name', 'Unknown')}
Episode hint: {source_info.get('episode_title_hint', '')}
This episode's unique angle: {source_info.get('unique_angle', '')}

Below is a timestamped transcript. Find the {n_clips} best clips that:
1. START and END on complete sentence boundaries — NEVER cut in the middle of a sentence or thought. Look for periods or natural paragraph endings in the transcript text.
2. Are INFORMATION-DENSE — the speaker is mid-explanation: giving data, walking through a mechanism, telling a story with a point, or demonstrating a protocol. NOT the setup or introduction to those things.
3. Are 120–360 seconds long (2 to 6 minutes). Let the speaker finish their complete argument.
4. DIRECTLY serve the learning goal: "{topic}"
5. REJECT any clip that: starts with podcast intro/welcome language, mentions sponsors, is small talk, or is housekeeping ("today we'll discuss", "welcome back", "in this episode"). These are NOT usable.

CRITICAL: Do NOT pick the very beginning of a segment where the speaker only introduces what they are about to say. Pick the part where they are actually saying it — where they give the mechanism, the data, the protocol, or the story.

For each clip write a "chapter_title" (5 words max) and a "summary" (1 complete sentence describing WHAT THE LISTENER WILL LEARN, not what the speaker introduces).
Rank clips by quality (best first).

TRANSCRIPT:
{transcript}

Return ONLY valid JSON:
{{
  "clips": [
    {{
      "start_time": 312.0,
      "end_time": 510.0,
      "chapter_title": "Adenosine Clears During Sleep",
      "summary": "Explains the exact molecular mechanism by which adenosine is flushed from the brain during slow-wave sleep and why this drives the feeling of refreshment.",
      "quality_score": 9
    }}
  ]
}}
"""

    response = _client().chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a precision podcast editor. Output only valid JSON."},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    data = json.loads(response.choices[0].message.content)
    raw_clips = data.get("clips", [])

    # Snap every clip to real Whisper segment boundaries so we never cut a word
    # in half and never trust a hallucinated timestamp.
    segments = parse_transcript_segments(transcript)
    clips = []
    for clip in raw_clips:
        try:
            start = float(clip.get("start_time", 0))
            end = float(clip.get("end_time", 0))
        except (TypeError, ValueError):
            continue
        snapped = snap_clip_to_segments(start, end, segments)
        if snapped is None:
            print(f"  Dropping unusable clip ({start}-{end}s) from {source_info.get('podcast_name')}")
            continue
        clip["start_time"], clip["end_time"] = snapped
        clip["podcast_name"] = source_info.get("podcast_name", "Unknown")
        clip["episode_title"] = source_info.get("resolved_episode_title", source_info.get("episode_title_hint", ""))
        clip["apple_podcasts_url"] = source_info.get("apple_podcasts_url", "")
        clips.append(clip)

    print(f"  Extracted {len(clips)} usable clips from {source_info.get('podcast_name')} ({len(raw_clips)} proposed)")
    return clips


# ─────────────────────────────────────────────────────────────────────────────
# Stage 4 — Cross-source ordering, de-duplication, duration targeting
# ─────────────────────────────────────────────────────────────────────────────

def order_and_deduplicate(topic: str, all_clips: List[dict]) -> List[dict]:
    """
    Given clips from multiple sources, produce a final ordered playlist.
    Removes semantic duplicates, reorders pedagogically — keeps everything else.
    """
    clip_summaries = []
    for i, clip in enumerate(all_clips):
        duration = round(clip["end_time"] - clip["start_time"])
        clip_summaries.append({
            "index": i,
            "podcast": clip["podcast_name"],
            "chapter_title": clip["chapter_title"],
            "summary": clip["summary"],
            "duration_seconds": duration,
            "quality_score": clip.get("quality_score", 5),
        })

    prompt = f"""You are the chief editor of a premium audio documentary on: "{topic}"

Below are candidate clips from multiple podcast sources. Your job:
1. REMOVE semantic duplicates — if two clips explain the same concept, keep only the highest-quality one
2. ORDER the remaining clips like a university lecture: foundations → mechanisms → practical protocols → nuance/edge cases
3. KEEP all non-duplicate clips — do NOT cut based on time, keep everything that adds value

CANDIDATE CLIPS:
{json.dumps(clip_summaries, indent=2)}

Return ONLY valid JSON:
{{
  "ordered_indices": [2, 0, 5, 1, 3],
  "reasoning": "Brief explanation of curriculum structure"
}}"""

    response = _client().chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a curriculum designer. Output only valid JSON."},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    data = json.loads(response.choices[0].message.content)
    ordered_indices = data.get("ordered_indices", list(range(len(all_clips))))
    print(f"Curriculum order: {ordered_indices}")
    print(f"Reasoning: {data.get('reasoning', '')}")

    return [all_clips[i] for i in ordered_indices if i < len(all_clips)]


# ─────────────────────────────────────────────────────────────────────────────
# Stage 5 — Write transition narrations for each clip
# ─────────────────────────────────────────────────────────────────────────────

def write_transitions_batch(topic: str, ordered_clips: List[dict]) -> List[dict]:
    """
    Write a narrator transition script BEFORE each clip.
    Also writes an intro and outro for the whole piece.
    """
    clip_context = []
    for i, clip in enumerate(ordered_clips):
        clip_context.append({
            "position": i,
            "podcast": clip["podcast_name"],
            "chapter_title": clip["chapter_title"],
            "summary": clip["summary"],
        })

    prompt = f"""You are the host narrator of a premium audio documentary on: "{topic}"
You have a warm, intelligent, NPR-like voice. Your transitions are short, informative, and flow naturally.

You need to write narration for {len(ordered_clips) + 2} segments:
- 1 INTRO (welcome listeners, set up the topic, ~30 seconds of speech)
- {len(ordered_clips)} TRANSITIONS (one before each clip, 10–20 seconds of speech each)
- 1 OUTRO (wrap up key takeaways, ~20 seconds of speech)

Guidelines for transitions:
- Name the source naturally: "Here's Andrew Huberman explaining..." or "Peter Attia from The Drive makes a fascinating point about..."
- Bridge the idea from the previous clip: "Building on that mechanism..." or "That explains the why. Now for the how..."
- Vary your sentence structure — don't start every transition the same way
- Be conversational, not robotic

CLIP SEQUENCE:
{json.dumps(clip_context, indent=2)}

Return ONLY valid JSON:
{{
  "intro": "Welcome to Poddy...",
  "transitions": ["Here's Andrew Huberman explaining...", "Building on that..."],
  "outro": "Today we covered..."
}}"""

    response = _client().chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an eloquent podcast narrator. Output only valid JSON."},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0.7,
    )
    data = json.loads(response.choices[0].message.content)

    # Weave transitions into the clips
    result = []
    result.append({"type": "transition", "text": data.get("intro", ""), "chapter_title": "Introduction"})

    transitions = data.get("transitions", [])
    for i, clip in enumerate(ordered_clips):
        if i < len(transitions):
            result.append({"type": "transition", "text": transitions[i], "chapter_title": f"Into: {clip['chapter_title']}"})
        result.append({"type": "clip", **clip})

    result.append({"type": "transition", "text": data.get("outro", ""), "chapter_title": "Summary"})
    return result
