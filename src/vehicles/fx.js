import * as THREE from 'three';

// Cheap vehicle effects: one Points draw call per particle layer, one mesh for
// all skid marks, a pooled flash light (never added/removed, so no shader
// recompiles), and short-lived debris chunks.

const VERT = `
attribute float size;
attribute float alpha;
attribute vec3 tint;
varying float vAlpha;
varying vec3 vTint;
uniform float projScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * projScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
  vAlpha = alpha;
  vTint = tint;
}`;
const FRAG = `
varying float vAlpha;
varying vec3 vTint;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = vAlpha * smoothstep(0.5, 0.12, d);
  gl_FragColor = vec4(vTint, a);
}`;

export class Particles {
  constructor(scene, camera, max, additive) {
    this.max = max;
    this.camera = camera;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.tint = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { projScale: { value: 600 } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
    // particle state (struct of arrays)
    this.n = 0;
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vz = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, col0, col1 = col0, a0 = 1, grav = 0, drag = 0.5) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.grav[i] = grav; this.drag[i] = drag;
    this.c0[i * 3] = col0[0]; this.c0[i * 3 + 1] = col0[1]; this.c0[i * 3 + 2] = col0[2];
    this.c1[i * 3] = col1[0]; this.c1[i * 3 + 1] = col1[1]; this.c1[i * 3 + 2] = col1[2];
  }

  update(dt) {
    const cam = this.camera;
    this.mat.uniforms.projScale.value = innerHeight * 0.5 / Math.tan((cam.fov * Math.PI) / 360);
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        n--;
        if (i !== n) this._copy(n, i);
        i--;
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= k; this.vz[i] *= k; this.vy[i] = this.vy[i] * k - this.grav[i] * dt;
      this.pos[i * 3] += this.vx[i] * dt;
      this.pos[i * 3 + 1] = Math.max(0.02, this.pos[i * 3 + 1] + this.vy[i] * dt);
      this.pos[i * 3 + 2] += this.vz[i] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
      for (let c = 0; c < 3; c++) this.tint[i * 3 + c] = this.c0[i * 3 + c] + (this.c1[i * 3 + c] - this.c0[i * 3 + c]) * Math.min(1, t * 2);
    }
    this.n = n;
    const g = this.geo;
    g.setDrawRange(0, n);
    if (n > 0 || this._had) {
      g.attributes.position.needsUpdate = true;
      g.attributes.tint.needsUpdate = true;
      g.attributes.size.needsUpdate = true;
      g.attributes.alpha.needsUpdate = true;
    }
    this._had = n > 0;
  }

  _copy(from, to) {
    for (let c = 0; c < 3; c++) {
      this.pos[to * 3 + c] = this.pos[from * 3 + c];
      this.c0[to * 3 + c] = this.c0[from * 3 + c];
      this.c1[to * 3 + c] = this.c1[from * 3 + c];
      this.tint[to * 3 + c] = this.tint[from * 3 + c];
    }
    this.vx[to] = this.vx[from]; this.vy[to] = this.vy[from]; this.vz[to] = this.vz[from];
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from]; this.a0[to] = this.a0[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from];
    this.size[to] = this.size[from]; this.alpha[to] = this.alpha[from];
  }
}

// Ring buffer of dark quads laid on the asphalt.
export class SkidMarks {
  constructor(scene, max = 700) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      const v = i * 4;
      idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0x050404, transparent: true, opacity: 0.55, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.i = 0;
    this.count = 0;
  }

  // Add a segment from (x1,z1) to (x2,z2) of width w.
  add(x1, z1, x2, z2, w = 0.24) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.02 || len > 4) return;
    const nx = (-dz / len) * w * 0.5, nz = (dx / len) * w * 0.5;
    const y = 0.025;
    const o = this.i * 12;
    const p = this.pos;
    p[o] = x1 + nx; p[o + 1] = y; p[o + 2] = z1 + nz;
    p[o + 3] = x1 - nx; p[o + 4] = y; p[o + 5] = z1 - nz;
    p[o + 6] = x2 + nx; p[o + 7] = y; p[o + 8] = z2 + nz;
    p[o + 9] = x2 - nx; p[o + 10] = y; p[o + 11] = z2 - nz;
    this.i = (this.i + 1) % this.max;
    this.count = Math.min(this.max, this.count + 1);
    this.dirty = true;
  }

  update() {
    if (!this.dirty) return;
    this.dirty = false;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.setDrawRange(0, this.count * 6);
  }
}

// Everything visual a car can spew.
export class VehicleFX {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.smoke = new Particles(scene, game.camera, 700, false);
    this.fire = new Particles(scene, game.camera, 500, true);
    this.skids = new SkidMarks(scene);
    // A permanent light that only ever changes intensity (no recompiles).
    this.flash = new THREE.PointLight(0xffa040, 0, 40, 1.5);
    this.flash.position.set(0, -100, 0);
    scene.add(this.flash);
    this.flashT = 0;
    this.debris = [];
    this.debrisGeo = new THREE.BoxGeometry(1, 1, 1);
  }

  puff(x, y, z, dark = 0.3, big = 1) {
    const c = 0.12 + (1 - dark) * 0.35;
    this.smoke.spawn(x, y, z, (Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 1.2, (Math.random() - 0.5) * 0.8,
      1.6 + Math.random() * 1.2, 0.5 * big, 2.4 * big, [c, c * 0.97, c * 0.93], [c * 0.8, c * 0.8, c * 0.8], 0.55, -0.4, 0.6);
  }

  exhaust(x, y, z, vx, vz, junk) {
    const c = junk ? 0.32 : 0.45;
    this.smoke.spawn(x, y, z, vx + (Math.random() - 0.5) * 0.3, 0.3, vz + (Math.random() - 0.5) * 0.3,
      0.9, 0.15, junk ? 0.9 : 0.5, [c, c, c * 1.05], [c, c, c], junk ? 0.45 : 0.18, -0.2, 2);
  }

  flame(x, y, z, scale = 1) {
    this.fire.spawn(x + (Math.random() - 0.5) * 0.5 * scale, y, z + (Math.random() - 0.5) * 0.5 * scale,
      (Math.random() - 0.5) * 0.6, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 0.6,
      0.45 + Math.random() * 0.35, 0.9 * scale, 0.2 * scale, [1, 0.75, 0.25], [0.9, 0.2, 0.05], 0.9, -1, 1);
  }

  nitro(x, y, z, vx, vz) {
    this.fire.spawn(x, y, z, vx + (Math.random() - 0.5), (Math.random() - 0.5) * 0.4, vz + (Math.random() - 0.5),
      0.18, 0.55, 0.1, [0.5, 0.7, 1], [1, 0.5, 0.2], 1, 0, 3);
  }

  sparks(x, y, z, n = 8, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (2 + Math.random() * 5) * power;
      this.fire.spawn(x, y, z, Math.cos(a) * s, 1 + Math.random() * 4, Math.sin(a) * s,
        0.25 + Math.random() * 0.3, 0.18, 0.05, [1, 0.85, 0.5], [1, 0.4, 0.1], 1, 14, 1.5);
    }
  }

  tireSmoke(x, z, amount = 1) {
    const c = 0.55;
    this.smoke.spawn(x, 0.25, z, (Math.random() - 0.5) * 1.5, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 1.5,
      1.0 + Math.random() * 0.8, 0.6, 2.4 * amount, [c, c, c], [c * 0.9, c * 0.9, c * 0.9], 0.28 * amount, -0.3, 1.2);
  }

  explosion(x, z, materials = []) {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 9;
      this.fire.spawn(x, 0.8 + Math.random(), z, Math.cos(a) * s, 2 + Math.random() * 8, Math.sin(a) * s,
        0.5 + Math.random() * 0.6, 2.6, 0.6, [1, 0.85, 0.4], [0.8, 0.15, 0.03], 1, 3, 2.5);
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
      this.smoke.spawn(x, 1 + Math.random() * 2, z, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s,
        3 + Math.random() * 3, 2, 7, [0.12, 0.1, 0.09], [0.25, 0.24, 0.23], 0.8, -0.5, 0.8);
    }
    this.sparks(x, 1, z, 30, 2);
    this.flash.position.set(x, 3, z);
    this.flash.intensity = 120;
    this.flashT = 0.6;
    // Debris chunks.
    const scene = this.game.scene;
    for (let i = 0; i < 9; i++) {
      const mat = materials[i % Math.max(1, materials.length)] || new THREE.MeshStandardMaterial({ color: 0x222222 });
      const m = new THREE.Mesh(this.debrisGeo, mat);
      m.scale.set(0.2 + Math.random() * 0.6, 0.06 + Math.random() * 0.2, 0.2 + Math.random() * 0.7);
      m.position.set(x + (Math.random() - 0.5), 1 + Math.random(), z + (Math.random() - 0.5));
      m.castShadow = true;
      scene.add(m);
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 9;
      this.debris.push({ m, vx: Math.cos(a) * s, vy: 6 + Math.random() * 9, vz: Math.sin(a) * s,
        rx: (Math.random() - 0.5) * 12, rz: (Math.random() - 0.5) * 12, t: 14 + Math.random() * 6, rest: false });
    }
  }

  update(dt) {
    this.smoke.update(dt);
    this.fire.update(dt);
    this.skids.update();
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.intensity = Math.max(0, this.flashT / 0.6) * 120 * (0.8 + Math.random() * 0.4);
      if (this.flashT <= 0) { this.flash.intensity = 0; this.flash.position.set(0, -100, 0); }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t -= dt;
      if (d.t <= 0) { d.m.removeFromParent(); this.debris.splice(i, 1); continue; }
      if (d.rest) continue;
      d.vy -= 22 * dt;
      d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
      d.m.rotation.x += d.rx * dt; d.m.rotation.z += d.rz * dt;
      if (Math.random() < 0.3) this.smoke.spawn(d.m.position.x, d.m.position.y, d.m.position.z, 0, 0.5, 0, 0.8, 0.3, 1, [0.1, 0.1, 0.1], [0.2, 0.2, 0.2], 0.4, 0, 1);
      if (d.m.position.y < 0.08) {
        d.m.position.y = 0.08;
        if (Math.abs(d.vy) < 2.5) { d.rest = true; d.m.rotation.x = 0; d.m.rotation.z = 0; continue; }
        d.vy = -d.vy * 0.35; d.vx *= 0.6; d.vz *= 0.6; d.rx *= 0.5; d.rz *= 0.5;
      }
      const r = this.game.physics.resolveCircle(d.m.position.x, d.m.position.z, 0.2);
      if (r.hit) { d.vx *= -0.4; d.vz *= -0.4; d.m.position.x = r.x; d.m.position.z = r.z; }
    }
  }
}
