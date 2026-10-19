// "Press E to ..." registry. Anything the player can walk up to and use:
// building doors, NPCs you can talk to, ATMs, parked cars, quest props.
//
// add({ id, x, z, radius?, prompt, onInteract(game), enabled?(game), getPos?() })
//   - getPos() lets moving things (NPCs) report a live { x, z }.
//   - enabled(game) can hide the prompt (e.g. shop closed, quest not active).
export class Interactions {
  constructor(game) {
    this.game = game;
    this.items = new Map();
    this.current = null;
  }

  add(item) {
    const it = { radius: 2.5, ...item };
    this.items.set(it.id, it);
    return it.id;
  }

  remove(id) { this.items.delete(id); }
  has(id) { return this.items.has(id); }

  update() {
    const g = this.game;
    const p = g.player;
    if (!p || !g.started || g.controlsLocked || p.vehicle || p.dead) { this._show(null); return; }
    const px = p.group.position.x, pz = p.group.position.z;
    let best = null, bestD = Infinity;
    for (const it of this.items.values()) {
      const pos = it.getPos ? it.getPos() : it;
      if (!pos) continue;
      const d = Math.hypot(pos.x - px, pos.z - pz);
      if (d > it.radius || d >= bestD) continue;
      if (it.enabled && !it.enabled(g)) continue;
      best = it; bestD = d;
    }
    this._show(best);
    if (best && g.input.wasPressed('KeyE')) {
      try { best.onInteract(g); } catch (e) { console.error('[interact] failed', best.id, e); }
    }
  }

  _show(it) {
    if (it === this.current) return;
    this.current = it;
    const text = it ? (typeof it.prompt === 'function' ? it.prompt(this.game) : it.prompt) : null;
    this.game.ui.setPrompt(text ? `<kbd>E</kbd>${text}` : null);
  }
}
