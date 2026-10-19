import { clamp, fmtMoney } from './util.js';

const SAVE_KEY = 'doxsrpg_save_v1';

export const STAT_CAPS = { str: 999, int: 999, cha: 999 };
export const STAT_NAMES = { str: 'Strength', int: 'Intelligence', cha: 'Charm', karma: 'Karma' };

// Everything the local player owns or has done. Must stay plain JSON so it
// can be saved to localStorage. Systems add their own keys under `flags`
// or their own top-level key (document it in DESIGN.md).
export function defaultPlayer(name = 'Dox') {
  return {
    name,
    money: 50, bank: 0,
    hp: 100, maxHp: 100,
    energy: 100, maxEnergy: 100,
    str: 5, int: 5, cha: 5, karma: 0,
    xp: 0, level: 1,
    inventory: {},          // itemId -> qty
    drugs: {},              // drugId -> qty
    weapons: ['fists'],     // owned weapon ids
    weapon: 'fists',        // equipped
    ammo: {},               // ammoType -> count
    cars: [],               // [{ uid, carId, color, x, z, rot }]
    activeCar: null,        // uid of car last driven
    home: 'roach_motel',    // location id where you sleep / respawn
    ownedHomes: ['roach_motel'],
    job: null,              // { id, rank, shifts }
    education: {},          // courseId -> progress
    quests: {},             // questId -> { step, done, data }
    flags: {},              // free-form booleans/numbers
    heat: 0,                // police wanted level 0..5
    look: { color: '#141414', hat: null },
    pos: null,              // { x, z, facing } last saved position
    totals: { earned: 0, drugsSold: 0, fightsWon: 0, fightsLost: 0, kills: 0, arrests: 0, deaths: 0, daysSurvived: 0 },
  };
}

export function xpForLevel(level) {
  return Math.round(100 * Math.pow(level, 1.5));
}

export class GameState {
  constructor(game) {
    this.game = game;
    this.p = defaultPlayer();
  }

  get player() { return this.p; }

  newGame(name) {
    this.p = defaultPlayer(name || 'Dox');
    this.game.time.total = 8 * 60;
    this.game.bus.emit('state:reset', { isNew: true });
    this.changed('all');
  }

  changed(key = 'all') { this.game.bus.emit('state:change', key); }

  // ---- money ----
  addMoney(n, reason = '') {
    const p = this.p;
    p.money = Math.max(0, Math.round(p.money + n));
    if (n > 0) p.totals.earned += n;
    this.changed('money');
    this.game.ui?.flashMoney(n);
    this.game.bus.emit('money:change', { amount: n, reason });
  }
  canAfford(n) { return this.p.money >= n; }
  spend(n, reason = '') {
    if (this.p.money < n) {
      this.game.ui?.toast(`You need ${fmtMoney(n)}. You have lint and regret.`, 'bad');
      return false;
    }
    this.addMoney(-n, reason);
    return true;
  }

  // ---- stats ----
  addStat(stat, n, source = '') {
    const p = this.p;
    if (!(stat in p)) { console.warn('[state] unknown stat', stat); return; }
    const before = p[stat];
    if (stat === 'karma') p.karma = clamp(p.karma + n, -100, 100);
    else if (stat === 'hp') p.hp = clamp(p.hp + n, 0, p.maxHp);
    else if (stat === 'energy') p.energy = clamp(p.energy + n, 0, p.maxEnergy);
    else p[stat] = clamp(Math.round((p[stat] + n) * 10) / 10, 0, STAT_CAPS[stat] ?? 99999);
    const delta = p[stat] - before;
    this.changed(stat);
    if (delta > 0) this.game.bus.emit('stat:gain', { stat, amount: delta, source });
    if (delta !== 0 && STAT_NAMES[stat]) {
      this.game.ui?.toast(`${delta > 0 ? '+' : ''}${Math.round(delta * 10) / 10} ${STAT_NAMES[stat]}`, delta > 0 ? 'stat' : 'bad', 1800);
    }
    if (stat === 'hp' && p.hp <= 0) this.game.bus.emit('player:died', { source });
    return delta;
  }

  useEnergy(n) {
    if (this.p.energy < n) {
      this.game.ui?.toast("You're running on fumes. Sleep or chug something.", 'bad');
      return false;
    }
    this.addStat('energy', -n);
    return true;
  }

  damage(n, source = '') {
    if (this.p.hp <= 0) return;
    this.addStat('hp', -n, source);
    this.game.bus.emit('player:damaged', { amount: n, source });
  }
  heal(n) { this.addStat('hp', n); }

  addXP(n) {
    const p = this.p;
    p.xp += Math.round(n);
    let leveled = false;
    while (p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level);
      p.level++;
      p.maxHp += 10;
      p.maxEnergy += 2;
      p.hp = p.maxHp;
      leveled = true;
      this.game.bus.emit('player:levelup', { level: p.level });
    }
    if (leveled) this.game.ui?.toast(`LEVEL ${p.level}. You're slightly less pathetic.`, 'good', 3000);
    this.changed('xp');
  }

  // ---- inventory ----
  addItem(id, qty = 1) {
    const inv = this.p.inventory;
    inv[id] = (inv[id] || 0) + qty;
    if (inv[id] <= 0) delete inv[id];
    this.changed('inventory');
  }
  removeItem(id, qty = 1) {
    if (!this.hasItem(id, qty)) return false;
    this.addItem(id, -qty);
    return true;
  }
  hasItem(id, qty = 1) { return (this.p.inventory[id] || 0) >= qty; }
  itemCount(id) { return this.p.inventory[id] || 0; }

  addDrug(id, qty) {
    const d = this.p.drugs;
    d[id] = (d[id] || 0) + qty;
    if (d[id] <= 0) delete d[id];
    this.changed('drugs');
  }
  drugCount(id) { return this.p.drugs[id] || 0; }
  totalDrugs() { return Object.values(this.p.drugs).reduce((a, b) => a + b, 0); }

  // ---- flags / heat ----
  setFlag(k, v = true) { this.p.flags[k] = v; this.changed('flags'); this.game.bus.emit('flag:set', { key: k, value: v }); }
  getFlag(k, def = undefined) { return k in this.p.flags ? this.p.flags[k] : def; }

  addHeat(n) {
    const before = this.p.heat;
    this.p.heat = clamp(this.p.heat + n, 0, 5);
    if (this.p.heat !== before) { this.changed('heat'); this.game.bus.emit('heat:change', { heat: this.p.heat, before }); }
  }

  // ---- persistence ----
  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  save(silent = true) {
    const g = this.game;
    if (g.devMode) return false; // ?dev test sessions never touch the real save slot
    if (g.player) {
      const pos = g.player.vehicle ? g.player.vehicle.group.position : g.player.group.position;
      this.p.pos = { x: Math.round(pos.x * 10) / 10, z: Math.round(pos.z * 10) / 10, facing: g.player.facing };
    }
    g.bus.emit('state:before-save', this.p);
    const data = { v: 1, savedAt: Date.now(), time: g.time.total, player: this.p };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (!silent) g.ui?.toast('Game saved. Your sins are on file.', 'good');
      return true;
    } catch (e) {
      console.error('[state] save failed', e);
      if (!silent) g.ui?.toast('Save failed (storage blocked?).', 'bad');
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      this.p = Object.assign(defaultPlayer(), data.player);
      this.p.totals = Object.assign(defaultPlayer().totals, data.player.totals || {});
      this.game.time.total = data.time ?? 8 * 60;
      this.game.bus.emit('state:reset', { isNew: false });
      this.changed('all');
      return true;
    } catch (e) {
      console.error('[state] load failed', e);
      return false;
    }
  }

  wipeSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
}
