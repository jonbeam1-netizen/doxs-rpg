// Procedural item icons for the minigames. Every icon draws inside a 100x100 box (cartoon style, dark outline).
//   drawIcon(c, name, cx, cy, size, rot?)  -> cached bitmap, centered
//   iconURL(name, px) / iconImg(name, px, extra) -> data-URL <img> for HTML (pad buttons, intro rows)
// Names can carry a parameter after a colon, e.g. 'shirt:red'.
import { cached, ell, poly, fs, rr, line, text, blob, rng, TAU, SHIRT, face, FB } from './art.js';

const O = '#15100c';
const ICONS = {
  // ------------------------------------------------------------------ burger bar
  bun(c) {
    c.beginPath(); c.moveTo(10, 66); c.quadraticCurveTo(12, 20, 50, 18); c.quadraticCurveTo(88, 20, 90, 66); c.closePath();
    const g = c.createLinearGradient(0, 18, 0, 66); g.addColorStop(0, '#e8a452'); g.addColorStop(1, '#b06a28'); fs(c, g, O, 3.5);
    rr(c, 10, 60, 80, 12, 5); fs(c, '#f1d39a', O, 3);
    for (const [x, y, a] of [[32, 34, 0.4], [48, 28, -0.2], [62, 36, 0.8], [40, 46, 1.4], [70, 50, -0.6], [26, 52, 0.2], [55, 48, 0.1]]) { ell(c, x, y, 3.6, 1.8, a); fs(c, '#fbf3dc', '#7a5020', 1); }
    ell(c, 36, 30, 12, 4, -0.3); c.fillStyle = 'rgba(255,255,255,.25)'; c.fill();
  },
  bunbot(c) { rr(c, 10, 42, 80, 26, 10); const g = c.createLinearGradient(0, 42, 0, 68); g.addColorStop(0, '#f1d39a'); g.addColorStop(0.35, '#e0a452'); g.addColorStop(1, '#a8621f'); fs(c, g, O, 3.5); },
  patty(c) {
    blob(c, 50, 52, 38, rng(7), 0.12, 14, 1, 0.55); fs(c, '#6b3a1e', O, 3.5);
    for (let i = 0; i < 4; i++) line(c, 24 + i * 15, 42, 34 + i * 15, 62, '#2b1408', 4);
    const R = rng(3); for (let i = 0; i < 14; i++) { ell(c, 18 + R() * 64, 40 + R() * 24, 1.5, 1.5); c.fillStyle = '#9a5a30'; c.fill(); }
  },
  cheese(c) {
    c.beginPath(); c.moveTo(14, 30); c.lineTo(86, 30); c.lineTo(86, 56); c.quadraticCurveTo(80, 76, 74, 58); c.lineTo(54, 60); c.quadraticCurveTo(48, 84, 42, 60); c.lineTo(22, 60); c.quadraticCurveTo(16, 70, 14, 58); c.closePath();
    fs(c, '#f4c430', O, 3.5);
    for (const [x, y, r] of [[30, 42, 5], [62, 40, 4], [74, 48, 3], [46, 50, 3]]) { ell(c, x, y, r, r * 0.8); fs(c, '#d9a418'); }
    line(c, 18, 34, 60, 34, 'rgba(255,255,255,.5)', 3);
  },
  lettuce(c) {
    c.beginPath(); c.moveTo(8, 56);
    for (let i = 0; i <= 12; i++) { const x = 8 + i * 7; c.quadraticCurveTo(x + 3.5, i % 2 ? 36 : 30, x + 7, 44 + (i % 3) * 3); }
    c.lineTo(92, 62); for (let i = 12; i >= 0; i--) { const x = 8 + i * 7; c.quadraticCurveTo(x + 3.5, 72 + (i % 2) * 5, x, 64); }
    c.closePath(); fs(c, '#6cb53e', O, 3.5);
    for (let i = 0; i < 6; i++) line(c, 16 + i * 13, 60, 22 + i * 13, 44, '#b8e07a', 2);
  },
  onion(c) {
    for (const [x, y, r] of [[34, 52, 24], [64, 48, 22], [52, 60, 18]]) {
      ell(c, x, y, r, r * 0.8); fs(c, 'rgba(240,226,244,.9)', O, 3);
      ell(c, x, y, r * 0.72, r * 0.56); fs(c, null, '#a46ab0', 4);
      ell(c, x, y, r * 0.42, r * 0.32); fs(c, null, '#c99ad2', 3);
    }
  },
  pickle(c) {
    for (const [x, y] of [[30, 50], [56, 44], [70, 62], [42, 66]]) {
      ell(c, x, y, 17, 14); fs(c, '#4f7d2a', O, 3);
      ell(c, x, y, 12.5, 10); fs(c, '#a9c95e');
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ell(c, x + Math.cos(a) * 6, y + Math.sin(a) * 5, 1.6, 2.2, a); c.fillStyle = '#e8eec0'; c.fill(); }
    }
  },
  sauce(c) {
    poly(c, [44, 6, 56, 6, 58, 20, 42, 20]); fs(c, '#d23a2a', O, 3);
    rr(c, 28, 18, 44, 70, 14); fs(c, '#7a4520', O, 3.5);
    rr(c, 34, 40, 32, 26, 4); fs(c, '#f2e2b4', O, 2);
    text(c, 'M', 50, 54, { size: 22, color: '#b3261e', stroke: null });
    ell(c, 38, 30, 4, 10); c.fillStyle = 'rgba(255,255,255,.25)'; c.fill();
    c.beginPath(); c.moveTo(66, 70); c.quadraticCurveTo(70, 84, 66, 90); c.quadraticCurveTo(62, 84, 66, 70); fs(c, '#5a2a10');
  },
  // ------------------------------------------------------------------ bar
  whiskey(c) {
    rr(c, 42, 6, 16, 24, 3); fs(c, '#3a2410', O, 3);
    c.beginPath(); c.moveTo(42, 28); c.lineTo(58, 28); c.lineTo(76, 40); c.lineTo(76, 92); c.lineTo(24, 92); c.lineTo(24, 40); c.closePath(); fs(c, '#a65a14', O, 3.5);
    rr(c, 28, 52, 44, 26, 3); fs(c, '#efe0b6', O, 2); text(c, 'XXX', 50, 66, { size: 18, color: '#6d1510', stroke: null, fam: "'Special Elite', monospace" });
    line(c, 30, 44, 30, 86, 'rgba(255,220,160,.4)', 4);
  },
  vodka(c) {
    rr(c, 40, 4, 20, 14, 4); fs(c, '#e8e8f0', O, 3);
    rr(c, 26, 16, 48, 78, 18); fs(c, 'rgba(190,220,240,.92)', O, 3.5);
    rr(c, 32, 40, 36, 30, 6); fs(c, '#4aa0d8', O, 2);
    text(c, 'VODKA', 50, 50, { size: 11, color: '#fff', stroke: null }); text(c, '-ISH', 50, 61, { size: 11, color: '#fff', stroke: null });
    ell(c, 36, 30, 3, 9); c.fillStyle = 'rgba(255,255,255,.6)'; c.fill();
  },
  tequila(c) {
    rr(c, 44, 2, 12, 12, 2); fs(c, '#b03020', O, 3);
    c.beginPath(); c.moveTo(44, 14); c.lineTo(56, 14); c.lineTo(58, 34); c.quadraticCurveTo(72, 40, 72, 54); c.lineTo(72, 92); c.lineTo(28, 92); c.lineTo(28, 54); c.quadraticCurveTo(28, 40, 42, 34); c.closePath(); fs(c, 'rgba(232,210,122,.95)', O, 3.5);
    rr(c, 32, 54, 36, 26, 3); fs(c, '#f4ead0', O, 2);
    rr(c, 47, 58, 6, 18, 3); fs(c, '#3c8a3a'); rr(c, 40, 62, 5, 9, 2.5); fs(c, '#3c8a3a'); rr(c, 55, 60, 5, 9, 2.5); fs(c, '#3c8a3a');
    c.beginPath(); c.moveTo(38, 88); c.quadraticCurveTo(44, 82, 50, 88); c.quadraticCurveTo(56, 92, 60, 86); fs(c, null, '#e8d8b0', 3);
  },
  beer(c) {
    rr(c, 26, 14, 48, 78, 6); const g = c.createLinearGradient(26, 0, 74, 0); g.addColorStop(0, '#c9b02a'); g.addColorStop(0.4, '#f4e070'); g.addColorStop(1, '#a8901a'); fs(c, g, O, 3.5);
    ell(c, 50, 14, 24, 6); fs(c, '#cfcfcf', O, 3); ell(c, 54, 14, 6, 2.5); fs(c, '#888');
    rr(c, 26, 38, 48, 30, 0); fs(c, '#fff8d0'); line(c, 26, 38, 74, 38, O, 2); line(c, 26, 68, 74, 68, O, 2);
    text(c, 'PISS', 50, 47, { size: 14, color: '#b3261e', stroke: null }); text(c, 'LITE', 50, 60, { size: 14, color: '#b3261e', stroke: null });
  },
  cola(c) {
    rr(c, 43, 4, 14, 10, 2); fs(c, '#c0392b', O, 3);
    c.beginPath(); c.moveTo(43, 13); c.lineTo(57, 13); c.quadraticCurveTo(58, 30, 66, 40); c.quadraticCurveTo(70, 52, 64, 62); c.quadraticCurveTo(70, 74, 68, 92); c.lineTo(32, 92); c.quadraticCurveTo(30, 74, 36, 62); c.quadraticCurveTo(30, 52, 34, 40); c.quadraticCurveTo(42, 30, 43, 13); c.closePath();
    fs(c, '#3a1c10', O, 3.5);
    rr(c, 31, 56, 38, 14, 3); fs(c, '#c0392b', O, 2); text(c, 'FLAT', 50, 63.5, { size: 12, color: '#fff', stroke: null });
    line(c, 40, 22, 38, 50, 'rgba(255,255,255,.3)', 3);
  },
  lime(c) {
    c.beginPath(); c.arc(50, 40, 40, 0.15 * Math.PI, 0.85 * Math.PI); c.closePath(); fs(c, '#4f9a2a', O, 3.5);
    c.beginPath(); c.arc(50, 40, 33, 0.17 * Math.PI, 0.83 * Math.PI); c.closePath(); fs(c, '#d6ec8a');
    for (let i = 1; i < 5; i++) { const a = (0.17 + 0.66 * (i / 5)) * Math.PI; line(c, 50, 46, 50 + Math.cos(a) * 31, 40 + Math.sin(a) * 31, '#f2fac8', 2.5); }
    ell(c, 50, 46, 4, 3); fs(c, '#f2fac8');
  },
  picklejuice(c) {
    rr(c, 26, 10, 48, 14, 3); fs(c, '#b8b8b8', O, 3); line(c, 30, 17, 70, 17, '#777', 2);
    rr(c, 22, 22, 56, 72, 12); fs(c, 'rgba(150,190,80,.85)', O, 3.5);
    for (const [x, y, a] of [[38, 60, 0.3], [58, 54, -0.4], [48, 76, 0.1]]) { ell(c, x, y, 7, 16, a); fs(c, '#4f7d2a', '#2a4a14', 1.5); }
    ell(c, 30, 40, 3, 10); c.fillStyle = 'rgba(255,255,255,.4)'; c.fill();
  },
  hotsauce(c) {
    rr(c, 42, 4, 16, 18, 3); fs(c, '#3c8a3a', O, 3);
    c.beginPath(); c.moveTo(44, 20); c.lineTo(56, 20); c.quadraticCurveTo(68, 34, 68, 50); c.lineTo(68, 92); c.lineTo(32, 92); c.lineTo(32, 50); c.quadraticCurveTo(32, 34, 44, 20); c.closePath(); fs(c, '#c8201a', O, 3.5);
    rr(c, 35, 52, 30, 28, 3); fs(c, '#f4e8c8', O, 2);
    c.beginPath(); c.moveTo(50, 76); c.quadraticCurveTo(40, 70, 46, 58); c.quadraticCurveTo(48, 64, 52, 62); c.quadraticCurveTo(52, 56, 56, 54); c.quadraticCurveTo(60, 70, 50, 76); fs(c, '#ff7a1a', '#a02010', 1.5);
  },
  // ------------------------------------------------------------------ meat plant
  rump(c) {
    blob(c, 50, 52, 38, rng(11), 0.2, 11, 1, 0.75); fs(c, '#f1dcc0', O, 3.5);
    blob(c, 52, 54, 31, rng(12), 0.22, 10, 1, 0.7); fs(c, '#b8323a');
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,230,220,.75)';
    for (const [x1, y1, x2, y2] of [[30, 48, 46, 56], [50, 40, 64, 52], [40, 66, 60, 62], [62, 62, 74, 54]]) { c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo((x1 + x2) / 2 + 4, (y1 + y2) / 2 - 6, x2, y2); c.stroke(); }
    ell(c, 40, 42, 9, 4, -0.4); c.fillStyle = 'rgba(255,255,255,.25)'; c.fill();
  },
  ribs(c) {
    for (let i = 0; i < 5; i++) { const x = 20 + i * 15, y = 40 - Math.sin((i / 4) * Math.PI) * 8; c.save(); c.translate(x, y); c.rotate(-0.25 + i * 0.12); rr(c, -4, -18, 8, 26, 4); fs(c, '#f2ead6', O, 2.5); ell(c, 0, -18, 6, 5); fs(c, '#f2ead6', O, 2.5); c.restore(); }
    c.beginPath(); c.moveTo(8, 56); c.quadraticCurveTo(50, 26, 94, 50); c.lineTo(90, 72); c.quadraticCurveTo(50, 56, 12, 82); c.closePath(); fs(c, '#8a2e18', O, 3.5);
    for (let i = 0; i < 5; i++) line(c, 22 + i * 15, 52 - Math.sin((i / 4) * Math.PI) * 9, 20 + i * 15, 72 - Math.sin((i / 4) * Math.PI) * 9, '#4a1408', 3);
    c.beginPath(); c.moveTo(14, 60); c.quadraticCurveTo(50, 34, 88, 54); fs(c, null, 'rgba(255,150,80,.55)', 4);
    for (const [x, y] of [[30, 66], [62, 58], [78, 64]]) { ell(c, x, y, 4, 2, -0.4); c.fillStyle = 'rgba(30,10,0,.6)'; c.fill(); }
  },
  bacon(c) {
    const wave = (y, col, w) => { c.beginPath(); c.moveTo(8, y); for (let i = 0; i <= 6; i++) c.quadraticCurveTo(8 + i * 14 + 7, y + (i % 2 ? -12 : 12), 8 + (i + 1) * 14, y); c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.stroke(); };
    wave(50, O, 34); wave(50, '#c8424a', 28); wave(44, '#f4d8c8', 6); wave(56, '#f4d8c8', 5); wave(50, '#9a2a30', 3);
  },
  drumstick(c) {
    line(c, 58, 58, 84, 84, O, 14); line(c, 58, 58, 84, 84, '#f2ead6', 9);
    ell(c, 86, 80, 7, 7); fs(c, '#f2ead6', O, 2.5); ell(c, 80, 88, 7, 7); fs(c, '#f2ead6', O, 2.5);
    blob(c, 40, 40, 30, rng(5), 0.12, 10, 1, 0.85); fs(c, '#a8561e', O, 3.5);
    ell(c, 32, 30, 10, 6, -0.6); c.fillStyle = 'rgba(255,210,140,.4)'; c.fill();
  },
  bone(c) {
    rr(c, 24, 42, 52, 16, 6); fs(c, '#f2ead6', O, 3);
    for (const [x, y] of [[20, 38], [20, 62], [80, 38], [80, 62]]) { ell(c, x, y, 11, 11); fs(c, '#f2ead6', O, 3); }
    rr(c, 24, 44, 52, 12, 5); fs(c, '#f2ead6');
  },
  sausage(c) {
    for (let i = 0; i < 3; i++) {
      const x = 22 + i * 28, y = 50 + (i % 2 ? -8 : 6);
      ell(c, x, y, 16, 11, i % 2 ? 0.3 : -0.3); fs(c, '#d27a6a', O, 3);
      ell(c, x - 4, y - 4, 6, 2.5, -0.3); c.fillStyle = 'rgba(255,255,255,.35)'; c.fill();
    }
    line(c, 36, 50, 38, 44, '#f2ead6', 3); line(c, 64, 44, 66, 50, '#f2ead6', 3);
  },
  heart(c) {
    rr(c, 40, 6, 12, 22, 5); fs(c, '#c86a6a', O, 3); rr(c, 54, 10, 10, 18, 5); fs(c, '#4a6ab0', O, 3);
    c.beginPath(); c.moveTo(50, 92); c.bezierCurveTo(10, 66, 14, 22, 42, 26); c.bezierCurveTo(52, 24, 56, 30, 58, 32); c.bezierCurveTo(74, 18, 94, 40, 82, 60); c.bezierCurveTo(76, 74, 62, 84, 50, 92); c.closePath(); fs(c, '#9a1e26', O, 3.5);
    c.beginPath(); c.moveTo(56, 38); c.quadraticCurveTo(46, 56, 58, 80); fs(c, null, '#4a6ab0', 3);
    ell(c, 34, 44, 8, 12, 0.5); c.fillStyle = 'rgba(255,255,255,.18)'; c.fill();
  },
  sock(c) {
    c.beginPath(); c.moveTo(36, 8); c.lineTo(62, 8); c.lineTo(62, 58); c.quadraticCurveTo(64, 74, 82, 76); c.quadraticCurveTo(94, 80, 88, 92); c.lineTo(52, 92); c.quadraticCurveTo(36, 90, 36, 70); c.closePath(); fs(c, '#ece6d8', O, 3.5);
    rr(c, 36, 14, 26, 6, 0); fs(c, '#c0392b'); rr(c, 36, 24, 26, 6, 0); fs(c, '#2e5fa8');
    ell(c, 78, 86, 12, 6); c.fillStyle = 'rgba(160,130,30,.55)'; c.fill(); ell(c, 44, 82, 8, 7); c.fillStyle = 'rgba(160,130,30,.45)'; c.fill();
    for (const x of [70, 80, 90]) { c.beginPath(); c.moveTo(x, 64); c.quadraticCurveTo(x - 5, 56, x, 50); c.quadraticCurveTo(x + 5, 44, x, 36); fs(c, null, '#8aa83a', 2.5); }
  },
  ringfinger(c) {
    c.save(); c.translate(50, 54); c.rotate(-0.45);
    rr(c, -44, -16, 88, 32, 16); fs(c, '#e8c0a0', O, 3.5);
    ell(c, -42, 0, 7, 15); fs(c, '#b8182a', O, 2.5); ell(c, -42, 0, 3.5, 6); fs(c, '#f2ead6', '#a08070', 1);
    rr(c, 22, -12, 18, 22, 7); fs(c, '#f6e2d2', '#a07060', 2);
    for (const x of [8, -14]) { c.beginPath(); c.moveTo(x - 3, -12); c.quadraticCurveTo(x + 2, 0, x - 3, 12); fs(c, null, '#a87858', 2); }
    rr(c, -6, -19, 12, 38, 4); fs(c, '#e8b820', O, 3);
    c.restore();
    poly(c, [42, 14, 52, 4, 62, 14, 52, 26]); fs(c, '#9fe8ff', O, 3); line(c, 48, 12, 52, 8, '#fff', 2);
  },
  rat(c) {
    c.beginPath(); c.moveTo(78, 66); c.quadraticCurveTo(98, 70, 92, 88); c.quadraticCurveTo(86, 96, 70, 92); fs(c, null, '#e6a0a8', 4);
    ell(c, 54, 62, 30, 20); fs(c, '#6d6a70', O, 3.5);
    c.beginPath(); c.moveTo(30, 54); c.quadraticCurveTo(14, 58, 8, 66); c.quadraticCurveTo(18, 74, 34, 72); c.closePath(); fs(c, '#6d6a70', O, 3);
    ell(c, 8, 66, 3, 3); fs(c, '#e6a0a8');
    ell(c, 36, 48, 9, 9); fs(c, '#8a868e', O, 3); ell(c, 36, 48, 5, 5); fs(c, '#e6a0a8');
    ell(c, 22, 60, 3, 3); fs(c, '#e2402f');
    for (const y of [64, 68]) line(c, 12, y, 0, y + (y - 66) * 2, '#ddd', 1.2);
    line(c, 44, 80, 40, 88, O, 3); line(c, 66, 80, 70, 88, O, 3);
  },
  kidney(c) {
    c.save(); c.shadowColor = '#7fff4a'; c.shadowBlur = 16;
    c.beginPath(); c.moveTo(50, 14); c.bezierCurveTo(90, 10, 92, 90, 50, 86); c.bezierCurveTo(28, 84, 26, 66, 40, 58); c.bezierCurveTo(48, 52, 48, 46, 40, 40); c.bezierCurveTo(26, 30, 30, 16, 50, 14); c.closePath();
    fs(c, '#7fd44a', O, 3.5); c.restore();
    c.beginPath(); c.moveTo(42, 50); c.quadraticCurveTo(30, 50, 22, 60); fs(c, null, '#b8402a', 5);
    ell(c, 66, 36, 8, 12, 0.3); c.fillStyle = 'rgba(230,255,180,.5)'; c.fill();
    for (const [x, y] of [[62, 62], [72, 50], [56, 72]]) { ell(c, x, y, 3, 3); fs(c, '#c8ff6a'); }
  },
  glove(c) {
    c.beginPath(); c.moveTo(30, 92); c.lineTo(28, 56); c.quadraticCurveTo(14, 46, 18, 36); c.quadraticCurveTo(26, 34, 32, 44); c.lineTo(32, 14); c.quadraticCurveTo(38, 8, 42, 14); c.lineTo(44, 38); c.lineTo(46, 8); c.quadraticCurveTo(52, 2, 56, 8); c.lineTo(56, 38); c.lineTo(62, 12); c.quadraticCurveTo(68, 8, 70, 14); c.lineTo(66, 42); c.lineTo(76, 24); c.quadraticCurveTo(82, 22, 82, 30); c.lineTo(72, 60); c.lineTo(70, 92); c.closePath();
    fs(c, '#f2d22a', O, 3.5);
    rr(c, 28, 80, 44, 12, 3); fs(c, '#d6b018', O, 2);
    ell(c, 50, 64, 7, 5); c.fillStyle = 'rgba(120,80,20,.45)'; c.fill();
  },
  eyeball(c) {
    c.beginPath(); c.moveTo(80, 62); c.quadraticCurveTo(92, 78, 96, 92); fs(c, null, '#c86a6a', 7);
    ell(c, 50, 48, 36, 36); fs(c, '#f4f0e8', O, 3.5);
    c.lineWidth = 1.5; c.strokeStyle = '#d23a3a';
    for (const [x1, y1, x2, y2] of [[18, 40, 34, 46], [20, 62, 36, 54], [80, 32, 66, 42], [76, 70, 64, 58], [50, 84, 52, 70]]) { c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo((x1 + x2) / 2 + 5, (y1 + y2) / 2 + 3, x2, y2); c.stroke(); }
    ell(c, 50, 48, 15, 15); fs(c, '#3a7ac8', O, 2.5); ell(c, 50, 48, 7, 7); fs(c, '#0a0a0a');
    ell(c, 44, 42, 4, 4); fs(c, '#fff');
  },
  teeth(c) {
    c.beginPath(); c.moveTo(8, 50); c.quadraticCurveTo(50, 6, 92, 50); c.quadraticCurveTo(50, 94, 8, 50); c.closePath(); fs(c, '#d87a8a', O, 3.5);
    for (let i = 0; i < 9; i++) { const x = 16 + i * 8.5, y = 42 - Math.sin((i / 8) * Math.PI) * 14; rr(c, x - 4, y, 8, 12, 2.5); fs(c, i === 3 ? '#e8c84a' : '#f6f0dc', O, 1.5); }
    for (let i = 0; i < 9; i++) { const x = 16 + i * 8.5, y = 56 + Math.sin((i / 8) * Math.PI) * 12; rr(c, x - 4, y - 12, 8, 12, 2.5); fs(c, '#f6f0dc', O, 1.5); }
    rr(c, 44, 46, 8, 8, 2); fs(c, '#f6f0dc', O, 1.5);
  },
  roaches(c) {
    const roach = (x, y, a, s) => {
      c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
      for (const yy of [-6, 0, 6]) { line(c, -8, yy, -16, yy - 4, O, 2); line(c, 8, yy, 16, yy - 4, O, 2); }
      line(c, -3, -16, -10, -28, O, 1.5); line(c, 3, -16, 10, -28, O, 1.5);
      ell(c, 0, 0, 9, 15); fs(c, '#6a3a1a', O, 2.5); line(c, 0, -8, 0, 14, '#3a1a0a', 1.5);
      ell(c, 0, -14, 6, 5); fs(c, '#3a1a0a', O, 2);
      c.restore();
    };
    roach(30, 62, -0.5, 1); roach(66, 42, 0.6, 0.9); roach(68, 78, 1.8, 0.75);
  },
  undies(c) {
    c.beginPath(); c.moveTo(10, 22); c.lineTo(90, 22); c.lineTo(88, 50); c.quadraticCurveTo(66, 56, 58, 84); c.lineTo(42, 84); c.quadraticCurveTo(34, 56, 12, 50); c.closePath(); fs(c, '#f2eee4', O, 3.5);
    rr(c, 10, 20, 80, 10, 2); fs(c, '#d8d0c0', O, 2.5); text(c, 'GARY', 50, 25.5, { size: 9, color: '#2e5fa8', stroke: null });
    ell(c, 50, 72, 6, 10); c.fillStyle = 'rgba(120,80,30,.55)'; c.fill();
    c.beginPath(); c.moveTo(50, 32); c.lineTo(50, 52); fs(c, null, '#bbb', 2);
  },
  // ------------------------------------------------------------------ scrapyard
  wire(c) {
    for (let i = 0; i < 6; i++) { ell(c, 50 + (i - 3) * 2.5, 50, 36 - i * 1.5, 24 - i, 0.25); fs(c, null, i % 2 ? '#e08840' : '#b8601e', 5); }
    ell(c, 50, 50, 38, 26, 0.25); fs(c, null, O, 1.5);
    line(c, 82, 40, 96, 22, '#e08840', 4); line(c, 94, 24, 98, 18, '#f2d0a0', 2);
  },
  pennies(c) {
    rr(c, 26, 8, 48, 10, 3); fs(c, '#9a9a9a', O, 3);
    rr(c, 20, 16, 60, 78, 12); fs(c, 'rgba(200,230,230,.35)', O, 3.5);
    const R = rng(21); for (let i = 0; i < 22; i++) { const x = 30 + R() * 40, y = 50 + R() * 38; ell(c, x, y, 7, 3.5, R() - 0.5); fs(c, '#c8702c', '#6a3010', 1.2); }
    ell(c, 28, 34, 3, 12); c.fillStyle = 'rgba(255,255,255,.5)'; c.fill();
  },
  pipe(c) {
    c.beginPath(); c.moveTo(14, 74); c.lineTo(50, 74); c.quadraticCurveTo(74, 74, 74, 50); c.lineTo(74, 14);
    c.strokeStyle = O; c.lineWidth = 24; c.lineCap = 'butt'; c.stroke(); c.strokeStyle = '#c8702c'; c.lineWidth = 18; c.stroke(); c.strokeStyle = '#f0a868'; c.lineWidth = 4; c.stroke();
    rr(c, 8, 62, 10, 24, 2); fs(c, '#a85a1e', O, 2.5); rr(c, 62, 8, 24, 10, 2); fs(c, '#a85a1e', O, 2.5);
    ell(c, 40, 80, 5, 3); c.fillStyle = '#3a8a6a'; c.fill();
  },
  radiator(c) {
    rr(c, 12, 18, 76, 64, 4); fs(c, '#b8702c', O, 3.5);
    for (let i = 0; i < 10; i++) line(c, 18 + i * 7.2, 24, 18 + i * 7.2, 76, '#7a4010', 2.5);
    rr(c, 12, 18, 76, 8, 2); fs(c, '#8a5020', O, 2); rr(c, 12, 74, 76, 8, 2); fs(c, '#8a5020', O, 2);
    ell(c, 28, 50, 10, 6); c.fillStyle = 'rgba(60,140,110,.6)'; c.fill();
  },
  bell(c) {
    rr(c, 44, 6, 12, 12, 3); fs(c, '#8a5a20', O, 3);
    c.beginPath(); c.moveTo(50, 14); c.quadraticCurveTo(26, 16, 26, 50); c.quadraticCurveTo(26, 70, 14, 80); c.lineTo(86, 80); c.quadraticCurveTo(74, 70, 74, 50); c.quadraticCurveTo(74, 16, 50, 14); c.closePath();
    fs(c, '#c8862c', O, 3.5); ell(c, 50, 88, 8, 7); fs(c, '#8a5a20', O, 3);
    line(c, 36, 30, 34, 66, 'rgba(255,230,160,.5)', 5);
  },
  motor(c) {
    rr(c, 18, 26, 54, 50, 8); fs(c, '#5a6068', O, 3.5);
    for (let i = 0; i < 6; i++) { ell(c, 30 + i * 6, 51, 5, 22); fs(c, null, '#d07a30', 3); }
    rr(c, 70, 44, 22, 14, 2); fs(c, '#8a9098', O, 2.5);
    rr(c, 22, 76, 46, 8, 2); fs(c, '#3a3e44', O, 2.5);
  },
  ingot(c) {
    for (const [x, y] of [[20, 56], [50, 56], [35, 34]]) { poly(c, [x, y, x + 34, y, x + 30, y + 20, x + 4, y + 20]); fs(c, '#c8702c', O, 3); line(c, x + 4, y + 4, x + 28, y + 4, '#f2a868', 3); }
  },
  hubcap(c) {
    ell(c, 50, 50, 42, 42); fs(c, '#c8ccd0', O, 3.5); ell(c, 50, 50, 34, 34); fs(c, '#9aa0a6', O, 2);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; line(c, 50 + Math.cos(a) * 10, 50 + Math.sin(a) * 10, 50 + Math.cos(a) * 33, 50 + Math.sin(a) * 33, '#e8ecef', 7); }
    ell(c, 50, 50, 11, 11); fs(c, '#6a7076', O, 2.5);
    ell(c, 72, 66, 6, 4); c.fillStyle = 'rgba(140,70,30,.6)'; c.fill();
  },
  cardoor(c) {
    c.beginPath(); c.moveTo(10, 40); c.lineTo(30, 14); c.lineTo(88, 14); c.lineTo(90, 86); c.lineTo(12, 86); c.closePath(); fs(c, '#4a6a8a', O, 3.5);
    c.beginPath(); c.moveTo(18, 40); c.lineTo(34, 20); c.lineTo(82, 20); c.lineTo(82, 40); c.closePath(); fs(c, '#a8c8d8', O, 2.5);
    line(c, 40, 22, 70, 38, 'rgba(255,255,255,.6)', 2);
    rr(c, 66, 50, 16, 5, 2); fs(c, '#ccc', O, 1.5);
    for (const [x, y, r] of [[26, 70, 7], [74, 76, 5], [44, 60, 4]]) { blob(c, x, y, r, rng(x), 0.4, 7); fs(c, '#8a4a1e'); }
  },
  engine(c) {
    rr(c, 14, 36, 72, 50, 4); fs(c, '#6a6e72', O, 3.5);
    for (let i = 0; i < 4; i++) { rr(c, 18 + i * 17, 18, 13, 22, 3); fs(c, '#8a8e92', O, 2.5); ell(c, 24.5 + i * 17, 18, 6, 3); fs(c, '#3a3e42'); }
    ell(c, 50, 62, 12, 12); fs(c, '#4a4e52', O, 2.5);
    blob(c, 70, 76, 8, rng(4), 0.4, 7); fs(c, '#1a1410');
  },
  rebar(c) {
    for (let i = 0; i < 4; i++) {
      const y = 30 + i * 12;
      line(c, 8, y + 20 - i * 6, 92, y - 6 + i * 2, O, 9); line(c, 8, y + 20 - i * 6, 92, y - 6 + i * 2, '#7a5a3a', 6);
      for (let k = 0; k < 9; k++) { const t = k / 9, x = 12 + t * 78, yy = y + 20 - i * 6 + t * (-26 + i * 8); line(c, x, yy - 3, x + 3, yy + 3, '#4a3018', 1.5); }
    }
  },
  cart(c) {
    c.beginPath(); c.moveTo(8, 18); c.lineTo(20, 18); c.lineTo(30, 66); c.lineTo(82, 66); c.lineTo(90, 30); c.lineTo(24, 30); fs(c, null, O, 6);
    c.beginPath(); c.moveTo(8, 18); c.lineTo(20, 18); c.lineTo(30, 66); c.lineTo(82, 66); c.lineTo(90, 30); c.lineTo(24, 30); fs(c, null, '#b8bcc0', 3.5);
    for (let i = 1; i < 6; i++) line(c, 24 + i * 11, 31, 28 + i * 9.4, 65, '#9aa0a6', 2);
    line(c, 26, 48, 86, 48, '#9aa0a6', 2);
    line(c, 30, 66, 34, 78, '#b8bcc0', 3); line(c, 34, 78, 82, 78, '#b8bcc0', 3);
    for (const x of [36, 78]) { ell(c, x, 86, 6, 6); fs(c, '#222', O, 2); }
  },
  fridge(c) {
    rr(c, 24, 6, 52, 88, 6); fs(c, '#e8e4d8', O, 3.5);
    line(c, 24, 36, 76, 36, O, 3); rr(c, 66, 14, 4, 16, 2); fs(c, '#999'); rr(c, 66, 42, 4, 24, 2); fs(c, '#999');
    c.beginPath(); c.moveTo(18, 30); c.quadraticCurveTo(50, 46, 82, 30); c.moveTo(18, 52); c.quadraticCurveTo(50, 68, 82, 52); fs(c, null, '#6a6a6a', 4);
    rr(c, 44, 52, 14, 12, 3); fs(c, '#c8a030', O, 2);
    blob(c, 40, 82, 9, rng(9), 0.5, 8); fs(c, 'rgba(120,20,20,.75)');
  },
  teddy(c) {
    for (const x of [28, 72]) { ell(c, x, 22, 11, 11); fs(c, '#8a5a30', O, 3); }
    ell(c, 50, 70, 28, 24); fs(c, '#8a5a30', O, 3.5);
    ell(c, 50, 38, 25, 22); fs(c, '#9a6a3a', O, 3.5);
    ell(c, 50, 46, 10, 7); fs(c, '#d8b890', O, 2);
    ell(c, 41, 34, 4, 4); fs(c, '#111'); c.save(); c.shadowColor = '#f00'; c.shadowBlur = 10; ell(c, 59, 34, 4.5, 4.5); fs(c, '#ff2020'); c.restore();
    line(c, 50, 52, 50, 56, O, 2);
    c.lineWidth = 1.5; c.strokeStyle = '#2a1a0a';
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(62 + i * 3, 62); c.lineTo(66 + i * 3, 70); c.stroke(); }
    c.beginPath(); c.moveTo(60, 66); c.lineTo(76, 66); c.stroke();
    ell(c, 30, 80, 3, 4); fs(c, '#f2f2e8');
  },
  vhs(c) {
    rr(c, 8, 22, 84, 54, 4); fs(c, '#1a1a1c', O, 3.5);
    rr(c, 16, 28, 68, 18, 2); fs(c, '#f2ead6', O, 1.5);
    text(c, 'OUR WEDDING', 50, 34, { size: 9.5, color: '#2a2a2a', stroke: null }); text(c, 'DO NOT WATCH', 50, 42, { size: 8, color: '#c0392b', stroke: null });
    for (const x of [32, 68]) { ell(c, x, 60, 9, 9); fs(c, '#444', O, 2); ell(c, x, 60, 3, 3); fs(c, '#eee'); }
    rr(c, 28, 52, 44, 16, 2); c.fillStyle = 'rgba(80,80,90,.35)'; c.fill();
  },
  mannequin(c) {
    rr(c, 40, 74, 20, 16, 2); fs(c, '#d8cfc0', O, 3); rr(c, 30, 88, 40, 6, 2); fs(c, '#6a5a4a', O, 2);
    face(c, 50, 44, 30, { skin: '#efe2cc', expr: 'shock' });
  },
  pizzabox(c) {
    poly(c, [8, 46, 50, 30, 92, 46, 50, 62]); fs(c, '#d8b480', O, 3);
    poly(c, [8, 46, 50, 62, 50, 82, 8, 66]); fs(c, '#b8905a', O, 3); poly(c, [50, 62, 92, 46, 92, 66, 50, 82]); fs(c, '#c8a06a', O, 3);
    c.save(); c.translate(50, 46); c.scale(1, 0.4); text(c, 'PIZZA BUTT', 0, 0, { size: 16, color: '#b3261e', stroke: null }); c.restore();
    for (const [x, y, r] of [[26, 46, 6], [70, 50, 8], [60, 70, 6]]) { blob(c, x, y, r, rng(x * 3), 0.4, 7, 1, 0.6); c.fillStyle = 'rgba(120,70,20,.5)'; c.fill(); }
  },
  soggy(c) {
    blob(c, 50, 60, 34, rng(31), 0.45, 11, 1, 0.65); fs(c, '#6a5a3a', O, 3.5);
    blob(c, 46, 56, 18, rng(32), 0.5, 9, 1, 0.6); fs(c, '#8a7a4a');
    for (const x of [34, 56, 70]) { c.beginPath(); c.moveTo(x, 76); c.quadraticCurveTo(x + 3, 86, x, 92); c.quadraticCurveTo(x - 3, 86, x, 76); fs(c, '#5a4a2a'); }
    for (const [x, y] of [[30, 22], [62, 16], [76, 30]]) { ell(c, x, y, 3, 2.5); fs(c, '#111'); ell(c, x - 2, y - 3, 2.5, 1.5); fs(c, 'rgba(200,220,255,.8)'); ell(c, x + 2, y - 3, 2.5, 1.5); fs(c, 'rgba(200,220,255,.8)'); }
  },
  ball(c) {
    ell(c, 50, 50, 36, 36); fs(c, '#d4e84a', O, 3.5);
    c.beginPath(); c.arc(14, 50, 30, -0.9, 0.9); fs(c, null, '#f8f8f0', 4); c.beginPath(); c.arc(86, 50, 30, Math.PI - 0.9, Math.PI + 0.9); fs(c, null, '#f8f8f0', 4);
    blob(c, 60, 66, 7, rng(2), 0.4, 7); c.fillStyle = 'rgba(80,90,30,.45)'; c.fill();
  },
  shoe(c) {
    c.beginPath(); c.moveTo(10, 70); c.lineTo(10, 40); c.quadraticCurveTo(12, 30, 26, 30); c.lineTo(40, 30); c.quadraticCurveTo(50, 48, 70, 50); c.quadraticCurveTo(92, 54, 92, 70); c.closePath(); fs(c, '#6a4024', O, 3.5);
    c.beginPath(); c.moveTo(10, 70); c.lineTo(92, 70); c.lineTo(92, 74); c.quadraticCurveTo(70, 90, 50, 80); c.lineTo(10, 78); c.closePath(); fs(c, '#2a1a10', O, 3);
    for (let i = 0; i < 3; i++) line(c, 34 + i * 7, 38 + i * 3, 44 + i * 7, 36 + i * 3, '#e8d8b0', 2);
    ell(c, 30, 44, 6, 3); c.fillStyle = 'rgba(255,255,255,.2)'; c.fill();
  },
  squirrel(c) {
    c.beginPath(); c.moveTo(64, 80); c.quadraticCurveTo(100, 70, 92, 30); c.quadraticCurveTo(86, 10, 70, 18); c.quadraticCurveTo(84, 30, 76, 50); c.quadraticCurveTo(70, 66, 58, 70); c.closePath(); fs(c, '#9a6a3a', O, 3.5);
    ell(c, 46, 66, 20, 22); fs(c, '#8a5a30', O, 3.5); ell(c, 44, 70, 10, 14); fs(c, '#e8d0a8');
    ell(c, 38, 36, 15, 14); fs(c, '#8a5a30', O, 3.5);
    poly(c, [30, 24, 30, 12, 38, 22]); fs(c, '#8a5a30', O, 2.5); poly(c, [44, 22, 48, 10, 50, 24]); fs(c, '#8a5a30', O, 2.5);
    ell(c, 32, 34, 3, 3); fs(c, '#111'); ell(c, 44, 34, 3, 3); fs(c, '#111');
    line(c, 28, 28, 35, 31, O, 2.5); line(c, 48, 28, 41, 31, O, 2.5);
    rr(c, 34, 42, 7, 5, 1); fs(c, '#fff', O, 1);
  },
  // ------------------------------------------------------------------ tools / ui
  sponge(c) {
    rr(c, 14, 30, 72, 44, 8); fs(c, '#f2d24a', O, 3.5);
    rr(c, 14, 26, 72, 16, 6); fs(c, '#3c8a3a', O, 3);
    const R = rng(8); for (let i = 0; i < 16; i++) { ell(c, 20 + R() * 60, 48 + R() * 22, 1.5 + R() * 2, 1.2 + R() * 1.5); c.fillStyle = '#c8a420'; c.fill(); }
  },
  reply(c) {
    rr(c, 10, 28, 80, 54, 5); fs(c, '#efe8d6', O, 3.5);
    c.beginPath(); c.moveTo(10, 30); c.lineTo(50, 60); c.lineTo(90, 30); fs(c, null, O, 3);
    c.beginPath(); c.moveTo(72, 8); c.lineTo(48, 24); c.lineTo(72, 40); c.closePath(); fs(c, '#3c8a3a', O, 3);
    c.beginPath(); c.moveTo(66, 24); c.quadraticCurveTo(94, 22, 92, 48); fs(c, null, O, 11); c.beginPath(); c.moveTo(66, 24); c.quadraticCurveTo(94, 22, 92, 48); fs(c, null, '#3c8a3a', 6);
  },
  trash(c) {
    rr(c, 36, 6, 28, 8, 3); fs(c, '#8a9096', O, 3);
    rr(c, 16, 14, 68, 12, 3); fs(c, '#9aa0a6', O, 3);
    c.beginPath(); c.moveTo(22, 26); c.lineTo(78, 26); c.lineTo(72, 92); c.lineTo(28, 92); c.closePath(); fs(c, '#7a8086', O, 3.5);
    for (const x of [38, 50, 62]) line(c, x, 34, x - (x - 50) * 0.1, 84, '#5a6066', 4);
    c.beginPath(); c.moveTo(70, 26); c.quadraticCurveTo(80, 10, 92, 18); fs(c, null, '#a8c84a', 3);
  },
  hr(c) {
    c.beginPath(); c.moveTo(8, 24); c.lineTo(38, 24); c.lineTo(44, 32); c.lineTo(92, 32); c.lineTo(92, 86); c.lineTo(8, 86); c.closePath(); fs(c, '#b8322a', O, 3.5);
    poly(c, [50, 38, 74, 78, 26, 78]); fs(c, '#ffd84a', O, 3);
    rr(c, 47.5, 48, 5, 16, 2); fs(c, O); ell(c, 50, 70, 3, 3); fs(c, O);
  },
  crate(c) {
    rr(c, 10, 30, 80, 60, 3); fs(c, '#a87a44', O, 3.5);
    for (let i = 0; i < 4; i++) line(c, 12, 44 + i * 13, 88, 44 + i * 13, '#7a5226', 2.5);
    line(c, 14, 34, 86, 86, '#7a5226', 6);
    for (const [x, y] of [[30, 26], [56, 22], [72, 28]]) { blob(c, x, y, 13, rng(x), 0.3, 8, 1, 0.7); fs(c, '#b8323a', O, 2.5); }
  },
  bin(c) {
    rr(c, 14, 14, 72, 14, 4); fs(c, '#6d1510', O, 3);
    c.beginPath(); c.moveTo(18, 28); c.lineTo(82, 28); c.lineTo(76, 92); c.lineTo(24, 92); c.closePath(); fs(c, '#b8322a', O, 3.5);
    ell(c, 50, 60, 16, 16); fs(c, '#ffd84a', O, 2.5);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU - Math.PI / 2; ell(c, 50 + Math.cos(a) * 8, 60 + Math.sin(a) * 8, 5, 5); fs(c, O); }
    ell(c, 50, 60, 3, 3); fs(c, '#ffd84a');
  },
  vat(c) {
    ell(c, 50, 36, 40, 12); fs(c, '#e88a9a', O, 3);
    c.beginPath(); c.moveTo(10, 36); c.lineTo(16, 88); c.lineTo(84, 88); c.lineTo(90, 36); fs(c, '#8a9096', O, 3.5);
    ell(c, 50, 36, 34, 9); fs(c, '#d86a7a');
    for (const [x, y] of [[36, 34], [58, 37], [48, 32]]) { ell(c, x, y, 4, 3); fs(c, null, '#f8b8c8', 1.5); }
    rr(c, 30, 52, 40, 18, 3); fs(c, '#efe8d6', O, 2); text(c, 'DOGS', 50, 61.5, { size: 13, color: '#b3261e', stroke: null });
  },
  knife(c) {
    c.save(); c.translate(50, 50); c.rotate(-0.6);
    rr(c, -44, -6, 32, 12, 4); fs(c, '#4a2a14', O, 3);
    c.beginPath(); c.moveTo(-14, -8); c.lineTo(40, -8); c.quadraticCurveTo(46, 0, 30, 8); c.lineTo(-14, 8); c.closePath(); fs(c, '#d8dce0', O, 3);
    line(c, -10, -3, 34, -3, '#fff', 2); c.restore();
  },
  brain(c) {
    blob(c, 50, 52, 38, rng(41), 0.18, 12, 1, 0.78); fs(c, '#f0a0b0', O, 3.5);
    c.lineWidth = 3; c.strokeStyle = '#c86a80'; c.lineCap = 'round';
    for (const p of [[22, 46, 36, 36, 46, 46], [56, 30, 64, 44, 78, 38], [30, 64, 42, 56, 52, 66], [60, 60, 70, 54, 80, 62], [50, 22, 50, 50, 50, 80]]) { c.beginPath(); c.moveTo(p[0], p[1]); c.quadraticCurveTo(p[2], p[3], p[4], p[5]); c.stroke(); }
  },
  book(c) {
    c.beginPath(); c.moveTo(50, 30); c.quadraticCurveTo(30, 20, 8, 26); c.lineTo(8, 82); c.quadraticCurveTo(30, 76, 50, 86); c.quadraticCurveTo(70, 76, 92, 82); c.lineTo(92, 26); c.quadraticCurveTo(70, 20, 50, 30); c.closePath(); fs(c, '#efe8d6', O, 3.5);
    line(c, 50, 30, 50, 86, O, 2.5);
    for (let i = 0; i < 5; i++) { line(c, 16, 38 + i * 8, 42, 38 + i * 8 - 2, '#999', 2); line(c, 58, 36 + i * 8, 84, 38 + i * 8, '#999', 2); }
  },
  dumbbell(c) {
    line(c, 20, 50, 80, 50, O, 10); line(c, 20, 50, 80, 50, '#c8ccd0', 6);
    for (const x of [12, 24, 76, 88]) { rr(c, x - 6, 26 + (x === 12 || x === 88 ? 6 : 0), 12, x === 12 || x === 88 ? 36 : 48, 3); fs(c, '#2a2a2e', O, 3); }
  },
  boxglove(c) {
    rr(c, 30, 66, 40, 26, 4); fs(c, '#efe8d6', O, 3);
    c.beginPath(); c.moveTo(28, 68); c.quadraticCurveTo(10, 40, 30, 16); c.quadraticCurveTo(60, 2, 78, 26); c.quadraticCurveTo(90, 46, 72, 68); c.closePath(); fs(c, '#c8201a', O, 3.5);
    c.beginPath(); c.moveTo(28, 50); c.quadraticCurveTo(14, 44, 20, 32); c.quadraticCurveTo(30, 30, 38, 40); fs(c, '#a81812', O, 2.5);
    ell(c, 56, 24, 12, 6, 0.3); c.fillStyle = 'rgba(255,255,255,.3)'; c.fill();
  },
  runshoe(c) {
    c.beginPath(); c.moveTo(10, 72); c.lineTo(12, 44); c.quadraticCurveTo(20, 36, 34, 40); c.quadraticCurveTo(48, 54, 70, 52); c.quadraticCurveTo(92, 54, 92, 72); c.closePath(); fs(c, '#f4f4f0', O, 3.5);
    rr(c, 8, 70, 86, 10, 5); fs(c, '#c8c8c0', O, 3);
    c.beginPath(); c.moveTo(30, 62); c.quadraticCurveTo(54, 66, 76, 54); fs(c, null, '#e2402f', 5);
  },
  dumbbellIcon: null,
  magnet(c) {
    c.beginPath(); c.arc(50, 46, 32, Math.PI, 0); c.lineTo(82, 80); c.lineTo(62, 80); c.lineTo(62, 46); c.arc(50, 46, 12, 0, Math.PI, true); c.lineTo(38, 80); c.lineTo(18, 80); c.closePath(); fs(c, '#c8201a', O, 3.5);
    rr(c, 18, 70, 20, 12, 1); fs(c, '#d8dce0', O, 2.5); rr(c, 62, 70, 20, 12, 1); fs(c, '#d8dce0', O, 2.5);
  },
  ibeam(c) {
    poly(c, [10, 22, 90, 22, 90, 34, 58, 34, 58, 66, 90, 66, 90, 78, 10, 78, 10, 66, 42, 66, 42, 34, 10, 34]); fs(c, '#8a9298', O, 3.5);
    line(c, 14, 27, 86, 27, '#c8d0d6', 2.5); line(c, 46, 38, 46, 62, '#c8d0d6', 2.5);
  },
  dog(c) {
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(50 + s * 22, 30); c.quadraticCurveTo(50 + s * 44, 18, 50 + s * 40, 44); c.closePath(); fs(c, '#7a5a3a', O, 3); }
    ell(c, 50, 50, 30, 28); fs(c, '#b8905a', O, 3.5);
    ell(c, 50, 64, 20, 14); fs(c, '#e0c8a0', O, 2.5);
    ell(c, 50, 56, 7, 5); fs(c, '#111');
    for (const s of [-1, 1]) { ell(c, 50 + s * 12, 42, 4, 4); fs(c, '#111'); line(c, 50 + s * 18, 34, 50 + s * 6, 38, O, 3); }
    poly(c, [40, 70, 44, 76, 48, 70]); fs(c, '#fff', O, 1); poly(c, [52, 70, 56, 76, 60, 70]); fs(c, '#fff', O, 1);
    rr(c, 26, 80, 48, 9, 3); fs(c, '#222', O, 2); for (let i = 0; i < 5; i++) { poly(c, [30 + i * 10, 80, 34 + i * 10, 72, 38 + i * 10, 80]); fs(c, '#ccc', O, 1); }
  },
  mail(c) { rr(c, 10, 24, 80, 54, 5); fs(c, '#efe8d6', O, 3.5); c.beginPath(); c.moveTo(10, 26); c.lineTo(50, 56); c.lineTo(90, 26); fs(c, null, O, 3); },
  clock(c) {
    ell(c, 50, 50, 40, 40); fs(c, '#efe8d6', O, 4);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; line(c, 50 + Math.cos(a) * 32, 50 + Math.sin(a) * 32, 50 + Math.cos(a) * 36, 50 + Math.sin(a) * 36, O, 3); }
    line(c, 50, 50, 50, 24, O, 4); line(c, 50, 50, 68, 56, O, 4);
  },
  // ------------------------------------------------------------------ lineup / ID traits
  cap(c) { face(c, 50, 60, 28, { hat: 'cap' }); },
  tophat(c) { face(c, 50, 66, 24, { hat: 'tophat' }); },
  beanie(c) { face(c, 50, 60, 28, { hat: 'beanie' }); },
  nohat(c) { face(c, 50, 54, 32, { hair: 'brown' }); },
  stache(c) { c.beginPath(); c.moveTo(8, 60); c.quadraticCurveTo(28, 26, 50, 46); c.quadraticCurveTo(72, 26, 92, 60); c.quadraticCurveTo(72, 50, 50, 56); c.quadraticCurveTo(28, 50, 8, 60); fs(c, '#2a2018', O, 3); },
  nostache(c) { ICONS.stache(c); line(c, 14, 80, 86, 20, '#e2402f', 7); },
  glasses(c) { for (const x of [28, 72]) { rr(c, x - 19, 36, 38, 28, 9); fs(c, 'rgba(200,230,255,.35)', O, 5); } line(c, 47, 46, 53, 46, O, 5); line(c, 9, 44, 2, 40, O, 4); line(c, 91, 44, 98, 40, O, 4); },
  noglasses(c) { ICONS.glasses(c); line(c, 14, 84, 86, 16, '#e2402f', 7); },
  scar(c) { face(c, 50, 52, 36, { scar: true, expr: 'angry' }); },
  noscar(c) { face(c, 50, 52, 36, {}); line(c, 14, 88, 86, 16, '#e2402f', 7); },
  tattoo(c) {
    c.beginPath(); c.moveTo(6, 70); c.quadraticCurveTo(30, 40, 54, 44); c.quadraticCurveTo(70, 22, 88, 36); c.quadraticCurveTo(96, 50, 84, 62); c.quadraticCurveTo(60, 74, 40, 88); c.lineTo(6, 92); c.closePath(); fs(c, '#e6c8a8', O, 3.5);
    c.save(); c.translate(56, 58); c.scale(1.8, 1.8); c.beginPath(); c.moveTo(0, 8); c.bezierCurveTo(-12, -2, -6, -12, 0, -5); c.bezierCurveTo(6, -12, 12, -2, 0, 8); fs(c, '#c0303a', '#000', 1.2); c.restore();
    c.save(); c.translate(56, 70); c.rotate(-0.25); rr(c, -20, -6, 40, 12, 2); fs(c, '#2a4a8a', '#000', 1.5); text(c, 'MOM', 0, 0.5, { size: 10, color: '#fff', stroke: null }); c.restore();
  },
  notattoo(c) { ICONS.tattoo(c); line(c, 14, 88, 86, 16, '#e2402f', 7); },
  tall(c) {
    rr(c, 70, 6, 18, 88, 2); fs(c, '#d6b33c', O, 3); for (let i = 0; i < 8; i++) line(c, 70, 14 + i * 10, 78, 14 + i * 10, O, 2);
    ell(c, 38, 18, 9, 9); fs(c, '#e6dfcf', O, 3); line(c, 38, 27, 38, 62, '#e6dfcf', 5); line(c, 38, 62, 28, 92, '#e6dfcf', 5); line(c, 38, 62, 48, 92, '#e6dfcf', 5); line(c, 24, 36, 52, 36, '#e6dfcf', 5);
    poly(c, [52, 6, 60, 16, 44, 16]); fs(c, '#7fbf4d', O, 2);
  },
  short(c) {
    rr(c, 70, 6, 18, 88, 2); fs(c, '#d6b33c', O, 3); for (let i = 0; i < 8; i++) line(c, 70, 14 + i * 10, 78, 14 + i * 10, O, 2);
    ell(c, 38, 50, 8, 8); fs(c, '#e6dfcf', O, 3); line(c, 38, 58, 38, 76, '#e6dfcf', 5); line(c, 38, 76, 30, 92, '#e6dfcf', 5); line(c, 38, 76, 46, 92, '#e6dfcf', 5); line(c, 26, 64, 50, 64, '#e6dfcf', 5);
    poly(c, [52, 46, 60, 36, 44, 36]); fs(c, '#e2402f', O, 2);
  },
  shirt(c, arg) {
    c.beginPath(); c.moveTo(34, 14); c.quadraticCurveTo(50, 26, 66, 14); c.lineTo(92, 30); c.lineTo(82, 48); c.lineTo(72, 42); c.lineTo(72, 90); c.lineTo(28, 90); c.lineTo(28, 42); c.lineTo(18, 48); c.lineTo(8, 30); c.closePath();
    fs(c, SHIRT[arg] || arg || '#888', O, 3.5);
  },
  sneakers(c) { ICONS.runshoe(c); },
  dressshoe(c) { c.beginPath(); c.moveTo(8, 72); c.lineTo(10, 50); c.quadraticCurveTo(30, 40, 50, 52); c.quadraticCurveTo(80, 54, 92, 66); c.lineTo(92, 74); c.closePath(); fs(c, '#141414', O, 3.5); line(c, 8, 74, 92, 74, '#3a2a1a', 5); ell(c, 64, 56, 12, 3, 0.15); c.fillStyle = 'rgba(255,255,255,.4)'; c.fill(); },
  boots(c) { c.beginPath(); c.moveTo(22, 10); c.lineTo(58, 10); c.lineTo(58, 56); c.quadraticCurveTo(88, 58, 90, 78); c.lineTo(90, 88); c.lineTo(20, 88); c.closePath(); fs(c, '#6a4024', O, 3.5); line(c, 20, 84, 90, 84, '#2a1a10', 7); for (let i = 0; i < 4; i++) line(c, 30, 20 + i * 9, 50, 22 + i * 9, '#e8d8b0', 2); },
  heels(c) { c.beginPath(); c.moveTo(14, 46); c.quadraticCurveTo(40, 40, 60, 66); c.lineTo(90, 70); c.lineTo(88, 78); c.lineTo(58, 78); c.quadraticCurveTo(36, 58, 22, 60); c.closePath(); fs(c, '#c0182a', O, 3.5); line(c, 20, 58, 20, 90, O, 7); line(c, 20, 58, 20, 90, '#c0182a', 4); },
  flipflops(c) { ell(c, 50, 64, 40, 16, -0.1); fs(c, '#3fa7e0', O, 3.5); c.beginPath(); c.moveTo(30, 64); c.quadraticCurveTo(44, 36, 56, 44); c.quadraticCurveTo(64, 50, 74, 60); fs(c, null, '#e2402f', 5); },
  calendar(c) { rr(c, 12, 16, 76, 74, 6); fs(c, '#efe8d6', O, 3.5); rr(c, 12, 16, 76, 20, 6); fs(c, '#b3261e', O, 3); for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) { rr(c, 20 + k * 16, 44 + i * 14, 10, 8, 1); fs(c, '#bbb'); } },
  id(c) { rr(c, 6, 22, 88, 58, 6); fs(c, '#e8dcb8', O, 3.5); rr(c, 12, 32, 26, 32, 2); fs(c, '#bfb59a', O, 2); face(c, 25, 47, 10, {}); for (let i = 0; i < 4; i++) line(c, 46, 36 + i * 9, 86 - i * 6, 36 + i * 9, '#777', 3); },
  ok(c) { ell(c, 50, 50, 42, 42); fs(c, '#3f7a26', O, 4); c.beginPath(); c.moveTo(28, 52); c.lineTo(44, 68); c.lineTo(74, 34); fs(c, null, '#fff', 11); },
  no(c) { ell(c, 50, 50, 42, 42); fs(c, '#a01e16', O, 4); line(c, 32, 32, 68, 68, '#fff', 11); line(c, 68, 32, 32, 68, '#fff', 11); },
  flame(c) { c.beginPath(); c.moveTo(50, 92); c.quadraticCurveTo(14, 84, 22, 50); c.quadraticCurveTo(30, 30, 44, 8); c.quadraticCurveTo(50, 34, 62, 30); c.quadraticCurveTo(64, 20, 60, 14); c.quadraticCurveTo(90, 40, 80, 70); c.quadraticCurveTo(74, 88, 50, 92); fs(c, '#ff7a1a', O, 3.5); c.beginPath(); c.moveTo(50, 88); c.quadraticCurveTo(32, 80, 38, 64); c.quadraticCurveTo(46, 52, 48, 42); c.quadraticCurveTo(56, 58, 62, 56); c.quadraticCurveTo(70, 76, 50, 88); fs(c, '#ffd84a'); },
  spatula(c) { c.save(); c.translate(50, 50); c.rotate(-0.7); rr(c, -6, 0, 12, 46, 4); fs(c, '#3a2a1a', O, 3); rr(c, -20, -44, 40, 44, 4); fs(c, '#c8ccd0', O, 3); for (let i = 0; i < 3; i++) rr(c, -12 + i * 9, -36, 4, 26, 2), fs(c, '#6a7076'); c.restore(); },
  arrowL(c) { ICONS._arrow(c, Math.PI, '#c74ad1'); },
  arrowD(c) { ICONS._arrow(c, Math.PI / 2, '#3fa7e0'); },
  arrowU(c) { ICONS._arrow(c, -Math.PI / 2, '#5fd35a'); },
  arrowR(c) { ICONS._arrow(c, 0, '#e2402f'); },
  _arrow(c, a, col) {
    c.save(); c.translate(50, 50); c.rotate(a);
    poly(c, [42, 0, 4, -36, 4, -16, -38, -16, -38, 16, 4, 16, 4, 36]); fs(c, col, O, 5);
    poly(c, [30, 0, 8, -20, 8, -8, -28, -8]); c.fillStyle = 'rgba(255,255,255,.35)'; c.fill();
    c.restore();
  },
};
delete ICONS.dumbbellIcon;
ICONS.steak = ICONS.rump;

export const hasIcon = (name) => !!ICONS[String(name).split(':')[0]];
function iconCanvas(name, px) {
  const [base, arg] = String(name).split(':');
  const fn = ICONS[base];
  return cached(`ic:${name}:${px}`, px, px, (c) => {
    c.scale(px / 100, px / 100);
    if (fn) fn(c, arg);
    else { ell(c, 50, 50, 30, 30); fs(c, '#555', O, 3); text(c, '?', 50, 52, { size: 40 }); }
  });
}
// size in logical px (rounded up to a cache bucket so a handful of bitmaps cover every use)
export function drawIcon(c, name, cx, cy, size, rot = 0, alpha = 1) {
  const bucket = size <= 32 ? 32 : size <= 64 ? 64 : 128;
  const cv = iconCanvas(name, bucket);
  if (alpha < 1) { c.save(); c.globalAlpha *= alpha; }
  if (rot) { c.save(); c.translate(cx, cy); c.rotate(rot); c.drawImage(cv, -size / 2, -size / 2, size, size); c.restore(); }
  else c.drawImage(cv, cx - size / 2, cy - size / 2, size, size);
  if (alpha < 1) c.restore();
}
const URLS = new Map();
export function iconURL(name, px = 48) {
  const key = `${name}:${px}`;
  if (!URLS.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px * 2;
    const c = cv.getContext('2d');
    c.scale((px * 2) / 100, (px * 2) / 100);
    const [base, arg] = String(name).split(':');
    try { ICONS[base]?.(c, arg); } catch (e) { console.error('[mg icons]', name, e); }
    URLS.set(key, cv.toDataURL());
  }
  return URLS.get(key);
}
export const iconImg = (name, px = 40, cls = '') => `<img class="mg-ic ${cls}" alt="" draggable="false" src="${iconURL(name, px)}" style="width:${px}px;height:${px}px">`;
export { FB };

// Intro "how to play" as icon rows. rows: [{ ic: 'sponge' | [names], k: ['←', 'A'], t: 'html' }], foot: html line under the grid.
export function howHtml(rows, foot = '') {
  const kb = (k) => (k || []).map((x) => `<kbd>${x}</kbd>`).join('');
  return `<div class="mg-howgrid">${rows.map((r) => `<div class="mg-hw">${[].concat(r.ic || []).map((n) => iconImg(n, 40)).join('')}<div>${r.k ? `<span class="ks">${kb(r.k)}</span> ` : ''}${r.t}</div></div>`).join('')}</div>${foot ? `<div class="mg-howfoot">${foot}</div>` : ''}`;
}
// pad button label with an icon
export const padIc = (name, text = '') => `${iconImg(name, 34)}${text ? `<span>${text}</span>` : ''}`;
