// Money sinks & late-game purchases (balance pass 6). Owned by the systems module (src/systems/ventures.js).
//
// VENTURES[id] = { name, where (location id it's tied to, flavor + a menu option there), price, daily ($ per
//   active day, paid into the bank), var (0..1 random swing on the daily), req: { level }, perk (text),
//   upgrades: [{ id, name, price, daily, desc, karma? }] }
// An "active day" = you spent at least ACTIVE_ENERGY energy since the last day tick (worked, trained,
// fought...). Sleeping through a week doesn't run a business: passive income, career retainers and savings
// interest only pay a quarter on lazy days.
export const ACTIVE_ENERGY = 40;
export const LAZY_MULT = 0.25;

export const VENTURES = {
  greasy: {
    name: 'The Greasy Spoon (25% stake)', where: 'greasy_spoon', price: 6000, daily: 220, var: 0.15, req: {},
    desc: 'Big Marge needs a new walk-in fridge and a silent partner who stays silent. You get a cut of every egg.',
    perk: 'Meals at the Greasy Spoon are on the house.',
    upgrades: [
      { id: 'fryer', name: 'Industrial deep fryer', price: 5000, daily: 160, desc: 'Fries anything. Marge has already fried a phone book. It sold.' },
      { id: 'breakfast', name: '24-hour breakfast', price: 14000, daily: 380, desc: 'Pancakes at 4 AM for drunks, cops and the clinically sleepless. A gold mine of syrup.' },
    ],
  },
  funland: {
    name: 'Whack-a-Rat booth, Funland Arcade', where: 'funland_arcade', price: 12000, daily: 300, var: 0.5, req: {},
    desc: 'A booth on the Blackwater boardwalk. The rats are real. They are unionizing.',
    perk: 'Free arcade tokens. The booth guy calls you "boss" and means it.',
    upgrades: [
      { id: 'claw', name: 'Rigged claw machine', price: 18000, daily: 420, karma: -3, desc: 'The claw has the grip strength of a wet noodle. Kids cry. You profit.' },
    ],
  },
  laundromat: {
    name: 'Suds & Duds Laundromat (a "front")', where: 'first_bank', price: 25000, daily: 380, var: 0.1, req: { level: 3 },
    desc: 'Twelve washers, three of which work. The real product is clean money.',
    perk: 'Launders your heist cash: the fence takes 15% instead of 30%. A raid can hit it if you sleep with 4+ heat.',
    upgrades: [
      { id: 'books', name: 'A second set of books', price: 40000, daily: 300, desc: 'One set for the IRS, one for you. The fence now takes only 8%.' },
    ],
  },
  butt: {
    name: 'Pizza Butt franchise (Hilltop)', where: 'pizza_butt', price: 60000, daily: 1300, var: 0.2, req: { level: 5 },
    desc: 'Your own Pizza Butt. The butt-shaped sign is legally distinct from Tony\'s butt-shaped sign.',
    perk: 'Pizza is free and your delivery tips are 25% bigger (the franchise owner\'s name opens doors).',
    upgrades: [
      { id: 'drive', name: 'Drive-thru window ("The Crack")', price: 45000, daily: 900, desc: 'Customers pull up to a window shaped like a crack. Branding.' },
    ],
  },
  chop: {
    name: 'Chop Chop Customs (silent partner)', where: 'chop_chop', price: 120000, daily: 2400, var: 0.3, req: { level: 6 },
    desc: 'Mama Chop needs capital and a partner who doesn\'t ask where the Porsches come from.',
    perk: 'A free Beige Getaway Sedan waits at every heist.',
    upgrades: [],
  },
  golden: {
    name: 'Golden Tooth Casino (1% share)', where: 'golden_tooth', price: 400000, daily: 7500, var: 0.6, req: { level: 8 },
    desc: 'One percent of the house. The house always wins, so now, a little bit, you always win.',
    perk: 'Vinnie\'s private room opens to you, and the house comps 10% of your table losses.',
    upgrades: [],
  },
  grimco: {
    name: 'Grimco board seat', where: 'grimco', price: 1500000, daily: 26000, var: 0.25, req: { level: 10 },
    desc: 'A seat at the table where Rotwell gets divided up. The chair is leather. The leather is from an intern.',
    perk: 'You vote on the city. Rent hikes, smog permits, the works. The ending remembers.',
    upgrades: [],
  },
};
export const VENTURE_ORDER = ['greasy', 'funland', 'laundromat', 'butt', 'chop', 'golden', 'grimco'];

// One-time charity "legacy" projects at the bank. Karma is capped so money can't buy the PD's karma gates
// on its own (38 karma for everything, spread over $1.4M).
export const LEGACY = {
  soup: { name: 'Gutterside Soup Kitchen wing', price: 5000, karma: 4, perk: 'Hobos and muggers leave you alone a bit more (heat cools 10% faster).', mult: { heatDecay: 1.1 } },
  clinic: { name: 'St. Mercy\'s free clinic', price: 25000, karma: 6, perk: 'Nurse Gertrude adores you: hospital bills cost 30% less.', mult: { deathPenalty: 0.7 } },
  shelter: { name: 'The Overpass Shelter (Reg approves)', price: 90000, karma: 8, perk: 'The street watches your back: 15% less heat from crimes.', mult: { heatGain: 0.85 } },
  library: { name: 'A library wing with your name on it', price: 300000, karma: 9, perk: '+10% INT gains. Mrs. Shush shushes you affectionately.', mult: { intGain: 1.1 } },
  park: { name: 'Rotwell Memorial Park (and a statue of you)', price: 1000000, karma: 11, perk: '+10% CHA gains: people recognize you. The pigeons recognize the statue.', mult: { chaGain: 1.1 } },
};
export const LEGACY_ORDER = ['soup', 'clinic', 'shelter', 'library', 'park'];

// Home improvements, per owned home. tier = minimum home tier (0 motel .. 4 manor).
export const HOME_UPGRADES = {
  safe: { name: 'Deadbolt & floor safe', price: 600, tier: 0, desc: 'Double stash space. Roaches and burglars stay out of it.' },
  gym: { name: 'Home gym (a bench and a mirror)', price: 3000, tier: 1, desc: 'Pump iron at home, any time, no membership. Brick would be proud. Brick is never proud.' },
  study: { name: 'Study nook', price: 2500, tier: 1, desc: 'A desk, a lamp, a stack of library books you will never return. Study at home.' },
  theater: { name: 'Home theater', price: 7500, tier: 2, desc: 'TV restores more energy, and the documentaries actually teach you something.' },
  grow: { name: 'Grow closet', price: 15000, tier: 2, desc: 'Grows 4 Cloud Cheese a day into this stash. -1 karma a day. Sleep here with 3+ heat and the cops might find it.' },
  hottub: { name: 'Hot tub', price: 20000, tier: 3, desc: 'Soak once a day: full energy and +3 Charm for 6 hours. Bubbles of victory.' },
  panic: { name: 'Panic room', price: 40000, tier: 3, desc: 'A steel box with a mini-fridge. You lose no cash when you get KO\'d or wrecked (your money is in here).' },
  cellar: { name: 'Wine cellar & ballroom', price: 80000, tier: 4, desc: 'Host a gala every 3 days: +Charm, +karma from the charity raffle, and a good date night.' },
  vault: { name: 'Manor vault', price: 120000, tier: 4, desc: 'Cash in this stash earns 0.4% a day (active days, up to $3M). Pemberton guards it with a letter opener.' },
  helipad: { name: 'Helipad', price: 300000, tier: 4, desc: 'Pemberton flies you to any district from the Manor. Traffic is for poor people.' },
};
export const HOME_UPGRADE_ORDER = ['safe', 'gym', 'study', 'theater', 'grow', 'hottub', 'panic', 'cellar', 'vault', 'helipad'];

// Status: things that change how Rotwell treats you (game.lifestyle.mult keys, see src/progress/perks.js).
export const STATUS = {
  manor: { text: 'Owning Grimsworth Manor: dates go better (+15%) and fines/bribes cost 15% less (nobody arrests a man with a butler).', mult: { dateChance: 1.15, fineCost: 0.85 } },
  penthouse: { text: 'Owning the Pinnacle Penthouse: +8% odds on dates.', mult: { dateChance: 1.08 } },
  supercar: { text: 'A $150k+ ride: +10% odds on dates and 5% off at shops (people comp the guy in the Stretch).', mult: { dateChance: 1.1, shopDiscount: 0.95 } },
  goldcar: { text: 'The Vendetta GT \'24K\': dealers pay 5% more (flash is credibility) and the Golden Tooth treats you like a whale.', mult: { drugPrice: 1.05 } },
};

// Collector's oddities: Lucky Larry's locked glass case. One of each, each with a small perk. All six = "Curator".
export const ODDITIES = {
  moonrock: { name: 'Genuine Moon Rock (Gravel)', price: 3000, perk: 'Larry swears it\'s from the moon. +2 karma for believing in something.', karma: 2 },
  glove: { name: 'Big Mother\'s Signed Fight Glove', price: 8000, perk: 'Still smells like her. +5% melee damage.', mult: { meleeDamage: 1.05 } },
  vtbag: { name: 'Velvet Thunder Bag, Mint In Box', price: 12000, perk: 'Dealers recognize a collector: +4% for product.', mult: { drugPrice: 1.04 } },
  dollar: { name: 'The First Dollar Grimsby Ever Stole', price: 25000, perk: 'Framed. Cursed. Lucrative: business ventures pay 5% more.', mult: { ventureIncome: 1.05 } },
  seat: { name: 'Golden Toilet Seat (Replica)', price: 60000, perk: 'A conversation piece: +5% odds on dates (they ask, you tell).', mult: { dateChance: 1.05 } },
  plunger: { name: 'Reg\'s Original Plunger', price: 150000, perk: 'The Plunger of Destiny. +10% XP. Reg cries when he sees it on your wall.', mult: { xpGain: 1.1 } },
};
export const ODDITY_ORDER = ['moonrock', 'glove', 'vtbag', 'dollar', 'seat', 'plunger'];

// Cosmetic Charm ("style") cap: outfits, hats, tattoos, piercings and surgery all feed one pool.
// Past the cap, cosmetics are just cosmetics. Keeps $100k of clothes from buying the CEO's Charm gate.
export const STYLE_CAP = 25;
