import React, { useEffect, useState } from 'react';
import { Loader2, Radio, Search, Sparkles, Headphones } from 'lucide-react';

const STAGE_LABELS = {
  queued:                   { text: 'Initialising…',                icon: Loader2 },
  discovering_sources:      { text: 'Finding the best episodes…',   icon: Search },
  downloading_transcribing: { text: 'Downloading & transcribing…',  icon: Headphones },
  extracting_clips:         { text: 'Extracting key moments…',      icon: Radio },
  building_curriculum:      { text: 'Building your curriculum…',    icon: Sparkles },
  writing_narration:        { text: 'Writing narration…',           icon: Sparkles },
  loading_audio:            { text: 'Loading audio…',               icon: Loader2 },
  stitching:                { text: 'Assembling your Poddy…',   icon: Sparkles },
};

const STAGES_ORDER = ['queued', 'discovering_sources', 'downloading_transcribing', 'extracting_clips', 'building_curriculum', 'writing_narration', 'loading_audio', 'stitching'];

export default function CuratorLoadingState({ topic, status, sourceNames }) {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const iv = setInterval(() => setDots(d => d.length < 3 ? d + '.' : ''), 500);
    return () => clearInterval(iv);
  }, []);

  const stageIdx   = STAGES_ORDER.indexOf(status);
  const stageInfo  = STAGE_LABELS[status] || STAGE_LABELS.queued;
  const StageIcon  = stageInfo.icon;
  const pct        = stageIdx < 0 ? 0 : Math.round(((stageIdx + 1) / STAGES_ORDER.length) * 100);

  return (
    <div style={{ width: '100%', maxWidth: '560px', textAlign: 'center', animation: 'fadeSlideUp 0.4s ease' }}>

      {/* Animated logo orb */}
      <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 2.5rem' }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'conic-gradient(var(--amber), var(--coral), var(--cyan), var(--amber))',
          animation: 'spin-slow 3s linear infinite',
          opacity: 0.5,
          filter: 'blur(8px)',
        }} />
        <div style={{
          position: 'absolute', inset: 6, borderRadius: '50%',
          background: 'var(--bg-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <StageIcon size={30} color="var(--amber)" style={{ animation: stageInfo.icon === Loader2 ? 'spin-slow 1.2s linear infinite' : undefined }} />
        </div>
        {/* Outer pulse ring */}
        <div style={{
          position: 'absolute', inset: -8, borderRadius: '50%',
          border: '2px solid var(--amber)',
          opacity: 0.15,
          animation: 'pulseGlow 2.5s ease-in-out infinite',
        }} />
      </div>

      <h2 className="display" style={{ fontSize: '1.85rem', fontWeight: 700, marginBottom: '0.65rem' }}>
        Curating <span className="text-gradient">"{topic}"</span>
      </h2>

      <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: sourceNames.length > 0 ? '1rem' : '2.5rem', minHeight: '1.5rem' }}>
        {stageInfo.text}{dots}
      </p>

      {/* Source badges — shown FIRST as soon as discovered */}
      {sourceNames.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', marginBottom: '2rem' }}>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', width: '100%', marginBottom: '0.15rem' }}>Sources selected:</span>
          {sourceNames.map((name, i) => (
            <span key={i} style={{ padding: '0.28rem 0.75rem', borderRadius: '50px', background: 'var(--bg-elevated)', border: '1px solid var(--amber-border)', color: 'var(--amber)', fontSize: '0.82rem', fontWeight: 500 }}>
              {name}
            </span>
          ))}
        </div>
      )}
      {/* Progress bar */}
      <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, height: 6, marginBottom: '0.6rem', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--amber), var(--coral))',
          borderRadius: 8,
          transition: 'width 0.6s ease',
          boxShadow: '0 0 12px rgba(245,166,35,0.5)',
        }} />
      </div>
      <div style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem', marginBottom: '2.5rem', textAlign: 'right' }}>
        {pct}%
      </div>

      {/* Stage steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
        {STAGES_ORDER.map((s, i) => {
          const done    = i < stageIdx;
          const active  = i === stageIdx;
          const pending = i > stageIdx;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0.85rem', borderRadius: '10px', background: active ? 'var(--amber-glow)' : 'transparent', border: `1px solid ${active ? 'var(--amber-border)' : 'transparent'}`, transition: 'all 0.3s' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: done ? 'var(--amber)' : active ? 'var(--coral)' : 'var(--text-muted)', boxShadow: active ? '0 0 8px var(--coral)' : 'none', transition: 'all 0.3s' }} />
              <span style={{ fontSize: '0.83rem', color: done ? 'var(--text-secondary)' : active ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: active ? 500 : 400 }}>
                {STAGE_LABELS[s]?.text || s}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
