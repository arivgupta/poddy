from typing import List, Dict, Optional, Any, Tuple
import os
import subprocess
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


def _ffmpeg_extract_clip(source_path: str, start_sec: float, end_sec: float, out_path: str) -> bool:
    """Use ffmpeg to extract a clip without loading the full file into memory."""
    duration = end_sec - start_sec
    if duration <= 0:
        return False
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(start_sec), "-i", source_path,
             "-t", str(duration), "-ac", "1", "-ab", "128k", out_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
        )
        return os.path.exists(out_path)
    except subprocess.CalledProcessError as e:
        print(f"  ffmpeg clip extraction failed: {e}")
        return False


def stitch_multi_source(
    plan: List[dict],
    tts_dir: str,
) -> Tuple[str, List[dict]]:
    """
    Assembles the final podcast from an ordered plan list.
    Uses ffmpeg to extract each clip directly from the source file,
    so the full source audio is never loaded into memory.

    plan items are either:
      { type: "transition", text: "...", chapter_title: "..." }
      { type: "clip", start_time, end_time, chapter_title, podcast_name, episode_title, apple_podcasts_url, audio_path }

    Returns (output_mp3_path, chapters_json)
    where chapters_json tracks start_ms/end_ms for each segment.
    """
    final_audio = AudioSegment.empty()
    chapters = []
    current_ms = 0
    clip_counter = 0

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

            start_sec = segment.get("start_time", 0)
            end_sec   = segment.get("end_time", 0)

            if end_sec <= start_sec:
                print(f"  Warning: invalid clip range {start_sec}–{end_sec}s, skipping")
                continue

            clip_path = os.path.join(tts_dir, f"clip_{clip_counter}.mp3")
            clip_counter += 1

            print(f"  Extracting clip {start_sec:.1f}–{end_sec:.1f}s from {os.path.basename(audio_path)}")
            if not _ffmpeg_extract_clip(audio_path, start_sec, end_sec, clip_path):
                print(f"  Warning: failed to extract clip, skipping")
                continue

            clip = AudioSegment.from_mp3(clip_path)
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

            # Clean up extracted clip file to save disk
            if os.path.exists(clip_path):
                os.remove(clip_path)

    output_path = os.path.join(tts_dir, "final_poddy.mp3")
    print(f"Exporting final audio ({current_ms/1000:.1f}s) → {output_path}")
    final_audio.export(output_path, format="mp3", bitrate="192k")

    return output_path, chapters
