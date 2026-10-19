// Weapons. Shared by combat (src/npc) and shops (src/systems gun shop / pawn).
// kind: 'melee' | 'gun'
// damage: per hit (melee adds a STR bonus in combat code), range in world units,
// rate: seconds between attacks, ammo: ammo type id for guns, mag: shots per reload.
export const WEAPONS = {
  fists:      { name: 'Fists',          kind: 'melee', damage: 8,  range: 1.6, rate: 0.40, price: 0,     reqStr: 0 },
  brass:      { name: 'Brass Knuckles', kind: 'melee', damage: 14, range: 1.6, rate: 0.38, price: 120,   reqStr: 8 },
  bottle:     { name: 'Broken Bottle',  kind: 'melee', damage: 12, range: 1.7, rate: 0.45, price: 5,     reqStr: 0 },
  bat:        { name: 'Baseball Bat',   kind: 'melee', damage: 20, range: 2.2, rate: 0.65, price: 250,   reqStr: 12, swing: 'overhead' },
  knife:      { name: 'Switchblade',    kind: 'melee', damage: 18, range: 1.7, rate: 0.35, price: 300,   reqStr: 10 },
  crowbar:    { name: 'Crowbar',        kind: 'melee', damage: 24, range: 2.1, rate: 0.70, price: 400,   reqStr: 18, swing: 'overhead' },
  machete:    { name: 'Machete',        kind: 'melee', damage: 32, range: 2.3, rate: 0.60, price: 900,   reqStr: 30 },
  sledge:     { name: 'Sledgehammer',   kind: 'melee', damage: 48, range: 2.4, rate: 1.10, price: 1500,  reqStr: 45, swing: 'overhead' },
  pistol:     { name: '9mm Pistol',     kind: 'gun',   damage: 22, range: 45,  rate: 0.30, price: 1200,  ammo: 'light', mag: 12, spread: 0.03 },
  revolver:   { name: 'Hand Cannon',    kind: 'gun',   damage: 45, range: 55,  rate: 0.70, price: 3000,  ammo: 'heavy', mag: 6,  spread: 0.02 },
  shotgun:    { name: 'Sawed-Off',      kind: 'gun',   damage: 14, range: 18,  rate: 0.90, price: 4500,  ammo: 'shells', mag: 2, pellets: 7, spread: 0.18 },
  smg:        { name: 'Uzi-ish SMG',    kind: 'gun',   damage: 14, range: 35,  rate: 0.08, price: 9000,  ammo: 'light', mag: 30, spread: 0.07 },
  rifle:      { name: 'Hunting Rifle',  kind: 'gun',   damage: 80, range: 110, rate: 1.20, price: 14000, ammo: 'heavy', mag: 5,  spread: 0.005 },
  goldengun:  { name: 'Golden Deagle',  kind: 'gun',   damage: 120, range: 80, rate: 0.55, price: 250000, ammo: 'heavy', mag: 7, spread: 0.01 },
};

export const AMMO = {
  light:  { name: '9mm rounds (box of 30)', price: 60,  qty: 30 },
  heavy:  { name: 'Heavy rounds (box of 12)', price: 110, qty: 12 },
  shells: { name: 'Shotgun shells (box of 10)', price: 90,  qty: 10 },
};
