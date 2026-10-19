// BLACKWATER ISLE — gameplay for the island district (geometry lives in src/world/island*.js).
//
// Location types handled: isle_arcade isle_seafood isle_pier isle_lighthouse isle_cove isle_prison
// (the island home 'driftwood_shack' uses the systems module's 'home' type).
// Also: bridge toll, ferry (Rustyards pier z=-170 <-> island ferry pier), prison gate, island locals,
// foghorn/gulls/waves, island item specials (lockbox, bottle, mystery box, golden ticket).
//
// Sets game.island = { foghorn(vol), gull(), ferry(to), tollStop(), fishPrice(id), state() }
// Events emitted: island:fish {id}, island:fish-sold {id, qty, price}, island:prize {id}, island:fenced {id, qty},
//   island:smuggle {ok, inmate, pay}, island:ferry {to}, island:special {id}
// Persistent state: game.state.p.island (see common.js isle()).
import { pick, randInt, chance } from '../core/util.js';
import { BOTTLE_NOTES } from './data.js';
import { isle, $, sfx } from './common.js';
import { installArcade } from './arcade.js';
import { installFishing } from './fishing.js';
import { installPlaces } from './places.js';
import { installTravel } from './travel.js';
import { installAmbience } from './ambience.js';

export async function installIsland(game) {
  const parts = {};
  for (const [k, fn] of [['arcade', installArcade], ['fishing', installFishing], ['places', installPlaces], ['travel', installTravel], ['ambience', installAmbience]]) {
    try { parts[k] = fn(game); } catch (e) { console.error(`[island] ${k} failed to install`, e); }
  }

  // item "specials" for island items (the systems module consumes the item, we add the payoff)
  const SPECIALS = {
    isle_lockbox() {
      const r = Math.random();
      if (r < 0.5) { const n = randInt(40, 260); game.state.addMoney(n, 'lockbox'); return `You pry it open. Inside: ${$(n)} in soggy bills and a single dentures.`; }
      if (r < 0.8) { const it = pick(['gold_tooth', 'junk_watch', 'necklace', 'cigar']); game.state.addItem(it, 1); return `You pry it open. Inside: ${game.items?.name?.(it) ?? it}. And a smell that will follow you for days.`; }
      if (r < 0.95) return 'You pry it open. It\'s full of sand and a note that says "HA".';
      const n = randInt(800, 1600); game.state.addMoney(n, 'lockbox'); return `JACKPOT. Gold coins! Pirate gold! Probably chocolate— no, real! ${$(n)}!`;
    },
    isle_bottle() {
      if (chance(0.2)) { const n = randInt(20, 120); game.state.addMoney(n, 'bottle'); return `"${pick(BOTTLE_NOTES)}"<br><br>Also rolled up inside: ${$(n)}.`; }
      return `"${pick(BOTTLE_NOTES)}"`;
    },
    isle_mystery() {
      const r = Math.random();
      if (r < 0.3) { game.state.addItem('rolex', 1); return 'Inside: a REAL Rolex. Probably. It\'s ticking. Watches tick. Right?'; }
      if (r < 0.55) { const n = randInt(500, 1500); game.state.addMoney(n, 'mystery'); return `Inside: ${$(n)} and a Funland coupon for "1 FREE RIDE (VOID)".`; }
      if (r < 0.8) { game.state.addItem('cologne', 2); game.state.addItem('champagne', 1); return 'Inside: two bottles of Musk of the Wild Boar and some Fancy Bubbles. Funland knew you.'; }
      game.state.addStat('cha', 1.5, 'mystery'); return 'Inside: a mirror with "YOU\'RE DOING GREAT" written on it in lipstick. You feel weirdly better. +Charm.';
    },
    isle_golden() {
      const n = 25000;
      game.state.addMoney(n, 'golden ticket');
      game.state.addStat('karma', 3);
      game.state.setFlag('isle_golden', true);
      setTimeout(() => game.ui.bigText('GOLDEN TICKET', 'Funland pays out. The Ferris wheel lights up for one second.', 4000), 50);
      return `You hold up the Golden Ticket. Every machine in Funland lights up at once, then dies. Dottie, at the counter, quietly cries. A voice on the dead PA: "Hee. Congratulations." An envelope slides out of the change machine: <b>${$(n)}</b>.`;
    },
  };
  game.bus.on('item:used', ({ id }) => {
    const f = SPECIALS[id];
    if (!f) return;
    try {
      const html = f();
      sfx(game, 'coin');
      game.ui.dialog({ title: game.items?.name?.(id) ?? id, html, options: [{ label: 'OK' }] });
      game.bus.emit('island:special', { id });
    } catch (e) { console.error('[island] special', id, e); }
  });

  // character sheet: island stats
  try {
    game.ui.sheetSections?.push?.((g) => {
      const s = isle(g);
      const fish = Object.values(s.caught).reduce((a, b) => a + b, 0);
      if (!fish && !s.ticketsTotal && !Object.keys(s.inmates).length) return '';
      return `<div class="ui-section">Blackwater Isle</div><div class="ui-muted">Fish caught: ${fish}${s.rustjaw ? ' · <b>Old Rustjaw landed</b>' : ''} · Arcade tickets: ${s.tickets} (${s.ticketsTotal} lifetime)</div>`;
    });
  } catch { /* optional */ }

  game.island = {
    foghorn: (v) => parts.ambience?.foghorn(v),
    gull: () => parts.ambience?.gull(),
    ferry: (to) => parts.travel?.ferry(to),
    tollStop: () => parts.travel?.tollStop(),
    fishPrice: (id) => parts.places?.fishPrice(id),
    state: () => isle(game),
    parts,
  };
  game.bus.on('state:reset', () => isle(game));
}
