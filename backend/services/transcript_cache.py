"""
Episode-level cache for trimmed audio + Whisper transcripts.

Keyed on the RSS <guid> when present (canonical, stable across feeds), falling
back to a SHA-256 of the mp3 enclosure URL. The cache lives at
TRANSCRIPT_CACHE_DIR (default /tmp/poddy_transcript_cache). On Railway, mount a
volume and point the env var at it for cross-deploy persistence.

Hitting the cache short-circuits the most expensive parts of the pipeline:
RSS download is unavoidable (we need it to pick an episode), but on a hit we
skip:
  - downloading the full episode mp3 (often 50-100 MB)
  - the ffmpeg trim+re-encode step
  - the Whisper API call (~$0.27 per 45 min source)
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import time
from typing import Optional, Tuple

CACHE_VERSION = 1
DEFAULT_CACHE_DIR = "/tmp/poddy_transcript_cache"


def _cache_dir() -> str:
    path = os.environ.get("TRANSCRIPT_CACHE_DIR", DEFAULT_CACHE_DIR)
    os.makedirs(path, exist_ok=True)
    return path


def make_key(guid: Optional[str], mp3_url: str) -> str:
    """Stable, filesystem-safe cache key. Prefer GUID; fall back to mp3_url."""
    canonical = (guid or "").strip() or (mp3_url or "").strip()
    if not canonical:
        raise ValueError("Need a guid or mp3_url to derive a cache key")
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:24]


def _paths(key: str) -> Tuple[str, str]:
    base = _cache_dir()
    return (
        os.path.join(base, f"{key}.json"),
        os.path.join(base, f"{key}.mp3"),
    )


def lookup(key: str) -> Optional[dict]:
    """Return cached entry {transcript, audio_path, metadata} or None on miss."""
    meta_path, audio_path = _paths(key)
    if not os.path.exists(meta_path) or not os.path.exists(audio_path):
        return None
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    if meta.get("cache_version") != CACHE_VERSION:
        return None
    return {
        "transcript": meta.get("transcript", ""),
        "audio_path": audio_path,
        "episode_title": meta.get("episode_title", ""),
        "guid": meta.get("guid", ""),
        "mp3_url": meta.get("mp3_url", ""),
        "cached_at": meta.get("cached_at", 0),
    }


def store(
    key: str,
    *,
    transcript: str,
    trimmed_mp3_path: str,
    guid: Optional[str],
    mp3_url: str,
    episode_title: str,
) -> str:
    """
    Persist transcript + a copy of the trimmed mp3. Returns the path to the
    cached audio file (callers should use this as audio_path downstream so
    the per-job dir can be cleaned up freely).
    """
    meta_path, cached_audio_path = _paths(key)

    # Copy (not move) so the caller's job_dir lifecycle is independent.
    if os.path.abspath(trimmed_mp3_path) != os.path.abspath(cached_audio_path):
        shutil.copyfile(trimmed_mp3_path, cached_audio_path)

    meta = {
        "cache_version": CACHE_VERSION,
        "guid": guid or "",
        "mp3_url": mp3_url,
        "episode_title": episode_title,
        "transcript": transcript,
        "cached_at": int(time.time()),
    }
    tmp_meta = meta_path + ".tmp"
    with open(tmp_meta, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    os.replace(tmp_meta, meta_path)  # atomic on POSIX

    return cached_audio_path
