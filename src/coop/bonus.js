import { fmtMoney } from '../core/util.js';

// Crew bonus: +10% cash and XP from jobs, fights and heists while a friend is within 40 m.
// Implemented by wrapping this game's state.addMoney / addXP instance methods; it only ever adds,
// and only while a live remote player is close, so single-player is untouched.

const RADIUS = 40;
const MULT = 0.1;
// addMoney reasons that count as "work": jobs, gigs, fights, heists
const REASONS = new Set(['job', 'parcel', 'squeegee', 'flyers', 'tutoring', 'pizza', 'delivery', 'smuggle',
  'heist', 'pit', 'street fight', 'bar fight', 'loot', 'brawl']);

export function installBonus(game, U) {
  const net = game.net, st = game.state;
  let near = false, nearT = 0, lastAct = -99, toastT = -99, pendingXp = 0;

  const activeNow = () => {
    const t = U.elapsed();
    if (t - lastAct < 3) return true;
    try { if (game.combat?.inBrawl?.()) return true; } catch { /* ignore */ }
    if (game.heists?.active) return true;
    const cb = game.combat?._ctx?.combat;
    return !!cb && (game.elapsed || 0) - (cb.lastCombatT ?? -99) < 6;
  };
  const mark = () => { lastAct = U.elapsed(); };
  for (const evt of ['job:worked', 'brawl:won', 'heist:completed', 'minigame:result']) game.bus.on(evt, mark);
  game.bus.on('npc:killed', (d) => { if (d?.byPlayer) mark(); });

  const origMoney = st.addMoney;
  st.addMoney = function addMoneyCrew(n, reason = '', ...rest) {
    if (near && n > 0 && REASONS.has(reason)) {
      const b = Math.max(1, Math.round(n * MULT));
      mark();
      const r = origMoney.call(this, n + b, reason, ...rest);
      const t = U.elapsed();
      if (t - toastT > 8) { toastT = t; U.toast(`<span style="opacity:.8">+${fmtMoney(b)} crew bonus</span>`, 'money', 1400); }
      return r;
    }
    return origMoney.call(this, n, reason, ...rest);
  };

  const origXP = st.addXP;
  st.addXP = function addXPCrew(n, ...rest) {
    const r = origXP.call(this, n, ...rest);
    if (near && n > 0) {
      // decide after the current call chain: the job/fight/heist event usually fires right after the XP
      pendingXp += n;
      if (pendingXp === n) {
        queueMicrotask(() => {
          const total = pendingXp; pendingXp = 0;
          if (total > 0 && near && activeNow()) origXP.call(st, Math.max(1, Math.round(total * MULT)));
        });
      }
    }
    return r;
  };

  function update(dt) {
    nearT -= dt;
    if (nearT > 0) return;
    nearT = 0.5;
    let n = false;
    if (net.connected && game.started) {
      const p = U.myPos();
      for (const rp of net.remotePlayers.values()) {
        if (rp._fresh || rp.dead || performance.now() - rp.lastSeen > 3000) continue;
        if (Math.hypot(rp.pos.x - p.x, rp.pos.z - p.z) <= RADIUS) { n = true; break; }
      }
    }
    if (n !== near) {
      near = n;
      try { net.refreshHud?.(); } catch { /* ignore */ }
    }
  }

  return {
    update,
    get near() { return near; },
    hudExtra: () => (near ? ' · <b style="color:#d9b24c" title="Friends within 40 m: +10% cash & XP from jobs, fights and heists">CREW +10%</b>' : ''),
  };
}
