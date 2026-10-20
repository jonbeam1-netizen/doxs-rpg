// Player footsteps (surface-aware, cadence follows the stickman walk cycle) + landing thuds.
// Reads game.player state each frame; no changes needed in the player module.
import { BRIDGE, SPOTS, DECKS, isLand, ISLE_X0, RING_S } from '../world/island-layout.js';

const DOCK_PIERS = [-420, -170, 160, 410]; // Rustyards wooden piers (src/world/districts.js), x 620..688
const WATER_X = 620;

// 'pavement' | 'wet' | 'dirt' | 'sand' | 'wood' | 'metal'
export function surfaceAt(game, x, z) {
  let s = 'pavement';
  try {
    // Blackwater Bridge deck (steel grating), from the quay out to the island landing
    if (x > WATER_X - 20 && x < BRIDGE.x1 && Math.abs(z - BRIDGE.z) < BRIDGE.hw + 1) return 'metal';
    // wooden piers & decks
    if (x >= WATER_X - 1 && x < 690) { for (const pz of DOCK_PIERS) if (Math.abs(z - pz) < 5.2) return 'wood'; }
    for (let i = 1; i < DECKS.length; i++) { const d = DECKS[i]; if (x >= d[0] && x <= d[2] && z >= d[1] && z <= d[3]) return 'wood'; }
    if (x > ISLE_X0) {
      // the boardwalk strip south of Boardwalk road, then the beach
      if (x > 900 && x < 1205 && z > RING_S + 6 && z < RING_S + 12) return 'wood';
      if (z > RING_S + 12 && isLand(x, z)) return 'sand';
      if (x > SPOTS.cove.x - 40 && z > 90 && isLand(x, z)) return 'sand';
    }
    const d = game.world?.districtAt?.(x, z);
    if (d === 'dustbowl') s = 'dirt';
  } catch { /* fall through */ }
  if (s === 'pavement') {
    const w = game.world?.weather;
    if (w === 'rain' || w === 'storm') s = 'wet';
  }
  return s;
}

export function installFootsteps(game) {
  let phase = 0, lastHalf = 0, airborne = false, airT = 0, wasMoving = false;
  let surf = 'pavement', surfT = 0;

  game.addSystem({
    name: 'footsteps',
    update(dt) {
      const A = game.audio, pl = game.player;
      if (!game.started || !A?.running?.() || !pl?.group) return;
      if (pl.vehicle || pl.dead || game.skate?.on || !pl.group.visible) { airborne = false; return; }
      try {
        const p = pl.group.position;
        surfT -= dt;
        if (surfT <= 0) { surfT = 0.25; surf = surfaceAt(game, p.x, p.z); }

        // landing after a jump / fall
        const up = p.y > 0.05;
        if (up) { airborne = true; airT += dt; }
        else if (airborne) {
          airborne = false;
          if (airT > 0.12) A.play('land', { surface: surf, k: Math.min(1, 0.55 + airT * 0.8), vol: 0.9 });
          airT = 0;
          phase = Math.PI * Math.round(phase / Math.PI) + 0.3; lastHalf = Math.floor(phase / Math.PI); // re-sync cadence
        }
        if (up) return;

        const sp = pl.speed || 0;
        const moving = sp > 0.9;
        // same cadence formula as the stickman walk cycle: phase += dt * (2.5 + speed * 1.5); one step per half cycle
        if (moving) phase += dt * (2.5 + sp * 1.5);
        const half = Math.floor(phase / Math.PI);
        if (moving && half !== lastHalf) {
          const run = sp > 7;
          const k = run ? 0.95 : 0.4 + Math.min(0.3, sp * 0.05);
          A.play('step', { surface: surf, k, vol: run ? 1 : 0.85, pan: (half % 2 ? 0.06 : -0.06) });
        } else if (!moving && wasMoving && sp < 0.3) {
          // settle the cadence so the next stride starts with a step
          phase = Math.PI * Math.ceil(phase / Math.PI) - 0.25;
        }
        lastHalf = half;
        wasMoving = moving;
      } catch (e) { if (!game._stepErr) { game._stepErr = true; console.warn('[audio] footsteps', e); } }
    },
  });
}
