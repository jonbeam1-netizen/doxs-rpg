import * as THREE from 'three';
import { grimeTexture, paintGrime } from '../core/materials.js';

// Skateboard catalogue + procedural board meshes.
// Stats: top (m/s, Shift-push cap), push (accel), turn (rad/s), pop (ollie jump speed), flip (kickflip seconds).
// Player.runSpeed is 9.5 — every board beats running.
export const BOARDS = {
  plank: {
    name: 'Warped Plank', price: 0, top: 13.5, push: 5.6, turn: 1.9, pop: 5.5, flip: 0.5,
    desc: 'A fence board with roller-skate wheels screwed on crooked. Splinters included at no extra charge.',
    len: 0.8, wid: 0.2, kick: 0.0, wheel: '#c9b48a', truck: '#6b6258',
  },
  street: {
    name: 'Gutter Street Deck', price: 220, top: 16, push: 6.6, turn: 2.3, pop: 6.0, flip: 0.45,
    desc: 'Seven-ply maple, three-ply mystery stain. Pops like a pimple. Smells about the same.',
    len: 0.8, wid: 0.21, kick: 0.055, wheel: '#e8e0cc', truck: '#9a9ea4',
  },
  pro: {
    name: "Pro Deck 'Bone Saw'", price: 750, top: 18.5, push: 7.6, turn: 2.65, pop: 6.6, flip: 0.38,
    desc: 'Signed by a pro skater nobody has heard of. Flips so fast your shins file a restraining order.',
    len: 0.81, wid: 0.21, kick: 0.07, wheel: '#d93b2b', truck: '#c8ccd2',
  },
  electric: {
    name: 'Sparky E-Longboard', price: 1600, top: 21, push: 4.0, turn: 1.8, pop: 5.2, flip: 0.55,
    motor: 9.5, unpoweredTop: 12, battery: 100, drain: 1.7,
    desc: 'Hold W and the motor screams. Battery lasts about a minute. The fire risk lasts forever.',
    len: 1.02, wid: 0.23, kick: 0.025, wheel: '#3ad06a', truck: '#2a2a2a',
  },
};

export const BOARD_ORDER = ['plank', 'street', 'pro', 'electric'];

// Heights (meters). The rider's feet stand at DECK_TOP.
export const WHEEL_R = 0.032;
export const DECK_Y = 0.088;      // deck center above the ground
export const DECK_T = 0.018;      // deck thickness
export const DECK_TOP = DECK_Y + DECK_T / 2 + 0.004;

// ---------------------------------------------------------------- textures
const texCache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// The underside graphic. Canvas is laid out with the board's long axis vertical (nose at top).
function graphicTexture(id) {
  if (texCache.has(id)) return texCache.get(id);
  const W = 128, H = 512;
  const c = canvas(W, H);
  const x = c.getContext('2d', { willReadFrequently: true });
  const text = (t, y, size, col, rot = -Math.PI / 2, font = 'Special Elite') => {
    x.save(); x.translate(W / 2, y); x.rotate(rot);
    x.font = `${size}px "${font}", Impact, monospace`; x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(t, 0, 0); x.restore();
  };
  if (id === 'plank') {
    x.fillStyle = '#7a5a36'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(40,24,10,.45)'; x.lineWidth = 2;
    for (let i = 0; i < 14; i++) { x.beginPath(); const xx = 6 + i * 9 + Math.random() * 4; x.moveTo(xx, 0); x.bezierCurveTo(xx + 8, H * 0.3, xx - 8, H * 0.6, xx + 3, H); x.stroke(); }
    x.fillStyle = '#2a1a0c'; for (const [a, b] of [[30, 60], [98, 60], [30, 452], [98, 452]]) { x.beginPath(); x.arc(a, b, 5, 0, 7); x.fill(); }
    text('PROPERTY OF ROTWELL PARKS', H * 0.5, 15, 'rgba(230,220,200,.75)');
    // crude x-eyed smiley
    x.strokeStyle = '#e8e0cc'; x.lineWidth = 4; x.beginPath(); x.arc(W / 2, 140, 34, 0, 7); x.stroke();
    x.beginPath(); x.moveTo(48, 126); x.lineTo(58, 136); x.moveTo(58, 126); x.lineTo(48, 136); x.moveTo(70, 126); x.lineTo(80, 136); x.moveTo(80, 126); x.lineTo(70, 136); x.stroke();
    x.beginPath(); x.moveTo(48, 158); x.quadraticCurveTo(64, 148, 80, 160); x.stroke();
  } else if (id === 'street') {
    x.fillStyle = '#141210'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#a3201a'; x.fillRect(0, H * 0.62, W, H * 0.38);
    text('GUTTER', H * 0.33, 58, '#e6dfcf');
    // rat skull
    x.fillStyle = '#e6dfcf'; x.beginPath(); x.ellipse(W / 2, H * 0.78, 30, 40, 0, 0, 7); x.fill();
    x.beginPath(); x.moveTo(W / 2 - 14, H * 0.78 + 30); x.lineTo(W / 2, H * 0.78 + 70); x.lineTo(W / 2 + 14, H * 0.78 + 30); x.fill();
    x.beginPath(); x.arc(W / 2 - 26, H * 0.78 - 34, 14, 0, 7); x.arc(W / 2 + 26, H * 0.78 - 34, 14, 0, 7); x.fill();
    x.fillStyle = '#141210'; x.beginPath(); x.arc(W / 2 - 12, H * 0.78, 8, 0, 7); x.arc(W / 2 + 12, H * 0.78, 8, 0, 7); x.fill();
    text('EST. LAST TUESDAY', H * 0.55, 13, '#a3201a');
  } else if (id === 'pro') {
    const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#2b1438'); gr.addColorStop(1, '#0e0a12');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    // saw blade
    x.save(); x.translate(W / 2, H * 0.38); x.fillStyle = '#d8d2c0';
    x.beginPath(); for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const r = i % 2 ? 40 : 54; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill();
    x.fillStyle = '#2b1438'; x.beginPath(); x.arc(0, 0, 12, 0, 7); x.fill(); x.restore();
    // flames
    for (let i = 0; i < 9; i++) {
      x.fillStyle = i % 2 ? '#e2402f' : '#f0a020';
      x.beginPath(); const bx = 8 + i * 14; x.moveTo(bx - 10, H); x.quadraticCurveTo(bx - 14, H - 90 - Math.random() * 60, bx, H - 150 - Math.random() * 70); x.quadraticCurveTo(bx + 6, H - 70, bx + 10, H); x.fill();
    }
    text('BONE SAW', H * 0.7, 40, '#e6dfcf');
  } else {
    x.fillStyle = '#111'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#f2c230';
    for (let i = -6; i < 30; i++) { x.beginPath(); x.moveTo(0, i * 24); x.lineTo(W, i * 24 + 60); x.lineTo(W, i * 24 + 72); x.lineTo(0, i * 24 + 12); x.fill(); }
    x.fillStyle = '#111'; x.fillRect(14, H * 0.2, W - 28, H * 0.6);
    x.fillStyle = '#f2c230';
    x.beginPath(); x.moveTo(W / 2 + 18, H * 0.25); x.lineTo(W / 2 - 22, H * 0.5); x.lineTo(W / 2, H * 0.5); x.lineTo(W / 2 - 18, H * 0.75); x.lineTo(W / 2 + 24, H * 0.45); x.lineTo(W / 2 + 2, H * 0.45); x.closePath(); x.fill();
    text('SPARKY', H * 0.32, 30, '#3ad06a');
    text('VOIDS WARRANTY', H * 0.68, 14, '#e6dfcf');
  }
  paintGrime(x, Math.max(W, H), { grime: id === 'plank' ? 0.8 : 0.45, streaks: false, scratches: true, noise: 0.5 });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(id, tex);
  return tex;
}

function gripTexture(id) {
  const key = 'grip:' + id;
  if (texCache.has(key)) return texCache.get(key);
  const W = 64, H = 256;
  const c = canvas(W, H);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = id === 'plank' ? '#6e5232' : '#1d1c1b'; x.fillRect(0, 0, W, H);
  if (id !== 'plank') {
    // scuffs and a crude doodle scratched into the grip
    x.strokeStyle = 'rgba(200,190,170,.25)'; x.lineWidth = 2;
    for (let i = 0; i < 10; i++) { x.beginPath(); const yy = Math.random() * H; x.moveTo(Math.random() * W, yy); x.lineTo(Math.random() * W, yy + (Math.random() - 0.5) * 40); x.stroke(); }
    x.save(); x.translate(W / 2, H * 0.5); x.rotate(-Math.PI / 2); x.font = '14px "Special Elite", monospace'; x.fillStyle = 'rgba(220,210,190,.35)'; x.textAlign = 'center';
    x.fillText(id === 'electric' ? 'DO NOT LICK' : id === 'pro' ? 'SHRED OR DIE' : 'SK8 OR D8', 0, 5); x.restore();
  } else {
    x.strokeStyle = 'rgba(30,18,8,.4)'; for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(i * 8 + 3, 0); x.lineTo(i * 8 + 5, H); x.stroke(); }
  }
  paintGrime(x, H, { grime: 0.7, streaks: false, scratches: false, noise: 1.4 });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------- geometry
const geoCache = new Map();
const matCache = new Map();

function deckGeometry(def) {
  const key = `${def.len}|${def.wid}|${def.kick}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const L = def.len, W = def.wid, segs = 20;
  const g = new THREE.BoxGeometry(W, DECK_T, L, 1, 1, segs);
  const pos = g.attributes.position;
  const half = L / 2, flatEnd = half - 0.13, roundStart = half - W / 2;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i), az = Math.abs(z);
    // rounded nose/tail
    if (az > roundStart) {
      const k = Math.min(1, (az - roundStart) / (W / 2));
      const s = Math.sqrt(Math.max(0.04, 1 - k * k));
      pos.setX(i, pos.getX(i) * s);
    }
    // kicktails
    if (def.kick > 0 && az > flatEnd) {
      const t = (az - flatEnd) / (half - flatEnd);
      pos.setY(i, pos.getY(i) + def.kick * t * t);
    }
  }
  g.computeVertexNormals();
  geoCache.set(key, g);
  return g;
}

function sharedGeo(name, make) {
  if (!geoCache.has(name)) geoCache.set(name, make());
  return geoCache.get(name);
}

function mat(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}

// Returns a Group: origin at ground level under the deck center; long axis = local Z (nose at +Z).
// group.userData: { board (deck pivot that flips), wheels[], blob (ground shadow), def }
export function createBoardMesh(id) {
  const def = BOARDS[id] || BOARDS.plank;
  const root = new THREE.Group();
  root.name = 'skateboard';
  // The flip pivot sits at deck height so kickflips spin around the board's long axis.
  const board = new THREE.Group();
  board.position.y = DECK_Y;
  root.add(board);

  const wood = mat('wood:' + id, () => new THREE.MeshStandardMaterial({ map: grimeTexture(id === 'plank' ? '#7a5a36' : '#a07a4a', { grime: 0.5 }), roughness: 0.85 }));
  const grip = mat('grip:' + id, () => new THREE.MeshStandardMaterial({ map: gripTexture(id), roughness: 1 }));
  const art = mat('art:' + id, () => new THREE.MeshStandardMaterial({ map: graphicTexture(id), roughness: 0.6 }));
  // BoxGeometry groups: +x, -x, +y (top), -y (bottom), +z, -z
  const deck = new THREE.Mesh(deckGeometry(def), [wood, wood, grip, art, wood, wood]);
  deck.castShadow = true;
  deck.receiveShadow = false;
  board.add(deck);

  const truckMat = mat('truck:' + id, () => new THREE.MeshStandardMaterial({ color: def.truck, metalness: 0.7, roughness: 0.45 }));
  const wheelMat = mat('wheel:' + id, () => new THREE.MeshStandardMaterial({ color: def.wheel, roughness: 0.7 }));
  const wheelGeo = sharedGeo('wheel', () => new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.035, 12));
  const baseGeo = sharedGeo('base', () => new THREE.BoxGeometry(0.06, 0.012, 0.08));
  const hangerGeo = sharedGeo('hanger', () => { const h = new THREE.CylinderGeometry(0.012, 0.012, 1, 6); h.rotateZ(Math.PI / 2); return h; });
  const kingGeo = sharedGeo('king', () => new THREE.BoxGeometry(0.04, 0.04, 0.035));

  const wheels = [];
  const truckZ = def.len / 2 - (id === 'electric' ? 0.2 : 0.17);
  const axleW = def.wid * 0.92;
  for (const zs of [1, -1]) {
    const tz = zs * truckZ;
    const base = new THREE.Mesh(baseGeo, truckMat); base.position.set(0, -DECK_T / 2 - 0.006, tz); board.add(base);
    const king = new THREE.Mesh(kingGeo, truckMat); king.position.set(0, -DECK_T / 2 - 0.03, tz); board.add(king);
    const hanger = new THREE.Mesh(hangerGeo, truckMat); hanger.scale.x = axleW; hanger.position.set(0, WHEEL_R - DECK_Y, tz); board.add(hanger);
    for (const xs of [1, -1]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(xs * (axleW / 2 + 0.012), WHEEL_R - DECK_Y, tz);
      w.rotation.set(0, 0, Math.PI / 2);
      w.castShadow = true;
      board.add(w);
      wheels.push(w);
    }
  }
  if (id === 'electric') {
    const box = new THREE.Mesh(sharedGeo('battery', () => new THREE.BoxGeometry(0.13, 0.03, 0.42)), mat('batt', () => new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 })));
    box.position.set(0, -DECK_T / 2 - 0.016, 0);
    board.add(box);
    const led = new THREE.Mesh(sharedGeo('led', () => new THREE.BoxGeometry(0.1, 0.006, 0.012)), mat('led', () => new THREE.MeshBasicMaterial({ color: 0x3ad06a })));
    led.position.set(0, -DECK_T / 2 - 0.032, 0.18);
    board.add(led);
    root.userData.led = led;
  }

  // Soft blob shadow on the ground (reads at night when the sun shadow is weak).
  const blob = new THREE.Mesh(
    sharedGeo('blob', () => { const c = new THREE.CircleGeometry(0.5, 20); c.rotateX(-Math.PI / 2); return c; }),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  blob.scale.set(def.wid * 1.7, 1, def.len * 1.15);
  blob.position.y = 0.012;
  blob.renderOrder = 1;
  root.add(blob);

  root.userData = { ...root.userData, board, wheels, blob, def, id };
  return root;
}

export function disposeBoardMesh(root) {
  if (!root) return;
  root.removeFromParent();
  root.userData.blob?.material?.dispose();
}
