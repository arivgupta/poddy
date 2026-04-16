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
    <div className="entrance" style={{ width: '100%', maxWidth: '540px', textAlign: 'center' }}>

      {/* Animated orb */}
      <div style={{ position: 'relative', width: 110, height: 110, margin: '0 auto 2.5rem' }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'conic-gradient(var(--accent), #D4915A, var(--clip-accent), var(--accent))',
          animation: 'spin-slow 6s linear infinite',
          opacity: 0.35,
          filter: 'blur(6px)',
        }} />
        <div style={{
          position: 'absolute', inset: 5, borderRadius: '50%',
          background: 'var(--bg-base)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <StageIcon size={28} color="var(--accent)" style={{ animation: stageInfo.icon === Loader2 ? 'spin-slow 1.2s linear infinite' : undefined }} />
        </div>
        <div style={{
          position: 'absolute', inset: -6, borderRadius: '50%',
          border: '1.5px solid var(--accent)',
          opacity: 0.12,
          animation: 'pulse-ring 3s ease-in-out infinite',
        }} />
      </div>

      <h2 className="display" style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>
        Curating <em className="text-gradient" style={{ fontStyle: 'italic' }}>"{title || topic}"</em>
      </h2>
      {title && title !== topic && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginBottom: '0.2rem', fontStyle: 'italic' }}>{topic}</p>
      )}

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem', minHeight: '1.4rem' }}>
        {stageInfo.text}{dots}
      </p>

      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.76rem', marginBottom: sourceNames.length > 0 ? '1rem' : '1.75rem' }}>
        {elapsedMin > 0 ? `${elapsedMin}m ${elapsedSec}s` : `${elapsedSec}s`} elapsed · Usually takes {etaText}
      </p>

      {sourceNames.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center', marginBottom: '1.75rem' }}>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem', width: '100%', marginBottom: '0.1rem', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>Sources selected</span>
          {sourceNames.map((name, i) => (
            <span key={i} style={{ padding: '0.22rem 0.65rem', borderRadius: '50px', background: 'var(--bg-surface)', border: '1px solid var(--accent-border)', color: 'var(--accent-text)', fontSize: '0.8rem', fontWeight: 500 }}>
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Progress */}
      <div style={{ background: 'var(--bg-wash)', borderRadius: 6, height: 4, marginBottom: '0.5rem', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--accent)',
          borderRadius: 6,
          transition: 'width 0.6s var(--ease-out)',
        }} />
      </div>
      <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginBottom: '2rem', textAlign: 'right' }}>
        {pct}%
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left', marginBottom: '1.75rem' }}>
        {STAGES_ORDER.map((s, i) => {
          const done    = i < stageIdx;
          const active  = i === stageIdx;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.5rem 0.75rem', borderRadius: '8px', background: active ? 'var(--accent-subtle)' : 'transparent', border: `1px solid ${active ? 'var(--accent-border)' : 'transparent'}`, transition: `all var(--dur-std) var(--ease-out)` }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: done ? 'var(--accent)' : active ? 'var(--narration-accent)' : 'var(--text-muted)', boxShadow: active ? '0 0 5px var(--narration-accent)' : 'none', transition: `all var(--dur-std) var(--ease-out)` }} />
              <span style={{ fontSize: '0.82rem', color: done ? 'var(--text-secondary)' : active ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: active ? 500 : 400 }}>
                {STAGE_LABELS[s]?.text || s}
              </span>
            </div>
          );
        })}
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.5rem 1.15rem', borderRadius: '50px',
            background: 'transparent', border: '1px solid var(--border-medium)',
            color: 'var(--text-tertiary)', fontSize: '0.8rem', fontWeight: 500,
            cursor: 'pointer', transition: `all var(--dur-fast) var(--ease-out)`,
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--error)'; e.currentTarget.style.color = 'var(--error)'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-medium)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
        >
          <X size={12} /> Cancel
        </button>
      )}
    </div>
  );
}
