// Progression: perk trees (game.perks) + achievements (game.achievements) + milestones.
// Persistent data: state.p.progress = { perks:[ids], bonusPoints, ach:{id:day}, c:{counters},
//                                       seen:{locId}, districts:{id}, skateXp:{day,n} }
//                  state.p.background (creator background id; see src/ui/creator.js BACKGROUNDS)
// Events emitted: perk:bought {id, tree}, achievement:unlocked {id, name}, progress:levelup {level}
// Keys: P (perks & achievements panel)
// Milestones (src/progress/milestones.js): "New at 25 STR: ..." toasts, level-up stat bonus,
// discovery XP (new buildings/districts), capped skate-trick XP.
import { installPerks } from './perks.js';
import { installAchievements } from './achievements.js';
import { installMilestones } from './milestones.js';

export async function installProgress(game) {
  try { installPerks(game); } catch (e) { console.error('[progress] perks failed', e); }
  try { installAchievements(game); } catch (e) { console.error('[progress] achievements failed', e); }
  try { installMilestones(game); } catch (e) { console.error('[progress] milestones failed', e); }
}
