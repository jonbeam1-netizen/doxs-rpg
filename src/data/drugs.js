// Fictional, cartoonish street products. A trading mechanic, not a how-to.
// Owned by the systems module (src/systems/market.js).
//
// base: average street price per unit. vol: daily random-walk volatility.
// min/max: hard clamps as a fraction of base.
// districts: price multiplier per district (cheap where it's made, pricey where the rich are).
// use: what happens if you sample the merchandise.
//   min: duration (game minutes), temp: {str,int,cha}, speed, energy, hp,
//   trip: { hue, sat, blur, contrast, invert, sepia, spin } screen effect, addict: addiction gained.
export const DRUGS = {
  glitter_gravy: {
    name: 'Glitter Gravy', base: 18, vol: 0.10, min: 0.35, max: 3.2, color: '#c9a227',
    desc: 'Sparkly brown sludge you snort off a spoon. Makes you feel like a Thanksgiving disco ball.',
    districts: { gutterside: 0.7, downtown: 1.0, rustyards: 0.85, dustbowl: 0.9, hilltop: 1.45 },
    use: { min: 90, energy: 25, speed: 1.08, trip: { hue: 40, sat: 1.6 }, addict: 5,
      text: 'Everything sparkles. You can taste the color brown. You feel like a holiday.' },
  },
  sad_clown: {
    name: 'Sad Clown Pills', base: 46, vol: 0.12, min: 0.35, max: 3.2, color: '#d84a8a',
    desc: 'Honk-shaped downers. Users report crying and juggling at the same time.',
    districts: { gutterside: 0.85, downtown: 1.0, rustyards: 1.15, dustbowl: 0.75, hilltop: 1.3 },
    use: { min: 120, hp: 25, speed: 0.85, temp: { cha: -2 }, trip: { sat: 0.25, blur: 1 }, addict: 7,
      text: 'A single tear rolls down your face. You honk softly. Your wounds feel distant and sad.' },
  },
  hobo_dust: {
    name: 'Hobo Dust', base: 95, vol: 0.13, min: 0.3, max: 3.5, color: '#8a7a5e',
    desc: 'Swept off the floor of a boxcar. Nobody knows what\'s in it, including the hobo.',
    districts: { gutterside: 0.65, downtown: 1.05, rustyards: 0.9, dustbowl: 0.8, hilltop: 1.6 },
    use: { min: 120, temp: { str: 6, cha: -4 }, trip: { sepia: 0.9, contrast: 1.3 }, addict: 8,
      text: 'You feel the strength of a thousand train-hopping drifters. You also smell like them.' },
  },
  cloud_cheese: {
    name: 'Cloud Cheese', base: 220, vol: 0.12, min: 0.35, max: 3.0, color: '#e8e2a0',
    desc: 'A pungent, fluffy cheese you smoke. Smells like feet in heaven.',
    districts: { gutterside: 1.1, downtown: 0.95, rustyards: 1.2, dustbowl: 0.7, hilltop: 1.25 },
    use: { min: 150, temp: { cha: 5, int: -3 }, speed: 0.92, energy: -10, trip: { blur: 1.2, hue: -25, sat: 1.3 }, addict: 6,
      text: 'You are SO chill right now. You realize hands are just meat forks. Whoa.' },
  },
  mumbletongue: {
    name: 'Mumbletongue', base: 480, vol: 0.15, min: 0.3, max: 3.4, color: '#4a7ad8',
    desc: 'Little blue tabs that make you fluent in a language nobody speaks.',
    districts: { gutterside: 1.25, downtown: 0.85, rustyards: 1.0, dustbowl: 1.3, hilltop: 0.9 },
    use: { min: 150, temp: { int: 9, cha: -5 }, trip: { hue: 180, spin: 90, sat: 1.8 }, addict: 9,
      text: 'You solve three equations nobody asked about. You try to say "hello" and it comes out "glorpus".' },
  },
  space_bees: {
    name: 'Space Bees', base: 950, vol: 0.17, min: 0.3, max: 3.6, color: '#e2d23a',
    desc: 'A buzzing powder imported from "up there". Do NOT ask where "up there" is.',
    districts: { gutterside: 1.3, downtown: 1.1, rustyards: 0.7, dustbowl: 1.05, hilltop: 1.2 },
    use: { min: 75, speed: 1.35, energy: 50, hp: -12, trip: { invert: 0.15, contrast: 1.5, hue: 60, spin: 240 }, addict: 13,
      text: 'BZZZZZZZZZ. Your legs are going faster than your thoughts. Your thoughts are also bees.' },
  },
  raccoon_tears: {
    name: 'Raccoon Tears', base: 1750, vol: 0.16, min: 0.3, max: 3.4, color: '#7a8a9a',
    desc: 'Harvested from heartbroken raccoons at midnight. Ethically questionable. Chemically delicious.',
    districts: { gutterside: 0.75, downtown: 1.0, rustyards: 1.15, dustbowl: 0.85, hilltop: 1.35 },
    use: { min: 180, temp: { cha: 9 }, energy: 15, trip: { sat: 1.5, contrast: 1.15, hue: -60 }, addict: 12, karma: -1,
      text: 'You feel deeply, devastatingly attractive. Somewhere, a raccoon is crying about it.' },
  },
  velvet_thunder: {
    name: 'Velvet Thunder', base: 4200, vol: 0.18, min: 0.3, max: 3.2, color: '#7a1f2b',
    desc: "Hilltop's designer drug. Comes in a tiny velvet bag with a business card and a NDA.",
    districts: { gutterside: 1.5, downtown: 1.15, rustyards: 1.25, dustbowl: 1.4, hilltop: 0.75 },
    use: { min: 180, temp: { str: 6, int: 6, cha: 6 }, energy: 40, speed: 1.12, trip: { hue: 300, sat: 2, contrast: 1.25, spin: 30 }, addict: 18,
      text: 'You feel like a hedge-fund manager at a yacht orgy. Everything is velvet. Everything is THUNDER.' },
  },
};

// Order shown in shops/tables (cheap -> expensive).
export const DRUG_ORDER = Object.keys(DRUGS).sort((a, b) => DRUGS[a].base - DRUGS[b].base);

// Dealer personalities, one per district (dealer handler uses loc.district).
export const DEALERS = {
  gutterside: { name: 'Twitchy Kev', greet: [
    "Kev's eye twitches. Then the other one. \"You buyin' or you a cop? If you're a cop you gotta tell me. That's the law. I think.\"",
    '"Yo yo yo. Welcome to Kev\'s Discount Pharma. No refunds, no receipts, no questions, no teeth."',
  ] },
  downtown: { name: 'Business Brenda', greet: [
    'Brenda checks her Bluetooth earpiece. "I have a 3 o\'clock. Make it quick, sweetie."',
    '"Brenda\'s Boutique Pharmaceuticals. We\'re disrupting the corner-store space."',
  ] },
  hilltop: { name: 'Sebastian', greet: [
    'A man in a cashmere turtleneck sniffs at you. "Ah. New money. Or... no money. Let\'s find out."',
    '"Sebastian. Purveyor of artisanal, small-batch, gluten-free contraband."',
  ] },
  rustyards: { name: 'Dockside Dmitri', greet: [
    'Dmitri leans on a shipping container that is definitely humming. "Fresh off boat. Do not ask which boat."',
    '"My cousin, he is customs inspector. So: no customs. Only inspecting of your money."',
  ] },
  dustbowl: { name: 'Meth-ew McConaissance', greet: [
    'A sunburnt cowboy with four teeth tips his hat. "Alright alright alright. Whatcha need, pardner?"',
    '"Desert\'s dry, prices are high, and so am I. Let\'s deal."',
  ] },
};

// Market event templates. {drug} and {district} are filled in.
export const MARKET_EVENTS = {
  bust: [
    'COPS RAID {drug} SUPPLIER — street prices go absolutely feral',
    'Police dog eats entire {drug} shipment, now "very happy, very fast"',
    'Feds seize warehouse of {drug}; junkies stage tearful vigil',
  ],
  shipment: [
    'Massive {drug} shipment washes ashore — prices crash harder than your uncle\'s Camaro',
    'Local chemistry teacher "goes into business"; {drug} suddenly everywhere',
    '{drug} found in city water supply; dealers forced into fire sale',
  ],
  craze: [
    'Hilltop influencers declare {drug} "the new kombucha"; demand skyrockets',
    'Celebrity spotted using {drug} at charity gala; everyone wants some',
  ],
  scare: [
    'Health scare: {drug} linked to "growing a second, smaller butt"; prices dip',
    'Rumor says {drug} is just cops in a bag; buyers spooked',
  ],
};
