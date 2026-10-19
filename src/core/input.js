// Keyboard + mouse state. Systems read it during update(); endFrame() clears
// the per-frame edges (wasPressed, clicks, mouse deltas).
export class Input {
  constructor(game) {
    this.game = game;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, buttons: new Set(), clicked: new Set(), x: 0, y: 0 };
    this.locked = false;
    this.pointerLockEnabled = true;

    const canvas = game.renderer.domElement;
    this.canvas = canvas;

    addEventListener('keydown', (e) => {
      if (this.isTyping()) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.mouse.buttons.clear(); });

    canvas.addEventListener('mousedown', (e) => {
      this.mouse.buttons.add(e.button);
      if (e.button === 1) e.preventDefault(); // no browser autoscroll; middle-drag turns the camera
      if (game.controlsLocked) return;
      this.mouse.clicked.add(e.button);
      if (!this.locked && this.pointerLockEnabled && e.button === 0) {
        try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not allowed in some frames */ }
      }
    });
    addEventListener('mouseup', (e) => this.mouse.buttons.delete(e.button));
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.locked || this.mouse.buttons.has(2) || this.mouse.buttons.has(1)) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { if (!game.controlsLocked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
  }

  isTyping() {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  mouseDown(button = 0) { return this.mouse.buttons.has(button); }
  mouseClicked(button = 0) { return this.mouse.clicked.has(button); }

  releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.down.clear();
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.clicked.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
  }
}
