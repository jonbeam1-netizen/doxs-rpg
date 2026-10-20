// Camera-only collision against the city's visible geometry.
//
// Every solid-looking primitive the world emits (geo.js _camBox) becomes an
// oriented box. The third-person camera:
//   - sweeps a small sphere from the look point to its wanted position and stops
//     in front of the first "bulky" box (walls, crane legs, billboards, roofs),
//   - is nudged sideways out of "thin" boxes (poles, posts, braces, sign boards)
//     instead of being yanked in front of them, which keeps it steady when a
//     lamp post slides between it and the player.
// Pure math over a spatial hash; no meshes are touched.

const STRIDE = 15;
const THIN = 0.36; // a box is thin when its two smallest half extents are below this

export class CamColliders {
  constructor(list, cell = 8) {
    this.a = Float32Array.from(list);
    this.n = (this.a.length / STRIDE) | 0;
    this.cell = cell;
    this.grid = new Map();
    this.thin = new Uint8Array(this.n);
    this.stamp = new Uint32Array(this.n);
    this.tick = 1;
    const a = this.a;
    for (let i = 0; i < this.n; i++) {
      const o = i * STRIDE;
      const h = [a[o + 6], a[o + 10], a[o + 14]].sort((p, q) => p - q);
      this.thin[i] = h[0] < THIN && h[1] < THIN ? 1 : 0;
      // world AABB (xz) of the oriented box
      let ex = 0, ez = 0;
      for (let k = 0; k < 3; k++) { const b = o + 3 + k * 4; ex += Math.abs(a[b] * a[b + 3]); ez += Math.abs(a[b + 2] * a[b + 3]); }
      const x0 = Math.floor((a[o] - ex) / cell), x1 = Math.floor((a[o] + ex) / cell);
      const z0 = Math.floor((a[o + 2] - ez) / cell), z1 = Math.floor((a[o + 2] + ez) / cell);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) continue; // absurdly large (sea, terrain): never a camera blocker
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
        const key = gx * 73856093 ^ gz * 19349663;
        let arr = this.grid.get(key);
        if (!arr) this.grid.set(key, (arr = []));
        arr.push(i);
      }
    }
    this._cand = [];
  }

  // Unique box indices whose cells touch the segment's xz bounding box (padded by r).
  _gather(ax, az, bx, bz, r) {
    const c = this.cell, out = this._cand; out.length = 0;
    const t = ++this.tick;
    const x0 = Math.floor((Math.min(ax, bx) - r) / c), x1 = Math.floor((Math.max(ax, bx) + r) / c);
    const z0 = Math.floor((Math.min(az, bz) - r) / c), z1 = Math.floor((Math.max(az, bz) + r) / c);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const arr = this.grid.get(gx * 73856093 ^ gz * 19349663);
      if (!arr) continue;
      for (let k = 0; k < arr.length; k++) { const i = arr[k]; if (this.stamp[i] !== t) { this.stamp[i] = t; out.push(i); } }
    }
    return out;
  }

  // Fraction [0..1] along A->B where a sphere of radius r first touches a bulky box.
  // Boxes that already contain A (the player is inside/against them) are ignored.
  cast(ax, ay, az, bx, by, bz, r = 0.25) {
    const a = this.a;
    let best = 1;
    const cand = this._gather(ax, az, bx, bz, r + 1);
    for (let n = 0; n < cand.length; n++) {
      const i = cand[n];
      if (this.thin[i]) continue;
      const o = i * STRIDE;
      const px = ax - a[o], py = ay - a[o + 1], pz = az - a[o + 2];
      const qx = bx - a[o], qy = by - a[o + 1], qz = bz - a[o + 2];
      let t0 = 0, t1 = best, inside = true, miss = false;
      for (let k = 0; k < 3; k++) {
        const b = o + 3 + k * 4;
        const ux = a[b], uy = a[b + 1], uz = a[b + 2], e = a[b + 3] + r;
        const s = px * ux + py * uy + pz * uz;
        const f = qx * ux + qy * uy + qz * uz;
        if (s < -e || s > e) inside = false;
        const d = f - s;
        if (Math.abs(d) < 1e-9) { if (s < -e || s > e) { miss = true; break; } continue; }
        let ta = (-e - s) / d, tb = (e - s) / d;
        if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { miss = true; break; }
      }
      if (inside || miss) continue;
      if (t0 < best) best = t0;
    }
    return best;
  }

  // Debug: how many boxes contain the point (inflated by r)?
  inside(x, y, z, r = 0) {
    const a = this.a; let c = 0;
    for (const i of this._gather(x, z, x, z, r + 1)) {
      const o = i * STRIDE; let ins = true;
      for (let k = 0; k < 3 && ins; k++) { const b = o + 3 + k * 4; const s = (x - a[o]) * a[b] + (y - a[o + 1]) * a[b + 1] + (z - a[o + 2]) * a[b + 2]; if (Math.abs(s) > a[b + 3] + r) ins = false; }
      if (ins) c++;
    }
    return c;
  }

  // Push point P out of any thin box it sits in (along the box's thin axes). Returns the
  // moved point in `out` ([x, y, z]); true if it moved.
  pushOut(x, y, z, r, out) {
    const a = this.a;
    let moved = false;
    const cand = this._gather(x, z, x, z, r + 1);
    for (let pass = 0; pass < 2; pass++) {
      for (let n = 0; n < cand.length; n++) {
        const i = cand[n];
        if (!this.thin[i]) continue;
        const o = i * STRIDE;
        const px = x - a[o], py = y - a[o + 1], pz = z - a[o + 2];
        let bestK = -1, bestPen = Infinity, bestS = 0, inside = true;
        for (let k = 0; k < 3; k++) {
          const b = o + 3 + k * 4;
          const s = px * a[b] + py * a[b + 1] + pz * a[b + 2], e = a[b + 3] + r;
          if (s <= -e || s >= e) { inside = false; break; }
          // only push along mostly-horizontal thin axes (never shove the camera into the floor)
          if (a[b + 3] < THIN && Math.abs(a[b + 1]) < 0.8) { const pen = e - Math.abs(s); if (pen < bestPen) { bestPen = pen; bestK = k; bestS = s; } }
        }
        if (!inside || bestK < 0) continue;
        const b = o + 3 + bestK * 4, sg = bestS >= 0 ? 1 : -1, m = bestPen + 0.01;
        x += a[b] * sg * m; y += a[b + 1] * sg * m; z += a[b + 2] * sg * m;
        moved = true;
      }
      if (!moved) break;
    }
    out[0] = x; out[1] = y; out[2] = z;
    return moved;
  }
}
