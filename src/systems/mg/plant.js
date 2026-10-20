// Grimy manual-labor minigames: conveyor (meat plant), scrapsort (scrapyard), gutfish (fish market).
import { clamp, pick, chance, randInt, rand } from '../../core/util.js';
import { scene, cached, blit, rr, ell, fs, line, blob, text, glow, grime, rng, TAU, COL, FT, mix, easeOut, comboMeter, stick, meter, poly, bubble } from './art.js';
import { drawIcon, howHtml, padIc } from './icons.js';

const L = 'ArrowLeft', R = 'ArrowRight', U = 'ArrowUp', D = 'ArrowDown', SP = 'Space', EN = 'Enter';
const isAct = (c) => c === SP || c === EN;
// a thrown thing: arc from (x0,y0) to (x1,y1) over dur seconds
const arcPos = (f, k) => { const e = easeOut(k); return [f.x0 + (f.x1 - f.x0) * k, f.y0 + (f.y1 - f.y0) * e - Math.sin(k * Math.PI) * (f.hgt ?? 50)]; };

export function registerPlant(mg) {
  // ========================================================================================== CONVEYOR
  const GOOD = [['rump', 'Rump Roast'], ['ribs', 'Rib Rack'], ['bacon', 'Belly Strip'], ['drumstick', 'Mystery Drumstick'], ['bone', 'Soup Bone'], ['sausage', 'Pre-Hot Dog'], ['heart', 'Heart (cow, probably)']];
  const GROSS = [['sock', 'Sock (used)'], ['ringfinger', 'Ring, still on finger'], ['rat', 'Live rat'], ['kidney', 'Glowing kidney'], ['glove', 'Somebody\'s glove'], ['eyeball', 'An eye. Watching.'], ['teeth', 'Too many teeth'], ['roaches', 'Cockroach colony'], ['undies', 'Gary\'s underwear']];
  const BELT_Y = 118, BELT_H = 62;
  function cvBackground(c, W, H) {
    c.fillStyle = '#3a423c'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < 120; y += 18) for (let x = (y / 18) % 2 ? -14 : 0; x < W; x += 28) { rr(c, x + 1, y + 1, 26, 16, 2); fs(c, '#6a7468'); }
    const Rn = rng(31);
    grime(c, 0, 0, W, 120, 80, Rn, 'rgba(90,20,10,', 0.25);
    // hanging carcass silhouettes
    line(c, 0, 8, W, 8, '#222', 4);
    for (const x of [300, 420, 560]) { line(c, x, 8, x, 24, '#555', 2); c.beginPath(); c.moveTo(x, 24); c.quadraticCurveTo(x + 30, 50, x + 18, 96); c.quadraticCurveTo(x, 106, x - 18, 96); c.quadraticCurveTo(x - 30, 50, x, 24); fs(c, 'rgba(110,40,40,.55)', 'rgba(0,0,0,.4)', 2); }
    // sign
    rr(c, 236, 30, 190, 40, 3); fs(c, '#efe8d6', '#000', 2);
    text(c, 'MEAT & RENDERING', 331, 44, { size: 15, color: '#6d1510', stroke: null, fam: FT });
    text(c, '0 DAYS WITHOUT AN INCIDENT', 331, 60, { size: 11, color: '#333', stroke: null });
    // floor
    c.fillStyle = '#2a2622'; c.fillRect(0, 180, W, H - 180);
    grime(c, 0, 186, W, H - 186, 50, Rn, 'rgba(120,20,20,', 0.3);
    // belt frame
    rr(c, -4, BELT_Y - 8, W + 8, BELT_H + 16, 4); fs(c, '#5a6066', '#000', 3);
    for (let x = 30; x < W; x += 80) { rr(c, x, BELT_Y + BELT_H + 8, 10, 16, 1); fs(c, '#4a5056', '#000', 1.5); }
    // vat (far left, under the end of the belt)
    c.beginPath(); c.moveTo(4, 196); c.lineTo(10, 276); c.lineTo(84, 276); c.lineTo(90, 196); c.closePath(); fs(c, '#7a8086', '#000', 3);
    ell(c, 47, 196, 43, 10); fs(c, '#d86a7a', '#000', 2);
    rr(c, 20, 222, 54, 18, 3); fs(c, '#efe8d6', '#000', 1.5); text(c, 'HOT DOGS', 47, 231.5, { size: 11, color: '#b3261e', stroke: null });
  }
  mg.register('conveyor', {
    name: 'The Line', width: 680,
    how: howHtml([
      { ic: ['rump', 'ribs'], k: ['←', 'A'], t: '<b>GRAB</b> good meat when it\'s in your <b>yellow station</b>.' },
      { ic: ['rat', 'sock'], k: ['→', 'D'], t: '<b>TOSS</b> anything gross into the bin.' },
      { ic: 'vat', t: 'Let it slide past and it goes in the <b>hot dog vat</b>.' },
      { ic: 'no', t: 'Foreman Gristle sometimes <b>bans a cut</b>. Obey the RULE.' },
    ], '32 seconds. It speeds up.'),
    lines: { S: ['Gristle nods at you. Gristle has never nodded. A coworker faints.'], F: ['Today\'s hot dogs contain: a sock, a ring, and your dignity.'] },
    create(api) {
      const T = 32, zone = [0.16, 0.34];
      const baseV = 0.24 + api.diff * 0.12, interval = 1.25 - api.diff * 0.35;
      let t = 0, spawnT = 0.3, items = [], ok = 0, bad = 0, n = 0, banned = null, banIc = null, banT = 0, ruleT = 0, beltX = 0, mood = 0, streak = 0;
      const W = 660, H = 290;
      const S = scene(api, W, H);
      api.pad([{ k: L, label: padIc('crate', 'GRAB'), sub: '← / A · good meat', cls: 'green ic' }, { k: R, label: padIc('bin', 'TOSS'), sub: '→ / D · gross stuff', cls: 'red ic' }]);
      const isGood = (it) => it.good && it.name !== banned;
      const sc = () => api.score(`✅ ${ok} · ❌ ${bad}`);
      const setRule = () => {
        if (api.diff < 0.3) return;
        const g = chance(0.25) ? null : pick(GOOD);
        banned = g ? g[1] : null; banIc = g ? g[0] : null; ruleT = t;
        api.sfx('stamp');
      };
      setRule(); sc();
      const CRATE = [150, 236], BIN = [258, 236], VAT = [47, 200];
      const resolve = (it, right, why, dest) => {
        it.done = true; n++;
        const x = it.x * W, y = BELT_Y + BELT_H / 2;
        if (right) { ok++; streak++; api.sfx('hit'); mood = 1; } else { bad++; streak = 0; api.sfx('miss'); api.msg(why, 'bad', 900); mood = -1; S.shake(5); }
        S.mark(right, x, y - 54);
        if (dest) it.fly = { x0: x, y0: y, x1: dest[0], y1: dest[1], t: 0, hgt: 70 };
        if (dest === VAT || !dest) S.burst(VAT[0], VAT[1], { n: 12, color: '#e88a9a', size: 4, speed: 160, life: 0.6 });
        sc();
      };
      const score = () => clamp((ok - 0.5 * bad) / Math.max(n, Math.round(T / interval) * 0.8), 0, 1);
      const draw = (c, tt) => {
        blit(c, cached('cv:bg', W, H, cvBackground), 0, 0);
        // belt surface
        c.save(); rr(c, 0, BELT_Y, W, BELT_H, 2); c.clip();
        c.fillStyle = '#2b2620'; c.fillRect(0, BELT_Y, W, BELT_H);
        for (let x = -(beltX % 36) - 36; x < W + 36; x += 36) { c.fillStyle = '#1c1915'; c.fillRect(x, BELT_Y, 18, BELT_H); line(c, x, BELT_Y, x, BELT_Y + BELT_H, 'rgba(255,255,255,.06)', 1); }
        for (let i = 0; i < 5; i++) { const x = ((i * 157 - beltX) % (W + 60) + W + 60) % (W + 60) - 30; ell(c, x, BELT_Y + 14 + (i * 23) % 36, 10, 4); c.fillStyle = 'rgba(120,20,20,.45)'; c.fill(); }
        c.restore();
        line(c, 0, BELT_Y, W, BELT_Y, '#888', 3); line(c, 0, BELT_Y + BELT_H, W, BELT_Y + BELT_H, '#888', 3);
        // station
        const zx = zone[0] * W, zw = (zone[1] - zone[0]) * W;
        const hasItem = items.some((x) => !x.done && x.x >= zone[0] - 0.03 && x.x <= zone[1] + 0.05);
        c.save(); c.beginPath(); c.rect(zx - 6, BELT_Y - 14, zw + 12, BELT_H + 28); c.rect(zx + 2, BELT_Y - 6, zw - 4, BELT_H + 12); c.clip('evenodd');
        for (let x = zx - 30; x < zx + zw + 30; x += 14) { c.beginPath(); c.moveTo(x, BELT_Y - 20); c.lineTo(x + 30, BELT_Y + BELT_H + 20); c.strokeStyle = '#e8c020'; c.lineWidth = 7; c.stroke(); }
        c.restore();
        if (hasItem) glow(c, zx + zw / 2, BELT_Y + BELT_H / 2, 90, 'rgba(255,216,74,.25)');
        text(c, '▼ YOUR STATION ▼', zx + zw / 2, BELT_Y - 44, { size: 15, color: COL.gold, lw: 4 });
        // bins
        drawIcon(c, 'crate', CRATE[0], CRATE[1], 84);
        text(c, '← KEEP', CRATE[0], 282, { size: 15, color: '#a8e070', lw: 4 });
        drawIcon(c, 'bin', BIN[0], BIN[1], 80);
        text(c, 'TOSS →', BIN[0], 282, { size: 15, color: '#ff8070', lw: 4 });
        S.hit(100, 190, 100, 100, L); S.hit(210, 190, 100, 100, R);
        // vat bubbles
        for (let i = 0; i < 3; i++) { const k = (tt * 0.8 + i / 3) % 1; ell(c, 30 + i * 16, 196 - k * 6, 3 + k * 3, 2 + k * 2); fs(c, null, `rgba(255,200,210,${1 - k})`, 1.5); }
        // rule clipboard
        const rx = 392, ry = 196;
        const fresh = clamp(1 - (t - ruleT) / 0.6, 0, 1);
        c.save(); c.translate(rx + 130, ry + 44); c.scale(1 + fresh * 0.2, 1 + fresh * 0.2); c.translate(-(rx + 130), -(ry + 44));
        rr(c, rx, ry, 260, 88, 4); fs(c, '#efe8d6', '#000', 2.5);
        rr(c, rx + 110, ry - 6, 40, 12, 3); fs(c, '#8a9096', '#000', 1.5);
        if (banIc) {
          drawIcon(c, banIc, rx + 48, ry + 48, 64);
          ell(c, rx + 48, ry + 48, 30, 30); fs(c, null, '#e2402f', 6); line(c, rx + 27, ry + 69, rx + 69, ry + 27, '#e2402f', 6);
          text(c, 'RULE: NO', rx + 168, ry + 24, { size: 17, color: '#b3261e', stroke: null, fam: FT });
          text(c, banned.toUpperCase(), rx + 168, ry + 48, { size: 18, color: '#141210', stroke: null, maxW: 170 });
          text(c, '("those are for Gristle")', rx + 168, ry + 70, { size: 12, color: '#666', stroke: null });
        } else {
          drawIcon(c, 'rump', rx + 34, ry + 46, 46); drawIcon(c, 'ok', rx + 50, ry + 62, 22);
          drawIcon(c, 'rat', rx + 226, ry + 46, 46); drawIcon(c, 'no', rx + 242, ry + 62, 22);
          text(c, 'RULE:', rx + 130, ry + 26, { size: 16, color: '#141210', stroke: null, fam: FT });
          text(c, 'meat = keep', rx + 130, ry + 48, { size: 16, color: '#3c6a1e', stroke: null });
          text(c, 'gross = toss', rx + 130, ry + 68, { size: 16, color: '#b3261e', stroke: null });
        }
        c.restore();
        // Gristle (foreman), top right
        stick(c, 610, 108, { h: 92, shirt: 'white', hat: 'hardhat', stache: true, expr: mood < 0 ? 'angry' : mood > 0 ? 'smug' : 'neutral', arms: [[0.4, 0.6], [0.6, -1.4]], pants: '#334' });
        rr(c, 576, 52, 18, 24, 2); fs(c, '#c8a060', '#000', 1.5);
        // items
        for (const it of items) {
          const x = it.x * W;
          if (it.fly) {
            it.fly.t += 1 / 60;
            const k = Math.min(1, it.fly.t / 0.4);
            const [fx, fy] = arcPos(it.fly, k);
            drawIcon(c, it.ic, fx, fy, 60 * (1 - 0.5 * k), k * 6);
            continue;
          }
          if (it.done) continue;
          const wob = it.ic === 'rat' || it.ic === 'roaches' ? Math.sin(tt * 18 + x) * 0.15 : 0;
          const y = BELT_Y + BELT_H / 2 + (it.ic === 'rat' ? Math.abs(Math.sin(tt * 10)) * -4 : 0);
          ell(c, x + 4, BELT_Y + BELT_H - 10, 26, 6); c.fillStyle = 'rgba(0,0,0,.35)'; c.fill();
          drawIcon(c, it.ic, x, y, 64, wob);
          if (it.ic === 'eyeball') { /* the eye follows you */ ell(c, x + Math.sin(tt * 2) * 3, y - 3, 3, 3); c.fillStyle = '#000'; c.fill(); }
          c.font = '700 13px "Barlow Condensed", sans-serif';
          const tw = c.measureText(it.name).width + 10;
          rr(c, x - tw / 2, BELT_Y - 4 - 16, tw, 16, 4); fs(c, 'rgba(0,0,0,.65)');
          text(c, it.name, x, BELT_Y - 11, { size: 13, color: '#eee', stroke: null });
        }
        comboMeter(c, S, streak, 610, 160);
      };
      return {
        partial: score,
        tick(dt) {
          t += dt;
          api.time(1 - t / T);
          const v = baseV * (1 + 0.35 * (t / T));
          beltX += v * W * dt;
          if (api.diff >= 0.3 && (banT += dt) > 10) { banT = 0; setRule(); }
          if ((spawnT -= dt) <= 0 && t < T - 2) {
            spawnT = interval * rand(0.8, 1.25);
            const good = chance(0.62);
            const [ic, name] = pick(good ? GOOD : GROSS);
            items.push({ ic, x: 1.08, good, name, done: false });
          }
          mood *= 1 - dt * 1.5;
          for (const it of items) {
            it.x -= v * dt;
            if (!it.done && it.x < zone[0] - 0.02) resolve(it, false, isGood(it) ? 'Good meat in the vat. Gristle docks your pay in spirit.' : pick(['It\'s a hot dog now. Congrats.', 'That went in the hot dogs. Someone will eat that.']), VAT);
          }
          items = items.filter((it) => (it.fly ? it.fly.t < 0.45 : it.x > -0.15 && !it.done) || (!it.done));
          S.frame(dt, draw);
          if (t >= T) api.done(score(), { stats: `${ok} right · ${bad} wrong` });
        },
        key(code) {
          if (code !== L && code !== R) return false;
          const it = items.filter((x) => !x.done && x.x >= zone[0] - 0.03 && x.x <= zone[1] + 0.05).sort((a, b) => a.x - b.x)[0];
          if (!it) { api.msg(pick(['You grab air. Gristle sees.', 'Nothing in your station, champ.']), '', 600); S.pop('nothing here', zone[0] * W + 60, BELT_Y - 40, { size: 16, color: '#a9a291' }); return; }
          const g = isGood(it);
          if (code === L) resolve(it, g, it.good ? 'That cut is BANNED today. Read the rule!' : pick(['You saved a sock for the customers.', 'You packed a rat. It\'s a pet now.', 'GROSS. That goes in the BIN.']), CRATE);
          else resolve(it, !g, 'You tossed perfectly good meat. Perfectly.', BIN);
        },
      };
    },
  });

  // ========================================================================================== SCRAPSORT
  const SCRAP = {
    copper: [['wire', 'Copper wire bundle'], ['pennies', 'Jar of old pennies'], ['pipe', 'Copper pipe'], ['radiator', 'Radiator core'], ['bell', 'Bell (copper-ish)'], ['motor', 'Motor windings']],
    steel: [['hubcap', 'Hubcap'], ['cardoor', 'Car door'], ['engine', 'Engine block'], ['rebar', 'Rebar'], ['cart', 'Shopping cart'], ['fridge', 'Suspicious fridge']],
    trash: [['teddy', 'Haunted teddy bear'], ['vhs', 'VHS: "Our Wedding (do NOT watch)"'], ['mannequin', 'Mannequin head (your face)'], ['undies', 'Underwear, used heroically'], ['pizzabox', 'Pizza Butt box (still full?)'], ['soggy', 'A soggy something']],
    dog: [['bone', 'A bone (don\'t ask)'], ['ball', 'Tennis ball'], ['shoe', 'Single shoe'], ['steak', 'Raw steak'], ['squirrel', 'Squirrel (furious)']],
  };
  const BIN_LOOK = { copper: ['ingot', '#b8662a', 'COPPER'], steel: ['ibeam', '#6a7680', 'STEEL'], trash: ['trash', '#3c6a2a', 'TRASH'], dog: ['dog', '#7a5a3a', 'CHOMPERS'] };
  const KEYG = { [L]: '←', [D]: '↓', [R]: '→', [U]: '↑' };
  function ssBackground(c, W, H) {
    const g = c.createLinearGradient(0, 0, 0, 170); g.addColorStop(0, '#6a6e6a'); g.addColorStop(1, '#3e403a');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const Rn = rng(55);
    // junk pile silhouettes
    for (let i = 0; i < 9; i++) { blob(c, 30 + i * 75, 168, 50 + Rn() * 40, Rn, 0.5, 9, 1.2, 0.8); fs(c, i % 2 ? '#2e2c28' : '#35322c'); }
    for (let i = 0; i < 6; i++) { ell(c, 40 + Rn() * 540, 120 + Rn() * 40, 14, 14); fs(c, null, '#1c1a18', 7); }
    rr(c, 470, 110, 90, 40, 5); fs(c, '#4a3a3a', '#1c1a18', 2); rr(c, 480, 98, 60, 18, 4); fs(c, '#3a2e2e');
    // chain-link fence strip
    c.strokeStyle = 'rgba(180,180,170,.18)'; c.lineWidth = 1;
    for (let x = -100; x < W; x += 12) { c.beginPath(); c.moveTo(x, 60); c.lineTo(x + 60, 150); c.moveTo(x + 60, 60); c.lineTo(x, 150); c.stroke(); }
    // mud
    c.fillStyle = '#2c2620'; c.fillRect(0, 186, W, H - 186);
    grime(c, 0, 186, W, H - 186, 60, Rn, 'rgba(0,0,0,', 0.4);
    // crane arm
    c.beginPath(); c.moveTo(W + 10, 70); c.lineTo(W - 120, 12); c.lineTo(310, 8); c.strokeStyle = '#000'; c.lineWidth = 16; c.stroke(); c.strokeStyle = '#d6a020'; c.lineWidth = 11; c.stroke();
    for (let x = 330; x < W - 120; x += 22) line(c, x, 3, x + 11, 13, '#8a6a10', 2);
  }
  mg.register('scrapsort', {
    name: 'Scrap Sorting', width: 640,
    how: (o) => howHtml([
      { ic: ['wire', 'pipe'], k: ['←', 'A'], t: '<b>COPPER</b> — wire, pipe, pennies, bells' },
      { ic: ['hubcap', 'engine'], k: ['↓', 'S'], t: '<b>STEEL</b> — car parts, carts, rebar' },
      { ic: ['teddy', 'vhs'], k: ['→', 'D'], t: '<b>TRASH</b> — everything cursed' },
      ...((o.diff ?? 0) >= 0.5 ? [{ ic: ['dog', 'ball'], k: ['↑', 'W'], t: '<b>MR. CHOMPERS</b> — dog stuff' }] : []),
    ], 'The magnet only holds each piece for a few seconds. ~26 sorted = full marks; wrong bins cost you. 35 seconds.'),
    lines: { S: ['Pete hands you a cold beer from inside a dead fridge. Highest honor in the yard.'], F: ['You sorted Mr. Chompers into the crusher. He climbed out. He\'s angry.'] },
    create(api) {
      const T = 35, target = 26 + Math.round(api.diff * 4), fuse = 3.4 - api.diff * 1.1;
      const bins = [['copper', L], ['steel', D], ['trash', R]];
      if (api.diff >= 0.5) bins.push(['dog', U]);
      let t = 0, cur = null, ok = 0, bad = 0, streak = 0, left = 0, flying = [], bump = {};
      const W = 620, H = 300;
      const S = scene(api, W, H);
      api.pad(bins.map(([kind, k]) => ({ k, label: padIc(BIN_LOOK[kind][0], BIN_LOOK[kind][2]), sub: `${KEYG[k]} / ${{ [L]: 'A', [D]: 'S', [R]: 'D', [U]: 'W' }[k]}`, cls: 'ic' })));
      const kinds = bins.map((b) => b[0]);
      const binX = (i) => (W / (bins.length + 0.6)) * (i + 0.8);
      const next = () => {
        const kind = pick(kinds);
        const [ic, name] = pick(SCRAP[kind]);
        cur = { kind, ic, name, born: t };
        left = fuse;
      };
      const score = () => clamp((ok - 0.5 * bad) / target, 0, 1);
      const sc = () => api.score(`🔩 ${ok}/${target}`);
      next(); sc();
      const answer = (kind) => {
        const right = kind === cur.kind;
        const bi = kind == null ? -1 : bins.findIndex((b) => b[0] === kind);
        const sx = 310, sy = 150 + Math.min(1, (t - cur.born) / 0.25) * 0;
        flying.push({ ic: cur.ic, x0: sx, y0: sy, x1: bi >= 0 ? binX(bi) : sx, y1: bi >= 0 ? 232 : 290, t: 0, hgt: bi >= 0 ? 60 : 0, right, bi });
        if (right) {
          ok++; streak++; api.sfx(cur.kind === 'steel' || cur.kind === 'copper' ? 'clank' : 'hit');
          S.mark(true, binX(bi), 160);
          if (streak >= 3) S.pop(`STREAK ${streak}`, 310, 70, { color: COL.gold, size: 22 });
        } else {
          bad++; streak = 0; api.sfx('miss'); S.shake(6);
          S.mark(false, bi >= 0 ? binX(bi) : 310, 160, bi < 0 ? 'DROPPED' : `${BIN_LOOK[cur.kind][2]}!`);
          api.msg(kind == null ? 'Too slow. It fell on your foot.' : pick([`That's ${cur.kind === 'dog' ? 'Mr. Chompers\' stuff' : cur.kind.toUpperCase()}, genius.`, 'Wrong bin. Pete spits near you. Not at you. Near.', 'Mr. Chompers growls at your sorting.']), 'bad', 900);
        }
        sc();
        next();
      };
      const draw = (c, tt) => {
        blit(c, cached('ss:bg', W, H, ssBackground), 0, 0);
        // Pete
        stick(c, 572, 186, { h: 100, shirt: '#5a4a3a', hat: 'trucker', beard: true, hair: 'gray', expr: streak >= 3 ? 'smug' : 'neutral', arms: [[0.3, 0.4], [0.3, 0.4]], pants: '#2a3a5a' });
        bubble(c, 500, 52, 100, 26, 556, 84); text(c, streak >= 3 ? '"Heh. Good."' : '"Sort it!"', 550, 65, { size: 13, color: '#141210', stroke: null });
        // cable + magnet + item
        const frac = clamp(left / fuse, 0, 1);
        const sway = Math.sin(tt * 2.2) * 0.08;
        const drop = 1 - easeOut(Math.min(1, (t - cur.born) / 0.25));
        const mx = 310 + Math.sin(sway) * 70, my = 70 - drop * 40;
        line(c, 310, 8, mx, my - 18, '#222', 3);
        drawIcon(c, 'magnet', mx, my, 56, sway * 0.6);
        if (frac < 0.35) { S.burst(mx + (Math.random() - 0.5) * 30, my + 20, { n: 1, shape: 'spark', color: '#9fe8ff', speed: 160, life: 0.25, g: 200 }); }
        const jit = frac < 0.35 ? (Math.random() - 0.5) * 4 : 0;
        const ix = mx + jit, iy = my + 70 + (1 - frac) * 14;
        glow(c, ix, iy, 70, 'rgba(255,240,200,.12)');
        drawIcon(c, cur.ic, ix, iy, 96, sway * 0.6);
        // name + fuse
        c.font = '700 18px "Barlow Condensed", sans-serif';
        const tw = Math.min(360, c.measureText(cur.name).width + 20);
        rr(c, 310 - tw / 2, 176, tw, 24, 5); fs(c, 'rgba(0,0,0,.7)', '#000', 1);
        text(c, cur.name, 310, 189, { size: 18, color: COL.bone, stroke: null, maxW: 350 });
        meter(c, 230, 156, 160, 10, frac, frac < 0.35 ? '#e2402f' : '#9fe8ff', '#1d1915');
        text(c, 'MAGNET', 220, 161, { size: 11, color: '#9fe8ff', lw: 3, align: 'right' });
        // bins
        bins.forEach(([kind, k], i) => {
          const x = binX(i), [ic, col, nm] = BIN_LOOK[kind];
          const b = bump[i] ? Math.max(0, bump[i] - tt) : 0;
          const by = 248 - Math.sin(b * 20) * b * 20;
          c.beginPath(); c.moveTo(x - 58, by - 34); c.lineTo(x + 58, by - 34); c.lineTo(x + 50, by + 40); c.lineTo(x - 50, by + 40); c.closePath(); fs(c, col, '#000', 3);
          line(c, x - 58, by - 34, x + 58, by - 34, 'rgba(255,255,255,.35)', 3);
          for (let s = -1; s <= 1; s += 2) line(c, x + s * 30, by - 26, x + s * 27, by + 32, 'rgba(0,0,0,.25)', 3);
          drawIcon(c, ic, x - 26, by + 4, 44);
          text(c, nm, x + 18, by - 4, { size: 15, color: '#fff', lw: 3, maxW: 70 });
          rr(c, x + 6, by + 6, 26, 24, 4); fs(c, '#221d17', '#000', 1.5); text(c, KEYG[k], x + 19, by + 18.5, { size: 17, color: COL.gold, stroke: null });
          S.hit(x - 58, by - 40, 116, 90, k);
        });
        // flying junk
        for (const f of flying) {
          f.t += 1 / 60;
          const k = Math.min(1, f.t / 0.35);
          const [fx, fy] = arcPos(f, k);
          if (k >= 1 && !f.landed) { f.landed = true; if (f.bi >= 0) { bump[f.bi] = tt + 0.25; S.burst(fx, 220, { n: f.right ? 10 : 5, shape: f.right ? 'spark' : 'chunk', color: f.right ? '#ffd84a' : '#8a6a4a', speed: 200, life: 0.5 }); } }
          if (k < 1) drawIcon(c, f.ic, fx, fy, 96 - 46 * k, k * (f.right ? 4 : -6));
        }
        flying = flying.filter((f) => f.t < 0.4);
        comboMeter(c, S, streak, 60, 60, 'STREAK');
      };
      return {
        partial: score,
        tick(dt) {
          t += dt;
          api.time(1 - t / T);
          left -= dt;
          if (left <= 0) answer(null);
          S.frame(dt, draw);
          if (t >= T) api.done(score(), { stats: `${ok} sorted · ${bad} botched` });
        },
        key(code) {
          const b = bins.find((x) => x[1] === code);
          if (!b) return false;
          answer(b[0]);
        },
      };
    },
  });

  // ========================================================================================== GUTFISH
  const FISH = [
    { n: 'Sludge Carp', body: '#7a7a3a', belly: '#c8c890', fin: '#5a5a2a', whisk: true },
    { n: 'Tire Bass', body: '#3a5a3a', belly: '#a8b890', fin: '#2a3a2a', tread: true },
    { n: 'Lawyerfish', body: '#d6b040', belly: '#f2e2a0', fin: '#a88020', puffer: true },
    { n: 'Three-Eyed Trout', body: '#9aa8b0', belly: '#f0d0c8', fin: '#6a7880', eyes: 3, spots: true },
    { n: 'Mini Shark (angry)', body: '#6a7a88', belly: '#dfe4e8', fin: '#4a5a68', shark: true },
    { n: 'Mutant Mackerel', body: '#3a6a9a', belly: '#c8e0e8', fin: '#2a4a6a', stripes: true, glow: true },
  ];
  const FX0 = 92, FX1 = 512, FY = 150;   // fish body span (knife track 0..1 maps onto it)
  function drawFish(c, F, ruined, tt) {
    const cx = (FX0 + FX1) / 2, rx = (FX1 - FX0) / 2, ry = F.puffer ? 66 : 50;
    c.save();
    // tail
    c.beginPath(); c.moveTo(FX1 - 10, FY); c.lineTo(FX1 + 62, FY - 52); c.quadraticCurveTo(FX1 + 40, FY, FX1 + 62, FY + 52); c.closePath(); fs(c, F.fin, '#000', 3);
    // fins
    c.beginPath(); c.moveTo(cx - 60, FY - ry + 6); c.quadraticCurveTo(cx - 10, FY - ry - (F.shark ? 64 : 34), cx + 70, FY - ry + 10); c.closePath(); fs(c, F.fin, '#000', 3);
    c.beginPath(); c.moveTo(cx + 40, FY + ry - 8); c.quadraticCurveTo(cx + 70, FY + ry + 26, cx + 110, FY + ry - 14); c.closePath(); fs(c, F.fin, '#000', 3);
    // body
    c.beginPath(); c.moveTo(FX0 - 20, FY); c.bezierCurveTo(FX0 - 10, FY - ry * 1.3, FX1 - 40, FY - ry * 1.1, FX1, FY); c.bezierCurveTo(FX1 - 40, FY + ry * 1.1, FX0 - 10, FY + ry * 1.3, FX0 - 20, FY); c.closePath();
    const g = c.createLinearGradient(0, FY - ry, 0, FY + ry); g.addColorStop(0, F.body); g.addColorStop(0.55, F.body); g.addColorStop(0.62, F.belly); g.addColorStop(1, F.belly);
    fs(c, g, '#000', 3.5);
    c.save(); c.clip();
    // scales
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1.5;
    for (let x = FX0 + 30; x < FX1 - 20; x += 22) for (let y = FY - ry; y < FY + 10; y += 16) { c.beginPath(); c.arc(x + ((y / 16) % 2) * 11, y, 9, 0.2, Math.PI - 0.2); c.stroke(); }
    if (F.tread) for (let x = FX0 + 20; x < FX1; x += 18) { poly(c, [x, FY - ry, x + 9, FY - ry, x + 3, FY - 10, x - 6, FY - 10]); c.fillStyle = 'rgba(0,0,0,.35)'; c.fill(); }
    if (F.stripes) for (let x = FX0 + 40; x < FX1; x += 26) { c.beginPath(); c.moveTo(x, FY - ry); c.quadraticCurveTo(x + 14, FY - 25, x, FY - 2); c.strokeStyle = 'rgba(10,20,40,.55)'; c.lineWidth = 6; c.stroke(); }
    if (F.spots) for (let i = 0; i < 18; i++) { ell(c, FX0 + 40 + ((i * 53) % 360), FY - 40 + ((i * 29) % 40), 3, 3); c.fillStyle = 'rgba(60,40,60,.5)'; c.fill(); }
    if (F.glow) for (let i = 0; i < 5; i++) glow(c, FX0 + 80 + i * 70, FY - 20 + (i % 2) * 14, 14 + Math.sin(tt * 4 + i) * 3, 'rgba(160,255,90,.7)');
    c.restore();
    // gills + head
    c.beginPath(); c.arc(FX0 + 40, FY, ry * 0.8, -1.1, 1.1); fs(c, null, 'rgba(0,0,0,.45)', 3);
    const eyes = F.eyes || 1;
    for (let i = 0; i < eyes; i++) {
      const ex = FX0 + 6 + i * 16, ey = FY - 18 - (i % 2) * 14;
      ell(c, ex, ey, 11, 11); fs(c, ruined ? '#d8e8a0' : '#f4f0e0', '#000', 2.5);
      if (ruined) { line(c, ex - 6, ey - 6, ex + 6, ey + 6, '#000', 2.5); line(c, ex + 6, ey - 6, ex - 6, ey + 6, '#000', 2.5); }
      else { ell(c, ex - 2, ey, 5, 5); c.fillStyle = '#111'; c.fill(); }
    }
    // mouth
    if (F.shark) { c.beginPath(); c.moveTo(FX0 - 18, FY + 4); c.lineTo(FX0 + 22, FY + 16); fs(c, null, '#000', 3); for (let i = 0; i < 5; i++) poly(c, [FX0 - 14 + i * 8, FY + 5 + i * 2.4, FX0 - 10 + i * 8, FY + 13 + i * 2.4, FX0 - 6 + i * 8, FY + 7 + i * 2.4]), fs(c, '#fff', '#000', 1); }
    else { ell(c, FX0 - 14, FY + 6, 8, 5); fs(c, '#6a2a2a', '#000', 2); }
    if (F.whisk) { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(FX0 - 12, FY + 8); c.quadraticCurveTo(FX0 - 40, FY + 20 + s * 8, FX0 - 30, FY + 44 + s * 6); fs(c, null, '#3a3a1a', 2.5); } }
    if (F.puffer) { for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; const px = cx + Math.cos(a) * rx * 0.98, py = FY + Math.sin(a) * ry * 1.02; if (px > FX0 + 10 && px < FX1 - 30) poly(c, [px - 4, py, px + Math.cos(a) * 12, py + Math.sin(a) * 12, px + 4, py]), fs(c, '#a88020', '#000', 1.5); }
      poly(c, [FX0 + 60, FY + 30, FX0 + 70, FY + 30, FX0 + 74, FY + 62, FX0 + 65, FY + 70, FX0 + 56, FY + 62]); fs(c, '#b3261e', '#000', 2); }
    c.restore();
  }
  function gfBackground(c, W, H) {
    c.fillStyle = '#3a3026'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 24) { line(c, 0, y, W, y, '#2a2018', 3); }
    const Rn = rng(61);
    // cutting board
    rr(c, 30, 52, W - 60, 210, 14); fs(c, '#c89a62', '#000', 3);
    c.save(); rr(c, 30, 52, W - 60, 210, 14); c.clip();
    for (let i = 0; i < 26; i++) { c.beginPath(); const y = 56 + i * 8 + Rn() * 4; c.moveTo(30, y); for (let x = 30; x < W; x += 40) c.quadraticCurveTo(x + 20, y + (Rn() - 0.5) * 6, x + 40, y); c.strokeStyle = 'rgba(120,80,40,.35)'; c.lineWidth = 1.5; c.stroke(); }
    for (let i = 0; i < 30; i++) { const x = 40 + Rn() * (W - 80), y = 60 + Rn() * 190; line(c, x, y, x + (Rn() - 0.5) * 30, y + (Rn() - 0.5) * 6, 'rgba(80,50,20,.4)', 1); }
    for (let i = 0; i < 6; i++) { blob(c, 60 + Rn() * (W - 120), 80 + Rn() * 160, 10 + Rn() * 20, Rn, 0.5); c.fillStyle = 'rgba(140,30,30,.18)'; c.fill(); }
    c.restore();
    // bucket of guts
    c.beginPath(); c.moveTo(W - 92, 6); c.lineTo(W - 18, 6); c.lineTo(W - 26, 56); c.lineTo(W - 84, 56); c.closePath(); fs(c, '#6a7a8a', '#000', 2.5);
    ell(c, W - 55, 8, 37, 7); fs(c, '#8a2a2a', '#000', 2);
    for (let i = 0; i < 5; i++) { ell(c, W - 80 + i * 12, 6, 6, 3); c.fillStyle = i % 2 ? '#a83a4a' : '#6a8a3a'; c.fill(); }
  }
  mg.register('gutfish', {
    name: 'Gutting Table', width: 640,
    how: howHtml([
      { ic: 'knife', k: ['Space'], t: 'The knife slides along the fish. <b>CUT</b> when it\'s over a <b style="color:#ffd84a">gold line</b>.' },
      { ic: 'kidney', t: '<b style="color:#e2402f">Never cut the green bile sac</b> — the whole fish is ruined.' },
      { ic: 'no', t: 'Missed lines and random hacks cost points.' },
    ]),
    lines: { S: ['Mama Barnacle kisses your forehead. It leaves a fish scale. Keep it forever.'], F: ['Bile everywhere. Seagulls are filing a complaint about YOU.'] },
    create(api) {
      const N = 7 + Math.round(api.diff * 2), tol = 0.04 - api.diff * 0.012;
      let f = 0, x = 0, sweep = 0, fish = null, sum = 0, wait = 0, ruined = 0, chop = 0, slideIn = 1, cuts = [];
      const W = 600, H = 280;
      const S = scene(api, W, H);
      api.pad([{ k: SP, label: padIc('knife', 'CUT'), sub: 'Space / Enter / tap', cls: 'wide gold ic' }]);
      const tx = (v) => FX0 + v * (FX1 - FX0);
      const newFish = () => {
        const F = pick(FISH);
        const nm = 2 + randInt(0, 1) + Math.round(api.diff);
        const bileW = 0.08 + api.diff * 0.04;
        const bile = rand(0.25, 0.75 - bileW);
        const marks = [];
        let g = 0;
        while (marks.length < nm && g++ < 200) {
          const m = rand(0.08, 0.95);
          if (m > bile - 0.05 && m < bile + bileW + 0.05) continue;
          if (marks.some((o) => Math.abs(o.x - m) < 0.11)) continue;
          marks.push({ x: m, done: false });
        }
        sweep = 1.9 - api.diff * 0.5 - f * 0.03;
        fish = { F, name: F.n, marks, bile, bileW, hits: 0, slop: 0, ruined: false };
        x = -0.06; cuts = []; slideIn = 0;
      };
      const fishScore = (fs2) => fs2.ruined ? 0 : clamp(fs2.hits / fs2.marks.length - 0.2 * fs2.slop, 0, 1);
      const endFish = () => {
        const s = fishScore(fish);
        sum += s; f++;
        if (!fish.ruined) {
          api.msg(s >= 1 ? pick(['Clean as a whistle. A fishy whistle.', 'Textbook gut. Mama Barnacle approves.']) : s > 0.5 ? 'Decent. Mostly fish, minimal you.' : 'You mangled it. It\'s chowder now.', s >= 1 ? 'good' : s > 0.5 ? '' : 'bad', 800);
          S.pop(s >= 1 ? 'CLEAN GUT!' : s > 0.5 ? 'DECENT' : 'CHOWDER', 300, 60, { color: s >= 1 ? COL.gold : s > 0.5 ? COL.bone : '#ff8070', size: 26 });
        }
        api.score(`🐟 ${f}/${N}`);
        wait = 0.5;
      };
      newFish(); api.score(`🐟 0/${N}`);
      const draw = (c, tt) => {
        blit(c, cached('gf:bg', W, H, gfBackground), 0, 0);
        const k = easeOut(Math.min(1, slideIn));
        const out = wait > 0 ? easeOut(1 - wait / 0.5) : 0;
        c.save(); c.translate((1 - k) * -W + out * W * 0.9, out * 40);
        drawFish(c, fish.F, fish.ruined, tt);
        // bile sac
        const bx0 = tx(fish.bile), bx1 = tx(fish.bile + fish.bileW);
        c.save(); c.beginPath(); c.moveTo(FX0 - 20, FY); c.bezierCurveTo(FX0 - 10, FY - 65, FX1 - 40, FY - 55, FX1, FY); c.bezierCurveTo(FX1 - 40, FY + 55, FX0 - 10, FY + 65, FX0 - 20, FY); c.clip();
        c.fillStyle = 'rgba(226,64,47,.22)'; c.fillRect(bx0, FY - 70, bx1 - bx0, 140);
        c.restore();
        ell(c, (bx0 + bx1) / 2, FY + 18, (bx1 - bx0) / 2 + 2, 20); fs(c, fish.ruined ? 'rgba(120,200,40,.9)' : 'rgba(150,200,60,.85)', '#e2402f', 3);
        ell(c, (bx0 + bx1) / 2 - 6, FY + 10, 5, 3); c.fillStyle = 'rgba(255,255,220,.6)'; c.fill();
        c.setLineDash([6, 4]); rr(c, bx0, FY - 62, bx1 - bx0, 124, 4); fs(c, null, '#e2402f', 2.5); c.setLineDash([]);
        text(c, 'BILE', (bx0 + bx1) / 2, FY - 74, { size: 15, color: '#ff6a5a', lw: 4 });
        // cut lines
        fish.marks.forEach((m) => {
          const mx = tx(m.x);
          line(c, mx, FY - 56, mx, FY + 56, 'rgba(0,0,0,.55)', 8); c.setLineDash([9, 5]); line(c, mx, FY - 54, mx, FY + 54, m.done ? '#7fbf4d' : COL.gold, 5); c.setLineDash([]);
          if (m.done) drawIcon(c, 'ok', mx, FY - 66, 22);
          else glow(c, mx, FY, 30, 'rgba(255,216,74,.25)');
        });
        for (const ct of cuts) { c.beginPath(); c.moveTo(ct.x - 3, FY - 30); c.quadraticCurveTo(ct.x + 4, FY, ct.x - 2, FY + 34); c.strokeStyle = '#3a0808'; c.lineWidth = 7; c.stroke(); c.strokeStyle = ct.good ? '#c8302a' : '#8a1a12'; c.lineWidth = 3; c.stroke(); }
        if (fish.ruined) { c.globalAlpha = 0.35; c.fillStyle = '#7fbf2a'; c.fillRect(FX0 - 30, FY - 70, FX1 - FX0 + 100, 140); c.globalAlpha = 1; for (let i = 0; i < 3; i++) { c.beginPath(); const sx = 220 + i * 60; c.moveTo(sx, 80); for (let j = 1; j < 6; j++) c.lineTo(sx + Math.sin(tt * 3 + j + i) * 6, 80 - j * 10); c.strokeStyle = 'rgba(160,220,60,.8)'; c.lineWidth = 3; c.stroke(); } }
        c.restore();
        // knife
        if (wait <= 0 && slideIn >= 1) {
          const kx = tx(clamp(x, -0.05, 1.05));
          const dropY = chop > 0 ? Math.sin((chop / 0.14) * Math.PI) * 40 : 0;
          line(c, kx, 26, kx, FY + 60, 'rgba(255,255,255,.12)', 2);
          c.save(); c.translate(kx, 40 + dropY);
          rr(c, -8, -38, 16, 30, 4); fs(c, '#4a2a14', '#000', 2.5);
          c.beginPath(); c.moveTo(-14, -10); c.lineTo(14, -10); c.lineTo(10, 48); c.lineTo(0, 60); c.lineTo(-10, 48); c.closePath(); fs(c, '#d8dce0', '#000', 2.5);
          line(c, -6, -4, -4, 46, '#fff', 2);
          c.restore();
        }
        text(c, `Fish ${Math.min(N, f + 1)}/${N}: ${fish.name}`, 300, 271, { size: 18, color: COL.bone, lw: 4 });
      };
      return {
        partial: () => (sum + (fish ? fishScore(fish) * 0.5 : 0)) / N,
        tick(dt) {
          api.time(1 - f / N);
          if (chop > 0) chop -= dt;
          if (slideIn < 1) slideIn += dt / 0.35;
          if (wait > 0) { wait -= dt; if (wait <= 0) { if (f >= N) { api.done(sum / N, { stats: `${N - ruined}/${N} fish saved` }); return; } newFish(); } }
          else x += dt / sweep;
          if (wait <= 0 && x >= 1.04) endFish();
          S.frame(dt, draw);
        },
        key(code) {
          if (!isAct(code)) return false;
          if (wait > 0 || !fish) return;
          chop = 0.14;
          const kx = tx(x);
          if (x >= fish.bile && x <= fish.bile + fish.bileW) {
            fish.ruined = true; ruined++;
            api.sfx('squish'); S.shake(9); S.flash('rgba(140,220,40,.45)', 0.3);
            S.burst(kx, FY + 10, { n: 30, colors: ['#8fd43a', '#6aa82a', '#c8ff6a'], size: 6, speed: 300, life: 0.9, shape: 'drop' });
            S.mark(false, kx, 70, 'BILE!');
            api.msg(pick(['BILE SAC! You\'re wearing it now.', 'SPLOOSH. Green everywhere. Mama Barnacle gags.', 'You hit the bile. The fish wins.']), 'bad', 1100);
            endFish();
            return;
          }
          const m = fish.marks.find((mm) => !mm.done && Math.abs(mm.x - x) <= tol);
          if (m) { m.done = true; fish.hits++; api.sfx('flip'); cuts.push({ x: tx(m.x), good: true }); S.burst(tx(m.x), FY, { n: 8, color: '#a8201a', size: 3, speed: 160, life: 0.5 }); S.pop('✂ CLEAN', tx(m.x), 80, { color: '#a8e070', size: 18 }); }
          else { fish.slop++; api.sfx('miss'); cuts.push({ x: kx, good: false }); S.mark(false, kx, 80, 'SLOPPY'); api.msg(pick(['Sloppy hack.', 'You stabbed the table.', 'That was a fin. Fins have feelings.']), 'bad', 600); }
        },
      };
    },
  });
}
