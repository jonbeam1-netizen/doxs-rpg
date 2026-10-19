import { rand, chance, weightedPick, mulberry32, pick } from '../core/util.js';

// Ambient population streaming + the five persistent district dealers.
//  - Peaceful pedestrians are local-only on every machine.
//  - Hostile-capable street trash (muggers, gang members) is spawned by the
//    authority as networked NPCs so co-op partners see the same goons.
const LOCAL = {
  downtown:   { day: [['ped', 50], ['worker', 12], ['shady', 6], ['hobo', 8], ['cop', 7], ['snob', 6]],
                night: [['ped', 28], ['drunk', 16], ['hobo', 10], ['shady', 10], ['cop', 7], ['worker', 4]] },
  hilltop:    { day: [['snob', 55], ['ped', 22], ['cop', 9], ['shady', 3], ['worker', 6]],
                night: [['snob', 32], ['ped', 14], ['drunk', 10], ['cop', 10], ['shady', 4]] },
  rustyards:  { day: [['worker', 55], ['ped', 18], ['hobo', 8], ['shady', 6], ['drunk', 4], ['cop', 3]],
                night: [['worker', 18], ['drunk', 24], ['ped', 8], ['hobo', 10], ['shady', 8]] },
  gutterside: { day: [['ped', 34], ['hobo', 22], ['drunk', 10], ['shady', 10], ['worker', 6], ['cop', 3]],
                night: [['hobo', 20], ['drunk', 24], ['ped', 14], ['shady', 12], ['cop', 2]] },
  dustbowl:   { day: [['ped', 30], ['hobo', 10], ['drunk', 10], ['worker', 10], ['shady', 5]],
                night: [['drunk', 22], ['ped', 14], ['hobo', 10], ['shady', 6]] },
};
// hostile-capable per player: [day, night], plus which kinds
const HOSTILE = {
  downtown:   { n: [0, 2], kinds: [['thug', 1]] },
  hilltop:    { n: [1, 1], kinds: [['syndicate', 1]] },
  rustyards:  { n: [0, 4], kinds: [['thug', 3], ['bikers', 1]] },
  gutterside: { n: [2, 5], kinds: [['rats', 3], ['thug', 2]] },
  dustbowl:   { n: [3, 4], kinds: [['bikers', 4], ['thug', 1]] },
};
const DEALER_NAMES = {
  downtown: 'Slick Nicky Two-Phones', hilltop: 'Preston "Powder" Pemberton', rustyards: 'Dockside Dmitri',
  gutterside: 'Lil Sneezy', dustbowl: 'Cactus Carl',
};
const DEALER_PREF = ['liquor', 'pawn', 'bar', 'tattoo', 'gas', 'diner', 'junkyard', 'factory', 'nightclub', 'casino', 'store', 'fortune'];
const SPAWN_MIN = 55, SPAWN_MAX = 85, DESPAWN = 130;

function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

export class Ambient {
  constructor(game, ctx) {
    this.game = game;
    this.ctx = ctx;
    this.t = 0;
    this.filled = false;
    this.dealers = {};
    this.dealerDead = {};
    this.enabled = true;
    this.density = 1;
    game.bus.on('game:start', () => { this.filled = false; this.placeDealers(); });
    game.bus.on('time:hour', () => this._respawnDealers());
  }

  _district(x, z) {
    try { return this.game.world?.districtAt?.(x, z) || 'downtown'; } catch { return 'downtown'; }
  }

  update(dt) {
    const g = this.game;
    if (!g.started || !this.enabled) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const pl = g.player;
    const lp = pl.vehicle ? (pl.vehicle.group?.position ?? pl.pos) : pl.pos;
    const night = g.time.isNight;
    const npcs = this.ctx.npcs;
    const auth = g.net.isAuthority;

    // centers for networked spawns: every player when hosting
    const centers = [{ x: lp.x, z: lp.z, local: true }];
    if (auth && g.net.connected) {
      for (const r of g.net.remotePlayers?.values?.() || []) { const p = r.pos || r.group?.position; if (p) centers.push({ x: p.x, z: p.z }); }
    }

    // despawn & count
    let localCount = 0;
    const hostileNear = new Array(centers.length).fill(0);
    for (const n of [...npcs.map.values()]) {
      if (!n.data?.ambient || n.replica) continue;
      let dmin = Infinity, ci = 0;
      if (n.networked) {
        centers.forEach((c, i) => { const d = Math.hypot(n.pos.x - c.x, n.pos.z - c.z); if (d < dmin) { dmin = d; ci = i; } });
      } else dmin = Math.hypot(n.pos.x - lp.x, n.pos.z - lp.z);
      const busy = n.brawlId || (n.hostile && n.target && dmin < 70);
      if (dmin > DESPAWN && !busy) { npcs.remove(n); continue; }
      if (n.leaving && dmin > 60) { npcs.remove(n); continue; }
      if (n.dead) continue;
      if (n.networked) { if (dmin < 95) hostileNear[ci]++; } else if (dmin < 100) localCount++;
    }

    // local peaceful population
    const dist = this._district(lp.x, lp.z);
    const danger = this._danger(dist);
    const hour = g.time.hour;
    const lateNight = hour >= 1 && hour < 5;
    // (~40% thinner than round 1: the streets felt like a parade)
    let target = (night ? 14 + danger : 20 + danger * 2) * 0.6;
    if (lateNight) target *= 0.7;
    if (pl.vehicle) target *= 0.8;
    target = Math.round(target * this.density);
    const fill = !this.filled;
    let spawned = 0;
    while (localCount < target && spawned < (fill ? 30 : 2)) {
      const p = this._spawnPoint(lp, fill);
      if (!p) break;
      const d = this._district(p.x, p.z);
      const table = (LOCAL[d] || LOCAL.downtown)[night ? 'night' : 'day'];
      this._spawnLocal(weightedPick(table), p, d);
      localCount++; spawned++;
    }
    this.filled = true;

    // authority: muggers / gangbangers around each player
    if (auth) {
      centers.forEach((c, i) => {
        const d = this._district(c.x, c.z);
        const H = HOSTILE[d] || HOSTILE.downtown;
        const want = Math.round(H.n[night ? 1 : 0] * this.density * (lateNight ? 1.3 : 1));
        if (hostileNear[i] < want && chance(0.35)) {
          const p = this._spawnPoint(c, false);
          if (p) this._spawnHostile(weightedPick(H.kinds), p, this._district(p.x, p.z), night);
        }
      });
    }
  }

  _danger(d) {
    return ({ downtown: 2, hilltop: 1, rustyards: 3, gutterside: 4, dustbowl: 3 })[d] ?? 2;
  }

  _spawnPoint(c, fill) {
    const g = this.game;
    const w = g.world;
    const min = fill ? 10 : SPAWN_MIN, max = fill ? 80 : SPAWN_MAX;
    const B = w?.bounds;
    const ok = (x, z) => (!B || (x > B.minX + 2 && x < B.maxX - 2 && z > B.minZ + 2 && z < B.maxZ - 2)) && !g.physics.pointBlocked(x, z);
    // Preferred: a real sidewalk spot near the player. If the world can't find one, don't spawn.
    if (typeof w?.sidewalkPointNear === 'function') {
      for (let i = 0; i < 3; i++) {
        let p = null;
        try { p = w.sidewalkPointNear(c.x, c.z, min, max); } catch { p = null; }
        if (p && ok(p.x, p.z)) return p;
      }
      return null;
    }
    if (w?.randomSidewalkPoint) {
      for (let i = 0; i < 8; i++) {
        let p = null;
        try { p = w.randomSidewalkPoint(i < 5 ? this._district(c.x, c.z) : undefined); } catch { p = null; }
        if (!p) break;
        const d = Math.hypot(p.x - c.x, p.z - c.z);
        if (d >= min && d <= max && ok(p.x, p.z)) return p;
      }
    }
    const npcs = this.ctx.npcs;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(min, max);
      const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
      if (ok(x, z) && npcs.walkable(x, z)) return { x, z };
    }
    return null;
  }

  _spawnLocal(role, p, district) {
    const spec = { x: p.x, z: p.z, role, data: { ambient: true, district } };
    if (role === 'hobo') spec.kind = 'hobo';
    else if (role === 'drunk') spec.kind = 'drunk';
    else if (role === 'cop') { spec.kind = 'cop'; spec.weapon = chance(0.25) ? 'pistol' : 'baton'; spec.data.patrol = true; }
    else spec.kind = 'ped';
    return this.ctx.npcs.spawn(spec);
  }

  _spawnHostile(kind, p, district, night) {
    const spec = { x: p.x, z: p.z, networked: true, data: { ambient: true, district } };
    if (kind === 'thug') {
      Object.assign(spec, { kind: 'thug', role: 'thug' });
      spec.data.mugger = night || chance(0.2);
    } else {
      Object.assign(spec, { kind: 'gang', role: 'gang', faction: kind });
      spec.data.mugger = night ? chance(0.4) : chance(0.08);
    }
    const n = this.ctx.npcs.spawn(spec);
    if (n && n.data.mugger) n.aggressor = true;
    return n;
  }

  // Bystanders scatter from gunfire / murder.
  panic(x, z, r) {
    for (const n of this.ctx.npcs.near(x, z, r)) {
      if (n.replica || n.hostile || n.brawlId || n.kind === 'cop' || n.kind === 'static' || n.kind === 'dealer') continue;
      if (['thug', 'gang'].includes(n.kind)) continue;
      if (n.state !== 'flee') {
        this.ctx.npcs._flee(n, null);
        n.fleePoint = { x, z };
        n.fleeFrom = { type: 'player' };
      }
    }
  }

  // ------------------------------------------------------------ dealers
  placeDealers() {
    const g = this.game;
    const districts = ['downtown', 'hilltop', 'rustyards', 'gutterside', 'dustbowl'];
    for (const d of districts) {
      if (this.dealers[d] && !this.dealers[d].removed) continue;
      if (this.dealerDead[d]) continue;
      const spot = this._dealerSpot(d);
      if (!spot) continue;
      this._spawnDealer(d, spot);
    }
  }

  _dealerSpot(d) {
    const g = this.game;
    const custom = g.world?.dealerSpots?.[d];
    if (custom) return { x: custom.x, z: custom.z, facing: custom.facing ?? 0 };
    const rng = mulberry32(0xD0C5 ^ hashStr(d));
    const locs = (g.locations.list || []).filter((l) => l.district === d && !['police', 'hospital', 'city_hall', 'church'].includes(l.type))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    if (locs.length) {
      const pref = locs.filter((l) => DEALER_PREF.includes(l.type));
      const pool = pref.length ? pref : locs;
      const loc = pool[Math.floor(rng() * pool.length)];
      const dx0 = (loc.doorX ?? loc.x) - loc.x, dz0 = (loc.doorZ ?? loc.z) - loc.z;
      const len = Math.hypot(dx0, dz0) || 1;
      const nx = dx0 / len, nz = dz0 / len;
      const side = rng() < 0.5 ? -1 : 1;
      const off = 5 + rng() * 3;
      let x = (loc.doorX ?? loc.x) + nx * 2.2 + -nz * side * off;
      let z = (loc.doorZ ?? loc.z) + nz * 2.2 + nx * side * off;
      const r = g.physics.resolveCircle(x, z, 0.6);
      return { x: r.x, z: r.z, facing: Math.atan2(nx, nz) };
    }
    try {
      const p = g.world?.randomSidewalkPoint?.(d);
      if (p) return { x: p.x, z: p.z, facing: 0 };
    } catch { /* ignore */ }
    return null;
  }

  _spawnDealer(d, spot) {
    const rng = mulberry32(0xBADD ^ hashStr(d));
    const name = DEALER_NAMES[d] || 'Some Guy';
    const n = this.ctx.npcs.spawn({
      id: 'dealer_' + d, kind: 'dealer', role: 'dealer', name, x: spot.x, z: spot.z, facing: spot.facing,
      persistent: true, wander: false, leash: 4,
      color: ['#22201c', '#2a1f2e', '#1c2620', '#2e2a1c', '#202a2e'][Math.floor(rng() * 5)],
      hat: ['cap', 'fedora', 'beanie', 'cap', null][Math.floor(rng() * 5)],
      hatColor: ['#a5c234', '#161210', '#7a1f2b', '#c9a227'][Math.floor(rng() * 4)],
      scale: 0.95 + rng() * 0.1,
      talkPrompt: `Talk to ${name} <small>(dealer)</small>`,
      data: { dealer: true, district: d },
    });
    if (n) this.dealers[d] = n;
    return n;
  }

  dealerDown(npc) {
    const d = npc.data?.district;
    if (d) this.dealerDead[d] = this.game.time.total + 8 * 60; // back in business in 8 game hours
  }

  _respawnDealers() {
    const now = this.game.time.total;
    for (const [d, t] of Object.entries(this.dealerDead)) {
      if (now >= t) {
        delete this.dealerDead[d];
        const cur = this.dealers[d];
        if (cur && !cur.removed) this.ctx.npcs.remove(cur);
        delete this.dealers[d];
      }
    }
    this.placeDealers();
  }
}
