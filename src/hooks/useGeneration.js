import { useCallback, useEffect, useRef, useState } from 'react';
import { startSynthesis, fetchJob, fetchAudioBlob, streamUrl } from '../lib/api';
import { saveAudioBlob } from '../lib/audioStore';

const ACTIVE_JOB_KEY = 'poddy_active_job';
const POLL_MS = 2000;
const MAX_CONSECUTIVE_POLL_FAILURES = 6;

const TERMINAL = new Set(['done', 'error']);

function readActiveJob() {
  try {
    return JSON.parse(sessionStorage.getItem(ACTIVE_JOB_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeActiveJob(job) {
  try {
    if (job) sessionStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(job));
    else sessionStorage.removeItem(ACTIVE_JOB_KEY);
  } catch {
    /* session storage unavailable */
  }
}

/**
 * Owns the full lifecycle of one generation job: submit, poll, resume after
 * a refresh, download + cache the finished audio, and surface errors.
 *
 * `generation` is null when idle, otherwise:
 *   { jobId, topic, depth, title, status, sourceNames, startedAt, error }
 */
export function useGeneration({ onComplete, onFailed, onResume }) {
  const [generation, setGeneration] = useState(null);

  const pollRef = useRef(null);
  const failuresRef = useRef(0);
  const callbacksRef = useRef({ onComplete, onFailed, onResume });
  useEffect(() => {
    callbacksRef.current = { onComplete, onFailed, onResume };
  }, [onComplete, onFailed, onResume]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const finishJob = useCallback(async (jobId, data, meta) => {
    const title = data.title || meta.topic;
    const entry = {
      jobId,
      topic: data.topic || meta.topic,
      title,
      chapters: data.chapters || [],
      sourcesUsed: data.sources_used || [],
      durationMs: data.duration_ms || 0,
      depth: meta.depth || 'standard',
      savedAt: Date.now(),
    };

    let blobUrl = null;
    try {
      const blob = await fetchAudioBlob(jobId);
      await saveAudioBlob(jobId, blob).catch(() => {});
      blobUrl = URL.createObjectURL(blob);
    } catch {
      // Fall back to streaming straight from the server.
      blobUrl = streamUrl(jobId);
    }

    writeActiveJob(null);
    setGeneration(null);
    callbacksRef.current.onComplete?.(entry, blobUrl);
  }, []);

  const failJob = useCallback((message) => {
    writeActiveJob(null);
    stopPolling();
    setGeneration((prev) => {
      const failed = prev ? { ...prev, status: 'error', error: message } : null;
      if (failed) callbacksRef.current.onFailed?.(failed, message);
      return failed;
    });
  }, [stopPolling]);

  const pollJob = useCallback((jobId, meta) => {
    stopPolling();
    failuresRef.current = 0;

    pollRef.current = setInterval(async () => {
      let data;
      try {
        data = await fetchJob(jobId);
        failuresRef.current = 0;
      } catch (err) {
        failuresRef.current += 1;
        const gone = /not found/i.test(String(err?.message));
        if (gone) {
          failJob('The studio restarted and lost this job. Please start it again.');
        } else if (failuresRef.current >= MAX_CONSECUTIVE_POLL_FAILURES) {
          failJob('Lost connection to the studio. Check your network and try again.');
        }
        return;
      }

      if (data.status === 'done') {
        stopPolling();
        finishJob(jobId, data, meta);
        return;
      }
      if (data.status === 'error') {
        failJob(data.error || 'Something went wrong while producing your episode.');
        return;
      }

      setGeneration((prev) => {
        if (!prev || prev.jobId !== jobId) return prev;
        return {
          ...prev,
          status: data.status || prev.status,
          title: data.title || prev.title,
          sourceNames: data.source_names || prev.sourceNames,
        };
      });
    }, POLL_MS);
  }, [stopPolling, finishJob, failJob]);

  const start = useCallback(async (topic, depth) => {
    const meta = { topic, depth, startedAt: Date.now() };
    setGeneration({
      jobId: null,
      topic,
      depth,
      title: '',
      status: 'queued',
      sourceNames: [],
      startedAt: meta.startedAt,
      error: null,
    });

    let jobId;
    try {
      const res = await startSynthesis(topic, depth);
      jobId = res.job_id;
    } catch {
      setGeneration(null);
      throw new Error(
        'Could not reach the Poddy studio. Make sure the backend is running, then try again.',
      );
    }

    writeActiveJob({ jobId, ...meta });
    setGeneration((prev) => (prev ? { ...prev, jobId } : prev));
    pollJob(jobId, meta);
    return jobId;
  }, [pollJob]);

  const cancel = useCallback(() => {
    stopPolling();
    writeActiveJob(null);
    setGeneration(null);
  }, [stopPolling]);

  const dismissError = useCallback(() => {
    setGeneration((prev) => (prev && prev.status === 'error' ? null : prev));
  }, []);

  // Resume a job that survived a page refresh (job state lives on the server).
  useEffect(() => {
    const saved = readActiveJob();
    if (!saved?.jobId) return;

    let alive = true;
    (async () => {
      try {
        const data = await fetchJob(saved.jobId);
        if (!alive) return;
        if (TERMINAL.has(data.status)) {
          if (data.status === 'done') {
            finishJob(saved.jobId, data, saved);
          } else {
            writeActiveJob(null);
          }
          return;
        }
        setGeneration({
          jobId: saved.jobId,
          topic: saved.topic || data.topic || '',
          depth: saved.depth || 'standard',
          title: data.title || '',
          status: data.status || 'queued',
          sourceNames: data.source_names || [],
          startedAt: saved.startedAt || Date.now(),
          error: null,
        });
        callbacksRef.current.onResume?.(saved);
        pollJob(saved.jobId, saved);
      } catch {
        if (alive) writeActiveJob(null);
      }
    })();

    return () => {
      alive = false;
      stopPolling();
    };
    // Mount-only: we intentionally resume exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isActive = Boolean(generation && !TERMINAL.has(generation.status) && generation.status !== 'error');

  // Warn before closing the tab while an episode is in production.
  useEffect(() => {
    if (!isActive) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isActive]);

  return { generation, isActive, start, cancel, dismissError };
}
