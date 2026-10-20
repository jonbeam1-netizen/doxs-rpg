// Every ride in Rotwell, from pedal-powered shame to ex-military overkill.
// Owned by the vehicles module (src/vehicles).
//
// CARS[id] = {
//   name, price, topSpeed (mph shown on the HUD), accel (1-10), handling (1-10),
//   kind: 'bike'|'car'|'truck'|'moto', color (default paint), seats, desc,
//   hp (body durability), tier: 'junk'|'mid'|'rich' (grime/chrome level),
//   model (procedural model style in src/vehicles/models.js), features (model extras),
//   secret (not sold at the dealer; quests/rewards use vehicles.giveCar)
// }

// World units per second for each displayed mph.
export const MPH = 0.3;

export const CARS = {
  bmx: {
    name: "Lil' Shredder BMX", price: 150, topSpeed: 42, accel: 6, handling: 9, kind: 'bike',
    color: '#b8326f', seats: 1, hp: 40, tier: 'junk', model: 'bmx',
    desc: 'Pedal-powered. Pegs included, dignity sold separately. Previous owner was twelve and still cooler than you.',
  },
  moped: {
    name: 'Sputter 49cc Moped', price: 900, topSpeed: 50, accel: 4, handling: 7, kind: 'moto',
    color: '#7fa3a0', seats: 1, hp: 60, tier: 'junk', model: 'moped',
    desc: 'Top speed of a disappointed jogger. Sounds like a wasp trapped in a soda can. Chicks hate it.',
  },
  rustbucket: {
    name: "Rustbucket '88", price: 2200, topSpeed: 78, accel: 3, handling: 3, kind: 'car',
    color: '#7a5a3a', seats: 4, hp: 90, tier: 'junk', model: 'sedan',
    features: { junk: true, rims: 'steel', mismatchedDoor: true, primer: true },
    desc: 'Four wheels, three of them working. The check-engine light is load-bearing. Smells like wet dog and divorce.',
  },
  wanda: {
    name: 'Windowless Wanda', price: 4500, topSpeed: 76, accel: 3, handling: 3, kind: 'truck',
    color: '#9a8a70', seats: 2, hp: 150, tier: 'junk', model: 'van',
    features: { junk: true, rims: 'steel', roofRack: true },
    desc: 'A panel van with zero windows and a mattress in the back. Every cop in Rotwell already has the plate memorized.',
  },
  puddlejumper: {
    name: 'Puddlejumper Hatch', price: 5500, topSpeed: 92, accel: 5, handling: 6, kind: 'car',
    color: '#5f7a6a', seats: 4, hp: 100, tier: 'mid', model: 'hatch',
    features: { rims: 'steel', roofRack: false },
    desc: 'Gets forty miles to the gallon and zero phone numbers. The horn plays a sad little "meep".',
  },
  dirtwagon: {
    name: 'Dirtwagon Pickup', price: 9000, topSpeed: 95, accel: 5, handling: 4, kind: 'truck',
    color: '#8a2f22', seats: 2, hp: 170, tier: 'junk', model: 'pickup',
    features: { junk: true, rims: 'steel', mattress: true },
    desc: 'Bed fits two mattresses or one bad decision. Truck nuts not included, but the hitch is begging for them.',
  },
  commuter: {
    name: 'Beige Commuter LX', price: 11000, topSpeed: 108, accel: 5, handling: 6, kind: 'car',
    color: '#b8ad8c', seats: 4, hp: 120, tier: 'mid', model: 'sedan',
    features: { rims: 'steel', hubcaps: true },
    desc: 'The automotive equivalent of "per my last email". Nobody has ever been aroused in this car. Not once.',
  },
  widowmaker: {
    name: 'Widowmaker 750', price: 12500, topSpeed: 135, accel: 8, handling: 7, kind: 'moto',
    color: '#1d1d1d', seats: 1, hp: 70, tier: 'mid', model: 'moto',
    desc: "Organ donors' favorite ride. Comes with a free helmet coupon that expired in 2009.",
  },
  hearse: {
    name: 'Final Ride Hearse', price: 14000, topSpeed: 105, accel: 5, handling: 4, kind: 'car',
    color: '#141414', seats: 2, hp: 150, tier: 'mid', model: 'hearse',
    features: { chromeBumpers: true, rims: 'chrome', landau: true, curtains: true },
    desc: "Previous owner is still in the back. He's very quiet. Great listener. Doesn't judge your music.",
  },
  thunderhog: {
    name: 'Thunderhog SS', price: 32000, topSpeed: 150, accel: 8, handling: 5, kind: 'car',
    color: '#a8241a', seats: 2, hp: 150, tier: 'mid', model: 'muscle',
    features: { stripes: true, scoop: true, spoiler: 'lip', chromeBumpers: true, rims: 'chrome', exhaust: 2 },
    desc: 'Burns rubber, gas and marriages. The hood scoop does nothing. It is purely emotional support.',
  },
  vendetta: {
    name: 'Vendetta GT', price: 85000, topSpeed: 178, accel: 9, handling: 9, kind: 'car',
    color: '#d4a017', seats: 2, hp: 130, tier: 'rich', model: 'sports',
    features: { spoiler: 'wing', rims: 'black', sideIntakes: true, exhaust: 2 },
    desc: 'Italian-ish. Leather stitched by tiny, overpaid hands. Compensates for things you did not even know you lacked.',
  },
  stretch: {
    name: 'Grimsworth Stretch', price: 150000, topSpeed: 115, accel: 4, handling: 2, kind: 'car',
    color: '#e3ded2', seats: 8, hp: 230, tier: 'rich', model: 'limo',
    features: { chromeBumpers: true, rims: 'chrome', pillars: 4, chromeTrim: true },
    desc: 'A hot tub of legroom and a minibar restocked by a man named Chad. Turns corners like a cruise ship. Prom night forever.',
  },

  // ---- Secret / endgame (not sold; quests & rewards call vehicles.giveCar) ----
  goliath: {
    name: "Goliath M9 'Bunker Buster'", price: 220000, topSpeed: 112, accel: 6, handling: 3, kind: 'truck',
    color: '#4a5030', seats: 6, hp: 650, tier: 'junk', model: 'military', secret: true,
    features: { rims: 'black', armor: true },
    desc: 'Decommissioned, recommissioned, then "lost" out of Bunker 9. Bulletproof, idiot-proof, parking-space-proof.',
  },
  interceptor: {
    name: 'Rotwell PD Interceptor', price: 40000, topSpeed: 140, accel: 7, handling: 6, kind: 'car',
    color: '#141414', seats: 4, hp: 200, tier: 'mid', model: 'sedan', secret: true,
    features: { rims: 'black', lightbar: true, pushbar: true, twoTone: '#e8e4da' },
    desc: 'Still smells like donuts and civil-rights violations. Other drivers part like the Red Sea.',
  },
  vendetta_oro: {
    name: "Vendetta GT '24K'", price: 500000, topSpeed: 190, accel: 10, handling: 9, kind: 'car',
    color: '#d4a52a', seats: 2, hp: 160, tier: 'rich', model: 'sports', secret: true,
    features: { spoiler: 'wing', rims: 'gold', sideIntakes: true, exhaust: 2, gold: true },
    desc: 'Solid gold trim, terrible aerodynamics, worse taste. The ultimate "I won Rotwell" ride.',
  },
};

// Paint swatches for the dealer and the chop shop.
export const CAR_COLORS = [
  { name: 'Smog Gray', hex: '#6b6a66' },
  { name: 'Nicotine Beige', hex: '#b8ad8c' },
  { name: 'Dried Blood', hex: '#6e1a14' },
  { name: 'Lipstick Red', hex: '#b0231b' },
  { name: 'Rust Belt Orange', hex: '#a8561f' },
  { name: 'Mustard Stain', hex: '#c49a23' },
  { name: 'Bile Green', hex: '#7d8a2c' },
  { name: 'Sewer Teal', hex: '#2f6b66' },
  { name: 'Bruise Purple', hex: '#4b2a52' },
  { name: 'Cop-Bait Blue', hex: '#244f8a' },
  { name: 'Ambulance White', hex: '#dcd8cc' },
  { name: 'Midnight Grime', hex: '#151414' },
];

export const TRAFFIC_COLORS = ['#6b6a66', '#b8ad8c', '#6e1a14', '#a8561f', '#7d8a2c', '#2f6b66', '#244f8a', '#dcd8cc', '#151414', '#4a4038', '#5a5f63', '#8a7a5a'];

// Chop shop upgrades. Price = base[tier-1] * carScale(def).
export const UPGRADES = {
  engine:   { name: 'Engine', tiers: 3, base: [900, 2400, 5500], desc: 'More horses. Some of them are even alive.' },
  handling: { name: 'Handling', tiers: 3, base: [700, 1800, 4200], desc: 'Stiffer springs, stickier tires, louder opinions.' },
  armor:    { name: 'Armor', tiers: 3, base: [1100, 2800, 6500], desc: 'Bolted-on steel plates. Mostly from old dumpsters.' },
};

export function carScale(def) {
  return Math.max(0.5, Math.min(3, Math.sqrt((def?.price || 5000) / 9000)));
}
