import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play, Pause, ChevronLeft, Download, ExternalLink, Sparkles, Radio,
  Volume2, Volume1, VolumeX, ChevronFirst, ChevronLast, Moon, Keyboard,
  AlignLeft, List, Copy, Check, Share2, Rewind, FastForward, X,
} from 'lucide-react';
import TopicArtwork from './TopicArtwork';
import RetroRadioTicker from './RetroRadioTicker';
import { generateArtworkDataUrl } from '../lib/artwork';
import { buildShowNotesMarkdown, buildShareText, slugify } from '../lib/showNotes';
import { saveProgress, getResumeMs } from '../lib/playbackProgress';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
const SPEEDS  = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const SLEEP_OPTIONS = [5, 10, 15, 30, 45];
const SKIP_SECONDS = 15;

function formatTime(ms) {
  if (!ms || isNaN(ms)) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}

const SHORTCUTS = [
  { keys: ['Space', 'K'], label: 'Play / pause' },
  { keys: ['J', '←'],     label: `Back ${SKIP_SECONDS}s` },
  { keys: ['L', '→'],     label: `Forward ${SKIP_SECONDS}s` },
  { keys: ['P'],          label: 'Previous chapter' },
  { keys: ['N'],          label: 'Next chapter' },
  { keys: ['↑', '↓'],     label: 'Volume up / down' },
  { keys: ['M'],          label: 'Mute' },
  { keys: ['[', ']'],     label: 'Slower / faster' },
  { keys: ['?'],          label: 'Toggle shortcuts' },
];

export default function SynthPlayer({ topic, title, jobId, audioUrl, chapters, sourcesUsed, durationMs, onBack }) {
  const [isPlaying, setIsPlaying]           = useState(false);
  const [currentMs, setCurrentMs]           = useState(0);
  const [totalMs, setTotalMs]               = useState(durationMs || 0);
  const [activeChapterIdx, setActiveChapterIdx] = useState(0);
  const [speed, setSpeed]                   = useState(1);
  const [volume, setVolume]                 = useState(1);
  const [muted, setMuted]                   = useState(false);
  const [isDragging, setIsDragging]         = useState(false);
  const [view, setView]                     = useState('chapters'); // 'chapters' | 'notes'
  const [sleepEndsAt, setSleepEndsAt]       = useState(null);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const [showShortcuts, setShowShortcuts]   = useState(false);
  const [copied, setCopied]                 = useState(false);

  const audioRef    = useRef(null);
  const progressRef = useRef(null);
  const chapterRefs = useRef([]);
  const sleepTimerRef = useRef(null);
  const lastSaveRef = useRef(0);
  const resumedRef  = useRef(false);
  const [resumedAt, setResumedAt] = useState(0);

  const safeChapters = useMemo(() => chapters || [], [chapters]);
  const safeSources  = useMemo(() => sourcesUsed || [], [sourcesUsed]);

  // ── Core audio event wiring ────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const ms = audio.currentTime * 1000;
      setCurrentMs(ms);
      let idx = 0;
      for (let i = 0; i < safeChapters.length; i++) {
        if (safeChapters[i].start_ms <= ms) idx = i; else break;
      }
      setActiveChapterIdx(idx);
      // Throttle progress persistence to ~once every 4s.
      const now = Date.now();
      if (now - lastSaveRef.current > 4000) {
        lastSaveRef.current = now;
        saveProgress(jobId, ms, audio.duration * 1000);
      }
    };
    const onLoaded = () => {
      setTotalMs(audio.duration * 1000);
      if (!resumedRef.current) {
        resumedRef.current = true;
        const resume = getResumeMs(jobId);
        if (resume > 0 && resume < audio.duration * 1000) {
          audio.currentTime = resume / 1000;
          setCurrentMs(resume);
          setResumedAt(resume);
        }
      }
    };
    const onPlay   = () => setIsPlaying(true);
    const onPause  = () => { setIsPlaying(false); saveProgress(jobId, audio.currentTime * 1000, audio.duration * 1000); };
    const onEnded  = () => { setIsPlaying(false); saveProgress(jobId, audio.duration * 1000, audio.duration * 1000); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    // Audio may already be loaded (cached blob) before listeners attach.
    if (audio.readyState >= 1 && audio.duration) onLoaded();
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [safeChapters, jobId]);

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed]);
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = muted;
    }
  }, [volume, muted]);

  // ── Playback controls ──────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, []);

  const skip = useCallback((s) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.currentTime + s, audio.duration || 0));
  }, []);

  const seekToMs = useCallback((ms, play = false) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, ms / 1000);
    setCurrentMs(ms);
    if (play) audio.play().catch(() => {});
  }, []);

  const jumpToChapter = useCallback((ch) => seekToMs(ch.start_ms, true), [seekToMs]);

  const prevChapter = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !safeChapters.length) return;
    const nowMs = audio.currentTime * 1000;
    const cur = safeChapters[activeChapterIdx];
    // If we're more than 3s into a chapter, restart it; otherwise go back one.
    if (cur && nowMs - cur.start_ms > 3000) seekToMs(cur.start_ms);
    else if (activeChapterIdx > 0) seekToMs(safeChapters[activeChapterIdx - 1].start_ms);
    else seekToMs(0);
  }, [safeChapters, activeChapterIdx, seekToMs]);

  const nextChapter = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !safeChapters.length) return;
    if (activeChapterIdx < safeChapters.length - 1) seekToMs(safeChapters[activeChapterIdx + 1].start_ms);
    else seekToMs((audio.duration || 0) * 1000);
  }, [safeChapters, activeChapterIdx, seekToMs]);

  const cycleSpeed = useCallback((dir) => {
    setSpeed((prev) => {
      const i = SPEEDS.indexOf(prev);
      const next = Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 1 : i) + dir));
      return SPEEDS[next];
    });
  }, []);

  const nudgeVolume = useCallback((delta) => {
    setMuted(false);
    setVolume((v) => Math.max(0, Math.min(1, Math.round((v + delta) * 100) / 100)));
  }, []);

  // ── Progress bar: pointer (mouse + touch) + keyboard ───────────────────────
  const seekToClientX = useCallback((clientX) => {
    const audio = audioRef.current;
    const bar   = progressRef.current;
    if (!audio || !bar) return;
    const rect = bar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const dur  = audio.duration || (totalMs / 1000) || 0;
    audio.currentTime = pct * dur;
    setCurrentMs(pct * dur * 1000);
  }, [totalMs]);

  const handlePointerDown = (e) => {
    setIsDragging(true);
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* not supported */ }
    seekToClientX(e.clientX);
  };
  const handlePointerMove = (e) => { if (isDragging) seekToClientX(e.clientX); };
  const handlePointerUp   = () => setIsDragging(false);

  const handleBarKeyDown = (e) => {
    const dur = totalMs || 0;
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); skip(SKIP_SECONDS); break;
      case 'ArrowLeft':  e.preventDefault(); skip(-SKIP_SECONDS); break;
      case 'Home':       e.preventDefault(); seekToMs(0); break;
      case 'End':        e.preventDefault(); seekToMs(dur); break;
      case 'PageUp':     e.preventDefault(); skip(60); break;
      case 'PageDown':   e.preventDefault(); skip(-60); break;
      default: break;
    }
  };

  // ── Global keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case ' ': case 'k': case 'K': e.preventDefault(); togglePlay(); break;
        case 'j': case 'J': case 'ArrowLeft':  e.preventDefault(); skip(-SKIP_SECONDS); break;
        case 'l': case 'L': case 'ArrowRight': e.preventDefault(); skip(SKIP_SECONDS); break;
        case 'ArrowUp':   e.preventDefault(); nudgeVolume(0.1); break;
        case 'ArrowDown': e.preventDefault(); nudgeVolume(-0.1); break;
        case 'm': case 'M': setMuted((v) => !v); break;
        case 'p': case 'P': prevChapter(); break;
        case 'n': case 'N': nextChapter(); break;
        case '[': cycleSpeed(-1); break;
        case ']': cycleSpeed(1); break;
        case '?': setShowShortcuts((v) => !v); break;
        case 'Escape': setShowShortcuts(false); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, skip, nudgeVolume, prevChapter, nextChapter, cycleSpeed]);

  // ── Media Session (OS / lock-screen now-playing controls) ──────────────────
  const artworkUrl = useMemo(() => generateArtworkDataUrl(topic, title, 512), [topic, title]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: title || topic || 'Poddy',
        artist: 'Poddy',
        album: safeSources.join(', ') || 'AI-curated documentary',
        artwork: artworkUrl ? [{ src: artworkUrl, sizes: '512x512', type: 'image/png' }] : [],
      });
    } catch { /* MediaMetadata unsupported */ }

    const set = (action, handler) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported action */ }
    };
    set('play', () => audioRef.current?.play().catch(() => {}));
    set('pause', () => audioRef.current?.pause());
    set('seekbackward', (d) => skip(-(d.seekOffset || SKIP_SECONDS)));
    set('seekforward', (d) => skip(d.seekOffset || SKIP_SECONDS));
    set('previoustrack', prevChapter);
    set('nexttrack', nextChapter);
    set('seekto', (d) => { if (d.seekTime != null) seekToMs(d.seekTime * 1000); });

    return () => {
      ['play', 'pause', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack', 'seekto']
        .forEach((a) => { try { navigator.mediaSession.setActionHandler(a, null); } catch { /* noop */ } });
    };
  }, [title, topic, artworkUrl, safeSources, skip, prevChapter, nextChapter, seekToMs]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    if ('setPositionState' in navigator.mediaSession && totalMs > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: totalMs / 1000,
          playbackRate: speed,
          position: Math.min(currentMs, totalMs) / 1000,
        });
      } catch { /* invalid state guard */ }
    }
  }, [isPlaying, currentMs, totalMs, speed]);

  // ── Auto-scroll the active chapter into view ───────────────────────────────
  useEffect(() => {
    if (view !== 'chapters') return;
    const el = chapterRefs.current[activeChapterIdx];
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeChapterIdx, view]);

  // ── Sleep timer ────────────────────────────────────────────────────────────
  const clearSleep = useCallback(() => {
    if (sleepTimerRef.current) { clearTimeout(sleepTimerRef.current); sleepTimerRef.current = null; }
    setSleepEndsAt(null);
    setSleepRemaining(0);
  }, []);

  const setSleep = useCallback((minutes) => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    const endsAt = Date.now() + minutes * 60_000;
    setSleepEndsAt(endsAt);
    setSleepRemaining(minutes * 60);
    sleepTimerRef.current = setTimeout(() => {
      audioRef.current?.pause();
      clearSleep();
    }, minutes * 60_000);
  }, [clearSleep]);

  useEffect(() => {
    if (!sleepEndsAt) return;
    const iv = setInterval(() => {
      setSleepRemaining(Math.max(0, Math.round((sleepEndsAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(iv);
  }, [sleepEndsAt]);

  useEffect(() => () => { if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current); }, []);

  // Auto-hide the "resumed" hint after a few seconds.
  useEffect(() => {
    if (!resumedAt) return;
    const t = setTimeout(() => setResumedAt(0), 5000);
    return () => clearTimeout(t);
  }, [resumedAt]);

  // ── Export / share ─────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (audioUrl && audioUrl.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = `Poddy - ${(title || topic).replace(/[/\\]/g, '-').slice(0, 50)}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      window.open(`${BACKEND}/download/${jobId}`, '_blank');
    }
  };

  const handleCopyNotes = async () => {
    const md = buildShowNotesMarkdown({ title, topic, chapters: safeChapters, sourcesUsed: safeSources, totalMs: totalMs || durationMs });
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };

  const handleDownloadNotes = () => {
    const md = buildShowNotesMarkdown({ title, topic, chapters: safeChapters, sourcesUsed: safeSources, totalMs: totalMs || durationMs });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poddy-${slugify(title || topic)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    const text = buildShareText({ title, topic, sourcesUsed: safeSources, totalMs: totalMs || durationMs });
    if (navigator.share) {
      try { await navigator.share({ title: title || topic, text }); return; } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };

  const progress = totalMs > 0 ? (currentMs / totalMs) * 100 : 0;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="animate-entrance w-full max-w-[820px]">
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-ink-500 text-sm mb-6 hover:text-terra transition-colors"
      >
        <ChevronLeft size={16} /> New Poddy
      </button>

      <div className="rounded-3xl overflow-hidden shadow-[0_8px_40px_rgba(30,24,20,0.12)] bg-cream-50">

        {/* Dark hero header */}
        <div className="bg-warm-dark px-8 py-8 flex gap-6 items-center flex-wrap">
          <TopicArtwork topic={topic} title={title} size={140} isPlaying={isPlaying} />

          <div className="flex-1 min-w-[200px]">
            <div className="inline-block px-2.5 py-0.5 rounded-full bg-white/10 text-cream-400/80 text-[0.68rem] font-semibold tracking-[0.08em] uppercase mb-3 border border-white/6">
              Poddy
            </div>
            <h2 className="font-display font-semibold text-[1.75rem] leading-tight text-cream-50 mb-1">{title || topic}</h2>
            {title && title !== topic && (
              <p className="text-cream-400/60 text-sm mb-2">{topic}</p>
            )}
            <p className="text-cream-400/70 text-sm mb-4">
              {safeSources.length} sources · {formatTime(totalMs || durationMs)}
            </p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {safeSources.map((s, i) => (
                <span key={i} className="px-2.5 py-0.5 rounded-full bg-white/8 border border-white/8 text-cream-400/70 text-[0.72rem]">{s}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-cream-50/80 font-semibold text-sm hover:bg-white/15 transition-colors"
              >
                <Download size={13} /> Download MP3
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-cream-50/80 font-semibold text-sm hover:bg-white/15 transition-colors"
              >
                {copied ? <Check size={13} /> : <Share2 size={13} />} {copied ? 'Copied' : 'Share'}
              </button>
            </div>
          </div>
        </div>

        {/* Player controls */}
        <div className="px-8 py-6 bg-cream-200 border-b border-ink-900/6">
          {/* Progress bar */}
          <div
            ref={progressRef}
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round((totalMs || 0) / 1000)}
            aria-valuenow={Math.round(currentMs / 1000)}
            aria-valuetext={`${formatTime(currentMs)} of ${formatTime(totalMs || durationMs)}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onKeyDown={handleBarKeyDown}
            className="w-full h-2 bg-cream-300 rounded-full cursor-pointer mb-2 select-none relative group outline-none focus-visible:ring-2 focus-visible:ring-terra/40 touch-none"
          >
            <div
              className="h-full bg-terra rounded-full relative"
              style={{ width: `${progress}%`, transition: isDragging ? 'none' : 'width 0.2s linear' }}
            >
              <div className="absolute right-[-7px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-terra border-2 border-cream-50 cursor-grab shadow-sm opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" />
            </div>
          </div>
          <div className="flex justify-between text-ink-400 text-xs mb-1 tabular-nums">
            <span>{formatTime(currentMs)}</span>
            <span>-{formatTime(Math.max(0, (totalMs || durationMs) - currentMs))}</span>
          </div>
          <div className="h-4 mb-3 text-center">
            {resumedAt > 0 && (
              <span className="animate-entrance inline-flex items-center gap-1 text-[0.7rem] text-terra-dark">
                <Rewind size={11} /> Resumed from {formatTime(resumedAt)}
              </span>
            )}
          </div>

          <RetroRadioTicker title={title || topic} />

          {/* Transport controls */}
          <div className="flex justify-center items-center gap-6 sm:gap-8 mb-5">
            <button onClick={prevChapter} title="Previous chapter (P)" className="text-ink-500 hover:text-terra transition-colors">
              <ChevronFirst size={22} />
            </button>
            <button onClick={() => skip(-SKIP_SECONDS)} title={`Back ${SKIP_SECONDS}s (J)`} className="text-ink-500 hover:text-terra transition-colors flex flex-col items-center gap-0.5">
              <Rewind size={20} /><span className="text-[0.55rem]">{SKIP_SECONDS}s</span>
            </button>

            <button
              onClick={togglePlay}
              title="Play / pause (Space)"
              className={`w-[60px] h-[60px] rounded-full bg-terra text-cream-50 flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-all ${
                isPlaying ? 'shadow-[0_0_24px_rgba(191,86,48,0.35)]' : 'shadow-[0_4px_16px_rgba(30,24,20,0.12)]'
              }`}
            >
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
            </button>

            <button onClick={() => skip(SKIP_SECONDS)} title={`Forward ${SKIP_SECONDS}s (L)`} className="text-ink-500 hover:text-terra transition-colors flex flex-col items-center gap-0.5">
              <FastForward size={20} /><span className="text-[0.55rem]">{SKIP_SECONDS}s</span>
            </button>
            <button onClick={nextChapter} title="Next chapter (N)" className="text-ink-500 hover:text-terra transition-colors">
              <ChevronLast size={22} />
            </button>
          </div>

          {/* Secondary controls: volume + speed + sleep + shortcuts */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {/* Volume */}
            <div className="flex items-center gap-2">
              <button onClick={() => setMuted((v) => !v)} title="Mute (M)" className="text-ink-500 hover:text-terra transition-colors">
                <VolIcon size={18} />
              </button>
              <input
                type="range" min={0} max={1} step={0.01}
                value={muted ? 0 : volume}
                onChange={(e) => { setMuted(false); setVolume(parseFloat(e.target.value)); }}
                aria-label="Volume"
                className="poddy-range w-20"
              />
            </div>

            {/* Speed */}
            <div className="flex items-center gap-1.5">
              {SPEEDS.map(s => (
                <button key={s} onClick={() => setSpeed(s)} className={`px-2 py-1 rounded-full text-[0.7rem] transition-all cursor-pointer ${
                  speed === s
                    ? 'border-2 border-terra bg-terra/8 text-terra-dark font-semibold'
                    : 'border border-ink-900/10 text-ink-400 hover:border-ink-900/20'
                }`}>
                  {s}×
                </button>
              ))}
            </div>
          </div>

          {/* Sleep timer + shortcuts row */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-4">
            <div className="flex items-center gap-1.5">
              <Moon size={14} className={sleepEndsAt ? 'text-terra' : 'text-ink-400'} />
              {sleepEndsAt ? (
                <button onClick={clearSleep} className="text-[0.72rem] text-terra-dark font-semibold hover:underline">
                  Sleep in {formatTime(sleepRemaining * 1000)} · cancel
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-[0.7rem] text-ink-400">Sleep</span>
                  {SLEEP_OPTIONS.map(m => (
                    <button key={m} onClick={() => setSleep(m)} className="px-1.5 py-0.5 rounded-full text-[0.68rem] text-ink-400 border border-ink-900/10 hover:border-terra/40 hover:text-terra-dark transition-colors">
                      {m}m
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setShowShortcuts(true)} className="flex items-center gap-1.5 text-[0.72rem] text-ink-400 hover:text-terra-dark transition-colors">
              <Keyboard size={14} /> Shortcuts
            </button>
          </div>
        </div>

        {/* View toggle: Chapters / Show Notes */}
        <div className="px-8 pt-5">
          <div className="inline-flex p-1 rounded-full bg-cream-200 border border-ink-900/6">
            <button
              onClick={() => setView('chapters')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[0.78rem] font-semibold transition-all ${
                view === 'chapters' ? 'bg-cream-50 text-terra-dark shadow-sm' : 'text-ink-400 hover:text-ink-900'
              }`}
            >
              <List size={13} /> Chapters
            </button>
            <button
              onClick={() => setView('notes')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[0.78rem] font-semibold transition-all ${
                view === 'notes' ? 'bg-cream-50 text-terra-dark shadow-sm' : 'text-ink-400 hover:text-ink-900'
              }`}
            >
              <AlignLeft size={13} /> Show Notes
            </button>
          </div>
        </div>

        {/* Chapters */}
        {view === 'chapters' && (
          <div className="px-8 py-6">
            <h3 className="text-[0.68rem] text-ink-400 uppercase tracking-[0.12em] mb-3 font-semibold">
              Chapters · {safeChapters.length}
            </h3>
            <div className="flex flex-col gap-1 max-h-[460px] overflow-y-auto pr-1">
              {safeChapters.map((ch, idx) => {
                const isActive = idx === activeChapterIdx;
                const isClip   = ch.type === 'clip';
                const clipSec  = ch.end_ms && ch.start_ms ? Math.round((ch.end_ms - ch.start_ms) / 1000) : null;
                return (
                  <div
                    key={idx}
                    ref={(el) => { chapterRefs.current[idx] = el; }}
                    onClick={() => jumpToChapter(ch)}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-xl cursor-pointer transition-all ${
                      isActive
                        ? 'bg-terra/8 border border-terra/20'
                        : 'border border-transparent hover:bg-cream-200'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border ${
                      isClip
                        ? 'bg-sage/8 border-sage/18'
                        : 'bg-dusty/8 border-dusty/18'
                    }`}>
                      {isClip ? <Radio size={10} className="text-sage" /> : <Sparkles size={10} className="text-dusty" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className={`text-sm truncate ${isActive ? 'font-semibold text-terra-dark' : 'text-ink-900'}`}>
                        {ch.title}
                      </div>
                      {isClip && ch.source_podcast && (
                        <div className="text-ink-400 text-[0.7rem] truncate mt-0.5">
                          {ch.source_podcast}{ch.source_episode ? ` · ${ch.source_episode.slice(0, 40)}…` : ''}
                          {clipSec ? ` · ${Math.floor(clipSec/60)}m${clipSec%60}s` : ''}
                        </div>
                      )}
                    </div>

                    <span className={`text-xs tabular-nums shrink-0 ${isActive ? 'text-terra-dark' : 'text-ink-400'}`}>
                      {formatTime(ch.start_ms)}
                    </span>

                    {isClip && ch.apple_podcasts_url && (
                      <a href={ch.apple_podcasts_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Open original episode"
                        className="text-ink-300 hover:text-terra shrink-0 transition-colors"
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Show Notes */}
        {view === 'notes' && (
          <div className="px-8 py-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-[0.68rem] text-ink-400 uppercase tracking-[0.12em] font-semibold">
                Show Notes
              </h3>
              <div className="flex gap-2">
                <button onClick={handleCopyNotes} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cream-200 border border-ink-900/8 text-ink-500 text-[0.72rem] font-semibold hover:text-terra-dark hover:border-terra/30 transition-colors">
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
                </button>
                <button onClick={handleDownloadNotes} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cream-200 border border-ink-900/8 text-ink-500 text-[0.72rem] font-semibold hover:text-terra-dark hover:border-terra/30 transition-colors">
                  <Download size={12} /> .md
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4 max-h-[520px] overflow-y-auto pr-1">
              {safeChapters.map((ch, idx) => {
                const isClip = ch.type === 'clip';
                const hasBody = isClip ? ch.summary : ch.text;
                return (
                  <div key={idx} className="flex gap-3">
                    <button
                      onClick={() => jumpToChapter(ch)}
                      className="shrink-0 text-[0.7rem] tabular-nums text-terra-dark font-semibold hover:underline pt-0.5 w-10 text-right"
                      title="Jump to this point"
                    >
                      {formatTime(ch.start_ms)}
                    </button>
                    <div className="flex-1 min-w-0 border-l-2 border-cream-300 pl-4 pb-1">
                      <div className="flex items-center gap-2 mb-1">
                        {isClip
                          ? <Radio size={11} className="text-sage shrink-0" />
                          : <Sparkles size={11} className="text-dusty shrink-0" />}
                        <span className="text-sm font-semibold text-ink-900">{ch.title}</span>
                      </div>
                      {hasBody ? (
                        <p className={`text-[0.85rem] leading-relaxed ${isClip ? 'text-ink-500' : 'text-ink-500 italic'}`}>
                          {isClip ? ch.summary : `“${ch.text}”`}
                        </p>
                      ) : (
                        <p className="text-[0.8rem] text-ink-300 italic">No notes available for this segment.</p>
                      )}
                      {isClip && (ch.source_podcast || ch.apple_podcasts_url) && (
                        <div className="flex items-center gap-2 mt-1.5">
                          {ch.source_podcast && (
                            <span className="text-[0.7rem] text-ink-400">
                              {ch.source_podcast}{ch.source_episode ? ` · ${ch.source_episode.slice(0, 50)}` : ''}
                            </span>
                          )}
                          {ch.apple_podcasts_url && (
                            <a href={ch.apple_podcasts_url} target="_blank" rel="noopener noreferrer"
                              className="text-ink-300 hover:text-terra inline-flex items-center gap-0.5 text-[0.7rem]">
                              <ExternalLink size={10} /> source
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Keyboard shortcuts overlay */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-6"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="animate-entrance w-full max-w-[420px] rounded-2xl bg-cream-50 shadow-[0_20px_60px_rgba(30,24,20,0.25)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-lg flex items-center gap-2"><Keyboard size={18} className="text-terra" /> Keyboard shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-ink-400 hover:text-ink-900 transition-colors"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-2">
              {SHORTCUTS.map((s) => (
                <div key={s.label} className="flex items-center justify-between py-1">
                  <span className="text-sm text-ink-500">{s.label}</span>
                  <span className="flex gap-1">
                    {s.keys.map((k) => (
                      <kbd key={k} className="px-2 py-0.5 rounded-md bg-cream-200 border border-ink-900/10 text-ink-700 text-[0.72rem] font-mono shadow-[0_1px_0_rgba(30,24,20,0.12)]">{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
