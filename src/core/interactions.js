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

  remove(id) { this.items.delete(id); if (this.current?.id === id) this.refresh(); }

  // Force the "Press E" prompt to re-evaluate (e.g. after a prompt's text changed).
  refresh() { this.current = null; this.game.ui.setPrompt(null); }
  has(id) { return this.items.has(id); }

  update() {
    const g = this.game;
    const p = g.player;
    // p.suppressInteract: a riding mode (e.g. the skateboard) has taken over the E key.
    if (!p || !g.started || g.controlsLocked || p.vehicle || p.dead || p.suppressInteract) { this._show(null); return; }
    const px = p.group.position.x, pz = p.group.position.z;
    const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
    let best = null, bestScore = Infinity;
    for (const it of this.items.values()) {
      const pos = it.getPos ? it.getPos() : it;
      if (!pos) continue;
      const dx = pos.x - px, dz = pos.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > it.radius) continue;
      // Prefer what the player is facing, and people (moving things) over props:
      // a target straight ahead scores like it's ~half as far away.
      const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      let score = d * (1.5 - 0.75 * Math.max(0, dot));
      if (it.getPos) score *= 0.85;
      if (score >= bestScore) continue;
      if (it.enabled && !it.enabled(g)) continue;
      best = it; bestScore = score;
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
