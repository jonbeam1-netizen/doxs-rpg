import * as THREE from 'three';

// Fast static-geometry accumulator. Every primitive is transformed by the
// current matrix and appended to a bucket keyed by (chunk, material). At the
// end each bucket becomes ONE mesh, so a whole 140m chunk of city costs a
// handful of draw calls. Much faster than building THREE geometries and
// merging them, and it keeps memory sane on a 1.4km map.

const colorCache = new Map();
const _c = new THREE.Color();
export function lin(hex) {
  if (Array.isArray(hex)) return hex;
  let c = colorCache.get(hex);
  if (!c) { _c.set(hex); c = [_c.r, _c.g, _c.b]; colorCache.set(hex, c); }
  return c;
}
export function mulCol(hex, f) { const c = lin(hex); return [c[0] * f, c[1] * f, c[2] * f]; }
export function mixCol(a, b, t) { const A = lin(a), B = lin(b); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; }
const WHITE = [1, 1, 1];

class Bucket {
  constructor(mat, chunk) {
    this.mat = mat; this.chunk = chunk;
    this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.vc = 0;
  }
}

class LineBucket {
  constructor(mat, chunk) { this.mat = mat; this.chunk = chunk; this.p = []; }
}

const _m = new THREE.Matrix4();

export class WorldGeo {
  constructor({ chunkSize = 140, min = -700, max = 700 } = {}) {
    this.cs = chunkSize; this.min = min;
    this.nc = Math.ceil((max - min) / chunkSize);
    this.buckets = new Map();
    this.lineBuckets = new Map();
    this.m = new THREE.Matrix4();
    this.e = this.m.elements;
    this.stack = [];
    this.chunkAt = null; // forced chunk index for the current object
    this.minY = Infinity; // lowest vertex emitted since the last reset (world audit)
  }

  chunkOf(x, z) {
    const n = this.nc;
    const cx = Math.max(0, Math.min(n - 1, Math.floor((x - this.min) / this.cs)));
    const cz = Math.max(0, Math.min(n - 1, Math.floor((z - this.min) / this.cs)));
    return cz * n + cx;
  }

  // ---- transform stack ----
  push() { this.stack.push(this.m.clone()); return this; }
  pop() { this.m.copy(this.stack.pop()); return this; }
  reset() { this.m.identity(); this.stack.length = 0; this.chunkAt = null; return this; }
  identity() { this.m.identity(); return this; }
  translate(x, y, z) { this.m.multiply(_m.makeTranslation(x, y, z)); return this; }
  rotY(a) { if (a) this.m.multiply(_m.makeRotationY(a)); return this; }
  rotX(a) { if (a) this.m.multiply(_m.makeRotationX(a)); return this; }
  rotZ(a) { if (a) this.m.multiply(_m.makeRotationZ(a)); return this; }
  scale(x, y, z) { this.m.multiply(_m.makeScale(x, y, z)); return this; }
  // World frame: origin at (x, y, z), local +Z rotated to heading `rot`.
  frame(x, z, rot = 0, y = 0) { this.m.makeRotationY(rot); this.m.setPosition(x, y, z); return this; }
  // Lock everything emitted until unlock() into the chunk containing (x,z).
  lock(x, z) { this.chunkAt = this.chunkOf(x, z); return this; }
  unlock() { this.chunkAt = null; return this; }

  _bucket(mat, wx, wz) {
    const ch = this.chunkAt ?? this.chunkOf(wx, wz);
    const key = ch + '|' + mat;
    let b = this.buckets.get(key);
    if (!b) { b = new Bucket(mat, ch); this.buckets.set(key, b); }
    return b;
  }

  // ---- low level ----
  // Append one quad (4 local points, CCW seen from the front).
  // uvs: [u0,v0,u1,v1,u2,v2,u3,v3] or 'world' (planar XZ world UV, needs o.uvScale)
  quad(mat, a, b, c, d, uvs, color = WHITE, o = null) {
    const e = this.e;
    const P = [a, b, c, d];
    const W = new Array(12);
    for (let k = 0; k < 4; k++) {
      const p = P[k];
      W[k * 3] = e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12];
      W[k * 3 + 1] = e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13];
      W[k * 3 + 2] = e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14];
    }
    const my = Math.min(W[1], W[4], W[7], W[10]);
    if (my < this.minY) this.minY = my;
    // normal from world positions
    const ux = W[3] - W[0], uy = W[4] - W[1], uz = W[5] - W[2];
    const vx = W[6] - W[0], vy = W[7] - W[1], vz = W[8] - W[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const bk = this._bucket(mat, (W[0] + W[6]) / 2, (W[2] + W[8]) / 2);
    const col = o?.colors ? WHITE : lin(color ?? WHITE);
    const base = bk.vc;
    for (let k = 0; k < 4; k++) {
      bk.p.push(W[k * 3], W[k * 3 + 1], W[k * 3 + 2]);
      bk.n.push(nx, ny, nz);
      if (uvs === 'world') {
        const s = o?.uvScale ?? 4;
        bk.uv.push(W[k * 3] / s + (o?.uvOff?.[0] ?? 0), -W[k * 3 + 2] / s + (o?.uvOff?.[1] ?? 0));
      } else bk.uv.push(uvs ? uvs[k * 2] : 0, uvs ? uvs[k * 2 + 1] : 0);
      if (o?.colors) { const cc = o.colors[k]; bk.c.push(cc[0], cc[1], cc[2]); } else bk.c.push(col[0], col[1], col[2]);
    }
    bk.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    bk.vc += 4;
  }

  tri(mat, a, b, c, uvs, color = WHITE) {
    this.quad(mat, a, b, c, c, uvs ? [uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5], uvs[4], uvs[5]] : null, color);
  }

  // ---- primitives ----
  // Axis-aligned (in local space) box centered at (x, y, z).
  // o: { color, faces: 'all'|'sides'|'top'|'nobottom'|string of letters (f b l r t u),
  //      uv: 'face'|'world', uvScale: n | [su, sv], uvOff: [u, v], topColor, uvRect:[u0,v0,u1,v1] }
  box(mat, x, y, z, w, h, d, o = {}) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const x0 = x - hw, x1 = x + hw, y0 = y - hh, y1 = y + hh, z0 = z - hd, z1 = z + hd;
    const faces = o.faces ?? 'nobottom';
    const F = faces === 'all' ? 'fbrltu' : faces === 'nobottom' ? 'fbrlt' : faces === 'sides' ? 'fbrl' : faces === 'top' ? 't' : faces;
    const has = (k) => F.includes(k);
    const color = o.color ?? WHITE;
    const sc = o.uvScale ?? 1;
    const su = Array.isArray(sc) ? sc[0] : sc, sv = Array.isArray(sc) ? sc[1] : sc;
    const ou = o.uvOff?.[0] ?? 0, ov = o.uvOff?.[1] ?? 0;
    const vb = y0 / sv + ov, vt = y1 / sv + ov;
    const R = o.uvRect;
    const fuv = (ua, ub) => R ? [R[0], R[1], R[2], R[1], R[2], R[3], R[0], R[3]] : [ua, vb, ub, vb, ub, vt, ua, vt];
    let u = ou;
    // front (+z)
    if (has('f')) this.quad(mat, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], fuv(u, u + w / su), color);
    u += w / su;
    if (has('r')) this.quad(mat, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], fuv(u, u + d / su), color);
    u += d / su;
    if (has('b')) this.quad(mat, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], fuv(u, u + w / su), color);
    u += w / su;
    if (has('l')) this.quad(mat, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], fuv(u, u + d / su), color);
    if (has('t')) {
      const tm = o.topMat ?? mat;
      const tsc = o.topScale ?? su;
      const uv = o.uv === 'world' ? 'world' : [x0 / tsc, -z1 / tsc, x1 / tsc, -z1 / tsc, x1 / tsc, -z0 / tsc, x0 / tsc, -z0 / tsc];
      this.quad(tm, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], uv, o.topColor ?? color, { uvScale: tsc });
    }
    if (has('u')) this.quad(mat, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, 0, 1, 0, 1, 1, 0, 1], color);
  }

  // Horizontal rectangle (local), facing up.
  plane(mat, x0, z0, x1, z1, y, o = {}) {
    const uv = o.uv === 'world' ? 'world' : (o.uvRect ? [o.uvRect[0], o.uvRect[1], o.uvRect[2], o.uvRect[1], o.uvRect[2], o.uvRect[3], o.uvRect[0], o.uvRect[3]] : [0, 0, 1, 0, 1, 1, 0, 1]);
    this.quad(mat, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], uv, o.color ?? WHITE, o);
  }

  // Vertical rectangle in local XY plane at z, facing +Z.
  wall(mat, x0, y0, x1, y1, z, o = {}) {
    const R = o.uvRect ?? [0, 0, 1, 1];
    this.quad(mat, [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [R[0], R[1], R[2], R[1], R[2], R[3], R[0], R[3]], o.color ?? WHITE);
    if (o.double) this.quad(mat, [x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], [R[2], R[1], R[0], R[1], R[0], R[3], R[2], R[3]], o.color ?? WHITE);
  }

  // Strip from (ax,az) to (bx,bz) of width w at height y (local), facing up.
  strip(mat, ax, az, bx, bz, w, y, o = {}) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const px = (-dz / L) * w / 2, pz = (dx / L) * w / 2;
    const Lr = L / (o.uvLen ?? L);
    const uv = o.uv === 'world' ? 'world' : [0, 0, 0, Lr, 1, Lr, 1, 0];
    // a: left-start, b: right-start (CCW from above means: start-right, end-right, end-left, start-left)
    this.quad(mat, [ax + px, y, az + pz], [bx + px, y, bz + pz], [bx - px, y, bz - pz], [ax - px, y, az - pz], o.uvFn ? o.uvFn(L) : uv, o.color ?? WHITE, o);
  }

  // Cylinder / cone frustum. Caps optional.
  cyl(mat, x, y, z, rTop, rBot, h, seg = 8, o = {}) {
    const color = o.color ?? WHITE;
    const y0 = y - h / 2, y1 = y + h / 2;
    const su = o.uvScale ?? 1;
    const circ = 2 * Math.PI * Math.max(rTop, rBot);
    const a0 = o.arc0 ?? 0, arc = o.arc ?? Math.PI * 2;
    for (let i = 0; i < seg; i++) {
      const t0 = a0 + (i / seg) * arc, t1 = a0 + ((i + 1) / seg) * arc;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      const u0 = (i / seg) * circ / su, u1 = ((i + 1) / seg) * circ / su;
      this.quad(mat,
        [x + s0 * rBot, y0, z + c0 * rBot], [x + s1 * rBot, y0, z + c1 * rBot],
        [x + s1 * rTop, y1, z + c1 * rTop], [x + s0 * rTop, y1, z + c0 * rTop],
        o.vflip ? [u0, 1 - y0 / su, u1, 1 - y0 / su, u1, 1 - y1 / su, u0, 1 - y1 / su] : [u0, y0 / su, u1, y0 / su, u1, y1 / su, u0, y1 / su], color);
      if (o.capTop !== false && rTop > 0.001) this.quad(mat, [x, y1, z], [x + s0 * rTop, y1, z + c0 * rTop], [x + s1 * rTop, y1, z + c1 * rTop], [x + s1 * rTop, y1, z + c1 * rTop], [0.5, 0.5, 0.5 + s0 * 0.5, 0.5 + c0 * 0.5, 0.5 + s1 * 0.5, 0.5 + c1 * 0.5, 0.5 + s1 * 0.5, 0.5 + c1 * 0.5], o.capColor ?? color);
      if (o.capBottom) this.quad(mat, [x, y0, z], [x + s1 * rBot, y0, z + c1 * rBot], [x + s0 * rBot, y0, z + c0 * rBot], [x + s0 * rBot, y0, z + c0 * rBot], [0.5, 0.5, 0, 0, 1, 0, 1, 0], color);
    }
  }

  // Flat horizontal disc (fan of quads), facing up.
  disc(mat, x, y, z, r, seg = 8, o = {}) {
    const color = o.color ?? WHITE;
    const P = (i) => { const a = (i / seg) * Math.PI * 2; return [x + Math.sin(a) * r, y, z + Math.cos(a) * r]; };
    const U = (i) => { const a = (i / seg) * Math.PI * 2; return [0.5 + Math.sin(a) * 0.5, 0.5 + Math.cos(a) * 0.5]; };
    for (let i = 0; i < seg; i += 2) {
      const a = P(i), b = P(i + 1), c = P(i + 2), ua = U(i), ub = U(i + 1), uc = U(i + 2);
      this.quad(mat, [x, y, z], a, b, c, o.uv === 'world' ? 'world' : [0.5, 0.5, ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]], color, o);
    }
  }

  // Low-poly (half) sphere.
  sphere(mat, x, y, z, r, wseg = 10, hseg = 6, o = {}) {
    const color = o.color ?? WHITE;
    const th = o.half ? Math.PI / 2 : Math.PI;
    const sy = o.sy ?? 1;
    for (let j = 0; j < hseg; j++) {
      const p0 = (j / hseg) * th, p1 = ((j + 1) / hseg) * th;
      for (let i = 0; i < wseg; i++) {
        const t0 = (i / wseg) * Math.PI * 2, t1 = ((i + 1) / wseg) * Math.PI * 2;
        const pt = (p, t) => [x + r * Math.sin(p) * Math.sin(t), y + r * Math.cos(p) * sy, z + r * Math.sin(p) * Math.cos(t)];
        this.quad(mat, pt(p1, t0), pt(p1, t1), pt(p0, t1), pt(p0, t0), [i / wseg, 1 - (j + 1) / hseg, (i + 1) / wseg, 1 - (j + 1) / hseg, (i + 1) / wseg, 1 - j / hseg, i / wseg, 1 - j / hseg], color);
      }
    }
  }

  // Gable roof prism: ridge along local X, eaves at y, ridge at y + h.
  gable(mat, x, y, z, w, h, d, o = {}) {
    const color = o.color ?? WHITE;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, yr = y + h;
    const su = o.uvScale ?? 3;
    const sl = Math.hypot(h, d / 2);
    this.quad(mat, [x0, y, z1], [x1, y, z1], [x1, yr, z], [x0, yr, z], [0, 0, w / su, 0, w / su, sl / su, 0, sl / su], color);
    this.quad(mat, [x1, y, z0], [x0, y, z0], [x0, yr, z], [x1, yr, z], [0, 0, w / su, 0, w / su, sl / su, 0, sl / su], color);
    const em = o.endMat ?? mat, ec = o.endColor ?? color;
    this.tri(em, [x1, y, z1], [x1, y, z0], [x1, yr, z], [0, 0, d / su, 0, d / (2 * su), h / su], ec);
    this.tri(em, [x0, y, z0], [x0, y, z1], [x0, yr, z], [0, 0, d / su, 0, d / (2 * su), h / su], ec);
  }

  // Append an arbitrary THREE.BufferGeometry (transformed by the current matrix).
  geom(mat, g, o = {}) {
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const e = this.e;
    const color = lin(o.color ?? WHITE);
    const cx = e[12], cz = e[14];
    const bk = this._bucket(mat, cx, cz);
    const base = bk.vc;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      bk.p.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      if (nor) {
        const a = nor.getX(i), b = nor.getY(i), c = nor.getZ(i);
        let nx = e[0] * a + e[4] * b + e[8] * c, ny = e[1] * a + e[5] * b + e[9] * c, nz = e[2] * a + e[6] * b + e[10] * c;
        const l = Math.hypot(nx, ny, nz) || 1;
        bk.n.push(nx / l, ny / l, nz / l);
      } else bk.n.push(0, 1, 0);
      if (uv) bk.uv.push(uv.getX(i) * (o.uvScale ?? 1), uv.getY(i) * (o.uvScale ?? 1)); else bk.uv.push(0, 0);
      bk.c.push(color[0], color[1], color[2]);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) bk.i.push(base + g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) bk.i.push(base + i);
    bk.vc += pos.count;
  }

  // Line segments (wires). Points in local space.
  line(mat, a, b) {
    const e = this.e;
    const tf = (p) => [e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12], e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13], e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14]];
    const A = tf(a), B = tf(b);
    const ch = this.chunkAt ?? this.chunkOf(A[0], A[2]);
    const key = ch + '|' + mat;
    let lb = this.lineBuckets.get(key);
    if (!lb) { lb = new LineBucket(mat, ch); this.lineBuckets.set(key, lb); }
    lb.p.push(A[0], A[1], A[2], B[0], B[1], B[2]);
  }

  // Build meshes. mats: registry { key: { mat, cast, recv, detail, order } }
  finalize(mats) {
    const n = this.nc;
    const chunks = [];
    for (let i = 0; i < n * n; i++) {
      const g = new THREE.Group();
      g.name = 'chunk' + i;
      const cx = i % n, cz = Math.floor(i / n);
      g.userData = { cx: this.min + (cx + 0.5) * this.cs, cz: this.min + (cz + 0.5) * this.cs, detail: [] };
      chunks.push(g);
    }
    let verts = 0;
    for (const b of this.buckets.values()) {
      const def = mats[b.mat];
      if (!def) { console.warn('[world] missing material', b.mat); continue; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      g.setIndex(b.vc > 65535 ? new THREE.Uint32BufferAttribute(b.i, 1) : new THREE.Uint16BufferAttribute(b.i, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, def.mat);
      mesh.castShadow = !!def.cast;
      mesh.receiveShadow = def.recv !== false;
      mesh.matrixAutoUpdate = false;
      if (def.order != null) mesh.renderOrder = def.order;
      mesh.userData.matKey = b.mat;
      chunks[b.chunk].add(mesh);
      if (def.detail) chunks[b.chunk].userData.detail.push(mesh);
      verts += b.vc;
    }
    for (const b of this.lineBuckets.values()) {
      const def = mats[b.mat];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      g.computeBoundingSphere();
      const ls = new THREE.LineSegments(g, def.mat);
      ls.matrixAutoUpdate = false;
      chunks[b.chunk].add(ls);
      chunks[b.chunk].userData.detail.push(ls);
    }
    this.buckets.clear();
    this.lineBuckets.clear();
    for (const c of chunks) {
      // bounding box of the whole chunk for distance culling
      const box = new THREE.Box3();
      c.children.forEach((m) => { m.geometry.computeBoundingBox?.(); if (m.geometry.boundingBox) box.union(m.geometry.boundingBox); });
      c.userData.box = box;
    }
    return { chunks: chunks.filter((c) => c.children.length), verts };
  }
}
