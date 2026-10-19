import * as THREE from 'three';
import { WEAPONS } from '../data/weapons.js';

// NPC-only weapons (not sold in shops).
export const NPC_WEAPONS = {
  baton: { name: 'Nightstick', kind: 'melee', damage: 10, range: 1.9, rate: 0.75 },
};

export function weaponDef(id) {
  return WEAPONS[id] || NPC_WEAPONS[id] || WEAPONS.fists;
}

// Procedural weapon meshes. Attach to a stickman hand: the hand's -Y axis points
// "out of the fist" (down when the arm hangs, forward when aiming), local -Z is
// "down" while aiming, so gun grips extend along -Z.
const M = {};
function mats() {
  if (M.wood) return M;
  M.wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.8 });
  M.darkWood = new THREE.MeshStandardMaterial({ color: 0x3a2616, roughness: 0.8 });
  M.steel = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.35, metalness: 0.8 });
  M.gun = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.5, metalness: 0.6 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.95, emissive: 0x3a2a00, emissiveIntensity: 0.4 });
  M.red = new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.6, metalness: 0.4 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.8 });
  M.tape = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  return M;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// Build once per id, clone after (clones share geometry + materials).
const proto = {};
function build(id) {
  const m = mats();
  const g = new THREE.Group();
  switch (id) {
    case 'brass': g.add(box(0.14, 0.05, 0.1, m.gold, 0, -0.02, 0.03)); break;
    case 'bottle': {
      g.add(cyl(0.03, 0.03, 0.12, m.glass, 0, -0.02, 0));
      g.add(cyl(0.065, 0.045, 0.22, m.glass, 0, -0.18, 0));
      const jag = cyl(0.0, 0.06, 0.07, m.glass, 0, -0.32, 0, 5); jag.rotation.x = Math.PI; g.add(jag);
      break;
    }
    case 'bat': {
      g.add(cyl(0.025, 0.025, 0.2, m.tape, 0, 0.02, 0));
      g.add(cyl(0.028, 0.06, 0.75, m.wood, 0, -0.45, 0));
      break;
    }
    case 'baton': {
      g.add(cyl(0.025, 0.025, 0.6, m.rubber, 0, -0.22, 0));
      const t = cyl(0.015, 0.015, 0.12, m.rubber, 0, -0.02, 0.06); t.rotation.x = Math.PI / 2; g.add(t);
      break;
    }
    case 'knife': {
      g.add(box(0.035, 0.12, 0.04, m.darkWood, 0, -0.02, 0));
      g.add(box(0.012, 0.2, 0.04, m.steel, 0, -0.18, 0.005));
      break;
    }
    case 'crowbar': {
      g.add(cyl(0.022, 0.022, 0.72, m.red, 0, -0.3, 0));
      const hook = cyl(0.02, 0.02, 0.14, m.red, 0, -0.68, 0.05); hook.rotation.x = 0.9; g.add(hook);
      break;
    }
    case 'machete': {
      g.add(box(0.035, 0.13, 0.045, m.darkWood, 0, -0.02, 0));
      g.add(box(0.01, 0.62, 0.085, m.steel, 0, -0.4, 0.02));
      break;
    }
    case 'sledge': {
      g.add(cyl(0.025, 0.025, 0.9, m.wood, 0, -0.38, 0));
      g.add(box(0.13, 0.14, 0.3, m.gun, 0, -0.85, 0));
      break;
    }
    case 'pistol':
    case 'goldengun': {
      const mat = id === 'goldengun' ? m.gold : m.gun;
      g.add(box(0.045, 0.24, 0.07, mat, 0, -0.1, 0.03));
      g.add(box(0.04, 0.05, 0.13, mat, 0, 0.0, -0.04));
      break;
    }
    case 'revolver': {
      g.add(cyl(0.022, 0.022, 0.3, m.steel, 0, -0.16, 0.04));
      const c = cyl(0.045, 0.045, 0.07, m.steel, 0, -0.02, 0.03); g.add(c);
      g.add(box(0.04, 0.05, 0.14, m.darkWood, 0, 0.01, -0.05));
      break;
    }
    case 'shotgun': {
      g.add(cyl(0.022, 0.022, 0.42, m.gun, 0.024, -0.2, 0.04));
      g.add(cyl(0.022, 0.022, 0.42, m.gun, -0.024, -0.2, 0.04));
      g.add(box(0.05, 0.22, 0.08, m.darkWood, 0, 0.1, -0.02));
      break;
    }
    case 'smg': {
      g.add(box(0.06, 0.32, 0.09, m.gun, 0, -0.08, 0.03));
      g.add(box(0.035, 0.05, 0.2, m.gun, 0, -0.06, -0.1));
      g.add(cyl(0.015, 0.015, 0.1, m.gun, 0, -0.27, 0.04));
      break;
    }
    case 'rifle': {
      g.add(cyl(0.018, 0.018, 0.75, m.gun, 0, -0.38, 0.04));
      g.add(box(0.05, 0.42, 0.08, m.wood, 0, 0.0, 0.02));
      g.add(box(0.05, 0.14, 0.1, m.wood, 0, 0.26, -0.02));
      g.add(cyl(0.025, 0.025, 0.16, m.gun, 0, -0.1, 0.1));
      break;
    }
    default: return null;
  }
  return g;
}

export function weaponMesh(id) {
  if (!id || id === 'fists') return null;
  if (!(id in proto)) proto[id] = build(id);
  const p = proto[id];
  return p ? p.clone() : null;
}

// Length from the hand to the muzzle along -Y (for muzzle flash placement).
export const MUZZLE = { pistol: 0.24, goldengun: 0.24, revolver: 0.32, shotgun: 0.42, smg: 0.33, rifle: 0.76 };
