// Greasy Spoon minigames: dishwash (scrub on the beat) and linecook (build burgers, flip patties).
import { clamp, pick, chance, randInt } from '../../core/util.js';
import { shuffle, DIGITS, digitIndex } from '../minigame.js';
import { scene, cached, blit, offscreen, rr, ell, fs, line, blob, text, wrapText, glow, grime, rng, TAU, COL, FT, mix, easeOut, comboMeter, stick, meter } from './art.js';
import { drawIcon, howHtml, padIc } from './icons.js';

const L = 'ArrowLeft', R = 'ArrowRight', SP = 'Space', EN = 'Enter';

// ============================================================================================ DISHWASH
const DISHES = [
  { n: 'a plate', shape: 'plate', g: ['ketchup', 'yolk', 'crumbs'] },
  { n: 'a crusty skillet', shape: 'skillet', g: ['burnt', 'grease', 'burnt', 'crumbs'] },
  { n: 'a mug with a face in it', shape: 'mug', g: ['coffee', 'face', 'cig'] },
  { n: 'a gravy boat (shipwrecked)', shape: 'gravy', g: ['gravy', 'crumbs', 'mast'] },
  { n: 'a plate of fossilized egg', shape: 'plate', g: ['yolk', 'yolk', 'bacon', 'crumbs'] },
  { n: 'Marge\'s personal fork', shape: 'plate', fork: true, g: ['spaghetti', 'lipstick', 'ketchup'] },
  { n: 'a bowl that smells like feet', shape: 'bowl', stink: true, g: ['chili', 'mold'] },
  { n: 'a pan with a hair situation', shape: 'pan', g: ['grease', 'burnt', 'hair'] },
];
const GI = { plate: 0.8, bowl: 0.78, skillet: 0.86, pan: 0.82, mug: 0.6, gravy: 0.64 };

const GUNK = {
  ketchup(c, ri, R) {
    for (let k = 0; k < 2; k++) {
      const p = () => [(R() - 0.5) * ri * 1.4, (R() - 0.5) * ri * 1.4];
      const [a, b, d, e] = [p(), p(), p(), p()];
      c.beginPath(); c.moveTo(a[0], a[1]); c.bezierCurveTo(b[0], b[1], d[0], d[1], e[0], e[1]);
      c.lineCap = 'round'; c.strokeStyle = '#6a0c06'; c.lineWidth = 15; c.stroke(); c.strokeStyle = '#c4231a'; c.lineWidth = 11; c.stroke();
      c.strokeStyle = 'rgba(255,140,120,.55)'; c.lineWidth = 3; c.stroke();
    }
    const x = (R() - 0.5) * ri, y = (R() - 0.5) * ri;
    blob(c, x, y, ri * 0.2, R, 0.5); fs(c, '#b3180f', '#6a0c06', 2);
    ell(c, x - 4, y - 4, 5, 2.5, -0.5); c.fillStyle = 'rgba(255,200,190,.6)'; c.fill();
  },
  yolk(c, ri, R) {
    const x = (R() - 0.5) * ri * 0.8, y = (R() - 0.5) * ri * 0.8;
    blob(c, x, y, ri * 0.5, R, 0.55, 10); fs(c, '#f7f1de', '#b88a40', 3);
    blob(c, x + 6, y + 5, ri * 0.3, R, 0.5, 8); c.fillStyle = 'rgba(200,150,60,.18)'; c.fill();
    ell(c, x + 3, y - 2, ri * 0.22, ri * 0.2); fs(c, '#f2a614', '#a8600a', 2.5);
    blob(c, x + ri * 0.2, y + ri * 0.12, ri * 0.09, R, 0.5, 7, 1.6, 0.7); fs(c, '#e8a020');
    ell(c, x - 2, y - 6, 4, 2.5, -0.4); c.fillStyle = 'rgba(255,255,230,.8)'; c.fill();
  },
  crumbs(c, ri, R) { for (let i = 0; i < 26; i++) { blob(c, (R() - 0.5) * ri * 1.7, (R() - 0.5) * ri * 1.7, 1.5 + R() * 3.5, R, 0.6, 6); c.fillStyle = R() < 0.5 ? '#6a3a14' : '#b8864a'; c.fill(); } },
  spaghetti(c, ri, R) {
    for (let i = 0; i < 3; i++) { blob(c, (R() - 0.5) * ri, (R() - 0.5) * ri, ri * 0.16, R, 0.6); fs(c, '#a82a1a'); }
    for (let i = 0; i < 8; i++) {
      const p = () => [(R() - 0.5) * ri * 1.5, (R() - 0.5) * ri * 1.5];
      const [a, b, d, e] = [p(), p(), p(), p()];
      c.beginPath(); c.moveTo(a[0], a[1]); c.bezierCurveTo(b[0], b[1], d[0], d[1], e[0], e[1]);
      c.strokeStyle = '#9a7a30'; c.lineWidth = 4.5; c.stroke(); c.strokeStyle = '#f2dc96'; c.lineWidth = 2.8; c.stroke();
    }
  },
  burnt(c, ri, R) {
    for (let i = 0; i < 4; i++) { blob(c, (R() - 0.5) * ri * 1.2, (R() - 0.5) * ri * 1.2, ri * (0.18 + R() * 0.2), R, 0.6, 9); fs(c, 'rgba(18,12,8,.92)', '#4a2a14', 3); }
    for (let i = 0; i < 14; i++) { ell(c, (R() - 0.5) * ri * 1.4, (R() - 0.5) * ri * 1.4, 1 + R() * 2, 1 + R() * 2); c.fillStyle = '#5a3418'; c.fill(); }
  },
  grease(c, ri, R) {
    for (let i = 0; i < 5; i++) { blob(c, (R() - 0.5) * ri * 1.3, (R() - 0.5) * ri * 1.3, ri * (0.12 + R() * 0.18), R, 0.5); fs(c, 'rgba(214,170,40,.42)', 'rgba(150,110,20,.5)', 1.5); }
    for (let i = 0; i < 10; i++) { ell(c, (R() - 0.5) * ri * 1.3, (R() - 0.5) * ri * 1.3, 2, 1.2); c.fillStyle = 'rgba(255,255,220,.7)'; c.fill(); }
  },
  coffee(c, ri) {
    ell(c, 0, 0, ri * 0.98, ri * 0.98); fs(c, '#3a2010');
    ell(c, 0, 0, ri * 0.9, ri * 0.9); fs(c, null, 'rgba(160,110,60,.6)', 2.5);
    ell(c, 0, 0, ri * 1.0, ri * 1.0); fs(c, null, 'rgba(90,50,20,.8)', 3);
  },
  face(c, ri) {
    blob(c, 0, 0, ri * 0.6, rng(4), 0.2, 10); fs(c, '#e2c9a0', '#a07040', 1.5);
    ell(c, -ri * 0.22, -ri * 0.12, 4, 5); fs(c, '#5a3010'); ell(c, ri * 0.22, -ri * 0.12, 4, 5); fs(c, '#5a3010');
    c.beginPath(); c.arc(0, ri * 0.02, ri * 0.32, 0.15 * Math.PI, 0.85 * Math.PI); fs(c, null, '#5a3010', 3);
    for (let i = -2; i <= 2; i++) line(c, i * ri * 0.1, ri * 0.24, i * ri * 0.1, ri * 0.33, '#5a3010', 1.5);
  },
  cig(c, ri, R) {
    const x = ri * 0.38, y = ri * 0.32;
    for (let i = 0; i < 4; i++) { blob(c, x - 22 + R() * 14, y - 4 + R() * 10, 4 + R() * 4, R, 0.6); c.fillStyle = 'rgba(120,120,120,.6)'; c.fill(); }
    c.save(); c.translate(x, y); c.rotate(-0.5);
    rr(c, -16, -4, 26, 8, 2); fs(c, '#f2f0ea', '#000', 1.5);
    rr(c, 8, -4, 12, 8, 2); fs(c, '#d8902a', '#000', 1.5);
    rr(c, -20, -4, 6, 8, 2); fs(c, '#555', '#000', 1);
    c.restore();
  },
  gravy(c, ri, R) {
    blob(c, 0, 0, ri * 1.15, R, 0.2, 12, 1.25, 0.55); fs(c, '#6a3a18', '#3a1a08', 2);
    for (let i = 0; i < 6; i++) { c.beginPath(); const x = (R() - 0.5) * ri * 1.6, y = (R() - 0.5) * ri * 0.5; c.moveTo(x - 10, y); c.quadraticCurveTo(x, y - 5, x + 12, y + 1); fs(c, null, '#94602e', 2); }
  },
  mast(c, ri) {
    line(c, -ri * 0.1, ri * 0.12, -ri * 0.16, -ri * 0.75, '#d8b880', 3);
    c.beginPath(); c.moveTo(-ri * 0.15, -ri * 0.72); c.lineTo(ri * 0.3, -ri * 0.55); c.lineTo(-ri * 0.13, -ri * 0.36); c.closePath(); fs(c, '#efe8d6', '#000', 1.5);
    ell(c, ri * 0.0, -ri * 0.55, 3, 3); fs(c, '#111');
  },
  bacon(c, ri, R) { for (let i = 0; i < 7; i++) { c.save(); c.translate((R() - 0.5) * ri * 1.4, (R() - 0.5) * ri * 1.4); c.rotate(R() * 3); rr(c, -6, -2.5, 12, 5, 1.5); fs(c, '#8a2a1a', '#3a0a04', 1); line(c, -5, 0, 5, 0, '#f0c8b0', 1.2); c.restore(); } },
  lipstick(c, ri, R) {
    const a = R() * TAU;
    c.beginPath(); c.arc(0, 0, ri * 1.18, a, a + 0.8); c.strokeStyle = 'rgba(210,40,100,.7)'; c.lineWidth = 9; c.lineCap = 'round'; c.stroke();
    const x = Math.cos(a + 1.6) * ri * 0.75, y = Math.sin(a + 1.6) * ri * 0.75;
    ell(c, x, y - 3, 9, 4); fs(c, 'rgba(220,30,90,.8)'); ell(c, x, y + 3, 8, 4); fs(c, 'rgba(220,30,90,.8)');
  },
  chili(c, ri, R) {
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + R() * 0.3, d = ri * (0.78 + R() * 0.2); blob(c, Math.cos(a) * d, Math.sin(a) * d, 7 + R() * 8, R, 0.5); fs(c, '#7a2a14', '#3a1008', 1); }
    for (let i = 0; i < 9; i++) { ell(c, (R() - 0.5) * ri * 1.3, (R() - 0.5) * ri * 1.3, 4.5, 3, R() * 3); fs(c, '#5a1a0a', '#2a0804', 1); }
    blob(c, (R() - 0.5) * ri * 0.5, (R() - 0.5) * ri * 0.5, ri * 0.3, R, 0.5); fs(c, 'rgba(130,40,20,.75)');
  },
  mold(c, ri, R) {
    for (let i = 0; i < 6; i++) {
      const x = (R() - 0.5) * ri * 1.3, y = (R() - 0.5) * ri * 1.3, r = ri * (0.1 + R() * 0.16);
      blob(c, x, y, r, R, 0.6, 9); fs(c, '#6a9a3a', '#3a5a1a', 1.5);
      for (let k = 0; k < 6; k++) { ell(c, x + (R() - 0.5) * r * 1.4, y + (R() - 0.5) * r * 1.4, 1.5 + R() * 2, 1.5 + R() * 2); c.fillStyle = R() < 0.5 ? '#d8e8b0' : '#2a4a10'; c.fill(); }
    }
  },
  hair(c, ri, R) {
    for (let i = 0; i < 6; i++) {
      let x = (R() - 0.5) * ri * 1.2, y = (R() - 0.5) * ri * 1.2, a = R() * TAU;
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 14; k++) { a += (R() - 0.5) * 1.6; const nx = x + Math.cos(a) * 7, ny = y + Math.sin(a) * 7; c.quadraticCurveTo(x + Math.cos(a + 1) * 5, y + Math.sin(a + 1) * 5, nx, ny); x = nx; y = ny; }
      c.strokeStyle = '#1a120c'; c.lineWidth = 1.6; c.stroke();
    }
  },
};

function dishBase(c, d, Rd) {
  const s = d.shape;
  ell(c, 5, 9, Rd * (s === 'gravy' ? 1.15 : 1), Rd * (s === 'gravy' ? 0.7 : 0.97)); c.fillStyle = 'rgba(0,0,0,.35)'; c.fill();
  if (s === 'skillet' || s === 'pan') {
    c.save(); c.rotate(0.55); rr(c, Rd * 0.85, -11, Rd * 0.85, 22, 9); fs(c, s === 'pan' ? '#7a8086' : '#1c1a18', '#000', 3); c.restore();
  }
  if (s === 'mug') { ell(c, Rd * 0.78, Rd * 0.12, Rd * 0.3, Rd * 0.24); fs(c, null, '#000', 17); ell(c, Rd * 0.78, Rd * 0.12, Rd * 0.3, Rd * 0.24); fs(c, null, '#c8402a', 12); }
  if (s === 'gravy') {
    c.beginPath(); c.moveTo(-Rd * 1.22, -Rd * 0.12); c.quadraticCurveTo(-Rd * 0.9, -Rd * 0.6, 0, -Rd * 0.62); c.quadraticCurveTo(Rd * 1.05, -Rd * 0.6, Rd * 1.05, 0); c.quadraticCurveTo(Rd * 1.0, Rd * 0.62, 0, Rd * 0.62); c.quadraticCurveTo(-Rd * 0.85, Rd * 0.6, -Rd * 1.22, -Rd * 0.12); c.closePath();
    fs(c, '#f2eee4', '#000', 3);
    ell(c, Rd * 1.12, 0, Rd * 0.18, Rd * 0.3); fs(c, null, '#000', 8); ell(c, Rd * 1.12, 0, Rd * 0.18, Rd * 0.3); fs(c, null, '#f2eee4', 5);
    ell(c, -Rd * 0.05, 0, Rd * 0.88, Rd * 0.46); fs(c, '#e4dfd2', 'rgba(0,0,0,.2)', 2);
    return;
  }
  const outer = { plate: ['#f6f3ea', '#d6d0c2'], bowl: ['#e2d8c0', '#b8ac90'], skillet: ['#3a3633', '#1c1a18'], pan: ['#c4c9ce', '#80868c'], mug: ['#d8503a', '#9a2a1a'] }[s];
  const rO = s === 'mug' ? Rd * 0.72 : Rd;
  const g = c.createRadialGradient(-rO * 0.3, -rO * 0.3, rO * 0.1, 0, 0, rO);
  g.addColorStop(0, outer[0]); g.addColorStop(1, outer[1]);
  ell(c, 0, 0, rO, rO); fs(c, g, '#000', 3);
  if (s === 'plate') { ell(c, 0, 0, Rd * 0.9, Rd * 0.9); fs(c, null, '#4a6a9a', 2.5); ell(c, 0, 0, Rd * 0.68, Rd * 0.68); fs(c, '#ece8dd', 'rgba(0,0,0,.18)', 2); }
  if (s === 'bowl') { ell(c, 0, 0, Rd * 0.88, Rd * 0.88); fs(c, null, '#a0522d', 3); const g2 = c.createRadialGradient(0, 0, 0, 0, 0, Rd * 0.8); g2.addColorStop(0, '#c8bea6'); g2.addColorStop(1, '#efe8d4'); ell(c, 0, 0, Rd * 0.8, Rd * 0.8); fs(c, g2, 'rgba(0,0,0,.25)', 2); }
  if (s === 'skillet') { const g2 = c.createRadialGradient(0, 0, 0, 0, 0, Rd * 0.86); g2.addColorStop(0, '#45403c'); g2.addColorStop(1, '#2a2725'); ell(c, 0, 0, Rd * 0.86, Rd * 0.86); fs(c, g2, '#111', 2); }
  if (s === 'pan') { ell(c, 0, 0, Rd * 0.84, Rd * 0.84); fs(c, '#d4d8dc', '#6a7076', 2); for (let i = 0; i < 3; i++) { ell(c, 0, 0, Rd * (0.25 + i * 0.2), Rd * (0.25 + i * 0.2)); fs(c, null, 'rgba(255,255,255,.25)', 1); } }
  if (s === 'mug') { ell(c, 0, 0, Rd * 0.6, Rd * 0.6); fs(c, '#efe6d6', '#6a1a10', 2); }
  c.beginPath(); c.arc(0, 0, rO * 0.94, 3.6, 4.6); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3; c.stroke();
}
function makeDish(def) {
  const Rd = 88, sz = Rd * 2 + 60;
  const [cv, c] = offscreen(sz, sz);
  c.translate(sz / 2, sz / 2);
  const R = rng((Math.random() * 1e9) | 0);
  const ri = Rd * GI[def.shape];
  for (const g of def.g) { try { GUNK[g](c, ri, R); } catch (e) { console.error(e); } }
  return { def, cv, sz, Rd, seed: (Math.random() * 1e6) | 0 };
}
function drawDish(c, dish, x, y, s, wipe, t) {
  const { Rd, cv, sz, def } = dish;
  c.save(); c.translate(x, y); c.scale(s, s);
  dishBase(c, def, Rd);
  if (wipe < 1) {
    const top = -Rd - 14, h = Rd * 2 + 28, ly = top + wipe * h;
    // ghost smear above the wipe line (you are, at best, moving the grime around)
    c.save(); c.globalAlpha = 0.12 * (1 - wipe); c.drawImage(cv, -sz / 2, -sz / 2, sz, sz); c.restore();
    c.save(); c.beginPath(); c.moveTo(-sz / 2, ly);
    for (let i = 0; i <= 12; i++) c.lineTo(-sz / 2 + (i / 12) * sz, ly + Math.sin(i * 1.3 + dish.seed) * 4);
    c.lineTo(sz / 2, sz / 2); c.lineTo(-sz / 2, sz / 2); c.closePath(); c.clip();
    c.drawImage(cv, -sz / 2, -sz / 2, sz, sz);
    c.restore();
    // suds riding the wipe line
    if (wipe > 0.02) {
      const half = Math.sqrt(Math.max(0, Rd * Rd - ly * ly)) * 0.9;
      for (let i = 0; i < 10; i++) {
        const bx = -half + ((i + 0.5) / 10) * half * 2, by = ly + Math.sin(i * 1.7 + t * 4) * 3;
        const br = 4 + ((i * 37) % 5);
        ell(c, bx, by, br, br); fs(c, 'rgba(255,255,255,.55)', 'rgba(255,255,255,.95)', 1.2);
      }
    }
  } else {
    c.beginPath(); c.arc(0, 0, Rd * 0.8, 3.7, 4.3); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 6; c.stroke();
  }
  if (def.fork) {
    c.save(); c.rotate(-0.7);
    rr(c, -6, 4, 12, Rd * 0.85, 5); fs(c, '#c8ccd0', '#000', 2);
    rr(c, -12, -Rd * 0.35, 24, Rd * 0.42, 6); fs(c, '#c8ccd0', '#000', 2);
    for (let i = 0; i < 3; i++) { c.fillStyle = '#5a5e62'; c.fillRect(-6 + i * 5, -Rd * 0.35, 2.5, Rd * 0.25); }
    if (wipe < 1) { ell(c, 0, -Rd * 0.2, 9, 7); c.fillStyle = `rgba(242,220,150,${0.9 * (1 - wipe)})`; c.fill(); }
    c.restore();
  }
  if (def.stink && wipe < 1) {
    for (let i = 0; i < 3; i++) {
      const bx = -30 + i * 30, ph = t * 2 + i;
      c.beginPath(); c.moveTo(bx, -Rd * 0.6);
      for (let k = 1; k < 8; k++) c.lineTo(bx + Math.sin(ph + k * 0.9) * 7, -Rd * 0.6 - k * 9);
      c.strokeStyle = `rgba(150,200,70,${0.8 * (1 - wipe)})`; c.lineWidth = 3.5; c.stroke();
    }
  }
  c.restore();
}
function dwBackground(c, W, H) {
  c.fillStyle = '#4c5452'; c.fillRect(0, 0, W, H);
  for (let y = 0; y < 196; y += 22) for (let x = (y / 22) % 2 ? -16 : 0; x < W; x += 32) { rr(c, x + 1, y + 1, 30, 20, 2); fs(c, '#bfc3bb'); }
  const R = rng(77);
  grime(c, 0, 0, W, 196, 90, R, 'rgba(70,55,30,', 0.25);
  for (let i = 0; i < 7; i++) { const x = R() * W; const g = c.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, 'rgba(90,60,20,.35)'); g.addColorStop(1, 'rgba(90,60,20,0)'); c.fillStyle = g; c.fillRect(x, 0, 4 + R() * 8, 60 + R() * 80); }
  // sign
  c.save(); c.translate(470, 14); c.rotate(0.04); rr(c, 0, 0, 116, 46, 2); fs(c, '#efe8d6', '#000', 2);
  text(c, 'EMPLOYEES MUST', 58, 13, { size: 12, color: '#6d1510', stroke: null, fam: FT }); text(c, 'WASH HANDS', 58, 26, { size: 12, color: '#6d1510', stroke: null, fam: FT }); text(c, '(eventually)', 58, 38, { size: 11, color: '#555', stroke: null, fam: FT });
  c.restore();
  // counter
  const g = c.createLinearGradient(0, 196, 0, H); g.addColorStop(0, '#9aa0a6'); g.addColorStop(0.08, '#6e757b'); g.addColorStop(1, '#3e4448');
  c.fillStyle = g; c.fillRect(0, 196, W, H - 196); line(c, 0, 197, W, 197, '#d0d6da', 2);
  grime(c, 0, 200, W, 100, 40, R, 'rgba(30,20,10,', 0.3);
  // sink basin
  rr(c, 176, 92, 248, 200, 16); fs(c, '#70777d', '#000', 3);
  rr(c, 188, 104, 224, 184, 12); const g2 = c.createLinearGradient(0, 104, 0, 288); g2.addColorStop(0, '#2a3034'); g2.addColorStop(1, '#4a5258'); fs(c, g2, '#000', 2);
  rr(c, 190, 150, 220, 136, 10); const g3 = c.createLinearGradient(0, 150, 0, 286); g3.addColorStop(0, 'rgba(110,130,100,.85)'); g3.addColorStop(1, 'rgba(60,72,52,.95)'); fs(c, g3);
  for (let i = 0; i < 14; i++) { ell(c, 196 + R() * 208, 160 + R() * 120, 2 + R() * 5, 1 + R() * 2); c.fillStyle = 'rgba(200,190,120,.35)'; c.fill(); }
  // faucet
  c.lineCap = 'round';
  rr(c, 196, 74, 22, 26, 4); fs(c, '#a8aeb4', '#000', 2);
  c.beginPath(); c.moveTo(207, 76); c.quadraticCurveTo(207, 36, 240, 40); c.lineTo(246, 52); c.strokeStyle = '#000'; c.lineWidth = 13; c.stroke(); c.strokeStyle = '#b8bec4'; c.lineWidth = 8; c.stroke();
  for (const x of [178, 236]) { ell(c, x, 90, 9, 6); fs(c, '#c8ccd0', '#000', 2); }
}
function plateStack(c, x, y, n, clean, R, t) {
  for (let i = 0; i < n; i++) {
    const yy = y - i * 10;
    ell(c, x, yy + 3, 56, 13); fs(c, clean ? '#c8c4b8' : '#a8a090', '#000', 2);
    ell(c, x, yy, 56, 13); fs(c, clean ? '#faf8f2' : '#e2ddd0', '#000', 2);
    ell(c, x, yy, 50, 10); fs(c, null, clean ? '#4a6a9a' : '#8a8478', 1.5);
    if (!clean) { const rr2 = rng(i * 13 + 5); for (let k = 0; k < 3; k++) { ell(c, x - 40 + rr2() * 80, yy - 4 + rr2() * 8, 4 + rr2() * 6, 2 + rr2() * 2); c.fillStyle = ['#b3180f', '#6a3a14', '#e8a020', '#6a9a3a'][(rr2() * 4) | 0]; c.fill(); } }
  }
  if (!clean && n) { for (let i = 0; i < 3; i++) { const a = t * (3 + i) + i * 2; const fx = x + Math.cos(a) * (24 + i * 6), fy = y - n * 10 - 22 + Math.sin(a * 1.3) * 10; ell(c, fx, fy, 2.5, 2.5); c.fillStyle = '#111'; c.fill(); ell(c, fx - 2, fy - 2.5, 2.5, 1.4); c.fillStyle = 'rgba(220,230,255,.7)'; c.fill(); } }
  if (clean && n) { const tw = (Math.sin(t * 5) + 1) / 2; c.save(); c.translate(x + 30, y - n * 10 - 6); c.rotate(t); c.globalAlpha = 0.5 + tw * 0.5; c.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 3 : 10 + tw * 4; c.lineTo(Math.cos((i / 8) * TAU) * r, Math.sin((i / 8) * TAU) * r); } c.closePath(); c.fillStyle = '#fff'; c.fill(); c.restore(); }
}

export function registerKitchen(mg) {
  mg.register('dishwash', {
    name: 'The Dish Pit',
    how: howHtml([
      { ic: 'sponge', t: 'The sponge swings across the dish. Hit the side it <b>just reached</b>.' },
      { ic: 'arrowL', k: ['←', 'A'], t: 'when it hits the <b>LEFT</b> edge' },
      { ic: 'arrowR', k: ['→', 'D'], t: 'when it hits the <b>RIGHT</b> edge' },
      { ic: 'ok', t: '<b>On the beat</b> wipes the gunk off. Mashing splashes you.' },
    ], '30 seconds · clean <b>9 dishes</b> for full marks. Or tap the big buttons.'),
    lines: {
      S: ['Marge holds a plate up to the light. She can see her own regrets in it. Perfect.'],
      F: ['The plates are dirtier than when they came in. You have invented anti-washing.'],
    },
    create(api) {
      const T = 30, beat = 0.5 - 0.1 * api.diff, target = 9;
      let t = 0, plates = 0, last = -9, grime2 = 0, max = 1, perfect = 0, streak = 0, name = '';
      let dish = null, wipe = 0, slide = null, sudsT = 0;
      const S = scene(api, 600, 300);
      api.pad([{ k: L, label: '◀ SCRUB', sub: '← / A' }, { k: R, label: 'SCRUB ▶', sub: '→ / D' }]);
      const DX = 300, DY = 150;
      const newPlate = () => {
        max = grime2 = 5 + randInt(0, 2) + Math.round(api.diff * 2);
        const def = pick(DISHES); name = def.n;
        if (dish) slide = { old: dish, oldWipe: 1, t: 0 };
        dish = makeDish(def); wipe = 0;
      };
      const sc = () => api.score(`🍽️ ${plates}/${target}`);
      newPlate(); sc();
      const score = () => clamp((plates + (1 - grime2 / max) * 0.5) / target, 0, 1);
      const spongeX = () => { const ph = (t / beat) % 2; return ph < 1 ? ph : 2 - ph; };
      const draw = (c, tt) => {
        blit(c, cached('dw:bg', 600, 300, dwBackground), 0, 0);
        // water ripples
        for (let i = 0; i < 3; i++) { const k = ((tt * 0.4 + i / 3) % 1); ell(c, 300 + (i - 1) * 50, 250 + i * 8, 20 + k * 40, 4 + k * 8); fs(c, null, `rgba(220,230,200,${0.35 * (1 - k)})`, 1.5); }
        plateStack(c, 95, 262, clamp(target - plates, 2, 8), false, null, tt);
        plateStack(c, 505, 262, Math.min(plates, 12), true, null, tt);
        text(c, 'DIRTY', 95, 286, { size: 15, color: '#e2b090', lw: 4 });
        text(c, `CLEAN ${plates}/${target}`, 505, 286, { size: 15, color: plates >= target ? COL.gold : '#bfe0a0', lw: 4 });
        // dish (+ slide animation)
        if (slide) {
          slide.t += 1 / 60;
          const k = easeOut(Math.min(1, slide.t / 0.35));
          drawDish(c, slide.old, DX + (505 - DX) * k, DY + (262 - Math.min(plates, 12) * 10 - 10 - DY) * k, 1 - 0.6 * k, 1, tt);
          drawDish(c, dish, 95 + (DX - 95) * k, 200 + (DY - 200) * k, 0.4 + 0.6 * k, wipe, tt);
          if (slide.t >= 0.35) slide = null;
        } else drawDish(c, dish, DX, DY, 1, wipe, tt);
        // beat brackets + sponge
        const x = spongeX();
        const gl = clamp(1 - x / 0.18, 0, 1), gr = clamp(1 - (1 - x) / 0.18, 0, 1);
        for (const [side, g] of [[-1, gl], [1, gr]]) {
          const a0 = side < 0 ? Math.PI * 0.78 : -Math.PI * 0.22;
          glow(c, DX + side * 102, DY, 40, `rgba(255,216,74,${0.55 * g})`);
          c.beginPath(); c.arc(DX, DY, 102, a0, a0 + Math.PI * 0.44); c.strokeStyle = '#000'; c.lineWidth = 11; c.lineCap = 'round'; c.stroke();
          c.strokeStyle = mix('#5a6a48', '#ffd84a', g); c.lineWidth = 7; c.stroke();
          rr(c, DX + side * 128 - 15, DY - 15, 30, 30, 5); fs(c, mix('#2a241c', '#6a5a1a', g), '#000', 2);
          text(c, side < 0 ? '←' : '→', DX + side * 128, DY + 1, { size: 20, color: mix('#a9a291', '#ffffff', g), lw: 0, stroke: null });
          S.hit(side < 0 ? 150 : 300, 40, 150, 220, side < 0 ? L : R);
        }
        const wy = clamp(DY - 102 + wipe * 204, DY - 55, DY + 55);
        const sx = DX + (x * 2 - 1) * 74, sy = wy + Math.sin(tt * 14) * 3;
        drawIcon(c, 'sponge', sx, sy, 92, (x - 0.5) * 0.5 + Math.sin(tt * 9) * 0.06);
        if (wipe < 1 && (sudsT -= 1 / 60) <= 0) { sudsT = 0.12; S.burst(sx, sy - 10, { n: 1, shape: 'bubble', size: 5, speed: 30, g: -40, life: 0.8 }); }
        text(c, `Now scrubbing: ${name}`, DX, 18, { size: 17, color: COL.bone, lw: 4 });
        meter(c, DX - 60, 30, 120, 10, 1 - grime2 / max, '#7fbf4d', '#1d1915');
        comboMeter(c, S, streak, 560, 70, 'SQUEAKY');
      };
      return {
        partial: score,
        tick(dt) {
          t += dt;
          wipe += ((1 - grime2 / max) - wipe) * Math.min(1, dt * 12);
          api.time(1 - t / T);
          S.frame(dt, draw);
          if (t >= T) api.done(score(), { stats: `${plates} plates · ${perfect} perfect scrubs` });
        },
        key(code) {
          if (code !== L && code !== R) return false;
          const sx = DX + (spongeX() * 2 - 1) * 74;
          if (t - last < beat * 0.7) {
            last = t; streak = 0;
            api.msg(pick(['Too fast! Dishwater in the mouth.', 'Splash! That\'s not scrubbing, that\'s a tantrum.', 'Slow down, you animal.']), 'bad', 700); api.sfx('whoosh');
            S.burst(sx, DY, { n: 14, shape: 'drop', color: '#8fb0a8', speed: 220, life: 0.6 }); S.shake(4);
            return;
          }
          last = t;
          const want = code === L ? 0 : 1;
          const n = t / beat;
          let k = Math.round(n);
          if ((((k % 2) + 2) % 2) !== want) k = n > k ? k + 1 : k - 1;
          const err = Math.abs(n - k) * beat;
          const power = err < 0.08 ? 1 : err < 0.16 ? 0.55 : 0.15;
          if (power === 1) { perfect++; streak++; api.sfx('squeak'); S.burst(sx, DY, { n: 9, shape: 'bubble', size: 7, speed: 120, g: -30, life: 0.9 }); S.pop(streak >= 3 ? `SQUEAK x${streak}` : 'SQUEAK!', sx, DY - 50, { color: COL.gold, size: 22 }); }
          else { api.sfx('scrub'); S.burst(sx, DY, { n: 4, shape: 'bubble', size: 5, speed: 70, g: -20 }); }
          if (power < 0.5) { streak = 0; S.mark(false, sx, DY - 50); api.msg(pick(['Off beat. You\'re just smearing it.', 'Wrong side, genius.', 'You rub it like it owes you money. It doesn\'t help.']), 'bad', 600); }
          grime2 -= power;
          if (grime2 <= 0) {
            plates++; api.sfx('hit');
            S.burst(DX, DY, { n: 16, shape: 'star', colors: ['#fff', '#ffd84a', '#bfe8ff'], size: 7, speed: 200, g: 60, life: 0.8 });
            S.mark(true, DX, DY - 40, '+1 CLEAN');
            if (plates === target) api.msg('Quota hit! Marge throws more plates at you anyway.', 'good');
            newPlate(); sc();
          }
        },
      };
    },
  });

  // ========================================================================================== LINECOOK
  const ING = [
    { id: 'bun', ic: 'bun', n: 'Bun' }, { id: 'patty', ic: 'patty', n: 'Patty' }, { id: 'cheese', ic: 'cheese', n: 'Cheese' },
    { id: 'lettuce', ic: 'lettuce', n: 'Lettuce' }, { id: 'onion', ic: 'onion', n: 'Onion' }, { id: 'pickle', ic: 'pickle', n: 'Pickle' },
    { id: 'sauce', ic: 'sauce', n: 'Marge Sauce' },
  ];
  const BURGERS = ['The Heart Attack', 'The Trucker\'s Regret', 'Double Divorce', 'The Wet Napkin', 'Grandpa\'s Last Meal', 'The Sad Tuesday', 'The Cholesterol Bomb', 'The Morning After', 'The Hairnet Special'];
  const cookCol = (x) => x < 0.56 ? mix('#d9808a', '#9a5a30', x / 0.56) : x < 0.82 ? mix('#9a5a30', '#5e3418', (x - 0.56) / 0.26) : mix('#5e3418', '#18110d', Math.min(1, (x - 0.82) / 0.2));
  const LH = { bunbot: 22, bun: 40, patty: 18, cheese: 7, lettuce: 11, onion: 8, pickle: 8, sauce: 6 };
  function layer(c, id, cx, y, cook, age, t) {
    // y = bottom of this layer; returns its height
    const w = 136;
    if (id === 'bunbot') { rr(c, cx - w / 2, y - 22, w, 22, 9); const g = c.createLinearGradient(0, y - 22, 0, y); g.addColorStop(0, '#f1d39a'); g.addColorStop(0.4, '#e0a452'); g.addColorStop(1, '#a8621f'); fs(c, g, '#000', 2.5); }
    else if (id === 'bun') {
      c.beginPath(); c.moveTo(cx - w / 2 - 2, y); c.quadraticCurveTo(cx - w / 2, y - 42, cx, y - 42); c.quadraticCurveTo(cx + w / 2, y - 42, cx + w / 2 + 2, y); c.closePath();
      const g = c.createLinearGradient(0, y - 42, 0, y); g.addColorStop(0, '#eaa856'); g.addColorStop(1, '#b06a28'); fs(c, g, '#000', 2.5);
      for (let i = 0; i < 9; i++) { ell(c, cx - 50 + ((i * 37) % 100), y - 14 - ((i * 23) % 22), 3.4, 1.7, (i % 3) - 1); fs(c, '#fbf3dc', '#7a5020', 0.8); }
      ell(c, cx - 30, y - 30, 16, 5, -0.2); c.fillStyle = 'rgba(255,255,255,.22)'; c.fill();
    } else if (id === 'patty') {
      blob(c, cx, y - 9, 68, rng(Math.round(cook * 100) + 3), 0.05, 16, 1, 0.14); fs(c, cookCol(cook), '#000', 2.5);
      for (let i = 0; i < 8; i++) { ell(c, cx - 55 + i * 15, y - 9 + ((i * 7) % 5) - 2, 3, 1.6); c.fillStyle = 'rgba(0,0,0,.25)'; c.fill(); }
      if (cook > 0.95) { c.save(); c.globalAlpha = 0.4 + 0.3 * Math.sin(t * 3); ell(c, cx + 30, y - 30, 14, 8); c.fillStyle = '#777'; c.fill(); c.restore(); }
    } else if (id === 'cheese') {
      const drip = Math.min(16, age * 12);
      c.beginPath(); c.moveTo(cx - w / 2 - 4, y - 7); c.lineTo(cx + w / 2 + 4, y - 7); c.lineTo(cx + w / 2 + 4, y);
      for (const [dx, dl] of [[56, 1], [30, 0.6], [-4, 1.2], [-36, 0.7], [-60, 0.9]]) { c.lineTo(cx + dx + 6, y); c.quadraticCurveTo(cx + dx, y + drip * dl * 1.4, cx + dx - 6, y); }
      c.lineTo(cx - w / 2 - 4, y); c.closePath(); fs(c, '#f4c430', '#8a6a10', 2);
    } else if (id === 'lettuce') {
      c.beginPath(); c.moveTo(cx - w / 2 - 8, y - 4);
      for (let i = 0; i <= 12; i++) c.quadraticCurveTo(cx - w / 2 - 8 + i * 12.6 - 6, y + (i % 2 ? 6 : -2), cx - w / 2 - 8 + i * 12.6, y - 3);
      c.lineTo(cx + w / 2 + 8, y - 11); for (let i = 12; i >= 0; i--) c.lineTo(cx - w / 2 - 8 + i * 12.6, y - 9 - (i % 2) * 3);
      c.closePath(); fs(c, '#6cb53e', '#2a5a14', 2);
    } else if (id === 'onion') { for (let i = 0; i < 4; i++) { ell(c, cx - 48 + i * 32, y - 4, 16, 4); fs(c, 'rgba(240,226,244,.95)', '#8a4a9a', 2); } }
    else if (id === 'pickle') { for (let i = 0; i < 4; i++) { ell(c, cx - 48 + i * 32, y - 4, 14, 4.5); fs(c, '#a9c95e', '#3a6a1a', 2); } }
    else if (id === 'sauce') { c.beginPath(); c.moveTo(cx - w / 2, y - 3); for (let i = 0; i <= 10; i++) c.lineTo(cx - w / 2 + i * 13.6, y - 3 + (i % 2 ? 4 : -3)); c.strokeStyle = '#3a1a08'; c.lineWidth = 7; c.lineCap = 'round'; c.stroke(); c.strokeStyle = '#8a4a1c'; c.lineWidth = 4.5; c.stroke(); }
    return LH[id] || 10;
  }
  function lcBackground(c, W, H) {
    c.fillStyle = '#2c2622'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < 230; y += 20) for (let x = 0; x < W; x += 28) { rr(c, x + 1, y + 1, 26, 18, 2); fs(c, y < 40 ? '#4a423a' : '#5a5048'); }
    const R = rng(12);
    grime(c, 0, 0, W, 230, 120, R, 'rgba(40,25,10,', 0.35);
    // ticket rail
    rr(c, 4, 6, 244, 10, 3); fs(c, '#a8aeb4', '#000', 2);
    // pass-through window to Marge's side
    rr(c, 262, 18, 172, 118, 4); fs(c, '#6a7076', '#000', 3);
    rr(c, 270, 26, 156, 102, 2); fs(c, '#1a1612');
    text(c, 'ORDER UP', 348, 12, { size: 12, color: '#e8c050', stroke: '#000', lw: 3, fam: FT });
    for (const x of [300, 396]) { line(c, x, 0, x, 30, '#222', 2); c.beginPath(); c.moveTo(x - 16, 44); c.quadraticCurveTo(x, 22, x + 16, 44); c.closePath(); fs(c, '#8a1a12', '#000', 2); ell(c, x, 46, 9, 4); fs(c, '#ff9a4a'); }
    // counter
    const g = c.createLinearGradient(0, 230, 0, H); g.addColorStop(0, '#8a9096'); g.addColorStop(1, '#3a4044');
    c.fillStyle = g; c.fillRect(250, 236, W - 250, H - 236); line(c, 250, 237, W, 237, '#d0d6da', 2);
    // griddle
    c.beginPath(); c.moveTo(452, 150); c.lineTo(634, 150); c.lineTo(640, 236); c.lineTo(446, 236); c.closePath();
    const g2 = c.createLinearGradient(0, 150, 0, 236); g2.addColorStop(0, '#2a2826'); g2.addColorStop(1, '#4a4642'); fs(c, g2, '#000', 3);
    for (let i = 0; i < 6; i++) { blob(c, 470 + R() * 150, 165 + R() * 60, 6 + R() * 12, R, 0.5, 8, 1, 0.5); c.fillStyle = 'rgba(200,160,60,.18)'; c.fill(); }
    rr(c, 444, 234, 198, 14, 2); fs(c, '#6a7076', '#000', 2);
    for (let i = 0; i < 3; i++) { ell(c, 480 + i * 60, 255, 8, 8); fs(c, '#222', '#000', 2); ell(c, 480 + i * 60, 255, 3, 3); fs(c, '#d23a2a'); }
    // plate
    ell(c, 352, 262, 92, 18); fs(c, '#d6d0c2', '#000', 2.5); ell(c, 352, 259, 76, 13); fs(c, '#f2eee4', 'rgba(0,0,0,.2)', 1.5);
  }

  mg.register('linecook', {
    name: 'The Flat Top', width: 660,
    how: howHtml([
      { ic: ['bun', 'lettuce', 'cheese'], t: 'The <b>ticket</b> shows the burger <b>top to bottom</b>. Build it from the bottom bun up.' },
      { ic: ['patty'], k: ['1', '…', '7'], t: 'Add the <b>highlighted</b> ingredient (or tap it).' },
      { ic: 'flame', k: ['Space'], t: '<b>FLIP</b> the patty when the needle is in the <b>gold</b>. Pink = raw, black = burnt.' },
    ], 'Wrong ingredients make Marge yell. 40 seconds, 8 burgers for full marks.'),
    lines: { S: ['Marge wipes a single greasy tear. "That\'s a burger, baby."'], F: ['A customer sends back a burger. It was sent back by the burger itself.'] },
    create(api) {
      const T = 40, target = 8, ings = api.diff >= 0.5 ? ING : ING.slice(0, 6);
      const cookTime = 1.6 - api.diff * 0.45;
      const gold = [0.56, 0.8 - api.diff * 0.08];
      let t = 0, done = 0, total = 0, ticket = null, cooking = null, mistakes = 0;
      let stack = [], served = null, flipT = 0, sizzleT = 0, margeMood = 0;
      const S = scene(api, 640, 300);
      api.pad([...ings.map((g, i) => ({ k: DIGITS[i], label: padIc(g.ic), sub: `${i + 1} ${g.n.split(' ').pop()}`, cls: 'ic' })), { k: SP, label: padIc('spatula', 'FLIP'), sub: 'Space', cls: 'gold ic' }]);
      const newTicket = () => {
        const mid = [];
        const n = 2 + randInt(0, 1) + Math.round(api.diff * 2);
        mid.push('patty');
        if (api.diff > 0.4 && chance(0.5)) mid.push('patty');
        while (mid.length < n) mid.push(pick(ings.slice(2)).id);
        ticket = { name: pick(BURGERS), seq: ['bun', ...shuffle(mid), 'bun'], i: 0, q: [], miss: 0, born: t };
        total++;
        if (stack.length) served = { layers: stack, t: 0 };
        stack = [];
      };
      const tScore = (tk2) => { const q = tk2.q.length ? tk2.q.reduce((a, b) => a + b, 0) / tk2.q.length : 1; return clamp(q * (1 - 0.2 * tk2.miss), 0.15, 1); };
      let sum = 0;
      const score = () => clamp((sum + (ticket ? (ticket.i / ticket.seq.length) * 0.5 : 0)) / target, 0, 1);
      const sc = () => api.score(`🍔 ${done}/${target}`);
      newTicket(); sc();
      const stackTop = () => { let y = 258; for (const l of stack) y -= LH[l.id] || 10; return y; };
      const addLayer = (id, q = 1, cook = 0.68) => {
        const lid = id === 'bun' && ticket.i === 0 ? 'bunbot' : id;
        stack.push({ id: lid, cook, born: t, q });
        S.burst(352, stackTop() + 6, { n: 6, shape: 'chunk', colors: ['#f1d39a', '#6cb53e', '#f4c430'], size: 4, speed: 90, life: 0.4 });
        ticket.i++;
        if (ticket.i >= ticket.seq.length) {
          const s = tScore(ticket);
          sum += s; done++; margeMood = s >= 0.6 ? 1 : -1;
          api.sfx('hit');
          api.msg(s >= 0.9 ? pick(['ORDER UP! Chef\'s kiss. Marge\'s kiss is worse.', 'Beautiful. The trucker weeps.']) : s >= 0.6 ? 'Served. It\'s food. Legally.' : pick(['Served... the customer is praying over it.', 'It\'s technically a burger.']), s >= 0.6 ? 'good' : 'bad');
          S.mark(s >= 0.6, 352, 80, s >= 0.9 ? 'ORDER UP!' : s >= 0.6 ? 'SERVED' : 'EDIBLE-ISH');
          if (s >= 0.9) S.burst(352, 120, { n: 14, shape: 'star', colors: ['#ffd84a', '#fff'], size: 6, speed: 180, g: 80 });
          sc();
          newTicket();
        }
      };
      const draw = (c, tt) => {
        blit(c, cached('lc:bg', 640, 300, lcBackground), 0, 0);
        // ---- Marge in the pass-through window
        c.save(); rr(c, 270, 26, 156, 102, 2); c.clip();
        for (const x of [300, 396]) glow(c, x, 70, 60, 'rgba(255,120,40,.18)');
        stick(c, 348, 250, { h: 200, shirt: '#e8e4d8', hair: 'red', hairStyle: 'bun', hat: 'hairnet', expr: margeMood < -0.2 ? 'angry' : margeMood > 0.2 ? 'happy' : 'smug', arms: margeMood < -0.2 ? [[2.4, 0.6], [0.4, 0.3]] : [[0.4, 0.3], [0.4, 0.3]], lw: 4 });
        line(c, 360, 99, 374, 102, '#f2f0ea', 3); ell(c, 375, 102, 2, 2); c.fillStyle = '#ff6a2a'; c.fill();
        c.restore();
        // ---- ticket
        const seq = ticket.seq.slice().reverse();
        const idx = ticket.seq.length - 1 - ticket.i;
        const th = 58 + seq.length * 30;
        const drop = easeOut(Math.min(1, (t - ticket.born) / 0.3));
        c.save(); c.translate(18, 12 - (1 - drop) * 60); c.rotate(-0.015);
        rr(c, 0, 0, 214, th, 3); fs(c, '#f4efe2', '#000', 2);
        blob(c, 170, th - 30, 14, rng(total), 0.5); c.fillStyle = 'rgba(160,110,40,.18)'; c.fill();
        rr(c, 92, -8, 30, 14, 2); fs(c, '#8a9096', '#000', 1.5);
        text(c, `#${total}`, 196, 16, { size: 14, color: '#6d1510', stroke: null, fam: FT, align: 'right' });
        text(c, ticket.name, 10, 18, { size: 16, color: '#141210', stroke: null, fam: FT, align: 'left', maxW: 160 });
        line(c, 8, 32, 206, 32, '#999', 1);
        seq.forEach((id, j) => {
          const y = 48 + j * 30, g = ING.find((x) => x.id === id);
          if (j === idx) { rr(c, 4, y - 14, 206, 28, 4); fs(c, '#ffd84a', '#8a6a10', 1.5); text(c, '▶', 14, y + 1, { size: 15, color: '#6d1510', stroke: null }); }
          const doneRow = j > idx;
          drawIcon(c, j === 0 && id === 'bun' ? 'bun' : id === 'bun' ? 'bunbot' : g.ic, 42, y, 26, 0, doneRow ? 0.35 : 1);
          text(c, g.n, 62, y + 1, { size: 16, color: doneRow ? '#999' : '#141210', stroke: null, align: 'left' });
          if (doneRow) { line(c, 60, y, 60 + c.measureText(g.n).width, y, '#3c8a3a', 2); text(c, '✓', 196, y + 1, { size: 16, color: '#3c8a3a', stroke: null }); }
        });
        text(c, 'build from the bottom up ↑', 107, th - 10, { size: 12, color: '#777', stroke: null });
        c.restore();
        // ---- served burger sliding out
        if (served) {
          served.t += 1 / 60;
          const k = easeOut(Math.min(1, served.t / 0.5));
          c.save(); c.globalAlpha = 1 - k; c.translate(k * 160, -k * 30);
          let y = 258; for (const l of served.layers) y -= layer(c, l.id, 352, y, l.cook, 9, tt);
          c.restore();
          if (served.t > 0.5) served = null;
        }
        // ---- stack on the plate
        let y = 258;
        stack.forEach((l, i) => {
          const fall = i === stack.length - 1 ? (1 - easeOut(Math.min(1, (t - l.born) / 0.15))) * 30 : 0;
          y -= layer(c, l.id, 352, y - fall, l.cook, t - l.born, tt);
        });
        // ghost of the next ingredient
        const nxt = ticket.seq[ticket.i];
        if (nxt && !cooking) {
          c.save(); c.globalAlpha = 0.25 + 0.15 * Math.sin(tt * 6);
          drawIcon(c, nxt === 'bun' && ticket.i === 0 ? 'bunbot' : ING.find((x) => x.id === nxt).ic, 352, y - 30, 40);
          c.restore();
          const ii = ings.findIndex((g) => g.id === nxt);
          text(c, ii >= 0 ? `press ${ii + 1}` : '', 352, y - 58, { size: 14, color: COL.gold, lw: 3 });
        }
        // ---- griddle
        if (cooking) {
          const x = cooking.x;
          const px = 543, py = 192;
          ell(c, px, py + 6, 50, 18); c.fillStyle = 'rgba(0,0,0,.4)'; c.fill();
          blob(c, px, py, 48, rng(9), 0.08, 14, 1, 0.38); fs(c, cookCol(x), '#000', 2.5);
          if (x > 0.4) for (let i = 0; i < 3; i++) line(c, px - 26 + i * 22, py - 10, px - 16 + i * 22, py + 10, 'rgba(30,15,5,.6)', 3);
          if ((sizzleT -= 1 / 60) <= 0) {
            sizzleT = x > 0.82 ? 0.05 : 0.12;
            S.burst(px + (Math.random() - 0.5) * 80, py, { n: 2, color: '#ffe8a0', size: 2, speed: 160, g: 500, life: 0.4 });
            if (x > 0.7) S.burst(px + (Math.random() - 0.5) * 60, py - 12, { n: 1, shape: 'smoke', color: x > 0.9 ? '#222' : '#999', size: 12, speed: 30, g: -60, life: 1.2, grow: 2 });
          }
          if (x > 0.95) { for (let i = 0; i < 4; i++) drawIcon(c, 'flame', px - 36 + i * 24, py - 18 + Math.sin(tt * 20 + i) * 4, 30 + Math.sin(tt * 15 + i) * 6); }
          // doneness gauge
          const gx = 462, gy = 108, gw = 166;
          rr(c, gx - 4, gy - 22, gw + 8, 44, 6); fs(c, 'rgba(15,12,10,.85)', '#000', 2);
          c.fillStyle = '#c8707a'; c.fillRect(gx, gy, gw * gold[0], 14);
          c.fillStyle = '#ffd84a'; c.fillRect(gx + gw * gold[0], gy, gw * (gold[1] - gold[0]), 14);
          c.fillStyle = '#1a120e'; c.fillRect(gx + gw * gold[1], gy, gw * (1 - gold[1]), 14);
          c.strokeStyle = '#000'; c.lineWidth = 2; c.strokeRect(gx, gy, gw, 14);
          text(c, 'RAW', gx + 4, gy - 10, { size: 12, color: '#e8a0a8', lw: 2, align: 'left' }); text(c, 'BURNT', gx + gw - 2, gy - 10, { size: 12, color: '#888', lw: 2, align: 'right' });
          const nx = gx + gw * Math.min(1, x);
          c.beginPath(); c.moveTo(nx, gy + 18); c.lineTo(nx - 7, gy + 28); c.lineTo(nx + 7, gy + 28); c.closePath(); fs(c, '#fff', '#000', 1.5);
          line(c, nx, gy - 3, nx, gy + 17, '#fff', 3);
          const inGold = x >= gold[0] && x <= gold[1];
          if (inGold) { glow(c, px, py - 40, 70, 'rgba(255,216,74,.4)'); text(c, 'FLIP!', px, 66, { size: 34 + Math.sin(tt * 18) * 3, color: COL.gold, lw: 6, fam: FT }); }
          else text(c, x < gold[0] ? 'sizzling…' : 'BURNING!', px, 72, { size: 18, color: x < gold[0] ? '#e8a0a8' : '#ff6a3a', lw: 4 });
          S.hit(440, 60, 200, 200, SP);
        } else {
          drawIcon(c, 'spatula', 600, 196, 56, 0.4);
          if (nxt === 'patty') text(c, 'patty goes here', 535, 196, { size: 15, color: '#a9a291', lw: 3 });
        }
        if (flipT > 0) { flipT -= 1 / 60; }
      };
      return {
        partial: score,
        tick(dt) {
          t += dt;
          api.time(1 - t / T);
          margeMood *= 1 - dt * 0.8;
          if (cooking) {
            cooking.x += dt / cookTime;
            if (cooking.x >= 1.05) { cooking = null; ticket.q.push(0.15); api.msg('🔥 GREASE FIRE. You serve the charcoal anyway.', 'bad'); S.shake(8); S.burst(543, 180, { n: 18, shape: 'smoke', color: '#333', size: 14, speed: 80, g: -80, life: 1.2, grow: 2 }); S.mark(false, 543, 120, 'CHARCOAL'); api.sfx('miss'); addLayer('patty', 0.15, 1.05); }
          }
          S.frame(dt, draw);
          if (t >= T) api.done(score(), { stats: `${done} burgers · ${mistakes} screw-ups` });
        },
        key(code) {
          if (code === SP || code === EN) {
            if (!cooking) return;
            const x = cooking.x;
            cooking = null;
            const q = x >= gold[0] && x <= gold[1] ? 1 : x < gold[0] ? (x > gold[0] - 0.15 ? 0.6 : 0.3) : 0.4;
            ticket.q.push(q);
            api.sfx('flip'); flipT = 0.3;
            S.burst(543, 190, { n: 12, color: '#ffe8a0', size: 2.5, speed: 220, g: 600, life: 0.5 });
            if (q === 1) S.mark(true, 543, 130, 'PERFECT'); else S.mark(false, 543, 130, x < gold[0] ? 'RAW' : 'BURNT');
            api.msg(q === 1 ? pick(['Golden brown. Texture like sun.', 'PERFECT FLIP.']) : x < gold[0] ? pick(['Still mooing.', 'Raw! That cow could still testify.']) : 'Burnt. "Cajun style," you tell yourself.', q === 1 ? 'gold' : 'bad', 800);
            addLayer('patty', q, x);
            return;
          }
          const i = digitIndex(code);
          if (i < 0 || i >= ings.length) return false;
          if (cooking) { api.msg('Flip the patty first! It\'s screaming.', 'bad', 700); S.pop('FLIP FIRST!', 543, 140, { color: '#ff6a3a', size: 20 }); return; }
          const id = ings[i].id;
          if (id !== ticket.seq[ticket.i]) {
            ticket.miss++; mistakes++; margeMood = -1;
            api.sfx('miss'); S.shake(6);
            S.mark(false, 352, stackTop() - 40, `not ${ings[i].n.toLowerCase()}!`);
            api.msg(pick(['WRONG. Marge throws a spatula at you.', '"That ain\'t on the ticket, hon."', 'You put a pickle where no pickle should be.', 'Marge: "Can you READ? Can ANYONE here read?"']), 'bad');
            return;
          }
          if (id === 'patty') { cooking = { x: 0 }; api.sfx('sizzle'); S.burst(543, 190, { n: 10, color: '#ffe8a0', size: 2, speed: 200, g: 500, life: 0.4 }); return; }
          api.sfx('tick');
          addLayer(id);
        },
      };
    },
  });
}
