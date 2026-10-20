// Training minigames (stat gains scale with gainMult, still run through train()'s soreness/diminishing rules).
//   reps      (Iron Lung gym)        stop the needle in the sweet spot; perfect streaks add bonus
//   quiz      (Rotwell U classes)    absurd multiple choice from the course's question bank
//   speedread (Public library)       catch only the on-topic words as they flash by
//   dance     (Club Velvet)          arrow rhythm
// Scenes are procedural canvas art (mg/art.js + mg/icons.js).
import { clamp, pick, chance, rand } from '../../core/util.js';
import { shuffle, DIGITS, digitIndex } from '../minigame.js';
import { QUIZ, COURSES } from '../../data/courses.js';
import { scene, cached, blit, rr, ell, fs, line, blob, text, wrapText, glow, grime, rng, TAU, COL, FT, mix, lerp, easeOut, easeBack, comboMeter, stick, bubble, meter, poly } from './art.js';
import { drawIcon, howHtml, padIc, iconImg } from './icons.js';

const L = 'ArrowLeft', R = 'ArrowRight', U = 'ArrowUp', D = 'ArrowDown', SP = 'Space', EN = 'Enter';
const isAct = (c) => c === SP || c === EN;

export function registerTrainGames(mg) {
  // ======================================================================= REPS
  const REP = {
    lift: { n: 10, ic: 'dumbbell', v: 1.15, verb: 'LIFT', moving: false },
    heavy: { n: 14, ic: 'dumbbell', v: 1.35, verb: 'LIFT', moving: false },
    spar: { n: 10, ic: 'boxglove', v: 1.3, verb: 'PUNCH', moving: true },
    cardio: { n: 12, ic: 'runshoe', v: 1.2, verb: 'STRIDE', moving: true },
  };
  const BRICK = {
    perfect: ['"YES! YESSS! THAT\'S THE PUMP!"', '"BEAUTIFUL FORM. I\'M GONNA CRY."', '"Light weight, baby!"', '"YOUR VEINS ARE SINGING!"'],
    ok: ['"Eh. Sloppy. Do it again."', '"That\'s a rep. Barely."', '"My grandma lifts like that. She\'s dead."'],
    miss: ['"WHAT WAS THAT? A SNEEZE?"', 'Your arms turn to soup.', '"Did you just... drop it on your own face?"', 'Something in your back goes "boing".'],
  };
  function gymBackground(c, W, H) {
    c.fillStyle = '#34312c'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < 230; y += 26) for (let x = (y / 26) % 2 ? -30 : 0; x < W; x += 60) { rr(c, x + 1, y + 1, 58, 24, 1); fs(c, '#3e3a34'); }
    grime(c, 0, 0, W, 230, 80, rng(14), 'rgba(0,0,0,', 0.3);
    text(c, 'IRON LUNG', 300, 26, { size: 26, color: 'rgba(214,179,60,.35)', stroke: null, fam: FT });
    // poster
    c.save(); c.translate(462, 40); c.rotate(0.03);
    rr(c, 0, 0, 86, 70, 2); fs(c, '#d8cfb8', '#000', 2);
    text(c, 'PAIN IS', 43, 14, { size: 12, color: '#6d1510', stroke: null, fam: FT }); text(c, 'WEAKNESS', 43, 28, { size: 12, color: '#6d1510', stroke: null, fam: FT });
    text(c, 'LEAVING.', 43, 42, { size: 12, color: '#6d1510', stroke: null, fam: FT }); text(c, '(also blood)', 43, 58, { size: 10, color: '#555', stroke: null });
    c.restore();
    // floor
    c.fillStyle = '#1c1b1a'; c.fillRect(0, 230, W, H - 230);
    for (let x = 0; x < W; x += 60) line(c, x, 230, x - 30, H, 'rgba(255,255,255,.04)', 2);
    line(c, 0, 231, W, 231, '#000', 3);
  }
  mg.register('reps', {
    name: 'Rep It Out', statGame: true,
    how: (o) => { const R0 = REP[o.variant] || REP.lift; return howHtml([
      { ic: R0.ic, k: ['Space'], t: `<b>${R0.verb}</b> when the needle is in the <b style="color:#ffd84a">gold</b> (green is OK).` },
      { ic: 'flame', t: 'Perfect streaks of <b>3+</b> pile on bonus gains.' },
      { ic: 'clock', t: `You tire: the needle speeds up${R0.moving ? ' and the sweet spot moves' : ''}. Don't stall — Brick counts out loud.` },
    ], `<b>${R0.n} reps.</b>`); },
    lines: { S: ['Brick lifts YOU over his head in celebration. It\'s weird. It\'s beautiful.'], F: ['Brick has to call your mom to pick you up.'] },
    create(api) {
      const V = REP[api.variant] || REP.lift;
      const kind = api.variant === 'spar' ? 'spar' : api.variant === 'cardio' ? 'cardio' : 'lift';
      const N = V.n;
      let rep = 0, x = 0, dir = 1, sum = 0, streak = 0, best = 0, bonus = 0, idle = 0, cool = 0;
      let zc = 0.5, okW = 0.28 - api.diff * 0.08, topW = 0.08 - api.diff * 0.02;
      let anim = null, said = '"Let\'s GO. Light weight."', bag = 0, bagV = 0, run = 0, t = 0;
      const W = 560, H = 300;
      const S = scene(api, W, H);
      api.pad([{ k: SP, label: padIc(V.ic, V.verb), sub: 'Space / Enter / tap', cls: 'wide gold ic' }]);
      const score = () => clamp((sum + bonus) / N, 0, 1);
      const GX = 444, GY = 214, GR = 96;
      const ang = (v) => Math.PI + v * Math.PI;
      const doRep = (pts, k2) => {
        rep++; sum += pts;
        if (k2 === 'perfect') { streak++; best = Math.max(best, streak); if (streak >= 3) bonus += 0.12; } else streak = 0;
        said = pick(BRICK[k2]);
        api.sfx(k2 === 'perfect' ? 'perfect' : k2 === 'ok' ? 'grunt' : 'miss');
        if (k2 === 'miss') S.shake(8);
        anim = { k: k2, t: 0 };
        if (kind === 'spar' && k2 !== 'miss') bagV += k2 === 'perfect' ? 5 : 2.5;
        const px = kind === 'spar' ? 300 : 170, py = kind === 'lift' ? 70 : 130;
        if (k2 === 'perfect') { S.burst(px, py, { n: 14, shape: 'star', colors: ['#ffd84a', '#fff'], size: 6, speed: 200, g: 100 }); S.pop(streak >= 3 ? `PERFECT x${streak}` : 'PERFECT', GX, GY - GR - 24, { color: COL.gold, size: 24 }); }
        else if (k2 === 'ok') S.pop('OK', GX, GY - GR - 24, { color: '#a8e070', size: 22 });
        else { S.mark(false, GX, GY - GR - 24, 'MISS'); S.burst(170, 120, { n: 8, shape: 'drop', color: '#8fd0ff', speed: 160, life: 0.6 }); }
        idle = 0; cool = 0.18;
        okW = Math.max(0.12, okW - 0.008);
        if (V.moving) zc = rand(0.2, 0.8);
        if (rep >= N) api.done(score(), { stats: `${N} reps · best streak ${best}` });
      };
      const drawLifter = (c, tt) => {
        const fat = rep / N;
        const ak = anim ? clamp(anim.t / 0.45, 0, 1) : 1;
        const shake = (fat * 1.5 + (idle > 2 ? 1.5 : 0)) * Math.sin(tt * 40);
        const expr = anim && ak < 1 ? (anim.k === 'miss' ? 'shock' : 'strain') : fat > 0.6 ? 'strain' : 'neutral';
        const sweat = Math.round(fat * 3);
        if (kind === 'lift') {
          // p: 0 = bar at chest, 1 = locked out overhead; miss = bar crashes down
          let p = 0.05 + Math.min(1, idle / 3) * 0.25;
          if (anim && ak < 1) p = anim.k === 'miss' ? lerp(0.3, -0.4, easeOut(ak)) : Math.sin(ak * Math.PI) * (anim.k === 'perfect' ? 1 : 0.7);
          const a = lerp(1.25, 2.85, clamp(p, 0, 1)), b = lerp(1.75, 0.1, clamp(p, 0, 1));
          const fig = stick(c, 180 + shake * 0.6, 268, { h: 180, shirt: '#6a2a2a', pants: '#222', hair: 'black', expr, sweat, arms: [[a, b], [a, b]], legs: [[0.32, -0.1], [0.32, -0.1]], lw: 5 });
          const [h1, h2] = fig.hands;
          const by = p < 0 ? Math.min(250, lerp(h1[1], 250, -p / 0.4)) : (h1[1] + h2[1]) / 2;
          const heavy = api.variant === 'heavy';
          line(c, 180 - 100, by, 180 + 100, by, '#000', 9); line(c, 180 - 100, by, 180 + 100, by, '#c8ccd0', 5);
          for (const s of [-1, 1]) for (let k = 0; k < (heavy ? 3 : 2); k++) { const pr = (heavy ? 30 : 24) - k * 4; rr(c, 180 + s * (76 + k * 10) - 5, by - pr, 10, pr * 2, 3); fs(c, k === 0 ? '#2a2a2e' : '#3a3a40', '#000', 2); }
        } else if (kind === 'spar') {
          let a1 = 2.5, b1 = 2.6, a2 = 2.3, b2 = 2.5;
          if (anim && ak < 1 && anim.k !== 'miss') { const k = Math.sin(ak * Math.PI); a2 = lerp(2.3, 1.55, k); b2 = lerp(2.5, 0, k); }
          if (anim && ak < 1 && anim.k === 'miss') { a1 = 0.6; b1 = 0.3; a2 = 0.6; b2 = 0.3; }
          const fig = stick(c, 178 + shake * 0.4, 268, { h: 180, shirt: null, pants: '#2a3a8a', hair: 'black', expr, sweat, arms: [[a1, b1], [a2, b2]], legs: [[0.36, -0.12], [0.3, 0.05]], lw: 5 });
          for (const hd of fig.hands) drawIcon(c, 'boxglove', hd[0], hd[1], 32, 0);
          // heavy bag
          c.save(); c.translate(288, 0); c.rotate(bag * 0.12);
          line(c, 0, 0, 0, 60, '#555', 3);
          rr(c, -32, 60, 64, 150, 24); const g = c.createLinearGradient(-32, 0, 32, 0); g.addColorStop(0, '#5a1a12'); g.addColorStop(0.5, '#a83a2a'); g.addColorStop(1, '#5a1a12'); fs(c, g, '#000', 3);
          for (const y of [90, 180]) line(c, -32, y, 32, y, '#2a0a06', 4);
          text(c, 'GARY', 0, 136, { size: 18, color: '#f2d0c0', stroke: null, fam: FT });
          c.restore();
        } else {
          run += (0.5 + fat) * 0.25;
          const sw = Math.sin(run * 6);
          // treadmill
          c.beginPath(); c.moveTo(70, 268); c.lineTo(300, 268); c.lineTo(300, 284); c.lineTo(70, 284); c.closePath(); fs(c, '#2a2a2e', '#000', 3);
          for (let x = 74 - ((run * 40) % 16); x < 298; x += 16) line(c, x, 270, x, 282, '#4a4a50', 2);
          line(c, 290, 268, 270, 150, '#6a7076', 6); rr(c, 250, 140, 50, 22, 3); fs(c, '#3a3e44', '#000', 2); text(c, `${(6 + fat * 4).toFixed(1)}mph`, 275, 151, { size: 11, color: '#7fbf4d', stroke: null });
          stick(c, 180, 284, { h: 175, shirt: '#3c6a8a', pants: '#222', hair: 'brown', expr, sweat, arms: [[0.5 + sw * 0.6, 1.2], [0.5 - sw * 0.6, 1.2]], legs: [[0.25 + sw * 0.45, -0.3 - Math.max(0, sw) * 0.8], [0.25 - sw * 0.45, -0.3 - Math.max(0, -sw) * 0.8]], lw: 5, lean: 0.4 });
        }
      };
      const draw = (c, tt) => {
        blit(c, cached('gym:bg', W, H, gymBackground), 0, 0);
        // Brick
        stick(c, 34, 262, { h: 140, shirt: '#e8e4d8', pants: '#3a3a3a', hair: 'black', hairStyle: 'bald', beard: true, expr: anim?.k === 'miss' ? 'angry' : anim?.k === 'perfect' ? 'happy' : 'neutral', arms: anim?.k === 'perfect' && anim.t < 0.6 ? [[2.8, 0.1], [2.8, 0.1]] : [[0.25, 0.3], [0.25, 0.3]], lw: 5 });
        bubble(c, 8, 40, 230, 46, 34, 114);
        wrapText(c, said, 123, 55, 214, 16, { size: 14, color: '#141210', stroke: null });
        drawLifter(c, tt);
        // effort gauge
        c.save();
        ell(c, GX, GY, GR + 12, GR + 12); c.fillStyle = 'rgba(0,0,0,.35)'; c.fill();
        c.beginPath(); c.arc(GX, GY, GR, Math.PI, TAU); c.lineTo(GX, GY); c.closePath(); fs(c, '#efe8d6', '#000', 3);
        const arc = (a0, a1, col, w) => { c.beginPath(); c.arc(GX, GY, GR - w / 2 - 4, ang(a0), ang(a1)); c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'butt'; c.stroke(); };
        arc(0, 1, '#c8bfa8', 30);
        arc(clamp(zc - okW / 2, 0, 1), clamp(zc + okW / 2, 0, 1), '#7fbf4d', 30);
        arc(clamp(zc - topW / 2, 0, 1), clamp(zc + topW / 2, 0, 1), '#ffd84a', 34);
        for (let i = 0; i <= 10; i++) { const a = ang(i / 10); line(c, GX + Math.cos(a) * (GR - 2), GY + Math.sin(a) * (GR - 2), GX + Math.cos(a) * (GR - 10), GY + Math.sin(a) * (GR - 10), '#000', 2); }
        const na = ang(x);
        line(c, GX, GY, GX + Math.cos(na) * (GR - 8), GY + Math.sin(na) * (GR - 8), '#000', 7);
        line(c, GX, GY, GX + Math.cos(na) * (GR - 8), GY + Math.sin(na) * (GR - 8), '#e2402f', 4);
        ell(c, GX, GY, 10, 10); fs(c, '#333', '#000', 2);
        c.restore();
        text(c, 'EFFORT', GX, GY + 20, { size: 14, color: COL.dim, lw: 3 });
        text(c, `REP ${rep}/${N}`, GX, GY + 48, { size: 28, color: COL.bone, lw: 5, fam: FT });
        if (streak >= 3) { drawIcon(c, 'flame', GX - 72, GY + 48, 30 + Math.sin(tt * 12) * 3); text(c, `x${streak}`, GX - 52, GY + 50, { size: 18, color: COL.gold, lw: 4, align: 'left' }); }
        // stall timer
        const stall = clamp(idle / 3.2, 0, 1);
        if (stall > 0.45) text(c, `${(3.2 - idle).toFixed(1)}s — REP!`, 170, 24, { size: 18, color: stall > 0.75 ? '#ff6a5a' : COL.gold, lw: 4 });
        S.hit(0, 0, W, H, SP);
      };
      return {
        partial: () => clamp((sum + bonus) / N, 0, 1),
        tick(dt) {
          t += dt;
          const v = V.v * (1 + api.diff * 0.5) * (1 + rep * 0.035);
          x += dir * v * dt;
          if (x > 1) { x = 1; dir = -1; } else if (x < 0) { x = 0; dir = 1; }
          if (cool > 0) cool -= dt;
          if (anim) anim.t += dt;
          bagV += (-bag * 30 - bagV * 3) * dt; bag += bagV * dt;
          idle += dt;
          api.time(1 - idle / 3.2);
          if (idle > 3.2) { api.msg('You stalled. Brick counts it as a failed rep. Loudly.', 'bad'); doRep(0, 'miss'); }
          S.frame(dt, draw);
        },
        key(code) {
          if (!isAct(code)) return false;
          if (cool > 0) return;
          const d = Math.abs(x - zc);
          if (d <= topW / 2 + 0.01) doRep(1, 'perfect');
          else if (d <= okW / 2) doRep(0.62, 'ok');
          else doRep(0, 'miss');
        },
      };
    },
  });

  // ======================================================================= QUIZ
  mg.register('quiz', {
    name: 'Pop Quiz', statGame: true, width: 660,
    how: (o) => howHtml([
      { ic: 'book', t: `${COURSES[o.variant]?.prof || 'The professor'} slaps down a pop quiz: <b>5 questions</b>, a few seconds each.` },
      { ic: 'ok', k: ['1', '2', '3', '4'], t: 'Answer, or tap. <b>Faster</b> correct answers score higher.' },
      { ic: 'brain', t: 'Good scores = more INT out of today\'s lecture.' },
    ]),
    lines: { S: ['The professor pins your quiz on the wall. Someone draws a penis on it. Still counts.'], F: ['The professor reads your answers aloud to the class as a cautionary tale.'] },
    create(api) {
      const bank = shuffle(QUIZ[api.variant] || QUIZ.general);
      const qs = bank.slice(0, 5);
      const per = 10 + Math.min(3, (api.p.int || 0) / 40) - api.diff * 2;
      let i = 0, left = per, sum = 0, right = 0, cur = null, wait = 0, mood = 0, last = null;
      api.stage.classList.add('mg-cv');
      api.stage.innerHTML = `<div class="qz-room"><div class="qz-prof"></div><div class="qz-board"><div class="qz-head"><span data-n></span><span data-tally></span></div><div class="qz-q" data-q></div><div class="qz-stamp" data-st></div></div></div><div class="mg-ans" data-a></div>`;
      const qEl = api.stage.querySelector('[data-q]'), aEl = api.stage.querySelector('[data-a]'), nEl = api.stage.querySelector('[data-n]'), tEl = api.stage.querySelector('[data-tally]'), stEl = api.stage.querySelector('[data-st]');
      const S = scene(api, 130, 200, { mount: api.stage.querySelector('.qz-prof') });
      api.pad([]);
      const prof = COURSES[api.variant]?.prof || 'The professor';
      const show = () => {
        const q = qs[i];
        const opts = shuffle(q.a.map((txt, k) => ({ txt, ok: k === 0 })));
        cur = { q, opts };
        left = per;
        nEl.textContent = `QUESTION ${i + 1}/${qs.length}`;
        qEl.innerHTML = q.q;
        stEl.innerHTML = '';
        aEl.innerHTML = opts.map((o, k) => `<button type="button" tabindex="-1" data-k="${DIGITS[k]}"><i>${'ABCD'[k]}</i><span>${o.txt}</span></button>`).join('');
      };
      show(); api.score('📝 0/5');
      const answer = (k) => {
        const btns = aEl.querySelectorAll('button');
        const ci = cur.opts.findIndex((o) => o.ok);
        btns[ci]?.classList.add('right');
        if (k === ci) {
          right++; sum += 0.6 + 0.4 * clamp(left / per, 0, 1); api.sfx('perfect'); mood = 1; last = true;
          stEl.innerHTML = `${iconImg('ok', 64)}<b>CORRECT</b>`;
          api.msg(pick(['Correct!', 'Correct. The professor looks almost disappointed.', 'Right! A nerd in the front row hisses at you.']), 'good');
        } else {
          if (k >= 0) btns[k]?.classList.add('wrong');
          api.sfx('miss'); api.shake(); mood = -1; last = false;
          stEl.innerHTML = `${iconImg('no', 64)}<b>${k < 0 ? 'TIME!' : 'WRONG'}</b>`;
          api.msg(k < 0 ? 'Time! You were drawing a skull on your desk.' : pick(['Wrong. The class laughs. One of them is the professor.', 'Nope. You can hear your tuition crying.', 'Incorrect. Somewhere, your mom sighs.']), 'bad', 1200);
        }
        i++; wait = 1.2; cur = null;
        tEl.innerHTML = '<s>||||</s> '.repeat(Math.floor(right / 5)) + '|'.repeat(right % 5) + (i - right ? ` ✗${i - right}` : '');
        api.score(`📝 ${right}/${i}`);
      };
      const draw = (c, tt) => {
        const bob = Math.sin(tt * 3) * 2;
        const pointAt = cur ? 2.2 + Math.sin(tt * 2) * 0.15 : 1.0;
        const fig = stick(c, 62, 196, { h: 170, shirt: '#5a4a3a', tie: '#7a1a1a', pants: '#2a2a2a', hair: 'gray', hairStyle: 'bald', glasses: true, beard: !!(api.variant && api.variant.length % 2), expr: mood > 0.3 ? 'sad' : mood < -0.3 ? 'smug' : 'neutral', arms: [[0.3, 0.2], [pointAt, 0.1]], lw: 4 });
        const [hx, hy] = fig.hands[1];
        line(c, hx, hy, hx + 60, hy - 30 + bob, '#7a5228', 4);
        if (wait > 0 && last != null) bubble(c, 4, 4, 122, 30, 60, 42), text(c, last ? '"Hmph. Fine."' : '"Pathetic."', 65, 19, { size: 14, color: '#141210', stroke: null });
        else text(c, prof.split(' ').slice(-1)[0], 65, 18, { size: 13, color: COL.dim, lw: 3 });
      };
      return {
        partial: () => sum / qs.length,
        tick(dt) {
          mood *= 1 - dt;
          S.frame(dt, draw);
          if (wait > 0) { wait -= dt; if (wait <= 0) { if (i >= qs.length) api.done(sum / qs.length, { stats: `${right}/${qs.length} correct` }); else show(); } return; }
          left -= dt;
          api.time(left / per);
          if (left <= 0 && cur) answer(-1);
        },
        key(code) {
          const k = digitIndex(code);
          if (k < 0 || k > 3) return false;
          if (cur && k < cur.opts.length) answer(k);
        },
      };
    },
  });

  // ======================================================================= SPEEDREAD
  const TOPICS = [
    { t: 'SPOONS', ic: 'book', on: ['LADLE', 'STIR', 'SOUP', 'TEASPOON', 'CUTLERY', 'SCOOP', 'SILVERWARE', 'CEREAL', 'DESSERT', 'UTENSIL', 'SPORK'] },
    { t: 'TAXES', ic: 'calendar', on: ['AUDIT', 'DEDUCTION', 'REFUND', 'IRS', 'RECEIPT', 'W-2', 'LOOPHOLE', 'FILING', 'PENALTY', 'INCOME', 'ACCOUNTANT'] },
    { t: 'DINOSAURS', ic: 'bone', on: ['FOSSIL', 'T-REX', 'JURASSIC', 'METEOR', 'RAPTOR', 'EXTINCT', 'BONES', 'SCALES', 'ROAR', 'PTERODACTYL', 'AMBER'] },
    { t: 'PLUMBING', ic: 'pipe', on: ['PIPE', 'WRENCH', 'CLOG', 'DRAIN', 'TOILET', 'PLUNGER', 'LEAK', 'VALVE', 'SEWER', 'FAUCET', 'U-BEND'] },
    { t: 'THE OCEAN', ic: 'eyeball', on: ['WAVE', 'SHARK', 'CORAL', 'TIDE', 'SALT', 'WHALE', 'KELP', 'REEF', 'SQUID', 'ANCHOR', 'SAILOR'] },
    { t: 'MEDIEVAL TIMES', ic: 'bell', on: ['KNIGHT', 'CASTLE', 'PLAGUE', 'PEASANT', 'MOAT', 'JOUST', 'LUTE', 'SERF', 'DRAGON', 'CATAPULT', 'MEAD'] },
  ];
  const JUNK = ['BOOBS', 'NAP', 'PIZZA', 'DIVORCE', 'NACHOS', 'BUTT', 'FART', 'HOT SINGLES', 'CRYPTO', 'RASH', 'MOIST', 'TOENAIL', 'GARY', 'LASAGNA', 'SEXY', 'WIFI', 'BEER', 'TINDER', 'NIPPLE', 'SNACK', 'KARAOKE', 'GOSSIP', 'UNDERWEAR', 'CHEESE', 'BINGO', 'MULLET', 'VAPE', 'BURRITO'];
  function libBackground(c, W, H) {
    c.fillStyle = '#2a2018'; c.fillRect(0, 0, W, H);
    const Rn = rng(19);
    for (let s = 0; s < 3; s++) {
      const y = 20 + s * 62;
      for (let x = 4; x < W - 4;) { const w = 8 + Rn() * 12, h = 38 + Rn() * 16; rr(c, x, y + 52 - h, w, h, 1); fs(c, ['#6a2a1e', '#2a4a3a', '#3a3a6a', '#7a6a3a', '#4a2a4a', '#5a5a5a'][(Rn() * 6) | 0], '#000', 1); if (Rn() < 0.3) line(c, x + 2, y + 52 - h + 6, x + w - 2, y + 52 - h + 6, 'rgba(255,220,120,.5)', 1.5); x += w + (Rn() < 0.1 ? 14 : 1); }
      rr(c, 0, y + 52, W, 8, 1); fs(c, '#5a3a20', '#000', 1.5);
    }
    c.fillStyle = 'rgba(10,8,6,.55)'; c.fillRect(0, 0, W, H);
    // desk
    const g = c.createLinearGradient(0, 214, 0, H); g.addColorStop(0, '#6a4a2a'); g.addColorStop(1, '#3a2614');
    c.fillStyle = g; c.fillRect(0, 214, W, H - 214); line(c, 0, 215, W, 215, '#8a6a3a', 3);
    // the open book
    c.beginPath(); c.moveTo(300, 236); c.quadraticCurveTo(230, 220, 150, 228); c.lineTo(140, 296); c.quadraticCurveTo(230, 288, 300, 300); c.quadraticCurveTo(370, 288, 460, 296); c.lineTo(450, 228); c.quadraticCurveTo(370, 220, 300, 236); c.closePath();
    fs(c, '#efe6cc', '#000', 3);
    line(c, 300, 236, 300, 300, 'rgba(0,0,0,.4)', 2);
    for (let i = 0; i < 6; i++) { line(c, 164, 240 + i * 9, 288, 244 + i * 9, 'rgba(0,0,0,.25)', 2); line(c, 312, 244 + i * 9, 436, 240 + i * 9, 'rgba(0,0,0,.25)', 2); }
    // lamp glow
    const lg = c.createRadialGradient(300, 210, 10, 300, 210, 260); lg.addColorStop(0, 'rgba(255,220,140,.22)'); lg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = lg; c.fillRect(0, 0, W, H);
  }
  mg.register('speedread', {
    name: 'Speed Reading', statGame: true,
    how: howHtml([
      { ic: 'book', t: 'Words fly out of the book, one at a time.' },
      { ic: 'brain', k: ['Space'], t: '<b>CATCH</b> only words about today\'s <b>TOPIC</b>.' },
      { ic: 'no', t: 'Your brain will grab the dirty words. Don\'t let it — wrong catches cost you.' },
    ]),
    lines: { S: ['Mrs. Shush nods at you. Once. You will remember it on your deathbed.'], F: ['You read the same sentence about boobs 40 times. Mrs. Shush escorts you out.'] },
    create(api) {
      const topic = pick(TOPICS);
      const N = 26 + Math.round(api.variant === 'hard' ? 8 : 0);
      const seq = [];
      const ons = shuffle(topic.on);
      for (let k = 0; k < N; k++) seq.push(chance(0.42) ? { w: ons[k % ons.length], on: true } : { w: pick(JUNK), on: false });
      const onCount = seq.filter((s) => s.on).length || 1;
      let i = -1, left = 0, hits = 0, fp = 0, caught = false, shush = 0, wt = 0, gone = [];
      const dur = (k) => (1.05 - api.diff * 0.3) * (1 - 0.3 * (k / N));
      const W = 600, H = 300;
      const S = scene(api, W, H);
      api.pad([{ k: SP, label: padIc('brain', 'CATCH'), sub: 'Space / Enter / tap', cls: 'wide gold ic' }]);
      const score = () => clamp((hits - 0.6 * fp) / onCount, 0, 1);
      const sc = () => api.score(`🧠 ${hits}/${onCount}${fp ? ` · ❌${fp}` : ''}`);
      sc();
      const next = () => {
        if (i >= 0 && !caught) gone.push({ w: seq[i].w, t: 0, kind: 'drift' });
        i++;
        if (i >= N) { api.done(score(), { stats: `${hits}/${onCount} caught · ${fp} wrong` }); return; }
        caught = false; wt = 0;
        left = dur(i);
        api.sfx('tickTock');
      };
      left = 0.8;
      const wordAt = (k) => { const e = easeOut(clamp(k / 0.3, 0, 1)); return [300, lerp(236, 132, e), lerp(0.3, 1, e)]; };
      const drawWord = (c, w, x, y, s, col, a = 1) => {
        c.save(); c.globalAlpha = a; c.translate(x, y); c.scale(s, s);
        c.font = `700 40px ${"'Special Elite', monospace"}`;
        const tw = c.measureText(w).width + 34;
        rr(c, -tw / 2, -30, tw, 60, 8); fs(c, '#f4ecd6', '#000', 3);
        text(c, w, 0, 2, { size: 40, color: col, stroke: null, fam: FT });
        c.restore();
      };
      const draw = (c, tt) => {
        blit(c, cached('lib:bg', W, H, libBackground), 0, 0);
        // topic ribbon
        rr(c, 150, 8, 300, 40, 4); fs(c, '#6d1510', '#000', 3);
        poly(c, [150, 8, 136, 28, 150, 48]); fs(c, '#4a0e0a', '#000', 2); poly(c, [450, 8, 464, 28, 450, 48]); fs(c, '#4a0e0a', '#000', 2);
        drawIcon(c, topic.ic, 178, 28, 30);
        text(c, `TOPIC: ${topic.t}`, 310, 29, { size: 22, color: COL.gold, lw: 4, fam: FT, maxW: 250 });
        // brain counter
        drawIcon(c, 'brain', 548, 60, 64 + (hits ? Math.max(0, 1 - wt * 4) * 0 : 0));
        text(c, String(hits), 548, 102, { size: 22, color: '#f0a0b0', lw: 4, fam: FT });
        // Mrs. Shush
        stick(c, 62, 300, { h: 190, shirt: '#4a3a5a', hair: 'gray', hairStyle: 'bun', glasses: true, expr: shush > 0 ? 'angry' : 'smug', arms: shush > 0 ? [[0.4, 0.3], [2.4, 2.2]] : [[0.4, 0.3], [0.4, 0.3]], lw: 4 });
        if (shush > 0) { bubble(c, 8, 70, 100, 30, 60, 112); text(c, 'SHHHH!', 58, 85, { size: 18, color: '#6d1510', stroke: null, fam: FT }); }
        // leftovers
        for (const g of gone) {
          g.t += 1 / 60;
          const k = clamp(g.t / 0.45, 0, 1);
          if (g.kind === 'catch') drawWord(c, g.w, lerp(300, 548, easeOut(k)), lerp(132, 60, easeOut(k)), lerp(1, 0.15, k), '#3c8a3a', 1 - k * 0.5);
          else if (g.kind === 'drift') drawWord(c, g.w, 300, 132 - k * 60, 1 - k * 0.3, '#7a7060', 0.6 * (1 - k));
        }
        gone = gone.filter((g) => g.t < 0.45);
        if (i >= 0 && i < N && !(caught && seq[i].on)) {
          const [x, y, s] = wordAt(wt);
          const col = caught ? '#c0201a' : '#141210';
          const jit = caught ? (Math.random() - 0.5) * 6 : 0;
          drawWord(c, seq[i].w, x + jit, y, s, col);
          // remaining-time underline
          const fr = clamp(left / dur(i), 0, 1);
          line(c, 300 - 90 * fr, 172, 300 + 90 * fr, 172, 'rgba(255,216,74,.7)', 4);
        } else if (i < 0) text(c, 'get ready…', 300, 132, { size: 26, color: COL.dim, lw: 4, fam: FT });
        // progress dots on the book
        const pd = Math.min(N, Math.max(0, i + 1));
        text(c, `page ${pd}/${N}`, 300, 288, { size: 12, color: '#6a5a4a', stroke: null });
        S.hit(0, 0, W, H, SP);
      };
      return {
        partial: score,
        tick(dt) {
          left -= dt; wt += dt;
          if (shush > 0) shush -= dt;
          api.time(1 - Math.max(0, i) / N);
          if (left <= 0) next();
          S.frame(dt, draw);
        },
        key(code) {
          if (!isAct(code)) return false;
          if (i < 0 || caught || i >= N) return;
          caught = true;
          if (seq[i].on) { hits++; api.sfx('hit'); gone.push({ w: seq[i].w, t: 0, kind: 'catch' }); S.burst(548, 60, { n: 10, shape: 'star', colors: ['#f0a0b0', '#fff'], size: 5, speed: 140, g: 60 }); S.pop('+1', 548, 30, { color: '#a8e070', size: 22 }); }
          else {
            fp++; api.sfx('miss'); shush = 1.2; S.shake(5);
            S.burst(300, 132, { n: 16, shape: 'chunk', colors: ['#f4ecd6', '#c0201a'], size: 6, speed: 220, life: 0.6 });
            S.mark(false, 420, 110, 'OFF-TOPIC');
            api.msg(pick([`"${seq[i].w}" is not about ${topic.t.toLowerCase()}. Focus.`, 'Your brain grabbed the wrong word. Typical.', 'Mrs. Shush clears her throat at you.']), 'bad', 800);
          }
          sc();
        },
      };
    },
  });

  // ======================================================================= DANCE
  const LANES = [L, D, U, R];
  const LIC = { [L]: 'arrowL', [D]: 'arrowD', [U]: 'arrowU', [R]: 'arrowR' };
  const LCOL = { [L]: '#c74ad1', [D]: '#3fa7e0', [U]: '#5fd35a', [R]: '#e2402f' };
  const DJ = ['DJ Moist: "MAKE SOME NOISE!"', 'DJ Moist: "WHO\'S SWEATY?!"', 'DJ Moist: "THIS ONE\'S FOR MY PAROLE OFFICER!"', 'DJ Moist: "DROP IT LIKE IT\'S MOIST!"'];
  function clubBackground(c, W, H) {
    c.fillStyle = '#0e0a14'; c.fillRect(0, 0, W, H);
    // back wall speakers
    for (const x of [300, 520]) { rr(c, x - 26, 40, 52, 90, 4); fs(c, '#1a1620', '#000', 2); for (const y of [64, 104]) { ell(c, x, y, 17, 17); fs(c, '#222', '#444', 3); ell(c, x, y, 6, 6); fs(c, '#333'); } }
    // DJ booth
    rr(c, 474, 150, 80, 30, 4); fs(c, '#2a2030', '#000', 2); text(c, 'DJ MOIST', 514, 165, { size: 13, color: '#ff7ad0', stroke: null, fam: FT });
    // lane strip
    rr(c, 8, 8, 272, H - 16, 10); fs(c, 'rgba(0,0,0,.55)', '#2a2a3a', 2);
  }
  mg.register('dance', {
    name: 'Dance Floor', statGame: true, width: 600,
    how: howHtml([
      { ic: ['arrowL', 'arrowD', 'arrowU', 'arrowR'], t: 'Arrows rise to the line at the top.' },
      { ic: 'ok', k: ['←', '↓', '↑', '→'], t: 'Hit the match as each one crosses the line (or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, or tap the lanes).' },
      { ic: 'flame', t: 'Combos make the crowd love you.' },
    ], '~30 seconds of DJ Moist.'),
    lines: { S: ['The crowd carries you out on their shoulders. Into the street. Then they go back in.'], F: ['You dance like a folding chair falling down stairs. Someone calls an ambulance, just in case.'] },
    create(api) {
      const W = 560, H = 320;
      const lineY = 44, laneTop = 8, laneBot = H - 12, travel = 1.7 - api.diff * 0.45;
      const bpm = 108 + api.diff * 30, beat = 60 / bpm, songLen = 28;
      const notes = [];
      let lastLane = -1;
      for (let tb = 1.2; tb < songLen; tb += beat / 2) {
        const onBeat = Math.abs((tb - 1.2) / beat - Math.round((tb - 1.2) / beat)) < 0.01;
        if (onBeat ? chance(0.72) : chance(0.12 + api.diff * 0.25)) {
          let ln = Math.floor(Math.random() * 4);
          if (ln === lastLane && chance(0.5)) ln = (ln + 1 + Math.floor(Math.random() * 3)) % 4;
          lastLane = ln;
          notes.push({ t: tb, lane: LANES[ln], state: 0, hitT: 0, kind: '' });
        }
      }
      let t = 0, combo = 0, maxCombo = 0, perf = 0, good = 0, miss = 0, djT = 0, dj = '', move = null, recv = {}, hype = 0;
      const S = scene(api, W, H);
      api.pad(LANES.map((ln) => ({ k: ln, label: padIc(LIC[ln]), cls: 'ic' })));
      const laneX = (ln) => 22 + (LANES.indexOf(ln) + 0.5) * 61;
      const total = notes.length || 1;
      const score = () => clamp((perf + 0.6 * good) / total, 0, 1);
      const sc = () => api.score(`🕺 ${combo > 2 ? `combo ${combo}` : `${Math.round(score() * 100)}%`}`);
      sc();
      const judge = (n, kind) => {
        n.state = 1; n.kind = kind; n.hitT = t;
        if (kind === 'perfect') { perf++; combo++; api.sfx('perfect'); }
        else if (kind === 'good') { good++; combo++; api.sfx('hit'); }
        else { miss++; combo = 0; hype = Math.max(0, hype - 0.3); }
        maxCombo = Math.max(maxCombo, combo);
        const x = laneX(n.lane);
        if (kind !== 'miss') {
          move = { lane: n.lane, t };
          recv[n.lane] = t;
          hype = Math.min(1, hype + 0.06);
          S.burst(x, lineY, { n: kind === 'perfect' ? 12 : 6, shape: 'star', colors: [LCOL[n.lane], '#fff'], size: 5, speed: 180, g: 120, life: 0.5 });
          S.pop(kind === 'perfect' ? 'PERFECT' : 'GOOD', x, lineY + 46, { color: kind === 'perfect' ? COL.gold : '#a8e070', size: 18, rise: 20, life: 0.6 });
        } else S.pop('MISS', x, lineY + 46, { color: '#ff6a5a', size: 16, rise: 16, life: 0.6 });
        if (combo && combo % 10 === 0) { api.msg(pick([`${combo} COMBO! A girl throws her bra. It hits DJ Moist.`, `${combo} COMBO! Someone yells "WORLDSTAR!"`, `${combo} COMBO! The floor is sticky with admiration.`]), 'gold'); S.flash('rgba(255,216,74,.25)'); }
        sc();
      };
      const POSES = {
        [L]: { arms: [[2.7, 0.2], [0.9, 1.4]], legs: [[0.5, -0.1], [0.1, 0]], lean: -0.6 },
        [R]: { arms: [[0.9, 1.4], [2.7, 0.2]], legs: [[0.1, 0], [0.5, -0.1]], lean: 0.6 },
        [U]: { arms: [[2.9, 0.1], [2.9, 0.1]], legs: [[0.2, 0], [0.2, 0]], lean: 0 },
        [D]: { arms: [[1.2, 1.6], [1.2, 1.6]], legs: [[0.7, -1.2], [0.7, -1.2]], lean: 0 },
        idle: { arms: [[0.5, 1.2], [0.5, 1.2]], legs: [[0.22, 0], [0.22, 0]], lean: 0 },
      };
      const draw = (c, tt) => {
        const beatK = ((t - 1.2) / beat) % 1;
        const pulse = t > 1.2 ? Math.max(0, 1 - beatK * 3) : 0;
        blit(c, cached('club:bg', W, H, clubBackground), 0, 0);
        // floor tiles
        const cols = ['#c74ad1', '#3fa7e0', '#5fd35a', '#e2402f', '#ffd84a'];
        const bi = Math.floor(Math.max(0, t - 1.2) / beat);
        for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) {
          const y0 = 196 + r * 30, y1 = y0 + 30, sk = (y0 - 150) / 170;
          const x0 = 420 + (k - 3) * 44 * (0.7 + sk), x1 = 420 + (k - 2) * 44 * (0.7 + sk);
          const x2 = 420 + (k - 2) * 44 * (0.7 + sk + 30 / 170), x3 = 420 + (k - 3) * 44 * (0.7 + sk + 30 / 170);
          const on = (r * 7 + k * 3 + bi) % 4 === 0;
          poly(c, [x0, y0, x1, y0, x2, y1, x3, y1]);
          fs(c, on ? mix('#1a1420', cols[(r + k + bi) % 5], 0.35 + pulse * 0.5) : '#1a1420', '#000', 1.5);
        }
        // disco ball + beams
        const bx = 420, by = 30;
        c.save(); c.beginPath(); c.rect(286, 0, W, H); c.clip(); c.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 5; k++) { const a = tt * 0.8 + k * 1.26; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.cos(a) * 300 - 20, by + 260); c.lineTo(bx + Math.cos(a) * 300 + 20, by + 260); c.closePath(); c.fillStyle = `${cols[k]}22`; c.fill(); }
        c.restore();
        line(c, bx, 0, bx, by - 14, '#888', 2);
        ell(c, bx, by, 16, 16); fs(c, '#b8c0c8', '#000', 2);
        for (let k = 0; k < 6; k++) { ell(c, bx - 8 + (k % 3) * 8, by - 6 + Math.floor(k / 3) * 10, 2.5, 2.5); c.fillStyle = (k + Math.floor(tt * 6)) % 3 ? '#fff' : '#8a9aa8'; c.fill(); }
        // crowd (bobbing on the beat)
        for (let k = 0; k < 6; k++) {
          const cx = 300 + k * 50 + (k % 2) * 10, bob = pulse * (k % 2 ? 6 : 4) * (0.5 + hype);
          c.fillStyle = '#05040a';
          ell(c, cx, 270 - bob, 16, 16); c.fill(); rr(c, cx - 20, 284 - bob, 40, 50, 12); c.fill();
          if (hype > 0.5 && k % 2) { line(c, cx - 14, 290 - bob, cx - 24, 250 - bob - pulse * 10, '#05040a', 6); }
        }
        // dancer
        const P = move && t - move.t < beat * 1.2 ? POSES[move.lane] : POSES.idle;
        const sway = Math.sin(t * Math.PI * 2 / beat / 2) * 0.15;
        stick(c, 430 + P.lean * 10, 268 - pulse * 4, { h: 170, shirt: '#e2b020', pants: '#2a2a40', hair: 'black', hairStyle: 'mohawk', shades: true, expr: combo >= 5 ? 'happy' : 'smug', arms: P.arms.map(([a, b2]) => [a + sway, b2]), legs: P.legs, lean: P.lean, lw: 5, shoes: 'sneakers' });
        // DJ line
        text(c, dj, 422, 308, { size: 14, color: '#ff9ae0', lw: 4, maxW: 270 });
        comboMeter(c, S, combo, 520, 190);
        // lanes
        LANES.forEach((ln) => {
          const x = laneX(ln);
          const lg = c.createLinearGradient(0, laneTop, 0, laneBot); lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, `${LCOL[ln]}30`);
          c.fillStyle = lg; c.fillRect(x - 28, laneTop + 4, 56, laneBot - laneTop - 4);
          const rk = recv[ln] != null ? clamp(1 - (t - recv[ln]) / 0.2, 0, 1) : 0;
          if (rk > 0) glow(c, x, lineY, 50, `${LCOL[ln]}aa`);
          drawIcon(c, LIC[ln], x, lineY, 50 + rk * 10, 0, 0.35 + rk * 0.65);
          S.hit(x - 30, 0, 60, H, ln);
        });
        line(c, 14, lineY, 274, lineY, 'rgba(255,255,255,.25)', 2);
        for (const n of notes) {
          const dtn = n.t - t;
          if (n.state) {
            if (n.kind === 'miss' && t - n.hitT < 0.4) { const y = lineY + (dtn / travel) * (laneBot - lineY); drawIcon(c, LIC[n.lane], laneX(n.lane), y, 50, 0, 0.25); }
            continue;
          }
          if (dtn > travel) continue;
          const y = lineY + (dtn / travel) * (laneBot - lineY);
          glow(c, laneX(n.lane), y, 34, `${LCOL[n.lane]}55`);
          drawIcon(c, LIC[n.lane], laneX(n.lane), y, 52);
        }
      };
      return {
        partial: score,
        tick(dt) {
          t += dt;
          api.time(1 - t / (songLen + 1));
          if ((djT -= dt) <= 0) { djT = 5; dj = pick(DJ); }
          for (const n of notes) if (!n.state && n.t - t < -0.16) judge(n, 'miss');
          hype *= 1 - dt * 0.1;
          S.frame(dt, draw);
          if (t > songLen + 0.8) api.done(score(), { stats: `${perf} perfect · ${good} good · ${miss} missed · max combo ${maxCombo}` });
        },
        key(code) {
          if (!LANES.includes(code)) return false;
          recv[code] = t - 0.1;
          let bestN = null, bestD = 9;
          for (const n of notes) { if (n.state || n.lane !== code) continue; const d = Math.abs(n.t - t); if (d < bestD) { bestD = d; bestN = n; } }
          if (!bestN || bestD > 0.16) return;
          judge(bestN, bestD <= 0.075 ? 'perfect' : 'good');
        },
      };
    },
  });
}
