import { createCtx } from './common.js';
import { Birds } from './birds.js';
import { Rats } from './rats.js';
import { Dogs } from './dogs.js';
import { Bits } from './bits.js';

// Ambient animal life (local-only cosmetics, streamed around the player like the crowd):
//   pigeons, crows, gulls (birds.js) · rats (rats.js) · stray dogs you can pet (dogs.js)
//   · tumbling newspapers, moths at streetlights, jumping fish (bits.js)
//
// game.life = { stats {ms, birds, rats, dogs, sheets}, scare(x, z, r, kind), enabled,
//               birds, rats, dogs, bits }   (kind: 'gun' | 'boom' | 'body' | 'swing')
// Listens to: player:attack, npc:killed, car:destroyed, game:start, state:reset, time:change.

export async function installLife(game) {
  const ctx = createCtx(game);
  ctx.props = { lamps: [], poles: [], dumpsters: [] };
  const birds = new Birds(ctx), rats = new Rats(ctx), dogs = new Dogs(ctx), bits = new Bits(ctx);
  const systems = [birds, rats, dogs, bits];
  const errs = new Set();
  const safe = (s, fn) => { try { fn(); } catch (e) { if (!errs.has(s)) { errs.add(s); console.error('[life]', s.constructor.name, e); } } };

  const scare = (x, z, r, kind = 'gun') => { for (const s of systems) safe(s, () => s.scare?.(x, z, r, kind)); };
  const clear = () => { for (const s of systems) safe(s, () => s.clear()); ctx.props.lamps = []; ctx.props.poles = []; ctx.props.dumpsters = []; scanT = 0; };

  game.bus.on('player:attack', (e) => {
    const f = ctx.focus;
    if (e?.gun) scare(f.x, f.z, 38, 'gun');
    else scare(f.x, f.z, 3.5, 'swing');
  });
  game.bus.on('npc:killed', (e) => { const p = e?.npc?.pos; if (p) scare(p.x, p.z, 16, 'body'); });
  game.bus.on('car:destroyed', () => scare(ctx.focus.x, ctx.focus.z, 45, 'boom'));
  game.bus.on('game:start', clear);
  game.bus.on('state:reset', clear);
  game.bus.on('time:change', (e) => { if ((e?.skipped ?? 0) >= 60) clear(); });

  // Perch / hiding props, recognised from their colliders (the world doesn't list them):
  //   streetlight 0.5x0.5 box, h 7.2 / 7.4 / 8.5 · wooden utility pole 0.5x0.5, h 9 · dumpster 2.3x1.5, h 1.6
  let scanT = 0;
  const near = (a, b, e = 0.03) => Math.abs(a - b) < e;
  const topClear = new Map();
  function scan() {
    const F = ctx.focus, R = 80, lamps = [], poles = [], dumpsters = [];
    for (const b of game.physics.query(F.x - R, F.z - R, F.x + R, F.z + R)) {
      const w = b.maxX - b.minX, d = b.maxZ - b.minZ, h = b.height;
      if (near(w, 0.5) && near(d, 0.5)) {
        const isLamp = near(h, 7.2) || near(h, 7.4) || near(h, 8.5), isPole = near(h, 9);
        if (!isLamp && !isPole) continue;
        const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2, key = x.toFixed(1) + ',' + z.toFixed(1);
        // nothing overhead (an overpass, an awning)
        if (!topClear.has(key)) topClear.set(key, ctx.segClear(x, h + 0.15, z, x, h + 4, z));
        if (!topClear.get(key)) continue;
        (isLamp ? lamps : poles).push({ x, z, h });
      } else if (near(h, 1.6) && ((near(w, 2.3, 0.06) && near(d, 1.5, 0.06)) || (near(w, 1.5, 0.06) && near(d, 2.3, 0.06)))) {
        dumpsters.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, key: 'd' + b.minX.toFixed(1) + ',' + b.minZ.toFixed(1) });
      }
    }
    ctx.props.lamps = lamps; ctx.props.poles = poles; ctx.props.dumpsters = dumpsters;
  }

  const stats = { ms: 0, peak: 0, birds: 0, rats: 0, dogs: 0, sheets: 0 };
  const life = { stats, scare, enabled: true, birds, rats, dogs, bits, ctx, clear };
  game.life = life;

  game.addSystem({
    name: 'life',
    update(dt) {
      if (!game.started || !life.enabled || !game.world) return;
      const t0 = performance.now();
      ctx.update(dt);
      scanT -= dt;
      if (scanT <= 0) { scanT = 3; safe(life, scan); }
      for (const s of systems) safe(s, () => s.update(dt));
      const ms = performance.now() - t0;
      stats.ms = stats.ms * 0.95 + ms * 0.05;
      stats.peak = Math.max(stats.peak * 0.995, ms);
      stats.birds = birds.birds.length; stats.rats = rats.rats.length; stats.dogs = dogs.dogs.length; stats.sheets = bits.sheets.length;
    },
  });
}
