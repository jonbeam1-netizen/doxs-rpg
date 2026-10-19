// Game clock. total = minutes since Day 1 00:00.
// Real time: 1 real second = `rate` game minutes (a full day ≈ 24 real minutes).
// Single-player: the clock freezes while a menu/dialog is open.
// Co-op: the host owns the clock; clients ask the host to advance it.
export class GameTime {
  constructor(game) {
    this.game = game;
    this.total = 8 * 60;
    this.rate = 1;
    this._acc = 0;
  }

  get day() { return Math.floor(this.total / 1440) + 1; }
  get minuteOfDay() { return ((this.total % 1440) + 1440) % 1440; }
  get hour() { return Math.floor(this.minuteOfDay / 60); }
  get minute() { return this.minuteOfDay % 60; }
  get isNight() { const h = this.hour; return h >= 20 || h < 6; }

  // 0 at midnight, 1 at noon, smooth in between.
  get daylight() {
    const t = this.minuteOfDay / 1440;
    const s = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    return Math.max(0, Math.min(1, s * 1.3 - 0.15));
  }

  label() {
    const h = this.hour, m = this.minute;
    const h12 = ((h + 11) % 12) + 1;
    return `Day ${this.day} · ${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  // Is it between startHour and endHour (wraps past midnight)?
  isBetween(startHour, endHour) {
    const h = this.minuteOfDay / 60;
    return startHour <= endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour;
  }

  frozen() {
    const g = this.game;
    if (!g.started) return true;
    if (g.net?.isClient) return true; // host drives the clock
    if (g.net?.connected) return false; // co-op host: world keeps moving
    return g.controlsLocked;
  }

  update(dt) {
    if (this.frozen()) return;
    this._acc += dt * this.rate;
    if (this._acc >= 1) {
      const m = Math.floor(this._acc);
      this._acc -= m;
      this._apply(m, false);
    }
  }

  // Skip time because of an activity (working, sleeping, class...).
  advance(minutes) {
    if (minutes <= 0) return;
    if (this.game.net?.isClient) { this.game.net.requestTimeAdvance(minutes); return; }
    this._apply(minutes, true);
  }

  // Minutes until the clock next reads `hour`:00.
  minutesUntil(hour) {
    let d = hour * 60 - this.minuteOfDay;
    if (d <= 0) d += 1440;
    return d;
  }

  // Hard-set (used by save/load and co-op sync).
  set(total) {
    const diff = total - this.total;
    if (diff > 0) this._apply(diff, false);
    else { this.total = total; this.game.bus.emit('time:change', { skipped: 0 }); }
  }

  _apply(minutes, skipped) {
    const beforeHour = Math.floor(this.total / 60);
    const beforeDay = Math.floor(this.total / 1440);
    this.total += minutes;
    const afterHour = Math.floor(this.total / 60);
    const afterDay = Math.floor(this.total / 1440);
    const bus = this.game.bus;
    if (afterHour !== beforeHour) bus.emit('time:hour', { hour: this.hour, hoursPassed: afterHour - beforeHour });
    for (let d = beforeDay + 1; d <= afterDay; d++) bus.emit('time:day', { day: d + 1 });
    bus.emit('time:change', { skipped: skipped ? minutes : 0 });
  }
}
