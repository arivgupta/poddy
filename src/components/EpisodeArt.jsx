import React, { useId, useMemo } from 'react';
import { paletteFor, makeRandom } from '../lib/artwork';

/**
 * Deterministic cover art: a dark "sound field" of glow, concentric rings,
 * and a serif monogram. Same topic → same artwork, forever.
 *
 * Size comes from the parent (e.g. `w-44` or `w-full aspect-square`).
 */
export default function EpisodeArt({ seed, title, playing = false, className = '' }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const palette = useMemo(() => paletteFor(seed), [seed]);

  const layout = useMemo(() => {
    const rand = makeRandom(palette.hash);
    return {
      glowA: { cx: 40 + rand() * 50, cy: 30 + rand() * 40, r: 70 + rand() * 30 },
      glowB: { cx: 120 + rand() * 50, cy: 120 + rand() * 50, r: 60 + rand() * 30 },
      accentRing: 34 + Math.floor(rand() * 4) * 12,
      dashSeed: 20 + rand() * 60,
      ringCount: 5,
    };
  }, [palette.hash]);

  const monogram = (title || seed || 'P').trim().charAt(0).toUpperCase() || 'P';

  return (
    <div
      className={`relative overflow-hidden select-none ${className}`}
      style={{ background: palette.bg }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id={`blur-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="34" />
          </filter>
          <filter id={`grain-${uid}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <radialGradient id={`vignette-${uid}`} cx="50%" cy="42%" r="75%">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.5" />
          </radialGradient>
        </defs>

        {/* Color atmosphere */}
        <circle
          cx={layout.glowA.cx} cy={layout.glowA.cy} r={layout.glowA.r}
          fill={palette.glowA} opacity="0.6" filter={`url(#blur-${uid})`}
        />
        <circle
          cx={layout.glowB.cx} cy={layout.glowB.cy} r={layout.glowB.r}
          fill={palette.glowB} opacity="0.42" filter={`url(#blur-${uid})`}
        />

        {/* Sound rings */}
        <g fill="none" stroke="#F7F1E7">
          {Array.from({ length: layout.ringCount }, (_, i) => (
            <circle
              key={i}
              cx="100" cy="100"
              r={26 + i * 14}
              strokeWidth="1"
              opacity={0.22 - i * 0.035}
            />
          ))}
        </g>

        {/* Accent ring — spins gently while playing */}
        <g className={playing ? 'art-spin' : ''} style={{ transformOrigin: '100px 100px' }}>
          <circle
            cx="100" cy="100" r={layout.accentRing}
            fill="none"
            stroke={palette.accent}
            strokeWidth="1.6"
            strokeDasharray={`${layout.dashSeed} 10 4 10`}
            strokeLinecap="round"
            opacity="0.85"
          />
        </g>

        {/* Center label */}
        <circle cx="100" cy="100" r="19" fill="rgba(10,7,5,0.55)" stroke="rgba(247,241,231,0.22)" strokeWidth="1" />
        <text
          x="100" y="101"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Fraunces, Georgia, serif"
          fontSize="19"
          fontStyle="italic"
          fill="rgba(247,241,231,0.92)"
        >
          {monogram}
        </text>

        <rect width="200" height="200" fill={`url(#vignette-${uid})`} />
        <rect width="200" height="200" filter={`url(#grain-${uid})`} opacity="0.07" />
      </svg>
    </div>
  );
}
