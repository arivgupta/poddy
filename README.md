# 🎧 Poddy — AI-Curated Audio Documentaries

Poddy turns any topic into a polished, narrated audio documentary, assembled
from the **best real moments across the world's best podcasts**.

You type a topic → Poddy finds the definitive podcast episodes, transcribes
them, extracts the most information-dense clips, orders them like a university
lecture, writes warm narrator transitions, and stitches everything into a
single listenable MP3 with chapters and show notes.

---

## How it works

```
topic ──▶ curate sources (GPT) ──▶ find + download episodes (iTunes/RSS)
      ──▶ transcribe (Whisper) ──▶ extract best clips (GPT-4o)
      ──▶ order into a curriculum ──▶ write narration (GPT) ──▶ TTS (Edge)
      ──▶ stitch (ffmpeg/pydub) ──▶ MP3 + chapters + show notes
```

### Backend (`/backend`, FastAPI)
- `services/llm_curator.py` — source discovery, clip extraction, curriculum
  ordering, and narrator script writing (OpenAI).
- `services/ingestion.py` — iTunes search, RSS episode selection, download,
  trim, and Whisper transcription.
- `services/transcript_cache.py` — GUID-keyed cache for trimmed audio +
  transcripts (skips the expensive download/Whisper steps on repeat episodes).
- `services/audio_engine.py` — Edge-TTS narration + ffmpeg clip extraction +
  stitching into the final MP3. Emits per-segment chapter metadata, including
  narration text and clip summaries used by the **Show Notes** view.
- `main.py` — job queue, polling API (`/synthesize`, `/jobs/{id}`,
  `/audio/{id}`, `/download/{id}`), CORS, and bounded in-memory job state.

### Frontend (`/src`, React + Vite + Tailwind v4)
- **Prompt** → pick a topic and depth (Quick / Standard / Deep Dive).
- **Curator loading state** → live stage-by-stage progress.
- **Player** — a full-featured listening experience (see below).
- **Library** — locally saved casts (IndexedDB audio + localStorage metadata)
  with search, sort, aggregate stats, and resume progress.

---

## Player features

- **Continuous playback** — a single audio engine (`PlayerProvider`) keeps a
  cast playing while you browse the Library or prompt screen, surfaced as a
  **persistent mini-player** you can expand back to the full view.
- **Autoplay queue** — when a cast ends, Poddy rolls into the next one in your
  library (toggleable), with an "Up next" hint.
- **OS / lock-screen controls** via the Media Session API (play/pause, skip,
  chapter prev/next, scrubbing) with generated cover art.
- **Keyboard shortcuts** — `Space`/`K` play·pause, `J`/`L` (`←`/`→`) skip,
  `P`/`N` chapter nav, `↑`/`↓` volume, `M` mute, `[`/`]` speed, `?` help.
- **Accessible, touch-friendly seek bar** (pointer + keyboard, ARIA slider).
- **Volume control**, variable speed (0.75×–3×), and 15s skip.
- **Sleep timer** (5/10/15/30/45 min) with live countdown.
- **Resume playback** — every cast remembers where you left off.
- **Chapters** with auto-scroll to the active segment.
- **Show Notes** — readable narration + clip summaries with deep links to the
  original episodes; copy to clipboard or export as Markdown.
- **Share** via the Web Share API (clipboard fallback) and MP3 download.

---

## Local development

### Frontend

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle into dist/
npm run lint
```

Set `VITE_BACKEND_URL` to point at your backend (defaults to
`http://127.0.0.1:8000`).

### Backend

```bash
cd backend
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...          # required
uvicorn main:app --reload --port 8000
```

`ffmpeg` must be installed and on your `PATH`.

#### Backend environment variables

| Variable                | Default                          | Purpose                                            |
| ----------------------- | -------------------------------- | -------------------------------------------------- |
| `OPENAI_API_KEY`        | —                                | Required. Curation, clip extraction, Whisper.      |
| `ALLOWED_ORIGINS`       | (empty)                          | Comma-separated extra CORS origins.                |
| `JOBS_DIR`              | `/tmp/poddy_jobs`                | Working directory for in-flight jobs.              |
| `TRANSCRIPT_CACHE_DIR`  | `/tmp/poddy_transcript_cache`    | Persisted transcript/audio cache (mount a volume). |
| `MAX_JOBS_IN_MEMORY`    | `64`                             | Bound on retained job state.                       |

---

## Deployment

- **Frontend** → Vercel (`vercel.json` included; SPA rewrites configured).
- **Backend** → Railway / Render via the included `Dockerfile`
  (`railway.toml` provided). Mount a volume at `TRANSCRIPT_CACHE_DIR` for a
  persistent cache across deploys.
