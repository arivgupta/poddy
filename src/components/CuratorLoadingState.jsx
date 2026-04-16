import React, { useEffect, useState, useRef } from 'react';
import { Loader2, Radio, Search, Sparkles, Headphones, X } from 'lucide-react';

const STAGE_LABELS = {
  queued:                   { text: 'Initialising…',                icon: Loader2 },
  discovering_sources:      { text: 'Finding the best episodes…',   icon: Search },
  downloading_transcribing: { text: 'Downloading & transcribing…',  icon: Headphones },
  extracting_clips:         { text: 'Extracting key moments…',      icon: Radio },
  building_curriculum:      { text: 'Building your curriculum…',    icon: Sparkles },
  writing_narration:        { text: 'Writing narration…',           icon: Sparkles },
  loading_audio:            { text: 'Loading audio…',               icon: Loader2 },
  stitching:                { text: 'Assembling your Poddy…',       icon: Sparkles },
};

const STAGES_ORDER = ['queued', 'discovering_sources', 'downloading_transcribing', 'extracting_clips', 'building_curriculum', 'writing_narration', 'loading_audio', 'stitching'];

const ETA_RANGES = {
  quick:    '3–6 minutes',
  standard: '5–10 minutes',
  deep:     '10–20 minutes',
};

export default function CuratorLoadingState({ topic, title, status, sourceNames, onCancel, depth }) {
  const [dots, setDots] = useState('');
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    startRef.current = Date.now();
    const iv = setInterval(() => {
      setDots(d => d.length < 3 ? d + '.' : '');
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 500);
    return () => clearInterval(iv);
  }, []);

  const stageIdx   = STAGES_ORDER.indexOf(status);
  const stageInfo  = STAGE_LABELS[status] || STAGE_LABELS.queued;
  const StageIcon  = stageInfo.icon;
  const pct        = stageIdx < 0 ? 0 : Math.round(((stageIdx + 1) / STAGES_ORDER.length) * 100);
  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;
  const etaText    = ETA_RANGES[depth] || ETA_RANGES.standard;

  return (
    <div style={{ width: '100%', maxWidth: '560px', textAlign: 'center', animation: 'fadeSlideUp var(--dur-slow) var(--ease-out)' }}>

      {/* Animated orb */}
      <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 2.5rem' }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'conic-gradient(var(--accent-dim), var(--accent), var(--clip-accent), var(--accent-dim))',
          animation: 'spin-slow 5s linear infinite',
          opacity: 0.4,
          filter: 'blur(6px)',
        }} />
        <div style={{
          position: 'absolute', inset: 6, borderRadius: '50%',
          background: 'var(--bg-base)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <StageIcon size={30} color="var(--accent)" style={{ animation: stageInfo.icon === Loader2 ? 'spin-slow 1.2s linear infinite' : undefined }} />
        </div>
        <div style={{
          position: 'absolute', inset: -8, borderRadius: '50%',
          border: '2px solid var(--accent)',
          opacity: 0.10,
          animation: 'pulse-ring 2.5s ease-in-out infinite',
        }} />
      </div>

      <h2 className="display" style={{ fontSize: '1.85rem', marginBottom: '0.65rem' }}>
        Curating <span className="text-gradient">"{title || topic}"</span>
      </h2>
      {title && title !== topic && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginBottom: '0.25rem', fontStyle: 'italic' }}>{topic}</p>
      )}

      <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: '0.5rem', minHeight: '1.5rem' }}>
        {stageInfo.text}{dots}
      </p>

      {/* Elapsed + ETA */}
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem', marginBottom: sourceNames.length > 0 ? '1rem' : '2rem' }}>
        {elapsedMin > 0 ? `${elapsedMin}m ${elapsedSec}s` : `${elapsedSec}s`} elapsed · Usually takes {etaText}
      </p>

      {/* Source badges */}
      {sourceNames.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', marginBottom: '2rem' }}>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', width: '100%', marginBottom: '0.15rem' }}>Sources selected:</span>
          {sourceNames.map((name, i) => (
            <span key={i} style={{ padding: '0.28rem 0.75rem', borderRadius: '50px', background: 'var(--bg-elevated)', border: '1px solid var(--accent-border)', color: 'var(--accent)', fontSize: '0.82rem', fontWeight: 500 }}>
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Progress bar */}
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, height: 5, marginBottom: '0.6rem', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--accent)',
          borderRadius: 8,
          transition: 'width 0.6s var(--ease-out)',
        }} />
      </div>
      <div style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem', marginBottom: '2.5rem', textAlign: 'right' }}>
        {pct}%
      </div>

      {/* Stage steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left', marginBottom: '2rem' }}>
        {STAGES_ORDER.map((s, i) => {
          const done    = i < stageIdx;
          const active  = i === stageIdx;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0.85rem', borderRadius: '10px', background: active ? 'var(--accent-subtle)' : 'transparent', border: `1px solid ${active ? 'var(--accent-border)' : 'transparent'}`, transition: `all var(--dur-std) var(--ease-out)` }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: done ? 'var(--accent)' : active ? 'var(--narration-accent)' : 'var(--text-muted)', boxShadow: active ? '0 0 6px var(--narration-accent)' : 'none', transition: `all var(--dur-std) var(--ease-out)` }} />
              <span style={{ fontSize: '0.83rem', color: done ? 'var(--text-secondary)' : active ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: active ? 500 : 400 }}>
                {STAGE_LABELS[s]?.text || s}
              </span>
            </div>
          );
        })}
      </div>

      {/* Cancel */}
      {onCancel && (
        <button
          onClick={onCancel}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.55rem 1.25rem', borderRadius: '50px',
            background: 'transparent', border: '1px solid var(--border-subtle)',
            color: 'var(--text-tertiary)', fontSize: '0.82rem', fontWeight: 500,
            cursor: 'pointer', transition: `all var(--dur-fast) var(--ease-out)`, fontFamily: 'var(--font-body)',
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--error)'; e.currentTarget.style.color = 'var(--error)'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
        >
          <X size={13} /> Cancel
        </button>
      )}
    </div>
  );
}
