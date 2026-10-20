// Training minigames (stat gains scale with gainMult, still run through train()'s soreness/diminishing rules).
//   reps      (Iron Lung gym)        stop the needle in the sweet spot; perfect streaks add bonus
//   quiz      (Rotwell U classes)    absurd multiple choice from the course's question bank
//   speedread (Public library)       catch only the on-topic words as they flash by
//   dance     (Club Velvet)          arrow rhythm
import { clamp, pick, chance, rand } from '../../core/util.js';
import { shuffle, DIGITS, digitIndex } from '../minigame.js';
import { QUIZ, COURSES } from '../../data/courses.js';

const L = 'ArrowLeft', R = 'ArrowRight', U = 'ArrowUp', D = 'ArrowDown', SP = 'Space', EN = 'Enter';
const isAct = (c) => c === SP || c === EN;

export function registerTrainGames(mg) {
  // ======================================================================= REPS
  const REP = {
    lift: { n: 10, icon: '🏋️', v: 1.15, verb: 'LIFT', moving: false },
    heavy: { n: 14, icon: '🏋️', v: 1.35, verb: 'LIFT', moving: false },
    spar: { n: 10, icon: '🥊', v: 1.3, verb: 'PUNCH', moving: true },
    cardio: { n: 12, icon: '🏃', v: 1.2, verb: 'STRIDE', moving: true },
  };
  const BRICK = {
    perfect: ['"YES! YESSS! THAT\'S THE PUMP!"', '"BEAUTIFUL FORM. I\'M GONNA CRY."', '"Light weight, baby!"', '"YOUR VEINS ARE SINGING!"'],
    ok: ['"Eh. Sloppy. Do it again."', '"That\'s a rep. Barely."', '"My grandma lifts like that. She\'s dead."'],
    miss: ['"WHAT WAS THAT? A SNEEZE?"', 'Your arms turn to soup.', '"Did you just... drop it on your own face?"', 'Something in your back goes "boing".'],
  };
  mg.register('reps', {
    name: 'Rep It Out', statGame: true,
    how: (o) => { const R0 = REP[o.variant] || REP.lift; return `The needle swings. Press <kbd>Space</kbd> (or tap <b>${R0.verb}</b>) to rep when it's in the <b style="color:#ffd84a">gold</b> sweet spot (green is OK). <b>${R0.n} reps.</b> Perfect streaks of 3+ pile on bonus gains. You get tired: the needle speeds up${R0.moving ? ' and the sweet spot moves' : ''}. Don\'t stall — Brick counts out loud.`; },
    lines: { S: ['Brick lifts YOU over his head in celebration. It\'s weird. It\'s beautiful.'], F: ['Brick has to call your mom to pick you up.'] },
    create(api) {
      const V = REP[api.variant] || REP.lift;
      const N = V.n;
      let rep = 0, x = 0, dir = 1, sum = 0, streak = 0, best = 0, bonus = 0, idle = 0, cool = 0;
      let zc = 0.5, okW = 0.28 - api.diff * 0.08, topW = 0.08 - api.diff * 0.02;
      api.stage.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:18px">
        <div data-ic style="font-size:80px;line-height:1;transition:transform .12s">${V.icon}</div>
        <div><div class="mg-big" data-rc>REP 0/${N}</div><div data-sk style="font-size:18px;color:#ffd84a;min-height:24px"></div></div></div>
        <div data-tr class="mg-track" style="height:42px"></div><div class="sys-hint" style="text-align:center">Brick: <span data-br>"Let's GO. Light weight."</span></div>`;
      api.pad([{ k: SP, label: `💪 ${V.verb}`, sub: 'Space / Enter / tap', cls: 'wide gold' }]);
      const tr = api.stage.querySelector('[data-tr]'), ic = api.stage.querySelector('[data-ic]'), rc = api.stage.querySelector('[data-rc]'), sk = api.stage.querySelector('[data-sk]'), br = api.stage.querySelector('[data-br]');
      const drawZones = () => {
        tr.innerHTML = `<div class="z ok" style="left:${(zc - okW / 2) * 100}%;width:${okW * 100}%"></div><div class="z top" style="left:${(zc - topW / 2) * 100}%;width:${topW * 100}%"></div><div class="ndl" data-nd></div>`;
      };
      drawZones();
      const score = () => clamp((sum + bonus) / N, 0, 1);
      const doRep = (pts, kind) => {
        rep++; sum += pts;
        if (kind === 'perfect') { streak++; best = Math.max(best, streak); if (streak >= 3) bonus += 0.12; } else streak = 0;
        br.textContent = pick(BRICK[kind]);
        api.sfx(kind === 'perfect' ? 'perfect' : kind === 'ok' ? 'grunt' : 'miss');
        if (kind === 'miss') api.shake();
        ic.style.transform = kind === 'miss' ? 'rotate(25deg) translateY(10px)' : 'translateY(-18px) scale(1.08)';
        setTimeout(() => { ic.style.transform = ''; }, 140);
        rc.textContent = `REP ${rep}/${N}`;
        sk.textContent = streak >= 3 ? `🔥 PERFECT x${streak} — bonus gains!` : '';
        if (kind === 'perfect') api.float(streak >= 3 ? `PERFECT x${streak}` : 'PERFECT', api.stage.clientWidth / 2 - 50, 90, '#ffd84a');
        idle = 0; cool = 0.18;
        // fatigue
        okW = Math.max(0.12, okW - 0.008);
        if (V.moving) { zc = rand(0.2, 0.8); drawZones(); } else drawZones();
        if (rep >= N) api.done(score(), { stats: `${N} reps · best streak ${best}` });
      };
      return {
        partial: () => clamp((sum + bonus) / N, 0, 1),
        tick(dt) {
          const v = V.v * (1 + api.diff * 0.5) * (1 + rep * 0.035);
          x += dir * v * dt;
          if (x > 1) { x = 1; dir = -1; } else if (x < 0) { x = 0; dir = 1; }
          const nd = tr.querySelector('[data-nd]'); if (nd) nd.style.left = `${x * 100}%`;
          if (cool > 0) cool -= dt;
          idle += dt;
          api.time(1 - idle / 3.2);
          if (idle > 3.2) { api.msg('You stalled. Brick counts it as a failed rep. Loudly.', 'bad'); doRep(0, 'miss'); }
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
    name: 'Pop Quiz', statGame: true, width: 640,
    how: (o) => `${COURSES[o.variant]?.prof || 'The professor'} slaps down a pop quiz. <b>5 questions</b>, a few seconds each. Answer with <kbd>1</kbd>–<kbd>4</kbd> or tap. Faster correct answers score higher. Good scores = more INT out of today's lecture.`,
    lines: { S: ['The professor pins your quiz on the wall. Someone draws a penis on it. Still counts.'], F: ['The professor reads your answers aloud to the class as a cautionary tale.'] },
    create(api) {
      const bank = shuffle(QUIZ[api.variant] || QUIZ.general);
      const qs = bank.slice(0, 5);
      const per = 10 + Math.min(3, (api.p.int || 0) / 40) - api.diff * 2;
      let i = 0, left = per, sum = 0, right = 0, cur = null, wait = 0;
      api.stage.innerHTML = `<div data-q class="mg-card" style="font-size:19px;min-height:70px"></div><div data-a style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"></div>`;
      const qEl = api.stage.querySelector('[data-q]'), aEl = api.stage.querySelector('[data-a]');
      api.pad([]);
      const show = () => {
        const q = qs[i];
        const opts = shuffle(q.a.map((txt, k) => ({ txt, ok: k === 0 })));
        cur = { q, opts };
        left = per;
        qEl.innerHTML = `<div style="font-size:13px;color:#555">Question ${i + 1}/${qs.length}</div>${q.q}`;
        aEl.innerHTML = opts.map((o, k) => `<button type="button" tabindex="-1" class="ui-btn" data-k="${DIGITS[k]}" style="min-height:56px;font-size:17px;text-align:left;justify-content:flex-start;white-space:normal"><kbd>${k + 1}</kbd>&nbsp; ${o.txt}</button>`).join('');
      };
      show(); api.score('📝 0/5');
      const answer = (k) => {
        const btns = aEl.querySelectorAll('button');
        const ci = cur.opts.findIndex((o) => o.ok);
        btns[ci]?.style.setProperty('border-color', '#7fbf4d');
        btns[ci]?.style.setProperty('background', '#2c4a1e');
        if (k === ci) { right++; sum += 0.6 + 0.4 * clamp(left / per, 0, 1); api.sfx('perfect'); api.msg(pick(['Correct!', 'Correct. The professor looks almost disappointed.', 'Right! A nerd in the front row hisses at you.']), 'good'); }
        else {
          if (k >= 0) { btns[k]?.style.setProperty('border-color', '#e2402f'); btns[k]?.style.setProperty('background', '#4a0e0a'); }
          api.sfx('miss');
          api.msg(k < 0 ? 'Time! You were drawing a skull on your desk.' : pick(['Wrong. The class laughs. One of them is the professor.', 'Nope. You can hear your tuition crying.', 'Incorrect. Somewhere, your mom sighs.']), 'bad', 1200);
        }
        i++; wait = 1.2; cur = null;
        api.score(`📝 ${right}/${i}`);
      };
      return {
        partial: () => sum / qs.length,
        tick(dt) {
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
    { t: 'SPOONS', on: ['LADLE', 'STIR', 'SOUP', 'TEASPOON', 'CUTLERY', 'SCOOP', 'SILVERWARE', 'CEREAL', 'DESSERT', 'UTENSIL', 'SPORK'] },
    { t: 'TAXES', on: ['AUDIT', 'DEDUCTION', 'REFUND', 'IRS', 'RECEIPT', 'W-2', 'LOOPHOLE', 'FILING', 'PENALTY', 'INCOME', 'ACCOUNTANT'] },
    { t: 'DINOSAURS', on: ['FOSSIL', 'T-REX', 'JURASSIC', 'METEOR', 'RAPTOR', 'EXTINCT', 'BONES', 'SCALES', 'ROAR', 'PTERODACTYL', 'AMBER'] },
    { t: 'PLUMBING', on: ['PIPE', 'WRENCH', 'CLOG', 'DRAIN', 'TOILET', 'PLUNGER', 'LEAK', 'VALVE', 'SEWER', 'FAUCET', 'U-BEND'] },
    { t: 'THE OCEAN', on: ['WAVE', 'SHARK', 'CORAL', 'TIDE', 'SALT', 'WHALE', 'KELP', 'REEF', 'SQUID', 'ANCHOR', 'SAILOR'] },
    { t: 'MEDIEVAL TIMES', on: ['KNIGHT', 'CASTLE', 'PLAGUE', 'PEASANT', 'MOAT', 'JOUST', 'LUTE', 'SERF', 'DRAGON', 'CATAPULT', 'MEAD'] },
  ];
  const JUNK = ['BOOBS', 'NAP', 'PIZZA', 'DIVORCE', 'NACHOS', 'BUTT', 'FART', 'HOT SINGLES', 'CRYPTO', 'RASH', 'MOIST', 'TOENAIL', 'GARY', 'LASAGNA', 'SEXY', 'WIFI', 'BEER', 'TINDER', 'NIPPLE', 'SNACK', 'KARAOKE', 'GOSSIP', 'UNDERWEAR', 'CHEESE', 'BINGO', 'MULLET', 'VAPE', 'BURRITO'];
  mg.register('speedread', {
    name: 'Speed Reading', statGame: true,
    how: 'Words flash by. Press <kbd>Space</kbd> (or tap <b>CATCH</b>) only for words about today\'s <b>TOPIC</b>. Your brain will try to catch the dirty words. Don\'t let it. Wrong catches cost you.',
    lines: { S: ['Mrs. Shush nods at you. Once. You will remember it on your deathbed.'], F: ['You read the same sentence about boobs 40 times. Mrs. Shush escorts you out.'] },
    create(api) {
      const topic = pick(TOPICS);
      const N = 26 + Math.round(api.variant === 'hard' ? 8 : 0);
      const seq = [];
      const ons = shuffle(topic.on);
      for (let k = 0; k < N; k++) seq.push(chance(0.42) ? { w: ons[k % ons.length], on: true } : { w: pick(JUNK), on: false });
      const onCount = seq.filter((s) => s.on).length || 1;
      let i = -1, left = 0, hits = 0, fp = 0, caught = false;
      const dur = (k) => (1.05 - api.diff * 0.3) * (1 - 0.3 * (k / N));
      api.stage.innerHTML = `<div style="text-align:center;font-size:16px;color:#a9a291">TOPIC: <b style="color:#ffd84a;font-family:var(--font-title);font-size:22px">${topic.t}</b></div>
        <div data-w style="text-align:center;font-family:var(--font-title);font-size:48px;margin-top:36px;min-height:70px;letter-spacing:2px">📖</div>
        <div class="sys-hint" style="text-align:center">Mrs. Shush is watching. Don't move your lips.</div>`;
      api.pad([{ k: SP, label: '🧠 CATCH', sub: 'Space / Enter / tap', cls: 'wide gold' }]);
      const wEl = api.stage.querySelector('[data-w]');
      const score = () => clamp((hits - 0.6 * fp) / onCount, 0, 1);
      const sc = () => api.score(`🧠 ${hits}/${onCount}${fp ? ` · ❌${fp}` : ''}`);
      sc();
      const next = () => {
        i++;
        if (i >= N) { api.done(score(), { stats: `${hits}/${onCount} caught · ${fp} wrong` }); return; }
        caught = false;
        left = dur(i);
        wEl.textContent = seq[i].w; wEl.style.color = '#e6dfcf';
        api.sfx('tickTock');
      };
      left = 0.8;
      return {
        partial: score,
        tick(dt) {
          left -= dt;
          api.time(1 - Math.max(0, i) / N);
          if (left <= 0) next();
        },
        key(code) {
          if (!isAct(code)) return false;
          if (i < 0 || caught || i >= N) return;
          caught = true;
          if (seq[i].on) { hits++; wEl.style.color = '#7fbf4d'; api.sfx('hit'); }
          else { fp++; wEl.style.color = '#e2402f'; api.sfx('miss'); api.msg(pick([`"${seq[i].w}" is not about ${topic.t.toLowerCase()}. Focus.`, 'Your brain grabbed the wrong word. Typical.', 'Mrs. Shush clears her throat at you.']), 'bad', 800); }
          sc();
        },
      };
    },
  });

  // ======================================================================= DANCE
  const LANES = [L, D, U, R];
  const GLYPH = { [L]: '⬅', [D]: '⬇', [U]: '⬆', [R]: '➡' };
  const LCOL = { [L]: '#c74ad1', [D]: '#3fa7e0', [U]: '#5fd35a', [R]: '#e2402f' };
  const DJ = ['DJ Moist: "MAKE SOME NOISE!"', 'DJ Moist: "WHO\'S SWEATY?!"', 'DJ Moist: "THIS ONE\'S FOR MY PAROLE OFFICER!"', 'DJ Moist: "DROP IT LIKE IT\'S MOIST!"'];
  mg.register('dance', {
    name: 'Dance Floor', statGame: true, width: 560,
    how: 'Arrows rise to the top. Hit the matching <kbd>←</kbd><kbd>↓</kbd><kbd>↑</kbd><kbd>→</kbd> (or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, or tap the lanes) as each one crosses the line. Combos make the crowd love you. ~30 seconds of DJ Moist.',
    lines: { S: ['The crowd carries you out on their shoulders. Into the street. Then they go back in.'], F: ['You dance like a folding chair falling down stairs. Someone calls an ambulance, just in case.'] },
    create(api) {
      const H = 250, lineY = 26, travel = 1.7 - api.diff * 0.45;
      const bpm = 108 + api.diff * 30, beat = 60 / bpm, songLen = 28;
      const notes = [];
      let lastLane = -1;
      for (let tb = 1.2; tb < songLen; tb += beat / 2) {
        const onBeat = Math.abs((tb - 1.2) / beat - Math.round((tb - 1.2) / beat)) < 0.01;
        if (onBeat ? chance(0.72) : chance(0.12 + api.diff * 0.25)) {
          let ln = Math.floor(Math.random() * 4);
          if (ln === lastLane && chance(0.5)) ln = (ln + 1 + Math.floor(Math.random() * 3)) % 4;
          lastLane = ln;
          notes.push({ t: tb, lane: LANES[ln], el: null, state: 0 });
        }
      }
      let t = 0, combo = 0, maxCombo = 0, pts = 0, perf = 0, good = 0, miss = 0;
      api.stage.innerHTML = `<div data-f style="position:relative;height:${H}px;display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
        ${LANES.map((ln) => `<div data-k="${ln}" style="position:relative;background:linear-gradient(#0000,${LCOL[ln]}22);border-radius:4px;cursor:pointer"><div style="position:absolute;left:50%;top:${lineY - 22}px;transform:translateX(-50%);font-size:40px;opacity:.35;color:${LCOL[ln]}">${GLYPH[ln]}</div></div>`).join('')}
        <div data-n style="position:absolute;inset:0;pointer-events:none"></div></div>
        <div data-dj class="sys-hint" style="text-align:center;margin-top:4px"></div>`;
      api.pad(LANES.map((ln) => ({ k: ln, label: `<span style="color:${LCOL[ln]}">${GLYPH[ln]}</span>` })));
      const nBox = api.stage.querySelector('[data-n]'), dj = api.stage.querySelector('[data-dj]');
      const laneX = (ln) => `${(LANES.indexOf(ln) + 0.5) * 25}%`;
      const total = notes.length || 1;
      const score = () => clamp((perf + 0.6 * good) / total, 0, 1);
      const sc = () => api.score(`🕺 ${combo > 2 ? `combo ${combo}` : `${Math.round(score() * 100)}%`}`);
      let djT = 0;
      sc();
      const judge = (n, kind) => {
        n.state = 1;
        if (n.el) { n.el.style.opacity = kind === 'miss' ? '0.2' : '0'; n.el.style.transform += kind === 'miss' ? '' : ' scale(1.6)'; }
        if (kind === 'perfect') { perf++; combo++; api.sfx('perfect'); }
        else if (kind === 'good') { good++; combo++; api.sfx('hit'); }
        else { miss++; combo = 0; }
        maxCombo = Math.max(maxCombo, combo);
        if (kind !== 'miss') api.float(kind === 'perfect' ? 'PERFECT' : 'GOOD', 0, 0, kind === 'perfect' ? '#ffd84a' : '#7fbf4d');
        const fl = api.stage.lastElementChild;
        if (fl?.classList?.contains('mg-float')) { fl.style.left = `calc(${laneX(n.lane)} - 40px)`; fl.style.top = `${lineY + 30}px`; }
        if (combo && combo % 10 === 0) api.msg(pick([`${combo} COMBO! A girl throws her bra. It hits DJ Moist.`, `${combo} COMBO! Someone yells "WORLDSTAR!"`, `${combo} COMBO! The floor is sticky with admiration.`]), 'gold');
        sc();
      };
      return {
        partial: score,
        tick(dt) {
          t += dt;
          api.time(1 - t / (songLen + 1));
          if ((djT -= dt) <= 0) { djT = 5; dj.textContent = pick(DJ); }
          for (const n of notes) {
            const dtn = n.t - t;
            if (n.state) { if (n.el && dtn < -0.5) { n.el.remove(); n.el = null; } continue; }
            if (dtn > travel) continue;
            if (!n.el) {
              n.el = document.createElement('div');
              n.el.style.cssText = `position:absolute;left:${laneX(n.lane)};top:0;font-size:40px;line-height:44px;margin-left:-20px;color:${LCOL[n.lane]};text-shadow:0 0 8px ${LCOL[n.lane]};transition:opacity .15s`;
              n.el.textContent = GLYPH[n.lane];
              nBox.appendChild(n.el);
            }
            const y = lineY - 22 + (dtn / travel) * (H - lineY);
            n.el.style.transform = `translateY(${y}px)`;
            if (dtn < -0.16) judge(n, 'miss');
          }
          if (t > songLen + 0.8) api.done(score(), { stats: `${perf} perfect · ${good} good · ${miss} missed · max combo ${maxCombo}` });
        },
        key(code) {
          if (!LANES.includes(code)) return false;
          let bestN = null, bestD = 9;
          for (const n of notes) { if (n.state || n.lane !== code) continue; const d = Math.abs(n.t - t); if (d < bestD) { bestD = d; bestN = n; } }
          if (!bestN || bestD > 0.16) return;
          judge(bestN, bestD <= 0.075 ? 'perfect' : 'good');
        },
      };
    },
  });
}
