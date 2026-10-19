// Location registry. The world places buildings (see src/data/locations.js)
// and calls add(); gameplay systems register a handler per location `type`.
// Walking up to a door and pressing E calls enter(loc) -> handler(game, loc).
export class Locations {
  constructor(game) {
    this.game = game;
    this.handlers = {};
    this.list = [];
    this.byId = {};
  }

  register(type, handler) {
    if (this.handlers[type]) console.warn(`[locations] handler for "${type}" replaced`);
    this.handlers[type] = handler;
  }

  // loc: { id, type, name, district, x, z, doorX, doorZ, ...extra }
  add(loc) {
    this.list.push(loc);
    this.byId[loc.id] = loc;
    this.game.interact.add({
      id: 'loc:' + loc.id,
      x: loc.doorX ?? loc.x,
      z: loc.doorZ ?? loc.z,
      radius: loc.doorRadius ?? 3,
      prompt: () => `Enter ${loc.name}`,
      onInteract: () => this.enter(loc),
    });
    this.game.bus.emit('location:added', loc);
    return loc;
  }

  get(id) { return this.byId[id]; }
  ofType(type) { return this.list.filter((l) => l.type === type); }

  enter(loc) {
    const g = this.game;
    g.bus.emit('location:enter', loc);
    const h = this.handlers[loc.type];
    if (!h) {
      g.ui.dialog({ title: loc.name, text: 'The door is chained shut. Someone has written "SOON(TM)" on it in what you hope is ketchup.' });
      return;
    }
    try { h(g, loc); } catch (e) {
      console.error('[locations] handler failed', loc.type, e);
      g.ui.toast('Something broke in there. Smells like a bug.', 'bad');
    }
  }
}
