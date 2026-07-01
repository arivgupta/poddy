import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Play, Pause, RotateCcw, RotateCw, Download,
  ExternalLink, Sparkles, Gauge, Check, Layers, Clock,
} from 'lucide-react';
import EpisodeArt from '../components/EpisodeArt';
import Waveform from '../components/Waveform';
import { formatClock, formatDuration } from '../lib/format';
import { downloadUrl } from '../lib/api';

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

function SpeedMenu({ speed, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Playback speed ${speed}x`}
        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 font-mono text-[0.78rem] font-medium transition-colors ${
          speed !== 1
            ? 'border-ember-500/45 bg-ember-500/10 text-ember-300'
            : 'border-cream-50/12 text-cream-300 hover:border-cream-50/25'
        }`}
      >
        <Gauge size={14} />
        {speed}×
      </button>
      {open && (
        <div className="animate-scale-in absolute right-0 bottom-[calc(100%+8px)] z-20 w-[110px] overflow-hidden rounded-xl border border-cream-50/10 bg-night-700 py-1 shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3.5 py-1.5 font-mono text-[0.78rem] transition-colors hover:bg-cream-50/6 ${
                s === speed ? 'text-ember-300' : 'text-cream-300'
              }`}
            >
              {s}×
              {s === speed && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChapterRow({ chapter, clipNumber, isActive, isPlaying, onJump }) {
  const isClip = chapter.type === 'clip';
  const clipLength =
    isClip && chapter.end_ms > chapter.start_ms
      ? Math.round((chapter.end_ms - chapter.start_ms) / 1000)
      : null;

  return (
    <button
      onClick={() => onJump(chapter)}
      className={`group relative flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
        isActive
          ? 'border-ember-500/30 bg-ember-500/[0.08]'
          : 'border-transparent hover:border-cream-50/8 hover:bg-cream-50/[0.03]'
      }`}
      aria-current={isActive ? 'true' : undefined}
    >
      {isActive && <span className="absolute top-3 bottom-3 left-0 w-[3px] rounded-full bg-ember-500" />}

      {/* Index / type marker */}
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-mono text-[0.72rem] ${
          isClip
            ? isActive
              ? 'border-ember-500/40 bg-ember-500/15 text-ember-300'
              : 'border-cream-50/10 bg-cream-50/[0.04] text-cream-400'
            : 'border-gold-300/20 bg-gold-300/[0.06] text-gold-300'
        }`}
      >
        {isClip ? (
          String(clipNumber).padStart(2, '0')
        ) : (
          <Sparkles size={13} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={`truncate text-[0.92rem] ${
              isActive ? 'font-semibold text-cream-50' : 'font-medium text-cream-200'
            }`}
          >
            {chapter.title}
          </span>
          {isActive && isPlaying && (
            <span className="eq shrink-0 text-ember-400" aria-label="Playing">
              <i /><i /><i /><i />
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[0.72rem] text-cream-500">
          {isClip ? (
            <>
              {chapter.source_podcast}
              {clipLength ? ` · ${Math.floor(clipLength / 60)}m ${clipLength % 60}s` : ''}
            </>
          ) : (
            'Narration'
          )}
        </span>
      </span>

      <span className={`shrink-0 font-mono text-[0.72rem] ${isActive ? 'text-ember-300' : 'text-cream-500'}`}>
        {formatClock(chapter.start_ms)}
      </span>

      {isClip && chapter.apple_podcasts_url && (
        <a
          href={chapter.apple_podcasts_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open the original episode"
          className="shrink-0 rounded-md p-1 text-cream-600 opacity-0 transition-all group-hover:opacity-100 hover:text-ember-300"
        >
          <ExternalLink size={13} />
        </a>
      )}
    </button>
  );
}

export default function Player({ player, episode, onBack }) {
  const { isPlaying, currentMs, durationMs, speed } = player;
  const chapters = useMemo(() => episode.chapters || [], [episode.chapters]);
  const sources = episode.sourcesUsed || [];
  const totalMs = durationMs || episode.durationMs || 0;

  const [showRemaining, setShowRemaining] = useState(false);

  const activeChapterIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].start_ms <= currentMs) idx = i;
      else break;
    }
    return idx;
  }, [chapters, currentMs]);

  // Pre-compute clip numbering (narration segments don't count).
  const clipNumbers = useMemo(() => {
    let n = 0;
    return chapters.map((c) => (c.type === 'clip' ? ++n : null));
  }, [chapters]);

  const clipCount = clipNumbers.reduce((max, n) => (n ? Math.max(max, n) : max), 0);

  const jumpTo = (chapter) => {
    player.seekMs(chapter.start_ms);
    player.play();
  };

  const handleDownload = () => {
    const src = player.getCurrentSrc();
    const filename = `Poddy — ${(episode.title || episode.topic).replace(/[/\\]/g, '-').slice(0, 60)}.mp3`;
    if (src.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = src;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      window.open(downloadUrl(episode.jobId), '_blank');
    }
  };

  return (
    <div className="animate-entrance mx-auto w-full max-w-[760px] px-5 pt-6 pb-32">
      {/* Back */}
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-1 text-[0.85rem] font-medium text-cream-400 transition-colors hover:text-cream-100"
      >
        <ChevronLeft size={16} /> Back
      </button>

      {/* Hero */}
      <div className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className={`relative shrink-0 transition-shadow duration-500 ${isPlaying ? 'shadow-[0_0_60px_-12px_rgba(233,104,58,0.45)]' : 'shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]'}`}>
          <EpisodeArt
            seed={episode.topic}
            title={episode.title}
            playing={isPlaying}
            className="h-44 w-44 rounded-3xl border border-cream-50/10"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-2.5 font-mono text-[0.65rem] tracking-[0.26em] text-ember-400 uppercase">
            {isPlaying ? 'Now playing' : 'Ready to play'}
          </p>
          <h1 className="mb-1.5 font-display text-[clamp(1.6rem,4vw,2.3rem)] leading-[1.12] font-semibold text-cream-50">
            {episode.title || episode.topic}
          </h1>
          {episode.title && episode.title.toLowerCase() !== episode.topic.toLowerCase() && (
            <p className="mb-3 truncate text-[0.85rem] text-cream-500">from your prompt: {episode.topic}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.78rem] text-cream-400">
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="text-cream-500" /> {formatDuration(totalMs)}
            </span>
            <span className="flex items-center gap-1.5">
              <Layers size={13} className="text-cream-500" /> {clipCount} clips · {sources.length} shows
            </span>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-full border border-cream-50/12 px-3 py-1 font-medium text-cream-300 transition-colors hover:border-ember-500/40 hover:text-ember-300"
            >
              <Download size={12} /> MP3
            </button>
          </div>

          {sources.length > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {sources.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-cream-50/8 bg-cream-50/[0.04] px-2.5 py-1 text-[0.7rem] font-medium text-cream-300"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transport */}
      <div className="surface rounded-[26px] px-6 pt-5 pb-6 sm:px-8">
        <Waveform
          seed={episode.jobId || episode.topic}
          currentMs={currentMs}
          durationMs={totalMs}
          chapters={chapters}
          onSeek={player.seekMs}
        />

        <div className="mt-1 mb-5 flex items-center justify-between font-mono text-[0.72rem] text-cream-500">
          <span>{formatClock(currentMs)}</span>
          <button
            onClick={() => setShowRemaining((v) => !v)}
            className="transition-colors hover:text-cream-200"
            title="Toggle remaining time"
          >
            {showRemaining ? `−${formatClock(Math.max(0, totalMs - currentMs))}` : formatClock(totalMs)}
          </button>
        </div>

        <div className="relative flex items-center justify-center gap-8">
          <button
            onClick={() => player.skip(-15)}
            aria-label="Back 15 seconds"
            className="group flex flex-col items-center gap-1 text-cream-300 transition-colors hover:text-cream-50"
          >
            <RotateCcw size={22} strokeWidth={1.8} />
            <span className="font-mono text-[0.58rem] text-cream-500 group-hover:text-cream-300">15</span>
          </button>

          <button
            onClick={player.toggle}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className={`flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-ember-400 to-ember-600 text-night-950 transition-all duration-300 hover:scale-[1.04] active:scale-[0.97] ${
              isPlaying
                ? 'shadow-[0_0_44px_rgba(233,104,58,0.5)]'
                : 'shadow-[0_10px_32px_rgba(233,104,58,0.35)]'
            }`}
          >
            {isPlaying ? (
              <Pause size={27} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={27} fill="currentColor" strokeWidth={0} className="ml-1" />
            )}
          </button>

          <button
            onClick={() => player.skip(15)}
            aria-label="Forward 15 seconds"
            className="group flex flex-col items-center gap-1 text-cream-300 transition-colors hover:text-cream-50"
          >
            <RotateCw size={22} strokeWidth={1.8} />
            <span className="font-mono text-[0.58rem] text-cream-500 group-hover:text-cream-300">15</span>
          </button>

          <div className="absolute right-0">
            <SpeedMenu speed={speed} onChange={player.setSpeed} />
          </div>
        </div>

        <p className="mt-5 hidden text-center font-mono text-[0.62rem] tracking-wide text-cream-600 sm:block">
          space play/pause · ← → skip 15s
        </p>
      </div>

      {/* Chapters */}
      {chapters.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-4 px-1">
            <h2 className="shrink-0 font-mono text-[0.66rem] font-medium tracking-[0.26em] text-cream-500 uppercase">
              Chapters · {chapters.length}
            </h2>
            <div className="h-px flex-1 bg-cream-50/8" />
          </div>
          <div className="flex flex-col gap-1">
            {chapters.map((chapter, i) => (
              <ChapterRow
                key={i}
                chapter={chapter}
                clipNumber={clipNumbers[i]}
                isActive={i === activeChapterIdx}
                isPlaying={isPlaying}
                onJump={jumpTo}
              />
            ))}
          </div>
          <p className="mt-5 px-1 text-[0.72rem] leading-relaxed text-cream-600">
            Every clip links back to its original episode — tap
            <ExternalLink size={11} className="mx-1 inline" />
            to hear the full conversation.
          </p>
        </div>
      )}
    </div>
  );
}
