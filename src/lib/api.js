/**
 * Thin client for the Poddy backend.
 *
 * All endpoints, polling, and audio caching flow through here so components
 * never touch fetch() directly. Point VITE_BACKEND_URL at a running backend
 * (defaults to the local FastAPI dev server).
 */

export const BACKEND =
  import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

async function requestJson(path, options = {}) {
  const res = await fetch(`${BACKEND}${path}`, options);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `Request failed (${res.status})`);
  }
  return res.json();
}

/** POST /synthesize → { job_id, status } */
export function startSynthesis(topic, depth) {
  return requestJson('/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, depth }),
  });
}

/** GET /jobs/:id → job status payload */
export function fetchJob(jobId) {
  return requestJson(`/jobs/${jobId}`);
}

/** GET /audio/:id → Blob of the finished MP3 */
export async function fetchAudioBlob(jobId) {
  const res = await fetch(`${BACKEND}/audio/${jobId}`);
  if (!res.ok) throw new Error(`Audio fetch failed (${res.status})`);
  return res.blob();
}

/** HEAD /audio/:id → whether the server still has this episode */
export async function audioExistsOnServer(jobId) {
  try {
    const res = await fetch(`${BACKEND}/audio/${jobId}`, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export function streamUrl(jobId) {
  return `${BACKEND}/audio/${jobId}`;
}

export function downloadUrl(jobId) {
  return `${BACKEND}/download/${jobId}`;
}
