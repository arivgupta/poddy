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
    <div className="entrance" style={{ width: '100%', maxWidth: '820px' }}>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}

      {/* Back */}
      <button
        onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.88rem', background: 'transparent', marginBottom: '1.5rem', cursor: 'pointer', transition: `color var(--dur-fast) var(--ease-out)` }}
        onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'}
        onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}
      >
        <ChevronLeft size={16} /> New Poddy
      </button>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>

        {/* ── Header ─────────────────────────────── */}
        <div style={{ padding: '2rem 2rem', display: 'flex', gap: '1.75rem', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
          <TopicArtwork topic={topic} title={title} size={120} isPlaying={isPlaying} />

          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '50px', background: 'var(--accent-subtle)', color: 'var(--accent-text)', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.55rem', border: '1px solid var(--accent-border)' }}>
              Poddy
            </div>
            <h2 className="display" style={{ fontSize: '1.6rem', marginBottom: '0.2rem', lineHeight: 1.15 }}>{title || topic}</h2>
            {title && title !== topic && (
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginBottom: '0.35rem', fontStyle: 'italic' }}>{topic}</p>
            )}
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginBottom: '0.75rem' }}>
              {sourcesUsed.length} sources · {formatTime(totalMs || durationMs)}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.85rem' }}>
              {sourcesUsed.map((s, i) => (
                <span key={i} style={{ padding: '0.12rem 0.45rem', borderRadius: '50px', background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{s}</span>
              ))}
            </div>
            <button
              onClick={handleDownload}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 1rem', borderRadius: '50px', background: 'var(--bg-inset)', border: '1px solid var(--border-medium)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', transition: `all var(--dur-fast) var(--ease-out)` }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent-text)'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-medium)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <Download size={12} /> Download MP3
            </button>
          </div>
        </div>

        {/* ── Player ─────────────────────────────── */}
        <div style={{ padding: '1.4rem 2rem', background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-subtle)' }}>
          {/* Progress */}
          <div
            ref={progressRef}
            onMouseDown={handleBarMouseDown}
            style={{ width: '100%', height: 5, background: 'var(--bg-wash)', borderRadius: 3, cursor: 'pointer', marginBottom: '0.5rem', userSelect: 'none', position: 'relative' }}
          >
            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, position: 'relative', transition: isDragging ? 'none' : 'width 0.2s linear' }}>
              <div style={{ position: 'absolute', right: -5, top: -3, width: 11, height: 11, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-surface)', cursor: 'grab', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)', fontSize: '0.75rem', marginBottom: '1.1rem', fontVariantNumeric: 'tabular-nums' }}>
            <span>{formatTime(currentMs)}</span>
            <span>{formatTime(totalMs || durationMs)}</span>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2.5rem', marginBottom: '1.1rem' }}>
            <button onClick={() => skip(-15)} style={{ background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem', transition: `color var(--dur-fast) var(--ease-out)` }} onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
              <SkipBack size={20} /><span style={{ fontSize: '0.55rem' }}>15s</span>
            </button>

            <button
              onClick={togglePlay}
              style={{
                width: 58, height: 58, borderRadius: '50%',
                background: 'var(--accent)', color: 'var(--bg-surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: isPlaying ? '0 0 20px rgba(191,86,48,0.30)' : '0 3px 12px rgba(30,24,20,0.12)',
                transition: `all var(--dur-fast) var(--ease-out)`, flexShrink: 0,
              }}
              onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {isPlaying ? <Pause size={24} fill="var(--bg-surface)" /> : <Play size={24} fill="var(--bg-surface)" style={{ marginLeft: 2 }} />}
            </button>

            <button onClick={() => skip(15)} style={{ background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem', transition: `color var(--dur-fast) var(--ease-out)` }} onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
              <SkipForward size={20} /><span style={{ fontSize: '0.55rem' }}>15s</span>
            </button>
          </div>

          {/* Speed */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.3rem' }}>
            {SPEEDS.map(s => (
              <button key={s} onClick={() => setSpeed(s)} style={{
                padding: '0.18rem 0.55rem', borderRadius: '50px',
                border: `1px solid ${speed === s ? 'var(--accent)' : 'var(--border-medium)'}`,
                background: speed === s ? 'var(--accent-subtle)' : 'transparent',
                color: speed === s ? 'var(--accent-text)' : 'var(--text-tertiary)',
                fontSize: '0.72rem', fontWeight: speed === s ? 600 : 400,
                cursor: 'pointer', transition: `all var(--dur-fast) var(--ease-out)`,
              }}>
                {s}×
              </button>
            ))}
          </div>
        </div>

        {/* ── Chapters ───────────────────────────── */}
        <div style={{ padding: '1.4rem 2rem' }}>
          <h3 style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem', fontWeight: 600 }}>
            Chapters · {chapters.length}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {chapters.map((ch, idx) => {
              const isActive = idx === activeChapterIdx;
              const isClip   = ch.type === 'clip';
              const clipSec  = ch.end_ms && ch.start_ms ? Math.round((ch.end_ms - ch.start_ms) / 1000) : null;
              return (
                <div
                  key={idx}
                  onClick={() => jumpToChapter(ch)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.7rem',
                    padding: '0.7rem 0.85rem', borderRadius: '10px',
                    background: isActive ? 'var(--accent-subtle)' : 'transparent',
                    border: `1px solid ${isActive ? 'var(--accent-border)' : 'transparent'}`,
                    cursor: 'pointer', transition: `all var(--dur-fast) var(--ease-out)`,
                  }}
                  onMouseOver={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-inset)'; }}}
                  onMouseOut={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; }}}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    background: isClip ? 'rgba(61,122,95,0.08)' : 'rgba(158,116,98,0.08)',
                    border: `1px solid ${isClip ? 'rgba(61,122,95,0.18)' : 'rgba(158,116,98,0.18)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isClip ? <Radio size={10} color="var(--clip-accent)" /> : <Sparkles size={10} color="var(--narration-accent)" />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--accent-text)' : 'var(--text-primary)', fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ch.title}
                    </div>
                    {isClip && ch.source_podcast && (
                      <div style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem', marginTop: '0.05rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ch.source_podcast}{ch.source_episode ? ` · ${ch.source_episode.slice(0, 40)}…` : ''}
                        {clipSec ? ` · ${Math.floor(clipSec/60)}m${clipSec%60}s` : ''}
                      </div>
                    )}
                  </div>

                  <span style={{ color: isActive ? 'var(--accent-text)' : 'var(--text-tertiary)', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {formatTime(ch.start_ms)}
                  </span>

                  {isClip && ch.apple_podcasts_url && (
                    <a href={ch.apple_podcasts_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Open original episode"
                      style={{ color: 'var(--text-muted)', flexShrink: 0, transition: `color var(--dur-fast) var(--ease-out)` }}
                      onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
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
