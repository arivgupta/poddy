import React from 'react';

const PALETTES = [
  { bg: '#3D2B1F', shapes: ['#BF5630', '#D4915A', '#E8C9A0', '#6B4226'] },
  { bg: '#1E3A2F', shapes: ['#3D7A5F', '#6AAF8B', '#A8D5BA', '#2C5446'] },
  { bg: '#2D2438', shapes: ['#7A5C6A', '#A4899A', '#D4B5C7', '#5C3D52'] },
  { bg: '#2A1F14', shapes: ['#8B7355', '#B89E6F', '#D4C49A', '#6B5535'] },
  { bg: '#1A2A3A', shapes: ['#3C6E8C', '#6BA3C4', '#A0CCE0', '#2A5070'] },
  { bg: '#3A1F1F', shapes: ['#8C4A3C', '#B86B5A', '#D4A090', '#6B3030'] },
  { bg: '#2A2A1A', shapes: ['#5C6B4E', '#8B9E60', '#B8C87A', '#3D4A30'] },
  { bg: '#2E1A28', shapes: ['#9E7462', '#C49E80', '#DFC4A8', '#7A4E5A'] },
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export default function TopicArtwork({ topic, title, size = 120, isPlaying = false }) {
  const hash = hashString(topic || '');
  const palette = PALETTES[hash % PALETTES.length];
  const borderRadius = size >= 100 ? 14 : size >= 60 ? 12 : 10;

  const shapes = [];
  for (let i = 0; i < 7; i++) {
    const r = seededRandom(hash + i * 137);
    const r2 = seededRandom(hash + i * 251);
    const r3 = seededRandom(hash + i * 397);
    const cx = r * 120;
    const cy = r2 * 120;
    const radius = 15 + r3 * 45;
    const color = palette.shapes[i % palette.shapes.length];
    shapes.push({ cx, cy, radius, color, opacity: 0.3 + r3 * 0.4 });
  }

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
