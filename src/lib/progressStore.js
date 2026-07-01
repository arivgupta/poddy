/** Remembers where you left off in each episode (localStorage). */

const KEY = 'poddy_positions_v1';
const MAX_ENTRIES = 200;

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function getPosition(jobId) {
  const ms = readAll()[jobId];
  return Number.isFinite(ms) ? ms : 0;
}

export function savePosition(jobId, ms) {
  if (!jobId) return;
  try {
    const all = readAll();
    all[jobId] = Math.max(0, Math.round(ms));
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete all[k];
    }
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full or unavailable — non-critical */
  }
}

export function clearPosition(jobId) {
  try {
    const all = readAll();
    delete all[jobId];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* non-critical */
  }
}
