import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';

// Day/night cycle, sky dome, fog, weather (rain/fog/smog), shadow-casting sun
// that follows the player, a pooled set of point lights for nearby lamps and
// fires, lamp halos (light scattering in fog/rain), rain streaks + ground
// ripples, and a PMREM environment map for wet/glossy surfaces.

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const C3 = (h) => new THREE.Color(h);

// Time-of-day keyframes (hour -> look). Neighbouring keys are blended with a smoothstep, so every hour has
// its own readable identity and the transitions stay soft:
//   dawn   cold blue-grey mist, low sun, long soft shadows      (~6-8)
//   midday flat, yellow-grey smog, short shadows                 (~10-15)
//   dusk   warm sickly orange horizon, dark silhouettes, lamps   (~17-19.5)
//   night  deep blue-black, sodium pools, moonlit rooftops       (~21-5)
// sunI/moonI: directional light; hemiI: ambient; fogK: fog distance multiplier (dawn mist < 1);
// silK: distant-skyline darkness vs the horizon (low = strong silhouette); tint/desat: post grade.
const KEYS = [
  { h: 0, top: '#04060b', hor: '#141a25', fog: '#10151d', cloud: '#13120f', sun: '#ffd8a0', sunI: 0, moonI: 1.9, sky: '#44567a', gnd: '#17171b', hemiI: 2.0, fogK: 0.8, silK: 0.45, tint: [0.9, 0.97, 1.12], desat: 0.34 },
  { h: 4.2, top: '#060910', hor: '#1a2230', fog: '#151b25', cloud: '#10141c', sun: '#ffd8a0', sunI: 0, moonI: 1.5, sky: '#465a7e', gnd: '#18181c', hemiI: 2.0, fogK: 0.75, silK: 0.45, tint: [0.9, 0.97, 1.12], desat: 0.34 },
  { h: 5.2, top: '#1a2230', hor: '#4e5866', fog: '#3e4854', cloud: '#2a313c', sun: '#d8c4c4', sunI: 1.0, moonI: 0, sky: '#6e7e94', gnd: '#28292d', hemiI: 1.85, fogK: 0.42, silK: 0.62, tint: [0.92, 0.98, 1.1], desat: 0.38 },
  { h: 6.3, top: '#44505c', hor: '#96a0a8', fog: '#7a848e', cloud: '#5c646c', sun: '#ead6c6', sunI: 2.1, moonI: 0, sky: '#9aa8b8', gnd: '#3e3e40', hemiI: 2.05, fogK: 0.45, silK: 0.7, tint: [0.94, 0.99, 1.07], desat: 0.36 },
  { h: 8.6, top: '#5a646a', hor: '#a6aaa8', fog: '#8c908e', cloud: '#787c7c', sun: '#f4e6d0', sunI: 3.2, moonI: 0, sky: '#a8aeae', gnd: '#58524a', hemiI: 2.0, fogK: 0.7, silK: 0.66, tint: [0.98, 1.0, 1.02], desat: 0.34 },
  { h: 11, top: '#72726a', hor: '#b6ae92', fog: '#9e967e', cloud: '#8e8878', sun: '#ffeccc', sunI: 3.6, moonI: 0, sky: '#c4bca4', gnd: '#6c5e4a', hemiI: 2.3, fogK: 1, silK: 0.64, tint: [1.03, 1.02, 0.92], desat: 0.4 },
  { h: 14.6, top: '#72716a', hor: '#b8ae90', fog: '#9e957c', cloud: '#8e8876', sun: '#ffeac6', sunI: 3.6, moonI: 0, sky: '#c4baa0', gnd: '#6c5e4a', hemiI: 2.3, fogK: 1, silK: 0.64, tint: [1.03, 1.02, 0.92], desat: 0.4 },
  { h: 16.6, top: '#665e56', hor: '#bea074', fog: '#8e7e62', cloud: '#80725e', sun: '#ffd49c', sunI: 3.6, moonI: 0, sky: '#b6a68c', gnd: '#64543e', hemiI: 1.95, fogK: 0.95, silK: 0.52, tint: [1.04, 1.0, 0.9], desat: 0.34 },
  { h: 18.2, top: '#4a3e42', hor: '#cc8a4e', fog: '#76563c', cloud: '#6a4a38', sun: '#ffa052', sunI: 3.2, moonI: 0, sky: '#a2826a', gnd: '#46362a', hemiI: 1.2, fogK: 0.9, silK: 0.3, tint: [1.06, 0.99, 0.87], desat: 0.28 },
  { h: 19.3, top: '#2a2636', hor: '#b4602e', fog: '#46302a', cloud: '#462e28', sun: '#ff8038', sunI: 2.4, moonI: 0, sky: '#7a6052', gnd: '#2e2420', hemiI: 1.0, fogK: 0.85, silK: 0.22, tint: [1.04, 0.97, 0.9], desat: 0.3 },
  { h: 20.2, top: '#0e121c', hor: '#3a3440', fog: '#211f26', cloud: '#1c1a20', sun: '#ff7a34', sunI: 0, moonI: 0.7, sky: '#4a5674', gnd: '#1c1a1c', hemiI: 1.75, fogK: 0.8, silK: 0.35, tint: [0.94, 0.96, 1.08], desat: 0.3 },
  { h: 21.6, top: '#05070c', hor: '#221f22', fog: '#14161b', cloud: '#191612', sun: '#ffd8a0', sunI: 0, moonI: 1.5, sky: '#44567a', gnd: '#1a1a1e', hemiI: 2.0, fogK: 0.8, silK: 0.45, tint: [0.92, 0.97, 1.1], desat: 0.32 },
];
const COLS = ['top', 'hor', 'fog', 'cloud', 'sun', 'sky', 'gnd'];
const NUMS = ['sunI', 'moonI', 'hemiI', 'fogK', 'silK', 'desat'];
for (const k of KEYS) { for (const c of COLS) k[c] = C3(k[c]); k.tint = new THREE.Vector3(...k.tint); }
KEYS.push({ ...KEYS[0], h: 24 });
const MOON_COL = C3('#7a8cc0');

// Sun path: up at 5:30, down at 19:30, peaking ~58deg so walls keep a lit side and a shadow side.
const SUNRISE = 5.5, SUNSET = 19.5;
// Street lamps: on from ~18:20 (staggered, fully lit by 19:50), off again 5:40-6:55.
const lampsAt = (h) => (h < 12 ? 1 - smooth(5.6, 6.9, h) : smooth(18.3, 19.8, h));

// tintK: how much the weather colour washes over the time-of-day palette (only in daylight; dusk/dawn keep
// their hue). fogMix: the sky dome dissolves into the fog colour. stars: allowed on this weather.
const WEATHER = {
  clear: { cloud: 0.22, sunK: 1.0, fogNear: 70, fogFar: 640, tint: null, tintK: 0, rain: 0, haze: 0.5, fogMix: 0, stars: 1, vis: 1 },
  overcast: { cloud: 0.8, sunK: 0.6, fogNear: 50, fogFar: 520, tint: C3('#8a8a86'), tintK: 0.3, rain: 0, haze: 0.6, fogMix: 0, stars: 0, vis: 0.8 },
  smog: { cloud: 0.55, sunK: 0.65, fogNear: 25, fogFar: 380, tint: C3('#a89260'), tintK: 0.5, rain: 0, haze: 0.9, fogMix: 0.12, stars: 0, vis: 0.5 },
  rain: { cloud: 1.0, sunK: 0.22, fogNear: 16, fogFar: 260, tint: C3('#5a6268'), tintK: 0.5, rain: 1, haze: 0.8, fogMix: 0.2, stars: 0, vis: 0.35 },
  storm: { cloud: 1.0, sunK: 0.12, fogNear: 10, fogFar: 210, tint: C3('#3a4048'), tintK: 0.6, rain: 1.4, haze: 0.9, fogMix: 0.3, stars: 0, vis: 0.2 },
  fog: { cloud: 0.95, sunK: 0.3, fogNear: 3, fogFar: 72, tint: C3('#9a9a94'), tintK: 0.45, rain: 0, haze: 1.0, fogMix: 0.93, stars: 0, vis: 0 },
};
export const WEATHER_LABEL = { clear: 'Clear-ish', overcast: 'Overcast', smog: 'Smog alert', rain: 'Rain', storm: 'Thunderstorm', fog: 'Pea-soup fog' };

// Deterministic per-day weather (same for every co-op client).
export function weatherForDay(day) {
  const r = mulberry32(day * 9973 + 17);
  const a = r();
  let kind = a < 0.12 ? 'clear' : a < 0.45 ? 'overcast' : a < 0.65 ? 'smog' : a < 0.8 ? 'rain' : a < 0.86 ? 'storm' : 'fog';
  if (day === 1) kind = 'overcast';
  const start = kind === 'fog' ? 0 : 3 + r() * 12;
  const len = kind === 'fog' ? 11 + r() * 3 : 5 + r() * 12;
  return { kind, start, end: start + len };
}

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p; }`;
const SKY_FRAG = `
  uniform vec3 uTop, uHor, uBot, uSunDir, uSunCol, uMoonDir, uCloudCol, uFogCol;
  uniform float uSunVis, uMoonVis, uStars, uTime, uCloud, uHaze, uFlash, uFogMix;
  varying vec3 vDir;
  float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += n2(p) * a; p = p * 2.03 + 7.1; a *= 0.5; } return s; }
  void main(){
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
    col = mix(col, uBot, (1.0 - smoothstep(-0.3, 0.0, h)));
    float sd = max(dot(d, uSunDir), 0.0);
    float md = max(dot(d, uMoonDir), 0.0);
    // broad warm/cold glow around the sun (the smog scatters it), kept under the clouds
    col += uSunCol * (pow(sd, 6.0) * 0.26 + pow(sd, 40.0) * 0.3) * uSunVis * (1.0 - uCloud * 0.45);
    // clouds: slow smog banks drifting across, darker undersides, edges lit toward the sun
    float cov = 0.0;
    if (h > -0.02) {
      vec2 cp = d.xz / (h + 0.12) * 0.75 + vec2(uTime * 0.0095, uTime * 0.0038);
      float c = fbm(cp);
      float dtl = fbm(cp * 2.6 - vec2(uTime * 0.004, 0.0));
      float lo = 0.6 - uCloud * 0.3;
      cov = smoothstep(lo, lo + 0.2, c * 0.8 + dtl * 0.2) * smoothstep(-0.02, 0.16, h);
      // thick cores go dark and sooty, thin edges catch the light
      float thick = smoothstep(lo + 0.04, lo + 0.34, c + (dtl - 0.5) * 0.35);
      vec3 cc = mix(uCloudCol * 1.14, uCloudCol * 0.56, thick) + uSunCol * pow(sd, 4.0) * 0.24 * uSunVis * (1.0 - thick);
      col = mix(col, cc, cov * 0.93);
    }
    // stars: only on clear nights, never through cloud
    if (h > 0.0 && uStars > 0.01) {
      vec3 sp = d * 260.0; vec3 cell = floor(sp); float s = hash3(cell);
      float star = step(0.9972, s) * (1.0 - smoothstep(0.0, 0.5, length(fract(sp) - 0.5)));
      col += vec3(0.9, 0.9, 1.0) * star * uStars * (0.6 + 0.4 * sin(uTime * 1.3 + s * 80.0)) * (1.0 - cov) * smoothstep(0.03, 0.3, h);
    }
    // sun and moon discs, softened by haze; a smog sun is a dull disc you can look straight at
    float veil = clamp(1.0 - cov * 0.85, 0.0, 1.0);
    float sunDisc = smoothstep(0.99935, 0.99968, sd);
    col = mix(col, mix(uSunCol, uHor, 0.25 + uHaze * 0.2) * (1.4 - uHaze * 0.5), sunDisc * uSunVis * veil * (1.0 - uHaze * 0.35));
    col += uSunCol * pow(sd, 260.0) * 0.35 * uSunVis * veil;
    float moonDisc = smoothstep(0.99955, 0.99978, md);
    col = mix(col, vec3(0.78, 0.8, 0.74) * 1.15, moonDisc * uMoonVis * veil * (1.0 - uHaze * 0.3));
    col += vec3(0.22, 0.27, 0.38) * pow(md, 40.0) * uMoonVis * 0.45;
    col = mix(col, uHor, exp(-abs(h) * 9.0) * uHaze);
    // fog weather: the whole dome dissolves into the fog colour (a faint disc still glows through)
    col = mix(col, uFogCol, uFogMix * (1.0 - 0.3 * smoothstep(0.1, 0.9, h)));
    col += uFogCol * sunDisc * uSunVis * uFogMix * 0.35;
    col += vec3(0.6, 0.65, 0.8) * uFlash;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Atmosphere {
  constructor(game, matsApi, lights) {
    this.game = game;
    this.mats = matsApi;
    const scene = game.scene;
    this.scene = scene;
    scene.fog = new THREE.Fog(0x2a2622, 60, 500);
    this.fogNear = 60; this.fogFar = 500;

    // ---- sky
    const V3 = () => ({ value: new THREE.Vector3(0, 1, 0) }), CL = () => ({ value: new THREE.Color() });
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: CL(), uHor: CL(), uBot: { value: new THREE.Color('#0a0908') }, uSunDir: V3(), uSunCol: CL(), uMoonDir: V3(), uCloudCol: CL(), uFogCol: CL(),
        uSunVis: { value: 1 }, uMoonVis: { value: 0 }, uStars: { value: 0 }, uTime: { value: 0 }, uCloud: { value: 0.5 }, uHaze: { value: 0.6 }, uFlash: { value: 0 }, uFogMix: { value: 0 },
      },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1900, 32, 16), this.skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -100;
    scene.add(this.sky);

    // env scene for PMREM (small sky sphere)
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), this.skyMat));
    this.pmrem = new THREE.PMREMGenerator(game.renderer);
    this.envRT = null; this.envT = 99; this.envKey = '';

    // ---- lights
    this.hemi = new THREE.HemisphereLight(0xc4bca4, 0x4a4032, 1);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffe0b0, 2.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const S = 70;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 500 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.045;
    scene.add(sun); scene.add(sun.target);
    this.sun = sun;
    this.shadowSize = S;

    // pooled point lights
    this.sources = lights;               // [{x,y,z,color,kind}]
    this.grid = new Map();
    const rr = mulberry32(0x1a4b5);
    for (const s of lights) {
      s.col = new THREE.Color(s.color); s.seed = rr() * 100;
      s.th = 0.08 + rr() * 0.55;         // dusk switch-on threshold: lamps strike one by one
      const k = Math.floor(s.x / 50) + ',' + Math.floor(s.z / 50);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(s);
    }
    this.pool = [];
    for (let i = 0; i < 8; i++) {
      const L = new THREE.PointLight(0xffa050, 0, 26, 1.7);
      L.userData = { src: null, cur: 0 };
      scene.add(L); this.pool.push(L);
    }
    this.assignT = 0;

    // ---- lamp halos (one Points draw): faint on clear nights, wide soft glows in fog and rain
    this.halos = this._makeHalos(lights.filter((s) => s.kind === 'street' || s.kind === 'flicker'));
    scene.add(this.halos);

    // ---- rain
    this.rainN = 7000; this.rippleN = 1100;
    this.rain = this._makeRain(this.rainN);
    scene.add(this.rain);
    this.splash = this._makeRipples(this.rippleN);
    scene.add(this.splash);

    // weather state (smoothed)
    this.cur = { cloud: 0.8, sunK: 0.5, fogNear: 50, fogFar: 520, tintK: 0.3, rain: 0, haze: 0.6, fogMix: 0, stars: 0, vis: 0.8, tint: new THREE.Color('#8a8a86') };
    this.weather = 'overcast';
    this.flash = 0; this.flashT = 4;
    this.night = 0; this.daylight = 1; this.lamps = 0; this.scatter = 0;
    this.tod = { ...KEYS[0], tint: new THREE.Vector3() };
    for (const c of COLS) this.tod[c] = new THREE.Color();
    this.horCol = new THREE.Color(); this.silCol = new THREE.Color(); this.glowCol = new THREE.Color();
    this._tmpA = new THREE.Color(); this._tmpB = new THREE.Color();
    this.quality = 'high';
    this.viewK = 1;
    this.poolN = this.pool.length;
    this._v = new THREE.Vector3();
    this._right = new THREE.Vector3(); this._up = new THREE.Vector3(); this._p = new THREE.Vector3();
  }

  _makeHalos(src) {
    const N = src.length;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seed = new Float32Array(N * 2);
    src.forEach((s, i) => {
      pos.set([s.x, s.y + 0.25, s.z], i * 3);
      const c = new THREE.Color(s.color); col.set([c.r, c.g, c.b], i * 3);
      seed[i * 2] = s.th ?? 0.3; seed[i * 2 + 1] = s.kind === 'flicker' ? 1 : 0;
    });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uSize: { value: 2.5 }, uOn: { value: 0 }, uStr: { value: 0 }, uFlk: { value: 1 }, uFar: { value: 200 } },
      vertexShader: `attribute vec3 aCol; attribute vec2 aSeed; uniform float uScale, uSize, uOn, uStr, uFlk, uFar; varying vec3 vC; varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uSize * uScale / max(d, 1.0), 0.0, 420.0);
          float on = clamp((uOn - aSeed.x * 0.5) / 0.15, 0.0, 1.0);
          vA = uStr * on * mix(1.0, uFlk, aSeed.y) * smoothstep(3.0, 11.0, d) * (1.0 - smoothstep(uFar * 0.55, uFar, d));
          if (vA < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          vC = aCol;
        }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0; float f = exp(-r2 * 3.2) - 0.04; if (f <= 0.0) discard;
          gl_FragColor = vec4(vC * f * vA, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false; p.renderOrder = 6; p.visible = false;
    return p;
  }

  _makeRain(N) {
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(N * 2 * 4), end = new Float32Array(N * 2), pos = new Float32Array(N * 2 * 3);
    for (let i = 0; i < N; i++) {
      const s = [Math.random(), Math.random(), Math.random(), Math.random()];
      for (let k = 0; k < 2; k++) { seed.set(s, (i * 2 + k) * 4); end[i * 2 + k] = k; }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uAmt: { value: 0 }, uWind: { value: new THREE.Vector2(1.5, 0.6) }, uCol: { value: new THREE.Color('#9aa4ae') } },
      vertexShader: `attribute vec4 aSeed; attribute float aEnd; uniform vec3 uCam; uniform float uTime, uAmt; uniform vec2 uWind; varying float vA;
        void main(){
          float R = 42.0, H = 36.0;
          float sp = 26.0 + aSeed.w * 12.0;
          float ph = fract(aSeed.z + uTime * sp / H);
          float y = uCam.y + H * 0.55 - ph * H;
          float x = uCam.x + (fract(aSeed.x - uCam.x / (2.0 * R)) - 0.5) * 2.0 * R;
          float z = uCam.z + (fract(aSeed.y - uCam.z / (2.0 * R)) - 0.5) * 2.0 * R;
          x += uWind.x * (1.0 - ph) * 2.0; z += uWind.y * (1.0 - ph) * 2.0;
          vec3 p = vec3(x, y, z);
          p.y = y - aEnd * (0.55 + aSeed.w * 0.4);
          p.x -= aEnd * uWind.x * 0.03; p.z -= aEnd * uWind.y * 0.03;
          vA = step(0.0, p.y) * step(aSeed.w, uAmt) * (0.25 + aSeed.x * 0.25);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ if (vA <= 0.0) discard; gl_FragColor = vec4(uCol, vA); }`,
      transparent: true, depthWrite: false, fog: false,
    });
    const ls = new THREE.LineSegments(g, m);
    ls.frustumCulled = false; ls.visible = false; ls.renderOrder = 10;
    return ls;
  }

  // Rain ripples: flat expanding rings lying on the ground (roads, sidewalks, lots alike), so they keep the
  // right perspective from any camera angle. They fade toward the edge of the area around the camera.
  _makeRipples(N) {
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(N * 4 * 3), corner = new Float32Array(N * 4 * 2), pos = new Float32Array(N * 4 * 3), idx = new Uint32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const s = [Math.random(), Math.random(), Math.random()];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((c, k) => { seed.set(s, (i * 4 + k) * 3); corner.set(c, (i * 4 + k) * 2); });
      idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uAmt: { value: 0 }, uCol: { value: new THREE.Color(0.7, 0.74, 0.78) } },
      vertexShader: `attribute vec3 aSeed; attribute vec2 aCorner; uniform vec3 uCam; uniform float uTime, uAmt; varying float vA, vL; varying vec2 vUv;
        float h(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          float t = uTime * (1.5 + aSeed.z * 0.8) + aSeed.z * 10.0;
          float cyc = floor(t); float life = fract(t);
          float R = 22.0;
          vec2 o = vec2(h(aSeed.x * 91.0 + cyc * 1.7), h(aSeed.y * 57.0 + cyc * 2.3)) - 0.5;
          vec2 c = uCam.xz + o * 2.0 * R;
          float r = 0.04 + life * 0.2;
          vec3 p = vec3(c.x + aCorner.x * r, 0.085, c.y + aCorner.y * r);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          float dc = length(c - uCam.xz);
          vA = step(aSeed.z, uAmt) * (1.0 - life) * (1.0 - life) * (1.0 - smoothstep(R * 0.55, R * 0.95, dc));
          vL = life; vUv = aCorner;
        }`,
      fragmentShader: `uniform vec3 uCol; varying float vA, vL; varying vec2 vUv;
        void main(){ float d = length(vUv); float w = 0.12 + vL * 0.12; float ring = 1.0 - smoothstep(0.0, w, abs(d - 0.8));
          float a = ring * vA * 0.3; if (a < 0.01) discard; gl_FragColor = vec4(uCol, a); }`,
      transparent: true, depthWrite: false, fog: false,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 9;
    return mesh;
  }

  // q: a graphics preset from world/index.js (shadows, shadowMap, shadowSize, lights, rain, viewK).
  setQuality(q) {
    if (typeof q === 'string') q = { id: q, shadows: q !== 'low', lights: q === 'low' ? 2 : 8, rain: q === 'low' ? 0.35 : 1 };
    this.quality = q.id;
    this.viewK = q.viewK ?? 1;
    const sun = this.sun;
    sun.castShadow = !!q.shadows;
    const size = q.shadowMap ?? 2048, S = q.shadowSize ?? 70;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    if (this.shadowSize !== S) {
      Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S });
      sun.shadow.camera.updateProjectionMatrix();
      this.shadowSize = S;
    }
    // Pooled lamp lights: unused ones leave the scene's light count entirely (cheaper shaders).
    this.poolN = Math.max(0, Math.min(this.pool.length, q.lights ?? this.pool.length));
    this.pool.forEach((L, i) => { L.visible = i < this.poolN; if (i >= this.poolN) { L.userData.src = null; L.intensity = 0; } });
    this.assignT = 0;
    const rk = Math.max(0, Math.min(1, q.rain ?? 1));
    this.rain.geometry.setDrawRange(0, rk >= 1 ? Infinity : Math.round(2 * this.rainN * rk));
    this.splash.geometry.setDrawRange(0, rk >= 1 ? Infinity : Math.round(this.rippleN * Math.max(0.3, rk)) * 6);
  }

  // Desired weather parameters for the current time.
  _target(t) {
    if (this.force && WEATHER[this.force]) return this.force; // dev: window.__weather(kind)
    const day = t.day, hour = t.minuteOfDay / 60;
    const today = weatherForDay(day);
    const yest = weatherForDay(day - 1);
    let kind = 'overcast';
    if (hour >= today.start && hour < today.end) kind = today.kind;
    else if (yest.end > 24 && hour < yest.end - 24) kind = yest.kind;
    else kind = today.kind === 'clear' ? 'clear' : today.kind === 'smog' ? 'smog' : 'overcast';
    return kind;
  }

  // Time-of-day palette for an hour (0..24) into this.tod.
  _tod(hour) {
    let i = 0;
    while (i < KEYS.length - 2 && hour >= KEYS[i + 1].h) i++;
    const A = KEYS[i], B = KEYS[i + 1];
    const f = smooth(0, 1, (hour - A.h) / (B.h - A.h));
    const o = this.tod;
    for (const c of COLS) o[c].copy(A[c]).lerp(B[c], f);
    for (const n of NUMS) o[n] = A[n] + (B[n] - A[n]) * f;
    o.tint.copy(A.tint).lerp(B.tint, f);
    return o;
  }

  update(dt, focus) {
    const g = this.game, t = g.time;
    const el = g.elapsed;
    const hour = t.minuteOfDay / 60 + (t.total % 1) / 60;
    this.daylight = t.daylight;
    // e: sun elevation proxy (-1..1), continuous over midnight
    const dayLen = SUNSET - SUNRISE;
    const isDay = hour >= SUNRISE && hour <= SUNSET;
    const a = isDay ? ((hour - SUNRISE) / dayLen) * Math.PI : 0;
    const nightPh = (((hour - SUNSET) % 24) + 24) % 24 / (24 - dayLen); // 0 at sunset .. 1 at sunrise
    const e = isDay ? Math.sin(a) : -Math.sin(nightPh * Math.PI);
    this.night = smooth(0.14, -0.1, e);
    const T = this._tod(hour);

    // weather smoothing
    const kind = this._target(t);
    if (kind !== this.weather) { this.weather = kind; this.game.bus.emit('weather:change', { kind, label: WEATHER_LABEL[kind] }); }
    const W = WEATHER[kind];
    let k = 1 - Math.exp(-dt * 0.35);
    if (this.snapWeather) { k = 1; this.snapWeather = false; }
    const c = this.cur;
    for (const key of ['cloud', 'sunK', 'fogNear', 'fogFar', 'haze', 'fogMix', 'stars', 'vis']) c[key] += (W[key] - c[key]) * k;
    c.rain += (W.rain - c.rain) * Math.min(1, k * 1.4);
    c.tintK += ((W.tintK ?? 0) - c.tintK) * k; if (W.tint) c.tint.lerp(W.tint, k);
    const rainAmt = Math.min(1, c.rain);

    // lamps: time of day, earlier in pea-soup fog and storms; scatter: how much the air glows around them
    this.lamps = Math.max(lampsAt(hour), c.fogMix * 0.55, Math.max(0, c.rain - 1) * 1.2);
    this.scatter = Math.min(1, c.fogMix * 1.05 + rainAmt * 0.45 + Math.max(0, c.haze - 0.6) * 0.3);

    // sun / moon
    const az = isDay ? a : (hour < SUNRISE ? 0 : Math.PI);
    const sunDir = this._v.set(Math.cos(az) + 0.22, Math.max(-0.4, e) * 0.9, 0.55).normalize();
    const moonA = nightPh * Math.PI;
    const moonDir = (this._moon ??= new THREE.Vector3()).set(Math.cos(moonA) * 0.8 - 0.2, Math.max(0.3, Math.sin(moonA) * 0.85), -0.5).normalize();
    const dayK = smooth(-0.2, 0.35, e), nightK = smooth(-0.06, -0.32, e);

    // weather wash: strongest at midday, gone by sunset (dusk and dawn keep their own colour)
    const wash = c.tintK * 0.55 * smooth(0.02, 0.55, e);
    const blend = (col) => {
      if (wash > 0.005) { const l = (col.r + col.g + col.b) / 3; this._tmpB.copy(c.tint).multiplyScalar(l * 1.6 + 0.02); col.lerp(this._tmpB, wash); }
      return col;
    };
    const U = this.skyMat.uniforms;
    const top = blend(U.uTop.value.copy(T.top));
    const hor = blend(U.uHor.value.copy(T.hor));
    const fogC = blend(this.scene.fog.color.copy(T.fog));
    const cloudC = blend(U.uCloudCol.value.copy(T.cloud));
    // overcast/rain muddies the sky toward its own luminance (hue survives, saturation drops)
    const mud = Math.max(0, c.cloud - 0.4) * 0.45 + rainAmt * 0.2;
    for (const col of [top, hor, cloudC]) { const l = (col.r + col.g + col.b) / 3; col.lerp(this._tmpA.setScalar(l), mud); }
    // pea-soup fog: pale, muffled, desaturated grey picked from the hour's fog colour
    if (c.fogMix > 0.01) {
      const l = (fogC.r + fogC.g + fogC.b) / 3;
      this._tmpA.setRGB(l, l * 1.01, l * 1.03).multiplyScalar(1.25).addScalar(0.012 * (1 - nightK));
      // at night the murk glows a dirty sodium brown from the street lamps instead of going black
      this._tmpA.r += 0.026 * this.lamps * nightK; this._tmpA.g += 0.019 * this.lamps * nightK; this._tmpA.b += 0.011 * this.lamps * nightK;
      fogC.lerp(this._tmpA, Math.min(1, c.fogMix * 0.85));
    }
    // rain darkens everything
    const dark = 1 - rainAmt * 0.35;
    top.multiplyScalar(dark); hor.multiplyScalar(dark); fogC.multiplyScalar(dark); cloudC.multiplyScalar(dark);
    U.uBot.value.copy(fogC).multiplyScalar(0.5);
    U.uFogCol.value.copy(fogC);
    U.uFogMix.value = c.fogMix;
    if (this.scene.background?.isColor) this.scene.background.copy(fogC);
    this.horCol.copy(hor).lerp(fogC, c.fogMix);

    // lightning in storms
    let flash = 0;
    if (c.rain > 1.1) {
      this.flashT -= dt;
      if (this.flashT < 0) { this.flash = 1; this.flashT = 4 + Math.random() * 12; }
    }
    if (this.flash > 0) { this.flash -= dt * 5; flash = Math.max(0, this.flash) * (Math.sin(el * 70) > -0.3 ? 1 : 0.2); }
    U.uFlash.value = flash * 0.8;

    const sunVis = smooth(-0.06, 0.03, e);
    U.uSunCol.value.copy(T.sun);
    U.uSunDir.value.copy(sunDir);
    U.uMoonDir.value.copy(moonDir);
    U.uSunVis.value = sunVis * (1 - c.cloud * 0.35);
    U.uMoonVis.value = nightK * (1 - c.cloud * 0.55);
    U.uStars.value = nightK * c.stars * (1 - c.fogMix);
    U.uTime.value = el;
    U.uCloud.value = c.cloud;
    U.uHaze.value = c.haze;

    // directional light: sun by day, moon by night (moonlight picks out the rooftops)
    const useMoon = e < -0.02;
    const dir = useMoon ? moonDir : sunDir;
    const sunI = useMoon
      ? T.moonI * (1 - c.cloud * 0.5) * (1 - rainAmt * 0.4) * smooth(-0.02, -0.18, e)
      : T.sunI * c.sunK * smooth(-0.03, 0.07, e);
    this.sun.intensity = sunI + flash * 2;
    this.sun.color.copy(useMoon ? MOON_COL : T.sun);
    // follow focus, snapped to shadow texels
    const fx = focus?.x ?? 0, fz = focus?.z ?? 0;
    const texel = (this.shadowSize * 2) / this.sun.shadow.mapSize.x;
    const right = this._right.set(-dir.z, 0, dir.x).normalize();
    const up = this._up.crossVectors(dir, right).normalize();
    const p = this._p.set(fx, 0, fz);
    const pr = Math.round(p.dot(right) / texel) * texel, pu = Math.round(p.dot(up) / texel) * texel, pd = p.dot(dir);
    const snapped = right.multiplyScalar(pr).add(up.multiplyScalar(pu)).addScaledVector(dir, pd);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(dir, 200);
    this.sun.target.updateMatrixWorld();

    // hemisphere (ambient): carries the hour's colour; overcast flattens toward the weather tint
    this.hemi.color.copy(T.sky);
    this.hemi.groundColor.copy(T.gnd);
    if (wash > 0.005) this.hemi.color.lerp(c.tint, wash * 0.6);
    if (c.fogMix > 0.01) this.hemi.color.lerp(fogC, c.fogMix * 0.3);
    this.hemi.intensity = T.hemiI * (1 - rainAmt * 0.25) * (1 + (1 - c.sunK) * 0.12 * dayK) + flash * 3;

    // fog distance (dawn mist pulls it in)
    // (pea-soup fog sets its own range; there the hour only nudges it)
    const kf = (T.fogK + (0.85 + T.fogK * 0.15 - T.fogK) * c.fogMix) * this.viewK;
    this.scene.fog.near = c.fogNear * kf;
    this.scene.fog.far = c.fogFar * kf;
    this.fogFar = this.scene.fog.far;

    // distant skyline silhouette colours (see skyline.js)
    this.silCol.copy(this.horCol).multiplyScalar(T.silK);
    this.glowCol.setRGB(1.0, 0.55, 0.22).multiplyScalar(0.05 * this.lamps * (1 - c.fogMix));
    this.skyVis = c.vis;

    // grade (post.js)
    this.grade = { tint: T.tint, desat: T.desat + c.fogMix * 0.22 + rainAmt * 0.1 + Math.max(0, c.cloud - 0.6) * 0.08 };

    // rain visuals
    this.rain.visible = rainAmt > 0.02;
    this.splash.visible = rainAmt > 0.05;
    const cam = g.camera.position;
    for (const o of [this.rain, this.splash]) { o.material.uniforms.uCam.value.copy(cam); o.material.uniforms.uTime.value = el; o.material.uniforms.uAmt.value = rainAmt; }
    this.rain.material.uniforms.uCol.value.setScalar(0.35 + dayK * 0.35 + this.night * 0.1);
    // ripples dim with the light (at night full-bright rings read as confetti on the black asphalt)
    this.splash.material.uniforms.uCol.value.setRGB(0.62, 0.66, 0.7).multiplyScalar(0.35 + dayK * 0.4);
    // streets get wet fast and dry slowly
    this.wet = this.wet ?? 0;
    if (rainAmt > 0.05) this.wet = Math.min(1, this.wet + dt * 0.08 * rainAmt);
    else this.wet = Math.max(0, this.wet - dt * 0.004);
    if (this.snapWet != null) { this.wet = this.snapWet; this.snapWet = null; }

    // lamp halos
    const hu = this.halos.material.uniforms;
    const str = this.lamps * (0.05 + this.scatter * 0.24);
    this.halos.visible = str > 0.01;
    hu.uOn.value = this.lamps;
    hu.uStr.value = str;
    hu.uSize.value = 2.4 + this.scatter * 2.6;
    hu.uFar.value = Math.min(260, this.fogFar * 1.5 + 20);
    hu.uScale.value = g.renderer.domElement.height / (2 * Math.tan((g.camera.fov * Math.PI) / 360));
    hu.uFlk.value = this.mats.state?.flk ?? 1;

    // sky follows camera
    this.sky.position.copy(cam);

    // env map refresh (cheap enough every few seconds)
    this.envT += dt;
    const key = `${Math.round(hour * 4)}|${kind}`;
    if (this.envT > 6 || (key !== this.envKey && this.envT > 1)) {
      this.envT = 0; this.envKey = key;
      try {
        const rt = this.pmrem.fromScene(this.envScene, 0.02);
        if (this.envRT) this.envRT.dispose();
        this.envRT = rt;
        this.mats.setEnv(rt.texture);
      } catch (err) { /* ignore */ }
    }

    this._updateLights(dt, focus);
    return { night: this.night, lamps: this.lamps, scatter: this.scatter, wet: this.wet ?? 0, daylight: this.daylight, flash, grade: this.grade, fogFar: this.fogFar };
  }

  _updateLights(dt, focus) {
    if (!focus) return;
    this.assignT -= dt;
    const lamps = this.lamps;
    if (this.assignT <= 0) {
      this.assignT = 0.3;
      const cx = Math.floor(focus.x / 50), cz = Math.floor(focus.z / 50);
      const cand = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const arr = this.grid.get((cx + a) + ',' + (cz + b));
        if (!arr) continue;
        for (const s of arr) {
          const active = s.kind === 'fire' || lamps > s.th * 0.6;
          if (!active) continue;
          const d = Math.hypot(s.x - focus.x, s.z - focus.z);
          if (d < 60) cand.push([d - (s.kind === 'fire' ? 8 : s.kind === 'police' ? 6 : 0), s]);
        }
      }
      cand.sort((p, q) => p[0] - q[0]);
      const want = new Set(cand.slice(0, this.poolN).map((c) => c[1]));
      // keep lights that are still wanted, reassign the rest
      const free = [];
      for (let i = 0; i < this.poolN; i++) {
        const L = this.pool[i];
        if (L.userData.src && want.has(L.userData.src)) want.delete(L.userData.src); else free.push(L);
      }
      for (const s of want) { const L = free.pop(); if (!L) break; L.userData.src = s; L.userData.cur = 0; L.position.set(s.x, s.y, s.z); L.color.copy(s.col); }
      for (const L of free) L.userData.src = null;
    }
    const t = this.game.elapsed;
    const fogBoost = 1 + this.scatter * 0.25;
    for (let i = 0; i < this.poolN; i++) {
      const L = this.pool[i];
      const s = L.userData.src;
      let target = 0;
      if (s) {
        // each lamp strikes on at its own moment around dusk, with a short sputter as it catches
        const on = s.kind === 'fire' || s.kind === 'police' ? 1 : Math.max(0, Math.min(1, (lamps - s.th * 0.6) / 0.12));
        const strike = on > 0 && on < 1 && Math.sin(t * 31 + s.seed * 7) * Math.sin(t * 13.7 + s.seed) > 0.15 ? 0.15 : 1;
        const lv = on * strike;
        switch (s.kind) {
          case 'fire': target = (5 + lamps * 9) * (0.75 + Math.sin(t * 13 + s.seed) * 0.12 + Math.sin(t * 23.7 + s.seed * 2) * 0.1); L.distance = 14; break;
          case 'flicker': target = lv * 16 * ((Math.sin(t * 9 + s.seed) * Math.sin(t * 23 + s.seed) > 0.25 || Math.sin(t * 0.4 + s.seed) > 0.85) ? 0.05 : 1); L.distance = 24 * fogBoost; break;
          case 'door': target = lv * 10; L.distance = 12; break;
          case 'police': { const p = Math.floor(t * 4) % 2; L.color.set(p ? 0xff2020 : 0x2040ff); target = 4 + lamps * 14; L.distance = 18; break; }
          default: target = lv * 13; L.distance = 24 * fogBoost;
        }
      }
      L.userData.cur += (target - L.userData.cur) * Math.min(1, dt * (s?.kind === 'flicker' || s?.kind === 'fire' || s?.kind === 'police' ? 30 : 8));
      L.intensity = Math.max(0, L.userData.cur);
    }
  }
}
