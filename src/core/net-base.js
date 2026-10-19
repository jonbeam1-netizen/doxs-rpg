// Network facade every system can talk to, even in single-player.
// The co-op module (src/net/) MUTATES this object (sets flags, overrides the
// send* methods, calls _dispatch on incoming messages). Never replace it —
// other systems register handlers with on() during their install().
export class NetBase {
  constructor(game) {
    this.game = game;
    this.connected = false;   // in a co-op session at all
    this.isHost = false;
    this.isClient = false;
    this.localId = 'local';   // peer id once connected
    this.localName = 'Dox';
    this.remotePlayers = new Map(); // peerId -> { id, name, group, pos (THREE.Vector3), facing, hp, vehicle, data }
    this._handlers = new Map();
  }

  // True when this machine decides outcomes (single-player, or co-op host).
  get isAuthority() { return !this.connected || this.isHost; }

  // Register a handler for message type `t`. handler(msg, fromPeerId)
  on(t, fn) {
    if (!this._handlers.has(t)) this._handlers.set(t, new Set());
    this._handlers.get(t).add(fn);
    return () => this._handlers.get(t)?.delete(fn);
  }

  _dispatch(msg, from) {
    const set = this._handlers.get(msg?.t);
    if (!set) return;
    for (const fn of set) {
      try { fn(msg, from); } catch (e) { console.error(`[net] handler "${msg.t}" failed`, e); }
    }
  }

  // Transport (no-ops until the co-op module overrides them).
  broadcast(msg) {}          // host -> all clients, or client -> host (which relays)
  sendToHost(msg) {}         // client -> host
  sendTo(peerId, msg) {}     // host -> one client
  requestTimeAdvance(minutes) {} // client asks host to skip time
}
