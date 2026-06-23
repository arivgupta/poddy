"""
Video assembly with ffmpeg: cut source segments, normalize them to one canonical
profile, then concatenate clips + narration segments into the final lesson.

Design decisions (see docs for rationale):
  * CUT: download only the chosen window via yt-dlp `--download-sections` (saves
    bandwidth + reduces footprint), or `ffmpeg -ss <start> -i in -t <dur>` on an
    already-downloaded file.
  * NORMALIZE: every clip is re-encoded to ONE profile (scale+pad to 1280x720,
    setsar=1, fps=30, yuv420p, 48kHz stereo aac) with two-pass-style loudnorm to
    -16 LUFS — the audio target reused from audio_engine.py. Heterogeneous inputs
    that aren't normalized will break concat or desync A/V.
  * CONCAT: because inputs (even normalized) come from different encoders, we use
    the **concat demuxer with -c copy** AFTER normalization (fast, lossless) when
    all params already match, and fall back to the **concat filter** (re-encode)
    if anything still differs. Optional xfade transitions use the filter path.

All functions BUILD argv; execution is gated by the pipeline dry-run flag.
"""
from __future__ import annotations

from typing import List, Dict, Optional
import os
import subprocess

from .config import VideoProfile, TARGET_LUFS, TARGET_TP, TARGET_LRA
from . import cards


def loudnorm_af(profile: VideoProfile) -> str:
    return (f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA={TARGET_LRA},"
            f"aresample={profile.a_rate}")


# ─────────────────────────────────────────────────────────────────────────────
# Execution helper (runs argv; returns success). Used only in LIVE mode.
# ─────────────────────────────────────────────────────────────────────────────

def run_ff(argv: List[str], *, desc: str = "", timeout: int = 600) -> bool:
    """Run an ffmpeg/yt-dlp command. Returns True iff it succeeded and produced
    its (last-arg) output. Errors are surfaced but never raise."""
    try:
        proc = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    except Exception as e:  # noqa: BLE001
        print(f"    [run] {desc or argv[0]} failed to start: {e}")
        return False
    if proc.returncode != 0:
        tail = (proc.stderr or "").strip().splitlines()[-3:]
        print(f"    [run] {desc or argv[0]} exited {proc.returncode}: {' | '.join(tail)}")
        return False
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Synthetic source generator — used by --self-test so the full assembly can be
# validated end-to-end with ZERO network (no YouTube). Produces a labelled,
# moving test pattern + a gentle tone at the canonical profile.
# ─────────────────────────────────────────────────────────────────────────────

def make_synthetic_source_cmd(out_path: str, duration: float, label: str,
                              profile: VideoProfile, *, freq: int = 220) -> List[str]:
    p = profile
    draw = (f"drawtext=text='{cards._esc(label)}':fontcolor=white:fontsize=52:"
            f"x=(w-text_w)/2:y=90:box=1:boxcolor=black@0.5:boxborderw=16")
    return [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"testsrc2=size={p.size}:rate={p.fps}:duration={duration:.2f}",
        "-f", "lavfi", "-i", f"sine=frequency={freq}:duration={duration:.2f}:sample_rate={p.a_rate}",
        "-vf", draw,
        "-c:v", p.v_codec, "-preset", p.preset, "-crf", str(p.crf), "-pix_fmt", p.pix_fmt,
        "-c:a", p.a_codec, "-b:a", p.a_bitrate, "-ar", str(p.a_rate), "-ac", str(p.a_channels),
        "-t", f"{duration:.2f}", out_path,
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Acquire a single source segment
# ─────────────────────────────────────────────────────────────────────────────

def ytdlp_cookie_args(cookies_from_browser: Optional[str] = None,
                      cookies_file: Optional[str] = None) -> List[str]:
    """yt-dlp cookie flags. Supplying browser cookies is the standard way past
    YouTube's "confirm you're not a bot" wall when running from your own machine."""
    args: List[str] = []
    if cookies_from_browser:
        args += ["--cookies-from-browser", cookies_from_browser]
    if cookies_file:
        args += ["--cookies", cookies_file]
    return args


def ytdlp_download_section_cmd(url: str, start: float, end: float, out_path: str,
                              *, cookies_from_browser: Optional[str] = None,
                              cookies_file: Optional[str] = None) -> List[str]:
    """yt-dlp command to download ONLY [start,end] of a video (needs ffmpeg).

    `--download-sections "*START-END"` ('*' = time range, not chapter). This is the
    bandwidth-friendly way to grab just the teaching segment.
    """
    return [
        "yt-dlp",
        *ytdlp_cookie_args(cookies_from_browser, cookies_file),
        "--download-sections", f"*{start:.2f}-{end:.2f}",
        "--force-keyframes-at-cuts",
        "-f", "bv*[height<=720]+ba/b[height<=720]",
        "--merge-output-format", "mp4",
        "-o", out_path,
        url,
    ]


def ffmpeg_cut_cmd(in_path: str, start: float, end: float, out_path: str) -> List[str]:
    """Cut [start,end] from an already-downloaded file (re-encode for frame accuracy)."""
    return [
        "ffmpeg", "-y", "-ss", f"{start:.2f}", "-i", in_path,
        "-t", f"{(end - start):.2f}",
        "-c:v", "libx264", "-c:a", "aac", out_path,
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Normalize a clip to the canonical profile (+ optional lower-third / captions)
# ─────────────────────────────────────────────────────────────────────────────

def normalize_clip_cmd(in_path: str, out_path: str, profile: VideoProfile,
                       *, lower_third: Optional[Dict] = None,
                       captions_srt: Optional[str] = None) -> List[str]:
    lt_filter = None
    if lower_third:
        lt_filter = cards.lower_third_filter(
            lower_third.get("line1", ""), lower_third.get("line2", ""))
    return cards.normalize_and_overlay_clip_cmd(
        in_path, out_path, profile,
        lower_third=lt_filter, captions_srt=captions_srt)


# ─────────────────────────────────────────────────────────────────────────────
# Concatenate
# ─────────────────────────────────────────────────────────────────────────────

def write_concat_list(segment_paths: List[str], list_path: str) -> str:
    """Write the concat-demuxer file list. Returns the path."""
    with open(list_path, "w", encoding="utf-8") as f:
        for p in segment_paths:
            f.write(f"file '{os.path.abspath(p)}'\n")
    return list_path


def concat_demuxer_cmd(list_path: str, out_path: str) -> List[str]:
    """Fast, lossless concat (-c copy). Valid only when all segments share params,
    which they do after normalize_clip_cmd / the slate renderer's canonical output."""
    return [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_path,
        "-c", "copy", "-movflags", "+faststart", out_path,
    ]


def concat_filter_cmd(segment_paths: List[str], out_path: str,
                      profile: VideoProfile) -> List[str]:
    """Robust concat (re-encode) for when segments still differ. Also the path you
    extend for xfade transitions between segments."""
    p = profile
    argv: List[str] = ["ffmpeg", "-y"]
    for sp in segment_paths:
        argv += ["-i", sp]
    chains = []
    for i in range(len(segment_paths)):
        chains.append(
            f"[{i}:v]scale={p.width}:{p.height}:force_original_aspect_ratio=decrease,"
            f"pad={p.width}:{p.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={p.fps},"
            f"format={p.pix_fmt}[v{i}];"
            f"[{i}:a]aresample={p.a_rate},aformat=channel_layouts=stereo[a{i}];"
        )
    concat_inputs = "".join(f"[v{i}][a{i}]" for i in range(len(segment_paths)))
    filtergraph = "".join(chains) + f"{concat_inputs}concat=n={len(segment_paths)}:v=1:a=1[v][a]"
    argv += [
        "-filter_complex", filtergraph,
        "-map", "[v]", "-map", "[a]",
        "-c:v", p.v_codec, "-preset", p.preset, "-crf", str(p.crf),
        "-pix_fmt", p.pix_fmt,
        "-c:a", p.a_codec, "-b:a", p.a_bitrate, "-ar", str(p.a_rate),
        "-movflags", "+faststart", out_path,
    ]
    return argv


def master_loudness_cmd(in_path: str, out_path: str, profile: VideoProfile) -> List[str]:
    """Final whole-file loudness master to lock integrated -16 LUFS / -1.5 dBTP
    (mirrors audio_engine.master_final's intent, video-muxed)."""
    return [
        "ffmpeg", "-y", "-i", in_path,
        "-af", loudnorm_af(profile),
        "-c:v", "copy",
        "-c:a", profile.a_codec, "-b:a", profile.a_bitrate, "-ar", str(profile.a_rate),
        out_path,
    ]
