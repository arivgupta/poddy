import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, Download, ExternalLink, Sparkles, Radio } from 'lucide-react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
const SPEEDS  = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

function formatTime(ms) {
  if (!ms || isNaN(ms)) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SynthPlayer({ topic, jobId, audioUrl, chapters, sourcesUsed, durationMs, onBack }) {
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

  const handleDownload = () => window.open(`${BACKEND}/download/${jobId}`, '_blank');

  const progress = totalMs > 0 ? (currentMs / totalMs) * 100 : 0;

  return (
    <div style={{ width: '100%', maxWidth: '820px', animation: 'fadeSlideUp 0.4s ease' }}>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}

      {/* Back */}
      <button
        onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.9rem', background: 'transparent', marginBottom: '1.5rem', cursor: 'pointer', transition: 'color 0.2s', fontFamily: 'var(--font-body)' }}
        onMouseOver={e => e.currentTarget.style.color = 'var(--text-primary)'}
        onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}
      >
        <ChevronLeft size={16} /> New Poddy
      </button>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ padding: '2rem 2.5rem', display: 'flex', gap: '2rem', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
          {/* Artwork */}
          <div style={{ width: 120, height: 120, borderRadius: '16px', flexShrink: 0, position: 'relative', overflow: 'hidden', background: 'var(--bg-tertiary)', border: '1px solid var(--border-medium)' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'conic-gradient(var(--amber), var(--coral), var(--cyan), var(--amber))', animation: 'spin-slow 10s linear infinite', opacity: isPlaying ? 0.85 : 0.2, transition: 'opacity 1.5s' }} />
            <div style={{ position: 'absolute', inset: '5px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="display" style={{ fontSize: '2.8rem', fontWeight: 900, fontStyle: 'italic', color: 'rgba(245,166,35,0.12)' }}>S</span>
            </div>
            {isPlaying && (
              <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 3, alignItems: 'flex-end' }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} style={{ width: 3, borderRadius: 2, background: 'var(--amber)', animation: `float ${0.4 + i * 0.15}s ease-in-out infinite alternate`, height: `${6 + i * 3}px` }} />
                ))}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'inline-block', padding: '0.18rem 0.65rem', borderRadius: '50px', background: 'var(--amber-glow)', color: 'var(--amber)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.6rem', border: '1px solid var(--amber-border)' }}>
              AI Curated Poddy
            </div>
            <h2 className="display" style={{ fontSize: '1.55rem', fontWeight: 700, marginBottom: '0.35rem', lineHeight: 1.2 }}>{topic}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.85rem' }}>
              {sourcesUsed.length} sources · {formatTime(totalMs || durationMs)}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1rem' }}>
              {sourcesUsed.map((s, i) => (
                <span key={i} style={{ padding: '0.15rem 0.5rem', borderRadius: '50px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.74rem' }}>{s}</span>
              ))}
            </div>
            <button
              onClick={handleDownload}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.1rem', borderRadius: '50px', background: 'var(--amber-glow)', border: '1px solid var(--amber-border)', color: 'var(--amber)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'var(--font-body)' }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(245,166,35,0.25)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(245,166,35,0.2)'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'var(--amber-glow)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <Download size={13} /> Download MP3
            </button>
          </div>
        </div>

        {/* ── Player ─────────────────────────────────────────────────────── */}
        <div style={{ padding: '1.5rem 2.5rem', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--border-subtle)' }}>
          {/* Progress bar */}
          <div
            ref={progressRef}
            onMouseDown={handleBarMouseDown}
            style={{ width: '100%', height: 7, background: 'var(--bg-tertiary)', borderRadius: 4, cursor: 'pointer', marginBottom: '0.6rem', userSelect: 'none', position: 'relative' }}
          >
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--amber), var(--coral))', borderRadius: 4, position: 'relative', transition: isDragging ? 'none' : 'width 0.2s linear', boxShadow: '0 0 10px rgba(245,166,35,0.4)' }}>
              <div style={{ position: 'absolute', right: -6, top: -3.5, width: 14, height: 14, borderRadius: '50%', background: 'white', boxShadow: '0 0 0 3px rgba(245,166,35,0.5)', cursor: 'grab' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)', fontSize: '0.78rem', marginBottom: '1.25rem' }}>
            <span>{formatTime(currentMs)}</span>
            <span>{formatTime(totalMs || durationMs)}</span>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2.5rem', marginBottom: '1.25rem' }}>
            <button onClick={() => skip(-15)} style={{ background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem', transition: 'color 0.18s' }} onMouseOver={e => e.currentTarget.style.color = 'var(--amber)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
              <SkipBack size={22} /><span style={{ fontSize: '0.58rem' }}>15s</span>
            </button>

            <button
              onClick={togglePlay}
              style={{ width: 62, height: 62, borderRadius: '50%', background: 'linear-gradient(135deg, var(--amber), var(--coral))', color: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: isPlaying ? '0 0 30px rgba(245,166,35,0.5)' : '0 6px 20px rgba(0,0,0,0.5)', transition: 'all 0.2s', flexShrink: 0 }}
              onMouseOver={e => e.currentTarget.style.transform = 'scale(1.06)'}
              onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {isPlaying ? <Pause size={26} fill="black" /> : <Play size={26} fill="black" style={{ marginLeft: 3 }} />}
            </button>

            <button onClick={() => skip(15)} style={{ background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem', transition: 'color 0.18s' }} onMouseOver={e => e.currentTarget.style.color = 'var(--amber)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
              <SkipForward size={22} /><span style={{ fontSize: '0.58rem' }}>15s</span>
            </button>
          </div>

          {/* Speed */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            {SPEEDS.map(s => (
              <button key={s} onClick={() => setSpeed(s)} style={{ padding: '0.22rem 0.6rem', borderRadius: '50px', border: `1px solid ${speed === s ? 'var(--amber)' : 'var(--border-subtle)'}`, background: speed === s ? 'var(--amber-glow)' : 'transparent', color: speed === s ? 'var(--amber)' : 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: speed === s ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-body)' }}>
                {s}×
              </button>
            ))}
          </div>
        </div>

        {/* ── Chapters ────────────────────────────────────────────────────── */}
        <div style={{ padding: '1.5rem 2.5rem' }}>
          <h3 style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.85rem', fontWeight: 600 }}>
            Chapters · {chapters.length}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {chapters.map((ch, idx) => {
              const isActive = idx === activeChapterIdx;
              const isClip   = ch.type === 'clip';
              const clipSec  = ch.end_ms && ch.start_ms ? Math.round((ch.end_ms - ch.start_ms) / 1000) : null;
              return (
                <div
                  key={idx}
                  onClick={() => jumpToChapter(ch)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.8rem 1rem', borderRadius: '10px', background: isActive ? 'var(--amber-glow)' : 'var(--bg-secondary)', border: `1px solid ${isActive ? 'var(--amber-border)' : 'transparent'}`, cursor: 'pointer', transition: 'all 0.18s' }}
                  onMouseOver={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}}
                  onMouseOut={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.borderColor = 'transparent'; }}}
                >
                  <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: isClip ? 'var(--cyan-glow)' : 'var(--coral-glow)', border: `1px solid ${isClip ? 'rgba(0,212,255,0.3)' : 'rgba(255,75,54,0.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isClip ? <Radio size={11} color="var(--cyan)" /> : <Sparkles size={11} color="var(--coral)" />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--amber)' : 'var(--text-primary)', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ch.title}
                    </div>
                    {isClip && ch.source_podcast && (
                      <div style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem', marginTop: '0.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ch.source_podcast}{ch.source_episode ? ` · ${ch.source_episode.slice(0, 40)}…` : ''}
                        {clipSec ? ` · ${Math.floor(clipSec/60)}m${clipSec%60}s` : ''}
                      </div>
                    )}
                  </div>

                  <span style={{ color: isActive ? 'var(--amber)' : 'var(--text-tertiary)', fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {formatTime(ch.start_ms)}
                  </span>

                  {isClip && ch.apple_podcasts_url && (
                    <a href={ch.apple_podcasts_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Open original episode"
                      style={{ color: 'var(--text-muted)', flexShrink: 0, transition: 'color 0.18s' }}
                      onMouseOver={e => e.currentTarget.style.color = 'var(--amber)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      <ExternalLink size={12} />
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
