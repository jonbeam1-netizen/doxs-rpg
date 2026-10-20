// Career ladders. Owned by the systems module (src/systems/jobs.js).
//
// loc: location id where you work. hours: [open, close) when shifts can START (null = 24/7).
// energy: energy per hour worked. gain: stat gain per hour (scaled by diminishing returns).
// ranks[i]: { title, pay ($/hour), req: {str,int,cha,karma,course,level}, shifts: shifts at this rank before the
//            next promotion is considered }
// kind: 'shift' (pick 2/4/8h, time skips) | 'delivery' (Pizza Butt timed missions; pay = per delivery)
// events: random things that happen on a shift. { text, money?, hp?, energy?, cha?, karma?, heat? }
export const JOBS = {
  diner: {
    name: 'The Greasy Spoon', loc: 'greasy_spoon', boss: 'Big Marge', hours: [5, 23], energy: 9, gain: { str: 0.04 },
    ranks: [
      { title: 'Dishwasher', pay: 10, req: {}, shifts: 4 },
      { title: 'Line Cook', pay: 16, req: { str: 8, int: 8 }, shifts: 8 },
      { title: 'Shift Manager', pay: 24, req: { int: 18, cha: 15 }, shifts: 999 },
    ],
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
      { title: 'Delivery Monkey', pay: 12, req: {}, shifts: 4 },
      { title: 'Senior Delivery Driver', pay: 20, req: { cha: 10 }, shifts: 8 },
      { title: 'Assistant Butt Manager', pay: 32, req: { int: 20, cha: 20 }, shifts: 999 },
    ],
    lines: ['"Remember: if it\'s not there in time, it\'s free. And then YOU pay for it." - Tony Butt'],
    events: [],
  },
  factory: {
    name: 'Rotwell Meat & Rendering', loc: 'meat_plant', boss: 'Foreman Gristle', hours: [5, 23], energy: 13, gain: { str: 0.22 },
    ranks: [
      { title: 'Gut Shoveler', pay: 14, req: { str: 10 }, shifts: 5 },
      { title: 'Bone Saw Operator', pay: 22, req: { str: 25 }, shifts: 10 },
      { title: 'Rendering Foreman', pay: 38, req: { str: 50, int: 15 }, shifts: 14 },
      { title: 'Plant Boss', pay: 62, req: { str: 85, int: 35 }, shifts: 999 },
    ],
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
      { title: 'Unpaid-ish Intern', pay: 12, req: { int: 15 }, shifts: 5 },
      { title: 'Spreadsheet Goblin', pay: 26, req: { int: 30, cha: 15 }, shifts: 10 },
      { title: 'Middle Manager', pay: 52, req: { int: 60, cha: 40 }, shifts: 14 },
      { title: 'VP of Synergy', pay: 120, req: { int: 100, cha: 75, course: 'mba' }, shifts: 20 },
      { title: 'CEO', pay: 320, req: { int: 160, cha: 130, course: 'mba' }, shifts: 999 },
    ],
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
      { title: 'Barback', pay: 11, req: {}, shifts: 4 },
      { title: 'Bartender', pay: 18, req: { cha: 20 }, shifts: 10 },
      { title: 'Head Mixologist', pay: 32, req: { cha: 50, int: 20 }, shifts: 999 },
    ],
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
      { title: 'Cadet', pay: 16, req: { karma: 10, str: 20, int: 20 }, shifts: 6 },
      { title: 'Patrol Officer', pay: 28, req: { karma: 15, str: 35, int: 35 }, shifts: 10 },
      { title: 'Detective', pay: 50, req: { karma: 25, int: 70, course: 'crim_justice' }, shifts: 14 },
      { title: 'Captain', pay: 90, req: { karma: 40, str: 80, int: 100 }, shifts: 20 },
      { title: 'Chief of Police', pay: 170, req: { karma: 60, str: 110, int: 140, course: 'law' }, shifts: 999 },
    ],
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
      { title: 'Door Goon', pay: 17, req: { str: 30 }, shifts: 6 },
      { title: 'Head Bouncer', pay: 32, req: { str: 60, cha: 20 }, shifts: 12 },
      { title: 'Security Chief', pay: 55, req: { str: 100, cha: 40 }, shifts: 999 },
    ],
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
      { title: 'Junk Sorter', pay: 10, req: {}, shifts: 4 },
      { title: 'Car Crusher', pay: 17, req: { str: 20 }, shifts: 10 },
      { title: 'Yard Boss', pay: 30, req: { str: 45, int: 20 }, shifts: 999 },
    ],
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
