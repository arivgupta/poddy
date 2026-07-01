/** Deterministic generative artwork helpers — one look per topic, forever. */

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Curated dark palettes tuned for the Listening Room theme. */
export const PALETTES = [
  { name: 'ember',   bg: '#1C110B', glowA: '#E9683A', glowB: '#F2A56B', accent: '#F2A56B' },
  { name: 'moss',    bg: '#0F150E', glowA: '#4C7A5E', glowB: '#A9C98F', accent: '#A9D4BB' },
  { name: 'indigo',  bg: '#12121E', glowA: '#5A64B0', glowB: '#A48FD8', accent: '#B4A9E8' },
  { name: 'oxblood', bg: '#1D0E10', glowA: '#B0473D', glowB: '#E8967F', accent: '#EDA893' },
  { name: 'gold',    bg: '#1A1309', glowA: '#C69749', glowB: '#EFD9A0', accent: '#ECC78D' },
  { name: 'lagoon',  bg: '#0D1618', glowA: '#3F8A8E', glowB: '#95CFC4', accent: '#A8D8CE' },
  { name: 'plum',    bg: '#170D17', glowA: '#95519B', glowB: '#D898BC', accent: '#E3A6C9' },
  { name: 'copper',  bg: '#1B120E', glowA: '#B36A46', glowB: '#E5B48D', accent: '#EDBFA1' },
];

export function paletteFor(seedString) {
  const hash = hashString(seedString || 'poddy');
  return { hash, ...PALETTES[hash % PALETTES.length] };
}
