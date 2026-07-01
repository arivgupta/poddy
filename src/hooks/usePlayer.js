import { useCallback, useEffect, useRef, useState } from 'react';
import { getPosition, savePosition, clearPosition } from '../lib/progressStore';

const SPEED_KEY = 'poddy_speed';
const RESUME_THRESHOLD_MS = 20000;
const RESUME_TAIL_MS = 20000;

function loadSavedSpeed() {
  const v = parseFloat(localStorage.getItem(SPEED_KEY));
  return Number.isFinite(v) && v >= 0.5 && v <= 3 ? v : 1;
}

/**
 * One shared HTMLAudioElement for the whole app (created imperatively, no DOM
 * node needed), so playback survives navigation: mini dock, library browsing,
 * even starting a new generation.
 */
export function usePlayer() {
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const pendingSeekRef = useRef(null);
  const lastSaveRef = useRef(0);
  const episodeRef = useRef(null);

  const [episode, setEpisode] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [speed, setSpeedState] = useState(loadSavedSpeed);

  useEffect(() => {
    episodeRef.current = episode;
  }, [episode]);

  // ── Create the audio element + wire events once ─────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const onTime = () => {
      const ms = audio.currentTime * 1000;
      setCurrentMs(ms);
      const now = Date.now();
      if (now - lastSaveRef.current > 4000 && episodeRef.current) {
        lastSaveRef.current = now;
        savePosition(episodeRef.current.jobId, ms);
      }
    };
    const onLoaded = () => {
      setDurationMs(audio.duration * 1000 || 0);
      if (pendingSeekRef.current != null) {
        audio.currentTime = pendingSeekRef.current / 1000;
        pendingSeekRef.current = null;
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      if (episodeRef.current) {
        savePosition(episodeRef.current.jobId, audio.currentTime * 1000);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      if (episodeRef.current) clearPosition(episodeRef.current.jobId);
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audioRef.current = null;
    };
  }, []);

  // Keep playback rate in sync (including across episode loads).
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, episode]);

  const play = useCallback(() => {
    audioRef.current?.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, []);

  const seekMs = useCallback((ms) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(ms, (audio.duration || 0) * 1000));
    audio.currentTime = clamped / 1000;
    setCurrentMs(clamped);
  }, []);

  const skip = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(
      0,
      Math.min(audio.currentTime + seconds, audio.duration || 0),
    );
    audio.currentTime = next;
    setCurrentMs(next * 1000);
  }, []);

  const setSpeed = useCallback((value) => {
    setSpeedState(value);
    try {
      localStorage.setItem(SPEED_KEY, String(value));
    } catch {
      /* non-critical */
    }
  }, []);

  /** Current audio src — used for blob-aware downloads. */
  const getCurrentSrc = useCallback(() => audioRef.current?.currentSrc || '', []);

  /**
   * Load an episode. Returns the position (ms) it resumed from, or 0.
   */
  const load = useCallback((entry, src, { autoplay = false } = {}) => {
    const audio = audioRef.current;
    if (!audio) return 0;

    if (objectUrlRef.current && objectUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    objectUrlRef.current = src;

    const saved = getPosition(entry.jobId);
    const total = entry.durationMs || 0;
    const resumable =
      saved > RESUME_THRESHOLD_MS && (!total || saved < total - RESUME_TAIL_MS);
    pendingSeekRef.current = resumable ? saved : null;

    setEpisode(entry);
    setCurrentMs(resumable ? saved : 0);
    setDurationMs(total);
    audio.src = src;
    audio.load();
    if (autoplay) audio.play().catch(() => {});

    return resumable ? saved : 0;
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      if (episodeRef.current) {
        savePosition(episodeRef.current.jobId, audio.currentTime * 1000);
      }
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (objectUrlRef.current && objectUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setEpisode(null);
    setIsPlaying(false);
    setCurrentMs(0);
    setDurationMs(0);
  }, []);

  // ── OS media controls ───────────────────────────────────────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!episode) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: episode.title || episode.topic,
      artist: 'Poddy',
      album: 'Your personal audio documentaries',
      artwork: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
    });
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', play);
    ms.setActionHandler('pause', pause);
    ms.setActionHandler('seekbackward', () => skip(-15));
    ms.setActionHandler('seekforward', () => skip(15));
    try {
      ms.setActionHandler('seekto', (d) => {
        if (d.seekTime != null) seekMs(d.seekTime * 1000);
      });
    } catch {
      /* seekto unsupported */
    }
  }, [episode, play, pause, skip, seekMs]);

  return {
    episode,
    isPlaying,
    currentMs,
    durationMs,
    speed,
    load,
    play,
    pause,
    toggle,
    seekMs,
    skip,
    setSpeed,
    stop,
    getCurrentSrc,
  };
}
