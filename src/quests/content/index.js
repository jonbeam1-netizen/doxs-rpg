// Merges the extra quest content into the shared tables in data/quests.js at import time.
// (Runtime only: data/quests.js stays the story bible; this folder holds the expansion.)
import { CHARACTERS, QUESTS, QUEST_ITEMS } from '../../data/quests.js';
import { NEW_CHARACTERS, REACTS, NEW_ITEMS } from './people.js';
import { SIDE_QUESTS } from './sides.js';
import { ARC_QUESTS } from './arcs.js';

// What pedestrians say about the original side quests when you ask around (see npc/talk.js).
const RUMORS = {
  side_eye: 'Madame Ooze lost her glass eye. A pigeon took it. She\'s offering free fortunes forever. Forever\'s a long time to hear bad news.',
  side_rug: 'Lucky Larry\'s looking for a driver with no questions and a big trunk. Something about a rug.',
  side_hotdog: 'Gus at the Greasy Spoon has a hot dog challenge. Thirty dogs. Winners get a belt. Losers get the bathroom.',
  side_hobocoin: 'Some guy under the overpass is selling a crypto backed by despair. Honestly? Most stable currency in Rotwell.',
  side_teeth: 'There\'s a "dentist" in a van behind St. Mercy\'s buying teeth. Not his. Anybody\'s.',
  side_raccoon: 'There\'s a raccoon godfather behind Pizza Butt. He wants tribute. Garbage tribute. Pay it. Trust me.',
  side_tithe: 'Pastor Prosper up at the Holy Rebate needs a collector. Tithes are overdue. The Lord is getting impatient. So is his boat payment.',
  side_brock: 'Brock at the Iron Lung will fight anybody with 25 strength. Nobody\'s beaten him. He cries about it. Mostly when he wins.',
  side_overdue: 'The librarian wants a book back from a biker at the Dirty Spur. Twenty-two years overdue. She\'s scarier than he is.',
  side_tattoo: 'Needles at Ink Stinks screwed up Big Dale\'s tattoo. "Born to Dine." Somebody needs to calm Dale down before Needles dies.',
  side_pizza: 'Tony Butt at Pizza Butt needs a fast driver. Late pizza comes out of your pay.',
  side_mime: 'Chief Lardner wants somebody to beat up some mimes outside Threads & Dreads. I\'d do it for free, honestly.',
  side_meat: 'Hank at the meat plant wants the Meat Loaf tested. Nobody wants to know the answer. Hank NEEDS to know.',
  side_martha: 'Mad Martha at the drag strip gives away bikes to people who win her races. Win twice and she might not kill you.',
  side_leg: 'Scrapper Pete\'s prosthetic leg is in Lucky Larry\'s window. He\'s hopping mad. Literally.',
  side_letter: 'The bunker guard out in the Dustbowl has a crush on Madame Ooze. He wrote a poem. Somebody has to deliver it.',
};

let merged = false;
export function mergeContent() {
  if (merged) return;
  merged = true;
  for (const [id, c] of Object.entries(NEW_CHARACTERS)) if (!CHARACTERS[id]) CHARACTERS[id] = c;
  for (const [id, fn] of Object.entries(REACTS)) if (CHARACTERS[id] && !CHARACTERS[id].react) CHARACTERS[id].react = fn;
  for (const [id, it] of Object.entries(NEW_ITEMS)) if (!QUEST_ITEMS[id]) QUEST_ITEMS[id] = it;
  for (const [id, q] of Object.entries({ ...SIDE_QUESTS, ...ARC_QUESTS })) if (!QUESTS[id]) QUESTS[id] = q;
  for (const [id, r] of Object.entries(RUMORS)) if (QUESTS[id] && !QUESTS[id].rumor) QUESTS[id].rumor = r;
}
mergeContent();
