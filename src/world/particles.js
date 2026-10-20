import * as THREE from 'three';
import { puffCanvas, toTex } from './textures.js';

// CPU puff particles (steam from manholes, smoke from barrels, smokestack
// plumes). One Points draw call; only emitters near the camera are live.

const TYPES = {
  steam: { rate: 6, life: 3.0, rise: 1.4, size: [0.7, 3.4], col: [0.55, 0.55, 0.53], alpha: 0.2, range: 110, spread: 0.5 },
  smoke: { rate: 3, life: 4, rise: 1.6, size: [0.8, 3.6], col: [0.12, 0.11, 0.1], alpha: 0.55, range: 120, spread: 0.2 },
  stack: { rate: 2.6, life: 12, rise: 3.2, size: [5, 20], col: [0.1, 0.09, 0.075], alpha: 0.85, range: 520, spread: 1.2 },
};

export class Particles {
  constructor(scene, emitters, max = 700) {
    this.emitters = emitters;
    for (const e of emitters) e.acc = Math.random();
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: toTex(puffCanvas(), { repeat: false }) }, uScale: { value: 500 }, uFogCol: { value: new THREE.Color() }, uFogNear: { value: 50 }, uFogFar: { value: 500 }, uLight: { value: 1 } },
      vertexShader: `attribute float aSize, aAlpha; attribute vec3 aCol; uniform float uScale; varying float vA, vD; varying vec3 vC;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(aSize * uScale / -mv.z, uScale * 0.45); vA = aAlpha * smoothstep(1.2, 5.0, -mv.z); vC = aCol; vD = -mv.z; }`,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uFogCol; uniform float uFogNear, uFogFar, uLight; varying float vA, vD; varying vec3 vC;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard;
          vec3 c = mix(vC * uLight, uFogCol, 0.3); float f = smoothstep(uFogNear, uFogFar, vD); c = mix(c, uFogCol, f);
          gl_FragColor = vec4(c, a * (1.0 - f * 0.6)); }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.parts = [];
    this.free = [];
    for (let i = max - 1; i >= 0; i--) this.free.push(i);
    this.active = [];
    this.scanT = 0;
    this.wind = new THREE.Vector2(0.8, 0.3);
  }

  update(dt, cam, scene, light = 1) {
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.5;
      this.active = this.emitters.filter((e) => Math.hypot(e.x - cam.x, e.z - cam.z) < TYPES[e.type].range).slice(0, 60);
    }
    for (const e of this.active) {
      const T = TYPES[e.type];
      e.acc += dt * T.rate;
      while (e.acc > 1) {
        e.acc -= 1;
        const i = this.free.pop();
        if (i == null) break;
        this.parts.push({ i, x: e.x + (Math.random() - 0.5) * T.spread, y: e.y, z: e.z + (Math.random() - 0.5) * T.spread, age: 0, T, vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3, r: Math.random() });
      }
    }
    const P = this.pos, S = this.size, A = this.alpha, Cc = this.col;
    for (let k = this.parts.length - 1; k >= 0; k--) {
      const p = this.parts[k];
      p.age += dt;
      const T = p.T, u = p.age / T.life;
      if (u >= 1) { A[p.i] = 0; this.free.push(p.i); this.parts[k] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      p.y += T.rise * dt * (1 - u * 0.5);
      p.x += (p.vx + this.wind.x * u) * dt; p.z += (p.vz + this.wind.y * u) * dt;
      P[p.i * 3] = p.x; P[p.i * 3 + 1] = p.y; P[p.i * 3 + 2] = p.z;
      S[p.i] = T.size[0] + (T.size[1] - T.size[0]) * u;
      A[p.i] = T.alpha * Math.sin(u * Math.PI) * (0.7 + p.r * 0.3);
      Cc[p.i * 3] = T.col[0]; Cc[p.i * 3 + 1] = T.col[1]; Cc[p.i * 3 + 2] = T.col[2];
    }
    const g = this.geo;
    g.attributes.position.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; g.attributes.aCol.needsUpdate = true;
    const u = this.mat.uniforms;
    if (scene.fog) { u.uFogCol.value.copy(scene.fog.color); u.uFogNear.value = scene.fog.near; u.uFogFar.value = scene.fog.far * 1.3; }
    u.uLight.value = light;
  }

  setScale(h, fov = 62) { this.mat.uniforms.uScale.value = h / (2 * Math.tan((fov * Math.PI) / 360)); }
}
