import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { grimeTexture } from '../core/materials.js';

// Clean, chunky procedural meshes for the street interactables.
// Each prefab is ONE merged BufferGeometry (vertex colors) with two material
// groups: 0 = lit grimy body, 1 = self-lit glow (screens, lamps, labels).
// Geometries are cached per kind and shared by every instance.

const cache = new Map();
let MATS = null;

export function mats() {
  if (MATS) return MATS;
  const body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.08, map: grimeTexture('#d8d4cc', { grime: 0.35, streaks: true, variant: 7 }) });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  MATS = { body, glow, list: [body, glow] };
  return MATS;
}

// A tiny geometry builder: parts are boxes/cylinders/spheres with a color and a glow flag.
class Kit {
  constructor() { this.parts = [[], []]; }
  _add(geo, color, x, y, z, { rx = 0, ry = 0, rz = 0, glow = false } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts[glow ? 1 : 0].push(g);
    return this;
  }
  box(w, h, d, color, x = 0, y = 0, z = 0, o) { return this._add(new THREE.BoxGeometry(w, h, d), color, x, y, z, o); }
  cyl(rt, rb, h, color, x = 0, y = 0, z = 0, o = {}) { return this._add(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 12), color, x, y, z, o); }
  sphere(r, color, x = 0, y = 0, z = 0, o = {}) { return this._add(new THREE.SphereGeometry(r, o.seg ?? 12, o.seg2 ?? 8), color, x, y, z, o); }
  cone(r, h, color, x = 0, y = 0, z = 0, o = {}) { return this._add(new THREE.ConeGeometry(r, h, o.seg ?? 10), color, x, y, z, o); }
  build() {
    const lists = this.parts.filter((p) => p.length);
    const merged = lists.map((l) => mergeGeometries(l, false));
    const geo = merged.length > 1 ? mergeGeometries(merged, true) : merged[0];
    if (merged.length === 1) { geo.clearGroups(); geo.addGroup(0, Infinity, this.parts[0].length ? 0 : 1); }
    geo.computeBoundingSphere();
    return geo;
  }
}

// Text label as a small self-lit plane (shared per text).
const labelCache = new Map();
export function labelMesh(text, { w = 0.8, h = 0.22, bg = '#1a1612', fg = '#f2e8c8', font = 'bold 64px "Barlow Condensed", sans-serif' } = {}) {
  const key = text + bg + fg + w + h;
  let mat = labelCache.get(key);
  if (!mat) {
    const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * h / w);
    const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    let size = Math.round(c.height * 0.78);
    const fam = font.replace(/^bold \d+px /, '');
    do { x.font = `bold ${size}px ${fam}`; size -= 2; } while (x.measureText(text).width > c.width * 0.88 && size > 8);
    x.fillText(text, c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
    labelCache.set(key, mat);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return m;
}

function geoFor(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const k = new Kit();
  const B = PREFABS[kind];
  B(k);
  const g = k.build();
  cache.set(kind, g);
  return g;
}

// Builds a Group for `kind` facing +Z (front), origin on the ground at the footprint center.
export function makeProp(kind) {
  const grp = new THREE.Group();
  const M = mats();
  const mesh = new THREE.Mesh(geoFor(kind), M.list);
  mesh.castShadow = !!SHADOW[kind]; mesh.receiveShadow = false;
  grp.add(mesh);
  grp.userData.mesh = mesh;
  const L = LABELS[kind];
  if (L) {
    const lm = labelMesh(L.text, L);
    lm.position.set(L.x ?? 0, L.y, L.z);
    if (L.ry) lm.rotation.y = L.ry;
    grp.add(lm);
  }
  return grp;
}

const SHADOW = { vending: 1, atm: 1, dumpster: 1, hotdog: 1, newsbox: 1, board: 1, locker: 1 };

const LABELS = {
  vending: { text: 'SNAX & JUICE', y: 1.78, z: 0.411, w: 0.84, h: 0.2, bg: '#a0281c', fg: '#fff0d0' },
  atm: { text: 'ATM', y: 1.52, z: 0.291, w: 0.56, h: 0.18, bg: '#1d5a34', fg: '#e8ffe8' },
  payphone: { text: 'PHONE', y: 2.08, z: 0.13, w: 0.5, h: 0.14, bg: '#1e3c6a', fg: '#e6efff' },
  newsbox: { text: 'THE RAG', y: 0.98, z: 0.236, w: 0.44, h: 0.12, bg: '#e8dcc0', fg: '#1a1612' },
  board: { text: 'ODD JOBS', y: 2.12, z: 0.06, w: 1.2, h: 0.26, bg: '#c9a227', fg: '#1a1612' },
  squeegee: { text: 'SQUEEGEE $', y: 1.32, z: 0.03, w: 0.7, h: 0.2, bg: '#e8dcc0', fg: '#1a1612' },
  locker: { text: 'PARCEL DROP', y: 1.86, z: 0.36, w: 1.1, h: 0.2, bg: '#6a4a1e', fg: '#f6e6c0' },
  hotdog: { text: 'DOGS $3', y: 1.12, z: 0.47, w: 0.9, h: 0.22, bg: '#c43a1a', fg: '#ffe9a0' },
};

const PREFABS = {
  vending(k) {
    k.box(1.0, 1.9, 0.8, '#7a2a20', 0, 0.95, 0);              // cabinet
    k.box(1.04, 0.06, 0.84, '#3a1612', 0, 1.92, 0);             // top cap
    k.box(0.62, 1.2, 0.02, '#cfe6ff', -0.12, 1.08, 0.405, { glow: true }); // lit window
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      k.box(0.14, 0.2, 0.02, ['#d64a2a', '#3a8ad0', '#e0c030', '#40a050'][(r + c) % 4], -0.32 + c * 0.2, 0.6 + r * 0.28, 0.415, { glow: true });
    }
    k.box(0.2, 0.34, 0.03, '#2a2622', 0.34, 1.22, 0.41);       // keypad panel
    k.box(0.08, 0.04, 0.03, '#d8b030', 0.34, 1.32, 0.425, { glow: true }); // coin slot
    k.box(0.7, 0.18, 0.06, '#1a1612', -0.08, 0.26, 0.4);        // pickup flap
    k.box(0.96, 0.08, 0.76, '#2a1412', 0, 0.04, 0);
  },
  atm(k) {
    k.box(0.8, 1.45, 0.55, '#4a5054', 0, 0.725, 0);
    k.box(0.84, 0.12, 0.6, '#2a2e30', 0, 1.5, 0.02);
    k.box(0.5, 0.34, 0.02, '#4ad08a', 0, 1.14, 0.285, { rx: -0.25, glow: true }); // screen
    k.box(0.36, 0.2, 0.12, '#2a2e30', 0, 0.86, 0.3, { rx: 0.5 });  // keypad
    k.box(0.3, 0.03, 0.03, '#d8b030', 0, 0.68, 0.29, { glow: true }); // cash slot
    k.box(0.3, 0.06, 0.04, '#1a1c1e', 0, 0.62, 0.29);
  },
  payphone(k) {
    k.box(0.1, 1.9, 0.1, '#3a3e42', 0, 0.95, -0.02);
    k.box(0.48, 0.7, 0.26, '#2a4a7a', 0, 1.35, 0.05);
    k.box(0.56, 0.06, 0.34, '#1e3456', 0, 1.74, 0.05);         // hood
    k.box(0.08, 0.36, 0.1, '#111111', -0.17, 1.38, 0.2);        // handset
    k.box(0.2, 0.22, 0.02, '#c8c8c0', 0.06, 1.42, 0.185);       // keypad
    k.box(0.06, 0.02, 0.02, '#d8b030', 0.12, 1.6, 0.19, { glow: true });
    k.box(0.52, 0.16, 0.06, '#1e3c6a', 0, 2.08, 0.08);         // sign back
  },
  newsbox(k) {
    k.box(0.5, 0.82, 0.45, '#b02a1e', 0, 0.55, 0);
    k.box(0.52, 0.04, 0.47, '#701a12', 0, 0.98, 0);
    k.box(0.38, 0.3, 0.02, '#d8d0b8', 0, 0.66, 0.226);          // window w/ paper
    k.box(0.3, 0.04, 0.025, '#1a1612', 0, 0.74, 0.232);
    k.box(0.3, 0.02, 0.025, '#5a5248', 0, 0.68, 0.232);
    k.box(0.3, 0.02, 0.025, '#5a5248', 0, 0.62, 0.232);
    k.box(0.06, 0.06, 0.03, '#c0b8a8', 0.17, 0.86, 0.23);       // coin slot
    for (const s of [-0.2, 0.2]) k.box(0.04, 0.14, 0.4, '#2a2622', s, 0.07, 0);
  },
  dumpster(k) {
    k.box(2.0, 1.15, 1.2, '#2e4a34', 0, 0.72, 0);
    k.box(2.06, 0.08, 1.26, '#1e3424', 0, 1.33, 0);
    k.box(1.0, 0.05, 1.2, '#24382a', -0.5, 1.4, -0.02, { rz: 0.05 });
    k.box(1.0, 0.05, 1.2, '#24382a', 0.5, 1.4, -0.02, { rz: -0.05 });
    k.box(2.04, 0.08, 0.06, '#1a2a1e', 0, 1.05, 0.62);
    for (const s of [-0.85, 0.85]) for (const t of [-0.45, 0.45]) k.cyl(0.08, 0.08, 0.14, '#111111', s, 0.07, t, { rx: Math.PI / 2, seg: 8 });
  },
  trashcan(k) {
    k.cyl(0.32, 0.28, 0.92, '#4a4e48', 0, 0.46, 0, { seg: 14 });
    k.cyl(0.35, 0.35, 0.06, '#3a3e38', 0, 0.95, 0, { seg: 14 });
    k.box(0.16, 0.05, 0.05, '#2a2e28', 0, 1.0, 0);
    for (const y of [0.25, 0.65]) k.cyl(0.325, 0.325, 0.04, '#3a3e38', 0, y, 0, { seg: 14 });
  },
  meter(k) {
    k.cyl(0.05, 0.06, 1.05, '#4a4e50', 0, 0.525, 0, { seg: 8 });
    k.box(0.22, 0.32, 0.16, '#5a6a74', 0, 1.2, 0);
    k.sphere(0.12, '#5a6a74', 0, 1.36, 0, { seg: 10, seg2: 6 });
    k.box(0.14, 0.1, 0.02, '#e8e0a8', 0, 1.25, 0.085, { glow: true });   // dial window
    k.box(0.04, 0.06, 0.02, '#d03020', 0.02, 1.26, 0.095, { glow: true }); // EXPIRED flag
    k.box(0.06, 0.02, 0.02, '#202020', 0, 1.13, 0.085);
  },
  hydrant(k) {
    k.cyl(0.19, 0.22, 0.7, '#c8a020', 0, 0.35, 0, { seg: 12 });
    k.sphere(0.2, '#c8a020', 0, 0.72, 0, { seg: 12, seg2: 6 });
    k.cyl(0.08, 0.08, 0.6, '#a88418', 0, 0.48, 0, { rz: Math.PI / 2, seg: 8 });
    k.cyl(0.11, 0.11, 0.12, '#8a1e14', 0, 0.48, 0.2, { rx: Math.PI / 2, seg: 8 }); // front cap (red)
    k.cyl(0.05, 0.05, 0.1, '#8a1e14', 0, 0.95, 0, { seg: 6 });
    k.cyl(0.26, 0.26, 0.05, '#8a7a50', 0, 0.025, 0, { seg: 12 });
  },
  board(k) {
    for (const s of [-0.7, 0.7]) k.box(0.1, 2.2, 0.1, '#4a3a2a', s, 1.1, 0);
    k.box(1.5, 1.0, 0.08, '#8a6a42', 0, 1.45, 0);
    for (let i = 0; i < 5; i++) k.box(0.26, 0.32, 0.01, ['#e8e0c8', '#f0d070', '#d0e0f0', '#f0c0c0', '#e8e0c8'][i], -0.52 + i * 0.26, 1.42 + (i % 2) * 0.12, 0.045, { rz: (i - 2) * 0.06 });
  },
  squeegee(k) {
    k.cyl(0.22, 0.18, 0.36, '#2a6ab0', 0, 0.18, 0, { seg: 12 }); // bucket
    k.cyl(0.2, 0.2, 0.02, '#a8c8d0', 0, 0.33, 0, { seg: 12, glow: true }); // soapy water
    k.cyl(0.02, 0.02, 1.0, '#c8c0a8', 0.12, 0.6, 0, { rz: -0.35, seg: 6 });
    k.box(0.3, 0.06, 0.04, '#202020', 0.3, 1.06, 0, { rz: -0.35 });
    k.box(0.06, 1.5, 0.06, '#3a3a36', -0.5, 0.75, 0);            // sign post
    k.box(0.74, 0.24, 0.04, '#2a2622', -0.5, 1.32, 0);
  },
  locker(k) {
    k.box(1.2, 1.75, 0.7, '#7a5a30', 0, 0.875, 0);
    k.box(1.24, 0.06, 0.74, '#4a3418', 0, 1.78, 0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) k.box(0.34, 0.44, 0.02, '#8a6a3a', -0.38 + c * 0.38, 0.4 + r * 0.5, 0.355);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) k.box(0.04, 0.04, 0.02, '#e0c040', -0.25 + c * 0.38, 0.4 + r * 0.5, 0.37, { glow: true });
  },
  hotdog(k) {
    k.box(1.6, 0.8, 0.9, '#c8c0b0', 0, 0.75, 0);                 // cart body
    k.box(1.64, 0.06, 0.94, '#8a8278', 0, 1.18, 0);
    k.box(1.0, 0.14, 0.5, '#9a9a9a', 0, 1.26, 0);                // steam tray
    for (const s of [-1, 1]) k.cyl(0.3, 0.3, 0.1, '#202020', s * 0.55, 0.3, 0.48, { rx: Math.PI / 2, seg: 14 });
    k.box(0.1, 0.06, 0.6, '#5a5a5a', -0.95, 0.9, 0);              // handle
    k.cyl(0.025, 0.025, 1.4, '#aaaaaa', 0.6, 1.9, -0.25, { seg: 6 }); // umbrella pole
    k.cone(1.0, 0.45, '#d84a2a', 0.6, 2.75, -0.25, { seg: 8 });
    k.cone(1.0, 0.45, '#f0d060', 0.6, 2.751, -0.25, { seg: 8, ry: Math.PI / 8 });
    k.box(0.2, 0.06, 0.08, '#c87830', -0.2, 1.36, 0.1);           // a dog
    k.box(0.2, 0.06, 0.08, '#c87830', 0.15, 1.36, -0.05);
  },
  crate(k) {
    k.box(0.7, 0.42, 0.55, '#7a5e3a', 0, 0.21, 0);
    k.box(0.72, 0.05, 0.57, '#5a4428', 0, 0.3, 0);
  },
  montebox(k) {
    k.box(0.7, 0.6, 0.5, '#9a7a4a', 0, 0.3, 0);
    for (let i = 0; i < 3; i++) k.box(0.14, 0.01, 0.2, '#f0ece0', -0.2 + i * 0.2, 0.61, 0.02, { glow: true });
    k.box(0.04, 0.012, 0.08, '#c02020', 0.2, 0.618, 0.02, { glow: true });
  },
  guitar(k) {
    k.box(0.34, 0.42, 0.1, '#8a4a20', 0, 0, 0);
    k.cyl(0.07, 0.07, 0.02, '#1a1008', 0, 0.05, 0.06, { rx: Math.PI / 2 });
    k.box(0.06, 0.6, 0.04, '#3a2210', 0, 0.5, 0);
  },
  bucketdrum(k) {
    k.cyl(0.22, 0.19, 0.42, '#d0d0c8', 0, 0.21, 0, { seg: 12 });
    k.cyl(0.2, 0.2, 0.01, '#e8e8e0', 0, 0.425, 0, { seg: 12 });
  },
  tiphat(k) {
    k.cyl(0.2, 0.2, 0.02, '#2a2420', 0, 0.01, 0, { seg: 12 });
    k.cyl(0.12, 0.13, 0.12, '#2a2420', 0, 0.07, 0, { seg: 12 });
    k.cyl(0.1, 0.1, 0.01, '#7fbf4d', 0, 0.125, 0, { seg: 10, glow: true });
  },
  rat(k) {
    const gold = '#f0c040';
    k.sphere(0.13, gold, 0, 0.16, 0, { glow: true });
    k.sphere(0.08, gold, 0, 0.2, 0.13, { glow: true });
    k.cone(0.05, 0.12, gold, 0, 0.2, 0.24, { rx: Math.PI / 2, glow: true });
    for (const s of [-1, 1]) k.sphere(0.04, '#ffd860', s * 0.06, 0.29, 0.1, { glow: true });
    k.cyl(0.015, 0.01, 0.3, '#c89030', 0, 0.1, -0.24, { rx: 1.1, glow: true });
    k.cyl(0.12, 0.14, 0.05, '#3a3026', 0, 0.025, 0, { seg: 12 });
  },
  burntcar(k) {
    k.box(1.9, 0.7, 4.2, '#2a2420', 0, 0.6, 0);
    k.box(1.7, 0.6, 2.0, '#1e1a16', 0, 1.2, -0.2);
    for (const s of [-0.95, 0.95]) for (const t of [-1.3, 1.3]) k.cyl(0.34, 0.34, 0.22, '#141210', s, 0.34, t, { rz: Math.PI / 2, seg: 10 });
  },
};
