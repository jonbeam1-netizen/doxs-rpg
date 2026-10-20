// Co-op features (co-op features agent): ride shotgun + drive-bys, crew panel / pot / pins / pings,
// friend drag races, friendly sparring, crew bonus. Everything degrades to a no-op (or a solo-friendly
// version) when not connected. Installed BEFORE src/net so its net.on() handlers are registered early;
// the net module calls game.coop.anchor() / afterAvatars() / hudBusy() / hudExtra().
//
// Net messages (all validated, throttled per sender):
//   ride:req/ok/no/leave/end      src/coop/ride.js   (+ 'ps' carries r:{d,s}, ay while riding)
//   crew:info/wp/ping/pot/dep/wd/grant/deny          src/coop/crew.js
//   drag:inv/ans/go/cp/fin/quit   src/coop/drag.js
//   spar:inv/ans/go/hit/end       src/coop/spar.js
// Keys: F (hop in/out of a friend's car), LMB/R/Q while riding, K crew panel, L ping.
import { makeUtil } from './util.js';
import { installRide } from './ride.js';
import { installCrew } from './crew.js';
import { installDrag } from './drag.js';
import { installSpar } from './spar.js';
import { installBonus } from './bonus.js';

export async function installCoop(game) {
  const U = makeUtil(game);
  const coop = { util: U };
  game.coop = coop;
  const parts = [['ride', installRide], ['crew', installCrew], ['drag', installDrag], ['spar', installSpar], ['bonus', installBonus]];
  for (const [name, fn] of parts) {
    try { coop[name] = fn(game, U); } catch (e) { console.error(`[coop] ${name} failed to install`, e); }
  }
  coop.anchor = (driverId) => coop.ride?.anchor?.(driverId) || null;
  coop.afterAvatars = (dt) => coop.ride?.afterAvatars?.(dt);
  coop.hudBusy = () => !!coop.drag?.active;
  coop.hudExtra = () => coop.bonus?.hudExtra?.() || '';

  const errs = {};
  game.addSystem({
    name: 'coop',
    update(dt) {
      if (!game.started) return;
      for (const [name] of parts) {
        const m = coop[name];
        if (!m?.update) continue;
        try { m.update(dt); } catch (e) { if (!errs[name]) { errs[name] = true; console.error(`[coop] ${name} update failed`, e); } }
      }
    },
  });
  return coop;
}
