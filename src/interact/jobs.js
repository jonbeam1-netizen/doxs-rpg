// Pick-up street jobs at fixed spots. No boss, no NPC, no dignity:
//   - Odd Jobs board (Downtown): hand out flyers to passers-by
//   - Squeegee corner (Gutterside): wash windshields at the light
//   - Parcel Drop (Rustyards): run a package to a building across town
// Active job lives in state.p.interact.job (plain JSON).

import { tile } from '../ui/visual2.js';

const CSS = `.ix-job { position: fixed; top: 74px; left: 50%; transform: translateX(-50%); z-index: 30; pointer-events: none;
  background: rgba(10,9,8,.82); border: 1px solid #3b342b; padding: 4px 12px; color: var(--bone, #e6dfcf);
  font-family: var(--font-body, sans-serif); font-size: 15px; white-space: nowrap; }
.ix-job.hidden { display: none; } .ix-job b { color: var(--cash, #7fbf4d); }`;

const FLYERS = ["Dr. Klaw's Discount Dentistry", 'Grimco Is Hiring (Souls)', 'LOST CAT: answers to "Mr. Murder"', 'Hot Singles In Your Dumpster', "Pastor Rick's Drive-Thru Baptisms"];
const FLY_REACT = ['Is this a summons?', '...thanks?', 'I\'ll use it as a napkin.', 'Ooh, coupons!', 'Get away from me.', 'Is the cat okay?', '*takes it, drops it*', 'My dentist is already a claw.'];
const DRIVERS = [
  { who: 'a soccer mom in a minivan', good: 'She gives you $8 and a juice box.', bad: 'She locks the doors and screams for 40 seconds straight.', pay: [4, 10] },
  { who: 'a guy in a convertible with the top down', good: 'He laughs, tosses you $12. "You missed a spot. Me."', bad: 'You squeegee him directly. He is wet now. So is your future.', pay: [6, 14] },
  { who: 'a cop car', good: 'The officer stares at you for a long time and gives you a single donut.', bad: '"Move along." You move along.', pay: [0, 0], cop: true },
  { who: 'a beat-up pickup with a dog in the back', good: 'The dog licks your hand. The driver gives you $5 in nickels.', bad: 'The dog barks at you. The driver barks at you. You bark back.', pay: [3, 6] },
  { who: 'a limo with tinted windows', good: 'The window lowers 2 inches. A $20 bill slides out. The window closes.', bad: 'The window lowers. A cigar is ashed on your shoe.', pay: [12, 22] },
  { who: 'a hearse', good: 'The driver nods solemnly and tips $7. The passenger does not.', bad: 'The driver says nothing. It is a very quiet drive-off.', pay: [5, 9] },
];

export function installJobs(game, I) {
  const st = game.state, P = I.placer, w = game.world;
  const { fmt, pick, chance, randInt } = I;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const hud = document.createElement('div'); hud.className = 'ix-job hidden';
  (document.getElementById('ui-root') || document.body).appendChild(hud);
  let hudHtml = '';
  const setHud = (h) => { if (h === hudHtml) return; hudHtml = h; hud.innerHTML = h || ''; hud.classList.toggle('hidden', !h); };

  const job = () => I.S().job;
  const finish = (kind, pay, cdMin) => {
    I.S().job = null;
    I.cool('job:' + kind, cdMin);
    I.bump('jobs');
    game.bus.emit('interact:job', { job: kind, pay });
  };
  const mins = (n) => `${Math.max(0, Math.ceil(n))} min`;

  // ------------------------------------------------------------ spots
  const pickOne = (kind, cands, district, fit) => P.pick(cands.filter((c) => w.districtAt(c.x, c.z) === district), { count: 1, kind, minSame: 50, rClear: 3, fit, rng: I.rng('job:' + kind) })[0]
    || P.pick(cands, { count: 1, kind, minSame: 50, rClear: 3, fit, rng: I.rng('job2:' + kind) })[0];

  // ============================================================ FLYERS
  const boardSpot = pickOne('board', P.wallSpots(), 'downtown', (c) => P.againstWall(c, 1.6, 0.3));
  if (boardSpot) {
    I.add({
      id: 'job_flyers', kind: 'board', ...boardSpot, solid: [1.6, 0.25, 2.2], wallProp: true, useOffset: 0.9, radius: 2,
      prompt: () => (job()?.kind === 'flyers' ? 'Odd Jobs board <small>(flyers in progress)</small>' : 'Odd Jobs board'),
      use: () => boardMenu(),
    });
  }
  async function boardMenu() {
    const j = job();
    const opts = [];
    if (j?.kind === 'flyers') opts.push({ label: 'Dump the rest of the flyers in a bin', hint: 'Quit. No one will know. (Everyone will know.)', run: () => { I.S().job = null; I.cool('job:flyers', 60); I.toast('You dump the flyers. A raccoon reads one. At least someone did.', 'info'); } });
    else if (j) opts.push({ label: `Finish your ${j.kind} job first`, disabled: true });
    else {
      opts.push({ label: 'Hand out flyers', hint: `10 flyers, ${fmt(3)} each + ${fmt(12)} bonus. 2 hours.`, disabled: !I.ready('job:flyers'), run: () => {
        const biz = pick(FLYERS);
        I.S().job = { kind: 'flyers', left: 10, until: Math.round(game.time.total + 120), biz, given: [] };
        I.toast(`You grab a stack of flyers for <b>${I.esc(biz)}</b>. Walk up to people to hand them out.`, 'info', 4200);
      } });
      if (!I.ready('job:flyers')) opts[0].hint = `Fresh flyers in ${mins(I.left('job:flyers'))}.`;
    }
    await I.choose({ title: 'ODD JOBS', html: '<i>A corkboard covered in tear-off phone numbers, a lost dog poster from 2009 and a sign: "CASH DAILY. NO QUESTIONS. SOME ANSWERS."</i>', options: opts });
  }
  let flyT = 0;
  function updateFlyers(dt, j) {
    flyT -= dt;
    if (flyT > 0) return;
    flyT = 0.3;
    if (game.time.total > j.until) {
      I.S().job = null; I.cool('job:flyers', 60);
      I.toast(`Time's up. You stuff ${j.left} flyers in a storm drain. The fish are now informed.`, 'bad', 3200);
      return;
    }
    if (game.player.vehicle) return;
    const pp = I.pp();
    let near = [];
    try { near = game.npcs?.near?.(pp.x, pp.z, 2.4) || []; } catch { near = []; }
    for (const n of near) {
      if (n.dead || n.hostile || n.kind === 'cop' || n.kind === 'dealer' || n.kind === 'static' || n.replica) continue;
      const key = String(n.id);
      if (j.given.includes(key)) continue;
      j.given.push(key); if (j.given.length > 40) j.given.shift();
      j.left--;
      st.addMoney(3, 'flyers'); I.sfx('coin');
      if (chance(0.6)) I.say(n.group, pick(FLY_REACT), { ttl: 2.2 });
      if (j.left <= 0) {
        st.addMoney(12, 'flyers');
        I.toast(`All flyers handed out! ${fmt(12)} bonus. ${I.esc(j.biz)} thanks you for your service.`, 'money', 3400);
        finish('flyers', 42, 180);
      }
      break;
    }
  }

  // ============================================================ SQUEEGEE
  const sqSpot = pickOne('squeegee', I.curbs || [], 'gutterside', (c) => (P.footprintFree(c.x, c.z, c.facing, 1.4, 0.6, 0.7) && P.roomy(c.x, c.z, c.facing, 1.4, 0.6, 1.0) ? { x: c.x, z: c.z, facing: c.facing } : null));
  if (sqSpot) {
    I.add({
      id: 'job_squeegee', kind: 'squeegee', ...sqSpot, solid: [0.5, 0.5, 1.2], useOffset: 0.85, radius: 1.8, cull: 90,
      prompt: () => (I.ready('job:squeegee') ? 'Work the squeegee corner' : 'Squeegee corner <small>(arms still sore)</small>'),
      use: () => squeegee(),
    });
  }
  async function squeegee() {
    if (job()) { I.toast(`Finish your ${job().kind} job first. One hustle at a time.`, 'info'); return; }
    if (!I.ready('job:squeegee')) { I.toast(`Your arms need ${mins(I.left('job:squeegee'))} to stop shaking.`, 'info'); return; }
    let total = 0, cars = 0;
    for (let k = 0; k < 4; k++) {
      const d = pick(DRIVERS);
      const i = await I.dialog({
        title: `Squeegee corner — car ${k + 1}/4`, text: `The light turns red. Up rolls ${d.who}.`,
        options: [{ label: 'Wash it', hint: '-3 energy' }, { label: 'Wash it with PIZZAZZ', hint: 'Charm check. Bigger tips, bigger risks.' }, { label: 'Let this one go' }, { label: 'Call it a day' }],
      });
      if (i == null || i === 3) break;
      if (i === 2) continue;
      if (!st.useEnergy(3)) break;
      cars++;
      const flair = i === 1;
      const ok = flair ? Math.random() < Math.min(0.85, 0.3 + st.p.cha * 0.012) : Math.random() < 0.72;
      if (ok) {
        const n = d.cop ? 0 : Math.round(randInt(d.pay[0], d.pay[1]) * (flair ? 1.6 : 1));
        if (d.cop) st.addItem('donut', 1);
        if (n) { st.addMoney(n, 'squeegee'); total += n; I.sfx('coin'); }
        await I.dialog({ title: 'Squeak squeak', text: d.good + (flair ? ' (You did a little spin. It worked.)' : ''), options: [{ label: 'Next!' }] });
      } else {
        if (d.cop && flair) st.addHeat(0.5);
        await I.dialog({ title: 'Squeak... no', text: d.bad + (flair ? ' (The spin did not help.)' : ''), options: [{ label: 'Ugh. Next.' }] });
      }
    }
    if (!cars) return;
    game.time.advance(cars * 8);
    I.toast(`Shift over: ${cars} windshield${cars > 1 ? 's' : ''}, ${fmt(total)} in tips. Your arms feel like wet noodles.`, total ? 'money' : 'info', 3400);
    finish('squeegee', total, 120);
  }

  // ============================================================ PARCEL DROP
  const lockSpot = pickOne('locker', P.wallSpots(), 'rustyards', (c) => P.againstWall(c, 1.2, 0.7));
  const CONTENTS = ['It\'s ticking. Probably a clock. Probably.', 'It\'s warm and smells like soup.', 'Something inside just meowed.', 'It\'s labeled "DEFINITELY NOT EVIDENCE".', 'It sloshes.', 'It\'s very light. Suspiciously light.'];
  let locker = null;
  if (lockSpot) {
    locker = I.add({
      id: 'job_parcel', kind: 'locker', ...lockSpot, solid: [1.24, 0.74, 1.8], wallProp: true, useOffset: 0.95, radius: 2,
      prompt: () => (job()?.kind === 'parcel' ? 'Parcel Drop <small>(delivery in progress)</small>' : 'Parcel Drop'),
      use: () => parcelMenu(),
    });
  }
  function targetsFrom(x, z) {
    return game.locations.list.filter((l) => {
      const d = Math.hypot((l.doorX ?? l.x) - x, (l.doorZ ?? l.z) - z);
      return d > 110 && d < 520 && l.district !== 'blackwater' && Number.isFinite(l.doorX);
    });
  }
  async function parcelMenu() {
    const j = job();
    const opts = [];
    if (j?.kind === 'parcel') {
      opts.push({ label: 'Return the package (quit)', run: () => { I.S().job = null; I.cool('job:parcel', 60); clearWp(); I.toast('You hand it back. The locker makes a disappointed beep.', 'info'); } });
    } else if (j) opts.push({ label: `Finish your ${j.kind} job first`, disabled: true });
    else {
      const ready = I.ready('job:parcel');
      opts.push({ label: 'Take a delivery', hint: ready ? 'Pay depends on distance. Bonus for speed.' : `Next parcel in ${mins(I.left('job:parcel'))}.`, disabled: !ready, run: () => {
        const list = targetsFrom(locker.x, locker.z);
        if (!list.length) { I.toast('No deliveries right now. Even the packages are on strike.', 'info'); return; }
        const L = pick(list);
        const dist = Math.hypot(L.doorX - locker.x, L.doorZ - locker.z);
        const minutes = Math.round(40 + dist / 5);
        I.S().job = { kind: 'parcel', target: L.id, until: Math.round(game.time.total + minutes), pay: Math.round(18 + dist * 0.11), name: L.name };
        setWp();
        I.dialog({ title: 'Parcel Drop', text: `Deliver this box to ${L.name} within ${minutes} minutes. ${pick(CONTENTS)} Don't shake it.`, options: [{ label: 'On it' }] });
      } });
    }
    await I.choose({ title: 'ROTWELL PARCEL DROP', html: '<i>A rusty bank of lockers. A sticker reads: "Couriers wanted. Must have legs. Questions discouraged."</i>', options: opts });
  }
  const setWp = () => { const j = job(); const L = j && game.locations.get(j.target); if (L) w.setWaypoint?.(L.doorX, L.doorZ, `Parcel: ${L.name}`); };
  const clearWp = () => { const m = w.markers?.get?.('waypoint'); if (m && String(m.label || '').startsWith('Parcel:')) w.clearWaypoint?.(); };
  let parT = 0;
  function updateParcel(dt, j) {
    parT -= dt;
    if (parT > 0) return;
    parT = 0.25;
    const L = game.locations.get(j.target);
    if (!L) { I.S().job = null; return; }
    const pp = I.pp();
    if (Math.hypot(pp.x - L.doorX, pp.z - L.doorZ) < 4.5) {
      const late = game.time.total > j.until;
      const pay = late ? Math.round(j.pay / 2) : j.pay + (j.until - game.time.total > 20 ? Math.round(j.pay * 0.25) : 0);
      st.addMoney(pay, 'parcel');
      I.sfx('cash');
      I.toast(late ? `Delivered to ${I.esc(L.name)}... late. They pay ${fmt(pay)} and a one-star review.` : `Delivered to ${I.esc(L.name)}! ${fmt(pay)}${pay > j.pay ? ' (speed bonus!)' : ''}. They don't ask, you don't tell.`, 'money', 3400);
      clearWp();
      finish('parcel', pay, 90);
    }
  }

  // ============================================================ per-frame + hud
  I.hooks.frame.push((dt) => {
    const j = job();
    if (!j) { setHud(''); return; }
    if (j.kind === 'flyers') { updateFlyers(dt, job() || j); }
    else if (j.kind === 'parcel') updateParcel(dt, j);
    const k = job();
    if (!k) { setHud(''); return; }
    const left = k.until - game.time.total;
    if (k.kind === 'flyers') setHud(`📄 Flyers left: <b>${k.left}</b> · walk up to people · ${mins(left)}`);
    else if (k.kind === 'parcel') setHud(`📦 Deliver to <b>${I.esc(k.name)}</b> · ${left > 0 ? mins(left) + ' left' : 'LATE'}`);
    else setHud('');
  });
  I.hooks.reset.push(() => { setHud(''); });
  game.bus.on('game:start', () => { if (job()?.kind === 'parcel') setWp(); });
  game.bus.on('player:arrested', () => { const j = job(); if (j) { I.S().job = null; clearWp(); I.toast('Your odd job got confiscated along with your dignity.', 'bad'); } });

  I.hooks.sheet.push((s) => tile({ icon: 'work', color: 'var(--g-work)', value: s.n.jobs || 0, label: 'Odd jobs' }));
}
