/**
 * Zero-dependency mock of the Poddy backend for UI development & testing.
 *
 * Mirrors the real FastAPI contract exactly:
 *   POST /synthesize            → { job_id, status }
 *   GET  /jobs/:id              → job status payload (stages advance on a timer)
 *   GET|HEAD /audio/:id         → playable WAV (each chapter has its own tone)
 *   GET  /download/:id          → same audio, as an attachment
 *   GET  /health                → { status: "ok" }
 *
 * Usage:
 *   node scripts/mock-backend.mjs           # stages advance every ~1.6s
 *   MOCK_FAST=1 node scripts/mock-backend.mjs  # every 250ms (for tests)
 *   PORT=8000 to change port
 */

import http from 'node:http';

const PORT = Number(process.env.PORT || 8000);
const STAGE_MS = process.env.MOCK_FAST ? 250 : 1600;

const STAGES = [
  'queued',
  'discovering_sources',
  'downloading_transcribing',
  'extracting_clips',
  'building_curriculum',
  'writing_narration',
  'stitching',
];

const SHOW_POOL = [
  'The Signal Path',
  'Deep Dive Radio',
  'The Practitioner\'s Desk',
  'First Principles',
  'The Long Form',
  'Field Notes Weekly',
];

const DEPTH_SOURCES = { quick: 2, standard: 3, deep: 5 };

const jobs = new Map();

function titleFor(topic) {
  const cleaned = topic.replace(/[?.!]+$/g, '').trim();
  if (!cleaned) return 'Your Poddy Episode';
  const words = cleaned.split(/\s+/).slice(0, 8);
  const minor = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs']);
  const titled = words.map((w, i) =>
    i > 0 && minor.has(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1),
  );
  return `${titled.join(' ')}${words.length < cleaned.split(/\s+/).length ? '…' : ', Explained'}`;
}

/**
 * Build chapters for a fake episode. Chapter tones differ so seeking is
 * audibly testable. Returns { chapters, durationMs, plan } where plan maps
 * chapter → tone frequency.
 */
function buildChapters(topic, nSources) {
  const chapters = [];
  const plan = [];
  let t = 0;

  const NARRATION_MS = 6000;
  const CLIP_MS = 14000;

  const push = (type, title, lengthMs, extra = {}, freq = 440) => {
    chapters.push({
      type,
      title,
      start_ms: t,
      end_ms: t + lengthMs,
      source_podcast: extra.source_podcast ?? null,
      source_episode: extra.source_episode ?? null,
      apple_podcasts_url: extra.apple_podcasts_url ?? null,
    });
    plan.push({ start: t, end: t + lengthMs, freq, type });
    t += lengthMs;
  };

  // Pentatonic-ish ladder so consecutive chapters sound distinct.
  const tones = [262, 294, 330, 392, 440, 523, 587, 659];
  let toneIdx = 0;
  const nextTone = () => tones[toneIdx++ % tones.length];

  push('transition', 'Introduction', NARRATION_MS, {}, 220);
  const clipTitles = [
    'The core mechanism',
    'What the research shows',
    'A practitioner\'s protocol',
    'Common myths, debunked',
    'The edge cases',
    'Where the field is heading',
  ];
  for (let i = 0; i < nSources; i++) {
    const show = SHOW_POOL[i % SHOW_POOL.length];
    push('transition', `Into: ${clipTitles[i % clipTitles.length]}`, NARRATION_MS / 2, {}, 220);
    push(
      'clip',
      clipTitles[i % clipTitles.length],
      CLIP_MS,
      {
        source_podcast: show,
        source_episode: `Episode ${40 + i * 3}: ${topic.slice(0, 40)}`,
        apple_podcasts_url: 'https://podcasts.apple.com/us/podcast/example',
      },
      nextTone(),
    );
  }
  push('transition', 'Summary', NARRATION_MS, {}, 220);

  return { chapters, durationMs: t, plan };
}

/** Render the plan into a 16-bit mono WAV buffer. */
function renderWav(plan, durationMs) {
  const RATE = 16000;
  const total = Math.ceil((durationMs / 1000) * RATE);
  const data = Buffer.alloc(total * 2);

  for (const seg of plan) {
    const startS = Math.floor((seg.start / 1000) * RATE);
    const endS = Math.min(total, Math.floor((seg.end / 1000) * RATE));
    const segLen = endS - startS;
    for (let i = 0; i < segLen; i++) {
      const time = i / RATE;
      // Soft attack/release so chapter changes don't click.
      const fade = Math.min(1, i / (RATE * 0.15), (segLen - i) / (RATE * 0.15));
      const wobble = seg.type === 'transition' ? Math.sin(2 * Math.PI * 3 * time) * 0.15 : 0;
      const amp = 0.22 * fade * (1 + wobble);
      const sample =
        amp *
        (Math.sin(2 * Math.PI * seg.freq * time) * 0.8 +
          Math.sin(2 * Math.PI * seg.freq * 2 * time) * 0.2);
      data.writeInt16LE(Math.round(sample * 32767), (startS + i) * 2);
    }
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function scheduleJob(job) {
  let idx = 0;
  const tick = () => {
    if (job.cancelled) return;
    idx += 1;
    if (idx < STAGES.length) {
      job.state.status = STAGES[idx];
      if (STAGES[idx] === 'downloading_transcribing') {
        job.state.source_names = job.sources;
      }
      setTimeout(tick, STAGE_MS);
    } else {
      const { chapters, durationMs, plan } = buildChapters(job.topic, job.sources.length);
      job.audio = renderWav(plan, durationMs);
      job.state = {
        ...job.state,
        status: 'done',
        chapters,
        duration_ms: durationMs,
        sources_used: job.sources,
      };
      console.log(`[mock] job ${job.id} done — ${Math.round(durationMs / 1000)}s of audio, ${chapters.length} chapters`);
    }
  };
  setTimeout(tick, STAGE_MS);
}

function json(res, code, body) {
  const buf = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(buf);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    return res.end();
  }

  if (path === '/health') return json(res, 200, { status: 'ok', service: 'Poddy Mock' });

  if (path === '/synthesize' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = {};
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return json(res, 400, { detail: 'Invalid JSON' });
    }
    const topic = (body.topic || '').trim();
    if (!topic) return json(res, 422, { detail: 'topic is required' });

    const id = Math.random().toString(36).slice(2, 10);
    const nSources = DEPTH_SOURCES[body.depth] || 3;
    const job = {
      id,
      topic,
      sources: SHOW_POOL.slice(0, nSources),
      cancelled: false,
      audio: null,
      state: { status: 'queued', topic, title: titleFor(topic) },
    };
    jobs.set(id, job);
    scheduleJob(job);
    console.log(`[mock] job ${id} started — "${topic}" (${body.depth || 'standard'})`);
    return json(res, 200, { job_id: id, status: 'queued' });
  }

  const jobMatch = path.match(/^\/jobs\/([a-z0-9-]+)$/i);
  if (jobMatch && req.method === 'GET') {
    const job = jobs.get(jobMatch[1]);
    if (!job) return json(res, 404, { detail: 'Job not found' });
    return json(res, 200, job.state);
  }

  const audioMatch = path.match(/^\/(audio|download)\/([a-z0-9-]+)$/i);
  if (audioMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const job = jobs.get(audioMatch[2]);
    if (!job) return json(res, 404, { detail: 'Job not found' });
    if (job.state.status !== 'done' || !job.audio) {
      return json(res, 425, { detail: `Job status: ${job.state.status}` });
    }
    const headers = {
      'Content-Type': 'audio/wav',
      'Content-Length': job.audio.length,
      'Access-Control-Allow-Origin': '*',
    };
    if (audioMatch[1] === 'download') {
      headers['Content-Disposition'] = `attachment; filename="Poddy - ${job.topic.slice(0, 50)}.wav"`;
    }
    res.writeHead(200, headers);
    return res.end(req.method === 'HEAD' ? undefined : job.audio);
  }

  json(res, 404, { detail: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[mock] Poddy mock backend on http://127.0.0.1:${PORT}`);
  console.log(`[mock] stages advance every ${STAGE_MS}ms${process.env.MOCK_FAST ? ' (fast mode)' : ''}`);
});
