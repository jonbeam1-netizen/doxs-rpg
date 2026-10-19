// Progression: perk trees (game.perks) + achievements (game.achievements).
// Persistent data: state.p.progress = { perks:[ids], bonusPoints, ach:{id:day}, c:{counters} }
//                  state.p.background (creator background id; see src/ui/creator.js BACKGROUNDS)
// Events emitted: perk:bought {id, tree}, achievement:unlocked {id, name}, progress:levelup {level}
// Keys: P (perks & achievements panel)
import { installPerks } from './perks.js';
import { installAchievements } from './achievements.js';

export async function installProgress(game) {
  try { installPerks(game); } catch (e) { console.error('[progress] perks failed', e); }
  try { installAchievements(game); } catch (e) { console.error('[progress] achievements failed', e); }
}
