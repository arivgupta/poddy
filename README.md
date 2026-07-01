# Poddy

**Any question. One perfect episode.**

Poddy turns a topic you're curious about into a narrated audio documentary —
assembled from the sharpest minutes of the world's best podcasts, ordered like
a great lecture, with chapters and links back to every original episode.

## How it works

```
topic ──► curate sources ──► download + transcribe ──► extract clips
             (GPT-4o)          (RSS + Whisper)           (GPT-4o)
                                                            │
final MP3 ◄── stitch + narrate ◄── order curriculum ◄───────┘
               (edge-tts + ffmpeg)     (GPT-4o)
```

- **Frontend** — React 19 + Vite + Tailwind v4 single-page app ("The Listening
  Room"). Generates nothing itself; it drives the backend job API and plays
  the result. Episodes are cached in the browser (IndexedDB) so your library
  keeps working even after the server has evicted old jobs.
- **Backend** — FastAPI service (`backend/`) that runs the synthesis pipeline
  as background jobs and serves the finished MP3.

## Frontend

```bash
npm install
npm run dev            # expects a backend on http://127.0.0.1:8000
```

Set `VITE_BACKEND_URL` to point somewhere else:

```bash
VITE_BACKEND_URL=https://your-backend.example.com npm run dev
```

### UI development without the real backend

The repo ships with a zero-dependency mock backend that mirrors the real API
contract (same endpoints, statuses, and chapter shapes; audio is generated
WAV tones — each chapter has its own pitch so seeking is audibly testable):

```bash
npm run dev:mock       # starts mock backend :8000 + Vite together
# or separately:
npm run mock           # just the mock backend
MOCK_FAST=1 npm run mock   # stages advance every 250ms (for tests)
```

### Scripts

| Command            | What it does                                    |
| ------------------ | ----------------------------------------------- |
| `npm run dev`      | Vite dev server                                 |
| `npm run dev:mock` | Vite + mock backend, pre-wired together         |
| `npm run mock`     | Mock backend only (port 8000, `PORT` to change) |
| `npm run build`    | Production build to `dist/`                     |
| `npm run lint`     | ESLint                                          |
| `npm run preview`  | Serve the production build locally              |

## Backend

Requires Python 3.11+, `ffmpeg` on PATH, and an OpenAI API key.

```bash
cd backend
pip install -r requirements.txt
OPENAI_API_KEY=sk-... python main.py     # http://127.0.0.1:8000
```

Or with Docker (ffmpeg included):

```bash
cd backend
docker build -t poddy-api .
docker run -p 8000:8000 -e OPENAI_API_KEY=sk-... poddy-api
```

### API

| Endpoint             | Description                                         |
| -------------------- | --------------------------------------------------- |
| `POST /synthesize`   | `{ topic, depth }` → `{ job_id }`; runs in background |
| `GET /jobs/{id}`     | Poll status; includes title, sources, chapters when done |
| `GET /audio/{id}`    | Stream the finished MP3                             |
| `GET /download/{id}` | Same MP3 as an attachment                           |
| `GET /health`        | Healthcheck                                         |

Depths: `quick` (2 sources), `standard` (3), `deep` (5).

### Backend environment variables

| Variable               | Default                       | Purpose                          |
| ---------------------- | ----------------------------- | -------------------------------- |
| `OPENAI_API_KEY`       | — (required)                  | Curation, Whisper transcription  |
| `ALLOWED_ORIGINS`      | `""`                          | Extra CORS origins (comma-sep)   |
| `JOBS_DIR`             | `/tmp/poddy_jobs`             | Working dir for job artifacts    |
| `TRANSCRIPT_CACHE_DIR` | `/tmp/poddy_transcript_cache` | Episode transcript/audio cache   |
| `MAX_JOBS_IN_MEMORY`   | `64`                          | Job-state eviction threshold     |

## Deploy

- **Frontend** → Vercel (`vercel.json` included). Set `VITE_BACKEND_URL` to the
  deployed backend URL.
- **Backend** → Railway/Render via `backend/Dockerfile` (`railway.toml`
  included). Set `OPENAI_API_KEY`, and add your frontend origin to
  `ALLOWED_ORIGINS` if it isn't a `poddy*.vercel.app` domain.
