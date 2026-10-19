import * as THREE from 'three';
import { grimeTexture } from '../core/materials.js';
import * as T from './textures.js';

// Shared material registry for the whole city. Keys are used as geometry
// bucket names (see geo.js). update() animates night glow, neon flicker,
// police lights, rain wetness, etc. once per frame for ALL meshes at once.

export const FACADES = ['brick_red', 'brick_dirty', 'tenement', 'concrete', 'brownstone', 'glass', 'glass_green', 'stucco', 'stucco_pink', 'corrugated', 'corrugated_rust', 'wood', 'trailer', 'hospital', 'stone', 'industrial'];

export function createMaterials() {
  const M = {};
  const A = { night: [], neon: [], flick: [], wet: [], env: [], signs: [] };
  const reg = (key, mat, flags = {}) => { M[key] = { mat, cast: flags.cast ?? false, recv: flags.recv ?? true, detail: !!flags.detail, order: flags.order }; return mat; };
  const alias = (key, src, flags = {}) => { M[key] = { ...M[src], ...flags }; };

  const rep = (t, r = 1) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; if (r !== 1) t.repeat.set(r, r); return t; };

  // ---- ground / roads
  const groundC = T.groundCanvas();
  reg('ground', new THREE.MeshStandardMaterial({ map: T.toTex(groundC), normalMap: T.toTex(T.normalFromCanvas(groundC, 1.5), { srgb: false }), vertexColors: true, roughness: 1, metalness: 0 }));
  const asC = T.asphaltCanvas();
  const asphalt = reg('asphalt', new THREE.MeshStandardMaterial({ map: T.toTex(asC), normalMap: T.toTex(T.normalFromCanvas(asC, 2.2), { srgb: false }), vertexColors: true, roughness: 0.92, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  asphalt.userData.baseRough = 0.92; A.wet.push(asphalt); A.env.push(asphalt);
  const swC = T.sidewalkCanvas();
  const side = reg('sidewalk', new THREE.MeshStandardMaterial({ map: T.toTex(swC), normalMap: T.toTex(T.normalFromCanvas(swC, 2), { srgb: false }), vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  side.userData.baseRough = 0.95; A.wet.push(side); A.env.push(side);
  reg('marking', new THREE.MeshStandardMaterial({ map: T.toTex(T.wornPaintCanvas()), vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
  reg('decal_dark', new THREE.MeshStandardMaterial({ map: T.toTex(T.groundCanvas()), vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
  const puddle = reg('puddle', new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
  A.env.push(puddle);

  // ---- facades
  for (const f of FACADES) {
    const t = T.facadeTexture(f);
    const glass = f.startsWith('glass');
    const m = new THREE.MeshStandardMaterial({
      map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0,
      normalMap: t.normalMap ?? null, normalScale: new THREE.Vector2(0.8, 0.8),
      vertexColors: true, roughness: glass ? 0.25 : 0.9, metalness: glass ? 0.55 : 0.02,
    });
    m.userData.nightGain = glass ? 1.1 : 1.35;
    A.night.push(m);
    if (glass) A.env.push(m);
    reg('f_' + f, m, { cast: true });
  }
  for (const v of [0, 1]) {
    const t = T.storefrontTexture(v);
    const m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.8 });
    m.userData.nightGain = 1.5; m.userData.dayMin = 0.15;
    A.night.push(m);
    reg('store' + v, m, { cast: true });
  }
  reg('roof', new THREE.MeshStandardMaterial({ map: T.toTex(T.roofCanvas()), vertexColors: true, roughness: 0.95 }), { cast: true });
  reg('shingle', new THREE.MeshStandardMaterial({ map: T.toTex(T.shingleCanvas()), vertexColors: true, roughness: 0.9 }), { cast: true });
  reg('corr', new THREE.MeshStandardMaterial({ map: T.toTex(T.corrugatedCanvas('#77706a', 0.8)), vertexColors: true, roughness: 0.7, metalness: 0.35 }), { cast: true });
  reg('rust', new THREE.MeshStandardMaterial({ map: T.toTex(T.rustCanvas()), vertexColors: true, roughness: 0.75, metalness: 0.45 }), { cast: true });
  reg('wood', new THREE.MeshStandardMaterial({ map: T.toTex(T.woodCanvas()), vertexColors: true, roughness: 0.9 }), { cast: true });
  reg('container', new THREE.MeshStandardMaterial({ map: T.toTex(T.containerCanvas()), vertexColors: true, roughness: 0.7, metalness: 0.3 }), { cast: true });

  // ---- props (vertex colored)
  const pg = grimeTexture('#a8a49c', { grime: 0.7, size: 256 });
  reg('props', new THREE.MeshStandardMaterial({ map: pg, vertexColors: true, roughness: 0.85, metalness: 0.05 }), { cast: true });
  alias('props_d', 'props', { detail: true, cast: false });
  reg('metal', new THREE.MeshStandardMaterial({ map: pg, vertexColors: true, roughness: 0.5, metalness: 0.6 }), { cast: true });
  alias('metal_d', 'metal', { detail: true, cast: false });
  const glassDark = reg('glassdark', new THREE.MeshStandardMaterial({ color: 0x14181b, roughness: 0.08, metalness: 0.6, vertexColors: true }));
  A.env.push(glassDark);
  const gold = reg('gold', new THREE.MeshStandardMaterial({ map: grimeTexture('#d8b040', { grime: 0.35, size: 256 }), color: 0xffd060, roughness: 0.28, metalness: 0.95, vertexColors: true }), { cast: true });
  A.env.push(gold);
  reg('chain', new THREE.MeshStandardMaterial({ map: T.toTex(T.chainLinkCanvas()), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6, vertexColors: true }));
  alias('chain_d', 'chain', { detail: true });

  // ---- atlases
  const doors = T.doorAtlas();
  const dm = reg('doors', new THREE.MeshStandardMaterial({ map: doors.map, emissiveMap: doors.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  dm.userData.nightGain = 1.8; dm.userData.dayMin = 0.25; A.night.push(dm);
  const signs = T.signAtlas();
  const sm = reg('signs', new THREE.MeshStandardMaterial({ map: signs.map, emissiveMap: signs.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7, vertexColors: true }), { cast: true });
  sm.userData.nightGain = 2.2; sm.userData.dayMin = 0.25; A.night.push(sm);
  const ads = T.adAtlas();
  const am = reg('ads', new THREE.MeshStandardMaterial({ map: ads.map, emissiveMap: ads.map, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.8, vertexColors: true }), { cast: true });
  am.userData.nightGain = 0.55; A.night.push(am);
  const graf = T.graffitiAtlas();
  reg('graffiti', new THREE.MeshStandardMaterial({ map: graf.map, transparent: true, alphaTest: 0.3, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, vertexColors: true }), { detail: true });

  // ---- emissive / light
  const lamp = reg('lamp', new THREE.MeshBasicMaterial({ vertexColors: true }));
  lamp.userData.lo = 0.25; lamp.userData.hi = 3.2; A.neon.push(lamp);
  const lampF = reg('lamp_flk', new THREE.MeshBasicMaterial({ vertexColors: true }));
  lampF.userData.lo = 0.2; lampF.userData.hi = 3.0; lampF.userData.flk = 1; A.neon.push(lampF); A.flick.push(lampF);
  const neon = reg('neon', new THREE.MeshBasicMaterial({ vertexColors: true }));
  neon.userData.lo = 0.55; neon.userData.hi = 2.6; A.neon.push(neon);
  const neonF = reg('neon_flk', new THREE.MeshBasicMaterial({ vertexColors: true }));
  neonF.userData.lo = 0.5; neonF.userData.hi = 2.6; neonF.userData.flk = 2; A.neon.push(neonF); A.flick.push(neonF);
  const polR = reg('pol_r', new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  const polB = reg('pol_b', new THREE.MeshBasicMaterial({ color: 0x2040ff }));
  const beacon = reg('beacon', new THREE.MeshBasicMaterial({ color: 0xff1a10 }));
  const amber = reg('amber', new THREE.MeshBasicMaterial({ color: 0xffa020 }));
  const glowTex = T.toTex(T.glowCanvas(128), { repeat: false });
  const glow = reg('glow', new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffa860, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 }), { recv: false, order: 2 });
  const beam = reg('beam', new THREE.MeshBasicMaterial({ map: T.toTex(T.beamCanvas(), { repeat: false }), color: 0xffb070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, vertexColors: true }), { recv: false, order: 3, detail: true });
  const bulbTex = T.toTex(T.bulbCanvas());
  const chase = reg('chase', new THREE.MeshBasicMaterial({ map: bulbTex, vertexColors: true }));
  chase.userData.lo = 0.8; chase.userData.hi = 2.5; A.neon.push(chase);

  // Flames for fire barrels: animated shader on crossed quads.
  const flame = reg('flame', new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 uv = vUv; float seed = vW.x*1.7 + vW.z*2.3;
        float t = uTime*3.0 + seed;
        float nn = n(vec2(uv.x*4.0 + seed, uv.y*3.0 - t)) * 0.6 + n(vec2(uv.x*9.0, uv.y*7.0 - t*1.7)) * 0.4;
        float shape = (1.0 - abs(uv.x - 0.5) * 2.2) * (1.0 - uv.y);
        float f = smoothstep(0.15, 0.75, shape * 1.4 + nn * 0.6 - 0.25);
        vec3 col = mix(vec3(1.0,0.25,0.02), vec3(1.0,0.85,0.4), f*f);
        if (f < 0.02) discard;
        gl_FragColor = vec4(col * 2.6 * f, f);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }), { recv: false, order: 4 });

  // Water: oily black with moving normals.
  const wn = T.toTex(T.waterNormalCanvas(), { srgb: false });
  wn.repeat.set(40, 40);
  const water = reg('water', new THREE.MeshStandardMaterial({ color: 0x0b0d0c, roughness: 0.16, metalness: 0.55, normalMap: wn, normalScale: new THREE.Vector2(0.6, 0.6) }));
  A.env.push(water);

  // Far terrain: lambert, vertex colors, softer fog so hills read as silhouettes.
  const terrain = new THREE.MeshLambertMaterial({ vertexColors: true });
  terrain.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        float tf = smoothstep(fogNear, fogFar * 2.6, vFogDepth) * 0.86;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, tf);
      #endif`);
  };
  reg('terrain', terrain, { recv: false });

  const lines = new THREE.LineBasicMaterial({ color: 0x0c0b0a, transparent: true, opacity: 0.85 });
  M.lines = { mat: lines };

  // Per-location sign materials (unique textures)
  function signMaterial(tex, gain = 1.6) {
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.75 });
    m.userData.nightGain = gain; m.userData.dayMin = 0.12;
    A.night.push(m);
    return m;
  }

  let envMap = null;
  const state = { night: 0, wet: 0 };
  function setEnv(tex) {
    envMap = tex;
    for (const m of A.env) { m.envMap = tex; m.needsUpdate = true; }
  }

  function update(t, night, wet, daylight) {
    state.night = night; state.wet = wet;
    for (const m of A.night) {
      const g = m.userData.nightGain ?? 1.2;
      m.emissiveIntensity = (m.userData.dayMin ?? 0) * (1 - night) + night * g;
    }
    for (const m of A.neon) {
      let k = m.userData.lo + (m.userData.hi - m.userData.lo) * night;
      if (m.userData.flk) {
        const ph = t * (m.userData.flk === 1 ? 13.0 : 7.3);
        const f = Math.sin(ph) * Math.sin(ph * 2.71 + 1.3) + Math.sin(t * 0.7 + m.userData.flk);
        if (f > 1.1 || (Math.sin(t * 0.37 * m.userData.flk) > 0.93 && Math.sin(t * 31) > 0)) k *= 0.08;
      }
      m.color.setScalar(k);
    }
    // police strobes / beacons
    const p = Math.floor(t * 4) % 2;
    polR.color.setRGB(p ? 4 : 0.15, 0.05, 0.05);
    polB.color.setRGB(0.05, 0.08, p ? 0.15 : 4.5);
    const b = (Math.sin(t * 2.4) > 0.6) ? 4 : 0.2;
    beacon.color.setRGB(b, 0.05, 0.02);
    const am2 = (Math.floor(t * 1.4) % 2) ? 3 : 0.15;
    amber.color.setRGB(am2, am2 * 0.55, 0.02);
    glow.opacity = night * 0.85;
    beam.opacity = night * 0.11;
    chase.map.offset.x = Math.floor(t * 6) / 8;
    flame.uniforms.uTime.value = t;
    wn.offset.set(t * 0.004, t * 0.0025);
    // wet streets: glossier + darker
    for (const m of A.wet) {
      m.roughness = m.userData.baseRough - wet * 0.62;
      m.color.setScalar(1 - wet * 0.35);
      m.envMapIntensity = 0.12 + wet * 0.9;
    }
    puddle.envMapIntensity = 0.55 + wet * 0.6;
    puddle.opacity = 0.75 + wet * 0.2;
    water.envMapIntensity = 0.5 + daylight * 0.3;
    gold.envMapIntensity = 0.7;
  }

  return { M, update, signMaterial, setEnv, state, mats: { flame, glow, beam, water, polR, polB } };
}
