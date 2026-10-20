// Goals view: what "beating the game" means, the current chapter, every main path's
// readiness, and a short list of suggested next activities for the player's level.
// Rendered as the first tab of the quest log (J) and summarized on the character sheet (Tab).
import { ENDINGS, CHARACTERS } from '../data/quests.js';
import { nextMilestones } from '../progress/milestones.js';
import { esc, fmtMoney } from '../core/util.js';
import { chip, bar } from '../ui/visual.js';
import { ic, sect, tile, ok } from '../ui/visual2.js';

const $ = fmtMoney;
const P = (g) => g.state.p;
const stat = (k, n) => ({ label: `${k.toUpperCase()} ${n}`, ok: (g) => (P(g)[k] ?? 0) >= n, cur: (g) => Math.floor(P(g)[k] ?? 0) });

// The five doors. `reqs` are the big gates along the way (not every step).
export const PATHS = [
  { id: 'main_rats', ending: 'kingpin', door: 'The Gutter', style: 'Muscle & street crime', who: 'sal', where: 'Gutter Rats Clubhouse, Gutterside',
    reqs: [stat('str', 10), stat('str', 30), { label: 'Not a Velvet member', ok: (g) => g.quests.faction() !== 'syndicate' }, { label: '$1,000 bribe (or CHA 40)', ok: (g) => P(g).money >= 1000 || P(g).cha >= 40 }, { label: '$7,500 payoff', ok: (g) => P(g).money >= 7500 }],
    est: 45 },
  { id: 'main_corp', ending: 'corporate', door: 'The Velvet', style: 'Charm, money & betrayal', who: 'vivienne', where: 'Velvet Syndicate lounge, Hilltop',
    reqs: [stat('cha', 15), { label: 'Not a Gutter Rat', ok: (g) => g.quests.faction() !== 'rats' }, { label: 'Win a 4-Rat brawl (STR 20 or a weapon)', ok: (g) => P(g).str >= 20 || (P(g).weapons || []).some((w) => w !== 'fists') || (g.quests.get('main_corp')?.step ?? 0) > 2 || g.quests.isDone('main_corp') }, { label: 'A job promotion', ok: (g) => (P(g).job?.rank ?? 0) >= 1 }, { label: 'Own a home ($3,500+)', ok: (g) => (P(g).ownedHomes?.length || 0) >= 2 }, { label: 'CHA 40 (or win a fight)', ok: (g) => P(g).cha >= 40 }, { label: '$15,000 board seat', ok: (g) => P(g).money >= 15000 }],
    est: 50 },
  { id: 'main_mayor', ending: 'mayor', door: 'The Badge', style: 'Good deeds & speeches', who: 'thorne', where: 'Rotwell PD, Downtown',
    reqs: [{ label: 'No gang membership', ok: (g) => !g.quests.faction() }, stat('karma', 10), stat('karma', 25), stat('cha', 30), { label: '$2,500 filing fee', ok: (g) => P(g).money >= 2500 }, { label: 'Debate: 2 of CHA 30 / INT 25 / Karma 40', ok: (g) => [P(g).cha >= 30, P(g).int >= 25, P(g).karma >= 40].filter(Boolean).length >= 2 }],
    est: 50 },
  { id: 'main_bunker', ending: 'escape', door: 'The Bunker', style: 'Brains & secrets', who: 'reg', where: 'Crusty Reg, Under the Overpass',
    reqs: [stat('int', 20), { label: '$500 (or CHA 25) for a keycard', ok: (g) => P(g).money >= 500 || P(g).cha >= 25 }, { label: 'INT 35 (or someone who knows the door code)', ok: (g) => P(g).int >= 35 || !!g.state.getFlag('pickles_code') }, stat('int', 45), { label: 'Survive a tough fight', ok: (g) => P(g).str >= 25 || (P(g).weapons || []).some((w) => /pistol|revolver|shotgun|smg|rifle/.test(w)) }],
    est: 50 },
  { id: 'main_hobo', ending: 'hobo', door: 'The Crown', style: 'Joke ending: trials of the Crust', who: 'reg', where: 'Crusty Reg, Under the Overpass',
    reqs: [{ label: 'Paid Reg his $20', ok: (g) => !!g.state.getFlag('reg_paid') }, { label: 'Level 6', ok: (g) => P(g).level >= 6 }, { label: 'Win 5 brawls', ok: () => true }, stat('karma', 25)],
    est: 35 },
];

export function pathInfo(g, path) {
  const q = g.quests;
  const def = q.def(path.id);
  const reqs = path.reqs.map((r) => {
    let ok = false; try { ok = !!r.ok(g); } catch { /* ignore */ }
    let cur = null; try { cur = r.cur ? r.cur(g) : null; } catch { /* ignore */ }
    return { label: r.label, ok, cur };
  });
  const endings = g.state.getFlag('endings', []) || [];
  const base = { path, def, reqs, endingDone: endings.includes(path.ending), title: def?.title || path.door };
  if (q.isDone(path.id)) return { ...base, status: 'done' };
  if (q.isActive(path.id)) {
    const s = q.get(path.id);
    const steps = q.steps(path.id);
    return { ...base, status: steps[s.step]?.finale ? 'finale' : 'active', step: s.step + 1, steps: steps.length, next: q.objectiveText(path.id) };
  }
  if (!q.isDone('main_prologue')) return { ...base, status: 'locked', why: 'Finish "Rock Bottom" first.' };
  let ok = true; try { ok = def?.available ? !!def.available(g) : true; } catch { ok = false; }
  if (ok) return { ...base, status: 'available', why: `Talk to ${CHARACTERS[path.who]?.name || path.who} (${path.where}).` };
  let why = ''; try { why = def?.lockedText?.(g) || ''; } catch { /* ignore */ }
  return { ...base, status: 'locked', why: why || 'Not available yet.' };
}

export function chapter(g) {
  const q = g.quests;
  const endings = g.state.getFlag('endings', []) || [];
  const infos = PATHS.map((p) => pathInfo(g, p));
  const fin = infos.find((i) => i.status === 'finale');
  const act = infos.filter((i) => i.status === 'active').sort((a, b) => b.step / b.steps - a.step / a.steps)[0];
  if (q.isActive('main_prologue')) return { n: 1, name: 'Rock Bottom', text: 'Learn how Rotwell works and find out what happened last night.' };
  if (fin) return { n: 4, name: `Finale: ${fin.title}`, text: fin.next, info: fin };
  if (act) return { n: 3, name: act.title, text: `${act.path.door} path, step ${act.step}/${act.steps}.`, info: act };
  if (endings.length) return { n: 5, name: 'Legend of Rotwell', text: `You beat the game (${endings.length}/${Object.keys(ENDINGS).length} endings). Rotwell keeps going. So do you.` };
  return { n: 2, name: 'Five Doors', text: 'Pick a way out of this toilet. Each door below is a main storyline with its own ending.' };
}

// Short, concrete suggestions for what to do right now.
export function suggestions(g) {
  const p = P(g), q = g.quests, out = [];
  const push = (t, why = '') => out.push({ t, why });
  const pts = g.perks?.points?.() || 0;
  if (pts > 0) push(`Spend ${pts} perk point${pts > 1 ? 's' : ''} (press P).`, 'Perks are permanent boosts.');
  const ends = g.state.getFlag('endings', []) || [];
  if (ends.length) {
    const left = PATHS.filter((x) => !ends.includes(x.ending));
    if (left.length) push(`Remaining endings: ${left.map((x) => ENDINGS[x.ending].title).join(', ')}. See "The five doors" below.`, 'Each new ending: +2 perk points.');
    // Post-game: epilogue chapters for the endings you've seen, then the secret one.
    for (const id of ['epi_kingpin', 'epi_corp', 'epi_mayor', 'epi_escape', 'epi_hobo', 'secret_plunger']) {
      const d = q.def(id);
      if (!d || q.get(id)) continue;
      let ok = false; try { ok = !!d.available?.(g); } catch { ok = false; }
      if (ok) push(`${id === 'secret_plunger' ? 'Secret' : 'Epilogue'}: "${d.title}" — talk to ${CHARACTERS[d.giver]?.name || d.giver}.`, id === 'secret_plunger' ? 'Three doors opened. Something is still holding the jar.' : 'What happens after the credits.');
    }
  }
  const tracked = q.trackedId();
  if (tracked) push(`${q.def(tracked)?.title}: ${q.objectiveText(tracked)}`, 'Your tracked quest (gold beacon).');
  if (p.energy < 20) push('You\'re nearly out of energy. Eat something or sleep at home.');
  if (!p.job) push('Get a job: the Greasy Spoon, Scrapper Pete\'s and the Rusty Nail hire anyone.', 'Steady cash + XP every shift.');
  else {
    const c = g.jobs?.current?.();
    const next = c?.def?.ranks?.[c.rank + 1];
    if (next) push(`Work at ${c.def.name}: ${Math.max(0, c.def.ranks[c.rank].shifts - c.shifts)} more shift(s) toward ${next.title} (${$(next.pay)}${c.def.kind === 'delivery' ? '/drop' : '/hr'}).`);
  }
  const h = p.heists || {};
  if (p.level >= 2 && !(h.done && Object.keys(h.done).length)) push('Two-Finger Terry, behind Lucky Larry\'s Pawn (H on the map), is planning a heist.', 'Big money, big XP.');
  if (p.level >= 3 && !p.skate?.unlocked) push('Skidmark Kev near Threads & Dreads (Downtown) wants help. Reward: a skateboard.');
  if (q.isDone('main_prologue') && !q.faction() && p.level >= 3) push('Gangs pay for muscle: Big Sal (STR 10) or the Velvet Contessa (CHA 15). Repeatable jobs.');
  if (!p.progress?.districts?.blackwater && p.level >= 3) push('Cross the drawbridge east to Blackwater Isle: fishing, Funland, smugglers and a prison.');
  if (p.money > 1500 && !p.bank) push('Stash cash at the First Bank. Getting knocked out costs you cash on hand.');
  if ((p.sys?.capacity ?? 20) <= 20 && (p.totals?.drugsSold || 0) > 0) push('Bigger bags carry more product. The Gas-N-Gulp sells a Fanny Pack ($150, 40 units).');
  if (p.int >= 8 && !Object.keys(p.education || {}).length) push('Enroll at Rotwell University (Hilltop): big INT/CHA gains and permanent perks.');
  if (ends.length && q.faction()) push('Your gang blocks some doors. Quitting (at your HQ) means a beat-out brawl, but frees you up.');
  return out.slice(0, 7);
}

// ---------------------------------------------------------------- presentation
const STATUS = {
  done: ['done', 'Ending reached'],
  finale: ['finale', 'Finale'],
  active: ['active', 'In progress'],
  available: ['available', 'Available'],
  locked: ['locked', 'Locked'],
};
const DOOR_ICON = { main_rats: 'skull', main_corp: 'gem', main_mayor: 'badge', main_bunker: 'hatch', main_hobo: 'crown' };
const MILE = {
  str: ['gym', 'var(--g-train)', 'STR'], int: ['bulb', 'var(--g-shop)', 'INT'], cha: ['smile', '#d84a8a', 'CHA'],
  karma: ['scale', 'var(--g-social)', 'Karma'], level: ['star', 'var(--xp)', 'Level'],
};
// suggestion text -> [icon, color]
const SUG_ICON = [
  [/perk point/i, 'star', 'var(--toxic)'], [/^Remaining endings/i, 'trophy', '#e0b23a'], [/^Secret/i, 'eye', '#c080ff'], [/^Epilogue/i, 'book', '#e0b23a'],
  [/energy/i, 'bolt', 'var(--energy)'], [/heist/i, 'money', 'var(--cash)'], [/skateboard/i, 'board', 'var(--g-play)'], [/gang/i, 'skull', 'var(--blood-bright)'],
  [/Blackwater/i, 'anchor', '#60c0ff'], [/bank/i, 'hall', 'var(--cash)'], [/bag/i, 'bag', 'var(--g-shop)'], [/University/i, 'school', 'var(--g-shop)'],
  [/job|Work at/i, 'work', 'var(--g-work)'],
];
function sugIcon(t, tracked) {
  if (tracked) return ['target', '#f2c53d'];
  for (const [re, ic2, col] of SUG_ICON) if (re.test(t)) return [ic2, col];
  return ['flag', 'var(--rust)'];
}

function todoRows(g, list) {
  const q = g.quests;
  const tr = q.trackedId();
  const trTitle = tr ? q.def(tr)?.title : null;
  return `<div class="vx2-rows qx-todo">${list.map((s) => {
    const [ico, col] = sugIcon(s.t, trTitle && s.t.startsWith(trTitle + ':'));
    return `<div class="vx2-row" style="--gc:${col}"><span class="vx2-ibox">${ic(ico)}</span><span class="vx2-rt"><b>${esc(s.t)}</b>${s.why ? `<span>${esc(s.why)}</span>` : ''}</span></div>`;
  }).join('')}</div>`;
}

function endsMeter(g) {
  const ends = g.state.getFlag('endings', []) || [];
  const total = Object.keys(ENDINGS).length;
  return `<div class="qx-ends" title="Endings found"><div class="qx-ends-row">${Object.entries(ENDINGS).map(([id, E]) => `<i class="${ends.includes(id) ? 'on' : ''}" style="--ec:${E.color}" title="${ends.includes(id) ? esc(E.title) : '???'}">${ic(ends.includes(id) ? 'trophy' : 'door')}</i>`).join('')}</div><small>${ends.length}/${total} endings</small></div>`;
}

function heroHtml(g, ch, small = false) {
  const ends = g.state.getFlag('endings', []) || [];
  const goal = ends.length ? 'Rotwell is yours. Now finish the job.' : 'Get out of rock bottom and reach an ending.';
  const sum = ends.length
    ? `You've beaten the game (${ends.length}/${Object.keys(ENDINGS).length} endings). Your stuff, stats and money stay. Every new ending grants +2 perk points.`
    : 'Five doors lead out of this toilet bowl. Finish one storyline\'s FINALE to see the credits; the city keeps going afterwards.';
  return `<div class="qx-hero" title="${esc(sum)}">
    <div class="qx-chap"><small>Ch.</small><b>${ch.n}</b></div>
    <div class="qx-hero-t"><div class="qx-hero-k">${esc(goal)}</div><div class="qx-hero-n">${esc(ch.name)}</div>${small ? '' : `<div class="qx-hero-s">${esc(ch.text || '')}</div>`}</div>
    ${endsMeter(g)}
  </div>`;
}

function doorHtml(g, path) {
  const i = pathInfo(g, path);
  const E = ENDINGS[path.ending];
  const [cls, label] = STATUS[i.status] || STATUS.locked;
  const met = i.reqs.filter((r) => r.ok).length;
  let prog;
  if (i.status === 'done') prog = `${bar(1, 1)}<span>${ic('check')} done</span>`;
  else if (i.step) prog = `${bar(i.step - 1, i.steps)}<span>Step ${i.step}/${i.steps}</span>`;
  else prog = `${bar(met, i.reqs.length)}<span>${met}/${i.reqs.length} ready</span>`;
  const mapBtn = i.status === 'active' || i.status === 'finale'
    ? `<button class="ui-btn vx2-btn" data-mapq="${path.id}">${ic('pin')}<span>Show on map</span></button>`
    : i.status === 'available' ? `<button class="ui-btn vx2-btn" data-mapc="${path.who}">${ic('pin')}<span>Find ${esc(CHARACTERS[path.who]?.name?.split(' ').slice(-1)[0] || 'them')}</span></button>` : '';
  return `<div class="qx-door ${cls}" style="--dc:${E.color}">
    <div class="qx-dh"><span class="vx2-ibox">${ic(DOOR_ICON[path.id] || 'door')}</span><span class="qx-dn"><b>${esc(path.door)}</b><span>${esc(path.style)}</span></span></div>
    <div class="qx-dq">${esc(i.title)} <em>→</em> ${esc(E.title)}${i.endingDone && i.status !== 'done' ? ` ${chip('trophy', 'seen', 'muted')}` : ''}</div>
    <div class="qx-dp"><span class="qx-st ${cls}">${label}</span>${prog}</div>
    ${i.next ? `<div class="qx-dx">${ic('flag')}<span>${esc(i.next)}</span></div>` : i.why && i.status !== 'done' ? `<div class="qx-dx why" title="${esc(i.why)}">${ic(i.status === 'available' ? 'talk' : 'lock')}<span>${esc(i.why)}</span></div>` : ''}
    ${i.status === 'done' ? '' : `<div class="pm-chips">${i.reqs.map((r) => ok(esc(r.label) + (r.cur != null && !r.ok ? ` <small>(${r.cur})</small>` : ''), r.ok)).join('')}${chip('clock', `~${path.est} min`, 'muted', 'once started')}</div>`}
    ${mapBtn ? `<div class="qx-btns">${mapBtn}</div>` : ''}
  </div>`;
}

export function goalsHtml(g) {
  const p = P(g);
  const ch = chapter(g);
  let html = heroHtml(g, ch);
  const sug = suggestions(g).slice(0, 5);
  html += sect('flag', 'Do this next');
  html += sug.length ? todoRows(g, sug) : `<div class="vx2-empty">Go cause trouble.</div>`;

  html += sect('door', 'The five doors', 'each one is a storyline with its own ending');
  html += `<div class="qx-doors">${PATHS.map((path) => doorHtml(g, path)).join('')}</div>`;

  html += sect('up', 'Next milestones');
  let miles = '';
  for (const k of ['str', 'int', 'cha', 'karma', 'level']) {
    const nx = nextMilestones(g, k, 1)[0];
    if (!nx) continue;
    const cur = k === 'level' ? p.level : Math.floor(p[k]);
    const [ico, col, lbl] = MILE[k];
    const more = nx.texts.length > 1 ? ` <b>+${nx.texts.length - 1}</b>` : '';
    miles += tile({ icon: ico, color: col, value: `${lbl} ${nx.at}`, label: `now ${cur}`, sub: esc(nx.texts[0]) + more, bar: [Math.max(0, cur), nx.at], title: nx.texts.join(' · ') });
  }
  html += `<div class="qx-miles">${miles}</div>`;
  const ach = g.achievements;
  if (ach?.list && ach.count) {
    try {
      const n = ach.count();
      html += `<div class="qx-note">${ic('trophy')}<span>Achievements: <b>${n}/${ach.list.length}</b> · full list on <kbd>P</kbd></span></div>`;
    } catch { /* ignore */ }
  }
  return html;
}

// Compact block for the character sheet.
export function goalsSheetHtml(g) {
  const ch = chapter(g);
  const sug = suggestions(g).slice(0, 3);
  return `${sect('flag', 'Goals', '<span class="kb-only"><kbd>J</kbd> full list</span>')}${heroHtml(g, ch, true)}${sug.length ? `<div style="margin-top:5px">${todoRows(g, sug)}</div>` : ''}`;
}
