// Blackwater Isle data. Registered into the shared tables at import time
// (runtime only — the source files of other modules are untouched), so saves
// that contain island items/weapons load cleanly before any handler runs.
import { ITEMS } from '../data/items.js';
import { WEAPONS } from '../data/weapons.js';
import { JOBS } from '../data/jobs.js';

// ---------------------------------------------------------------- fish (sellable at the Rusty Hook fish counter)
// rarity weight, difficulty 0..1 (reel minigame), minDist: needs a long cast, night/fog bonuses.
export const FISH = {
  fish_sludge_carp: { name: 'Sludge Carp', price: 14, w: 30, diff: 0.15, desc: 'Three eyes. Two of them blink. The third one judges.', fx: { energy: 8, hp: -4 } },
  fish_tire_bass: { name: 'Tire Bass', price: 22, w: 24, diff: 0.25, desc: 'Lives inside a radial tire. Pays no rent. Has a little tread pattern.', fx: { energy: 10, hp: -3 } },
  fish_crude_eel: { name: 'Crude Eel', price: 38, w: 16, diff: 0.45, desc: 'So slick with oil you could fry it in itself. Some people do.', fx: { energy: 12, hp: -6 } },
  fish_lawyer: { name: 'Lawyerfish', price: 46, w: 12, diff: 0.5, desc: 'A hagfish in a tiny tie. Covered in slime, feeds on the dead, bills by the hour.', fx: { energy: 6, hp: -8 } },
  fish_glow_cod: { name: 'Glowing Cod', price: 70, w: 9, diff: 0.55, night: 2, desc: 'Radiant. Literally. The pier sign said not to eat the glowing ones. The pier sign is right.', fx: { energy: 25, hp: -18 } },
  fish_bluefin: { name: 'Bluefin Tuna', price: 220, w: 3, diff: 0.75, minDist: 0.6, desc: 'An actual, beautiful, healthy fish. Nobody knows how it got here. It looks scared.', fx: { energy: 45, hp: 20 } },
  fish_rustjaw: { name: 'Old Rustjaw', price: 2600, w: 0, diff: 0.95, legendary: true, desc: 'The legendary catfish of Blackwater: 90 pounds, a hubcap stuck in its jaw, and the eyes of a disappointed father.', fx: { energy: 100, hp: 50 } },
};
export const FISH_ORDER = Object.keys(FISH);

// Junk and treasure off the hook
export const CATCH_JUNK = [
  { id: 'soggy_boot', w: 14 },
  { id: 'isle_lockbox', w: 3 },
  { id: 'message_bottle', w: 4 },
  { id: 'junk_watch', w: 4 },
  { id: 'gold_tooth', w: 1.5 },
  { id: 'necklace', w: 0.6 },
];

// ---------------------------------------------------------------- arcade prizes (ticket counter)
export const PRIZES = [
  { id: 'prize_spider', tickets: 25 },
  { id: 'prize_fingertrap', tickets: 60 },
  { id: 'prize_nose', tickets: 150 },
  { id: 'prize_rat', tickets: 320 },
  { id: 'prize_lavalamp', tickets: 650 },
  { id: 'prize_jacket', tickets: 1500 },
  { id: 'prize_mystery', tickets: 2500 },
  { id: 'prize_golden', tickets: 9999 },
];

const NEW_ITEMS = {
  // fishing gear
  fishing_rod: { name: 'Rusty Fishing Rod', cat: 'misc', price: 35, desc: 'Held together with fishing line and optimism. Lets you fish at Pier Zero without renting Hank\'s.', noUse: true, noSell: true },
  bait_worms: { name: 'Bait Worms (tub)', cat: 'misc', price: 4, desc: 'Five wriggly bait worms. Better bites. Do not mistake for gummy worms. Again.', noUse: true },
  // junk / treasure
  soggy_boot: { name: 'Soggy Boot', cat: 'junk', price: 2, desc: 'Size 11. Left foot. There is a crab living in it and he has filed for squatter\'s rights.', noUse: true },
  isle_lockbox: { name: 'Barnacled Lockbox', cat: 'misc', price: 60, desc: 'Rusted shut. Rattles. Use it to pry it open (crowbar optional, rage mandatory).', fx: { special: 'isle_lockbox' } },
  message_bottle: { name: 'Message in a Bottle', cat: 'misc', price: 10, desc: 'Someone out there needed help. Or was really drunk. Possibly both. Use to read.', fx: { special: 'isle_bottle' } },
  // arcade prizes
  prize_spider: { name: 'Glow-in-the-Dark Spider', cat: 'gift', price: 3, desc: 'A rubber spider. Put it in someone\'s bed. Watch them become a different person.', gift: 2, noUse: true },
  prize_fingertrap: { name: 'Chinese Finger Trap', cat: 'misc', price: 4, desc: 'You will get stuck. Everyone gets stuck. That\'s the lesson. Also it\'s from Funland, so it\'s sticky.', fx: { temp: { int: 1, min: 60 } } },
  prize_nose: { name: 'Squeaky Clown Nose', cat: 'misc', price: 8, desc: 'HONK. +2 Charm for two hours, somehow. People find confidence attractive, even this kind.', fx: { temp: { cha: 2, min: 120 } } },
  prize_rat: { name: 'Stuffed Funland Rat', cat: 'gift', price: 20, desc: 'A plush rat in a Funland visor. Dates find it "weirdly sweet". Real rats find it threatening.', gift: 8, noUse: true },
  prize_lavalamp: { name: 'Toxic Lava Lamp', cat: 'gift', price: 45, desc: 'Green goo rises and falls like the stock market. Hypnotic. Possibly radioactive.', gift: 12, noUse: true },
  prize_jacket: { name: 'Funland Staff Jacket', cat: 'misc', price: 120, desc: 'Satin. Embroidered. Smells like the Incident. Wear it once and you feel permanently cooler (+2 Charm).', fx: { perm: { cha: 2 } } },
  prize_mystery: { name: 'Funland Mystery Box', cat: 'misc', price: 200, desc: 'Something rattles inside. The box is warm. Use to open it, coward.', fx: { special: 'isle_mystery' } },
  prize_golden: { name: 'Golden Funland Ticket', cat: 'misc', price: 5000, desc: 'The legendary 9,999-ticket prize. Use it to "redeem" it with the ghost of Funland management.', fx: { special: 'isle_golden' } },
  // seafood shack food
  isle_fishchips: { name: 'Fish & Chips (Mostly Chips)', cat: 'food', price: 8, desc: 'Ratio: one fish-shaped crumb to a kilo of fries. Still slaps.', fx: { energy: 30, hp: 5 } },
  isle_chowder: { name: 'Mystery Chowder', cat: 'food', price: 5, desc: 'There is a button in it. A BUTTON. Mama Barnacle says it\'s "for texture".', fx: { energy: 24, hp: 2 } },
  isle_shrimp: { name: 'Bucket o\' Shrimp', cat: 'food', price: 14, desc: 'A rusty paint bucket full of shrimp. The paint bucket is also included in the flavor.', fx: { energy: 42, hp: 10 } },
  isle_eelroll: { name: 'Crude Eel Roll', cat: 'food', price: 11, desc: 'Island sushi. Glistening. Flammable. Gives you a weird burst of pep.', fx: { energy: 28, speed: 1.08, speedMin: 60 } },
};

for (const [id, f] of Object.entries(FISH)) {
  NEW_ITEMS[id] = { name: f.name, cat: 'junk', price: f.price, desc: f.desc + ' (Eat it raw, if you hate yourself.)', fx: f.fx, fish: true };
}
for (const [id, d] of Object.entries(NEW_ITEMS)) if (!ITEMS[id]) ITEMS[id] = d;

// ---------------------------------------------------------------- exotic weapons (Smugglers' Cove)
const NEW_WEAPONS = {
  harpoon: { name: 'Harpoon Gun', kind: 'gun', damage: 95, range: 40, rate: 1.4, price: 16500, ammo: 'heavy', mag: 1, spread: 0.01 },
  flaregun: { name: 'Flare Pistol', kind: 'gun', damage: 38, range: 50, rate: 0.9, price: 15500, ammo: 'shells', mag: 1, spread: 0.04 },
  anchor: { name: 'Ship\'s Anchor', kind: 'melee', damage: 64, range: 2.6, rate: 1.35, price: 17000, reqStr: 55, swing: 'overhead' },
  cutlass: { name: 'Pirate Cutlass', kind: 'melee', damage: 36, range: 2.3, rate: 0.5, price: 16000, reqStr: 28 },
};
for (const [id, w] of Object.entries(NEW_WEAPONS)) if (!WEAPONS[id]) WEAPONS[id] = w;
export const EXOTIC_WEAPONS = Object.keys(NEW_WEAPONS);

// ---------------------------------------------------------------- job: fish gutter at the Rusty Hook
if (!JOBS.fish_gutter) {
  JOBS.fish_gutter = {
    name: 'The Rusty Hook', loc: 'rusty_hook', boss: 'Mama Barnacle', hours: [5, 22], energy: 10, gain: { str: 0.08 },
    ranks: [
      { title: 'Fish Gutter', pay: 11, req: {}, shifts: 6 },
      { title: 'Head Gutter', pay: 17, req: { str: 12 }, shifts: 10 },
      { title: 'Fry Cook of the Deep', pay: 26, req: { str: 20, int: 12 }, shifts: 999 },
    ],
    lines: [
      'You gut two hundred sludge carp. One of them winks at you mid-gut. You will think about it forever.',
      'Mama Barnacle shows you how to fillet a Lawyerfish. It tries to bill you for the consultation.',
      'You find a wedding ring inside a tire bass. Mama Barnacle pockets it. "Finder\'s fee, sweetie."',
      'The fryer pops and you lose an eyebrow. Mama says it "builds character". Hers are both drawn on.',
      'A seagull steals a fish out of your hand, then comes back for your hand. You win. Barely.',
    ],
    events: [
      { text: 'A tourist from the mainland tips you $15 "for the authentic experience". He then throws up.', money: 15 },
      { text: 'A Crude Eel slithers up your sleeve. You dance a dance no one asked for.', hp: -6 },
      { text: 'Mama Barnacle lets you take home the "less glowy" leftovers.', energy: 12 },
      { text: 'You find a soggy boot inside a fish inside another fish. Fishception. You keep it.', item: 'soggy_boot' },
    ],
  };
}

// ---------------------------------------------------------------- characters
export const INMATES = [
  { id: 'knuckles', name: 'Knuckles McGee', crime: '14 bank robberies (13 successful)', want: 'cigs',
    hello: '"Kid! You look like a guy who\'s never robbed a bank. That\'s fine. Neither had I, once."',
    tips: ['Banks keep the good stuff in the back, behind the guy who looks the most bored. Always the bored guy.', 'Never rob a place on payday. Cops get donuts on payday. Fed cops are fast cops.', 'Getaway car tip: never pick a red one. Red is the color of "please notice me, officer".'] },
  { id: 'sister', name: 'Sister Mary Shank', crime: 'Tax fraud via a fake megachurch', want: 'whiskey',
    hello: '"Bless you, child. Did you bring an offering? The Lord accepts cash, booze, and contraband. In that order."',
    tips: ['The Church of the Holy Rebate on Hilltop launders more money than a laundromat in a hurricane.', 'Confession is free. Absolution costs extra. Tell \'em Mary sent you and they\'ll waive the absolution fee.', 'The trick to running a racket is a good hat. Nobody arrests a good hat.'] },
  { id: 'pudding', name: 'Professor Pudding', crime: 'Embezzled $40M from Grimco (they never noticed)', want: 'book_dummies',
    hello: '"Ah, a visitor. I\'d shake your hand but they took my hands\' privileges. Long story. Spreadsheets were involved."',
    tips: ['Grimco shareholders meet on Thursdays. Their snacks are better than their ethics.', 'Compound interest is the eighth wonder of the world. The ninth is how much Grimco skims off it.', 'Rich people never carry cash. That\'s why you rob the guy who parks their car.'] },
  { id: 'lenny', name: 'Big Lenny Two-Times', crime: 'Arm-wrestled a cop. Twice. Won both times.', want: 'cold_burrito',
    hello: '"Hi! I\'m Lenny! You\'re my best friend now. That\'s how it works. Do you have food? Best friends have food."',
    tips: ['The guards nap at 3PM. All of \'em. It\'s like a holiday but every day.', 'If you get in a fight, punch the biggest guy first. Unless that\'s me. Please don\'t punch me.', 'I hid a sandwich in 2019. I still think about that sandwich.'] },
  { id: 'giggles', name: 'Mr. Giggles', crime: 'The Funland Incident (details sealed by court order)', want: 'prize_nose',
    hello: '"Hee hee. A VISITOR. Nobody visits Mr. Giggles. Did you ride the wheel? It still turns, doesn\'t it? It never stopped. Hee."',
    tips: ['The claw machine is rigged. I know. I rigged it. Press DROP on the third swing. Hee hee.', 'The keeper at the lighthouse knows what happened. He saw it from the tower. Ask him about the night of the fog.', 'Old Rustjaw only bites when the fog rolls in. He likes the quiet. Like me. Hee.'] },
];

export const KEEPER_LORE = [
  { key: 'island', label: 'Ask about the island', text: '"Blackwater? Used to be a resort. Ferris wheel, saltwater taffy, a bandstand. Then the meat plant upriver started dumpin\' and the fish grew extra eyes. Tourists stopped comin\'. The prison came next, then the smugglers. Now it\'s us. The leftovers."' },
  { key: 'bridge', label: 'Ask about the bridge', text: '"Mayor Sludgeworth built that drawbridge with \'leftover funds\'. Leftover from what, nobody asked. It\'s gone up exactly once — to let his yacht through. Then it stuck. Then they fixed it. With duct tape and prayer."' },
  { key: 'funland', label: 'Ask about Funland', text: '"Funland shut down after the Incident. The fog was thick that night. The wheel kept turnin\' with nobody drivin\' it. Mr. Giggles was on the speaker, laughin\'. They locked him up in the Pen, but the wheel... it still turns. Ain\'t nobody paid the power bill in eleven years."' },
  { key: 'fog', label: 'Ask about the fog', text: '"The fog ain\'t weather, kid. It\'s the island exhalin\'. When it rolls in, the big ones come up to feed. Old Rustjaw. Bigger than a man, older than me. Hubcap in his jaw from \'87. You want him? Fish when it\'s foggy, cast long, and pray."' },
];

export const BOTTLE_NOTES = [
  'HELP. Stranded on Blackwater. The toll guy took my shoes. — Gary',
  'If found, please return to Mr. Giggles. Hee hee. Hee. (The rest is just "hee" written 400 times.)',
  'Dear Diary, the crabs have unionized. They want dental.',
  'X marks the spot: under the third crate at Smugglers\' Cove. (The crate is empty. Someone got there first. Probably Eddie.)',
  'Message to future me: DO NOT eat the glowing cod. Signed, past me, from the hospital.',
  'Roses are red, the water is black, I threw my ex\'s ring in here and I\'m not going back.',
];
