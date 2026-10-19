export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const uid = () => Math.random().toString(36).slice(2, 10);

export function fmtMoney(n) {
  const v = Math.round(n);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');
}

// Shortest-path angle interpolation.
export function angleLerp(a, b, t) {
  const TAU = Math.PI * 2;
  let d = ((b - a) % TAU + TAU) % TAU;
  if (d > Math.PI) d -= TAU;
  return a + d * t;
}

// Deterministic RNG so every co-op client builds the same city from the same seed.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// HTML-escape anything that came from another player or user input.
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function weightedPick(entries) {
  // entries: [[value, weight], ...]
  const total = entries.reduce((s, e) => s + e[1], 0);
  let r = Math.random() * total;
  for (const [v, w] of entries) { if ((r -= w) <= 0) return v; }
  return entries[entries.length - 1][0];
}
