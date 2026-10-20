import * as THREE from 'three';

// The stick figure used for the player, every NPC, and remote co-op players.
// Faces +Z. Rotate the returned `group` around Y to turn it.
//
// const s = createStickman({ color, scale, hat, hatColor, skin, build });
//   skin:  optional head color (defaults to the body color — classic stick figure)
//   build: one of BUILDS keys ('average', 'scrawny', 'lanky', 'chonky', 'shrimp')
// lookToStickman(look) turns a saved state.p.look into createStickman options.
// s.animate(dt, speed, { aim, airborne, swingStyle, stance })  // call every frame
//                                          // stance 0..1: loose fight stance (also auto-on for a few s after any fight action)
// s.punch(dur?, style?)                    // play a swing ('jab','cross','hook','uppercut','slash','overhead','kick','heavy','slam')
// s.windup(dur, style?, glowColor?)        // telegraph pose before an attack (s.cancelWindup()); style 'taser' = draw + braced aim
// s.setBlock(on) / s.roll(dur) / s.hitReact(side, power?)   // guard pose, dodge roll, flinch (power 0..1 -> stagger)
// s.shock(dur)                             // electrocuted: rigid twitching + blue strobe
// Poses blend: actions/flinches ease in and out on top of the locomotion cycle (no snapping),
// swings have anticipation + follow-through, and the body leans into acceleration and turns.
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

// Pose channels (see animate): arm upper x/y/z + elbow, leg upper x/z + knee, torso x/y/z, neck x, hips y/z.
const AL_X = 0, AL_Y = 1, AL_Z = 2, AL_L = 3, AR_X = 4, AR_Y = 5, AR_Z = 6, AR_L = 7;
const LL_X = 8, LL_Z = 9, LL_L = 10, LR_X = 11, LR_Z = 12, LR_L = 13;
const T_X = 14, T_Y = 15, T_Z = 16, N_X = 17, H_Y = 18, H_Z = 19, NCH = 20;
const smooth01 = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
// Strike extension over a swing (t 0..1): a little pull-back (anticipation), a fast snap out
// that overshoots, a held follow-through, then an eased return. Peaks ~0.35-0.5 where hits land.
function strikeCurve(t) {
  if (t < 0.15) return -0.22 * Math.sin((t / 0.15) * Math.PI * 0.5);
  if (t < 0.36) { const u = (t - 0.15) / 0.21; return -0.22 + 1.27 * (1 - (1 - u) * (1 - u) * (1 - u)); }
  if (t < 0.56) return 1.05 - 0.1 * ((t - 0.36) / 0.2);
  return 0.95 * (1 - smooth01((t - 0.56) / 0.44));
}
// Progress of a sweeping swing (hooks, overheads, uppercuts): wind back a hair, whip through, hold.
function sweepCurve(t) {
  if (t < 0.15) return -0.1 * Math.sin((t / 0.15) * Math.PI * 0.5);
  if (t < 0.42) { const u = (t - 0.15) / 0.27; return -0.1 + 1.1 * (1 - (1 - u) * (1 - u)); }
  return 1;
}

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
    roll: 0, rollDur: 0.4, hit: 0, hitDur: 0.24, hitSide: 0, hitPow: 0.4, tele: 0, teleCol: new THREE.Color(1, 0.45, 0),
    fall: null, // { k, dir:+1 down / -1 up, dur }
    opacity: 1,
    // animation layer: smoothed locomotion, fight stance, shock
    spd: 0, prevSpd: 0, acc: 0, turn: 0, lastYaw: null, fightT: 0, fightK: 0, shock: 0, shockDur: 0, needSync: true, clock: Math.random() * 10,
  };
  const baseEmissive = new THREE.Color(0x000000);
  const _c = new THREE.Color();

  function setEmissive(c) { mat.emissive.copy(c); if (headMat !== mat) headMat.emissive.copy(c); }

  // ---- pose channels -----------------------------------------------------------------------
  // Every frame the figure computes a BASE pose (locomotion + fight stance, continuous by
  // construction), an ACTION pose for the limbs an action owns (swing, wind-up, guard, aim,
  // shock, jump) and ADDITIVE layers (flinch, leans). The action/additive part is kept as an
  // offset from the base that eases toward its target, so poses blend instead of snapping
  // while the walk cycle itself stays crisp.
  const PB = new Float32Array(NCH), PA = new Float32Array(NCH), PX = new Float32Array(NCH), PO = new Float32Array(NCH);
  const PM = new Uint8Array(NCH);
  

  function readParts(out) {
    out[AL_X] = armL.upper.rotation.x; out[AL_Y] = armL.upper.rotation.y; out[AL_Z] = armL.upper.rotation.z; out[AL_L] = armL.lower.rotation.x;
    out[AR_X] = armR.upper.rotation.x; out[AR_Y] = armR.upper.rotation.y; out[AR_Z] = armR.upper.rotation.z; out[AR_L] = armR.lower.rotation.x;
    out[LL_X] = legL.upper.rotation.x; out[LL_Z] = legL.upper.rotation.z; out[LL_L] = legL.lower.rotation.x;
    out[LR_X] = legR.upper.rotation.x; out[LR_Z] = legR.upper.rotation.z; out[LR_L] = legR.lower.rotation.x;
    out[T_X] = torso.rotation.x; out[T_Y] = torso.rotation.y; out[T_Z] = torso.rotation.z; out[N_X] = neck.rotation.x;
    out[H_Y] = hips.position.y; out[H_Z] = hips.position.z;
  }
  function writeParts(v) {
    armL.upper.rotation.set(v[AL_X], v[AL_Y], v[AL_Z]); armL.lower.rotation.x = v[AL_L];
    armR.upper.rotation.set(v[AR_X], v[AR_Y], v[AR_Z]); armR.lower.rotation.x = v[AR_L];
    legL.upper.rotation.x = v[LL_X]; legL.upper.rotation.z = v[LL_Z]; legL.lower.rotation.x = v[LL_L];
    legR.upper.rotation.x = v[LR_X]; legR.upper.rotation.z = v[LR_Z]; legR.lower.rotation.x = v[LR_L];
    torso.rotation.x = v[T_X]; torso.rotation.y = v[T_Y]; torso.rotation.z = v[T_Z]; neck.rotation.x = v[N_X];
    hips.position.y = v[H_Y]; hips.position.z = v[H_Z];
  }
  const _v = new Float32Array(NCH);
  // action helpers: set an absolute target for a channel (blended with weight w over the base / earlier actions)
  function act(ch, val, w = 1) {
    const from = PM[ch] ? PA[ch] : PB[ch];
    PA[ch] = w >= 1 ? val : from + (val - from) * w;
    PM[ch] = 1;
  }
  function armTo(L, x, y, z, low, w = 1) {
    if (L) { act(AL_X, x, w); act(AL_Y, y, w); act(AL_Z, z, w); act(AL_L, low, w); }
    else { act(AR_X, x, w); act(AR_Y, y, w); act(AR_Z, z, w); act(AR_L, low, w); }
  }

  function animate(dt, speed = 0, opts = {}) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    if (st.flash > 0) {
      st.flash -= dt;
      mat.emissive.setRGB(Math.max(0, st.flash) * 3, 0, 0);
      if (headMat !== mat) headMat.emissive.copy(mat.emissive);
      if (st.flash <= 0) setEmissive(baseEmissive);
    } else if (st.shock > 0) {
      // electrocuted: cold blue strobe
      const on = Math.random() < 0.55;
      setEmissive(_c.setRGB(on ? 0.25 : 0.04, on ? 0.6 : 0.12, on ? 1.4 : 0.3));
      if (st.shock - dt <= 0) setEmissive(baseEmissive);
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
    if (dt <= 0) return;
    st.clock += dt;

    // ---- smoothed locomotion signals (accel lean, turn lean)
    const spdK = 1 - Math.exp(-(speed > st.spd ? 9 : 7) * dt);
    st.prevSpd = st.spd;
    st.spd += (speed - st.spd) * spdK;
    const accRaw = (st.spd - st.prevSpd) / dt;
    st.acc += (accRaw - st.acc) * (1 - Math.exp(-8 * dt));
    const yaw = root.rotation.y;
    if (st.lastYaw == null) st.lastYaw = yaw;
    let dy = yaw - st.lastYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    st.lastYaw = yaw;
    const yr = Math.max(-12, Math.min(12, dy / dt));
    st.turn += (yr - st.turn) * (1 - Math.exp(-10 * dt));

    const s = Math.min(st.spd / 6, 1.5), s1 = Math.min(s, 1);
    st.phase += dt * (2.5 + st.spd * 1.5);
    const sw = Math.sin(st.phase) * 0.85 * Math.min(s, 1.1);

    // fight stance: on while asked for (opts.stance) or for a few seconds after any fight action
    st.fightT -= dt;
    const fightWant = Math.max(opts.stance != null ? Number(opts.stance) || 0 : 0, st.fightT > 0 ? 1 : 0) * (opts.aim ? 0 : 1);
    st.fightK += (fightWant - st.fightK) * (1 - Math.exp(-(fightWant > st.fightK ? 6 : 2.5) * dt));
    const k = st.fightK, kl = k * (1 - 0.75 * s1);

    // ---- BASE: locomotion (+ stance)
    PB[LL_X] = sw; PB[LR_X] = -sw; PB[LL_Z] = 0; PB[LR_Z] = 0;
    PB[LL_L] = Math.max(0, Math.sin(st.phase + 0.6)) * 1.1 * s1;
    PB[LR_L] = Math.max(0, -Math.sin(st.phase + 0.6)) * 1.1 * s1;
    PB[H_Y] = 0.95 + Math.abs(Math.sin(st.phase)) * 0.05 * s1 + (s < 0.05 ? Math.sin(st.phase * 0.6) * 0.008 : 0);
    PB[H_Z] = 0;
    // run lean + acceleration lean (lean in when speeding up, rock back when braking)
    const accLean = Math.max(-0.16, Math.min(0.2, st.acc * 0.018)) * Math.min(1, 0.4 + s);
    PB[T_X] = 0.08 * Math.min(s, 1.2) + accLean;
    PB[T_Y] = 0;
    // bank into turns while moving
    PB[T_Z] = Math.max(-0.16, Math.min(0.16, -st.turn * 0.035 * s1));
    PB[N_X] = -accLean * 0.5;
    // arms swing opposite to legs, splayed a bit so they don't clip the torso
    PB[AL_X] = -sw * 0.8; PB[AL_Y] = 0; PB[AL_Z] = 0.18; PB[AL_L] = -0.25 - 0.2 * s1;
    PB[AR_X] = sw * 0.8; PB[AR_Y] = 0; PB[AR_Z] = -0.18; PB[AR_L] = -0.25 - 0.2 * s1;
    if (k > 0.01) {
      // loose guard: fists up, knees soft, a little bounce and sway
      const bob = Math.sin(st.clock * 4.6), sway = Math.sin(st.clock * 2.1);
      const mix = (ch, v, w) => { PB[ch] += (v - PB[ch]) * w; };
      mix(AL_X, -0.95 + bob * 0.05 - sw * 0.25, k); mix(AL_Z, -0.02, k); mix(AL_L, -1.75 + bob * 0.06, k);
      mix(AR_X, -0.62 - bob * 0.04 + sw * 0.25, k); mix(AR_Z, 0.1, k); mix(AR_L, -1.95, k);
      mix(LL_X, -0.3, kl); mix(LR_X, 0.24, kl);
      PB[LL_Z] += 0.07 * kl; PB[LR_Z] -= 0.07 * kl;
      PB[LL_L] += 0.25 * kl; PB[LR_L] += 0.3 * kl;
      PB[H_Y] -= (0.065 - bob * 0.014) * kl;
      PB[T_X] += 0.13 * k; PB[T_Y] += 0.16 * kl; PB[T_Z] += sway * 0.035 * k;
      PB[N_X] -= 0.08 * k;
    }

    if (st.needSync) {
      // resume from whatever the limbs are doing now (after a roll / getting up / first frame)
      st.needSync = false;
      readParts(_v);
      for (let i = 0; i < NCH; i++) PO[i] = _v[i] - PB[i];
      if (!isFinite(PO[0])) PO.fill(0);
    }

    // ---- ACTIONS + ADDITIVE layers
    PM.fill(0); PX.fill(0);
    let rate = 10;
    if (opts.airborne) {
      act(LL_X, -0.6); act(LR_X, 0.3); act(LL_L, 0.9); act(LR_L, 0.6);
      rate = 14;
    }
    if (opts.aim) {
      armTo(false, -Math.PI / 2 + 0.05, 0, -0.05, 0);
      armTo(true, -Math.PI / 2 + 0.25, 0, -0.45, -0.3);
      rate = Math.max(rate, 18);
    }
    // guard: forearms up in front of the face
    const bk = st.blockK = st.blockK + ((st.block ? 1 : 0) - st.blockK) * Math.min(1, dt * 18);
    if (bk > 0.01) {
      armTo(true, -1.25, 0, -0.55, -1.9, bk);
      armTo(false, -1.25, 0, 0.55, -1.9, bk);
      PX[T_X] += 0.12 * bk; PX[H_Y] -= 0.05 * bk; PX[N_X] += 0.12 * bk;
      rate = Math.max(rate, 16);
    }

    if (st.wind > 0) {
      // wind-up / telegraph: cock the arm (or leg) back and tremble right before release
      st.wind -= dt;
      const kk = 1 - Math.max(0, st.wind) / st.windDur;
      const e = 1 - Math.pow(1 - Math.min(1, kk * 3), 2);
      const tr = kk > 0.6 ? Math.sin(st.wind * 70) * 0.05 : 0;
      const ws = st.windStyle || opts.swingStyle;
      if (ws === 'overhead' || ws === 'slam') {
        armTo(false, -2.85 * e + tr, 0, -0.15, -0.5 * e);
        if (ws === 'slam') armTo(true, -2.85 * e + tr, 0, 0.15, -0.5 * e);
        PX[T_X] -= 0.2 * e; PX[H_Z] -= 0.05 * e;
      } else if (ws === 'kick') {
        act(LR_X, 0.55 * e); act(LR_L, 0.9 * e);
        PX[T_X] += 0.15 * e;
      } else if (ws === 'charge') {
        PX[T_X] += 0.55 * e;
        armTo(true, 0.7 * e, 0, 0.4, PB[AL_L]); armTo(false, 0.7 * e, 0, -0.4, PB[AR_L]);
        PX[H_Y] -= 0.12 * e;
        act(LL_X, -0.5 * e); act(LL_L, 0.7 * e);
      } else if (ws === 'taser') {
        // draw from the hip, then a braced two-hand aim that shakes as it charges
        const raise = Math.min(1, kk * 3.2);
        const r = raise * raise * (3 - 2 * raise);
        armTo(false, -0.35 - (Math.PI / 2 - 0.4) * r + tr, 0, -0.05 - 0.2 * (1 - r), -0.9 * (1 - r));
        armTo(true, -0.6 - (Math.PI / 2 - 0.85) * r + tr * 0.6, 0, -0.45 * r, -0.3 - 0.9 * (1 - r));
        PX[T_X] -= 0.05 * r; PX[T_Y] -= 0.12 * r;
        act(LL_X, -0.32 * r); act(LR_X, 0.26 * r); PX[H_Y] -= 0.04 * r;
      } else {
        armTo(false, 0.55 * e + tr, 0, -0.55 * e, -1.9 * e);
        armTo(true, -0.9 * e, 0, -0.2, -1.6 * e);
        PX[T_Y] += 0.45 * e;
        PX[H_Y] -= 0.06 * e; PX[H_Z] -= 0.04 * e;
      }
      rate = Math.max(rate, 18);
      if (st.wind <= 0) st.windStyle = null;
    }

    if (st.punch > 0) {
      st.punch -= dt;
      const t = 1 - Math.max(0, st.punch) / st.punchDur;
      const ext = strikeCurve(t), p = sweepCurve(t);
      // fade the swing out over the back half so the arm settles instead of snapping home
      const w = t < 0.55 ? 1 : 1 - smooth01((t - 0.55) / 0.45);
      const pe = Math.max(0, ext);
      const style = st.style || opts.swingStyle;
      let twist = 0;
      switch (style) {
        case 'overhead':
        case 'slam':
          armTo(false, -2.6 + p * 2.4, 0, -0.1, -0.3, w);
          if (style === 'slam') armTo(true, -2.6 + p * 2.4, 0, 0.1, -0.3, w);
          PX[T_X] += 0.3 * pe * w;
          break;
        case 'cross':
          armTo(true, -1.55 * ext - (1 - ext) * 0.2, 0, -0.1 * ext + 0.18 * (1 - ext), -0.6 * (1 - pe), w);
          armTo(false, -0.9, 0, 0.1, -1.8, w * 0.7); // other hand stays home to guard
          twist = 0.4 * ext;
          break;
        case 'hook':
        case 'slash': {
          const sweep = style === 'slash' ? 2.2 : 1.7;
          armTo(false, -1.45 * Math.min(1, Math.max(0, p) * 2 + 0.1), -1.25 + sweep * p, -0.1, style === 'slash' ? -0.15 : -0.9, w);
          twist = -0.55 + 1.0 * p;
          break;
        }
        case 'uppercut':
          armTo(false, 0.3 - 2.6 * Math.max(0, p) + (p < 0 ? -p * 1.5 : 0), 0, -0.15, -1.4 + 0.6 * pe, w);
          PX[T_X] -= 0.25 * pe * w; PX[H_Y] += 0.08 * pe * w - (p < 0 ? 0.5 * -p : 0); // dip, then drive up
          twist = -0.3 * ext;
          break;
        case 'kick':
          act(LR_X, -1.55 * ext, w); act(LR_L, 0.9 * (1 - pe), w);
          act(LL_X, 0.1 * pe, w); act(LL_L, 0.15 * pe, w);
          PX[T_X] -= 0.3 * pe * w;
          armTo(true, -0.5 * pe, 0, 0.6, -0.6, w); armTo(false, 0.3 * pe, 0, -0.7, -0.6, w);
          break;
        case 'heavy':
          armTo(false, -1.6 * ext - (1 - ext) * 0.2, 0.15 * pe, -0.12, -0.4 * (1 - pe), w);
          PX[T_X] += 0.25 * pe * w;
          twist = -0.6 * ext;
          break;
        default:
          armTo(false, -1.55 * ext - (1 - ext) * 0.2, 0.25 * pe, -0.12, -0.6 * (1 - pe), w);
          armTo(true, -0.85, 0, 0.05, -1.8, w * 0.6);
          twist = -0.35 * ext;
      }
      PX[T_Y] += twist * w;
      // weight transfer: hips drive forward into the hit, a touch of lean
      if (style !== 'kick') { PX[H_Z] += 0.07 * pe * w; PX[T_X] += 0.06 * pe * w; act(LL_X, -0.28, w * 0.8); act(LR_X, 0.2, w * 0.8); }
      rate = Math.max(rate, 30);
      if (st.punch <= 0) st.style = null;
    }

    // electrocuted: rigid, splayed, twitching
    if (st.shock > 0) {
      st.shock -= dt;
      const j = () => (Math.random() - 0.5) * 0.3;
      const ramp = Math.min(1, st.shock / 0.12); // let go at the very end
      armTo(true, -0.5 + j(), j() * 0.5, 1.0 + j(), -0.15 + j(), ramp);
      armTo(false, -0.5 + j(), j() * 0.5, -1.0 + j(), -0.15 + j(), ramp);
      act(LL_X, 0.12 + j(), ramp); act(LR_X, -0.12 + j(), ramp); act(LL_L, 0.25 + j(), ramp); act(LR_L, 0.25 + j(), ramp);
      PX[T_X] += (-0.28 + j()) * ramp; PX[T_Z] += j() * 1.2 * ramp; PX[N_X] += (-0.4 + j()) * ramp; PX[H_Y] += (-0.05 + j() * 0.15) * ramp;
      rate = Math.max(rate, 40);
    }

    // flinch / stagger: head snaps back, torso rocks away from the hit, arms flung out on big ones
    if (st.hit > 0) {
      st.hit -= dt;
      const e = Math.pow(Math.max(0, st.hit) / st.hitDur, 1.3);
      const pw = st.hitPow;
      PX[T_X] -= (0.32 + 0.35 * pw) * e;
      PX[T_Z] += 0.25 * e * st.hitSide * (1 + pw);
      PX[N_X] -= 0.45 * e;
      PX[H_Z] -= 0.07 * pw * e;
      PX[H_Y] -= 0.06 * pw * e;
      PX[AL_Z] += 0.4 * pw * e; PX[AR_Z] -= 0.4 * pw * e;
      PX[AL_X] += 0.25 * pw * e; PX[AR_X] += 0.25 * pw * e;
      rate = Math.max(rate, 24);
    }

    // ---- blend offsets toward their targets and write the final pose
    const kb = 1 - Math.exp(-rate * dt);
    for (let i = 0; i < NCH; i++) {
      const tgt = (PM[i] ? PA[i] - PB[i] : 0) + PX[i];
      PO[i] += (tgt - PO[i]) * kb;
      _v[i] = PB[i] + PO[i];
    }
    writeParts(_v);

    // keep both feet on or above the floor: if a pose lowers the hips more than the
    // legs can reach, bend the knees (crouch) instead of sinking the feet into the ground
    if (!opts.airborne && st.roll <= 0 && !st.fall) { footClear(legL); footClear(legR); }

    // dodge roll: tuck, shrink a touch and tumble forward around the hips (never through the floor)
    if (st.roll > 0) {
      st.roll -= dt;
      const kr = Math.min(1, 1 - Math.max(0, st.roll) / st.rollDur);
      const th = kr * Math.PI * 2;
      const sq = 1 - 0.4 * Math.sin(kr * Math.PI);
      const S = baseScale * sq;
      body.scale.setScalar(S);
      legL.upper.rotation.x = legR.upper.rotation.x = -1.7 * Math.sin(kr * Math.PI);
      legL.lower.rotation.x = legR.lower.rotation.x = 2.3 * Math.sin(kr * Math.PI);
      armL.upper.rotation.set(-1.2, 0, 0.3); armR.upper.rotation.set(-1.2, 0, -0.3);
      armL.lower.rotation.x = armR.lower.rotation.x = -1.6;
      neck.rotation.x = 0.9 * Math.sin(kr * Math.PI);
      torso.rotation.set(0, 0, 0);
      hips.position.y = 0.95; hips.position.z = 0;
      body.rotation.x = th;
      body.position.set(0, 0.95 * S * (1 - Math.cos(th)) + 0.055 + hatExtra * S * Math.max(0, -Math.cos(th)), -0.95 * S * Math.sin(th));
      if (st.roll <= 0) {
        body.scale.setScalar(baseScale); body.rotation.x = 0; body.position.set(0, 0, 0);
        st.needSync = true; // unfold from the tuck instead of popping upright
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

  const FIGHT_HOLD = 3.5; // seconds the loose fight stance lingers after any fight action
  // style: optional swing style ('jab','cross','hook','uppercut','slash','overhead','kick','heavy','slam');
  // falls back to animate()'s opts.swingStyle.
  function punch(duration = 0.28, style = null) { st.punch = duration; st.punchDur = Math.max(0.05, duration); st.style = style; st.wind = 0; st.fightT = FIGHT_HOLD; }
  function flash() { st.flash = 0.18; }
  // Wind-up pose held for `duration` seconds (telegraphs an attack). color: optional glow (THREE color / hex).
  function windup(duration = 0.4, style = null, color = null) {
    st.wind = duration; st.windDur = Math.max(0.05, duration); st.windStyle = style; st.fightT = FIGHT_HOLD;
    if (color != null) { st.teleCol.set(color); st.tele = duration; }
  }
  // keep holding a wind-up that's already playing (charged attacks)
  function extendWindup(sec = 0.3) { if (st.wind > 0) st.wind = Math.max(st.wind, Math.min(sec, st.windDur * 0.35)); }
  function cancelWindup() { st.wind = 0; st.tele = 0; st.windStyle = null; if (st.flash <= 0 && st.shock <= 0) setEmissive(baseEmissive); }
  // guarding cuts any swing that's still animating (block-cancel out of recovery)
  function setBlock(on) { st.block = !!on; if (on) { st.punch = 0; st.style = null; st.fightT = FIGHT_HOLD; } }
  function roll(duration = 0.4) { st.roll = duration; st.rollDur = Math.max(0.05, duration); st.punch = 0; st.style = null; st.wind = 0; st.windStyle = null; st.hit = 0; }
  // side: -1/0/+1 which side got hit; power 0..1 (flinch -> stagger with a knockback lean)
  function hitReact(side = 0, power = 0.4) {
    const pw = Math.max(0, Math.min(1, Number(power) || 0));
    st.hitPow = pw; st.hitDur = 0.24 + 0.22 * pw; st.hit = st.hitDur; st.hitSide = side; st.fightT = FIGHT_HOLD;
  }
  // electrocution (taser): rigid twitching + blue strobe for `duration` seconds
  function shock(duration = 0.8) { st.shock = Math.max(st.shock, duration); st.shockDur = duration; st.punch = 0; st.wind = 0; st.fightT = FIGHT_HOLD; }
  // opts.fall: animate the flop / getting back up instead of snapping.
  // Lying on the back: the hips sit just high enough for the torso, the chin is
  // tucked so the round head rests on (not in) the floor, limbs splay flat.
  const deadY = 0.08 * B.t * 0.9 * body.scale.x + 0.03;
  function setDead(on, opts = null) {
    st.dead = on;
    if (st.roll > 0) { st.roll = 0; body.scale.setScalar(baseScale); }
    st.wind = 0; st.block = false; st.blockK = 0; st.punch = 0; st.hit = 0;
    if (st.shock > 0) { st.shock = 0; if (st.flash <= 0) setEmissive(baseEmissive); }
    hips.position.z = 0;
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
    } else { tipHat(false); st.needSync = true; } // get up from the splay instead of snapping to attention
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
    windup, extendWindup, cancelWindup, setBlock, roll, hitReact, shock,
    get dead() { return st.dead; },
    get rolling() { return st.roll > 0; },
    get shocked() { return st.shock > 0; },
    get winding() { return st.wind > 0; },
    get windStyle() { return st.wind > 0 ? st.windStyle : null; },
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
