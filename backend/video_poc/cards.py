"""
On-screen graphics: title cards, lower-thirds (source attribution), and burned-in
captions — all via ffmpeg's drawtext (libfreetype) and subtitles/ass (libass)
filters, which are present in the system ffmpeg build.

Everything here BUILDS ffmpeg filter strings / argv; running is the caller's job
(and is gated by the pipeline's dry-run). This keeps the module pure + testable.
"""
from __future__ import annotations

from typing import Optional, List
from .config import VideoProfile


def _esc(text: str) -> str:
    """Escape text for ffmpeg drawtext (colons, quotes, backslashes, %)."""
    return (text.replace("\\", "\\\\")
                .replace(":", "\\:")
                .replace("'", "\\'")
                .replace("%", "\\%"))


def title_card_cmd(
    title: str,
    subtitle: str,
    duration: float,
    out_path: str,
    profile: VideoProfile,
    *,
    bg: str = "0x10243f",
) -> List[str]:
    """A standalone full-screen title/section card (color bg + centered text).

    Used for the intro, section dividers ("Checkpoint", "Recap", "Takeaways").
    Audio is added separately by the narration renderer; this is the visual.
    """
    p = profile
    draw = (
        f"drawtext=text='{_esc(title)}':fontcolor=white:fontsize=64:"
        f"x=(w-text_w)/2:y=(h-text_h)/2-40"
    )
    if subtitle:
        draw += (
            f",drawtext=text='{_esc(subtitle)}':fontcolor=0xb9d6ff:fontsize=34:"
            f"x=(w-text_w)/2:y=(h-text_h)/2+50"
        )
    return [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c={bg}:s={p.size}:r={p.fps}:d={duration}",
        "-vf", draw,
        "-c:v", p.v_codec, "-pix_fmt", p.pix_fmt, "-crf", str(p.crf),
        "-t", str(duration), out_path,
    ]


def lower_third_filter(line1: str, line2: str, *, hold: float = 6.0) -> str:
    """drawtext filter overlaying a source-attribution lower-third on a clip.

    Shown for the first `hold` seconds of the clip (enable='lt(t,hold)'), bottom-
    left, with a semi-transparent box. line1 = source/uploader, line2 = concept.
    """
    box = "box=1:boxcolor=black@0.55:boxborderw=14"
    f1 = (f"drawtext=text='{_esc(line1)}':fontcolor=white:fontsize=30:"
          f"x=40:y=h-110:{box}:enable='lt(t,{hold})'")
    f2 = (f"drawtext=text='{_esc(line2)}':fontcolor=0xb9d6ff:fontsize=24:"
          f"x=40:y=h-64:{box}:enable='lt(t,{hold})'")
    return f"{f1},{f2}"


def burn_captions_filter(srt_path: str) -> str:
    """libass burn-in of an .srt/.ass subtitle file (accessibility)."""
    safe = srt_path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    return f"subtitles='{safe}'"


def normalize_and_overlay_clip_cmd(
    in_path: str,
    out_path: str,
    profile: VideoProfile,
    *,
    lower_third: Optional[str] = None,
    captions_srt: Optional[str] = None,
) -> List[str]:
    """Re-encode a single source clip to the canonical profile, optionally adding a
    lower-third and burned-in captions. This is the per-clip normalization pass
    that makes heterogeneous clips concat-compatible (see video_engine)."""
    p = profile
    vf = (f"scale={p.width}:{p.height}:force_original_aspect_ratio=decrease,"
          f"pad={p.width}:{p.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={p.fps},"
          f"format={p.pix_fmt}")
    if captions_srt:
        vf += "," + burn_captions_filter(captions_srt)
    if lower_third:
        vf += "," + lower_third
    return [
        "ffmpeg", "-y", "-i", in_path,
        "-vf", vf,
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,"
               f"aresample={p.a_rate}",
        "-c:v", p.v_codec, "-preset", p.preset, "-crf", str(p.crf),
        "-pix_fmt", p.pix_fmt,
        "-c:a", p.a_codec, "-b:a", p.a_bitrate, "-ar", str(p.a_rate),
        "-ac", str(p.a_channels),
        out_path,
    ]
