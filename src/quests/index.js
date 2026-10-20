// Story, quests, dialog, factions, endings and random street events.
//
// game.quests (QuestEngine) API:
//   start(id, data?), step(id), setStep(id, n), complete(id), fail(id), abandon(id)
//   isActive(id), isDone(id), get(id), activeIds(), objectiveText(id), track(id)
//   openLog()                         (J key)
//   talkTo(charId)                    open a story character's dialog
//   say(pages, ctx) / ask({...})      scripted dialog helpers
//   brawl(spec) -> Promise<bool>      fight via game.combat (or a stat-roll fallback)
//   faction() / rep(f) / addRep(f, n) / joinFaction(f) / rankName(f)
//   itemName(id)                      names for quest-only items (q_*)
//   reward({money,xp,karma,stats,items,weapon,car,rep,flags,heat})
// Events emitted: quest:started, quest:step, quest:completed, quest:failed, ending:reached,
//   faction:joined, faction:left, quests:changed, weapon:gained
// Persistent data: state.p.quests[id] = {step, done, data, sd, t}; state.p.flags:
//   faction, rep_rats, rep_syndicate, endings[], ending_<id>, reg_paid, q_tracked, ...
import { QuestEngine } from './engine.js';
import { QuestWorld } from './world.js';
import { QuestPanels } from './panels.js';
import { installPlaces } from './places.js';
import { installStreetEvents } from './street.js';
import { esc } from '../core/util.js';
import { setBarkContext } from '../data/barks.js';

// Short fame titles for street barks ("Hey, {title}!") after an ending.
export const FAME_TITLES = { kingpin: 'King of the Gutter', corporate: 'CEO of Rot', mayor: 'Mayor', escape: 'Lid-Lifter', hobo: 'King of the Crust' };

export async function installQuests(game) {
  const engine = new QuestEngine(game);
  try { const m = await import('../data/cars.js'); engine.cars = m.CARS || {}; } catch { engine.cars = game.vehicles?.CARS || {}; }

  const world = new QuestWorld(game, engine);
  const panels = new QuestPanels(game, engine);
  let places = null, street = null;
  try { places = installPlaces(game, engine); } catch (e) { console.error('[quests] places failed', e); }
  try { street = installStreetEvents(game, engine); } catch (e) { console.error('[quests] street events failed', e); }

  engine.openLog = () => panels.openLog();
  engine.showEnding = (id, variant) => panels.showEnding(id, variant);
  engine.debug = {
    skip: (id) => engine.step(id),
    finish: (id) => engine.complete(id),
    ending: (id, variant) => panels.showEnding(id, variant),
    street: (id) => street?.trigger(id),
    job: (f) => places?.offerJob(f),
    intro: () => panels.playIntro(),
    respawn: () => world.spawnAll(),
  };
  game.quests = engine;

  // Street one-liners react to weather, time, district, heat and fame (see data/barks.js).
  setBarkContext(() => {
    if (!game.started || !game.player) return null;
    const pp = game.player.group.position;
    const ends = game.state.getFlag('endings', []) || [];
    let district = null; try { district = game.world?.districtAt?.(pp.x, pp.z) || null; } catch { /* ignore */ }
    return {
      weather: game.world?.weather || 'overcast', night: !!game.time?.isNight, district,
      famous: ends.length > 0, title: ends.length ? FAME_TITLES[ends[ends.length - 1]] : null,
      heat: game.state.p.heat || 0, mayor: !!game.state.getFlag('ending_mayor'),
    };
  });

  game.addSystem({
    name: 'quests',
    update(dt) {
      engine.update(dt);
      world.update(dt);
      panels.updateTracker(dt);
    },
  });

  // Rebuild NPCs/markers whenever a game starts (new or loaded save).
  game.bus.on('game:start', ({ isNew, dev } = {}) => {
    try {
      engine.rt = {};
      world.clearAll();
      world.spawnAll();
      engine.changed();
      const forceIntro = new URLSearchParams(location.search).has('intro');
      if (isNew && (!dev || forceIntro)) {
        setTimeout(() => panels.playIntro().catch((e) => console.error('[quests] intro failed', e)), 700);
      } else if (!engine.get('main_prologue')) {
        // Dev mode / old saves: skip the cutscene, but keep the story going.
        if (!game.state.hasItem('q_note')) game.state.addItem('q_note', 1);
        engine.start('main_prologue', {}, { silent: true });
        game.state.setFlag('intro_done', true);
      }
    } catch (e) { console.error('[quests] game:start failed', e); }
  });

  // Post-game: point at the epilogue chapter (and the secret one at 3+ endings) once the credits close.
  const EPI = { kingpin: 'epi_kingpin', corporate: 'epi_corp', mayor: 'epi_mayor', escape: 'epi_escape', hobo: 'epi_hobo' };
  game.bus.on('ending:reached', ({ id } = {}) => {
    const off = game.bus.on('ui:close', () => {
      if (game.ui.isBlocking()) return;
      off();
      setTimeout(() => {
        try {
          const d = engine.def(EPI[id]);
          if (d && !engine.get(d.id)) game.ui.toast(`<b>EPILOGUE UNLOCKED:</b> "${esc(d.title)}" — talk to ${esc(engine.charPos(d.giver)?.label || d.giver)}.`, 'good', 6500);
          const s = engine.def('secret_plunger');
          if (s && !engine.get('secret_plunger') && s.available?.(game)) setTimeout(() => game.ui.toast('<b>???:</b> Three doors opened. Under the overpass, Crusty Reg has taken off his crown. He wants to talk.', 'good', 7000), 2500);
          engine.changed();
        } catch (e) { console.error('[quests] epilogue hint failed', e); }
      }, 6800);
    });
  });

  // Co-op: brag to friends when someone hits an ending.
  try {
    game.net.on('q_ending', (msg) => {
      const sv = (v, d) => (typeof v === 'string' && v ? v.slice(0, 40) : d);
      game.ui.toast(`<b>${esc(sv(msg?.name, 'Your buddy'))}</b> reached an ending: <b>${esc(sv(msg?.title, '???'))}</b>`, 'good', 6000);
    });
  } catch { /* single player */ }
}
