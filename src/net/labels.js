import * as THREE from 'three';

// Canvas-sprite helpers for remote players: floating name tag + HP bar, and speech bubbles.
// Text is drawn with fillText, so player-supplied names can't inject anything.

const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

function spriteFrom(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 999;
  return { sprite, tex, mat };
}

export function makeNameTag() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 80;
  const ctx = canvas.getContext('2d');
  const { sprite, tex, mat } = spriteFrom(canvas);
  sprite.scale.set(1.9, 0.594, 1);
  let last = '';

  function set(name, hp, maxHp, { dead = false, ping = null, host = false } = {}) {
    const frac = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    const key = `${name}|${Math.round(frac * 60)}|${dead}|${host}`;
    if (key === last) return;
    last = key;
    ctx.clearRect(0, 0, 256, 80);
    ctx.font = `600 34px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = (host ? '★ ' : '') + name + (dead ? ' ☠' : '');
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(label, 128, 24, 248);
    ctx.fillStyle = dead ? '#9a8f80' : '#e6dfcf';
    ctx.fillText(label, 128, 24, 248);
    // HP bar
    const w = 150, h = 12, x = 128 - w / 2, y = 54;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#2a1512';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = frac > 0.5 ? '#7fbf4d' : frac > 0.25 ? '#d6b33c' : '#e2402f';
    ctx.fillRect(x, y, w * frac, h);
    tex.needsUpdate = true;
    void ping;
  }
  function dispose() { tex.dispose(); mat.dispose(); sprite.removeFromParent(); }
  return { sprite, set, dispose };
}

// Speech bubble sprite. Returns { sprite, dispose, height }.
export function makeBubble(text, { color = '#e6dfcf', italic = false } = {}) {
  const canvas = document.createElement('canvas');
  const W = 512;
  const ctx0 = canvas.getContext('2d');
  const font = `${italic ? 'italic ' : ''}600 30px ${FONT}`;
  ctx0.font = font;
  // word wrap to max 3 lines
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (ctx0.measureText(next).width > W - 40 && cur) { lines.push(cur); cur = w; } else cur = next;
    if (lines.length >= 3) break;
  }
  if (cur && lines.length < 3) lines.push(cur);
  if (lines.length === 3 && words.join(' ').length > lines.join(' ').length) lines[2] = lines[2].replace(/.{0,3}$/, '…');
  const lh = 34;
  const H = 24 + lines.length * lh + 18;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  let tw = 0;
  for (const l of lines) tw = Math.max(tw, ctx.measureText(l).width);
  const bw = Math.min(W - 8, tw + 36), bx = (W - bw) / 2, bh = H - 18;
  ctx.fillStyle = 'rgba(14,12,10,0.88)';
  ctx.strokeStyle = 'rgba(176,103,42,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, 2, bw, bh, 12); else ctx.rect(bx, 2, bw, bh);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2 - 10, bh + 1); ctx.lineTo(W / 2, H - 2); ctx.lineTo(W / 2 + 10, bh + 1);
  ctx.fillStyle = 'rgba(14,12,10,0.88)'; ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 2 + 12 + lh / 2 + i * lh));
  const { sprite, tex, mat } = spriteFrom(canvas);
  const sw = 3.4;
  sprite.scale.set(sw, (sw * H) / W, 1);
  sprite.center.set(0.5, 0);
  function dispose() { tex.dispose(); mat.dispose(); sprite.removeFromParent(); }
  return { sprite, mat, dispose };
}
