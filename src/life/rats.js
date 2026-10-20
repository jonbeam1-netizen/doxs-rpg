import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GROUND_Y, colored, rnd, angTo } from './common.js';
import { SFX } from './sfx.js';

// Rats: hug building walls at night and nose around dumpsters in the slums.
// They bolt from the player (along the wall, or under the dumpster) and vanish once unseen.
// One InstancedMesh.

const MAX = 24;
const PI = Math.PI;
const WALL = { gutterside: 4, rustyards: 3, downtown: 2, blackwater: 2, dustbowl: 1, hilltop: 0 };
const DUMP_NIGHT = { gutterside: 3, rustyards: 3, downtown: 1, blackwater: 1 };
const DUMP_DAY = { gutterside: 1, rustyards: 1 };

function buildGeo() {
  const fur = [1, 1, 1], pink = [1.7, 1.25, 1.2];
  return mergeGeometries([
    colored(new THREE.SphereGeometry(0.05, 10, 8).scale(1, 0.95, 2.1).translate(0, 0.052, 0), fur),
    colored(new THREE.ConeGeometry(0.034, 0.085, 7).rotateX(PI / 2).translate(0, 0.05, 0.135), fur),
    colored(new THREE.SphereGeometry(0.014, 5, 4).scale(1, 1, 0.5).translate(0.022, 0.085, 0.1), pink),
    colored(new THREE.SphereGeometry(0.014, 5, 4).scale(1, 1, 0.5).translate(-0.022, 0.085, 0.1), pink),
    colored(new THREE.CylinderGeometry(0.0035, 0.007, 0.24, 4).rotateX(PI / 2 + 0.1).translate(0, 0.022, -0.215), pink),
  ]);
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Rats {
  constructor(ctx) {
    this.ctx = ctx;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, color: 0x5e5046 });
    this.mesh = new THREE.InstancedMesh(buildGeo(), mat, MAX);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.name = 'life:rats';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.setRGB(1, 1, 1));
    ctx.game.scene.add(this.mesh);
    this.rats = [];
    this.streamT = 1;
    this.squeakT = rnd(4, 10);
    this.dirty = false;
  }

  clear() { this.rats.length = 0; this.mesh.count = 0; }

  add(r) {
    if (this.rats.length >= MAX) return null;
    Object.assign(r, { yaw: 0, state: 'pause', t: rnd(0.3, 1.5), v: 0, bob: Math.random() * 6, look: 0, k: rnd(0.85, 1.15), tint: rnd(0.75, 1.2) });
    this.rats.push(r); this.dirty = true;
    return r;
  }
  remove(r) { const i = this.rats.indexOf(r); if (i >= 0) { this.rats[i] = this.rats[this.rats.length - 1]; this.rats.pop(); this.dirty = true; } }

  // ------------------------------------------------------------ geometry helpers
  wallOk(r, x, z) {
    const ph = this.ctx.game.physics;
    if (ph.pointBlocked(x, z)) return false;
    if (!ph.pointBlocked(x - r.nx * 0.55, z - r.nz * 0.55)) return false; // the wall ended
    return true;
  }
  perimPos(r, p, out) {
    const R = r.rect, w = R.x1 - R.x0, d = R.z1 - R.z0, L = 2 * (w + d);
    p = ((p % L) + L) % L;
    if (p < w) { out.x = R.x0 + p; out.z = R.z0; out.dx = 1; out.dz = 0; }
    else if (p < w + d) { out.x = R.x1; out.z = R.z0 + (p - w); out.dx = 0; out.dz = 1; }
    else if (p < 2 * w + d) { out.x = R.x1 - (p - w - d); out.z = R.z1; out.dx = -1; out.dz = 0; }
    else { out.x = R.x0; out.z = R.z1 - (p - 2 * w - d); out.dx = 0; out.dz = -1; }
    return out;
  }

  spawnWall(s) {
    const ph = this.ctx.game.physics;
    const nx = Math.sin(s.facing), nz = Math.cos(s.facing);
    let x = s.x - nx * 0.25, z = s.z - nz * 0.25;
    const res = ph.resolveCircle(x, z, 0.09); x = res.x; z = res.z;
    const r = { mode: 'wall', x, z, nx, nz, tx: nz, tz: -nx, dir: Math.random() < 0.5 ? 1 : -1 };
    if (!this.wallOk(r, x, z)) return null;
    return this.add(r);
  }
  spawnDump(D) {
    const o = 0.24;
    const r = { mode: 'dump', rect: { x0: D.minX - o, x1: D.maxX + o, z0: D.minZ - o, z1: D.maxZ + o, cx: (D.minX + D.maxX) / 2, cz: (D.minZ + D.maxZ) / 2 }, p: 0, dir: Math.random() < 0.5 ? 1 : -1, x: 0, z: 0, key: D.key };
    const R = r.rect;
    r.p = Math.random() * 2 * (R.x1 - R.x0 + R.z1 - R.z0);
    const q = this.perimPos(r, r.p, {});
    if (this.ctx.game.physics.pointBlocked(q.x, q.z)) return null;
    r.x = q.x; r.z = q.z;
    return this.add(r);
  }

  // ------------------------------------------------------------ streaming
  stream() {
    const c = this.ctx, F = c.focus, d = c.district;
    const night = c.night > 0.45;
    for (let i = this.rats.length - 1; i >= 0; i--) {
      const r = this.rats[i];
      const dist = c.distFocus(r.x, r.z);
      const offShift = r.mode === 'wall' && !night;
      if ((dist > 60 || (offShift && dist > 12)) && c.hidden(r.x, 0.1, r.z, 0.4, 45)) this.remove(r);
    }
    const scale = c.rain ? 0.7 : 1;
    const wantW = night ? Math.round((WALL[d] ?? 0) * scale) : 0;
    const wantD = Math.round(((night ? DUMP_NIGHT[d] : DUMP_DAY[d]) ?? 0) * scale);
    const nW = this.rats.filter((r) => r.mode === 'wall').length, nD = this.rats.filter((r) => r.mode === 'dump').length;
    if (nW < wantW) {
      let spots = [];
      try { spots = c.game.world.wallSpots(F.x, F.z, 45) ?? []; } catch { spots = []; }
      spots = spots.filter((s) => { const dd = c.distFocus(s.x, s.z); return dd > 12 && c.hidden(s.x, 0.1, s.z, 0.5, 40); });
      if (spots.length) this.spawnWall(spots[(Math.random() * spots.length) | 0]);
    }
    if (nD < wantD) {
      const ds = c.props.dumpsters.filter((D) => {
        const dd = c.distFocus((D.minX + D.maxX) / 2, (D.minZ + D.maxZ) / 2);
        return dd > 9 && dd < 45 && this.rats.filter((r) => r.key === D.key).length < 2 && c.hidden((D.minX + D.maxX) / 2, 0.3, (D.minZ + D.maxZ) / 2, 1.5, 40);
      });
      if (ds.length) this.spawnDump(ds[(Math.random() * ds.length) | 0]);
    }
  }

  scare(x, z, r, kind) {
    for (const rat of this.rats) if (Math.hypot(rat.x - x, rat.z - z) < r * (kind === 'gun' || kind === 'boom' ? 0.8 : 1.4)) this.flee(rat, x, z);
  }

  flee(r, fx, fz) {
    if (r.state === 'flee' || r.state === 'hide') return;
    if (r.mode === 'dump') { r.state = 'hide'; r.t = 3; }
    else {
      const along = (r.x - fx) * r.tx + (r.z - fz) * r.tz;
      r.dir = along >= 0 ? 1 : -1;
      r.state = 'flee'; r.t = rnd(2.5, 4);
    }
    if (Math.random() < 0.5) SFX.squeak(this.ctx.game, r.x, r.z);
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const c = this.ctx;
    this.streamT -= dt;
    if (this.streamT <= 0) { this.streamT = 1; this.stream(); }
    const q = {};
    for (let i = this.rats.length - 1; i >= 0; i--) {
      const r = this.rats[i];
      if (!r) continue;
      if (r.state !== 'flee' && r.state !== 'hide' && c.threat(r.x, r.z, 2.2) > 0) this.flee(r, c.focus.x, c.focus.z);
      r.t -= dt;
      let moving = false;
      if (r.state === 'pause') {
        r.v = 0;
        r.look = Math.sin(c.t * 7 + r.bob) * 0.35; // sniffing about
        if (r.t <= 0) { r.state = 'run'; r.t = rnd(0.4, 2.2); if (Math.random() < 0.3) r.dir = -r.dir; }
      } else if (r.state === 'run' || r.state === 'flee') {
        const v = r.state === 'flee' ? 4.6 : rnd(2, 2.8);
        moving = true; r.look = 0;
        if (r.mode === 'wall') {
          const nx = r.x + r.tx * r.dir * v * dt, nz = r.z + r.tz * r.dir * v * dt;
          const ahead = c.game.physics.pointBlocked(nx + r.tx * r.dir * 0.12, nz + r.tz * r.dir * 0.12);
          if (!ahead && this.wallOk(r, nx, nz)) { r.x = nx; r.z = nz; }
          else if (r.state === 'flee' && !ahead && !c.game.physics.pointBlocked(nx, nz)) { r.x = nx; r.z = nz; } // off the end of the wall, keep running
          else { r.dir = -r.dir; if (r.state !== 'flee') { r.state = 'pause'; r.t = rnd(0.3, 1); } }
          r.yaw = Math.atan2(r.tx * r.dir, r.tz * r.dir);
        } else {
          const np = r.p + r.dir * v * dt;
          this.perimPos(r, np, q);
          if (c.game.physics.pointBlocked(q.x, q.z)) { r.dir = -r.dir; r.state = 'pause'; r.t = rnd(0.3, 1); }
          else { r.p = np; r.x = q.x; r.z = q.z; r.yaw += angTo(r.yaw, Math.atan2(q.dx * r.dir, q.dz * r.dir)) * Math.min(1, dt * 18); }
        }
        if (r.t <= 0) {
          if (r.state === 'flee' && c.hidden(r.x, 0.1, r.z, 0.4, 30)) { this.remove(r); continue; }
          r.state = r.state === 'flee' ? 'run' : 'pause';
          r.t = r.state === 'run' ? rnd(1, 2) : rnd(0.4, 2.2);
        }
      } else if (r.state === 'hide') {
        // dart under the dumpster and stay gone
        const R = r.rect, dx = R.cx - r.x, dz = R.cz - r.z, d = Math.hypot(dx, dz);
        moving = true;
        r.yaw += angTo(r.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 14);
        const st = Math.min(d, 3.8 * dt);
        r.x += (dx / (d || 1)) * st; r.z += (dz / (d || 1)) * st;
        if (d < 0.35 || r.t <= 0) { this.remove(r); continue; }
      }
      if (moving) r.bob += dt * 38;
    }
    this.squeakT -= dt;
    if (this.squeakT <= 0) {
      this.squeakT = rnd(5, 14);
      const near = this.rats.filter((r) => c.distFocus(r.x, r.z) < 12);
      if (near.length) { const r = near[0]; SFX.squeak(c.game, r.x, r.z); }
    }
    this.write();
  }

  write() {
    const m = this.mesh, n = this.rats.length;
    for (let i = 0; i < n; i++) {
      const r = this.rats[i];
      const run = r.state !== 'pause';
      _e.set(run ? Math.sin(r.bob) * 0.06 : 0.05, r.yaw + r.look * (run ? 0 : 1), 0);
      _q.setFromEuler(_e);
      _p.set(r.x, GROUND_Y + (run ? Math.abs(Math.sin(r.bob)) * 0.012 : 0), r.z);
      _s.set(r.k, r.k * (run ? 0.92 : 1), r.k * (run ? 1.06 : 1));
      m.setMatrixAt(i, _m.compose(_p, _q, _s));
      if (this.dirty) m.setColorAt(i, _c.setRGB(r.tint, r.tint * 0.96, r.tint * 0.92, THREE.SRGBColorSpace));
    }
    m.count = n; m.visible = n > 0;
    m.instanceMatrix.needsUpdate = true;
    if (this.dirty && m.instanceColor) m.instanceColor.needsUpdate = true;
    this.dirty = false;
  }
}
