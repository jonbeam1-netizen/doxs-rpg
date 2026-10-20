import { esc } from '../core/util.js';
import { ensureProgress, PERKS, TREES } from './perks.js';
import { chip, bar } from '../ui/visual.js';
import { ic, ensureStyles as ensureVx2 } from '../ui/visual2.js';

// Achievements tracked from bus events. Saved in state.p.progress.ach[id] = day unlocked,
// counters in state.p.progress.c. Emits 'achievement:unlocked' {id, name}.
//
// game.achievements = { list: ACHIEVEMENTS, unlock(id), has(id), count(), html() }

// c: counter key, n: target. check(g): polled every ~2s.
export const ACHIEVEMENTS = [
  { id: 'fist_contact', name: 'Fist Contact', desc: 'Win your first brawl.', c: 'brawlsWon', n: 1 },
  { id: 'knuckle_dragger', name: 'Knuckle Dragger', desc: 'Win 15 brawls.', c: 'brawlsWon', n: 15 },
  { id: 'concrete_nap', name: 'Napping on Concrete', desc: 'Get knocked out or wrecked.', c: 'deaths', n: 1 },
  { id: 'frequent_flyer', name: "Frequent Flyer at St. Mercy's", desc: 'Wake up in the hospital 5 times.', c: 'deaths', n: 5 },
  { id: 'orange_new_stick', name: 'Orange Is the New Stick', desc: 'Get arrested.', c: 'arrests', n: 1 },
  { id: 'repeat_offender', name: 'Repeat Offender', desc: 'Get arrested 5 times. The cops know your coffee order.', c: 'arrests', n: 5 },
  { id: 'most_wanted', name: 'Most Wanted (By Somebody)', desc: 'Hit 5 stars of heat.', check: (g) => g.state.p.heat >= 5 },
  { id: 'ghosted', name: 'Ghosted the Fuzz', desc: 'Lose the cops from 3+ stars without getting busted.', c: 'escapes', n: 1 },
  { id: 'pharma', name: 'Pharmaceutical Entrepreneur', desc: 'Sell your first baggie.', c: 'drugSales', n: 1 },
  { id: 'kingpin', name: 'Kingpin of the Cul-de-sac', desc: 'Sell 300 units of product.', check: (g) => (g.state.p.totals?.drugsSold || 0) >= 300 },
  { id: 'wage_slave', name: 'Wage Slave', desc: 'Work your first shift.', c: 'shifts', n: 1 },
  { id: 'failing_upward', name: 'Failing Upward', desc: 'Get promoted.', c: 'promotions', n: 1 },
  { id: 'thousandaire', name: 'Thousandaire', desc: 'Carry $1,000 in cash. Flex responsibly.', check: (g) => g.state.p.money >= 1000 },
  { id: 'filthy_rich', name: 'Filthy Rich, Mostly Filthy', desc: 'Have $1,000,000 between cash and bank.', check: (g) => g.state.p.money + g.state.p.bank >= 1e6 },
  { id: 'basement', name: 'Rock Bottom Has a Basement', desc: 'Hit exactly $0 cash.', check: (g) => g.started && g.state.p.money <= 0 && g.time.total > 9 * 60 },
  { id: 'gamblers_fallacy', name: "Gambler's Fallacy", desc: 'Lose $1,000 total at the casino. You were "due".', c: 'casinoLost', n: 1000 },
  { id: 'house_loses', name: 'The House Always Wins (Except Now)', desc: 'Win $1,000+ on a single casino game.', c: 'bigWin', n: 1 },
  { id: 'overeducated', name: 'Overeducated & Underemployed', desc: 'Complete a course.', c: 'courses', n: 1 },
  { id: 'swipe_right', name: 'Swipe Right on Life', desc: 'Have a successful date.', c: 'dates', n: 1 },
  { id: 'friendzoned', name: 'Friend-Zoned by a Stick Figure', desc: 'Crash and burn on a date.', c: 'dateFails', n: 1 },
  { id: 'four_wheels', name: 'Four Wheels and a Prayer', desc: 'Buy a vehicle.', c: 'carsBought', n: 1 },
  { id: 'insurance_fraud', name: 'Insurance Fraud Speedrun', desc: 'Destroy a car.', c: 'carsDestroyed', n: 1 },
  { id: 'fast_fecal', name: 'Fast & Fecal', desc: 'Win a street race.', c: 'races', n: 1 },
  { id: 'landlord', name: 'Landlord-in-Training', desc: 'Buy a home.', c: 'homes', n: 1 },
  { id: 'body_count', name: "Rotwell's Least Favorite Neighbor", desc: 'Take out 25 people. Yikes.', c: 'kills', n: 25 },
  { id: 'did_a_thing', name: 'Did a Thing', desc: 'Complete a quest.', c: 'quests', n: 1 },
  { id: 'errand_boy', name: 'Errand Boy Supreme', desc: 'Complete 10 quests.', c: 'quests', n: 10 },
  { id: 'roll_credits', name: 'Roll Credits', desc: 'Reach an ending.', c: 'endings', n: 1 },
  { id: 'oceans_eleventy', name: "Ocean's Eleventy", desc: 'Pull off a heist.', c: 'heists', n: 1 },
  { id: 'gym_rat', name: 'Do You Even Lift', desc: 'Reach 50 STR.', check: (g) => g.state.p.str >= 50 },
  { id: 'big_brain', name: 'Big Brain Energy', desc: 'Reach 50 INT.', check: (g) => g.state.p.int >= 50 },
  { id: 'smooth_op', name: 'Smooth Operator', desc: 'Reach 50 CHA.', check: (g) => g.state.p.cha >= 50 },
  { id: 'literally_jesus', name: 'Literally Jesus', desc: 'Reach +75 karma.', check: (g) => g.state.p.karma >= 75 },
  { id: 'devils_intern', name: "Satan's Unpaid Intern", desc: 'Sink to −75 karma.', check: (g) => g.state.p.karma <= -75 },
  { id: 'level_10', name: 'Level 10 Loser', desc: 'Reach level 10.', check: (g) => g.state.p.level >= 10 },
  { id: 'specialist', name: 'Specialist', desc: 'Buy your first perk.', check: (g) => (g.state.p.progress?.perks?.length || 0) >= 1 },
  { id: 'tree_hugger', name: 'Tree Hugger', desc: 'Own every perk in one tree.', check: (g) => {
    const owned = g.state.p.progress?.perks || [];
    return Object.keys(TREES).some((t) => Object.entries(PERKS).filter(([, d]) => d.tree === t).every(([id]) => owned.includes(id)));
  } },
  { id: 'still_breathing', name: 'Still Breathing', desc: 'Survive 30 days in Rotwell.', check: (g) => g.time.day >= 30 },
  { id: 'doomscroller', name: 'Doomscroller', desc: 'Receive 25 texts.', c: 'texts', n: 25 },
  { id: 'piss_cab', name: 'Piss Cab Platinum Member', desc: 'Take 5 taxi rides.', c: 'taxis', n: 5 },
  { id: 'radio_gaga', name: 'Radio Gaga', desc: 'Listen to every station on the car radio.', check: (g) => (g.state.p.progress?.c?.stations || []).length >= 4 },
  { id: 'nap_pro', name: 'Professional Napper', desc: 'Sleep 10 times.', c: 'sleeps', n: 10 },
];

// Panel presentation: an icon per achievement, and how far along the stat-checked ones are.
const ACH_ICON = {
  fist_contact: 'fist', knuckle_dragger: 'fist', concrete_nap: 'skull', frequent_flyer: 'medical', orange_new_stick: 'bars', repeat_offender: 'bars', most_wanted: 'star', ghosted: 'eye',
  pharma: 'pill', kingpin: 'crown', wage_slave: 'work', failing_upward: 'up', thousandaire: 'money', filthy_rich: 'gem', basement: 'x', gamblers_fallacy: 'dice', house_loses: 'slots',
  overeducated: 'school', swipe_right: 'heart', friendzoned: 'x', four_wheels: 'car', insurance_fraud: 'flame', fast_fecal: 'flag', landlord: 'home', body_count: 'skull',
  did_a_thing: 'check', errand_boy: 'list', roll_credits: 'trophy', oceans_eleventy: 'key', gym_rat: 'gym', big_brain: 'bulb', smooth_op: 'smile', literally_jesus: 'church',
  devils_intern: 'flame', level_10: 'star', specialist: 'star', tree_hugger: 'up', still_breathing: 'pulse', doomscroller: 'phone', piss_cab: 'car', radio_gaga: 'music', nap_pro: 'bed',
};
const PROG = {
  most_wanted: (g) => [g.state.p.heat | 0, 5], kingpin: (g) => [g.state.p.totals?.drugsSold || 0, 300], thousandaire: (g) => [Math.floor(g.state.p.money), 1000],
  filthy_rich: (g) => [Math.floor(g.state.p.money + g.state.p.bank), 1e6], gym_rat: (g) => [Math.floor(g.state.p.str), 50], big_brain: (g) => [Math.floor(g.state.p.int), 50],
  smooth_op: (g) => [Math.floor(g.state.p.cha), 50], literally_jesus: (g) => [g.state.p.karma, 75], devils_intern: (g) => [-g.state.p.karma, 75], level_10: (g) => [g.state.p.level, 10],
  still_breathing: (g) => [g.time.day, 30], radio_gaga: (g) => [(g.state.p.progress?.c?.stations || []).length, 4],
};
const fmtShort = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 10000 ? Math.round(n / 1000) + 'k' : String(n));

const BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export function installAchievements(game) {
  const st = game.state;
  const pr = () => ensureProgress(st.p);
  const queue = [];
  let showing = false;

  const api = {
    list: ACHIEVEMENTS,
    has: (id) => !!pr().ach[id],
    count: () => Object.keys(pr().ach).filter((k) => BY_ID[k]).length,
    unlock,
    bump,
    html,
  };
  game.achievements = api;

  function unlock(id) {
    const a = BY_ID[id];
    if (!a || !game.started || pr().ach[id]) return false;
    pr().ach[id] = game.time.day;
    st.changed('progress');
    queue.push(a);
    if (!showing) showNext();
    game.bus.emit('achievement:unlocked', { id, name: a.name });
    return true;
  }

  function showNext() {
    const a = queue.shift();
    if (!a) { showing = false; return; }
    showing = true;
    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.innerHTML = `<div class="ach-icon" style="display:flex;color:var(--energy)">${ic('trophy').replace('class="pr-ico"', 'class="pr-ico" style="width:34px;height:34px"')}</div><div><div class="ach-k">ACHIEVEMENT UNLOCKED</div><div class="ach-n">${esc(a.name)}</div><div class="ach-d">${esc(a.desc)}</div></div>`;
    (document.getElementById('ui-root') || document.body).appendChild(el);
    game.audio?.ui?.('achievement');
    setTimeout(() => { el.classList.add('out'); }, 3800);
    setTimeout(() => { el.remove(); showNext(); }, 4300);
  }

  function bump(key, n = 1) {
    const c = pr().c;
    c[key] = (c[key] || 0) + n;
    for (const a of ACHIEVEMENTS) if (a.c === key && c[key] >= a.n) unlock(a.id);
  }

  // Tile grid: trophy icons, locked ones greyed with a progress bar where we can measure it.
  function html() {
    ensureVx2();
    const got = pr().ach;
    const n = api.count();
    const f = api.filter || 'all';
    const list = ACHIEVEMENTS.filter((a) => f === 'all' || (f === 'got' ? got[a.id] : !got[a.id]));
    const tiles = list.map((a) => {
      const d = got[a.id];
      let prog = '';
      if (!d) {
        let cur = null, max = null;
        if (a.c) { cur = Math.floor(pr().c[a.c] || 0); max = a.n; } else if (PROG[a.id]) { try { [cur, max] = PROG[a.id](game); } catch { cur = null; } }
        if (cur != null && max > 1) prog = `<span class="ax-p">${bar(Math.max(0, Math.min(max, cur)), max)}<span>${fmtShort(Math.max(0, Math.min(max, cur)))}/${fmtShort(max)}</span></span>`;
      }
      return `<div class="ax${d ? ' got' : ''}" title="${esc(a.desc)}"><span class="ax-i">${ic(d ? 'trophy' : ACH_ICON[a.id] || 'trophy')}</span><b>${esc(a.name)}</b><span>${esc(a.desc)}</span>${d ? `<span class="ax-d">Day ${d}</span>` : prog}</div>`;
    }).join('');
    const fb = (k, l) => `<button class="ui-btn ${f === k ? 'on' : ''}" data-af="${k}">${l}</button>`;
    return `<div class="ax-head"><div class="px-pts${n ? ' on' : ''}" style="--toxic:var(--energy)"><b>${n}</b><span>of ${ACHIEVEMENTS.length}<em>unlocked</em></span></div>${bar(n, ACHIEVEMENTS.length)}
        <div class="ax-filter">${fb('all', 'All')}${fb('got', 'Unlocked')}${fb('todo', 'Locked')}</div></div>
      <div class="ax-grid">${tiles || '<div class="vx2-empty">Nothing here.</div>'}</div>`;
  }

  // ---------------------------------------------------------------- event wiring
  const on = (evt, fn) => game.bus.on(evt, (d) => { if (game.started) { try { fn(d || {}); } catch (e) { console.error('[achievements]', evt, e); } } });
  on('brawl:won', () => bump('brawlsWon'));
  on('player:respawned', () => bump('deaths'));
  on('player:arrested', () => { bump('arrests'); hotHeat = false; });
  on('drug:sold', () => bump('drugSales'));
  on('job:worked', () => bump('shifts'));
  on('job:promoted', () => bump('promotions'));
  on('casino:result', ({ amount }) => { if (amount < 0) bump('casinoLost', -amount); if (amount >= 1000) bump('bigWin'); });
  on('course:completed', () => bump('courses'));
  on('date:result', ({ success }) => bump(success ? 'dates' : 'dateFails'));
  on('car:bought', () => bump('carsBought'));
  on('car:destroyed', (d) => { if (!d.remote) bump('carsDestroyed'); });
  on('race:won', () => bump('races'));
  on('home:bought', () => bump('homes'));
  on('home:slept', () => bump('sleeps'));
  on('npc:killed', ({ byPlayer }) => { if (byPlayer) bump('kills'); });
  on('quest:completed', () => bump('quests'));
  on('ending:reached', () => bump('endings'));
  on('heist:completed', () => bump('heists'));
  on('phone:text', () => bump('texts'));
  on('phone:taxi', () => bump('taxis'));
  on('radio:station', ({ id }) => {
    if (!id || id === 'off') return;
    const c = pr().c;
    c.stations = Array.isArray(c.stations) ? c.stations : [];
    if (!c.stations.includes(id)) c.stations.push(id);
  });
  let hotHeat = false;
  on('heat:change', ({ heat, before }) => {
    if (heat >= 3) hotHeat = true;
    if (heat <= 0 && before > 0 && hotHeat) { hotHeat = false; bump('escapes'); }
  });

  let t = 0;
  game.addSystem({
    name: 'achievements',
    update(dt) {
      if (!game.started) return;
      t += dt;
      if (t < 2) return;
      t = 0;
      const got = pr().ach;
      for (const a of ACHIEVEMENTS) {
        if (a.check && !got[a.id]) { try { if (a.check(game)) unlock(a.id); } catch { /* ignore */ } }
      }
    },
  });

  game.ui.sheetSections.push(() => {
    const got = pr().ach;
    const list = ACHIEVEMENTS.filter((a) => got[a.id]);
    ensureVx2();
    return `<div class="pm-sect cs-h vx2-sect">${ic('trophy')}<span>Achievements</span><small>${list.length}/${ACHIEVEMENTS.length} <span class="kb-only">· <kbd>P</kbd></span></small></div>
      <div class="ax-head" style="margin-bottom:6px">${bar(list.length, ACHIEVEMENTS.length)}</div>
      ${list.length ? `<div class="vx2-chip-row">${list.map((a) => chip('trophy', esc(a.name), 'gold', a.desc)).join('')}</div>` : '<div class="cs-empty">Nothing yet. Even your mom is unimpressed.</div>'}`;
  });
  return api;
}
