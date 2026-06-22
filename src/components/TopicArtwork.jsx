import React from 'react';
import { paletteFor, shapesFor } from '../lib/artwork';

export default function TopicArtwork({ topic, title, size = 120, isPlaying = false }) {
  const { hash, palette } = paletteFor(topic);
  const borderRadius = size >= 100 ? 14 : size >= 60 ? 12 : 10;

  const shapes = shapesFor(hash).map((s) => ({
    ...s,
    color: palette.shapes[s.idx % palette.shapes.length],
  }));

  const displayText = title || topic || '';
  const monogram = displayText.trim().charAt(0).toUpperCase();
  const fontSize = size >= 100 ? size * 0.32 : size * 0.38;

  return (
    <div
      className="shrink-0 relative overflow-hidden"
      style={{
        width: size, height: size, borderRadius,
        background: palette.bg,
        boxShadow: size >= 80
          ? '0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 2px 10px rgba(0,0,0,0.20)',
      }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 120 120"
        xmlns="http://www.w3.org/2000/svg"
      >
        {shapes.map((s, i) => (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.radius} fill={s.color} opacity={s.opacity} />
        ))}
        <filter id={`grain-${hash}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="120" height="120" filter={`url(#grain-${hash})`} opacity="0.06" />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-display leading-none select-none"
          style={{
            fontSize,
            color: 'rgba(255,255,255,0.45)',
            textShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {monogram}
        </span>
      </div>

      {isPlaying && size >= 80 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-[3px] items-end">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="w-[3px] rounded-sm bg-white/75" style={{
              animation: `float ${0.4 + i * 0.15}s ease-in-out infinite alternate`,
              height: `${5 + i * 3}px`,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
