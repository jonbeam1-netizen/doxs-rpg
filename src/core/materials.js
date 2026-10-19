import * as THREE from 'three';

// Shared grimy procedural textures so every module (world, cars, props,
// weapons) has the same dirty, worn look without shipping image files.

const texCache = new Map();

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Paint dirt blotches, drip streaks, scratches and per-pixel noise over `ctx`.
export function paintGrime(ctx, size, { grime = 0.6, streaks = true, scratches = true, noise = 1 } = {}) {
  // Dark blotches
  for (let i = 0; i < 50 * grime; i++) {
    const r = (0.04 + Math.random() * 0.22) * size;
    const x = Math.random() * size, y = Math.random() * size;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(18,14,10,${0.08 + Math.random() * 0.25 * grime})`);
    g.addColorStop(1, 'rgba(18,14,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Rusty/yellowed stains
  for (let i = 0; i < 12 * grime; i++) {
    const r = (0.03 + Math.random() * 0.1) * size;
    const x = Math.random() * size, y = Math.random() * size;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(90,60,20,${0.1 + Math.random() * 0.15})`);
    g.addColorStop(1, 'rgba(90,60,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Vertical drips
  if (streaks) {
    for (let i = 0; i < 40 * grime; i++) {
      const x = Math.random() * size, y = Math.random() * size * 0.6;
      const w = 1 + Math.random() * 3, h = size * (0.1 + Math.random() * 0.5);
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, `rgba(10,8,6,${0.15 + Math.random() * 0.2})`);
      g.addColorStop(1, 'rgba(10,8,6,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
  }
  // Scratches
  if (scratches) {
    ctx.lineWidth = 1;
    for (let i = 0; i < 30 * grime; i++) {
      ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,240,0.06)' : 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      const x = Math.random() * size, y = Math.random() * size;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * size * 0.3, y + (Math.random() - 0.5) * size * 0.3);
      ctx.stroke();
    }
  }
  // Pixel noise
  if (noise > 0) {
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    const amp = 28 * noise * (0.5 + grime);
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amp;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }
}

// A tileable grimy texture of a base color.
export function grimeTexture(base = '#555555', opts = {}) {
  const size = opts.size ?? 256;
  const key = `${base}|${size}|${opts.grime ?? 0.6}|${opts.streaks ?? true}|${opts.variant ?? 0}`;
  if (texCache.has(key)) return texCache.get(key);
  const c = makeCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  paintGrime(ctx, size, opts);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

// A MeshStandardMaterial with a grimy map. `repeat` tiles the texture.
export function grimMaterial(base = '#555555', { rough = 0.9, metal = 0.05, grime = 0.6, repeat = 1, emissive = null, emissiveIntensity = 1, streaks = true } = {}) {
  let map = grimeTexture(base, { grime, streaks });
  if (repeat !== 1) {
    map = map.clone();
    map.needsUpdate = true;
    if (Array.isArray(repeat)) map.repeat.set(repeat[0], repeat[1]);
    else map.repeat.set(repeat, repeat);
  }
  const m = new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: metal });
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = emissiveIntensity; }
  return m;
}

// Text on a grimy sign board (building signs, billboards, labels).
export function signTexture(text, { width = 512, height = 128, bg = '#1a1612', fg = '#e6dfcf', font = 'Special Elite', border = '#3b342b', grime = 0.5 } = {}) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = border;
  ctx.lineWidth = Math.max(4, height * 0.06);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth);
  let size = height * 0.55;
  ctx.font = `${size}px "${font}", monospace`;
  while (ctx.measureText(text).width > width * 0.9 && size > 10) { size -= 2; ctx.font = `${size}px "${font}", monospace`; }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + size * 0.05);
  paintGrime(ctx, Math.max(width, height), { grime, streaks: true, scratches: true, noise: 0.6 });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
