import { mulberry32 } from '../core/util.js';
import { CHARACTERS } from '../data/quests.js';

// Deterministic placement of street interactables on top of the world API.
// Everything here only reads world data that is identical on every co-op
// client (layout, world physics boxes, location doors), and uses a fixed-seed
// RNG, so every client puts every object in the same place with the same id.

export const SEED = 0x1A7E_2077;

const DIST_W = { downtown: 0.3, gutterside: 0.25, hilltop: 0.14, rustyards: 0.15, dustbowl: 0.07, blackwater: 0.09 };

export function quotas(count, weights = DIST_W) {
  const tot = Object.values(weights).reduce((a, b) => a + b, 0);
  const q = {}; let sum = 0;
  for (const [d, w] of Object.entries(weights)) { q[d] = Math.floor(count * w / tot); sum += q[d]; }
  const order = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  for (let i = 0; sum < count; i = (i + 1) % order.length) { q[order[i][0]]++; sum++; }
  return q;
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

function segDist(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / l2));
  const cx = x1 + dx * t, cz = z1 + dz * t;
  return { d: Math.hypot(px - cx, pz - cz), cx, cz };
}

export class Placer {
  constructor(game) {
    this.g = game;
    this.w = game.world;
    this.ph = game.physics;
    this.taken = [];           // { x, z, r, kind }
    this.avoid = [];           // { x, z, r } doors, NPC spots, fixed interactions
    const L = game.locations.list;
    for (const l of L) this.avoid.push({ x: l.doorX ?? l.x, z: l.doorZ ?? l.z, r: 3.2 });
    for (const s of this.w.seats || []) this.avoid.push({ x: s.x, z: s.z, r: 1.6 + (s.width || 1) / 2 });
    for (const s of Object.values(this.w.dealerSpots || {})) this.avoid.push({ x: s.x, z: s.z, r: 3 });
    for (const it of game.interact.items.values()) if (!it.getPos && !String(it.id).startsWith('loc:') && Number.isFinite(it.x)) this.avoid.push({ x: it.x, z: it.z, r: 3.5 });
    // story characters, the heist board and Kev: no hydrant/ATM parked on top of a quest giver
    // (the nearest "E" prompt wins, so a prop there hijacks the conversation).
    try {
      const pts = [];
      const qw = game.quests?.world;
      if (qw?._placeFor) for (const c of Object.values(CHARACTERS)) pts.push(qw._placeFor(c)); // deterministic, same as the spawn
      pts.push(game.heists?.planner?.pos, game.skate?.vendor?.npc?.pos);
      for (const p of pts) if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) this.avoid.push({ x: p.x, z: p.z, r: 3.5 });
    } catch { /* optional modules */ }
    const isle = this.w.island;
    if (isle?.spots) for (const s of Object.values(isle.spots)) if (Number.isFinite(s?.x) && Number.isFinite(s?.z)) this.avoid.push({ x: s.x, z: s.z, r: 4 });
    this._wall = null;
  }

  blocked(x, z) { const b = this.ph.pointBlocked(x, z); return !!b; }
  // a real building wall (not a low garden wall / fence / prop)
  tall(x, z) { return !!this.ph.pointBlocked(x, z, 3); }
  district(x, z) { return this.w.districtAt(x, z); }

  clear(x, z, r = 2) {
    for (const a of this.avoid) if ((a.x - x) ** 2 + (a.z - z) ** 2 < (a.r + r * 0.25) ** 2) return false;
    for (const t of this.taken) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + r) ** 2) return false;
    return true;
  }

  near(kind, x, z, d) {
    for (const t of this.taken) if (t.kind === kind && (t.x - x) ** 2 + (t.z - z) ** 2 < d * d) return true;
    return false;
  }

  take(x, z, r, kind) { this.taken.push({ x, z, r, kind }); }

  // Distance from (x,z) back along -dir to the first blocked point (the wall), or null.
  wallDist(x, z, fx, fz, max = 1.4) {
    for (let t = 0; t <= max; t += 0.04) if (this.blocked(x - fx * t, z - fz * t)) return t;
    return null;
  }

  // Every facade spot in the city (from world.wallSpots), deterministic order.
  wallSpots() {
    if (this._wall) return this._wall;
    let list = [];
    try { list = this.w.wallSpots(320, 0, 1150) || []; } catch { list = []; }
    list = list.map((s) => ({ x: s.x, z: s.z, facing: s.facing, src: 'front' }));
    list.sort((a, b) => a.x - b.x || a.z - b.z);
    this._wall = list;
    return list;
  }

  // Side/back walls of lots (alleys): stand points 0.5 from the wall, facing out.
  alleySpots(rng) {
    const out = [];
    const lots = this.w.layout?.lots || [];
    for (const l of lots) {
      if (l.fx == null || !Number.isFinite(l.cx)) continue;
      const fx = l.fx, fz = l.fz, sx = -fz, sz = fx; // front / side axes
      const cand = [
        [sx, sz, l.w / 2], [-sx, -sz, l.w / 2], [-fx, -fz, l.d / 2],
      ];
      for (const [dx, dz, half] of cand) {
        const along = (rng() - 0.5) * 0.6 * (dx === -fx && dz === -fz ? l.w : l.d);
        const ax = dx === -fx && dz === -fz ? sx : fx, az = dx === -fx && dz === -fz ? sz : fz;
        const px = l.cx + dx * (half + 1.6) + ax * along, pz = l.cz + dz * (half + 1.6) + az * along;
        if (this.blocked(px, pz)) continue;
        const wd = this.wallDist(px, pz, dx, dz, 2.6);
        if (wd == null) continue;
        const x = px - dx * (wd - 0.5), z = pz - dz * (wd - 0.5);
        out.push({ x, z, facing: Math.atan2(dx, dz), src: 'alley', lot: l });
      }
    }
    return out;
  }

  walks() { return this.w.layout?.walks || []; }

  // Curb-side point along a sidewalk strip (toward the road), facing the building side.
  curbSpot(w, t, inset = 0.45) {
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    const nx = -uz, nz = ux;
    const mx = w.x1 + dx * t, mz = w.z1 + dz * t;
    // which side is the road? nearest road segment
    const R = this.w.roads; let best = null;
    for (const e of R.info) {
      const A = R.nodes[e.a], B = R.nodes[e.b];
      const r = segDist(mx, mz, A.x, A.z, B.x, B.z);
      if (!best || r.d < best.d) best = r;
    }
    if (!best) return null;
    const side = ((best.cx - mx) * nx + (best.cz - mz) * nz) >= 0 ? 1 : -1;
    const lat = side * (w.width / 2 - inset);
    const x = mx + nx * lat, z = mz + nz * lat;
    // face away from the road (toward the sidewalk/buildings)
    return { x, z, facing: Math.atan2(-nx * side, -nz * side), rx: ux, rz: uz, roadD: best.d };
  }

  // Is the footprint (w x d, centered, facing) free of physics boxes, with a free stand point in front?
  footprintFree(x, z, facing, w, d, front = 0.9) {
    const fx = Math.sin(facing), fz = Math.cos(facing), sx = fz, sz = -fx;
    for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1], [-1, 0], [1, 0]]) {
      const px = x + sx * a * w / 2 * 0.95 + fx * b * d / 2 * 0.95, pz = z + sz * a * w / 2 * 0.95 + fz * b * d / 2 * 0.95;
      if (this.blocked(px, pz)) return false;
    }
    if (front > 0) {
      const px = x + fx * (d / 2 + front), pz = z + fz * (d / 2 + front);
      if (this.blocked(px, pz) || this.ph.resolveCircle(px, pz, 0.4).hit) return false;
    }
    return true;
  }

  // Breathing room: no other solid prop within `pad` of the footprint's sides/front
  // (the back is skipped when `wall` is set). Keeps our things from huddling
  // against world benches, lamps, bins and bollards.
  roomy(x, z, facing, w, d, pad = 1.0, wall = false) {
    const fx = Math.sin(facing), fz = Math.cos(facing), sx = fz, sz = -fx;
    const pts = [[-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1]];
    if (!wall) pts.push([0, -1], [-1, -1], [1, -1]);
    for (const [a, b] of pts) {
      const ox = a * (w / 2 + pad), oz = b * (d / 2 + pad);
      const px = x + sx * ox + fx * oz, pz = z + sz * ox + fz * oz;
      const hit = this.ph.pointBlocked(px, pz);
      if (hit && !(wall && b <= 0 && hit.height >= 3)) return false;
    }
    return true;
  }

  // Put a w x d object flush against the wall behind a stand spot. Returns {x, z, facing, wall} or null.
  againstWall(s, w, d, gap = 0.04) {
    const fx = Math.sin(s.facing), fz = Math.cos(s.facing);
    const wd = this.wallDist(s.x, s.z, fx, fz, 1.4);
    if (wd == null) return null;
    const wx = s.x - fx * wd, wz = s.z - fz * wd; // wall surface point
    const x = wx + fx * (d / 2 + gap), z = wz + fz * (d / 2 + gap);
    // the wall must continue behind the whole width (no corners/doorways)
    const sx = fz, sz = -fx;
    for (const a of [-1, 0, 1]) if (!this.tall(wx - fx * 0.12 + sx * a * w / 2, wz - fz * 0.12 + sz * a * w / 2)) return null;
    if (!this.footprintFree(x + fx * 0.02, z + fz * 0.02, s.facing, w * 0.98, d * 0.9, 0.9)) return null;
    if (!this.roomy(x, z, s.facing, w, d, 0.8, true)) return null;
    return { x, z, facing: s.facing, wx, wz };
  }

  // Coarse flood fill: can you walk from (x,z) to a sidewalk within `max` cells?
  reachable(x, z, max = 1800) {
    const free = (cx, cz) => {
      if (this.blocked(cx, cz)) return false;
      for (const [ox, oz] of [[0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) if (this.blocked(cx + ox, cz + oz)) return false;
      return true;
    };
    const seen = new Set(), q = [[0, 0]];
    seen.add('0,0');
    for (let h = 0; h < q.length && h < max; h++) {
      const [i, j] = q[h];
      const cx = x + i, cz = z + j;
      if (this.w.onSidewalk(cx, cz)) return true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj, k = ni + ',' + nj;
        if (seen.has(k)) continue;
        seen.add(k);
        if (free(x + ni, z + nj)) q.push([ni, nj]);
      }
    }
    return false;
  }

  // Generic picker: walk shuffled candidates, fill per-district quotas, then top up anywhere.
  pick(cands, { count, kind, quota = null, minSame = 40, rClear = 2.5, fit, rng }) {
    const out = [];
    const q = quota ? { ...quota } : null;
    const list = shuffle(cands.slice(), rng);
    const tryList = (strict) => {
      for (const c of list) {
        if (out.length >= count) return;
        if (c._used) continue;
        const d = this.district(c.x, c.z);
        if (strict && q && !(q[d] > 0)) continue;
        if (!this.clear(c.x, c.z, rClear)) continue;
        if (this.near(kind, c.x, c.z, strict ? minSame : minSame * 0.6)) continue;
        const r = fit(c, d);
        if (!r) continue;
        c._used = true;
        if (strict && q) q[d]--;
        this.take(r.x, r.z, rClear, kind);
        out.push({ ...r, district: d });
      }
    };
    tryList(true);
    if (out.length < count) tryList(false);
    return out;
  }
}

export function rngFor(name) {
  let h = SEED;
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return mulberry32(h);
}
