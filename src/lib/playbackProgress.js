// Per-cast playback position so listeners can pick up exactly where they left
// off — the single most-requested behaviour in any podcast client.
// Stored in localStorage keyed by jobId: { ms, dur, at }.

const KEY = 'poddy_progress';
const NEAR_END_MS = 15_000;   // treat the final 15s as "finished"
const MIN_RESUME_MS = 8_000;  // don't bother resuming the first few seconds

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}

function writeAll(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); }
  catch { /* storage full or unavailable */ }
}

export function saveProgress(jobId, ms, dur) {
  if (!jobId) return;
  const map = readAll();
  if (dur && ms >= dur - NEAR_END_MS) {
    delete map[jobId]; // finished — clear so it starts fresh next time
  } else {
    map[jobId] = { ms, dur: dur || 0, at: Date.now() };
  }
  writeAll(map);
}

export function getProgress(jobId) {
  if (!jobId) return null;
  return readAll()[jobId] || null;
}

// Resume point in ms, or 0 if there's nothing meaningful to resume.
export function getResumeMs(jobId) {
  const p = getProgress(jobId);
  if (!p) return 0;
  if (p.ms < MIN_RESUME_MS) return 0;
  if (p.dur && p.ms >= p.dur - NEAR_END_MS) return 0;
  return p.ms;
}

// Completion fraction 0..1 for a progress bar, or 0.
export function getProgressFraction(jobId, fallbackDur = 0) {
  const p = getProgress(jobId);
  if (!p) return 0;
  const dur = p.dur || fallbackDur;
  if (!dur) return 0;
  return Math.max(0, Math.min(1, p.ms / dur));
}

export function clearProgress(jobId) {
  if (!jobId) return;
  const map = readAll();
  delete map[jobId];
  writeAll(map);
}
