// City interactivity (interact agent): street objects you can use, collectibles,
// graffiti, odd jobs and random street events.
//
//   game.cityInteract = { objects, find(id), state(), stats() }
//
// Save:   state.p.interact = { v, rats:[ids], ratRewards:[n], tags:{spotId:day}, found:[ids],
//                              day:{key:day}, cd:{key:minute}, n:{counter:n}, job:{...}|null }
// Events: interact:collect {id, count, total}   interact:tag {id, count, total}
//         interact:dive {id, loot}               interact:vandal {kind, id}
//         interact:tip {id, amount}              interact:job {job, pay}
//         interact:event {kind, outcome}         interact:discover {id, kind}
//         interact:use {kind, id}                (generic: any street object used)
// Net:    {t:'interact:hydrant', id, until}  {t:'interact:tag', id, name, color}
//         {t:'interact:tags', list:[{id,name,color}]}  (sent to late joiners)
import * as THREE from 'three';
import { Placer, rngFor, quotas } from './place.js';
import { makeProp } from './meshes.js';
import { installStreet } from './street.js';
import { installCollect } from './collect.js';
import { installJobs } from './jobs.js';
import { installEvents } from './events.js';
import { fmtMoney, esc } from '../core/util.js';

const CSS = `
.ix-hold { position: fixed; left: 50%; bottom: 148px; transform: translateX(-50%); width: 260px; z-index: 40;
  background: rgba(10,9,8,.86); border: 1px solid #3b342b; padding: 6px 10px 8px; pointer-events: none;
  font-family: var(--font-body, sans-serif); color: var(--bone, #e6dfcf); font-size: 15px; text-align: center; }
.ix-hold.hidden { display: none; }
.ix-hold .bar { height: 8px; background: #221e1a; margin-top: 5px; border: 1px solid #000; }
.ix-hold .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #a5c234, #e0f070); }
.ix-sheet b { color: var(--bone, #e6dfcf); }
.ix-rats { display: inline-block; min-width: 140px; }
`;

export async function installInteract(game) {
  const st = game.state;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  const root = new THREE.Group(); root.name = 'city-interact';
  game.scene.add(root);

  // ---------------------------------------------------------------- save data
  function S() {
    const p = st.p;
    if (!p.interact || typeof p.interact !== 'object') p.interact = {};
    const s = p.interact;
    s.v = 1;
    if (!Array.isArray(s.rats)) s.rats = [];
    if (!Array.isArray(s.ratRewards)) s.ratRewards = [];
    if (!s.tags || typeof s.tags !== 'object') s.tags = {};
    if (!Array.isArray(s.found)) s.found = [];
    if (!s.day || typeof s.day !== 'object') s.day = {};
    if (!s.cd || typeof s.cd !== 'object') s.cd = {};
    if (!s.n || typeof s.n !== 'object') s.n = {};
    if (s.job === undefined) s.job = null;
    return s;
  }

  // ---------------------------------------------------------------- shared helpers
  const objects = [];
  const byId = new Map();
  const I = {
    game, root, objects, S,
    placer: new Placer(game),
    rng: rngFor,
    quotas,
    usedToday: (key) => S().day[key] === game.time.day,
    markDay: (key) => { S().day[key] = game.time.day; },
    ready: (key) => (S().cd[key] ?? -1) <= game.time.total,
    cool: (key, minutes) => { S().cd[key] = Math.round(game.time.total + minutes); },
    left: (key) => Math.max(0, Math.ceil((S().cd[key] ?? 0) - game.time.total)),
    bump: (k, n = 1) => { const s = S(); s.n[k] = (s.n[k] || 0) + n; },
    count: (k) => S().n[k] || 0,
    toast: (h, kind = 'info', ms) => game.ui.toast(h, kind, ms),
    sfx: (name) => { try { game.sysSfx?.play?.(name); } catch { /* ignore */ } },
    hitSfx: (name) => { try { game.combat?.sfx?.(name); } catch { /* ignore */ } },
    say: (obj, text, opts) => { try { game.npcs?.say?.(obj, text, opts); } catch { /* ignore */ } },
    money: (n, reason = 'street') => st.addMoney(n, reason),
    fmt: fmtMoney, esc,
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    chance: (p) => Math.random() < p,
    randInt: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    pp: () => game.player.group.position,
    // Any cop within r of the player?
    copNear(r = 22) {
      const p = I.pp();
      try { return (game.npcs?.near?.(p.x, p.z, r) || []).some((n) => n.kind === 'cop' && !n.dead); } catch { return false; }
    },
    crime(type, fallbackHeat = 0.3) {
      if (game.combat?.crime) { try { game.combat.crime(type); return; } catch (e) { console.error('[interact] crime', e); } }
      st.addHeat(fallbackHeat);
    },
    dialog: (o) => game.ui.dialog(o),
    choose: async (o) => {
      const opts = o.options.filter(Boolean);
      const i = await game.ui.dialog({ title: o.title, speaker: o.speaker, html: o.html, text: o.text, width: o.width, options: [...opts.map((x) => ({ label: x.label, hint: x.hint, disabled: x.disabled })), { label: o.leave || 'Walk away' }] });
      if (i == null || i >= opts.length) return null;
      try { return await opts[i].run?.(); } catch (e) { console.error('[interact] option failed', e); }
      return null;
    },
    // Register a placed object: mesh, interaction, culling.
    add(o) {
      o.cull = o.cull ?? 130;
      if (!o.group) { o.group = makeProp(o.kind); }
      o.group.position.set(o.x, o.y ?? 0, o.z);
      o.group.rotation.y = o.facing ?? 0;
      o.group.visible = false;
      root.add(o.group);
      if (o.solid) {
        const [w, d, h] = o.solid;
        const c = Math.abs(Math.cos(o.facing || 0)), s = Math.abs(Math.sin(o.facing || 0));
        const hx = c * w / 2 + s * d / 2, hz = s * w / 2 + c * d / 2;
        o.box = game.physics.addBox(o.x - hx, o.z - hz, o.x + hx, o.z + hz, { height: h ?? 1.5, tag: 'prop', data: { interact: o.id } });
      }
      if (o.use) {
        const fx = Math.sin(o.facing || 0), fz = Math.cos(o.facing || 0);
        const off = o.useOffset ?? 0.9;
        o.ix = o.x + fx * off; o.iz = o.z + fz * off;
        game.interact.add({
          id: 'ix:' + o.id, x: o.ix, z: o.iz, radius: o.radius ?? 1.9,
          prompt: (g) => (typeof o.prompt === 'function' ? o.prompt(g) : o.prompt),
          enabled: (g) => !o.hidden && (!o.enabled || o.enabled(g)),
          onInteract: (g) => { game.bus.emit('interact:use', { kind: o.kind, id: o.id }); return o.use(g); },
        });
      }
      objects.push(o); byId.set(o.id, o);
      return o;
    },
    remove(o) {
      if (!o) return;
      o.group?.removeFromParent();
      if (o.box) { game.physics.removeBox(o.box); o.box = null; }
      game.interact.remove('ix:' + o.id);
      const i = objects.indexOf(o); if (i >= 0) objects.splice(i, 1);
      byId.delete(o.id);
    },
    find: (id) => byId.get(id),
    hooks: { frame: [], reset: [], sheet: [] },
  };

  // ---------------------------------------------------------------- hold-E progress widget
  const holdEl = document.createElement('div');
  holdEl.className = 'ix-hold hidden';
  holdEl.innerHTML = '<div class="t"></div><div class="bar"><i></i></div>';
  (document.getElementById('ui-root') || document.body).appendChild(holdEl);
  let hold = null; // { label, time, t, x, z, done, cancel }
  I.hold = (spec) => { hold = { t: 0, ...spec }; holdEl.querySelector('.t').innerHTML = spec.label; holdEl.classList.remove('hidden'); };
  I.holding = () => !!hold;
  function updateHold(dt) {
    if (!hold) return;
    const p = I.pp();
    const away = Math.hypot(p.x - hold.x, p.z - hold.z) > (hold.r ?? 2.4);
    if (!game.input.isDown('KeyE') || game.controlsLocked || game.player.vehicle || game.player.dead || away) {
      const h = hold; hold = null; holdEl.classList.add('hidden');
      try { h.cancel?.(away ? 'away' : 'released'); } catch (e) { console.error(e); }
      return;
    }
    hold.t += dt;
    try { hold.tick?.(dt, hold.t / hold.time); } catch { /* ignore */ }
    holdEl.querySelector('i').style.width = `${Math.min(100, (100 * hold.t) / hold.time)}%`;
    if (hold.t >= hold.time) {
      const h = hold; hold = null; holdEl.classList.add('hidden');
      try { h.done?.(); } catch (e) { console.error('[interact] hold done failed', e); }
    }
  }

  // ---------------------------------------------------------------- sub-modules (placement is deterministic, order matters)
  const parts = [['street', installStreet], ['collect', installCollect], ['jobs', installJobs], ['events', installEvents]];
  for (const [name, fn] of parts) {
    try { fn(game, I); } catch (e) { console.error('[interact] install failed:', name, e); }
  }

  // NPC crowds lean on world.wallSpots(); hide the spots our props now stand on.
  try {
    const w = game.world, orig = w.wallSpots?.bind(w);
    const solids = objects.filter((o) => o.solid || o.wallProp);
    if (orig && !w._ixWrapped) {
      w._ixWrapped = true;
      w.wallSpots = (x, z, r) => orig(x, z, r).filter((s) => !solids.some((o) => o.group && (o.x - s.x) ** 2 + (o.z - s.z) ** 2 < 2.6));
    }
  } catch (e) { console.error('[interact] wallSpots wrap', e); }

  // ---------------------------------------------------------------- discovery markers (ATMs / vending only)
  const MARK = { atm: { icon: '$', color: '#6fd08a', label: 'ATM' }, vending: { icon: 'V', color: '#ff8a5a', label: 'Vending' } };
  let markT = 0;
  function updateMarkers(dt) {
    markT -= dt;
    if (markT > 0) return;
    markT = 0.5;
    const markers = game.world?.markers;
    if (!(markers instanceof Map)) return;
    const p = I.pp(), s = S();
    const found = new Set(s.found);
    for (const o of objects) {
      if (!MARK[o.kind]) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (!found.has(o.id) && d < 14) {
        s.found.push(o.id); found.add(o.id);
        game.bus.emit('interact:discover', { id: o.id, kind: o.kind });
      }
      const key = 'ix:' + o.id;
      // only nearby ones, so the minimap rim doesn't fill up with clamped icons
      if (found.has(o.id) && d < 105) { if (!markers.has(key)) markers.set(key, { x: o.x, z: o.z, ...MARK[o.kind] }); }
      else if (markers.has(key)) markers.delete(key);
    }
  }

  // ---------------------------------------------------------------- per-frame
  let cullT = 0;
  game.addSystem({
    name: 'interact',
    update(dt) {
      if (!game.started) return;
      updateHold(dt);
      cullT -= dt;
      if (cullT <= 0) {
        cullT = 0.25;
        const c = game.camera.position;
        for (const o of objects) {
          if (!o.group) continue;
          const v = !o.hidden && (o.x - c.x) ** 2 + (o.z - c.z) ** 2 < o.cull * o.cull;
          if (v !== o.group.visible) o.group.visible = v;
        }
      }
      for (const fn of I.hooks.frame) { try { fn(dt); } catch (e) { if (!fn._err) { fn._err = true; console.error('[interact] frame hook', e); } } }
      updateMarkers(dt);
    },
  });

  game.bus.on('state:reset', () => {
    S();
    for (const k of [...(game.world?.markers?.keys?.() || [])]) if (String(k).startsWith('ix:')) game.world.markers.delete(k);
    for (const fn of I.hooks.reset) { try { fn(); } catch (e) { console.error('[interact] reset hook', e); } }
  });

  // ---------------------------------------------------------------- character sheet
  game.ui.sheetSections.push(() => {
    const s = S();
    const rows = I.hooks.sheet.map((fn) => { try { return fn(s); } catch { return ''; } }).filter(Boolean).join(' · ');
    return `<div class="ui-section">Street Life</div><div class="ix-sheet">${rows}</div>`;
  });

  game.cityInteract = {
    objects, find: I.find, state: S,
    stats: () => objects.reduce((m, o) => { m[o.kind] = (m[o.kind] || 0) + 1; return m; }, {}),
    _I: I,
  };
  console.info('[interact] placed', game.cityInteract.stats());
}
