// Reusable UI building blocks for every building in the systems module:
//   placeMenu(game, loc, def)   menu-driven building loop (Stick RPG style)
//   shopPanel(game, def)        product grid with buy buttons / requirements
//   gamePanel(game, def)        minigame panel with live cash header + status line
//   betInput(...)               bet amount picker for minigames
//   meter(value, max, color)    little progress bar html
import { fmtMoney, esc, clamp } from '../core/util.js';
import { isOpen, hoursLabel, reqCheck, reqHtml } from './common.js';
import { icon, TYPE_ICON } from '../present/icons.js';
import { chip, hintChips, classify, GROUP_NAMES, plain, itemIcon, fxChips } from '../ui/visual.js';
import { ITEMS } from '../data/items.js';

let stylesInjected = false;
export function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .sys-hint { color: var(--bone-dim); font-size: 15px; }
  .sys-req { display:inline-block; font-size: 13px; padding: 0 5px; margin: 1px 2px 1px 0; border: 1px solid #3b342b; border-radius: 2px; }
  .sys-req.ok { color: var(--cash); border-color: #3c5a26; }
  .sys-req.no { color: var(--blood-bright); border-color: #6d1510; }
  .sys-cashline { display:flex; justify-content: space-between; align-items: baseline; margin: -4px 0 10px; color: var(--bone-dim); font-size: 16px; }
  .sys-cashline b { color: var(--cash); font-size: 20px; }
  .sys-shop { display:grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
  .sys-item { background:#1b1814; border:1px solid #2e2821; padding: 8px 10px; display:flex; flex-direction:column; gap:4px; }
  .sys-item.locked { opacity: .6; }
  .sys-item.owned { border-color: #3c5a26; }
  .sys-item h4 { margin:0; font-size: 18px; display:flex; justify-content:space-between; gap: 6px; }
  .sys-item h4 .pr { color: var(--cash); white-space:nowrap; }
  .sys-item .d { font-size: 14.5px; color: var(--bone-dim); line-height: 1.25; flex: 1; }
  .sys-item .tag { font-size: 13px; color: var(--toxic); }
  .sys-item .btns { display:flex; gap:6px; margin-top: 2px; }
  .sys-item .btns .ui-btn { padding: 4px 10px; font-size: 16px; }
  .sys-intro { font-size: 17px; line-height: 1.3; margin-bottom: 10px; }
  .sys-intro em { color: var(--bone-dim); }
  .sys-sect { margin: 10px 0 6px; font-family: var(--font-title); font-size: 18px; color: var(--rust); }
  .sys-status { min-height: 26px; margin: 8px 0; font-size: 18px; text-align: center; }
  .sys-status.good { color: var(--cash); } .sys-status.bad { color: var(--blood-bright); }
  .sys-bet { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
  .sys-bet input { width: 110px; padding: 5px 8px; background:#0f0d0b; color: var(--bone); border:1px solid var(--panel-edge); font-family: var(--font-body); font-size: 18px; user-select:text; }
  .sys-bet .ui-btn { padding: 4px 9px; font-size: 16px; }
  .sys-meter { position:relative; height: 10px; background:#1d1915; border:1px solid #000; min-width: 80px; display:inline-block; width: 100%; vertical-align: middle; }
  .sys-meter i { position:absolute; left:0; top:0; bottom:0; }
  .sys-table { width:100%; border-collapse: collapse; font-size: 17px; }
  .sys-table td, .sys-table th { padding: 4px 6px; border-bottom: 1px solid #2a241d; text-align:left; }
  .sys-table th { color: var(--bone-dim); font-weight: 600; font-size: 15px; }
  .sys-table td.num, .sys-table th.num { text-align:right; }
  .sys-table .ui-btn { padding: 2px 8px; font-size: 15px; }
  .sys-up { color: var(--blood-bright); } .sys-down { color: var(--cash); }
  /* cards */
  .sys-cards { display:flex; gap: 6px; min-height: 92px; align-items:center; flex-wrap: wrap; }
  .sys-card { width: 60px; height: 86px; background: #e9e2d0; color:#141210; border-radius: 5px; border: 1px solid #000;
    box-shadow: 2px 3px 0 rgba(0,0,0,.5); display:flex; flex-direction:column; justify-content:space-between; padding: 4px 6px;
    font-family: var(--font-title); font-size: 20px; animation: sysDeal .25s ease-out; }
  .sys-card.red { color:#a3201a; }
  .sys-card .s2 { align-self:flex-end; transform: rotate(180deg); }
  .sys-card.back { background: repeating-linear-gradient(45deg, #6d1510 0 6px, #4a0e0a 6px 12px); }
  @keyframes sysDeal { from { transform: translateY(-14px) rotate(-6deg); opacity:0; } to { transform:none; opacity:1; } }
  .sys-felt { background: radial-gradient(ellipse at center, #1f3a22, #10200f); border: 2px solid #3b2a14; padding: 10px 12px; border-radius: 6px; }
  .sys-felt .lbl { font-size: 15px; color: #c9c0a0; margin: 2px 0 4px; }
  /* slots */
  .sys-reels { display:flex; gap: 10px; justify-content:center; margin: 8px 0; }
  .sys-reel { width: 92px; height: 100px; background: linear-gradient(#0b0a09, #2a2520 20%, #2a2520 80%, #0b0a09); border: 3px solid var(--energy);
    display:flex; align-items:center; justify-content:center; font-size: 54px; border-radius: 6px; overflow: hidden; }
  .sys-reel.spin span { animation: sysSpin .09s linear infinite; display:inline-block; filter: blur(1px); }
  @keyframes sysSpin { from { transform: translateY(-30px); } to { transform: translateY(30px); } }
  .sys-paytable { font-size: 14px; color: var(--bone-dim); text-align:center; }
  /* roulette */
  .sys-wheel { width: 120px; height: 120px; margin: 4px auto; border-radius: 50%; border: 5px solid #5a3e1a;
    display:flex; align-items:center; justify-content:center; font-family: var(--font-title); font-size: 44px; color:#fff;
    background: conic-gradient(#a3201a 0 10deg, #111 10deg 20deg, #a3201a 20deg 30deg, #111 30deg 40deg, #a3201a 40deg 50deg, #111 50deg 60deg, #a3201a 60deg 70deg, #111 70deg 80deg, #a3201a 80deg 90deg, #111 90deg 100deg, #a3201a 100deg 110deg, #111 110deg 120deg, #a3201a 120deg 130deg, #111 130deg 140deg, #a3201a 140deg 150deg, #111 150deg 160deg, #a3201a 160deg 170deg, #111 170deg 180deg, #a3201a 180deg 190deg, #111 190deg 200deg, #a3201a 200deg 210deg, #111 210deg 220deg, #a3201a 220deg 230deg, #111 230deg 240deg, #a3201a 240deg 250deg, #111 250deg 260deg, #a3201a 260deg 270deg, #111 270deg 280deg, #a3201a 280deg 290deg, #111 290deg 300deg, #a3201a 300deg 310deg, #111 310deg 320deg, #a3201a 320deg 330deg, #111 330deg 340deg, #a3201a 340deg 350deg, #1f6a2a 350deg 360deg); }
  .sys-wheel span { background: rgba(0,0,0,.75); border-radius: 50%; width: 70px; height: 70px; display:flex; align-items:center; justify-content:center; }
  .sys-wheel.spin { animation: sysRot .5s linear infinite; }
  @keyframes sysRot { to { transform: rotate(360deg); } }
  .sys-chips { display:flex; flex-wrap:wrap; gap: 4px; justify-content:center; }
  .sys-chips .ui-btn.sel { background: var(--rust); }
  /* bars for mash / timing minigames */
  .sys-track { position:relative; height: 28px; background:#14110e; border:2px solid #3b342b; margin: 10px 0; overflow:hidden; }
  .sys-track .zone { position:absolute; top:0; bottom:0; background: rgba(127,191,77,.35); }
  .sys-track .zone2 { position:absolute; top:0; bottom:0; background: rgba(226,64,47,.55); }
  .sys-track .needle { position:absolute; top:-2px; bottom:-2px; width: 4px; background: var(--bone); box-shadow: 0 0 6px #fff; }
  .sys-tug { position:relative; height: 30px; background: linear-gradient(90deg, var(--blood) 0 50%, #2a3f7a 50% 100%); border:2px solid #000; margin: 10px 0; }
  .sys-tug .knot { position:absolute; top:-6px; bottom:-6px; width: 10px; margin-left:-5px; background: var(--bone); border:1px solid #000; transition: left .08s; }
  .sys-big { font-family: var(--font-title); font-size: 30px; text-align:center; }
  /* HUD */
  #sys-hud { position:absolute; left: 14px; bottom: 54px; display:flex; flex-direction:column; gap: 3px; align-items:flex-start; pointer-events:none; text-shadow: 1px 1px 0 #000; }
  #sys-hud .fx { font-size: 15px; padding: 1px 8px; background: rgba(10,9,8,.7); border-left: 3px solid var(--xp); }
  #sys-hud .fx.bad { border-color: var(--blood-bright); }
  #sys-hud .fx.drug { border-color: var(--toxic); }
  #sys-hud .mission { font-size: 19px; padding: 4px 10px; background: rgba(10,9,8,.85); border: 1px solid var(--blood); }
  #sys-hud .mission b { color: var(--energy); }
  #sys-hud .arrow { display:inline-block; font-size: 22px; color: var(--blood-bright); }
  .sys-news { font-family: var(--font-title); }
  .sys-news h2 { margin: 0 0 6px; font-size: 26px; line-height: 1.1; color: var(--bone); }
  .sys-news p { font-family: var(--font-body); font-size: 17px; margin: 4px 0; }
  .sys-news .mast { text-align:center; font-size: 34px; border-bottom: 3px double var(--bone-dim); margin-bottom: 8px; letter-spacing: 2px; }
  .sys-fighter { display:flex; justify-content:space-between; align-items:center; gap: 8px; padding: 5px 8px; border-bottom: 1px solid #2a241d; }
  .sys-fighter.beaten { opacity: .45; text-decoration: line-through; }
  .sys-fighter.next { background: #2a1512; }
  `;
  const el = document.createElement('style');
  el.id = 'sys-styles';
  el.textContent = css;
  document.head.appendChild(el);
}

export function meter(value, max = 100, color = 'var(--blood-bright)') {
  const pct = clamp((100 * value) / (max || 1), 0, 100);
  return `<span class="sys-meter"><i style="width:${pct}%;background:${color}"></i></span>`;
}

export function cashLine(game, extra = '') {
  const p = game.state.p;
  return `<div class="sys-cashline"><span class="pm-wallet">${chip('money', fmtMoney(p.money), 'cash', 'cash')}${chip('hall', fmtMoney(p.bank), 'muted', 'bank')}${chip('bolt', `${Math.floor(p.energy)}/${p.maxEnergy}`, 'muted', 'energy')}</span><span class="pm-wallet">${chip('clock', esc(game.time.label().replace(/^Day \d+ · /, '')), 'muted', 'time')}${extra ? `<span class="sys-hint">${extra}</span>` : ''}</span></div>`;
}

// A building's menu loop. Re-opens after each action until the player leaves.
// def: {
//   title, speaker, hours ([open, close] or null), closed(game, loc) -> html (text when closed),
//   closedOptions(game, loc) -> options (e.g. a backroom), text(game, loc) -> html,
//   options(game, loc) -> [{ label, hint, disabled, run: async () => 'leave'|void }], leaveLabel
// }
// Anything that calls ui.closeAll() (arrests, brawls, death, blackouts, cutscenes) should also stop any
// building menu loop that's waiting to re-open. We count closeAll() calls and bail when it changes.
let abortGen = 0;
export function installAbortHook(game) {
  const ui = game.ui;
  if (ui._sysAbortHooked) return;
  ui._sysAbortHooked = true;
  const orig = ui.closeAll.bind(ui);
  ui.closeAll = (...args) => { abortGen++; return orig(...args); };
  game.bus.on('player:died', () => { abortGen++; });
  game.bus.on('player:arrested', () => { abortGen++; });
}

// Visual building menu: header (portrait / place icon, name, who + hours, short flavor), grouped action
// cards with icon chips for cost / effects, disabled cards with a reason badge, wallet footer.
// Resolves to the ORIGINAL option index (or null). Keys 1-9 pick cards in the order shown.
export function placeDialog(game, { title = '', loc = null, speaker = '', flavor = '', options = [], hours = null, closed = false, leaveLabel = 'Leave', width = 680 }) {
  const ui = game.ui;
  return new Promise((resolve) => {
    const p = game.state.p;
    // flavor: status lines (.sys-hint) become a quiet note row under the blurb
    const tmp = document.createElement('div');
    tmp.innerHTML = flavor || '';
    const notes = [...tmp.querySelectorAll('.sys-hint')].map((n) => { const h = n.innerHTML; n.remove(); return h; }).filter((h) => plain(h).trim());
    let fl = tmp.innerHTML.replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, '').replace(/(<br\s*\/?>\s*){2,}/gi, '<br>');
    // order: groups in order of first appearance, cards keep their order within a group
    const items = options.map((o, i) => ({ o, i, ...classify(o.label, o) })).filter((x) => !x.o.leave);
    const leave = options.findIndex((o) => o.leave);
    // lone cards from minor groups collect under "More" (fewer one-card headers); colors keep their group
    for (const it of items) it.sect = it.group;
    const count = (g) => items.filter((x) => x.sect === g).length;
    if (items.length > 4) for (const it of items) if (it.sect !== 'work' && it.sect !== 'other' && count(it.sect) === 1) it.sect = 'other';
    const order = [];
    for (const it of items) if (!order.includes(it.sect) && it.sect !== 'other') order.push(it.sect);
    if (items.some((x) => x.sect === 'other')) order.push('other');
    const showHeads = items.length > 4 && order.length > 1;
    const display = [];
    let body = '';
    for (const g of order) {
      const list = items.filter((x) => x.sect === g);
      if (showHeads) body += `<div class="pm-sect">${icon(classify('', { group: g }).icon)}<span>${GROUP_NAMES[g] || g}</span></div>`;
      for (const it of list) {
        const n = display.push(it);
        const { chips, reason } = hintChips(it.o.hint, it.o.disabled);
        const why = it.o.disabled ? (it.o.reason || reason || '') : '';
        body += `<button class="ui-opt pm-card g-${it.group}${it.o.disabled ? ' disabled' : ''}" data-d="${n - 1}"${it.o.hint ? ` title="${esc(plain(it.o.hint))}"` : ''}>
          <span class="k">${n <= 9 ? n : ''}</span><span class="pm-ico">${icon(it.icon)}</span>
          <span class="pm-main"><span class="pm-label">${it.o.label}</span>${chips || why || (!it.o.disabled && reason) ? `<span class="pm-chips">${chips}${!it.o.disabled && reason ? chip('lock', esc(reason), 'reason') : ''}${why ? chip('lock', esc(why), 'reason') : ''}</span>` : ''}</span>
        </button>`;
      }
    }
    if (!items.length) body = `<div class="pm-empty">${closed ? 'Nothing to do here until it opens.' : 'Nothing to do here right now.'}</div>`;
    const hrs = hoursLabel(hours).replace(/^Open /, '');
    const face = (() => {
      try { return speaker ? game.present?.portrait?.(speaker) : null; } catch { return null; }
    })();
    const wrap = document.createElement('div');
    wrap.className = 'pm' + (closed ? ' closed' : '');
    wrap.innerHTML = `
      <div class="pm-head">
        <div class="pm-face${face ? '' : ' ico'}">${face ? '' : icon(TYPE_ICON[loc?.type] || 'door')}</div>
        <div class="pm-id">
          <div class="pm-name">${title}</div>
          <div class="pm-sub">${speaker ? `<span class="pm-who">${speaker}</span>` : ''}<span class="pm-hours ${closed ? 'shut' : 'open'}">${closed ? 'Closed' : 'Open'} · ${hrs}</span></div>
          ${fl ? `<div class="pm-flavor">${fl}</div>` : ''}
          ${notes.length ? `<div class="pm-notes">${notes.map((n) => `<span>${n}</span>`).join('')}</div>` : ''}
        </div>
      </div>
      <div class="pm-grid">${body}</div>
      <div class="pm-foot">
        <span class="pm-wallet">${chip('money', fmtMoney(p.money), 'cash', 'cash')}${chip('hall', fmtMoney(p.bank), 'muted', 'bank')}${chip('bolt', `${Math.floor(p.energy)}/${p.maxEnergy}`, 'muted', 'energy')}${chip('clock', esc(game.time.label().replace(/^Day \d+ · /, '')), 'muted', 'time')}</span>
        <button class="ui-btn pm-leave">${icon('exit')}<span>${leaveLabel}</span><kbd>Esc</kbd></button>
      </div>`;
    if (face) wrap.querySelector('.pm-face').appendChild(face);
    const flEl = wrap.querySelector('.pm-flavor');
    let done = false;
    const entry = ui.openPanel({ title: '', body: wrap, width, className: 'pm-modal', onClose: () => { if (!done) { done = true; resolve(null); } } });
    const finish = (v) => { if (done) return; done = true; entry.onClose = null; entry.close(); resolve(v); };
    entry.isDialog = true;
    entry.isPlace = true;
    entry.choose = (d) => {
      const it = display[d];
      if (!it || it.o.disabled) return;
      finish(it.i);
    };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('.pm-card');
      if (b) { entry.choose(Number(b.dataset.d)); return; }
      if (e.target.closest('.pm-leave')) { finish(leave >= 0 ? leave : null); return; }
      if (flEl && e.target.closest('.pm-flavor') && flEl.classList.contains('clip')) flEl.classList.toggle('open');
    });
    // long blurbs clamp to a few lines; click to read the rest
    if (flEl) requestAnimationFrame(() => { if (flEl.scrollHeight > flEl.clientHeight + 2) flEl.classList.add('clip'); });
  });
}

export async function placeMenu(game, loc, def) {
  const ui = game.ui;
  const gen = abortGen;
  const title = def.title ?? loc?.name ?? '';
  const hrs = () => (typeof def.hours === 'function' ? def.hours(game, loc) : def.hours);
  const hoursOk = () => isOpen(game, hrs());
  const spk = () => { try { return typeof def.speaker === 'function' ? def.speaker(game, loc) : def.speaker; } catch { return ''; } };
  if (!hoursOk()) {
    const extra = (def.closedOptions?.(game, loc) || []).filter(Boolean);
    const closedText = def.closed?.(game, loc) ?? 'The door is locked. Someone has drawn a crude picture on it.';
    const opts = [...extra, { label: 'Leave', leave: true }];
    const i = await placeDialog(game, { title, loc, speaker: '', flavor: closedText, options: opts.map(strip), hours: hrs(), closed: true, width: def.width ?? 600 });
    if (i == null || opts[i].leave) return;
    try { await opts[i].run?.(); } catch (e) { console.error('[systems] closed option failed', e); }
    return;
  }
  for (let guard = 0; guard < 500; guard++) {
    let opts;
    try { opts = (def.options(game, loc) || []).filter(Boolean); } catch (e) { console.error('[systems] options failed', e); opts = []; }
    opts.push({ label: def.leaveLabel ?? 'Leave', leave: true });
    let html = '';
    try { html = def.text ? def.text(game, loc) : ''; } catch (e) { console.error('[systems] text failed', e); }
    const i = await placeDialog(game, { title, loc, speaker: spk(), flavor: html, options: opts.map(strip), hours: hrs(), leaveLabel: def.leaveLabel ?? 'Leave', width: Math.max(640, def.width ?? 0) });
    if (i == null || opts[i].leave) return;
    let r;
    try { r = await opts[i].run?.(); } catch (e) { console.error('[systems] action failed', opts[i].label, e); ui.toast('That broke. Smells like a bug.', 'bad'); }
    if (r === 'leave' || gen !== abortGen) return;
    if (game.state.p.hp <= 0 || game.player?.dead) return;
    if (!hoursOk()) {
      await ui.dialog({ title, text: def.closingText ?? "It's closing time. A large man with a mop handle escorts you to the door. Firmly." });
      return;
    }
  }
}

function strip(o) {
  return { label: o.label, hint: o.hint, disabled: o.disabled, leave: o.leave, group: o.group, icon: o.icon, reason: o.reason };
}

// Simple wrapper: show a result message and wait for "OK".
export function say(game, title, html, speaker = '') {
  return game.ui.dialog({ title, speaker, html, options: [{ label: 'OK' }] });
}

// Ask the player to pick one of several choices. Returns the choice value or null.
export async function choose(game, { title = '', speaker = '', html = '', text = '', choices = [] }) {
  const opts = [...choices.map((c) => ({ label: c.label, hint: c.hint, disabled: c.disabled })), { label: 'Never mind' }];
  const i = await game.ui.dialog({ title, speaker, html: html || esc(text), options: opts });
  if (i == null || i >= choices.length) return null;
  return choices[i].value ?? i;
}

let itemByName = null;
function ITEM_BY_NAME() {
  if (!itemByName) {
    itemByName = new Map();
    for (const it of Object.values(ITEMS)) if (it?.name) itemByName.set(it.name.toLowerCase(), it);
  }
  return itemByName;
}

// Generic store. def: {
//   title, speaker, intro (html), width,
//   sections: () => [{ name, products: [{ key, name, desc, price, priceLabel, req, owned, ownedLabel, tag,
//                                          qty (allow quantity), maxQty, btn, disabled, buy(qty) -> bool|void }] }]
// } -> Promise (resolves when closed)
export function shopPanel(game, def) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sp';
    const entry = game.ui.openPanel({ title: '', body: wrap, width: def.width ?? 760, className: 'sp-modal', onClose: () => resolve() });
    let products = [];
    let face = null;
    try { face = def.speaker ? game.present?.portrait?.(plain(def.speaker)) : null; } catch { face = null; }
    const detail = (pr) => {
      const d = wrap.querySelector('.sp-detail');
      if (!d) return;
      if (!pr) { d.innerHTML = '<span class="ui-muted">Hover or tap an item for details.</span>'; return; }
      d.innerHTML = `<b>${pr.name}</b>${pr.desc ? ` <span>${pr.desc}</span>` : ''}${pr.req ? ` <span class="sp-req">${reqHtml(game, pr.req)}</span>` : ''}`;
    };
    const render = () => {
      const p = game.state.p;
      let sections;
      try { sections = typeof def.sections === 'function' ? def.sections(game) : def.sections; } catch (e) { console.error(e); sections = []; }
      products = [];
      const intro = def.intro ? (typeof def.intro === 'function' ? def.intro(game) : def.intro) : '';
      let html = `<div class="pm-head sp-head">
          <div class="pm-face${face ? '' : ' ico'}">${face ? '' : icon('bag')}</div>
          <div class="pm-id"><div class="pm-name">${def.title || ''}</div>
            ${def.speaker ? `<div class="pm-sub"><span class="pm-who">${def.speaker}</span></div>` : ''}
            ${intro ? `<div class="pm-flavor">${intro}</div>` : ''}</div>
        </div><div class="sp-scroll">`;
      for (const sec of sections) {
        if (!sec || !sec.products?.length) continue;
        if (sec.name) html += `<div class="pm-sect"><span>${sec.name}</span></div>`;
        html += '<div class="sp-grid">';
        for (const pr of sec.products) {
          const idx = products.push(pr) - 1;
          const req = pr.req ? reqCheck(game, pr.req) : { ok: true };
          const afford = pr.price == null || p.money >= pr.price;
          const dis = pr.disabled || !req.ok || (!pr.owned && !afford) || (pr.owned && !pr.ownedAction);
          const cls = pr.owned ? 'owned' : !req.ok ? 'locked' : !afford ? 'broke' : '';
          const btnLabel = pr.owned ? (pr.ownedAction ?? pr.ownedLabel ?? 'Owned') : (pr.btn ?? 'Buy');
          const it = ITEM_BY_NAME().get(plain(pr.name).replace(/\s*×\s*\d+\s*$/, '').trim().toLowerCase());
          const fx = pr.fx ?? it?.fx;
          const ic = pr.icon ?? itemIcon(pr.name, it?.cat);
          const missing = req.ok ? '' : (req.parts || []).filter((x) => !x.ok).map((x) => plain(x.label)).join(', ');
          const priceTxt = pr.priceLabel ?? (pr.price != null ? fmtMoney(pr.price) : '');
          html += `<div class="sp-item ${cls}" data-p="${idx}">
            <div class="sp-top"><span class="sp-ico">${icon(ic)}</span>${priceTxt ? `<span class="sp-price">${priceTxt}</span>` : ''}</div>
            <div class="sp-name">${pr.name}</div>
            <div class="pm-chips">${fxChips(fx)}${pr.tag ? chip('', pr.tag, 'muted') : ''}${pr.owned ? chip('', pr.ownedLabel && !pr.ownedAction ? pr.ownedLabel : 'owned', 'gain') : ''}${missing ? chip('lock', esc(missing), 'reason') : ''}</div>
            <div class="sp-btns"><button class="ui-btn ${pr.owned ? '' : 'primary'}" data-i="${idx}" ${dis ? 'disabled' : ''}>${btnLabel}</button>
            ${pr.qty && !pr.owned ? `<button class="ui-btn sp-n" data-q="${idx}" ${dis ? 'disabled' : ''} title="Buy several">×N</button>` : ''}</div>
          </div>`;
        }
        html += '</div>';
      }
      html += '</div>';
      html += `<div class="sp-detail"></div>`;
      html += `<div class="pm-foot"><span class="pm-wallet">${chip('money', fmtMoney(p.money), 'cash', 'cash')}${chip('hall', fmtMoney(p.bank), 'muted', 'bank')}${chip('bolt', `${Math.floor(p.energy)}/${p.maxEnergy}`, 'muted', 'energy')}</span>
        ${def.footer ? `<span class="sp-foot">${typeof def.footer === 'function' ? def.footer(game) : def.footer}</span>` : ''}
        <button class="ui-btn pm-leave sp-close">${icon('exit')}<span>Done</span><kbd>Esc</kbd></button></div>`;
      const sc = wrap.querySelector('.sp-scroll')?.scrollTop || 0;
      wrap.innerHTML = html;
      const s2 = wrap.querySelector('.sp-scroll'); if (s2) s2.scrollTop = sc;
      if (face) wrap.querySelector('.pm-face')?.appendChild(face);
      detail(null);
    };
    const hover = (e) => { const c = e.target.closest?.('.sp-item'); if (c) detail(products[Number(c.dataset.p)]); };
    wrap.addEventListener('mouseover', hover);
    wrap.addEventListener('focusin', hover);
    wrap.addEventListener('click', async (e) => {
      if (e.target.closest('.sp-close')) { entry.close(); return; }
      const b = e.target.closest('button');
      if (!b) { hover(e); return; }
      if (b.disabled) return;
      const pr = products[Number(b.dataset.i ?? b.dataset.q)];
      if (!pr) return;
      let qty = 1;
      if (b.dataset.q != null) {
        const maxAff = pr.price ? Math.floor(game.state.p.money / pr.price) : 99;
        const max = Math.max(1, Math.min(pr.maxQty ?? 99, maxAff));
        const n = await game.ui.promptNumber({ title: `How many ${pr.name}?`, text: `${fmtMoney(pr.price)} each.`, max, min: 1, initial: 1 });
        if (!n) return;
        qty = n;
      }
      try {
        if (pr.owned && pr.onOwned) pr.onOwned();
        else await pr.buy?.(qty);
      } catch (err) { console.error('[systems] buy failed', err); }
      if (!entry.closed) render();
      if (def.closeOnBuy && !entry.closed) entry.close();
    });
    render();
    entry.rerender = render;
  });
}

// Minigame panel: def { title, width, build(api) } — api: { el, body, status(html, kind), cash(), close(), onClose(fn), closed }
export function gamePanel(game, def) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="sys-cashline-wrap"></div><div class="sys-game-body"></div><div class="sys-status"></div>`;
    const closers = [];
    const entry = game.ui.openPanel({
      title: def.title, body: wrap, width: def.width ?? 560,
      onClose: () => { api.closed = true; for (const f of closers) { try { f(); } catch (e) { console.error(e); } } resolve(api.result); },
    });
    const api = {
      el: wrap, body: wrap.querySelector('.sys-game-body'), closed: false, result: null,
      status(html, kind = '') { const s = wrap.querySelector('.sys-status'); s.className = 'sys-status ' + kind; s.innerHTML = html; },
      cash() { wrap.querySelector('.sys-cashline-wrap').innerHTML = cashLine(game, def.extra ? def.extra(game) : ''); },
      close() { entry.close(); },
      onClose(fn) { closers.push(fn); },
      timer(fn, ms) { const t = setInterval(fn, ms); closers.push(() => clearInterval(t)); return t; },
      timeout(fn, ms) { const t = setTimeout(fn, ms); closers.push(() => clearTimeout(t)); return t; },
    };
    api.cash();
    try { def.build(api); } catch (e) { console.error('[systems] minigame build failed', e); }
  });
}

// Bet picker html + accessor. Returns { html, get(root) }.
export function betInput(min, max, initial) {
  const init = clamp(initial ?? min, min, max);
  return {
    html: `<div class="sys-bet"><span>Bet</span><input type="number" class="sys-bet-in" min="${min}" max="${max}" value="${init}">
      <button class="ui-btn" data-bet="min">Min</button><button class="ui-btn" data-bet="x2">×2</button><button class="ui-btn" data-bet="half">½</button><button class="ui-btn" data-bet="max">Max</button>
      <span class="sys-hint">${fmtMoney(min)}–${fmtMoney(max)}</span></div>`,
    wire(root, game) {
      const inp = root.querySelector('.sys-bet-in');
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      root.querySelectorAll('[data-bet]').forEach((b) => b.addEventListener('click', () => {
        const v = Number(inp.value) || min;
        const m = { min, max: Math.min(max, game.state.p.money), x2: v * 2, half: Math.floor(v / 2) }[b.dataset.bet];
        inp.value = clamp(Math.floor(m), min, max);
      }));
      return () => clamp(Math.floor(Number(inp.value) || min), min, max);
    },
  };
}
