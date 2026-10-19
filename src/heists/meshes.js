import * as THREE from 'three';
import { MASKS } from '../data/heists.js';

// Shared geometry/material factories for the heist module: masks, loot bags,
// objective props, planning board and light-column beacons.

const G = {};
const M = {};
function geos() {
  if (G.ready) return G;
  G.ready = true;
  G.face = new THREE.SphereGeometry(0.232, 16, 12, Math.PI / 2 - 1.25, 2.5, 0.25, 2.3); // front shell of the head
  G.full = new THREE.SphereGeometry(0.228, 16, 12);
  G.hole = new THREE.SphereGeometry(0.035, 8, 6);
  G.snout = new THREE.CylinderGeometry(0.06, 0.07, 0.07, 12); G.snout.rotateX(Math.PI / 2);
  G.ear = new THREE.ConeGeometry(0.06, 0.1, 6);
  G.nose = new THREE.SphereGeometry(0.05, 10, 8);
  G.puff = new THREE.SphereGeometry(0.09, 10, 8);
  G.stripe = new THREE.BoxGeometry(0.05, 0.02, 0.26);
  G.bag = new THREE.CapsuleGeometry(0.17, 0.42, 4, 10); G.bag.rotateZ(Math.PI / 2);
  G.bagTie = new THREE.TorusGeometry(0.06, 0.018, 6, 12);
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.disc = new THREE.CylinderGeometry(1, 1, 0.12, 24); G.disc.rotateX(Math.PI / 2);
  G.colGeo = new THREE.CylinderGeometry(0.7, 0.7, 60, 16, 1, true); G.colGeo.translate(0, 30, 0);
  G.ring = new THREE.RingGeometry(1.4, 1.85, 40); G.ring.rotateX(-Math.PI / 2);
  return G;
}

function mat(key, make) { return M[key] || (M[key] = make()); }
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...extra });

// ------------------------------------------------------------------ masks
export function createMask(style = 'stocking') {
  const g = geos();
  const def = MASKS[style] || MASKS.stocking;
  const root = new THREE.Group();
  root.name = 'heist-mask';
  const black = mat('black', () => new THREE.MeshBasicMaterial({ color: 0x050505 }));
  const base = mat('mask:' + style, () => std(def.color, style === 'skull' ? { metalness: 0.85, roughness: 0.25 } : style === 'stocking' ? { transparent: true, opacity: 0.82, roughness: 0.9 } : {}));
  const shell = new THREE.Mesh(style === 'stocking' ? g.full : g.face, base);
  if (style === 'stocking') shell.scale.set(1.02, 1.06, 1.02);
  root.add(shell);
  const eye = (x, y = 0.04, s = 1) => { const h = new THREE.Mesh(g.hole, black); h.position.set(x, y, 0.212); h.scale.setScalar(s); root.add(h); };
  switch (style) {
    case 'pig': {
      const pink = mat('pigDark', () => std('#c97786'));
      const sn = new THREE.Mesh(g.snout, pink); sn.position.set(0, -0.03, 0.24); root.add(sn);
      for (const x of [-0.022, 0.022]) { const n = new THREE.Mesh(g.hole, black); n.scale.setScalar(0.45); n.position.set(x, -0.03, 0.277); root.add(n); }
      for (const x of [-0.13, 0.13]) { const e = new THREE.Mesh(g.ear, base); e.position.set(x, 0.2, 0.06); e.rotation.z = x > 0 ? -0.5 : 0.5; root.add(e); }
      eye(-0.07); eye(0.07);
      break;
    }
    case 'clown': {
      const red = mat('clownRed', () => std('#c41e1e'));
      const hair = mat('clownHair', () => std('#d9581c'));
      const n = new THREE.Mesh(g.nose, red); n.position.set(0, -0.01, 0.235); root.add(n);
      for (const x of [-0.19, 0.19]) { const p = new THREE.Mesh(g.puff, hair); p.position.set(x, 0.08, -0.02); root.add(p); }
      eye(-0.075, 0.05, 1.2); eye(0.075, 0.05, 1.2);
      const m = new THREE.Mesh(g.stripe, red); m.scale.set(2.2, 1, 0.2); m.position.set(0, -0.11, 0.2); root.add(m);
      break;
    }
    case 'hockey': {
      for (const [x, y] of [[-0.075, 0.05], [0.075, 0.05]]) eye(x, y, 1.15);
      for (let i = 0; i < 6; i++) { const h = new THREE.Mesh(g.hole, black); h.scale.setScalar(0.35); h.position.set((i % 3 - 1) * 0.05, -0.06 - Math.floor(i / 3) * 0.045, 0.22); root.add(h); }
      const red = mat('hockeyRed', () => std('#a3201a'));
      for (const x of [-0.11, 0.11]) { const s = new THREE.Mesh(g.stripe, red); s.rotation.y = Math.PI / 2; s.scale.set(1, 1, 0.5); s.position.set(x, 0.12, 0.17); root.add(s); }
      break;
    }
    case 'luchador': {
      const gold = mat('luchaGold', () => std('#e0b23a', { metalness: 0.5, roughness: 0.4 }));
      for (const x of [-0.075, 0.075]) { const p = new THREE.Mesh(g.puff, gold); p.scale.set(0.7, 0.55, 0.3); p.position.set(x, 0.045, 0.19); root.add(p); }
      eye(-0.075, 0.045, 0.9); eye(0.075, 0.045, 0.9);
      const s = new THREE.Mesh(g.stripe, gold); s.scale.set(0.8, 1, 1.2); s.rotation.x = -0.6; s.position.set(0, 0.17, 0.12); root.add(s);
      break;
    }
    case 'skull': {
      eye(-0.075, 0.04, 1.6); eye(0.075, 0.04, 1.6);
      const n = new THREE.Mesh(g.hole, black); n.scale.set(0.6, 0.9, 0.6); n.position.set(0, -0.04, 0.226); root.add(n);
      for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(g.hole, black); t.scale.set(0.3, 0.6, 0.3); t.position.set((i - 2) * 0.03, -0.12, 0.2); root.add(t); }
      break;
    }
    default: { // stocking: squashed nose & eyes showing through
      eye(-0.07, 0.03, 0.8); eye(0.07, 0.03, 0.8);
    }
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return root;
}

// Attach (or move) a mask onto a stickman model's head. Returns the mask object.
export function wearMask(model, mask, style) {
  const head = model?.parts?.head;
  if (!head) return mask || null;
  if (!mask || mask.userData.style !== style) {
    if (mask) mask.removeFromParent();
    mask = createMask(style);
    mask.userData.style = style;
  }
  if (mask.parent !== head) head.add(mask);
  return mask;
}

// ------------------------------------------------------------------ loot bags
export function createBag() {
  const g = geos();
  const grp = new THREE.Group();
  const body = new THREE.Mesh(g.bag, mat('bag', () => std('#1d1f1a', { roughness: 0.95 })));
  body.castShadow = true;
  grp.add(body);
  const tie = new THREE.Mesh(g.bagTie, mat('bagTie', () => std('#7fbf4d', { emissive: '#1d3a0a', emissiveIntensity: 0.6 })));
  tie.rotation.y = Math.PI / 2;
  tie.position.set(0, 0.16, 0);
  grp.add(tie);
  // a "$" stencil, just a stripe of green
  const s = new THREE.Mesh(g.stripe, mat('bagStripe', () => std('#7fbf4d')));
  s.scale.set(0.7, 1, 0.8); s.rotation.y = Math.PI / 2; s.position.set(0, 0.02, 0.17);
  grp.add(s);
  return grp;
}

export function bagOnBack(model, bag) {
  const hips = model?.parts?.hips;
  if (!hips) return;
  if (bag.parent !== hips) hips.add(bag);
  bag.position.set(0, 0.36, -0.3);
  bag.rotation.set(0.15, 0, 0);
  bag.scale.setScalar(1);
}

// ------------------------------------------------------------------ objective props
export function createProp(type) {
  const g = geos();
  const grp = new THREE.Group();
  const steel = mat('steel', () => std('#4a4d4f', { metalness: 0.7, roughness: 0.45 }));
  const dark = mat('dark', () => std('#1a1a1a'));
  const green = mat('safeGreen', () => std('#2c3b2a', { metalness: 0.4, roughness: 0.55 }));
  const glow = mat('panelGlow', () => new THREE.MeshBasicMaterial({ color: 0x7fbf4d }));
  const add = (geo, m, sx, sy, sz, x, y, z) => { const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = true; grp.add(o); return o; };
  switch (type) {
    case 'safe':
      add(g.box, green, 0.9, 0.9, 0.8, 0, 0.45, 0);
      add(g.disc, steel, 0.14, 0.14, 0.6, 0, 0.55, 0.42);
      add(g.box, steel, 0.08, 0.3, 0.06, 0.25, 0.45, 0.42);
      break;
    case 'vault':
      add(g.disc, steel, 1.25, 1.25, 2, 0, 1.4, 0);
      add(g.disc, dark, 0.35, 0.35, 2.6, 0, 1.4, 0);
      for (let i = 0; i < 3; i++) { const sp = add(g.box, steel, 0.9, 0.08, 0.08, 0, 1.4, 0.2); sp.rotation.z = (i * Math.PI) / 3; }
      break;
    case 'panel':
      add(g.box, dark, 0.45, 0.7, 0.12, 0, 1.3, 0);
      add(g.box, glow, 0.3, 0.18, 0.02, 0, 1.45, 0.07);
      break;
    case 'door':
      add(g.box, steel, 1.3, 2.3, 0.15, 0, 1.15, 0);
      add(g.box, dark, 0.1, 0.25, 0.1, 0.45, 1.1, 0.1);
      break;
    case 'register':
      add(g.box, dark, 0.7, 0.9, 0.5, 0, 0.45, 0);
      add(g.box, mat('regTop', () => std('#5a5045')), 0.55, 0.25, 0.4, 0, 1.0, 0);
      add(g.box, glow, 0.3, 0.1, 0.02, 0, 1.05, 0.21);
      break;
    default:
      add(g.box, dark, 0.5, 0.5, 0.5, 0, 0.25, 0);
  }
  return grp;
}

// The planning board behind Lucky Larry's: corkboard on legs with photos + red string.
export function createBoard() {
  const g = geos();
  const grp = new THREE.Group();
  const wood = mat('boardWood', () => std('#4a3420', { roughness: 0.9 }));
  const cork = mat('boardCork', () => std('#8a6a44', { roughness: 1 }));
  const paper = mat('boardPaper', () => std('#d8d0bc', { roughness: 1 }));
  const red = mat('boardString', () => new THREE.MeshBasicMaterial({ color: 0xc41e1e }));
  const add = (geo, m, sx, sy, sz, x, y, z, rz = 0) => { const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.rotation.z = rz; o.castShadow = true; grp.add(o); return o; };
  add(g.box, cork, 2.2, 1.3, 0.08, 0, 1.55, 0);
  add(g.box, wood, 2.35, 0.08, 0.12, 0, 2.22, 0);
  add(g.box, wood, 2.35, 0.08, 0.12, 0, 0.88, 0);
  for (const x of [-1.05, 1.05]) add(g.box, wood, 0.08, 1.85, 0.08, x, 0.92, -0.05);
  const pins = [[-0.75, 1.85], [0.1, 1.95], [0.8, 1.7], [-0.4, 1.3], [0.55, 1.2]];
  for (const [x, y] of pins) add(g.box, paper, 0.32, 0.24, 0.02, x, y, 0.06, (Math.random() - 0.5) * 0.3);
  for (let i = 0; i < pins.length - 1; i++) {
    const [x1, y1] = pins[i], [x2, y2] = pins[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    add(g.box, red, len, 0.015, 0.01, (x1 + x2) / 2, (y1 + y2) / 2, 0.08, Math.atan2(y2 - y1, x2 - x1));
  }
  return grp;
}

// ------------------------------------------------------------------ beacons
let colTex = null;
function columnTexture() {
  if (colTex) return colTex;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const ctx = c.getContext('2d');
  const gr = ctx.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.3)');
  gr.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 4, 128);
  colTex = new THREE.CanvasTexture(c);
  return colTex;
}

export function createBeacon(color) {
  const g = geos();
  const col = new THREE.Mesh(g.colGeo, mat('beaconCol:' + color, () => new THREE.MeshBasicMaterial({
    color, map: columnTexture(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  })));
  col.frustumCulled = false;
  const ringMat = mat('beaconRing:' + color, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(g.ring, ringMat);
  ring.position.y = 0.07;
  const grp = new THREE.Group();
  grp.add(col, ring);
  grp.userData = { col, ring };
  return grp;
}

export function pulseBeacon(b, t, scale = 1) {
  const { col, ring } = b.userData;
  const k = (t * 0.9) % 1;
  ring.scale.setScalar((0.5 + k * 1.4) * scale);
  col.scale.set(scale, 1, scale);
  col.material.opacity = 0.38 + Math.sin(t * 2.6) * 0.12;
}
