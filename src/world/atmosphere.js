import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';

// Day/night cycle, sky dome, fog, weather (rain/fog/smog), shadow-casting sun
// that follows the player, a pooled set of point lights for nearby lamps and
// fires, and a PMREM environment map for wet/glossy surfaces.

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const C3 = (h) => new THREE.Color(h);

const PAL = {
  night: { top: C3('#05070d'), hor: C3('#1c2432'), fog: C3('#161c26'), sun: C3('#7a8cc0'), sunI: 1.7, sky: C3('#4a5c80'), gnd: C3('#1a1a1e'), hemiI: 2.05, cloud: C3('#10131b') },
  dusk: { top: C3('#2e2c3c'), hor: C3('#c4703e'), fog: C3('#7a5440'), sun: C3('#ff9448'), sunI: 2.6, sky: C3('#a88a70'), gnd: C3('#44342a'), hemiI: 1.0, cloud: C3('#6a4434') },
  day: { top: C3('#6e7274'), hor: C3('#b8ab8c'), fog: C3('#9a907a'), sun: C3('#ffe4b8'), sunI: 4.2, sky: C3('#c8c0a8'), gnd: C3('#6c5e4a'), hemiI: 2.15, cloud: C3('#8e8878') },
};
// Sun path: up at 5:30, down at 19:30 (street lamps fade in 19:00-20:00, matching
// GameTime.isNight), peaking ~58deg so walls keep a lit side and a shadow side.
const SUNRISE = 5.5, SUNSET = 19.5;
const WEATHER = {
  clear: { cloud: 0.25, sunK: 1.0, fogNear: 70, fogFar: 640, tint: null, rain: 0, haze: 0.5 },
  overcast: { cloud: 0.8, sunK: 0.6, fogNear: 50, fogFar: 520, tint: C3('#8a8a86'), tintK: 0.35, rain: 0, haze: 0.6 },
  smog: { cloud: 0.6, sunK: 0.65, fogNear: 25, fogFar: 380, tint: C3('#a89260'), tintK: 0.45, rain: 0, haze: 0.9 },
  rain: { cloud: 1.0, sunK: 0.22, fogNear: 18, fogFar: 300, tint: C3('#5a6268'), tintK: 0.55, rain: 1, haze: 0.8 },
  storm: { cloud: 1.0, sunK: 0.12, fogNear: 12, fogFar: 240, tint: C3('#3a4048'), tintK: 0.65, rain: 1.4, haze: 0.9 },
  fog: { cloud: 0.9, sunK: 0.35, fogNear: 4, fogFar: 125, tint: C3('#9a9a94'), tintK: 0.55, rain: 0, haze: 1.0 },
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

export class Atmosphere {
  constructor(game, matsApi, lights) {
    this.game = game;
    this.mats = matsApi;
    const scene = game.scene;
    this.scene = scene;
    scene.fog = new THREE.Fog(0x2a2622, 60, 500);
    this.fogNear = 60; this.fogFar = 500;

    // ---- sky
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color('#0a0908') },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
        uNight: { value: 0 }, uTime: { value: 0 }, uCloud: { value: 0.5 }, uCloudCol: { value: new THREE.Color() }, uHaze: { value: 0.6 }, uFlash: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p; }`,
      fragmentShader: `
        uniform vec3 uTop, uHor, uBot, uSunDir, uSunCol, uMoonDir, uCloudCol; uniform float uNight, uTime, uCloud, uHaze, uFlash;
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
          col += uSunCol * (pow(sd, 5.0) * 0.22 + pow(sd, 90.0) * 0.6) * (1.0 - uCloud * 0.6);
          col += uSunCol * smoothstep(0.9994, 0.9997, sd) * 4.0 * (1.0 - uCloud * 0.9);
          if (h > 0.0 && uNight > 0.01) {
            vec3 sp = d * 260.0; vec3 cell = floor(sp); float s = hash3(cell);
            float star = step(0.9972, s) * (1.0 - smoothstep(0.0, 0.5, length(fract(sp) - 0.5)));
            col += vec3(0.9, 0.9, 1.0) * star * uNight * (0.55 + 0.45 * sin(uTime * 2.0 + s * 80.0)) * (1.0 - uCloud * 0.8) * smoothstep(0.02, 0.25, h);
          }
          float md = dot(d, uMoonDir);
          col += vec3(0.85, 0.86, 0.72) * smoothstep(0.99935, 0.9996, md) * uNight * 2.2 * (1.0 - uCloud * 0.7);
          col += vec3(0.25, 0.3, 0.42) * pow(max(md, 0.0), 30.0) * uNight * 0.5;
          if (h > -0.02) {
            vec2 cp = d.xz / (h + 0.12) * 1.1 + vec2(uTime * 0.0035, uTime * 0.0018);
            float c = fbm(cp) * 0.75 + fbm(cp * 3.1 - uTime * 0.002) * 0.25;
            float cov = smoothstep(0.62 - uCloud * 0.45, 0.95 - uCloud * 0.25, c);
            vec3 cc = uCloudCol * (0.75 + c * 0.5) + uSunCol * pow(sd, 3.0) * 0.18;
            col = mix(col, cc, cov * smoothstep(-0.02, 0.18, h) * 0.95);
          }
          col = mix(col, uHor, exp(-abs(h) * 9.0) * uHaze);
          col += vec3(0.6, 0.65, 0.8) * uFlash;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
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
    for (const s of lights) {
      s.col = new THREE.Color(s.color); s.seed = Math.random() * 100;
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

    // ---- rain
    this.rain = this._makeRain(7000);
    scene.add(this.rain);
    this.splash = this._makeSplash(900);
    scene.add(this.splash);

    // weather state (smoothed)
    this.cur = { cloud: 0.8, sunK: 0.5, fogNear: 50, fogFar: 520, tintK: 0.3, rain: 0, haze: 0.6, tint: new THREE.Color('#8a8a86') };
    this.weather = 'overcast';
    this.flash = 0; this.flashT = 4;
    this.night = 0; this.daylight = 1;
    this._tmpA = new THREE.Color(); this._tmpB = new THREE.Color();
    this.quality = 'high';
    this._v = new THREE.Vector3();
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
          vec3 p = vec3(x, y, z) - vec3(uWind.x, -sp, uWind.y) * 0.022 * aEnd * vec3(1.0, -1.0, 1.0);
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

  _makeSplash(N) {
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(N * 3), pos = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) seed[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uAmt: { value: 0 }, uScale: { value: 400 } },
      vertexShader: `attribute vec3 aSeed; uniform vec3 uCam; uniform float uTime, uAmt, uScale; varying float vA, vL;
        float h(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          float t = uTime * (1.6 + aSeed.z) + aSeed.z * 10.0;
          float cyc = floor(t); float life = fract(t);
          float R = 26.0;
          float x = uCam.x + (h(aSeed.x * 91.0 + cyc * 1.7) - 0.5) * 2.0 * R;
          float z = uCam.z + (h(aSeed.y * 57.0 + cyc * 2.3) - 0.5) * 2.0 * R;
          vec4 mv = viewMatrix * vec4(x, 0.08, z, 1.0);
          gl_Position = projectionMatrix * mv;
          vL = life; vA = step(aSeed.z, uAmt) * (1.0 - life);
          gl_PointSize = (0.14 + life * 0.3) * uScale / -mv.z;
        }`,
      fragmentShader: `varying float vA, vL; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(vec2(c.x, (c.y + 0.25) * 2.6)); float ring = (1.0 - smoothstep(0.35, 0.5, d)) * smoothstep(0.15 + vL * 0.2, 0.3 + vL * 0.2, d); if (ring * vA < 0.02) discard; gl_FragColor = vec4(0.7, 0.74, 0.78, ring * vA * 0.32); }`,
      transparent: true, depthWrite: false, fog: false,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false; p.visible = false; p.renderOrder = 10;
    return p;
  }

  setQuality(q) {
    this.quality = q;
    this.sun.castShadow = q === 'high';
    this.rain.geometry.setDrawRange(0, q === 'high' ? Infinity : 2 * 2500);
  }

  // Desired weather parameters for the current time.
  _target(t) {
    const day = t.day, hour = t.minuteOfDay / 60;
    const today = weatherForDay(day);
    const yest = weatherForDay(day - 1);
    let kind = 'overcast';
    if (hour >= today.start && hour < today.end) kind = today.kind;
    else if (yest.end > 24 && hour < yest.end - 24) kind = yest.kind;
    else kind = today.kind === 'clear' ? 'clear' : today.kind === 'smog' ? 'smog' : 'overcast';
    return kind;
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

    // weather smoothing
    const kind = this._target(t);
    if (kind !== this.weather) { this.weather = kind; this.game.bus.emit('weather:change', { kind, label: WEATHER_LABEL[kind] }); }
    const W = WEATHER[kind];
    const k = 1 - Math.exp(-dt * 0.35);
    const c = this.cur;
    c.cloud += (W.cloud - c.cloud) * k; c.sunK += (W.sunK - c.sunK) * k;
    c.fogNear += (W.fogNear - c.fogNear) * k; c.fogFar += (W.fogFar - c.fogFar) * k;
    c.rain += (W.rain - c.rain) * k * 1.4; c.haze += (W.haze - c.haze) * k;
    c.tintK += ((W.tintK ?? 0) - c.tintK) * k; if (W.tint) c.tint.lerp(W.tint, k);

    // sun / moon
    const az = isDay ? a : (hour < SUNRISE ? 0 : Math.PI);
    const sunDir = this._v.set(Math.cos(az) + 0.22, Math.max(-0.4, e) * 0.9, 0.55).normalize();
    const moonA = nightPh * Math.PI;
    const moonDir = (this._moon ??= new THREE.Vector3()).set(Math.cos(moonA) * 0.8 - 0.2, Math.max(0.3, Math.sin(moonA) * 0.85), -0.5).normalize();
    const dayK = smooth(-0.2, 0.35, e), nightK = smooth(-0.06, -0.32, e);
    const duskK = Math.exp(-(e * e) / 0.03) * (1 - nightK * 0.6);

    const blend = (key, out) => {
      out.copy(PAL.night[key]).lerp(PAL.day[key], dayK);
      out.lerp(PAL.dusk[key], duskK * 0.85 * (1 - c.cloud * 0.4));
      if (c.tintK > 0.01) { const l = (out.r + out.g + out.b) / 3; this._tmpB.copy(c.tint).multiplyScalar(l * 1.6 + 0.02); out.lerp(this._tmpB, c.tintK * (0.4 + dayK * 0.6)); }
      return out;
    };
    const top = blend('top', this.skyMat.uniforms.uTop.value);
    const hor = blend('hor', this.skyMat.uniforms.uHor.value);
    const fogC = blend('fog', this.scene.fog.color);
    blend('cloud', this.skyMat.uniforms.uCloudCol.value);
    // rain darkens everything
    const dark = 1 - Math.min(1, c.rain) * 0.35;
    top.multiplyScalar(dark); hor.multiplyScalar(dark); fogC.multiplyScalar(dark);
    this.skyMat.uniforms.uCloudCol.value.multiplyScalar(dark);
    this.skyMat.uniforms.uBot.value.copy(fogC).multiplyScalar(0.5);
    if (this.scene.background?.isColor) this.scene.background.copy(fogC);

    // lightning in storms
    let flash = 0;
    if (c.rain > 1.1) {
      this.flashT -= dt;
      if (this.flashT < 0) { this.flash = 1; this.flashT = 4 + Math.random() * 12; }
    }
    if (this.flash > 0) { this.flash -= dt * 5; flash = Math.max(0, this.flash) * (Math.sin(el * 70) > -0.3 ? 1 : 0.2); }
    this.skyMat.uniforms.uFlash.value = flash * 0.8;

    const sunCol = this.skyMat.uniforms.uSunCol.value;
    const lightCol = this._tmpA.copy(PAL.night.sun).lerp(PAL.day.sun, dayK).lerp(PAL.dusk.sun, duskK);
    sunCol.copy(lightCol);
    this.skyMat.uniforms.uSunDir.value.copy(sunDir);
    this.skyMat.uniforms.uMoonDir.value.copy(moonDir);
    this.skyMat.uniforms.uNight.value = nightK;
    this.skyMat.uniforms.uTime.value = el;
    this.skyMat.uniforms.uCloud.value = c.cloud;
    this.skyMat.uniforms.uHaze.value = c.haze;

    // directional light: sun by day, moon by night
    const useMoon = e < -0.02;
    const dir = useMoon ? moonDir : sunDir;
    const sunI = useMoon ? PAL.night.sunI * (1 - c.cloud * 0.5) * smooth(-0.02, -0.18, e) : (PAL.night.sunI + (PAL.day.sunI - PAL.night.sunI) * dayK + PAL.dusk.sunI * duskK * 0.3) * c.sunK * smooth(-0.03, 0.07, e);
    this.sun.intensity = sunI + flash * 2;
    this.sun.color.copy(useMoon ? PAL.night.sun : lightCol);
    // follow focus, snapped to shadow texels
    const fx = focus?.x ?? 0, fz = focus?.z ?? 0;
    const texel = (this.shadowSize * 2) / 2048;
    const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    const p = new THREE.Vector3(fx, 0, fz);
    const pr = Math.round(p.dot(right) / texel) * texel, pu = Math.round(p.dot(up) / texel) * texel, pd = p.dot(dir);
    const snapped = right.multiplyScalar(pr).add(up.multiplyScalar(pu)).add(dir.clone().multiplyScalar(pd));
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(dir, 200);
    this.sun.target.updateMatrixWorld();

    // hemisphere
    this.hemi.color.copy(PAL.night.sky).lerp(PAL.day.sky, dayK).lerp(PAL.dusk.sky, duskK * 0.6);
    this.hemi.groundColor.copy(PAL.night.gnd).lerp(PAL.day.gnd, dayK);
    if (c.tintK > 0.01) this.hemi.color.lerp(c.tint, c.tintK * 0.4);
    this.hemi.intensity = (PAL.night.hemiI + (PAL.day.hemiI - PAL.night.hemiI) * dayK + duskK * 0.8) * (1 - Math.min(1, c.rain) * 0.25) + flash * 3;

    // fog distance
    const nf = 1 - nightK * 0.25;
    this.scene.fog.near = c.fogNear * nf;
    this.scene.fog.far = c.fogFar * nf;
    this.fogFar = this.scene.fog.far;

    // rain visuals
    const rainAmt = Math.min(1, c.rain);
    this.rain.visible = rainAmt > 0.02;
    this.splash.visible = rainAmt > 0.05;
    const cam = g.camera.position;
    for (const o of [this.rain, this.splash]) { o.material.uniforms.uCam.value.copy(cam); o.material.uniforms.uTime.value = el; o.material.uniforms.uAmt.value = rainAmt; }
    this.splash.material.uniforms.uScale.value = g.renderer.domElement.height / (2 * Math.tan((g.camera.fov * Math.PI) / 360));
    this.rain.material.uniforms.uCol.value.setScalar(0.35 + dayK * 0.35 + this.night * 0.1);
    // streets get wet fast and dry slowly
    this.wet = this.wet ?? 0;
    if (rainAmt > 0.05) this.wet = Math.min(1, this.wet + dt * 0.08 * rainAmt);
    else this.wet = Math.max(0, this.wet - dt * 0.004);

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
    return { night: this.night, wet: this.wet ?? 0, daylight: this.daylight, flash };
  }

  _updateLights(dt, focus) {
    if (!focus) return;
    this.assignT -= dt;
    const night = this.night;
    if (this.assignT <= 0) {
      this.assignT = 0.3;
      const cx = Math.floor(focus.x / 50), cz = Math.floor(focus.z / 50);
      const cand = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const arr = this.grid.get((cx + a) + ',' + (cz + b));
        if (!arr) continue;
        for (const s of arr) {
          const active = s.kind === 'fire' || night > 0.15;
          if (!active) continue;
          const d = Math.hypot(s.x - focus.x, s.z - focus.z);
          if (d < 60) cand.push([d - (s.kind === 'fire' ? 8 : s.kind === 'police' ? 6 : 0), s]);
        }
      }
      cand.sort((p, q) => p[0] - q[0]);
      const want = new Set(cand.slice(0, this.pool.length).map((c) => c[1]));
      // keep lights that are still wanted, reassign the rest
      const free = [];
      for (const L of this.pool) { if (L.userData.src && want.has(L.userData.src)) want.delete(L.userData.src); else free.push(L); }
      for (const s of want) { const L = free.pop(); if (!L) break; L.userData.src = s; L.userData.cur = 0; L.position.set(s.x, s.y, s.z); L.color.copy(s.col); }
      for (const L of free) L.userData.src = null;
    }
    const t = this.game.elapsed;
    for (const L of this.pool) {
      const s = L.userData.src;
      let target = 0;
      if (s) {
        switch (s.kind) {
          case 'fire': target = (5 + night * 9) * (0.75 + Math.sin(t * 13 + s.seed) * 0.12 + Math.sin(t * 23.7 + s.seed * 2) * 0.1); L.distance = 14; break;
          case 'flicker': target = night * 16 * ((Math.sin(t * 9 + s.seed) * Math.sin(t * 23 + s.seed) > 0.25 || Math.sin(t * 0.4 + s.seed) > 0.85) ? 0.05 : 1); L.distance = 24; break;
          case 'door': target = night * 10; L.distance = 12; break;
          case 'police': { const p = Math.floor(t * 4) % 2; L.color.set(p ? 0xff2020 : 0x2040ff); target = 4 + night * 14; L.distance = 18; break; }
          default: target = night * 13; L.distance = 24;
        }
      }
      L.userData.cur += (target - L.userData.cur) * Math.min(1, dt * (s?.kind === 'flicker' || s?.kind === 'fire' || s?.kind === 'police' ? 30 : 4));
      L.intensity = Math.max(0, L.userData.cur);
    }
  }
}
