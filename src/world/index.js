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
import { buildIsland, buildIslandLot, coastPolygon } from './island.js';
import { ISLE_MAX_X, MAP_EXT, SPOTS as ISLE_SPOTS, TOLL_X, LAND_X, BRIDGE, ISLE, isLand } from './island-layout.js';
import { buildSignals, createSignals } from './signals.js';
import { runAudit } from './audit.js';
import { CamColliders } from './camcollide.js';
import { buildSkyline } from './skyline.js';

// The city of Rotwell. See DESIGN.md "World" for the public API (game.world).

const GFX_KEY = 'doxsrpg_gfx';

// Best-guess starting preset for this device (the player can always override it in the pause menu).
export function detectPreset(renderer) {
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch { /* unknown GPU */ }
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)) || (matchMedia?.('(pointer: coarse)').matches && !matchMedia?.('(pointer: fine)').matches);
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  if (mobile || /SwiftShader|llvmpipe|softpipe|Software|Microsoft Basic Render/i.test(gpu)) return 'low';
  if (/Mali|Adreno|PowerVR|Intel.*(HD Graphics|GMA)|Intel.*UHD Graphics (6\d\d|7\d\d)/i.test(gpu) || cores <= 2 || mem <= 2) return 'low';
  const discrete = /NVIDIA|GeForce|Quadro|RTX|GTX|Radeon (RX|Pro)|Radeon\(TM\) RX|Arc\(TM\) A|Intel.*Arc/i.test(gpu);
  const apple = /Apple M\d|Apple GPU/i.test(gpu);
  if (!discrete && !apple) return 'medium'; // integrated Intel Iris/UHD, Radeon Vega/680M, unknown
  if (cores <= 4 || mem <= 4) return 'medium';
  return 'high';
}

async function waitFonts() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('48px "Special Elite"'), document.fonts.load('bold 48px "Barlow Condensed"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* fallback fonts are fine */ }
}

export async function installWorld(game, opts = {}) {
  const t0 = performance.now();
  // Loading-screen hooks (src/main.js): progress(0..1, label) and a frame yield so the bar can paint
  // and the page never freezes for the whole build.
  const progress = opts.progress ?? (() => {});
  const nextFrame = opts.nextFrame ?? (() => Promise.resolve());
  const stageMs = {};
  let stT = performance.now(), stName = 'fonts';
  const stage = async (f, label, name) => {
    const now = performance.now();
    stageMs[stName] = Math.round(now - stT);
    stName = name; stT = now;
    try { progress(f, label); } catch { /* cosmetic */ }
    await nextFrame();
    stT = performance.now();
  };
  progress(0, 'waiting for the sign painter (fonts)');
  await waitFonts();
  await stage(0.03, 'surveying the slums', 'layout');
  const layout = buildLayout();
  await stage(0.06, 'mixing grime, rust and paint', 'materials');
  const mats = createMaterials();
  await stage(0.2, 'pouring asphalt', 'roads');
  const geo = new WorldGeo({ chunkSize: 140, min: -HALF, max: MAP_EXT.maxX });
  const phys = game.physics;
  game.renderer.toneMappingExposure = 1.7; // grimy but readable under ACES
  phys.setBounds(-BOUND, -BOUND, ISLE_MAX_X, BOUND);

  const lights = [], emitters = [];
  // every collider is recorded with its build phase/owner for the dev audit
  const auditRecs = [];
  let streetN = 0;
  const rec = (b) => {
    const y = geo.minY; geo.minY = Infinity;
    const own = C.ctx === 'street' || C.ctx === 'parked' || C.ctx === 'scatter' ? C.ctx + '#' + (streetN++) : C.ctx;
    auditRecs.push({ b, ctx: C.ctx, own, y, elevated: C.elevated });
    return b;
  };
  const C = {
    game, geo, mats, layout, lights, emitters,
    ctx: 'ground', elevated: false,
    rng: mulberry32(WORLD_SEED ^ 0x5eed),
    solid(x0, z0, x1, z1, h = 6, tag = 'solid') { return rec(phys.addBox(x0, z0, x1, z1, { height: h, tag })); },
    obb(cx, cz, rot, w, d, h = 6, tag = 'solid') {
      const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
      const hx = c * w / 2 + s * d / 2, hz = s * w / 2 + c * d / 2;
      return rec(phys.addBox(cx - hx, cz - hz, cx + hx, cz + hz, { height: h, tag }));
    },
    // is a circle of radius r at (x, z) clear of every collider placed so far?
    free(x, z, r) { for (const b of phys.query(x - r, z - r, x + r, z + r)) { const qx = Math.max(b.minX, Math.min(x, b.maxX)), qz = Math.max(b.minZ, Math.min(z, b.maxZ)); if ((qx - x) ** 2 + (qz - z) ** 2 < r * r) return false; } return true; },
    obbLocal(lot, lx, lz, w, d, h = 6) {
      const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
      return this.obb(lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs, lot.rot, w, d, h, 'building');
    },
    light(x, y, z, color, kind = 'street') { lights.push({ x, y, z, color, kind }); },
    emit(x, y, z, type) { emitters.push({ x, y, z, type }); },
    seats: [],
  };

  // ---- build
  buildGround(C);
  buildRoads(C);
  C.ctx = 'signals';
  const signalData = buildSignals(C);
  C.ctx = 'street';
  await stage(0.28, 'dumping trash cans and lamp posts', 'street');
  buildStreetProps(C);

  // locations
  const placedLocs = [];
  let spawn = { x: 0, z: 330, facing: 0 };
  C.ctx = 'overpass';
  const overpassDoor = buildOverpass(C);
  C.ctx = 'drag';
  const dragDoor = buildDragStrip(C);
  // Blackwater Isle (own RNG; hand-placed island locations come back as doors)
  await stage(0.34, 'dredging Blackwater Isle', 'island');
  C.ctx = 'isle';
  const isle = buildIsland(C);
  await stage(0.42, 'building the landmarks', 'landmarks');
  for (const L of LOCATIONS) {
    let doorX, doorZ, x, z, facing = 0;
    const lot = layout.locSpots[L.id];
    const isleDoor = L.district === 'blackwater' ? isle.doors[L.id] : null;
    if (isleDoor) { ({ x, z, doorX, doorZ } = isleDoor); facing = isleDoor.facing ?? 0; }
    else if (L.id === 'hobo_camp') { x = doorX = overpassDoor.x; z = doorZ = overpassDoor.z; }
    else if (L.id === 'drag_strip') { x = doorX = dragDoor.doorX; z = doorZ = dragDoor.doorZ; facing = Math.PI; }
    else if (lot && LANDMARKS[L.id]) {
      const prev = C.rng;
      C.rng = mulberry32(hashStr(L.id) ^ WORLD_SEED);
      C.ctx = 'loc:' + L.id;
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

  // generic lots (yield now and then so the loading bar keeps moving)
  {
    const lots = layout.lots, per = Math.max(1, Math.ceil(lots.length / 6));
    for (let i = 0; i < lots.length; i++) {
      if (i % per === 0) await stage(0.55 + (i / lots.length) * 0.2, 'raising tenements ' + Math.round((i / lots.length) * 100) + '%', 'lots' + (i / per | 0));
      const lot = lots[i];
      C.ctx = 'lot' + i + ':' + lot.type; (lot.district === 'blackwater' ? buildIslandLot : buildLot)(C, lot);
    }
  }
  await stage(0.76, 'flooding the docks', 'docks');
  C.ctx = 'docks';
  buildDocks(C);
  C.ctx = 'scatter';
  buildScatter(C);
  C.ctx = 'edges';
  buildEdges(C, game.scene);

  await stage(0.8, 'gluing it all together', 'finalize');
  const { chunks, verts } = geo.finalize(mats.M);
  await stage(0.88, 'teaching the camera about walls', 'camera');
  let camCol = null;
  try { camCol = new CamColliders(geo.cam); } catch (e) { console.error('[world] camera colliders failed', e); }
  geo.cam = null;
  const root = new THREE.Group(); root.name = 'city';
  for (const c of chunks) root.add(c);
  root.matrixAutoUpdate = false;
  game.scene.add(root);
  root.updateMatrixWorld(true);
  // live island objects (Ferris wheel, lighthouse beam)
  for (const o of isle.live) game.scene.add(o.object);

  // ---- atmosphere / fx
  await stage(0.92, 'turning on the smog', 'atmosphere');
  const atmo = new Atmosphere(game, mats, lights);
  const particles = new Particles(game.scene, emitters);
  let skyline = null;
  try { skyline = buildSkyline(game.scene); } catch (e) { console.error('[world] skyline failed', e); }
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
  // spatial buckets of sidewalk strips for fast "near" queries
  const WCELL = 40, walkGrid = new Map();
  layout.walks.forEach((w, i) => {
    const pad = w.width / 2 + 1;
    const x0 = Math.floor((Math.min(w.x1, w.x2) - pad) / WCELL), x1 = Math.floor((Math.max(w.x1, w.x2) + pad) / WCELL);
    const z0 = Math.floor((Math.min(w.z1, w.z2) - pad) / WCELL), z1 = Math.floor((Math.max(w.z1, w.z2) + pad) / WCELL);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const k = gx + ',' + gz; let a = walkGrid.get(k); if (!a) walkGrid.set(k, (a = [])); a.push(i); }
  });
  const walksIn = (x0, z0, x1, z1) => {
    const out = new Set();
    for (let gx = Math.floor(x0 / WCELL); gx <= Math.floor(x1 / WCELL); gx++) for (let gz = Math.floor(z0 / WCELL); gz <= Math.floor(z1 / WCELL); gz++) {
      const a = walkGrid.get(gx + ',' + gz); if (a) for (const i of a) out.add(i);
    }
    return [...out];
  };
  const pickWeighted = (arr, wf) => { let tot = 0; for (const a of arr) tot += wf(a); let r = Math.random() * tot; for (const a of arr) { if ((r -= wf(a)) <= 0) return a; } return arr[arr.length - 1]; };

  const world = {
    name: 'Rotwell',
    seed: WORLD_SEED,
    size: HALF * 2,
    bounds: { minX: -BOUND, maxX: ISLE_MAX_X, minZ: -BOUND, maxZ: BOUND },
    mapExtent: MAP_EXT,
    // Blackwater Isle data for the island module (src/island)
    island: {
      center: { x: ISLE.cx, z: ISLE.cz }, spots: ISLE_SPOTS, doors: isle.doors, isLand,
      tollX: TOLL_X, landX: LAND_X, bridge: BRIDGE,
      lighthouse: isle.doors.blackwater_light?.tower ?? { x: ISLE_SPOTS.lighthouse.x, z: ISLE_SPOTS.lighthouse.z, y: 28 },
      penGate: isle.doors.blackwater_pen?.gate ?? null,
      ferry: { island: { x: ISLE_SPOTS.ferry.x0 + 2, z: ISLE_SPOTS.ferry.z }, city: { x: ISLE_SPOTS.cityFerry.x, z: ISLE_SPOTS.cityFerry.z } },
      contains: (x, z) => x > 700 && isLand(x, z, -1),
    },
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
    // A random walkable sidewalk point in the ring [minR, maxR] around (x, z), or null (e.g. out on the bridge).
    sidewalkPointNear(x, z, minR = 0, maxR = 60) {
      const cand = walksIn(x - maxR, z - maxR, x + maxR, z + maxR);
      if (!cand.length) return null;
      for (let tries = 0; tries < 14; tries++) {
        const w = layout.walks[cand[(Math.random() * cand.length) | 0]];
        const dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
        // param range along the strip that lies inside the maxR circle
        const px = x - w.x1, pz = z - w.z1, proj = px * ux + pz * uz, perp2 = px * px + pz * pz - proj * proj;
        const h2 = maxR * maxR - perp2;
        if (h2 <= 0) continue;
        const h = Math.sqrt(h2), s0 = Math.max(0, proj - h), s1 = Math.min(L, proj + h);
        if (s1 <= s0) continue;
        const sAt = s0 + Math.random() * (s1 - s0);
        const lat = (Math.random() - 0.5) * Math.max(0.2, w.width - 2.2);
        const qx = w.x1 + ux * sAt - uz * lat, qz = w.z1 + uz * sAt + ux * lat;
        const d = Math.hypot(qx - x, qz - z);
        if (d < minR || d > maxR) continue;
        if (phys.pointBlocked(qx, qz) || phys.resolveCircle(qx, qz, 0.45).hit) continue;
        return { x: qx, z: qz };
      }
      return null;
    },
    // Is (x, z) on a sidewalk strip?
    onSidewalk(x, z) {
      for (const i of walksIn(x, z, x, z)) {
        const w = layout.walks[i];
        const dx = w.x2 - w.x1, dz = w.z2 - w.z1, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / l2));
        if (Math.hypot(x - (w.x1 + dx * t), z - (w.z1 + dz * t)) <= w.width / 2 + 0.25) return true;
      }
      return false;
    },
    // Building walls you can lean on / slump against: points just outside a facade, facing out.
    wallSpots(x, z, r = 30) {
      const out = [];
      for (let gx = Math.floor((x - r) / WCELL); gx <= Math.floor((x + r) / WCELL); gx++) for (let gz = Math.floor((z - r) / WCELL); gz <= Math.floor((z + r) / WCELL); gz++) {
        const a = wallGrid.get(gx + ',' + gz); if (!a) continue;
        for (const s of a) if ((s.x - x) ** 2 + (s.z - z) ** 2 <= r * r) out.push(s);
      }
      return out;
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
    // Third-person camera vs. visible geometry (see camcollide.js). camCast -> hit fraction 0..1.
    camCast(ax, ay, az, bx, by, bz, r = 0.25) { return camCol ? camCol.cast(ax, ay, az, bx, by, bz, r) : 1; },
    camPushOut(x, y, z, r, out) { return camCol ? camCol.pushOut(x, y, z, r, out) : false; },
    camInside(x, y, z, r = 0) { return camCol ? camCol.inside(x, y, z, r) : 0; },
    gfx: 'high',
    setGraphics: null,
    stats: null,
  };
  game.world = world;
  world.seats = C.seats; // [{x, z, facing, kind: 'bench'|'busstop', width}]
  // working traffic lights (see signals.js for the API contract)
  world.signals = createSignals(game, signalData);
  // dev-only collider audit
  try {
    if (/[?&]dev\b/.test(location.search)) {
      window.__worldAudit = (opts) => { const res = runAudit(auditRecs, layout, opts); console.table(res.counts); return res; };
      // Which loaded modules are missing from index.html's <link rel=modulepreload> list (and which entries are stale)?
      window.__preloadCheck = () => {
        const pre = new Set([...document.querySelectorAll('link[rel=modulepreload]')].map((l) => l.href));
        const loaded = new Set(performance.getEntriesByType('resource').filter((e) => /\.js$/.test(e.name) && e.initiatorType !== 'fetch' && !/peerjs/.test(e.name)).map((e) => e.name));
        const base = new URL('.', location.href).href;
        const rel = (u) => u.startsWith(base) ? u.slice(base.length) : u;
        const missing = [...loaded].filter((u) => !pre.has(u)).map(rel), stale = [...pre].filter((u) => !loaded.has(u)).map(rel);
        console.info('[preload] missing:\n' + missing.map((u) => `<link rel="modulepreload" href="${u}">`).join('\n') + '\n[preload] stale:\n' + stale.join('\n'));
        return { missing, stale };
      };
      // Visual-check helpers (dev only): step frames while the tab is hidden, frame a shot.
      window.__door = (id, o = {}) => { const l = game.locations.get(id); if (!l) return null; let nx = (l.doorX ?? l.x) - l.x, nz = (l.doorZ ?? l.z) - l.z; const n = Math.hypot(nx, nz) || 1; nx /= n; nz /= n; const off = o.off ?? 5; return window.__shot((l.doorX ?? l.x) + nx * off, (l.doorZ ?? l.z) + nz * off, Math.atan2(nx, nz) + (o.yo ?? 0), { h: o.h ?? 12, dist: o.dist ?? 7.5, pitch: o.pitch ?? 0.32, n: o.n ?? 14 }); };
      window.__key = async (code, n = 6) => { for (const t of ['keydown', 'keyup']) { window.dispatchEvent(new KeyboardEvent(t, { code, key: code, bubbles: true })); if (t === 'keydown') game._frame(); } await window.__step(n); };
      window.__noanim = () => { if (document.getElementById('qa-noanim')) return; const s = document.createElement('style'); s.id = 'qa-noanim'; s.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}'; document.head.appendChild(s); };
      window.__atmo = atmo;
      window.__weather = (kind = null, snap = true) => { atmo.force = kind; if (snap && kind) atmo.snapWeather = true; return kind ?? atmo.weather; };
      window.__step = async (n = 10) => { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 16)); game._frame(); } };
      window.__shot = async (x, z, yaw, o = {}) => {
        game.ui.closeAll();
        if (o.h != null) { const d = Math.floor(game.time.total / 1440); game.time.total = d * 1440 + Math.round(o.h * 60); game.bus.emit('time:change', { skipped: 0 }); }
        game.player.spawn(x, z, o.facing ?? yaw + Math.PI);
        const r = game.cameraRig; r.yaw = yaw; r.pitch = o.pitch ?? 0.32; r.dist = o.dist ?? 7.5;
        await window.__step(o.n ?? 12);
        return { calls: world.stats.calls, tris: world.stats.tris, d: districtAt(x, z), cur: +r.curDist.toFixed(2), lift: +(r.lift || 0).toFixed(2), cam: game.camera.position.toArray().map((v) => +v.toFixed(1)) };
      };
    }
  } catch { /* no window/location */ }

  // ---- wall spots: sampled along building fronts (generic lots + location buildings)
  const wallGrid = new Map();
  {
    const WALLED = new Set(['building', 'apartments', 'warehouse', 'mansion', 'burnt', 'location', 'isle_bait', 'isle_boathouse']);
    const rects = [...layout.lots, ...layout.placed].filter((l) => WALLED.has(l.type ?? l.kind) && l.fx != null);
    for (const l of rects) {
      const ax = -l.fz, az = l.fx; // along the facade
      const n = Math.max(1, Math.floor(l.w / 4.5));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        const off = l.d / 2 + 0.5;
        const sx = l.cx + l.fx * off + ax * t * (l.w - 2), sz = l.cz + l.fz * off + az * t * (l.w - 2);
        // must stand free with a wall right behind it, and not in a doorway
        if (phys.pointBlocked(sx, sz) || phys.resolveCircle(sx, sz, 0.35).hit) continue;
        if (!phys.pointBlocked(sx - l.fx * 0.9, sz - l.fz * 0.9)) continue;
        if (game.locations.list.some((L) => Math.hypot((L.doorX ?? L.x) - sx, (L.doorZ ?? L.z) - sz) < 3)) continue;
        const spot = { x: Math.round(sx * 100) / 100, z: Math.round(sz * 100) / 100, facing: Math.atan2(l.fx, l.fz) };
        const k = Math.floor(sx / WCELL) + ',' + Math.floor(sz / WCELL);
        let a = wallGrid.get(k); if (!a) wallGrid.set(k, (a = [])); a.push(spot);
      }
    }
  }

  await stage(0.96, 'drawing the map', 'map');
  const map = new MapSystem(game, layout, { ext: MAP_EXT, coast: coastPolygon(), spots: ISLE_SPOTS });

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

  // ---- graphics presets (pause menu -> Graphics). game.world.quality is the live preset; other modules can
  // read its density hints: crowd / traffic (0..1 multipliers), npcDist / npcShadowDist (m), props (0..1).
  // High is the reference look; Medium and Low trade detail for speed. 'auto' picks one from the device
  // and steps down once if the game keeps running below ~30 fps.
  const PRESETS = {
    high: { id: 'high', label: 'High', pixelRatio: 1.75, shadows: true, shadowMap: 2048, shadowSize: 70, softShadows: true, shadowEvery: 1, post: true, msaa: 4, lights: 8, viewK: 1, detailDist: 230, dressDist: 240, props: 1, crowd: 1, traffic: 1, npcDist: 140, npcShadowDist: 35, rain: 1, miniHz: 30 },
    medium: { id: 'medium', label: 'Medium', pixelRatio: 1.25, shadows: true, shadowMap: 1024, shadowSize: 55, softShadows: true, shadowEvery: 2, post: true, msaa: 2, lights: 4, viewK: 0.85, detailDist: 160, dressDist: 200, props: 0.7, crowd: 0.8, traffic: 0.8, npcDist: 115, npcShadowDist: 22, rain: 0.6, miniHz: 24 },
    low: { id: 'low', label: 'Low', pixelRatio: 1, shadows: false, shadowMap: 1024, shadowSize: 55, softShadows: false, shadowEvery: 1, post: false, msaa: 0, lights: 2, viewK: 0.7, detailDist: 0, dressDist: 150, props: 0, crowd: 0.6, traffic: 0.6, npcDist: 95, npcShadowDist: 0, rain: 0.35, miniHz: 15 },
  };
  const ORDER = ['low', 'medium', 'high'];
  const detected = detectPreset(game.renderer);
  let choice = 'auto'; // 'auto' | 'high' | 'medium' | 'low' (what the player picked)
  try { const v = localStorage.getItem(GFX_KEY); if (v === 'auto' || PRESETS[v]) choice = v; } catch { /* ignore */ }
  let autoLevel = detected; // auto mode's current preset (may step down at runtime)
  let gfx = choice === 'auto' ? autoLevel : choice;
  const btn = { label: '', hint: '', onClick: () => openGraphicsMenu() };
  game.ui.menuButtons.push(btn);
  const labelBtn = () => {
    btn.label = `Graphics: ${PRESETS[gfx].label}${choice === 'auto' ? ' (auto)' : ''}`;
    btn.hint = 'quality / speed';
  };
  function openGraphicsMenu() {
    const opt = (id, label, hint) => ({ label: (choice === id ? '▶ ' : '') + label, hint, onSelect: () => { setGraphics(id); game.ui.toast(`Graphics: ${PRESETS[gfx].label}${choice === 'auto' ? ' (auto)' : ''}`, 'info', 1600); } });
    game.ui.dialog({
      title: 'Graphics',
      text: `Running at ~${world.stats.fps || '?'} fps. Pick lower settings if the city feels like a slideshow.`,
      options: [
        opt('auto', `Auto (${PRESETS[autoLevel].label})`, 'picks for this device'),
        opt('high', 'High', 'full shadows, post-fx, max detail'),
        opt('medium', 'Medium', 'lighter shadows, fewer lights & crowds'),
        opt('low', 'Low', 'no shadows/post-fx, shorter view, thin crowds'),
        { label: 'Back', onSelect: () => {} },
      ],
    });
  }
  function applyPreset(id) {
    const prev = world.quality;
    const q = PRESETS[id];
    gfx = id;
    world.gfx = id;
    world.quality = { ...q, auto: choice === 'auto', detected };
    world.postActive = !!(post && q.post);
    labelBtn();
    atmo.setQuality(q);
    const r = game.renderer;
    r.shadowMap.enabled = q.shadows;
    const wantType = q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const typeChanged = r.shadowMap.type !== wantType;
    r.shadowMap.type = wantType;
    r.shadowMap.autoUpdate = true;
    r.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
    try { post?.setSamples(q.msaa); } catch (e) { console.warn('[world] msaa change failed', e); }
    game.resize();
    if (!prev || prev.shadows !== q.shadows || typeChanged || prev.lights !== q.lights) {
      game.scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    }
    game.bus.emit('graphics:change', { preset: id, quality: world.quality });
  }
  function setGraphics(q) {
    if (q !== 'auto' && !PRESETS[q]) q = 'high';
    choice = q;
    try { localStorage.setItem(GFX_KEY, q); } catch { /* ignore */ }
    if (q === 'auto') autoLevel = detected;
    applyPreset(q === 'auto' ? autoLevel : q);
  }
  world.setGraphics = setGraphics;
  world.graphicsPresets = PRESETS;
  applyPreset(gfx);

  // Auto mode safety net: if real gameplay keeps averaging under ~30 fps, step down one preset (once per level).
  let perfAcc = 0, perfN = 0, perfWarm = 0;
  function autoTune(dt) {
    if (choice !== 'auto' || game.devMode || !game.started || document.hidden || gfx === 'low') { perfAcc = perfN = 0; return; }
    if (dt > 0.25 || game.ui.isBlocking()) return; // hitches, tab switches, menus
    if ((perfWarm += dt) < 6) return;          // let shaders / textures settle after start
    perfAcc += dt; perfN++;
    if (perfAcc < 10) return;
    const fps = perfN / perfAcc;
    perfAcc = perfN = 0;
    if (fps < 30) {
      autoLevel = ORDER[Math.max(0, ORDER.indexOf(gfx) - 1)];
      applyPreset(autoLevel);
      perfWarm = 0;
      game.ui.toast(`Running at ${Math.round(fps)} fps, so graphics dropped to <b>${PRESETS[autoLevel].label}</b>. Change it in Esc → Graphics.`, 'info', 5000);
    }
  }

  // ---- per-frame visuals (run from renderFn so they see this frame's camera)
  const tmpBox = new THREE.Vector3();
  const isleFog = new THREE.Color();
  let fpsAcc = 0, fpsN = 0;
  world.stats = { fps: 0, calls: 0, tris: 0, verts, chunks: chunks.length, buildMs: 0, camBoxes: camCol?.n ?? 0 };
  function visuals(dt) {
    const cam = game.camera.position;
    const focus = map.focus() ?? cam;
    let env = { night: 0, wet: 0, daylight: 1, flash: 0 };
    try { env = atmo.update(dt, focus); } catch (e) { if (!visuals._e1) { console.error('[world] atmosphere', e); visuals._e1 = true; } }
    // Blackwater sea mist: thicker, greener fog over the island and the bridge
    const isleK = Math.max(0, Math.min(1, (focus.x - 640) / 180));
    if (isleK > 0 && game.scene.fog) {
      const f = game.scene.fog;
      f.near *= 1 - 0.4 * isleK; f.far *= 1 - 0.2 * isleK;
      const l = (f.color.r + f.color.g + f.color.b) / 3;
      isleFog.setRGB(l * 0.85, l * 1.0, l * 0.98);
      f.color.lerp(isleFog, 0.35 * isleK);
    }
    try { mats.update(game.elapsed, env.lamps ?? env.night, env.wet, env.daylight, env.scatter ?? 0, env.fogFar ?? 500); } catch (e) { if (!visuals._e2) { console.error('[world] mats', e); visuals._e2 = true; } }
    try { particles.update(dt, cam, game.scene, 0.22 + env.daylight * 0.78); } catch (e) { if (!visuals._e3) { console.error('[world] particles', e); visuals._e3 = true; } }
    // chunk culling by distance
    const far = Math.min(900, atmo.fogFar + 160);
    const Q = world.quality, dd = Q.detailDist, drd = Q.dressDist;
    for (const c of chunks) {
      const b = c.userData.box;
      tmpBox.set(Math.max(b.min.x, Math.min(cam.x, b.max.x)), 0, Math.max(b.min.z, Math.min(cam.z, b.max.z)));
      const d = Math.hypot(tmpBox.x - cam.x, tmpBox.z - cam.z);
      c.visible = d < far;
      const det = d < dd;
      for (const m of c.userData.detail) m.visible = det;
      const dr = d < drd;
      for (const m of c.userData.dress) m.visible = dr;
    }
    if (skyline) { try { skyline.update(atmo, cam, game.elapsed); } catch (e) { if (!visuals._e4) { console.error('[world] skyline', e); visuals._e4 = true; } } }
    if (post) post.update(env);
    for (const o of isle.live) {
      const near = Math.hypot(o.x - cam.x, o.z - cam.z) < (o.range ?? 500);
      o.object.visible = near;
      if (near) { try { o.update(dt, { ...env, fog: atmo.weather === 'fog' ? 1 : atmo.weather === 'rain' || atmo.weather === 'storm' ? 0.5 : 0 }); } catch (e) { if (!o._err) { console.error('[world] island live', e); o._err = true; } } }
    }
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) { world.stats.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  }
  let shadowFrame = 0;
  game.renderer.info.autoReset = false;
  game.renderFn = (dt) => {
    game.renderer.info.reset();
    visuals(dt);
    // Medium refreshes the sun's shadow map every other frame (the sampling matrix stays in sync with the map).
    const r = game.renderer, every = world.quality.shadowEvery;
    if (every > 1) { r.shadowMap.autoUpdate = false; if ((++shadowFrame) % every === 0) r.shadowMap.needsUpdate = true; } else r.shadowMap.autoUpdate = true;
    if (post && world.quality.post) post.render(dt);
    else r.render(game.scene, game.camera);
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
      try { autoTune(dt); } catch { /* never let tuning break the frame */ }
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

  stageMs[stName] = Math.round(performance.now() - stT);
  world.stats.stages = stageMs;
  world.stats.buildMs = Math.round(performance.now() - t0);
  world.stats.islandWaterBoxes = C.islandWaterBoxes;
  console.info(`[world] Rotwell built in ${world.stats.buildMs}ms: ${layout.nodes.length} nodes, ${layout.edges.length} edges, ${layout.lots.length} lots, ${chunks.length} chunks, ${verts} verts, ${lights.length} light sources`);
}
