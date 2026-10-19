// Blackwater Isle: pure layout data (no THREE). Shared by layout.js (roads,
// lots, district), island.js (geometry/physics) and the minimap.
//
// The island sits in the oily sea east of the Rustyards docks. A rusty
// drawbridge carries Route 9 from Dock Rd (580, 0) across the water to the
// island's west shore. Coordinates: +X = east, -Z = north (same as the city).

export const ISLE = { cx: 1070, cz: 0, A: 215, B: 220, p: 3.4 };
export const ISLE_X0 = 700;           // everything east of this is Blackwater
export const ISLE_MAX_X = 1330;       // physics / map bound on the east side
export const MAP_EXT = { minX: -700, maxX: 1340, minZ: -700, maxZ: 700 };

const TAU = Math.PI * 2;
const angDist = (a, b) => { let d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };

// Coastline radius (from the island center) at polar angle th = atan2(z - cz, x - cx).
export function coastR(th) {
  const { A, B, p } = ISLE;
  const c = Math.abs(Math.cos(th)) / A, s = Math.abs(Math.sin(th)) / B;
  let r = Math.pow(Math.pow(c, p) + Math.pow(s, p), -1 / p);
  // wobbly, deterministic shoreline (calm near the bridge landing in the west)
  const n = 7 * Math.sin(3 * th + 1.3) + 5 * Math.sin(5 * th + 0.4) + 3 * Math.sin(9 * th + 2.1) + 1.6 * Math.sin(17 * th + 0.7);
  const calm = 1 - Math.exp(-(angDist(th, Math.PI) ** 2) / 0.03);
  r += n * calm;
  // Smugglers' Cove: a bite out of the south-east shore
  r -= 52 * Math.exp(-(angDist(th, COVE_TH) ** 2) / (2 * 0.15 * 0.15));
  // Lighthouse point: a small headland in the north-west
  r += 16 * Math.exp(-(angDist(th, -2.36) ** 2) / (2 * 0.1 * 0.1));
  return r;
}
export const COVE_TH = 0.98;

export function isLand(x, z, margin = 0) {
  const dx = x - ISLE.cx, dz = z - ISLE.cz;
  if (dx < -260 || dx > 260 || dz < -260 || dz > 260) return false;
  return Math.hypot(dx, dz) < coastR(Math.atan2(dz, dx)) - margin;
}

// Point on the coast at angle th (optionally pushed out by `out` meters).
export function coastPoint(th, out = 0) {
  const r = coastR(th) + out;
  return [ISLE.cx + Math.cos(th) * r, ISLE.cz + Math.sin(th) * r];
}

// Where Route 9 hits the island (west shore, z = 0).
export const LAND_X = Math.round((ISLE.cx - coastR(Math.PI)) * 10) / 10;
export const BRIDGE = { x0: 580, x1: LAND_X + 6, z: 0, hw: 9, deckY: 0 };
export const TOLL_X = LAND_X + 14;

// Road kinds for the island (merged into layout KINDS).
export const ISLE_KINDS = {
  bridge: { hw: 8, sw: 1.2, lanes: [3.0], marks: 'double', light: 26 },
  isle: { hw: 7, sw: 4, lanes: [2.6], park: 5.2, marks: 'faded', light: 34 },
};

// Roads (axis aligned so the lot filler works). [x1, z1, x2, z2, kind, name]
export const RING_W = 905, RING_E = 1200, RING_N = -115, RING_S = 115, PEN_X = 1020;
export const ISLE_SEGMENTS = [
  [580, 0, BRIDGE.x1, 0, 'bridge', 'Blackwater Bridge'],
  [BRIDGE.x1, 0, RING_W, 0, 'isle', 'Causeway Ave'],
  [RING_W, 0, PEN_X, 0, 'isle', 'Causeway Ave'],
  [RING_W, RING_N, RING_W, RING_S, 'isle', 'Harbor Ln'],
  [RING_W, RING_N, RING_E, RING_N, 'isle', 'Cellblock Rd'],
  [RING_E, RING_N, RING_E, RING_S, 'isle', 'Funland Dr'],
  [RING_W, RING_S, RING_E, RING_S, 'isle', 'Boardwalk'],
  [PEN_X, -138, PEN_X, RING_S, 'isle', 'Pen Rd'],
];

// Hand-placed landmarks (world coords).
export const SPOTS = {
  funland: { x0: 1032, z0: -103, x1: 1188, z1: 103 },             // fenced park interior
  gate: { x: 1032, z: 0 },                                          // Funland main gate (west side)
  arcade: { cx: 1046, cz: -24, w: 22, d: 16 },                      // door faces west onto Pen Rd
  ferris: { x: 1140, z: -58, r: 21, hub: 24 },
  coaster: { cx: 1112, cz: 55, rx: 62, rz: 33 },
  carousel: { x: 1078, z: -72, r: 7 },
  prison: { x0: 960, z0: -198, x1: 1130, z1: -146, gateX: PEN_X },
  lighthouse: { x: 907, z: -170 },
  rustyHook: { cx: 940, cz: 62, w: 20, d: 14 },                     // east side of Harbor Ln, door faces west
  beachShack: { cx: 965, cz: 145, w: 14, d: 10 },                   // south of Boardwalk, door faces north
  pier: { x: 1040, z0: 150, z1: 285, w: 6 },                         // fishing pier heading south
  cove: { x: 1162, z: 139 },                                         // smugglers' shack on the cove beach
  ferry: { x0: 790, x1: 868, z: -62, w: 6 },                         // island ferry pier (west shore)
  cityFerry: { x: 684, z: -170 },                                    // Rustyards pier (z = -170) end
  tollBooth: { x: TOLL_X, z: -12.5 },
};

// Areas the generic lot filler must leave alone.
export const ISLE_RESERVED = [
  [SPOTS.funland.x0 - 2, SPOTS.funland.z0 - 2, SPOTS.funland.x1 + 2, SPOTS.funland.z1 + 2, 'funland'],
  [940, -260, 1160, -128, 'prison'],
  [860, -230, 935, -128, 'lighthouse'],
  [880, 126, 1240, 300, 'beach'],
  [1120, 70, 1300, 300, 'cove'],
  [SPOTS.rustyHook.cx - 14, SPOTS.rustyHook.cz - 15, SPOTS.rustyHook.cx + 12, SPOTS.rustyHook.cz + 15, 'rusty_hook'],
  [BRIDGE.x1 - 30, -30, RING_W - 10, 30, 'toll'],
  [1210, -300, 1330, 300, 'eastcliff'],
];

export const ISLE_FILL = { w: [12, 21], d: [10, 18], gapP: 0.75, gap: [4, 12], setback: [1, 3] };

// Is an axis-aligned rect a valid island building lot?
export function isleLotOk(r) {
  const m = 3;
  return isLand(r.x0, r.z0, m) && isLand(r.x1, r.z0, m) && isLand(r.x0, r.z1, m) && isLand(r.x1, r.z1, m) && isLand((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, m);
}

// Walkable decks over the water (bridge + piers): the water physics skips these.
export const DECKS = [
  [ISLE_X0 - 80, -BRIDGE.hw, BRIDGE.x1 + 4, BRIDGE.hw],
  [SPOTS.pier.x - SPOTS.pier.w / 2, SPOTS.pier.z0, SPOTS.pier.x + SPOTS.pier.w / 2, SPOTS.pier.z1],
  [SPOTS.ferry.x0, SPOTS.ferry.z - SPOTS.ferry.w / 2, SPOTS.ferry.x1, SPOTS.ferry.z + SPOTS.ferry.w / 2],
];
