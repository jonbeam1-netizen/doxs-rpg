// Timed status effects (stored in state.p.effects), drunkenness, addiction/withdrawal,
// and their visuals: speed multiplier, a CSS filter on the canvas, camera sway.
// Exposed as game.sysFx: { add, remove, has, get, list, addDrunk, sober, drunk, addiction, useDrug }
import { clamp, pick, chance, fmtMoney, randInt } from '../core/util.js';
import { ensureState } from './common.js';

// Named effects that items reference by id. Values merge into the effect record.
export const EFFECT_DEFS = {
  protein: { label: 'Protein-swole (+30% gym)', kind: 'good' },
  roids: { label: 'Roided out (×2 gym)', kind: 'drug' },
  lucky: { label: 'Lucky rabbit foot', kind: 'good' },
  withdrawal: { label: 'WITHDRAWAL', kind: 'bad', speed: 0.88, temp: { str: -2, cha: -3 }, trip: { gray: 0.55 } },
  fresh: { label: 'Fresh & showered', kind: 'good' },
  hungover: { label: 'Hungover', kind: 'bad', speed: 0.94, trip: { blur: 0.4 } },
  cursed: { label: 'Cursed by Madame Ooze', kind: 'bad' },
  caffeine: { label: 'Wired', kind: 'good' },
};

// Max total temporary bonus per stat from stacked effects.
export const TEMP_CAP = 10;

export function installEffects(game) {
  const fx = {
    get p() { return game.state.p; },
    list() { return this.p.effects || []; },
    get(id) { return this.list().find((e) => e.id === id); },
    has(id) { return !!this.get(id); },

    // add({ id, label, min, temp:{str,int,cha}, speed, trip:{...}, kind }) — refreshes if already active.
    add(spec) {
      const p = this.p;
      ensureState(p);
      const def = EFFECT_DEFS[spec.id] || {};
      const e = Object.assign({ kind: 'good' }, def, spec);
      const old = this.get(e.id);
      if (old) this._unapply(old);
      p.effects = p.effects.filter((x) => x.id !== e.id);
      const rec = {
        id: e.id, label: e.label || e.id, kind: e.kind, until: game.time.total + (e.min ?? 60),
        speed: e.speed ?? 1, trip: e.trip || null, applied: {},
      };
      // Temporary stat mods are applied for real (so combat etc. see them) and removed on expiry.
      for (const [k, v0] of Object.entries(e.temp || {})) {
        if (k === 'min' || !(k in p)) continue;
        let v = v0;
        if (v > 0) {
          // Stacked temporary boosts (booze + cologne + pills + ...) cap at +TEMP_CAP per stat.
          const stacked = p.effects.reduce((a, x) => a + Math.max(0, x.applied?.[k] || 0), 0);
          v = Math.max(0, Math.min(v, TEMP_CAP - stacked));
        }
        const before = p[k];
        p[k] = Math.max(0, Math.round((p[k] + v) * 10) / 10);
        rec.applied[k] = p[k] - before;
      }
      p.effects.push(rec);
      game.state.changed('effects');
      return rec;
    },

    remove(id) {
      const e = this.get(id);
      if (!e) return;
      this._unapply(e);
      this.p.effects = this.p.effects.filter((x) => x !== e);
      game.state.changed('effects');
    },

    _unapply(e) {
      const p = this.p;
      for (const [k, v] of Object.entries(e.applied || {})) {
        if (k in p) p[k] = Math.max(0, Math.round((p[k] - v) * 10) / 10);
      }
      e.applied = {};
    },

    // ---- drunkenness ----
    get drunk() { return this.p.sys?.drunk || 0; },
    addDrunk(n) {
      const s = this.p.sys;
      s.drunk = clamp((s.drunk || 0) + n, 0, 10);
      if (n > 0) {
        const msgs = ['*hic*', 'You feel warm and stupid.', 'The ground is a little more... wiggly.', 'Everyone is your best friend now.', 'You love you guys. You really do.'];
        if (s.drunk >= 4) game.ui.toast(pick(['The room is spinning. Or you are. Someone is.', 'You can see two of everything. Both of them are ugly.', 'You are SO not drunk. You say this to a lamppost.']), 'bad');
        else game.ui.toast(pick(msgs), 'info', 1800);
      }
      if (s.drunk >= 6) passOut();
      game.state.changed('drunk');
    },
    sober() { this.p.sys.drunk = 0; game.state.changed('drunk'); },

    // ---- addiction ----
    get addiction() { return this.p.sys?.addiction?.level || 0; },
    addAddiction(n) {
      const a = this.p.sys.addiction;
      a.level = clamp(a.level + n, 0, 100);
      if (n < 0 && a.level < 20) this.remove('withdrawal');
      game.state.changed('addiction');
    },
    markUse() {
      const a = this.p.sys.addiction;
      a.last = game.time.total;
      this.remove('withdrawal');
    },
  };
  game.sysFx = fx;

  function passOut() {
    const p = game.state.p;
    game.ui.closeAll();
    const lost = Math.floor(p.money * (0.15 + Math.random() * 0.3));
    game.time.advance(randInt(180, 360));
    p.sys.drunk = 1.5;
    if (lost > 0) game.state.addMoney(-lost, 'blackout');
    game.state.damage(5, 'blackout');
    fx.add({ id: 'hungover', min: 480 });
    const extras = [];
    if (chance(0.18) && !p.sys.tattoos.includes('drunk_tat')) { p.sys.tattoos.push('drunk_tat'); extras.push('There is a fresh tattoo on your butt. It says "TACO BELL" with a heart.'); }
    if (chance(0.25)) { game.state.addStat('karma', -2); extras.push('You have a vague memory of peeing on a police horse.'); }
    if (chance(0.2)) { game.state.addItem('stolen_tv', 1); extras.push('You are somehow holding a flatscreen TV. You do not own a flatscreen TV.'); }
    game.ui.bigText('BLACKED OUT', 'You wake up in a puddle. It\'s not all water.', 3500);
    setTimeout(() => game.ui.dialog({
      title: 'The Morning After (or whatever time it is)',
      html: `You drank yourself into a coma. ${lost > 0 ? `Your wallet is ${fmtMoney(lost)} lighter. A hobo nearby is wearing your sunglasses.` : 'Luckily you were too broke to rob.'}<br><br>${extras.join('<br>')}`,
    }), 400);
  }

  // ---------------- per-frame: visuals + expiry ----------------
  const canvas = game.renderer.domElement;
  let lastTotal = game.time.total;
  let swayPrev = 0;
  let appliedSpeed = 1;
  let lastFilter = '';
  let t = 0;
  let hudT = 0;

  const hudEl = document.createElement('div');
  hudEl.id = 'sys-hud';
  game.ui.hudEl.appendChild(hudEl);
  fx.hudEl = hudEl;
  fx.missionHtml = '';

  game.addSystem({
    name: 'systems-effects',
    update(dt) {
      if (!game.started) return;
      const p = game.state.p;
      if (!p.sys) ensureState(p);
      t += dt;
      // decay drunkenness by game time (1 level per ~45 game minutes)
      const now = game.time.total;
      const dm = now - lastTotal;
      lastTotal = now;
      if (dm > 0 && p.sys.drunk > 0) {
        const before = p.sys.drunk;
        p.sys.drunk = Math.max(0, p.sys.drunk - dm / 45);
        if (before >= 3 && p.sys.drunk < 0.3 && dm < 600) fx.add({ id: 'hungover', min: 240 });
      }
      // expire effects
      if (p.effects?.length) {
        for (const e of [...p.effects]) {
          if (now >= e.until) {
            fx.remove(e.id);
            if (e.kind === 'drug') game.ui.toast(`The ${e.label} wears off. Reality is beige again.`, 'info');
          }
        }
      }
      // speed
      let speed = 1;
      for (const e of p.effects || []) speed *= e.speed ?? 1;
      const drunk = p.sys.drunk || 0;
      speed *= 1 - Math.min(0.35, drunk * 0.05);
      const pl = game.player;
      if (pl) {
        const cur = pl.speedMult || 1;
        pl.speedMult = (cur / appliedSpeed) * speed;
        appliedSpeed = speed;
      }
      // camera sway when drunk (apply only the delta so we never fight the player's camera)
      const rig = game.cameraRig;
      if (rig) {
        const amp = Math.min(0.5, drunk * 0.07) + (fx.has('withdrawal') ? 0.02 : 0);
        const sway = amp ? Math.sin(t * 0.9) * amp + Math.sin(t * 2.3) * amp * 0.35 : 0;
        rig.yaw += sway - swayPrev;
        swayPrev = sway;
      }
      // screen filter
      const f = buildFilter(p, drunk, t);
      if (f !== lastFilter) { canvas.style.filter = f; lastFilter = f; }
      // HUD (cheap; ~4x/sec)
      hudT -= dt;
      if (hudT <= 0) { hudT = 0.25; renderHud(p, drunk); }
    },
  });

  function buildFilter(p, drunk, time) {
    let hue = 0, sat = 1, blur = 0, contrast = 1, invert = 0, sepia = 0, gray = 0, bright = 1;
    for (const e of p.effects || []) {
      const tr = e.trip;
      if (!tr) continue;
      hue += (tr.hue || 0) + (tr.spin ? (time * tr.spin) % 360 : 0);
      sat *= tr.sat ?? 1;
      blur += tr.blur || 0;
      contrast *= tr.contrast ?? 1;
      invert = Math.max(invert, tr.invert ? tr.invert * (0.5 + 0.5 * Math.sin(time * 7)) : 0);
      sepia = Math.max(sepia, tr.sepia || 0);
      gray = Math.max(gray, tr.gray || 0);
    }
    if (drunk > 0.3) {
      blur += Math.min(2.2, drunk * 0.3) * (0.7 + 0.3 * Math.sin(time * 1.7));
      sat *= 1 + drunk * 0.05;
      bright *= 1 + Math.sin(time * 0.8) * Math.min(0.08, drunk * 0.015);
    }
    const parts = [];
    if (hue) parts.push(`hue-rotate(${Math.round(hue % 360)}deg)`);
    if (sat !== 1) parts.push(`saturate(${sat.toFixed(2)})`);
    if (blur > 0.05) parts.push(`blur(${blur.toFixed(1)}px)`);
    if (contrast !== 1) parts.push(`contrast(${contrast.toFixed(2)})`);
    if (invert > 0.01) parts.push(`invert(${invert.toFixed(2)})`);
    if (sepia) parts.push(`sepia(${sepia})`);
    if (gray) parts.push(`grayscale(${gray})`);
    if (bright !== 1) parts.push(`brightness(${bright.toFixed(2)})`);
    return parts.join(' ');
  }

  function renderHud(p, drunk) {
    let html = fx.missionHtml || '';
    const now = game.time.total;
    if (drunk >= 0.5) html += `<div class="fx bad">Drunk ${'🍺'.repeat(Math.min(6, Math.ceil(drunk)))}</div>`;
    for (const e of p.effects || []) {
      const left = Math.max(0, e.until - now);
      const tl = left >= 60 ? `${Math.floor(left / 60)}h${String(Math.round(left % 60)).padStart(2, '0')}` : `${Math.round(left)}m`;
      html += `<div class="fx ${e.kind || ''}">${e.label} <span style="opacity:.6">${tl}</span></div>`;
    }
    const add = p.sys.addiction?.level || 0;
    if (add >= 25) html += `<div class="fx bad">Addiction ${Math.round(add)}%</div>`;
    if (hudEl._last !== html) { hudEl.innerHTML = html; hudEl._last = html; }
  }

  // ---------------- hourly: withdrawal ----------------
  game.bus.on('time:hour', () => {
    if (!game.started) return;
    const p = game.state.p;
    if (!p.sys) return;
    const a = p.sys.addiction;
    if (a.level >= 25 && game.time.total - a.last > 8 * 60) {
      if (!fx.has('withdrawal')) {
        fx.add({ id: 'withdrawal', min: 60 * 24 * 3 });
        game.ui.toast(pick([
          'Your skin is crawling. Literally? No. Figuratively? Also no. Medically? Yes.',
          'WITHDRAWAL. You would trade a kidney for a bump. Not your kidney. Someone\'s.',
          'The shakes kick in. You could stir paint with your hands.',
        ]), 'bad', 4500);
      } else if (chance(0.15)) {
        game.state.addStat('energy', -5);
        game.ui.toast(pick(['You sweat through your shirt thinking about Glitter Gravy.', 'A lamppost looks like your dealer. You hug it.', 'Your nose itches in a way that costs money.']), 'bad');
      }
    }
  });

  game.bus.on('time:day', () => {
    const p = game.state.p;
    if (!p.sys) return;
    const a = p.sys.addiction;
    const clean = game.time.total - a.last > 24 * 60;
    if (a.level > 0) fx.addAddiction(clean ? -6 : -2);
  });

  game.bus.on('state:reset', () => {
    ensureState(game.state.p);
    lastTotal = game.time.total;
    if (game.player) { game.player.speedMult = 1; appliedSpeed = 1; }
  });

  return fx;
}
