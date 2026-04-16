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
    <div className="animate-entrance w-full max-w-[540px] text-center">

      {/* Animated orb */}
      <div className="relative w-28 h-28 mx-auto mb-10">
        <div
          className="absolute inset-0 rounded-full opacity-40 blur-md animate-spin-slow"
          style={{ background: 'conic-gradient(var(--color-terra), #D4915A, var(--color-sage), var(--color-terra))' }}
        />
        <div className="absolute inset-[5px] rounded-full bg-cream-100 flex items-center justify-center">
          <StageIcon
            size={28}
            className="text-terra"
            style={{ animation: stageInfo.icon === Loader2 ? 'spin-slow 1.2s linear infinite' : undefined }}
          />
        </div>
        <div className="absolute inset-[-6px] rounded-full border-[1.5px] border-terra/12 animate-pulse-ring" />
      </div>

      <h2 className="font-display font-semibold text-[1.8rem] mb-2">
        Curating <span className="text-terra">"{title || topic}"</span>
      </h2>
      {title && title !== topic && (
        <p className="text-ink-400 text-sm mb-1">{topic}</p>
      )}

      <p className="text-ink-500 text-base mb-1.5 min-h-[1.4rem]">
        {stageInfo.text}{dots}
      </p>

      <p className={`text-ink-400 text-xs ${sourceNames.length > 0 ? 'mb-4' : 'mb-7'}`}>
        {elapsedMin > 0 ? `${elapsedMin}m ${elapsedSec}s` : `${elapsedSec}s`} elapsed · Usually takes {etaText}
      </p>

      {sourceNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center mb-7">
          <span className="text-ink-400 text-[0.72rem] w-full mb-0.5 tracking-[0.06em] uppercase font-medium">Sources selected</span>
          {sourceNames.map((name, i) => (
            <span key={i} className="px-3 py-1 rounded-full bg-cream-50 border border-terra/20 text-terra-dark text-sm font-medium">
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Progress */}
      <div className="bg-cream-300 rounded-full h-1.5 mb-2 overflow-hidden">
        <div
          className="h-full bg-terra rounded-full transition-[width] duration-600 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-ink-400 text-xs mb-8 text-right">{pct}%</div>

      {/* Steps */}
      <div className="flex flex-col gap-1.5 text-left mb-7">
        {STAGES_ORDER.map((s, i) => {
          const done    = i < stageIdx;
          const active  = i === stageIdx;
          return (
            <div key={s} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
              active ? 'bg-terra/6 border border-terra/15' : 'border border-transparent'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                done ? 'bg-terra' : active ? 'bg-dusty shadow-[0_0_5px_var(--color-dusty)]' : 'bg-ink-300'
              }`} />
              <span className={`text-sm ${
                done ? 'text-ink-500' : active ? 'text-ink-900 font-medium' : 'text-ink-300'
              }`}>
                {STAGE_LABELS[s]?.text || s}
              </span>
            </div>
          );
        })}
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-ink-900/10 text-ink-400 text-sm font-medium hover:border-error hover:text-error transition-colors"
        >
          <X size={12} /> Cancel
        </button>
      )}
    </div>
  );
}
