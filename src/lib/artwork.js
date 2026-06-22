// Shared generative-artwork primitives used by both the on-screen <TopicArtwork>
// SVG and the canvas-rendered cover art we hand to the Media Session API
// (lock screen / OS now-playing UI).

export const PALETTES = [
  { bg: '#3D2B1F', shapes: ['#BF5630', '#D4915A', '#E8C9A0', '#6B4226'] },
  { bg: '#1E3A2F', shapes: ['#3D7A5F', '#6AAF8B', '#A8D5BA', '#2C5446'] },
  { bg: '#2D2438', shapes: ['#7A5C6A', '#A4899A', '#D4B5C7', '#5C3D52'] },
  { bg: '#2A1F14', shapes: ['#8B7355', '#B89E6F', '#D4C49A', '#6B5535'] },
  { bg: '#1A2A3A', shapes: ['#3C6E8C', '#6BA3C4', '#A0CCE0', '#2A5070'] },
  { bg: '#3A1F1F', shapes: ['#8C4A3C', '#B86B5A', '#D4A090', '#6B3030'] },
  { bg: '#2A2A1A', shapes: ['#5C6B4E', '#8B9E60', '#B8C87A', '#3D4A30'] },
  { bg: '#2E1A28', shapes: ['#9E7462', '#C49E80', '#DFC4A8', '#7A4E5A'] },
];

export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function paletteFor(topic) {
  const hash = hashString(topic || '');
  return { hash, palette: PALETTES[hash % PALETTES.length] };
}

export function shapesFor(hash) {
  const shapes = [];
  for (let i = 0; i < 7; i++) {
    const r = seededRandom(hash + i * 137);
    const r2 = seededRandom(hash + i * 251);
    const r3 = seededRandom(hash + i * 397);
    shapes.push({
      cx: r * 120,
      cy: r2 * 120,
      radius: 15 + r3 * 45,
      idx: i,
      opacity: 0.3 + r3 * 0.4,
    });
  }
  return shapes;
}

// Render the same generative cover onto a canvas and return a PNG data URL,
// suitable for `navigator.mediaSession.metadata.artwork`.
let _cache = new Map();
export function generateArtworkDataUrl(topic, title, size = 512) {
  const key = `${topic}|${title}|${size}`;
  if (_cache.has(key)) return _cache.get(key);
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { hash, palette } = paletteFor(topic);
  const scale = size / 120;

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, size, size);

  for (const s of shapesFor(hash)) {
    ctx.globalAlpha = s.opacity;
    ctx.fillStyle = palette.shapes[s.idx % palette.shapes.length];
    ctx.beginPath();
    ctx.arc(s.cx * scale, s.cy * scale, s.radius * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const display = (title || topic || 'P').trim();
  const monogram = display.charAt(0).toUpperCase() || 'P';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `600 ${size * 0.34}px 'Fraunces', Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = size * 0.03;
  ctx.shadowOffsetY = size * 0.012;
  ctx.fillText(monogram, size / 2, size / 2 + size * 0.02);

  let url = null;
  try {
    url = canvas.toDataURL('image/png');
  } catch {
    url = null;
  }
  if (_cache.size > 24) _cache = new Map();
  _cache.set(key, url);
  return url;
}
