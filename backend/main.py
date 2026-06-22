from typing import List, Dict, Optional, Any, Tuple
import os
import subprocess

# Ensure pydub can find ffmpeg — works on both macOS (Homebrew) and Linux (Docker)
os.environ["PATH"] = "/opt/homebrew/bin:/usr/bin:/usr/local/bin:" + os.environ.get("PATH", "")

import json
import shutil
import uuid
import threading
from collections import OrderedDict

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.ingestion import (
    process_sources_parallel,
)
from services.llm_curator import (
    generate_title,
    curate_sources,
    extract_clips_from_source,
    order_and_deduplicate,
    write_transitions_batch,
)
from services.audio_engine import stitch_multi_source

# ─────────────────────────────────────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Poddy Backend")

# Comma-separated list of exact origins (production Vercel domain, custom domain, etc.)
_extra_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

ALLOWED_ORIGINS = [
    "https://poddy-one.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    *_extra_origins,
]

# Vercel preview deploys: https://poddy-<hash>-<scope>.vercel.app
ALLOWED_ORIGIN_REGEX = r"^https://poddy(-[a-z0-9]+)*\.vercel\.app$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

JOBS_DIR = os.environ.get("JOBS_DIR", "/tmp/poddy_jobs")
os.makedirs(JOBS_DIR, exist_ok=True)

# In-memory job state { job_id: { status, chapters, error, duration_ms, ... } }
# Bounded so a long-lived worker can't leak forever on a 512 MB box.
MAX_JOBS_IN_MEMORY = int(os.environ.get("MAX_JOBS_IN_MEMORY", "64"))
jobs: "OrderedDict[str, Any]" = OrderedDict()
_jobs_lock = threading.Lock()


def _evict_old_jobs() -> None:
    """Evict oldest finished jobs and clean up their on-disk artifacts."""
    while len(jobs) > MAX_JOBS_IN_MEMORY:
        oldest_id, oldest = next(iter(jobs.items()))
        # Don't evict a job that's still running — pop something newer instead.
        if oldest.get("status") not in {"done", "error"}:
            # Find the oldest finished job; if none, give up (let it grow a bit).
            finished = next(
                (jid for jid, j in jobs.items() if j.get("status") in {"done", "error"}),
                None,
            )
            if finished is None:
                return
            oldest_id = finished
        jobs.pop(oldest_id, None)
        job_dir = os.path.join(JOBS_DIR, oldest_id)
        if os.path.isdir(job_dir):
            shutil.rmtree(job_dir, ignore_errors=True)


@app.get("/health")
def health_check():
    """Railway / Render healthcheck."""
    return {"status": "ok", "service": "Poddy API"}


# ─────────────────────────────────────────────────────────────────────────────
# Request schema
# ─────────────────────────────────────────────────────────────────────────────

# Depth → tuning knobs.
#   n_sources : distinct podcasts we want in the final piece
#   n_clips   : clips extracted per source
#   window    : minutes of each episode transcribed (deeper = look further in)
DEPTH_CONFIG = {
    "quick":    {"n_sources": 2, "n_clips": 4, "window": 35},
    "standard": {"n_sources": 3, "n_clips": 6, "window": 45},
    "deep":     {"n_sources": 5, "n_clips": 8, "window": 70},
}

class SynthesizeRequest(BaseModel):
    topic: str
    depth: str = "standard"   # quick | standard | deep


# ─────────────────────────────────────────────────────────────────────────────
# Background pipeline
# ─────────────────────────────────────────────────────────────────────────────

def _get_duration_ms(path: str) -> int:
    """Get audio duration in ms via ffprobe (avoids loading the file into memory)."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, check=True,
        )
        return int(float(result.stdout.strip()) * 1000)
    except Exception:
        return 0


def run_pipeline(job_id: str, topic: str, depth: str):
    job_dir = os.path.join(JOBS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    cfg = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["standard"])
    n_sources = cfg["n_sources"]
    n_clips   = cfg["n_clips"]
    window    = cfg["window"]

    def update(status: str, **kwargs):
        with _jobs_lock:
            jobs[job_id].update({"status": status, **kwargs})
        print(f"[{job_id}] {status}")

    try:
        # ── Stage 0: Generate display title ───────────────────────────────────
        try:
            title = generate_title(topic)
            with _jobs_lock:
                jobs[job_id]["title"] = title
            print(f"[{job_id}] title: {title}")
        except Exception as e:
            print(f"[{job_id}] title generation failed, using topic: {e}")
            with _jobs_lock:
                jobs[job_id]["title"] = topic

        # ── Stage 1: AI source discovery (over-provisioned for backfill) ──────
        update("discovering_sources")
        sources = curate_sources(topic, n_sources=n_sources)

        # ── Stage 2: Parallel download + transcription ─────────────────────────
        # Show only the primary picks to the user; extras are silent backups.
        update("downloading_transcribing", sources_found=n_sources,
               source_names=[s["podcast_name"] for s in sources[:n_sources]])
        enriched_sources = process_sources_parallel(
            sources, job_dir, user_topic=topic, target=n_sources, window_minutes=window,
        )

        if not enriched_sources:
            raise RuntimeError("Could not download or transcribe any podcast sources.")

        # ── Stage 3: Per-source clip extraction ────────────────────────────────
        update("extracting_clips")
        all_clips = []
        for src in enriched_sources:
            # A single source failing (e.g. a transient rate limit even after
            # retries) must not sink the whole documentary — skip it and keep
            # the clips we did get from the other sources.
            try:
                clips = extract_clips_from_source(
                    topic=topic,
                    transcript=src["transcript"],
                    source_info=src,
                    n_clips=n_clips,  # generous fixed count per source
                )
            except Exception as e:
                print(f"[{job_id}] clip extraction failed for {src.get('podcast_name')}: {e}")
                continue
            for clip in clips:
                clip["audio_path"] = src["audio_path"]
            all_clips.extend(clips)

        if not all_clips:
            raise RuntimeError("Could not extract any usable clips from the sources.")

        # ── Stage 4: Cross-source curriculum ordering (keeps all non-dupes) ───
        update("building_curriculum")
        ordered_clips = order_and_deduplicate(topic, all_clips)

        # ── Stage 5: Write narrator transitions ────────────────────────────────
        update("writing_narration")
        plan = write_transitions_batch(topic, ordered_clips)

        # ── Stage 6: Stitch (loads audio on-demand per source) ─────────────────
        update("stitching")
        output_path, chapters = stitch_multi_source(plan, job_dir)

        # ── Done ───────────────────────────────────────────────────────────────
        duration_ms = _get_duration_ms(output_path)
        sources_used = list({s["podcast_name"] for s in enriched_sources})

        update(
            "done",
            output_path=output_path,
            chapters=chapters,
            duration_ms=duration_ms,
            sources_used=sources_used,
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        with _jobs_lock:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = str(e)


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/synthesize")
def synthesize(request: SynthesizeRequest):
    """
    Kick off a synthesis job. Returns a job_id immediately.
    Poll /jobs/{job_id} for status. Fetch /audio/{job_id} when done.
    """
    job_id = str(uuid.uuid4())[:8]
    with _jobs_lock:
        jobs[job_id] = {"status": "queued", "topic": request.topic}
        _evict_old_jobs()

    t = threading.Thread(target=run_pipeline, args=(job_id, request.topic, request.depth), daemon=True)
    t.start()

    return {"job_id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    """Poll job status. Returns full metadata including chapters when done."""
    with _jobs_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        # Snapshot under lock so we don't race a concurrent .update()
        safe_job = {k: v for k, v in job.items() if k != "output_path"}
    return safe_job


@app.get("/audio/{job_id}")
def get_audio(job_id: str):
    """Stream the final synthesized MP3 (for in-browser playback)."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "done":
        raise HTTPException(status_code=425, detail=f"Job status: {job.get('status')}")

    output_path = job.get("output_path")
    if not output_path or not os.path.exists(output_path):
        raise HTTPException(status_code=500, detail="Audio file not found on server")

    return FileResponse(
        output_path,
        media_type="audio/mpeg",
        filename="poddy.mp3",
    )


@app.get("/download/{job_id}")
def download_audio(job_id: str):
    """Download the final MP3 as an attachment (triggers browser save dialog)."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "done":
        raise HTTPException(status_code=425, detail=f"Not ready: {job.get('status')}")

    output_path = job.get("output_path")
    if not output_path or not os.path.exists(output_path):
        raise HTTPException(status_code=500, detail="Audio file missing on server")

    safe_topic = job.get("topic", "poddy").replace("/", "-")[:50]
    filename   = f"Poddy - {safe_topic}.mp3"

    return FileResponse(
        output_path,
        media_type="audio/mpeg",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
