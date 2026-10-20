// SYSTEMS / ECONOMY — every menu-driven building in Rotwell, plus items, drugs, jobs, money.
//
// Sets: game.items, game.market, game.jobs   (DESIGN.md contracts)
// Extras (for other modules / debugging): game.sysFx (effects), game.sysDelivery, game.sysNews,
//   game.sysDating, game.sysShops, game.sysSfx, game.sysCapacity()
//
// Location types handled: home bar gym bank hospital police store pizza gun_shop clothing library
//   university casino nightclub office church factory fight_club junkyard diner liquor tattoo fortune pawn gas dealer
//
// Events emitted: job:hired / job:worked / job:promoted {jobId, rank, pay}, item:bought / item:used {id, qty},
//   drug:bought / drug:sold {drugId, qty, price, district}, drug:used {drugId}, home:bought / home:slept {id},
//   casino:result {game, amount}, course:completed {courseId}, date:result {success, npc}, look:change (look),
//   minigame:result {id, grade ('F'..'S' | 'AUTO'), score, skipped, newBest, context}
//
// Minigames (src/systems/minigame.js + mg/*.js): game.minigames.run(id, opts) wraps job shifts, gym, library,
//   classes and the dance floor in 15-45s skill games (always skippable at 80%). p.mg = { best, top, plays, sGrades }.
//
// ---------------------------------------------------------------------------------------------
// Persistent state added under game.state.p (all plain JSON):
//   p.job = { id, rank, shifts }                     current job (core key)
//   p.careers[jobId] = { rank, shifts, total }      job history (keeps rank when you return)
//   p.education[courseId] = { sessions, lastDay, done }
//   p.stash[homeId] = { money, items:{}, drugs:{} } home stashes (safe from arrests)
//   p.effects = [{ id, label, kind, until(game min), speed, trip, applied:{stat:delta} }]  timed effects
//   p.dating[npcId] = { rel, lastFlirt, lastGift, lastSeen, dates, partner }
//   p.market = { f:{drug:factor}, events:[...], next, today, stock:{district:{drug:qty}}, stockDay, day }
//   p.look = { color, hat, hatColor }                (core key; set by the clothing store)
//   p.flags.insurance (bool), p.flags.backroom_pw, p.flags.pit_champion, p.flags.garage_<homeId>
//   p.sys = {
//     today: { day, ...per-day counters },  capacity (drug carry units),  outfits:[], hats:[], tattoos:[],
//     gym: { until, lifetime },  pitRank,  loan: { amount, day } | null,  fund,  fundLast,  insuranceUntil,
//     fines,  surgery,  haircuts,  rent: { homeId: paidThroughDay },  drunk,  addiction: { level, last },
//     dealHeat (fractional heat accumulator),  partner,  casino: { day, net, bannedDay },
//     pawn: { day, weapons, goods, sold },  news: { day, headline, stories, announced },  collectors,
//     lastInterest,  ventures/legacy/homeUp/style/activity/lastActive/lastIncome/galaDay (src/systems/ventures.js)
//   }
// ---------------------------------------------------------------------------------------------
import { ensureState, capacity, today } from './common.js';
import { injectStyles, installAbortHook } from './ui-kit.js';
import { installSfx } from './sfx.js';
import { installEffects } from './effects.js';
import { installItems } from './items.js';
import { installMarket } from './market.js';
import { installJobs } from './jobs.js';
import { installDelivery } from './delivery.js';
import { installHomes } from './home.js';
import { installShops } from './shops.js';
import { installCivic } from './civic.js';
import { installTraining } from './training.js';
import { installCasino } from './casino.js';
import { installDating } from './dating.js';
import { installNightlife } from './nightlife.js';
import { installFightClub } from './fightclub.js';
import { installPlaces } from './places.js';
import { installNews } from './news.js';
import { installVentures } from './ventures.js';
import { installMinigames } from './minigame.js';
import { registerWorkGames } from './mg/work.js';
import { registerTrainGames } from './mg/train.js';

export async function installSystems(game) {
  injectStyles();
  installAbortHook(game);
  ensureState(game.state.p);

  const parts = {};
  const steps = [
    ['sfx', installSfx], ['minigames', (g) => { const m = installMinigames(g); registerWorkGames(m); registerTrainGames(m); return m; }], ['effects', installEffects], ['items', installItems], ['market', installMarket],
    ['jobs', installJobs], ['delivery', installDelivery], ['homes', installHomes], ['shops', installShops],
    ['civic', installCivic], ['training', installTraining], ['casino', installCasino], ['dating', installDating],
    ['nightlife', installNightlife], ['fightclub', installFightClub], ['places', installPlaces], ['news', installNews], ['ventures', installVentures],
  ];
  for (const [name, fn] of steps) {
    try { parts[name] = fn(game); } catch (e) { console.error(`[systems] ${name} failed to install`, e); }
  }

  game.sysCapacity = () => capacity(game.state.p);
  game.sysToday = () => today(game);

  // One ordered daily tick: market first (so the paper can report it), then money, homes, romance, news.
  game.bus.on('time:day', () => {
    const p = game.state.p;
    ensureState(p);
    for (const [name, fn] of [
      ['activity', () => parts.ventures?.beginDay()],   // was yesterday an active day? (passive income rule)
      ['market', () => parts.market?.daily()],
      ['civic', () => parts.civic?.daily()],
      ['homes', () => parts.homes?.daily()],
      ['ventures', () => parts.ventures?.daily()],
      ['dating', () => parts.dating?.daily()],
      ['news', () => parts.news?.daily()],
    ]) {
      try { fn(); } catch (e) { console.error(`[systems] daily ${name} failed`, e); }
    }
  });

  game.bus.on('state:reset', () => ensureState(game.state.p));
  game.bus.on('game:start', () => {
    const p = game.state.p;
    ensureState(p);
    try { game.market?.state?.(); } catch (e) { console.error(e); }
    if (!p.sys.news || p.sys.news.day !== game.time.day) { try { parts.news?.daily(); } catch (e) { console.error(e); } }
    setTimeout(() => parts.news?.announce?.(true), 2500);
  });

  game.ui.menuButtons.push({ label: "Read today's Rotwell Rag", onClick: () => game.sysNews?.open() });

  // Dev helper: window.game.sysDebug.rich() etc.
  game.sysDebug = {
    rich(n = 100000) { game.state.addMoney(n, 'debug'); },
    stats(n = 100) { const p = game.state.p; p.str = p.int = p.cha = n; game.state.changed('all'); },
    day() { game.time.advance(game.time.minutesUntil(7)); },
    enter(id) { const l = game.locations.get(id); if (l) game.locations.enter(l); },
    // economy sim (balance pass 6): game.sysDebug.econ({ era: 'before'|'after', seeds, minutes }) — see systems/econsim.js
    async econ(opts = {}) { const m = await import('./econsim.js'); return m.runEcon(opts); },
  };
}
