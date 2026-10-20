// Heists: data + writing. Owned by the heists module (src/heists).
//
// HEISTS[id] = {
//   id, name, tier, loc (target location id), dropoff (location id), blurb,
//   cooldown (game minutes), time (real seconds to pull it off), xp,
//   bags: { count, value:[min,max] }, extra:[min,max] (loose cash from registers etc.),
//   quietBonus (payout multiplier when no alarm went off),
//   unlock(game) -> { ok, why }      (level / stats / quest flags / faction rep)
//   guards: { quiet:[weapon...], loud:[weapon...] }, waves: { every (s), count, max, weapons }
//   objectives: { quiet:[...], loud:[...] }   objective specs (see below)
//   uses: gear ids that get consumed when you bring them
//   civ: optional flavor civilian { name, color, hat, lines[] }
// }
// Objective spec: { k, type, label, spot?, need?, fast?, pins?, rounds?, onDone? }
//   type: goto | mask | hold | lockpick | hack | truck_find | truck_stop | loot | escape
//   spot: door | left | right | farLeft | farRight | street | truckRear  (relative to the target door)
//   need: seconds of holding E; fast: { gearId: multiplier } (e.g. drill 0.45)
//   onDone: 'alarm' (goes loud) | 'cash' (adds the extra) | 'bags' (spawns the loot at this spot)

export const GEAR = {
  picks:        { name: 'Lockpick Set', price: 120, perm: true, desc: 'Twelve picks and a tension wrench. Without them you\'re jamming a bobby pin in there and praying.' },
  hacker:       { name: 'Hack-O-Matic 3000', price: 1500, perm: true, desc: 'A calculator duct-taped to a modem. Makes hacking a lot less like defusing a bomb with oven mitts.' },
  drill:        { name: 'Thermal Drill', price: 1200, desc: 'Chews through vault steel at twice the speed. Loud. Smells like burnt pennies. One use.' },
  thermite:     { name: 'Thermite Charge', price: 2200, desc: 'Melts doors, locks and eyebrows. Makes door work stupid fast. One use.' },
  spikes:       { name: 'Spike Strip', price: 500, desc: 'Toss it in front of a moving truck. Physics does the rest. One use.' },
  getaway:      { name: 'Beige Getaway Sedan', price: 800, car: 'commuter', desc: 'Waiting by the target. Nobody has ever looked twice at a beige sedan. One job.' },
  getaway_fast: { name: 'Thunderhog Getaway', price: 2600, car: 'thunderhog', desc: 'Waiting by the target, keys in the visor. Fast, loud, extremely suspicious. One job.' },
};
export const GEAR_ORDER = ['picks', 'hacker', 'drill', 'thermite', 'spikes', 'getaway', 'getaway_fast'];

// Masks: cosmetic, but you can't do crimes with your bare face hanging out.
export const MASKS = {
  stocking: { name: "Grandma's Pantyhose", price: 0, color: '#c49a7a', desc: 'Free. Smells like Werther\'s Originals and regret.' },
  pig:      { name: 'Rubber Pig', price: 150, color: '#e39aa6', desc: 'Oink. The cops will love the irony.' },
  clown:    { name: 'Sad Clown', price: 250, color: '#e8e2d6', desc: 'Kids cry. Adults cry. You cry, a little, inside it.' },
  hockey:   { name: 'Goalie Mask', price: 350, color: '#dcd6c4', desc: 'Says "I have a chainsaw" without the hassle of owning one.' },
  luchador: { name: 'Luchador', price: 600, color: '#b3263e', desc: 'Lucha libre energy. Crime dignity: maximum.' },
  skull:    { name: 'Chrome Skull', price: 1500, color: '#c8c8cc', desc: 'Very edgy. Very shiny. Fogs up instantly.' },
};

const q = (g) => g.quests;
const lvl = (g) => g.state.p.level || 1;
const done = (g, id) => (g.state.p.heists?.done?.[id] || 0) > 0;
const rep = (g, f) => { try { return q(g)?.rep?.(f) ?? Number(g.state.getFlag('rep_' + f, 0)) ?? 0; } catch { return 0; } };
const qDone = (g, id) => { try { return !!q(g)?.isDone?.(id); } catch { return false; } };

export const INTEL = {
  casino: { price: 4000, name: 'Golden Tooth floor plans', desc: 'Bought off a cocktail waitress who hates her boss. So, every cocktail waitress.' },
  grimco: { price: 15000, name: 'Grimco penthouse codes', desc: 'Sold by a fired IT guy for cash and the chance to watch it burn.' },
};

export const HEISTS = {
  gas: {
    id: 'gas', name: 'Gas-N-Gulp Stickup', tier: 1, loc: 'gas_n_gulp', dropoff: 'lucky_larrys',
    blurb: 'A corner store with a floor safe, one rent-a-cop and a night clerk who stopped caring in 2009. Training wheels.',
    cooldown: 12 * 60, time: 240, xp: 150, bags: { count: 2, value: [300, 480] }, extra: [120, 280], quietBonus: 1.25,
    reqText: 'Anyone with a mask and a pulse',
    unlock: () => ({ ok: true }),
    guards: { quiet: ['baton'], loud: ['baton', 'bat'] },
    waves: null,
    uses: ['drill'],
    civ: { name: 'Dwayne the Night Clerk', color: '#7a1f2b', hat: 'cap', hatColor: '#c9a227', lines: [
      'Take the scratch-offs too, man. I don\'t get paid enough.',
      'Can you, like, shoot the slushie machine? It\'s been making a noise.',
      'Is this gonna take long? My Hot Pocket is in.',
      'I didn\'t see nothin\'. I never see nothin\'. It\'s my best skill.',
    ] },
    objectives: {
      quiet: [
        { k: 'goto', type: 'goto', label: 'Get to the Gas-N-Gulp' },
        { k: 'mask', type: 'mask', label: 'Mask up (V)' },
        { k: 'backdoor', type: 'lockpick', label: 'Pick the stockroom door', spot: 'left', pins: 3 },
        { k: 'safe', type: 'hold', label: 'Crack the floor safe', spot: 'right', need: 10, fast: { drill: 0.45 }, verb: 'Cracking', onDone: 'bags' },
        { k: 'loot', type: 'loot', label: 'Grab the bags' },
        { k: 'escape', type: 'escape', label: 'Stash it at Lucky Larry\'s backroom' },
      ],
      loud: [
        { k: 'goto', type: 'goto', label: 'Get to the Gas-N-Gulp' },
        { k: 'mask', type: 'mask', label: 'Mask up (V)' },
        { k: 'register', type: 'hold', label: 'Rob the register', spot: 'door', need: 3, verb: 'Yelling at Dwayne', onDone: 'alarm,cash' },
        { k: 'safe', type: 'hold', label: 'Crack the floor safe', spot: 'right', need: 12, fast: { drill: 0.45 }, verb: 'Cracking', onDone: 'bags' },
        { k: 'loot', type: 'loot', label: 'Grab the bags' },
        { k: 'escape', type: 'escape', label: 'Stash it at Lucky Larry\'s backroom' },
      ],
    },
    headlines: [
      'GAS-N-GULP ROBBED BY {mask}-MASKED MORON(S); CLERK "DIDN\'T REALLY MIND"',
      'CORNER STORE STICKUP NETS {take}; ROLLER DOGS UNHARMED',
      'NIGHT CLERK DWAYNE DESCRIBES ROBBERS AS "CHILL, HONESTLY"',
    ],
  },

  truck: {
    id: 'truck', name: 'Armored Truck Hit', tier: 2, loc: 'first_bank', dropoff: 'chop_chop',
    blurb: 'A Grimco Armored Transport makes cash pickups downtown. Ram it, spike it, or boot it while the guards grab coffee at the bank.',
    cooldown: 24 * 60, time: 420, xp: 400, bags: { count: 4, value: [1500, 2100] }, extra: [0, 0], quietBonus: 1.25,
    reqText: 'Level 3 · pulled the Gas-N-Gulp job',
    unlock: (g) => (lvl(g) < 3 ? { ok: false, why: 'Level 3 needed. Terry doesn\'t work with infants.' }
      : !done(g, 'gas') ? { ok: false, why: 'Prove yourself on the Gas-N-Gulp first.' } : { ok: true }),
    guards: { quiet: ['pistol', 'baton'], loud: ['pistol', 'shotgun', 'pistol'] },
    waves: { every: 45, count: 2, max: 7, weapons: ['pistol', 'shotgun'] },
    uses: ['spikes', 'thermite'],
    objectives: {
      quiet: [
        { k: 'find', type: 'truck_find', label: 'Find the armored truck' },
        { k: 'mask', type: 'mask', label: 'Mask up (V)' },
        { k: 'stop', type: 'truck_stop', label: 'Boot its wheel while it\'s parked at a pickup (or ram/spike it)' },
        { k: 'doors', type: 'lockpick', label: 'Pick the rear doors', spot: 'truckRear', pins: 4, onDone: 'bags' },
        { k: 'loot', type: 'loot', label: 'Grab the bags' },
        { k: 'escape', type: 'escape', label: 'Get the cash to Chop Chop Customs' },
      ],
      loud: [
        { k: 'find', type: 'truck_find', label: 'Find the armored truck' },
        { k: 'mask', type: 'mask', label: 'Mask up (V)' },
        { k: 'stop', type: 'truck_stop', label: 'Stop the truck: ram it 3x, spike it, or boot it at a stop' },
        { k: 'doors', type: 'hold', label: 'Blow the rear doors', spot: 'truckRear', need: 10, fast: { thermite: 0.35 }, verb: 'Rigging charges', onDone: 'bags' },
        { k: 'loot', type: 'loot', label: 'Grab the bags' },
        { k: 'escape', type: 'escape', label: 'Get the cash to Chop Chop Customs' },
      ],
    },
    headlines: [
      'ARMORED TRUCK GUTTED DOWNTOWN; GUARDS BLAME "THE {mask} GUY"',
      'GRIMCO TRANSPORT LOSES {take}; CEO "ONLY MILDLY AROUSED BY THE INSURANCE CLAIM"',
      'TRUCK GUARD: "I WAS ON MY BREAK. I AM ALWAYS ON MY BREAK."',
    ],
  },

  bank: {
    id: 'bank', name: 'First Bank of Rotwell', tier: 3, loc: 'first_bank', dropoff: 'warehouse_13',
    blurb: 'The vault under First Bank. Drill it loud with the lobby on the floor, or pick, hack and crack it while the guards scroll their phones.',
    cooldown: 48 * 60, time: 480, xp: 900, bags: { count: 6, value: [3600, 5000] }, extra: [400, 900], quietBonus: 1.25,
    reqText: 'Level 5 · hit the armored truck',
    unlock: (g) => (lvl(g) < 5 ? { ok: false, why: 'Level 5 needed. Banks have, like, rules.' }
      : !done(g, 'truck') ? { ok: false, why: 'Hit the armored truck first. Terry needs to see you can handle a moving target.' } : { ok: true }),
    guards: { quiet: ['pistol', 'baton', 'pistol'], loud: ['pistol', 'pistol', 'shotgun', 'baton'] },
    waves: { every: 40, count: 2, max: 8, weapons: ['pistol', 'shotgun', 'smg'] },
    uses: ['drill', 'thermite'],
    civ: { name: 'Teller Marjorie', color: '#4b2a52', hat: null, lines: [
      'I have been robbed nine times. I have a punch card. One more and I get a free scone.',
      'Please don\'t take the pens. They\'re chained for a reason.',
      'The vault code is my ex-husband\'s birthday. I forgot it the day I signed the papers.',
    ] },
    objectives: {
      quiet: [
        { k: 'goto', type: 'goto', label: 'Get to First Bank of Rotwell' },
        { k: 'mask', type: 'mask', label: 'Mask up (V)' },
        { k: 'service', type: 'lockpick', label: 'Pick the service entrance', spot: 'farLeft', pins: 4 },
        { k: 'cams', type: 'hack', label: 'Loop the security cameras', spot: 'left', rounds: 3 },
        { k: 'vault', type: 'hold', label: 'Crack the vault', spot: 'right', need: 20, fast: { drill: 0.5 }, verb: 'Cracking the vault', onDone: 'bags,cash' },
        { k: 'loot', type: 'loot', label: 'Grab the bags' },
        { k: 'escape', type: 'escape', label: 'Haul it to Warehouse 13' },
      ],
      loud: [
        { k: 'goto', type: 'goto', label: 'Get to First Bank of Rotwell' },
        { k: 'mask', type: 'mask', label: 'Mask up (V)' },
        { k: 'lobby', type: 'hold', label: 'EVERYBODY ON THE FLOOR! (control the lobby)', spot: 'door', need: 3, verb: 'Screaming', onDone: 'alarm,cash' },
        { k: 'gate', type: 'hold', label: 'Cut the vault gate', spot: 'left', need: 8, fast: { thermite: 0.35 }, verb: 'Cutting' },
        { k: 'vault', type: 'hold', label: 'Drill the vault', spot: 'right', need: 26, fast: { drill: 0.45 }, verb: 'Drilling', onDone: 'bags' },
        { k: 'loot', type: 'loot', label: 'Grab the bags' },
        { k: 'escape', type: 'escape', label: 'Haul it to Warehouse 13' },
      ],
    },
    headlines: [
      'FIRST BANK OF ROTWELL ROBBED; {take} GONE, PENS STILL CHAINED',
      'BANK VAULT EMPTIED BY "{mask}-FACED LUNATICS" — TELLER GETS FREE SCONE',
      'BANK PRESIDENT: "WE ARE FULLY INSURED AND ALSO WE ARE RAISING YOUR FEES"',
    ],
  },

  casino: {
    id: 'casino', name: 'Golden Tooth Counting Room', tier: 4, loc: 'golden_tooth', dropoff: 'junkyard',
    blurb: 'Every losing bet in Rotwell ends up in one room behind the cage. The house always wins. Until tonight.',
    cooldown: 72 * 60, time: 540, xp: 1500, bags: { count: 6, value: [7500, 10500] }, extra: [800, 1800], quietBonus: 1.25,
    reqText: 'Level 6 · robbed the bank · an inside line (Rats/Syndicate rep 25 or bought floor plans)',
    unlock: (g) => {
      if (lvl(g) < 6) return { ok: false, why: 'Level 6 needed. The Golden Tooth eats amateurs.' };
      if (!done(g, 'bank')) return { ok: false, why: 'Hit First Bank first. Baby steps. Expensive baby steps.' };
      if (rep(g, 'rats') >= 25 || rep(g, 'syndicate') >= 25 || g.state.p.heists?.intel?.casino) return { ok: true };
      return { ok: false, why: 'You need an inside line: Gutter Rats or Velvet Syndicate rep 25, or buy the floor plans from Terry.' };
    },
    guards: { quiet: ['pistol', 'pistol', 'baton', 'smg'], loud: ['pistol', 'smg', 'shotgun', 'pistol', 'smg'] },
    waves: { every: 35, count: 2, max: 9, weapons: ['smg', 'shotgun', 'pistol'] },
    uses: ['drill', 'thermite'],
    civ: { name: 'Pit Boss Vinnie', color: '#2a1030', hat: 'fedora', hatColor: '#141414', lines: [
      'You know whose money this is? ...Yeah, me neither, it changes hands a lot.',
      'Fine. Take it. Just don\'t touch the buffet shrimp, they\'re load-bearing.',
      'This is the most exciting thing to happen here since the guy who ate a poker chip.',
    ] },
    objectives: {
      quiet: [
        { k: 'goto', type: 'goto', label: 'Get to The Golden Tooth' },
        { k: 'mask', type: 'mask', label: 'Mask up (V)' },
        { k: 'staff', type: 'lockpick', label: 'Pick the staff entrance', spot: 'farRight', pins: 4 },
        { k: 'cage', type: 'hack', label: 'Hack the cage\'s time lock', spot: 'right', rounds: 4 },
        { k: 'count', type: 'hold', label: 'Crack the counting room safe', spot: 'left', need: 22, fast: { drill: 0.5 }, verb: 'Cracking', onDone: 'bags,cash' },
        { k: 'loot', type: 'loot', label: 'Grab the bags' },
        { k: 'escape', type: 'escape', label: 'Bury it at Scrapper Pete\'s Junkyard' },
      ],
      loud: [
        { k: 'goto', type: 'goto', label: 'Get to The Golden Tooth' },
        { k: 'mask', type: 'mask', label: 'Mask up (V)' },
        { k: 'storm', type: 'hold', label: 'Storm the cage', spot: 'door', need: 3, verb: 'Waving your gun at grandmas', onDone: 'alarm,cash' },
        { k: 'door', type: 'hold', label: 'Breach the counting room door', spot: 'right', need: 12, fast: { thermite: 0.35 }, verb: 'Breaching' },
        { k: 'count', type: 'hold', label: 'Drill the counting room safe', spot: 'left', need: 26, fast: { drill: 0.45 }, verb: 'Drilling', onDone: 'bags' },
        { k: 'loot', type: 'loot', label: 'Grab the bags' },
        { k: 'escape', type: 'escape', label: 'Bury it at Scrapper Pete\'s Junkyard' },
      ],
    },
    headlines: [
      'GOLDEN TOOTH CASINO LOSES {take}; THE HOUSE, FOR ONCE, DID NOT WIN',
      'CASINO COUNTING ROOM CLEANED OUT BY "{mask}-FACED SICKOS"; BUFFET SHRIMP UNTOUCHED',
      'PIT BOSS VINNIE: "HONESTLY? RESPECT."',
    ],
  },

  grimco: {
    id: 'grimco', name: 'Grimco Tower Penthouse', tier: 5, loc: 'grimco', dropoff: 'hobo_camp',
    blurb: 'Mr. Grimsby keeps a private vault in his penthouse: bearer bonds, gold bars and a solid-gold toilet seat. The finale.',
    cooldown: 96 * 60, time: 600, xp: 3000, bags: { count: 8, value: [17000, 25000] }, extra: [2000, 5000], quietBonus: 1.3,
    reqText: 'Level 8 · cleaned out the casino · a way in (Grimco keycard, finished a faction storyline, or bought the codes)',
    unlock: (g) => {
      if (lvl(g) < 8) return { ok: false, why: 'Level 8 needed. Grimco security eats level 7s for breakfast.' };
      if (!done(g, 'casino')) return { ok: false, why: 'Pull the casino job first. This is the big one.' };
      const p = g.state.p;
      if ((p.inventory?.q_keycard_live || 0) > 0 || qDone(g, 'main_corp') || qDone(g, 'main_rats') || p.heists?.intel?.grimco) return { ok: true };
      return { ok: false, why: 'You need a way in: a working Grimco keycard, a finished faction storyline, or the penthouse codes from Terry.' };
    },
    guards: { quiet: ['smg', 'pistol', 'smg', 'pistol', 'rifle'], loud: ['smg', 'smg', 'rifle', 'shotgun', 'smg', 'pistol'] },
    waves: { every: 30, count: 3, max: 11, weapons: ['smg', 'rifle', 'shotgun'] },
    uses: ['drill', 'thermite'],
    civ: { name: 'Mr. Grimsby\'s Butler', color: '#141414', hat: 'tophat', hatColor: '#0a0a0a', lines: [
      'Master Grimsby will be most displeased. He will fire someone. Probably a whole town.',
      'The golden toilet seat is in the vault, sir. Do mind the splinters. They are also gold.',
      'Shall I fetch your getaway car, sir? ...No? Very good, sir. I\'ll just lie down, then.',
    ] },
    objectives: {
      quiet: [
        { k: 'goto', type: 'goto', label: 'Get to Grimco Tower' },
        { k: 'mask', type: 'mask', label: 'Mask up (V)' },
        { k: 'lobby', type: 'lockpick', label: 'Pick the loading dock door', spot: 'farLeft', pins: 5 },
        { k: 'elev', type: 'hack', label: 'Hack the penthouse elevator', spot: 'left', rounds: 4 },
        { k: 'alarm', type: 'hack', label: 'Kill the vault alarm', spot: 'farRight', rounds: 4 },
        { k: 'vault', type: 'hold', label: 'Crack Grimsby\'s vault', spot: 'right', need: 26, fast: { drill: 0.5 }, verb: 'Cracking', onDone: 'bags,cash' },
        { k: 'loot', type: 'loot', label: 'Grab the bags' },
        { k: 'escape', type: 'escape', label: 'Hide it under the overpass (nobody looks there)' },
      ],
      loud: [
        { k: 'goto', type: 'goto', label: 'Get to Grimco Tower' },
        { k: 'mask', type: 'mask', label: 'Mask up (V)' },
        { k: 'lobby', type: 'hold', label: 'Take the lobby', spot: 'door', need: 3, verb: 'Screaming at interns', onDone: 'alarm,cash' },
        { k: 'elev', type: 'hack', label: 'Hack the penthouse elevator', spot: 'left', rounds: 3 },
        { k: 'door', type: 'hold', label: 'Blow the penthouse door', spot: 'farRight', need: 12, fast: { thermite: 0.35 }, verb: 'Rigging charges' },
        { k: 'vault', type: 'hold', label: 'Drill Grimsby\'s vault', spot: 'right', need: 32, fast: { drill: 0.45 }, verb: 'Drilling', onDone: 'bags' },
        { k: 'loot', type: 'loot', label: 'Grab the bags' },
        { k: 'escape', type: 'escape', label: 'Hide it under the overpass (nobody looks there)' },
      ],
    },
    headlines: [
      'GRIMCO TOWER PENTHOUSE ROBBED; GRIMSBY\'S GOLDEN TOILET SEAT MISSING',
      'BILLIONAIRE LOSES {take}, STILL BILLIONAIRE; "I AM THE REAL VICTIM HERE," HE WEEPS FROM YACHT',
      'HOBOS UNDER OVERPASS SPOTTED WITH GOLD BARS; POLICE "TOO SCARED OF REG" TO ASK',
    ],
  },
};

export const HEIST_ORDER = ['gas', 'truck', 'bank', 'casino', 'grimco'];

// Where the loot gets taken (overridden by def.dropoff label if missing).
export const DROPOFF_LABEL = {
  lucky_larrys: "Lucky Larry's backroom", chop_chop: 'Chop Chop Customs', warehouse_13: 'Warehouse 13',
  junkyard: "Scrapper Pete's Junkyard", hobo_camp: 'Under the Overpass',
};

// ------------------------------------------------------------------ writing
export const PLANNER = {
  name: 'Two-Finger Terry',
  title: 'Heist Planner',
  color: '#3b3226', hat: 'fedora', hatColor: '#201a12',
  prompt: 'Talk to Two-Finger Terry <small>(heists)</small>',
  greet: [
    'Two-Finger Terry. I had ten. Bad jobs. Every finger\'s a lesson. This one\'s "don\'t trust a guy named Moose." This one\'s ALSO that.',
    'Psst. Back here. Behind the dumpster. No, the OTHER dumpster. The one that\'s an office.',
    'You smell like ambition and gas station burrito. I can work with that.',
    'Welcome to my office. Mind the needles, they\'re decorative.',
  ],
  board: [
    'Here\'s the board. Red string means connected. Brown string means I spilled coffee. Don\'t ask about the yellow string.',
    'Pick your poison. Small jobs, small prison sentences. Big jobs, big prison sentences, big yacht.',
  ],
  quiet: ['Quiet, eh? In and out like a ninja. A ninja who sweats a lot.', 'Smart. Nobody gets shot, nobody gets famous, everybody gets paid.'],
  loud: ['LOUD. I love it. Bring earplugs and a lawyer.', 'Going in hot? Do me a favor and scream something cool. Last guy yelled "I\'M NOT WEARING PANTS." He wasn\'t.'],
  noGear: ['You\'re going in with THAT? You\'ll be cracking that safe till your grandkids retire.', 'No drill? No thermite? Bold. Stupid, but bold.'],
  success: [
    'Ha! Look at you. A real criminal. Your mother would be... well, she\'d be something.',
    'Clean job. Clean-ish. Wipe your shoes before you come in.',
    'That\'s what I call a payday. Terry takes no cut. Terry takes "consulting fees". Which I have already taken. From the bag.',
  ],
  fail: [
    'You blew it. Happens. Happened to me eight times. *wiggles two fingers*',
    'Rough night? Go sleep it off. The board\'ll be here. Unlike your dignity.',
  ],
  locked: [
    'Not yet, champ. Come back when you\'re a bigger problem for society.',
    'That job needs more than you\'ve got. And you\'ve got very little.',
  ],
  cooldown: ['That place is crawling with cops after your last visit. Let it cool off.', 'Too hot. Give \'em time to forget your mask.'],
  who: [
    'Twenty years planning jobs in this town. I planned the Great Pudding Cup Heist of \'03. You\'ve never heard of it. That\'s how good it was.',
    'I don\'t do the jobs anymore. My hands are... *holds up two fingers* ...semi-retired.',
  ],
  busy: 'You\'re already on a job, genius. Finish it or call it off.',
};

export const GUARD_NAMES = ['Rent-a-Cop Randy', 'Security Steve', 'Officer Barely', 'Guard Doug', 'Night Watch Norm', 'Gary from Security',
  'Big Bertha', 'Deputy Dweeb', 'Mall Cop Mitch', 'Sgt. Snack Break', 'Kevin (Probation)', 'Lonnie the Lump'];

export const GUARD_BARKS = {
  idle: [
    'Six more hours. Six more hours of THIS.', 'I could\'ve been a dentist. Mom said so.', 'Is that a mouse? I hope it\'s a mouse.',
    '*checks phone* Nobody\'s texted. Nobody ever texts.', 'I\'m not paid enough to notice things.', 'Who keeps eating my yogurt?',
  ],
  sus: ['Huh? ...Hello?', 'Did someone fart? Or is someone THERE?', 'I\'m gonna pretend I didn\'t see that. ...Wait.', 'Who\'s there? Show yourself! Or don\'t. Either\'s fine.'],
  spot: ['HEY! MASK GUY!', 'Code red! CODE RED! ...What\'s code red again?', 'INTRUDER! Oh god, I have to do my job!', 'Somebody\'s robbing us! On MY shift?!'],
  alarm: ['Backup! BACKUP!', 'Light \'em up!', 'I\'m too young to get shot at!', 'This is why I wanted to be a dentist!', 'Drop the bag, dirtbag!'],
  radio: ['*kssht* Need backup at the— OW!', '*kssht* Uh, guys? Little help?', '*kssht* We got a situation. A sweaty situation.'],
};

export const RADIO = {
  start: [
    '📻 <b>Terry:</b> Alright, you\'re on the clock. Don\'t die, don\'t get caught, don\'t touch your face.',
    '📻 <b>Terry:</b> Good luck. And if you get pinched, you\'ve never heard of me. Or my fingers.',
  ],
  alarm: [
    '📻 <b>Police scanner:</b> All units, 2-11 in progress. Suspects wearing masks and terrible decisions.',
    '📻 <b>Police scanner:</b> Shots fired, repeat, shots fired. Somebody bring the good donuts.',
    '📻 <b>Terry:</b> Well, THAT went loud. Move faster. Like, way faster.',
  ],
  quietStep: [
    '📻 <b>Terry:</b> Smooth. Like a buttered weasel.',
    '📻 <b>Terry:</b> Nice. Nobody noticed. Keep it that way.',
    '📻 <b>Terry:</b> Textbook. A very dirty textbook.',
  ],
  loudStep: [
    '📻 <b>Terry:</b> Good! Keep moving, the cavalry\'s coming!',
    '📻 <b>Police scanner:</b> Units en route. ETA "when Dave finishes his sandwich".',
    '📻 <b>Terry:</b> That\'s the stuff! Now the hard part: everything else.',
  ],
  bags: [
    '📻 <b>Terry:</b> Bag it up! Don\'t count it there, you animal!',
    '📻 <b>Terry:</b> There\'s the money! Grab what you can carry. Bags slow you down, so don\'t get cute.',
  ],
  lowTime: ['📻 <b>Terry:</b> Clock\'s running out! Get to the drop or kiss it goodbye!', '📻 <b>Police scanner:</b> SWAT is suiting up. Repeat, SWAT is putting their little helmets on.'],
  truck: ['📻 <b>Terry:</b> The truck makes pickups downtown. It stops at the bank for a while. Guards gotta pee.'],
  dropoff: ['📻 <b>Terry:</b> Loot\'s in. Grab more or hit E at the drop to call it.'],
  fail: ['📻 <b>Terry:</b> ...And that\'s a wrap. A bad wrap. Like gas station sushi.'],
};

export const DROP_HOT = 'The drop crew won\'t open up with cops on your tail. Lose some heat first (under 3 stars).';
