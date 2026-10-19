import * as THREE from 'three';
import { CHARACTERS } from '../data/quests.js';
import { createStickman } from '../entities/stickman.js';
import { KIND_COLORS } from './engine.js';

// Quest characters on the street, floating "!" / "?" markers over them,
// light-column beacons at objectives, and entries in game.world.markers.

function markTexture(ch, color) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 84px "Barlow Condensed", Impact, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(ch, 32, 52);
  ctx.fillStyle = color;
  ctx.fillText(ch, 32, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function columnTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const ctx = c.getContext('2d');
  const gr = ctx.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class QuestWorld {
  constructor(game, engine) {
    this.g = game;
    this.q = engine;
    engine.world = this;
    this.chars = new Map();      // charId -> { npc?, model?, group, x, z, interactId }
    this.beacons = new Map();    // key -> { group, ring, col, color }
    this.markerKeys = new Set();
    this._t = 0;
    this._refreshT = 0;
    this._lastVersion = -1;
    this.root = new THREE.Group();
    this.root.name = 'quest-markers';
    game.scene.add(this.root);

    this.markTex = { '!': markTexture('!', '#f2c53d'), '?': markTexture('?', '#e8e2d0') };
    this.markMat = {
      '!': new THREE.SpriteMaterial({ map: this.markTex['!'], depthWrite: false, transparent: true }),
      '?': new THREE.SpriteMaterial({ map: this.markTex['?'], depthWrite: false, transparent: true }),
    };
    this.colGeo = new THREE.CylinderGeometry(0.85, 0.85, 80, 20, 1, true);
    this.colGeo.translate(0, 40, 0);
    this.ringGeo = new THREE.RingGeometry(1.5, 2.0, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.colTex = columnTexture();
    this.matCache = new Map();
  }

  // ------------------------------------------------------------ characters
  _placeFor(c) {
    const g = this.g;
    const loc = g.locations.get(c.loc);
    if (!loc) return null;
    const dx0 = loc.doorX ?? loc.x, dz0 = loc.doorZ ?? loc.z;
    let ox = dx0 - loc.x, oz = dz0 - loc.z;
    const len = Math.hypot(ox, oz);
    if (len < 0.01) { ox = 0; oz = 1; } else { ox /= len; oz /= len; }
    const px = -oz, pz = ox; // perpendicular
    const side = c.slot === 1 ? -1 : 1;
    const along = c.slot === 2 ? 6 : 3.2;
    const cands = [];
    for (const out of [1.6, 3, 4.5]) for (const s of [along, along + 1.8, along + 3.6]) cands.push([dx0 + ox * out + px * s * side, dz0 + oz * out + pz * s * side]);
    for (const out of [2, 4]) for (const s of [along, along + 2]) cands.push([dx0 + ox * out - px * s * side, dz0 + oz * out - pz * s * side]);
    for (const [x, z] of cands) {
      if (g.physics.pointBlocked(x, z)) continue;
      const r = g.physics.resolveCircle(x, z, 0.5);
      if (!r.hit) return { x, z, facing: Math.atan2(ox, oz) };
    }
    return { x: dx0 + ox * 2.5 + px * along * side, z: dz0 + oz * 2.5 + pz * along * side, facing: Math.atan2(ox, oz) };
  }

  spawnAll() {
    this.despawnAll();
    for (const [id, c] of Object.entries(CHARACTERS)) {
      if (c.inside) continue;
      try { this._spawn(id, c); } catch (e) { console.error('[quests] spawn failed', id, e); }
    }
    this._lastVersion = -1;
  }

  _spawn(id, c) {
    const g = this.g;
    const at = this._placeFor(c);
    if (!at) return;
    const entry = { id, x: at.x, z: at.z, npc: null, model: null, group: null, sprite: null };
    const onTalk = () => this.q.talkTo(id);
    if (g.npcs?.spawn) {
      try {
        const npc = g.npcs.spawn({
          id: 'q_' + id, kind: 'static', x: at.x, z: at.z, facing: at.facing,
          name: c.name, color: c.color, hat: c.hat || null, hatColor: c.hatColor,
          onTalk, talkPrompt: c.talkPrompt || `Talk to ${c.name}`, persistent: true,
          wander: false, hostile: false, networked: false, data: { questChar: id },
        });
        if (npc) { entry.npc = npc; entry.group = npc.group; }
      } catch (e) { console.error('[quests] npcs.spawn failed, using fallback', e); }
    }
    if (!entry.npc) {
      const m = createStickman({ color: c.color || '#222', hat: c.hat || null, hatColor: c.hatColor ?? 0x2a2420 });
      m.group.position.set(at.x, 0, at.z);
      m.group.rotation.y = at.facing;
      g.scene.add(m.group);
      entry.model = m; entry.group = m.group;
      entry.interactId = 'qnpc:' + id;
      g.interact.add({ id: entry.interactId, x: at.x, z: at.z, radius: 2.6, prompt: c.talkPrompt || `Talk to ${c.name}`, onInteract: onTalk });
    }
    const sp = new THREE.Sprite(this.markMat['!']);
    sp.scale.set(0.55, 0.85, 1);
    sp.visible = false;
    sp.renderOrder = 5;
    this.root.add(sp);
    entry.sprite = sp;
    this.chars.set(id, entry);
  }

  despawnAll() {
    const g = this.g;
    for (const e of this.chars.values()) {
      try {
        if (e.npc) g.npcs?.remove?.(e.npc);
        if (e.model) e.model.dispose();
        if (e.interactId) g.interact.remove(e.interactId);
        if (e.sprite) this.root.remove(e.sprite);
      } catch (err) { console.error(err); }
    }
    this.chars.clear();
  }

  charPos(id) {
    const e = this.chars.get(id);
    if (!e) return null;
    const p = e.npc?.pos || e.group?.position;
    return p ? { x: p.x, z: p.z, label: CHARACTERS[id]?.name } : { x: e.x, z: e.z };
  }

  // ------------------------------------------------------------ beacons
  _mats(color) {
    let m = this.matCache.get(color);
    if (m) return m;
    m = {
      col: new THREE.MeshBasicMaterial({ color, map: this.colTex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
      ring: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    };
    this.matCache.set(color, m);
    return m;
  }

  _beacon(key, t, color, tracked) {
    let b = this.beacons.get(key);
    if (!b || b.color !== color) {
      if (b) this.root.remove(b.group);
      const m = this._mats(color);
      const group = new THREE.Group();
      const col = new THREE.Mesh(this.colGeo, m.col);
      col.frustumCulled = false;
      const ring = new THREE.Mesh(this.ringGeo, m.ring);
      ring.position.y = 0.06;
      const ring2 = new THREE.Mesh(this.ringGeo, m.ring);
      ring2.position.y = 0.06;
      group.add(col, ring, ring2);
      this.root.add(group);
      b = { group, ring, ring2, col, color };
      this.beacons.set(key, b);
    }
    b.group.position.set(t.x, 0, t.z);
    b.tracked = tracked;
    b.col.scale.set(tracked ? 1.2 : 0.75, tracked ? 1 : 0.7, tracked ? 1.2 : 0.75);
    return b;
  }

  refresh() {
    const g = this.g, q = this.q;
    const want = new Map();
    const tracked = q.trackedId();
    for (const id of q.activeIds()) {
      const d = q.def(id);
      const color = KIND_COLORS[d.kind] || KIND_COLORS.side;
      q.targets(id).forEach((t, i) => want.set(`${id}:${i}`, { ...t, color, title: d.title, tracked: id === tracked, kind: d.kind }));
    }
    // beacons
    for (const [k, b] of this.beacons) if (!want.has(k)) { this.root.remove(b.group); this.beacons.delete(k); }
    for (const [k, t] of want) this._beacon(k, t, t.color, t.tracked);
    // minimap markers
    const markers = g.world ? (g.world.markers instanceof Map ? g.world.markers : (g.world.markers = new Map())) : null;
    if (markers) {
      for (const k of this.markerKeys) if (!want.has(k)) markers.delete('quest:' + k);
      this.markerKeys = new Set(want.keys());
      for (const [k, t] of want) {
        markers.set('quest:' + k, { x: t.x, z: t.z, color: t.color, label: `${t.title}: ${t.label || ''}`, icon: t.kind === 'main' ? '★' : t.kind === 'job' ? '$' : '!', quest: true, tracked: t.tracked });
      }
    }
    // indicator sprites
    for (const [id, e] of this.chars) {
      const ind = q.charIndicator(id);
      e.ind = ind;
      if (!e.sprite) continue;
      e.sprite.visible = !!ind;
      if (ind) e.sprite.material = this.markMat[ind];
    }
  }

  clearAll() {
    for (const b of this.beacons.values()) this.root.remove(b.group);
    this.beacons.clear();
    const markers = this.g.world?.markers;
    if (markers instanceof Map) for (const k of this.markerKeys) markers.delete('quest:' + k);
    this.markerKeys.clear();
  }

  update(dt) {
    const g = this.g;
    if (!g.started) return;
    this._t += dt;
    this._refreshT += dt;
    if (this.q.version !== this._lastVersion || this._refreshT > 1) {
      this._lastVersion = this.q.version; this._refreshT = 0;
      this.refresh();
    }
    const t = this._t;
    // beacon pulse
    for (const b of this.beacons.values()) {
      const k = (t * 0.8) % 1, k2 = (t * 0.8 + 0.5) % 1;
      b.ring.scale.setScalar(0.6 + k * 1.6);
      b.ring2.scale.setScalar(0.6 + k2 * 1.6);
      b.ring.material.opacity = 0.8;
      b.col.rotation.y = t * 0.6;
    }
    // ring fade uses a shared material, so modulate overall via column opacity breathe
    for (const m of this.matCache.values()) { m.col.opacity = 0.42 + Math.sin(t * 2.4) * 0.12; m.ring.opacity = 0.55 + Math.sin(t * 3) * 0.25; }
    // sprites + fallback NPC idle anim
    const pp = g.player?.group?.position;
    for (const e of this.chars.values()) {
      const gp = e.group?.position || e.npc?.pos;
      if (e.sprite && e.sprite.visible && gp) e.sprite.position.set(gp.x, 2.75 + Math.sin(t * 3 + e.x) * 0.12, gp.z);
      if (e.model && pp && Math.abs(gp.x - pp.x) + Math.abs(gp.z - pp.z) < 90) {
        e.model.animate(dt, 0, {});
        // face the player when close
        const dx = pp.x - gp.x, dz = pp.z - gp.z;
        if (dx * dx + dz * dz < 36) e.group.rotation.y = Math.atan2(dx, dz);
      }
    }
  }
}
