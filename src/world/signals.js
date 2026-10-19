import * as THREE from 'three';
import { Y } from './props.js';
import { junctions } from './roads.js';
import { hashStr } from './textures.js';

// Working traffic signals at city intersections.
//
// game.world.signals = {
//   list: [{ node, x, z, axes: [h0, h1], offset }]   one entry per signalized junction.
//         node = index into game.world.roads.nodes; axes = the two road axes as headings
//         (rotation.y convention, atan2(dx, dz)), each also covering the opposite heading.
//   stateAt(nodeIndex, heading) -> 'green' | 'yellow' | 'red'
//         Light facing a vehicle that is travelling with `heading` INTO that node.
//         Junctions without signals always return 'green'.
//   walkAt(nodeIndex, heading) -> bool
//         May a pedestrian walking with `heading` cross at that junction now? (true when
//         the axis they walk parallel to has green; unsignalized junctions -> true)
//   stopLine(nodeIndex, heading) -> { x, z, dist, edge } | null
//         Where a vehicle approaching with `heading` should stop: the middle of the
//         inner approach lane, just behind the crosswalk. dist = metres from the node centre.
//   clock() -> seconds (shared signal clock), phaseOf(nodeIndex) -> { axis, state, t, remaining }
//   cycle: { green, yellow, allRed, length }
// }
//
// Cycle (per junction): axis 0 green 12s -> yellow 3s -> all-red 1.5s -> axis 1 green 12s ->
// yellow 3s -> all-red 1.5s (33s). Each junction has a fixed offset (hash of its node index).
// Clock: game.time.total + game.time._acc, i.e. game minutes, which tick once per real second
// at the default rate, so it reads as seconds. The host owns game.time; clients (whose _acc
// stays 0) extrapolate up to 1s since the last synced minute, so host and clients agree to
// within network latency. Time skips (sleeping, working) simply jump the cycle.

export const CYCLE = { green: 12, yellow: 3, allRed: 1.5 };
CYCLE.length = 2 * (CYCLE.green + CYCLE.yellow + CYCLE.allRed);

const SIGNAL_KINDS = new Set(['ring', 'main', 'street', 'slum', 'hill', 'diag', 'yard', 'dock']);
const SIGNAL_DISTRICTS = new Set(['downtown', 'gutterside', 'hilltop', 'rustyards']);
const TAU = Math.PI * 2;

function axisAngle(dx, dz) { let a = Math.atan2(dx, dz) % Math.PI; if (a < 0) a += Math.PI; return a; }
function angDiffPi(a, b) { let d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); }

// Static geometry (poles, arms, housings, stop lines) + lamp placements.
export function buildSignals(C) {
  const L = C.layout, g = C.geo;
  const { nodes, edgeInfo } = L;
  const J = junctions(L);
  const list = [], lamps = [], byNode = new Map();
  const m = new THREE.Matrix4(), tmp = new THREE.Matrix4();
  const pushLamp = (sig, axis, kind, wx, wz, rot, lx, ly, lz, faceRot = 0, s = 1) => {
    m.makeTranslation(wx, 0, wz).multiply(tmp.makeRotationY(rot)).multiply(tmp.makeTranslation(lx, ly, lz)).multiply(tmp.makeRotationY(faceRot)).multiply(tmp.makeScale(s, s, s));
    lamps.push({ sig, axis, kind, matrix: m.toArray() });
  };
  for (const j of J) {
    if (j.deg < 3 || !SIGNAL_DISTRICTS.has(j.district)) continue;
    const N = nodes[j.i];
    const es = N.edges.map((ei) => edgeInfo[ei]);
    if (!es.every((e) => SIGNAL_KINDS.has(e.kind))) continue;
    // split approaches into two axes
    const a0 = axisAngle(es[0].dx, es[0].dz);
    const appr = es.map((e, k) => {
      const end = e.a === j.i ? 0 : 1;
      const ux = end === 0 ? e.dx : -e.dx, uz = end === 0 ? e.dz : -e.dz;
      return { e, ei: N.edges[k], end, ux, uz, axis: angDiffPi(axisAngle(ux, uz), a0) < Math.PI / 4 ? 0 : 1 };
    });
    if (!appr.some((p) => p.axis === 1)) continue;
    const a1src = appr.find((p) => p.axis === 1);
    const sig = { node: j.i, x: N.x, z: N.z, axes: [a0, axisAngle(a1src.ux, a1src.uz)], offset: (hashStr('sig' + j.i) % 3300) / 100, approaches: [] };
    const si = list.length;
    for (const p of appr) {
      const { e, ux, uz } = p;
      const cl = e.clear[p.end];
      const mark = Math.min(cl.mark, e.len / 2 - 1);
      const laneMid = e.lanes.length > 1 ? (e.lanes[0] + e.lanes[e.lanes.length - 1]) / 2 : e.lanes[0];
      const lat = e.hw + (e.sw > 0 ? 0.55 : 1.2);
      const along = mark + 0.4;
      const rx = uz, rz = -ux; // right-hand side of traffic approaching the node
      const px = N.x + ux * along + rx * lat, pz = N.z + uz * along + rz * lat;
      const rot = Math.atan2(ux, uz); // local +Z faces approaching traffic, local +X = right
      const armL = lat - laneMid;
      g.frame(px, pz, rot);
      g.cyl('metal', 0, 0.25, 0, 0.2, 0.24, 0.5, 6, { color: '#262624' });
      g.cyl('metal', 0, 3.1, 0, 0.09, 0.12, 6.2, 6, { color: '#2e2e2c', capTop: true });
      g.box('metal', -armL / 2, 6.0, 0, armL + 0.2, 0.12, 0.12, { color: '#2e2e2c' });
      g.box('metal', -armL / 2 + 0.2, 5.75, 0, Math.min(armL * 0.6, 3), 0.06, 0.06, { color: '#2e2e2c' });
      // overhead head
      g.box('metal', -armL, 5.95, 0, 0.06, 0.22, 0.06, { color: '#1a1a18' });
      g.box('metal', -armL, 5.2, 0, 0.44, 1.3, 0.3, { color: '#161614' });
      g.box('metal', -armL, 5.2, -0.17, 0.62, 1.5, 0.04, { color: '#0e0e0d' }); // backplate
      for (const dy of [0.4, 0, -0.4]) g.box('metal', -armL, 5.2 + dy + 0.16, 0.24, 0.34, 0.03, 0.18, { color: '#161614' });
      // pole head (for people standing at the corner) + pedestrian head facing across the road
      g.box('metal', 0, 3.1, 0.22, 0.34, 1.0, 0.24, { color: '#161614' });
      g.box('metal', -0.24, 2.35, 0, 0.26, 0.62, 0.36, { color: '#161614' });
      C.solid(px - 0.25, pz - 0.25, px + 0.25, pz + 0.25, 6.2);
      for (const [k, dy] of [['r', 0.4], ['y', 0], ['g', -0.4]]) {
        pushLamp(si, p.axis, k, px, pz, rot, -armL, 5.2 + dy, 0.168, 0, 1);
        pushLamp(si, p.axis, k, px, pz, rot, 0, 3.1 + dy * 0.75, 0.358, 0, 0.75);
      }
      pushLamp(si, p.axis, 'stop', px, pz, rot, -0.388, 2.5, 0, -Math.PI / 2, 0.8);
      pushLamp(si, p.axis, 'walk', px, pz, rot, -0.388, 2.2, 0, -Math.PI / 2, 0.8);
      // stop line across the approach lanes
      const sl = mark + 0.5;
      g.identity();
      const ax = N.x + ux * sl, az = N.z + uz * sl;
      g.strip('marking', ax + rx * 0.35, az + rz * 0.35, ax + rx * (e.hw - 0.35), az + rz * (e.hw - 0.35), 0.45, Y.mark + 0.001, { color: '#c8c4b8' });
      sig.approaches.push({ edge: p.ei, ux, uz, axis: p.axis, stop: { x: ax + rx * e.lanes[0], z: az + rz * e.lanes[0], dist: sl, edge: p.ei } });
    }
    list.push(sig); byNode.set(j.i, si);
  }
  return { list, lamps, byNode };
}

const COL = {
  r: [[3.2, 0.18, 0.1], [0.14, 0.025, 0.02]],
  y: [[3.2, 1.7, 0.12], [0.14, 0.09, 0.015]],
  g: [[0.25, 2.8, 1.3], [0.02, 0.11, 0.07]],
  stop: [[3.0, 1.2, 0.25], [0.11, 0.05, 0.02]],
  walk: [[2.4, 2.7, 2.7], [0.06, 0.07, 0.07]],
};

export function createSignals(game, data) {
  const { list, lamps, byNode } = data;
  // ---- clock shared by host and clients
  let lastTotal = null, lastReal = 0;
  function clock() {
    const T = game.time;
    const now = performance.now() / 1000;
    if (T.total !== lastTotal) { lastTotal = T.total; lastReal = now; }
    let t = T.total + (T._acc || 0);
    if (!T._acc && game.net?.isClient) t += Math.min(1, now - lastReal) * (T.rate ?? 1);
    return t;
  }
  const half = CYCLE.green + CYCLE.yellow + CYCLE.allRed;
  // state of axis a at junction-local time tt in [0, cycle)
  function axisState(tt, a) {
    const local = ((tt - a * half) % CYCLE.length + CYCLE.length) % CYCLE.length;
    if (local < CYCLE.green) return 'green';
    if (local < CYCLE.green + CYCLE.yellow) return 'yellow';
    return 'red';
  }
  const sigT = (si, t = clock()) => ((t + list[si].offset) % CYCLE.length + CYCLE.length) % CYCLE.length;

  // which approach of junction si does a vehicle heading `h` use?
  function approachOf(si, h) {
    const dx = Math.sin(h), dz = Math.cos(h);
    let best = null, bd = -Infinity;
    for (const a of list[si].approaches) { const d = -(a.ux * dx + a.uz * dz); if (d > bd) { bd = d; best = a; } }
    return best;
  }
  function axisOfHeading(si, h) {
    const ah = axisAngle(Math.sin(h), Math.cos(h));
    return angDiffPi(ah, list[si].axes[0]) <= angDiffPi(ah, list[si].axes[1]) ? 0 : 1;
  }

  const api = {
    list: list.map(({ node, x, z, axes, offset }) => ({ node, x, z, axes, offset })),
    cycle: { ...CYCLE },
    clock,
    stateAt(nodeIndex, heading) {
      const si = byNode.get(nodeIndex);
      if (si == null) return 'green';
      const ap = approachOf(si, heading);
      return axisState(sigT(si), ap ? ap.axis : axisOfHeading(si, heading));
    },
    walkAt(nodeIndex, heading) {
      const si = byNode.get(nodeIndex);
      if (si == null) return true;
      return axisState(sigT(si), axisOfHeading(si, heading)) === 'green';
    },
    stopLine(nodeIndex, heading) {
      const si = byNode.get(nodeIndex);
      if (si == null) return null;
      const ap = approachOf(si, heading);
      return ap ? { ...ap.stop } : null;
    },
    phaseOf(nodeIndex) {
      const si = byNode.get(nodeIndex);
      if (si == null) return null;
      const tt = sigT(si);
      const axis = tt < half ? 0 : 1, local = tt % half;
      const state = local < CYCLE.green ? 'green' : local < CYCLE.green + CYCLE.yellow ? 'yellow' : 'red';
      const remaining = state === 'green' ? CYCLE.green - local : state === 'yellow' ? CYCLE.green + CYCLE.yellow - local : half - local;
      return { axis, state, t: tt, remaining };
    },
    mesh: null,
  };
  if (!lamps.length) return api;

  // ---- lamps: one instanced mesh, per-instance colour updated only on phase changes
  const geo = new THREE.CircleGeometry(0.135, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, lamps.length);
  mesh.name = 'signals';
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  const mm = new THREE.Matrix4(), c = new THREE.Color();
  lamps.forEach((l, i) => { mm.fromArray(l.matrix); mesh.setMatrixAt(i, mm); mesh.setColorAt(i, c.setRGB(...COL[l.kind][1])); });
  mesh.instanceMatrix.needsUpdate = true;
  const bySig = list.map(() => []);
  lamps.forEach((l, i) => bySig[l.sig].push(i));
  const lastKey = new Array(list.length).fill('');
  game.scene.add(mesh);
  api.mesh = mesh;

  function lampOn(kind, axisSt, otherSt) {
    switch (kind) {
      case 'r': return axisSt === 'red';
      case 'y': return axisSt === 'yellow';
      case 'g': return axisSt === 'green';
      case 'walk': return otherSt === 'green';
      case 'stop': return otherSt !== 'green';
    }
    return false;
  }
  function update() {
    const t = clock();
    let dirty = false;
    for (let si = 0; si < list.length; si++) {
      const tt = sigT(si, t);
      const s0 = axisState(tt, 0), s1 = axisState(tt, 1);
      const key = s0 + s1;
      if (key === lastKey[si]) continue;
      lastKey[si] = key; dirty = true;
      for (const i of bySig[si]) {
        const l = lamps[i];
        const mine = l.axis === 0 ? s0 : s1, other = l.axis === 0 ? s1 : s0;
        mesh.setColorAt(i, c.setRGB(...COL[l.kind][lampOn(l.kind, mine, other) ? 0 : 1]));
      }
    }
    if (dirty) mesh.instanceColor.needsUpdate = true;
  }
  update();
  game.addSystem({ name: 'signals', update() { try { update(); } catch (e) { if (!update._e) { console.error('[world] signals', e); update._e = true; } } } });
  return api;
}
