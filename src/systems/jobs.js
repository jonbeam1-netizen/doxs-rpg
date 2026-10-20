// Jobs & careers: hiring, shifts (time skip), random shift events, promotions.
// game.jobs = { current(), def(id), apply(id), quit(), fire(msg), work(id), options(jobId) , JOBS }
// state.p.job = { id, rank, shifts }   (current job; shifts = shifts worked at this rank)
// state.p.careers[jobId] = { rank, shifts, total }   (history so you keep your rank if you come back)
import { JOBS } from '../data/jobs.js';
import { fmtMoney, pick, chance, rand } from '../core/util.js';
import { reqCheck, reqHtml, reqMissing, train, isOpen, hoursLabel, hasCourse, ensureState } from './common.js';
import { say, choose } from './ui-kit.js';
import { payMult, gainMult } from './minigame.js';

export function installJobs(game) {
  const st = game.state;

  function career(id) {
    const p = st.p;
    p.careers ??= {};
    return (p.careers[id] ??= { rank: 0, shifts: 0, total: 0 });
  }

  const jobs = {
    JOBS,
    def: (id) => JOBS[id],
    current() {
      const j = st.p.job;
      if (!j || !JOBS[j.id]) return null;
      const r = JOBS[j.id].ranks[j.rank] || JOBS[j.id].ranks[0];
      return { id: j.id, rank: j.rank, shifts: j.shifts, title: r.title, pay: r.pay, def: JOBS[j.id] };
    },
    has: (id) => st.p.job?.id === id,

    async apply(id) {
      const d = JOBS[id];
      const p = st.p;
      const c = career(id);
      const rank = Math.min(c.rank, d.ranks.length - 1);
      const r = d.ranks[rank];
      const req = { ...r.req, ...(id === 'cop' ? { maxHeat: 0 } : {}) };
      const chk = reqCheck(game, req);
      if (!chk.ok) {
        await say(game, d.name, `${d.boss} looks you up and down. "${pick(['Come back when you\'re less pathetic.', 'We have standards. Low ones. You\'re under them.', 'Lol. No.'])}"<br><br>Needs: ${reqHtml(game, req)}`, d.boss);
        return false;
      }
      if (p.job && p.job.id !== id) {
        const cur = JOBS[p.job.id];
        if (!(await game.ui.confirm(`Quit your job at ${cur?.name ?? p.job.id} to work here?`, { title: 'Career change' }))) return false;
      }
      p.job = { id, rank, shifts: c.shifts };
      st.changed('job');
      game.bus.emit('job:hired', { jobId: id, rank, pay: r.pay });
      game.ui.bigText('HIRED', `${r.title} at ${d.name}`, 2200);
      await say(game, d.name, `${hireLine(id)}<br><br>You're ${/^[AEIOU]/i.test(r.title) ? 'an' : 'a'} <b>${r.title}</b>. Pay: <b>${fmtMoney(r.pay)}${d.kind === 'delivery' ? ' per delivery + tips' : '/hour'}</b>.<br><span class="sys-hint">${d.hours ? `Shifts can start ${hoursLabel(d.hours).replace('Open ', '')}.` : 'Shifts any time, day or night.'} Work ${r.shifts < 999 ? r.shifts : '—'} shifts for a shot at promotion.</span>`, d.boss);
      return true;
    },

    quit() {
      const p = st.p;
      if (!p.job) return;
      const d = JOBS[p.job.id];
      game.ui.toast(`You quit ${d?.name}. You flip off the building on your way out.`, 'info', 3000);
      p.job = null;
      st.changed('job');
    },

    fire(msg) {
      const p = st.p;
      if (!p.job) return;
      const c = career(p.job.id);
      c.rank = Math.max(0, c.rank - 1);
      c.shifts = 0;
      p.job = null;
      st.changed('job');
      game.ui.bigText('FIRED', msg || 'Clean out your desk.', 3000);
    },

    // The shift picker + result for 'shift' jobs.
    async work(id) {
      const d = JOBS[id];
      const p = st.p;
      if (p.job?.id !== id) return;
      if (d.kind === 'delivery') return game.sysDelivery?.start();
      if (!isOpen(game, d.hours)) { await say(game, d.name, `No shifts starting now. ${hoursLabel(d.hours)}.`); return; }
      if (id === 'cop' && p.heat > 0) { await say(game, d.name, `Chief Lardner squints. "Funny thing. There's a warrant out for a guy who looks EXACTLY like you. Clear that up first." (Pay off your heat.)`, 'Chief Lardner'); return; }
      if (p.sys.drunk >= 3) { await say(game, d.name, `${d.boss}: "You're hammered. Go home. And don't throw up on the—" You throw up on the thing.`, d.boss); return; }
      const r = d.ranks[p.job.rank];
      const hours = await choose(game, {
        title: `Work a shift — ${r.title}`,
        html: `${fmtMoney(r.pay)}/hour · costs ${d.energy} energy/hour. You have ${Math.floor(p.energy)} energy.`,
        choices: [2, 4, 8].map((h) => ({ label: `${h}-hour shift`, hint: `${fmtMoney(r.pay * h * (1 + seniority(p.job)))} · -${d.energy * h} energy`, disabled: p.energy < d.energy * h, value: h })),
      });
      if (!hours) return;
      const mg = jobGame(id, p.job.rank);
      if (mg && game.minigames?.has(mg.id)) {
        await game.minigames.run(mg.id, {
          title: `${d.name} — ${r.title}`,
          intro: SHIFT_INTRO[mg.id] || '',
          stakes: `${hours}-hour shift · base pay <b>${fmtMoney(r.pay * hours)}</b>${d.tips ? ' + tips' : ''} · -${d.energy * hours} energy · ${hours}h pass either way.`,
          diff: mg.diff, playLabel: 'Clock in', skipLabel: 'Skip (auto, 80% pay)',
          skipLine: 'You zone out and let muscle memory do the shift. Muscle memory is not great at this.',
          context: { jobId: id, rank: p.job.rank, hours },
          apply: (res) => doShift(id, hours, res),
        });
        return;
      }
      await say(game, `${d.name} — shift over`, doShift(id, hours, null), d.boss);
    },
  };
  game.jobs = jobs;

  // Which minigame each career plays (rank raises the difficulty). diff 0..1.
  function jobGame(id, rank) {
    const n = JOBS[id]?.ranks.length || 1;
    const diff = n > 1 ? rank / (n - 1) : 0;
    if (id === 'diner') return rank === 0 ? { id: 'dishwash', diff: 0 } : { id: 'linecook', diff: rank === 1 ? 0.1 : 0.6 };
    const g = { factory: 'conveyor', office: 'email', bartender: 'mixdrink', cop: 'lineup', bouncer: 'idcheck', scrapper: 'scrapsort', fish_gutter: 'gutfish' }[id];
    return g ? { id: g, diff } : null;
  }
  jobs.jobGame = jobGame;

  const SHIFT_INTRO = {
    dishwash: 'Big Marge points at a tower of plates that has its own weather system. "Scrub. In rhythm. Like your mama taught you, if she taught you anything."',
    linecook: 'Tickets are piling up on the rail. The flat top hisses like it knows your name. Marge: "Burgers go bun, stuff, bun. It ain\'t rocket surgery."',
    conveyor: 'The belt groans to life. Foreman Gristle cracks his knuckles, then somebody else\'s. "Good meat in the box. Gross stuff in the bin. Hot dogs get the rest."',
    email: 'Your inbox has 4,000 unread emails and one of them is just the word "hey". Mr. Grimsby wants Inbox Zero by lunch. It is 12:58.',
    mixdrink: 'One-Eyed Sal slides you the recipe book. It\'s mostly stains. "Customers order by name. You find the name. You pour. You don\'t ask what Gristle\'s Gargle is for."',
    lineup: 'Chief Lardner drops a stack of witness statements on your desk. One is written on a napkin, in mustard. "Find the perp. Any perp. THE perp, ideally."',
    idcheck: 'The line around Club Velvet reaches the next zip code. Vince hands you a flashlight. "21 and up. Valid ID. And for the love of God, check the SHOES."',
    scrapsort: 'Scrapper Pete fires up the big magnet. Mr. Chompers watches you from atop a dead minivan. "Copper\'s money. Steel\'s money. Trash is trash. Don\'t sort Chompers."',
    gutfish: 'Mama Barnacle hands you a knife older than you. "Cut on the lines, sweetie. Hit the bile sac and you\'re mopping it with your tongue."',
  };

  // Pays out a shift. res = minigame result (null = no minigame). Returns the summary html.
  function doShift(id, hours, res) {
    const d = JOBS[id];
    const p = st.p;
    const r = d.ranks[p.job.rank];
    st.addStat('energy', -d.energy * hours);
    game.time.advance(hours * 60);
    // balance pass 6: the better the job, the more a great shift is worth (rank scales the bonus above 1x)
    let mult = res ? payMult(res) : 1;
    if (mult > 1) mult = 1 + (mult - 1) * (1 + 0.3 * p.job.rank);
    const sen = seniority(p.job);
    const base = Math.round(r.pay * hours * (1 + sen));
    let pay = base * mult;
    let extra = '';
    if (hasCourse(p, 'bs101')) pay *= 1.1;
    let perfLine = '';
    if (res) {
      perfLine = `Base ${fmtMoney(base)}${sen > 0 ? ` (incl. +${Math.round(sen * 100)}% seniority)` : ''} × <b>${res.skipped ? 'autopilot' : 'grade ' + res.grade}</b> (${mult.toFixed(2)}×${hasCourse(p, 'bs101') ? ', +10% BS degree' : ''})`;
    }
    if (d.tips) {
      const tipMult = res ? (res.skipped ? 0.8 : 0.5 + res.score) : 1;
      const tips = Math.round(rand(0.2, 1) * (2 + p.cha * 0.12) * hours * tipMult);
      pay += tips;
      extra += `<br>Tips: <b>${fmtMoney(tips)}</b>${res && !res.skipped && res.score >= 0.82 ? ' (great service = great tips)' : ''} (and a phone number written on a napkin in what you hope is ketchup).`;
    }
    pay = Math.round(pay);
    // random event
    if (d.events?.length && chance(0.35)) {
      const ev = pick(d.events);
      extra += `<br><br><em>${ev.text}</em>`;
      if (ev.money) pay += ev.money;
      if (ev.hp) st.damage(-ev.hp, 'work');
      if (ev.energy) st.addStat('energy', ev.energy);
      if (ev.karma) st.addStat('karma', ev.karma);
      if (ev.cha) st.addStat('cha', ev.cha);
      if (ev.item) { st.addItem(ev.item, 1); extra += ` <span class="ui-good">(+${game.items?.name(ev.item)})</span>`; }
    }
    // The perk wrapper on addMoney applies jobPay (Brown-Noser, backgrounds): report what actually landed.
    const m0 = p.money;
    st.addMoney(pay, 'job');
    const got = Math.round(p.money - m0);
    let perkNote = '';
    if (got > pay) { perkNote = ` <span class="sys-hint">(incl. +${fmtMoney(got - pay)} from perks)</span>`; pay = got; }
    const gm = res ? gainMult(res) : 1;
    for (const [k, v] of Object.entries(d.gain || {})) train(game, k, v * hours * gm, 'job:' + id);
    if (id === 'cop') st.addStat('karma', 1);
    const bonusXp = res && !res.skipped ? Math.round(res.score * 10) : 0;
    st.addXP(hours * 6 + p.job.rank * 4 + bonusXp);
    p.job.shifts++;
    const c = career(id);
    c.shifts = p.job.shifts;
    c.rank = p.job.rank;
    c.total++;
    c.lastDay = game.time.day;
    st.changed('job');
    game.bus.emit('job:worked', { jobId: id, rank: p.job.rank, pay, hours });
    const promo = checkPromotion(id);
    return `${pick(d.lines)}${extra}<br><br>You worked <b>${hours} hours</b> as ${r.title} and earned <b class="ui-good">${fmtMoney(pay)}</b>${perkNote}.${perfLine ? `<br><span class="sys-hint">${perfLine}${bonusXp ? ` · +${bonusXp} bonus XP` : ''}</span>` : ''}${promo ? `<br><br>${promo}` : ''}`;
  }

  function checkPromotion(id) {
    const d = JOBS[id];
    const p = st.p;
    const r = d.ranks[p.job.rank];
    const next = d.ranks[p.job.rank + 1];
    if (!next || p.job.shifts < r.shifts) return '';
    const chk = reqCheck(game, next.req);
    if (!chk.ok) {
      return `<span class="sys-hint">${d.boss}: "You've put in the time for <b>${next.title}</b>, but you're missing: ${reqMissing(game, next.req)}." (Seniority still bumps your pay +5% a shift, up to +50%.)</span>`;
    }
    p.job.rank++;
    p.job.shifts = 0;
    const c = career(id);
    c.rank = p.job.rank; c.shifts = 0;
    st.changed('job');
    game.bus.emit('job:promoted', { jobId: id, rank: p.job.rank, pay: next.pay });
    st.addXP(50 * p.job.rank);
    // signing bonus: 20 hours of the new wage (10 deliveries for Pizza Butt)
    const bonus = Math.round(next.pay * (d.kind === 'delivery' ? 10 : 20));
    st.addMoney(bonus, 'job');
    const perkLine = grantCareerPerk(id, p.job.rank);
    setTimeout(() => game.ui.bigText('PROMOTED!', `${next.title} — ${fmtMoney(next.pay)}${d.kind === 'delivery' ? '/drop' : '/hr'}`, 3000), 50);
    return `<b class="ui-good">PROMOTION!</b> ${promoLine(id, next.title)} New pay: <b>${fmtMoney(next.pay)}${d.kind === 'delivery' ? ' per delivery' : '/hr'}</b> · signing bonus <b class="ui-good">${fmtMoney(bonus)}</b>.${perkLine}`;
  }

  // Seniority: +5% per shift worked at your current rank, max +50% (resets on promotion — the raise is bigger).
  function seniority(j) {
    if (!j) return 0;
    return Math.min(0.5, 0.05 * Math.max(0, j.shifts || 0));
  }
  jobs.seniority = seniority;

  // Career perks (data/jobs.js perks[rank]): granted once, kept for good. p.careerPerks = { 'jobId:rank': day }.
  function grantCareerPerk(id, rank) {
    const P = JOBS[id]?.perks?.[rank];
    const p = st.p;
    p.careerPerks ??= {};
    const key = `${id}:${rank}`;
    if (!P || p.careerPerks[key]) return '';
    p.careerPerks[key] = game.time.day;
    const got = [];
    try {
      if (P.flag) st.setFlag(P.flag, true);
      if (P.item) { st.addItem(P.item, 1); got.push(game.items?.name(P.item)); }
      if (P.weapon && !p.weapons.includes(P.weapon)) { if (game.combat?.giveWeapon) game.combat.giveWeapon(P.weapon, P.weapon === 'pistol' ? 24 : 0); else p.weapons.push(P.weapon); got.push(P.weapon); }
      if (P.gear) { p.heists ??= {}; p.heists.gear ??= {}; p.heists.gear[P.gear] = Math.max(1, p.heists.gear[P.gear] || 0); got.push('heist gear'); }
      if (P.car && game.vehicles?.giveCar && !(p.cars || []).some((c) => c.carId === P.car)) { game.vehicles.giveCar(P.car); got.push('a ride'); }
    } catch (e) { console.error('[jobs] career perk failed', e); }
    st.changed('job');
    game.bus.emit('job:perk', { jobId: id, rank, perk: P });
    return `<br><span class="ui-good">⭐ Career perk unlocked:</span> ${P.text}`;
  }
  jobs.grantCareerPerk = grantCareerPerk;

  // Every career perk you've earned (for game.perks.mult and the sheet).
  jobs.earnedPerks = () => {
    const p = st.p, out = [];
    for (const key of Object.keys(p.careerPerks || {})) {
      const [id, r] = key.split(':');
      const P = JOBS[id]?.perks?.[r];
      if (P) out.push({ jobId: id, rank: Number(r), ...P });
    }
    return out;
  };

  // Daily retainer for the current job's earned perks (paid by systems' daily tick on active days).
  jobs.dailyIncome = () => {
    const p = st.p, j = p.job;
    if (!j || !JOBS[j.id]) return 0;
    let n = 0;
    for (let r = 0; r <= j.rank; r++) { const P = JOBS[j.id].perks?.[r]; if (P?.daily && p.careerPerks?.[`${j.id}:${r}`]) n += P.daily; }
    // you have to actually show up: no retainer if you haven't worked in 3 days
    const last = p.careers?.[j.id]?.lastDay ?? -99;
    return game.time.day - last <= 3 ? n : 0;
  };
  jobs.checkPromotion = checkPromotion;
  jobs.career = career;

  // Menu options to drop into a workplace's placeMenu.
  jobs.options = (id) => {
    const d = JOBS[id];
    const p = st.p;
    const mine = p.job?.id === id;
    const c = career(id);
    const r = d.ranks[Math.min(c.rank, d.ranks.length - 1)];
    const out = [];
    if (!mine) {
      const req = { ...r.req, ...(id === 'cop' ? { maxHeat: 0 } : {}) };
      const ok = reqCheck(game, req).ok;
      out.push({ label: `Apply for a job: ${r.title}`, hint: `${fmtMoney(r.pay)}${d.kind === 'delivery' ? '/drop' : '/hr'}${ok ? '' : ' · needs ' + reqMissing(game, req)}`, run: () => jobs.apply(id) });
    } else {
      const cr = d.ranks[p.job.rank];
      const next = d.ranks[p.job.rank + 1];
      out.push({
        label: d.kind === 'delivery' ? 'Grab pizzas for a delivery run' : `Work a shift (${cr.title})`,
        hint: `${fmtMoney(cr.pay)}${d.kind === 'delivery' ? '/drop' : '/hr'}${isOpen(game, d.hours) ? '' : ' · not now'}`,
        disabled: !isOpen(game, d.hours) || !!game.sysDelivery?.active,
        run: () => jobs.work(id),
      });
      out.push({
        label: 'Ask about a promotion',
        hint: next ? `${Math.max(0, cr.shifts - p.job.shifts)} shifts to go` : 'top of the ladder',
        // Put in the shifts and meet the bar? Asking gets you the promotion now (no extra shift needed).
        run: () => (next && p.job.shifts >= cr.shifts && reqCheck(game, next.req).ok ? say(game, d.name, checkPromotion(id), d.boss) : say(game, d.name, next
          ? `${d.boss}: "Next rung is <b>${next.title}</b> at ${fmtMoney(next.pay)}${d.kind === 'delivery' ? '/drop' : '/hr'}. Put in ${Math.max(0, cr.shifts - p.job.shifts)} more shifts and have: ${reqHtml(game, next.req) || 'a pulse'}."`
          : `${d.boss}: "You're ${cr.title}. There's nowhere left to climb, unless you want MY job." He grips his stapler protectively.`, d.boss)),
      });
      out.push({ label: 'Quit', hint: 'storm out dramatically', run: async () => { if (await game.ui.confirm(`Quit ${d.name}?`)) jobs.quit(); } });
    }
    return out;
  };
  // Menus put the main job action (Apply / Work a shift) near the top and promotion/quit at the bottom.
  jobs.lead = (id) => jobs.options(id).slice(0, 1);
  jobs.trail = (id) => jobs.options(id).slice(1);

  function hireLine(id) {
    return {
      diner: 'Big Marge throws an apron at your face. "Hairnet stays on. If I find one of your hairs in the food, I\'m puttin\' one of mine in yours."',
      pizza: 'Tony Butt hands you a hat shaped like a butt. "Wear it with pride. Or shame. Either way, wear it."',
      factory: 'Foreman Gristle hands you a rubber apron that is already wet. "Don\'t ask what it\'s wet with. Lockers are in the back. Don\'t open locker 13."',
      office: 'Mr. Grimsby shakes your hand without looking up. "Welcome to the Grimco family. Families don\'t unionize."',
      bartender: 'One-Eyed Sal tosses you a rag. "Wipe the bar. Wipe the glasses. Never wipe the stool by the bathroom. Ever."',
      cop: 'Chief Lardner pins a badge on you. It goes through your shirt and into your nipple. "Welcome to the force, rookie."',
      bouncer: 'Velvet Vince looks at your arms and nods. "Rule one: nobody in sneakers. Rule two: unless they tip. Rule three: always tip Vince."',
      scrapper: 'Scrapper Pete spits. "You\'re hired. Mr. Chompers hasn\'t bitten you yet so you\'re already doin\' better than the last guy."',
    }[id] || 'You\'re hired.';
  }
  function promoLine(id, title) {
    return {
      diner: `Marge gives you a hug that smells like bacon grease. You're now ${title}.`,
      factory: `Gristle hands you a slightly bigger knife. You're ${title} now.`,
      office: `You get a business card that says "${title}". Your mom finally puts your photo back on the fridge.`,
      cop: `The Chief hands you a fresh badge and a box of donuts. You are ${title}. The donuts are evidence, so eat fast.`,
      pizza: `Tony Butt crowns you with a bigger butt hat. All hail the ${title}.`,
      bartender: `Sal gives you the good rag. You're ${title}.`,
      bouncer: `Vince gives you a bigger flashlight to hit people with. You're ${title}.`,
      scrapper: `Pete lets you drive the crusher. Mr. Chompers salutes. You're ${title}.`,
    }[id] || `You're now ${title}.`;
  }

  game.bus.on('state:reset', () => ensureState(st.p));
  // Old saves (pre balance pass 6): hand out the career perks for ranks you'd already earned.
  game.bus.on('game:start', () => {
    try {
      let n = 0;
      for (const [id, c] of Object.entries(st.p.careers || {})) for (let r = 1; r <= (c.rank || 0); r++) if (grantCareerPerk(id, r)) n++;
      if (n) setTimeout(() => game.ui.toast(`⭐ ${n} career perk${n > 1 ? 's' : ''} unlocked for ranks you already earned. Check your character sheet (Tab).`, 'good', 5000), 3000);
    } catch (e) { console.error('[jobs] retro perks failed', e); }
  });
  return jobs;
}
