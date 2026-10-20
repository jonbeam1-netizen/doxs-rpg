import * as THREE from 'three';
import { createStickman, lookToStickman, HAT_TYPES, BUILDS } from '../entities/stickman.js';
import { esc, pick } from '../core/util.js';

// Character creator shown on New Game. Resolves to
//   { name, look: { color, skin, hat, hatColor, build }, background }
// or null if the player backs out. Rendered inside the title layer with its
// own tiny WebGL renderer for the rotating preview.

// Starting backgrounds. Stat/cash bonuses are applied once by applyBackground();
// the `mult` values feed game.perks.mult() for the whole run (see src/progress/perks.js).
export const BACKGROUNDS = {
  dropout: {
    name: 'College Dropout', blurb: 'Two semesters of philosophy and a crippling vape habit.',
    perks: ['+4 INT', '+10% INT gains', '−$30 (overdue library fines)'],
    stats: { int: 4 }, money: -30, mult: { intGain: 1.1 },
  },
  gymrat: {
    name: 'Gym Rat', blurb: 'Never skipped leg day. Skipped every other day of school though.',
    perks: ['+4 STR', '+10% STR gains', '−1 INT (protein brain)'],
    stats: { str: 4, int: -1 }, mult: { strGain: 1.1 },
  },
  talker: {
    name: 'Smooth Talker', blurb: 'Could sell a used condom to a nun. Has, actually.',
    perks: ['+4 CHA', '+10% CHA gains', '5% shop discount'],
    stats: { cha: 4 }, mult: { chaGain: 1.1, shopDiscount: 0.95 },
  },
  nepo: {
    name: 'Nepo Baby', blurb: "Daddy cut you off, but not before one last 'loan'.",
    perks: ['+$1,500 starting cash', '−15 karma', '−10% job pay (you have never worked)'],
    stats: { karma: -15 }, money: 1500, mult: { jobPay: 0.9 },
  },
  excon: {
    name: 'Ex-Con', blurb: 'Fresh out of Rotwell County. Still has the shiv. Still has the tattoo of a sad wizard.',
    perks: ['Starts with a Switchblade', '+2 STR', 'Heat cools off 30% faster', 'Fines & bribes 20% cheaper', '−5 karma'],
    stats: { str: 2, karma: -5 }, weapons: ['knife'], mult: { heatDecay: 1.3, fineCost: 0.8 },
  },
  nobody: {
    name: 'Absolutely Nobody', blurb: 'No skills, no past, no fixed address. A blank, greasy slate.',
    perks: ['+1 perk point to start', 'Nobody expects anything from you'],
    points: 1,
  },
};

const BODY_COLORS = ['#141414', '#3a2f28', '#2c3b4a', '#4a2222', '#2e4a2a', '#5b4a2a', '#6a6a6a', '#d8d2c0'];
const SKIN_COLORS = [null, '#f1c9a5', '#d9a37a', '#a86b45', '#6e4329', '#3d2516', '#9fbf6a', '#c94f4f'];
const SKIN_NAMES = ['Same as body', 'Pale', 'Tan', 'Brown', 'Deep brown', 'Dark', 'Zombie chic', 'Sunburnt'];
const HAT_COLORS = ['#2a2420', '#7a1f2b', '#2c3b4a', '#c9a227', '#3e5a2a', '#d8d2c0', '#e2402f', '#141414'];
const HAT_NAMES = { fedora: 'Fedora (m\'lady)', cap: 'Ball cap', beanie: 'Beanie', tophat: 'Top hat', hardhat: 'Hard hat', cop: 'Cop hat (stolen)', crown: 'Beer-can crown' };

// Apply a background to a fresh save. Call after state.newGame().
export function applyBackground(game, id) {
  const bg = BACKGROUNDS[id];
  const p = game.state.p;
  p.background = id;
  if (!bg) return;
  for (const [k, v] of Object.entries(bg.stats || {})) {
    if (k === 'karma') p.karma = Math.max(-100, Math.min(100, p.karma + v));
    else p[k] = Math.max(1, (p[k] || 0) + v);
  }
  if (bg.money) p.money = Math.max(0, p.money + bg.money);
  for (const w of bg.weapons || []) if (!p.weapons.includes(w)) p.weapons.push(w);
  if (bg.points) { p.progress = p.progress || {}; p.progress.bonusPoints = (p.progress.bonusPoints || 0) + bg.points; }
  game.state.changed('all');
}

export function openCreator(game, layer, { name = 'Dox', look: initLook = null } = {}) {
  return new Promise((resolve) => {
    const look = Object.assign({ color: '#141414', skin: null, hat: null, hatColor: '#2a2420', build: 'average' }, initLook || {});
    let background = 'dropout';
    const wrap = document.createElement('div');
    wrap.className = 'creator';
    const sw = (arr, key, names) => arr.map((c, i) => `<button class="sw${c == null ? ' none' : ''}" data-k="${key}" data-v="${c ?? ''}" title="${names?.[i] ?? c}" style="${c ? `background:${c}` : ''}"></button>`).join('');
    wrap.innerHTML = `
      <div class="creator-head">
        <div class="creator-title">WHO THE HELL ARE YOU?</div>
        <div class="ui-muted">Rotwell doesn't care, but the paperwork does.</div>
      </div>
      <div class="creator-main">
        <div class="creator-preview">
          <canvas width="300" height="380"></canvas>
          <div class="creator-preview-name"></div>
          <div class="ui-row" style="justify-content:center">
            <button class="ui-btn" data-act="random">Randomize</button>
          </div>
        </div>
        <div class="creator-form">
          <label>Name</label>
          <input class="ui-input" id="cr-name" maxlength="16" value="${esc(name)}">
          <label>Clothes / body</label>
          <div class="swatches">${sw(BODY_COLORS, 'color')}<input type="color" data-k="color" value="${look.color}"></div>
          <label>Head / skin</label>
          <div class="swatches">${sw(SKIN_COLORS, 'skin', SKIN_NAMES)}</div>
          <label>Build</label>
          <div class="chips">${Object.entries(BUILDS).map(([k, b]) => `<button class="chip" data-k="build" data-v="${k}">${b.label}</button>`).join('')}</div>
          <label>Hat</label>
          <div class="chips"><button class="chip" data-k="hat" data-v="">Bare noggin</button>${HAT_TYPES.map((h) => `<button class="chip" data-k="hat" data-v="${h}">${HAT_NAMES[h] || h}</button>`).join('')}</div>
          <div class="swatches hatcol">${sw(HAT_COLORS, 'hatColor')}</div>
          <label>Background</label>
          <div class="cr-legend"><b>STR</b> hits harder, muscle jobs · <b>INT</b> office jobs, school · <b>CHA</b> sales, dates, discounts · <b>Karma</b> be nice. Or don't.</div>
          <div class="bgs">${Object.entries(BACKGROUNDS).map(([k, b]) => `
            <button class="bg-card" data-k="bg" data-v="${k}"><b>${b.name}</b><span>${b.blurb}</span>
              <ul>${b.perks.map((x) => `<li${/^[−-]/.test(x) ? ' class="cr-minus"' : ''}>${x}</li>`).join('')}</ul></button>`).join('')}</div>
        </div>
      </div>
      <div class="creator-foot">
        <button class="ui-btn" data-act="back">← Back</button>
        <span style="flex:1"></span>
        <button class="ui-btn primary" data-act="go">Crawl out of bed →</button>
      </div>`;
    layer.appendChild(wrap);

    const nameEl = wrap.querySelector('#cr-name');
    const nameTag = wrap.querySelector('.creator-preview-name');
    nameEl.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); });
    nameEl.addEventListener('input', () => { nameTag.textContent = nameEl.value || 'Dox'; });
    nameTag.textContent = name;

    // ---- preview renderer
    const canvas = wrap.querySelector('canvas');
    let renderer = null, scene, cam, model = null, raf = 0, angle = 0.4, last = performance.now();
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(300, 380, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      scene = new THREE.Scene();
      cam = new THREE.PerspectiveCamera(30, 300 / 380, 0.1, 50);
      cam.position.set(0, 1.45, 5.4);
      cam.lookAt(0, 1.08, 0);
      scene.add(new THREE.HemisphereLight(0xd8cbb0, 0x1a1612, 1.4));
      const key = new THREE.DirectionalLight(0xffe2b0, 2.2); key.position.set(2, 4, 3); scene.add(key);
      const rim = new THREE.DirectionalLight(0xb3261e, 1.6); rim.position.set(-3, 2, -3); scene.add(rim);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002;
      scene.add(floor);
    } catch (e) { console.warn('[creator] preview renderer failed', e); renderer = null; }

    function rebuild() {
      if (!renderer) return;
      if (model) model.dispose();
      model = createStickman({ ...lookToStickman(look), rim: { color: 0xffdcae, strength: 0.32 } }); // same edge light as in-game
      model.group.rotation.y = angle;
      scene.add(model.group);
      draw(0);
    }
    function draw(dt) {
      if (!renderer || !model) return;
      angle += dt * 0.9;
      model.group.rotation.y = angle;
      model.animate(dt, 0, {});
      renderer.render(scene, cam);
    }
    function loop() {
      const now = performance.now();
      draw(Math.min(0.1, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    // drag to spin
    let dragging = false, lx = 0;
    canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; canvas.setPointerCapture?.(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (dragging) { angle += (e.clientX - lx) * 0.02; lx = e.clientX; draw(0); } });
    canvas.addEventListener('pointerup', () => { dragging = false; });

    function refreshSelection() {
      wrap.querySelectorAll('[data-k]').forEach((b) => {
        const k = b.dataset.k, v = b.dataset.v;
        if (b.tagName === 'INPUT') return;
        const cur = k === 'bg' ? background : (look[k] ?? '');
        b.classList.toggle('sel', String(cur) === v);
      });
      wrap.querySelector('.hatcol').classList.toggle('dim', !look.hat);
    }

    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      game.audio?.ui?.('click');
      if (b.dataset.act === 'random') { randomize(); return; }
      if (b.dataset.act === 'back') { finish(false); return; }
      if (b.dataset.act === 'go') { finish(true); return; }
      const k = b.dataset.k;
      if (!k) return;
      const v = b.dataset.v;
      if (k === 'bg') background = v;
      else look[k] = v === '' ? null : v;
      refreshSelection();
      if (k !== 'bg') rebuild();
    });
    wrap.querySelector('input[type=color]').addEventListener('input', (e) => { look.color = e.target.value; refreshSelection(); rebuild(); });

    function randomize() {
      look.color = pick(BODY_COLORS);
      look.skin = pick(SKIN_COLORS);
      look.hat = Math.random() < 0.25 ? null : pick(HAT_TYPES);
      look.hatColor = pick(HAT_COLORS);
      look.build = pick(Object.keys(BUILDS));
      background = pick(Object.keys(BACKGROUNDS));
      refreshSelection();
      rebuild();
    }

    function finish(ok) {
      cancelAnimationFrame(raf);
      if (model) model.dispose();
      try { renderer?.dispose(); renderer?.forceContextLoss?.(); } catch { /* ignore */ }
      wrap.remove();
      if (!ok) { resolve(null); return; }
      resolve({ name: (nameEl.value.trim() || 'Dox').slice(0, 16), look: { ...look }, background });
    }

    refreshSelection();
    rebuild();
    setTimeout(() => nameEl.focus(), 50);
  });
}
