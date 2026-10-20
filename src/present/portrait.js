// Dialog portraits: a head-and-shoulders stick figure painted on a 2D canvas so it matches the
// 3D stickman (src/entities/stickman.js) without a second WebGL context. Each (look, mood) is
// painted once and cached; dialogs get a cheap drawImage copy.
//
//   portraitCanvas(look, mood) -> HTMLCanvasElement   (cached master; copy it, don't mutate)
//   look = { color, skin, hat, hatColor, build }       same shape as state.p.look / NPC specs
//   mood = 'neutral' | 'angry' | 'smug' | 'worried'
import { BUILDS } from '../entities/stickman.js';

export const PW = 84, PH = 100;     // logical size (CSS px)
const SS = 2;                       // supersampling
const EYE = '#d8d2c0';
const BONE = [230, 223, 207];

const cache = new Map();
let grain = null;

// ---------------------------------------------------------------- colour helpers
export function rgbOf(c, fallback = [20, 20, 20]) {
  if (c == null) return fallback;
  if (typeof c === 'number') return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  if (Array.isArray(c)) return c;
  if (typeof c === 'object' && 'r' in c) return [c.r * 255, c.g * 255, c.b * 255].map(Math.round);
  let s = String(c).trim();
  if (s[0] === '#') {
    s = s.slice(1);
    if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
    const n = parseInt(s.slice(0, 6), 16);
    if (Number.isFinite(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return fallback;
}
const mix = (a, b, k) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const lighten = (c, k) => mix(c, BONE, k);
const darken = (c, k) => mix(c, [0, 0, 0], k);

function grainCanvas() {
  if (grain) return grain;
  grain = document.createElement('canvas');
  grain.width = grain.height = 96;
  const x = grain.getContext('2d');
  const img = x.createImageData(96, 96);
  let s = 1234567;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = (s >> 16) & 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return grain;
}

function keyOf(look, mood) {
  return [look.color, look.skin, look.hat, look.hatColor, look.build, mood].map((v) => String(v ?? '')).join('|');
}

export function portraitCanvas(look = {}, mood = 'neutral') {
  const k = keyOf(look, mood);
  let c = cache.get(k);
  if (!c) {
    c = paint(look, mood);
    cache.set(k, c);
    if (cache.size > 80) cache.delete(cache.keys().next().value);
  }
  return c;
}

// Fresh <canvas> showing the cached portrait (fast: one drawImage).
export function portraitElement(look, mood) {
  const src = portraitCanvas(look, mood);
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.className = 'pr-portrait-cv';
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

// ---------------------------------------------------------------- painting
// Cylinder-ish shading across a stroke from a to b (key light from the upper left).
function limb(x, ax, ay, bx, by, w, base) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;           // normal (points to the stroke's left)
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const g = x.createLinearGradient(mx + nx * w / 2, my + ny * w / 2, mx - nx * w / 2, my - ny * w / 2);
  g.addColorStop(0, css(lighten(base, 0.2)));
  g.addColorStop(0.35, css(lighten(base, 0.07)));
  g.addColorStop(0.8, css(darken(base, 0.5)));
  g.addColorStop(1, css(mix(darken(base, 0.3), BONE, 0.08)));
  x.strokeStyle = g; x.lineWidth = w; x.lineCap = 'round';
  x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
}

function shadedFill(x, path, base, cx, cy, r, { hi = 0.24, lo = 0.62 } = {}) {
  const g = x.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.05, cx, cy, r * 1.35);
  g.addColorStop(0, css(lighten(base, hi)));
  g.addColorStop(0.5, css(base));
  g.addColorStop(1, css(darken(base, lo)));
  x.fillStyle = g;
  path();
  x.fill();
}

function paint(look, mood) {
  const cv = document.createElement('canvas');
  cv.width = PW * SS; cv.height = PH * SS;
  const x = cv.getContext('2d');
  x.scale(SS, SS);

  const body = rgbOf(look.color, [20, 20, 20]);
  const skin = look.skin != null ? rgbOf(look.skin, body) : body;
  const hatC = rgbOf(look.hatColor, [42, 36, 32]);
  const B = BUILDS[look.build] || BUILDS.average;
  const hat = look.hat || null;

  // background: dim, a whisper of the character's colour, grime
  const tint = mix([40, 34, 28], body, 0.22);
  const bg = x.createRadialGradient(PW * 0.55, PH * 0.36, 4, PW * 0.5, PH * 0.5, PW * 0.95);
  bg.addColorStop(0, css(tint));
  bg.addColorStop(1, 'rgb(8,7,6)');
  x.fillStyle = bg; x.fillRect(0, 0, PW, PH);

  const R = 22;
  const cx = PW / 2;
  const cy = ({ tophat: 59, fedora: 52, cop: 52, hardhat: 51, crown: 51 }[hat] ?? 48);
  const neckY = cy + R * 1.29;

  // shadow behind the head (separates figure from background)
  const sh = x.createRadialGradient(cx + 3, cy + 6, R * 0.6, cx + 3, cy + 6, R * 2.1);
  sh.addColorStop(0, 'rgba(0,0,0,0.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = sh; x.fillRect(0, 0, PW, PH);

  // arms (behind the torso), splayed like the idle pose
  const sw0 = Math.max(0, B.t - 1) * 0.07 / 0.21 * R;
  const armW = Math.max(4, R * 0.57 * B.g);
  for (const s of [-1, 1]) {
    const ax = cx + s * (R * 0.33 + sw0), ay = neckY + 1;
    const a = 0.42 + (B.t > 1.5 ? 0.12 : 0);
    limb(x, ax, ay, ax + s * Math.sin(a) * R * 2.6, ay + Math.cos(a) * R * 2.6, armW, body);
  }
  // torso
  const tw = Math.max(5, R * 0.76 * B.t);
  limb(x, cx, neckY + tw * 0.25, cx, PH + tw, tw, body);

  // head
  shadedFill(x, () => { x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); }, skin, cx, cy, R, { hi: lum(skin) < 0.12 ? 0.22 : 0.3, lo: 0.6 });
  // faint cool rim on the shadow side
  x.save();
  x.beginPath(); x.arc(cx, cy, R - 0.6, -0.5, 1.5); x.strokeStyle = css(BONE, 0.13); x.lineWidth = 1.2; x.stroke();
  x.restore();

  // eyes (head turned a touch toward the text on the right)
  const turn = R * 0.09;
  const ey = cy - R * 0.14 + (hat === 'beanie' || hat === 'cap' || hat === 'cop' ? R * 0.04 : 0);
  const er = R * 0.15;
  const eyes = [cx - R * 0.33 + turn, cx + R * 0.33 + turn];
  x.fillStyle = EYE;
  for (const [i, ex] of eyes.entries()) {
    x.beginPath();
    if (mood === 'smug') {
      // heavy lids: bottom half of the eye only
      x.ellipse(ex, ey + er * 0.15, er, er * 0.85, 0, 0, Math.PI);
    } else if (mood === 'angry') {
      x.ellipse(ex, ey + er * 0.1, er, er * 0.72, 0, 0, Math.PI * 2);
    } else {
      x.arc(ex, ey, i === 1 ? er * 0.94 : er, 0, Math.PI * 2);
    }
    x.fill();
  }
  // brows
  if (mood !== 'neutral') {
    x.strokeStyle = css(rgbOf(EYE), 0.88); x.lineCap = 'round'; x.lineWidth = R * 0.11;
    for (const [i, ex] of eyes.entries()) {
      const side = i === 0 ? -1 : 1;        // -1 = left eye; its inner end points right
      const outer = ex + side * er * 1.25, inner = ex - side * er * 0.95;
      const by = ey - er * 2.0;
      let yo = by, yi = by;
      if (mood === 'angry') { yo = by - er * 0.7; yi = by + er * 0.55; }
      else if (mood === 'worried') { yo = by + er * 0.3; yi = by - er * 0.55; }
      else if (mood === 'smug') { if (i === 1) { yo = by - er * 0.9; yi = by - er * 0.55; } else { yo = by + er * 0.35; yi = by + er * 0.35; } }
      x.beginPath(); x.moveTo(outer, yo);
      if (mood === 'smug' && i === 1) x.quadraticCurveTo((outer + inner) / 2, yo - er * 0.5, inner, yi);
      else x.lineTo(inner, yi);
      x.stroke();
    }
  }

  if (hat) drawHat(x, hat, hatC, cx, cy, R);

  // vignette + grain + inner frame light
  const vg = x.createRadialGradient(PW / 2, PH * 0.45, PW * 0.32, PW / 2, PH * 0.5, PW * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  x.fillStyle = vg; x.fillRect(0, 0, PW, PH);
  x.save();
  x.globalAlpha = 0.07; x.globalCompositeOperation = 'overlay';
  x.fillStyle = x.createPattern(grainCanvas(), 'repeat');
  x.fillRect(0, 0, PW, PH);
  x.restore();
  return cv;
}

function drawHat(x, type, c, cx, cy, R) {
  const top = cy - R * 0.67;               // hat group origin (0.14 above the head centre)
  const u = R / 0.21;                       // world units -> px
  const fillShaded = (path, k = 1) => shadedFill(x, path, c, cx, top - R * 0.3, R * 1.2 * k, { hi: 0.22, lo: 0.6 });
  const brim = (r, y) => {
    fillShaded(() => { x.beginPath(); x.ellipse(cx, y, r, Math.max(2, r * 0.16), 0, 0, Math.PI * 2); });
    x.strokeStyle = css(lighten(c, 0.18), 0.5); x.lineWidth = 0.8;
    x.beginPath(); x.ellipse(cx, y, r, Math.max(2, r * 0.16), 0, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
  };
  const dome = (rx, ry, y) => fillShaded(() => { x.beginPath(); x.ellipse(cx, y, rx, ry, 0, Math.PI, 0); x.closePath(); });
  switch (type) {
    case 'fedora': {
      const h = 0.2 * u, wB = 0.19 * u, wT = 0.165 * u, y0 = top;
      fillShaded(() => {
        x.beginPath(); x.moveTo(cx - wB, y0); x.lineTo(cx - wT, y0 - h);
        x.quadraticCurveTo(cx, y0 - h + 4, cx + wT, y0 - h); x.lineTo(cx + wB, y0); x.closePath();
      });
      x.fillStyle = css(darken(c, 0.55)); x.fillRect(cx - wB + 0.5, y0 - h * 0.32, wB * 2 - 1, h * 0.22);
      brim(0.32 * u, y0);
      break;
    }
    case 'tophat': {
      const h = 0.38 * u, w = 0.17 * u, y0 = top;
      fillShaded(() => { x.beginPath(); x.rect(cx - w, y0 - h, w * 2, h); }, 1.4);
      x.fillStyle = css(darken(c, 0.6)); x.fillRect(cx - w, y0 - h * 0.25, w * 2, h * 0.14);
      fillShaded(() => { x.beginPath(); x.ellipse(cx, y0 - h, w, w * 0.16, 0, 0, Math.PI * 2); });
      brim(0.32 * u, y0);
      break;
    }
    case 'beanie': {
      const y = top - 0.05 * u + 0.02 * u;
      dome(0.225 * 1.05 * u, 0.225 * 1.15 * u, y);
      fillShaded(() => { x.beginPath(); x.rect(cx - 0.236 * u, y - 0.05 * u, 0.472 * u, 0.07 * u); });
      x.strokeStyle = css(darken(c, 0.45), 0.6); x.lineWidth = 0.7;
      for (let i = -4; i <= 4; i++) { x.beginPath(); x.moveTo(cx + i * 0.05 * u, y - 0.05 * u); x.lineTo(cx + i * 0.05 * u, y + 0.02 * u); x.stroke(); }
      break;
    }
    case 'cap':
    case 'cop': {
      const y = top - 0.04 * u + 0.03 * u;
      if (type === 'cop') {
        const w = 0.19 * 1.25 * u, h = 0.12 * u;
        fillShaded(() => { x.beginPath(); x.moveTo(cx - w * 0.82, y - h * 0.2); x.lineTo(cx - w, y - h * 1.5); x.lineTo(cx + w, y - h * 1.5); x.lineTo(cx + w * 0.82, y - h * 0.2); x.closePath(); }, 1.2);
        x.fillStyle = 'rgb(201,162,39)';
        x.beginPath(); x.arc(cx, y - h * 0.85, 2.2, 0, Math.PI * 2); x.fill();
      }
      dome(0.225 * u, 0.2 * u, y);
      // visor, seen a little from above and turned with the head: a flat bill poking out front-right
      const vx = cx + 0.05 * u, vy = y + 0.01 * u;
      fillShaded(() => {
        x.beginPath();
        x.moveTo(vx - 0.17 * u, vy);
        x.quadraticCurveTo(vx + 0.02 * u, vy + 0.12 * u, vx + 0.27 * u, vy + 0.015 * u);
        x.quadraticCurveTo(vx + 0.05 * u, vy - 0.02 * u, vx - 0.17 * u, vy);
        x.closePath();
      });
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.beginPath(); x.ellipse(vx + 0.02 * u, vy + 0.075 * u, 0.16 * u, 0.025 * u, 0.05, 0, Math.PI * 2); x.fill();
      x.strokeStyle = css(lighten(c, 0.2), 0.45); x.lineWidth = 0.8;
      x.beginPath(); x.moveTo(vx - 0.16 * u, vy); x.quadraticCurveTo(vx + 0.05 * u, vy - 0.02 * u, vx + 0.26 * u, vy + 0.015 * u); x.stroke();
      break;
    }
    case 'hardhat': {
      const y = top - 0.03 * u + 0.02 * u;
      dome(0.225 * 1.08 * u, 0.225 * 1.05 * u, y);
      brim(0.32 * 0.85 * u, y);
      x.strokeStyle = css(lighten(c, 0.25), 0.55); x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(cx, y - 0.23 * u); x.lineTo(cx, y - 0.02 * u); x.stroke();
      break;
    }
    case 'crown': {
      const gold = [201, 162, 39];
      const w = 0.17 * u, h = 0.14 * u, y0 = top + 0.04 * u + h / 2;
      const g = x.createLinearGradient(cx - w, 0, cx + w, 0);
      g.addColorStop(0, css(lighten(gold, 0.35))); g.addColorStop(0.45, css(gold)); g.addColorStop(1, css(darken(gold, 0.55)));
      x.fillStyle = g;
      x.beginPath(); x.moveTo(cx - w, y0);
      const pts = 4;
      for (let i = 0; i <= pts * 2; i++) {
        const px = cx - w + (i / (pts * 2)) * w * 2;
        x.lineTo(px, i % 2 === 0 ? y0 - h * 1.25 : y0 - h * 0.7);
      }
      x.lineTo(cx + w, y0); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 0.8; x.stroke();
      break;
    }
    default: break;
  }
}
