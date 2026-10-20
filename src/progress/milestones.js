// Milestones: "New at 25 STR: ..." unlock toasts, level-up bonuses, and small XP sources
// that make everything feel like progress (discovering places/districts, skate tricks).
//
// Persistent data (inside state.p.progress): seen {locId:1}, districts {id:1}, skateXp {day, n}
// Exports buildMilestones() / nextMilestones(game, key, n) for the Goals view (src/quests/goals.js).
import { JOBS } from '../data/jobs.js';
import { COURSES } from '../data/courses.js';
import { WEAPONS } from '../data/weapons.js';
import { PERKS } from './perks.js';
import { esc } from '../core/util.js';

const LABEL = { str: 'STR', int: 'INT', cha: 'CHA', karma: 'KARMA', level: 'LEVEL' };
const STAT_KEYS = ['str', 'int', 'cha', 'karma'];

// Hand-written unlocks that live in quest/system logic rather than data tables.
const MANUAL = {
  str: [
    [10, 'Big Sal will let you join the Gutter Rats'],
    [15, 'Sparring in the ring at Iron Lung Gym'],
    [30, 'Big Sal trusts you with the casino job (Rats path)'],
  ],
  int: [
    [20, 'Prof. Fumble can decode your note (Bunker path)'],
    [25, 'Night-school study group at the Library'],
    [35, 'Crack the Grimco keycard (Bunker path) · stage a board-room coup (Velvet path)'],
    [40, 'Tutor freshmen for cash at Rotwell U'],
    [50, 'Operate the Lid Control Terminal (Bunker finale)'],
  ],
  cha: [
    [15, 'The Velvet Contessa will take you into the Syndicate'],
    [25, 'Sweet-talk Mopsy out of his keycard (Bunker path)'],
    [30, 'Run for mayor and survive the debate (Thorne path)'],
    [40, 'Charm Dolores the croupier · talk the Contessa into retiring'],
  ],
  karma: [
    [10, 'Det. Thorne will work with you (Mayor path)'],
    [25, 'Clean enough to campaign · Reg\'s Trial of Charity'],
    [40, 'Win the mayoral debate on reputation alone'],
  ],
  level: [
    [2, 'Two-Finger Terry\'s first heist (behind Lucky Larry\'s)'],
    [3, 'Skidmark Kev\'s skateboard quest · the Armored Truck heist'],
    [4, 'Crusty Reg considers you for his crown (Hobo path)'],
    [5, 'The First Bank heist'],
  ],
};

let cache = null;
export function buildMilestones() {
  if (cache) return cache;
  const out = { str: [], int: [], cha: [], karma: [], level: [] };
  const add = (k, at, text) => { if (out[k] && at > 0) out[k].push({ at, text }); };
  for (const [k, list] of Object.entries(MANUAL)) for (const [at, text] of list) add(k, at, text);
  for (const j of Object.values(JOBS)) {
    j.ranks.forEach((r, i) => {
      const req = r.req || {};
      const keys = STAT_KEYS.filter((k) => req[k] != null);
      for (const k of keys) {
        const others = keys.filter((o) => o !== k).map((o) => `${LABEL[o]} ${req[o]}`);
        if (req.course) others.push(`${COURSES[req.course]?.short || req.course} degree`);
        add(k, req[k], `${i === 0 ? 'Hired as' : 'Promotion to'} ${r.title} at ${j.name}${others.length ? ` (also ${others.join(', ')})` : ''}`);
      }
    });
  }
  for (const c of Object.values(COURSES)) for (const k of ['int', 'cha']) if (c.req?.[k]) add(k, c.req[k], `Enroll in ${c.short} at Rotwell U`);
  for (const w of Object.values(WEAPONS)) if (w.reqStr) add('str', w.reqStr, `Swing the ${w.name} at full power`);
  for (const p of Object.values(PERKS)) if (p.lvl) add('level', p.lvl, `Perk: ${p.name}`);
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.at - b.at);
  cache = out;
  return out;
}

// The next `n` distinct thresholds above the current value: [{ at, texts[] }]
export function nextMilestones(game, key, n = 1) {
  const p = game.state.p;
  const cur = key === 'level' ? p.level : Math.floor(p[key] ?? 0);
  const res = [];
  for (const m of buildMilestones()[key] || []) {
    if (m.at <= cur) continue;
    let slot = res.find((r) => r.at === m.at);
    if (!slot) { if (res.length >= n) break; slot = { at: m.at, texts: [] }; res.push(slot); }
    slot.texts.push(m.text);
  }
  return res;
}

export function installMilestones(game) {
  const st = game.state;
  const pr = () => {
    const p = st.p;
    p.progress ??= {};
    const g = p.progress;
    g.seen ??= {}; g.districts ??= {};
    return g;
  };

  function announce(key, before, after) {
    const hits = (buildMilestones()[key] || []).filter((m) => m.at > before && m.at <= after);
    if (!hits.length) return;
    const at = hits[hits.length - 1].at;
    const lines = hits.map((m) => m.text);
    const shown = lines.slice(0, 3).map(esc).join('<br>· ');
    game.ui.toast(`<b>NEW AT ${LABEL[key]} ${at}:</b><br>· ${shown}${lines.length > 3 ? `<br><span class="ui-muted">+${lines.length - 3} more in the Goals tab (J)</span>` : ''}`, 'good', 6500);
  }

  // stat thresholds (permanent gains only: temp buffs don't fire stat:gain)
  game.bus.on('stat:gain', ({ stat, amount }) => {
    if (!game.started || !STAT_KEYS.includes(stat) || !(amount > 0)) return;
    const after = Math.floor(st.p[stat]);
    const before = Math.floor(st.p[stat] - amount);
    if (after > before) announce(stat, before, after);
  });

  // ---------------------------------------------------------------- level-ups that matter
  game.bus.on('player:levelup', ({ level }) => {
    if (!game.started) return;
    const p = st.p;
    for (const k of ['str', 'int', 'cha']) {
      p[k] = Math.round((p[k] + 1) * 10) / 10;
      st.changed(k);
      game.bus.emit('stat:gain', { stat: k, amount: 1, source: 'levelup' });
    }
    p.energy = p.maxEnergy;
    st.changed('energy');
    game.ui.bigText(`LEVEL ${level}`, '+10 max HP · +2 max energy · +1 STR / INT / CHA · full energy · +1 perk point (P)', 3200);
    setTimeout(() => announce('level', level - 1, level), 900);
  });

  // ---------------------------------------------------------------- discovery XP
  game.bus.on('location:enter', (loc) => {
    if (!game.started || !loc?.id || !game.locations.get(loc.id)) return;
    const g = pr();
    if (g.seen[loc.id]) return;
    g.seen[loc.id] = 1;
    st.addXP(20);
    game.ui.toast(`Discovered: <b>${esc(loc.name || loc.id)}</b> <span class="ui-good">+20 XP</span>`, 'stat', 2200);
  });

  let distT = 0;
  game.addSystem({
    name: 'milestones-districts',
    update(dt) {
      distT += dt;
      if (distT < 1.5 || !game.started || !game.player || !game.world?.districtAt) return;
      distT = 0;
      try {
        const pos = (game.player.vehicle?.group || game.player.group).position;
        const d = game.world.districtAt(pos.x, pos.z);
        const g = pr();
        if (!d || g.districts[d]) return;
        const first = !Object.keys(g.districts).length;
        g.districts[d] = 1;
        if (first) return; // the starting district is free
        st.addXP(50);
        const names = { downtown: 'Downtown Rotwell', hilltop: 'Hilltop Heights', rustyards: 'The Rustyards', gutterside: 'Gutterside', dustbowl: 'The Dustbowl', blackwater: 'Blackwater Isle' };
        game.ui.toast(`New district: <b>${esc(names[d] || d)}</b> <span class="ui-good">+50 XP</span>`, 'stat', 3000);
      } catch { /* ignore */ }
    },
  });

  // ---------------------------------------------------------------- skate tricks (capped per day)
  let trickBank = 0;
  game.bus.on('skate:trick', ({ score } = {}) => {
    const g = pr();
    const day = game.time.day;
    if (!g.skateXp || g.skateXp.day !== day) g.skateXp = { day, n: 0 };
    if (g.skateXp.n >= 150) return;
    trickBank += (Number(score) || 0) / 20;
    const xp = Math.floor(trickBank);
    if (xp < 1) return;
    trickBank -= xp;
    const give = Math.min(xp, 150 - g.skateXp.n);
    g.skateXp.n += give;
    st.addXP(give);
  });
}
