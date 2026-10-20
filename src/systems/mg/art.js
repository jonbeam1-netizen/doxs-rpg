// Shared canvas kit for the panel minigames: a scaled scene canvas (with an HTML overlay layer), particles,
// pop-up feedback, offscreen caching, stick figures/faces and a few drawing primitives.
//
//   const S = scene(api, 600, 300)      -> canvas in api.stage (logical 600x300, crisp at any width / DPR)
//   S.frame(dt, (c, t) => { ... })      -> call from tick(): clears, draws, then particles + pops on top
//   S.hit(x, y, w, h, code)             -> clickable region (re-register every frame); tap = api.press(code)
//   S.burst(x, y, opts) S.pop(text, x, y, opts) S.mark(ok, x, y, text) S.shake(px) S.flash(color)
//   cached(key, w, h, draw)             -> offscreen canvas (static art); blit(c, cv, x, y, w?, h?)
import { mulberry32 } from '../../core/util.js';

export const TAU = Math.PI * 2;
export const FT = "'Special Elite', 'Courier New', monospace";
export const FB = "'Barlow Condensed', 'Arial Narrow', sans-serif";
export const font = (px, fam = FB, w = 700) => `${w} ${px}px ${fam}`;
export const COL = {
  bone: '#e6dfcf', dim: '#a9a291', ink: '#0b0a09', out: '#15100c', blood: '#e2402f', cash: '#7fbf4d',
  gold: '#ffd84a', energy: '#d6b33c', rust: '#b0672a', skin: '#e6dfcf',
};
export const rng = (seed) => mulberry32(seed);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - (1 - t) ** 3;
export const easeBack = (t) => { const k = 1.7; return 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2; };
export function mix(c1, c2, t) {
  const a = hex(c1), b = hex(c2);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

// ------------------------------------------------------------------------------------------ cache
const CACHE = new Map();
export function cached(key, w, h, draw, k = 2) {
  let cv = CACHE.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * k)); cv.height = Math.max(1, Math.ceil(h * k));
    const c = cv.getContext('2d');
    c.scale(k, k);
    try { draw(c, w, h); } catch (e) { console.error('[mg art] cache draw failed', key, e); }
    cv.lw = w; cv.lh = h;
    CACHE.set(key, cv);
    if (CACHE.size > 500) CACHE.delete(CACHE.keys().next().value);
  }
  return cv;
}
export const uncache = (key) => CACHE.delete(key);
export function blit(c, cv, x, y, w = cv.lw, h = cv.lh) { c.drawImage(cv, x, y, w, h); }
// a fresh (uncached) offscreen canvas in logical units, e.g. for erasable grime layers
export function offscreen(w, h, k = 2) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * k); cv.height = Math.ceil(h * k);
  const c = cv.getContext('2d'); c.scale(k, k);
  cv.lw = w; cv.lh = h;
  return [cv, c];
}

// ------------------------------------------------------------------------------------------ primitives
export function rr(c, x, y, w, h, r = 6) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
export function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
export function poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); }
export function fs(c, fill, stroke, lw = 3) {
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
}
export function line(c, x1, y1, x2, y2, col, lw = 3) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.stroke(); }
// irregular blob around (x,y): r = base radius, wob = 0..1 bumpiness
export function blob(c, x, y, r, R = Math.random, wob = 0.35, n = 9, sx = 1, sy = 1) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const rr2 = r * (1 - wob / 2 + R() * wob); pts.push([x + Math.cos(a) * rr2 * sx, y + Math.sin(a) * rr2 * sy]); }
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (i === 0) c.moveTo(mx, my); else c.quadraticCurveTo(p[0], p[1], mx, my);
  }
  const p = pts[0], q = pts[1];
  c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  c.closePath();
}
export function text(c, s, x, y, { size = 18, color = COL.bone, stroke = '#000', lw = 4, align = 'center', base = 'middle', fam = FB, weight = 700, maxW } = {}) {
  c.font = font(size, fam, weight); c.textAlign = align; c.textBaseline = base;
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = 'round'; c.strokeText(s, x, y, maxW); }
  c.fillStyle = color; c.fillText(s, x, y, maxW);
}
// word-wrapped text; returns the height used
export function wrapText(c, s, x, y, maxW, lh, opts = {}) {
  c.font = font(opts.size || 16, opts.fam || FB, opts.weight ?? 700);
  const words = String(s).split(' ');
  let ln = '', yy = y;
  const lines = [];
  for (const w of words) { const t = ln ? ln + ' ' + w : w; if (c.measureText(t).width > maxW && ln) { lines.push(ln); ln = w; } else ln = t; }
  if (ln) lines.push(ln);
  for (const l of lines) { text(c, l, x, yy, { ...opts }); yy += lh; }
  return lines.length * lh;
}
// green check / red cross badge
export function badge(c, ok, x, y, r = 22, a = 1) {
  c.save(); c.globalAlpha *= a;
  ell(c, x, y, r, r); fs(c, ok ? '#3f7a26' : '#8a1a12', '#000', 3);
  ell(c, x, y, r - 4, r - 4); fs(c, null, ok ? '#a8e070' : '#ff8070', 2);
  c.lineWidth = r * 0.28; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#fff';
  c.beginPath();
  if (ok) { c.moveTo(x - r * 0.45, y + r * 0.02); c.lineTo(x - r * 0.12, y + r * 0.36); c.lineTo(x + r * 0.5, y - r * 0.38); }
  else { c.moveTo(x - r * 0.38, y - r * 0.38); c.lineTo(x + r * 0.38, y + r * 0.38); c.moveTo(x + r * 0.38, y - r * 0.38); c.lineTo(x - r * 0.38, y + r * 0.38); }
  c.stroke();
  c.restore();
}
// glowing ring (zones, targets)
export function glow(c, x, y, r, color, a = 1) {
  c.save(); c.globalAlpha *= a;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
}
// grimy noise speckle over a rect (use inside cached art)
export function grime(c, x, y, w, h, n = 60, R = Math.random, col = 'rgba(0,0,0,', amax = 0.25) {
  for (let i = 0; i < n; i++) { ell(c, x + R() * w, y + R() * h, 1 + R() * 6, 1 + R() * 4, R() * 3); c.fillStyle = col + (R() * amax).toFixed(3) + ')'; c.fill(); }
}
// speech bubble; returns nothing. tail points to (tx,ty)
export function bubble(c, x, y, w, h, tx, ty, fill = '#efe8d6') {
  c.save();
  rr(c, x, y, w, h, 10); fs(c, fill, '#000', 2.5);
  const bx = Math.max(x + 14, Math.min(x + w - 14, tx));
  const by = ty > y + h ? y + h : y;
  c.beginPath(); c.moveTo(bx - 8, by); c.lineTo(tx, ty); c.lineTo(bx + 8, by); c.closePath();
  fs(c, fill, null); c.beginPath(); c.moveTo(bx - 8, by); c.lineTo(tx, ty); c.lineTo(bx + 8, by); c.strokeStyle = '#000'; c.lineWidth = 2.5; c.stroke();
  c.restore();
}

// ------------------------------------------------------------------------------------------ faces & stick figures
export const SHIRT = { red: '#c0392b', blue: '#2e5fa8', green: '#3c8a3a', yellow: '#d6b33c', purple: '#7a3fa0', white: '#ddd8cc', black: '#222', gray: '#6d6a64', orange: '#d4782a' };
export const HAIRC = { black: '#1b1714', blond: '#e0c04a', red: '#b5482a', gray: '#9a9a9a', brown: '#5a3a22' };
// f: { skin, hair (color key or css), hairStyle ('short'|'long'|'mohawk'|'bald'|'bun'), stache, beard, glasses, shades, scar, tattoo(neck),
//      hat ('cap'|'tophat'|'beanie'|'trucker'|'hardhat'|'hairnet'|'veil'|'clown'), expr ('neutral'|'happy'|'sad'|'angry'|'strain'|'shock'|'smug'|'sick'),
//      teardrop, blush, sweat, nose ('clown'), look (eye offset -1..1) }
export function face(c, cx, cy, r, f = {}) {
  const skin = f.skin || COL.skin;
  const hc = HAIRC[f.hair] || f.hair || null;
  c.save();
  // long hair behind head
  if (hc && f.hairStyle === 'long') { c.beginPath(); c.moveTo(cx - r * 1.05, cy); c.quadraticCurveTo(cx - r * 1.2, cy + r * 1.3, cx - r * 0.5, cy + r * 1.25); c.lineTo(cx + r * 0.5, cy + r * 1.25); c.quadraticCurveTo(cx + r * 1.2, cy + r * 1.3, cx + r * 1.05, cy); c.closePath(); fs(c, hc, '#000', 2); }
  ell(c, cx, cy, r, r * 1.04); fs(c, skin, '#000', Math.max(1.5, r * 0.09));
  if (hc && f.hairStyle !== 'bald' && !['tophat', 'hardhat', 'beanie'].includes(f.hat)) {
    if (f.hairStyle === 'mohawk') { c.beginPath(); c.moveTo(cx - r * 0.18, cy - r * 0.9); for (let i = 0; i < 5; i++) { c.lineTo(cx - r * 0.18 + (i + 0.5) * r * 0.08, cy - r * (1.55 + (i % 2) * 0.1)); } c.lineTo(cx + r * 0.22, cy - r * 0.9); c.closePath(); fs(c, hc, '#000', 1.5); }
    else {
      c.beginPath(); c.moveTo(cx - r * 1.02, cy - r * 0.05);
      c.quadraticCurveTo(cx - r * 1.05, cy - r * 1.15, cx, cy - r * 1.1); c.quadraticCurveTo(cx + r * 1.05, cy - r * 1.15, cx + r * 1.02, cy - r * 0.05);
      c.quadraticCurveTo(cx + r * 0.75, cy - r * 0.62, cx + r * 0.1, cy - r * 0.58); c.quadraticCurveTo(cx - r * 0.7, cy - r * 0.62, cx - r * 1.02, cy - r * 0.05);
      fs(c, hc, '#000', Math.max(1, r * 0.06));
      if (f.hairStyle === 'bun') { ell(c, cx, cy - r * 1.18, r * 0.36, r * 0.3); fs(c, hc, '#000', 1.5); }
    }
  }
  const ex = r * 0.38, ey = cy - r * 0.08, lk = (f.look || 0) * r * 0.08;
  // eyes
  const expr = f.expr || 'neutral';
  c.fillStyle = '#111'; c.strokeStyle = '#111'; c.lineCap = 'round';
  if (expr === 'strain' || expr === 'happy') {
    c.lineWidth = Math.max(1.5, r * 0.11);
    for (const s of [-1, 1]) {
      const x0 = cx + s * ex;
      c.beginPath();
      if (expr === 'happy') c.arc(x0, ey + r * 0.05, r * 0.14, Math.PI * 1.1, Math.PI * 1.9);
      else { c.moveTo(x0 + s * r * 0.14, ey - r * 0.11); c.lineTo(x0 - s * r * 0.1, ey); c.lineTo(x0 + s * r * 0.14, ey + r * 0.11); }
      c.stroke();
    }
  } else if (expr === 'shock') {
    for (const s of [-1, 1]) { ell(c, cx + s * ex, ey, r * 0.17, r * 0.2); fs(c, '#fff', '#111', 1.5); ell(c, cx + s * ex + lk, ey, r * 0.07, r * 0.07); c.fillStyle = '#111'; c.fill(); }
  } else if (expr === 'sick') {
    c.lineWidth = Math.max(1.2, r * 0.08);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * ex - r * 0.12, ey - r * 0.1); c.lineTo(cx + s * ex + r * 0.12, ey + r * 0.1); c.moveTo(cx + s * ex + r * 0.12, ey - r * 0.1); c.lineTo(cx + s * ex - r * 0.12, ey + r * 0.1); c.stroke(); }
  } else {
    for (const s of [-1, 1]) { ell(c, cx + s * ex + lk, ey, r * 0.1, r * 0.12); c.fill(); }
  }
  // brows
  if (expr === 'angry' || expr === 'strain' || expr === 'sad' || expr === 'smug') {
    c.lineWidth = Math.max(1.5, r * 0.1);
    for (const s of [-1, 1]) {
      c.beginPath();
      const inner = expr === 'sad' ? -1 : expr === 'smug' ? (s > 0 ? -0.6 : 0.2) : 1;
      c.moveTo(cx + s * (ex + r * 0.18), ey - r * 0.3 - (inner > 0 ? 0 : r * 0.08)); c.lineTo(cx + s * (ex - r * 0.18), ey - r * 0.3 + inner * r * 0.1);
      c.stroke();
    }
  }
  // glasses / shades
  if (f.glasses || f.shades) {
    c.lineWidth = Math.max(1.5, r * 0.09); c.strokeStyle = '#111';
    for (const s of [-1, 1]) { rr(c, cx + s * ex - r * 0.24, ey - r * 0.2, r * 0.48, r * 0.38, r * 0.12); fs(c, f.shades ? '#111' : 'rgba(200,230,255,.25)', '#111', Math.max(1.5, r * 0.09)); }
    line(c, cx - ex + r * 0.24, ey - r * 0.05, cx + ex - r * 0.24, ey - r * 0.05, '#111', Math.max(1.5, r * 0.08));
  }
  // nose
  if (f.nose === 'clown') { ell(c, cx, cy + r * 0.18, r * 0.2, r * 0.2); fs(c, '#e2402f', '#000', 1.5); }
  // mouth
  const my = cy + r * 0.5;
  c.lineWidth = Math.max(1.5, r * 0.09); c.strokeStyle = '#111';
  c.beginPath();
  if (expr === 'happy') { c.arc(cx, my - r * 0.18, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
  else if (expr === 'sad' || expr === 'sick') { c.arc(cx, my + r * 0.18, r * 0.24, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); }
  else if (expr === 'shock') { ell(c, cx, my, r * 0.14, r * 0.2); fs(c, '#300', '#111', 1.5); }
  else if (expr === 'strain') { rr(c, cx - r * 0.3, my - r * 0.1, r * 0.6, r * 0.22, 2); fs(c, '#fff', '#111', 1.5); line(c, cx - r * 0.3, my, cx + r * 0.3, my, '#111', 1); }
  else if (expr === 'angry') { c.moveTo(cx - r * 0.25, my + r * 0.04); c.lineTo(cx + r * 0.25, my - r * 0.04); c.stroke(); }
  else if (expr === 'smug') { c.moveTo(cx - r * 0.22, my); c.quadraticCurveTo(cx + r * 0.1, my + r * 0.08, cx + r * 0.3, my - r * 0.12); c.stroke(); }
  else { c.moveTo(cx - r * 0.2, my); c.lineTo(cx + r * 0.2, my); c.stroke(); }
  // facial hair
  const fh = hc || '#2a2018';
  if (f.stache) { c.beginPath(); c.moveTo(cx - r * 0.42, my - r * 0.02); c.quadraticCurveTo(cx - r * 0.2, my - r * 0.32, cx, my - r * 0.16); c.quadraticCurveTo(cx + r * 0.2, my - r * 0.32, cx + r * 0.42, my - r * 0.02); c.quadraticCurveTo(cx + r * 0.2, my - r * 0.12, cx, my - r * 0.1); c.quadraticCurveTo(cx - r * 0.2, my - r * 0.12, cx - r * 0.42, my - r * 0.02); fs(c, fh, '#000', 1); }
  if (f.beard) { c.beginPath(); c.moveTo(cx - r * 0.9, cy + r * 0.1); c.quadraticCurveTo(cx - r * 0.7, cy + r * 1.3, cx, cy + r * 1.25); c.quadraticCurveTo(cx + r * 0.7, cy + r * 1.3, cx + r * 0.9, cy + r * 0.1); c.quadraticCurveTo(cx + r * 0.5, cy + r * 0.85, cx, cy + r * 0.8); c.quadraticCurveTo(cx - r * 0.5, cy + r * 0.85, cx - r * 0.9, cy + r * 0.1); fs(c, fh, '#000', 1); }
  if (f.scar) { c.lineWidth = Math.max(1.5, r * 0.08); c.strokeStyle = '#a0302a'; c.beginPath(); c.moveTo(cx + r * 0.12, cy - r * 0.55); c.lineTo(cx + r * 0.62, cy + r * 0.32); c.stroke(); c.lineWidth = Math.max(1, r * 0.05); for (let i = 1; i < 5; i++) { const t = i / 5, px = cx + r * (0.12 + 0.5 * t), py = cy + r * (-0.55 + 0.87 * t); c.beginPath(); c.moveTo(px - r * 0.1, py + r * 0.05); c.lineTo(px + r * 0.1, py - r * 0.05); c.stroke(); } }
  if (f.teardrop) { c.beginPath(); c.moveTo(cx - ex, ey + r * 0.22); c.quadraticCurveTo(cx - ex - r * 0.1, ey + r * 0.4, cx - ex, ey + r * 0.44); c.quadraticCurveTo(cx - ex + r * 0.1, ey + r * 0.4, cx - ex, ey + r * 0.22); fs(c, '#2a2a6a'); }
  if (f.blush) { for (const s of [-1, 1]) { ell(c, cx + s * r * 0.55, cy + r * 0.25, r * 0.16, r * 0.09); c.fillStyle = 'rgba(230,80,90,.45)'; c.fill(); } }
  if (f.sweat) { for (let i = 0; i < f.sweat; i++) { const sx = cx + (i % 2 ? 1 : -1) * r * (1.12 + i * 0.06), sy = cy - r * 0.5 + i * r * 0.3; c.beginPath(); c.moveTo(sx, sy - r * 0.2); c.quadraticCurveTo(sx + r * 0.13, sy + r * 0.06, sx, sy + r * 0.1); c.quadraticCurveTo(sx - r * 0.13, sy + r * 0.06, sx, sy - r * 0.2); fs(c, '#8fd0ff', '#246', 1); } }
  // hats
  const ht = f.hat;
  if (ht === 'cap' || ht === 'trucker') {
    const hcol = f.hatColor || (ht === 'trucker' ? '#c0392b' : '#2d2d33');
    c.beginPath(); c.moveTo(cx - r * 1.02, cy - r * 0.32); c.quadraticCurveTo(cx, cy - r * 1.6, cx + r * 1.02, cy - r * 0.32); c.closePath(); fs(c, hcol, '#000', 2);
    if (ht === 'trucker') { c.beginPath(); c.moveTo(cx - r * 0.98, cy - r * 0.36); c.quadraticCurveTo(cx - r * 0.5, cy - r * 1.3, cx, cy - r * 1.02); c.lineTo(cx, cy - r * 0.34); c.closePath(); fs(c, '#eee', '#000', 1.5); }
    rr(c, cx + r * 0.4, cy - r * 0.44, r * 1.05, r * 0.2, r * 0.08); fs(c, hcol, '#000', 2);
  } else if (ht === 'tophat') {
    rr(c, cx - r * 0.72, cy - r * 2.05, r * 1.44, r * 1.45, 2); fs(c, '#141414', '#000', 2);
    line(c, cx - r * 0.72, cy - r * 0.8, cx + r * 0.72, cy - r * 0.8, '#7a1a1a', r * 0.2);
    rr(c, cx - r * 1.15, cy - r * 0.72, r * 2.3, r * 0.22, r * 0.1); fs(c, '#141414', '#000', 2);
  } else if (ht === 'beanie') {
    c.beginPath(); c.moveTo(cx - r * 1.04, cy - r * 0.2); c.quadraticCurveTo(cx - r * 1.05, cy - r * 1.45, cx, cy - r * 1.42); c.quadraticCurveTo(cx + r * 1.05, cy - r * 1.45, cx + r * 1.04, cy - r * 0.2); c.closePath(); fs(c, f.hatColor || '#7a3a2a', '#000', 2);
    rr(c, cx - r * 1.08, cy - r * 0.48, r * 2.16, r * 0.34, r * 0.1); fs(c, '#5a2a1e', '#000', 2);
    ell(c, cx, cy - r * 1.5, r * 0.26, r * 0.24); fs(c, '#d6b33c', '#000', 1.5);
  } else if (ht === 'hardhat') {
    c.beginPath(); c.moveTo(cx - r * 1.0, cy - r * 0.35); c.quadraticCurveTo(cx, cy - r * 1.75, cx + r * 1.0, cy - r * 0.35); c.closePath(); fs(c, '#e8b820', '#000', 2);
    rr(c, cx - r * 1.25, cy - r * 0.45, r * 2.5, r * 0.2, r * 0.08); fs(c, '#e8b820', '#000', 2);
  } else if (ht === 'hairnet') {
    c.beginPath(); c.arc(cx, cy - r * 0.15, r * 1.05, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); fs(c, 'rgba(255,255,255,.18)', 'rgba(255,255,255,.6)', 1);
  } else if (ht === 'veil') {
    c.beginPath(); c.moveTo(cx - r * 0.7, cy - r * 0.9); c.quadraticCurveTo(cx - r * 1.8, cy + r * 0.6, cx - r * 1.3, cy + r * 1.6); c.lineTo(cx + r * 1.3, cy + r * 1.6); c.quadraticCurveTo(cx + r * 1.8, cy + r * 0.6, cx + r * 0.7, cy - r * 0.9); c.closePath(); fs(c, 'rgba(255,255,255,.3)', 'rgba(255,255,255,.7)', 1);
    ell(c, cx, cy - r * 1.0, r * 0.7, r * 0.22); fs(c, '#f0e8e8', '#000', 1.5);
  } else if (ht === 'clown') {
    for (const s of [-1, 1]) { ell(c, cx + s * r * 0.95, cy - r * 0.55, r * 0.5, r * 0.45); fs(c, '#e2402f', '#000', 1.5); }
  }
  c.restore();
}

// Full stick figure standing at (x, footY). o: { h, shirt, pants, lw, arms: [[a,b],[a,b]], legs: [[a,b],[a,b]], lean, shoes, tattoo, ...face opts }
// Arm/leg angles are radians from straight down; positive swings the limb outward (away from the body center).
export function stick(c, x, footY, o = {}) {
  const h = o.h || 140, lw = o.lw || Math.max(2.5, h * 0.032), limb = o.limb || COL.bone;
  const r = h * 0.105;
  const lean = o.lean || 0;
  const hipY = footY - h * 0.46, hipX = x + lean * h * 0.05;
  const neckY = footY - h + r * 2.05, neckX = x + lean * h * 0.18;
  const shY = neckY + h * 0.04;
  const legLen = h * 0.25;
  const legs = o.legs || [[0.22, -0.02], [0.22, -0.02]];
  const arms = o.arms || [[0.35, 0.1], [0.35, 0.1]];
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  const seg = (sx, sy, a, b, len, side) => {
    const a1 = a * side, kx = sx - Math.sin(a1) * len, ky = sy + Math.cos(a1) * len;
    const a2 = (a + b) * side, ex = kx - Math.sin(a2) * len, ey = ky + Math.cos(a2) * len;
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(kx, ky); c.lineTo(ex, ey);
    c.strokeStyle = '#000'; c.lineWidth = lw + 2; c.stroke(); c.strokeStyle = limb; c.lineWidth = lw; c.stroke();
    return [ex, ey, kx, ky];
  };
  // legs (pants color optional)
  const feet = [];
  for (const [i, side] of [[0, 1], [1, -1]]) {
    const L = legs[i];
    const [ex, ey] = seg(hipX, hipY, L[0], L[1], legLen, side);
    if (o.pants) { c.beginPath(); c.moveTo(hipX, hipY); const a1 = L[0] * side; c.lineTo(hipX - Math.sin(a1) * legLen, hipY + Math.cos(a1) * legLen); c.strokeStyle = o.pants; c.lineWidth = lw + 3; c.stroke(); }
    feet.push([ex, ey, side]);
  }
  // shoes
  for (const [fx, fy, side] of feet) {
    const dir = -side;
    if (o.shoes === 'sneakers') { rr(c, fx - 7 + dir * 4, fy - 5, 16, 8, 3); fs(c, '#f2f2f2', '#000', 1.5); line(c, fx - 3 + dir * 4, fy - 1, fx + 5 + dir * 4, fy - 3, '#e2402f', 2); line(c, fx - 7 + dir * 4, fy + 2, fx + 9 + dir * 4, fy + 2, '#999', 1.5); }
    else if (o.shoes === 'dress') { ell(c, fx + dir * 4, fy - 1, 9, 4.5); fs(c, '#141414', '#000', 1); ell(c, fx + dir * 6, fy - 3, 3, 1.2); c.fillStyle = '#888'; c.fill(); }
    else if (o.shoes === 'boots') { rr(c, fx - 6 + dir * 3, fy - 12, 13, 15, 2); fs(c, '#5a3a22', '#000', 1.5); }
    else if (o.shoes === 'heels') { poly(c, [fx - 6 + dir * 3, fy - 4, fx + 8 + dir * 3, fy, fx + 8 + dir * 3, fy + 2, fx - 6 + dir * 3, fy + 2]); fs(c, '#c0182a', '#000', 1); line(c, fx - 5 + dir * 3, fy, fx - 5 + dir * 3, fy + 5, '#c0182a', 2); }
    else if (o.shoes === 'flipflops') { rr(c, fx - 7 + dir * 3, fy, 15, 3, 1); fs(c, '#3fa7e0', '#000', 1); }
  }
  // torso
  if (o.shirt) {
    const sw = h * 0.1;
    c.beginPath(); c.moveTo(neckX - sw, shY - 2); c.lineTo(neckX + sw, shY - 2); c.lineTo(hipX + sw * 0.85, hipY + 3); c.lineTo(hipX - sw * 0.85, hipY + 3); c.closePath();
    fs(c, SHIRT[o.shirt] || o.shirt, '#000', 2);
    if (o.tie) { poly(c, [neckX - 3, shY, neckX + 3, shY, neckX + 4, shY + h * 0.18, neckX, shY + h * 0.22, neckX - 4, shY + h * 0.18]); fs(c, o.tie, '#000', 1); }
    if (o.sash) { c.save(); c.beginPath(); c.moveTo(neckX - sw, shY + 2); c.lineTo(neckX - sw + 6, shY - 2); c.lineTo(hipX + sw * 0.85, hipY - 4); c.lineTo(hipX + sw * 0.85 - 6, hipY + 2); c.closePath(); fs(c, '#f2a6c8', '#000', 1); c.restore(); }
  } else {
    c.beginPath(); c.moveTo(neckX, neckY); c.lineTo(hipX, hipY); c.strokeStyle = '#000'; c.lineWidth = lw + 2; c.stroke(); c.strokeStyle = limb; c.lineWidth = lw; c.stroke();
  }
  // arms
  const hands = [];
  for (const [i, side] of [[0, 1], [1, -1]]) {
    const A = arms[i];
    hands.push(seg(neckX + (o.shirt ? side * -h * 0.08 : 0), shY + 2, A[0], A[1], h * 0.17, side));
  }
  if (o.tattoo) { // ink sleeve on the upper arm + a heart
    const [, , kx, ky] = hands[1]; const sx = neckX + (o.shirt ? h * 0.08 : 0), sy = shY + 2;
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(kx, ky); c.strokeStyle = '#2a4a8a'; c.lineWidth = lw + 1; c.stroke();
    c.setLineDash([2, 3]); c.strokeStyle = '#8ab0e8'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
    c.save(); c.translate((sx + kx) / 2 + r * 0.5, (sy + ky) / 2); c.scale(r / 16, r / 16); c.beginPath(); c.moveTo(0, 5); c.bezierCurveTo(-8, -1, -4, -8, 0, -3); c.bezierCurveTo(4, -8, 8, -1, 0, 5); fs(c, '#c0303a', '#000', 1.5); c.restore();
  }
  // head
  const hx = neckX + (o.headTilt || 0) * r, hy = neckY - r * 1.0;
  face(c, hx, hy, r, o);

  c.restore();
  return { hands: hands.map((p) => [p[0], p[1]]), head: [hx, hy, r], neck: [neckX, neckY], hip: [hipX, hipY], feet };
}

// ------------------------------------------------------------------------------------------ the scene
export function scene(api, LW, LH, opts = {}) {
  const st = api.stage;
  if (!opts.mount) { st.classList.add('mg-cv'); st.innerHTML = ''; }
  const box = document.createElement('div');
  box.className = 'mg-scene';
  const cv = document.createElement('canvas');
  cv.className = 'mg-canvas';
  cv.style.aspectRatio = `${LW} / ${LH}`;
  const ui = document.createElement('div');
  ui.className = 'mg-ui';
  box.append(cv, ui);
  (opts.mount || st).appendChild(box);
  const ctx = cv.getContext('2d');
  const S = { cv, ctx, ui, box, W: LW, H: LH, t: 0, k: 1, hits: [], parts: [], pops: [], shakeT: 0, shakeM: 0, flashC: null, flashT: 0 };
  let cw = -1;
  const fit = () => {
    const w = cv.clientWidth || LW;
    if (w === cw) return;
    cw = w;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    S.k = Math.max(0.5, (w * dpr) / LW);
    cv.width = Math.round(LW * S.k); cv.height = Math.round(LH * S.k);
  };
  fit();
  S.hit = (x, y, w, h, code) => { S.hits.push({ x, y, w, h, code }); };
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) * LW) / r.width, y = ((e.clientY - r.top) * LH) / r.height;
    for (let i = S.hits.length - 1; i >= 0; i--) {
      const h = S.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { e.preventDefault(); api.press?.(h.code); return; }
    }
  });
  S.burst = (x, y, o = {}) => {
    const n = o.n ?? 10;
    for (let i = 0; i < n; i++) {
      const a = (o.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * (o.spread ?? TAU);
      const sp = (o.speed ?? 140) * (0.4 + Math.random() * 0.8);
      const life = (o.life ?? 0.7) * (0.6 + Math.random() * 0.6);
      S.parts.push({
        x: x + (Math.random() - 0.5) * (o.jitter ?? 0), y: y + (Math.random() - 0.5) * (o.jitter ?? 0),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.g ?? 320, drag: o.drag ?? 0, life, max: life,
        size: (o.size ?? 4) * (0.6 + Math.random() * 0.8), color: o.colors ? o.colors[(Math.random() * o.colors.length) | 0] : (o.color || '#fff'),
        shape: o.shape || 'dot', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10, grow: o.grow ?? 0,
      });
    }
    if (S.parts.length > 400) S.parts.splice(0, S.parts.length - 400);
  };
  S.pop = (s, x, y, o = {}) => { S.pops.push({ s, x, y, color: o.color || COL.bone, size: o.size || 26, t: 0, life: o.life || 0.9, rise: o.rise ?? 40, badge: o.badge }); if (S.pops.length > 12) S.pops.shift(); };
  S.mark = (ok, x, y, s) => S.pop(s || '', x, y, { badge: ok ? 'ok' : 'bad', color: ok ? '#a8e070' : '#ff8070', size: 22 });
  S.shake = (m = 6) => { S.shakeT = 0.25; S.shakeM = m; };
  S.flash = (color = 'rgba(255,255,255,.35)', t = 0.18) => { S.flashC = color; S.flashT = t; S.flashMax = t; };
  const drawPart = (c, p) => {
    const a = Math.max(0, p.life / p.max);
    c.globalAlpha = Math.min(1, a * 1.6);
    const s = p.size * (1 + p.grow * (1 - a));
    switch (p.shape) {
      case 'bubble': ell(c, p.x, p.y, s, s); fs(c, 'rgba(255,255,255,.28)', 'rgba(255,255,255,.85)', 1.2); ell(c, p.x - s * 0.35, p.y - s * 0.35, s * 0.25, s * 0.25); c.fillStyle = '#fff'; c.fill(); break;
      case 'drop': c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(p.vy, p.vx) - Math.PI / 2); ell(c, 0, 0, s * 0.6, s * 1.2); c.fillStyle = p.color; c.fill(); c.restore(); break;
      case 'spark': line(c, p.x, p.y, p.x - p.vx * 0.04, p.y - p.vy * 0.04, p.color, s * 0.6); break;
      case 'smoke': ell(c, p.x, p.y, s, s); c.fillStyle = p.color; c.globalAlpha = a * 0.35; c.fill(); break;
      case 'star': c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.beginPath(); for (let i = 0; i < 8; i++) { const rr2 = i % 2 ? s * 0.35 : s; c.lineTo(Math.cos((i / 8) * TAU) * rr2, Math.sin((i / 8) * TAU) * rr2); } c.closePath(); c.fillStyle = p.color; c.fill(); c.restore(); break;
      case 'cash': c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = '#5c9a3a'; c.fillRect(-s * 1.4, -s * 0.7, s * 2.8, s * 1.4); c.strokeStyle = '#2a4a18'; c.lineWidth = 1; c.strokeRect(-s * 1.4, -s * 0.7, s * 2.8, s * 1.4); ell(c, 0, 0, s * 0.4, s * 0.4); c.strokeStyle = '#cfe8a8'; c.stroke(); c.restore(); break;
      case 'chunk': c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color; c.fillRect(-s / 2, -s / 2, s, s * 0.8); c.restore(); break;
      case 'note': text(c, '♪', p.x, p.y, { size: s * 4, color: p.color, lw: 2 }); break;
      default: ell(c, p.x, p.y, s, s); c.fillStyle = p.color; c.fill();
    }
    c.globalAlpha = 1;
  };
  S.frame = (dt, draw) => {
    S.t += dt;
    fit();
    S.hits.length = 0;
    const c = ctx;
    c.setTransform(S.k, 0, 0, S.k, 0, 0);
    c.clearRect(0, 0, LW, LH);
    let sx = 0, sy = 0;
    if (S.shakeT > 0) { S.shakeT -= dt; const m = S.shakeM * Math.max(0, S.shakeT / 0.25); sx = (Math.random() - 0.5) * m * 2; sy = (Math.random() - 0.5) * m * 2; }
    c.save(); c.translate(sx, sy);
    try { draw(c, S.t); } catch (e) { console.error('[mg art] draw failed', e); }
    // particles
    for (const p of S.parts) {
      p.life -= dt;
      if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    S.parts = S.parts.filter((p) => p.life > 0);
    for (const p of S.parts) drawPart(c, p);
    c.restore();
    // pops
    for (const p of S.pops) {
      p.t += dt;
      const k = p.t / p.life;
      const sc = k < 0.25 ? easeBack(k / 0.25) : 1;
      const a = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      const y = p.y - easeOut(Math.min(1, k)) * p.rise;
      c.save(); c.globalAlpha = Math.max(0, a); c.translate(p.x, y); c.scale(Math.max(0.01, sc), Math.max(0.01, sc));
      if (p.badge) { badge(c, p.badge === 'ok', 0, 0, p.size); if (p.s) text(c, p.s, 0, p.size + 14, { size: 18, color: p.color }); }
      else text(c, p.s, 0, 0, { size: p.size, color: p.color, lw: 5 });
      c.restore();
    }
    S.pops = S.pops.filter((p) => p.t < p.life);
    if (S.flashT > 0) { S.flashT -= dt; c.globalAlpha = Math.max(0, S.flashT / S.flashMax); c.fillStyle = S.flashC; c.fillRect(0, 0, LW, LH); c.globalAlpha = 1; }
  };
  return S;
}

// Combo / streak counter (draw every frame). Pulses when n changes.
export function comboMeter(c, S, n, x, y, label = 'COMBO') {
  if (n < 2) return;
  S._cm ??= { n: 0, t: 0 };
  if (S._cm.n !== n) { S._cm.n = n; S._cm.t = S.t; }
  const k = Math.min(1, (S.t - S._cm.t) / 0.25);
  const sc = 1 + 0.35 * (1 - easeOut(k));
  c.save(); c.translate(x, y); c.scale(sc, sc);
  const hot = n >= 10 ? '#ff7a2a' : n >= 5 ? COL.gold : COL.bone;
  text(c, `x${n}`, 0, 0, { size: 30, color: hot, lw: 6, fam: FT });
  text(c, label, 0, 22, { size: 13, color: hot, lw: 3 });
  c.restore();
}

// Simple meter bar (fills left->right). colors: fill, back
export function meter(c, x, y, w, h, frac, fill = COL.energy, back = '#1d1915', label) {
  rr(c, x, y, w, h, h / 2); fs(c, back, '#000', 2);
  if (frac > 0) { rr(c, x + 2, y + 2, Math.max(h - 4, (w - 4) * Math.min(1, frac)), h - 4, (h - 4) / 2); fs(c, fill); }
  if (label) text(c, label, x + w / 2, y + h / 2 + 1, { size: Math.max(10, h - 4), color: '#fff', lw: 3 });
}
