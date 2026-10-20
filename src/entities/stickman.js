import * as THREE from 'three';

// The stick figure used for the player, every NPC, and remote co-op players.
// Faces +Z. Rotate the returned `group` around Y to turn it.
//
// const s = createStickman({ color, scale, hat, hatColor, skin, build });
//   skin:  optional head color (defaults to the body color — classic stick figure)
//   build: one of BUILDS keys ('average', 'scrawny', 'lanky', 'chonky', 'shrimp')
// lookToStickman(look) turns a saved state.p.look into createStickman options.
// s.animate(dt, speed, { aim, airborne })  // call every frame
// s.punch(dur?, style?)                    // play a swing ('jab','cross','hook','uppercut','slash','overhead','kick','heavy','slam')
// s.windup(dur, style?, glowColor?)        // telegraph pose before an attack (s.cancelWindup())
// s.setBlock(on) / s.roll(dur) / s.hitReact(side)   // guard pose, dodge roll, flinch
// s.setDead(true, { fall: true }?)         // ragdoll-ish flop (animated with fall:true)
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

// Body shapes for the character creator. h = overall height scale, g = limb girth, t = torso girth.
export const BUILDS = {
  average: { label: 'Average Joe', h: 1, g: 1, t: 1 },
  scrawny: { label: 'Twig', h: 0.98, g: 0.65, t: 0.7 },
  lanky:   { label: 'Lanky Boi', h: 1.12, g: 0.8, t: 0.85 },
  chonky:  { label: 'Absolute Unit', h: 0.96, g: 1.6, t: 2.1 },
  shrimp:  { label: 'Fun Size', h: 0.84, g: 1.05, t: 1.1 },
};

export function lookToStickman(look = {}) {
  return {
    color: look?.color ?? 0x141414,
    skin: look?.skin ?? null,
    hat: look?.hat ?? null,
    hatColor: look?.hatColor ?? 0x2a2420,
    build: look?.build ?? 'average',
  };
}

// rim: optional { color, strength } fresnel edge light (used for the local player so
// they read at a glance against a crowd of identical black stick figures).
export function createStickman({ color = 0x141414, scale = 1, hat = null, hatColor = 0x3a2a1a, eyes = true, skin = null, build = null, rim = null } = {}) {
  const g = geos();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.08 });
  const headMat = skin != null ? new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7, metalness: 0.02 }) : mat;
  const rimU = rim ? { uRimCol: { value: new THREE.Color(rim.color ?? 0xffe2b8) }, uRim: { value: rim.strength ?? 0.5 } } : null;
  if (rimU) for (const m of new Set([mat, headMat])) addRim(m, rimU);
  const B = BUILDS[build] || BUILDS.average;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale * B.h);
  root.add(body);

  const hips = new THREE.Group();
  hips.position.y = 0.95;
  body.add(hips);
  const torso = new THREE.Mesh(g.torso, mat);
  torso.scale.set(B.t, 1, B.t * 0.9);
  hips.add(torso);
  const neck = new THREE.Group();
  neck.position.y = 0.62;
  hips.add(neck);
  const head = new THREE.Mesh(g.head, headMat);
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
    const um = new THREE.Mesh(g.limb, mat); um.scale.set(B.g, 1, B.g); upper.add(um);
    const lower = new THREE.Group();
    lower.position.y = -0.45;
    upper.add(lower);
    const lm = new THREE.Mesh(g.limb, mat); lm.scale.set(B.g, 1, B.g); lower.add(lm);
    const end = new THREE.Group();
    end.position.y = -0.47;
    lower.add(end);
    return { upper, lower, end };
  }
  const sw0 = Math.max(0, B.t - 1) * 0.07; // wider shoulders/hips for bigger torsos
  const armL = limb(neck, 0.07 + sw0, 0);
  const armR = limb(neck, -0.07 - sw0, 0);
  const legL = limb(hips, 0.09 + sw0 * 0.6, 0);
  const legR = limb(hips, -0.09 - sw0 * 0.6, 0);

  let hatG = null;
  if (hat) { hatG = addHat(head, hat, hatColor); if (rimU) hatG.traverse((o) => { if (o.isMesh) addRim(o.material, rimU); }); }
  // how far a hat sticks out above the skull (the roll lifts the body by this when upside down)
  const hatExtra = hat ? ({ tophat: 0.37, fedora: 0.19, cop: 0.17, hardhat: 0.15, cap: 0.13, beanie: 0.15, crown: 0.12 }[hat] ?? 0.14) : 0;
  // knocked flat: the hat tips forward over the face instead of its brim cutting into the floor
  const tipHat = (on) => {
    if (!hatG) return;
    const a = on ? 1.1 : 0;
    hatG.rotation.x = a; hatG.position.set(0, 0.14 * Math.cos(a), 0.14 * Math.sin(a));
  };

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

  // 'YXZ' so a horizontal arm can sweep around the vertical axis (hooks/slashes).
  // Identical to the default order whenever rotation.y is 0.
  armL.upper.rotation.order = 'YXZ';
  armR.upper.rotation.order = 'YXZ';
  const baseScale = body.scale.x;

  const st = {
    phase: Math.random() * 10, punch: 0, punchDur: 0.28, dead: false, flash: 0,
    style: null, wind: 0, windDur: 0, windStyle: null, block: false, blockK: 0,
    roll: 0, rollDur: 0.4, hit: 0, hitSide: 0, tele: 0, teleCol: new THREE.Color(1, 0.45, 0),
    fall: null, // { k, dir:+1 down / -1 up, dur }
    opacity: 1,
  };
  const baseEmissive = new THREE.Color(0x000000);
  const _c = new THREE.Color();

  function setEmissive(c) { mat.emissive.copy(c); if (headMat !== mat) headMat.emissive.copy(c); }

  function animate(dt, speed = 0, opts = {}) {
    if (st.flash > 0) {
      st.flash -= dt;
      mat.emissive.setRGB(Math.max(0, st.flash) * 3, 0, 0);
      if (headMat !== mat) headMat.emissive.copy(mat.emissive);
      if (st.flash <= 0) setEmissive(baseEmissive);
    } else if (st.tele > 0) {
      // attack telegraph: pulsing glow that speeds up as the hit gets close
      st.tele -= dt;
      const pulse = 0.55 + 0.45 * Math.sin(st.tele * 38);
      setEmissive(_c.copy(st.teleCol).multiplyScalar(st.tele > 0 ? 0.6 * pulse : 0));
    }
    // animated knockdown / get-up (only when asked for with setDead(on, { fall: true }))
    if (st.fall) {
      const f = st.fall;
      f.k = Math.min(1, f.k + dt / f.dur);
      const e = f.dir > 0 ? f.k * f.k : 1 - (1 - f.k) * (1 - f.k);
      const amt = f.dir > 0 ? e : 1 - e;
      body.rotation.x = -Math.PI / 2 * amt;
      body.position.y = deadY * amt;
      if (f.k >= 1) st.fall = null;
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
    // guard: forearms up in front of the face
    const bk = st.blockK = st.blockK + ((st.block ? 1 : 0) - st.blockK) * Math.min(1, dt * 18);
    if (bk > 0.01) {
      const mix = (a, b) => a + (b - a) * bk;
      armL.upper.rotation.set(mix(armL.upper.rotation.x, -1.25), 0, mix(armL.upper.rotation.z, -0.55));
      armL.lower.rotation.x = mix(armL.lower.rotation.x, -1.9);
      armR.upper.rotation.set(mix(armR.upper.rotation.x, -1.25), 0, mix(armR.upper.rotation.z, 0.55));
      armR.lower.rotation.x = mix(armR.lower.rotation.x, -1.9);
      torso.rotation.x += 0.12 * bk;
      hips.position.y -= 0.05 * bk;
    }

    let twist = 0;
    if (st.wind > 0) {
      // wind-up / telegraph: cock the arm (or leg) back and tremble right before release
      st.wind -= dt;
      const k = 1 - Math.max(0, st.wind) / st.windDur;
      const e = Math.min(1, k * 3);
      const tr = k > 0.6 ? Math.sin(st.wind * 70) * 0.05 : 0;
      const ws = st.windStyle || opts.swingStyle;
      if (ws === 'overhead' || ws === 'slam') {
        armR.upper.rotation.set(-2.85 * e + tr, 0, -0.15);
        armR.lower.rotation.x = -0.5 * e;
        if (ws === 'slam') { armL.upper.rotation.set(-2.85 * e + tr, 0, 0.15); armL.lower.rotation.x = -0.5 * e; }
        torso.rotation.x -= 0.2 * e;
      } else if (ws === 'kick') {
        legR.upper.rotation.x = 0.55 * e; legR.lower.rotation.x = 0.9 * e;
        torso.rotation.x += 0.15 * e;
      } else if (ws === 'charge') {
        torso.rotation.x += 0.55 * e;
        armL.upper.rotation.set(0.7 * e, 0, 0.4); armR.upper.rotation.set(0.7 * e, 0, -0.4);
        hips.position.y -= 0.12 * e;
        legL.upper.rotation.x = -0.5 * e; legL.lower.rotation.x = 0.7 * e;
      } else if (ws === 'taser') {
        armR.upper.rotation.set(-Math.PI / 2 + tr, 0, -0.05);
        armR.lower.rotation.x = 0;
      } else {
        armR.upper.rotation.set(0.55 * e + tr, 0, -0.55 * e);
        armR.lower.rotation.x = -1.9 * e;
        armL.upper.rotation.set(-0.9 * e, 0, -0.2);
        armL.lower.rotation.x = -1.6 * e;
        twist = 0.45 * e;
        hips.position.y -= 0.06 * e;
      }
      if (st.wind <= 0) st.windStyle = null;
    }

    if (st.punch > 0) {
      st.punch -= dt;
      const t = 1 - Math.max(0, st.punch) / st.punchDur;
      const ext = Math.sin(t * Math.PI);
      const style = st.style || opts.swingStyle;
      switch (style) {
        case 'overhead':
        case 'slam':
          armR.upper.rotation.set(-2.6 + t * 2.4, 0, -0.1);
          armR.lower.rotation.x = -0.3;
          if (style === 'slam') { armL.upper.rotation.set(-2.6 + t * 2.4, 0, 0.1); armL.lower.rotation.x = -0.3; }
          torso.rotation.x += 0.3 * ext;
          break;
        case 'cross':
          armL.upper.rotation.set(-1.55 * ext - (1 - ext) * 0.2, 0, -0.1 * ext + 0.18 * (1 - ext));
          armL.lower.rotation.x = -0.6 * (1 - ext);
          twist = 0.4 * ext;
          break;
        case 'hook':
        case 'slash': {
          const sweep = style === 'slash' ? 2.2 : 1.7;
          armR.upper.rotation.set(-1.45 * Math.min(1, ext * 2), -1.25 + sweep * t, -0.1);
          armR.lower.rotation.x = style === 'slash' ? -0.15 : -0.9;
          twist = -0.55 + 1.0 * t;
          break;
        }
        case 'uppercut':
          armR.upper.rotation.set(0.3 - 2.6 * t, 0, -0.15);
          armR.lower.rotation.x = -1.4 + 0.6 * ext;
          torso.rotation.x -= 0.25 * ext;
          hips.position.y += 0.08 * ext;
          twist = -0.3 * ext;
          break;
        case 'kick':
          legR.upper.rotation.x = -1.55 * ext;
          legR.lower.rotation.x = 0.9 * (1 - ext);
          legL.upper.rotation.x = 0.1 * ext; legL.lower.rotation.x = 0.15 * ext;
          torso.rotation.x -= 0.3 * ext;
          armL.upper.rotation.set(-0.5 * ext, 0, 0.6); armR.upper.rotation.set(0.3 * ext, 0, -0.7);
          break;
        case 'heavy':
          armR.upper.rotation.set(-1.6 * ext - (1 - ext) * 0.2, 0.15 * ext, -0.12);
          armR.lower.rotation.x = -0.4 * (1 - ext);
          torso.rotation.x += 0.25 * ext;
          twist = -0.6 * ext;
          break;
        default:
          armR.upper.rotation.set(-1.55 * ext - (1 - ext) * 0.2, 0.25 * ext, -0.12);
          armR.lower.rotation.x = -0.6 * (1 - ext);
          twist = -0.35 * ext;
      }
      if (st.punch <= 0) st.style = null;
    }
    torso.rotation.y = twist;

    // flinch: head snaps back, torso rocks
    if (st.hit > 0) {
      st.hit -= dt;
      const k = Math.max(0, st.hit) / 0.24;
      const e = Math.sin(k * Math.PI * 0.5);
      torso.rotation.x -= 0.4 * e;
      torso.rotation.z = 0.25 * e * st.hitSide;
      neck.rotation.x = -0.45 * e;
      if (st.hit <= 0) { torso.rotation.z = 0; neck.rotation.x = 0; }
    }

    // keep both feet on or above the floor: if a pose lowers the hips more than the
    // legs can reach, bend the knees (crouch) instead of sinking the feet into the ground
    if (!opts.airborne && st.roll <= 0 && !st.fall) { footClear(legL); footClear(legR); }

    // dodge roll: tuck, shrink a touch and tumble forward around the hips (never through the floor)
    if (st.roll > 0) {
      st.roll -= dt;
      const k = Math.min(1, 1 - Math.max(0, st.roll) / st.rollDur);
      const th = k * Math.PI * 2;
      const sq = 1 - 0.4 * Math.sin(k * Math.PI);
      const S = baseScale * sq;
      body.scale.setScalar(S);
      legL.upper.rotation.x = legR.upper.rotation.x = -1.7 * Math.sin(k * Math.PI);
      legL.lower.rotation.x = legR.lower.rotation.x = 2.3 * Math.sin(k * Math.PI);
      armL.upper.rotation.set(-1.2, 0, 0.3); armR.upper.rotation.set(-1.2, 0, -0.3);
      armL.lower.rotation.x = armR.lower.rotation.x = -1.6;
      neck.rotation.x = 0.9 * Math.sin(k * Math.PI);
      hips.position.y = 0.95;
      body.rotation.x = th;
      body.position.set(0, 0.95 * S * (1 - Math.cos(th)) + 0.055 + hatExtra * S * Math.max(0, -Math.cos(th)), -0.95 * S * Math.sin(th));
      if (st.roll <= 0) {
        body.scale.setScalar(baseScale); body.rotation.x = 0; body.position.set(0, 0, 0); neck.rotation.x = 0;
      }
    }
  }

  // Vertical reach of a leg below the hips (body-local units), from its two joint angles.
  function legDrop(leg) {
    const a = leg.upper.rotation.x, b = a + leg.lower.rotation.x;
    return 0.45 * Math.cos(a) + 0.485 * Math.cos(b);
  }
  function footClear(leg) {
    for (let i = 0; i < 8 && legDrop(leg) > hips.position.y - 0.012; i++) { leg.upper.rotation.x -= 0.07; leg.lower.rotation.x += 0.14; }
  }

  // style: optional swing style ('jab','cross','hook','uppercut','slash','overhead','kick','heavy','slam');
  // falls back to animate()'s opts.swingStyle.
  function punch(duration = 0.28, style = null) { st.punch = duration; st.punchDur = duration; st.style = style; st.wind = 0; }
  function flash() { st.flash = 0.18; }
  // Wind-up pose held for `duration` seconds (telegraphs an attack). color: optional glow (THREE color / hex).
  function windup(duration = 0.4, style = null, color = null) {
    st.wind = duration; st.windDur = Math.max(0.05, duration); st.windStyle = style;
    if (color != null) { st.teleCol.set(color); st.tele = duration; }
  }
  // keep holding a wind-up that's already playing (charged attacks)
  function extendWindup(sec = 0.3) { if (st.wind > 0) st.wind = Math.max(st.wind, Math.min(sec, st.windDur * 0.35)); }
  function cancelWindup() { st.wind = 0; st.tele = 0; st.windStyle = null; if (st.flash <= 0) setEmissive(baseEmissive); }
  function setBlock(on) { st.block = !!on; }
  function roll(duration = 0.4) { st.roll = duration; st.rollDur = duration; }
  function hitReact(side = 0) { st.hit = 0.24; st.hitSide = side; }
  // opts.fall: animate the flop / getting back up instead of snapping.
  // Lying on the back: the hips sit just high enough for the torso, the chin is
  // tucked so the round head rests on (not in) the floor, limbs splay flat.
  const deadY = 0.08 * B.t * 0.9 * body.scale.x + 0.03;
  function setDead(on, opts = null) {
    st.dead = on;
    if (st.roll > 0) { st.roll = 0; body.scale.setScalar(baseScale); }
    st.wind = 0; st.block = false; st.blockK = 0;
    if (opts?.fall) {
      st.fall = { k: 0, dir: on ? 1 : -1, dur: on ? 0.32 : 0.42 };
    } else {
      st.fall = null;
      body.rotation.x = on ? -Math.PI / 2 : 0;
      body.position.y = on ? deadY : 0;
    }
    if (on) {
      armL.upper.rotation.set(-0.42, 0, 1.2); armR.upper.rotation.set(-0.4, 0, -1.3);
      armL.lower.rotation.x = -0.15; armR.lower.rotation.x = -0.15;
      legL.upper.rotation.set(-0.14, 0, 0.25); legR.upper.rotation.set(-0.1, 0, -0.2);
      legL.lower.rotation.x = 0.12; legR.lower.rotation.x = 0.1;
      torso.rotation.set(0, 0, 0);
      // head radius ~0.21: tuck the chin so the skull rests on the floor
      const lift = Math.max(0, 0.215 * body.scale.x - deadY);
      neck.rotation.x = Math.min(0.9, Math.asin(Math.min(1, lift / (0.27 * body.scale.x))));
      tipHat(true);
    } else { neck.rotation.x = 0; tipHat(false); }
  }
  function setColor(c) { mat.color.set(c); }
  function dispose() {
    mat.dispose();
    if (headMat !== mat) headMat.dispose();
    root.traverse((o) => { if (o.isMesh && o.material?.userData?.stickOwned) o.material.dispose(); });
    root.removeFromParent();
  }

  return {
    group: root, body, mat, headMat,
    parts: { hips, torso, neck, head, armL, armR, legL, legR },
    rightHand: armR.end, leftHand: armL.end,
    animate, punch, flash, setDead, setColor, dispose,
    setRim(k) { st.rim = k; if (rimU) rimU.uRim.value = k * st.opacity * st.opacity; },
    // 0..1 see-through (camera pressed against the player). Eyes hide when faded.
    setOpacity(a) {
      a = Math.max(0, Math.min(1, a));
      if (Math.abs(a - st.opacity) < 0.01) return;
      const was = st.opacity < 0.999;
      st.opacity = a;
      if (rimU) rimU.uRim.value = (st.rim ?? rimU.uRim.value) * a * a;
      const fade = a < 0.999;
      root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.material === eyeMat) { o.visible = a > 0.6; return; }
        const m = o.material;
        if (m !== mat && m !== headMat && !m.userData?.stickOwned) return; // weapons etc. may share materials
        if (fade !== was) { m.transparent = fade; m.depthWrite = !fade; m.needsUpdate = true; }
        m.opacity = a;
      });
    },
    windup, extendWindup, cancelWindup, setBlock, roll, hitReact,
    get dead() { return st.dead; },
    get rolling() { return st.roll > 0; },
  };
}

// Fresnel rim light injected into a standard material (shared uniforms).
function addRim(m, U) {
  if (m.userData.rim) return;
  m.userData.rim = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimCol; uniform float uRim;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float rf = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0); totalEmissiveRadiance += uRimCol * (pow(rf, 3.0) * uRim); }');
  };
  m.customProgramCacheKey = () => 'stickrim';
  m.needsUpdate = true;
}

export const HAT_TYPES = ['fedora', 'cap', 'beanie', 'tophat', 'hardhat', 'cop', 'crown'];

function addHat(head, type, color) {
  const g = geos();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  m.userData.stickOwned = true;
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
      c.material.userData.stickOwned = true;
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
