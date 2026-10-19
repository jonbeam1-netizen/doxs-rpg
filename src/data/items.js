// Every usable / sellable item in Rotwell. Owned by the systems module.
// Used through game.items.use(id) (src/systems/items.js).
//
// cat: food | drink | booze | smoke | med | gamble | gift | book | upgrade | junk | misc
// fx (all optional):
//   energy, hp            instant restore (negative hurts)
//   drunk                 drunk levels added (5+ = you pass out)
//   temp: { str|int|cha: n, min }   temporary stat buff for `min` game minutes
//   perm: { str|int|cha|karma: n }  permanent change on use
//   effect: id            named timed effect (see systems/effects.js EFFECT_DEFS), min = duration
//   speed, speedMin       temporary speed multiplier
//   addiction             change to the addiction meter
//   sober                 clears drunkenness
//   special               custom handler key in systems/items.js
//   time                  game minutes the action takes
// gift: relationship value when given on a date / at a flirt.
// noSell: pawn shops won't touch it. noUse: can't be "used" from the inventory.
export const ITEMS = {
  // ---------------- food ----------------
  cold_burrito: { name: 'Gas Station Burrito', cat: 'food', price: 4, desc: 'Lukewarm in the middle, frozen at the ends. A temperature gradient of shame.', fx: { energy: 16, special: 'burrito' } },
  roller_dog: { name: 'Roller Dog (Day 3)', cat: 'food', price: 3, desc: "It's been rolling since Tuesday. It has seen things.", fx: { energy: 11 } },
  chips: { name: 'Bag of Mostly Air', cat: 'food', price: 2, desc: 'Nine chips and a bag full of disappointment-flavored nitrogen.', fx: { energy: 6 } },
  cup_noodles: { name: 'Sodium Cup', cat: 'food', price: 2, desc: 'Ramen with 340% of your daily salt. Your blood pressure just winked at you.', fx: { energy: 13, hp: -1 } },
  pizza_slice: { name: 'Pizza Butt Slice', cat: 'food', price: 5, desc: '"It\'s Butt-er Than Nothing!" Grease-to-crust ratio: legally concerning.', fx: { energy: 20, hp: 5 } },
  diner_special: { name: 'Mystery Meat Platter', cat: 'food', price: 9, desc: "Marge won't say what animal. Marge won't say if it was an animal.", fx: { energy: 34, hp: 10 } },
  donut: { name: 'Glazed Donut', cat: 'food', price: 2, desc: 'Sticky, sweet, and accepted as legal tender by most of Rotwell PD.', fx: { energy: 8 } },
  steak: { name: 'An Actual Steak', cat: 'food', price: 40, desc: 'From a cow! Probably! Restores your faith in protein.', fx: { energy: 60, hp: 30 } },
  protein_shake: { name: 'Swole Sludge Protein', cat: 'food', price: 12, desc: 'Chalky, beige, smells like a gym bag. Next 6 hours of lifting count 50% more.', fx: { energy: 10, effect: 'protein', min: 360 } },
  // ---------------- drinks ----------------
  coffee: { name: 'Burnt Coffee', cat: 'drink', price: 2, desc: 'Brewed in 2019, reheated hourly. Tastes like an ashtray\'s therapist.', fx: { energy: 12 } },
  energy_drink: { name: 'Kardiak Arrest Energy', cat: 'drink', price: 6, desc: 'Now with 40% more heart palpitations! Not FDA anything.', fx: { energy: 30, hp: -2 } },
  mega_energy: { name: 'LIQUID LIGHTNING XXL', cat: 'drink', price: 15, desc: 'One can = one week of sleep you will never get back. You can hear colors.', fx: { energy: 60, hp: -8, speed: 1.12, speedMin: 60 } },
  // ---------------- booze ----------------
  beer: { name: 'Piss Lite', cat: 'booze', price: 3, desc: 'Brewed with the finest tap water downstream of the meat plant.', fx: { drunk: 1, energy: 4 } },
  malt: { name: 'Old Colon 40oz', cat: 'booze', price: 5, desc: 'Comes in a paper bag for your dignity. Too late for that.', fx: { drunk: 2, energy: 6 } },
  wine_box: { name: 'Chateau Le Box', cat: 'booze', price: 10, desc: 'Vintage: last Thursday. Has a tap. Has notes of cardboard and regret.', fx: { drunk: 2, temp: { cha: 1, min: 120 } } },
  whiskey: { name: 'Rotgut Whiskey', cat: 'booze', price: 14, desc: 'Liquid courage. Also liquid paint thinner. Makes you feel 3 STR stronger and 10 IQ dumber.', fx: { drunk: 2.5, temp: { str: 3, int: -2, min: 90 } } },
  moonshine: { name: "Grandpa's Moonshine", cat: 'booze', price: 25, desc: 'Grandpa went blind in 1987. Grandpa says it was unrelated.', fx: { drunk: 4, hp: -10, temp: { str: 5, min: 120 } } },
  champagne: { name: 'Fancy Bubbles', cat: 'booze', price: 80, desc: 'You pop the cork and briefly feel like a person who owns a boat.', fx: { drunk: 1.5, temp: { cha: 3, min: 180 } }, gift: 9 },
  // ---------------- smokes ----------------
  cigs: { name: "Coughin' Nails (pack)", cat: 'smoke', price: 8, desc: 'Makes you look 2% cooler and die 4% faster. Worth it, says the Marlboro Cowboy\'s ghost.', fx: { energy: 8, hp: -2, temp: { cha: 1, min: 60 } } },
  cigar: { name: 'Executive Cigar', cat: 'smoke', price: 35, desc: 'Smells like a boardroom and a divorce. Big-shot energy for two hours.', fx: { hp: -2, temp: { cha: 3, min: 120 } } },
  // ---------------- meds ----------------
  bandage: { name: 'Bandage (Pre-Owned)', cat: 'med', price: 6, desc: 'Only slightly used. The previous owner is fine. Mostly.', fx: { hp: 20 } },
  painkillers: { name: 'Ibuprofake', cat: 'med', price: 12, desc: 'Generic, off-brand, off-label, off-putting. Works though.', fx: { hp: 30, energy: 8 } },
  first_aid: { name: 'First Aid Kit', cat: 'med', price: 35, desc: 'Gauze, tape, a tiny scissor and a coupon for therapy.', fx: { hp: 65 } },
  hangover_cure: { name: 'Hair of the Dog', cat: 'med', price: 9, desc: 'A raw egg, hot sauce and something Marge calls "the secret". Sobers you right up.', fx: { sober: true, energy: 10 } },
  detox_tea: { name: 'Detox Tea (Tastes Like Lies)', cat: 'med', price: 40, desc: 'Cleanses your body of toxins, money, and dignity. Lowers addiction.', fx: { addiction: -20, hp: 5 } },
  steroids: { name: 'Juice-B-Gone Steroids', cat: 'med', price: 250, desc: 'Double gym gains for a day. Side effects: back acne, rage, and a certain... shrinkage.', fx: { effect: 'roids', min: 1440, perm: { cha: -2, karma: -2 } } },
  holy_water: { name: 'Holy Water (Tap)', cat: 'med', price: 20, desc: 'Blessed by Pastor Rick, who was holding a Big Gulp at the time.', fx: { hp: 15, perm: { karma: 1 }, special: 'holy' } },
  // ---------------- gambling ----------------
  scratch: { name: 'Lucky Turd Scratch-Off', cat: 'gamble', price: 2, desc: 'Scratch the turd! Win up to $25,000! Odds printed in a font size too small to exist.', fx: { special: 'scratch' } },
  scratch_gold: { name: 'Golden Toilet Scratcher', cat: 'gamble', price: 20, desc: 'The premium scratcher. Win up to $250,000. The flush is gold-plated.', fx: { special: 'scratch_gold' } },
  // ---------------- gifts / fancy ----------------
  breath_mints: { name: 'Breath Mints', cat: 'misc', price: 2, desc: 'Covers up the burrito. Mostly. +1 Charm for an hour.', fx: { temp: { cha: 1, min: 60 } } },
  gum: { name: 'Pre-Chewed Gum', cat: 'misc', price: 1, desc: 'Found under a bus seat. Still minty. Mostly. +0.5 Charm for an hour.', fx: { temp: { cha: 0.5, min: 60 } } },
  cologne: { name: 'Musk of the Wild Boar', cat: 'misc', price: 30, desc: 'Body spray that smells like a monster truck rally. +3 Charm for 3 hours.', fx: { temp: { cha: 3, min: 180 } } },
  flowers: { name: 'Gas Station Roses', cat: 'gift', price: 15, desc: 'Still in the plastic sleeve with the price tag. Romance!', gift: 5, noUse: true },
  chocolates: { name: 'Heart-Shaped Chocolates', cat: 'gift', price: 25, desc: 'Three of them are bitten. Probably mice. Probably.', gift: 7, fx: { energy: 15 } },
  teddy: { name: 'Creepy Teddy Bear', cat: 'gift', price: 40, desc: 'Its eyes follow you around the room. Says "I wuv you" in a demonic voice.', gift: 9, noUse: true },
  perfume: { name: 'Eau de Dumpster', cat: 'gift', price: 90, desc: 'A fragrance by a very confused French designer. Notes of garbage and sandalwood.', gift: 14, fx: { temp: { cha: 4, min: 180 } } },
  necklace: { name: 'Cubic Zirconia Necklace', cat: 'gift', price: 400, desc: 'Diamonds are forever. These are until Thursday.', gift: 25, noUse: true },
  rolex: { name: 'Rolex Watch', cat: 'gift', price: 6000, desc: 'A real one. Probably. Heavy, shiny, and screams "I make bad decisions with money".', gift: 45, noUse: true },
  fake_rolex: { name: '"Rolecks" Watch', cat: 'gift', price: 60, desc: 'Ticks loudly. Says "Rolecks" in Comic Sans. Turns your wrist green. Still impresses idiots.', gift: 4, noUse: true, pawnMult: 0.1 },
  // ---------------- books ----------------
  book_dummies: { name: 'Thinking for Dummies', cat: 'book', price: 25, desc: 'Chapter 1: "Is that a thought? Write it down."', fx: { perm: { int: 1.5 }, time: 90 } },
  book_cheese: { name: 'Who Moved My Cheese, Bitch?', cat: 'book', price: 40, desc: 'An aggressive self-help book. You feel motivated and mildly threatened.', fx: { perm: { int: 0.8, cha: 1 }, time: 90 } },
  book_barfight: { name: 'The Art of Bar Fighting', cat: 'book', price: 50, desc: 'By Sun Tzu\'s drunk cousin. Chapter 4: "The Chair Is Your Friend."', fx: { perm: { int: 0.8, str: 1.2 }, time: 90 } },
  book_anatomy: { name: "Gray's Anatomy (Coloring Ed.)", cat: 'book', price: 70, desc: 'You color the spleen purple. You learn things. You are a doctor now (you are not).', fx: { perm: { int: 2.5 }, time: 120 } },
  book_seduction: { name: 'Seduction for Cowards', cat: 'book', price: 120, desc: 'Step 1: Shower. Step 2: See step 1. You were not ready for this information.', fx: { perm: { cha: 2.5 }, time: 120 } },
  newspaper: { name: 'The Rotwell Rag', cat: 'misc', price: 1, desc: "Today's paper. News, crime, sports, and market whispers.", fx: { special: 'news' } },
  // ---------------- upgrades (applied on purchase) ----------------
  fanny_pack: { name: 'Fanny Pack of Holding', cat: 'upgrade', price: 150, desc: 'Carry 40 units of contraband. Peak dad fashion. Cops will never suspect a dad.', capacity: 40, noSell: true },
  duffel: { name: 'Gym Duffel Bag', cat: 'upgrade', price: 650, desc: 'Carry 80 units. Smells like socks, which masks the other smells.', capacity: 80, noSell: true },
  rucksack: { name: "Hiker's Mega Rucksack", cat: 'upgrade', price: 2800, desc: 'Carry 160 units. You look like you\'re about to summit Mount Felony.', capacity: 160, noSell: true },
  trenchcoat: { name: 'Trenchcoat of a Thousand Pockets', cat: 'upgrade', price: 12000, desc: 'Carry 320 units. You look like three kids in a coat selling watches. Iconic.', capacity: 320, noSell: true },
  // ---------------- junk / loot ----------------
  scrap_metal: { name: 'Scrap Metal', cat: 'junk', price: 8, desc: 'Rusty, jagged, tetanus-flavored. Scrapper Pete pays cash.', noUse: true },
  copper_wire: { name: 'Copper Wire', cat: 'junk', price: 30, desc: '"Found" it. On a building. That was using it.', noUse: true },
  stolen_tv: { name: '"Found" Flatscreen', cat: 'junk', price: 220, desc: 'It fell off a truck. Through a window. Of a house.', noUse: true },
  gold_tooth: { name: "Someone's Gold Tooth", cat: 'junk', price: 120, desc: 'Still a little warm. Larry at the pawn shop won\'t ask.', noUse: true },
  junk_watch: { name: 'Busted Wristwatch', cat: 'junk', price: 15, desc: 'Correct twice a day. Like your ex.', noUse: true },
  lucky_foot: { name: "Rabbit's Foot (Still Warm)", cat: 'misc', price: 100, desc: 'Madame Ooze swears by it. The rabbit swore at it. +luck at the casino for a day.', fx: { effect: 'lucky', min: 1440 } },
  condom: { name: 'Glow-in-the-Dark Protection', cat: 'misc', price: 3, desc: 'Safety first. Also a decent nightlight. Dates go a bit better if you carry some.', noUse: true },
  duct_tape: { name: 'Duct Tape', cat: 'junk', price: 4, desc: 'Fixes cars, shoes, marriages, and hostage situations (no).', noUse: true },
};

export const ITEM_CATS = {
  food: 'Food', drink: 'Drinks', booze: 'Booze', smoke: 'Smokes', med: 'Medicine', gamble: 'Gambling',
  gift: 'Gifts', book: 'Books', upgrade: 'Upgrades', junk: 'Junk & Loot', misc: 'Misc',
};

// Base carry capacity for drugs (units) before any bag upgrades.
export const BASE_CAPACITY = 20;
