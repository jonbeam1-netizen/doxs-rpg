// First-time hints ("coach"). One short tip at a time, in the right HUD column under the quest
// tracker (toasts stack below it). A tip shows up when it's relevant (you start walking, a fight
// starts, you get heat...), goes away once you've done the thing or after a few seconds, and never
// comes back in this browser. Text follows the device you're on: keys, touch buttons or a controller.
//
// It replaces the old timed tutorial toasts (data/quests.js TUTORIAL, emptied here) and the one-shot
// "Fighting: ..." wall of keys (npc/combat.js, skipped via its 'combat_tips' flag).
// Pause menu: "Tutorial hints: On/Off" (turning it back on replays them).
import { TUTORIAL } from '../data/quests.js';
import { inputMode } from './howto.js';

const STORE = 'doxsrpg_coach';
const K = (...keys) => keys.map((k) => `<kbd>${k}</kbd>`).join('');
const GAP = 3.5; // seconds between two tips

// when(c) -> show now? · done(c) -> the player did it (tip leaves) · ttl: seconds on screen (paused
// while a menu is open) · urgent: may cut in front of a calmer tip.
const TIPS = [
  {
    id: 'move', ttl: 40,
    when: (c) => c.g.state.getFlag('intro_done') && c.t > 1,
    text: {
      kb: `${K('W', 'A', 'S', 'D')} walk · ${K('Shift')} run · <b>mouse</b> looks around (click the game to grab it)`,
      touch: '<b>Left thumb</b> walks. <b>Right thumb</b> looks around.',
      pad: '<b>Left stick</b> walks. <b>Right stick</b> looks around.',
    },
    done: (c) => c.walked > 8,
  },
  {
    id: 'beacon', ttl: 16,
    when: (c) => c.seen.has('move') && !c.count('npc:talk') && !!c.tracker(),
    text: {
      kb: `Follow the <b class="coach-gold">gold beacon</b> (★ on the minimap). ${K('J')} opens your quests.`,
      touch: 'Follow the <b class="coach-gold">gold beacon</b> (★ on the minimap). Quests live under <b>•••</b>.',
      pad: 'Follow the <b class="coach-gold">gold beacon</b> (★ on the minimap).',
    },
    done: (c) => c.since('npc:talk') > 0,
  },
  {
    id: 'travel', ttl: 14,
    when: (c) => /downtown|hilltop|dustbowl|city hall/i.test(c.tracker()) && !c.g.player?.vehicle,
    text: {
      kb: `Long walk? ${K('F')} next to any car to borrow it. Permanently. ${K('M')} is the map.`,
      touch: 'Long walk? Tap <b>Car</b> next to any car to borrow it. Permanently.',
      pad: 'Long walk? <b>Y</b> next to any car to borrow it. Permanently.',
    },
    done: (c) => c.since('car:entered') > 0,
  },
  {
    id: 'fight', ttl: 13, urgent: true,
    when: (c) => c.hostileNear(),
    text: {
      kb: `<b>Click</b> punch (hold = haymaker) · <b>right-click</b> kick · ${K('C')} block · ${K('Z')} roll`,
      touch: '<b>Attack</b> punches (hold it for a haymaker). Kick, block and roll are under <b>•••</b>.',
      pad: '<b>RT</b> punch (hold = haymaker) · <b>B</b> kick · <b>LB</b> block · <b>LT</b> lock on',
    },
    done: (c) => c.since('brawl:won') + c.since('brawl:lost') + c.since('npc:killed') > 0,
  },
  {
    id: 'heat', ttl: 11, urgent: true,
    when: (c) => (c.p.heat | 0) > 0,
    text: { all: '<b class="coach-red">★ Heat.</b> The cops want a word. Break line of sight to cool off, or pay it off at the PD.' },
    done: (c) => (c.p.heat | 0) === 0,
  },
  {
    id: 'energy', ttl: 12,
    when: (c) => c.p.maxEnergy > 0 && c.p.energy < c.p.maxEnergy * 0.25,
    text: { all: 'Running on fumes. Eat something, or sleep it off at home (your motel door).' },
    done: (c) => c.p.energy > c.p.maxEnergy * 0.5,
  },
  {
    id: 'sheet', ttl: 10,
    when: (c) => c.count('job:worked') > 0 && c.idle > 2,
    text: {
      kb: `Payday. ${K('Tab')} shows your stats, ${K('I')} your bag, ${K('O')} your phone.`,
      touch: 'Payday. Stats, bag and phone are under <b>•••</b>.',
      pad: 'Payday. <b>Select</b> shows your stats, the <b>D-pad</b> opens phone and bag.',
    },
    done: () => false,
  },
];

export function installCoach(game) {
  const ui = game.ui;
  let store = { on: true, seen: [] };
  try { store = { ...store, ...(JSON.parse(localStorage.getItem(STORE) || '{}') || {}) }; } catch { /* ignore */ }
  // Test sessions (?dev) stay quiet unless asked for (?coach). Not saved.
  if (game.devMode && !new URLSearchParams(location.search).has('coach')) store.on = false;
  const seen = new Set(Array.isArray(store.seen) ? store.seen : []);
  const quiet = !store.on && game.devMode;
  const save = () => { if (quiet && !store.on) return; try { localStorage.setItem(STORE, JSON.stringify({ on: store.on, seen: [...seen] })); } catch { /* ignore */ } };

  // The coach is the tutorial now: no timed toast parade.
  try { TUTORIAL.length = 0; } catch { /* ignore */ }

  const el = document.createElement('div');
  el.id = 'coach';
  el.className = 'hidden';
  el.innerHTML = '<span class="coach-k">TIP</span><span class="coach-t"></span>';
  (document.getElementById('hud') || document.body).appendChild(el);
  const textEl = el.querySelector('.coach-t');

  // event counters (done() checks compare against the count when the tip appeared)
  const counts = new Map();
  for (const e of ['npc:talk', 'car:entered', 'brawl:won', 'brawl:lost', 'npc:killed', 'job:worked']) {
    game.bus.on(e, () => { counts.set(e, (counts.get(e) || 0) + 1); });
  }

  let cur = null;        // { tip, left, snap }
  let gap = 0, t = 0, idle = 0, walked = 0, last = null, poll = 0;

  const ctx = {
    g: game,
    get p() { return game.state.p; },
    get t() { return t; },
    get walked() { return walked; },
    get idle() { return idle; },
    seen,
    count: (e) => counts.get(e) || 0,
    since: (e) => (counts.get(e) || 0) - (cur?.snap?.get(e) || 0),
    tracker: () => document.getElementById('q-tracker')?.textContent || '',
    hostileNear() {
      try {
        const pp = game.player.pos;
        return !!game.npcs?.near?.(pp.x, pp.z, 12)?.some((n) => n.hostile && !n.dead);
      } catch { return false; }
    },
  };

  function textFor(tip) {
    const m = inputMode(game);
    return tip.text.all || tip.text[m] || tip.text.kb;
  }

  function show(tip) {
    cur = { tip, left: tip.ttl, snap: new Map(counts) };
    seen.add(tip.id); save();
    textEl.innerHTML = textFor(tip);
    el.classList.remove('hidden', 'out');
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  }

  function hide() {
    if (!cur) return;
    cur = null; gap = GAP;
    el.classList.add('out');
    setTimeout(() => { if (!cur) el.classList.add('hidden'); }, 350);
  }

  function blocked() {
    return !game.started || ui.isBlocking() || ui.photoMode || game.present?.active || game.player?.dead;
  }

  game.addSystem({
    name: 'coach',
    update(dt) {
      if (!store.on || !game.started) return;
      t += dt;
      const pos = game.player?.pos;
      if (pos) {
        if (last && !game.player.vehicle) { const d = Math.hypot(pos.x - last.x, pos.z - last.z); if (d < 3) walked += d; }
        last = { x: pos.x, z: pos.z };
      }
      const isBlocked = blocked();
      idle = isBlocked ? 0 : idle + dt;
      el.classList.toggle('paused', !!(cur && isBlocked));
      if (cur) {
        if (!isBlocked) cur.left -= dt;
        let finished = false;
        try { finished = cur.tip.done(ctx); } catch { /* ignore */ }
        if (finished || cur.left <= 0) { hide(); return; }
      } else if (gap > 0) { gap -= dt; }
      poll -= dt;
      if (poll > 0 || isBlocked) return;
      poll = 0.25;
      for (const tip of TIPS) {
        if (seen.has(tip.id)) continue;
        if (cur && (!tip.urgent || cur.tip.urgent || cur.tip === tip)) continue;
        if (!tip.urgent && ((!cur && gap > 0) || idle < 1.2)) continue; // let the screen settle after menus / cutscenes
        let ok = false;
        try { ok = tip.when(ctx) && !tip.done(ctx); } catch { ok = false; }
        if (!ok) continue;
        if (cur) { cur = null; }
        show(tip);
        break;
      }
    },
  });

  game.bus.on('game:start', ({ isNew } = {}) => {
    t = 0; walked = 0; last = null; idle = 0;
    if (cur) hide();
    // Loading an older save: you know how to walk.
    if (!isNew) { seen.add('move'); seen.add('beacon'); if ((game.state.p.level || 1) >= 3) TIPS.forEach((x) => seen.add(x.id)); save(); }
    if (store.on) game.state.setFlag('combat_tips', true);
  });

  ui.menuButtons.push({
    get label() { return `Tutorial hints: ${store.on ? 'On' : 'Off'}`; },
    get hint() { return store.on ? '' : 'turning on replays them'; },
    onClick: () => {
      store.on = !store.on;
      if (store.on) { seen.clear(); gap = 1.5; } else hide();
      save();
      ui.toast(store.on ? 'Tutorial hints on. They\'ll pop up as you go.' : 'Tutorial hints off. You\'re on your own, champ.', 'info', 2200);
    },
  });

  game.coach = {
    get on() { return store.on; },
    reset() { seen.clear(); save(); },
    _tips: TIPS,
  };
}
