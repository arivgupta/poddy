"""
Narration rendering — turn a narration beat (text) into a VIDEO segment.

Defines a small `NarrationRenderer` interface with three implementations:

  1. SlateRenderer  (DEFAULT, "no-avatar" fallback)
       TTS audio (reuses Poddy's edge-tts voice) over an animated title slate /
       kinetic-typography card. Zero GPU, zero cost, deterministic. This is the
       recommended MVP default.

  2. SadTalkerRenderer  (open-source talking head — STUB)
       Would call a local SadTalker install (single portrait + wav -> mp4).
       Needs an NVIDIA GPU (6GB+). Apache-2.0. Left as a documented stub.

  3. DIDRenderer  (hosted API talking head — STUB)
       Would call the D-ID Talks API (cheapest hosted option, ~$0.02/s). Needs an
       API key + network. Left as a documented stub.

Only SlateRenderer is fully implemented; the talking-head paths raise a clear
NotImplementedError so the architecture is visible without shipping a GPU dep.
All actual media work is gated by the pipeline's dry-run flag.
"""
from __future__ import annotations

from typing import Optional, List, Dict
import os

from .config import VideoProfile
from . import cards


# ─────────────────────────────────────────────────────────────────────────────
# TTS (reuses the exact free Edge neural voice from audio_engine.py)
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_VOICE = "en-US-AndrewNeural"
KIDS_VOICE = "en-US-AnaNeural"   # younger-sounding voice for kids mode


def synth_tts(text: str, out_path: str, voice: str = DEFAULT_VOICE) -> str:
    """Synthesize narration to an mp3 with edge-tts (lazy import)."""
    import asyncio
    import edge_tts

    async def _go():
        await edge_tts.Communicate(text, voice).save(out_path)

    if os.path.exists(out_path):
        os.remove(out_path)
    asyncio.run(_go())
    return out_path


class NarrationRenderer:
    """Interface: render a narration beat to a self-contained mp4 segment."""

    name = "base"

    def render(self, beat: Dict, out_path: str, profile: VideoProfile,
               *, voice: str, dry_run: bool = True) -> List[List[str]]:
        """Return the list of argv commands that WOULD/DID produce out_path."""
        raise NotImplementedError


class SlateRenderer(NarrationRenderer):
    """No-avatar default: TTS over an animated title/kinetic-typography slate."""

    name = "none"

    def render(self, beat: Dict, out_path: str, profile: VideoProfile,
               *, voice: str, dry_run: bool = True) -> List[List[str]]:
        on = beat.get("on_screen", {})
        title = on.get("title") or beat.get("role", "").title()
        subtitle = on.get("subtitle", "")
        text = beat.get("text", "")

        tts_path = out_path.replace(".mp4", ".mp3")
        tts_cmd = ["edge-tts", "--voice", voice, "--text", text[:80] + "...",
                   "--write-media", tts_path]  # representative; real path uses python API

        # Slate = color bg + centered title/subtitle, muxed with the TTS audio.
        # Duration is driven by the narration audio length (-shortest).
        p = profile
        draw = (f"drawtext=text='{cards._esc(title)}':fontcolor=white:fontsize=64:"
                f"x=(w-text_w)/2:y=(h-text_h)/2-40")
        if subtitle:
            draw += (f",drawtext=text='{cards._esc(subtitle)}':fontcolor=0xb9d6ff:"
                     f"fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2+50")
        slate_cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=0x10243f:s={p.size}:r={p.fps}",
            "-i", tts_path,
            "-vf", draw,
            "-c:v", p.v_codec, "-pix_fmt", p.pix_fmt, "-crf", str(p.crf),
            "-c:a", p.a_codec, "-b:a", p.a_bitrate, "-ar", str(p.a_rate),
            "-ac", str(p.a_channels),
            "-shortest", out_path,
        ]

        cmds = [tts_cmd, slate_cmd]
        if dry_run:
            print(f"    [avatar:none] narration '{beat.get('role')}' → {os.path.basename(out_path)}")
            for c in cmds:
                print(f"        $ {' '.join(c)}")
            return cmds

        # Live: synth via python edge-tts API, then run the slate mux.
        import subprocess
        synth_tts(text, tts_path, voice=voice)
        subprocess.run(slate_cmd, check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return cmds


class SadTalkerRenderer(NarrationRenderer):
    """Open-source talking head (STUB). Single portrait + TTS wav -> lip-synced mp4."""

    name = "sadtalker"

    def render(self, beat: Dict, out_path: str, profile: VideoProfile,
               *, voice: str, dry_run: bool = True) -> List[List[str]]:
        tts_path = out_path.replace(".mp4", ".wav")
        # Representative SadTalker CLI invocation (requires a local GPU install).
        cmd = [
            "python", "inference.py",
            "--driven_audio", tts_path,
            "--source_image", "PORTRAIT.png",
            "--result_dir", os.path.dirname(out_path),
            "--still", "--preprocess", "full", "--enhancer", "gfpgan",
        ]
        if dry_run:
            print(f"    [avatar:sadtalker] would TTS '{beat.get('role')}' then run SadTalker (needs GPU):")
            print(f"        $ {' '.join(cmd)}")
            return [cmd]
        raise NotImplementedError(
            "SadTalker rendering is a documented stub. Install SadTalker + an NVIDIA "
            "GPU (6GB+), set avatar_image, then wire this method to its inference.py."
        )


class DIDRenderer(NarrationRenderer):
    """Hosted talking-head via D-ID Talks API (STUB). ~"$0.02/s", needs network+key."""

    name = "did"

    def render(self, beat: Dict, out_path: str, profile: VideoProfile,
               *, voice: str, dry_run: bool = True) -> List[List[str]]:
        if dry_run:
            print(f"    [avatar:did] would POST narration '{beat.get('role')}' to D-ID Talks API,"
                  f" poll, then download → {os.path.basename(out_path)}")
            return [["curl", "-sX", "POST", "https://api.d-id.com/talks", "..."]]
        raise NotImplementedError(
            "D-ID rendering is a documented stub. Set DID_API_KEY and implement the "
            "create-talk → poll → download flow against https://docs.d-id.com/."
        )


_RENDERERS = {
    "none": SlateRenderer,
    "sadtalker": SadTalkerRenderer,
    "did": DIDRenderer,
}


def get_renderer(kind: str) -> NarrationRenderer:
    cls = _RENDERERS.get(kind, SlateRenderer)
    return cls()
