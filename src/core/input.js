// Keyboard + mouse state. Systems read it during update(); endFrame() clears
// the per-frame edges (wasPressed, clicks, mouse deltas).
//
// Virtual devices (touch controls, gamepads — src/touch) feed the SAME state:
//   setVirtualKey(code, on, src)     hold a key (no wasPressed edge unless edge=true)
//   setVirtualButton(b, on, src)     hold a mouse button (adds a click edge on press)
//   keyEvent(code, down) / tapKey(code)  dispatch a real-looking KeyboardEvent so DOM
//                                    key handlers (Tab, Esc, J, I, T...) fire too
//   addLook(dx, dy), addWheel(n)     camera deltas, like mouse movement / wheel
//   pollers.push(fn)                 run at the end of every frame (after edges clear)
//   touchActive                      true while the touch UI is on (no pointer lock)
export class Input {
  constructor(game) {
    this.game = game;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, buttons: new Set(), clicked: new Set(), x: 0, y: 0 };
    this.locked = false;
    this.pointerLockEnabled = true;
    this.touchActive = false;
    this.pollers = [];
    this._kb = new Set();       // keys held on the physical keyboard (or dispatched key events)
    this._vkeys = new Map();    // code -> Set(source) held by virtual devices
    this._vbtns = new Map();    // mouse button -> Set(source)

    const canvas = game.renderer.domElement;
    this.canvas = canvas;

    addEventListener('keydown', (e) => {
      if (this.isTyping()) return;
      if (!e.code) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this._kb.add(e.code);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      this._kb.delete(e.code);
      if (!this._vkeys.get(e.code)?.size) this.down.delete(e.code);
    });
    addEventListener('blur', () => {
      this.down.clear(); this.mouse.buttons.clear(); this._kb.clear();
      this._vkeys.clear(); this._vbtns.clear();
      this._dragButton = null; this.canvas.style.cursor = '';
    });

    canvas.addEventListener('mousedown', (e) => {
      this.mouse.buttons.add(e.button);
      if (e.button === 1) e.preventDefault(); // no browser autoscroll; middle-drag turns the camera
      if (game.controlsLocked) return;
      this.mouse.clicked.add(e.button);
      if (this.touchActive) return; // touch UI: never grab the pointer
      if (!this.locked && this.pointerLockEnabled && e.button === 0) this._lock();
      // Middle/right drag: lock + hide the cursor only while the button is held.
      if (!this.locked && (e.button === 1 || e.button === 2)) {
        this._dragButton = e.button;
        canvas.style.cursor = 'none'; // fallback where pointer lock isn't allowed
        this._lock();
      }
    });
    addEventListener('mouseup', (e) => {
      if (!this._vbtns.get(e.button)?.size) this.mouse.buttons.delete(e.button);
      if (e.button === this._dragButton) {
        this._dragButton = null;
        canvas.style.cursor = '';
        if (document.pointerLockElement === canvas) document.exitPointerLock();
      }
    });
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.locked || this.mouse.buttons.has(2) || this.mouse.buttons.has(1)) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { if (!game.controlsLocked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
  }

  _lock() {
    try { this.canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not allowed in some frames */ }
  }

  isTyping() {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  mouseDown(button = 0) { return this.mouse.buttons.has(button); }
  mouseClicked(button = 0) { return this.mouse.clicked.has(button); }

  // ---------------- virtual devices ----------------
  // Hold / release a key for a virtual source. Safe to call every frame.
  setVirtualKey(code, on, src = 'virtual', edge = false) {
    let s = this._vkeys.get(code);
    if (on) {
      if (!s) this._vkeys.set(code, s = new Set());
      const wasHeld = s.size > 0;
      s.add(src);
      if (!wasHeld && edge && !this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    } else if (s?.delete(src)) {
      if (!s.size && !this._kb.has(code)) this.down.delete(code);
    }
  }

  // Hold / release a mouse button for a virtual source (press = click edge, like a real mousedown).
  setVirtualButton(b, on, src = 'virtual') {
    let s = this._vbtns.get(b);
    if (on) {
      if (!s) this._vbtns.set(b, s = new Set());
      if (s.has(src)) return;
      const wasHeld = s.size > 0;
      s.add(src);
      if (!wasHeld && !this.mouse.buttons.has(b) && !this.game.controlsLocked) this.mouse.clicked.add(b);
      this.mouse.buttons.add(b);
    } else if (s?.delete(src)) {
      if (!s.size) this.mouse.buttons.delete(b);
    }
  }

  // Release everything a source holds (touch UI hidden, gamepad disconnected...).
  releaseVirtual(src) {
    for (const code of [...this._vkeys.keys()]) this.setVirtualKey(code, false, src);
    for (const b of [...this._vbtns.keys()]) this.setVirtualButton(b, false, src);
  }

  // Dispatch a KeyboardEvent on window, so both this class and every DOM key
  // handler in the game (UI Esc/Tab/F1/1-9, quest log J, inventory I, chat T...) react.
  keyEvent(code, down = true) {
    const key = KEY_NAMES[code] ?? (code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code);
    try {
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key, bubbles: true, cancelable: true }));
    } catch (e) { console.error('[input] key event failed', code, e); }
  }

  tapKey(code) { this.keyEvent(code, true); this.keyEvent(code, false); }

  addLook(dx, dy) { this.mouse.dx += dx; this.mouse.dy += dy; }
  addWheel(n) { if (!this.game.controlsLocked) this.mouse.wheel += n; }

  releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.down.clear();
    this._kb.clear();
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.clicked.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    for (const fn of this.pollers) {
      try { fn(); } catch (e) { if (!fn._errLogged) { console.error('[input] poller failed', e); fn._errLogged = true; } }
    }
  }
}

const KEY_NAMES = {
  Space: ' ', Escape: 'Escape', Tab: 'Tab', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Shift',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  Comma: ',', Period: '.', F1: 'F1',
};
