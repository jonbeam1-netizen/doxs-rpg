// Shared helpers for the island module.
import { fmtMoney, esc } from '../core/util.js';

// Persistent island state lives under game.state.p.island (plain JSON).
//   tickets, ticketsTotal, prizes{}, caught{fishId:n}, biggest, rustjaw (bool), tollDay, tollFights,
//   keeper{asked[], secret, stash, drinks}, inmates{id:{visits, gifts}}, smuggleDay, bannedDay, fenceSold
export function isle(game) {
  const p = game.state.p;
  const s = (p.island ??= {});
  s.tickets ??= 0; s.ticketsTotal ??= 0; s.prizes ??= {};
  s.caught ??= {}; s.rustjaw ??= false; s.casts ??= 0;
  s.tollDay ??= -1; s.tollFights ??= 0;
  s.keeper ??= { asked: [], secret: false, stash: false, drinks: 0 };
  s.inmates ??= {};
  s.smuggleDay ??= -1; s.bannedDay ??= -1; s.fenceSold ??= 0;
  return s;
}

export const $ = fmtMoney;
export { esc };

export function sfx(game, name) { try { game.sysSfx?.play?.(name); } catch { /* cosmetic */ } }

// Tiny synthesized blips for the arcade (WebAudio, through the shared sfx bus).
export function beep(game, freq = 660, dur = 0.08, type = 'triangle', vol = 0.09) {
  const a = game.audio; const ctx = a?.ctx; if (!ctx || !a.sfx) return;
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(a.sfx); o.start(); o.stop(ctx.currentTime + dur + 0.02);
  } catch { /* ignore */ }
}

// Full-screen fade (ferry rides etc). Returns a promise that resolves at full black.
export function fadeOut(ms = 700, text = '') {
  let el = document.getElementById('isle-fade');
  if (!el) {
    el = document.createElement('div');
    el.id = 'isle-fade';
    el.style.cssText = 'position:fixed;inset:0;background:#050505;opacity:0;pointer-events:none;z-index:60;display:flex;align-items:center;justify-content:center;font-family:"Special Elite",monospace;font-size:30px;color:#c8c0a8;letter-spacing:2px;text-align:center;padding:20px';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.transition = `opacity ${ms}ms`;
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  return new Promise((r) => setTimeout(r, ms + 30));
}
export function fadeIn(ms = 700) {
  const el = document.getElementById('isle-fade');
  if (!el) return Promise.resolve();
  el.style.transition = `opacity ${ms}ms`;
  el.style.opacity = '0';
  return new Promise((r) => setTimeout(r, ms));
}

export function playerPos(game) {
  const pl = game.player; if (!pl) return { x: 0, z: 0 };
  const g = pl.vehicle?.group ?? pl.group;
  return { x: g.position.x, z: g.position.z };
}
