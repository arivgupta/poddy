import React, { useMemo } from 'react';

/**
 * Car-radio style LED line: title scrolls right-to-left in a loop
 * (content moves left, so new text appears from the right).
 */
export default function RetroRadioTicker({ title }) {
  const text = (title || 'Poddy').trim() || 'Poddy';
  const line = useMemo(() => `${text}  ·  `, [text]);
  // Slower for long titles so it stays readable
  const durationSec = Math.min(38, Math.max(14, text.length * 0.5));

  return (
    <div className="mb-5 w-full max-w-md mx-auto">
      <p className="text-center text-[0.55rem] font-mono font-medium uppercase tracking-[0.18em] text-ink-400 mb-1.5">
        Now playing
      </p>
      <div
        className="overflow-hidden rounded-md border border-ink-900/12 bg-[#0f0e0c] py-2.5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.55)]"
        role="status"
        aria-live="polite"
        aria-label={`Now playing: ${text}`}
      >
        <div className="relative px-2">
          {/* Dim vignette edges like a real LCD */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-[linear-gradient(to_right,#0f0e0c,transparent)]" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-[linear-gradient(to_left,#0f0e0c,transparent)]" />
          <div
            className="radio-marquee-track"
            style={{ animationDuration: `${durationSec}s` }}
          >
            <span className="whitespace-nowrap px-2 font-mono text-[0.85rem] font-medium tracking-wide text-amber-300 [text-shadow:0_0_12px_rgba(251,191,36,0.35)]">
              {line}
            </span>
            <span className="whitespace-nowrap px-2 font-mono text-[0.85rem] font-medium tracking-wide text-amber-300 [text-shadow:0_0_12px_rgba(251,191,36,0.35)]" aria-hidden>
              {line}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
