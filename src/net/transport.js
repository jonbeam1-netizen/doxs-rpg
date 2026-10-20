// Co-op transport: PeerJS (WebRTC data channels) in a star topology.
//
//   host  <-->  client A
//         <-->  client B          (max MAX_CLIENTS clients)
//
// Wire format: the plain message object plus envelope fields
//   _f  original sender peer id (host overwrites it for anything a client sends, so it can't be spoofed)
//   _b  1 = broadcast (host relays a client's broadcast to the other clients)
//   _to target peer id (client -> host -> that client)
// Internal message types start with "_" (_hello, _welcome, _join, _leave, _bye, _full, _ping, _pong, _roster).
// Every incoming message (internal ones too) is passed to game.net._dispatch(msg, fromId).

export const NET_VERSION = 1;
export const MAX_CLIENTS = 3;
export const ID_PREFIX = 'doxsrpg-';
const JOIN_TIMEOUT = 15000;
const SILENCE_TIMEOUT = 30000;
const HEARTBEAT_MS = 2000;
// Only the host may originate these (a client sending one is dropped, never relayed).
const HOST_ONLY = new Set(['time', 'timeskip', 'npc:snap', 'police:snap', 'npc:kill', 'combat:hitPlayer',
  'combat:brawlResult', 'police:tire', 'heist:payout', 'crew:pot', 'crew:grant', 'crew:deny']);
// A client sending more than this many messages per second gets the excess dropped (normal play is ~20-40/s).
const CLIENT_MSG_CAP = 120;

function randId(n = 6) {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
export const makePeerId = () => ID_PREFIX + randId();

export function cleanName(s) {
  // eslint-disable-next-line no-control-regex
  return (typeof s === 'string' ? s : '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16) || 'Stranger';
}

// PeerJS error -> something a human can read.
export function friendlyError(err) {
  if (!err) return 'Something went sideways with the connection.';
  if (typeof err === 'string') return err;
  if (err.friendly) return err.friendly;
  switch (err.type) {
    case 'peer-unavailable': return "Couldn't find that game. The host may have closed it, or the invite link is stale.";
    case 'unavailable-id': return 'That game ID is already taken. Try again.';
    case 'invalid-id': return 'That invite link looks mangled (bad game ID).';
    case 'browser-incompatible': return "Your browser can't do WebRTC. Try a recent Chrome, Firefox or Edge.";
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return "Can't reach the matchmaking server (PeerJS broker). Check your internet, or the free broker is napping — try again in a minute.";
    case 'disconnected': return 'Lost contact with the matchmaking server.';
    case 'webrtc': return "Couldn't open a direct connection (strict NAT / firewall / VPN?).";
    case 'ssl-unavailable': return 'The matchmaking server needs HTTPS.';
    default: return err.message || String(err);
  }
}

function mkErr(friendly, type = 'custom') { const e = new Error(friendly); e.friendly = friendly; e.type = type; return e; }

export class NetSession {
  // hooks: onStatus(status), onConnected({isHost}), onDisconnected({reason, message}),
  //        onPeerJoin(id, name), onPeerLeave(id, name), onError(message), onReconnected()
  constructor(game, hooks = {}) {
    this.game = game;
    this.net = game.net;
    this.hooks = hooks;
    this.status = 'offline';    // offline | connecting | hosting | client | reconnecting
    this.peer = null;
    this.hostId = null;
    this.hostConn = null;
    this.hostLastSeen = 0;
    this.conns = new Map();     // host only: peerId -> { conn, id, name, welcomed, lastSeen }
    this.names = new Map();     // everyone in the session except me: peerId -> name
    this.ping = new Map();      // peerId -> ms (host: per client; client: host + others' ping to host)
    this.lastError = null;
    this._pending = null;
    this._reconnecting = false;
    this._hb = setInterval(() => this._heartbeat(), HEARTBEAT_MS);
  }

  get localName() { return cleanName(this.game.state?.p?.name || this.net.localName); }
  get isHost() { return this.status === 'hosting'; }
  get isClient() { return this.status === 'client'; }

  _setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    try { this.hooks.onStatus?.(s); } catch (e) { console.error('[net] onStatus', e); }
    this.game.bus.emit('net:status', { status: s });
  }

  _setFlags({ connected, isHost, isClient, localId }) {
    const n = this.net;
    n.connected = connected; n.isHost = isHost; n.isClient = isClient;
    n.localId = localId; n.hostId = this.hostId;
    n.localName = this.localName;
  }

  // ---------------------------------------------------------------- peer
  _openPeer(id) {
    return new Promise((resolve, reject) => {
      if (typeof window.Peer !== 'function') {
        reject(mkErr("The networking library (PeerJS) didn't load. Ad-blocker or offline?", 'no-peerjs'));
        return;
      }
      let opened = false;
      let peer;
      try { peer = new window.Peer(id, { debug: 1 }); } catch (e) { reject(e); return; }
      const t = setTimeout(() => {
        if (opened) return;
        try { peer.destroy(); } catch { /* ignore */ }
        reject(mkErr("The matchmaking server (PeerJS broker) isn't answering. Check your internet and try again.", 'broker-timeout'));
      }, JOIN_TIMEOUT);
      peer.on('open', () => {
        opened = true; clearTimeout(t);
        resolve(peer);
      });
      peer.on('error', (err) => {
        if (!opened) { clearTimeout(t); try { peer.destroy(); } catch { /* ignore */ } reject(err); return; }
        this._onPeerError(peer, err);
      });
      peer.on('disconnected', () => {
        // Lost the broker. Existing data connections keep working; reconnect so new friends can join.
        if (peer !== this.peer || peer.destroyed) return;
        setTimeout(() => { if (peer === this.peer && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch { /* ignore */ } } }, 2000);
      });
      peer.on('connection', (conn) => {
        if (peer !== this.peer) { try { conn.close(); } catch { /* ignore */ } return; }
        if (this.isHost) this._onIncoming(conn);
        else { try { conn.close(); } catch { /* ignore */ } }
      });
    });
  }

  _onPeerError(peer, err) {
    if (peer !== this.peer) return;
    console.warn('[net] peer error', err?.type, err);
    if (this._pending) { this._failPending(err); return; }
    if (err?.type === 'peer-unavailable' || err?.type === 'webrtc') return; // handled by join/reconnect logic
    if (err?.type === 'network' || err?.type === 'disconnected') return;   // broker hiccup; reconnect timer handles it
    this.lastError = friendlyError(err);
    this.hooks.onError?.(this.lastError);
  }

  async _ensurePeer() {
    if (this.peer && !this.peer.destroyed && this.peer.open) return this.peer;
    this._destroyPeer();
    for (let i = 0; i < 3; i++) {
      try { this.peer = await this._openPeer(makePeerId()); return this.peer; } catch (e) {
        if (e?.type === 'unavailable-id') continue;
        throw e;
      }
    }
    throw mkErr('Could not grab a free game ID after 3 tries. Weird. Try again.');
  }

  _destroyPeer() {
    const p = this.peer;
    this.peer = null;
    if (p && !p.destroyed) { try { p.destroy(); } catch { /* ignore */ } }
  }

  // ---------------------------------------------------------------- host
  host() {
    if (this.isHost) return Promise.resolve(this.peer.id);
    if (this._hostPromise) return this._hostPromise;
    this._hostPromise = this._host().finally(() => { this._hostPromise = null; });
    return this._hostPromise;
  }

  async _host() {
    if (this.status !== 'offline') this.leave(true);
    this._setStatus('connecting');
    this.lastError = null;
    try {
      const peer = await this._ensurePeer();
      this.hostId = peer.id;
      this.conns.clear(); this.names.clear(); this.ping.clear();
      this._setFlags({ connected: true, isHost: true, isClient: false, localId: peer.id });
      this._setStatus('hosting');
      this.hooks.onConnected?.({ isHost: true });
      return peer.id;
    } catch (e) {
      this._destroyPeer();
      this._setStatus('offline');
      this.lastError = friendlyError(e);
      throw mkErr(this.lastError, e?.type);
    }
  }

  _onIncoming(conn) {
    const id = conn.peer;
    const welcomedCount = [...this.conns.values()].filter((c) => c.id !== id).length;
    if (welcomedCount >= MAX_CLIENTS) {
      conn.on('open', () => { this._send(conn, { t: '_full' }); setTimeout(() => { try { conn.close(); } catch { /* ignore */ } }, 600); });
      return;
    }
    const old = this.conns.get(id);
    const entry = { conn, id, name: old?.name || 'Stranger', welcomed: false, lastSeen: performance.now(), rejoin: !!old };
    this.conns.set(id, entry);
    if (old) { try { old.conn.close(); } catch { /* ignore */ } }
    conn.on('data', (d) => this._onData(conn, d));
    conn.on('close', () => this._onClientClosed(conn));
    conn.on('error', (e) => console.warn('[net] client conn error', id, e));
    setTimeout(() => {
      if (this.conns.get(id) === entry && !entry.welcomed) { try { conn.close(); } catch { /* ignore */ } this._onClientClosed(conn); }
    }, JOIN_TIMEOUT);
  }

  _onClientClosed(conn) {
    const id = conn.peer;
    const entry = this.conns.get(id);
    if (!entry || entry.conn !== conn) return;
    this.conns.delete(id);
    this.ping.delete(id);
    if (!entry.welcomed) return;
    const name = this.names.get(id) || entry.name; // latest name (renames ride along in 'ps')
    this.names.delete(id);
    this._sendAll({ t: '_leave', id, name, _f: this.peer?.id });
    this.hooks.onPeerLeave?.(id, name);
    this._sendRoster();
  }

  _welcome(entry, msg) {
    const wasWelcomed = entry.welcomed;
    entry.name = cleanName(msg.name);
    entry.welcomed = true;
    this.names.set(entry.id, entry.name);
    const players = [{ id: this.peer.id, name: this.localName, host: true }];
    for (const [pid, n] of this.names) if (pid !== entry.id) players.push({ id: pid, name: n });
    this._send(entry.conn, {
      t: '_welcome', _f: this.peer.id, v: NET_VERSION, hostId: this.peer.id, you: entry.id,
      players, time: this.game.time.total,
    });
    if (msg.v !== NET_VERSION) this._send(entry.conn, { t: '_warn', _f: this.peer.id, text: 'Version mismatch with the host — refresh both pages if things act weird.' });
    if (!wasWelcomed && !entry.rejoin) {
      this._sendAll({ t: '_join', id: entry.id, name: entry.name, _f: this.peer.id }, entry.id);
      this.hooks.onPeerJoin?.(entry.id, entry.name);
    } else if (!wasWelcomed) {
      this._sendAll({ t: '_join', id: entry.id, name: entry.name, re: 1, _f: this.peer.id }, entry.id);
      this.hooks.onPeerJoin?.(entry.id, entry.name, true);
    }
    this._sendRoster();
  }

  _sendRoster() {
    if (!this.isHost) return;
    const players = [{ id: this.peer.id, name: this.localName, host: true, ping: 0 }];
    for (const [pid, n] of this.names) players.push({ id: pid, name: n, ping: this.ping.get(pid) ?? null });
    this._sendAll({ t: '_roster', players, _f: this.peer.id });
  }

  // ---------------------------------------------------------------- client
  join(hostId, { silent = false } = {}) {
    hostId = String(hostId || '').trim();
    if (!hostId) return Promise.reject(mkErr('No game ID in the invite link.'));
    if (this.isHost) this.leave(true);
    if (this.isClient && this.hostId === hostId) return Promise.resolve(hostId);
    if (this.isClient) this.leave(true);
    if (!silent) this._setStatus('connecting');
    this.lastError = null;
    return new Promise((resolve, reject) => {
      const pending = { resolve, reject, timer: null, hostId };
      this._pending = pending;
      pending.timer = setTimeout(() => {
        this._failPending(mkErr("Connection timed out. The host might be behind a strict firewall/NAT, or they closed the game.", 'timeout'));
      }, JOIN_TIMEOUT + 5000);
      this._ensurePeer().then((peer) => {
        if (this._pending !== pending) return;
        this.hostId = hostId;
        const conn = peer.connect(hostId, { reliable: true, serialization: 'json', metadata: { name: this.localName, v: NET_VERSION } });
        if (!conn) { this._failPending(mkErr("Couldn't start a connection to the host.")); return; }
        pending.conn = conn;
        conn.on('open', () => { this._send(conn, { t: '_hello', name: this.localName, v: NET_VERSION }); });
        conn.on('data', (d) => this._onData(conn, d));
        conn.on('close', () => {
          if (this._pending === pending && pending.conn === conn) { this._failPending(mkErr('The host hung up on us.', 'closed')); return; }
          if (conn === this.hostConn) this._onHostClosed();
        });
        conn.on('error', (e) => {
          console.warn('[net] host conn error', e);
          if (this._pending === pending && pending.conn === conn) this._failPending(e);
        });
      }).catch((e) => this._failPending(e));
    });
  }

  _failPending(err) {
    const p = this._pending;
    if (!p) return;
    this._pending = null;
    clearTimeout(p.timer);
    try { p.conn?.close(); } catch { /* ignore */ }
    if (!this._reconnecting) this._setStatus('offline');
    this.lastError = friendlyError(err);
    p.reject(mkErr(this.lastError, err?.type));
  }

  _onWelcome(conn, msg) {
    const p = this._pending;
    if (!p || p.conn !== conn) return;
    this._pending = null;
    clearTimeout(p.timer);
    this.hostConn = conn;
    this.hostLastSeen = performance.now();
    this.hostId = msg.hostId || conn.peer;
    this.names.clear(); this.ping.clear();
    for (const pl of msg.players || []) if (pl.id && pl.id !== this.peer.id) this.names.set(pl.id, cleanName(pl.name));
    this._setFlags({ connected: true, isHost: false, isClient: true, localId: this.peer.id });
    this._setStatus('client');
    if (Number.isFinite(msg.time)) { try { this.game.time.set(msg.time); } catch (e) { console.error(e); } }
    this.hooks.onConnected?.({ isHost: false, players: [...this.names.entries()] });
    p.resolve(this.hostId);
  }

  async _onHostClosed() {
    const hostId = this.hostId;
    const said = this._hostSaidBye;
    this._hostSaidBye = false;
    this.hostConn = null;
    this._teardown();
    if (said) {
      this.hooks.onDisconnected?.({ reason: 'host-left', message: "The host shut the game down. You're solo now — your character's safe." });
      this._destroyPeer();
      return;
    }
    this.hooks.onDisconnected?.({ reason: 'lost', message: 'Lost the host. Trying to reconnect…' });
    // Reconnect attempts (host's browser hiccuped, wifi blinked, etc.)
    this._reconnecting = true;
    this._setStatus('reconnecting');
    for (let i = 0; i < 3 && this._reconnecting; i++) {
      await new Promise((r) => setTimeout(r, 2500 + i * 2000));
      if (!this._reconnecting) return;
      try {
        await this.join(hostId, { silent: true });
        this._reconnecting = false;
        this.hooks.onReconnected?.();
        return;
      } catch (e) { console.warn('[net] reconnect failed', e?.message); }
    }
    if (!this._reconnecting) return;
    this._reconnecting = false;
    this._setStatus('offline');
    this._destroyPeer();
    this.hooks.onDisconnected?.({ reason: 'gave-up', message: "The host is gone for good. You're solo now — your character's safe." });
  }

  // ---------------------------------------------------------------- shared
  leave(quiet = false) {
    this._reconnecting = false;
    if (this._pending) this._failPending(mkErr('Cancelled.'));
    const wasConnected = this.status === 'hosting' || this.status === 'client';
    const toClose = [];
    if (this.isHost) {
      this._sendAll({ t: '_bye', _f: this.peer?.id });
      for (const e of this.conns.values()) toClose.push(e.conn);
    } else if (this.hostConn) {
      this._send(this.hostConn, { t: '_bye', _f: this.peer?.id });
      toClose.push(this.hostConn);
    }
    this.hostConn = null;
    const peer = this.peer;
    this.peer = null;
    this._teardown();
    // Give the goodbye a moment to leave the building before slamming the door.
    setTimeout(() => {
      for (const c of toClose) { try { c.close(); } catch { /* ignore */ } }
      if (peer && !peer.destroyed) { try { peer.destroy(); } catch { /* ignore */ } }
    }, 300);
    if (wasConnected && !quiet) this.hooks.onDisconnected?.({ reason: 'left', message: 'You left co-op. Back to being lonely.' });
  }

  _teardown() {
    this.conns.clear();
    this.names.clear();
    this.ping.clear();
    this._setFlags({ connected: false, isHost: false, isClient: false, localId: 'local' });
    if (!this._reconnecting) this._setStatus('offline');
  }

  _send(conn, msg) {
    if (!conn || !conn.open) return false;
    try { conn.send(msg); return true; } catch (e) { console.warn('[net] send failed', e); return false; }
  }

  _congested(conn) {
    const dc = conn?.dataChannel;
    return !!dc && dc.bufferedAmount > 256 * 1024;
  }

  // host: is that client's channel backed up? (client: the host channel)
  isCongested(peerId) {
    if (this.isHost) return this._congested(this.conns.get(peerId)?.conn);
    return this._congested(this.hostConn);
  }

  _sendAll(msg, exceptId = null, volatile = false) {
    for (const e of this.conns.values()) {
      if (!e.welcomed || e.id === exceptId) continue;
      if (volatile && this._congested(e.conn)) continue;
      this._send(e.conn, msg);
    }
  }

  // Public transport (wired into game.net by index.js)
  broadcast(msg, { volatile = false } = {}) {
    if (!msg || typeof msg !== 'object') return;
    const env = { ...msg, _f: this.peer?.id, _b: 1 };
    if (this.isHost) this._sendAll(env, null, volatile);
    else if (this.isClient) {
      if (volatile && this._congested(this.hostConn)) return;
      this._send(this.hostConn, env);
    }
  }

  sendToHost(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (this.isHost) { this.net._dispatch({ ...msg, _f: this.peer.id }, this.peer.id); return; }
    if (this.isClient) this._send(this.hostConn, { ...msg, _f: this.peer?.id });
  }

  sendTo(peerId, msg) {
    if (!msg || typeof msg !== 'object' || !peerId) return;
    const me = this.peer?.id;
    if (peerId === me) { this.net._dispatch({ ...msg, _f: me }, me); return; }
    if (this.isHost) {
      const e = this.conns.get(peerId);
      if (e?.welcomed) this._send(e.conn, { ...msg, _f: me });
    } else if (this.isClient) {
      if (peerId === this.hostId) this.sendToHost(msg);
      else this._send(this.hostConn, { ...msg, _f: me, _to: peerId });
    }
  }

  _onData(conn, msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    const now = performance.now();
    if (this.isHost) {
      const entry = this.conns.get(conn.peer);
      if (!entry || entry.conn !== conn) return;
      entry.lastSeen = now;
      msg._f = conn.peer; // no spoofing
      if (msg.t === '_hello') { this._welcome(entry, msg); return; }
      if (!entry.welcomed) return;
      if (msg.t === '_bye') { entry.byeSaid = true; return; }
      // clients may only send these internal types, and never host-authority messages
      if ((msg.t[0] === '_' && msg.t !== '_ping' && msg.t !== '_pong') || HOST_ONLY.has(msg.t)) return;
      if (this._flooding(entry, now)) return;
      if (msg._to && msg._to !== this.peer.id) {
        const target = this.conns.get(msg._to);
        if (target?.welcomed) this._send(target.conn, msg);
        return;
      }
      if (msg._b) this._sendAll(msg, conn.peer, msg.t === 'ps');
      this._deliver(msg, conn.peer, conn);
      return;
    }
    // client (or pending client)
    if (msg.t === '_welcome') { this._onWelcome(conn, msg); return; }
    if (msg.t === '_full') { this._failPending(mkErr("That game is full (host + 3 friends max). Tell someone to leave.", 'full')); return; }
    if (conn !== this.hostConn) return;
    this.hostLastSeen = now;
    this._deliver(msg, msg._f || this.hostId, conn);
  }

  _flooding(entry, now) {
    if (!entry.rateT || now - entry.rateT > 1000) { entry.rateT = now; entry.rateN = 0; }
    if (++entry.rateN <= CLIENT_MSG_CAP) return false;
    if (entry.rateN === CLIENT_MSG_CAP + 1) console.warn('[net] dropping messages from a flooding client', entry.id);
    return true;
  }

  _deliver(msg, from, conn) {
    switch (msg.t) {
      case '_ping': this._send(conn, { t: '_pong', ts: msg.ts, _f: this.peer?.id }); return;
      case '_pong': {
        const rtt = Math.max(0, Math.round(performance.now() - Number(msg.ts)));
        if (Number.isFinite(rtt)) this.ping.set(this.isHost ? conn.peer : this.hostId, rtt);
        return;
      }
      case '_roster':
        if (!this.isClient) return;
        for (const pl of msg.players || []) {
          if (!pl?.id || pl.id === this.peer?.id) continue;
          this.names.set(pl.id, cleanName(pl.name));
          if (!pl.host && Number.isFinite(pl.ping)) this.ping.set(pl.id, pl.ping);
        }
        break;
      case '_join':
        if (!this.isClient || !msg.id || msg.id === this.peer?.id) return;
        this.names.set(msg.id, cleanName(msg.name));
        this.hooks.onPeerJoin?.(msg.id, cleanName(msg.name), !!msg.re);
        break;
      case '_leave':
        if (!this.isClient || !msg.id) return;
        this.names.delete(msg.id);
        this.ping.delete(msg.id);
        this.hooks.onPeerLeave?.(msg.id, cleanName(msg.name));
        break;
      case '_bye':
        if (this.isClient && from === this.hostId) this._hostSaidBye = true;
        return;
      case '_warn':
        this.hooks.onError?.(String(msg.text || '').slice(0, 200));
        return;
      default: break;
    }
    this.net._dispatch(msg, from);
  }

  _heartbeat() {
    const now = performance.now();
    if (this.isHost) {
      for (const e of [...this.conns.values()]) {
        if (!e.welcomed) continue;
        if (now - e.lastSeen > SILENCE_TIMEOUT) { try { e.conn.close(); } catch { /* ignore */ } this._onClientClosed(e.conn); continue; }
        this._send(e.conn, { t: '_ping', ts: now, _f: this.peer.id });
      }
      this._sendRoster();
    } else if (this.isClient) {
      if (now - this.hostLastSeen > SILENCE_TIMEOUT) {
        const c = this.hostConn;
        try { c?.close(); } catch { /* ignore */ }
        if (c === this.hostConn) this._onHostClosed();
        return;
      }
      this._send(this.hostConn, { t: '_ping', ts: now, _f: this.peer?.id });
    }
  }

  destroy() {
    clearInterval(this._hb);
    this.leave(true);
  }
}
