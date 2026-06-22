"""
Central configuration + feature flags for the video-learning POC.

Everything dangerous (network access, real downloads, real LLM/TTS calls) is OFF
by default. Flags can be flipped via constructor args from the CLI, never silently
from the environment, so a dry run stays a dry run.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Tuple
import json


# ─────────────────────────────────────────────────────────────────────────────
# Video master format. We normalize EVERY heterogeneous source clip to this
# canonical target before concatenation so codecs/resolutions/fps/SAR all match.
# 720p30 is a deliberate default: cheap to encode, fine for learning material,
# and small on disk. Bump to 1080p later if you have GPU + storage to spare.
# ─────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class VideoProfile:
    width: int = 1280
    height: int = 720
    fps: int = 30
    v_codec: str = "libx264"
    crf: int = 20            # 18-20 keeps re-encode loss invisible for lessons
    preset: str = "medium"
    pix_fmt: str = "yuv420p"  # max player compatibility
    a_codec: str = "aac"
    a_bitrate: str = "192k"
    a_rate: int = 48000      # 48 kHz is the video-world standard (vs 44.1k audio)
    a_channels: int = 2

    @property
    def size(self) -> str:
        return f"{self.width}x{self.height}"


# Loudness mastering target — identical to backend/services/audio_engine.py so the
# narration and clips from different sources all sit at the same perceived volume.
TARGET_LUFS = -16.0
TARGET_TP = -1.5
TARGET_LRA = 11.0


@dataclass
class PipelineConfig:
    topic: str = "the water cycle for kids"
    depth: str = "standard"            # quick | standard | deep

    # ── SAFETY GATES (all default OFF) ──────────────────────────────────────
    allow_network: bool = False         # master switch for ANY outbound request
    allow_download: bool = False        # actually pull media bytes (needs network)
    use_llm: bool = False               # call OpenAI for selection/scripting
    require_cc_license: bool = True      # only keep creativecommons-licensed videos
    kids_mode: bool = False             # stricter content filtering + simpler script

    # ── Avatar ──────────────────────────────────────────────────────────────
    avatar: str = "none"                # none | sadtalker | did  (see avatar.py)
    avatar_image: Optional[str] = None  # portrait for talking-head modes

    # ── Output ────────────────────────────────────────────────────────────────
    out_dir: str = "/tmp/poddy_video_poc"
    profile: VideoProfile = field(default_factory=VideoProfile)

    def to_json(self) -> str:
        d = asdict(self)
        return json.dumps(d, indent=2)


# Depth → tuning knobs. Mirrors backend/main.py DEPTH_CONFIG, retuned for video:
#   n_sources : distinct videos in the final lesson
#   n_clips   : segments extracted per source (kept short for video)
#   clip_min/clip_max : per-segment duration bounds in seconds
#   window    : minutes of each source we inspect captions for
DEPTH_CONFIG: Dict[str, Dict] = {
    "quick":    {"n_sources": 2, "n_clips": 2, "clip_min": 20, "clip_max": 90,  "window": 20},
    "standard": {"n_sources": 3, "n_clips": 3, "clip_min": 30, "clip_max": 120, "window": 30},
    "deep":     {"n_sources": 5, "n_clips": 3, "clip_min": 30, "clip_max": 150, "window": 45},
}


def depth_cfg(depth: str) -> Dict:
    return DEPTH_CONFIG.get(depth, DEPTH_CONFIG["standard"])
