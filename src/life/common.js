import * as THREE from 'three';

// Shared helpers for the ambient-life systems (birds, rats, dogs, bits).
// Everything in src/life is local-only cosmetic: never networked, never saved.

const _frus = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(new THREE.Vector3(), 1);

export const GROUND_Y = 0.03; // sidewalk surface (ground 0, lots 0.035, sidewalks 0.03)

export function createCtx(game) {
  const ctx = {
    game,
    t: 0,
    focus: new THREE.Vector3(), // the player, or the vehicle they're driving
    speed: 0,
    inCar: false,
    night: 0,
    rain: false,
    weather: 'overcast',
    district: 'downtown',
    _frusF: -1,
    _frame: 0,

    update(dt) {
      this.t += dt;
      this._frame++;
      const p = game.player;
      const v = p?.vehicle;
      const src = v?.group?.position ?? p?.group?.position;
      if (src) this.focus.set(src.x, 0, src.z);
      this.inCar = !!v;
      this.speed = v ? (v.speed ?? 0) : (p?.speed ?? 0);
      const w = game.world;
      this.night = w?.night ?? (game.time?.isNight ? 1 : 0);
      this.weather = w?.weather ?? 'overcast';
      this.rain = this.weather === 'rain' || this.weather === 'storm';
      this.district = this.districtAt(this.focus.x, this.focus.z);
    },

    districtAt(x, z) { try { return game.world?.districtAt?.(x, z) || 'downtown'; } catch { return 'downtown'; } },

    // frustum test against this frame's camera
    inView(x, y, z, r = 1) {
      if (this._frusF !== this._frame) {
        this._frusF = this._frame;
        const cam = game.camera;
        cam.updateMatrixWorld();
        _frus.setFromProjectionMatrix(_pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      }
      _sph.center.set(x, y, z); _sph.radius = r;
      return _frus.intersectsSphere(_sph);
    },
    camDist(x, z) { const c = game.camera.position; return Math.hypot(x - c.x, z - c.z); },
    // safe to pop something in or out here? (off-camera, or too far for anyone to notice)
    hidden(x, y, z, r = 1, far = 95) { return this.camDist(x, z) > far || !this.inView(x, y, z, r); },
    distFocus(x, z) { return Math.hypot(x - this.focus.x, z - this.focus.z); },

    // standable for a small critter (r ~ 0.1-0.4)
    free(x, z, r = 0.15) {
      const ph = game.physics;
      if (ph.pointBlocked(x, z)) return false;
      return !ph.resolveCircle(x, z, r).hit;
    },
    onWalk(x, z) { try { return !!game.world.onSidewalk(x, z); } catch { return true; } },

    // How spooked is an animal at (x, z)?  0 calm, 1 step aside, 2 bolt.  k scales the radii (warier animals > 1).
    threat(x, z, k = 1) {
      const f = this.focus, d = Math.hypot(x - f.x, z - f.z);
      let lv = 0;
      if (this.inCar) {
        if (this.speed > 1.5 && d < (5 + this.speed * 0.45) * k) lv = 2;
        else if (d < 3 * k) lv = 1;
      } else if (!game.player?.dead) {
        if (this.speed > 6.8 && d < 7 * k) lv = 2;
        else if (d < 1.3 * k) lv = this.speed > 0.6 ? 2 : 1;
        else if (d < 2.6 * k && this.speed > 0.6) lv = 1;
      }
      if (lv < 2) {
        const rp = game.net?.remotePlayers;
        if (rp && rp.size) for (const r of rp.values()) {
          const q = r.pos; if (!q) continue;
          const rd = Math.hypot(x - q.x, z - q.z);
          if (r.vehicle && rd < 8 * k) { lv = 2; break; }
          if (rd < 2 * k) lv = Math.max(lv, 1);
        }
      }
      return lv;
    },

    // Bezier flight path clearance against the city's visible geometry (world.camCast).
    segClear(ax, ay, az, bx, by, bz) {
      const w = game.world;
      if (!w?.camCast) return true;
      return w.camCast(ax, ay, az, bx, by, bz, 0.12) >= 0.999;
    },
  };
  return ctx;
}

// quadratic Bezier helpers (path: {ax,ay,az,cx,cy,cz,bx,by,bz})
export function bez(p, s, out) {
  const u = 1 - s, a = u * u, b = 2 * u * s, c = s * s;
  out.x = a * p.ax + b * p.cx + c * p.bx;
  out.y = a * p.ay + b * p.cy + c * p.by;
  out.z = a * p.az + b * p.cz + c * p.bz;
  return out;
}
export function bezD(p, s, out) {
  const u = 1 - s;
  out.x = 2 * u * (p.cx - p.ax) + 2 * s * (p.bx - p.cx);
  out.y = 2 * u * (p.cy - p.ay) + 2 * s * (p.by - p.cy);
  out.z = 2 * u * (p.cz - p.az) + 2 * s * (p.bz - p.cz);
  return out;
}

// Build a path from (ax,ay,az) to (bx,by,bz) whose top is `apex` above the higher end.
export function makePath(p, ax, ay, az, bx, by, bz, apex) {
  const top = Math.max(ay, by) + apex;
  p.ax = ax; p.ay = ay; p.az = az; p.bx = bx; p.by = by; p.bz = bz;
  p.cx = (ax + bx) / 2; p.cz = (az + bz) / 2; p.cy = 2 * top - (ay + by) / 2;
  p.s = 0;
  return p;
}

const _a = { x: 0, y: 0, z: 0 }, _b = { x: 0, y: 0, z: 0 };
export function pathClear(ctx, p, n = 8) {
  bez(p, 0, _a);
  _a.y += 0.25;
  for (let i = 1; i <= n; i++) {
    bez(p, i / n, _b);
    if (i === n) _b.y += 0.2; // don't count the perch / pavement we land on
    if (!ctx.segClear(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z)) return false;
    _a.x = _b.x; _a.y = _b.y; _a.z = _b.z;
  }
  return true;
}

// Paint a uniform vertex colour onto a geometry (for merged, vertex-coloured meshes).
export function colored(geo, c) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

export const rnd = (a, b) => a + Math.random() * (b - a);
export const angTo = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
