import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, ChevronLeft, Download, ExternalLink, Sparkles, Radio,
  Volume2, Volume1, VolumeX, ChevronFirst, ChevronLast, Moon, Keyboard,
  AlignLeft, List, Copy, Check, Share2, Rewind, FastForward, X, ListVideo,
} from 'lucide-react';
import TopicArtwork from './TopicArtwork';
import RetroRadioTicker from './RetroRadioTicker';
import { usePlayer } from '../lib/playerContext';
import { SPEEDS, SKIP_SECONDS } from '../lib/playerConstants';
import { buildShowNotesMarkdown, buildShareText, slugify } from '../lib/showNotes';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
const SLEEP_OPTIONS = [5, 10, 15, 30, 45];

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

export default function SynthPlayer({ onBack }) {
  const player = usePlayer();
  const {
    track, isPlaying, currentMs, totalMs, activeChapterIdx, chapters,
    speed, setSpeed, volume, setVolume, muted, setMuted, autoplay, setAutoplay,
    resumedAt, sleepEndsAt, sleepRemaining, setSleep, clearSleep,
    togglePlay, skip, seekToMs, jumpToChapter, prevChapter, nextChapter,
    queue, queueIndex, hasNextTrack,
  } = player;

  const [view, setView]                   = useState('chapters');
  const [isDragging, setIsDragging]       = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [copied, setCopied]               = useState(false);

  const progressRef = useRef(null);
  const chapterRefs = useRef([]);

  const topic = track?.topic || '';
  const title = track?.title || '';
  const jobId = track?.jobId;
  const audioUrl = track?.audioUrl;
  const sourcesUsed = track?.sourcesUsed || [];
  const durationMs = track?.durationMs || 0;
  const nextEntry = hasNextTrack ? queue[queueIndex + 1] : null;

  // ── Seek bar: pointer + keyboard ───────────────────────────────────────────
  const seekToClientX = useCallback((clientX) => {
    const bar = progressRef.current; if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seekToMs(pct * (totalMs || durationMs || 0));
  }, [seekToMs, totalMs, durationMs]);

  const handlePointerDown = (e) => {
    setIsDragging(true);
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* unsupported */ }
    seekToClientX(e.clientX);
  };
  const handlePointerMove = (e) => { if (isDragging) seekToClientX(e.clientX); };
  const handlePointerUp = () => setIsDragging(false);

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

  // '?' / Escape for the shortcuts overlay (playback keys live in the provider).
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target, tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      if (e.key === '?') { e.preventDefault(); setShowShortcuts((v) => !v); }
      else if (e.key === 'Escape') setShowShortcuts(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Auto-scroll active chapter into view.
  useEffect(() => {
    if (view !== 'chapters') return;
    const el = chapterRefs.current[activeChapterIdx];
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeChapterIdx, view]);

  // ── Export / share ─────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (audioUrl && audioUrl.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = `Poddy - ${(title || topic).replace(/[/\\]/g, '-').slice(0, 50)}.mp3`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } else {
      window.open(`${BACKEND}/download/${jobId}`, '_blank');
    }
  };

  const notesArgs = { title, topic, chapters, sourcesUsed, totalMs: totalMs || durationMs };

  const handleCopyNotes = async () => {
    try { await navigator.clipboard.writeText(buildShowNotesMarkdown(notesArgs)); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard blocked */ }
  };

  const handleDownloadNotes = () => {
    const blob = new Blob([buildShowNotesMarkdown(notesArgs)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `poddy-${slugify(title || topic)}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    const text = buildShareText({ title, topic, sourcesUsed, totalMs: totalMs || durationMs });
    if (navigator.share) { try { await navigator.share({ title: title || topic, text }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* blocked */ }
  };

  if (!track) return null;

  const progress = totalMs > 0 ? (currentMs / totalMs) * 100 : 0;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="animate-entrance w-full max-w-[820px]">
      <button onClick={onBack} className="flex items-center gap-1.5 text-ink-500 text-sm mb-6 hover:text-terra transition-colors">
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
            {title && title !== topic && <p className="text-cream-400/60 text-sm mb-2">{topic}</p>}
            <p className="text-cream-400/70 text-sm mb-4">{sourcesUsed.length} sources · {formatTime(totalMs || durationMs)}</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {sourcesUsed.map((s, i) => (
                <span key={i} className="px-2.5 py-0.5 rounded-full bg-white/8 border border-white/8 text-cream-400/70 text-[0.72rem]">{s}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={handleDownload} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-cream-50/80 font-semibold text-sm hover:bg-white/15 transition-colors">
                <Download size={13} /> Download MP3
              </button>
              <button onClick={handleShare} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-cream-50/80 font-semibold text-sm hover:bg-white/15 transition-colors">
                {copied ? <Check size={13} /> : <Share2 size={13} />} {copied ? 'Copied' : 'Share'}
              </button>
            </div>
          </div>
        </div>

        {/* Player controls */}
        <div className="px-8 py-6 bg-cream-200 border-b border-ink-900/6">
          <div
            ref={progressRef}
            role="slider" tabIndex={0} aria-label="Seek"
            aria-valuemin={0} aria-valuemax={Math.round((totalMs || 0) / 1000)} aria-valuenow={Math.round(currentMs / 1000)}
            aria-valuetext={`${formatTime(currentMs)} of ${formatTime(totalMs || durationMs)}`}
            onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
            onKeyDown={handleBarKeyDown}
            className="w-full h-2 bg-cream-300 rounded-full cursor-pointer mb-2 select-none relative group outline-none focus-visible:ring-2 focus-visible:ring-terra/40 touch-none"
          >
            <div className="h-full bg-terra rounded-full relative" style={{ width: `${progress}%`, transition: isDragging ? 'none' : 'width 0.2s linear' }}>
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

          <div className="flex justify-center items-center gap-6 sm:gap-8 mb-5">
            <button onClick={prevChapter} title="Previous chapter (P)" className="text-ink-500 hover:text-terra transition-colors"><ChevronFirst size={22} /></button>
            <button onClick={() => skip(-SKIP_SECONDS)} title={`Back ${SKIP_SECONDS}s (J)`} className="text-ink-500 hover:text-terra transition-colors flex flex-col items-center gap-0.5">
              <Rewind size={20} /><span className="text-[0.55rem]">{SKIP_SECONDS}s</span>
            </button>
            <button onClick={togglePlay} title="Play / pause (Space)" className={`w-[60px] h-[60px] rounded-full bg-terra text-cream-50 flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-all ${isPlaying ? 'shadow-[0_0_24px_rgba(191,86,48,0.35)]' : 'shadow-[0_4px_16px_rgba(30,24,20,0.12)]'}`}>
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
            </button>
            <button onClick={() => skip(SKIP_SECONDS)} title={`Forward ${SKIP_SECONDS}s (L)`} className="text-ink-500 hover:text-terra transition-colors flex flex-col items-center gap-0.5">
              <FastForward size={20} /><span className="text-[0.55rem]">{SKIP_SECONDS}s</span>
            </button>
            <button onClick={nextChapter} title="Next chapter (N)" className="text-ink-500 hover:text-terra transition-colors"><ChevronLast size={22} /></button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setMuted(!muted)} title="Mute (M)" className="text-ink-500 hover:text-terra transition-colors"><VolIcon size={18} /></button>
              <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume}
                onChange={(e) => { setMuted(false); setVolume(parseFloat(e.target.value)); }}
                aria-label="Volume" className="poddy-range w-20" />
            </div>
            <div className="flex items-center gap-1.5">
              {SPEEDS.map(s => (
                <button key={s} onClick={() => setSpeed(s)} className={`px-2 py-1 rounded-full text-[0.7rem] transition-all cursor-pointer ${speed === s ? 'border-2 border-terra bg-terra/8 text-terra-dark font-semibold' : 'border border-ink-900/10 text-ink-400 hover:border-ink-900/20'}`}>
                  {s}×
                </button>
              ))}
            </div>
          </div>

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
                    <button key={m} onClick={() => setSleep(m)} className="px-1.5 py-0.5 rounded-full text-[0.68rem] text-ink-400 border border-ink-900/10 hover:border-terra/40 hover:text-terra-dark transition-colors">{m}m</button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setAutoplay(!autoplay)} title="Autoplay the next cast when this one ends" className="flex items-center gap-1.5 text-[0.72rem] transition-colors">
              <ListVideo size={14} className={autoplay ? 'text-terra' : 'text-ink-400'} />
              <span className={autoplay ? 'text-terra-dark font-semibold' : 'text-ink-400'}>Autoplay {autoplay ? 'on' : 'off'}</span>
            </button>

            <button onClick={() => setShowShortcuts(true)} className="flex items-center gap-1.5 text-[0.72rem] text-ink-400 hover:text-terra-dark transition-colors">
              <Keyboard size={14} /> Shortcuts
            </button>
          </div>

          {autoplay && nextEntry && (
            <p className="text-center text-[0.7rem] text-ink-400 mt-3">
              Up next · <span className="text-ink-500 font-medium">{nextEntry.title || nextEntry.topic}</span>
            </p>
          )}
        </div>

        {/* View toggle */}
        <div className="px-8 pt-5">
          <div className="inline-flex p-1 rounded-full bg-cream-200 border border-ink-900/6">
            <button onClick={() => setView('chapters')} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[0.78rem] font-semibold transition-all ${view === 'chapters' ? 'bg-cream-50 text-terra-dark shadow-sm' : 'text-ink-400 hover:text-ink-900'}`}>
              <List size={13} /> Chapters
            </button>
            <button onClick={() => setView('notes')} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[0.78rem] font-semibold transition-all ${view === 'notes' ? 'bg-cream-50 text-terra-dark shadow-sm' : 'text-ink-400 hover:text-ink-900'}`}>
              <AlignLeft size={13} /> Show Notes
            </button>
          </div>
        </div>

        {/* Chapters */}
        {view === 'chapters' && (
          <div className="px-8 py-6">
            <h3 className="text-[0.68rem] text-ink-400 uppercase tracking-[0.12em] mb-3 font-semibold">Chapters · {chapters.length}</h3>
            <div className="flex flex-col gap-1 max-h-[460px] overflow-y-auto pr-1">
              {chapters.map((ch, idx) => {
                const isActive = idx === activeChapterIdx;
                const isClip = ch.type === 'clip';
                const clipSec = ch.end_ms && ch.start_ms ? Math.round((ch.end_ms - ch.start_ms) / 1000) : null;
                return (
                  <div key={idx} ref={(el) => { chapterRefs.current[idx] = el; }} onClick={() => jumpToChapter(ch)}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-xl cursor-pointer transition-all ${isActive ? 'bg-terra/8 border border-terra/20' : 'border border-transparent hover:bg-cream-200'}`}>
                    <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border ${isClip ? 'bg-sage/8 border-sage/18' : 'bg-dusty/8 border-dusty/18'}`}>
                      {isClip ? <Radio size={10} className="text-sage" /> : <Sparkles size={10} className="text-dusty" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm truncate ${isActive ? 'font-semibold text-terra-dark' : 'text-ink-900'}`}>{ch.title}</div>
                      {isClip && ch.source_podcast && (
                        <div className="text-ink-400 text-[0.7rem] truncate mt-0.5">
                          {ch.source_podcast}{ch.source_episode ? ` · ${ch.source_episode.slice(0, 40)}…` : ''}{clipSec ? ` · ${Math.floor(clipSec/60)}m${clipSec%60}s` : ''}
                        </div>
                      )}
                    </div>
                    <span className={`text-xs tabular-nums shrink-0 ${isActive ? 'text-terra-dark' : 'text-ink-400'}`}>{formatTime(ch.start_ms)}</span>
                    {isClip && ch.apple_podcasts_url && (
                      <a href={ch.apple_podcasts_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Open original episode" className="text-ink-300 hover:text-terra shrink-0 transition-colors">
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
              <h3 className="text-[0.68rem] text-ink-400 uppercase tracking-[0.12em] font-semibold">Show Notes</h3>
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
              {chapters.map((ch, idx) => {
                const isClip = ch.type === 'clip';
                const hasBody = isClip ? ch.summary : ch.text;
                return (
                  <div key={idx} className="flex gap-3">
                    <button onClick={() => jumpToChapter(ch)} className="shrink-0 text-[0.7rem] tabular-nums text-terra-dark font-semibold hover:underline pt-0.5 w-10 text-right" title="Jump to this point">
                      {formatTime(ch.start_ms)}
                    </button>
                    <div className="flex-1 min-w-0 border-l-2 border-cream-300 pl-4 pb-1">
                      <div className="flex items-center gap-2 mb-1">
                        {isClip ? <Radio size={11} className="text-sage shrink-0" /> : <Sparkles size={11} className="text-dusty shrink-0" />}
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
                            <span className="text-[0.7rem] text-ink-400">{ch.source_podcast}{ch.source_episode ? ` · ${ch.source_episode.slice(0, 50)}` : ''}</span>
                          )}
                          {ch.apple_podcasts_url && (
                            <a href={ch.apple_podcasts_url} target="_blank" rel="noopener noreferrer" className="text-ink-300 hover:text-terra inline-flex items-center gap-0.5 text-[0.7rem]">
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
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-6" onClick={() => setShowShortcuts(false)}>
          <div className="animate-entrance w-full max-w-[420px] rounded-2xl bg-cream-50 shadow-[0_20px_60px_rgba(30,24,20,0.25)] p-6" onClick={(e) => e.stopPropagation()}>
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
