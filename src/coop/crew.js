import * as THREE from 'three';
import { DISTRICTS } from '../data/locations.js';
import { esc, fmtMoney, clamp } from '../core/util.js';
import { chip, bar } from '../ui/visual.js';
import { ic, chip2, ensureStyles as ensureVx2 } from '../ui/visual2.js';

// Crew panel (K): who's online, their level / district / current quest, send cash, spar, race, find.
// Crew pot: a shared stash kept in the HOST's save (host-authoritative).
// Shared map pins: an M-map click waypoint is shared with everyone; L pings the spot you're looking at.
//   crew:info   any -> all      {lv, d, q, v}        every 3 s + on join (v: 'foot'|'car'|'ride')
//   crew:wp     any -> all      {x, z}               map pin
//   crew:ping   any -> all      {x, z}               "look here" ping (20 s)
//   crew:pot    host -> all     {a, log:[[name, n]]} pot balance (sent on change + to joiners)
//   crew:dep    client -> host  {n}                  chip in (client already paid)
//   crew:wd     client -> host  {n}                  take cash out
//   crew:grant  host -> client  {n}                  withdrawal approved
//   crew:deny   host -> client  {}                   not enough in the pot

const INFO_EVERY = 3;
const PING_LIFE = 20;
const MAX_POT_MOVE = 1e7;

export function installCrew(game, U) {
  const net = game.net;
  const info = new Map();            // peerId -> { lv, d, q, v, at }
  let panel = null, panelT = 0, infoT = 1, wpT = 0;
  let lastWp = null;                 // marker object we last saw in markers('waypoint')
  let myPin = null, myPing = null;   // { x, z, t } — re-sent to late joiners
  const pot = { a: 0, log: [] };     // client mirror; host uses state.p.coopPot

  const markers = () => game.world?.markers;
  const district = (x, z) => { try { return game.world?.districtAt?.(x, z) || null; } catch { return null; } };
  const districtName = (d) => (d && DISTRICTS[d]?.name) || '—';
  const questTitle = () => {
    try { const q = game.quests; const id = q?.trackedId?.(); return id ? (q.defs?.[id]?.title || '') : ''; } catch { return ''; }
  };
  const myMode = () => { const v = game.player?.vehicle; return v ? (v.passenger ? 'ride' : 'car') : 'foot'; };

  // ------------------------------------------------------------ crew info
  function sendInfo(to = null) {
    if (!net.connected) return;
    const pp = U.myPos();
    const m = { t: 'crew:info', lv: game.state.p.level | 0, d: district(pp.x, pp.z) || '', q: questTitle().slice(0, 48), v: myMode() };
    if (to) U.send(to, m); else U.bcast(m);
  }
  net.on('crew:info', (m, from) => {
    if (!U.known(from) || !U.rate(from, 'crew:info', 400)) return;
    info.set(from, {
      lv: U.int(m.lv, 1, 9999) || 1, d: U.word(m.d) || '', q: U.text(m.q, 48),
      v: ['foot', 'car', 'ride'].includes(m.v) ? m.v : 'foot', at: U.elapsed(),
    });
  });

  // ------------------------------------------------------------ crew pot (host-authoritative)
  const hostPot = () => {
    const p = game.state.p;
    if (!p.coopPot || typeof p.coopPot !== 'object') p.coopPot = { amount: 0, log: [] };
    return p.coopPot;
  };
  function potLog(name, n) {
    const hp = hostPot();
    hp.log.unshift([String(name).slice(0, 16), n]);
    hp.log.length = Math.min(hp.log.length, 6);
  }
  function sendPot(to = null) {
    if (!net.isHost) return;
    const hp = hostPot();
    const m = { t: 'crew:pot', a: hp.amount, log: hp.log.slice(0, 6) };
    if (to) U.send(to, m); else U.bcast(m);
    game.state.changed('coopPot');
  }
  const potAmount = () => (net.isHost ? hostPot().amount : pot.a);
  const potEntries = () => (net.isHost ? hostPot().log : pot.log);

  net.on('crew:pot', (m, from) => {
    if (!net.isClient || from !== net.hostId) return;
    const a = U.int(m.a, 0, 1e12);
    if (a == null) return;
    pot.a = a;
    pot.log = Array.isArray(m.log) ? m.log.slice(0, 6).filter((e) => Array.isArray(e) && typeof e[0] === 'string' && Number.isInteger(e[1]))
      .map((e) => [U.text(e[0], 16), clamp(e[1], -MAX_POT_MOVE, MAX_POT_MOVE)]) : [];
  });
  net.on('crew:dep', (m, from) => {
    if (!net.isHost || !U.known(from) || !U.rate(from, 'crew:dep', 250)) return;
    const n = U.int(m.n, 1, MAX_POT_MOVE);
    if (!n) return;
    hostPot().amount += n;
    potLog(U.nameOf(from), n);
    U.toast(`<b>${esc(U.nameOf(from))}</b> chipped ${fmtMoney(n)} into the crew pot.`, 'money', 2500);
    sendPot();
  });
  net.on('crew:wd', (m, from) => {
    if (!net.isHost || !U.known(from) || !U.rate(from, 'crew:wd', 250)) return;
    const n = U.int(m.n, 1, MAX_POT_MOVE);
    if (!n) return;
    const hp = hostPot();
    if (n > hp.amount) { U.send(from, { t: 'crew:deny' }); sendPot(from); return; }
    hp.amount -= n;
    potLog(U.nameOf(from), -n);
    U.send(from, { t: 'crew:grant', n });
    U.toast(`<b>${esc(U.nameOf(from))}</b> took ${fmtMoney(n)} out of the crew pot.`, 'info', 2500);
    sendPot();
  });
  net.on('crew:grant', (m, from) => {
    if (!net.isClient || from !== net.hostId) return;
    const n = U.int(m.n, 1, MAX_POT_MOVE);
    if (!n) return;
    game.state.addMoney(n, 'crew pot');
    U.toast(`You pocket ${fmtMoney(n)} from the crew pot.`, 'money', 2500);
  });
  net.on('crew:deny', (m, from) => {
    if (!net.isClient || from !== net.hostId) return;
    U.toast("The pot doesn't have that much. Someone got there first.", 'bad', 2500);
  });

  async function chipIn() {
    if (!net.connected) { U.toast('The crew pot needs a crew. Host or join a game first.', 'bad'); return; }
    const money = Math.floor(game.state.p.money);
    if (money < 1) { U.toast("You're broke. The pot's not a charity. Well, it kind of is.", 'bad'); return; }
    const n = await game.ui.promptNumber({ title: 'Chip into the crew pot', text: `You have ${fmtMoney(money)}. Everyone in the crew can take from the pot.`, min: 1, max: Math.min(money, MAX_POT_MOVE), initial: Math.min(money, 100) });
    if (!n || n <= 0 || !net.connected) return;
    if (!game.state.spend(n, 'crew pot')) return;
    if (net.isHost) {
      hostPot().amount += n; potLog(U.myName(), n); sendPot();
    } else {
      pot.a += n; // optimistic, the host's 'crew:pot' corrects it
      U.send(net.hostId, { t: 'crew:dep', n });
    }
    U.toast(`You chipped ${fmtMoney(n)} into the crew pot.`, 'money');
    refresh(true);
  }

  async function takeOut() {
    if (!net.connected) { U.toast('The crew pot needs a crew.', 'bad'); return; }
    const have = potAmount();
    if (have < 1) { U.toast('The crew pot is empty. Somebody chip in.', 'bad'); return; }
    const n = await game.ui.promptNumber({ title: 'Take from the crew pot', text: `The pot holds ${fmtMoney(have)}. Take what you need. Your crew will judge you.`, min: 1, max: Math.min(have, MAX_POT_MOVE), initial: Math.min(have, 100) });
    if (!n || n <= 0 || !net.connected) return;
    if (net.isHost) {
      const hp = hostPot();
      if (n > hp.amount) { U.toast("The pot doesn't have that much.", 'bad'); return; }
      hp.amount -= n; potLog(U.myName(), -n); sendPot();
      game.state.addMoney(n, 'crew pot');
      U.toast(`You pocket ${fmtMoney(n)} from the crew pot.`, 'money');
    } else U.send(net.hostId, { t: 'crew:wd', n });
    refresh(true);
  }

  // ------------------------------------------------------------ pins & pings
  let beamGeo = null, ringGeo = null;
  const pings = new Map(); // owner -> { group, mat, t, x, z }
  function showPing(owner, x, z) {
    const w = markers();
    beamGeo ||= new THREE.CylinderGeometry(0.35, 0.35, 46, 10, 1, true).translate(0, 23, 0);
    ringGeo ||= new THREE.RingGeometry(1.1, 1.6, 28).rotateX(-Math.PI / 2);
    let pg = pings.get(owner);
    if (!pg) {
      const mat = new THREE.MeshBasicMaterial({ color: owner === 'local' ? 0xffd86a : 0x7fd0ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const group = new THREE.Group();
      group.add(new THREE.Mesh(beamGeo, mat));
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.y = 0.06;
      group.add(ring);
      group.userData.ring = ring;
      game.scene.add(group);
      pg = { group, mat };
      pings.set(owner, pg);
    }
    pg.t = PING_LIFE; pg.x = x; pg.z = z;
    pg.group.position.set(x, 0, z);
    pg.group.visible = true;
    const name = owner === 'local' ? 'Your' : `${U.nameOf(owner)}'s`;
    w?.set?.('ping:' + owner, { x, z, color: owner === 'local' ? '#ffd86a' : '#7fd0ff', label: `${name} ping`, icon: '!' });
  }
  function updatePings(dt) {
    for (const [owner, pg] of pings) {
      if (pg.t <= 0) continue;
      pg.t -= dt;
      const k = clamp(pg.t / 2, 0, 1);
      pg.mat.opacity = 0.4 * k * (0.75 + Math.sin((game.elapsed || 0) * 6) * 0.25);
      pg.group.userData.ring.scale.setScalar(1 + ((game.elapsed || 0) * 1.5 % 1) * 0.6);
      if (pg.t <= 0) { pg.group.visible = false; markers()?.delete?.('ping:' + owner); }
    }
  }

  // Where is the camera looking? Ground point under the screen centre (clamped to 120 m and walls).
  function lookPoint() {
    const cam = game.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const pp = U.myPos();
    let x, z;
    if (dir.y < -0.03) {
      const t = Math.min(-cam.position.y / dir.y, 120);
      x = cam.position.x + dir.x * t; z = cam.position.z + dir.z * t;
    } else {
      const l = Math.hypot(dir.x, dir.z) || 1;
      x = pp.x + (dir.x / l) * 60; z = pp.z + (dir.z / l) * 60;
    }
    try {
      const f = game.physics.raycast(pp.x, pp.z, x, z, 0.5, 1.0);
      if (f < 1) { x = pp.x + (x - pp.x) * f; z = pp.z + (z - pp.z) * f; }
    } catch { /* ignore */ }
    return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
  }

  function ping() {
    if (!game.started || game.player?.dead) return;
    if (!U.rate('local', 'ping', 600)) return;
    const pt = lookPoint();
    showPing('local', pt.x, pt.z);
    myPing = { ...pt, t: U.elapsed() };
    try { game.combat?.sfx?.('click', { vol: 0.5 }); } catch { /* ignore */ }
    if (net.connected) U.bcast({ t: 'crew:ping', x: pt.x, z: pt.z });
    else U.toast('Pinged. Nobody saw it, but it felt good.', 'info', 1400);
  }
  net.on('crew:ping', (m, from) => {
    if (!U.known(from) || !U.rate(from, 'crew:ping', 500)) return;
    const x = U.coord(m.x), z = U.coord(m.z);
    if (x == null || z == null) return;
    showPing(from, x, z);
    const pp = U.myPos();
    const d = Math.round(Math.hypot(x - pp.x, z - pp.z));
    U.toast(`<b>${esc(U.nameOf(from))}</b> pinged a spot ${d} m away.`, 'info', 1800);
  });

  // Map pins: a fresh M-map click ('Waypoint' label) is shared; received pins land as your waypoint
  // unless a quest/job is using it.
  function pollWaypoint() {
    const w = markers();
    if (!w?.get) return;
    const wp = w.get('waypoint') || null;
    if (wp === lastWp) return;
    lastWp = wp;
    if (!wp || wp.crew || wp.label !== 'Waypoint' || !net.connected) return;
    if (!U.rate('local', 'wp', 700)) return;
    myPin = { x: Math.round(wp.x * 10) / 10, z: Math.round(wp.z * 10) / 10, t: U.elapsed() };
    U.bcast({ t: 'crew:wp', x: myPin.x, z: myPin.z });
    U.toast('Pin shared with the crew.', 'info', 1400);
  }
  net.on('crew:wp', (m, from) => {
    if (!U.known(from) || !U.rate(from, 'crew:wp', 500)) return;
    const x = U.coord(m.x), z = U.coord(m.z);
    if (x == null || z == null) return;
    const w = markers();
    if (!w?.set) return;
    const cur = w.get('waypoint');
    const mk = { x, z, color: '#7fd0ff', label: `${U.nameOf(from)}'s pin`, icon: '✚', crew: true };
    if (!cur || cur.crew || cur.label === 'Waypoint') { w.set('waypoint', mk); lastWp = mk; } else w.set('crewpin', mk);
    U.toast(`<b>${esc(U.nameOf(from))}</b> dropped a pin on the map. <kbd>M</kbd>`, 'info', 2200);
  });

  // ------------------------------------------------------------ panel
  function rows() {
    const pp = U.myPos();
    const p = game.state.p;
    const out = [{
      id: null, name: U.myName(), me: true, host: net.isHost, lv: p.level, d: district(pp.x, pp.z), q: questTitle(),
      hp: `${Math.ceil(p.hp)}/${p.maxHp}`, hpN: p.hp, hpMax: p.maxHp, dist: '—', v: myMode(),
    }];
    for (const peer of U.peers()) {
      const rp = U.live(peer.id);
      const inf = info.get(peer.id);
      const d = rp ? Math.round(Math.hypot(rp.pos.x - pp.x, rp.pos.z - pp.z)) : null;
      out.push({
        id: peer.id, name: peer.name, host: peer.isHost, lv: inf?.lv ?? '?', d: inf?.d || (rp ? district(rp.pos.x, rp.pos.z) : null),
        q: inf?.q || '', hp: rp ? `${Math.ceil(rp.hp)}/${rp.maxHp}` : '…', hpN: rp ? rp.hp : null, hpMax: rp?.maxHp, dist: d == null ? '…' : d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d + ' m',
        v: rp?.ride ? 'ride' : rp?.vehicle ? 'car' : inf?.v || 'foot', ping: peer.ping,
      });
    }
    return out;
  }

  function body() {
    ensureVx2();
    const rs = rows();
    const mode = { foot: ['person', 'on foot'], car: ['car', 'driving'], ride: ['car', 'riding shotgun'] };
    const cards = rs.map((r) => {
      const [mi, ml] = mode[r.v] || mode.foot;
      const hp = r.hpN != null ? `<div class="cw-hp">${ic('heart')}${bar(r.hpN, r.hpMax || 1, 'hp')}<span>${esc(r.hp)}</span></div>` : `<div class="cw-hp">${ic('heart')}${bar(0, 1, 'hp')}<span>…</span></div>`;
      return `<div class="cw-card${r.me ? ' me' : ''}">
        <span class="cw-av">${esc(String(r.name || '?').trim().charAt(0).toUpperCase() || '?')}<span class="cw-lv" title="Level">${esc(String(r.lv))}</span></span>
        <div class="cw-top"><b>${esc(r.name)}</b>${r.me ? '<span class="cw-tag">you</span>' : ''}${r.host ? '<span class="cw-tag">host</span>' : ''}</div>
        ${hp}
        <div class="cw-meta">${chip2('pin', esc(districtName(r.d)), 'muted', 'district')}${chip2(mi, ml, 'muted')}${r.me ? '' : chip2('target', esc(r.dist), 'muted', 'distance')}${r.ping != null ? chip2('pulse', `${r.ping} ms`, 'muted', 'ping') : ''}${chip2('flag', r.q ? esc(r.q) : 'loafing', r.q ? 'info' : 'muted', 'tracked quest')}</div>
        ${r.me ? '' : `<div class="cw-acts">
          <button class="ui-btn" data-act="cash" data-id="${esc(r.id)}" title="Give cash">${ic('money')}<span>Cash</span></button>
          <button class="ui-btn" data-act="spar" data-id="${esc(r.id)}" title="Friendly 1v1, non-lethal">${ic('fist')}<span>Spar</span></button>
          <button class="ui-btn" data-act="race" data-id="${esc(r.id)}" title="Drag race at the Drag Strip">${ic('flag')}<span>Race</span></button>
          <button class="ui-btn" data-act="find" data-id="${esc(r.id)}" title="Waypoint to them">${ic('pin')}<span>Find</span></button></div>`}
      </div>`;
    }).join('');
    const potHtml = net.connected ? `
      <div class="cw-pot"><span class="vx2-ibox">${ic('money')}</span>
        <b>${fmtMoney(potAmount())}<small>crew pot</small></b>
        <span class="cw-pb"><button class="ui-btn vx2-btn go" data-act="dep">${ic('up')}<span>Chip in</span></button><button class="ui-btn vx2-btn" data-act="wd">${ic('bag')}<span>Take some</span></button></span>
        <span class="pm-chips">${potEntries().length ? potEntries().map(([n, a]) => chip('', `${esc(n)} ${a >= 0 ? '+' : '−'}${fmtMoney(Math.abs(a))}`, a >= 0 ? 'gain' : 'cost')).join('') : '<span class="ui-muted" style="font-size:13px">Shared stash kept in the host&#39;s save. Anyone can take. Trust issues sold separately.</span>'}</span>
      </div>` : '';
    const bonus = game.coop?.bonus?.near ? `<div class="cw-bonus">${ic('up')}<span>Crew bonus active: +10% cash &amp; XP from jobs, fights and heists while a friend is within 40 m.</span></div>` : '';
    return `
      ${net.connected ? '' : `<div class="cw-solo">${ic('users')}<span>Just you out here. Pause menu → <b>Co-op: invite friends</b> to bring your crew.</span></div>`}
      <div class="cw-list">${cards}</div>
      ${potHtml}${bonus}
      <div class="cw-keys kb-only">
        <span><kbd>L</kbd>ping where you're looking</span><span><kbd>M</kbd>map click shares a pin</span><span><kbd>F</kbd>at a friend's passenger door: ride shotgun</span>
        <span>${ic('users').replace('class="pr-ico"', 'class="pr-ico" style="width:13px;height:13px;vertical-align:-2px"')} friends within 40 m: +10% cash/XP</span><span><kbd>K</kbd>toggles this panel</span></div>`;
  }

  function refresh(force = false) {
    if (!panel || panel.closed) return;
    if (!force && document.activeElement && panel.body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const html = body();
    if (!force && panel._last === html) return;
    panel._last = html;
    panel.body.innerHTML = html;
  }

  function onClick(e) {
    const b = e.target.closest?.('[data-act]');
    if (!b) return;
    const id = b.getAttribute('data-id');
    const act = b.getAttribute('data-act');
    if (id && !U.known(id)) { U.toast('They left.', 'bad'); refresh(true); return; }
    switch (act) {
      case 'cash': close(); net.giveCash?.(id); break;
      case 'spar': close(); game.coop?.spar?.invite(id); break;
      case 'race': close(); game.coop?.drag?.challengeFriend(id); break;
      case 'find': {
        const rp = U.live(id);
        if (!rp) { U.toast("Can't see where they are yet.", 'bad'); break; }
        const mk = { x: rp.pos.x, z: rp.pos.z, color: '#7fd0ff', label: `${rp.name}`, icon: '✚', crew: true };
        markers()?.set?.('waypoint', mk); lastWp = mk;
        U.toast(`Waypoint set to <b>${esc(rp.name)}</b>.`, 'info', 1600);
        break;
      }
      case 'dep': close(); chipIn(); break;
      case 'wd': close(); takeOut(); break;
      default: break;
    }
  }

  function open() {
    if (panel && !panel.closed) { refresh(true); return; }
    const entry = game.ui.openPanel({ title: 'The Crew', body: '', width: 760, className: 'coop-crew', onClose: () => { if (panel === entry) panel = null; } });
    panel = entry;
    entry._last = null;
    entry.body.addEventListener('click', onClick);
    refresh(true);
  }
  function close() { if (panel && !panel.closed) panel.close(); panel = null; }
  function toggle() { if (panel && !panel.closed) close(); else open(); }

  game.ui.menuButtons?.push({ label: 'Crew (K)', get hint() { return net.connected ? `${U.peers().length} friend${U.peers().length === 1 ? '' : 's'} online` : 'solo'; }, onClick: () => open() });

  // ------------------------------------------------------------ joins / leaves
  game.bus.on('net:player-joined', ({ id } = {}) => {
    if (!id) return;
    setTimeout(() => {
      sendInfo(id);
      if (net.isHost) sendPot(id);
      const t = U.elapsed();
      if (myPin && t - myPin.t < 600) U.send(id, { t: 'crew:wp', x: myPin.x, z: myPin.z });
      if (myPing && t - myPing.t < PING_LIFE) U.send(id, { t: 'crew:ping', x: myPing.x, z: myPing.z });
    }, 600);
  });
  game.bus.on('net:player-left', ({ id } = {}) => {
    info.delete(id);
    const pg = pings.get(id);
    if (pg) { pg.group.removeFromParent(); pings.delete(id); markers()?.delete?.('ping:' + id); }
  });
  game.bus.on('net:connected', () => { pot.a = 0; pot.log = []; infoT = 0.5; if (net.isHost) sendPot(); });
  game.bus.on('net:disconnected', () => {
    info.clear();
    for (const [owner, pg] of pings) if (owner !== 'local') { pg.group.removeFromParent(); pings.delete(owner); markers()?.delete?.('ping:' + owner); }
    markers()?.delete?.('crewpin');
  });

  function update(dt) {
    const inp = game.input;
    if (game.started && inp.wasPressed('KeyK')) {
      if (panel && !panel.closed) close();
      else if (!game.controlsLocked) open();
    }
    if (game.started && !game.controlsLocked && inp.wasPressed('KeyL')) ping();
    updatePings(dt);
    wpT -= dt;
    if (wpT <= 0) { wpT = 0.25; pollWaypoint(); }
    if (net.connected) {
      infoT -= dt;
      if (infoT <= 0) { infoT = INFO_EVERY; sendInfo(); }
    }
    panelT -= dt;
    if (panelT <= 0 && panel) { panelT = 1; refresh(); }
  }

  return { open, close, toggle, ping, update, info, get pot() { return potAmount(); } };
}
