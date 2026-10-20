// NPCs, combat & police (npc agent).
//   game.npcs   -> NPCManager (spawn/get/remove/list/near/damage/serialize/applySnapshot, + say/count)
//   game.combat -> player combat, brawls, death/KO, police helpers
// Net message types (all { t, ... }):
//   npc:snap            host -> all     networked NPC snapshot (~10Hz)
//   npc:damage          client -> host  { id, dmg, kx, kz, heavy, kb, kd?, gb, pw, bl }  (knockdown, guard break, heavy power, was blocked)
//   npc:parried         client -> host  { id }  the client parried that NPC's swing (stagger it)
//   npc:kill            host -> killer  { info }  rewards/loot for the client who landed the final blow
//   combat:hitPlayer    host -> client  { dmg, lethal, cop, dx, dz, src, b, gun, from, m, hv, ub, kd, tz }
//                       (melee, heavy hit, unblockable, knocks down, taser) — block/parry/dodge resolve on the client
//   combat:down         client -> host  { ko | died }  (ends brawls aimed at that client)
//   combat:brawl        client -> host  { id, spec }
//   combat:brawlResult  host -> client  { id, won }
//   combat:shot         any -> all      cosmetic tracers { x,y,z, s:[[x,z]...], w }
//   police:heat         client -> host  { heat, seen, lx, lz, hid }  so the host can send cops/cruisers
//                       after wanted clients and search where the client was last seen
// Pursuit vehicles (cruisers, roadblocks, helicopter) and their police:snap / police:hit /
// police:steal / police:tire messages live in src/vehicles/police.js.
import { NPCManager } from './manager.js';
import { Combat } from './combat.js';
import { Police } from './police.js';
import { Ambient } from './ambient.js';
import { Talk } from './talk.js';
import { FX } from './fx.js';
import { WEAPONS } from '../data/weapons.js';
import { clamp } from '../core/util.js';

export async function installNPCs(game) {
  const ctx = {};
  ctx.fx = new FX(game);
  ctx.npcs = new NPCManager(game, ctx);
  ctx.combat = new Combat(game, ctx);
  ctx.police = new Police(game, ctx);
  ctx.ambient = new Ambient(game, ctx);
  ctx.talk = new Talk(game, ctx);

  const npcs = ctx.npcs, combat = ctx.combat, police = ctx.police, fx = ctx.fx;

  // ---- public API: game.npcs
  game.npcs = npcs;
  npcs.say = (npcOrObj, text, opts) => fx.say(npcOrObj?.group || npcOrObj, text, opts);
  npcs.ambient = ctx.ambient;

  // ---- public API: game.combat
  game.combat = {
    startBrawl: (spec) => combat.startBrawl(spec),
    equip: (id) => combat.equip(id),
    get weapon() { return combat.weapon; },
    get weaponId() { return combat.weaponId; },
    giveWeapon: (id, ammo) => combat.giveWeapon(id, ammo),
    giveAmmo: (type, n) => combat.giveAmmo(type, n),
    cycle: (dir) => combat.cycle(dir),
    clearHeat: (silent) => police.clearHeat(silent),
    crime: (type, x, z) => police.crime(type, x ?? game.player.pos.x, z ?? game.player.pos.z),
    arrest: (opts) => police.arrest(opts),
    hurtPlayer: (dmg, opts) => combat.hurtPlayer(dmg, opts),
    knockout: () => combat.knockout(),
    inBrawl: () => combat.inBrawl(),
    get isDown() { return combat.isDown; },
    get downed() { return !!combat.isDown || combat.kdT > 0; }, // KO'd or knocked flat (co-op mirrors the pose)
    get brawls() { return combat.brawls; },
    fx, sfx: (name, opts) => fx.sfx.play(name, opts),
    hitStop: (sec) => fx.hitStop(sec),
    slowMo: (scale, sec) => fx.slowMo(scale, sec),
    get blocking() { return combat.blocking; },
    get lockTarget() { return combat.lock; },
    blood: (x, z, amt) => fx.blood(x, z, amt),
    dropCash: (x, z, amount) => fx.dropPickup(x, z, { kind: 'cash', amount }),
    _ctx: ctx,
  };

  // ---- public API: game.police (heat, evasion, wanted list for the pursuit fleet)
  game.police = {
    get heat() { return police.heat; },
    get seen() { return police.lastSeen < 1; },
    get searching() { return police.heat >= 1 && police.lastSeen > 1.25; },
    get lastKnown() { return police.lastKnown; },
    get hiding() { return police.hiding; },
    searchRadius: () => police.searchRadius(),
    wanted: () => police.wanted(),
    spawnCopAt: (w, lvl, x, z, data) => police.spawnCopAt(w, lvl, x, z, data),
    onRepaint: (car) => police.onRepaint(car),
    crime: (type, x, z) => police.crime(type, x ?? game.player.pos.x, z ?? game.player.pos.z),
    clearHeat: (silent) => police.clearHeat(silent),
    arrest: (opts) => police.arrest(opts),
  };

  // ---- per-frame
  game.addSystem({
    name: 'npc',
    update(dt) {
      if (!game.started) return;
      try { ctx.ambient.update(dt); } catch (e) { if (!ctx._ae) { console.error('[npc] ambient failed', e); ctx._ae = true; } }
      npcs.update(dt);
      try { police.update(dt); } catch (e) { if (!ctx._pe) { console.error('[npc] police failed', e); ctx._pe = true; } }
      try { combat.update(dt); } catch (e) { if (!ctx._ce) { console.error('[npc] combat failed', e); ctx._ce = true; } }
      fx.update(dt, (data, pos) => combat.onPickup(data, pos));
      // host snapshot broadcast
      const net = game.net;
      if (net.connected && net.isHost) {
        ctx.snapT = (ctx.snapT || 0) - dt;
        if (ctx.snapT <= 0) {
          ctx.snapT = 0.1;
          try { sendSnapshots(); } catch (e) { if (!ctx._ne) { console.error('[npc] snapshot failed', e); ctx._ne = true; } }
        }
      }
    },
  });

  // ---- networking
  const net = game.net;
  // Host: one snapshot per client, culled to what's around that client (SNAP_R), ~10 Hz.
  // Skipped (not queued) while that client's channel is backed up.
  const SNAP_R = 140;
  const views = new Map(); // peerId -> view state for npcs.serialize
  ctx.snapSeq = 0;
  function sendSnapshots() {
    const seq = ctx.snapSeq++;
    const meta = seq % 10 === 0, full = seq % 5 === 0; // full (with removals) 2x/s, look/name meta 1x/s
    const peers = net.peers?.() || [];
    for (const id of [...views.keys()]) if (!peers.some((p) => p.id === id)) views.delete(id);
    for (const { id } of peers) {
      let v = views.get(id);
      if (!v) { v = { peer: id, r: SNAP_R, known: new Set(), sig: new Map() }; views.set(id, v); }
      const rp = net.remotePlayers.get(id);
      if (rp && !rp._fresh) { v.x = rp.pos.x; v.z = rp.pos.z; } else { v.x = null; v.z = null; }
      v.meta = meta; v.full = full; v.tick = seq;
      if (net.session?.isCongested?.(id)) continue;
      net.sendTo(id, npcs.serialize(false, v));
    }
  }
  net.on('npc:snap', (msg) => { if (!net.isAuthority) npcs.applySnapshot(msg); });
  net.on('npc:damage', (msg, from) => {
    if (!net.isAuthority) return;
    const n = npcs.get(msg.id);
    if (!n || n.dead) return;
    const len = Math.hypot(msg.kx || 0, msg.kz || 0);
    const dir = len > 0 ? { x: msg.kx / len, z: msg.kz / len } : null;
    npcs._applyDamage(n, Math.max(0, Math.min(500, Number(msg.dmg) || 0)), from, {
      dir, heavy: !!msg.heavy, kb: clamp(Number(msg.kb) || 3, 0, 30),
      knockdown: msg.kd === 1 ? true : msg.kd === 0 ? false : undefined, guardBreak: !!msg.gb, power: clamp(Number(msg.pw) || 0, 0, 1), blocked: !!msg.bl,
    });
  });
  net.on('npc:parried', (msg) => { if (net.isAuthority) { const n = npcs.get(msg.id); if (n && !n.dead && !n.replica) npcs.parried(n); } });
  net.on('npc:kill', (msg) => { if (msg.info) combat.reward(msg.info); });
  net.on('combat:hitPlayer', (msg) => {
    const len = Math.hypot(msg.dx || 0, msg.dz || 0);
    combat.hurtPlayer(Math.max(0, Math.min(300, Number(msg.dmg) || 0)), {
      lethal: msg.lethal !== false, cop: !!msg.cop, gun: !!msg.gun, source: String(msg.src || 'a goon').slice(0, 40),
      dir: len > 0 ? { x: msg.dx / len, z: msg.dz / len } : null,
      npc: msg.from != null ? npcs.get(msg.from) : null,
      melee: !!msg.m, heavyHit: !!msg.hv, unblockable: !!msg.ub, knockdown: !!msg.kd, taser: !!msg.tz,
    });
  });
  net.on('combat:down', (msg, from) => { if (net.isAuthority) combat.onRemoteDown(from); });
  net.on('combat:brawl', (msg, from) => combat.onBrawlRequest(msg, from));
  net.on('combat:brawlResult', (msg) => combat.onBrawlResult(msg));
  net.on('combat:shot', (msg, from) => { if (from !== net.localId) combat.remoteShot(msg); });
  net.on('police:heat', (msg, from) => { if (net.isAuthority) police.onRemoteHeat(msg, from); });
  // late joiners get a full snapshot with looks/names right away
  game.bus.on('net:player-joined', ({ id } = {}) => {
    if (!net.isHost || !id) return;
    views.delete(id); // (re)joiner starts from a clean slate
    try { net.sendTo(id, npcs.serialize(true)); } catch (e) { console.error('[npc] join snapshot failed', e); }
  });
  // leaving co-op: drop replicas
  game.bus.on('net:disconnected', () => { for (const n of npcs.list()) if (n.replica) npcs.remove(n); });

  // ---- misc hooks
  game.bus.on('state:reset', () => {
    fx.clearPickups();
    for (const n of npcs.list()) if (!n.persistent) npcs.remove(n);
    combat.brawls.clear();
    const p = game.state.p;
    if (!WEAPONS[p.weapon]) p.weapon = 'fists';
  });
  game.bus.on('game:start', () => {
    if (game.state.p.heat > 0) game.ui.toast('Heads up: the cops still remember you.', 'bad');
  });

  // Character sheet: weapons & ammo
  game.ui.sheetSections?.push((g) => {
    const p = g.state.p;
    const ws = (p.weapons || []).filter((w) => WEAPONS[w]);
    const ammo = Object.entries(p.ammo || {}).filter(([, n]) => n > 0);
    return `<div class="ui-section">Arsenal</div><div class="ui-grid">${ws.map((w) => `<div class="ui-card">${WEAPONS[w].name}${w === combat.weaponId ? ' <span class="ui-muted">(equipped)</span>' : ''}<br><span class="ui-muted">DMG ${WEAPONS[w].damage}${WEAPONS[w].kind === 'gun' ? ` · mag ${p.mags?.[w] ?? 0}/${WEAPONS[w].mag}` : ''}</span></div>`).join('')}</div>`
      + (ammo.length ? `<div class="ui-muted" style="margin-top:6px">Ammo: ${ammo.map(([k, n]) => `${k} ×${n}`).join(' · ')}</div>` : '');
  });

  // Dealers need the world's locations; place now if they exist, else on game:start.
  try { ctx.ambient.placeDealers(); } catch (e) { console.error('[npc] dealers failed', e); }
}
