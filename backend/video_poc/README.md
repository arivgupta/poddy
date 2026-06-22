# Poddy Video-Learning POC (experimental)

A **self-contained, runnable skeleton** for turning a topic into a personalized
educational **video** lesson — stitched from real source-video segments with an AI
"teacher" that introduces, signposts, and bridges between clips.

This is a **proof of concept of the architecture**, not a finished feature and not
wired into the FastAPI app. It is intentionally conservative: the default mode is a
**dry run** that prints the full plan (every `yt-dlp` / `ffmpeg` command, the chosen
segments, the teacher script, the assembly steps) **without downloading anything or
calling any paid API**.

> Full design rationale lives in [`../../docs/VIDEO_LEARNING_PIPELINE.md`](../../docs/VIDEO_LEARNING_PIPELINE.md).

---

## ⚖️ Legal caveats — read first

This tool can, in its gated LIVE mode, download from YouTube. Before you flip those
flags, understand:

- **YouTube's Terms of Service prohibit downloading** content except via features
  YouTube provides or "as permitted by applicable law." Third-party downloaders
  violate the ToS regardless of the video's copyright status.
- **"Educational" / "non-profit" is NOT a blanket exception.** Per YouTube's own
  copyright guidance, calling something educational does not grant you rights.
  *Fair use* is a fact-specific legal defense only a court can decide — not a
  permission slip.
- **The clean path is Creative Commons / public domain.** The POC defaults to
  `require_cc_license=True` and only keeps CC-licensed results. CC-BY content is
  reusable **with attribution** — which this pipeline bakes in via on-screen
  lower-thirds + an end-credits manifest.
- **Keep it personal and local.** Generating a lesson for yourself or your kids and
  watching it locally is very different from re-hosting/redistributing it. Do not
  publish or distribute output built from non-CC sources.
- You are responsible for your own use. This POC encodes the *safe defaults*; it
  does not give legal advice.

---

## Install

The **dry run needs nothing** beyond Python 3.10+. For LIVE features:

```bash
pip install -r video_poc/requirements.txt   # yt-dlp, edge-tts, openai
# plus system ffmpeg + ffprobe on PATH (apt-get install ffmpeg)
```

## Run (safe — no network, no keys)

Run from the `backend/` directory:

```bash
# Print the plan it WOULD execute for a kids topic:
python3 video_poc/main.py --topic "the water cycle for kids" --kids --depth quick

# A deeper adult lesson, talking-head avatar path (still dry-run):
python3 video_poc/main.py --topic "how transistors work" --depth deep --avatar did

# See all flags:
python3 video_poc/main.py --help
```

In dry-run, discovery returns a small **offline allow-list of genuinely reusable
samples** (Blender open movies = CC-BY, NASA b-roll = public domain) so the whole
pipeline is exercised without scraping.

## Flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--topic` | water cycle | What to build a lesson about |
| `--depth` | `standard` | `quick` / `standard` / `deep` → #sources & #segments |
| `--avatar` | `none` | `none` (slate+TTS, no GPU) / `sadtalker` (OSS stub) / `did` (hosted stub) |
| `--avatar-image` | – | Portrait for talking-head modes |
| `--kids` | off | Simpler script, younger voice, stricter filtering |
| `--out-dir` | `/tmp/poddy_video_poc` | Where media would be written (LIVE only) |
| **Danger flags (all OFF):** | | |
| `--execute` | off | Actually run the plan instead of dry-run |
| `--allow-network` | off | Permit outbound requests (search / captions) |
| `--allow-download` | off | Permit downloading media bytes (implies network) |
| `--use-llm` | off | Use OpenAI for selection + script (needs `OPENAI_API_KEY`) |
| `--no-cc-filter` | off | Disable the CC license filter (**not recommended**) |

Safety is layered: `--execute` alone still won't hit the network; you must *also*
pass `--allow-network` / `--allow-download`. A plain dry run can never download.

## Modules (pipeline order)

| File | Role | Mirrors in main app |
|------|------|---------------------|
| `config.py` | Flags + canonical `VideoProfile` + depth config | `main.py DEPTH_CONFIG` |
| `discovery.py` | yt-dlp license-filtered candidate search | `services/discovery.py` |
| `transcript.py` | Caption (VTT) fetch + parse → Poddy transcript format | `services/ingestion.py` (Whisper) |
| `selection.py` | LLM/heuristic segment pick + **boundary snapping** | `services/llm_curator.py` |
| `pedagogy.py` | Teacher script: intro / bridges / checkpoints / recap | `llm_curator.write_transitions_batch` |
| `cards.py` | Title cards, lower-thirds, caption burn-in (ffmpeg) | *(new for video)* |
| `avatar.py` | Narration renderers: slate (default) / SadTalker / D-ID | `services/audio_engine.py` (TTS) |
| `video_engine.py` | Cut + normalize + concat + loudness master (ffmpeg) | `services/audio_engine.py` |
| `pipeline.py` | Orchestrator → produces the executable plan | `main.py run_pipeline` |
| `main.py` | CLI entrypoint | `scripts/smoke_pipeline.py` |

## Status / what's real

- ✅ Fully implemented & verified in dry-run: discovery planning, caption parsing,
  segment selection + snapping, ordering, teacher script, command generation for the
  whole assembly, slate (no-avatar) renderer command path.
- 🔌 Gated but implemented: live yt-dlp metadata search and VTT caption fetch,
  LLM selection/script, slate render execution.
- 🧱 Documented stubs (raise a clear error in LIVE mode): `sadtalker` and `did`
  talking-head renderers — they print their representative commands in dry-run.
