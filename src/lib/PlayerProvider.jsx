import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { generateArtworkDataUrl } from './artwork';
import { saveProgress, getResumeMs } from './playbackProgress';
import { SPEEDS, SKIP_SECONDS } from './playerConstants';
import { PlayerContext } from './playerContext';

const AUTOPLAY_KEY = 'poddy_autoplay';

function loadAutoplay() {
  try { return localStorage.getItem(AUTOPLAY_KEY) !== '0'; } catch { return true; }
}

/**
 * Owns the single <audio> element and ALL playback state so audio keeps
 * playing across view changes (full player ↔ library ↔ mini-player) and can
 * roll from one cast into the next.
 *
 * `resolveAudioUrl(entry)` → Promise<string|null> turns a library entry into a
 * playable URL (IndexedDB blob or server stream). Provided by the app shell.
 */
export function PlayerProvider({ resolveAudioUrl, children }) {
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const lastSaveRef = useRef(0);
  const resumedRef = useRef(false);
  const sleepTimerRef = useRef(null);

  const [track, setTrack]           = useState(null);   // { jobId, topic, title, audioUrl, chapters, sourcesUsed, durationMs }
  const [isPlaying, setIsPlaying]   = useState(false);
  const [currentMs, setCurrentMs]   = useState(0);
  const [totalMs, setTotalMs]       = useState(0);
  const [activeChapterIdx, setActiveChapterIdx] = useState(0);
  const [speed, setSpeed]           = useState(1);
  const [volume, setVolume]         = useState(1);
  const [muted, setMuted]           = useState(false);
  const [resumedAt, setResumedAt]   = useState(0);
  const [autoplay, setAutoplayState] = useState(loadAutoplay);

  const [queue, setQueue]           = useState([]);     // ordered library entries
  const [queueIndex, setQueueIndex] = useState(-1);

  const [sleepEndsAt, setSleepEndsAt]       = useState(null);
  const [sleepRemaining, setSleepRemaining] = useState(0);

  const chapters = useMemo(() => track?.chapters || [], [track]);

  const setAutoplay = useCallback((v) => {
    setAutoplayState(v);
    try { localStorage.setItem(AUTOPLAY_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  // ── Apply speed/volume to the element ──────────────────────────────────────
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed, track]);
  useEffect(() => {
    if (audioRef.current) { audioRef.current.volume = volume; audioRef.current.muted = muted; }
  }, [volume, muted, track]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }, []);

  const skip = useCallback((s) => {
    const a = audioRef.current; if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.currentTime + s, a.duration || 0));
  }, []);

  const seekToMs = useCallback((ms, play = false) => {
    const a = audioRef.current; if (!a) return;
    a.currentTime = Math.max(0, ms / 1000);
    setCurrentMs(ms);
    if (play) a.play().catch(() => {});
  }, []);

  const jumpToChapter = useCallback((ch) => seekToMs(ch.start_ms, true), [seekToMs]);

  const prevChapter = useCallback(() => {
    const a = audioRef.current; if (!a || !chapters.length) return;
    const nowMs = a.currentTime * 1000;
    const cur = chapters[activeChapterIdx];
    if (cur && nowMs - cur.start_ms > 3000) seekToMs(cur.start_ms);
    else if (activeChapterIdx > 0) seekToMs(chapters[activeChapterIdx - 1].start_ms);
    else seekToMs(0);
  }, [chapters, activeChapterIdx, seekToMs]);

  const nextChapter = useCallback(() => {
    const a = audioRef.current; if (!a || !chapters.length) return;
    if (activeChapterIdx < chapters.length - 1) seekToMs(chapters[activeChapterIdx + 1].start_ms);
    else seekToMs((a.duration || 0) * 1000);
  }, [chapters, activeChapterIdx, seekToMs]);

  const cycleSpeed = useCallback((dir) => {
    setSpeed((prev) => {
      const i = SPEEDS.indexOf(prev);
      return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 1 : i) + dir))];
    });
  }, []);

  const toggleMute = useCallback(() => setMuted((v) => !v), []);
  const nudgeVolume = useCallback((delta) => {
    setMuted(false);
    setVolume((v) => Math.max(0, Math.min(1, Math.round((v + delta) * 100) / 100)));
  }, []);

  // ── Loading tracks + queue ─────────────────────────────────────────────────
  const loadEntry = useCallback(async (entry, { autoplayOnLoad = true } = {}) => {
    if (!entry) return false;
    const url = await resolveAudioUrl(entry);
    if (!url) return false;
    // Revoke the previous object URL once we have a replacement.
    if (objectUrlRef.current && objectUrlRef.current !== url) {
      try { URL.revokeObjectURL(objectUrlRef.current); } catch { /* ignore */ }
    }
    objectUrlRef.current = url.startsWith('blob:') ? url : null;
    resumedRef.current = false;
    setTrack({
      jobId: entry.jobId,
      topic: entry.topic,
      title: entry.title,
      chapters: entry.chapters || [],
      sourcesUsed: entry.sourcesUsed || [],
      durationMs: entry.durationMs || 0,
      audioUrl: url,
    });
    setCurrentMs(0);
    setTotalMs(entry.durationMs || 0);
    setActiveChapterIdx(0);
    if (autoplayOnLoad) {
      // play() after the new src loads; onLoaded handles resume + playback.
      requestAnimationFrame(() => audioRef.current?.play().catch(() => {}));
    }
    return true;
  }, [resolveAudioUrl]);

  // Start a track and seed the up-next queue (ordered list of entries).
  const play = useCallback(async (entry, fullQueue = []) => {
    const q = fullQueue.length ? fullQueue : [entry];
    const idx = Math.max(0, q.findIndex((e) => e.jobId === entry.jobId));
    setQueue(q);
    setQueueIndex(idx);
    return loadEntry(entry, { autoplayOnLoad: true });
  }, [loadEntry]);

  const hasNextTrack = queueIndex >= 0 && queueIndex < queue.length - 1;
  const hasPrevTrack = queueIndex > 0;

  const playNextTrack = useCallback(() => {
    if (!hasNextTrack) return false;
    const nextIdx = queueIndex + 1;
    setQueueIndex(nextIdx);
    return loadEntry(queue[nextIdx], { autoplayOnLoad: true });
  }, [hasNextTrack, queueIndex, queue, loadEntry]);

  const playPrevTrack = useCallback(() => {
    if (!hasPrevTrack) return false;
    const prevIdx = queueIndex - 1;
    setQueueIndex(prevIdx);
    return loadEntry(queue[prevIdx], { autoplayOnLoad: true });
  }, [hasPrevTrack, queueIndex, queue, loadEntry]);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) { a.pause(); a.removeAttribute('src'); a.load(); }
    if (objectUrlRef.current) { try { URL.revokeObjectURL(objectUrlRef.current); } catch { /* ignore */ } objectUrlRef.current = null; }
    setTrack(null);
    setIsPlaying(false);
    setQueue([]);
    setQueueIndex(-1);
    setCurrentMs(0);
    setTotalMs(0);
  }, []);

  // ── Audio element event wiring ─────────────────────────────────────────────
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const jobId = track?.jobId;

    const onTime = () => {
      const ms = a.currentTime * 1000;
      setCurrentMs(ms);
      const chs = track?.chapters || [];
      let idx = 0;
      for (let i = 0; i < chs.length; i++) { if (chs[i].start_ms <= ms) idx = i; else break; }
      setActiveChapterIdx(idx);
      const now = Date.now();
      if (now - lastSaveRef.current > 4000) { lastSaveRef.current = now; saveProgress(jobId, ms, a.duration * 1000); }
    };
    const onLoaded = () => {
      setTotalMs(a.duration * 1000);
      if (!resumedRef.current) {
        resumedRef.current = true;
        const resume = getResumeMs(jobId);
        if (resume > 0 && resume < a.duration * 1000) {
          a.currentTime = resume / 1000; setCurrentMs(resume); setResumedAt(resume);
        }
      }
    };
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => { setIsPlaying(false); saveProgress(jobId, a.currentTime * 1000, a.duration * 1000); };
    const onEnded = () => {
      setIsPlaying(false);
      saveProgress(jobId, a.duration * 1000, a.duration * 1000);
      if (autoplay) playNextTrack();
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    if (a.readyState >= 1 && a.duration) onLoaded();
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
    };
  }, [track, autoplay, playNextTrack]);

  // ── Global keyboard shortcuts (playback only; UI handles '?'/Escape) ───────
  useEffect(() => {
    const onKey = (e) => {
      if (!track) return;
      const t = e.target, tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case ' ': case 'k': case 'K': e.preventDefault(); togglePlay(); break;
        case 'j': case 'J': case 'ArrowLeft':  e.preventDefault(); skip(-SKIP_SECONDS); break;
        case 'l': case 'L': case 'ArrowRight': e.preventDefault(); skip(SKIP_SECONDS); break;
        case 'ArrowUp':   e.preventDefault(); nudgeVolume(0.1); break;
        case 'ArrowDown': e.preventDefault(); nudgeVolume(-0.1); break;
        case 'm': case 'M': toggleMute(); break;
        case 'p': case 'P': prevChapter(); break;
        case 'n': case 'N': nextChapter(); break;
        case '[': cycleSpeed(-1); break;
        case ']': cycleSpeed(1); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [track, togglePlay, skip, nudgeVolume, toggleMute, prevChapter, nextChapter, cycleSpeed]);

  // ── Media Session ──────────────────────────────────────────────────────────
  const artworkUrl = useMemo(
    () => (track ? generateArtworkDataUrl(track.topic, track.title, 512) : null),
    [track]
  );

  useEffect(() => {
    if (!track || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title || track.topic || 'Poddy',
        artist: 'Poddy',
        album: (track.sourcesUsed || []).join(', ') || 'AI-curated documentary',
        artwork: artworkUrl ? [{ src: artworkUrl, sizes: '512x512', type: 'image/png' }] : [],
      });
    } catch { /* unsupported */ }
    const set = (action, handler) => { try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported */ } };
    set('play', () => audioRef.current?.play().catch(() => {}));
    set('pause', () => audioRef.current?.pause());
    set('seekbackward', (d) => skip(-(d.seekOffset || SKIP_SECONDS)));
    set('seekforward', (d) => skip(d.seekOffset || SKIP_SECONDS));
    set('previoustrack', prevChapter);
    set('nexttrack', nextChapter);
    set('seekto', (d) => { if (d.seekTime != null) seekToMs(d.seekTime * 1000); });
    return () => {
      ['play', 'pause', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack', 'seekto']
        .forEach((a) => { try { navigator.mediaSession.setActionHandler(a, null); } catch { /* ignore */ } });
    };
  }, [track, artworkUrl, skip, prevChapter, nextChapter, seekToMs]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    if ('setPositionState' in navigator.mediaSession && totalMs > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: totalMs / 1000, playbackRate: speed, position: Math.min(currentMs, totalMs) / 1000,
        });
      } catch { /* invalid state */ }
    }
  }, [isPlaying, currentMs, totalMs, speed]);

  // ── Resume hint auto-hide ──────────────────────────────────────────────────
  useEffect(() => {
    if (!resumedAt) return;
    const t = setTimeout(() => setResumedAt(0), 5000);
    return () => clearTimeout(t);
  }, [resumedAt]);

  // ── Sleep timer ────────────────────────────────────────────────────────────
  const clearSleep = useCallback(() => {
    if (sleepTimerRef.current) { clearTimeout(sleepTimerRef.current); sleepTimerRef.current = null; }
    setSleepEndsAt(null); setSleepRemaining(0);
  }, []);

  const setSleep = useCallback((minutes) => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    setSleepEndsAt(Date.now() + minutes * 60_000);
    setSleepRemaining(minutes * 60);
    sleepTimerRef.current = setTimeout(() => { audioRef.current?.pause(); clearSleep(); }, minutes * 60_000);
  }, [clearSleep]);

  useEffect(() => {
    if (!sleepEndsAt) return;
    const iv = setInterval(() => setSleepRemaining(Math.max(0, Math.round((sleepEndsAt - Date.now()) / 1000))), 1000);
    return () => clearInterval(iv);
  }, [sleepEndsAt]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (objectUrlRef.current) { try { URL.revokeObjectURL(objectUrlRef.current); } catch { /* ignore */ } }
  }, []);

  const value = useMemo(() => ({
    audioRef,
    track, isPlaying, currentMs, totalMs, activeChapterIdx, chapters,
    speed, setSpeed, volume, setVolume, muted, setMuted, toggleMute,
    autoplay, setAutoplay, resumedAt,
    queue, queueIndex, hasNextTrack, hasPrevTrack,
    sleepEndsAt, sleepRemaining, setSleep, clearSleep,
    togglePlay, skip, seekToMs, jumpToChapter, prevChapter, nextChapter,
    cycleSpeed, nudgeVolume, play, playNextTrack, playPrevTrack, stop,
  }), [
    track, isPlaying, currentMs, totalMs, activeChapterIdx, chapters,
    speed, volume, muted, toggleMute, autoplay, setAutoplay, resumedAt,
    queue, queueIndex, hasNextTrack, hasPrevTrack,
    sleepEndsAt, sleepRemaining, setSleep, clearSleep,
    togglePlay, skip, seekToMs, jumpToChapter, prevChapter, nextChapter,
    cycleSpeed, nudgeVolume, play, playNextTrack, playPrevTrack, stop,
  ]);

  return (
    <PlayerContext.Provider value={value}>
      {/* The one and only audio element — lives above all views. */}
      <audio ref={audioRef} src={track?.audioUrl || undefined} preload="auto" />
      {children}
    </PlayerContext.Provider>
  );
}
