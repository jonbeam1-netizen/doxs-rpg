// Story moments: letterbox bars, a short framed camera shot, an optional caption and chapter card,
// then control eases back. Never locks the player: moving, Space, Enter, Esc or a click skips.
//
//   cinema.moment({ focus, text, speaker, duration, card, shot }) -> Promise<void>
//     focus: { x, z } | npc object | npc id | location id | 'player'
//     shot:  'auto' | 'face' (in front of an NPC) | 'hero' (low, in front of the player) | 'wide' | 'aerial'
//     card:  { kicker, title, sub }  a chapter title card shown during the moment
//     cine:  false -> only the card (no bars / camera)
//   cinema.card({ kicker, title, sub }, ms)  standalone chapter card
import { esc } from '../core/util.js';

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const IN = 0.9, OUT = 0.85;

export class Cinema {
  constructor(game) {
    this.game = game;
    this.queue = [];
    this.cur = null;
    this.freeT = 0;
    this._build();
    addEventListener('keydown', (e) => this._onKey(e), true);
    addEventListener('mousedown', () => { if (this.cur?.cam && !this.game.ui.isBlocking()) this.skip(); }, true);
    addEventListener('touchstart', () => { if (this.cur?.cam && !this.game.ui.isBlocking()) this.skip(); }, { capture: true, passive: true });
    game.ui.escHandlers.unshift(() => { if (this.cur?.cam && this.cur.phase !== 'out') { this.skip(); return true; } return false; });
    // a dialog / menu opening mid-moment ends it quickly so nothing hides behind the bars
    game.bus.on('ui:open', () => { if (this.cur) this.skip(true); });
  }

  _build() {
    const root = document.getElementById('ui-root') || document.body;
    const before = document.getElementById('dialog-layer');
    const el = document.createElement('div');
    el.id = 'pr-cine';
    el.innerHTML = `<div class="pr-bar top"></div><div class="pr-bar bot"><div class="pr-cap"><div class="pr-cap-who"></div><div class="pr-cap-line"></div></div><div class="pr-skip"><kbd>Space</kbd>skip</div></div>`;
    const card = document.createElement('div');
    card.id = 'pr-card';
    card.className = 'hidden';
    root.insertBefore(el, before);
    root.insertBefore(card, before);
    this.el = el; this.cardEl = card;
    this.capWho = el.querySelector('.pr-cap-who');
    this.capLine = el.querySelector('.pr-cap-line');
  }

  // ------------------------------------------------------------------ public
  // Queued until no menu/dialog has been open for a moment. ttl: drop it if it can't start in time.
  // spec.guard() -> false at start time: show only the card (if any), skip the camera.
  moment(spec = {}, ttl = 25000) {
    return new Promise((resolve) => {
      if (this.queue.length >= 3) this.queue.shift()?.resolve?.();
      this.queue.push({ spec, resolve, at: performance.now(), ttl });
    });
  }

  card(c, ms = 3600) {
    if (!c) return;
    clearTimeout(this._cardT); clearTimeout(this._cardT2);
    const el = this.cardEl;
    el.innerHTML = `${c.kicker ? `<div class="pr-card-k">${esc(c.kicker)}</div>` : ''}
      <div class="pr-card-t">${esc(c.title || '')}</div>
      <svg class="pr-card-u" viewBox="0 0 400 18" preserveAspectRatio="none" aria-hidden="true">
        <defs><filter id="pr-rough" x="-5%" y="-60%" width="110%" height="220%"><feTurbulence type="fractalNoise" baseFrequency="0.035 0.6" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="7"/></filter></defs>
        <path d="M6 10 C 90 5, 200 13, 300 8 S 380 9, 394 7" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" filter="url(#pr-rough)"/>
        <path d="M40 13 C 120 11, 220 15, 350 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55" filter="url(#pr-rough)"/>
      </svg>
      ${c.sub ? `<div class="pr-card-s">${esc(c.sub)}</div>` : ''}`;
    el.classList.remove('hidden', 'out', 'in');
    void el.offsetWidth;
    el.classList.add('in'); document.body.classList.add('pr-card-on');
    try { this.game.audio?.ui?.('open'); } catch { /* cosmetic */ }
    this._cardT = setTimeout(() => { el.classList.add('out'); this._cardT2 = setTimeout(() => { el.classList.add('hidden'); document.body.classList.remove('pr-card-on'); }, 700); }, ms);
  }

  get active() { return !!this.cur; }

  skip(fast = false) {
    const c = this.cur;
    if (!c) return;
    if (c.phase !== 'out') { c.phase = 'out'; c.outT = 0; c.outFrom = c.w; }
    if (fast) c.fast = true;
    if (this.cardEl && !this.cardEl.classList.contains('hidden')) {
      clearTimeout(this._cardT); clearTimeout(this._cardT2);
      this.cardEl.classList.add('out');
      this._cardT2 = setTimeout(() => { this.cardEl.classList.add('hidden'); document.body.classList.remove('pr-card-on'); }, 500);
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const g = this.game;
    const blocked = g.ui.isBlocking();
    this.freeT = blocked ? 0 : this.freeT + dt;
    if (!this.cur && this.queue.length) {
      const now = performance.now();
      while (this.queue.length && now - this.queue[0].at > this.queue[0].ttl) this.queue.shift().resolve();
      if (this.queue.length && this.freeT > 0.35 && g.started) this._begin(this.queue.shift());
    }
    const c = this.cur;
    if (!c) return;
    c.t += dt;
    if (c.phase === 'in') {
      c.w = smooth(c.t / IN);
      if (c.t >= IN) c.phase = 'hold';
    } else if (c.phase === 'hold') {
      c.w = 1;
      if (c.t >= c.duration - OUT) { c.phase = 'out'; c.outT = 0; c.outFrom = 1; }
    }
    if (c.phase === 'out') {
      c.outT += dt * (c.fast ? 3 : 1);
      c.w = c.outFrom * (1 - smooth(c.outT / OUT));
      if (c.outT >= OUT) { this._end(); return; }
      if (c.outT > 0.05) this.el.classList.remove('on');
    }
    if (c.drift && c.cam) {
      const k = Math.min(1, c.t / c.duration);
      c.cam.pos.x = c.base.x + c.drift.x * k; c.cam.pos.y = c.base.y + c.drift.y * k; c.cam.pos.z = c.base.z + c.drift.z * k;
    }
    const rig = g.cameraRig;
    if (rig && c.cam) { rig.cine = c.cam; c.cam.w = c.w; }
    // walking away is a skip
    if (c.cam && c.phase !== 'out' && c.t > 0.3) {
      const i = g.input;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown'].some((k) => i?.isDown?.(k))) this.skip();
    }
  }

  _begin(item) {
    const g = this.game;
    const s = item.spec;
    let ok = true;
    try { ok = s.guard ? s.guard() !== false : true; } catch { ok = true; }
    if (!ok && !s.card) { item.resolve(); return; }
    const cine = s.cine !== false && ok;
    let cam = null;
    if (cine) {
      try { cam = this._shot(s); } catch (e) { console.warn('[present] shot failed', e); }
    }
    this.cur = {
      item, t: 0, w: 0, phase: 'in', duration: Math.max(2, Math.min(8, s.duration ?? 3.6)),
      cam, base: cam ? { ...cam.pos } : null, drift: cam?.drift || null,
    };
    if (cine) {
      this.capWho.textContent = s.speaker || '';
      this.capLine.textContent = s.text || '';
      this.el.classList.toggle('has-cap', !!(s.speaker || s.text));
      this.el.classList.add('on');
      document.body.classList.add('pr-cine-on');
    }
    if (!cine) { this.cur.duration = 3.4; this.cur.cam = null; }
    const cardMs = cine ? Math.max(2200, (this.cur.duration - 1.3) * 1000) : 3400;
    if (s.card) setTimeout(() => { if (this.cur?.item === item) this.card(s.card, cardMs); }, cine ? 450 : 0);
    try { g.audio?.duck?.(0.55, this.cur.duration); } catch { /* cosmetic */ }
  }

  _end() {
    const c = this.cur;
    this.cur = null;
    const rig = this.game.cameraRig;
    if (rig && rig.cine === c?.cam) rig.cine = null;
    this.el.classList.remove('on');
    document.body.classList.remove('pr-cine-on');
    try { c?.item?.resolve?.(); } catch { /* ignore */ }
  }

  _onKey(e) {
    if (!this.cur?.cam || this.cur.phase === 'out') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (this.game.ui.isBlocking()) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); this.skip(); }
  }

  // ------------------------------------------------------------------ framing
  _resolve(focus) {
    const g = this.game;
    if (!focus || focus === 'player') return { kind: 'player', pos: g.player.pos, facing: g.player.facing };
    if (typeof focus === 'string') {
      const npc = g.npcs?.get?.(focus);
      if (npc && !npc.dead) return { kind: 'npc', npc, pos: npc.pos, facing: npc.group?.rotation?.y ?? npc.facing ?? 0 };
      const loc = g.locations?.get?.(focus);
      if (loc) return { kind: 'place', pos: { x: loc.doorX ?? loc.x, y: 0, z: loc.doorZ ?? loc.z }, bx: loc.x, bz: loc.z };
      return null;
    }
    if (focus.pos && focus.group) return { kind: 'npc', npc: focus, pos: focus.pos, facing: focus.group.rotation?.y ?? focus.facing ?? 0 };
    if (Number.isFinite(focus.x) && Number.isFinite(focus.z)) return { kind: 'place', pos: { x: focus.x, y: 0, z: focus.z } };
    return null;
  }

  // Free distance along a direction from a look point (camera collision), via the rig's probe.
  _free(look, dx, dy, dz, want) {
    const rig = this.game.cameraRig;
    try { return rig?._probe ? rig._probe(look, dx, dy, dz, want) : want; } catch { return want; }
  }

  _shot(s) {
    const g = this.game;
    const f = this._resolve(s.focus) || this._resolve('player');
    const pp = g.player.vehicle ? g.player.vehicle.group.position : g.player.pos;
    const shot = s.shot && s.shot !== 'auto' ? s.shot : f.kind === 'npc' ? 'face' : f.kind === 'player' ? 'hero' : 'wide';
    const P = f.pos;
    let look, yaw, dist, pitch;
    if (shot === 'face') {
      // 3/4 two-shot in front of the speaker, from whichever side is clear
      look = { x: P.x, y: (P.y || 0) + 1.55, z: P.z };
      dist = 3.7; pitch = 0.1;
      const a = f.facing;
      const pa = Math.atan2(pp.x - P.x, pp.z - P.z);           // where the player stands
      const sep = (ya) => Math.abs(Math.atan2(Math.sin(ya - pa), Math.cos(ya - pa)));
      let best = null;
      for (const ya of [a + 0.8, a - 0.8]) {
        const dx = Math.sin(ya) * Math.cos(pitch), dz = Math.cos(ya) * Math.cos(pitch), dy = Math.sin(pitch);
        const d = this._free(look, dx, dy, dz, dist);
        const score = (d >= 2.2 ? 10 : d) + sep(ya);       // clear view first, then away from the player
        if (!best || score > best.score) best = { ya, d, score };
      }
      yaw = best.ya; dist = Math.max(1.6, Math.min(dist, best.d));
    } else if (shot === 'hero') {
      look = { x: P.x, y: (P.y || 0) + 1.35, z: P.z };
      yaw = (f.facing ?? 0) + 0.55; dist = 3.6; pitch = -0.05;
      const d = this._free(look, Math.sin(yaw), Math.sin(pitch), Math.cos(yaw), dist);
      if (d < 2) { yaw = (f.facing ?? 0) - 0.55; }
      dist = Math.max(1.8, Math.min(dist, this._free(look, Math.sin(yaw), Math.sin(pitch), Math.cos(yaw), dist)));
    } else if (shot === 'aerial') {
      // slow pull-back and rise over the street (drift below)
      look = { x: P.x, y: 2.2, z: P.z };
      yaw = g.cameraRig?.yaw ?? 0; dist = 9; pitch = 0.38;
    } else {
      // wide establishing shot of a place, from the player's side of it
      look = { x: P.x, y: 2.4, z: P.z };
      let dx = pp.x - P.x, dz = pp.z - P.z;
      const L = Math.hypot(dx, dz);
      if (L < 0.5 && f.bx != null) { dx = P.x - f.bx; dz = P.z - f.bz; }
      yaw = Math.atan2(dx, dz) + 0.3; dist = 12; pitch = 0.32;
      dist = Math.max(4, Math.min(dist, this._free(look, Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch), dist)));
    }
    const cp = Math.cos(pitch);
    const pos = { x: look.x + Math.sin(yaw) * cp * dist, y: Math.max(0.6, look.y + Math.sin(pitch) * dist), z: look.z + Math.cos(yaw) * cp * dist };
    const cam = { pos, look, w: 0 };
    if (shot === 'aerial') cam.drift = { x: Math.sin(yaw) * 9, y: 10, z: Math.cos(yaw) * 9 };
    else if (shot === 'wide') cam.drift = { x: -Math.cos(yaw) * 1.2, y: 0.4, z: Math.sin(yaw) * 1.2 };
    else cam.drift = { x: -Math.cos(yaw) * 0.35, y: 0.05, z: Math.sin(yaw) * 0.35 };
    return cam;
  }
}
