// Goals view: what "beating the game" means, the current chapter, every main path's
// readiness, and a short list of suggested next activities for the player's level.
// Rendered as the first tab of the quest log (J) and summarized on the character sheet (Tab).
import { ENDINGS, CHARACTERS } from '../data/quests.js';
import { nextMilestones } from '../progress/milestones.js';
import { esc, fmtMoney } from '../core/util.js';

const $ = fmtMoney;
const P = (g) => g.state.p;
const stat = (k, n) => ({ label: `${k.toUpperCase()} ${n}`, ok: (g) => (P(g)[k] ?? 0) >= n, cur: (g) => Math.floor(P(g)[k] ?? 0) });

// The five doors. `reqs` are the big gates along the way (not every step).
export const PATHS = [
  { id: 'main_rats', ending: 'kingpin', door: 'The Gutter', style: 'Muscle & street crime', who: 'sal', where: 'Gutter Rats Clubhouse, Gutterside',
    reqs: [stat('str', 10), stat('str', 30), { label: 'Not a Velvet member', ok: (g) => g.quests.faction() !== 'syndicate' }, { label: '$1,000 bribe (or CHA 40)', ok: (g) => P(g).money >= 1000 || P(g).cha >= 40 }, { label: '$7,500 payoff', ok: (g) => P(g).money >= 7500 }],
    est: 45 },
  { id: 'main_corp', ending: 'corporate', door: 'The Velvet', style: 'Charm, money & betrayal', who: 'vivienne', where: 'Velvet Syndicate lounge, Hilltop',
    reqs: [stat('cha', 15), { label: 'Not a Gutter Rat', ok: (g) => g.quests.faction() !== 'rats' }, { label: 'A job promotion', ok: (g) => (P(g).job?.rank ?? 0) >= 1 }, { label: 'Own a home ($3,500+)', ok: (g) => (P(g).ownedHomes?.length || 0) >= 2 }, { label: 'CHA 40 (or win a fight)', ok: (g) => P(g).cha >= 40 }, { label: '$15,000 board seat', ok: (g) => P(g).money >= 15000 }],
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

const STATUS = {
  done: '<b style="color:#8fbf4a">ENDING REACHED</b>',
  finale: '<b style="color:#f2c53d">FINALE</b>',
  active: '<b style="color:#e0b23a">IN PROGRESS</b>',
  available: '<b style="color:#4fc3d9">AVAILABLE</b>',
  locked: '<span class="ui-muted">LOCKED</span>',
};

export function goalsHtml(g) {
  const p = P(g);
  const ch = chapter(g);
  const ends = g.state.getFlag('endings', []) || [];
  const total = Object.keys(ENDINGS).length;
  let html = `<div class="q-goal-main"><div class="q-kind">Main goal</div>
    <h3>${ends.length ? 'Rotwell is yours. Now finish the job.' : 'Get out of rock bottom and reach an ending.'}</h3>
    <div class="q-sum">${ends.length
    ? `You've beaten the game (${ends.length}/${total} endings). Your stuff, stats and money stay. Every new ending grants +2 perk points.`
    : 'Five doors lead out of this toilet bowl. Finish one storyline\'s FINALE to see the credits; the city keeps going afterwards.'}</div>
    <div class="q-obj"><b>Chapter ${ch.n}: ${esc(ch.name)}</b> · ${esc(ch.text || '')}</div></div>`;

  html += '<div class="ui-section">Do this next</div>';
  html += suggestions(g).map((s) => `<div class="q-lead">▸ ${esc(s.t)}${s.why ? ` <span class="ui-muted">${esc(s.why)}</span>` : ''}</div>`).join('') || '<div class="ui-muted">Go cause trouble.</div>';

  html += '<div class="ui-section">The five doors</div>';
  for (const path of PATHS) {
    const i = pathInfo(g, path);
    const E = ENDINGS[path.ending];
    html += `<div class="q-card q-path" style="border-left-color:${E.color}">
      <div class="q-kind">${esc(path.door)} · ${esc(path.style)} · ${STATUS[i.status] || ''}${i.endingDone && i.status !== 'done' ? ' · ending seen' : ''}</div>
      <h3 style="color:${E.color}">${esc(i.title)} <span class="ui-muted" style="font-size:15px">→ ${esc(E.title)}</span></h3>
      ${i.next ? `<div class="q-obj"><b>▸</b> Step ${i.step}/${i.steps}: ${esc(i.next)}</div>` : i.why ? `<div class="q-sum">${esc(i.why)}</div>` : ''}
      ${i.status === 'done' ? '' : `<div class="q-reqs">${i.reqs.map((r) => `<span class="sys-req ${r.ok ? 'ok' : 'no'}">${esc(r.label)}${r.cur != null && !r.ok ? ` (${r.cur})` : ''}</span>`).join(' ')}</div>
      <div class="ui-muted" style="font-size:13px">About ${path.est} min once started.</div>`}
    </div>`;
  }

  html += '<div class="ui-section">Next milestones</div>';
  for (const k of ['str', 'int', 'cha', 'karma', 'level']) {
    const nx = nextMilestones(g, k, 1)[0];
    if (!nx) continue;
    const cur = k === 'level' ? p.level : Math.floor(p[k]);
    html += `<div class="q-lead"><b>${k === 'level' ? 'LV' : k.toUpperCase()} ${nx.at}</b> <span class="ui-muted">(now ${cur})</span>: ${esc(nx.texts.slice(0, 2).join(' · '))}${nx.texts.length > 2 ? ` <span class="ui-muted">+${nx.texts.length - 2} more</span>` : ''}</div>`;
  }
  const ach = g.achievements;
  if (ach?.list && ach.count) {
    try { html += `<div class="q-lead" style="margin-top:6px">Achievements: <b>${ach.count()}/${ach.list.length}</b> <span class="ui-muted">(P)</span></div>`; } catch { /* ignore */ }
  }
  return html;
}

// Compact block for the character sheet.
export function goalsSheetHtml(g) {
  const ch = chapter(g);
  const ends = g.state.getFlag('endings', []) || [];
  const sug = suggestions(g).slice(0, 3);
  return `<div class="ui-section">Goals <span class="ui-muted" style="font-size:14px">(J → Goals)</span></div>
    <div class="q-lead"><b>Chapter ${ch.n}: ${esc(ch.name)}</b>${ends.length ? ` · ${ends.length}/${Object.keys(ENDINGS).length} endings` : ''}</div>
    ${sug.map((s) => `<div class="q-lead">▸ ${esc(s.t)}</div>`).join('')}`;
}
