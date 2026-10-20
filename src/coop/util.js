// Shared helpers for the co-op feature modules (validation, throttling, peer lookups).
import { cleanName } from '../net/transport.js';

export function makeUtil(game) {
  const net = game.net;
  const now = () => performance.now();
  const lastT = new Map();

  const U = {
    // ---- wire validation (anything off the wire is untrusted)
    num: (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null),
    int: (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null),
    str: (v, max = 64) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null),
    word: (v, max = 24) => (typeof v === 'string' && v.length <= max && /^[a-z0-9_-]+$/i.test(v) ? v : null),
    text: (v, max = 48) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max) : ''), // eslint-disable-line no-control-regex
    coord: (v) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 5000 ? v : null),

    // per-sender, per-key throttle: true = allowed
    rate(from, key, ms) {
      const k = from + '|' + key, t = now();
      if (t - (lastT.get(k) ?? -1e9) < ms) return false;
      lastT.set(k, t);
      if (lastT.size > 500) lastT.clear();
      return true;
    },

    // ---- peers
    connected: () => !!net.connected,
    me: () => net.localId,
    myName: () => cleanName(game.state?.p?.name),
    known: (id) => typeof id === 'string' && id !== net.localId && !!net.session?.names?.has(id),
    peers: () => (net.connected && net.peers ? net.peers() : []),
    nameOf(id) {
      if (id === net.localId || id === 'local') return U.myName();
      return net.remotePlayers.get(id)?.name || net.session?.names?.get(id) || 'Somebody';
    },
    // a remote player we've actually seen (the transport drops silent peers after 30 s)
    live(id) {
      const rp = net.remotePlayers.get(id);
      return rp && !rp._fresh && now() - rp.lastSeen < 20000 ? rp : null;
    },
    myPos() {
      const pl = game.player;
      return pl?.vehicle?.group?.position ?? pl?.group?.position ?? { x: 0, y: 0, z: 0 };
    },
    distTo(id) {
      const rp = U.live(id);
      if (!rp) return Infinity;
      const p = U.myPos();
      return Math.hypot(rp.pos.x - p.x, rp.pos.z - p.z);
    },
    send(id, msg) { if (net.connected && id) { try { net.sendTo(id, msg); } catch (e) { console.warn('[coop] send failed', e); } } },
    bcast(msg) { if (net.connected) { try { net.broadcast(msg); } catch (e) { console.warn('[coop] broadcast failed', e); } } },
    toast(html, kind = 'info', ms) { try { game.ui.toast(html, kind, ms); } catch { /* ignore */ } },
    big(title, sub, ms, kind) { try { game.ui.bigText(title, sub, ms, kind); } catch { /* ignore */ } },
    sys(text, kind) { try { game.net.chat?.system?.(text, kind); } catch { /* ignore */ } },
    elapsed: () => game.elapsed ?? now() / 1000,
    newId: () => Math.random().toString(36).slice(2, 10),
    // On foot, alive and free to do a co-op activity?
    free() {
      const pl = game.player;
      return !!pl && game.started && !pl.dead && !pl.vehicle && !game.combat?.isDown && !game.skate?.on;
    },
  };
  return U;
}
