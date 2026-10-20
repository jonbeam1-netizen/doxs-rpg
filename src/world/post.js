import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Grim grade: desaturate, crush blacks, sickly green/yellow mids, teal-ish
// shadows, vignette, animated grain, light chromatic aberration. Runs after
// OutputPass, so it works on display-referred (sRGB) values.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uDesat: { value: 0.32 }, uGrain: { value: 0.055 }, uVig: { value: 0.4 }, uCA: { value: 0.0035 }, uNight: { value: 0 }, uFlash: { value: 0 }, uWet: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uDesat, uGrain, uVig, uCA, uNight, uFlash, uWet; uniform vec2 uRes; uniform vec3 uTint;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      vec2 off = c * uCA * (0.4 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), uDesat);
      // split tone: greenish-teal shadows, sickly yellow mids/highs
      vec3 sh = vec3(0.92, 1.02, 1.0), hi = vec3(1.05, 1.03, 0.86);
      col *= mix(sh, hi, smoothstep(0.05, 0.6, l));
      col *= uTint;   // time-of-day grade: cold dawn, yellow smog noon, sickly orange dusk, blue-black night
      // crush blacks + gentle S curve
      col = max(col - 0.012, 0.0) / 0.988;
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.28);
      // vignette
      float v = (1.0 - smoothstep(0.18, 0.85, length(c * vec2(1.0, 0.85)) * 1.15));
      col *= mix(1.0 - uVig, 1.0, v);
      // grain (luma weighted)
      float n = hash(vUv * uRes + fract(uTime * 7.31) * 517.0) - 0.5;
      col += n * uGrain * (0.6 + (1.0 - l) * 0.8);
      col += vec3(0.75, 0.8, 0.95) * uFlash * 0.25;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Post {
  constructor(game) {
    this.game = game;
    const r = game.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(r.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
    this.renderPass = new RenderPass(game.scene, game.camera);
    this.composer.addPass(this.renderPass);
    // Kill NaN/Inf (tiny glossy highlights can overflow half floats) before bloom smears them.
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c = vec4(0.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 48.0), 1.0); }`,
    }));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.4, 0.35, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.enabled = true;
    game.bus.on('resize', ({ w, h }) => this.resize(w, h));
    this.resize(innerWidth, innerHeight);
  }

  resize(w, h) {
    this.composer.setPixelRatio(this.game.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.setSize(w / 2, h / 2);
    const s = this.game.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.grade.uniforms.uRes.value.set(s.x, s.y);
  }

  // MSAA samples of the scene render target (4 on High, fewer on Medium).
  setSamples(n) {
    const c = this.composer;
    for (const rt of [c.renderTarget1, c.renderTarget2]) {
      if (!rt || rt.samples === n) continue;
      rt.samples = n; rt.dispose();
    }
  }

  update(env) {
    const u = this.grade.uniforms;
    u.uTime.value = this.game.elapsed;
    u.uNight.value = env.night;
    if (env.grade) { u.uTint.value.copy(env.grade.tint); u.uDesat.value = env.grade.desat; }
    u.uFlash.value = env.flash ?? 0;
    // restrained bloom: only real light sources (lamps, neon, fire) should glow
    this.bloom.strength = 0.26 + env.night * 0.22;
    this.bloom.threshold = 0.92 - env.night * 0.05;
  }

  render(dt) {
    this.composer.render(dt);
  }
}
