// The Rusty Nail: mixdrink (read the order, pour the recipe, serve).
import { clamp, pick } from '../../core/util.js';
import { DIGITS, digitIndex } from '../minigame.js';
import { scene, cached, blit, rr, ell, fs, line, blob, text, wrapText, glow, grime, rng, COL, FT, mix, easeOut, stick, bubble, meter, comboMeter } from './art.js';
import { drawIcon, howHtml, padIc } from './icons.js';

const SP = 'Space', EN = 'Enter';
const isAct = (c) => c === SP || c === EN;

const BOOZE = [
  { id: 'W', ic: 'whiskey', n: 'Rotgut Whiskey', s: 'Whiskey', col: '#a65a14' }, { id: 'V', ic: 'vodka', n: 'Shampoo-Bottle Vodka', s: 'Vodka', col: '#cfe2ee' },
  { id: 'T', ic: 'tequila', n: 'Tequila', s: 'Tequila', col: '#e8d27a' }, { id: 'B', ic: 'beer', n: 'Piss Lite', s: 'Piss Lite', col: '#f0d040' },
  { id: 'C', ic: 'cola', n: 'Flat Cola', s: 'Cola', col: '#3a1c10' }, { id: 'L', ic: 'lime', n: 'Lime', s: 'Lime', col: '#b8e070' },
  { id: 'P', ic: 'picklejuice', n: 'Pickle Juice', s: 'Pickle', col: '#9ab850' }, { id: 'H', ic: 'hotsauce', n: 'Hot Sauce', s: 'Hot Sauce', col: '#c8201a' },
];
const DRINKS = [
  ['Sloppy Divorce', 'WTP'], ['Dirty Grandma', 'WC'], ['Soggy Handshake', 'VP'], ['Tequila Mockingbird', 'TL'], ['Walk of Shame', 'BLH'],
  ['Swamp Water', 'BPL'], ['Spicy Ex', 'THC'], ['Mom\'s Minivan', 'VCL'], ['Gristle\'s Gargle', 'WPH'], ['Liquid Regret', 'WVTB'],
];
const PATRONS = [
  ['A sweaty trucker', { hat: 'trucker', beard: true, hair: 'brown', shirt: '#6a4a2a', sweat: 2 }],
  ['Divorced Doug', { stache: true, hair: 'gray', shirt: '#5a6a7a', expr0: 'sad' }],
  ['A bachelorette (sash: "BRIDE 2 BLEED")', { hat: 'veil', hair: 'blond', hairStyle: 'long', shirt: '#d0306a', sash: true, blush: true }],
  ['A man in a wet suit (not wetsuit — a wet suit)', { shirt: '#2a3a5a', tie: '#888', hair: 'black', sweat: 3 }],
  ['A guy named Moist Kevin', { glasses: true, hair: 'brown', shirt: '#7a8a5a', sweat: 3 }],
  ['An off-duty clown', { hat: 'clown', nose: 'clown', shirt: '#e2b020', expr0: 'sad' }],
  ['Grandma Knuckles', { hair: 'gray', hairStyle: 'bun', glasses: true, shirt: '#7a3fa0' }],
  ['A biker with a teardrop tattoo of a smaller biker', { beard: true, teardrop: true, hat: 'cap', hatColor: '#111', shirt: '#222', tattoo: true }],
  ['A lawyer, crying', { shirt: '#222', tie: '#b3261e', hair: 'black', expr0: 'sad', teardrop: true }],
];
const ORDER_LINES = ['Gimme a {d}. And make it hurt.', 'One {d}. I\'m not here to talk.', 'A {d}, sweetheart. Like my mama used to make. In prison.', '{d}. Make it sloppy. Like my life.', 'Whatever a {d} is, I need four. Start with one.', 'I\'ll take a {d}. Don\'t spit in it. Unless you want to.'];
const BW = 680, BH = 340, SHELF_Y = 86, GLASS_X = 330, GLASS_Y = 300;
const bx = (i) => 44 + i * 84;

function barBackground(c, W, H) {
  c.fillStyle = '#2a1c14'; c.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 34) { c.fillStyle = x % 68 ? '#2e2016' : '#33241a'; c.fillRect(x, 0, 34, 230); }
  grime(c, 0, 0, W, 230, 70, rng(3), 'rgba(0,0,0,', 0.35);
  // mirror behind the shelf
  rr(c, 6, 6, W - 12, 92, 4); const g = c.createLinearGradient(0, 6, 0, 98); g.addColorStop(0, '#4a5a5a'); g.addColorStop(1, '#2a3434'); fs(c, g, '#000', 2);
  for (let i = 0; i < 4; i++) line(c, 40 + i * 170, 10, 90 + i * 170, 94, 'rgba(255,255,255,.06)', 14);
  // shelf
  rr(c, 0, SHELF_Y, W, 10, 2); fs(c, '#6a4024', '#000', 2);
  // neon

  // counter
  const g2 = c.createLinearGradient(0, 222, 0, H); g2.addColorStop(0, '#7a4a28'); g2.addColorStop(0.1, '#5a3418'); g2.addColorStop(1, '#2a160a');
  c.fillStyle = g2; c.fillRect(0, 222, W, H - 222); line(c, 0, 223, W, 223, '#a8703a', 3);
  for (let i = 0; i < 5; i++) { ell(c, 60 + i * 130, 236 + (i % 2) * 8, 18, 5); fs(c, null, 'rgba(255,255,255,.08)', 2); }
  // Sal's book
  c.save(); c.translate(452, 110);
  rr(c, 0, 0, 222, 224, 6); fs(c, '#5a1a10', '#000', 2.5);
  rr(c, 8, 6, 206, 212, 3); fs(c, '#efe4c8', '#000', 1.5);
  line(c, 111, 8, 111, 216, 'rgba(0,0,0,.15)', 2);
  blob(c, 170, 190, 16, rng(9), 0.4); c.fillStyle = 'rgba(140,90,30,.2)'; c.fill();
  text(c, "SAL'S BOOK", 111, 20, { size: 15, color: '#6d1510', stroke: null, fam: FT });
  c.restore();
}
function drawGlass(c, layers, extras, x, y, t) {
  const gw = 74, gh = 96;
  // liquid
  c.save();
  c.beginPath(); c.moveTo(x - gw / 2 + 3, y - gh); c.lineTo(x + gw / 2 - 3, y - gh); c.lineTo(x + gw / 2 - 9, y - 6); c.lineTo(x - gw / 2 + 9, y - 6); c.closePath(); c.clip();
  let ly = y - 8;
  for (const l of layers) {
    const h = 20 * l.f;
    c.fillStyle = l.col; c.globalAlpha = l.id === 'V' ? 0.55 : 0.92; c.fillRect(x - gw, ly - h, gw * 2, h + 1);
    if (l.id === 'B') { c.globalAlpha = 0.9; for (let i = 0; i < 6; i++) { ell(c, x - 26 + i * 10, ly - h, 6, 4); c.fillStyle = '#fff8e0'; c.fill(); } }
    ly -= h;
  }
  c.globalAlpha = 1;
  if (layers.length) { line(c, x - gw, ly, x + gw, ly, 'rgba(255,255,255,.35)', 2); for (let i = 0; i < 4; i++) { const k = (t * 0.7 + i / 4) % 1; ell(c, x - 18 + i * 12, y - 10 - k * (y - 10 - ly), 2, 2); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill(); } }
  c.restore();
  // garnish
  if (extras.has('L')) drawIcon(c, 'lime', x + 30, y - gh + 2, 36, 0.4);
  if (extras.has('P')) { c.save(); c.translate(x - 22, y - gh - 4); c.rotate(-0.3); rr(c, -6, -22, 12, 50, 6); fs(c, '#4f7d2a', '#000', 2); c.restore(); }
  // glass
  c.beginPath(); c.moveTo(x - gw / 2, y - gh - 4); c.lineTo(x + gw / 2, y - gh - 4); c.lineTo(x + gw / 2 - 8, y); c.lineTo(x - gw / 2 + 8, y); c.closePath();
  fs(c, 'rgba(200,230,240,.12)', 'rgba(230,245,255,.85)', 3);
  rr(c, x - gw / 2 + 6, y - 8, gw - 12, 8, 2); fs(c, 'rgba(200,230,240,.3)', 'rgba(230,245,255,.7)', 1.5);
  line(c, x - gw / 2 + 8, y - gh + 4, x - gw / 2 + 14, y - 14, 'rgba(255,255,255,.5)', 3);
}

export function registerBar(mg) {
  mg.register('mixdrink', {
    name: 'Behind the Bar', width: 700,
    how: howHtml([
      { ic: 'mail', t: 'A customer barks an order. Find it in <b>Sal\'s book</b>.' },
      { ic: ['whiskey', 'lime', 'hotsauce'], k: ['1', '…', '8'], t: 'Tap the bottles in the recipe (any order).' },
      { ic: 'ok', k: ['Space'], t: '<b>SERVE</b>. <kbd>Backspace</kbd> dumps the glass.' },
    ], 'Faster = bigger tip. Wrong drink = spit take. 45 seconds.'),
    lines: { S: ['Sal\'s one eye tears up. "You\'re the son I never wanted."'], F: ['Three customers are now blind. Sal says that\'s "about average".'] },
    create(api) {
      const T = 45, target = 10 - Math.round(api.diff * 2), patience = 15 - api.diff * 5;
      const pool = api.diff < 0.3 ? DRINKS.slice(0, 7) : DRINKS;
      const showRecipe = api.diff < 0.3;
      let t = 0, cust = null, glass = new Set(), sum = 0, served = 0, n = 0, gap = 0, streak = 0;
      let layers = [], pour = null, leaving = null, spit = 0;
      const S = scene(api, BW, BH);
      api.pad([...BOOZE.map((b, i) => ({ k: DIGITS[i], label: padIc(b.ic), sub: `${i + 1} ${b.s}`, cls: 'ic' })), { k: SP, label: padIc('ok', 'SERVE'), sub: 'Space / Enter', cls: 'green wide ic' }, { k: 'Backspace', label: padIc('trash', 'DUMP'), sub: 'Backspace', cls: 'red ic' }]);
      const next = () => {
        const [name, rec] = pick(pool);
        const [who, look] = pick(PATRONS);
        cust = { name, rec, who, look, line: pick(ORDER_LINES).replace('{d}', name), left: patience, born: t };
        n++; glass = new Set(); layers = [];
      };
      const score = () => clamp(sum / target, 0, 1);
      const sc = () => api.score(`🍸 ${served}/${target}`);
      next(); sc();
      const draw = (c, tt) => {
        blit(c, cached('bar:bg', BW, BH, barBackground), 0, 0);
        // bottles on the shelf
        BOOZE.forEach((b, i) => {
          const on = glass.has(b.id);
          const x = bx(i), lift = on ? -8 : 0;
          if (on) glow(c, x, SHELF_Y - 36, 46, 'rgba(255,216,74,.45)');
          drawIcon(c, b.ic, x, SHELF_Y - 38 + lift, 74, on ? -0.12 : 0);
          rr(c, x - 13, SHELF_Y + 12, 26, 20, 4); fs(c, on ? '#ffd84a' : '#221d17', '#000', 1.5);
          text(c, String(i + 1), x, SHELF_Y + 22.5, { size: 15, color: on ? '#141210' : COL.gold, stroke: null });
          S.hit(x - 40, 0, 80, SHELF_Y + 36, DIGITS[i]);
        });
        // recipe book entries
        pool.forEach(([nm, r], k) => {
          const y = 150 + k * 18.5, hi = cust && cust.name === nm;
          if (hi && showRecipe) { rr(c, 462, y - 9, 202, 18, 3); fs(c, 'rgba(255,216,74,.55)'); }
          text(c, nm, 466, y, { size: 13.5, color: '#2a1a10', stroke: null, align: 'left', maxW: 118 });
          [...r].forEach((id, j) => drawIcon(c, BOOZE.find((b) => b.id === id).ic, 600 + j * 18, y, 18));
        });
        // customer
        if (cust || leaving) {
          const C = cust || leaving.c;
          const mood = cust ? clamp(cust.left / patience, 0, 1) : 1;
          const k = cust ? easeOut(clamp((t - C.born) / 0.4, 0, 1)) : 1 - clamp((t - leaving.t) / 0.5, 0, 1);
          const px = 100 - (1 - k) * 160;
          const expr = leaving ? (leaving.ok ? 'happy' : 'sick') : mood < 0.35 ? 'angry' : C.look.expr0 || 'neutral';
          stick(c, px, 372, { h: 220, lw: 5, ...C.look, shirt: C.look.shirt, expr, arms: [[0.5, 0.9], [0.5, 0.9]] });
          if (leaving && !leaving.ok && t - leaving.t < 0.5) S.burst(px + 20, 160, { n: 3, shape: 'drop', color: '#b8a050', speed: 260, angle: 0, spread: 0.8, g: 400, life: 0.5 });
        }
        // counter drawn over the customer's legs
        blit(c, cached('bar:front', 250, 110, (cc) => { const g = cc.createLinearGradient(0, 0, 0, 110); g.addColorStop(0, '#7a4a28'); g.addColorStop(0.12, '#5a3418'); g.addColorStop(1, '#2a160a'); cc.fillStyle = g; cc.fillRect(0, 0, 250, 110); line(cc, 0, 1, 250, 1, '#a8703a', 3); }), 0, 236);
        // speech bubble
        if (cust) {
          bubble(c, 196, 106, 236, 82, 160, 150);
          text(c, cust.name.toUpperCase(), 314, 124, { size: 19, color: '#6d1510', stroke: null, fam: FT, maxW: 220 });
          if (showRecipe) [...cust.rec].forEach((id, j, a) => drawIcon(c, BOOZE.find((b) => b.id === id).ic, 314 + (j - (a.length - 1) / 2) * 34, 150, 32));
          else wrapText(c, `"${cust.line}"`, 314, 146, 220, 15, { size: 13, color: '#3a3020', stroke: null, weight: 600 });
          meter(c, 214, 172, 200, 9, mood(), mood() < 0.35 ? '#e2402f' : '#7fbf4d', '#c8bfa8');
        }
        // glass + pour stream
        const gx = leaving && leaving.ok ? GLASS_X - easeOut(clamp((t - leaving.t) / 0.3, 0, 1)) * 170 : GLASS_X;
        if (pour && t - pour.t < 0.45 && cust) {
          const b = BOOZE.find((x) => x.id === pour.id);
          const k = clamp((t - pour.t) / 0.12, 0, 1);
          if (b.id !== 'L') { line(c, GLASS_X + 6, GLASS_Y - 150, GLASS_X + 4, GLASS_Y - 20 - layers.length * 18, '#000', 8); line(c, GLASS_X + 6, GLASS_Y - 150, GLASS_X + 4, GLASS_Y - 20 - layers.length * 18, b.col, 5); }
          drawIcon(c, b.ic, GLASS_X + 34, GLASS_Y - 170 + (1 - k) * -30, 70, 2.4 * k);
        }
        for (const l of layers) l.f = Math.min(1, l.f + 1 / 60 / 0.3);
        drawGlass(c, layers, glass, gx, GLASS_Y, tt);
        if (!glass.size && cust) text(c, 'empty glass', GLASS_X, GLASS_Y + 18, { size: 13, color: '#a9a291', lw: 3 });
        S.hit(GLASS_X - 50, GLASS_Y - 110, 100, 120, SP);
        comboMeter(c, S, streak, 420, 260, 'STREAK');
      };
      const mood = () => (cust ? clamp(cust.left / patience, 0, 1) : 1);
      return {
        partial: score,
        tick(dt) {
          t += dt;
          api.time(1 - t / T);
          if (cust) {
            cust.left -= dt;
            if (cust.left <= 0) { api.msg(`${cust.who} gives up and drinks from the bar mat.`, 'bad'); api.sfx('miss'); leaving = { c: cust, t, ok: false }; streak = 0; cust = null; gap = 1.1; layers = []; glass = new Set(); }
          } else if ((gap -= dt) <= 0 && t < T - 2) { leaving = null; next(); }
          S.frame(dt, draw);
          if (t >= T) api.done(score(), { stats: `${served} drinks served` });
        },
        key(code) {
          if (!cust) return;
          if (code === 'Backspace') { if (glass.size) S.burst(GLASS_X, GLASS_Y - 40, { n: 16, shape: 'drop', colors: layers.map((l) => l.col), size: 4, speed: 200, life: 0.6 }); glass.clear(); layers = []; api.sfx('pour'); return; }
          if (isAct(code)) {
            const want = [...cust.rec].sort().join(''), got = [...glass].sort().join('');
            if (!got) { api.msg('That\'s an empty glass. Even here, that\'s a no.', 'bad', 700); S.pop('EMPTY!', GLASS_X, GLASS_Y - 120, { color: '#ff8070', size: 20 }); return; }
            if (want === got) {
              const s = 0.7 + 0.3 * (cust.left / patience);
              sum += s; served++; streak++;
              api.sfx('hit');
              S.mark(true, 160, 90, s > 0.9 ? 'BIG TIP!' : 'SERVED');
              S.burst(160, 150, { n: s > 0.9 ? 12 : 5, shape: 'cash', size: 6, speed: 220, g: 300, life: 1 });
              api.msg(s > 0.9 ? pick(['Fast AND filthy. Big tip!', '"That\'s the stuff." They lick the glass.']) : pick(['Served. They grunt. That\'s a thank-you here.', 'They drink it in one go and stare into the void.']), 'good');
              leaving = { c: cust, t, ok: true };
            } else {
              api.sfx('miss'); S.shake(6); streak = 0;
              S.mark(false, 160, 90, 'SPIT TAKE');
              api.msg(pick(['Spit take! Right in Sal\'s good eye.', '"This tastes like a dare." They leave.', '"I said a ' + cust.name + ', not whatever THIS war crime is."']), 'bad', 1300);
              leaving = { c: cust, t, ok: false };
            }
            cust = null; gap = 1.0; sc();
            return;
          }
          const i = digitIndex(code);
          if (i < 0 || i >= BOOZE.length) return false;
          const id = BOOZE[i].id;
          if (glass.has(id)) { glass.delete(id); layers = layers.filter((l) => l.id !== id); }
          else { glass.add(id); if (id !== 'L' || true) layers.push({ id, col: BOOZE[i].col, f: 0 }); pour = { id, t }; }
          api.sfx('pour');
        },
      };
    },
  });
}
