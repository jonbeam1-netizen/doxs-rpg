import { fmtMoney, esc, clamp, pick } from '../core/util.js';

// Co-op drag race at the Dustbowl Drag Strip: race a friend over the SAME checkpoints (the
// challenger builds the track and sends it), synchronized 3-2-1, each side times its own run from
// its own GO, and both compare finish times. Optional bet: both stake it, the winner takes both.
//   drag:inv   A -> B  {rid, bet, s:[x,z], cps:[[x,z]...], lane}
//   drag:ans   B -> A  {rid, ok, why?}
//   drag:go    A -> B  {rid, ms}          B starts its countdown ms after receiving; A waits ms + ping/2
//   drag:cp    X -> Y  {rid, i}           checkpoint reached (position HUD)
//   drag:fin   X -> Y  {rid, tm}          finished in tm seconds
//   drag:quit  X -> Y  {rid, why}         forfeit (bailed out, car wrecked, gave up) / cancel before start

const STRIP_ID = 'drag_strip';
const NEAR_STRIP = 220;
const CP_RADIUS = 10;
const COUNT_MS = 3200;
const MAX_TIME = 300;
const MAX_BET = 50000;

export function installDrag(game, U) {
  const net = game.net, vm = game.vehicles;
  let R = null; // { rid, opp, role:'a'|'b', phase, bet, track, side, car, loaner, goAt, t, idx, oppIdx, myT, oppT, shown }

  const strip = () => game.locations?.get?.(STRIP_ID) || null;
  const stripPos = () => { const l = strip(); return l ? { x: l.doorX ?? l.x, z: l.doorZ ?? l.z } : null; };
  const nearStrip = (x, z) => { const s = stripPos(); return !!s && Math.hypot(x - s.x, z - s.z) < NEAR_STRIP; };
  const busy = () => !!R || !!vm?.race?.active || !!game.coop?.spar?.active;

  // ------------------------------------------------------------ challenge
  async function challenge(loc) {
    const f = await net.pickFriend?.('Race a friend', 'race');
    if (f) challengeFriend(f.id, loc);
  }

  async function challengeFriend(peerId, loc = strip()) {
    if (!net.connected || !U.known(peerId)) { U.toast('Racing a friend needs a friend. Co-op only.', 'bad'); return; }
    if (busy()) { U.toast('Finish what you started first.', 'bad'); return; }
    const pp = U.myPos();
    const sp = stripPos();
    if (!loc || !sp) { U.toast("Can't find the Drag Strip. Did somebody steal it?", 'bad'); return; }
    if (!nearStrip(pp.x, pp.z)) {
      game.world?.setWaypoint?.(sp.x, sp.z, 'Drag Strip');
      U.toast('Races start at the <b>Dustbowl Drag Strip</b>. Waypoint set — meet your friend there.', 'info', 3500);
      return;
    }
    const rp = U.live(peerId);
    if (!rp || !nearStrip(rp.pos.x, rp.pos.z)) { U.toast(`<b>${esc(U.nameOf(peerId))}</b> needs to be at the Drag Strip too.`, 'bad', 3000); return; }
    if (game.player.vehicle?.passenger) { U.toast('Get your own car. Shotgun riders don\'t race.', 'bad'); return; }
    const money = Math.floor(game.state.p.money);
    const bet = await game.ui.promptNumber({ title: `Race ${esc(U.nameOf(peerId))}`, text: `Put money on it? Both of you stake it, winner takes all. 0 = bragging rights only. (You have ${fmtMoney(money)})`, min: 0, max: Math.min(money, MAX_BET), initial: 0 });
    if (bet == null || bet < 0 || busy() || !U.known(peerId)) return;
    if (bet > 0 && !game.state.spend(bet, 'race bet')) return;
    let track;
    try { track = vm.race.buildTrack(loc); } catch (e) { console.error('[coop] track build failed', e); }
    if (!track?.cps?.length) { if (bet) game.state.addMoney(bet, 'race refund'); U.toast('The track is closed (bug). Bet refunded.', 'bad'); return; }
    const r2 = (n) => Math.round(n * 10) / 10;
    const cps = track.cps.slice(0, 16).map((c) => [r2(c.x), r2(c.z)]);
    R = { rid: U.newId(), opp: peerId, role: 'a', phase: 'invite', bet, t: U.elapsed(), track: { start: { x: track.start.x, z: track.start.z }, cps: cps.map(([x, z]) => ({ x, z })), lane: track.lane || 2.4 } };
    U.send(peerId, { t: 'drag:inv', rid: R.rid, bet, s: [r2(track.start.x), r2(track.start.z)], cps, lane: Math.round(R.track.lane * 100) / 100 });
    U.toast(`Challenge sent to <b>${esc(U.nameOf(peerId))}</b>${bet ? ` for ${fmtMoney(bet)}` : ''}. Waiting…`, 'info', 3000);
  }

  net.on('drag:inv', async (m, from) => {
    if (!U.known(from) || !U.rate(from, 'drag:inv', 1500)) return;
    const rid = U.word(m.rid, 16);
    if (!rid) return;
    const no = (why) => U.send(from, { t: 'drag:ans', rid, ok: 0, why });
    const bet = U.int(m.bet, 0, MAX_BET);
    const sx = U.coord(m.s?.[0]), sz = U.coord(m.s?.[1]);
    const lane = U.num(m.lane, 1.5, 6) ?? 2.4;
    if (bet == null || sx == null || sz == null || !Array.isArray(m.cps) || m.cps.length < 2 || m.cps.length > 20) return;
    const cps = [];
    for (const c of m.cps) {
      const x = U.coord(c?.[0]), z = U.coord(c?.[1]);
      if (x == null || z == null) return;
      cps.push({ x, z });
    }
    if (busy() || game.ui.isBlocking()) return no('busy');
    const pp = U.myPos();
    if (!nearStrip(pp.x, pp.z)) {
      U.toast(`<b>${esc(U.nameOf(from))}</b> challenged you to a drag race, but you're not at the Drag Strip.`, 'info', 3500);
      return no('far');
    }
    R = { rid, opp: from, role: 'b', phase: 'asked', bet, t: U.elapsed(), track: { start: { x: sx, z: sz }, cps, lane } };
    const name = esc(U.nameOf(from));
    const can = bet <= game.state.p.money;
    const i = await game.ui.dialog({
      title: 'Drag race challenge', speaker: name,
      text: `${name} wants to race you, same track, same start.\n\n${bet ? `Stakes: <b>${fmtMoney(bet)}</b> each, winner takes ${fmtMoney(bet * 2)}.` : 'No money, just bragging rights. And humiliation.'}\n\nYou'll start in your current car (or a track junker).`,
      options: [{ label: 'You\'re on', disabled: !can, hint: can ? '' : "you can't cover the bet" }, { label: 'Pass' }],
    });
    if (!R || R.rid !== rid || R.phase !== 'asked') return;
    if (i !== 0 || !U.known(from)) { R = null; no('no'); return; }
    if (bet > 0 && !game.state.spend(bet, 'race bet')) { R = null; no('broke'); return; }
    R.phase = 'wait'; R.t = U.elapsed();
    U.send(from, { t: 'drag:ans', rid, ok: 1 });
  });

  net.on('drag:ans', (m, from) => {
    if (!R || R.phase !== 'invite' || R.opp !== from || m.rid !== R.rid) return;
    if (m.ok !== 1) {
      const why = { busy: 'is busy', far: "isn't at the Drag Strip", broke: "can't cover the bet" }[m.why] || 'passed';
      U.toast(`<b>${esc(U.nameOf(from))}</b> ${why}.${R.bet ? ' Bet refunded.' : ''}`, 'info', 3000);
      if (R.bet) game.state.addMoney(R.bet, 'race refund');
      R = null;
      return;
    }
    const ping = clamp(Number(net.ping?.get?.(from)) || Number(net.ping?.get?.(net.hostId)) || 80, 0, 1500);
    U.send(from, { t: 'drag:go', rid: R.rid, ms: COUNT_MS });
    setup(performance.now() + COUNT_MS + ping / 2);
  });

  net.on('drag:go', (m, from) => {
    if (!R || R.phase !== 'wait' || R.opp !== from || m.rid !== R.rid) return;
    const ms = U.num(m.ms, 1000, 8000) ?? COUNT_MS;
    setup(performance.now() + ms);
  });

  // ------------------------------------------------------------ start line
  function setup(goAt) {
    const g = game;
    const pl = g.player;
    if (pl.vehicle?.passenger) { try { g.coop?.ride?.hopOut?.('key'); } catch { /* ignore */ } }
    const tr = R.track;
    const s = tr.start, n = tr.cps[0];
    const len = Math.hypot(n.x - s.x, n.z - s.z) || 1;
    const ux = (n.x - s.x) / len, uz = (n.z - s.z) / len;
    const rot = Math.atan2(ux, uz);
    const lane = Math.max(2.2, tr.lane || 2.4);
    const side = R.role === 'a' ? 1 : -1;
    let car = vm.current;
    if (!car || car.removed || car.dead) {
      car = vm.spawnCar('rustbucket', { x: s.x, z: s.z, rot, color: '#6b6a66', owner: 'player' });
      R.loaner = car;
    }
    car.group.position.set(s.x - uz * lane * side, 0, s.z + ux * lane * side);
    car.heading = rot; car.group.rotation.y = rot;
    car.vel.set(0, 0); car.angVel = 0; car.steer = 0;
    if (vm.current !== car) { if (vm.current) vm.exit(true); vm.enter(car); }
    g.cameraRig.yaw = rot + Math.PI;
    car.frozen = true;
    R.car = car;
    R.phase = 'count'; R.goAt = goAt; R.idx = 0; R.oppIdx = 0; R.myT = null; R.oppT = null; R.shown = null; R.elapsed = 0;
    vm.race.makeGates();
    placeGates();
    g.ui.toast(`Racing <b>${esc(U.nameOf(R.opp))}</b>${R.bet ? ` · ${fmtMoney(R.bet * 2)} pot` : ''}. Follow the beacons!`, 'info', 3500);
  }

  function placeGate(gate, i) {
    const cps = R.track.cps, cp = cps[i];
    if (!cp) { gate.visible = false; return; }
    const prev = i === 0 ? R.track.start : cps[i - 1];
    gate.position.set(cp.x, 0, cp.z);
    gate.rotation.y = Math.atan2(cp.x - prev.x, cp.z - prev.z);
    gate.visible = true;
  }
  function placeGates() {
    const gates = vm.race.gates || vm.race.makeGates();
    placeGate(gates[0], R.idx);
    placeGate(gates[1], R.idx + 1);
  }

  // ------------------------------------------------------------ in the race
  net.on('drag:cp', (m, from) => {
    if (!R || R.opp !== from || m.rid !== R.rid) return;
    const i = U.int(m.i, 0, 40);
    if (i != null && i > R.oppIdx) R.oppIdx = i;
  });
  net.on('drag:fin', (m, from) => {
    if (!R || R.opp !== from || m.rid !== R.rid) return;
    const t = U.num(m.tm, 0, MAX_TIME + 30);
    if (t == null || R.oppT != null) return;
    R.oppT = t;
    if (R.phase === 'race') U.toast(`<b>${esc(U.nameOf(from))}</b> crossed the line in ${t.toFixed(2)} s!`, 'bad', 2500);
    resolve();
  });
  net.on('drag:quit', (m, from) => {
    if (!R || R.opp !== from || m.rid !== R.rid) return;
    if (R.phase === 'invite' || R.phase === 'asked' || R.phase === 'wait') {
      if (R.bet && R.phase !== 'asked') game.state.addMoney(R.bet, 'race refund');
      U.toast(`<b>${esc(U.nameOf(from))}</b> called off the race.${R.bet && R.phase !== 'asked' ? ' Bet refunded.' : ''}`, 'info', 2600);
      R = null;
      return;
    }
    if (R.phase === 'done') return;
    finish('won', `${U.nameOf(from)} forfeited.`);
  });

  function quit(why) {
    if (!R) return;
    U.send(R.opp, { t: 'drag:quit', rid: R.rid, why });
    finish('lost', why);
  }

  function resolve() {
    if (!R || R.phase === 'done') return;
    if (R.myT == null) return; // still racing; the HUD shows they finished
    const me = R.myT, opp = R.oppT;
    if (opp == null) { R.waitT = 0; return; } // waiting for their time (or a timeout)
    const won = me < opp || (me === opp && R.role === 'a');
    finish(won ? 'won' : 'lost', `${me.toFixed(2)} s vs ${opp.toFixed(2)} s`);
  }

  function finish(result, why = '') {
    const g = game;
    if (!R || R.phase === 'done') return;
    R.phase = 'done';
    R.doneT = 4.5;
    const opp = U.nameOf(R.opp);
    if (result === 'won') {
      if (R.bet) g.state.addMoney(R.bet * 2, 'race');
      g.state.addXP?.(20 + Math.min(60, Math.round(R.bet / 250)));
      U.big('YOU WIN', `${why ? esc(why) + ' · ' : ''}${R.bet ? '+' + fmtMoney(R.bet * 2) + ' · ' : ''}${esc(pick([`${opp} eats your dust.`, `Tell ${opp} to get a real car.`, 'Pure skill. Mostly.']))}`, 4200, 'good');
      g.bus.emit('race:won', { bet: R.bet, coop: true, opp: R.opp });
    } else if (result === 'refund') {
      if (R.bet) g.state.addMoney(R.bet, 'race refund');
      U.big('NO CONTEST', `${esc(why || 'Race called off.')}${R.bet ? ' Bet refunded.' : ''}`, 3200);
    } else {
      U.big(`${opp.toUpperCase()} WINS`, `${why ? esc(why) + ' · ' : ''}${esc(pick(['Rematch? Rematch.', 'Blame the car.', 'Your car is a shopping cart with opinions.']))}`, 4200);
      g.bus.emit('race:lost', { bet: R.bet, coop: true, opp: R.opp });
    }
    for (const gate of vm.race.gates || []) gate.visible = false;
    g.world?.markers?.delete?.('race:next');
    try { g.ui.setHud('extra', ''); } catch { /* ignore */ }
    if (R.car && !R.car.removed) R.car.frozen = false;
  }

  function cleanup() {
    if (R?.loaner && !R.loaner.removed && R.loaner !== vm.current) R.loaner.removeAt = game.elapsed + 20;
    R = null;
    try { net.refreshHud?.(); } catch { /* ignore */ }
  }

  function progress(idx) {
    const cp = R.track.cps[idx];
    if (!cp) return idx * 10000;
    const c = R.car;
    return idx * 10000 - Math.hypot(c.x - cp.x, c.z - cp.z);
  }
  function oppProgress() {
    const cp = R.track.cps[R.oppIdx];
    const rp = U.live(R.opp);
    if (!cp || !rp) return R.oppIdx * 10000;
    return R.oppIdx * 10000 - Math.hypot(rp.pos.x - cp.x, rp.pos.z - cp.z);
  }

  function hud() {
    const n = R.track.cps.length;
    const t = R.elapsed;
    let pos;
    if (R.phase === 'count') pos = 'get ready';
    else if (R.myT != null) pos = `finished <b>${R.myT.toFixed(2)} s</b>${R.oppT == null ? ' · waiting…' : ''}`;
    else {
      const lead = R.oppT == null && progress(R.idx) >= oppProgress();
      pos = `<b style="color:${lead ? '#7fbf4d' : '#e2402f'}">${lead ? '1st' : '2nd'}</b>`;
    }
    game.ui.setHud('extra', `<div style="background:rgba(10,8,6,.72);border:1px solid #3a3128;padding:6px 10px;font-size:18px">
      <b style="color:#ffd23c">DRAG RACE</b> vs ${esc(U.nameOf(R.opp))}${R.bet ? ` · ${fmtMoney(R.bet * 2)} pot` : ''}<br>
      Checkpoint <b>${Math.min(R.idx + 1, n)}/${n}</b> · ${pos} · ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</div>`);
  }

  // ------------------------------------------------------------ per frame
  function update(dt) {
    if (!R) return;
    const g = game;
    const now = U.elapsed();
    if (R.phase === 'invite' || R.phase === 'asked' || R.phase === 'wait') {
      if (now - R.t > 30) {
        if (R.phase !== 'asked') { U.send(R.opp, { t: 'drag:quit', rid: R.rid, why: 'timeout' }); if (R.bet) g.state.addMoney(R.bet, 'race refund'); }
        U.toast('Race challenge expired.', 'info');
        R = null;
      }
      return;
    }
    if (R.phase === 'done') {
      R.doneT -= dt;
      if (R.doneT <= 0) cleanup();
      return;
    }
    if (!net.remotePlayers.has(R.opp) || !net.connected) {
      if (R.myT != null && R.oppT == null) finish('won', `${U.nameOf(R.opp)} left before finishing.`);
      else finish('refund', `${U.nameOf(R.opp)} left.`);
      return;
    }
    if (!R.car || R.car.removed || R.car.exploded) { quit('Your ride is toast. Forfeit.'); return; }
    if (vm.current !== R.car) { if (R.myT == null) { quit('You bailed out. Forfeit.'); return; } }
    if (R.phase === 'count') {
      const left = (R.goAt - performance.now()) / 1000;
      const sec = Math.ceil(left);
      if (sec !== R.shown && sec <= 3) {
        R.shown = sec;
        if (sec > 0) { U.big(String(sec), 'Hold it… hold it…', 900); try { vm.audio.beep(520, 0.18); } catch { /* ignore */ } }
      }
      if (left <= 0) {
        R.phase = 'race';
        R.car.frozen = false;
        R.startPerf = performance.now();
        U.big('GO!', 'Floor it!', 900);
        try { vm.audio.beep(880, 0.4, 0.16); } catch { /* ignore */ }
      }
      hud();
      return;
    }
    // racing (or finished, waiting for their time)
    if (R.myT == null) {
      R.elapsed = (performance.now() - R.startPerf) / 1000;
      const cps = R.track.cps, pc = cps[R.idx];
      if (pc && Math.hypot(R.car.x - pc.x, R.car.z - pc.z) < CP_RADIUS) {
        R.idx++;
        try { vm.audio.beep(R.idx >= cps.length ? 990 : 760, 0.12); } catch { /* ignore */ }
        U.send(R.opp, { t: 'drag:cp', rid: R.rid, i: R.idx });
        if (R.idx >= cps.length) {
          R.myT = Math.round(R.elapsed * 1000) / 1000;
          U.send(R.opp, { t: 'drag:fin', rid: R.rid, tm: R.myT });
          for (const gate of vm.race.gates || []) gate.visible = false;
          g.world?.markers?.delete?.('race:next');
          resolve();
          if (!R || R.phase === 'done') return;
        } else placeGates();
      }
      if (R.car.dead) { quit('Your ride is on fire. Forfeit.'); return; }
      if (R.elapsed > MAX_TIME) { quit('Too slow. Way too slow.'); return; }
      const m = g.world?.markers;
      if (m?.set && cps[R.idx]) m.set('race:next', { x: cps[R.idx].x, z: cps[R.idx].z, color: '#ffd23c', label: 'Checkpoint' });
    } else {
      R.waitT = (R.waitT || 0) + dt;
      if (R.waitT > 45) { finish('won', `${U.nameOf(R.opp)} never finished.`); return; }
    }
    if (R && R.phase !== 'done') hud();
  }

  game.bus.on('net:disconnected', () => {
    if (!R) return;
    if (R.phase === 'count' || R.phase === 'race') finish('refund', 'Lost the connection.');
    else { if (R.bet && R.phase !== 'asked') game.state.addMoney(R.bet, 'race refund'); R = null; }
  });
  game.bus.on('net:player-left', ({ id } = {}) => {
    if (!R || R.opp !== id) return;
    if (R.phase === 'invite' || R.phase === 'wait') { if (R.bet) game.state.addMoney(R.bet, 'race refund'); U.toast('Your rival left. Bet refunded.', 'info'); R = null; }
    else if (R.phase === 'asked') R = null;
  });

  return {
    challenge, challengeFriend, update,
    get active() { return !!R && (R.phase === 'count' || R.phase === 'race' || R.phase === 'done'); },
  };
}
