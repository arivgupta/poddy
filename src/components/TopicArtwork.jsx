import React from 'react';

const PALETTES = [
  ['#BF5630', '#D4915A'],  // terracotta -> amber
  ['#3D7A5F', '#6AAF8B'],  // sage -> forest
  ['#9E7462', '#C9A690'],  // dusty rose -> cream
  ['#8B7355', '#B89E6F'],  // ochre -> gold
  ['#5C6B4E', '#9AAF6B'],  // olive -> chartreuse
  ['#8C4A3C', '#B86B5A'],  // clay -> brick
  ['#3C6E8C', '#6BA3C4'],  // denim -> sky
  ['#7A5C6A', '#A4899A'],  // plum -> mauve
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export default function TopicArtwork({ topic, title, size = 120, isPlaying = false }) {
  const hash = hashString(topic || '');
  const palette = PALETTES[hash % PALETTES.length];
  const angle = (hash % 360);
  const patternType = hash % 3;

  const displayText = title || topic || '';
  const monogram = displayText.trim().charAt(0).toUpperCase();

  const fontSize = size >= 100 ? size * 0.38 : size * 0.42;
  const borderRadius = size >= 100 ? 14 : 10;

  return (
    <div style={{
      width: size, height: size, borderRadius, flexShrink: 0,
      position: 'relative', overflow: 'hidden',
      background: `linear-gradient(${angle}deg, ${palette[0]}, ${palette[1]})`,
      border: '1px solid rgba(30,24,20,0.08)',
      boxShadow: '0 2px 8px rgba(30,24,20,0.10)',
    }}>
      {/* Geometric pattern overlay */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.10 }}
        viewBox="0 0 120 120"
        xmlns="http://www.w3.org/2000/svg"
      >
        {patternType === 0 && (
          <>
            {Array.from({ length: 36 }, (_, i) => {
              const x = (i % 6) * 22 + 10;
              const y = Math.floor(i / 6) * 22 + 10;
              return <circle key={i} cx={x} cy={y} r={1.5} fill="white" />;
            })}
          </>
        )}
        {patternType === 1 && (
          <>
            <circle cx="60" cy="60" r="18" fill="none" stroke="white" strokeWidth="0.8" />
            <circle cx="60" cy="60" r="34" fill="none" stroke="white" strokeWidth="0.8" />
            <circle cx="60" cy="60" r="50" fill="none" stroke="white" strokeWidth="0.8" />
          </>
        )}
        {patternType === 2 && (
          <>
            {Array.from({ length: 8 }, (_, i) => (
              <line key={i} x1={i * 20 - 20} y1="0" x2={i * 20 + 120} y2="140" stroke="white" strokeWidth="0.7" />
            ))}
          </>
        )}
      </svg>

      {/* Monogram */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize,
          fontWeight: 400,
          fontStyle: 'italic',
          color: 'rgba(255,255,255,0.22)',
          lineHeight: 1,
          userSelect: 'none',
        }}>
          {monogram}
        </span>
      </div>

      {/* Playing indicator */}
      {isPlaying && size >= 80 && (
        <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2, alignItems: 'flex-end' }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{
              width: 2.5, borderRadius: 1.5,
              background: 'rgba(255,255,255,0.65)',
              animation: `float ${0.4 + i * 0.15}s ease-in-out infinite alternate`,
              height: `${4 + i * 2.5}px`,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
