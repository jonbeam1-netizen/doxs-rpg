import { WEAPONS } from '../data/weapons.js';
import { esc, clamp, pick } from '../core/util.js';

// Friendly sparring: a consensual, non-lethal 1v1 between two players (anywhere, The Pit included).
// Players can never hurt each other outside an accepted spar; inside one, only melee counts and the
// loser "taps out" at 15% HP (nobody dies, nobody gets mugged, HP is restored afterwards).
//   spar:inv  A -> B  {sid}                    challenge
//   spar:ans  B -> A  {sid, ok, why?}          accept / decline ('busy' | 'no')
//   spar:go   A -> B  {sid}                    both start the 3-2-1
//   spar:hit  X -> Y  {sid, dmg, dx, dz, hv}   attacker-side hit detection; Y validates & applies
//   spar:end  X -> Y  {sid, why}               'yield' | 'quit' (X lost) · 'far' | 'time' (draw)

const INVITE_TTL = 25;
const MAX_TIME = 180;
const FLOOR = 0.15;        // tap out at this fraction of max HP
const MAX_RANGE = 40;      // walk further apart than this and it's called off

export function installSpar(game, U) {
  const net = game.net;
  let S = null; // { sid, opp, role, phase:'invite'|'asked'|'wait'|'count'|'fight', t, preHp, hits, taken, startT }
  const swings = [];

  const busy = () => !!S || !!game.coop?.drag?.active;
  const oppName = () => esc(U.nameOf(S?.opp));

  function invite(peerId) {
    if (!net.connected) { U.toast('Sparring needs a sparring partner. Host or join a co-op game.', 'bad'); return; }
    if (!U.known(peerId)) { U.toast('They left.', 'bad'); return; }
    if (busy()) { U.toast("You're already busy with a fight or a race.", 'bad'); return; }
    if (!U.free()) { U.toast('Get out of the car and on your feet first.', 'bad'); return; }
    const rp = U.live(peerId);
    if (!rp) { U.toast("Can't see them yet.", 'bad'); return; }
    if (rp.vehicle || rp.ride) { U.toast(`${esc(rp.name)} is in a car. Kinda hard to box like that.`, 'bad'); return; }
    if (U.distTo(peerId) > 30) { U.toast(`Get within 30 m of <b>${esc(rp.name)}</b> first. You can't spar by text.`, 'bad'); return; }
    S = { sid: U.newId(), opp: peerId, role: 'a', phase: 'invite', t: U.elapsed() };
    U.send(peerId, { t: 'spar:inv', sid: S.sid });
    U.toast(`You challenged <b>${esc(rp.name)}</b> to a friendly spar. Waiting…`, 'info', 3000);
  }

  async function inviteMenu() {
    const f = await net.pickFriend?.('Spar', 'spar with');
    if (f) invite(f.id);
  }

  net.on('spar:inv', async (m, from) => {
    if (!U.known(from) || !U.rate(from, 'spar:inv', 1500)) return;
    const sid = U.word(m.sid, 16);
    if (!sid) return;
    if (busy() || !U.free() || game.ui.isBlocking()) { U.send(from, { t: 'spar:ans', sid, ok: 0, why: 'busy' }); return; }
    S = { sid, opp: from, role: 'b', phase: 'asked', t: U.elapsed() };
    const name = esc(U.nameOf(from));
    const i = await game.ui.dialog({
      title: 'Friendly spar?', speaker: name,
      text: `${name} wants to throw hands. Friendly-like.\n\nNon-lethal 1v1 · fists & melee only · first to drop to 15% HP taps out · HP restored afterwards.`,
      options: [{ label: 'Bring it' }, { label: 'Nah, I bruise easy' }],
    });
    if (!S || S.sid !== sid || S.phase !== 'asked') return; // expired / they left
    if (i === 0 && U.free() && U.live(from) && U.distTo(from) < 35) {
      S.phase = 'wait'; S.t = U.elapsed();
      U.send(from, { t: 'spar:ans', sid, ok: 1 });
    } else {
      S = null;
      U.send(from, { t: 'spar:ans', sid, ok: 0, why: i === 0 ? 'far' : 'no' });
      if (i === 0) U.toast('Too far away or not on your feet. Spar called off.', 'bad');
    }
  });

  net.on('spar:ans', (m, from) => {
    if (!S || S.phase !== 'invite' || S.opp !== from || m.sid !== S.sid) return;
    if (m.ok === 1) {
      if (!U.free()) { U.send(from, { t: 'spar:end', sid: S.sid, why: 'quit' }); S = null; U.toast('You got busy. Spar called off.', 'bad'); return; }
      U.send(from, { t: 'spar:go', sid: S.sid });
      begin();
    } else {
      const why = m.why === 'busy' ? `${oppName()} is busy right now.` : m.why === 'far' ? `${oppName()} is too far away.` : `${oppName()} chickened out. Bawk.`;
      S = null;
      U.toast(why, 'info', 2600);
    }
  });

  net.on('spar:go', (m, from) => {
    if (!S || S.phase !== 'wait' || S.opp !== from || m.sid !== S.sid) return;
    begin();
  });

  function begin() {
    const p = game.state.p;
    S.phase = 'count'; S.t = 3; S.preHp = p.hp; S.hits = 0; S.taken = 0; S.startT = U.elapsed(); S.lastIn = -1; S.shown = null;
    U.big(`SPAR vs ${U.nameOf(S.opp).toUpperCase()}`, 'Fists & melee only · tap out at 15% HP', 1800);
  }

  // ---- attacker side: our swings
  game.bus.on('player:attack', (d = {}) => {
    if (!S || S.phase !== 'fight' || d.gun) return;
    const kick = d.weapon === 'kick';
    swings.push({ at: U.elapsed() + clamp((Number(d.duration) || 0.3) * 0.45, 0.06, 0.35), kick, heavy: !!d.heavy, weapon: kick ? 'fists' : (d.weapon || game.combat?.weaponId || 'fists') });
    if (swings.length > 6) swings.shift();
  });

  function resolveSwing(sw) {
    const rp = U.live(S.opp);
    if (!rp || rp.dead || rp.vehicle || rp.ride) return;
    const pl = game.player;
    if (pl.dead || pl.vehicle) return;
    const pp = pl.group.position;
    const dx = rp.pos.x - pp.x, dz = rp.pos.z - pp.z;
    const dist = Math.hypot(dx, dz);
    const def = WEAPONS[sw.weapon] || WEAPONS.fists;
    if (def.kind === 'gun') return;
    const reach = (sw.kick ? 1.9 : def.range || 1.6) + 0.9; // remote positions lag a little: be generous
    if (dist > reach) return;
    const fwd = Math.atan2(dx, dz);
    let da = fwd - pl.facing;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > 1.15 && dist > 0.8) return;
    const str = Number(game.state.p.str) || 5;
    const base = sw.kick ? 10 : def.damage || 8;
    const dmg = Math.round(clamp(base * (1 + str / 60) * (sw.heavy ? 1.8 : 1) * 0.55, 2, 40));
    const l = dist || 1;
    U.send(S.opp, { t: 'spar:hit', sid: S.sid, dmg, dx: Math.round((dx / l) * 100) / 100, dz: Math.round((dz / l) * 100) / 100, hv: sw.heavy || sw.kick ? 1 : 0 });
    S.hits++;
    try { rp._model?.flash?.(); } catch { /* cosmetic */ }
    try { game.combat?.fx?.number?.(rp.pos.x, 2.3, rp.pos.z, '-' + dmg, 'small'); } catch { /* cosmetic */ }
    try { game.combat?.sfx?.('punch'); } catch { /* cosmetic */ }
  }

  // ---- defender side: their hits on us
  net.on('spar:hit', (m, from) => {
    if (!S || S.phase !== 'fight' || S.opp !== from || m.sid !== S.sid) return;
    if (!U.rate(from, 'spar:hit', 110)) return;
    const dmg = U.int(m.dmg, 1, 45);
    if (!dmg) return;
    const rp = U.live(from);
    if (!rp || U.distTo(from) > 8) return; // they can't be hitting us from over there
    let dx = U.num(m.dx, -1.01, 1.01) ?? 0, dz = U.num(m.dz, -1.01, 1.01) ?? 0;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const p = game.state.p;
    if (p.hp - dmg <= p.maxHp * FLOOR) {
      U.send(from, { t: 'spar:end', sid: S.sid, why: 'yield' });
      finish('lost');
      return;
    }
    S.taken += dmg;
    try {
      game.combat.hurtPlayer(dmg, { lethal: false, melee: true, dir: { x: dx, z: dz }, source: U.nameOf(from), heavyHit: !!m.hv });
    } catch (e) { console.error('[coop] spar hurt failed', e); }
  });

  net.on('spar:end', (m, from) => {
    if (!S || S.opp !== from || m.sid !== S.sid) return;
    if (S.phase === 'invite' || S.phase === 'asked' || S.phase === 'wait') { S = null; U.toast(`${esc(U.nameOf(from))} called off the spar.`, 'info'); return; }
    finish(m.why === 'far' || m.why === 'time' ? 'draw' : 'won', m.why);
  });

  function end(why, result) {
    if (!S) return;
    U.send(S.opp, { t: 'spar:end', sid: S.sid, why });
    finish(result, why);
  }

  function finish(result, why = '') {
    if (!S) return;
    const s = S;
    S = null;
    swings.length = 0;
    const p = game.state.p;
    const g = game;
    if (!g.player.dead && p.hp > 0) {
      p.hp = clamp(Math.max(p.hp, s.preHp ?? p.hp), 1, p.maxHp);
      g.state.changed('hp');
    }
    const opp = U.nameOf(s.opp);
    const me = U.myName();
    const long = U.elapsed() - (s.startT ?? U.elapsed()) > 15 && (s.hits + (s.taken ? 1 : 0)) >= 3;
    if (result === 'won') {
      U.big(`${me.toUpperCase()} WINS`, why === 'quit' || why === 'left' ? `${opp} forfeited. A win's a win.` : pick([`${opp} tapped out. Respect.`, `${opp} is gonna feel that tomorrow.`, 'Undisputed champion of this sidewalk.']), 3200, 'good');
      if (long) g.state.addXP(12);
    } else if (result === 'lost') {
      U.big(`${opp.toUpperCase()} WINS`, pick(['You tapped out. Live to spar another day.', 'Your pride is the only casualty.', 'Ice it. Ice everything.']), 3200);
      if (long) g.state.addXP(6);
    } else {
      U.big('DRAW', why === 'far' ? 'You wandered off. Spar called.' : 'Time. Everybody\'s too tired to swing.', 2600);
    }
    g.bus.emit('spar:result', { result, opp: s.opp });
  }

  game.bus.on('net:player-left', ({ id } = {}) => {
    if (!S || S.opp !== id) return;
    if (S.phase === 'count' || S.phase === 'fight') finish('won', 'left');
    else { S = null; }
  });
  game.bus.on('net:disconnected', () => { if (S) { const fighting = S.phase === 'fight' || S.phase === 'count'; if (fighting) finish('draw', 'far'); S = null; } });
  game.bus.on('player:died', () => { if (S && (S.phase === 'fight' || S.phase === 'count')) end('quit', 'lost'); });
  game.bus.on('player:arrested', () => { if (S && (S.phase === 'fight' || S.phase === 'count')) end('quit', 'lost'); });

  function update(dt) {
    if (!S) return;
    const t = U.elapsed();
    if (S.phase === 'invite' || S.phase === 'asked' || S.phase === 'wait') {
      if (t - S.t > INVITE_TTL) {
        if (S.phase === 'invite') U.toast(`${oppName()} never answered.`, 'info');
        if (S.phase !== 'asked') U.send(S.opp, { t: 'spar:end', sid: S.sid, why: 'quit' });
        S = null;
      }
      return;
    }
    if (!U.live(S.opp) && !net.remotePlayers.has(S.opp)) { finish('won', 'left'); return; }
    const pl = game.player;
    if (pl.vehicle || game.combat?.isDown) { end('quit', 'lost'); return; }
    if (U.distTo(S.opp) > MAX_RANGE) { end('far', 'draw'); return; }
    if (S.phase === 'count') {
      S.t -= dt;
      const sec = Math.ceil(S.t);
      if (sec !== S.shown) {
        S.shown = sec;
        if (sec > 0) U.big(String(sec), `vs ${U.nameOf(S.opp)}`, 800);
      }
      if (S.t <= 0) { S.phase = 'fight'; S.fightT = t; U.big('FIGHT!', 'Keep it friendly. Ish.', 900); }
      return;
    }
    if (t - S.fightT > MAX_TIME) { end('time', 'draw'); return; }
    for (let i = swings.length - 1; i >= 0; i--) {
      if (swings[i].at <= t) { const sw = swings.splice(i, 1)[0]; try { resolveSwing(sw); } catch (e) { console.error('[coop] spar swing', e); } }
    }
  }

  return {
    invite, inviteMenu, update,
    get active() { return !!S && (S.phase === 'count' || S.phase === 'fight'); },
    get opponent() { return S?.opp || null; },
  };
}
