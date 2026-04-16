import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, Download, ExternalLink, Sparkles, Radio } from 'lucide-react';
import TopicArtwork from './TopicArtwork';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
const SPEEDS  = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

function formatTime(ms) {
  if (!ms || isNaN(ms)) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SynthPlayer({ topic, title, jobId, audioUrl, chapters, sourcesUsed, durationMs, onBack }) {
  const [isPlaying, setIsPlaying]           = useState(false);
  const [currentMs, setCurrentMs]           = useState(0);
  const [totalMs, setTotalMs]               = useState(durationMs || 0);
  const [activeChapterIdx, setActiveChapterIdx] = useState(0);
  const [speed, setSpeed]                   = useState(1);
  const [isDragging, setIsDragging]         = useState(false);

  const audioRef    = useRef(null);
  const progressRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const ms = audio.currentTime * 1000;
      setCurrentMs(ms);
      let idx = 0;
      for (let i = 0; i < chapters.length; i++) {
        if (chapters[i].start_ms <= ms) idx = i; else break;
      }
      setActiveChapterIdx(idx);
    };
    const onLoaded = () => setTotalMs(audio.duration * 1000);
    const onEnded  = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnded);
    };
  }, [chapters]);

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); setIsPlaying(false); }
    else { audio.play().then(() => setIsPlaying(true)).catch(console.error); }
  };

  const skip = (s) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.currentTime + s, audio.duration || 0));
  };

  const jumpToChapter = (ch) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ch.start_ms / 1000;
    audio.play().then(() => setIsPlaying(true)).catch(console.error);
  };

  const seekToPosition = useCallback((clientX) => {
    const audio = audioRef.current;
    const bar   = progressRef.current;
    if (!audio || !bar) return;
    const rect = bar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = pct * (audio.duration || 0);
    setCurrentMs(pct * (audio.duration || 0) * 1000);
  }, []);

  const handleBarMouseDown = (e) => { setIsDragging(true); seekToPosition(e.clientX); };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => seekToPosition(e.clientX);
    const onUp   = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, seekToPosition]);

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

  const progress = totalMs > 0 ? (currentMs / totalMs) * 100 : 0;

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
              {sourcesUsed.length} sources · {formatTime(totalMs || durationMs)}
            </p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {sourcesUsed.map((s, i) => (
                <span key={i} className="px-2.5 py-0.5 rounded-full bg-white/8 border border-white/8 text-cream-400/70 text-[0.72rem]">{s}</span>
              ))}
            </div>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-cream-50/80 font-semibold text-sm hover:bg-white/15 transition-colors"
            >
              <Download size={13} /> Download MP3
            </button>
          </div>
        </div>

        {/* Player controls */}
        <div className="px-8 py-6 bg-cream-200 border-b border-ink-900/6">
          {/* Progress bar */}
          <div
            ref={progressRef}
            onMouseDown={handleBarMouseDown}
            className="w-full h-1.5 bg-cream-300 rounded-full cursor-pointer mb-2 select-none relative group"
          >
            <div
              className="h-full bg-terra rounded-full relative"
              style={{ width: `${progress}%`, transition: isDragging ? 'none' : 'width 0.2s linear' }}
            >
              <div className="absolute right-[-6px] top-[-3px] w-3 h-3 rounded-full bg-terra border-2 border-cream-50 cursor-grab shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <div className="flex justify-between text-ink-400 text-xs mb-5 tabular-nums">
            <span>{formatTime(currentMs)}</span>
            <span>{formatTime(totalMs || durationMs)}</span>
          </div>

          {/* Controls */}
          <div className="flex justify-center items-center gap-10 mb-5">
            <button onClick={() => skip(-15)} className="text-ink-500 hover:text-terra transition-colors flex flex-col items-center gap-0.5">
              <SkipBack size={20} /><span className="text-[0.55rem]">15s</span>
            </button>

            <button
              onClick={togglePlay}
              className={`w-[60px] h-[60px] rounded-full bg-terra text-cream-50 flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-all ${
                isPlaying ? 'shadow-[0_0_24px_rgba(191,86,48,0.35)]' : 'shadow-[0_4px_16px_rgba(30,24,20,0.12)]'
              }`}
            >
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
            </button>

            <button onClick={() => skip(15)} className="text-ink-500 hover:text-terra transition-colors flex flex-col items-center gap-0.5">
              <SkipForward size={20} /><span className="text-[0.55rem]">15s</span>
            </button>
          </div>

          {/* Speed */}
          <div className="flex justify-center gap-1.5">
            {SPEEDS.map(s => (
              <button key={s} onClick={() => setSpeed(s)} className={`px-2.5 py-1 rounded-full text-[0.72rem] transition-all cursor-pointer ${
                speed === s
                  ? 'border-2 border-terra bg-terra/8 text-terra-dark font-semibold'
                  : 'border border-ink-900/10 text-ink-400 hover:border-ink-900/20'
              }`}>
                {s}×
              </button>
            ))}
          </div>
        </div>

        {/* Chapters */}
        <div className="px-8 py-6">
          <h3 className="text-[0.68rem] text-ink-400 uppercase tracking-[0.12em] mb-3 font-semibold">
            Chapters · {chapters.length}
          </h3>
          <div className="flex flex-col gap-1">
            {chapters.map((ch, idx) => {
              const isActive = idx === activeChapterIdx;
              const isClip   = ch.type === 'clip';
              const clipSec  = ch.end_ms && ch.start_ms ? Math.round((ch.end_ms - ch.start_ms) / 1000) : null;
              return (
                <div
                  key={idx}
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

      </div>
    </div>
  );
}
