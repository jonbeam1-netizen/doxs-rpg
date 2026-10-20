import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rnd } from './common.js';
import { SFX } from './sfx.js';

// Small ambient touches: newspaper sheets tumbling in the wind, moths around lit
// streetlights at night, and the odd fish jumping by the Blackwater piers.

const PI = Math.PI;
const SHEETS = { downtown: 5, gutterside: 5, rustyards: 4, dustbowl: 3, blackwater: 2, hilltop: 1 };
const MAXL = 6, MAXM = 30, REST_Y = 0.045;

function newsprint() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 48;
  const x = c.getContext('2d');
  x.fillStyle = '#b4ad98'; x.fillRect(0, 0, 64, 48);
  x.fillStyle = '#2a2824'; x.fillRect(4, 3, 56, 6); // headline
  x.fillStyle = '#6a665c'; x.fillRect(4, 12, 22, 16); // photo
  x.fillStyle = 'rgba(40,38,34,0.55)';
  for (let y = 12; y < 45; y += 3) { x.fillRect(29, y, 31, 1); if (y > 30) x.fillRect(4, y, 22, 1); }
  x.fillStyle = 'rgba(90,70,30,0.25)'; x.beginPath(); x.arc(48, 36, 9, 0, PI * 2); x.fill(); // coffee ring, naturally
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const snapPI = (a) => Math.round(a / PI) * PI;

export class Bits {
  constructor(ctx) {
    this.ctx = ctx;
    const scene = ctx.game.scene;
    // ---- litter
    const sheetGeo = new THREE.PlaneGeometry(0.42, 0.3, 2, 1).rotateX(-PI / 2);
    { const p = sheetGeo.attributes.position; for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < 0.01) p.setY(i, 0.012); sheetGeo.computeVertexNormals(); } // a soft fold
    const sheetMat = new THREE.MeshStandardMaterial({ map: newsprint(), roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.litter = new THREE.InstancedMesh(sheetGeo, sheetMat, MAXL);
    this.litter.count = 0; this.litter.frustumCulled = false; this.litter.receiveShadow = true; this.litter.name = 'life:litter';
    scene.add(this.litter);
    this.sheets = [];
    this.wind = Math.random() * PI * 2;
    // ---- moths
    const mg = new THREE.BufferGeometry();
    this.mothPos = new Float32Array(MAXM * 3);
    mg.setAttribute('position', new THREE.BufferAttribute(this.mothPos, 3).setUsage(THREE.DynamicDrawUsage));
    mg.setDrawRange(0, 0);
    this.moths = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xeee4c8, size: 0.045, sizeAttenuation: true }));
    this.moths.frustumCulled = false; this.moths.name = 'life:moths';
    scene.add(this.moths);
    this.mothData = [];
    for (let i = 0; i < MAXM; i++) this.mothData.push({ r: rnd(0.3, 0.7), a: Math.random() * PI * 2, w: (Math.random() < 0.5 ? -1 : 1) * rnd(2.5, 7), yo: rnd(-0.38, 0.08), s: Math.random() * 9 });
    this.lamps = []; this.lampT = 0;
    // ---- fish
    const fishGeo = mergeGeometries([
      new THREE.SphereGeometry(0.05, 8, 6).scale(0.55, 1, 3.4),
      new THREE.BoxGeometry(0.008, 0.09, 0.07).translate(0, 0, -0.19),
    ]);
    this.fish = new THREE.Mesh(fishGeo, new THREE.MeshStandardMaterial({ color: 0x8a9290, metalness: 0.65, roughness: 0.35 }));
    this.fish.visible = false; this.fish.name = 'life:fish';
    scene.add(this.fish);
    const ringGeo = new THREE.RingGeometry(0.8, 1, 24).rotateX(-PI / 2);
    this.rings = [0, 1].map(() => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xd8dcd8, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; m.userData.t = 9; scene.add(m); return m;
    });
    this.jump = null;
    this.fishT = rnd(4, 9);
  }

  clear() { this.sheets.length = 0; this.litter.count = 0; this.jump = null; this.fish.visible = false; }

  scare() { /* paper doesn't care */ }

  // ------------------------------------------------------------ litter
  updateLitter(dt) {
    const c = this.ctx, ph = c.game.physics, F = c.focus;
    this.wind += (Math.random() - 0.5) * dt * 0.2;
    // stream
    for (let i = this.sheets.length - 1; i >= 0; i--) {
      const s = this.sheets[i];
      if (c.distFocus(s.x, s.z) > 70 && c.hidden(s.x, 0.2, s.z, 0.5, 60)) this.sheets.splice(i, 1);
    }
    const want = SHEETS[c.district] ?? 2;
    if (this.sheets.length < Math.min(MAXL, want) && Math.random() < dt * 2) {
      const p = c.game.world.sidewalkPointNear(F.x, F.z, 10, 45);
      if (p && c.hidden(p.x, 0.2, p.z, 0.5, 50)) this.sheets.push({ x: p.x, y: REST_Y, z: p.z, rx: 0, ry: Math.random() * PI * 2, rz: 0, st: 'rest', t: rnd(2, 12), T: 1, v: 0, h: 0, sx: 0, sz: 0, dir: 0 });
    }
    for (const s of this.sheets) {
      s.t -= dt;
      if (s.st === 'rest') {
        // a car blasting past kicks it up
        const kick = c.inCar && c.speed > 8 && c.distFocus(s.x, s.z) < 4;
        if ((s.t <= 0 && !c.rain && c.distFocus(s.x, s.z) < 45) || kick) {
          s.st = 'blow'; s.T = s.t = rnd(1.6, 3.4); s.v = rnd(1.6, 3.4) * (kick ? 1.8 : 1); s.h = rnd(0.25, 1.2) * (kick ? 1.4 : 1);
          s.dir = kick ? Math.atan2(s.x - F.x, s.z - F.z) : this.wind + rnd(-0.5, 0.5);
          s.sx = rnd(-7, 7); s.sz = rnd(-7, 7);
          SFX.rustle(c.game, s.x, s.z);
        } else if (s.t <= 0) s.t = rnd(4, 10);
      } else if (s.st === 'blow') {
        const k = 1 - s.t / s.T;
        const nx = s.x + Math.sin(s.dir) * s.v * dt, nz = s.z + Math.cos(s.dir) * s.v * dt;
        if (ph.pointBlocked(nx, nz) || c.game.world.isWater?.(nx, nz)) s.v = 0; else { s.x = nx; s.z = nz; }
        s.y = REST_Y + Math.max(0, Math.sin(Math.min(1, k) * PI)) * s.h + Math.sin(c.t * 9 + s.sx) * 0.03 * (1 - k);
        s.rx += s.sx * dt; s.rz += s.sz * dt; s.ry += dt * 0.8;
        if (s.t <= 0) { s.st = 'settle'; s.t = 0.35; }
      } else if (s.st === 'settle') {
        const f = Math.min(1, dt * 10);
        s.rx += (snapPI(s.rx) - s.rx) * f; s.rz += (snapPI(s.rz) - s.rz) * f; s.y += (REST_Y - s.y) * f;
        if (s.t <= 0) { s.rx = snapPI(s.rx); s.rz = snapPI(s.rz); s.y = REST_Y; s.st = 'rest'; s.t = rnd(5, 16); }
      }
    }
    const m = this.litter;
    for (let i = 0; i < this.sheets.length; i++) {
      const s = this.sheets[i];
      _e.set(s.rx, s.ry, s.rz); _q.setFromEuler(_e); _p.set(s.x, s.y, s.z);
      m.setMatrixAt(i, _m.compose(_p, _q, _one));
    }
    m.count = this.sheets.length; m.visible = m.count > 0;
    m.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ moths
  updateMoths(dt) {
    const c = this.ctx, F = c.focus, g = this.moths.geometry;
    const on = c.night > 0.5 && !c.rain;
    if (!on) { if (g.drawRange.count) g.setDrawRange(0, 0); this.moths.visible = false; this.lamps.length = 0; return; }
    this.lampT -= dt;
    if (this.lampT <= 0) {
      this.lampT = 0.5;
      // the world's pooled point lights sit on the nearest lit lamps
      const L = [];
      for (const o of c.game.scene.children) {
        if (!o.isPointLight || !o.userData?.src) continue;
        const k = o.userData.src.kind;
        if (k !== 'street' && k !== 'flicker') continue;
        const d = Math.hypot(o.position.x - F.x, o.position.z - F.z);
        if (d < 45) L.push([d, o]);
      }
      L.sort((a, b) => a[0] - b[0]);
      this.lamps = L.slice(0, 3).map((e) => e[1]);
    }
    let n = 0;
    const per = Math.floor(MAXM / 3);
    for (let li = 0; li < this.lamps.length; li++) {
      const lamp = this.lamps[li];
      if (lamp.intensity < 2.5) continue; // flickered off
      const lx = lamp.position.x, ly = lamp.position.y, lz = lamp.position.z;
      for (let k = 0; k < per; k++) {
        const m = this.mothData[li * per + k];
        m.a += m.w * dt;
        const r = m.r + Math.sin(c.t * 3.1 + m.s) * 0.08;
        this.mothPos[n * 3] = lx + Math.cos(m.a) * r + Math.sin(c.t * 11 + m.s) * 0.03;
        this.mothPos[n * 3 + 1] = ly + m.yo + Math.sin(c.t * 7.3 + m.s * 2) * 0.07;
        this.mothPos[n * 3 + 2] = lz + Math.sin(m.a) * r + Math.cos(c.t * 13 + m.s) * 0.03;
        n++;
      }
    }
    g.setDrawRange(0, n); this.moths.visible = n > 0;
    g.attributes.position.needsUpdate = n > 0;
  }

  // ------------------------------------------------------------ fish
  fishZones() {
    const s = this.ctx.game.world.island?.spots;
    const out = [];
    if (s?.pier) out.push({ x0: s.pier.x - 24, x1: s.pier.x + 24, z0: s.pier.z0 + 10, z1: s.pier.z1 + 22 });
    if (s?.ferry) out.push({ x0: s.ferry.x0, x1: s.ferry.x1, z0: s.ferry.z - 22, z1: s.ferry.z + 22 });
    return out;
  }
  updateFish(dt) {
    const c = this.ctx, w = c.game.world;
    if (!this.jump) {
      this.fishT -= dt;
      if (this.fishT <= 0) {
        this.fishT = rnd(5, 14);
        if (c.focus.x > 700) {
          const zones = this.fishZones().filter((z) => c.distFocus((z.x0 + z.x1) / 2, (z.z0 + z.z1) / 2) < 75);
          for (let k = 0; k < 8 && zones.length; k++) {
            const z = zones[(Math.random() * zones.length) | 0];
            const x = rnd(z.x0, z.x1), zz = rnd(z.z0, z.z1);
            if (c.distFocus(x, zz) > 45 || c.distFocus(x, zz) < 4) continue;
            if (![[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].every(([ox, oz]) => w.isWater?.(x + ox, zz + oz))) continue;
            const yaw = Math.random() * PI * 2;
            this.jump = { x, z: zz, yaw, t: 0, T: rnd(0.55, 0.8), h: rnd(0.45, 0.85), d: rnd(0.6, 1.1), splashed: 0 };
            this.splash(x, zz);
            SFX.plip(c.game, x, zz);
            break;
          }
        }
      }
    }
    const J = this.jump;
    if (J) {
      J.t += dt;
      const k = J.t / J.T;
      if (k >= 1) {
        this.fish.visible = false; this.jump = null;
        this.splash(J.x + Math.sin(J.yaw) * J.d, J.z + Math.cos(J.yaw) * J.d);
        SFX.plip(c.game, J.x, J.z);
      } else {
        const y = -1.3 + 4 * J.h * k * (1 - k);
        this.fish.visible = true;
        this.fish.position.set(J.x + Math.sin(J.yaw) * J.d * k, y, J.z + Math.cos(J.yaw) * J.d * k);
        const vy = 4 * J.h * (1 - 2 * k) / J.T, vh = J.d / J.T;
        this.fish.rotation.set(-Math.atan2(vy, vh), J.yaw, Math.sin(J.t * 30) * 0.2, 'YXZ');
      }
    }
    for (const r of this.rings) {
      if (!r.visible) continue;
      r.userData.t += dt;
      const k = r.userData.t / 0.9;
      if (k >= 1) { r.visible = false; continue; }
      r.scale.setScalar(0.12 + k * 0.7);
      r.material.opacity = 0.5 * (1 - k);
    }
  }
  splash(x, z) {
    const r = this.rings.reduce((a, b) => (a.userData.t > b.userData.t ? a : b));
    r.position.set(x, -1.27, z); r.userData.t = 0; r.visible = true; r.scale.setScalar(0.12); r.material.opacity = 0.5;
  }

  update(dt) {
    this.updateLitter(dt);
    this.updateMoths(dt);
    this.updateFish(dt);
  }
}
