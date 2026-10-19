import * as THREE from 'three';

// The stick figure used for the player, every NPC, and remote co-op players.
// Faces +Z. Rotate the returned `group` around Y to turn it.
//
// const s = createStickman({ color, scale, hat, hatColor });
// s.animate(dt, speed, { aim, airborne })  // call every frame
// s.punch()                                // play a swing
// s.setDead(true)                          // ragdoll-ish flop
// s.flash()                                // red hit flash
// s.rightHand / s.leftHand                 // attach weapon meshes here (they point down -Y)

const G = {};
function geos() {
  if (G.limb) return G;
  G.limb = new THREE.CapsuleGeometry(0.06, 0.4, 3, 8);
  G.limb.translate(0, -0.225, 0);
  G.torso = new THREE.CapsuleGeometry(0.08, 0.5, 3, 8);
  G.torso.translate(0, 0.3, 0);
  G.head = new THREE.SphereGeometry(0.21, 18, 14);
  G.brim = new THREE.CylinderGeometry(0.32, 0.32, 0.025, 18);
  G.crown = new THREE.CylinderGeometry(0.17, 0.19, 0.2, 18);
  G.top = new THREE.CylinderGeometry(0.17, 0.17, 0.38, 18);
  G.beanie = new THREE.SphereGeometry(0.225, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  G.visor = new THREE.BoxGeometry(0.26, 0.025, 0.2);
  G.eye = new THREE.SphereGeometry(0.03, 8, 6);
  return G;
}

const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8d2c0 });

export function createStickman({ color = 0x141414, scale = 1, hat = null, hatColor = 0x3a2a1a, eyes = true } = {}) {
  const g = geos();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.08 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);

  const hips = new THREE.Group();
  hips.position.y = 0.95;
  body.add(hips);
  const torso = new THREE.Mesh(g.torso, mat);
  hips.add(torso);
  const neck = new THREE.Group();
  neck.position.y = 0.62;
  hips.add(neck);
  const head = new THREE.Mesh(g.head, mat);
  head.position.y = 0.27;
  neck.add(head);

  if (eyes) {
    for (const x of [-0.07, 0.07]) {
      const e = new THREE.Mesh(g.eye, eyeMat);
      e.position.set(x, 0.03, 0.185);
      head.add(e);
    }
  }

  function limb(parent, x, y) {
    const upper = new THREE.Group();
    upper.position.set(x, y, 0);
    parent.add(upper);
    upper.add(new THREE.Mesh(g.limb, mat));
    const lower = new THREE.Group();
    lower.position.y = -0.45;
    upper.add(lower);
    lower.add(new THREE.Mesh(g.limb, mat));
    const end = new THREE.Group();
    end.position.y = -0.47;
    lower.add(end);
    return { upper, lower, end };
  }
  const armL = limb(neck, 0.07, 0);
  const armR = limb(neck, -0.07, 0);
  const legL = limb(hips, 0.09, 0);
  const legR = limb(hips, -0.09, 0);

  if (hat) addHat(head, hat, hatColor);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

  const st = { phase: Math.random() * 10, punch: 0, punchDur: 0.28, dead: false, flash: 0 };
  const baseEmissive = new THREE.Color(0x000000);

  function animate(dt, speed = 0, opts = {}) {
    if (st.flash > 0) {
      st.flash -= dt;
      mat.emissive.setRGB(Math.max(0, st.flash) * 3, 0, 0);
      if (st.flash <= 0) mat.emissive.copy(baseEmissive);
    }
    if (st.dead) return;
    const s = Math.min(speed / 6, 1.5);
    st.phase += dt * (2.5 + speed * 1.5);
    const sw = Math.sin(st.phase) * 0.85 * Math.min(s, 1.1);

    if (opts.airborne) {
      legL.upper.rotation.x = -0.6; legR.upper.rotation.x = 0.3;
      legL.lower.rotation.x = 0.9; legR.lower.rotation.x = 0.6;
    } else {
      legL.upper.rotation.x = sw;
      legR.upper.rotation.x = -sw;
      legL.lower.rotation.x = Math.max(0, Math.sin(st.phase + 0.6)) * 1.1 * Math.min(s, 1);
      legR.lower.rotation.x = Math.max(0, -Math.sin(st.phase + 0.6)) * 1.1 * Math.min(s, 1);
    }
    hips.position.y = 0.95 + Math.abs(Math.sin(st.phase)) * 0.05 * Math.min(s, 1) + (s < 0.05 ? Math.sin(st.phase * 0.6) * 0.008 : 0);
    torso.rotation.x = 0.08 * Math.min(s, 1.2);

    // Arms: swing opposite to legs, splayed a bit so they don't clip the torso.
    armL.upper.rotation.set(-sw * 0.8, 0, 0.18);
    armL.lower.rotation.x = -0.25 - 0.2 * Math.min(s, 1);
    armR.upper.rotation.set(sw * 0.8, 0, -0.18);
    armR.lower.rotation.x = -0.25 - 0.2 * Math.min(s, 1);

    if (opts.aim) {
      armR.upper.rotation.set(-Math.PI / 2 + 0.05, 0, -0.05);
      armR.lower.rotation.x = 0;
      armL.upper.rotation.set(-Math.PI / 2 + 0.25, 0, -0.45);
      armL.lower.rotation.x = -0.3;
    }
    if (st.punch > 0) {
      st.punch -= dt;
      const t = 1 - Math.max(0, st.punch) / st.punchDur;
      const ext = Math.sin(t * Math.PI);
      if (opts.swingStyle === 'overhead') {
        armR.upper.rotation.set(-2.6 + t * 2.4, 0, -0.1);
        armR.lower.rotation.x = -0.3;
      } else {
        armR.upper.rotation.set(-1.55 * ext - (1 - ext) * 0.2, 0.25 * ext, -0.12);
        armR.lower.rotation.x = -0.6 * (1 - ext);
      }
      torso.rotation.y = -0.35 * ext;
    } else {
      torso.rotation.y = 0;
    }
  }

  function punch(duration = 0.28) { st.punch = duration; st.punchDur = duration; }
  function flash() { st.flash = 0.18; }
  function setDead(on) {
    st.dead = on;
    body.rotation.x = on ? -Math.PI / 2 : 0;
    body.position.y = on ? 0.12 : 0;
    if (on) {
      armL.upper.rotation.set(-0.3, 0, 1.2); armR.upper.rotation.set(0.2, 0, -1.3);
      legL.upper.rotation.set(0.1, 0, 0.25); legR.upper.rotation.set(-0.1, 0, -0.2);
    }
  }
  function setColor(c) { mat.color.set(c); }
  function dispose() { mat.dispose(); root.removeFromParent(); }

  return {
    group: root, body, mat,
    parts: { hips, torso, neck, head, armL, armR, legL, legR },
    rightHand: armR.end, leftHand: armL.end,
    animate, punch, flash, setDead, setColor, dispose,
    get dead() { return st.dead; },
  };
}

export const HAT_TYPES = ['fedora', 'cap', 'beanie', 'tophat', 'hardhat', 'cop', 'crown'];

function addHat(head, type, color) {
  const g = geos();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const hat = new THREE.Group();
  hat.position.y = 0.14;
  switch (type) {
    case 'fedora': {
      hat.add(new THREE.Mesh(g.brim, m));
      const c = new THREE.Mesh(g.crown, m); c.position.y = 0.1; hat.add(c);
      break;
    }
    case 'tophat': {
      hat.add(new THREE.Mesh(g.brim, m));
      const c = new THREE.Mesh(g.top, m); c.position.y = 0.19; hat.add(c);
      break;
    }
    case 'cap':
    case 'cop': {
      const b = new THREE.Mesh(g.beanie, m); b.position.y = -0.04; hat.add(b);
      const v = new THREE.Mesh(g.visor, m); v.position.set(0, -0.03, 0.2); hat.add(v);
      if (type === 'cop') { const c = new THREE.Mesh(g.crown, m); c.scale.set(1.25, 0.6, 1.25); c.position.y = 0.08; hat.add(c); }
      break;
    }
    case 'hardhat': {
      const b = new THREE.Mesh(g.beanie, m); b.scale.set(1.08, 1.05, 1.08); b.position.y = -0.03; hat.add(b);
      const brim = new THREE.Mesh(g.brim, m); brim.scale.set(0.85, 1, 0.85); brim.position.y = -0.03; hat.add(brim);
      break;
    }
    case 'crown': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.14, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }));
      c.position.y = 0.04; hat.add(c);
      break;
    }
    case 'beanie':
    default: {
      const b = new THREE.Mesh(g.beanie, m); b.position.y = -0.05; b.scale.set(1.05, 1.15, 1.05); hat.add(b);
    }
  }
  head.add(hat);
  return hat;
}
