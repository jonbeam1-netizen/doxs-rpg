// Reusable UI building blocks for every building in the systems module:
//   placeMenu(game, loc, def)   menu-driven building loop (Stick RPG style)
//   shopPanel(game, def)        product grid with buy buttons / requirements
//   gamePanel(game, def)        minigame panel with live cash header + status line
//   betInput(...)               bet amount picker for minigames
//   meter(value, max, color)    little progress bar html
import { fmtMoney, esc, clamp } from '../core/util.js';
import { isOpen, hoursLabel, reqCheck, reqHtml } from './common.js';

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
  return `<div class="sys-cashline"><span>Cash <b>${fmtMoney(p.money)}</b> · Bank ${fmtMoney(p.bank)} · Energy ${Math.floor(p.energy)}/${p.maxEnergy}</span><span>${game.time.label()}${extra ? ' · ' + extra : ''}</span></div>`;
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

export async function placeMenu(game, loc, def) {
  const ui = game.ui;
  const gen = abortGen;
  const title = def.title ?? loc?.name ?? '';
  const hoursOk = () => isOpen(game, typeof def.hours === 'function' ? def.hours(game, loc) : def.hours);
  if (!hoursOk()) {
    const extra = (def.closedOptions?.(game, loc) || []).filter(Boolean);
    const closedText = def.closed?.(game, loc) ?? `The door is locked. A sign says <em>${hoursLabel(def.hours)}</em>. Someone has drawn a crude picture on it.`;
    const opts = [...extra, { label: 'Leave', leave: true }];
    const i = await ui.dialog({ title, html: closedText + `<div class="sys-hint" style="margin-top:8px">${hoursLabel(typeof def.hours === 'function' ? def.hours(game, loc) : def.hours)} · now ${game.time.label()}</div>`, options: opts.map(strip) });
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
    const sp = typeof def.speaker === 'function' ? def.speaker(game, loc) : def.speaker;
    const i = await ui.dialog({ title, speaker: sp, html: html + cashLine(game), options: opts.map(strip), width: def.width ?? 600 });
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
  return { label: o.label, hint: o.hint, disabled: o.disabled };
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

// Generic store. def: {
//   title, speaker, intro (html), width,
//   sections: () => [{ name, products: [{ key, name, desc, price, priceLabel, req, owned, ownedLabel, tag,
//                                          qty (allow quantity), maxQty, btn, disabled, buy(qty) -> bool|void }] }]
// } -> Promise (resolves when closed)
export function shopPanel(game, def) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    const entry = game.ui.openPanel({ title: def.title, body: wrap, width: def.width ?? 760, onClose: () => resolve() });
    let products = [];
    const render = () => {
      const p = game.state.p;
      let sections;
      try { sections = typeof def.sections === 'function' ? def.sections(game) : def.sections; } catch (e) { console.error(e); sections = []; }
      products = [];
      let html = `${def.speaker ? `<div class="ui-speaker">${def.speaker}</div>` : ''}${def.intro ? `<div class="sys-intro">${typeof def.intro === 'function' ? def.intro(game) : def.intro}</div>` : ''}${cashLine(game)}`;
      for (const sec of sections) {
        if (!sec || !sec.products?.length) continue;
        if (sec.name) html += `<div class="sys-sect">${sec.name}</div>`;
        html += '<div class="sys-shop">';
        for (const pr of sec.products) {
          const idx = products.push(pr) - 1;
          const req = pr.req ? reqCheck(game, pr.req) : { ok: true };
          const afford = pr.price == null || p.money >= pr.price;
          const dis = pr.disabled || !req.ok || (!pr.owned && !afford) || (pr.owned && !pr.ownedAction);
          const cls = pr.owned ? 'owned' : !req.ok ? 'locked' : '';
          const btnLabel = pr.owned ? (pr.ownedAction ?? pr.ownedLabel ?? 'Owned') : (pr.btn ?? 'Buy');
          html += `<div class="sys-item ${cls}">
            <h4><span>${pr.name}</span><span class="pr">${pr.priceLabel ?? (pr.price != null ? fmtMoney(pr.price) : '')}</span></h4>
            ${pr.desc ? `<div class="d">${pr.desc}</div>` : '<div class="d"></div>'}
            ${pr.tag ? `<div class="tag">${pr.tag}</div>` : ''}
            ${pr.req ? `<div>${reqHtml(game, pr.req)}</div>` : ''}
            <div class="btns"><button class="ui-btn ${pr.owned ? '' : 'primary'}" data-i="${idx}" ${dis ? 'disabled' : ''}>${btnLabel}</button>
            ${pr.qty && !pr.owned ? `<button class="ui-btn" data-q="${idx}" ${dis ? 'disabled' : ''}>×N</button>` : ''}</div>
          </div>`;
        }
        html += '</div>';
      }
      if (def.footer) html += `<div class="sys-hint" style="margin-top:10px">${typeof def.footer === 'function' ? def.footer(game) : def.footer}</div>`;
      wrap.innerHTML = html;
    };
    wrap.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
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
