import { useCallback, useState } from 'react';
import { deleteAudioBlob } from '../lib/audioStore';
import { clearPosition } from '../lib/progressStore';

const LIBRARY_KEY = 'poddy_library';

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(entries) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable — library becomes session-only */
  }
}

/** Saved episodes, newest last (render reversed). Backed by localStorage. */
export function useLibrary() {
  const [entries, setEntries] = useState(load);

  const upsert = useCallback((entry) => {
    setEntries((prev) => {
      const next = [...prev.filter((e) => e.jobId !== entry.jobId), entry];
      persist(next);
      return next;
    });
  }, []);

  const remove = useCallback(async (jobId) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.jobId !== jobId);
      persist(next);
      return next;
    });
    clearPosition(jobId);
    try {
      await deleteAudioBlob(jobId);
    } catch {
      /* blob may already be gone */
    }
  }, []);

  return { entries, upsert, remove };
}
