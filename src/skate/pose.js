// Skating poses for the stickman. Applied AFTER model.animate() each frame.
// The rider stands side-on: the body is turned 90° so the legs straddle the board's long axis.
// Body-local +X (legL) = tail (back foot), -X (legR) = nose (front foot), body +Z = toe side.
//
// st: { push: 0..1 phase or -1, crouch: 0..1, air: bool, tuck: 0..1, steer: -1..1, wobble: t, slide: 0..1 }
export function poseRider(model, st) {
  if (!model?.parts || model.dead) return;
  const { hips, torso, neck, head, armL, armR, legL, legR } = model.parts;
  const crouch = st.crouch ?? 0.3;
  const tuck = st.tuck ?? 0;
  const t = st.wobble ?? 0;

  model.body.rotation.y = Math.PI / 2;
  model.body.position.set(0, 0, 0);

  // Legs: splayed along the board, knees bent toward the toe side.
  const splay = 0.27 - tuck * 0.06;
  const ub = -0.5 - crouch * 0.35 - tuck * 0.6;
  const lb = 0.95 + crouch * 0.55 + tuck * 0.9;
  legL.upper.rotation.set(ub, 0, splay);
  legL.lower.rotation.set(lb, 0, 0);
  legR.upper.rotation.set(ub, 0, -splay);
  legR.lower.rotation.set(lb, 0, 0);
  // Hip height that keeps the feet on the deck for this bend (from the leg chain).
  hips.position.y = legDrop(ub, lb, splay) + 0.004;
  hips.rotation.set(0, 0, 0);

  if (st.push >= 0 && !st.air) {
    // Back leg drops off the deck and kicks the ground backward; front leg sinks.
    const p = st.push;
    const onGround = p < 0.6;
    const k = onGround ? p / 0.6 : 1 - (p - 0.6) / 0.4;
    legL.upper.rotation.set(-0.15 - (onGround ? 0 : 0.35 * Math.sin(((p - 0.6) / 0.4) * Math.PI)), 0, 0.05 + k * 0.62);
    legL.lower.rotation.set(onGround ? 0.08 : 0.5, 0, 0);
    legR.upper.rotation.set(-0.85, 0, -0.18);
    legR.lower.rotation.set(1.5, 0, 0);
    hips.position.y = Math.max(0.62, legDrop(-0.85, 1.5, 0.18) + 0.004);
  }
  if (st.flick) {
    // Front foot flicks off the nose at the start of a flip.
    legR.upper.rotation.z -= 0.35 * st.flick;
    legR.lower.rotation.x -= 0.6 * st.flick;
  }

  // Torso leans into carves (toe side = turning left with a regular stance).
  const lean = (st.steer ?? 0) * 0.22;
  torso.rotation.set(0.12 + lean + crouch * 0.12, 0, 0);
  neck.rotation.set(lean * 0.6, -0.55, 0);
  head.rotation.set(0, -0.75, 0);

  // Arms out for balance with a little wobble; flail when sliding.
  const wob = Math.sin(t * 3.1) * 0.12 + (st.slide ? Math.sin(t * 17) * 0.35 * st.slide : 0);
  armL.upper.rotation.set(0.15 + wob * 0.5, 0, 1.05 + wob);
  armL.lower.rotation.set(-0.45, 0, 0);
  armR.upper.rotation.set(-0.1 - wob * 0.5, 0, -1.0 + wob);
  armR.lower.rotation.set(-0.45, 0, 0);
  if (st.air) { armL.upper.rotation.z += 0.35; armR.upper.rotation.z -= 0.35; }
}

// Vertical drop from hip to sole for a leg with the given upper/lower bend and side splay.
function legDrop(ub, lb, splay) {
  const thigh = 0.45 * Math.cos(splay) * Math.cos(ub);
  const shin = 0.48 * Math.cos(splay) * Math.cos(ub + lb);
  return thigh + shin + 0.01;
}

// Undo everything poseRider() set that animate() doesn't reset on its own.
export function resetRider(model) {
  if (!model?.parts) return;
  const { hips, torso, neck, head, armL, armR, legL, legR } = model.parts;
  model.body.rotation.y = 0;
  if (!model.dead) { model.body.rotation.set(0, 0, 0); model.body.position.set(0, 0, 0); }
  hips.rotation.set(0, 0, 0);
  torso.rotation.set(0, 0, 0);
  neck.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  for (const l of [legL, legR]) { l.upper.rotation.set(0, 0, 0); l.lower.rotation.set(0, 0, 0); }
  if (!model.dead) for (const a of [armL, armR]) { a.upper.rotation.set(0, 0, 0); a.lower.rotation.set(0, 0, 0); }
  if (!model.dead) hips.position.y = 0.95;
}
