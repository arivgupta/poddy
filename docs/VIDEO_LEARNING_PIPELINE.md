# Poddy → Personalized Educational **Video** Learning Material

**A deep design + feasibility study.**
Status: design proposal + working proof-of-concept (`backend/video_poc/`). Not yet
wired into the app. Framed as an **educational, personal-use, non-commercial**
capability with copyright / YouTube-ToS / fair-use treated as first-class
constraints.

---

## 0. TL;DR / Executive summary

Poddy today turns a topic into a narrated, multi-source **audio** documentary by
discovering real podcast episodes, transcribing them with Whisper, using an LLM to
pick the best clips, and stitching clips + TTS narration with loudness-normalized
ffmpeg. This document designs the **video** analogue: a topic becomes a coherent
**video lesson** built from the most helpful segments of real **YouTube** videos,
spliced together with an AI "teacher" that introduces the lesson, labels each
source, bridges concepts, inserts retrieval checkpoints, and ends with takeaways.

**Recommended approach (opinionated):**

1. **Stay on the clean side of copyright.** Default to **Creative Commons /
   public-domain** sources only, with **attribution baked in** (on-screen
   lower-thirds + an end-credits manifest), keep everything **personal & local**,
   never re-host. This is a design constraint, not a footnote.
2. **Reuse Poddy's brain.** The discovery → grounded-candidates → LLM-curation →
   boundary-snapping → loudness-mastering machinery transfers almost 1:1; the new
   work is *video* I/O (yt-dlp sections, ffmpeg normalize/concat, on-screen text).
3. **Default to a "no-avatar" teacher.** A TTS-narrated **animated slate /
   kinetic-typography** presenter is the MVP default: $0, no GPU, deterministic,
   and pedagogically *equivalent* for signposting. Treat a talking-head avatar as
   an optional upgrade (recommended: **D-ID hosted API** for a quick polished
   default, **SadTalker** if you want fully local/OSS).
4. **Ship in phases.** MVP = clip-stitch + TTS + title cards/lower-thirds. Then
   captions burn-in + richer signposting/checkpoints. Then the avatar.

**What I'd build first (MVP):** `/synthesize_video` mirroring `/synthesize`, depth
`quick`, **CC-only** discovery, caption-based segment selection reusing
`llm_curator`, per-clip normalize to 720p30, slate+TTS narration, lower-third
attribution, concat + `-16 LUFS` master, served at `/video/{id}`. The
proof-of-concept in `backend/video_poc/` already demonstrates this whole flow in
dry-run.

---

## 1. Feasibility probe results (run on this VM, 2026)

| Check | Result | Notes |
|------|--------|-------|
| `ffmpeg -version` | ✅ **6.1.1** | Built with `libx264`, `libx265`, `libass`, `libfreetype`, `librsvg`, `libfontconfig` |
| `ffprobe` | ✅ 6.1.1 | For duration/stream inspection |
| ffmpeg filters | ✅ all present | `drawtext`, `subtitles`, `ass`, `overlay`, `scale`, `pad`, `setsar`(via setdar/setsar), `fps`, `format`, `xfade`, `concat`, `loudnorm`, `aresample` |
| `yt-dlp` | ⚠️ not preinstalled | `pip install yt-dlp` → **2026.6.9** installs cleanly (lands in `~/.local/bin`) |
| Python | ✅ 3.12.3 | `openai`, `edge-tts` already present from the audio app |
| **yt-dlp live probe** | ❌ **bot-blocked** | `yt-dlp --skip-download ... ytsearch1:...` → **"Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies"** |

**Headline finding:** every *encoding* primitive we need already exists in the
system ffmpeg — the video assembly is a solved problem. The **hard part is
acquisition**: from a datacenter IP, YouTube returns the anti-bot wall even for a
metadata-only request. This shapes the whole architecture (see §2 and §8) — the
realistic deployment is **local / residential**, with cookies, rate-limiting, and
CC-only scope; a cloud box cannot reliably scrape YouTube and shouldn't try.

> The POC therefore **gates all network access behind explicit flags** and ships an
> offline allow-list of genuinely reusable samples (Blender open movies = CC-BY,
> NASA = public domain) so the pipeline is fully demonstrable without scraping.

---

## 2. yt-dlp: capabilities & concrete commands

yt-dlp is the de-facto tool. Relevant capabilities, with commands:

### 2.1 Searching YouTube
- `ytsearchN:QUERY` returns N results (`ytsearch5:how transistors work`). It is a
  shorthand, **not a regex**, and `ytsearchall:` returns everything (don't).
- For filtered search, pass the **YouTube search URL** directly; the web UI's
  filters are encoded in the `sp=` token. The **Creative Commons** filter is
  `sp=EgIwAQ%3D%3D`:
  ```bash
  yt-dlp --playlist-end 5 --skip-download --dump-json \
    'https://www.youtube.com/results?search_query=how+transistors+work&sp=EgIwAQ%253D%253D'
  ```

### 2.2 License filtering (defense in depth)
YouTube has no first-class "license==CC" match field, so combine **two** filters:
1. Search inside the **CC search URL** (above) — filters at the source.
2. Re-check the per-video `license` metadata with `--match-filters`:
   ```bash
   yt-dlp --match-filters "license~='(?i)creative commons'" --skip-download --dump-json URL
   ```
`--match-filters` supports any output-template field with numeric/string operators
(`~=` is a regex match), `&` to AND conditions, and `!field` for presence.

### 2.3 Metadata only (no media bytes)
```bash
yt-dlp --skip-download --dump-json --no-warnings URL      # one JSON object per video
yt-dlp --skip-download --print "%(title)s | %(license)s | %(duration)s" URL
```

### 2.4 Subtitles / captions — **prefer over Whisper for video**
```bash
yt-dlp --skip-download --write-subs --write-auto-subs \
  --sub-langs "en.*" --sub-format vtt URL
yt-dlp --list-subs URL     # see what's actually available first
```
- `--write-subs` = human-authored tracks (better); `--write-auto-subs` = ASR
  auto-captions (almost always present). Request both, prefer manual.
- **Format gotcha (2026):** `json3`/`ttml`/`srv*` have documented breakage
  (`_UnsafeExtensionError`, "Did not get any data blocks"). **Use `vtt`** (or
  `--convert-subs srt`). The POC parses VTT.
- Why prefer captions: free, instant, and their timestamps are authored against the
  *real video timeline*, so cut points line up with what's on screen. Whisper is
  the fallback when captions are missing/poor.

### 2.5 Downloading only a time range (the segment)
```bash
yt-dlp --download-sections "*00:03:10-00:04:30" --force-keyframes-at-cuts \
  -f "bv*[height<=720]+ba/b[height<=720]" -o clip.mp4 URL
```
- `*START-END` (the `*` prefix) = a **time range** (vs a named chapter). Needs
  ffmpeg. `--force-keyframes-at-cuts` makes the cut frame-accurate. This downloads
  *only the teaching segment* — big bandwidth/footprint win versus whole videos.

### 2.6 Formats
- `-F URL` lists formats; `-f "bv*[height<=720]+ba/b[height<=720]"` picks ≤720p
  video + best audio, falling back to a combined ≤720p stream. 720p keeps re-encode
  and storage cheap (see §3).

### 2.7 Rate-limiting / anti-bot reality (important)
- From datacenter IPs YouTube frequently demands **"Sign in to confirm you're not a
  bot"** (we hit this — §1). Mitigations yt-dlp documents: `--cookies-from-browser
  chrome` / `--cookies cookies.txt`, `--sleep-requests`, `--limit-rate 2M`,
  `--retries`, and (newer) PO-token/`--extractor-args youtube:player_client=...`.
  None are guaranteed; YouTube changes regularly and subtitle extraction has had
  recurring breakage in 2026.
- **Design implication:** acquisition must be **rate-limited, retried, cached, and
  ideally run from a residential/local context with the user's own cookies.** Treat
  failures as normal: over-provision candidates and backfill (exactly as the audio
  pipeline already does in `process_sources_parallel`).

### 2.8 Legal / ToS picture (summary; full treatment in §7)
- YouTube ToS §5(B) forbids downloading except via YouTube features or "as permitted
  by applicable law." Third-party downloaders technically violate the ToS **even for
  CC/public-domain videos** (copyright law and platform rules are *separate* systems).
- "Educational" / "non-profit" is **not** an automatic copyright exception. **Fair
  use is a defense, not a permission slip.** The **clean** path = CC / public domain
  + attribution + personal/local use. **Poddy-video defaults to CC-only.**

---

## 3. Video splicing with ffmpeg

The core challenge: clips come from **different videos** with different resolutions,
frame rates, codecs, pixel formats, sample rates, and channel layouts. Concatenating
them naively desyncs or fails. The robust recipe: **normalize every segment to one
canonical profile, then concatenate.**

### 3.1 Canonical master profile (recommended default)
| Param | Value | Why |
|-------|-------|-----|
| Resolution | **1280×720** | Cheap to encode/store, fine for lessons (bump to 1080p later) |
| FPS | **30** | One target so motion is consistent |
| Pixel format | **yuv420p** | Max player compatibility |
| SAR | **1:1** (`setsar=1`) | Avoid stretched frames from odd aspect ratios |
| Video codec | **libx264**, CRF 18–20, `preset medium` | Re-encode loss invisible at CRF≤20 |
| Audio | **AAC 192k, 48 kHz, stereo** | 48 kHz is the video standard (audio app uses 44.1k) |
| Loudness | **−16 LUFS / −1.5 dBTP** | Same target as `audio_engine.py` |

### 3.2 Concat: filter vs demuxer
- **concat demuxer** (`-f concat -i list.txt -c copy`): fast, lossless, but requires
  **identical** codec/resolution/fps/timebase across inputs.
- **concat filter** (`-filter_complex ...concat=n=...`): re-encodes, works with
  **any** inputs, and is where you add transitions.

**Recommended strategy (two-step):**
1. **Per-segment normalize pass** → every clip & narration segment becomes the
   canonical profile:
   ```bash
   ffmpeg -y -i clip_raw.mp4 \
     -vf "scale=1280:720:force_original_aspect_ratio=decrease,\
   pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p" \
     -af "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" \
     -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
     -c:a aac -b:a 192k -ar 48000 -ac 2 clip_norm.mp4
   ```
2. **Concat with the demuxer** (`-c copy`, instant) since all params now match:
   ```bash
   printf "file 'narr_00.mp4'\nfile 'clip_00.mp4'\n..." > list.txt
   ffmpeg -y -f concat -safe 0 -i list.txt -c copy -movflags +faststart premaster.mp4
   ```
   Fall back to the **concat filter** if a segment still differs (belt & suspenders).

This split is the video analogue of `audio_engine.py` extracting + loudnorming each
clip individually before assembly — and it parallelizes well.

### 3.3 On-screen graphics
- **Lower-thirds (source attribution + concept)** via `drawtext`, shown for the
  first ~6s of each clip:
  ```
  drawtext=text='Blender Foundation':fontcolor=white:fontsize=30:x=40:y=h-110:\
  box=1:boxcolor=black@0.55:boxborderw=14:enable='lt(t,6)'
  ```
- **Title / section cards** (intro, "Checkpoint", "Recap", "Takeaways"): a
  `color=` lavfi source + centered `drawtext`, muxed with the narration audio.
- **Caption burn-in** (accessibility): `subtitles=lesson.srt` (libass). Build the
  SRT from the same cue data used for selection.
- **Chapter markers**: write an ffmetadata file with `[CHAPTER]` blocks (from our
  per-segment start/end ms — the audio app already computes these in `chapters`),
  and mux: `ffmpeg -i premaster.mp4 -i chapters.txt -map_metadata 1 -c copy out.mp4`.

### 3.4 Transitions
- Keep MVP **hard cuts** (most reliable; pedagogically fine). Optional polish:
  short `xfade` (e.g. `xfade=transition=fade:duration=0.5:offset=...`) between
  narration→clip via the concat-filter path. Audio gets matching `acrossfade`.
  Hard cuts avoid the offset-bookkeeping complexity of xfade across N segments.

### 3.5 Loudness
- Reuse `audio_engine.py`'s **two-pass loudnorm** philosophy: per-segment
  normalize, then a final whole-file master to lock integrated −16 LUFS / −1.5 dBTP.
  For video, run the master with `-c:v copy` (don't re-encode the picture again).

---

## 4. AI avatar "teacher": options & recommendation

The teacher narrates intros/bridges/checkpoints/recap/outro. Two families:

### 4.1 Open-source (local, GPU)
| Tool | Input | Strength | Lip-sync | License | Compute |
|------|-------|----------|----------|---------|---------|
| **Wav2Lip** | face video + audio | accurate mouth on existing footage | Very high (mouth only) | research/check repo | ~4GB VRAM |
| **SadTalker** | **single photo** + audio | full talking head from one image, blinks/head pose | High | **Apache-2.0** | 6–8GB VRAM, ~0.3s/frame on A100 |
| **LivePortrait** | portrait + driver | photorealistic, emotion-aware | High | OSS (check repo) | GPU-heavy |
| **Hallo / MuseTalk** | image/video + audio | newer, high quality | High | check repo | GPU-heavy |

OSS = $0 marginal cost but needs an NVIDIA GPU, setup (checkpoints ~2GB), and adds
real latency. **SadTalker** is the pragmatic OSS pick (single portrait, permissive
license, decent quality).

### 4.2 Hosted APIs
| Service | API access | ~Cost | Notes |
|---------|-----------|-------|-------|
| **D-ID** | **all paid plans**, dev-friendly | **~$0.02/sec** PAYG (~$1.20/min); Lite ~$6/mo | Cheapest + simplest talking-head API; photo→talking head |
| **HeyGen** | Pro+ | ~$0.50–2.00/min (credits) | Best-looking avatars; credit system drains fast |
| **Synthesia** | **Enterprise only** | $18–89/mo plans | Polished, but API needs sales/Enterprise — poor fit for a personal POC |

### 4.3 Recommendation
- **Default = NO avatar.** Use a **TTS-narrated animated slate / kinetic typography**
  presenter. Rationale: for *signposting* (intro/label/bridge/recap) a talking head
  adds cost, latency, GPU/keys, and **uncanny-valley risk** without improving
  learning outcomes — Mayer's evidence is that on-screen agents help via *voice and
  signaling*, not photoreal faces. The slate is $0, deterministic, instant, and
  accessible. This is the MVP.
- **Optional upgrade = D-ID hosted** for a quick polished talking head (cheapest,
  dev-friendly API), or **SadTalker** if you require fully local/offline + OSS.
- The POC encodes exactly this: `--avatar none` (implemented), `did`/`sadtalker`
  (documented stubs behind the same `NarrationRenderer` interface).

---

## 5. Signposting & pedagogy — making it real *learning material*

Grounding: **Mayer's Cognitive Theory of Multimedia Learning (CTML)** — reduce
*extraneous* load, manage *essential* load, foster *generative* processing.

The teacher script (see `video_poc/pedagogy.py`) implements:

1. **Intro / pre-training** (~30s): name the 2–3 key ideas and the goal *before* the
   first clip, so the learner has a schema to hang detail on.
2. **Segmenting**: the lesson is inherently chunked into clips; the teacher **pauses
   and signposts** between them (CTML segmenting principle → learner-paced chunks).
3. **Signaling + attribution**: each clip gets a spoken label *and* an on-screen
   lower-third naming the **source** and the **concept**. (Doubles as our CC
   attribution requirement.)
4. **Bridging**: "That explained the *why*; this next clip from *X* shows the *how*"
   — explicit connective tissue so clips feel like one lesson, not a playlist.
5. **Retrieval checkpoints** (generative processing / testing effect): after ~every
   2nd clip, a short prompt — "Pause: can you explain *Y* in your own words?" — then
   a recap before takeaways. Retrieval practice is one of the most robust
   learning-science findings.
6. **Worked examples**: prefer segments where a teacher *works through* an example
   (the selection prompt already favors "mechanism / worked example / concrete
   point" over intros).
7. **Recap + takeaways**: restate key ideas; end with **"learning-path forks"** —
   2–3 suggested follow-up lessons to go deeper. This ties directly into the audio
   side's "fork/extend into a learning path" idea: each fork is just another
   `/synthesize_video` topic.
8. **Kids mode**: simpler vocabulary, warmer/playful voice, shorter segments,
   stricter content filtering (see §7).

The narration writer mirrors `llm_curator.write_transitions_batch` (intro +
per-clip transitions + outro), extended with checkpoints/recap and the learning-path.

---

## 6. Architecture & integration

### 6.1 Component diagram

```
                         ┌─────────────────────────────────────────────────┐
  POST /synthesize_video │  topic, depth, kids, avatar                      │
        │                └─────────────────────────────────────────────────┘
        ▼
   ┌──────────┐   reuse   ┌────────────────────────────────────────────────┐
   │ job mgr  │◄──────────│ main.py jobs{} + threading + /jobs/{id} polling  │
   └────┬─────┘           └────────────────────────────────────────────────┘
        ▼
 ┌───────────────┐  ┌──────────────┐  ┌────────────────┐  ┌──────────────────┐
 │1 DISCOVERY    │→ │2 CAPTIONS     │→ │3 SELECTION      │→ │4 ORDER (balanced)│
 │ yt-dlp CC     │  │ yt-dlp VTT    │  │ LLM + SNAP      │  │ cross-source     │
 │ (discovery.py)│  │(transcript.py)│  │ (selection.py / │  │ (pipeline.py)    │
 │  ~discovery   │  │  ~ingestion   │  │  llm_curator)   │  │  ~llm_curator    │
 └───────────────┘  └──────────────┘  └────────────────┘  └────────┬─────────┘
                                                                    ▼
 ┌────────────────────────┐   ┌───────────────────────┐   ┌───────────────────┐
 │5 TEACHER SCRIPT         │→  │6 RENDER NARRATION      │   │7 CUT + NORMALIZE   │
 │ intro/bridge/checkpoint │   │ slate+TTS (default) /  │   │ yt-dlp --download- │
 │ recap/takeaways/forks   │   │ SadTalker / D-ID       │   │ sections → ffmpeg  │
 │ (pedagogy.py)           │   │ (avatar.py, edge-tts)  │   │ normalize (cards/  │
 │  ~write_transitions     │   │  ~audio_engine TTS     │   │ video_engine.py)   │
 └────────────────────────┘   └───────────┬───────────┘   └─────────┬─────────┘
                                           ▼                         ▼
                                  ┌───────────────────────────────────────────┐
                                  │8 CONCAT (demuxer -c copy) + LOUDNESS MASTER │
                                  │  + chapters + (opt) caption burn-in        │
                                  │  (video_engine.py)  ~audio_engine stitch    │
                                  └───────────────────────┬───────────────────┘
                                                          ▼
                                           GET /video/{id}  →  lesson.mp4
```

### 6.2 New backend modules (proposed, mirrors `services/`)
- `services/video_discovery.py` — yt-dlp CC search → ranked candidates (mirror
  `discovery.py`'s grounded-candidates + LLM-rank + diversity).
- `services/video_captions.py` — yt-dlp VTT fetch → Poddy transcript format (so
  `llm_curator.parse_transcript_segments` works unchanged).
- `services/video_curator.py` — thin wrapper reusing `llm_curator` selection +
  `snap_clip_to_segments` + ordering/dedup.
- `services/video_engine.py` — cut/normalize/concat/master + cards/lower-thirds.
- The POC under `backend/video_poc/` is the runnable reference for all of these.

### 6.3 Endpoint shape (mirror the audio flow exactly)
```
POST /synthesize_video {topic, depth, kids, avatar}  -> {job_id}
GET  /jobs/{job_id}                                   -> {status, chapters, ...}
GET  /video/{job_id}                                  -> lesson.mp4 (FileResponse)
GET  /download/{job_id}                               -> attachment
```
Statuses extend the existing set: `discovering_sources → fetching_captions →
selecting_segments → ordering → writing_script → rendering_narration →
cutting_clips → assembling → done`. Reuse `jobs{}`, `_jobs_lock`, `_evict_old_jobs`,
`_get_duration_ms` verbatim.

### 6.4 Reuse map (what transfers from the audio app)
| Audio asset | Video reuse |
|-------------|-------------|
| `discovery.discover_episode_candidates` (grounded search + LLM rank + diversity) | same pattern over yt-dlp CC results |
| `llm_curator.extract_clips_from_source` + `snap_clip_to_segments` | **verbatim** — captions → transcript format → snap to cue boundaries |
| `llm_curator.order_and_deduplicate` (source-balanced, diversity guarantee) | **verbatim** |
| `llm_curator.write_transitions_batch` | extended into `pedagogy.build_lesson_plan` |
| `audio_engine` two-pass −16 LUFS loudnorm | **verbatim** (audio of the video) |
| `audio_engine.generate_tts_batch` (edge-tts) | narration audio for slate/avatar |
| `main.py` job/threading/eviction/endpoints | **verbatim** shape |
| `process_sources_parallel` over-provision + backfill | critical for flaky yt-dlp |

### 6.5 Storage & size implications
- Audio MP3 lessons are a few MB. **Video is ~50–100× larger.** A ~12-min 720p
  lesson ≈ **120–250 MB**; intermediates (raw sections + normalized segments) can be
  2–3× that during a job.
- The current app runs on small boxes (note the `MAX_JOBS_IN_MEMORY` / 512 MB
  comments). Implications:
  - **Download only sections** (§2.5), not whole videos.
  - **Delete raw segments** immediately after normalize (the audio app already
    deletes raw/trim files — do the same).
  - Stronger eviction; consider streaming the result to object storage (S3/R2) and
    serving via signed URL instead of local disk.
  - Cap concurrency: video re-encode is CPU-heavy; 1–2 jobs at a time.

### 6.6 Phased rollout
- **Phase 0 (this POC):** dry-run planner + offline samples + all command paths.
- **Phase 1 (MVP):** `/synthesize_video`, CC-only discovery, caption selection,
  normalize→concat, **slate+TTS** narration, lower-third attribution, −16 LUFS
  master, chapters. Hard cuts only.
- **Phase 2:** caption burn-in (accessibility), richer signposting + checkpoints/
  recap, learning-path forks in the UI, kids mode + safety filters.
- **Phase 3:** avatar (D-ID default / SadTalker local), optional xfade transitions,
  1080p option, object-storage offload.

### 6.7 Cost & compute analysis (per ~12-min lesson, depth=standard, 3 sources)
| Item | MVP (slate) | + D-ID avatar |
|------|-------------|---------------|
| LLM (selection + script, gpt-4o/4o-mini) | ~$0.05–0.20 | same |
| Whisper | $0 (use captions) | $0 |
| TTS (edge-tts) | **$0** (free) | $0 (D-ID can TTS too) |
| Avatar | $0 (slate) | ~2 min narration × $1.20/min ≈ **$2.40** |
| Compute (ffmpeg re-encode) | minutes of CPU; no GPU | + API latency/polling |
| **Marginal $ / lesson** | **~$0.05–0.20** | **~$2.50–3.00** |
| Wall-clock | dominated by yt-dlp download + re-encode (a few min) | + avatar render |

The **MVP is essentially free per lesson** (LLM tokens only) and GPU-free — a strong
argument for shipping slate-first.

---

## 7. Risks / ethics / safety

### 7.1 Copyright & YouTube ToS (the #1 risk)
- **ToS:** downloading via third-party tools violates YouTube's ToS *regardless of
  copyright status*. There is no "personal offline" carve-out in the ToS.
- **Copyright:** "educational/non-profit" is **not** an automatic exception; fair use
  is a **defense decided by courts**, not a usage right. Even seconds of protected
  content can infringe.
- **Mitigations (the design's spine):**
  - **CC / public-domain only by default** (`require_cc_license=True`); CC-BY is
    reusable **with attribution**.
  - **Attribution baked in**: per-clip lower-third (source + author) + an
    end-credits manifest (title, author, source URL, license, the exact timecodes
    used) — satisfying CC-BY terms.
  - **Personal & local**: generate for yourself/your kids, watch locally; **never
    re-host or distribute**, especially non-CC output. Document this loudly (the POC
    README does).
  - Prefer **transformative** assembly (short segments + substantial new teaching
    narration) over wholesale copying — strengthens any fair-use posture *if* a
    non-CC path is ever enabled (not recommended).
  - Keep it **opt-in & rate-limited**; respect the source. Provide a clear
    "this may violate ToS / only you can assess fair use" disclaimer.

### 7.2 Acquisition fragility (operational)
- Anti-bot blocks (we hit one), subtitle-format breakage, and frequent YouTube
  changes mean acquisition will fail intermittently. Mitigate with over-provisioned
  candidates + backfill (reuse `process_sources_parallel`), caching transcripts &
  segments (reuse `transcript_cache`), `--sleep-requests`/`--limit-rate`, user
  cookies, and graceful per-source skips.

### 7.3 Child-safety / age-appropriate content (kids mode)
- Sources for kids must be filtered: restrict to **vetted educational channels /
  allow-lists**, apply `--age-limit`, and **LLM-screen** both the candidate metadata
  *and* the caption transcript for inappropriate content **before** download.
- Screen the **generated script** too. Prefer a human-in-the-loop review for kids
  output. Default kids mode to a **curated allow-list** rather than open search.

### 7.4 Misinformation guardrails
- Clips are real human claims that can be wrong/outdated. Mitigations: prefer
  reputable sources (the curation prompt already weights credibility), keep
  **attribution visible** so claims are traceable, and have the teacher frame
  content as "according to *source*…" rather than asserting it as fact. Consider an
  LLM "does this segment make strong factual claims that need a caveat?" pass.

### 7.5 Accessibility
- **Burn-in (or sidecar) captions** for all narration and, where licensing allows,
  the source clips. Maintain readable contrast on cards/lower-thirds. Provide a
  text transcript of the whole lesson (we already have all cue + script text).

### 7.6 Privacy / likeness (avatar)
- A talking-head avatar must use a portrait you have rights to (licensed stock,
  generated, or your own). Don't synthesize real people's likenesses without
  consent. Slate default sidesteps this entirely.

---

## 8. What I'd build first (crisp MVP spec)

> Goal: smallest thing that produces a genuinely useful, attribution-clean, local
> video lesson — no GPU, near-zero marginal cost.

1. `POST /synthesize_video {topic, depth:"quick", kids:false}` → `{job_id}`; reuse
   the job/threading/eviction machinery from `main.py`.
2. **Discovery:** yt-dlp **CC-filtered** search (URL `sp=EgIwAQ%3D%3D` +
   `--match-filters license~='(?i)creative commons'`), metadata-only, LLM-ranked for
   credibility + source diversity (mirror `discovery.py`). Over-provision + backfill.
3. **Captions:** yt-dlp `--write-auto-subs --sub-format vtt`; parse → Poddy
   transcript format. Whisper fallback only if no captions.
4. **Selection:** reuse `llm_curator.extract_clips_from_source` + **`snap_clip_to_
   segments`** to land cuts on real cue boundaries (no mid-sentence cuts).
5. **Order:** reuse `order_and_deduplicate` (source-balanced, diversity-guaranteed).
6. **Script:** `pedagogy.build_lesson_plan` (intro + per-clip bridges w/ source
   labels + one recap + takeaways + learning-path forks). Checkpoints in Phase 2.
7. **Narration:** **slate + edge-tts** (`avatar.SlateRenderer`), `-16 LUFS`.
8. **Clips:** `yt-dlp --download-sections` per segment → ffmpeg **normalize** to
   720p30/yuv420p/48k + **lower-third attribution**; delete raws immediately.
9. **Assemble:** concat demuxer (`-c copy`) → whole-file **−16 LUFS master** →
   chapters from segment timings. Serve at `GET /video/{job_id}`.
10. **Caveats UI:** show the CC/ToS disclaimer + the attribution manifest in credits.

The POC in `backend/video_poc/` already runs this exact flow end-to-end in dry-run
(`python3 video_poc/main.py --topic "..." --depth quick`), printing every command it
would execute.

---

## 9. Sources

**yt-dlp**
- yt-dlp README / options (match-filters, download-sections, subtitles): https://github.com/yt-dlp/yt-dlp
- yt-dlp 2026.6.9 (PyPI): https://pypi.org/project/yt-dlp/2026.6.9/
- ytsearch / search-URL syntax (issue #6035): https://github.com/yt-dlp/yt-dlp/issues/6035
- Subtitle extraction guide + 2026 format breakage (json3/ttml): https://skipthewatch.com/blog/yt-dlp-youtube-subtitles

**ffmpeg video assembly**
- Concat demuxer vs filter: https://ffmpeg-cookbook.com/en/articles/concat-video/
- Concatenation handbook (normalize scale/pad/setsar/fps/format): https://github.com/endcycles/ffmpeg-engineering-handbook/blob/main/docs/operations/concatenation.md
- Concatenating different attributes (SO): https://stackoverflow.com/questions/57366845/how-to-concatenate-videos-in-ffmpeg-with-different-attributes
- Baeldung concat overview: https://www.baeldung.com/linux/ffmpeg-video-concatenation

**Avatars**
- OSS comparison (SadTalker/Wav2Lip/LivePortrait, GPU needs, licenses): https://www.pixazo.ai/blog/best-open-source-lip-sync-models
- Linly-Talker (pipeline + hardware/license table): https://www.solosoft.dev/post/linly-talker-digital-human-2026/
- SadTalker (Apache-2.0, ~0.3s/frame A100): https://opentools.ai/tools/sadtalker
- AI lip-sync 2026 (Wav2Lip ~4GB VRAM, SadTalker 6GB+): https://apatero.com/blog/ai-lip-sync-technology-realistic-talking-characters-2026
- D-ID/HeyGen/Synthesia API + pricing: https://www.comparegen.ai/blog/synthesia-vs-heygen-vs-d-id-2026 , https://videoai.me/blog/d-id-vs-heygen-vs-synthesia-vs-colossyan-comparison-2026 , https://khaby.ai/features/api-access-comparison/

**Copyright / ToS / fair use**
- YouTube "Common copyright myths" (educational ≠ exception; CC-BY needs attribution): https://support.google.com/youtube/answer/2797449
- YouTube "Fair use" (defense, only courts decide): https://support.google.com/youtube/answer/9783148
- YouTube Terms of Service (§ download restrictions): https://www.youtube.com/static?template=terms
- Downloading legality analysis (ToS vs copyright are separate; CC/PD are clean): https://vidpickr.com/blog/is-youtube-downloading-legal-2026 , https://legalclarity.org/how-to-download-youtube-videos-without-copyright-issues/

**Learning science**
- Mayer, Cognitive Theory of Multimedia Learning (segmenting, pre-training, generative): https://link.springer.com/article/10.1007/s10648-023-09842-1
- Mayer's 12 principles (segmenting, signaling, personalization): https://educationaltechnology.net/mayers-principles-of-multimedia-learning/
- Applying CTML w/ common tools (retrieval/generative): https://pmc.ncbi.nlm.nih.gov/articles/PMC9762622/
- UWaterloo CEL honeycomb (segmenting, worked examples, testing effect): https://cms.cel.uwaterloo.ca/honeycomb/useful.aspx
```
