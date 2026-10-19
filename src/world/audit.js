// Dev-only world audit: scans every collider registered while the city was
// built (props, buildings, fences) for overlaps, things standing on the road,
// buildings on sidewalks, and props whose geometry doesn't reach the ground.
//
//   window.__worldAudit()            -> { counts, issues }   (also console.table)
//   window.__worldAudit({ near: [x, z, r] })   filter to an area
//
// Each record: { b: physics box, ctx: build phase/owner, own: owner id, y: lowest
// vertex emitted with this collider }. Owners never conflict with themselves
// (a gas station's pumps may touch its canopy posts), everything else must not.

const area = (a, b) => Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) * Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));

export function runAudit(recs, layout, { near = null, limit = 80 } = {}) {
  const { nodes, edgeInfo } = layout;
  const kindOf = (r) => {
    const b = r.b, w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    if (b.tag === 'water') return 'water';
    if (Math.min(w, d) < 0.7 && Math.max(w, d) > 1.8) return 'fence';
    if ((w * d >= 12 && b.height >= 2.5) || b.tag === 'building') return 'building';
    return 'prop';
  };
  const list = recs.filter((r) => r.b.tag !== 'water').map((r) => ({ ...r, kind: kindOf(r) }));
  // spatial grid
  const CELL = 20, grid = new Map();
  list.forEach((r, i) => {
    const b = r.b;
    for (let x = Math.floor(b.minX / CELL); x <= Math.floor(b.maxX / CELL); x++) for (let z = Math.floor(b.minZ / CELL); z <= Math.floor(b.maxZ / CELL); z++) {
      const k = x + ',' + z; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i);
    }
  });
  const issues = [];
  const add = (type, r, extra = {}) => {
    const b = r.b, x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
    if (near && Math.hypot(x - near[0], z - near[1]) > near[2]) return;
    issues.push({ type, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, ctx: r.ctx, ...extra });
  };
  const seen = new Set();
  list.forEach((r, i) => {
    const b = r.b;
    const cand = new Set();
    for (let x = Math.floor(b.minX / CELL); x <= Math.floor(b.maxX / CELL); x++) for (let z = Math.floor(b.minZ / CELL); z <= Math.floor(b.maxZ / CELL); z++) for (const j of grid.get(x + ',' + z) ?? []) if (j > i) cand.add(j);
    for (const j of cand) {
      const q = list[j];
      if (q.own === r.own) continue;
      const a = area(b, q.b);
      if (a <= 0) continue;
      const kinds = [r.kind, q.kind].sort().join('/');
      const key = i + '|' + j;
      if (seen.has(key)) continue; seen.add(key);
      if (kinds === 'building/building' && a > 0.5) add('building-overlap', r, { with: q.ctx, area: +a.toFixed(2) });
      else if ((kinds === 'building/prop' || kinds === 'fence/prop' || kinds === 'prop/prop') && a > 0.04) add('prop-overlap', r.kind === 'prop' ? r : q, { with: (r.kind === 'prop' ? q : r).ctx, kinds, area: +a.toFixed(2) });
      else if (kinds === 'building/fence' && a > 0.15) add('fence-in-building', r, { with: q.ctx, area: +a.toFixed(2) });
    }
    // floating: geometry that came with this collider never reaches the ground
    if (r.kind === 'prop' && r.y > 0.2 && r.y < 50 && !r.elevated) add('floating', r, { y: +r.y.toFixed(2) });
  });
  // road / sidewalk bands (axis-aligned edges)
  for (const e of edgeInfo) {
    if (!e.axis || e.kind === 'bridge') continue;
    const A = nodes[e.a], B = nodes[e.b];
    const road = e.axis === 'x'
      ? { minX: Math.min(A.x, B.x), maxX: Math.max(A.x, B.x), minZ: A.z - e.hw, maxZ: A.z + e.hw }
      : { minX: A.x - e.hw, maxX: A.x + e.hw, minZ: Math.min(A.z, B.z), maxZ: Math.max(A.z, B.z) };
    const walk = e.axis === 'x'
      ? { minX: road.minX, maxX: road.maxX, minZ: road.minZ - e.sw, maxZ: road.maxZ + e.sw }
      : { minX: road.minX - e.sw, maxX: road.maxX + e.sw, minZ: road.minZ, maxZ: road.maxZ };
    const cand = new Set();
    for (let x = Math.floor(walk.minX / CELL); x <= Math.floor(walk.maxX / CELL); x++) for (let z = Math.floor(walk.minZ / CELL); z <= Math.floor(walk.maxZ / CELL); z++) for (const j of grid.get(x + ',' + z) ?? []) cand.add(j);
    for (const j of cand) {
      const r = list[j];
      if (r.ctx === 'parked' || r.ctx === 'barricade' || r.ctx === 'drag') continue; // meant to sit on the road
      if (area(r.b, road) > 0.05) add(r.kind === 'building' ? 'building-on-road' : 'on-road', r, { edge: e.name });
      else if (r.kind === 'building' && area(r.b, walk) > 0.3) add('building-on-sidewalk', r, { edge: e.name });
    }
  }
  const counts = {};
  for (const i of issues) counts[i.type] = (counts[i.type] ?? 0) + 1;
  counts.colliders = list.length;
  return { counts, issues: issues.slice(0, limit), all: issues };
}
