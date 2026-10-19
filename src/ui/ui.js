import { fmtMoney, esc } from '../core/util.js';
import { xpForLevel } from '../core/state.js';

// DOM overlay UI: HUD, dialogs, panels, toasts.
//
// dialog({ title, speaker, text | html, options: [{ label, hint, disabled, keepOpen, onSelect(game) }] })
//   -> Promise<index | null>. onSelect runs AFTER the dialog closes, so it can open the next one.
//   Labels/hints are trusted HTML. Escape anything from other players with esc().
// openPanel({ title, body: string|HTMLElement, width, closable, onClose }) -> { el, body, close() }
export class UI {
  constructor(game) {
    this.game = game;
    this.stack = [];
    this.menuButtons = [];   // [{ label, onClick(game) }] — extra pause-menu entries
    this.sheetSections = []; // [(game) => html] — extra character-sheet sections
    this.hudEl = document.getElementById('hud');
    this.layer = document.getElementById('dialog-layer');
    this.toastsEl = document.getElementById('toasts');
    this.promptEl = document.getElementById('prompt');
    this.bigEl = document.getElementById('bigtext');
    this._buildHud();
    const refresh = () => this._queueHud();
    game.bus.on('state:change', refresh);
    game.bus.on('state:reset', refresh);
    game.bus.on('time:change', refresh);
    addEventListener('keydown', (e) => this._onKey(e));
  }

  // ---------------- HUD ----------------
  _buildHud() {
    this.hudEl.innerHTML = `
      <div class="hud-tl">
        <div class="hud-name"><span id="hud-name"></span><span class="lvl">LV <b id="hud-level"></b></span></div>
        <div class="bar hp"><i id="hud-hp"></i><span id="hud-hp-t"></span></div>
        <div class="bar en"><i id="hud-en"></i><span id="hud-en-t"></span></div>
        <div class="bar xp"><i id="hud-xp"></i></div>
        <div class="hud-money" id="hud-money-wrap"><span id="hud-cash"></span><small>bank <span id="hud-bank"></span></small></div>
        <div class="hud-stats">
          <span>STR <b id="hud-str"></b></span><span>INT <b id="hud-int"></b></span>
          <span>CHA <b id="hud-cha"></b></span><span>KARMA <b id="hud-karma"></b></span>
        </div>
      </div>
      <div class="hud-tr">
        <div id="hud-clock"></div>
        <div id="hud-district"></div>
        <div id="hud-heat"></div>
        <canvas id="minimap" width="200" height="200"></canvas>
      </div>
      <div class="hud-br"><div id="hud-weapon"></div><div id="hud-vehicle"></div></div>
      <div class="hud-bl" id="hud-extra"></div>`;
    this.h = {};
    for (const id of ['name', 'level', 'hp', 'hp-t', 'en', 'en-t', 'xp', 'cash', 'bank', 'str', 'int', 'cha', 'karma', 'clock', 'district', 'heat', 'weapon', 'vehicle', 'extra', 'money-wrap']) {
      this.h[id] = document.getElementById('hud-' + id);
    }
    this.minimap = document.getElementById('minimap');
  }

  showHud(on = true) { this.hudEl.classList.toggle('hidden', !on); }

  // Free slots other modules own: 'district', 'heat', 'weapon', 'vehicle', 'extra'.
  setHud(slot, html) {
    const el = this.h[slot];
    if (el && el._last !== html) { el.innerHTML = html ?? ''; el._last = html; }
  }

  _queueHud() {
    if (this._q) return;
    this._q = true;
    requestAnimationFrame(() => { this._q = false; this.updateHud(); });
  }

  updateHud() {
    const p = this.game.state.p, h = this.h;
    h.name.textContent = p.name;
    h.level.textContent = p.level;
    h.hp.style.width = `${(100 * p.hp) / p.maxHp}%`;
    h['hp-t'].textContent = `HP ${Math.ceil(p.hp)} / ${p.maxHp}`;
    h.en.style.width = `${(100 * p.energy) / p.maxEnergy}%`;
    h['en-t'].textContent = `ENERGY ${Math.floor(p.energy)} / ${p.maxEnergy}`;
    h.xp.style.width = `${(100 * p.xp) / xpForLevel(p.level)}%`;
    h.cash.textContent = fmtMoney(p.money);
    h.bank.textContent = fmtMoney(p.bank);
    h.str.textContent = Math.floor(p.str);
    h.int.textContent = Math.floor(p.int);
    h.cha.textContent = Math.floor(p.cha);
    h.karma.textContent = p.karma;
    h.clock.textContent = this.game.time.label();
    const heat = p.heat | 0;
    this.setHud('heat', heat > 0 ? '★'.repeat(heat) + '<span style="opacity:.25">' + '★'.repeat(5 - heat) + '</span>' : '');
  }

  flashMoney(n) {
    const el = this.h['money-wrap'];
    if (!el || !n) return;
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth;
    el.classList.add(n > 0 ? 'flash-up' : 'flash-down');
  }

  setPrompt(html) {
    if (!html) { this.promptEl.classList.add('hidden'); return; }
    this.promptEl.innerHTML = html;
    this.promptEl.classList.remove('hidden');
  }

  // ---------------- Toasts / big text ----------------
  toast(msg, kind = 'info', ms = 3200) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = msg;
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 5) this.toastsEl.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
  }

  bigText(title, sub = '', ms = 2600) {
    this.bigEl.innerHTML = `<div class="big">${title}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    this.bigEl.classList.remove('hidden');
    clearTimeout(this._bigT);
    this._bigT = setTimeout(() => this.bigEl.classList.add('hidden'), ms);
  }

  // ---------------- Modals ----------------
  isBlocking() { return this.stack.length > 0; }
  top() { return this.stack[this.stack.length - 1]; }

  openPanel({ title = '', body = '', width = 560, closable = true, onClose = null, className = '' } = {}) {
    const el = document.createElement('div');
    el.className = 'ui-modal ' + className;
    el.innerHTML = `<div class="ui-panel" style="max-width:${width}px">
        ${title ? `<div class="ui-title">${title}</div>` : ''}
        <div class="ui-body"></div>
        ${closable ? '<button class="ui-x" title="Close (Esc)">✕</button>' : ''}
      </div>`;
    const bodyEl = el.querySelector('.ui-body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);
    const entry = {
      el, body: bodyEl, closable, onClose, closed: false,
      close: () => {
        if (entry.closed) return;
        entry.closed = true;
        el.remove();
        const i = this.stack.indexOf(entry);
        if (i >= 0) this.stack.splice(i, 1);
        if (!this.stack.length) this.game.bus.emit('ui:close');
        const cb = entry.onClose; entry.onClose = null;
        cb?.();
      },
    };
    el.querySelector('.ui-x')?.addEventListener('click', () => entry.close());
    this.layer.appendChild(el);
    this.stack.push(entry);
    this.game.input?.releasePointer();
    this.game.bus.emit('ui:open');
    return entry;
  }

  closeAll() { while (this.stack.length) this.stack[this.stack.length - 1].close(); }

  dialog({ title = '', speaker = '', text = '', html = null, options = null, closable = true, width = 560 } = {}) {
    return new Promise((resolve) => {
      const opts = options && options.length ? options : [{ label: 'Leave' }];
      const wrap = document.createElement('div');
      wrap.innerHTML = `${speaker ? `<div class="ui-speaker">${speaker}</div>` : ''}<div class="ui-text"></div><div class="ui-opts"></div>`;
      wrap.querySelector('.ui-text').innerHTML = html ?? esc(text).replace(/\n/g, '<br>');
      const optsEl = wrap.querySelector('.ui-opts');
      let entry = null;
      let done = false;
      const choose = (i) => {
        const o = opts[i];
        if (!o || o.disabled || done) return;
        if (!o.keepOpen) { done = true; entry.onClose = null; entry.close(); resolve(i); }
        try { o.onSelect?.(this.game); } catch (e) { console.error('[ui] option failed', e); }
      };
      opts.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'ui-opt' + (o.disabled ? ' disabled' : '');
        b.innerHTML = `<span class="k">${i < 9 ? i + 1 : ''}</span><span>${o.label}</span>${o.hint ? `<small>${o.hint}</small>` : ''}`;
        b.addEventListener('click', () => choose(i));
        optsEl.appendChild(b);
      });
      entry = this.openPanel({ title, body: wrap, closable, width, onClose: () => { done = true; resolve(null); } });
      entry.isDialog = true;
      entry.choose = choose;
    });
  }

  async confirm(text, { title = 'You sure?', yes = 'Yeah', no = 'Nah', html = null } = {}) {
    const i = await this.dialog({ title, text, html, options: [{ label: yes }, { label: no }] });
    return i === 0;
  }

  // Ask for a number (e.g. how much to deposit). Resolves to a number or null.
  promptNumber({ title = 'How many?', text = '', max = 9999, min = 0, initial = null } = {}) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="ui-text">${text}</div>
        <input class="ui-input" type="number" min="${min}" max="${max}" value="${initial ?? max}">
        <div class="ui-row" style="margin-top:10px">
          <button class="ui-btn" data-v="min">Min</button><button class="ui-btn" data-v="half">Half</button><button class="ui-btn" data-v="max">Max (${max})</button>
          <span style="flex:1"></span><button class="ui-btn primary" data-ok>OK</button>
        </div>`;
      const input = wrap.querySelector('input');
      let result = null;
      const entry = this.openPanel({ title, body: wrap, width: 420, onClose: () => resolve(result) });
      wrap.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
        input.value = b.dataset.v === 'min' ? min : b.dataset.v === 'half' ? Math.floor(max / 2) : max;
      }));
      const ok = () => {
        const v = Math.floor(Number(input.value));
        result = Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : null;
        entry.close();
      };
      wrap.querySelector('[data-ok]').addEventListener('click', ok);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); e.stopPropagation(); });
      setTimeout(() => { input.focus(); input.select(); }, 0);
    });
  }

  _onKey(e) {
    if (!this.game.started) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const top = this.top();
    if (e.code === 'Escape') {
      e.preventDefault();
      if (top) { if (top.closable) top.close(); }
      else this.openPauseMenu();
      return;
    }
    if (top?.isDialog && /^Digit[1-9]$/.test(e.code)) { top.choose(Number(e.code.slice(5)) - 1); return; }
    if (e.code === 'Tab') {
      e.preventDefault();
      if (!top) this.openCharacterSheet();
      else if (top.isSheet) top.close();
    }
  }

  // ---------------- Built-in screens ----------------
  openPauseMenu() {
    const g = this.game;
    const opts = [
      { label: 'Resume' },
      { label: 'Save game', onSelect: () => g.state.save(false) },
      { label: 'Character sheet', hint: 'Tab', onSelect: () => this.openCharacterSheet() },
      { label: 'Controls', onSelect: () => this.showControls() },
      ...this.menuButtons.map((b) => ({ label: b.label, hint: b.hint, onSelect: () => b.onClick(g) })),
      {
        label: 'Quit to title', onSelect: async () => {
          if (await this.confirm('Save and quit to the title screen?')) { g.state.save(); location.reload(); }
        },
      },
    ];
    this.dialog({ title: 'Paused', text: 'Take a breather. The city will still suck when you get back.', options: opts });
  }

  showControls() {
    this.openPanel({
      title: 'Controls',
      body: `<table class="ui-table">
        <tr><td><kbd>W A S D</kbd></td><td>Move (camera-relative)</td></tr>
        <tr><td><kbd>Shift</kbd></td><td>Run</td></tr>
        <tr><td><kbd>Space</kbd></td><td>Jump / handbrake</td></tr>
        <tr><td><kbd>Mouse</kbd></td><td>Look (click to lock mouse, or hold right-click and drag)</td></tr>
        <tr><td><kbd>← →</kbd></td><td>Turn the camera</td></tr>
        <tr><td><kbd>Wheel</kbd></td><td>Zoom</td></tr>
        <tr><td><kbd>Left click</kbd></td><td>Attack / shoot</td></tr>
        <tr><td><kbd>Q</kbd></td><td>Switch weapon</td></tr>
        <tr><td><kbd>E</kbd></td><td>Enter buildings, talk, use things</td></tr>
        <tr><td><kbd>F</kbd></td><td>Get in / out of a vehicle</td></tr>
        <tr><td><kbd>Tab</kbd></td><td>Character sheet &amp; inventory</td></tr>
        <tr><td><kbd>J</kbd></td><td>Quest log</td></tr>
        <tr><td><kbd>M</kbd></td><td>City map</td></tr>
        <tr><td><kbd>T</kbd></td><td>Co-op chat</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Close / pause menu</td></tr>
        <tr><td><kbd>1-9</kbd></td><td>Pick a dialog option</td></tr>
      </table>`,
    });
  }

  openCharacterSheet() {
    const g = this.game, p = g.state.p;
    const inv = Object.entries(p.inventory);
    const drugs = Object.entries(p.drugs);
    const itemName = (id) => g.items?.name?.(id) ?? id;
    const drugName = (id) => g.market?.name?.(id) ?? id;
    let html = `
      <div class="ui-grid">
        <div class="ui-card"><h4>Strength</h4>${Math.floor(p.str)}</div>
        <div class="ui-card"><h4>Intelligence</h4>${Math.floor(p.int)}</div>
        <div class="ui-card"><h4>Charm</h4>${Math.floor(p.cha)}</div>
        <div class="ui-card"><h4>Karma</h4>${p.karma}</div>
        <div class="ui-card"><h4>Cash</h4>${fmtMoney(p.money)}</div>
        <div class="ui-card"><h4>Bank</h4>${fmtMoney(p.bank)}</div>
      </div>
      <div class="ui-section">Inventory</div>
      ${inv.length ? `<div class="ui-grid">${inv.map(([id, q]) => `<div class="ui-card">${itemName(id)} <span class="ui-muted">×${q}</span></div>`).join('')}</div>` : '<div class="ui-muted">Pocket lint. A single, sad Tic Tac.</div>'}
      <div class="ui-section">Stash</div>
      ${drugs.length ? `<div class="ui-grid">${drugs.map(([id, q]) => `<div class="ui-card">${drugName(id)} <span class="ui-muted">×${q}</span></div>`).join('')}</div>` : '<div class="ui-muted">Clean as a whistle. For now.</div>'}
      <div class="ui-section">Record</div>
      <table class="ui-table">
        <tr><td>Days survived</td><td>${g.time.day}</td><td>Money earned</td><td>${fmtMoney(p.totals.earned)}</td></tr>
        <tr><td>Fights won</td><td>${p.totals.fightsWon}</td><td>Fights lost</td><td>${p.totals.fightsLost}</td></tr>
        <tr><td>Drugs sold</td><td>${p.totals.drugsSold}</td><td>Arrests</td><td>${p.totals.arrests}</td></tr>
      </table>`;
    for (const fn of this.sheetSections) {
      try { html += fn(g) || ''; } catch (e) { console.error('[ui] sheet section failed', e); }
    }
    const entry = this.openPanel({ title: `${esc(p.name)} — Level ${p.level}`, body: html, width: 720 });
    entry.isSheet = true;
    this.game.bus.emit('ui:sheet-open', entry);
    return entry;
  }
}
