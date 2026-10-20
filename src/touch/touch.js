// On-screen touch controls (phones / tablets). Everything is fed into
// game.input exactly like keyboard + mouse would, so no module needs to know
// a touch screen exists:
//   left half   floating joystick -> W/A/S/D (push to the rim = Shift run)
//   right half  drag = mouse look, pinch = wheel zoom
//   buttons     Attack = LMB (tap combo / hold heavy), Jump = Space, Use = E, Car = F
//               in a vehicle: Handbrake = Space, Horn = H, Nitro = N, Exit = F
//   tray (...)  Kick B, Block C, Roll Z, Weapon Q, Reload R, Heal Y, Lock-on MMB, Skate G,
//               Phone O, Map M, Quests J, Bag I, Stats Tab, Perks P, Chat T, Mask V, Drop X, Radio .
// Hidden while dialogs / panels / the title screen are up (those are DOM buttons).

const SRC = 'touch';
const STORE = 'doxsrpg_touch'; // 'on' | 'off' | missing = auto

// kind: 'key' (held KeyboardEvent), 'btn' (held mouse button), 'pause'
// ui: fire on release (needs a user-activation gesture: focusing chat, opening panels)
const TRAY = [
  { id: 'kick', label: 'Kick', key: 'KeyB' },
  { id: 'block', label: 'Block', key: 'KeyC' },
  { id: 'roll', label: 'Roll', key: 'KeyZ' },
  { id: 'weapon', label: 'Weapon', key: 'KeyQ' },
  { id: 'reload', label: 'Reload', key: 'KeyR' },
  { id: 'heal', label: 'Heal', key: 'KeyY' },
  { id: 'lock', label: 'Lock-on', btn: 1 },
  { id: 'skate', label: 'Skate', key: 'KeyG' },
  { id: 'phone', label: 'Phone', key: 'KeyO', ui: true },
  { id: 'map', label: 'Map', key: 'KeyM', ui: true },
  { id: 'quests', label: 'Quests', key: 'KeyJ', ui: true },
  { id: 'bag', label: 'Bag', key: 'KeyI', ui: true },
  { id: 'stats', label: 'Stats', key: 'Tab', ui: true },
  { id: 'perks', label: 'Perks', key: 'KeyP', ui: true },
  { id: 'chat', label: 'Chat', key: 'KeyT', ui: true },
  { id: 'mask', label: 'Mask', key: 'KeyV' },
  { id: 'drop', label: 'Drop bag', key: 'KeyX' },
  { id: 'radio', label: 'Radio', key: 'Period' },
];
const FOOT = [
  { id: 'attack', label: 'Attack', btn: 0, cls: 'tc-attack' },
  { id: 'jump', label: 'Jump', key: 'Space', cls: 'tc-jump' },
  { id: 'use', label: 'Use', key: 'KeyE', cls: 'tc-use' },
  { id: 'car', label: 'Car', key: 'KeyF', cls: 'tc-car' },
];
const CAR = [
  { id: 'brake', label: 'Brake', key: 'Space', cls: 'tc-attack' },
  { id: 'horn', label: 'Horn', key: 'KeyH', cls: 'tc-jump' },
  { id: 'nitro', label: 'Nitro', key: 'KeyN', cls: 'tc-use' },
  { id: 'exit', label: 'Exit', key: 'KeyF', cls: 'tc-car' },
];

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.enabled = false;
    this.visible = false;
    this.mode = 'foot';
    this.lastTouch = false;
    this.lookSens = 2.4;      // touch px -> mouse px
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, keys: new Set() };
    this.look = new Map();    // pointerId -> {x, y}
    this.pinchD = 0;
    this.held = new Map();    // pointerId -> { def, el }
    try { this.pref = localStorage.getItem(STORE); } catch { this.pref = null; }
    this._build();
    this._bind();

    this.input.pollers.push(() => this.update());
    game.ui.menuButtons.push({
      get label() { return `Touch controls: ${game.touch?.enabled ? 'ON' : 'OFF'}`; },
      hint: 'phone / tablet',
      onClick: () => this.toggle(),
    });
    this._autoCheck();
  }

  get coarse() {
    try { return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches); } catch { return false; }
  }

  _autoCheck() {
    const want = this.pref === 'on' ? true : this.pref === 'off' ? false : (this.coarse || this.lastTouch);
    if (want !== this.enabled) this.setEnabled(want);
  }

  toggle() {
    const on = !this.enabled;
    this.pref = on ? 'on' : 'off';
    try { localStorage.setItem(STORE, this.pref); } catch { /* ignore */ }
    this.setEnabled(on);
    this.game.ui.toast(on ? 'Touch controls on. Left thumb moves, right thumb looks.' : 'Touch controls off.', 'info', 2200);
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.input.touchActive = this.enabled;
    document.body.classList.toggle('touch-ui', this.enabled);
    if (this.enabled && document.pointerLockElement) { try { document.exitPointerLock(); } catch { /* ignore */ } }
    if (!this.enabled) this._releaseAll();
  }

  // ---------------- DOM ----------------
  _build() {
    const root = document.createElement('div');
    root.id = 'touch-ui';
    root.className = 'hidden';
    const btn = (d, extra = '') => `<button class="tc-btn ${d.cls || ''} ${extra}" data-id="${d.id}"><span class="tc-l">${d.label}</span></button>`;
    root.innerHTML = `
      <div class="tc-zone tc-move"></div>
      <div class="tc-zone tc-look"></div>
      <div class="tc-stick idle"><div class="tc-knob"></div></div>
      <div class="tc-cluster tc-foot">${FOOT.map((d) => btn(d)).join('')}<div class="tc-usetag hidden"></div></div>
      <div class="tc-cluster tc-carset hidden">${CAR.map((d) => btn(d)).join('')}</div>
      <div class="tc-sys">
        <button class="tc-btn tc-small" data-id="more" aria-label="More actions"><span class="tc-l">•••</span></button>
        <button class="tc-btn tc-small" data-id="pause" aria-label="Pause"><span class="tc-l">❚❚</span></button>
      </div>
      <div class="tc-tray hidden">${TRAY.map((d) => btn(d, 'tc-tbtn')).join('')}</div>`;
    document.body.appendChild(root);
    this.root = root;
    this.stickEl = root.querySelector('.tc-stick');
    this.knobEl = root.querySelector('.tc-knob');
    this.footEl = root.querySelector('.tc-foot');
    this.carEl = root.querySelector('.tc-carset');
    this.trayEl = root.querySelector('.tc-tray');
    this.useTag = root.querySelector('.tc-usetag');
    this.defs = new Map();
    for (const d of [...FOOT, ...CAR, ...TRAY]) this.defs.set(d.id, d);
    this.defs.set('more', { id: 'more', tray: true, ui: true });
    this.defs.set('pause', { id: 'pause', key: 'Escape', ui: true });
    this.btnEls = new Map();
    for (const el of root.querySelectorAll('.tc-btn')) this.btnEls.set(el.dataset.id, el);
  }

  _bind() {
    const root = this.root;
    // Kill browser gestures (scroll, double-tap zoom, long-press menu, compat mouse events).
    const stop = (e) => { if (e.cancelable) e.preventDefault(); };
    root.addEventListener('touchstart', stop, { passive: false });
    root.addEventListener('touchmove', stop, { passive: false });
    root.addEventListener('contextmenu', stop);

    root.addEventListener('pointerdown', (e) => this._down(e));
    addEventListener('pointermove', (e) => this._move(e), { passive: true });
    addEventListener('pointerup', (e) => this._up(e));
    addEventListener('pointercancel', (e) => this._up(e, true));

    // Last-input-wins for hybrid devices (touch laptop): a real touch turns the
    // touch UI on, a real mouse click turns it back off (auto mode only).
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') { if (!this.lastTouch) { this.lastTouch = true; this._autoCheck(); } } else if (e.pointerType === 'mouse' && e.isTrusted && this.lastTouch && !this.coarse) { this.lastTouch = false; this._autoCheck(); }
      if (e.pointerType !== 'mouse') this._unlockAudio();
    }, true);
    addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') this._unlockAudio(); }, true);
    try { matchMedia('(pointer: coarse)').addEventListener('change', () => this._autoCheck()); } catch { /* ignore */ }
  }

  _unlockAudio() {
    try { const c = this.game.audio?.ctx; if (c && c.state === 'suspended') c.resume?.(); } catch { /* ignore */ }
  }

  _down(e) {
    if (!this.visible) return;
    if (e.cancelable) e.preventDefault();
    const t = e.target;
    const bEl = t.closest?.('.tc-btn');
    if (bEl) {
      const def = this.defs.get(bEl.dataset.id);
      if (!def) return;
      this.held.set(e.pointerId, { def, el: bEl });
      bEl.classList.add('on');
      if (!def.ui) this._press(def, true);
      return;
    }
    if (t.closest?.('.tc-move')) {
      if (this.stick.id != null) return;
      const s = this.stick;
      const r = this.root.getBoundingClientRect();
      const R = this._radius();
      s.id = e.pointerId;
      s.ox = Math.max(R + 8, Math.min(r.width * 0.55 - R, e.clientX));
      s.oy = Math.max(R + 8, Math.min(r.height - R - 8, e.clientY));
      s.x = e.clientX; s.y = e.clientY;
      this.stickEl.classList.remove('idle');
      this.stickEl.style.left = s.ox + 'px';
      this.stickEl.style.top = s.oy + 'px';
      this.stickEl.style.bottom = 'auto';
      this._stickVisual();
      return;
    }
    if (t.closest?.('.tc-look')) {
      this.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.look.size === 2) this.pinchD = this._pinchDist();
    }
  }

  _move(e) {
    if (e.pointerId === this.stick.id) {
      this.stick.x = e.clientX; this.stick.y = e.clientY;
      this._stickVisual();
      return;
    }
    const lp = this.look.get(e.pointerId);
    if (!lp) return;
    const dx = e.clientX - lp.x, dy = e.clientY - lp.y;
    lp.x = e.clientX; lp.y = e.clientY;
    if (this.look.size >= 2) {
      const d = this._pinchDist();
      const diff = d - this.pinchD;
      if (Math.abs(diff) > 28) { this.input.addWheel(diff > 0 ? -1 : 1); this.pinchD = d; }
      return;
    }
    if (this.game.controlsLocked && !this.game.ui.photoMode) return;
    this.input.addLook(dx * this.lookSens, dy * this.lookSens);
  }

  _up(e) {
    if (e.pointerId === this.stick.id) { this._stickRelease(); return; }
    if (this.look.delete(e.pointerId)) { this.pinchD = this.look.size >= 2 ? this._pinchDist() : 0; return; }
    const h = this.held.get(e.pointerId);
    if (!h) return;
    this.held.delete(e.pointerId);
    h.el.classList.remove('on');
    if (h.def.ui) {
      if (h.def.tray) this.setTray(this.trayEl.classList.contains('hidden'));
      else if (h.def.key) this.input.tapKey(h.def.key);
      // menus opened from the tray: fold it away again
      if (h.def.key && h.def.id !== 'pause') this.setTray(false);
    } else this._press(h.def, false);
  }

  _press(def, on) {
    if (def.btn != null) this.input.setVirtualButton(def.btn, on, SRC);
    else if (def.key) this.input.keyEvent(def.key, on);
  }

  setTray(open) {
    this.trayEl.classList.toggle('hidden', !open);
    this.btnEls.get('more')?.classList.toggle('sel', open);
  }

  _pinchDist() {
    const [a, b] = [...this.look.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  _radius() { return Math.max(44, Math.min(64, Math.min(innerWidth, innerHeight) * 0.13)); }

  _stickVisual() {
    const s = this.stick, R = this._radius();
    let dx = s.x - s.ox, dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  _stickRelease() {
    this.stick.id = null;
    this.stickEl.classList.add('idle');
    this.stickEl.style.left = ''; this.stickEl.style.top = ''; this.stickEl.style.bottom = '';
    this.knobEl.style.transform = '';
    this.stickEl.classList.remove('run');
  }

  // Joystick -> digital WASD in 8 sectors (+ run past the rim).
  _stickKeys() {
    const s = this.stick, want = new Set();
    if (s.id != null) {
      const R = this._radius();
      const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
      if (d > R * 0.2) {
        const ux = dx / d, uy = dy / d;
        if (uy < -0.38) want.add('KeyW');
        if (uy > 0.38) want.add('KeyS');
        if (ux < -0.38) want.add('KeyA');
        if (ux > 0.38) want.add('KeyD');
        const run = d > R * 0.92 && !this.game.player?.vehicle;
        if (run) want.add('ShiftRight');
        this.stickEl.classList.toggle('run', run);
      }
    }
    for (const k of s.keys) if (!want.has(k)) this.input.setVirtualKey(k, false, SRC);
    for (const k of want) this.input.setVirtualKey(k, true, SRC); // re-assert (releasePointer clears down)
    s.keys = want;
  }

  _releaseAll() {
    for (const [, h] of this.held) { h.el.classList.remove('on'); if (!h.def.ui) this._press(h.def, false); }
    this.held.clear();
    this.look.clear();
    if (this.stick.id != null) this._stickRelease();
    this._stickKeys();
    this.input.releaseVirtual(SRC);
  }

  // ---------------- per frame ----------------
  update() {
    const g = this.game;
    const typing = this.input.isTyping();
    const show = this.enabled && g.started && !g.ui.isBlocking() && !typing;
    if (show !== this.visible) {
      this.visible = show;
      this.root.classList.toggle('hidden', !show);
      if (!show) { this._releaseAll(); this.setTray(false); this._tag = null; document.body.classList.remove('tc-prompt-tagged'); }
    }
    if (!show) return;
    this.root.classList.toggle('photo', !!g.ui.photoMode);
    this._stickKeys();

    const mode = g.player?.vehicle ? 'car' : 'foot';
    if (mode !== this.mode) {
      this.mode = mode;
      // release buttons of the set being hidden
      for (const [id, h] of [...this.held]) {
        if (h.el.closest('.tc-cluster')) { h.el.classList.remove('on'); if (!h.def.ui) this._press(h.def, false); this.held.delete(id); }
      }
      this.footEl.classList.toggle('hidden', mode !== 'foot');
      this.carEl.classList.toggle('hidden', mode !== 'car');
    }

    // Context labels from the on-screen prompt ("<kbd>E</kbd>Enter shop" / "<kbd>F</kbd>Steal car").
    const pe = g.ui.promptEl;
    let eText = '', fText = '';
    if (pe && !pe.classList.contains('hidden')) {
      const k = pe.querySelector('kbd')?.textContent?.trim();
      const txt = (pe.textContent || '').replace(/^\s*[EF]\s*/, '').trim();
      if (k === 'E') eText = txt; else if (k === 'F') fText = txt;
    }
    // The tag replaces the centred prompt (which would sit under the thumbs).
    const tag = mode === 'foot' ? (eText || fText) : '';
    if (this._tag !== tag) {
      this._tag = tag;
      this.useTag.textContent = tag;
      this.useTag.classList.toggle('hidden', !tag);
      document.body.classList.toggle('tc-prompt-tagged', !!tag);
    }
    if (this._eHot !== !!eText) { this._eHot = !!eText; this.btnEls.get('use')?.classList.toggle('hot', !!eText); }
    const carHot = !!fText;
    if (this._fHot !== carHot) { this._fHot = carHot; this.btnEls.get('car')?.classList.toggle('hot', carHot); this.useTag.classList.toggle('car', carHot && !eText); }
    const gun = !!g.player?.aiming;
    if (this._gun !== gun) { this._gun = gun; const a = this.btnEls.get('attack'); if (a) a.querySelector('.tc-l').textContent = gun ? 'Shoot' : 'Attack'; }
    const skating = !!g.skate?.on;
    if (this._sk !== skating) { this._sk = skating; const j = this.btnEls.get('jump'); if (j) j.querySelector('.tc-l').textContent = skating ? 'Ollie' : 'Jump'; }
  }
}
