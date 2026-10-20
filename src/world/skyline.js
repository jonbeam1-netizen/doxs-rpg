import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';

// Distant skylines beyond the map edges: a dead neighbouring city past Route 9 (west, where the sun sets)
// and the towers across the bay (east, where it rises). Flat silhouettes that melt into the horizon haze,
// with a sparse scatter of lit windows and slow red aircraft beacons at night. One mesh + one Points draw;
// no colliders, no shadows. Colours come from the atmosphere every frame.

const CLUSTERS = [
  { x0: -2160, x1: -1760, z0: -640, z1: 560, n: 34, hMin: 70, hMax: 250, seed: 0x5ca1 },   // west, past Route 9
  { x0: 1720, x1: 2120, z0: -700, z1: 700, n: 38, hMin: 50, hMax: 230, seed: 0xba7e },      // east, across the bay
];

function addBox(P, N, x0, x1, z0, z1, y0, y1) {
  const quad = (a, b, c, d, n) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) N.push(...n); };
  quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
  quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
  quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
  quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
}

export function buildSkyline(scene) {
  const P = [], N = [], tops = [];
  for (const C of CLUSTERS) {
    const r = mulberry32(C.seed);
    const cz = (C.z0 + C.z1) / 2, hz = (C.z1 - C.z0) / 2;
    for (let i = 0; i < C.n; i++) {
      // denser and taller toward the middle of the cluster
      const u = (r() + r() + r()) / 3 * 2 - 1;
      const z = cz + u * hz, x = C.x0 + r() * (C.x1 - C.x0);
      const core = 1 - Math.abs(u);
      const h = C.hMin + (C.hMax - C.hMin) * Math.pow(r(), 1.6) * (0.45 + core * 0.55);
      const w = 22 + r() * 34, d = 22 + r() * 34;
      const y0 = -40;
      addBox(P, N, x - w / 2, x + w / 2, z - d / 2, z + d / 2, y0, h);
      let top = h;
      if (r() < 0.45) { // setback crown
        const s = 0.5 + r() * 0.25, h2 = h + 12 + r() * h * 0.3;
        addBox(P, N, x - w * s / 2, x + w * s / 2, z - d * s / 2, z + d * s / 2, h - 1, h2);
        top = h2;
      }
      if (r() < 0.18 && top > 140) { // stubby mast, wide enough not to shimmer at this distance
        addBox(P, N, x - 4, x + 4, z - 4, z + 4, top - 1, top + 26);
        top += 26;
      }
      tops.push([x, top + 2, z]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  const uniforms = {
    uSil: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uCam: { value: new THREE.Vector3() }, uVis: { value: 1 }, uLit: { value: 0 }, uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uSil, uHor, uGlow, uCam; uniform float uVis, uLit; varying vec3 vW; varying vec3 vN;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        float dist = length(vW.xz - uCam.xz);
        vec3 col = uSil * (0.9 + 0.08 * vN.x + 0.05 * vN.z + 0.1 * vN.y);
        // sparse lit windows (big cells: a few pixels at this range, no shimmering grid)
        float along = abs(vN.x) > 0.5 ? vW.z : vW.x;
        vec2 cell = floor(vec2(along / 9.0, vW.y / 7.0));
        // (only from far away: up close the cells would read as big floating blocks)
        float lit = step(0.9, hh(cell + vN.xz * 17.0)) * step(0.0, vW.y) * (1.0 - vN.y) * smoothstep(1000.0, 1400.0, dist);
        col += vec3(1.0, 0.7, 0.36) * lit * uLit * 0.1;
        col += uGlow * (1.0 - smoothstep(-30.0, 120.0, vW.y));
        // aerial haze: the lower floors melt into the horizon, everything fades out before the far plane
        float hz = 1.0 - uVis * (0.5 + 0.5 * smoothstep(-20.0, 220.0, vW.y));
        hz = max(hz, smoothstep(1900.0, 2420.0, dist));
        col = mix(col, uHor, clamp(hz, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'skyline';
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = -50;
  scene.add(mesh);

  // aircraft-warning beacons on the tallest towers of each cluster
  tops.sort((a, b) => b[1] - a[1]);
  const bt = tops.slice(0, 9);
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bt.flat(), 3));
  bg.setAttribute('aPh', new THREE.Float32BufferAttribute(bt.map((_, i) => i * 0.37), 1));
  const bu = { uOn: { value: 0 }, uTime: { value: 0 }, uCam: uniforms.uCam };
  const bmat = new THREE.ShaderMaterial({
    uniforms: bu,
    vertexShader: `attribute float aPh; uniform float uOn, uTime; uniform vec3 uCam; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 3.0;
        float blink = smoothstep(0.55, 0.8, sin(uTime * 1.6 + aPh * 6.283) * 0.5 + 0.5);
        vA = uOn * blink * (1.0 - smoothstep(1900.0, 2400.0, length(position.xz - uCam.xz))); }`,
    fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float f = 1.0 - smoothstep(0.2, 0.5, length(c)); if (f * vA < 0.02) discard; gl_FragColor = vec4(vec3(1.0, 0.12, 0.06) * 1.6, f * vA); }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const beacons = new THREE.Points(bg, bmat);
  beacons.frustumCulled = false; beacons.matrixAutoUpdate = false; beacons.renderOrder = -49;
  scene.add(beacons);

  return {
    mesh, beacons,
    update(atmo, cam, t) {
      const vis = atmo.skyVis ?? 1;
      mesh.visible = vis > 0.03;
      beacons.visible = mesh.visible && atmo.lamps > 0.05;
      uniforms.uSil.value.copy(atmo.silCol);
      uniforms.uHor.value.copy(atmo.horCol);
      uniforms.uGlow.value.copy(atmo.glowCol);
      uniforms.uCam.value.copy(cam);
      uniforms.uVis.value = vis;
      uniforms.uLit.value = atmo.lamps;
      bu.uOn.value = atmo.lamps * Math.min(1, vis * 1.5);
      bu.uTime.value = t;
    },
  };
}
