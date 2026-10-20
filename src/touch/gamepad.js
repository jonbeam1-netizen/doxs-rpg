// Gamepad support (Gamepad API, "standard" mapping). Polled at the end of every
// frame (game.input.pollers) and fed into game.input like keyboard + mouse.
//
// On foot:  LS move (push all the way = run, L3 toggles run) · RS camera
//           RT attack (hold = heavy / full-auto) · LT lock-on (aim)
//           A jump · X use (E) · Y enter car (F) · B kick (standing) / roll (moving)
//           LB block · RB switch weapon · R3 reload
//           D-pad: up phone · down inventory · left quest log · right map
//           LB + D-pad: up quick-heal · down skateboard · left perks · right next radio station
//           Start pause · Select character sheet
// Driving:  LS steer (and throttle) · RT gas · LT brake/reverse · A handbrake · X horn · B nitro · Y exit
// Menus:    D-pad / LS move a focus ring between buttons · A press · B back (Esc) · RS scroll

const SRC = 'pad';
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const FOCUSABLE = 'button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), .ui-opt, .ui-btn, .chip, .sw, .bg-card, .tab, .ph-app, .ph-row, .perk, .hud-bubble';

export class GamepadControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.index = null;
    this.prev = [];
    this.heldKeys = new Map();  // button index -> key code currently held via key events
    this.consumed = new Set();  // buttons that must be released before they act again
    this.runToggle = false;
    this.navMode = false;
    this.focusEl = null;
    this.navRepeat = { dir: null, t: 0 };
    this.lockT = 0;
    this.known = new Set();
    this.lastT = performance.now();
    addEventListener('gamepadconnected', (e) => this._connected(e.gamepad));
    addEventListener('gamepaddisconnected', (e) => {
      this.known.delete(e.gamepad?.id + ':' + e.gamepad?.index);
      if (e.gamepad?.index === this.index) this._lost();
    });
    this.input.pollers.push(() => this.poll());
    game.ui.helpKeys.push(
      ['<kbd>Pad</kbd> LS / RS', 'Controller: move / camera · RT attack · LT lock-on · A jump · X use · Y car · B kick (roll while moving) · LB block · RB weapon · R3 reload'],
      ['<kbd>Pad</kbd> D-pad', 'Phone / inventory / quest log / map · hold LB: heal / skateboard / perks / radio · Start pause · Select stats'],
      ['<kbd>Touch</kbd>', 'Left thumb: move (push to the rim to run) · right thumb: look, pinch to zoom · ••• for more actions'],
    );
  }

  _connected(pad) {
    if (!pad) return;
    const key = pad.id + ':' + pad.index;
    if (this.known.has(key)) return;
    this.known.add(key);
    const name = String(pad.id || 'Controller').replace(/\s*\(.*$/, '').slice(0, 40);
    try {
      this.game.ui.toast(`<b>Controller connected</b> — ${name.replace(/[<>&]/g, '')}<br><small>LS move · RS look · RT attack · A jump · X use · Y car · Start pause</small>`, 'good', 4200);
    } catch { /* ui not ready */ }
  }

  _lost() {
    this.index = null;
    this._releaseAll();
    this._clearFocus();
    try { this.game.ui.toast('Controller disconnected.', 'info', 2000); } catch { /* ignore */ }
  }

  _pad() {
    let pads;
    try { pads = navigator.getGamepads?.(); } catch { return null; }
    if (!pads) return null;
    if (this.index != null) {
      const p = pads[this.index];
      if (p && p.connected !== false) return p;
      this._lost();
    }
    for (const p of pads) {
      if (!p || p.connected === false) continue;
      // only adopt a pad once it's actually being used (some OSes list idle virtual pads)
      const active = p.buttons?.some((b) => b?.pressed || b?.value > 0.5) || p.axes?.some((a) => Math.abs(a) > 0.5);
      if (!active && !this.known.has(p.id + ':' + p.index)) continue;
      this.index = p.index;
      this.prev = [];
      this._connected(p);
      return p;
    }
    return null;
  }

  // ---------------- polling ----------------
  poll() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const pad = this._pad();
    if (!pad) return;
    const g = this.game;
    const b = (i) => { const x = pad.buttons[i]; return !!x && (x.pressed || x.value > 0.4); };
    const val = (i) => { const x = pad.buttons[i]; return x ? (typeof x.value === 'number' ? x.value : x.pressed ? 1 : 0) : 0; };
    const cur = [];
    for (let i = 0; i < Math.max(17, pad.buttons.length); i++) cur[i] = b(i);
    const prev = this.prev;
    const pressed = (i) => cur[i] && !prev[i] && !this.consumed.has(i);
    for (const i of [...this.consumed]) if (!cur[i]) this.consumed.delete(i);
    const ax = (i) => { const v = pad.axes[i] || 0; return Math.abs(v) < 0.2 ? 0 : v; };

    const nav = !g.started || g.ui.isBlocking();
    if (nav !== this.navMode) {
      this.navMode = nav;
      this._releaseAll();
      // a button still held across the switch shouldn't also act in the new mode
      cur.forEach((on, i) => { if (on) this.consumed.add(i); });
      if (!nav) this._clearFocus();
      this.navRepeat.dir = null;
    }

    if (nav) this._navPoll(pad, cur, pressed, ax, dt);
    else if (!this.input.isTyping()) this._playPoll(pad, cur, pressed, ax, val, dt);
    this.prev = cur;
  }

  _hold(i, code, on) {
    const h = this.heldKeys.get(i);
    if (on && !this.consumed.has(i)) {
      if (h === code) return;
      if (h) this.input.keyEvent(h, false);
      this.input.keyEvent(code, true);
      this.heldKeys.set(i, code);
    } else if (h) {
      this.input.keyEvent(h, false);
      this.heldKeys.delete(i);
    }
  }

  _releaseAll() {
    for (const [, code] of this.heldKeys) this.input.keyEvent(code, false);
    this.heldKeys.clear();
    this.input.releaseVirtual(SRC);
    this._stickKeys = new Set();
  }

  _playPoll(pad, cur, pressed, ax, val, dt) {
    const g = this.game, inp = this.input;
    const inCar = !!g.player?.vehicle;
    const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);

    // ---- movement (left stick -> WASD) ----
    const want = new Set();
    const m = Math.hypot(lx, ly);
    if (m > 0.25) {
      const ux = lx / m, uy = ly / m;
      if (uy < -0.38) want.add('KeyW');
      if (uy > 0.38) want.add('KeyS');
      if (ux < -0.38) want.add('KeyA');
      if (ux > 0.38) want.add('KeyD');
    } else this.runToggle = false;
    if (pressed(BTN.L3)) this.runToggle = !this.runToggle;
    if (inCar) {
      if (val(BTN.RT) > 0.3) want.add('KeyW');
      if (val(BTN.LT) > 0.3) want.add('KeyS');
    } else if (m > 0.25 && (m > 0.92 || this.runToggle)) want.add('ShiftRight');
    for (const k of this._stickKeys || []) if (!want.has(k)) inp.setVirtualKey(k, false, SRC);
    for (const k of want) inp.setVirtualKey(k, true, SRC);
    this._stickKeys = want;

    // ---- camera (right stick -> mouse look) ----
    if (rx || ry) {
      const curve = (v) => Math.sign(v) * v * v;
      inp.addLook(curve(rx) * 950 * dt, curve(ry) * 600 * dt);
    }

    const lb = cur[BTN.LB];
    if (this.lockT > 0 && --this.lockT === 0) inp.setVirtualButton(1, false, SRC);
    if (inCar) {
      inp.setVirtualButton(0, false, SRC);
      this._hold(BTN.A, 'Space', cur[BTN.A]);
      this._hold(BTN.X, 'KeyH', cur[BTN.X]);
      this._hold(BTN.B, 'KeyN', cur[BTN.B]);
      this._hold(BTN.Y, 'KeyF', cur[BTN.Y]);
      this._hold(BTN.LB, 'KeyC', false);
    } else {
      // attack (RT) and lock-on (LT, a quick middle-click)
      inp.setVirtualButton(0, val(BTN.RT) > 0.35 && !this.consumed.has(BTN.RT), SRC);
      if (pressed(BTN.LT)) { inp.setVirtualButton(1, true, SRC); this.lockT = 2; }
      this._hold(BTN.A, 'Space', cur[BTN.A]);
      this._hold(BTN.X, 'KeyE', cur[BTN.X]);
      this._hold(BTN.Y, 'KeyF', cur[BTN.Y]);
      this._hold(BTN.LB, 'KeyC', lb);
      if (pressed(BTN.B)) inp.tapKey(m > 0.25 ? 'KeyZ' : 'KeyB');
      if (pressed(BTN.RB)) inp.tapKey('KeyQ');
      if (pressed(BTN.R3)) inp.tapKey('KeyR');
    }
    // d-pad (LB = second layer)
    const dpad = [[BTN.UP, 'KeyO', 'KeyY'], [BTN.DOWN, 'KeyI', 'KeyG'], [BTN.LEFT, 'KeyJ', 'KeyP'], [BTN.RIGHT, 'KeyM', 'Period']];
    for (const [i, k1, k2] of dpad) if (pressed(i)) inp.tapKey(lb ? k2 : k1);
    if (pressed(BTN.START)) inp.tapKey('Escape');
    if (pressed(BTN.SELECT)) inp.tapKey('Tab');
  }

  // ---------------- menu navigation ----------------
  _root() {
    const g = this.game;
    const top = g.ui.top?.();
    if (top?.el?.isConnected) return top.el;
    const tl = document.getElementById('title-layer');
    if (tl && tl.children.length) {
      const modals = tl.querySelectorAll('.title-modal');
      return modals.length ? modals[modals.length - 1] : tl;
    }
    return null;
  }

  _focusables(root) {
    const out = [];
    for (const el of root.querySelectorAll(FOCUSABLE)) {
      if (el.disabled || el.classList.contains('disabled')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      // skip things nested inside a button (they click through to it anyway)
      const pb = el.parentElement?.closest('button');
      if (pb && root.contains(pb)) continue;
      out.push(el);
    }
    return out;
  }

  _setFocus(el) {
    if (this.focusEl === el) return;
    this.focusEl?.classList.remove('pad-focus');
    this.focusEl = el;
    if (!el) return;
    el.classList.add('pad-focus');
    try { if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') el.focus({ preventScroll: true }); } catch { /* ignore */ }
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* ignore */ }
  }

  _clearFocus() {
    this.focusEl?.classList.remove('pad-focus');
    try { if (this.focusEl && document.activeElement === this.focusEl) this.focusEl.blur(); } catch { /* ignore */ }
    this.focusEl = null;
  }

  _move(dir, root) {
    const els = this._focusables(root);
    if (!els.length) return;
    const cur = this.focusEl && els.includes(this.focusEl) ? this.focusEl : null;
    if (!cur) { this._setFocus(this._preferred(els)); return; }
    // number / range inputs and selects take left/right as value changes
    if ((dir === 'left' || dir === 'right') && this._adjust(cur, dir === 'right' ? 1 : -1)) return;
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bestS = Infinity;
    for (const el of els) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect();
      const ex = q.left + q.width / 2, ey = q.top + q.height / 2;
      let primary, ortho;
      if (dir === 'down') { primary = q.top - r.bottom; ortho = Math.max(0, Math.abs(ex - cx) - (q.width + r.width) / 4); }
      else if (dir === 'up') { primary = r.top - q.bottom; ortho = Math.max(0, Math.abs(ex - cx) - (q.width + r.width) / 4); }
      else if (dir === 'right') { primary = q.left - r.right; ortho = Math.max(0, Math.abs(ey - cy) - (q.height + r.height) / 4); }
      else { primary = r.left - q.right; ortho = Math.max(0, Math.abs(ey - cy) - (q.height + r.height) / 4); }
      if (primary < -Math.min(r.height, r.width) * 0.5) continue; // not in that direction
      const s = Math.max(0, primary) + ortho * 3;
      if (s < bestS) { bestS = s; best = el; }
    }
    if (!best && (dir === 'down' || dir === 'up')) best = dir === 'down' ? els[0] : els[els.length - 1]; // wrap
    if (best) this._setFocus(best);
  }

  _preferred(els) {
    return els.find((e) => e.classList.contains('ui-opt') && !e.classList.contains('disabled'))
      || els.find((e) => !e.classList.contains('ui-x')) || els[0];
  }

  _adjust(el, d) {
    if (el.tagName === 'INPUT' && (el.type === 'number' || el.type === 'range')) {
      try { d > 0 ? el.stepUp() : el.stepDown(); } catch { el.value = String((Number(el.value) || 0) + d); }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (el.tagName === 'SELECT') {
      const n = el.options.length;
      if (n) { el.selectedIndex = (el.selectedIndex + d + n) % n; el.dispatchEvent(new Event('change', { bubbles: true })); }
      return true;
    }
    return false;
  }

  _navPoll(pad, cur, pressed, ax, dt) {
    const root = this._root();
    if (!root) { this._clearFocus(); return; }
    if (this.focusEl && (!this.focusEl.isConnected || !root.contains(this.focusEl))) this._clearFocus();

    // direction from d-pad or left stick, with key-repeat
    const lx = ax(0), ly = ax(1);
    let dir = cur[BTN.UP] ? 'up' : cur[BTN.DOWN] ? 'down' : cur[BTN.LEFT] ? 'left' : cur[BTN.RIGHT] ? 'right' : null;
    if (!dir && Math.hypot(lx, ly) > 0.6) dir = Math.abs(ly) > Math.abs(lx) ? (ly < 0 ? 'up' : 'down') : (lx < 0 ? 'left' : 'right');
    const rep = this.navRepeat;
    if (dir) {
      if (rep.dir !== dir) { rep.dir = dir; rep.t = 0.38; this._move(dir, root); }
      else if ((rep.t -= dt) <= 0) { rep.t = 0.11; this._move(dir, root); }
    } else rep.dir = null;

    if (pressed(BTN.A)) {
      const el = this.focusEl;
      if (!el) this._move('down', root);
      else if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) { try { el.focus(); el.select?.(); } catch { /* ignore */ } }
      else { try { el.click(); } catch (e) { console.error('[pad] click failed', e); } }
    }
    if (pressed(BTN.B) || pressed(BTN.START)) {
      if (document.activeElement?.tagName === 'INPUT') document.activeElement.blur();
      else this.input.tapKey('Escape');
    }
    if (pressed(BTN.SELECT)) this.input.tapKey('Tab');

    // right stick scrolls the panel
    const ry = ax(3);
    if (ry) {
      const sc = this._scroller(this.focusEl || root, root);
      if (sc) sc.scrollTop += ry * 900 * dt;
    }
  }

  _scroller(el, root) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 4) {
        const oy = getComputedStyle(n).overflowY;
        if (oy === 'auto' || oy === 'scroll') return n;
      }
      if (n === root) break;
    }
    return root.querySelector('.ui-panel');
  }
}
