// Job-shift minigames. Each one is ~30-45s; score 0..1 -> grade -> pay multiplier (see ../minigame.js).
//   dishwash  (Greasy Spoon dishwasher)   scrub on the beat                         -> kitchen.js
//   linecook  (Greasy Spoon line cook+)   build burgers off tickets, flip patties    -> kitchen.js
//   conveyor  (Meat & Rendering)          grab the good cuts, toss the gross stuff   -> plant.js
//   email     (Grimco)                    inbox triage: reply / delete / forward to HR -> office.js
//   mixdrink  (Rusty Nail bartender)      mix the crude order from the recipe book   -> bar.js
//   lineup    (Rotwell PD)                pick the suspect matching the witness      -> office.js
//   idcheck   (Club Velvet bouncer)       approve / deny IDs by Vince's rules        -> office.js
//   scrapsort (Scrapper Pete's)           sort scrap into copper / steel / trash / Mr. Chompers -> plant.js
//   gutfish   (The Rusty Hook)            cut on the marks, never the bile sac       -> plant.js
// All scenes are procedural canvas art (mg/art.js kit + mg/icons.js item library); no image files.
import { registerKitchen } from './kitchen.js';
import { registerPlant } from './plant.js';
import { registerOffice } from './office.js';
import { registerBar } from './bar.js';

export function registerWorkGames(mg) {
  registerKitchen(mg);
  registerPlant(mg);
  registerOffice(mg);
  registerBar(mg);
}
