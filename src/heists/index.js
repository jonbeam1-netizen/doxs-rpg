// Heists (heists agent): planner board, gear, masks, co-op crews, guards, loot bags, getaways.
//
// game.heists API:
//   start(id, approach='loud', {invite})  launch a job right now (skips the planner dialogs)
//   abort()                               call off / bail on the current job
//   active -> snapshot | null             current run (see manager.js header)
//   status(id) -> {ok, why, cooldown}     unlocked & off cooldown?
//   planner.talk() / planner.openBoard() / planner.openShop()
//   toggleMask(), masked
// Persistence (plain JSON): state.p.heists = { done{id:n}, best{id:$}, last{id:time.total}, failedAt{id:time.total},
//   gear{gearId:qty}, masks[], mask, intel{casino,grimco}, total, news[] }
// Events: heist:started {id, approach, crew, leader}, heist:completed {id, take, share, quiet}, heist:failed {id, reason}
// Net messages (all { t, ... }):
//   heist:invite  host -> all       {uid, id, name, approach, leaderName}       join the crew?
//                 client -> host    {pitch:true, id, approach, name, gear, mask} "boss, let's do this one"
//                 host -> client    {declined:true}
//   heist:accept  client -> host    {uid, name, gear[], mask}
//   heist:state   host -> all       {s}  full snapshot (5 Hz while things change, 1 Hz otherwise) | {uid, toast, kind}
//   heist:act     client -> host    {uid, a:'mask'|'hold'|'obj'|'busy'|'spotted'|'finish'|'down'|'ram'|'spikes'|'boot'|'jack', ...}
//   heist:loot    client -> host    {uid, a:'pick'|'drop'|'stash'|'secure', i | list, x, z}
//   heist:payout  host -> crew      {uid, id, take, share, quiet, crew[]}
import { HEISTS } from '../data/heists.js';
import { HeistManager } from './manager.js';
import { Planner } from './planner.js';
import { esc, fmtMoney } from '../core/util.js';

export async function installHeists(game) {
  const mgr = new HeistManager(game);
  const planner = new Planner(game, mgr);
  const net = game.net;

  game.heists = {
    start: (id, approach = 'loud', opts = {}) => mgr.startRun(id, approach, opts),
    abort: () => mgr.abort(),
    get active() { return mgr.s; },
    status: (id) => mgr.status(id),
    toggleMask: () => mgr.toggleMask(),
    get masked() { return mgr.masked; },
    planner,
    _mgr: mgr,
    debug: {
      unlockAll() { const h = mgr.h; for (const id of Object.keys(HEISTS)) h.done[id] = Math.max(1, h.done[id] || 0); h.last = {}; h.failedAt = {}; h.intel = { casino: true, grimco: true }; game.state.p.level = Math.max(game.state.p.level, 10); },
      giveGear() { const h = mgr.h; for (const id of ['picks', 'hacker', 'drill', 'thermite', 'spikes', 'getaway']) h.gear[id] = (h.gear[id] || 0) + 3; },
      win() { const s = mgr.s; if (!s || !mgr.auth) return; for (const b of s.bags) b.s = 's'; if (!s.bags.length) s.extraGot += 1000; mgr.complete(); },
      solveCurrent() { const s = mgr.s; const o = s && s.obj.find((x) => !x.done && x.type !== 'escape'); if (o && mgr.auth) mgr.completeObj(o); return o?.k; },
    },
  };

  game.addSystem({ name: 'heists', update: (dt) => mgr.update(dt) });

  // ---- planner placement (needs the world's locations + npcs)
  const place = () => { try { planner.place(); } catch (e) { console.error('[heists] planner placement failed', e); } };
  place();
  game.bus.on('game:start', () => { mgr.ensure(); place(); });
  game.bus.on('state:reset', () => {
    if (mgr.s) { mgr.clearView(); mgr.s = null; mgr.A = null; mgr.auth = false; mgr.shared = false; }
    mgr.carryApplied = 1;
    mgr.masked = false;
    mgr.ensure();
    setTimeout(place, 0);
  });

  // ---- going down mid-job
  const down = (why) => {
    const s = mgr.s;
    if (!s) return;
    const me = s.crew.find((c) => c.id === mgr.me());
    if (!me || me.out) return;
    mgr.act({ a: 'down', why, bags: mgr.myBagDrops() });
    if (mgr.masked) mgr.toggleMask();
  };
  game.bus.on('player:died', () => down('died'));
  game.bus.on('player:arrested', () => { mgr.arrestedAt = game.time.total; down('arrested'); });

  // ---- co-op
  // Network data is untrusted: only accept plain strings (String(obj) can throw on odd payloads).
  const str = (v, max = 16, d = '') => (typeof v === 'string' ? v : d).slice(0, max);
  const gearList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 12) : []);
  net.on('heist:state', (msg, from) => mgr.onState(msg, from));
  net.on('heist:payout', (msg, from) => mgr.onPayout(msg, from));
  net.on('heist:act', (msg, from) => mgr.applyAct(msg, from));
  net.on('heist:loot', (msg, from) => mgr.applyAct(msg, from));
  net.on('heist:accept', (msg, from) => {
    if (!mgr.auth || !mgr.shared) return;
    if (!msg || typeof msg !== 'object') return;
    mgr.applyAct({ a: 'join', uid: msg.uid, name: str(msg.name), gear: gearList(msg.gear), mask: str(msg.mask, 24) }, from);
    mgr.broadcastState(true);
  });
  net.on('heist:invite', async (msg, from) => {
    try {
      if (!msg || typeof msg !== 'object') return;
      if (msg.declined) { game.ui.toast(`The boss passed on your pitch. ${esc(str(msg.why, 120))}`, 'bad', 4000); return; }
      const def = typeof msg.id === 'string' && Object.prototype.hasOwnProperty.call(HEISTS, msg.id) ? HEISTS[msg.id] : null;
      if (!def) return;
      if (msg.pitch) {
        if (!net.isHost) return;
        const name = esc(str(msg.name) || 'Your buddy');
        if (mgr.s) { net.sendTo(from, { t: 'heist:invite', declined: true, why: 'They\'re already on a job.' }); return; }
        const st = mgr.status(msg.id);
        if (!st.ok) { net.sendTo(from, { t: 'heist:invite', declined: true, why: `The host can't do that job yet (${st.why || 'locked'}).` }); game.ui.toast(`${name} pitched the ${esc(def.name)}, but you're not ready: ${esc(st.why || '')}`, 'info', 5000); return; }
        const ok = await game.ui.confirm(`${name} wants to pull the ${def.name} (${msg.approach === 'quiet' ? 'quiet' : 'loud'}). You'd be running it — guards, timer, the works. Everyone splits the take evenly.`, { title: '📞 Heist pitch', yes: 'Let\'s do it', no: 'Not now' });
        if (!ok || mgr.s) { net.sendTo(from, { t: 'heist:invite', declined: true, why: 'Not now.' }); return; }
        mgr.startRun(msg.id, msg.approach === 'quiet' ? 'quiet' : 'loud', { pitcher: from, pitcherInfo: { name: str(msg.name), gear: gearList(msg.gear), mask: str(msg.mask, 24) }, invite: true });
        mgr.broadcastState(true);
        return;
      }
      // host invite -> client
      if (net.isHost || mgr.s) return;
      const ok = await game.ui.confirm(`<b>${esc(str(msg.leaderName) || 'The host')}</b> is pulling the <b>${esc(def.name)}</b> (${msg.approach === 'quiet' ? 'quiet' : 'loud'}) and wants you in. Even split. Bring a mask.`,
        { title: '📞 You got a job offer', yes: 'I\'m in', no: 'Pass', html: `<b>${esc(str(msg.leaderName) || 'The host')}</b> is pulling the <b>${esc(def.name)}</b> (${msg.approach === 'quiet' ? 'quiet' : 'loud'}) and wants you in.<br><br>${esc(def.blurb)}<br><br>Even split. Bring a mask (<kbd>V</kbd>).` });
      if (!ok || mgr.s) return;
      net.sendToHost({ t: 'heist:accept', uid: msg.uid, name: mgr.myName(), gear: mgr.myGearIds(), mask: mgr.h.mask });
    } catch (e) { console.error('[heists] invite failed', e); }
  });
  game.bus.on('net:connected', ({ isHost } = {}) => {
    // a solo run that started before hosting: re-key 'local' to the real peer id
    const s = mgr.s;
    if (!s || !mgr.auth) return;
    const id = net.localId;
    for (const c of s.crew) if (c.id === 'local') c.id = id;
    for (const b of s.bags) if (b.by === 'local') b.by = id;
    if (s.leader === 'local') s.leader = id;
    if (isHost) mgr.shared = true;
  });
  game.bus.on('net:player-joined', ({ id } = {}) => mgr.onPlayerJoined(id));
  game.bus.on('net:disconnected', () => {
    const s = mgr.s;
    if (!s) return;
    if (!mgr.auth) {
      const id = s.id;
      mgr.clearView(); mgr.s = null;
      game.ui.toast('Lost the connection mid-job. The crew is on its own. So are you.', 'bad', 5000);
      game.bus.emit('heist:failed', { id, reason: 'disconnected' });
    } else {
      mgr.shared = false;
      for (const c of s.crew) if (c.id !== mgr.me() && !c.out) mgr.applyAct({ a: 'down', why: 'left', uid: s.uid }, c.id);
    }
  });

  // ---- tomorrow's paper remembers what you did
  game.bus.on('time:day', () => {
    try {
      const h = mgr.h, p = game.state.p;
      if (!h.news.length) return;
      const n = p.sys?.news;
      if (!n || n.day !== game.time.day) return;
      const item = h.news.shift();
      n.stories = n.stories || [];
      n.stories.unshift({ h: 'CRIME BEAT', b: esc(item.body || '') });
      n.headline = esc(item.headline);
      h.news.length = 0;
    } catch (e) { console.error('[heists] news failed', e); }
  });

  // ---- character sheet
  game.ui.sheetSections?.push(() => {
    const h = mgr.h;
    const jobs = Object.entries(h.done).filter(([, n]) => n > 0);
    if (!jobs.length && !h.total) return '';
    return `<div class="ui-section">Heists</div><div class="ui-muted">${jobs.map(([id, n]) => `${esc(HEISTS[id]?.name || id)} ×${n} (best ${fmtMoney(h.best[id] || 0)})`).join(' · ')}<br>Lifetime crime income: <b>${fmtMoney(h.total || 0)}</b></div>`;
  });

  mgr.ensure();
  return game.heists;
}
