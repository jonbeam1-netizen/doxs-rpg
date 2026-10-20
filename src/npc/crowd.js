import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Ambient crowd body language: static poses (sit, sit on the ground, lie down,
// lean on a wall, chat, smoke, phone, push a cart), their little props, and
// spot finding (benches / wall spots) with fallbacks when the world doesn't
// provide game.world.seats / game.world.wallSpots().
//
// Posed NPCs skip the walk-cycle animate() entirely; applyPose() sets the limbs
// once and gesture() adds cheap periodic motion (hand to mouth, phone, nods).
// All poses keep the feet / butt / back on the ground (y = 0 at the group origin).

const PI = Math.PI;
let A = null;
function assets() {
  if (A) return A;
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.7, roughness: 0.45 });
  const junk = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 1 });
  const bag = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6, metalness: 0.1 });
  const card = new THREE.MeshStandardMaterial({ color: 0x7a6244, roughness: 1 });
  const blankets = [0x4a3a5a, 0x5a3a2a, 0x3a4a3a, 0x6a5a3a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  const phone = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x335577, emissiveIntensity: 0.5, roughness: 0.3 });
  const cig = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.8 });
  const ember = new THREE.MeshStandardMaterial({ color: 0x5a1000, emissive: 0xff5010, emissiveIntensity: 1.5 });
  const b = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  // shopping cart, handle at the back (local z=0), basket out front (+z)
  const cartGeo = mergeGeometries([
    b(0.55, 0.02, 0.75, 0, 0.5, 0.45), b(0.02, 0.42, 0.75, 0.27, 0.71, 0.45), b(0.02, 0.42, 0.75, -0.27, 0.71, 0.45),
    b(0.55, 0.42, 0.02, 0, 0.71, 0.83), b(0.55, 0.42, 0.02, 0, 0.71, 0.07), b(0.6, 0.03, 0.03, 0, 0.95, 0.0),
    b(0.02, 0.48, 0.02, 0.25, 0.24, 0.1), b(0.02, 0.48, 0.02, -0.25, 0.24, 0.1), b(0.02, 0.48, 0.02, 0.25, 0.24, 0.8), b(0.02, 0.48, 0.02, -0.25, 0.24, 0.8),
    ...[[0.25, 0.1], [-0.25, 0.1], [0.25, 0.8], [-0.25, 0.8]].map(([x, z]) => new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8).rotateZ(PI / 2).translate(x, 0.05, z)),
  ]);
  const junkGeo = mergeGeometries([
    new THREE.SphereGeometry(0.2, 8, 6).scale(1, 0.8, 1).translate(0.08, 0.72, 0.35),
    new THREE.SphereGeometry(0.17, 8, 6).translate(-0.1, 0.8, 0.6),
    new THREE.BoxGeometry(0.28, 0.22, 0.2).rotateY(0.4).translate(0.05, 0.98, 0.5),
  ]);
  const cardGeo = new THREE.PlaneGeometry(0.85, 2.1).rotateX(-PI / 2).translate(0, 0.015, 0);
  const seatCardGeo = new THREE.PlaneGeometry(0.8, 0.9).rotateX(-PI / 2).translate(0, 0.015, 0.25);
  const blanketGeo = new THREE.BoxGeometry(0.62, 0.05, 1.05);
  const phoneGeo = new THREE.BoxGeometry(0.06, 0.12, 0.015).translate(0, -0.04, 0.03);
  const cigGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.09, 5).rotateX(PI / 2).translate(0, -0.03, 0.06);
  const emberGeo = new THREE.SphereGeometry(0.014, 5, 4).translate(0, -0.03, 0.105);
  A = { metal, junk, bag, card, blankets, phone, cig, ember, cartGeo, junkGeo, cardGeo, seatCardGeo, blanketGeo, phoneGeo, cigGeo, emberGeo };
  return A;
}

function mesh(geo, mat, shadow = false) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; return m; }

// ---------------------------------------------------------------- pose core
export function resetPose(model) {
  const P = model.parts, body = model.body;
  body.rotation.set(0, 0, 0);
  body.position.set(0, 0, 0);
  P.hips.position.y = 0.95;
  P.hips.rotation.set(0, 0, 0);
  P.torso.rotation.set(0, 0, 0);
  P.neck.rotation.set(0, 0, 0);
  P.head.rotation.set(0, 0, 0);
  for (const l of [P.armL, P.armR, P.legL, P.legR]) { l.upper.rotation.set(0, 0, 0); l.lower.rotation.set(0, 0, 0); }
}

// kind: 'sit' | 'ground' | 'lie' | 'lean' | 'stand' | 'chat' | 'cart'
// opts: { h (seat height, world units), hands: 'smoke'|'phone'|'cross'|null, card: bool, blanket: bool }
export function applyPose(npc, kind, opts = {}) {
  const m = npc.model, P = m.parts, body = m.body;
  clearProps(npc);
  resetPose(m);
  const s = body.scale.y || 1;
  const pose = { kind, hands: opts.hands || null, t: Math.random() * 10, gT: 0, props: [] };
  npc.pose = pose;
  const A = assets();
  const card = opts.card ? 0.03 : 0;
  switch (kind) {
    case 'sit': {
      const h = (opts.h ?? 0.48) / s;
      const hipY = h + 0.06;
      P.hips.position.y = hipY;
      // shin angled so the feet sit on the pavement
      const drop = (hipY - 0.06) / 0.47;
      const phi = drop < 1 ? Math.acos(Math.max(0.2, drop)) : 0;
      for (const [l, sx] of [[P.legL, 1], [P.legR, -1]]) {
        l.upper.rotation.set(-PI / 2 + 0.06, 0, 0.09 * sx);
        l.lower.rotation.set(PI / 2 - 0.06 - phi, 0, 0);
      }
      P.armL.upper.rotation.set(-0.45, 0, 0.12); P.armL.lower.rotation.set(-0.85, 0, 0);
      P.armR.upper.rotation.set(-0.45, 0, -0.12); P.armR.lower.rotation.set(-0.85, 0, 0);
      P.neck.rotation.x = 0.08;
      break;
    }
    case 'ground': { // sitting on the pavement, back to the wall, one knee up
      P.hips.position.y = 0.08 + card / s;
      P.hips.rotation.x = -0.3;
      P.legL.upper.rotation.set(-PI / 2 + 0.3 - 0.6, 0, 0.12); P.legL.lower.rotation.set(1.2, 0, 0);
      P.legR.upper.rotation.set(-PI / 2 + 0.3, 0, -0.1); P.legR.lower.rotation.set(0, 0, 0);
      P.armL.upper.rotation.set(-0.75, 0, 0.1); P.armL.lower.rotation.set(-0.5, 0, 0);
      P.armR.upper.rotation.set(0.3, 0, -0.45); P.armR.lower.rotation.set(-0.2, 0, 0);
      P.neck.rotation.x = 0.35;
      if (opts.card) { const c = mesh(A.seatCardGeo, A.card); npc.group.add(c); pose.props.push(c); }
      break;
    }
    case 'lie': { // on the back, head propped on a bundle, hands on belly
      body.rotation.x = -PI / 2;
      body.position.set(0, 0.1 * s + card, 0.95 * s);
      P.neck.rotation.x = -0.45;
      P.legL.upper.rotation.set(0, 0, 0.1); P.legR.upper.rotation.set(-0.35, 0, -0.08); P.legR.lower.rotation.set(0.7, 0, 0);
      // one arm at the side, the other hand resting on the belly
      P.armL.upper.rotation.set(-0.08, 0, 0.22); P.armL.lower.rotation.set(-0.15, 0, 0);
      P.armR.upper.rotation.set(-0.22, 0, 0.05); P.armR.lower.rotation.set(-1.25, 0, 0.35);
      if (opts.card !== false) { const c = mesh(A.cardGeo, A.card); c.position.z = -0.05; npc.group.add(c); pose.props.push(c); }
      if (opts.blanket) {
        const bl = mesh(A.blanketGeo, A.blankets[(Math.random() * A.blankets.length) | 0]);
        bl.position.set(0, 0.1 * s + card + 0.08, 0.5 * s);
        npc.group.add(bl); pose.props.push(bl);
      }
      const bundle = mesh(new THREE.SphereGeometry(0.16, 7, 5).scale(1.3, 0.7, 0.9), A.bag);
      bundle.position.set(0, 0.11 + card, -0.95 * s - 0.05);
      npc.group.add(bundle); pose.props.push(bundle); pose.ownGeo = bundle.geometry;
      break;
    }
    case 'lean': { // back against the wall, one foot up on it
      body.rotation.x = -0.1;
      P.legR.upper.rotation.set(-0.35, 0, 0); P.legR.lower.rotation.set(0.9, 0, 0);
      P.legL.upper.rotation.set(0.05, 0, 0.04);
      handsPose(P, opts.hands || 'cross');
      break;
    }
    case 'stand': case 'chat': {
      P.legL.upper.rotation.set(0, 0, 0.07); P.legR.upper.rotation.set(0, 0, -0.07);
      P.armL.upper.rotation.set(0, 0, 0.16); P.armL.lower.rotation.set(-0.2, 0, 0);
      P.armR.upper.rotation.set(0, 0, -0.16); P.armR.lower.rotation.set(-0.2, 0, 0);
      if (opts.hands) handsPose(P, opts.hands);
      break;
    }
    case 'cart': {
      const cart = mesh(A.cartGeo, A.metal, true);
      cart.position.z = 0.45;
      const j = mesh(A.junkGeo, A.junk);
      cart.add(j);
      npc.group.add(cart); pose.props.push(cart);
      pose.walking = true;
      break;
    }
  }
  // hand props
  if (pose.hands === 'phone') { const ph = mesh(A.phoneGeo, A.phone); m.rightHand.add(ph); pose.props.push(ph); }
  if (pose.hands === 'smoke') {
    const c = mesh(A.cigGeo, A.cig); const e = mesh(A.emberGeo, A.ember);
    c.add(e); m.rightHand.add(c); pose.props.push(c); pose.ember = e;
  }
  return pose;
}

function handsPose(P, hands) {
  if (hands === 'cross') {
    P.armL.upper.rotation.set(-0.55, 0, -0.42); P.armL.lower.rotation.set(-1.65, 0, 0);
    P.armR.upper.rotation.set(-0.5, 0, 0.45); P.armR.lower.rotation.set(-1.6, 0, 0);
  } else if (hands === 'phone') {
    P.armR.upper.rotation.set(-0.35, 0, -0.75); P.armR.lower.rotation.set(-2.35, 0, 0);
    P.armL.upper.rotation.set(0.05, 0, 0.16); P.armL.lower.rotation.set(-0.25, 0, 0);
  } else if (hands === 'smoke') {
    P.armR.upper.rotation.set(-0.35, 0, 0.1); P.armR.lower.rotation.set(-1.2, 0, 0);
    P.armL.upper.rotation.set(-0.5, 0, -0.4); P.armL.lower.rotation.set(-1.5, 0, 0);
  }
}

function clearProps(npc) {
  const pose = npc.pose;
  if (!pose) return;
  for (const p of pose.props) p.removeFromParent();
  pose.ownGeo?.dispose();
  pose.props.length = 0;
}

export function clearPose(npc) {
  if (!npc.pose) return;
  clearProps(npc);
  npc.pose = null;
  resetPose(npc.model);
  if (npc.dead) npc.model.setDead(true);
}

// Cheap periodic motion for posed NPCs near the camera.
// look: while in a conversation, the player's bearing relative to the body (radians, + = toward local +x);
// seated / lying / leaning people turn their head and shoulders instead of getting up.
export function gesture(npc, dt, look = null) {
  const pose = npc.pose;
  if (!pose) return;
  const P = npc.model.parts;
  pose.t += dt;
  const t = pose.t;
  P.head.rotation.y = 0;
  P.torso.rotation.y = 0;
  baseGesture(npc, pose, P, t);
  // conversation: ease the head (and shoulders) round to the player, nod along now and then
  const want = look != null ? 1 : 0;
  pose.talkK = (pose.talkK || 0) + (want - (pose.talkK || 0)) * Math.min(1, dt * 4);
  if (look != null) pose.look = look;
  const k = pose.talkK;
  if (k > 0.002) {
    const L = Math.max(-2, Math.min(2, pose.look || 0));
    const tor = pose.kind === 'lie' ? 0 : Math.max(-0.55, Math.min(0.55, L * 0.45)) * k;
    if (pose.kind !== 'lie') P.torso.rotation.y = tor;
    const head = Math.max(-1.05, Math.min(1.05, L - tor));
    P.head.rotation.y = P.head.rotation.y * (1 - k) + head * k;
    // small "talking" bob of the head
    if (look != null) P.head.rotation.x = Math.sin(t * 2.7) * 0.05 * k + Math.max(0, Math.sin(t * 0.8)) * 0.08 * k;
  } else if (P.head.rotation.x !== 0) P.head.rotation.x = 0;
}

function baseGesture(npc, pose, P, t) {
  if (pose.hands === 'smoke') {
    // drag every ~5s: hand to mouth, hold, back down
    const c = t % 5.2;
    const k = c < 0.5 ? c / 0.5 : c < 1.6 ? 1 : c < 2.1 ? 1 - (c - 1.6) / 0.5 : 0;
    P.armR.upper.rotation.set(-0.35 - k * 0.55, 0, 0.1 + k * 0.38);
    P.armR.lower.rotation.x = -1.2 - k * 1.25;
    P.neck.rotation.x = -k * 0.08;
    if (pose.ember) pose.ember.scale.setScalar(k > 0.9 ? 1.6 : 1);
  } else if (pose.hands === 'phone') {
    P.head.rotation.y = Math.sin(t * 0.7) * 0.25;
    if (pose.kind !== 'lean') P.armL.upper.rotation.x = 0.05 + Math.max(0, Math.sin(t * 1.3)) * -0.5; // talking with the other hand
  } else if (pose.kind === 'chat') {
    // talk-with-your-hands, nods
    const g = Math.sin(t * 2.1 + npc.id.length) ;
    const talking = Math.sin(t * 0.45 + (npc.chatPhase || 0)) > 0;
    P.armR.upper.rotation.x = talking ? -0.25 - Math.max(0, g) * 0.6 : 0;
    P.armR.lower.rotation.x = talking ? -0.6 - Math.max(0, g) * 0.6 : -0.2;
    P.neck.rotation.x = talking ? Math.sin(t * 3) * 0.05 : Math.max(0, Math.sin(t * 1.7)) * 0.12;
    P.head.rotation.y = Math.sin(t * 0.3) * 0.15;
  } else if (pose.kind === 'sit' || pose.kind === 'ground') {
    P.head.rotation.y = Math.sin(t * 0.25 + 1) * 0.35;
  } else if (pose.kind === 'lie') {
    // slow breathing
    P.hips.position.y = 0.95 + Math.sin(t * 1.4) * 0.006;
  }
}

// Standing conversation body language, layered on top of the idle animate(): talk with the hands,
// listen with little nods. Runs every frame while npc.talk is set (see NPCManager.holdTalk).
export function talkGesture(npc, dt) {
  const T = npc.talk;
  if (!T) return;
  const P = npc.model.parts;
  T.g = (T.g || 0) + dt;
  const t = T.g + (npc.chatPhase || 0) + (npc.id?.length || 0);
  const k = Math.min(1, T.g * 2.5); // ease in
  // w: 1 = talking with the hands, 0 = listening (hands on hips), blended smoothly
  const w = Math.max(0, Math.min(1, (Math.sin(t * 0.85) + 0.25) * 2.5));
  const mix = (cur, v) => cur + (v - cur) * k;
  if (npc.pose?.kind !== 'cart' && !npc.aiming) {
    const g1 = Math.max(0, Math.sin(t * 2.3)), g2 = Math.max(0, Math.sin(t * 1.7 + 1.3));
    const L = (a, b) => a + (b - a) * w; // listen -> speak
    P.armR.upper.rotation.x = mix(P.armR.upper.rotation.x, L(-0.05, -0.3 - g1 * 0.55));
    P.armR.upper.rotation.z = mix(P.armR.upper.rotation.z, L(-0.42, -0.22));
    P.armR.lower.rotation.x = mix(P.armR.lower.rotation.x, L(-1.1, -0.75 - g1 * 0.55));
    P.armL.upper.rotation.x = mix(P.armL.upper.rotation.x, L(-0.05, -0.12 - g2 * 0.35));
    P.armL.upper.rotation.z = mix(P.armL.upper.rotation.z, L(0.42, 0.18));
    P.armL.lower.rotation.x = mix(P.armL.lower.rotation.x, L(-1.1, -0.45 - g2 * 0.45));
  }
  P.neck.rotation.x = (Math.sin(t * 3.1) * 0.06 * w + Math.max(0, Math.sin(t * 1.9)) * 0.14 * (1 - w)) * k;
  P.head.rotation.y = Math.sin(t * 0.5) * 0.12 * k;
}

export function endTalkGesture(npc) {
  const P = npc.model?.parts;
  if (!P) return;
  P.neck.rotation.x = 0;
  P.head.rotation.y = 0;
}

// Cart pushers walk normally, then we pin the arms onto the handle.
export function cartArms(npc) {
  const P = npc.model.parts;
  P.armL.upper.rotation.set(-0.95, 0, 0.05); P.armL.lower.rotation.x = -0.25;
  P.armR.upper.rotation.set(-0.95, 0, -0.05); P.armR.lower.rotation.x = -0.25;
  P.torso.rotation.x = 0.12;
}

// ---------------------------------------------------------------- spots
// A spot with its back to a building wall: { x, z, facing } (facing = away from the wall).
export function findWallSpot(game, x, z, r = 14, taken = null) {
  const w = game.world;
  const free = (p) => !taken || ![...taken].some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.6);
  if (typeof w?.wallSpots === 'function') {
    let list = [];
    try { list = w.wallSpots(x, z, r) || []; } catch { list = []; }
    const ok = list.filter(free);
    return ok.length ? ok[(Math.random() * ok.length) | 0] : null;
  }
  const ph = game.physics;
  for (let i = 0; i < 6; i++) {
    let p = null;
    try { p = w?.sidewalkPointNear?.(x, z, 0, r); } catch { p = null; }
    if (!p) p = { x: x + (Math.random() - 0.5) * r, z: z + (Math.random() - 0.5) * r };
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - 0.5);
    for (const [dx, dz] of dirs) {
      const f = ph.raycast(p.x, p.z, p.x + dx * 7, p.z + dz * 7, 0.25, 1.0);
      if (f >= 1) continue;
      const d = 7 * f;
      const sx = p.x + dx * (d - 0.5), sz = p.z + dz * (d - 0.5);
      if (ph.pointBlocked(sx, sz) || ph.resolveCircle(sx, sz, 0.42).hit) continue;
      if (typeof w?.onSidewalk === 'function' && !w.onSidewalk(sx, sz)) continue;
      const spot = { x: sx, z: sz, facing: Math.atan2(-dx, -dz) };
      if (free(spot)) return spot;
    }
  }
  return null;
}

// A free seat (bench / stoop / bus stop) in a ring around (x,z).
export function findSeat(game, x, z, minR, maxR, taken) {
  const seats = game.world?.seats;
  if (!Array.isArray(seats) || !seats.length) return null;
  const c = [];
  for (const s of seats) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d >= minR && d <= maxR && !taken.has(s)) c.push(s);
  }
  return c.length ? c[(Math.random() * c.length) | 0] : null;
}
