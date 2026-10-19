import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';
import { LOCATIONS, DISTRICTS } from '../data/locations.js';
import { buildLayout, districtAt, HALF, BOUND, WATER_X, WORLD_SEED } from './layout.js';
import { WorldGeo } from './geo.js';
import { createMaterials } from './mats.js';
import { buildGround, buildRoads, buildStreetProps } from './roads.js';
import { buildLot } from './buildings.js';
import { LANDMARKS } from './landmarks.js';
import { buildOverpass, buildDocks, buildDragStrip, buildEdges, buildScatter } from './districts.js';
import { Atmosphere, WEATHER_LABEL } from './atmosphere.js';
import { Particles } from './particles.js';
import { Post } from './post.js';
import { MapSystem } from './minimap.js';
import { hashStr } from './textures.js';

// The city of Rotwell. See DESIGN.md "World" for the public API (game.world).

const GFX_KEY = 'doxsrpg_gfx';

async function waitFonts() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('48px "Special Elite"'), document.fonts.load('bold 48px "Barlow Condensed"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* fallback fonts are fine */ }
}

export async function installWorld(game) {
  const t0 = performance.now();
  await waitFonts();
  const layout = buildLayout();
  const mats = createMaterials();
  const geo = new WorldGeo({ chunkSize: 140, min: -HALF, max: HALF });
  const phys = game.physics;
  game.renderer.toneMappingExposure = 1.5; // grimy but readable under ACES
  phys.setBounds(-BOUND, -BOUND, BOUND, BOUND);

  const lights = [], emitters = [];
  const C = {
    game, geo, mats, layout, lights, emitters,
    rng: mulberry32(WORLD_SEED ^ 0x5eed),
    solid(x0, z0, x1, z1, h = 6, tag = 'solid') { return phys.addBox(x0, z0, x1, z1, { height: h, tag }); },
    obb(cx, cz, rot, w, d, h = 6, tag = 'solid') {
      const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
      const hx = c * w / 2 + s * d / 2, hz = s * w / 2 + c * d / 2;
      return phys.addBox(cx - hx, cz - hz, cx + hx, cz + hz, { height: h, tag });
    },
    obbLocal(lot, lx, lz, w, d, h = 6) {
      const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
      return this.obb(lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs, lot.rot, w, d, h, 'building');
    },
    light(x, y, z, color, kind = 'street') { lights.push({ x, y, z, color, kind }); },
    emit(x, y, z, type) { emitters.push({ x, y, z, type }); },
  };

  // ---- build
  buildGround(C);
  buildRoads(C);
  buildStreetProps(C);

  // locations
  const placedLocs = [];
  let spawn = { x: 0, z: 330, facing: 0 };
  const overpassDoor = buildOverpass(C);
  const dragDoor = buildDragStrip(C);
  for (const L of LOCATIONS) {
    let doorX, doorZ, x, z, facing = 0;
    const lot = layout.locSpots[L.id];
    if (L.id === 'hobo_camp') { x = doorX = overpassDoor.x; z = doorZ = overpassDoor.z; }
    else if (L.id === 'drag_strip') { x = doorX = dragDoor.doorX; z = doorZ = dragDoor.doorZ; facing = Math.PI; }
    else if (lot && LANDMARKS[L.id]) {
      const prev = C.rng;
      C.rng = mulberry32(hashStr(L.id) ^ WORLD_SEED);
      geo.reset(); geo.lock(lot.cx, lot.cz);
      let res = null;
      try { res = LANDMARKS[L.id](C, lot, L); } catch (e) { console.error('[world] landmark failed', L.id, e); }
      geo.reset();
      C.rng = prev;
      x = lot.cx; z = lot.cz; facing = lot.rot;
      if (res?.doorWorld) [doorX, doorZ] = res.doorWorld;
      else {
        const [lx, lz] = res?.door ?? [0, lot.d / 2];
        const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
        const fz = lz + 1.6;
        doorX = lot.cx + lx * cs + fz * sn; doorZ = lot.cz - lx * sn + fz * cs;
      }
    } else {
      // could not place: drop it on a sidewalk so the game still works
      const w = layout.walks.find((w2) => w2.district === L.district) ?? layout.walks[0];
      x = doorX = (w.x1 + w.x2) / 2; z = doorZ = (w.z1 + w.z2) / 2;
      console.warn('[world] location without a building:', L.id);
    }
    // make sure the door point is standable
    const r = phys.resolveCircle(doorX, doorZ, 0.5);
    doorX = r.x; doorZ = r.z;
    const loc = game.locations.add({ ...L, x, z, doorX, doorZ, facing });
    placedLocs.push(loc);
    if (L.id === 'roach_motel') spawn = { x: doorX, z: doorZ, facing };
  }

  // generic lots
  for (const lot of layout.lots) buildLot(C, lot);
  buildDocks(C);
  buildScatter(C);
  buildEdges(C, game.scene);

  const { chunks, verts } = geo.finalize(mats.M);
  const root = new THREE.Group(); root.name = 'city';
  for (const c of chunks) root.add(c);
  root.matrixAutoUpdate = false;
  game.scene.add(root);
  root.updateMatrixWorld(true);

  // ---- atmosphere / fx
  const atmo = new Atmosphere(game, mats, lights);
  const particles = new Particles(game.scene, emitters);
  let post = null;
  try { post = new Post(game); } catch (e) { console.error('[world] post-processing unavailable', e); }

  // ---- public API
  const roads = {
    nodes: layout.nodes, edges: layout.edges, info: layout.edgeInfo, laneOffset: 2.6,
  };
  const markers = game.world?.markers instanceof Map ? game.world.markers : new Map();
  const walksBy = {};
  for (const w of layout.walks) (walksBy[w.district] ??= []).push(w);
  const edgesBy = {};
  layout.edgeInfo.forEach((e, i) => { if (e.kind !== 'drag') (edgesBy[e.district] ??= []).push(i); });
  const pickWeighted = (arr, wf) => { let tot = 0; for (const a of arr) tot += wf(a); let r = Math.random() * tot; for (const a of arr) { if ((r -= wf(a)) <= 0) return a; } return arr[arr.length - 1]; };

  const world = {
    name: 'Rotwell',
    seed: WORLD_SEED,
    size: HALF * 2,
    bounds: { minX: -BOUND, maxX: BOUND, minZ: -BOUND, maxZ: BOUND },
    spawn,
    groundY: 0,
    districts: DISTRICTS,
    districtAt,
    markers,
    roads,
    layout,
    raceTrack: [
      { x: -395, z: 257.4 }, { x: -480, z: 257.4 }, { x: -570, z: 257.4 }, { x: -650, z: 257.4 }, { x: -668, z: 228 }, { x: -662, z: 198 },
      { x: -600, z: 195 }, { x: -520, z: 195 }, { x: -440, z: 195 }, { x: -382, z: 206 }, { x: -378, z: 232 }, { x: -395, z: 257.4 },
    ],
    dragStrip: { start: { x: -395, z: 260 }, finish: { x: -660, z: 260 }, dir: -Math.PI / 2, lanes: [257.4, 262.6] },
    get weather() { return atmo.weather; },
    get weatherLabel() { return WEATHER_LABEL[atmo.weather]; },
    get night() { return atmo.night; },

    randomSidewalkPoint(district) {
      const list = (district && walksBy[district]) || layout.walks;
      for (let i = 0; i < 8; i++) {
        const w = pickWeighted(list, (a) => a.len);
        const t = Math.random();
        const dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = Math.hypot(dx, dz) || 1;
        const lat = (Math.random() - 0.5) * Math.max(0.2, w.width - 2.6);
        const x = w.x1 + dx * t - (dz / L) * lat, z = w.z1 + dz * t + (dx / L) * lat;
        if (!phys.pointBlocked(x, z) && !phys.resolveCircle(x, z, 0.45).hit) return { x, z };
      }
      const w = list[0]; return { x: w.x1, z: w.z1 };
    },
    randomRoadPoint(district) {
      const list = (district && edgesBy[district]) || layout.edgeInfo.map((_, i) => i);
      const ei = pickWeighted(list, (i) => layout.edgeInfo[i].len);
      const e = layout.edgeInfo[ei];
      const A = layout.nodes[e.a];
      const s0 = e.clear[0].mark + 2, s1 = e.len - e.clear[1].mark - 2;
      const s = s1 > s0 ? s0 + Math.random() * (s1 - s0) : e.len / 2;
      const fwd = Math.random() < 0.5;
      const ux = fwd ? e.dx : -e.dx, uz = fwd ? e.dz : -e.dz;
      const lane = e.lanes[(Math.random() * e.lanes.length) | 0];
      const x = A.x + e.dx * s + (-uz) * lane, z = A.z + e.dz * s + ux * lane;
      return { x, z, dir: Math.atan2(ux, uz), edge: ei, from: fwd ? e.a : e.b, to: fwd ? e.b : e.a };
    },
    nearestRoadNode(x, z) {
      let best = 0, bd = Infinity;
      const N = layout.nodes;
      for (let i = 0; i < N.length; i++) { const d = (N[i].x - x) ** 2 + (N[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
      return best;
    },
    isWater(x, z) { return x >= WATER_X && phys.pointBlocked(x, z)?.tag === 'water'; },
    setWaypoint(x, z, label = 'Waypoint') { markers.set('waypoint', { x, z, color: '#ffd040', label, icon: '✚' }); },
    clearWaypoint() { markers.delete('waypoint'); },
    openMap() { map.openFull(); },
    gfx: 'high',
    setGraphics: null,
    stats: null,
  };
  game.world = world;

  const map = new MapSystem(game, layout);

  // dealer spots: a sidewalk point near the building line, deterministic per district
  world.dealerSpots = {};
  for (const d of Object.keys(DISTRICTS)) {
    const list = (walksBy[d] ?? []).slice().sort((a, b) => b.len - a.len);
    const rr = mulberry32(hashStr('dealer' + d));
    for (let i = 0; i < 120 && list.length; i++) {
      const w = list[Math.floor(rr() * Math.min(list.length, 25))];
      const t = 0.2 + rr() * 0.6;
      const dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = Math.hypot(dx, dz) || 1;
      const side = (w.width / 2 - 0.9);
      // offset toward the building side: walks are offset from the road center, push outward
      const x = w.x1 + dx * t, z = w.z1 + dz * t;
      const px = -dz / L, pz = dx / L;
      const cand = [[x + px * side, z + pz * side], [x - px * side, z - pz * side]];
      const deep = (cx, cz) => [[30, 0], [-30, 0], [0, 30], [0, -30]].every(([ox, oz]) => districtAt(cx + ox, cz + oz) === d);
      const ok = cand.find(([cx, cz]) => deep(cx, cz) && !phys.pointBlocked(cx, cz) && !phys.resolveCircle(cx, cz, 0.6).hit);
      if (ok) { world.dealerSpots[d] = { x: ok[0], z: ok[1], facing: Math.atan2(-px, -pz) }; break; }
    }
  }

  // ---- graphics settings
  let gfx = 'high';
  try { gfx = localStorage.getItem(GFX_KEY) === 'low' ? 'low' : 'high'; } catch { /* ignore */ }
  const btn = { label: 'Graphics: High', hint: 'post-fx, shadows, detail', onClick: () => { setGraphics(gfx === 'high' ? 'low' : 'high'); game.ui.toast(`Graphics: ${gfx === 'high' ? 'High' : 'Low'}`, 'info', 1500); } };
  game.ui.menuButtons.push(btn);
  const detailDist = { high: 230, low: 0 };
  function setGraphics(q) {
    gfx = q;
    world.gfx = q;
    btn.label = `Graphics: ${q === 'high' ? 'High' : 'Low'}`;
    try { localStorage.setItem(GFX_KEY, q); } catch { /* ignore */ }
    atmo.setQuality(q);
    game.renderer.shadowMap.enabled = q === 'high';
    game.renderer.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 1.75) : 1);
    game.resize();
    game.scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
  }
  world.setGraphics = setGraphics;
  if (gfx === 'low') setGraphics('low');

  // ---- per-frame visuals (run from renderFn so they see this frame's camera)
  const tmpBox = new THREE.Vector3();
  let fpsAcc = 0, fpsN = 0;
  world.stats = { fps: 0, calls: 0, tris: 0, verts, chunks: chunks.length, buildMs: 0 };
  function visuals(dt) {
    const cam = game.camera.position;
    const focus = map.focus() ?? cam;
    let env = { night: 0, wet: 0, daylight: 1, flash: 0 };
    try { env = atmo.update(dt, focus); } catch (e) { if (!visuals._e1) { console.error('[world] atmosphere', e); visuals._e1 = true; } }
    try { mats.update(game.elapsed, env.night, env.wet, env.daylight); } catch (e) { if (!visuals._e2) { console.error('[world] mats', e); visuals._e2 = true; } }
    try { particles.update(dt, cam, game.scene, 0.22 + env.daylight * 0.78); } catch (e) { if (!visuals._e3) { console.error('[world] particles', e); visuals._e3 = true; } }
    // chunk culling by distance
    const far = Math.min(900, atmo.fogFar + 160);
    const dd = detailDist[gfx];
    for (const c of chunks) {
      const b = c.userData.box;
      tmpBox.set(Math.max(b.min.x, Math.min(cam.x, b.max.x)), 0, Math.max(b.min.z, Math.min(cam.z, b.max.z)));
      const d = Math.hypot(tmpBox.x - cam.x, tmpBox.z - cam.z);
      c.visible = d < far;
      const det = d < dd;
      for (const m of c.userData.detail) m.visible = det;
    }
    if (post) post.update(env);
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) { world.stats.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  }
  game.renderer.info.autoReset = false;
  game.renderFn = (dt) => {
    game.renderer.info.reset();
    visuals(dt);
    if (post && gfx === 'high') post.render(dt);
    else game.renderer.render(game.scene, game.camera);
    world.stats.calls = game.renderer.info.render.calls;
    world.stats.tris = game.renderer.info.render.triangles;
  };
  game.bus.on('resize', ({ h }) => particles.setScale(game.renderer.domElement.height));
  particles.setScale(game.renderer.domElement.height);

  // ---- per-frame logic (map key, district HUD)
  game.addSystem({
    name: 'world',
    update(dt) {
      if (!game.started) return;
      if (game.input.wasPressed('KeyM')) {
        if (map.panel && !map.panel.closed) map.panel.close();
        else if (!game.ui.isBlocking()) map.openFull();
      }
      map.update(dt);
    },
  });
  game.bus.on('weather:change', ({ kind, label }) => {
    if (!game.started) return;
    const msg = { rain: 'Rain rolling in. Everything smells like wet cigarettes.', storm: 'Thunderstorm. Stay away from tall, rusty things.', fog: 'Pea-soup fog. You can barely see your own regrets.', smog: 'Smog alert. Breathe responsibly (Grimco™).', overcast: 'Clouds rolling over. Business as usual.', clear: 'The smog thinned out. Is that... the sun?' }[kind];
    game.ui.toast(msg ?? label, 'info', 3500);
  });
  game.bus.on('game:start', () => { map.district = null; });

  world.stats.buildMs = Math.round(performance.now() - t0);
  console.info(`[world] Rotwell built in ${world.stats.buildMs}ms: ${layout.nodes.length} nodes, ${layout.edges.length} edges, ${layout.lots.length} lots, ${chunks.length} chunks, ${verts} verts, ${lights.length} light sources`);
}
