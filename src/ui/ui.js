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
    this.escHandlers = [];   // [() => bool] — consulted on Esc before the pause menu (return true = handled)
    this.helpKeys = [];      // [[keyHtml, description]] — extra rows for the F1 help panel
    // Presentation hooks (src/present): dialogDecorators get ({ wrap, textEl, args, entry, ui }) right after a
    // dialog opens (portraits, typewriter); promptDecorate(html) -> html dresses the "Press E" prompt.
    this.dialogDecorators = [];
    this.promptDecorate = null;
    this.bubbles = new Map();
    this.hudEl = document.getElementById('hud');
    this.layer = document.getElementById('dialog-layer');
    this.toastsEl = document.getElementById('toasts');
    this.promptEl = document.getElementById('prompt');
    this.bigEl = document.getElementById('bigtext');
    this._buildHud();
    const refresh = () => this._queueHud();
    // HUD stacking: other modules add panels (heist objectives, quest tracker...) at
    // fixed spots; measure the real (scaled) column heights and publish them as CSS
    // variables so styles.css can stack everything without overlaps.
    this._layoutT = setInterval(() => { try { this._layoutHud(); } catch { /* ignore */ } }, 200);
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
      <div class="hud-bl" id="hud-extra"></div>
      <div class="hud-bubbles" id="hud-bubbles"></div>
      <div class="hud-radio hidden" id="hud-radio"></div>`;
    this.h = {};
    for (const id of ['name', 'level', 'hp', 'hp-t', 'en', 'en-t', 'xp', 'cash', 'bank', 'str', 'int', 'cha', 'karma', 'clock', 'district', 'heat', 'weapon', 'vehicle', 'extra', 'money-wrap', 'bubbles', 'radio']) {
      this.h[id] = document.getElementById('hud-' + id);
    }
    this.minimap = document.getElementById('minimap');
  }

  showHud(on = true) { this.hudEl.classList.toggle('hidden', !on); }

  _layoutHud() {
    const root = document.getElementById('ui-root');
    if (!root || this.hudEl.classList.contains('hidden')) return;
    const vis = (el) => el && el.offsetParent !== null && el.getBoundingClientRect().height > 0;
    const set = (k, v) => { v = Math.round(v) + 'px'; if (this._lay?.[k] !== v) { (this._lay ??= {})[k] = v; root.style.setProperty(k, v); } };
    // left column: stat panel -> heist objectives -> notification bubbles
    const tl = this.hudEl.querySelector('.hud-tl');
    let y = (vis(tl) ? tl.getBoundingClientRect().bottom : 12) + 10;
    set('--hud-l1', y);
    const heist = document.getElementById('heist-hud');
    if (vis(heist)) y = heist.getBoundingClientRect().bottom + 8;
    set('--hud-l2', y);
    // right column: clock/minimap -> quest tracker -> toasts
    const tr = this.hudEl.querySelector('.hud-tr');
    let r = (vis(tr) ? tr.getBoundingClientRect().bottom : 12) + 12;
    set('--hud-r1', r);
    const qt = document.getElementById('q-tracker');
    if (vis(qt) && qt.textContent.trim()) r = qt.getBoundingClientRect().bottom + 12;
    set('--hud-r2', r);
    // top centre: radio / boss bar; things announced at the top go below them
    let c = 12;
    for (const id of ['hud-radio', 'npc-boss']) { const el = document.getElementById(id); if (vis(el)) c = Math.max(c, el.getBoundingClientRect().bottom + 8); }
    set('--hud-c1', c);
    // bottom-left: extra slot (co-op status, race) -> chat -> active effects
    const bl = this.hudEl.querySelector('.hud-bl');
    let b = 44;
    if (vis(bl) && bl.textContent.trim()) b = Math.max(b, innerHeight - bl.getBoundingClientRect().top + 8);
    set('--hud-b0', b);
    const chat = document.getElementById('net-chat');
    if (vis(chat) && chat.getBoundingClientRect().height > 12) b = innerHeight - chat.getBoundingClientRect().top + 6;
    else b += 10;
    set('--hud-b1', b);
  }

  // "!" notification bubbles on the HUD (left side). setBubble(id, null) removes one.
  //   setBubble('phone', { icon: '✆', text: '2 new texts', key: 'O', onClick: () => ... , pulse: true })
  setBubble(id, opts) {
    const wrap = this.h.bubbles;
    let el = this.bubbles.get(id);
    if (!opts) { el?.remove(); this.bubbles.delete(id); return; }
    if (!el) {
      el = document.createElement('div');
      el.className = 'hud-bubble';
      el.addEventListener('click', () => { try { el._onClick?.(this.game); } catch (e) { console.error(e); } });
      wrap.appendChild(el);
      this.bubbles.set(id, el);
    }
    el._onClick = opts.onClick || null;
    el.classList.toggle('pulse', opts.pulse !== false);
    const html = `<span class="bang">${opts.icon ?? '!'}</span><span class="bt">${opts.text ?? ''}</span>${opts.key ? `<kbd>${opts.key}</kbd>` : ''}`;
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }

  // Camera / photo mode: hide every bit of HUD chrome.
  setPhotoMode(on) {
    this.photoMode = !!on;
    document.body.classList.toggle('photo-mode', this.photoMode);
    if (on) this.toast('Camera mode. <kbd>Esc</kbd> or <kbd>O</kbd> to get your HUD back.', 'info', 2200);
  }

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
    if (!html) { this.promptEl.classList.add('hidden'); this._promptSrc = null; return; }
    if (html !== this._promptSrc) {
      this._promptSrc = html;
      let out = html;
      if (this.promptDecorate) { try { out = this.promptDecorate(html) ?? html; } catch { out = html; } }
      this.promptEl.innerHTML = out;
    }
    this.promptEl.classList.remove('hidden');
  }

  // ---------------- Toasts / big text ----------------
  // A repeat of a toast that's still on screen bumps a ×N counter instead of stacking a copy.
  // Old toasts collapse out of the stack (no jumping) when more than 4 are queued.
  toast(msg, kind = 'info', ms = 3200) {
    const live = [...this.toastsEl.children].filter((t) => !t.classList.contains('out'));
    const dup = live.find((t) => t._msg === msg && t._kind === kind);
    if (dup) {
      dup._n = (dup._n || 1) + 1;
      let c = dup.querySelector(':scope > .toast-n');
      if (!c) { c = document.createElement('span'); c.className = 'toast-n'; dup.appendChild(c); }
      c.textContent = '×' + dup._n;
      dup.classList.remove('bump'); void dup.offsetWidth; dup.classList.add('bump');
      clearTimeout(dup._t);
      dup._t = setTimeout(() => this._toastOut(dup), ms);
      return;
    }
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = msg;
    el._msg = msg; el._kind = kind;
    this.toastsEl.appendChild(el);
    for (let i = 0; i < live.length + 1 - 4; i++) this._toastOut(live[i], true);
    el._t = setTimeout(() => this._toastOut(el), ms);
  }

  _toastOut(el, fast = false) {
    if (!el || el.classList.contains('out')) return;
    clearTimeout(el._t);
    el.style.maxHeight = el.offsetHeight + 'px';
    void el.offsetWidth;
    el.classList.add('out');
    if (fast) el.classList.add('fast');
    setTimeout(() => el.remove(), fast ? 240 : 420);
  }

  bigText(title, sub = '', ms = 2600, kind = null) {
    const t = String(title).toUpperCase();
    kind = kind || (/WRECKED|KNOCKED OUT|OVERDOSE|BLACKED OUT|DEAD|WASTED/.test(t) ? 'death'
      : /BUSTED|ARREST|JAILED/.test(t) ? 'busted'
        : /VICTORY|COMPLETE|PROMOTED|CHAMPION|GRADUATED|HIRED|HOMEOWNER|OFFICIAL|LEVEL/.test(t) ? 'win' : '');
    this.bigEl.className = kind ? 'bt-' + kind : '';
    this.bigEl.innerHTML = `<div class="big">${title}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    this.bigEl.classList.remove('hidden');
    void this.bigEl.offsetWidth;
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
        entry.onClosed?.();
        // Fade out; anything that opens right after (dialog chains) removes it at once instead.
        el.classList.add('ui-closing');
        el._rm = setTimeout(() => el.remove(), 150);
        this._lastClose = performance.now();
        const i = this.stack.indexOf(entry);
        if (i >= 0) this.stack.splice(i, 1);
        if (!this.stack.length) this.game.bus.emit('ui:close');
        const cb = entry.onClose; entry.onClose = null;
        cb?.();
      },
    };
    el.querySelector('.ui-x')?.addEventListener('click', () => entry.close());
    // Transitions: a fresh panel fades/rises in; a panel replacing one that just closed (the next page
    // of a conversation, a sub-menu) only cross-fades, so chains don't flicker the backdrop.
    let chained = false;
    for (const old of this.layer.querySelectorAll(':scope > .ui-closing')) { clearTimeout(old._rm); old.remove(); chained = true; }
    if (performance.now() - (this._lastClose ?? -1e9) < 120 || this.stack.length) chained = true;
    el.classList.add(chained ? 'ui-chain' : 'ui-enter');
    this.layer.appendChild(el);
    this.stack.push(entry);
    this.game.input?.releasePointer();
    this.game.bus.emit('ui:open');
    return entry;
  }

  closeAll() { while (this.stack.length) this.stack[this.stack.length - 1].close(); }

  // Extra (optional) args read by src/present: mood ('neutral'|'angry'|'smug'|'worried') for the portrait,
  // portrait (false = none, or a look { color, hat, hatColor, skin, build }), typewriter (false = show at once).
  dialog(args = {}) {
    const { title = '', speaker = '', text = '', html = null, options = null, closable = true, width = 560 } = args || {};
    return new Promise((resolve) => {
      const opts = options && options.length ? options : [{ label: 'Leave' }];
      const wrap = document.createElement('div');
      wrap.className = 'ui-dlg';
      wrap.innerHTML = `<div class="ui-dlg-head"><div class="ui-dlg-main">${speaker ? `<div class="ui-speaker">${speaker}</div>` : ''}<div class="ui-text"></div></div></div><div class="ui-opts"></div>`;
      const textEl = wrap.querySelector('.ui-text');
      textEl.innerHTML = html ?? esc(text).replace(/\n/g, '<br>');
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
      for (const d of this.dialogDecorators) {
        try { d({ wrap, textEl, args: args || {}, entry, ui: this }); } catch (e) { console.error('[ui] dialog decorator failed', e); }
      }
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
    if (e.code === 'F1') {
      e.preventDefault();
      if (top?.isHelp) top.close(); else this.showControls();
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.photoMode) { this.setPhotoMode(false); return; }
      if (top) { if (top.closable) top.close(); return; }
      for (const h of this.escHandlers) { try { if (h()) return; } catch (err) { console.error(err); } }
      this.openPauseMenu();
      return;
    }
    // Text still typing out: Space / Enter / 1-9 finish it first (the next press picks).
    if (top?.isDialog && top.typing && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || /^(Digit|Numpad)[1-9]$/.test(e.code))) {
      e.preventDefault(); top.finishTyping?.(); return;
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
      { label: 'Controls', hint: 'F1', onSelect: () => this.showControls() },
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
    const rows = [
      ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', 'Move (camera-relative) / drive'],
      ['<kbd>Shift</kbd>', 'Run'],
      ['<kbd>Space</kbd>', 'Jump / handbrake'],
      ['<kbd>Mouse</kbd>', 'Look (click to lock the mouse, or hold middle or right mouse button and drag)'],
      ['<kbd>←</kbd><kbd>→</kbd>', 'Turn the camera'],
      ['<kbd>Wheel</kbd>', 'Zoom'],
      ['<kbd>LMB</kbd>', 'Attack / shoot (tap for a 3-hit combo, hold for a heavy hit)'],
      ['<kbd>RMB</kbd> tap / <kbd>B</kbd>', 'Kick (knocks people down)'],
      ['<kbd>C</kbd>', 'Block — tap right before a hit to parry'],
      ['<kbd>Z</kbd>', 'Dodge roll (or double-tap a direction mid-fight)'],
      ['<kbd>Y</kbd>', 'Quick-heal with your best healing item'],
      ['<kbd>MMB</kbd> tap', 'Lock on to a target'],
      ['<kbd>V</kbd> / <kbd>X</kbd>', 'Heists: mask on/off · drop loot bag'],
      ['<kbd>Q</kbd>', 'Switch weapon'],
      ['<kbd>R</kbd>', 'Reload'],
      ['<kbd>E</kbd>', 'Enter buildings, talk, use things'],
      ['<kbd>F</kbd>', 'Get in / out of a vehicle'],
      ['<kbd>H</kbd>', 'Horn (in a car) — scares pedestrians'],
      ['<kbd>N</kbd>', 'Nitro (if installed)'],
      ['<kbd>,</kbd><kbd>.</kbd>', 'Car radio: previous / next station'],
      ['<kbd>O</kbd>', 'Phone — map, bank, taxi, dealer, texts, radio, camera, settings'],
      ['<kbd>P</kbd>', 'Perks &amp; achievements'],
      ['<kbd>Tab</kbd>', 'Character sheet'],
      ['<kbd>I</kbd>', 'Inventory'],
      ['<kbd>J</kbd>', 'Quest log'],
      ['<kbd>M</kbd>', 'City map'],
      ['<kbd>T</kbd>', 'Co-op chat'],
      ['<kbd>K</kbd>', 'Co-op crew panel — send cash, spar, race, waypoint to a friend'],
      ['<kbd>L</kbd>', 'Co-op: ping the spot you are looking at'],
      ['<kbd>F</kbd> at a friend’s car', 'Ride shotgun (hold LMB with a gun to shoot out the window)'],
      ['<kbd>1</kbd>-<kbd>9</kbd>', 'Pick a dialog option'],
      ['<kbd>F1</kbd>', 'This help'],
      ['<kbd>Esc</kbd>', 'Close / pause menu'],
      ...this.helpKeys,
    ];
    const entry = this.openPanel({
      title: 'How To Not Die (Controls)',
      width: 620,
      className: 'help-modal',
      body: `<table class="ui-table help-table">${rows.map(([k, d]) => `<tr><td class="keys">${k}</td><td>${d}</td></tr>`).join('')}</table>
        <div class="ui-muted" style="margin-top:10px">Pro tip: everything in Rotwell is either for sale, on fire, or both.</div>`,
    });
    entry.isHelp = true;
    return entry;
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
