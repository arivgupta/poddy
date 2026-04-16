import React from 'react';

const PALETTES = [
  ['#7C3AED', '#A78BFA'],
  ['#6366F1', '#818CF8'],
  ['#3B82F6', '#60A5FA'],
  ['#8B5CF6', '#C084FC'],
  ['#6D28D9', '#A78BFA'],
  ['#4F46E5', '#818CF8'],
  ['#7C3AED', '#F472B6'],
  ['#2563EB', '#67E8F9'],
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
  const patternType = hash % 3; // 0=dots, 1=circles, 2=lines

  const displayText = title || topic || '';
  const monogram = displayText.trim().charAt(0).toUpperCase();

  const fontSize = size >= 100 ? size * 0.35 : size * 0.4;
  const borderRadius = size >= 100 ? 16 : 12;

  return (
    <div style={{
      width: size, height: size, borderRadius, flexShrink: 0,
      position: 'relative', overflow: 'hidden',
      background: `linear-gradient(${angle}deg, ${palette[0]}, ${palette[1]})`,
      border: '1px solid var(--border-medium)',
    }}>
      {/* Geometric pattern overlay */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08 }}
        viewBox="0 0 120 120"
        xmlns="http://www.w3.org/2000/svg"
      >
        {patternType === 0 && (
          /* Dot grid */
          <>
            {Array.from({ length: 36 }, (_, i) => {
              const x = (i % 6) * 22 + 10;
              const y = Math.floor(i / 6) * 22 + 10;
              return <circle key={i} cx={x} cy={y} r={2} fill="white" />;
            })}
          </>
        )}
        {patternType === 1 && (
          /* Concentric circles */
          <>
            <circle cx="60" cy="60" r="20" fill="none" stroke="white" strokeWidth="1" />
            <circle cx="60" cy="60" r="38" fill="none" stroke="white" strokeWidth="1" />
            <circle cx="60" cy="60" r="56" fill="none" stroke="white" strokeWidth="1" />
          </>
        )}
        {patternType === 2 && (
          /* Diagonal lines */
          <>
            {Array.from({ length: 8 }, (_, i) => (
              <line key={i} x1={i * 20 - 20} y1="0" x2={i * 20 + 120} y2="140" stroke="white" strokeWidth="1" />
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
          fontWeight: 700,
          color: 'rgba(255,255,255,0.18)',
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
              background: 'rgba(255,255,255,0.7)',
              animation: `float ${0.4 + i * 0.15}s ease-in-out infinite alternate`,
              height: `${4 + i * 2.5}px`,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
