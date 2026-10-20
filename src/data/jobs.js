// Career ladders. Owned by the systems module (src/systems/jobs.js).
//
// loc: location id where you work. hours: [open, close) when shifts can START (null = 24/7).
// energy: energy per hour worked. gain: stat gain per hour (scaled by diminishing returns).
// ranks[i]: { title, pay ($/hour), req: {str,int,cha,karma,course,level}, shifts: shifts at this rank before the
//            next promotion is considered }
// kind: 'shift' (pick 2/4/8h, time skips) | 'delivery' (Pizza Butt timed missions; pay = per delivery)
// events: random things that happen on a shift. { text, money?, hp?, energy?, cha?, karma?, heat? }
// perks[rank] (balance pass 6): what a rung unlocks, for good. Earned the first time you reach that rank and kept
//   even if you quit (you keep the connections). { text, mult?: {perkKey: x}, daily?: $ (paid each active day
//   while it's your CURRENT job), item?, weapon?, car?, gear?, flag? }  mult keys are game.perks keys.
// Pay also grows with seniority (+5%/shift at a rank, max +50%) and promotions pay a signing bonus
// (20 h of the new wage), so a rung you can't climb past still pays better every week.
export const JOBS = {
  diner: {
    name: 'The Greasy Spoon', loc: 'greasy_spoon', boss: 'Big Marge', hours: [5, 23], energy: 9, gain: { str: 0.04 },
    ranks: [
      { title: 'Dishwasher', pay: 12, req: {}, shifts: 3 },
      { title: 'Line Cook', pay: 24, req: { str: 8, int: 8 }, shifts: 6 },
      { title: 'Shift Manager', pay: 40, req: { int: 18, cha: 15 }, shifts: 999 },
    ],
    perks: {
      1: { text: 'Family meal: one free Mystery Meat Platter a day at the Greasy Spoon.', flag: 'perk_family_meal' },
      2: { text: "Marge's right hand: buy into the Greasy Spoon at 30% off (it pays you 25% more), food is 15% cheaper everywhere, +$60/day.", mult: { shopDiscount: 0.85 }, daily: 60, flag: 'perk_marge' },
    },
    lines: [
      'You scrape a fossilized egg off a plate. It might be from the Jurassic period.',
      'Marge yells "ORDER UP" at a man who did not order anything. He eats it anyway.',
      'A trucker tips you a single wet nickel and a wink. You keep the nickel.',
      'The fryer oil has achieved sentience. You negotiate a ceasefire.',
      'You find a tooth in the hash browns. Marge says it\'s "protein".',
    ],
    events: [
      { text: 'A regular slips you a $20 for "keepin\' the eggs runny, like my soul."', money: 20 },
      { text: 'You burn your hand on the flat top. Marge rubs butter on it and calls it healthcare.', hp: -8 },
      { text: 'Health inspector shows up. Marge "tips" him. Nobody speaks of it again.', money: 0 },
      { text: 'You eat a dropped pancake off the floor. Five-second rule. +energy, -dignity.', energy: 10 },
    ],
  },
  pizza: {
    name: 'Pizza Butt', loc: 'pizza_butt', boss: 'Tony Butt', hours: [10, 3], energy: 5, kind: 'delivery', gain: { str: 0.02 },
    ranks: [
      { title: 'Delivery Monkey', pay: 14, req: {}, shifts: 3 },
      { title: 'Senior Delivery Driver', pay: 28, req: { cha: 10 }, shifts: 6 },
      { title: 'Assistant Butt Manager', pay: 46, req: { int: 20, cha: 20 }, shifts: 999 },
    ],
    perks: {
      1: { text: 'Company wheels: Tony gives you a Sputter 49cc Moped. +5% vehicle speed (you know every shortcut).', car: 'moped', mult: { carSpeed: 1.05 } },
      2: { text: 'Franchise insider: the Pizza Butt franchise venture opens to you at 25% off. +$80/day manager stipend.', daily: 80, flag: 'perk_butt_franchise' },
    },
    lines: ['"Remember: if it\'s not there in time, it\'s free. And then YOU pay for it." - Tony Butt'],
    events: [],
  },
  factory: {
    name: 'Rotwell Meat & Rendering', loc: 'meat_plant', boss: 'Foreman Gristle', hours: [5, 23], energy: 13, gain: { str: 0.22 },
    ranks: [
      { title: 'Gut Shoveler', pay: 18, req: { str: 10 }, shifts: 4 },
      { title: 'Bone Saw Operator', pay: 34, req: { str: 25 }, shifts: 8 },
      { title: 'Rendering Foreman', pay: 62, req: { str: 45, int: 12 }, shifts: 11 },
      { title: 'Plant Boss', pay: 110, req: { str: 70, int: 25 }, shifts: 999 },
    ],
    perks: {
      1: { text: 'Meat-locker conditioning: +15% STR gains. Gristle lets you keep a cleaver (machete).', mult: { strGain: 1.15 }, weapon: 'machete' },
      2: { text: 'Foreman\'s cut: +$120/day in "byproduct sales" while you run the floor. You take 10% less damage (mostly callus now).', mult: { damageTaken: 0.9 }, daily: 120 },
      3: { text: 'Plant Boss: the hot dog contract pays +$450/day. The Pit crowd respects the apron: +10% melee damage.', mult: { meleeDamage: 1.1 }, daily: 450 },
    },
    lines: [
      'You shovel guts for hours. Some of the guts shovel back.',
      'The conveyor belt carries something with a collar. You do not look at the collar.',
      'Gristle says the secret to Rotwell Hot Dogs is "everything". He means everything.',
      'You lift a whole cow carcass. Your back makes a noise like a dial-up modem.',
      'A coworker loses a finger. He finds it later. In a sausage. He keeps working.',
    ],
    events: [
      { text: 'You find a gold ring in a vat of offal. Finders keepers.', item: 'gold_tooth' },
      { text: 'A meat hook swings into your face. OSHA would cry if OSHA came here.', hp: -14 },
      { text: 'Gristle gives you "employee meat" to take home. It\'s still twitching.', item: 'steak' },
      { text: 'Overtime bonus! Gristle forgot to clock you out. Silently.', money: 40 },
    ],
  },
  office: {
    name: 'Grimco Tower', loc: 'grimco', boss: 'Mr. Grimsby', hours: [7, 19], energy: 8, gain: { int: 0.12, cha: 0.05 },
    ranks: [
      { title: 'Unpaid-ish Intern', pay: 16, req: { int: 15 }, shifts: 4 },
      { title: 'Spreadsheet Goblin', pay: 38, req: { int: 30, cha: 15 }, shifts: 8 },
      { title: 'Middle Manager', pay: 80, req: { int: 50, cha: 32 }, shifts: 11 },
      { title: 'VP of Synergy', pay: 170, req: { int: 75, cha: 50, course: 'mba' }, shifts: 16 },
      { title: 'CEO', pay: 360, req: { int: 105, cha: 80, course: 'mba' }, shifts: 999 },
    ],
    perks: {
      1: { text: 'Expense account: 10% off at shops, bars and restaurants. Savings interest +25%.', mult: { shopDiscount: 0.9, bankRate: 1.25 } },
      2: { text: 'Keycard + IT friends: a working Grimco keycard (the Penthouse job\'s "way in") and a free Hack-O-Matic 3000.', gear: 'hacker', flag: 'perk_grimco_keycard' },
      3: { text: 'Stock options: +$600/day while you\'re VP or better, and every business venture pays 20% more.', daily: 600, mult: { ventureIncome: 1.2 } },
      4: { text: 'CEO: +$2,500/day in "performance bonuses" and a private-banking rate (+50% savings interest).', daily: 2500, mult: { bankRate: 1.5 } },
    },
    lines: [
      'You attend a meeting about meetings. It could have been an email. The email could have been nothing.',
      'You "reply all" by accident. Forty people now know about your foot fungus.',
      'You microwave fish in the break room. You have made enemies for life.',
      'Mr. Grimsby calls you "Dave". Your name isn\'t Dave. You are Dave now.',
      'You move a cell from column B to column C. Your manager calls it "visionary".',
      'Team-building exercise: trust falls. Nobody catches Gary. Gary is in the hospital.',
    ],
    events: [
      { text: 'You find the CEO\'s password on a sticky note. You use it to order 40 pizzas to his house.', karma: -1, money: 0 },
      { text: 'Quarterly bonus! Mostly a branded mug and a $50 gift card.', money: 50 },
      { text: 'You take credit for an intern\'s idea. Feels good. Feels evil.', karma: -1, cha: 0.5 },
      { text: 'Paper cut. On your eye somehow. HR sends a thoughts-and-prayers memo.', hp: -4 },
    ],
  },
  bartender: {
    name: 'The Rusty Nail', loc: 'rusty_nail', boss: 'One-Eyed Sal', hours: [11, 4], energy: 9, gain: { cha: 0.1 },
    ranks: [
      { title: 'Barback', pay: 12, req: {}, shifts: 3 },
      { title: 'Bartender', pay: 26, req: { cha: 20 }, shifts: 8 },
      { title: 'Head Mixologist', pay: 48, req: { cha: 42, int: 20 }, shifts: 999 },
    ],
    perks: {
      1: { text: 'You hear everything: +10% odds on dates, and bar gossip gets you 5% more for product.', mult: { dateChance: 1.1, drugPrice: 1.05 } },
      2: { text: 'Head Mixologist: +$90/day from your signature cocktail ("The Rusty Divorce") and +10% casino winnings (drunks talk).', daily: 90, mult: { gambling: 1.1 } },
    },
    tips: true,
    lines: [
      'A man tells you his whole divorce. Then his second divorce. Then his third. He\'s 29.',
      'You make a "Sex on the Beach". It\'s just tequila and sand. Nobody notices.',
      'Someone throws up in the tip jar. That jar is now retired.',
      'You water down the whiskey. Sal waters it down again. It\'s just water now.',
    ],
    events: [
      { text: 'A drunk tips you $50 thinking it\'s a $5. You say nothing. Capitalism.', money: 50 },
      { text: 'A bar stool flies at your head. You duck. Mostly.', hp: -10 },
      { text: 'Someone leaves behind a "Found" Flatscreen. Sal says it\'s yours now.', item: 'stolen_tv' },
    ],
  },
  cop: {
    name: 'Rotwell PD', loc: 'rotwell_pd', boss: 'Chief Lardner', hours: null, energy: 11, gain: { str: 0.08, int: 0.06 },
    ranks: [
      { title: 'Cadet', pay: 20, req: { karma: 10, str: 20, int: 20 }, shifts: 5 },
      { title: 'Patrol Officer', pay: 40, req: { karma: 15, str: 32, int: 32 }, shifts: 8 },
      { title: 'Detective', pay: 75, req: { karma: 25, int: 55, course: 'crim_justice' }, shifts: 11 },
      { title: 'Captain', pay: 130, req: { karma: 35, str: 60, int: 75 }, shifts: 16 },
      { title: 'Chief of Police', pay: 240, req: { karma: 50, str: 80, int: 100, course: 'law' }, shifts: 999 },
    ],
    perks: {
      1: { text: 'Service weapon: a department 9mm. Fines and bribes cost 25% less (professional courtesy).', weapon: 'pistol', mult: { fineCost: 0.75 } },
      2: { text: 'Case files: you\'ve read the Golden Tooth\'s file (it counts as the casino job\'s inside line). Heat cools 30% faster.', mult: { heatDecay: 1.3 }, flag: 'perk_casino_file' },
      3: { text: 'Captain: +$350/day in "overtime". Crimes raise 25% less heat.', daily: 350, mult: { heatGain: 0.75 } },
      4: { text: 'Chief: +$1,200/day. The evidence locker is basically your pantry.', daily: 1200 },
    },
    lines: [
      'You write 14 parking tickets. One of them is to a parked bicycle.',
      'You eat a donut in the cruiser. It\'s the most peaceful moment of your life.',
      'You chase a suspect three blocks. It\'s a trash bag in the wind. You arrest it anyway.',
      'The Chief makes you file paperwork about the paperwork.',
      'You "lose" a bag of Glitter Gravy from the evidence locker. The evidence locker is the Chief.',
    ],
    events: [
      { text: 'You catch a purse snatcher! The old lady hits YOU with the purse. Still, good work.', karma: 2 },
      { text: 'A drug dealer offers you a bribe. You take it. Badge-ly done.', money: 120, karma: -3 },
      { text: 'Shots fired! You get grazed. Hazard pay is a pizza party (no pizza).', hp: -18, money: 25 },
    ],
  },
  bouncer: {
    name: 'Club Velvet', loc: 'club_velvet', boss: 'Velvet Vince', hours: [20, 3], energy: 10, gain: { str: 0.12, cha: 0.03 },
    ranks: [
      { title: 'Door Goon', pay: 24, req: { str: 30 }, shifts: 5 },
      { title: 'Head Bouncer', pay: 46, req: { str: 50, cha: 20 }, shifts: 10 },
      { title: 'Security Chief', pay: 80, req: { str: 75, cha: 35 }, shifts: 999 },
    ],
    perks: {
      1: { text: 'Door cred: brass knuckles from Vince, and the Golden Tooth\'s security guys owe you (the casino job\'s inside line).', weapon: 'brass', flag: 'perk_casino_file' },
      2: { text: 'Security Chief: +$200/day from "VIP arrangements". You take 10% less damage.', daily: 200, mult: { damageTaken: 0.9 } },
    },
    lines: [
      'You tell a man in a fedora he can\'t come in. He says "m\'lady" and leaves.',
      'You check 300 IDs. Forty say "McLovin". You let them in. Vince says it\'s good for business.',
      'You physically carry a bachelorette out of the bathroom. She was eating soap.',
      'A guy says "do you know who I am?" You do not. Neither does anyone.',
    ],
    events: [
      { text: 'A VIP slips you $100 to skip the line. You let in a man dressed as a horse.', money: 100 },
      { text: 'A brawler headbutts you. Your forehead wins, technically.', hp: -12 },
      { text: 'You bounce a city councilman. He gives you his card: "call me if you need a favor".', karma: 1 },
    ],
  },
  scrapper: {
    name: "Scrapper Pete's Junkyard", loc: 'junkyard', boss: 'Scrapper Pete', hours: [6, 21], energy: 11, gain: { str: 0.16 },
    ranks: [
      { title: 'Junk Sorter', pay: 12, req: {}, shifts: 3 },
      { title: 'Car Crusher', pay: 24, req: { str: 20 }, shifts: 8 },
      { title: 'Yard Boss', pay: 44, req: { str: 40, int: 20 }, shifts: 999 },
    ],
    perks: {
      1: { text: 'Pete\'s cast-off: a Rustbucket \'88 that "mostly runs". Junk & loot pawn for 40% more.', car: 'rustbucket', flag: 'perk_scrap_eye' },
      2: { text: 'Yard Boss: +$110/day in scrap contracts, and a free spike strip for heists every day (Pete has a pile).', daily: 110, flag: 'perk_spikes' },
    },
    lines: [
      'You sort 300 hubcaps by "vibe". Pete approves of your vibes.',
      'The junkyard dog, Mr. Chompers, stares at you for six hours. He doesn\'t blink. He never blinks.',
      'You crush a minivan. A family of raccoons evacuates, angry. One flips you off. You didn\'t know they could.',
      'You find a mannequin with your face. Pete says "don\'t worry about it".',
    ],
    events: [
      { text: 'You find copper wire in a dead fridge. Score!', item: 'copper_wire' },
      { text: 'Tetanus has entered the chat. You step on a nail.', hp: -10 },
      { text: 'Mr. Chompers bites you. Pete says it means he likes you.', hp: -6 },
      { text: 'You find $35 in a car seat. And a dentures. You keep the money.', money: 35 },
    ],
  },
};

// Pizza delivery customers (for flavor on each drop-off).
export const PIZZA_CUSTOMERS = [
  ['A guy in a bathrobe', '"Took you long enough. Wait, don\'t go. Do you like... magic tricks?" You leave.'],
  ['Three goths', '"We ordered it with extra darkness." It\'s just burnt. They\'re thrilled.'],
  ['An old lady', 'She pays entirely in nickels and a butterscotch. The butterscotch has hair on it.'],
  ['A frat house', 'They try to pay you in "exposure". You take a beer off the porch instead.'],
  ['A man covered in flour', '"I\'m a baker. I just hate my own food." Fair.'],
  ['A lonely cop', '"Don\'t tell the other cops I eat pizza. They think I only eat donuts." Weird power move.'],
  ['A naked guy', 'He opens the door wearing only a pizza box. He wants a second box. For the back.'],
  ['A wizard (claimed)', 'He tips you in "a blessing". It\'s just him flicking water at you.'],
];
