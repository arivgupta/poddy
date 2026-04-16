from typing import List, Dict, Optional, Any, Tuple
import os
import asyncio
from pydub import AudioSegment

# ─────────────────────────────────────────────────────────────────────────────
# TTS — Microsoft Edge Neural Voice (free, professional quality)
# Voice options: en-US-AndrewNeural, en-US-GuyNeural, en-US-AriaNeural
# ─────────────────────────────────────────────────────────────────────────────

TTS_VOICE    = "en-US-AndrewNeural"
CROSSFADE_MS = 400   # ms fade-in/out on each clip
PAUSE_MS     = 500   # silence after each clip before next transition

def generate_tts(text: str, output_path: str) -> str:
    """Generate TTS narration using Microsoft Edge's free neural voice."""
    import edge_tts

    async def _speak():
        communicate = edge_tts.Communicate(text, TTS_VOICE)
        await communicate.save(output_path)

    if os.path.exists(output_path):
        os.remove(output_path)

    asyncio.run(_speak())
    return output_path


def stitch_multi_source(
    plan: List[dict],
    tts_dir: str,
) -> Tuple[str, List[dict]]:
    """
    Assembles the final podcast from an ordered plan list.
    Loads each source audio file on-demand and releases it when no more clips
    need it, keeping peak memory to ~1 source file at a time.

    plan items are either:
      { type: "transition", text: "...", chapter_title: "..." }
      { type: "clip", start_time, end_time, chapter_title, podcast_name, episode_title, apple_podcasts_url, audio_path }

    Returns (output_mp3_path, chapters_json)
    where chapters_json tracks start_ms/end_ms for each segment.
    """
    final_audio = AudioSegment.empty()
    chapters = []
    current_ms = 0
    _audio_cache: Dict[str, Any] = {}

    # Pre-compute last usage index for each audio_path so we can free memory
    last_usage: Dict[str, int] = {}
    for idx, seg in enumerate(plan):
        if seg.get("type") == "clip" and seg.get("audio_path"):
            last_usage[seg["audio_path"]] = idx

    for idx, segment in enumerate(plan):
        seg_type = segment.get("type")
        chapter_title = segment.get("chapter_title", "")

        if seg_type == "transition":
            text = segment.get("text", "").strip()
            if not text:
                continue

            tts_path = os.path.join(tts_dir, f"tts_{idx}.mp3")
            generate_tts(text, tts_path)
            tts_audio = AudioSegment.from_mp3(tts_path)

            start_ms = current_ms
            final_audio += tts_audio
            current_ms += len(tts_audio)

            chapters.append({
                "type": "transition",
                "title": chapter_title,
                "start_ms": start_ms,
                "end_ms": current_ms,
                "source_podcast": None,
                "source_episode": None,
                "apple_podcasts_url": None,
            })

        elif seg_type == "clip":
            audio_path = segment.get("audio_path", "")
            if not audio_path or not os.path.exists(audio_path):
                print(f"  Warning: audio file not found: {audio_path}, skipping clip")
                continue

            # Load on first use
            if audio_path not in _audio_cache:
                print(f"  Loading audio: {audio_path}")
                _audio_cache[audio_path] = AudioSegment.from_mp3(audio_path)

            source_audio = _audio_cache[audio_path]
            start_sec = segment.get("start_time", 0)
            end_sec   = segment.get("end_time", 0)

            start_sample = int(start_sec * 1000)
            end_sample   = int(end_sec   * 1000)

            start_sample = min(start_sample, len(source_audio))
            end_sample   = min(end_sample,   len(source_audio))

            if end_sample <= start_sample:
                print(f"  Warning: invalid clip range {start_sec}–{end_sec}s, skipping")
                continue

            clip = source_audio[start_sample:end_sample]
            clip = clip.fade_in(CROSSFADE_MS).fade_out(CROSSFADE_MS)

            start_ms = current_ms
            final_audio += clip + AudioSegment.silent(duration=PAUSE_MS)
            current_ms += len(clip) + PAUSE_MS

            chapters.append({
                "type": "clip",
                "title": segment.get("chapter_title", "Clip"),
                "start_ms": start_ms,
                "end_ms": current_ms - PAUSE_MS,
                "source_podcast": segment.get("podcast_name", ""),
                "source_episode": segment.get("episode_title", ""),
                "apple_podcasts_url": segment.get("apple_podcasts_url", ""),
            })

            # Free source audio once all its clips are done
            if last_usage.get(audio_path) == idx:
                del _audio_cache[audio_path]
                print(f"  Released audio: {audio_path}")

    output_path = os.path.join(tts_dir, "final_poddy.mp3")
    print(f"Exporting final audio ({current_ms/1000:.1f}s) → {output_path}")
    final_audio.export(output_path, format="mp3", bitrate="192k")

    return output_path, chapters
