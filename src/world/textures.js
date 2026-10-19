import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';

// Procedural canvas textures for the city. Everything is drawn once at boot.
// Facade textures pack a 4x4 grid of window bays (each bay = 3m wide, 3.5m tall,
// so one tile covers 12m x 14m) plus a matching emissive map where some
// windows are lit at night.

let R = mulberry32(0xBADA55);
const rr = (a, b) => a + R() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));
const pk = (arr) => arr[Math.floor(R() * arr.length)];

export const FONT = '"Special Elite", "Courier New", monospace';
export const FONT2 = '"Barlow Condensed", "Arial Narrow", sans-serif';

function cnv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function g2(c) { return c.getContext('2d', { willReadFrequently: true }); }

export function toTex(c, { srgb = true, repeat = true, aniso = 8, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (!mips) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}

function rgba(r, g, b, a) { return `rgba(${r | 0},${g | 0},${b | 0},${a})`; }
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function jitter(hex, amt) {
  const [r, g, b] = hexToRgb(hex); const k = 1 + (R() - 0.5) * amt; const t = (R() - 0.5) * amt * 20;
  return `rgb(${Math.max(0, Math.min(255, r * k + t)) | 0},${Math.max(0, Math.min(255, g * k + t)) | 0},${Math.max(0, Math.min(255, b * k + t * 0.8)) | 0})`;
}

// Per-pixel noise
function noise(ctx, w, h, amp, { mono = true, x = 0, y = 0 } = {}) {
  const img = ctx.getImageData(x, y, w, h); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * amp;
    if (mono) { d[i] += n; d[i + 1] += n; d[i + 2] += n; } else { d[i] += n; d[i + 1] += (R() - 0.5) * amp; d[i + 2] += (R() - 0.5) * amp; }
  }
  ctx.putImageData(img, x, y);
}

function blot(ctx, x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
// Wrap-around blotches (tileable)
function blots(ctx, w, h, n, rmin, rmax, col, amin, amax) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, r = rr(rmin, rmax), a = rr(amin, amax);
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
      blot(ctx, x + ox, y + oy, r, col, a);
    }
  }
}
function crack(ctx, x, y, len, col = 'rgba(0,0,0,0.45)', width = 1.2, branch = 2) {
  ctx.strokeStyle = col; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x, y);
  let a = R() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    a += (R() - 0.5) * 1.1; x += Math.cos(a) * 4; y += Math.sin(a) * 4; ctx.lineTo(x, y);
    if (branch > 0 && R() < 0.06) { ctx.stroke(); crack(ctx, x, y, len * 0.4 | 0, col, width * 0.7, branch - 1); ctx.strokeStyle = col; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x, y); }
  }
  ctx.stroke();
}
function drips(ctx, w, h, n, col = '10,8,6', amax = 0.25) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h * 0.8, ww = rr(1, 4), hh = h * rr(0.05, 0.4);
    const g = ctx.createLinearGradient(0, y, 0, y + hh);
    g.addColorStop(0, `rgba(${col},${rr(0.08, amax)})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(x, y, ww, hh);
  }
}

// Bump -> tangent-space normal map from luminance.
export function normalFromCanvas(c, strength = 2.5) {
  const w = c.width, h = c.height;
  const src = g2(c).getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.59 + src[i * 4 + 2] * 0.11) / 255;
  const out = cnv(w, h); const oc = g2(out); const img = oc.createImageData(w, h); const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const L = (xx, yy) => lum[((yy + h) % h) * w + ((xx + w) % w)];
    const dx = (L(x + 1, y) - L(x - 1, y)) * strength;
    const dy = (L(x, y + 1) - L(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  oc.putImageData(img, 0, 0);
  return out;
}

// ------------------------------------------------------------------ surfaces
export function asphaltCanvas() {
  const S = 512, c = cnv(S), x = g2(c);
  x.fillStyle = '#2b2a28'; x.fillRect(0, 0, S, S);
  blots(x, S, S, 40, 30, 110, '60,58,54', 0.08, 0.22);           // lighter worn
  blots(x, S, S, 26, 20, 80, '8,8,8', 0.15, 0.4);                // dark patches
  // patch repairs
  for (let i = 0; i < 6; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '20,20,20' : '55,53,50'},${rr(0.25, 0.55)})`; x.fillRect(R() * S, R() * S, rr(30, 120), rr(20, 90)); }
  // oil stains (wrapped)
  blots(x, S, S, 14, 10, 40, '5,5,6', 0.35, 0.7);
  for (let i = 0; i < 4500; i++) { const v = ri(30, 120); x.fillStyle = rgba(v, v - 2, v - 6, rr(0.2, 0.6)); x.fillRect(R() * S, R() * S, rr(1, 2.5), rr(1, 2.5)); }
  for (let i = 0; i < 18; i++) crack(x, R() * S, R() * S, ri(10, 40), 'rgba(0,0,0,0.6)', rr(1, 2.2));
  // tar seams
  for (let i = 0; i < 4; i++) { x.strokeStyle = 'rgba(8,8,8,0.55)'; x.lineWidth = rr(2, 4); x.beginPath(); const y = R() * S; x.moveTo(0, y); for (let k = 0; k <= 16; k++) x.lineTo(k * 32, y + (R() - 0.5) * 10); x.stroke(); }
  noise(x, S, S, 26);
  return c;
}

export function sidewalkCanvas() {
  const S = 512, c = cnv(S), x = g2(c);
  x.fillStyle = '#6f6b63'; x.fillRect(0, 0, S, S);
  const n = 4, s = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    x.fillStyle = jitter('#6f6b63', 0.18); x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    if (R() < 0.3) crack(x, i * s + R() * s, j * s + R() * s, ri(8, 22), 'rgba(20,18,15,0.6)', 1.3);
    if (R() < 0.12) { x.fillStyle = 'rgba(30,28,24,0.35)'; x.fillRect(i * s + 4, j * s + 4, s - 8, s - 8); }
  }
  x.strokeStyle = 'rgba(25,23,20,0.85)'; x.lineWidth = 3;
  for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, S); x.stroke(); x.beginPath(); x.moveTo(0, i * s); x.lineTo(S, i * s); x.stroke(); }
  blots(x, S, S, 30, 12, 60, '20,16,10', 0.12, 0.35);
  blots(x, S, S, 10, 6, 20, '50,30,10', 0.12, 0.3);
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(20,20,20,${rr(0.3, 0.6)})`; x.beginPath(); x.arc(R() * S, R() * S, rr(1.5, 4), 0, 7); x.fill(); } // gum
  noise(x, S, S, 22);
  return c;
}

export function groundCanvas() {
  const S = 512, c = cnv(S), x = g2(c);
  x.fillStyle = '#8a8680'; x.fillRect(0, 0, S, S);
  blots(x, S, S, 70, 20, 90, '40,38,34', 0.1, 0.3);
  blots(x, S, S, 40, 15, 70, '170,165,150', 0.06, 0.18);
  for (let i = 0; i < 9000; i++) { const v = ri(60, 190); x.fillStyle = rgba(v, v - 3, v - 8, rr(0.15, 0.5)); x.fillRect(R() * S, R() * S, rr(1, 3), rr(1, 3)); }
  for (let i = 0; i < 10; i++) crack(x, R() * S, R() * S, ri(8, 25), 'rgba(20,18,15,0.4)', 1.2);
  noise(x, S, S, 30);
  return c;
}

// Neutral, softly weathered surface for vertex-colored props (no scratches).
export function propCanvas(base = '#a8a49c') {
  const S = 256, c = cnv(S), x = g2(c);
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  blots(x, S, S, 22, 12, 60, '20,16,12', 0.05, 0.16);
  blots(x, S, S, 10, 10, 40, '200,195,180', 0.04, 0.1);
  noise(x, S, S, 14);
  return c;
}

export function roofCanvas() {
  const S = 256, c = cnv(S), x = g2(c);
  x.fillStyle = '#34322e'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 5000; i++) { const v = ri(30, 110); x.fillStyle = rgba(v, v, v - 4, 0.5); x.fillRect(R() * S, R() * S, 2, 2); }
  x.strokeStyle = 'rgba(15,15,15,0.7)'; x.lineWidth = 2;
  for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(0, i * 64 + 2); x.lineTo(S, i * 64 + 2); x.stroke(); }
  blots(x, S, S, 18, 10, 50, '10,10,10', 0.2, 0.45);
  blots(x, S, S, 6, 10, 30, '60,70,40', 0.15, 0.3);
  noise(x, S, S, 20);
  return c;
}

export function shingleCanvas() {
  const S = 256, c = cnv(S), x = g2(c);
  x.fillStyle = '#2e2a28'; x.fillRect(0, 0, S, S);
  const rh = 16, sw = 22;
  for (let r = 0; r < S / rh; r++) for (let i = -1; i < S / sw + 1; i++) {
    x.fillStyle = jitter('#4a403a', 0.35);
    x.fillRect(i * sw + (r % 2) * sw / 2 + 1, r * rh + 1, sw - 2, rh - 2);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(i * sw + (r % 2) * sw / 2, r * rh + rh - 4, sw, 3);
  }
  blots(x, S, S, 12, 10, 40, '40,50,20', 0.2, 0.4);
  noise(x, S, S, 22);
  return c;
}

export function corrugatedCanvas(base = '#6d6f6c', rust = 0.5) {
  const S = 256, c = cnv(S), x = g2(c);
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 8) {
    const g = x.createLinearGradient(i, 0, i + 8, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(0.45, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    x.fillStyle = g; x.fillRect(i, 0, 8, S);
  }
  blots(x, S, S, 30 * rust, 6, 40, '110,50,18', 0.2, 0.55);
  drips(x, S, S, 50 * rust, '90,40,12', 0.4);
  drips(x, S, S, 30, '10,8,6', 0.3);
  for (let i = 0; i < 3; i++) { x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(0, R() * S, S, 2); }
  noise(x, S, S, 18);
  return c;
}

export function rustCanvas() {
  const S = 256, c = cnv(S), x = g2(c);
  x.fillStyle = '#6a5a4c'; x.fillRect(0, 0, S, S);
  blots(x, S, S, 60, 8, 50, '120,52,20', 0.25, 0.6);
  blots(x, S, S, 30, 8, 40, '40,30,25', 0.2, 0.5);
  drips(x, S, S, 50, '80,35,10', 0.4);
  noise(x, S, S, 30, { mono: false });
  return c;
}

export function woodCanvas() {
  const S = 256, c = cnv(S), x = g2(c);
  x.fillStyle = '#5a4632'; x.fillRect(0, 0, S, S);
  const ph = 32;
  for (let i = 0; i < S / ph; i++) {
    x.fillStyle = jitter('#6a543c', 0.3); x.fillRect(0, i * ph + 2, S, ph - 3);
    x.strokeStyle = 'rgba(30,20,10,0.3)'; x.lineWidth = 1;
    for (let k = 0; k < 6; k++) { x.beginPath(); const y = i * ph + rr(4, ph - 4); x.moveTo(0, y); for (let s = 0; s <= 8; s++) x.lineTo(s * 32, y + (R() - 0.5) * 3); x.stroke(); }
    x.fillStyle = 'rgba(10,8,5,0.8)'; x.fillRect(0, i * ph, S, 2);
    for (let k = 0; k < 4; k++) { x.fillStyle = '#222'; x.fillRect(rr(0, S), i * ph + 8, 3, 3); }
  }
  blots(x, S, S, 15, 10, 40, '20,15,10', 0.2, 0.4);
  noise(x, S, S, 20);
  return c;
}

export function containerCanvas() {
  const S = 256, c = cnv(S), x = g2(c);
  x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 16) {
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(i, 0, 3, S);
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(i + 8, 0, 4, S);
  }
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, S, 8); x.fillRect(0, S - 8, S, 8);
  blots(x, S, S, 30, 8, 30, '90,40,15', 0.3, 0.6);
  drips(x, S, S, 40, '70,30,10', 0.35);
  noise(x, S, S, 20);
  return c;
}

export function chainLinkCanvas() {
  const S = 128, c = cnv(S), x = g2(c);
  x.clearRect(0, 0, S, S);
  x.strokeStyle = 'rgba(150,150,145,1)'; x.lineWidth = 2.2;
  const s = 16;
  for (let i = -S; i < S * 2; i += s) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke();
    x.beginPath(); x.moveTo(i, S); x.lineTo(i + S, 0); x.stroke();
  }
  x.fillStyle = 'rgba(120,120,115,1)'; x.fillRect(0, 0, S, 3); // top rail
  return c;
}

export function wornPaintCanvas() {
  const S = 256, c = cnv(S), x = g2(c);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(40,40,40,${rr(0.3, 0.9)})`; x.fillRect(R() * S, R() * S, rr(1, 6), rr(1, 6)); }
  blots(x, S, S, 20, 10, 40, '60,60,60', 0.3, 0.6);
  noise(x, S, S, 30);
  return c;
}

export function glowCanvas(size = 128, inner = 1) {
  const c = cnv(size), x = g2(c);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(255,255,255,${inner})`); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return c;
}

export function beamCanvas() {
  const c = cnv(8, 128), x = g2(c);
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 8, 128);
  return c;
}

export function puffCanvas() {
  const S = 64, c = cnv(S), x = g2(c);
  for (let i = 0; i < 14; i++) blot(x, S / 2 + (R() - 0.5) * 22, S / 2 + (R() - 0.5) * 22, rr(10, 22), '255,255,255', rr(0.15, 0.35));
  return c;
}

export function waterNormalCanvas() {
  const S = 256, c = cnv(S), x = g2(c);
  x.fillStyle = '#808080'; x.fillRect(0, 0, S, S);
  blots(x, S, S, 160, 4, 22, '255,255,255', 0.05, 0.2);
  blots(x, S, S, 160, 4, 22, '0,0,0', 0.05, 0.2);
  return normalFromCanvas(c, 6);
}

// ------------------------------------------------------------------ wall painters
function paintBrick(x, x0, y0, w, h, brick, mortar, bw = 21, bh = 8) {
  x.fillStyle = mortar; x.fillRect(x0, y0, w, h);
  for (let r = 0; r * bh < h; r++) {
    const off = (r % 2) * bw / 2;
    for (let i = -1; i * bw < w + bw; i++) {
      x.fillStyle = jitter(brick, 0.28);
      x.fillRect(x0 + i * bw + off + 1, y0 + r * bh + 1, bw - 2, bh - 2);
    }
  }
}
function paintPanels(x, w, h, base) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = jitter(base, 0.1); x.fillRect(i * 128 + 1, j * 128 + 1, 126, 126); }
  x.fillStyle = 'rgba(0,0,0,0.35)';
  for (let j = 0; j < 4; j++) x.fillRect(0, j * 128 + 116, w, 3);
  for (let i = 0; i < 2; i++) x.fillRect(i * 256, 0, 2, h);
}
function paintStucco(x, w, h, base) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  blots(x, w, h, 50, 10, 60, '255,250,235', 0.04, 0.1);
}
function paintSiding(x, w, h, base) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 12) { x.fillStyle = jitter(base, 0.12); x.fillRect(0, y + 1, w, 10); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, y + 10, w, 2); }
}
function paintTiles(x, w, h, base) {
  x.fillStyle = '#5a5a56'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 16) for (let j = 0; j < h; j += 16) { x.fillStyle = jitter(base, 0.08); x.fillRect(i + 1, j + 1, 14, 14); }
}
function paintStone(x, w, h, base) {
  x.fillStyle = '#4a463e'; x.fillRect(0, 0, w, h);
  for (let r = 0; r < h / 32; r++) for (let i = -1; i < w / 64 + 1; i++) { x.fillStyle = jitter(base, 0.12); x.fillRect(i * 64 + (r % 2) * 32 + 1, r * 32 + 1, 62, 30); }
}

// ------------------------------------------------------------------ facades
// One clean window system per facade: a regular 4x4 grid of identical windows
// (3m bays x 3.5m floors), framed, with a sill/lintel. Weathering is a light
// wash of grime; no cracks, no broken panes, no painted-on clutter.
const FACADE_SPECS = {
  brick_red: { wall: (x) => paintBrick(x, 0, 0, 512, 512, '#6b3423', '#3b332c'), win: [32, 26, 64, 76], frame: '#26201b', sill: '#8a8070', boarded: 0, lit: 0.42, lintel: '#7a6e60' },
  brick_dirty: { wall: (x) => paintBrick(x, 0, 0, 512, 512, '#7a6448', '#3e362c'), win: [32, 26, 64, 76], frame: '#2a241e', sill: '#857a68', boarded: 0.03, lit: 0.38 },
  tenement: { wall: (x) => paintBrick(x, 0, 0, 512, 512, '#5a3a2c', '#2e2822'), win: [36, 26, 56, 74], frame: '#1e1915', sill: '#6d6556', boarded: 0.07, lit: 0.3, soot: 1, lintel: '#4a3c32' },
  concrete: { wall: (x) => paintPanels(x, 512, 512, '#6c6964'), win: [12, 30, 104, 62], frame: '#2b2b2b', sill: '#55524d', boarded: 0, lit: 0.45, mull: 3, cool: 0.4 },
  brownstone: { wall: (x) => paintStone(x, 512, 512, '#5e4636'), win: [34, 22, 60, 80], frame: '#211b16', sill: '#8a7a66', boarded: 0, lit: 0.45, lintel: '#8a7a66' },
  glass: { glass: true, lit: 0.38 },
  glass_green: { glass: true, tint: ['#16231f', '#22332c'], lit: 0.34 },
  stucco: { wall: (x) => paintStucco(x, 512, 512, '#9a8f78'), win: [38, 24, 52, 76], frame: '#3a3128', sill: '#b0a48c', boarded: 0, lit: 0.5, shutters: '#2e3a2c' },
  stucco_pink: { wall: (x) => paintStucco(x, 512, 512, '#9c7c76'), win: [38, 24, 52, 76], frame: '#3a3128', sill: '#b0a48c', boarded: 0, lit: 0.45, shutters: '#4a2a2a' },
  corrugated: { wall: (x) => { const c = corrugatedCanvas('#5f6563', 0.4); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) x.drawImage(c, i * 256, j * 256); }, win: [20, 14, 88, 24], winRows: [1], frame: '#222', sill: null, boarded: 0, lit: 0.25, rowsOnly: true, soot: 0.3 },
  corrugated_rust: { wall: (x) => { const c = corrugatedCanvas('#6a4a36', 0.8); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) x.drawImage(c, i * 256, j * 256); }, win: [20, 14, 88, 24], winRows: [1], frame: '#222', sill: null, boarded: 0, lit: 0.15, rowsOnly: true, soot: 0.3 },
  wood: { wall: (x) => paintSiding(x, 512, 512, '#7a6a52'), win: [40, 30, 48, 58], frame: '#3b3125', sill: '#5c4f3c', boarded: 0.04, lit: 0.35 },
  trailer: { wall: (x) => paintSiding(x, 512, 512, '#a59d88'), win: [30, 34, 68, 44], frame: '#555048', sill: null, boarded: 0, lit: 0.4 },
  hospital: { wall: (x) => paintTiles(x, 512, 512, '#a8a59a'), win: [14, 28, 100, 64], frame: '#3b4a52', sill: '#6a6a66', boarded: 0, lit: 0.65, cool: 0.8, mull: 2 },
  stone: { wall: (x) => paintStone(x, 512, 512, '#7a7464'), win: [40, 18, 48, 88], frame: '#2a2622', sill: '#9a927e', boarded: 0, lit: 0.35, lintel: '#9a927e' },
  industrial: { wall: (x) => paintBrick(x, 0, 0, 512, 512, '#4f3a2e', '#2c2620', 24, 9), win: [16, 22, 96, 66], frame: '#1a1a1a', sill: '#4a4640', boarded: 0.04, lit: 0.2, mull: 4 },
};

function glassGrad(x, gx, gy, gw, gh, tint) {
  const g = x.createLinearGradient(gx, gy, gx + gw * 0.4, gy + gh);
  g.addColorStop(0, tint?.[0] ?? '#1c2326'); g.addColorStop(1, tint?.[1] ?? '#2b3438');
  x.fillStyle = g; x.fillRect(gx, gy, gw, gh);
  x.fillStyle = 'rgba(255,255,255,0.05)';
  x.beginPath(); x.moveTo(gx + gw * 0.2, gy); x.lineTo(gx + gw * 0.45, gy); x.lineTo(gx + gw * 0.1, gy + gh); x.lineTo(gx, gy + gh); x.lineTo(gx, gy + gh * 0.7); x.fill();
}
const LIT = ['#ffcf7a', '#ffbf66', '#f5dfa0', '#ffd890', '#ffe7b8', '#ff9f5a'];
const COOL = ['#bcd6ff', '#d8e8ff', '#a8c8f0', '#e8f0ff'];
const TV = ['#7aa8ff', '#9a7aff', '#7affd0'];

function litWindow(e, gx, gy, gw, gh, cool) {
  const col = R() < cool ? pk(COOL) : (R() < 0.08 ? pk(TV) : pk(LIT));
  const g = e.createLinearGradient(gx, gy, gx, gy + gh);
  g.addColorStop(0, col); g.addColorStop(1, shadeHex(col, rr(0.45, 0.85)));
  e.fillStyle = g; e.fillRect(gx, gy, gw, gh);
  const k = R();
  if (k < 0.3) { e.fillStyle = 'rgba(0,0,0,0.55)'; for (let y = gy; y < gy + gh; y += 5) e.fillRect(gx, y, gw, 2); }           // blinds
  else if (k < 0.55) { e.fillStyle = `rgba(${ri(20, 80)},${ri(10, 40)},${ri(10, 40)},0.7)`; e.fillRect(gx, gy, gw * rr(0.2, 0.45), gh); e.fillRect(gx + gw * rr(0.6, 0.8), gy, gw, gh); } // curtains
  else if (k < 0.62) { e.fillStyle = 'rgba(0,0,0,0.8)'; const sx = gx + gw * rr(0.3, 0.6); e.beginPath(); e.arc(sx, gy + gh * 0.45, gw * 0.09, 0, 7); e.fill(); e.fillRect(sx - gw * 0.12, gy + gh * 0.55, gw * 0.24, gh * 0.45); } // silhouette
}
function shadeHex(hex, f) { const [r, g, b] = hexToRgb(hex); return `rgb(${(r * f) | 0},${(g * f) | 0},${(b * f) | 0})`; }

// A boarded-up window: plywood sheet, clean edges.
function boarded(x, gx, gy, gw, gh) {
  x.fillStyle = '#6e5a42'; x.fillRect(gx, gy, gw, gh);
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(gx + gw / 2 - 1, gy, 2, gh);
  x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(gx, gy + gh - 4, gw, 4);
}

// Light, even weathering for walls: soft soot at the top of each tile, a few
// faint streaks. Kept subtle so windows and signs stay the readable layer.
function weather(x, S, soot = 0.5) {
  drips(x, S, S, 18 + 14 * soot, '12,10,8', 0.14);
  blots(x, S, S, 14, 20, 80, '15,12,10', 0.04, 0.1 + soot * 0.06);
  noise(x, S, S, 12);
}

export function facadeTexture(kind, { plain = false } = {}) {
  R = mulberry32(hashStr(kind) ^ 0x51);
  const spec = FACADE_SPECS[kind];
  const S = 512, c = cnv(S), x = g2(c), ec = cnv(S), e = g2(ec);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  if (plain && !spec.glass) {
    // wall only (ground floors behind storefronts, fascias, blank side walls)
    spec.wall(x);
    if (spec.ledge) { x.fillStyle = spec.ledge; for (let j = 0; j < 4; j++) x.fillRect(0, j * 128 + 124, S, 4); }
    weather(x, S, spec.soot ?? 0.5);
    return { map: toTex(c), emissiveMap: null, normalMap: toTex(normalFromCanvas(c, 2), { srgb: false }) };
  }
  if (spec.glass) {
    // Curtain wall: each bay a panel, thin mullions, whole floors lit sometimes.
    x.fillStyle = '#111518'; x.fillRect(0, 0, S, S);
    for (let j = 0; j < 4; j++) {
      const floorLit = R() < spec.lit;
      for (let i = 0; i < 4; i++) {
        const gx = i * 128 + 3, gy = j * 128 + 3, gw = 122, gh = 112;
        glassGrad(x, gx, gy, gw, gh, spec.tint ?? ['#1a2430', '#2a3640']);
        x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(gx + 60, gy, 2, gh);
        if (floorLit ? R() < 0.85 : R() < 0.12) {
          e.fillStyle = R() < 0.7 ? pk(COOL) : pk(LIT); e.globalAlpha = rr(0.45, 1); e.fillRect(gx, gy, gw, gh); e.globalAlpha = 1;
          e.fillStyle = '#000'; e.fillRect(gx + 60, gy, 2, gh);
          if (R() < 0.4) { e.fillStyle = 'rgba(0,0,0,0.6)'; for (let y = gy; y < gy + gh; y += 7) e.fillRect(gx, y, gw, 2); }
        }
      }
      x.fillStyle = '#2a2e30'; x.fillRect(0, j * 128 + 115, S, 13); // spandrel
    }
    drips(x, S, S, 14, '20,16,10', 0.12);
    noise(x, S, S, 8);
  } else {
    spec.wall(x);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      if (spec.winRows && !spec.winRows.includes(j)) continue;
      const [wx, wy, ww, wh] = spec.win;
      const gx = i * 128 + wx, gy = j * 128 + wy;
      if (spec.lintel) { x.fillStyle = spec.lintel; x.fillRect(gx - 6, gy - 10, ww + 12, 8); }
      x.fillStyle = spec.frame; x.fillRect(gx - 4, gy - 4, ww + 8, wh + 8);
      if (R() < spec.boarded) boarded(x, gx, gy, ww, wh);
      else {
        glassGrad(x, gx, gy, ww, wh);
        const lit = R() < spec.lit;
        if (lit) litWindow(e, gx, gy, ww, wh, spec.cool ?? 0.12);
        // mullions
        x.fillStyle = spec.frame; e.fillStyle = '#000';
        const m = spec.mull ?? 2;
        for (let k = 1; k < m; k++) { x.fillRect(gx + (ww * k) / m - 1.5, gy, 3, wh); e.fillRect(gx + (ww * k) / m - 1.5, gy, 3, wh); }
        if (!spec.rowsOnly) { x.fillRect(gx, gy + wh * 0.38, ww, 3); e.fillRect(gx, gy + wh * 0.38, ww, 3); }
      }
      if (spec.sill) { x.fillStyle = spec.sill; x.fillRect(gx - 6, gy + wh + 3, ww + 12, 6); x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(gx - 6, gy + wh + 9, ww + 12, 2); }
      if (spec.shutters) { x.fillStyle = spec.shutters; x.fillRect(gx - 18, gy - 2, 13, wh + 4); x.fillRect(gx + ww + 5, gy - 2, 13, wh + 4); x.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = gy; y < gy + wh; y += 6) { x.fillRect(gx - 18, y, 13, 2); x.fillRect(gx + ww + 5, y, 13, 2); } }
    }
    if (spec.ledge) { x.fillStyle = spec.ledge; for (let j = 0; j < 4; j++) x.fillRect(0, j * 128 + 124, S, 4); }
    weather(x, S, spec.soot ?? 0.5);
  }
  const map = toTex(c), emissiveMap = toTex(ec);
  const normalMap = spec.glass ? null : toTex(normalFromCanvas(c, 2), { srgb: false });
  return { map, emissiveMap, normalMap };
}

// Storefront bay atlas: 8 cells (each one 3m x 4.5m bay, 128x192 px). The
// frame/fascia/kickplate are painted light so the per-shop vertex tint colors
// them; glass and lit interiors are not tinted (emissive).
// 0 display warm · 1 display cool · 2 display (goods, dim) · 3 display dark
// 4 glass door (lit) · 5 steel door · 6 roll-down shutter · 7 blank panel
export const SHOP_CELL = { warm: 0, cool: 1, goods: 2, dark: 3, door: 4, steel: 5, shutter: 6, blank: 7 };
export function storefrontAtlas() {
  R = mulberry32(0x5F0);
  const CW = 128, H = 192, W = CW * 8, c = cnv(W, H), x = g2(c), ec = cnv(W, H), e = g2(ec);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const FR = '#bdb7ab', TRIM = '#24211d';
  for (let i = 0; i < 8; i++) {
    const bx = i * CW;
    x.fillStyle = FR; x.fillRect(bx, 0, CW, H);
    // fascia (sign band) with dark trim lines, pilasters on both sides
    x.fillStyle = 'rgba(0,0,0,0.10)'; x.fillRect(bx, 4, CW, 34);
    x.fillStyle = TRIM; x.fillRect(bx, 0, CW, 3); x.fillRect(bx, 40, CW, 4);
    x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(bx, 0, 5, H); x.fillRect(bx + CW - 5, 0, 5, H);
    x.fillStyle = TRIM; x.fillRect(bx, H - 5, CW, 5); // base
    if (i <= 3) {
      // display window: frame, glass, center mullion, transom, kickplate
      x.fillStyle = TRIM; x.fillRect(bx + 10, 50, CW - 20, 114);
      glassGrad(x, bx + 13, 53, CW - 26, 108);
      x.fillStyle = TRIM; x.fillRect(bx + CW / 2 - 2, 53, 4, 108); x.fillRect(bx + 13, 74, CW - 26, 3);
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(bx + 10, 166, CW - 20, 20);
      if (i <= 2) {
        const col = i === 1 ? '#cfe0f0' : i === 0 ? '#ffd79a' : '#e8c890';
        const g = e.createLinearGradient(0, 53, 0, 161);
        g.addColorStop(0, col); g.addColorStop(1, shadeHex(col.startsWith('#') ? col : '#ffd79a', i === 2 ? 0.35 : 0.6));
        e.globalAlpha = i === 2 ? 0.55 : 1; e.fillStyle = g; e.fillRect(bx + 13, 53, CW - 26, 108); e.globalAlpha = 1;
        e.fillStyle = '#000'; e.fillRect(bx + CW / 2 - 2, 53, 4, 108); e.fillRect(bx + 13, 74, CW - 26, 3);
        // two shelves of goods as clean silhouettes
        for (const sy of [118, 148]) { e.fillStyle = 'rgba(0,0,0,0.55)'; e.fillRect(bx + 16, sy, CW - 32, 3); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(bx + 16, sy, CW - 32, 3); }
        for (let k = 0; k < 6; k++) { const gx = bx + 18 + k * 16; e.fillStyle = 'rgba(0,0,0,0.35)'; e.fillRect(gx, 104 + (k % 2) * 4, 10, 14 - (k % 2) * 4); e.fillRect(gx + 2, 136 - (k % 3) * 3, 9, 12 + (k % 3) * 3); }
      }
    } else if (i === 4 || i === 5) {
      // door with transom, flanked by panels
      x.fillStyle = TRIM; x.fillRect(bx + 32, 50, 64, H - 55);
      if (i === 4) {
        glassGrad(x, bx + 37, 56, 54, 14); glassGrad(x, bx + 38, 76, 52, 104);
        x.fillStyle = '#9a9a92'; x.fillRect(bx + 80, 124, 6, 16);
        e.fillStyle = '#ffd890'; e.fillRect(bx + 37, 56, 54, 14); e.globalAlpha = 0.8; e.fillRect(bx + 38, 76, 52, 104); e.globalAlpha = 1;
      } else {
        x.fillStyle = '#5a5e5c'; x.fillRect(bx + 36, 54, 56, H - 59);
        x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(bx + 40, 60, 48, 2); x.fillRect(bx + 40, 120, 48, 2);
        x.fillStyle = '#2a2a2a'; x.fillRect(bx + 80, 122, 6, 16);
        e.fillStyle = 'rgba(255,200,120,0.5)'; e.fillRect(bx + 36, H - 8, 56, 3);
      }
      for (const px of [bx + 10, bx + 100]) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(px, 56, 18, 124); }
    } else if (i === 6) {
      x.fillStyle = TRIM; x.fillRect(bx + 10, 46, CW - 20, H - 51);
      x.fillStyle = '#6a6b66'; x.fillRect(bx + 13, 49, CW - 26, H - 56);
      for (let y = 49; y < H - 7; y += 6) { x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(bx + 13, y, CW - 26, 2); }
      x.fillStyle = '#2a2a28'; x.fillRect(bx + CW / 2 - 8, H - 14, 16, 4);
    } else {
      x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(bx + 12, 52, CW - 24, H - 62);
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(bx + 12, 52, CW - 24, 2); x.fillRect(bx + 12, H - 12, CW - 24, 2);
    }
  }
  drips(x, W, H, 24, '12,10,8', 0.12);
  noise(x, W, H, 10);
  return { map: toTex(c, { repeat: false }), emissiveMap: toTex(ec, { repeat: false }) };
}
export function shopUV(i) { const u0 = i / 8; return [u0 + 0.002, 0, u0 + 1 / 8 - 0.002, 1]; }

// Clean, readable sign face (no scratches): flat board, border, centered text.
export function cleanSignCanvas(text, { width = 1024, height = 256, bg = '#1a1612', fg = '#e6dfcf', border = '#3b342b', font = 'Special Elite' } = {}) {
  const c = cnv(width, height), x = g2(c);
  x.fillStyle = bg; x.fillRect(0, 0, width, height);
  const lw = Math.max(6, height * 0.07);
  x.strokeStyle = border; x.lineWidth = lw; x.strokeRect(lw / 2, lw / 2, width - lw, height - lw);
  let size = height * 0.62;
  const fam = font === 'Barlow Condensed' ? `bold ${FONT2}` : FONT;
  x.font = `${size}px ${fam}`;
  while (x.measureText(text).width > width * 0.88 && size > 10) { size -= 2; x.font = `${size}px ${fam}`; }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = fg; x.fillText(text, width / 2, height / 2 + size * 0.04);
  // a whisper of weathering at the bottom edge only
  const g = x.createLinearGradient(0, height * 0.7, 0, height);
  g.addColorStop(0, 'rgba(10,8,6,0)'); g.addColorStop(1, 'rgba(10,8,6,0.22)');
  x.fillStyle = g; x.fillRect(0, 0, width, height);
  return c;
}

// Door atlas: 4 x 2 doors (128x256 each).
// 0 wood, 1 steel, 2 glass (lit), 3 roll-up, 4 double glass (lit), 5 boarded, 6 motel "6", 7 ornate double
export function doorAtlas() {
  R = mulberry32(0xD00D);
  const W = 512, H = 512, c = cnv(W, H), x = g2(c), ec = cnv(W, H), e = g2(ec);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const cell = (i) => [(i % 4) * 128, Math.floor(i / 4) * 256];
  for (let i = 0; i < 8; i++) {
    const [ox, oy] = cell(i);
    x.fillStyle = '#1b1814'; x.fillRect(ox, oy, 128, 256);
    x.fillStyle = '#3a342c'; x.fillRect(ox + 4, oy + 4, 120, 252); // frame
    const ix = ox + 12, iy = oy + 14, iw = 104, ih = 242;
    if (i === 0 || i === 6) {
      x.fillStyle = i === 6 ? '#5a3a2c' : '#4a3626'; x.fillRect(ix, iy, iw, ih);
      x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = 3; x.strokeRect(ix + 12, iy + 14, iw - 24, 90); x.strokeRect(ix + 12, iy + 120, iw - 24, 100);
      x.fillStyle = '#b8a060'; x.beginPath(); x.arc(ix + iw - 16, iy + 130, 5, 0, 7); x.fill();
      if (i === 6) { x.fillStyle = '#c8b070'; x.font = `bold 44px ${FONT}`; x.textAlign = 'center'; x.fillText('6', ix + iw / 2, iy + 70); x.textAlign = 'left'; e.fillStyle = 'rgba(255,190,110,0.9)'; e.fillRect(ix, iy + ih - 4, iw, 4); }
      else { e.fillStyle = 'rgba(255,190,110,0.8)'; e.fillRect(ix, iy + ih - 4, iw, 4); }
      x.fillStyle = 'rgba(255,255,255,0.1)'; x.fillRect(ix + 30, iy + 30, 40, 26);
    } else if (i === 1) {
      x.fillStyle = '#4e5250'; x.fillRect(ix, iy, iw, ih);
      x.fillStyle = '#2a2c2c'; x.fillRect(ix + 8, iy + 110, iw - 16, 6);
      x.fillStyle = '#222'; x.fillRect(ix + iw - 22, iy + 120, 12, 26);
      x.strokeStyle = pk(['#c0e040', '#e04080']); x.lineWidth = 5; x.beginPath(); x.moveTo(ix + 10, iy + 180); x.bezierCurveTo(ix + 40, iy + 140, ix + 70, iy + 220, ix + 96, iy + 160); x.stroke();
      e.fillStyle = 'rgba(255,200,120,0.6)'; e.fillRect(ix, iy + ih - 3, iw, 3);
    } else if (i === 2 || i === 4) {
      x.fillStyle = '#222'; x.fillRect(ix, iy, iw, ih);
      if (i === 2) { glassGrad(x, ix + 8, iy + 8, iw - 16, ih - 40); e.fillStyle = '#ffd890'; e.fillRect(ix + 8, iy + 8, iw - 16, ih - 40); }
      else { glassGrad(x, ix + 6, iy + 8, iw / 2 - 9, ih - 30); glassGrad(x, ix + iw / 2 + 3, iy + 8, iw / 2 - 9, ih - 30); e.fillStyle = '#ffe2a8'; e.fillRect(ix + 6, iy + 8, iw / 2 - 9, ih - 30); e.fillRect(ix + iw / 2 + 3, iy + 8, iw / 2 - 9, ih - 30); }
      x.fillStyle = '#888'; x.fillRect(ix + iw / 2 - 20, iy + 120, 40, 5);
      e.fillStyle = '#000'; e.fillRect(ix + iw / 2 - 20, iy + 120, 40, 5);
    } else if (i === 3) {
      x.fillStyle = '#6a6c66'; x.fillRect(ix - 8, iy, iw + 16, ih);
      for (let y = iy; y < iy + ih; y += 8) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(ix - 8, y, iw + 16, 2); }
      blots(x, 1, 1, 0, 1, 1, '0,0,0', 0, 0);
      for (let k = 0; k < 6; k++) blot(x, ix + R() * iw, iy + R() * ih, rr(8, 24), '100,45,15', 0.4);
    } else if (i === 5) {
      x.fillStyle = '#1a1612'; x.fillRect(ix, iy, iw, ih);
      for (let k = 0; k < 6; k++) { x.save(); x.translate(ox + 64, iy + 20 + k * 40); x.rotate((R() - 0.5) * 0.4); x.fillStyle = jitter('#7a6244', 0.3); x.fillRect(-60, -14, 120, 28); x.restore(); }
      e.fillStyle = 'rgba(255,150,60,0.3)'; for (let k = 0; k < 5; k++) e.fillRect(ix + 4, iy + 38 + k * 40, iw - 8, 2);
    } else if (i === 7) {
      x.fillStyle = '#3a2216'; x.fillRect(ix, iy, iw, ih);
      x.strokeStyle = '#b89a50'; x.lineWidth = 3; x.strokeRect(ix + 8, iy + 10, iw / 2 - 12, ih - 20); x.strokeRect(ix + iw / 2 + 4, iy + 10, iw / 2 - 12, ih - 20);
      x.fillStyle = '#c8a850'; x.fillRect(ix + iw / 2 - 8, iy + 120, 4, 22); x.fillRect(ix + iw / 2 + 4, iy + 120, 4, 22);
      glassGrad(x, ix + 18, iy + 20, 30, 60); glassGrad(x, ix + iw - 48, iy + 20, 30, 60);
      e.fillStyle = '#ffcf80'; e.fillRect(ix + 18, iy + 20, 30, 60); e.fillRect(ix + iw - 48, iy + 20, 30, 60); e.fillRect(ix, iy + ih - 3, iw, 3);
    }
  }
  drips(x, W, H, 60, '10,8,6', 0.3);
  noise(x, W, H, 16);
  return { map: toTex(c, { repeat: false }), emissiveMap: toTex(ec, { repeat: false }) };
}
export function doorUV(i) { const u0 = (i % 4) / 4, v1 = 1 - Math.floor(i / 4) / 2; return [u0 + 0.004, v1 - 0.5, u0 + 0.246, v1]; }

// Shop sign atlas: 2 x 16 cells of 512x128.
export const SHOP_SIGNS = [
  'CHECKS CA$HED', 'PAYDAY LOANS', 'BAIL BONDS 24/7', 'LAUNDROMAT', 'NOODLE HOLE', 'WIGS & GUNS', 'DISCOUNT TEETH',
  'TAXIDERMY', 'PHONE REPAIR', 'LIQUOR', 'NAILS', 'TAX PREP (ISH)', 'ADULT BOOKS & BAIT', 'MASSAGE (LEGIT)',
  'PAWN', 'DONUTS', 'BURGER BARN', 'VAPE CAVE', 'CASH 4 GOLD', 'HOTEL', 'LOTTO', 'COIN-OP', 'DENTAL-ISH',
  'DIVORCE LAWYER', 'FRIED THINGS', 'BEER COLD', 'SECOND HAND SOCKS', 'RENT-A-GOAT', 'PSYCHIC', 'CHURCH OF BINGO',
  'HAIR & SCARE', 'MEAT',
];
export function signAtlas() {
  R = mulberry32(0x5164);
  const W = 1024, H = 2048, c = cnv(W, H), x = g2(c), ec = cnv(W, H), e = g2(ec);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const bgs = ['#1d1a16', '#2a1414', '#14202a', '#1a2414', '#2a2414', '#241428', '#0e0e0e'];
  const fgs = ['#f0e0b0', '#ff5050', '#60e0ff', '#a0ff60', '#ffd040', '#ff70e0', '#ffffff', '#ff9a40'];
  SHOP_SIGNS.forEach((t, i) => {
    const ox = (i % 2) * 512, oy = Math.floor(i / 2) * 128;
    const bg = pk(bgs), fg = pk(fgs);
    x.fillStyle = bg; x.fillRect(ox, oy, 512, 128);
    x.strokeStyle = '#4a4036'; x.lineWidth = 8; x.strokeRect(ox + 4, oy + 4, 504, 120);
    let size = 70; const font = R() < 0.5 ? FONT : `bold ${FONT2}`;
    x.font = `${size}px ${font}`;
    while (x.measureText(t).width > 470 && size > 20) { size -= 2; x.font = `${size}px ${font}`; }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = fg; x.fillText(t, ox + 256, oy + 66);
    e.font = x.font; e.textAlign = 'center'; e.textBaseline = 'middle';
    e.fillStyle = R() < 0.1 ? '#000' : fg; // a few are dead
    e.fillText(t, ox + 256, oy + 66);
  });
  drips(x, W, H, 40, '10,8,6', 0.15);
  noise(x, W, H, 10);
  return { map: toTex(c, { repeat: false }), emissiveMap: toTex(ec, { repeat: false }), count: SHOP_SIGNS.length };
}
export function signUV(i) { const u0 = (i % 2) / 2, v1 = 1 - Math.floor(i / 2) / 16; return [u0, v1 - 1 / 16, u0 + 0.5, v1]; }

// Billboards: 2 x 4 cells of 1024x320. Original crude parody ads.
export const ADS = [
  { bg: '#d8c49a', fg: '#2a1a10', head: 'PIZZA BUTT', sub: "GRAB A SLICE OF THIS", art: 'pizza', acc: '#c03a20' },
  { bg: '#1e3a4a', fg: '#f0f0e0', head: 'DR. FILLMORE', sub: 'DISCOUNT DENTISTRY · WE PULL ANYTHING', art: 'tooth', acc: '#ffe060' },
  { bg: '#2a2a2a', fg: '#c8ff40', head: 'GRIMCO', sub: 'BREATHE RESPONSIBLY™  (AIR SOLD SEPARATELY)', art: 'stack', acc: '#c8ff40' },
  { bg: '#a01818', fg: '#fff4d0', head: 'HURT? SUE!', sub: 'BUCK HOLLER, ATTORNEY · 1-800-SUE-THEM', art: 'gavel', acc: '#ffd040' },
  { bg: '#e8e0c8', fg: '#1a1a3a', head: 'RE-ELECT MAYOR SCHMUCKLE', sub: "HE'S FINE. PROBABLY.", art: 'face', acc: '#2040a0' },
  { bg: '#101010', fg: '#ffcf40', head: 'GOLDEN TOOTH CASINO', sub: 'LOSE BIG. FEEL SOMETHING.', art: 'dice', acc: '#ff4040' },
  { bg: '#4a8a3a', fg: '#ffffff', head: 'COLON BLOW', sub: 'ENERGY DRINK · CLEARS YOU RIGHT OUT', art: 'can', acc: '#ffe040' },
  { bg: '#5a4a6a', fg: '#ffe0f0', head: 'MYSTERY MEAT', sub: 'NOW 20% MEAT! · ROTWELL RENDERING', art: 'meat', acc: '#ff8090' },
];
export function adAtlas() {
  R = mulberry32(0xAD5);
  const CW = 1024, CH = 320, W = CW * 2, H = CH * 4, c = cnv(W, H), x = g2(c);
  ADS.forEach((ad, i) => {
    const ox = (i % 2) * CW, oy = Math.floor(i / 2) * CH;
    x.save(); x.beginPath(); x.rect(ox, oy, CW, CH); x.clip();
    x.fillStyle = ad.bg; x.fillRect(ox, oy, CW, CH);
    // stripes
    x.fillStyle = 'rgba(0,0,0,0.08)'; for (let k = 0; k < 12; k++) x.fillRect(ox + k * 90, oy, 40, CH);
    drawAdArt(x, ad, ox + 830, oy + CH / 2);
    x.fillStyle = ad.fg; x.textBaseline = 'middle';
    let size = 110; x.font = `bold ${size}px ${FONT2}`;
    while (x.measureText(ad.head).width > 680 && size > 30) { size -= 4; x.font = `bold ${size}px ${FONT2}`; }
    x.fillText(ad.head, ox + 40, oy + 120);
    x.fillStyle = ad.acc; x.fillRect(ox + 40, oy + 190, 680, 6);
    size = 40; x.font = `${size}px ${FONT}`; x.fillStyle = ad.fg;
    while (x.measureText(ad.sub).width > 690 && size > 14) { size -= 2; x.font = `${size}px ${FONT}`; }
    x.fillText(ad.sub, ox + 40, oy + 240);
    // peeling paper
    for (let k = 0; k < 5; k++) {
      x.fillStyle = `rgba(${ri(180, 230)},${ri(170, 220)},${ri(150, 200)},${rr(0.5, 0.9)})`;
      const px = ox + R() * CW, py = oy + R() * CH;
      x.beginPath(); x.moveTo(px, py); for (let s = 0; s < 6; s++) x.lineTo(px + rr(-60, 60), py + rr(-40, 40)); x.fill();
    }
    // graffiti scrawl on some
    if (R() < 0.6) { x.strokeStyle = pk(['#b8ff30', '#ff40c0', '#ffffff', '#202020']); x.lineWidth = 7; x.font = `bold 60px ${FONT}`; x.strokeText(pk(['ROT', 'LIES', 'SUX', 'NOPE', 'RATS', 'LOL']), ox + rr(100, 700), oy + rr(80, 260)); }
    drips(x, CW, CH, 0);
    for (let k = 0; k < 60; k++) { const g = x.createLinearGradient(0, oy, 0, oy + CH); g.addColorStop(0, 'rgba(10,8,6,0.3)'); g.addColorStop(1, 'rgba(10,8,6,0)'); x.fillStyle = g; x.fillRect(ox + R() * CW, oy + R() * 40, rr(2, 5), rr(40, 200)); }
    for (let k = 0; k < 20; k++) blot(x, ox + R() * CW, oy + R() * CH, rr(20, 90), '20,15,10', rr(0.08, 0.25));
    x.restore();
  });
  noise(x, W, H, 18);
  const t = toTex(c, { repeat: false });
  return { map: t };
}
export function adUV(i) { const u0 = (i % 2) / 2, v1 = 1 - Math.floor(i / 2) / 4; return [u0, v1 - 0.25, u0 + 0.5, v1]; }

function drawAdArt(x, ad, cx, cy) {
  x.save(); x.translate(cx, cy);
  x.fillStyle = ad.acc; x.strokeStyle = '#111'; x.lineWidth = 6;
  switch (ad.art) {
    case 'pizza': x.fillStyle = '#e8b040'; x.beginPath(); x.moveTo(-110, -110); x.lineTo(110, -110); x.lineTo(0, 130); x.closePath(); x.fill(); x.stroke(); x.fillStyle = '#b02a18'; for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(rr(-60, 60), rr(-90, 20), 16, 0, 7); x.fill(); } x.fillStyle = '#9a6a20'; x.fillRect(-115, -125, 230, 22); break;
    case 'tooth': x.fillStyle = '#f4f0e0'; x.beginPath(); x.moveTo(-70, -100); x.quadraticCurveTo(0, -130, 70, -100); x.quadraticCurveTo(90, 0, 50, 110); x.lineTo(20, 20); x.lineTo(-20, 20); x.lineTo(-50, 110); x.quadraticCurveTo(-90, 0, -70, -100); x.fill(); x.stroke(); x.fillStyle = '#c03030'; x.fillRect(-10, -60, 20, 60); break;
    case 'stack': x.fillStyle = '#555'; x.fillRect(-90, -40, 60, 170); x.fillRect(20, -90, 50, 220); x.fillStyle = 'rgba(80,80,60,0.8)'; for (let k = 0; k < 6; k++) { x.beginPath(); x.arc(-60 + k * 12, -60 - k * 20, 30 + k * 6, 0, 7); x.fill(); } break;
    case 'gavel': x.fillStyle = '#6a3a1a'; x.save(); x.rotate(-0.6); x.fillRect(-90, -30, 140, 60); x.fillRect(-20, 30, 22, 120); x.restore(); x.fillStyle = '#ffd040'; x.font = `bold 90px ${FONT2}`; x.fillText('$$$', -80, 110); break;
    case 'face': x.fillStyle = '#e8c8a0'; x.beginPath(); x.arc(0, 0, 100, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#111'; x.beginPath(); x.arc(-35, -20, 10, 0, 7); x.arc(35, -20, 10, 0, 7); x.fill(); x.beginPath(); x.arc(0, 40, 40, 0.2, Math.PI - 0.2); x.stroke(); x.fillStyle = '#d0d0c0'; x.fillRect(-100, -120, 200, 40); break;
    case 'dice': x.fillStyle = '#f0f0f0'; x.save(); x.rotate(0.3); x.fillRect(-80, -80, 120, 120); x.fillStyle = '#c00'; for (const [a, b] of [[-50, -50], [10, 10], [-20, -20]]) { x.beginPath(); x.arc(a, b, 10, 0, 7); x.fill(); } x.restore(); x.fillStyle = '#ffcf40'; x.beginPath(); x.arc(50, 60, 50, 0, 7); x.fill(); break;
    case 'can': x.fillStyle = '#e0e0d0'; x.fillRect(-55, -120, 110, 240); x.fillStyle = '#3a7a2a'; x.fillRect(-55, -60, 110, 120); x.fillStyle = '#ffe040'; x.font = `bold 50px ${FONT2}`; x.fillText('CB', -35, 0); break;
    case 'meat': x.fillStyle = '#c86070'; x.beginPath(); x.ellipse(0, 0, 120, 80, 0.3, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#f0d0c0'; x.beginPath(); x.ellipse(-20, -10, 40, 25, 0.3, 0, 7); x.fill(); x.fillStyle = '#111'; x.font = `bold 40px ${FONT}`; x.fillText('?', 40, 20); break;
  }
  x.restore();
}

// Graffiti atlas: 4x4 transparent tags (256 each).
const TAGS = ['RATS', 'ROT', 'DOX WUZ HERE', 'EAT THE RICH', 'NO HOPE', 'SUX', 'GUTTER', 'LOL', 'K.O.', 'BITE ME', 'RENT IS THEFT', 'SMELLS', '☠', 'YUCK', 'WHY', '420'];
export function graffitiAtlas() {
  R = mulberry32(0x6AFF);
  const S = 1024, c = cnv(S), x = g2(c);
  x.clearRect(0, 0, S, S);
  TAGS.forEach((t, i) => {
    const ox = (i % 4) * 256, oy = Math.floor(i / 4) * 256;
    x.save(); x.beginPath(); x.rect(ox, oy, 256, 256); x.clip();
    x.translate(ox + 128, oy + 128); x.rotate((R() - 0.5) * 0.4);
    const col = pk(['#b8ff30', '#ff40c0', '#f0f0f0', '#ff4040', '#40c0ff', '#ffe040', '#a060ff']);
    let size = 90; x.font = `bold ${size}px ${R() < 0.5 ? FONT : FONT2}`;
    while (x.measureText(t).width > 230 && size > 24) { size -= 4; x.font = `bold ${size}px ${R() < 0.5 ? FONT : FONT2}`; }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineJoin = 'round';
    x.strokeStyle = '#0a0a0a'; x.lineWidth = size * 0.18; x.strokeText(t, 0, 0);
    x.fillStyle = col; x.fillText(t, 0, 0);
    // drips
    x.fillStyle = col;
    for (let k = 0; k < 8; k++) x.fillRect(rr(-100, 100), rr(0, size * 0.3), 2.5, rr(10, 50));
    // overspray
    for (let k = 0; k < 300; k++) { x.globalAlpha = rr(0.1, 0.5); x.fillRect(rr(-120, 120), rr(-60, 60), 1.5, 1.5); }
    x.globalAlpha = 1;
    x.restore();
  });
  return { map: toTex(c, { repeat: false }), count: TAGS.length };
}
export function graffitiUV(i) { const u0 = (i % 4) / 4, v1 = 1 - Math.floor(i / 4) / 4; return [u0, v1 - 0.25, u0 + 0.25, v1]; }

// Lit casino bulb strip (tileable along U) for the chase animation.
export function bulbCanvas() {
  const c = cnv(256, 32), x = g2(c);
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 32);
  for (let i = 0; i < 8; i++) {
    const g = x.createRadialGradient(i * 32 + 16, 16, 0, i * 32 + 16, 16, 14);
    const on = i % 3 !== 0;
    g.addColorStop(0, on ? '#fff6c0' : '#402a10'); g.addColorStop(0.5, on ? '#ffc040' : '#201508'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(i * 32, 0, 32, 32);
  }
  return c;
}

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export { hashStr };
