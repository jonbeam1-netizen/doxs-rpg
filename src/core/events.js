// Tiny pub/sub bus. Handlers that throw are logged and skipped so one broken
// system can't take the whole frame down.
export class EventBus {
  constructor() {
    this.map = new Map();
  }

  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }

  once(evt, fn) {
    const off = this.on(evt, (...args) => { off(); fn(...args); });
    return off;
  }

  off(evt, fn) {
    this.map.get(evt)?.delete(fn);
  }

  emit(evt, ...args) {
    const set = this.map.get(evt);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(...args); } catch (e) { console.error(`[bus] "${evt}" handler failed`, e); }
    }
  }
}
