import * as THREE from 'three';
import { clamp, rand, pick } from '../core/util.js';

// Combat juice: synth SFX, blood decals, gib particles, tracers, muzzle
// flashes, loot pickups, speech bubbles and floating damage numbers.

// ---------------------------------------------------------------- audio
export class Sfx {
  constructor(game) {
    this.game = game;
    this._ctx = null;
    this._noise = null;
    const unlock = () => { this.ctx(); };
    addEventListener('mousedown', unlock, { once: true });
    addEventListener('keydown', unlock, { once: true });
  }

  ctx() {
    const shared = this.game.audio;
    if (shared?.ctx) {
      if (shared.ctx.state === 'suspended') shared.ctx.resume?.();
      return shared.ctx;
    }
    if (!this._ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        this._ctx = new AC();
        this._out = this._ctx.createGain();
        this._out.gain.value = 0.6;
        this._out.connect(this._ctx.destination);
      } catch { return null; }
    }
    if (this._ctx.state === 'suspended') this._ctx.resume?.();
    return this._ctx;
  }

  out() {
    const shared = this.game.audio;
    if (shared?.ctx && shared.sfx) return shared.sfx;
    if (shared?.ctx && shared.master) return shared.master;
    return this._out;
  }

  noise(ctx) {
    if (this._noise && this._noise.sampleRate === ctx.sampleRate) return this._noise;
    const len = ctx.sampleRate * 1;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  }

  // Volume falloff from the local player's position.
  _vol(pos, vol) {
    if (!pos) return vol;
    const p = this.game.player?.group?.position;
    if (!p) return vol;
    const d = Math.hypot(pos.x - p.x, pos.z - p.z);
    return vol * clamp(1 - d / 70, 0, 1) ** 1.5;
  }

  _osc(ctx, out, type, f0, f1, t0, dur, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(out);
    o.start(t0); o.stop(t0 + dur + 0.02);
    return o;
  }

  _noiseBurst(ctx, out, t0, dur, vol, filterType, f0, f1, q = 0.8) {
    const s = ctx.createBufferSource();
    s.buffer = this.noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  }

  play(name, { pos = null, vol = 1 } = {}) {
    try {
      const ctx = this.ctx();
      const out = this.out();
      if (!ctx || !out || ctx.state !== 'running') return;
      const v = this._vol(pos, vol);
      if (v < 0.01) return;
      const t = ctx.currentTime + 0.005;
      const r = rand(0.85, 1.15);
      switch (name) {
        case 'punch':
          this._osc(ctx, out, 'sine', 160 * r, 45, t, 0.14, 0.9 * v);
          this._noiseBurst(ctx, out, t, 0.06, 0.6 * v, 'lowpass', 1800, 300);
          break;
        case 'smack': // heavy blunt weapon
          this._osc(ctx, out, 'sine', 110 * r, 35, t, 0.2, 1.0 * v);
          this._noiseBurst(ctx, out, t, 0.09, 0.8 * v, 'bandpass', 2600, 500, 1.2);
          break;
        case 'slash':
          this._noiseBurst(ctx, out, t, 0.12, 0.5 * v, 'highpass', 3000, 6000);
          this._osc(ctx, out, 'sine', 140 * r, 60, t, 0.08, 0.5 * v);
          break;
        case 'whoosh':
          this._noiseBurst(ctx, out, t, 0.16, 0.22 * v, 'bandpass', 500 * r, 2400, 1.5);
          break;
        case 'gun':
          this._noiseBurst(ctx, out, t, 0.28, 1.0 * v, 'lowpass', 7000, 250);
          this._osc(ctx, out, 'sine', 120 * r, 38, t, 0.16, 0.9 * v);
          break;
        case 'biggun':
          this._noiseBurst(ctx, out, t, 0.5, 1.2 * v, 'lowpass', 5000, 120);
          this._osc(ctx, out, 'sine', 90 * r, 28, t, 0.3, 1.1 * v);
          break;
        case 'shotgun':
          this._noiseBurst(ctx, out, t, 0.45, 1.3 * v, 'lowpass', 4500, 150);
          this._noiseBurst(ctx, out, t, 0.12, 0.7 * v, 'highpass', 2000, 5000);
          this._osc(ctx, out, 'sine', 80, 25, t, 0.3, 1.2 * v);
          break;
        case 'smg':
          this._noiseBurst(ctx, out, t, 0.12, 0.7 * v, 'lowpass', 6000, 400);
          this._osc(ctx, out, 'square', 140 * r, 60, t, 0.05, 0.25 * v);
          break;
        case 'click':
          this._osc(ctx, out, 'square', 1800, 900, t, 0.025, 0.2 * v);
          break;
        case 'reload':
          this._osc(ctx, out, 'square', 900, 500, t, 0.03, 0.2 * v);
          this._osc(ctx, out, 'square', 1300, 700, t + 0.18, 0.03, 0.25 * v);
          this._noiseBurst(ctx, out, t + 0.2, 0.05, 0.25 * v, 'highpass', 2500, 4000);
          break;
        case 'hurt': { // player "oof"
          const o = this._osc(ctx, out, 'sawtooth', 260 * r, 110, t, 0.2, 0.0001);
          const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 750; f.Q.value = 2;
          const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          o.disconnect(); o.connect(f); f.connect(g); g.connect(out);
          break;
        }
        case 'grunt': { // npc hurt, random pitch
          const o = this._osc(ctx, out, 'sawtooth', 330 * r * r, 150, t, 0.16, 0.0001);
          const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 * r; f.Q.value = 3;
          const g = ctx.createGain(); g.gain.setValueAtTime(0.35 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
          o.disconnect(); o.connect(f); f.connect(g); g.connect(out);
          break;
        }
        case 'cash':
          this._osc(ctx, out, 'sine', 1320, 1300, t, 0.08, 0.3 * v);
          this._osc(ctx, out, 'sine', 1760, 1740, t + 0.08, 0.14, 0.3 * v);
          break;
        case 'pickup':
          this._osc(ctx, out, 'triangle', 600, 1200, t, 0.12, 0.3 * v);
          break;
        case 'siren':
          this._osc(ctx, out, 'sine', 700, 1300, t, 0.35, 0.18 * v);
          this._osc(ctx, out, 'sine', 1300, 700, t + 0.35, 0.35, 0.18 * v);
          break;
        case 'trombone': { // wah wah wah waaaah
          const notes = [311, 294, 277, 262];
          notes.forEach((f, i) => {
            const st = t + i * 0.42;
            const dur = i === 3 ? 1.1 : 0.38;
            const o = ctx.createOscillator(); o.type = 'sawtooth';
            o.frequency.setValueAtTime(f, st);
            if (i === 3) {
              const lfo = ctx.createOscillator(); lfo.frequency.value = 6;
              const lg = ctx.createGain(); lg.gain.value = 8;
              lfo.connect(lg); lg.connect(o.frequency); lfo.start(st); lfo.stop(st + dur);
            }
            const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1100;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, st);
            g.gain.exponentialRampToValueAtTime(0.25 * v, st + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, st + dur);
            o.connect(fl); fl.connect(g); g.connect(out);
            o.start(st); o.stop(st + dur + 0.02);
          });
          break;
        }
        case 'bust':
          this._osc(ctx, out, 'square', 520, 500, t, 0.18, 0.18 * v);
          this._osc(ctx, out, 'square', 390, 380, t + 0.2, 0.3, 0.18 * v);
          break;
        default: break;
      }
    } catch { /* audio is never worth crashing over */ }
  }
}

// ---------------------------------------------------------------- visuals
function splatTexture(seed) {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  const blob = (cx, cy, r, a) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(95,6,4,${a})`);
    g.addColorStop(0.7, `rgba(70,4,3,${a * 0.9})`);
    g.addColorStop(1, 'rgba(60,3,2,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  };
  blob(64, 64, 30 + seed * 4, 0.95);
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, d = 18 + Math.random() * 40;
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3 + Math.random() * 10, 0.9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flashTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.25, 'rgba(255,200,80,0.9)');
  g.addColorStop(1, 'rgba(255,120,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  x.strokeStyle = 'rgba(255,230,150,0.9)'; x.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    x.beginPath(); x.moveTo(32, 32); x.lineTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const CSS = `
.npc-bubble{position:absolute;left:0;top:0;transform:translate(-50%,-100%);max-width:240px;padding:4px 9px;
  background:rgba(232,224,205,.94);color:#16120e;font:600 15px/1.15 var(--font-body,sans-serif);border-radius:10px;
  border:2px solid #16120e;white-space:normal;text-align:center;box-shadow:2px 3px 0 rgba(0,0,0,.45);pointer-events:none;will-change:transform}
.npc-bubble.angry{background:#e2402f;color:#fff3e6;border-color:#2a0805}
.npc-bubble.cop{background:#2a4a8a;color:#e8eefc;border-color:#0a1220}
.npc-dmg{position:absolute;left:0;top:0;transform:translate(-50%,-50%);font:800 22px var(--font-body,sans-serif);
  color:#ffd35a;text-shadow:2px 2px 0 #000,-1px -1px 0 #000;pointer-events:none;will-change:transform,opacity}
.npc-dmg.big{color:#ff5a3a;font-size:30px}
.npc-dmg.hurt{color:#e2402f}
.npc-dmg.cash{color:#7fbf4d}
#npc-crosshair{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;pointer-events:none;display:none}
#npc-crosshair i{position:absolute;background:#f0e8d4;box-shadow:0 0 2px #000}
#npc-crosshair .h{height:2px;width:8px;top:12px}#npc-crosshair .h.l{left:0}#npc-crosshair .h.r{right:0}
#npc-crosshair .v{width:2px;height:8px;left:12px}#npc-crosshair .v.t{top:0}#npc-crosshair .v.b{bottom:0}
#npc-crosshair .d{width:3px;height:3px;left:11.5px;top:11.5px;border-radius:50%}
#npc-crosshair.hit i{background:#e2402f}
#npc-crosshair.reload{opacity:.35}
#npc-hurt{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(150,10,5,.65) 100%);transition:opacity .35s}
#npc-busted{position:absolute;left:50%;top:22%;transform:translateX(-50%);font:800 18px var(--font-body,sans-serif);color:#9cc0ff;
  text-shadow:1px 1px 0 #000;display:none;letter-spacing:1px}
#npc-busted b{display:block;height:6px;margin-top:4px;background:#2a4a8a;border:1px solid #0a1220}
`;

export class FX {
  constructor(game) {
    this.game = game;
    this.sfx = new Sfx(game);
    const scene = game.scene;

    // style + overlay roots
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    const root = document.getElementById('ui-root') || document.body;
    this.layer = document.createElement('div');
    this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    root.insertBefore(this.layer, root.firstChild);
    this.hurtEl = document.createElement('div');
    this.hurtEl.id = 'npc-hurt';
    this.layer.appendChild(this.hurtEl);

    // blood decals
    this.splatTex = [0, 1, 2].map(splatTexture);
    this.decalGeo = new THREE.PlaneGeometry(1, 1);
    this.decalGeo.rotateX(-Math.PI / 2);
    this.decals = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(this.decalGeo, new THREE.MeshBasicMaterial({
        map: this.splatTex[i % 3], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      m.visible = false; m.renderOrder = 1;
      m.userData.t = 0;
      scene.add(m);
      this.decals.push(m);
    }
    this.decalIdx = 0;

    // gibs (blood drops + the occasional tooth)
    this.gibMax = 180;
    const gibGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    this.gibs = new THREE.InstancedMesh(gibGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.gibMax);
    this.gibs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gibs.frustumCulled = false;
    this.gibData = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const col = new THREE.Color();
    for (let i = 0; i < this.gibMax; i++) {
      this.gibs.setMatrixAt(i, zero);
      this.gibs.setColorAt(i, col.set(0x7a0805));
      this.gibData.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1, spin: 0 });
    }
    this.gibIdx = 0;
    scene.add(this.gibs);
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();

    // tracers
    const trGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 4, 1, true);
    trGeo.rotateX(Math.PI / 2); trGeo.translate(0, 0, 0.5);
    this.tracers = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(trGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.userData.t = 0; m.frustumCulled = false;
      scene.add(m);
      this.tracers.push(m);
    }
    this.trIdx = 0;

    // muzzle flashes: a few sprites + ONE persistent light (no shader recompiles)
    const ftex = flashTexture();
    this.flashes = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ftex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false; s.userData.t = 0;
      scene.add(s);
      this.flashes.push(s);
    }
    this.flIdx = 0;
    this.light = new THREE.PointLight(0xffb050, 0, 14, 2);
    this.light.position.set(0, -50, 0);
    scene.add(this.light);
    this.lightT = 0;

    // pickups
    this.pickups = [];
    this.billGeo = new THREE.BoxGeometry(0.34, 0.05, 0.17);
    this.billMat = new THREE.MeshStandardMaterial({ color: 0x5f9a3a, emissive: 0x3f8a1a, emissiveIntensity: 0.9, roughness: 0.6 });
    this.ringGeo = new THREE.RingGeometry(0.35, 0.48, 20);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x9cff6a, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
    this.itemGeo = new THREE.BoxGeometry(0.28, 0.22, 0.28);
    this.itemMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, emissive: 0x6a4a00, emissiveIntensity: 0.8 });

    // bubbles + damage numbers
    this.bubbles = [];
    this.nums = [];
    this._v = new THREE.Vector3();
  }

  // ---- blood ----
  blood(x, z, amount = 1, dir = null, y = 1.2) {
    // decal
    const d = this.decals[this.decalIdx++ % this.decals.length];
    const s = rand(0.5, 1.1) * Math.sqrt(amount);
    d.position.set(x + rand(-0.3, 0.3) + (dir ? dir.x * 0.6 : 0), 0.02 + Math.random() * 0.01, z + rand(-0.3, 0.3) + (dir ? dir.z * 0.6 : 0));
    d.scale.set(s, 1, s);
    d.rotation.y = Math.random() * Math.PI * 2;
    d.material.opacity = 0.9;
    d.visible = true;
    d.userData.t = 0;
    // gibs
    const n = Math.round(6 * amount);
    for (let i = 0; i < n; i++) this._gib(x, y, z, dir, 0x7a0805 + ((Math.random() * 0x20) << 16), rand(0.6, 1.3));
  }

  tooth(x, y, z, dir) { this._gib(x, y + 0.4, z, dir, 0xf0ead8, 0.8, true); }

  _gib(x, y, z, dir, color, s, big = false) {
    const i = this.gibIdx++ % this.gibMax;
    const g = this.gibData[i];
    g.life = rand(0.6, 1.1);
    g.p.set(x, y, z);
    const sp = big ? 5 : 3.5;
    g.v.set(rand(-1, 1) * sp * 0.6 + (dir ? dir.x * sp : 0), rand(1.5, big ? 6 : 4.5), rand(-1, 1) * sp * 0.6 + (dir ? dir.z * sp : 0));
    g.s = s; g.spin = rand(5, 15);
    this.gibs.setColorAt(i, new THREE.Color(color));
    this.gibs.instanceColor.needsUpdate = true;
  }

  // ---- tracers & flashes ----
  tracer(x1, y1, z1, x2, y2, z2) {
    const m = this.tracers[this.trIdx++ % this.tracers.length];
    const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    if (len < 0.1) return;
    m.position.set(x1, y1, z1);
    m.lookAt(x2, y2, z2);
    m.scale.set(1, 1, len);
    m.material.opacity = 0.9;
    m.visible = true;
    m.userData.t = 0.07;
  }

  muzzle(x, y, z, size = 0.6) {
    const s = this.flashes[this.flIdx++ % this.flashes.length];
    s.position.set(x, y, z);
    s.scale.setScalar(size * rand(0.8, 1.2));
    s.material.rotation = Math.random() * Math.PI;
    s.visible = true;
    s.userData.t = 0.05;
    this.light.position.set(x, y + 0.2, z);
    this.light.intensity = 25 * size;
    this.lightT = 0.06;
  }

  // ---- pickups ----
  // kind: 'cash' {amount} | 'weapon' {weapon, ammo} | 'item' {item, qty} | 'drug' {drug, qty} | 'ammo' {ammoType, qty}
  dropPickup(x, z, data) {
    const g = new THREE.Group();
    if (data.kind === 'cash') {
      const n = clamp(Math.ceil((data.amount || 1) / 15), 1, 4);
      for (let i = 0; i < n; i++) {
        const b = new THREE.Mesh(this.billGeo, this.billMat);
        b.position.set(rand(-0.08, 0.08), i * 0.055, rand(-0.08, 0.08));
        b.rotation.y = rand(-0.4, 0.4);
        g.add(b);
      }
    } else if (data.kind === 'weapon' && data.mesh) {
      const w = data.mesh;
      w.rotation.z = Math.PI / 2;
      w.position.y = 0.05;
      g.add(w);
    } else {
      g.add(new THREE.Mesh(this.itemGeo, this.itemMat));
    }
    const inner = g;
    const holder = new THREE.Group();
    holder.add(inner);
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.position.y = -0.33;
    holder.add(ring);
    holder.position.set(x + rand(-0.5, 0.5), 0.35, z + rand(-0.5, 0.5));
    this.game.scene.add(holder);
    const p = { obj: holder, inner, data, t: 0, ttl: 120, vy: 3, y: 0.9 };
    this.pickups.push(p);
    return p;
  }

  clearPickups() { for (const p of this.pickups) p.obj.removeFromParent(); this.pickups.length = 0; }

  // ---- overhead DOM text ----
  // obj: anything with .position (Object3D or {position}); height: world units above it.
  say(obj, text, { ttl = 2.6, kind = '', height = 2.35 } = {}) {
    if (!obj || !text) return null;
    for (const b of this.bubbles) if (b.obj === obj) { b.el.remove(); b.dead = true; }
    this.bubbles = this.bubbles.filter((b) => !b.dead);
    while (this.bubbles.length >= 7) { const b = this.bubbles.shift(); b.el.remove(); }
    const el = document.createElement('div');
    el.className = 'npc-bubble ' + kind;
    el.textContent = text;
    el.style.display = 'none';
    this.layer.appendChild(el);
    const b = { el, obj, t: 0, ttl, height };
    this.bubbles.push(b);
    return b;
  }

  number(x, y, z, text, cls = '') {
    while (this.nums.length >= 16) { const n = this.nums.shift(); n.el.remove(); }
    const el = document.createElement('div');
    el.className = 'npc-dmg ' + cls;
    el.textContent = text;
    this.layer.appendChild(el);
    this.nums.push({ el, p: new THREE.Vector3(x + rand(-0.3, 0.3), y, z + rand(-0.3, 0.3)), t: 0, ttl: 0.9 });
  }

  hurtFlash(amount = 0.6) {
    this.hurtEl.style.transition = 'none';
    this.hurtEl.style.opacity = String(clamp(amount, 0.2, 1));
    void this.hurtEl.offsetWidth;
    this.hurtEl.style.transition = 'opacity .6s';
    this.hurtEl.style.opacity = '0';
  }

  _project(pos, out) {
    const cam = this.game.camera;
    out.copy(pos).project(cam);
    if (out.z > 1 || out.z < -1) return false;
    out.x = (out.x * 0.5 + 0.5) * innerWidth;
    out.y = (-out.y * 0.5 + 0.5) * innerHeight;
    return true;
  }

  update(dt, onPickup) {
    // decals fade
    for (const d of this.decals) {
      if (!d.visible) continue;
      d.userData.t += dt;
      const t = d.userData.t;
      if (t > 20) {
        d.material.opacity = 0.9 * (1 - (t - 20) / 8);
        if (t > 28) d.visible = false;
      }
    }
    // gibs
    const m4 = this._m4, q = this._q, e = this._e, sc = this._s;
    let any = false;
    for (let i = 0; i < this.gibMax; i++) {
      const g = this.gibData[i];
      if (g.life <= 0) continue;
      any = true;
      g.life -= dt;
      g.v.y -= 18 * dt;
      g.p.addScaledVector(g.v, dt);
      if (g.p.y < 0.03) { g.p.y = 0.03; g.v.set(g.v.x * 0.3, 0, g.v.z * 0.3); }
      e.set(g.life * g.spin, g.life * g.spin * 0.7, 0);
      q.setFromEuler(e);
      const s = g.life > 0 ? g.s * Math.min(1, g.life * 3) : 0;
      sc.set(s, s, s);
      m4.compose(g.p, q, sc);
      this.gibs.setMatrixAt(i, m4);
    }
    if (any || this._gibsWereLive) this.gibs.instanceMatrix.needsUpdate = true;
    this._gibsWereLive = any;

    for (const m of this.tracers) {
      if (!m.visible) continue;
      m.userData.t -= dt;
      m.material.opacity = Math.max(0, m.userData.t / 0.07) * 0.9;
      if (m.userData.t <= 0) m.visible = false;
    }
    for (const s of this.flashes) {
      if (!s.visible) continue;
      s.userData.t -= dt;
      if (s.userData.t <= 0) s.visible = false;
    }
    if (this.lightT > 0) {
      this.lightT -= dt;
      if (this.lightT <= 0) { this.light.intensity = 0; this.light.position.y = -50; }
    }

    // pickups
    const pp = this.game.player?.group?.position;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      // little pop-up arc when dropped
      if (p.vy !== 0) {
        p.y += p.vy * dt; p.vy -= 12 * dt;
        if (p.y <= 0.35) { p.y = 0.35; p.vy = 0; }
        p.obj.position.y = p.y;
      } else {
        p.obj.position.y = 0.35 + Math.sin(p.t * 3) * 0.08;
      }
      p.inner.rotation.y += dt * 2;
      p.obj.children[1].material.opacity = 0.3 + Math.sin(p.t * 5) * 0.15;
      let gone = p.t > p.ttl;
      if (!gone && pp && !this.game.player.dead && !this.game.player.vehicle && p.t > 0.35) {
        const dx = pp.x - p.obj.position.x, dz = pp.z - p.obj.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.5 && d > 0.01) { // magnet
          p.obj.position.x += (dx / d) * dt * 9;
          p.obj.position.z += (dz / d) * dt * 9;
        }
        if (d < 1.1) {
          try { onPickup?.(p.data, p.obj.position); } catch (err) { console.error('[npc] pickup failed', err); }
          gone = true;
        }
      }
      if (gone) { p.obj.removeFromParent(); this.pickups.splice(i, 1); }
    }

    // bubbles & numbers
    const v = this._v;
    const cam = this.game.camera.position;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t += dt;
      const pos = b.obj.position;
      const far = !pos || Math.hypot(pos.x - cam.x, pos.z - cam.z) > 45;
      if (b.t > b.ttl || b.obj.visible === false && b.obj.isObject3D || !b.obj.parent && b.obj.isObject3D) {
        b.el.remove(); this.bubbles.splice(i, 1); continue;
      }
      v.set(pos.x, pos.y + b.height, pos.z);
      if (far || !this._project(v, v)) { b.el.style.display = 'none'; continue; }
      b.el.style.display = '';
      b.el.style.transform = `translate(${v.x | 0}px,${v.y | 0}px) translate(-50%,-100%)`;
      b.el.style.opacity = b.t > b.ttl - 0.3 ? String((b.ttl - b.t) / 0.3) : '1';
    }
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += dt;
      if (n.t > n.ttl) { n.el.remove(); this.nums.splice(i, 1); continue; }
      v.copy(n.p); v.y += n.t * 1.6;
      if (!this._project(v, v)) { n.el.style.display = 'none'; continue; }
      n.el.style.display = '';
      const s = 1 + Math.max(0, 0.15 - n.t) * 4;
      n.el.style.transform = `translate(${v.x | 0}px,${v.y | 0}px) translate(-50%,-50%) scale(${s.toFixed(2)})`;
      n.el.style.opacity = String(Math.min(1, (n.ttl - n.t) * 3));
    }
  }
}

export const pickLine = pick;
