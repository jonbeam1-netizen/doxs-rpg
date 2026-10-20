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

  // Co-op: brag to friends when someone hits an ending.
  try {
    game.net.on('q_ending', (msg) => {
      const sv = (v, d) => (typeof v === 'string' && v ? v.slice(0, 40) : d);
      game.ui.toast(`<b>${esc(sv(msg?.name, 'Your buddy'))}</b> reached an ending: <b>${esc(sv(msg?.title, '???'))}</b>`, 'good', 6000);
    });
  } catch { /* single player */ }
}
