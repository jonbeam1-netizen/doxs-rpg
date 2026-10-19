// 2D (XZ-plane) collision against axis-aligned boxes, with a spatial hash.
// The whole city is flat (ground at y = 0), so this is all we need for
// walking, driving, bullets and camera occlusion.
export class Physics {
  constructor(cell = 24) {
    this.cell = cell;
    this.grid = new Map();
    this.boxes = new Set();
    this.bounds = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };
  }

  setBounds(minX, minZ, maxX, maxZ) { this.bounds = { minX, minZ, maxX, maxZ }; }

  // opts: { height, tag, data }
  addBox(minX, minZ, maxX, maxZ, opts = {}) {
    const b = { minX, minZ, maxX, maxZ, height: opts.height ?? 12, tag: opts.tag ?? 'solid', data: opts.data ?? null, cells: [] };
    this._eachCell(b, (key) => {
      let arr = this.grid.get(key);
      if (!arr) this.grid.set(key, (arr = []));
      arr.push(b);
      b.cells.push(key);
    });
    this.boxes.add(b);
    return b;
  }

  // Convenience: centered box.
  addRect(cx, cz, w, d, opts) { return this.addBox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, opts); }

  removeBox(b) {
    if (!this.boxes.delete(b)) return;
    for (const key of b.cells) {
      const arr = this.grid.get(key);
      if (!arr) continue;
      const i = arr.indexOf(b);
      if (i >= 0) arr.splice(i, 1);
    }
    b.cells = [];
  }

  _eachCell(b, fn) {
    const c = this.cell;
    const x0 = Math.floor(b.minX / c), x1 = Math.floor(b.maxX / c);
    const z0 = Math.floor(b.minZ / c), z1 = Math.floor(b.maxZ / c);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) fn(x + ',' + z);
  }

  query(minX, minZ, maxX, maxZ) {
    const out = new Set();
    this._eachCell({ minX, minZ, maxX, maxZ }, (key) => {
      const arr = this.grid.get(key);
      if (arr) for (const b of arr) {
        if (b.maxX >= minX && b.minX <= maxX && b.maxZ >= minZ && b.minZ <= maxZ) out.add(b);
      }
    });
    return out;
  }

  pointBlocked(x, z, minHeight = 0) {
    const arr = this.grid.get(Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell));
    if (!arr) return null;
    for (const b of arr) {
      if (b.height >= minHeight && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return b;
    }
    return null;
  }

  // Push a circle out of every box it overlaps. Returns { x, z, hit, box }.
  resolveCircle(x, z, r, filter = null) {
    let hit = false, hitBox = null;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.query(x - r, z - r, x + r, z + r)) {
        if (filter && !filter(b)) continue;
        const cx = Math.max(b.minX, Math.min(x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
        let dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true; hitBox = b; moved = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // Center is inside the box: push out along the shallowest axis.
          const pl = x - b.minX, pr = b.maxX - x, pt = z - b.minZ, pb = b.maxZ - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = b.minX - r; else if (m === pr) x = b.maxX + r;
          else if (m === pt) z = b.minZ - r; else z = b.maxZ + r;
        }
      }
      if (!moved) break;
    }
    const B = this.bounds;
    x = Math.max(B.minX + r, Math.min(B.maxX - r, x));
    z = Math.max(B.minZ + r, Math.min(B.maxZ - r, z));
    return { x, z, hit, box: hitBox };
  }

  // March along a segment; returns fraction [0..1] of the first blocked point, or 1 if clear.
  raycast(x1, z1, x2, z2, step = 0.5, minHeight = 0) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (this.pointBlocked(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, minHeight)) return (i - 1) / n;
    }
    return 1;
  }
}
