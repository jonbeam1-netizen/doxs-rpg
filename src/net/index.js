import { clamp, esc, fmtMoney, pick } from '../core/util.js';
import { NetSession, cleanName, friendlyError, MAX_CLIENTS } from './transport.js';
import { Avatars, EMOTES } from './avatars.js';
import { Chat } from './chat.js';

// Co-op module. Mutates the existing game.net (NetBase) facade — never replaces it.
//
// Message types owned here:
//   ps        player state ~15 Hz  {x,y,z,f,s,hp,mh,ts, w?,a?,d?,b?(block),k?(1 knocked flat/2 KO),v?{carId,color,speed,steer}}
//             + name/look every 15th packet or on change. ts = sender ms & 0xffff (snapshot interpolation)
//   pa        one-shot animation    {k?:'w'|'c'|'r'|'h' (wind-up/cancel/roll/flinch, default punch), d, ss?, sd?}
//   time      host clock            {total}
//   timereq   client -> host        {minutes}
//   timeskip  host -> all           {by, name, minutes, total}
//   chat      {name, text}
//   emote     {e, bark, name}
//   gift      {amount, from}
// Bus events emitted: net:status {status}, net:connected {isHost, id}, net:disconnected {reason},
//   net:player-joined {id, name}, net:player-left {id, name}
const PS_HZ = 15;
const TIME_SYNC_MS = 2000;
const MAX_SKIP = 36 * 60; // longest single skip a client may ask for (a 5-star jail stretch is 29 h)

// Wire strings only: anything else (objects with booby-trapped toString, numbers, …) becomes ''.
const str = (v) => (typeof v === 'string' ? v : '');

function fmtDur(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

export async function installNet(game) {
  const net = game.net;
  const params = new URLSearchParams(location.search);
  const avatars = new Avatars(game);
  let chat = null;
  let invitePanel = null;
  let pendingHost = false;
  let skipBy = null;

  const myName = () => cleanName(game.state?.p?.name);
  const nameOf = (id) => {
    if (id === net.localId) return myName();
    return net.remotePlayers.get(id)?.name || session.names.get(id) || 'Somebody';
  };
  const toast = (html, kind = 'info', ms) => { try { game.ui.toast(html, kind, ms); } catch { /* ignore */ } };
  const sys = (text, kind) => chat?.system(text, kind);

  // ------------------------------------------------------------------ transport
  const session = new NetSession(game, {
    onStatus: () => { refreshHud(); refreshInvite(); },
    onConnected: ({ isHost }) => {
      net.localName = myName();
      if (isHost) {
        sys(`You're hosting. Open the pause menu → "Co-op: invite friends" for the link.`);
      } else {
        const host = session.names.get(session.hostId) || 'the host';
        if (!session._reconnecting) {
          toast(`Joined <b>${esc(host)}</b>'s game. Behave. Or don't.`, 'good', 4000);
          sys(`Connected to ${host}'s game.`);
        } else sys(`Reconnected to ${host}'s game.`);
        for (const [id, n] of session.names) avatars.ensure(id, n);
      }
      game.bus.emit('net:connected', { isHost, id: net.localId });
      refreshHud(); refreshInvite();
    },
    onDisconnected: ({ reason, message }) => {
      avatars.clear();
      game.bus.emit('net:disconnected', { reason });
      if (message) {
        toast(esc(message), reason === 'left' ? 'info' : 'bad', 5000);
        sys(message, reason === 'left' ? '' : 'bad');
      }
      refreshHud(); refreshInvite();
    },
    onReconnected: () => { toast('Reconnected to the host. Crisis averted.', 'good'); },
    onPeerJoin: (id, name, rejoin) => {
      avatars.ensure(id, name);
      if (!rejoin) {
        toast(`<b>${esc(name)}</b> crawled into Rotwell.`, 'good');
        sys(`${name} joined the game.`);
      }
      game.bus.emit('net:player-joined', { id, name });
      if (net.isHost) sendTime();
      try { session.broadcast(buildPs(true)); } catch { /* not started yet */ }
      refreshHud(); refreshInvite();
    },
    onPeerLeave: (id, name) => {
      avatars.remove(id);
      toast(`<b>${esc(name)}</b> left. Probably owed somebody money.`);
      sys(`${name} left the game.`);
      game.bus.emit('net:player-left', { id, name });
      refreshHud(); refreshInvite();
    },
    onError: (msg) => { toast(esc(msg), 'bad', 5000); sys(msg, 'bad'); refreshInvite(); },
  });

  // ------------------------------------------------------------------ facade (mutate, don't replace)
  net.session = session;
  net.ping = session.ping;
  net.hostId = null;
  net.broadcast = (msg) => session.broadcast(msg);
  net.sendToHost = (msg) => session.sendToHost(msg);
  net.sendTo = (peerId, msg) => session.sendTo(peerId, msg);
  net.peers = () => [...session.names.entries()].map(([id, name]) => ({
    id, name, ping: session.ping.get(id) ?? null, isHost: id === session.hostId,
  }));
  net.status = () => session.status;
  net.inviteLink = () => (session.hostId && net.connected ? location.origin + location.pathname + '?join=' + encodeURIComponent(session.hostId) : null);
  net.host = () => startHost();
  net.join = (id) => joinGame(id);
  net.leave = () => session.leave();
  net.requestTimeAdvance = (minutes) => {
    const m = clamp(Math.round(Number(minutes) || 0), 0, MAX_SKIP);
    if (m <= 0) return;
    if (!net.isClient) { game.time.advance(m); return; }
    // optimistic: apply locally right away so sleeping/working code sees the skip, host confirms with 'timeskip'
    try { game.time._apply(m, true); } catch (e) { console.error(e); }
    session.sendToHost({ t: 'timereq', minutes: m });
  };

  // ------------------------------------------------------------------ lobby actions
  async function startHost({ openInvite = false } = {}) {
    if (net.isHost) { if (openInvite) openInvitePanel(); return session.hostId; }
    if (net.isClient && !(await game.ui.confirm('You are in someone else\'s game. Leave it and host your own?'))) return null;
    const p = session.host();
    refreshHud();
    if (openInvite) openInvitePanel();
    try {
      const id = await p;
      return id;
    } catch (e) {
      const msg = friendlyError(e);
      toast(esc(msg), 'bad', 6000);
      sys(msg, 'bad');
      refreshInvite();
      return null;
    }
  }

  async function joinGame(hostId) {
    toast("Knocking on your buddy's door…", 'info', 2500);
    refreshHud();
    try {
      await session.join(hostId);
      return true;
    } catch (e) {
      const msg = friendlyError(e);
      sys(msg, 'bad');
      refreshHud();
      const i = await game.ui.dialog({
        title: 'Co-op hiccup',
        text: `${msg}\n\nYou can keep playing solo with this character.`,
        options: [{ label: 'Try again' }, { label: 'Play solo' }],
      });
      if (i === 0) return joinGame(hostId);
      return false;
    }
  }

  // ------------------------------------------------------------------ title + game start
  if (!params.get('join')) {
    game.titleButtons?.push({
      label: 'Host co-op game',
      onClick: (g, name, begin) => {
        pendingHost = true;
        begin(false, name); // continues the saved character, or starts fresh if there's no save
      },
    });
  }

  game.bus.on('game:start', (data = {}) => {
    net.localName = myName();
    const joinId = data.joinId || params.get('join');
    if (joinId) { setTimeout(() => joinGame(joinId), 50); return; }
    if (pendingHost || (data.dev && params.has('host'))) {
      pendingHost = false;
      setTimeout(() => startHost({ openInvite: !data.dev }), 50);
    }
  });

  // ------------------------------------------------------------------ message handlers
  net.on('ps', (m, from) => {
    if (from === net.localId || !session.names.has(from)) return;
    if (typeof m.name === 'string' && m.name) {
      const n = cleanName(m.name);
      if (session.names.get(from) !== n) session.names.set(from, n); // renamed mid-session
    }
    avatars.onState(from, m);
  });
  net.on('pa', (m, from) => { if (from !== net.localId) avatars.punch(from, m); });

  // Time: the host owns the clock.
  function sendTime() { if (net.isHost) session.broadcast({ t: 'time', total: game.time.total }); }
  net.on('time', (m) => {
    if (!net.isClient || !Number.isFinite(m.total)) return;
    if (Math.abs(m.total - game.time.total) >= 1) game.time.set(Math.round(m.total));
  });
  net.on('timereq', (m, from) => {
    if (!net.isHost) return;
    const mins = clamp(Math.round(Number(m.minutes) || 0), 0, MAX_SKIP);
    if (mins <= 0) return;
    skipBy = from;
    try { game.time.advance(mins); } finally { skipBy = null; }
  });
  game.bus.on('time:change', (d) => {
    if (!net.isHost || !d?.skipped) return;
    const by = skipBy || net.localId;
    const name = nameOf(by);
    session.broadcast({ t: 'timeskip', by, name, minutes: d.skipped, total: game.time.total });
    if (by !== net.localId) announceSkip(name, d.skipped);
  });
  net.on('timeskip', (m) => {
    if (!net.isClient) return;
    if (Number.isFinite(m.total)) game.time.set(Math.round(m.total));
    if (m.by !== net.localId) announceSkip(cleanName(m.name), clamp(Number(m.minutes) || 0, 0, MAX_SKIP));
  });
  function announceSkip(name, minutes) {
    if (!minutes) return;
    const verb = minutes >= 300 ? 'slept' : 'killed some time';
    toast(`<b>${esc(name)}</b> ${verb} — the clock jumped ${fmtDur(minutes)}`, 'info', 3500);
    sys(`${name} ${verb} — the clock jumped ${fmtDur(minutes)}.`);
  }
  setInterval(sendTime, TIME_SYNC_MS);

  // Chat & emotes
  // per-sender flood guard for chat / emotes / gifts toasts (6 per 4 s)
  const flood = new Map();
  const flooding = (from) => {
    const now = performance.now();
    const arr = (flood.get(from) || []).filter((t) => now - t < 4000);
    arr.push(now);
    flood.set(from, arr);
    return arr.length > 6;
  };
  net.on('chat', (m, from) => {
    if (from === net.localId || flooding(from)) return;
    // eslint-disable-next-line no-control-regex
    const text = str(m.text).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160);
    if (!text) return;
    const name = nameOf(from) || cleanName(m.name);
    chat.say(name, text);
    avatars.bubble(from, text);
  });
  net.on('emote', (m, from) => {
    if (from === net.localId || typeof m.e !== 'string' || !Object.hasOwn(EMOTES, m.e) || flooding(from)) return;
    avatars.emote(from, m.e);
    const bark = str(m.bark).slice(0, 80);
    if (bark) avatars.bubble(from, bark, { italic: true, ms: 3000 });
    chat.emote(nameOf(from), EMOTES[m.e].verb);
  });

  // Gifts
  net.on('gift', (m, from) => {
    if (from === net.localId || !session.names.has(from)) return;
    const amount = Math.floor(Number(m.amount));
    if (!(amount > 0) || amount > 1e9) return;
    const name = nameOf(from) || cleanName(m.from);
    game.state.addMoney(amount, 'gift');
    toast(`<b>${esc(name)}</b> slipped you ${fmtMoney(amount)}. No strings attached. Probably.`, 'money', 4500);
    sys(`${name} gave you ${fmtMoney(amount)}.`, 'money');
  });

  function doEmote(kind) {
    const em = EMOTES[kind];
    if (game.player?.vehicle) { sys("You can't do that while driving. Well, you can, but don't."); return; }
    if (game.player?.dead) return;
    const bark = pick(em.barks);
    avatars.emote('local', kind);
    avatars.bubble('local', bark, { italic: true, ms: 3000 });
    chat.emote(myName(), em.verb);
    if (net.connected) session.broadcast({ t: 'emote', e: kind, bark, name: myName() });
  }

  chat = new Chat(game, {
    onSubmit: (text) => {
      if (text.startsWith('/')) {
        const cmd = text.slice(1).split(/\s+/)[0].toLowerCase();
        if (Object.hasOwn(EMOTES, cmd)) { doEmote(cmd); return; }
        if (cmd === 'help' || cmd === '?') { sys('Commands: /wave /dance /flip /players /help'); return; }
        if (cmd === 'players' || cmd === 'who') {
          if (!net.connected) { sys("It's just you. It's always been just you."); return; }
          sys(`Online: ${[myName() + ' (you)', ...net.peers().map((p) => p.name + (p.ping != null ? ` ${p.ping}ms` : ''))].join(', ')}`);
          return;
        }
        sys(`Unknown command "${text.slice(0, 20)}". Try /help.`);
        return;
      }
      if (!net.connected) {
        chat.addLine(`<span class="nc-sys">You mutter to yourself:</span> ${esc(text)}`);
        avatars.bubble('local', text);
        return;
      }
      chat.say(myName(), text);
      avatars.bubble('local', text);
      session.broadcast({ t: 'chat', name: myName(), text });
    },
  });

  // ------------------------------------------------------------------ local attack -> 'pa'
  // The local stickman's one-shot animations (swings, kicks, wind-ups, rolls, flinches) are mirrored
  // on remote screens via 'pa' {k, d, ss, sd}. Block / knockdown are continuous, so they ride in 'ps'.
  const lastPa = {};
  function sendPa(k, d, ss = null, extra = null) {
    if (!net.connected) return;
    const now = performance.now();
    if (now - (lastPa[k] || 0) < (k === 'p' ? 60 : 90)) return; // anti-spam
    lastPa[k] = now;
    const m = { t: 'pa', d: Math.round((Number(d) || 0.28) * 100) / 100 };
    if (k !== 'p') m.k = k;
    if (ss) m.ss = String(ss).slice(0, 16);
    if (extra) Object.assign(m, extra);
    session.broadcast(m);
  }
  const sendPunch = (d, ss) => sendPa('p', d, ss || game.player?.swingStyle || null);
  function wrapModel(model) {
    if (!model || model._netWrapped || typeof model.punch !== 'function') return;
    const wrap = (name, fn) => {
      const orig = model[name];
      if (typeof orig !== 'function') return;
      model[name] = (...args) => { const r = orig.apply(model, args); try { fn(...args); } catch { /* ignore */ } return r; };
    };
    wrap('punch', (d, ss) => sendPunch(d, ss));
    wrap('windup', (d, ss) => sendPa('w', d, ss));
    wrap('cancelWindup', () => sendPa('c', 0.1));
    wrap('roll', (d) => sendPa('r', d ?? 0.4));
    wrap('hitReact', (side) => sendPa('h', 0.24, null, { sd: Math.sign(Number(side) || 0) }));
    model._netWrapped = true;
  }
  wrapModel(game.player?.model);
  game.bus.on('player:model-rebuilt', ({ model } = {}) => wrapModel(model || game.player?.model));
  game.bus.on('player:attack', (d) => sendPunch(d?.duration, d?.swingStyle));

  // ------------------------------------------------------------------ per-frame system
  let psAcc = 0, hudAcc = 0;
  game.addSystem({
    name: 'net',
    update(dt) {
      avatars.update(dt);
      hudAcc += dt;
      if (hudAcc > 0.5) { hudAcc = 0; refreshHud(); }
      if (!net.connected) return;
      psAcc += dt;
      if (psAcc < 1 / PS_HZ) return;
      psAcc = 0;
      session.broadcast(buildPs(), { volatile: true });
    },
  });

  // Compact player state. Name + look only every PS_META_EVERY packets or when they change
  // (receivers keep the last ones), booleans only when true.
  let psSeq = 0, lastMetaKey = '';
  const PS_META_EVERY = 15;
  function buildPs(forceMeta = false) {
    const pl = game.player, p = game.state.p;
    const veh = pl?.vehicle;
    const src = veh?.group?.position || pl.group.position;
    let facing = pl.facing;
    if (veh?.group) facing = veh.group.rotation.y;
    facing = Math.atan2(Math.sin(facing), Math.cos(facing));
    let v = null;
    if (veh) {
      try {
        const ns = game.vehicles?.netState?.();
        if (ns) v = { carId: ns.carId, color: ns.color, speed: ns.speed, steer: ns.steer };
      } catch { v = null; }
    }
    const r2 = (n) => Math.round(n * 100) / 100;
    const m = {
      t: 'ps',
      x: r2(src.x), y: r2(src.y), z: r2(src.z), f: Math.round(facing * 100) / 100,
      s: Math.round((veh ? Math.abs(veh.speed ?? 0) : pl.speed) * 10) / 10,
      hp: Math.round(p.hp), mh: p.maxHp,
      ts: Math.round(performance.now()) & 0xffff, // sender clock for snapshot interpolation
    };
    if ((p.weapon || 'fists') !== 'fists') m.w = p.weapon;
    if (pl.aiming) m.a = 1;
    if (pl.dead || p.hp <= 0) m.d = 1;
    if (v) m.v = v;
    let cb = null;
    try { cb = game.combat; } catch { cb = null; }
    if (cb?.blocking) m.b = 1;
    if (cb?.isDown) m.k = 2;          // KO'd: NPCs on the host stop targeting us
    else if (cb?.downed) m.k = 1;     // knocked flat for a second
    const name = myName(), look = p.look || null;
    const key = name + '|' + JSON.stringify(look);
    if (forceMeta || key !== lastMetaKey || psSeq++ % PS_META_EVERY === 0) { m.name = name; m.look = look; lastMetaKey = key; }
    return m;
  }

  // ------------------------------------------------------------------ HUD
  function refreshHud() {
    const st = session.status;
    let html = '';
    const friends = session.names.size;
    if (st === 'hosting') {
      html = `<span class="net-hud">CO-OP: <b>HOST</b> · ${friends ? `${friends} friend${friends > 1 ? 's' : ''}` : 'waiting for friends'}<kbd>T</kbd>chat</span>`;
    } else if (st === 'client') {
      const ping = session.ping.get(session.hostId);
      html = `<span class="net-hud">CO-OP: <b>${friends} other${friends === 1 ? '' : 's'}</b> · ${ping != null ? ping + 'ms' : '…'}<kbd>T</kbd>chat</span>`;
    } else if (st === 'connecting') {
      html = '<span class="net-hud warn">CO-OP: <b>connecting…</b></span>';
    } else if (st === 'reconnecting') {
      html = '<span class="net-hud bad">CO-OP: <b>reconnecting…</b></span>';
    }
    try { game.ui.setHud('extra', html); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ invite panel
  function inviteBody() {
    const st = session.status;
    const link = net.inviteLink();
    let status;
    if (st === 'hosting') status = `<span class="ui-good">You're hosting.</span> Send this link to up to ${MAX_CLIENTS} friends:`;
    else if (st === 'client') status = `<span class="ui-good">Connected to ${esc(session.names.get(session.hostId) || 'the host')}'s game.</span> Share the host's link:`;
    else if (st === 'connecting') status = 'Calling the matchmaking server… hang tight.';
    else if (st === 'reconnecting') status = '<span class="ui-bad">Lost the host — trying to reconnect…</span>';
    else status = session.lastError ? `<span class="ui-bad">${esc(session.lastError)}</span>` : 'Not connected.';
    const rows = [];
    if (net.connected) {
      rows.push(`<tr><td>${esc(myName())} <span class="ui-muted">(you${net.isHost ? ', host' : ''})</span></td><td>—</td></tr>`);
      for (const p of net.peers()) {
        rows.push(`<tr><td>${esc(p.name)}${p.isHost ? ' <span class="ui-muted">(host)</span>' : ''}</td><td>${p.ping != null ? p.ping + ' ms' : '…'}</td></tr>`);
      }
    }
    return `
      <div class="ni-status">${status}</div>
      ${link ? `<div class="ni-link"><input class="ui-input" readonly value="${esc(link)}"><button class="ui-btn primary" data-copy>Copy</button></div>` : ''}
      ${net.connected ? `<div class="ui-section">Players (${1 + session.names.size}/${MAX_CLIENTS + 1})</div>
        <table class="ui-table"><tr><th>Name</th><th>Ping</th></tr>${rows.join('')}</table>` : ''}
      <div class="ui-row" style="margin-top:12px">
        ${st === 'offline' ? '<button class="ui-btn primary" data-host>Host a game</button>' : ''}
        ${net.connected || st === 'reconnecting' ? '<button class="ui-btn" data-leave>Leave co-op</button>' : ''}
      </div>
      <div class="ni-tip">Friends open the link in their browser and hit Join. Works over the internet via the free PeerJS broker — some strict corporate/school networks may block it. Everyone keeps their own character, cash and save.</div>`;
  }

  function wireInvite(entry) {
    const b = entry.body;
    b.querySelector('[data-copy]')?.addEventListener('click', async (e) => {
      const input = b.querySelector('.ni-link input');
      const link = input?.value;
      let ok = false;
      try { await navigator.clipboard.writeText(link); ok = true; } catch {
        try { input.select(); ok = document.execCommand('copy'); } catch { ok = false; }
      }
      e.target.textContent = ok ? 'Copied!' : 'Select & Ctrl+C';
      if (ok) toast('Invite link copied. Go spam your group chat.', 'good', 2200);
    });
    b.querySelector('.ni-link input')?.addEventListener('focus', (e) => e.target.select());
    b.querySelector('[data-host]')?.addEventListener('click', () => startHost());
    b.querySelector('[data-leave]')?.addEventListener('click', async () => {
      entry.close();
      if (await game.ui.confirm('Leave co-op and keep playing solo?')) session.leave();
    });
  }

  function refreshInvite() {
    if (!invitePanel || invitePanel.closed) return;
    // don't rebuild while the user is selecting text in the link box
    if (document.activeElement && invitePanel.body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const html = inviteBody();
    if (invitePanel._last === html) return;
    invitePanel._last = html;
    invitePanel.body.innerHTML = html;
    wireInvite(invitePanel);
  }

  function openInvitePanel() {
    if (invitePanel && !invitePanel.closed) { refreshInvite(); return; }
    const entry = game.ui.openPanel({
      title: 'Co-op', body: '', width: 560, className: 'net-invite',
      onClose: () => { clearInterval(entry._iv); if (invitePanel === entry) invitePanel = null; },
    });
    invitePanel = entry;
    entry._last = null;
    refreshInvite();
    entry._iv = setInterval(refreshInvite, 1000);
  }

  // ------------------------------------------------------------------ friend picker / gift / teleport
  async function pickFriend(title, verb) {
    const peers = net.peers();
    if (!net.connected || !peers.length) {
      toast(net.connected ? 'No friends here yet. Invite some (pause menu → Co-op).' : "You're not in co-op. Host or join a game first.", 'bad');
      return null;
    }
    if (peers.length === 1) return peers[0];
    const i = await game.ui.dialog({
      title, text: `Who do you want to ${verb}?`,
      options: [...peers.map((p) => ({ label: esc(p.name), hint: p.isHost ? 'host' : '' })), { label: 'Never mind' }],
    });
    return i != null && i < peers.length ? peers[i] : null;
  }

  async function giveCash() {
    const f = await pickFriend('Give cash', 'bankroll');
    if (!f) return;
    const money = Math.floor(game.state.p.money);
    if (money < 1) { toast("You're broke. You can't even give them a nickel.", 'bad'); return; }
    const n = await game.ui.promptNumber({
      title: `Give cash to ${esc(f.name)}`, text: `You have ${fmtMoney(money)} on you. How generous are we feeling?`,
      min: 1, max: money, initial: Math.min(money, 100),
    });
    if (!n || n <= 0) return;
    if (!session.names.has(f.id)) { toast(`${esc(f.name)} left before you could pay them. Lucky you.`, 'bad'); return; }
    if (!game.state.spend(n, 'gift')) return;
    session.sendTo(f.id, { t: 'gift', amount: n, from: myName() });
    toast(`You slipped <b>${esc(f.name)}</b> ${fmtMoney(n)}. How charitable. How suspicious.`, 'money');
    sys(`You gave ${f.name} ${fmtMoney(n)}.`, 'money');
  }

  async function teleport() {
    const f = await pickFriend('Teleport', 'pop up next to');
    if (!f) return;
    const rp = net.remotePlayers.get(f.id);
    const pl = game.player;
    if (!rp || rp._fresh) { toast(`Can't see where ${esc(f.name)} is yet. Give it a sec.`, 'bad'); return; }
    if (pl.vehicle) { toast("Get out of the car first (F). Teleporting with a car is how you get fused to it.", 'bad'); return; }
    if (pl.dead) return;
    const off = rp.vehicle ? 3.4 : 1.6;
    let best = null;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const x = rp.pos.x + Math.cos(a) * off, z = rp.pos.z + Math.sin(a) * off;
      let r = { x, z };
      try { r = game.physics.resolveCircle(x, z, pl.radius || 0.45) || r; } catch { /* ignore */ }
      if (!best || Math.hypot(r.x - x, r.z - z) < best.d) best = { x: r.x, z: r.z, d: Math.hypot(r.x - x, r.z - z) };
      if (best.d < 0.01) break;
    }
    const facing = Math.atan2(rp.pos.x - best.x, rp.pos.z - best.z);
    pl.spawn(best.x, best.z, facing);
    if (game.cameraRig) game.cameraRig.yaw = facing + Math.PI;
    toast(`*poof* You're next to <b>${esc(f.name)}</b>. Nobody saw that.`, 'good');
    if (net.connected) session.broadcast(buildPs());
  }

  // ------------------------------------------------------------------ pause menu entries
  const menu = game.ui.menuButtons;
  menu.push({
    label: 'Co-op: invite friends',
    get hint() {
      return net.isHost ? `hosting · ${session.names.size} friend${session.names.size === 1 ? '' : 's'}` : net.isClient ? 'connected' : 'start hosting';
    },
    onClick: () => {
      if (!net.connected && session.status === 'offline') startHost({ openInvite: true });
      else openInvitePanel();
    },
  });
  menu.push({ label: 'Give cash to a friend', get hint() { return net.connected ? '' : 'co-op only'; }, onClick: () => giveCash() });
  menu.push({ label: 'Teleport to a friend', get hint() { return net.connected ? '' : 'co-op only'; }, onClick: () => teleport() });
  menu.push({
    label: 'Leave co-op',
    get hint() { return net.connected ? '' : 'not connected'; },
    onClick: async () => {
      if (!net.connected && session.status !== 'reconnecting') { toast("You're not in a co-op game.", 'info'); return; }
      const msg = net.isHost ? 'End the co-op session? Your friends get booted back to solo.' : 'Leave co-op and keep playing solo?';
      if (await game.ui.confirm(msg)) session.leave();
    },
  });

  // Character sheet: who's online.
  game.ui.sheetSections?.push(() => {
    if (!net.connected) return '';
    const rows = net.peers().map((p) => {
      const rp = net.remotePlayers.get(p.id);
      return `<tr><td>${esc(p.name)}${p.isHost ? ' <span class="ui-muted">(host)</span>' : ''}</td><td>${rp ? `HP ${Math.ceil(rp.hp)}/${rp.maxHp}` : ''}</td><td>${p.ping != null ? p.ping + ' ms' : ''}</td></tr>`;
    }).join('');
    return `<div class="ui-section">Co-op crew</div><table class="ui-table">${rows || '<tr><td class="ui-muted">Nobody yet.</td></tr>'}</table>`;
  });

  // Say goodbye properly when the tab closes so others don't wait for a timeout.
  addEventListener('pagehide', () => { if (net.connected) session.leave(true); });

  refreshHud();
}
