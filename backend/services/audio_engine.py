from typing import List, Dict, Optional, Any, Tuple
import os
import shutil
import subprocess
import asyncio
from pydub import AudioSegment

# ─────────────────────────────────────────────────────────────────────────────
# TTS — Microsoft Edge Neural Voice (free, professional quality)
# Voice options: en-US-AndrewNeural, en-US-GuyNeural, en-US-AriaNeural
# ─────────────────────────────────────────────────────────────────────────────

TTS_VOICE    = "en-US-AndrewNeural"

# Loudness mastering target (EBU R128). -16 LUFS is the de-facto standard for
# spoken-word / podcasts, so clips from different shows AND the TTS narration all
# land at the same perceived volume — no more riding the volume knob.
TARGET_LUFS  = -16.0
TARGET_TP    = -1.5     # true-peak ceiling (dBTP)
TARGET_LRA   = 11.0     # loudness range

CLIP_FADE_MS = 250      # fade in/out on each podcast clip
JOIN_FADE_MS = 25       # tiny fade on every join to avoid clicks/pops
GAP_AFTER_CLIP_MS = 600 # breathing room after a clip before the next narration
GAP_AFTER_TALK_MS = 300 # shorter gap after narration (it leads into a clip)

_TTS_CONCURRENCY = 4    # parallel Edge-TTS requests (bounded to be polite)


def _loudnorm_filter() -> str:
    return f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA={TARGET_LRA}"


def generate_tts(text: str, output_path: str) -> str:
    """Generate a single TTS narration file using Edge's free neural voice."""
    import edge_tts

    async def _speak():
        await edge_tts.Communicate(text, TTS_VOICE).save(output_path)

    if os.path.exists(output_path):
        os.remove(output_path)
    asyncio.run(_speak())
    return output_path


def generate_tts_batch(items: List[dict], voice: str = TTS_VOICE) -> None:
    """
    Synthesize many narration segments concurrently.
    `items` is a list of {"path": <out_path>, "text": <str>}.
    Falls back to per-item synthesis on any failure so one bad segment can't
    sink the whole batch.
    """
    import edge_tts

    if not items:
        return

    async def _run():
        sem = asyncio.Semaphore(_TTS_CONCURRENCY)

        async def one(it):
            async with sem:
                if os.path.exists(it["path"]):
                    os.remove(it["path"])
                await edge_tts.Communicate(it["text"], voice).save(it["path"])

        await asyncio.gather(*[one(it) for it in items])

    try:
        asyncio.run(_run())
    except Exception as e:
        print(f"  Batch TTS failed ({e}); falling back to sequential synthesis")
        for it in items:
            try:
                generate_tts(it["text"], it["path"])
            except Exception as e2:
                print(f"  TTS failed for segment → {it['path']}: {e2}")


def _normalize_file(in_path: str, out_path: str, bitrate: str = "128k") -> bool:
    """Loudness-normalize an audio file to the mastering target. Returns success."""
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", in_path, "-af", _loudnorm_filter(),
             "-ar", "44100", "-ac", "1", "-ab", bitrate, out_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
        )
        return os.path.exists(out_path)
    except subprocess.CalledProcessError as e:
        print(f"  loudnorm failed for {os.path.basename(in_path)}: {e}")
        return False


def _ffmpeg_extract_clip(source_path: str, start_sec: float, end_sec: float, out_path: str) -> bool:
    """
    Extract a clip with ffmpeg AND loudness-normalize it in one pass, so the
    full source file is never loaded into memory and every clip lands at the
    same perceived volume.
    """
    duration = end_sec - start_sec
    if duration <= 0:
        return False
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(start_sec), "-i", source_path,
             "-t", str(duration), "-af", _loudnorm_filter(),
             "-ar", "44100", "-ac", "1", "-ab", "128k", out_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
        )
        return os.path.exists(out_path)
    except subprocess.CalledProcessError as e:
        print(f"  ffmpeg clip extraction failed: {e}")
        # Fallback: extract without the loudness filter rather than dropping the clip.
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-ss", str(start_sec), "-i", source_path,
                 "-t", str(duration), "-ac", "1", "-ab", "128k", out_path],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
            )
            return os.path.exists(out_path)
        except subprocess.CalledProcessError:
            return False


def _prepare_tts(plan: List[dict], tts_dir: str) -> Dict[int, str]:
    """
    Synthesize every narration segment up front (concurrently), then loudness-
    normalize each. Returns {plan_index: normalized_mp3_path}.
    """
    raw_items, norm_paths = [], {}
    for idx, seg in enumerate(plan):
        if seg.get("type") != "transition":
            continue
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        raw_items.append({"path": os.path.join(tts_dir, f"tts_{idx}_raw.mp3"), "text": text, "idx": idx})

    generate_tts_batch([{"path": it["path"], "text": it["text"]} for it in raw_items])

    for it in raw_items:
        raw, idx = it["path"], it["idx"]
        if not os.path.exists(raw):
            continue
        norm = os.path.join(tts_dir, f"tts_{idx}.mp3")
        if not _normalize_file(raw, norm, bitrate="128k"):
            # Loudnorm failed — use the raw narration as-is.
            shutil.copyfile(raw, norm)
        norm_paths[idx] = norm
        try: os.remove(raw)
        except OSError: pass
    return norm_paths


def stitch_multi_source(plan: List[dict], tts_dir: str) -> Tuple[str, List[dict]]:
    """
    Assemble the final podcast from an ordered plan list. Clips are extracted +
    loudness-normalized via ffmpeg (never fully loaded into memory) and narration
    is pre-synthesized in parallel and normalized to the same target so the whole
    piece sits at a consistent volume with click-free joins.

    plan items are either:
      { type: "transition", text, chapter_title }
      { type: "clip", start_time, end_time, chapter_title, podcast_name, episode_title, apple_podcasts_url, summary, audio_path }

    Returns (output_mp3_path, chapters_json) with start_ms/end_ms per segment.
    """
    tts_paths = _prepare_tts(plan, tts_dir)

    final_audio = AudioSegment.empty()
    chapters: List[dict] = []
    current_ms = 0
    clip_counter = 0

    def _append(seg: AudioSegment, gap_ms: int) -> Tuple[int, int]:
        """Append a segment with click-free fades; return (start_ms, end_ms_before_gap)."""
        nonlocal final_audio, current_ms
        seg = seg.fade_in(JOIN_FADE_MS).fade_out(JOIN_FADE_MS)
        start = current_ms
        final_audio += seg
        end = current_ms + len(seg)
        if gap_ms:
            final_audio += AudioSegment.silent(duration=gap_ms)
        current_ms = end + gap_ms
        return start, end

    for idx, segment in enumerate(plan):
        seg_type = segment.get("type")

        if seg_type == "transition":
            tts_path = tts_paths.get(idx)
            if not tts_path or not os.path.exists(tts_path):
                continue
            try:
                tts_audio = AudioSegment.from_mp3(tts_path)
            except Exception as e:
                print(f"  Could not load narration {tts_path}: {e}")
                continue

            start_ms, end_ms = _append(tts_audio, GAP_AFTER_TALK_MS)
            chapters.append({
                "type": "transition",
                "title": segment.get("chapter_title", ""),
                "start_ms": start_ms,
                "end_ms": end_ms,
                "source_podcast": None,
                "source_episode": None,
                "apple_podcasts_url": None,
                "text": segment.get("text", ""),
            })
            try: os.remove(tts_path)
            except OSError: pass

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
                print("  Warning: failed to extract clip, skipping")
                continue

            try:
                clip = AudioSegment.from_mp3(clip_path).fade_in(CLIP_FADE_MS).fade_out(CLIP_FADE_MS)
            except Exception as e:
                print(f"  Could not load clip {clip_path}: {e}")
                continue

            start_ms, end_ms = _append(clip, GAP_AFTER_CLIP_MS)
            chapters.append({
                "type": "clip",
                "title": segment.get("chapter_title", "Clip"),
                "start_ms": start_ms,
                "end_ms": end_ms,
                "source_podcast": segment.get("podcast_name", ""),
                "source_episode": segment.get("episode_title", ""),
                "apple_podcasts_url": segment.get("apple_podcasts_url", ""),
                "summary": segment.get("summary", ""),
                "source_start_s": round(segment.get("start_time", 0), 1),
                "source_end_s": round(segment.get("end_time", 0), 1),
            })

            try: os.remove(clip_path)
            except OSError: pass

    output_path = os.path.join(tts_dir, "final_poddy.mp3")
    print(f"Exporting final audio ({current_ms/1000:.1f}s) → {output_path}")
    final_audio.export(output_path, format="mp3", bitrate="192k")
    return output_path, chapters
