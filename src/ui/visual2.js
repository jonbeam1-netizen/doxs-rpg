// Second batch of shared visual helpers (quest log, perks, achievements, map legend, crew, sheet sections).
// Same look as src/ui/visual.js + the building menus (pm-*, sp-*, cs-* in styles.css); this file only adds
// the pieces those panels need. Styles are injected once on first use.
//   ic(name)                         line icon (present/icons.js set + a few extras below)
//   sect(icon, title, smallHtml)     section header (pm-sect look)
//   tile({ icon, value, label, sub, bar:[v,max], color, title })   stat tile
//   pips(done, total, cur)           segmented step progress
//   faceSlot(name, icon, cls)        placeholder that fillFaces() turns into a portrait copy
//   fillFaces(root, game)            paint portraits into every faceSlot under root
//   rewardChips(reward, text)        quest reward object -> icon chips
//   ok(label, good)                  ✓ / ✗ requirement chip
import { icon, hasIcon } from '../present/icons.js';
import { chip, bar } from './visual.js';
import { esc, fmtMoney } from '../core/util.js';

const EXTRA = {
  check: 'M3 8.4l3.2 3.2L13 4.6',
  target: 'M8 2.3a5.7 5.7 0 110 11.4A5.7 5.7 0 018 2.3zM8 5.2a2.8 2.8 0 110 5.6 2.8 2.8 0 010-5.6zM8 1v2M8 13v2M1 8h2M13 8h2',
  pin: 'M8 14.2s-4.6-4.5-4.6-7.6a4.6 4.6 0 019.2 0c0 3.1-4.6 7.6-4.6 7.6zM8 4.8a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6z',
  crown: 'M2.4 12.4h11.2M2.4 12.4L1.8 4.8l3.4 2.8L8 3l2.8 4.6 3.4-2.8-.6 7.6',
  spray: 'M5 6.4h4.4V14H5zM6 6.4V4.6h2.4v1.8M11.4 3.2h.01M13 2.2h.01M13 4.4h.01M11.4 5.4h.01',
  rat: 'M2 11.2c0-2.6 2.2-4.6 5.2-4.6 2.6 0 4.2 1.4 5 3l1.8.4-1.6 1.4H3.2zM10.2 6.8a1.3 1.3 0 112.2-1M12.4 11.4c.8.8 1.8 1 2.6.6M5.2 11.4v1.6M8.8 11.4v1.6',
  board: 'M2 8.4c0-1 .8-1.6 1.8-1.6h8.4c1 0 1.8.6 1.8 1.6s-.8 1.6-1.8 1.6H3.8C2.8 10 2 9.4 2 8.4zM4.6 11.8h.01M11.4 11.8h.01',
  eye_off: 'M2.4 2.4l11.2 11.2M6.4 4.1C6.9 3.8 7.4 3.6 8 3.6c4 0 6.5 4.4 6.5 4.4s-.7 1.3-2 2.5M4.1 5.3C2.4 6.5 1.5 8 1.5 8S4 12.4 8 12.4c1 0 1.9-.3 2.7-.7',
  users: 'M6 3.4a2.2 2.2 0 110 4.4 2.2 2.2 0 010-4.4zM1.8 13.4c.3-2.6 2-4 4.2-4s3.9 1.4 4.2 4M11 3.6a2 2 0 010 4M12 9.6c1.4.4 2.2 1.6 2.4 3.4',
};
export function ic(name) {
  if (hasIcon(name)) return icon(name);
  const d = EXTRA[name];
  return d ? `<svg class="pr-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${d}"/></svg>` : '';
}

export function sect(ico, title, small = '') {
  ensureStyles();
  return `<div class="pm-sect cs-h vx2-sect">${ic(ico)}<span>${title}</span>${small ? `<small>${small}</small>` : ''}</div>`;
}

export function tile({ icon: ico = 'star', value = '', label = '', sub = '', bar: b = null, color = '', title = '', cls = '' } = {}) {
  ensureStyles();
  return `<div class="vx2-tile ${cls}"${color ? ` style="--tc:${color}"` : ''}${title ? ` title="${esc(title)}"` : ''}>
    <span class="vx2-ti">${ic(ico)}</span><span class="vx2-tv">${value}</span><span class="vx2-tn">${label}</span>
    ${sub ? `<span class="vx2-ts">${sub}</span>` : ''}${b ? bar(b[0], b[1]) : ''}</div>`;
}

export function pips(done, total, cur = true) {
  const n = Math.max(1, Math.min(24, total | 0));
  let h = '';
  for (let i = 0; i < n; i++) h += `<i class="${i < done ? 'on' : i === done && cur ? 'cur' : ''}"></i>`;
  return `<span class="vx2-pips">${h}</span>`;
}

// chip() with the extra icons available
export function chip2(ico, text, kind = 'muted', title = '') {
  return `<span class="vx-chip ${kind}"${title ? ` title="${esc(title)}"` : ''}>${ic(ico)}${text != null && text !== '' ? `<b>${text}</b>` : ''}</span>`;
}

export function ok(label, good, title = '') {
  return chip2(good ? 'check' : 'x', label, (good ? 'gain' : 'cost') + ' vx2-req', title);
}

// Faces: present.portrait() hands out a cached master canvas, so each slot gets its own copy.
export function faceSlot(name, fallback = 'person', cls = '') {
  ensureStyles();
  return `<span class="vx2-face ${cls}" data-face="${esc(name || '')}">${ic(fallback)}</span>`;
}
export function fillFaces(root, game) {
  if (!root || !game?.present?.portrait) return;
  for (const el of root.querySelectorAll('[data-face]')) {
    const name = el.getAttribute('data-face');
    if (!name) continue;
    let src = null;
    try { src = game.present.portrait(name); } catch { src = null; }
    if (!src) continue;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    try { c.getContext('2d').drawImage(src, 0, 0); } catch { continue; }
    el.textContent = '';
    el.classList.add('has');
    el.appendChild(c);
  }
}

// Quest reward -> chips. `text` (the flavor line) rides along as a gift chip when the object doesn't say it all.
export function rewardChips(r, text = '', { pay = '' } = {}) {
  let h = '';
  if (pay) h += chip('money', esc(pay), 'cash');
  if (r && typeof r === 'object') {
    if (r.money) h += chip('money', fmtMoney(r.money), 'cash');
    if (r.xp) h += chip('star', '+' + r.xp + ' XP', 'gain');
    for (const [k, v] of Object.entries(r.stats || {})) h += chip({ str: 'gym', int: 'bulb', cha: 'smile' }[k] || 'up', `+${v} ${k.toUpperCase()}`, 'gain');
    if (r.karma) h += chip('scale', (r.karma > 0 ? '+' : '') + r.karma + ' karma', r.karma > 0 ? 'gain' : 'cost');
    if (r.weapon) h += chip('knife', 'weapon', 'gain');
    if (r.car) h += chip('car', 'vehicle', 'gain');
    if (r.items && Object.keys(r.items).length) h += chip('gift', 'item', 'gain');
    for (const [k, v] of Object.entries(r.rep || {})) h += chip('skull', `${v > 0 ? '+' : ''}${v} rep`, v > 0 ? 'gain' : 'cost', k);
  }
  const t = String(text || '').trim();
  const covered = r && (r.money || r.stats || r.weapon || r.items || r.car);
  if (t && !pay && !covered) h += chip('gift', esc(t.length > 46 ? t.slice(0, 44) + '…' : t), 'muted', t);
  return h;
}

export const KIND_ICON = { main: 'star', side: 'talk', job: 'work', faction: 'skull', epilogue: 'book', secret: 'eye' };

// ---------------------------------------------------------------- styles
let injected = false;
export function ensureStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.id = 'vx2-styles';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const CSS = `
/* shared bits */
.vx2-sect { margin: 14px 0 7px !important; }
.vx2-sect:first-child { margin-top: 2px !important; }
.vx2-sect small { margin-left: auto; letter-spacing: 0; text-transform: none; font-size: 12.5px; }
.vx2-sect small kbd { font-size: 11px; min-width: 0; padding: 0 4px; margin: 0 0 0 3px; }
.vx2-chip-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.vx-chip.vx2-req .pr-ico { width: 12px; height: 12px; stroke-width: 2.2; }
.vx-chip.info { color: #9fd3e0; border-color: #24434b; }
.vx-chip.gold { color: #f2c53d; border-color: #6b5512; background: rgba(214,179,60,0.1); }
.vx2-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; }
.vx2-tile { --tc: var(--rust); display: grid; grid-template-columns: auto 1fr; column-gap: 8px; row-gap: 1px; align-items: center; min-width: 0;
  padding: 7px 10px 8px; background: #1b1814; border: 1px solid #2e2821; border-top: 2px solid var(--tc); }
.vx2-ti { grid-row: 1 / 3; display: flex; color: var(--tc); }
.vx2-ti .pr-ico { width: 22px; height: 22px; }
.vx2-tv { font-size: 21px; font-weight: 800; line-height: 1; color: var(--bone); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vx2-tv small { font-size: 13px; font-weight: 600; color: var(--bone-dim); }
.vx2-tn { font-size: 12px; color: var(--bone-dim); text-transform: uppercase; letter-spacing: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vx2-ts { grid-column: 1 / -1; font-size: 13.5px; color: #cbc3b1; line-height: 1.2; margin-top: 4px;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.vx2-tile .vx-bar { grid-column: 1 / -1; margin-top: 5px; }
.vx2-tile .vx-bar i { background: var(--tc); }
.vx2-tile.dim { opacity: 0.55; }
.vx2-pips { display: flex; gap: 3px; width: 100%; }
.vx2-pips i { flex: 1; height: 5px; background: #2a241d; border-radius: 1px; }
.vx2-pips i.on { background: var(--qc, var(--toxic)); }
.vx2-pips i.cur { background: color-mix(in srgb, var(--qc, var(--toxic)) 45%, #2a241d); animation: vx2Pulse 1.6s ease-in-out infinite; }
@keyframes vx2Pulse { 50% { background: var(--qc, var(--toxic)); } }
.vx2-face { flex: none; display: flex; align-items: center; justify-content: center; overflow: hidden; width: 52px; height: 62px;
  color: var(--rust); background: radial-gradient(circle at 50% 40%, #2a2017, #0b0a09); border: 1px solid var(--panel-edge); border-bottom: 2px solid rgba(179,38,30,0.55); }
.vx2-face .pr-ico { width: 26px; height: 26px; stroke-width: 1.3; }
.vx2-face canvas { display: block; width: 100%; height: 100%; }
.vx2-face.sm { width: 34px; height: 40px; }
.vx2-face.sm .pr-ico { width: 18px; height: 18px; }
.vx2-ibox { --gc: var(--rust); flex: none; display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 6px; color: var(--gc);
  background: color-mix(in srgb, var(--gc) 15%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gc) 30%, transparent); }
.vx2-ibox .pr-ico { width: 18px; height: 18px; }
.vx2-btn.ui-btn { gap: 5px; padding: 4px 10px; font-size: 15px; min-height: 32px; border-radius: 2px; }
.vx2-btn.ui-btn .pr-ico { width: 14px; height: 14px; }
.vx2-btn.ui-btn.go { background: #2b2219; border-color: #5a4630; }
.vx2-btn.ui-btn.go:hover:not(:disabled) { background: var(--blood); border-color: var(--blood-bright); }
.vx2-iconbtn.ui-btn { width: 36px; height: 34px; padding: 0; border-radius: 3px; }
.vx2-iconbtn.ui-btn .pr-ico { width: 17px; height: 17px; }
.vx2-empty { padding: 18px 10px; text-align: center; color: var(--bone-dim); font-size: 16px; }
.vx2-empty .pr-ico { display: block; margin: 0 auto 6px; width: 30px; height: 30px; opacity: 0.6; }
.vx2-tabs.tabs { margin-bottom: 10px; flex-wrap: wrap; }
.vx2-tabs .tab { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 17px; }
.vx2-tabs .tab .pr-ico { width: 15px; height: 15px; }
.vx2-n { font-family: var(--font-body); font-size: 12px; font-weight: 800; line-height: 17px; min-width: 18px; padding: 0 5px; border-radius: 9px; text-align: center; background: #2e2821; color: var(--bone-dim); }
.tab.sel .vx2-n { background: var(--blood); color: #fff; }
.vx2-n.hot { background: var(--toxic); color: #10120a; }
.vx2-rows { display: flex; flex-direction: column; gap: 5px; }
.vx2-rows.two { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); }
.vx2-rows.two > .vx2-empty { grid-column: 1 / -1; }
.vx2-row { --gc: var(--rust); display: flex; align-items: center; gap: 10px; padding: 6px 10px 6px 7px; background: #1b1814; border: 1px solid #2e2821; border-left: 3px solid var(--gc); min-width: 0; }
.vx2-rt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.vx2-rt b { font-size: 16.5px; font-weight: 600; line-height: 1.15; }
.vx2-rt span { font-size: 13.5px; color: var(--bone-dim); line-height: 1.2; }
.vx2-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
.vx2-mini { --gc: var(--rust); display: flex; gap: 8px; align-items: center; padding: 6px 8px; background: #1b1814; border: 1px solid #2e2821; min-width: 0; }
.vx2-mini .vx2-rt b { font-size: 15px; }
.vx2-mini.dim { opacity: 0.5; }

/* quest log */
.qx-modal .ui-panel { padding-top: 14px; min-height: min(640px, calc(100vh - 32px)); }
.perk-modal .ui-panel { min-height: min(640px, calc(100vh - 32px)); }
.qx-list { display: flex; flex-direction: column; gap: 8px; }
.qx-card { --qc: #888; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px; padding: 10px 12px 10px 10px;
  background: #1b1814; border: 1px solid #2e2821; border-left: 3px solid var(--qc); border-radius: 2px; }
.qx-card.tracked { background: linear-gradient(100deg, color-mix(in srgb, var(--qc) 9%, #1b1814), #1b1814 60%); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--qc) 35%, transparent); }
.qx-id { min-width: 0; display: flex; flex-direction: column; gap: 4px; justify-content: center; }
.qx-kind { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--bone-dim); }
.qx-kind .pr-ico { width: 13px; height: 13px; color: var(--qc); }
.qx-kind .k { display: inline-flex; align-items: center; gap: 4px; color: var(--qc); font-weight: 700; }
.qx-title { font-family: var(--font-title); font-size: 21px; line-height: 1.1; color: var(--bone); }
.qx-step { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--bone-dim); white-space: nowrap; }
.qx-step .vx2-pips { max-width: 260px; }
.qx-obj { grid-column: 1 / -1; display: flex; gap: 8px; align-items: flex-start; font-size: 19px; line-height: 1.25; color: var(--bone);
  padding: 7px 10px; background: rgba(0,0,0,0.28); border-left: 2px solid var(--qc); }
.qx-obj > .pr-ico { flex: none; width: 18px; height: 18px; margin-top: 2px; color: var(--qc); }
.qx-obj .qx-timer { color: var(--blood-bright); font-weight: 800; white-space: nowrap; }
.qx-sum { grid-column: 1 / -1; font-size: 14.5px; line-height: 1.3; color: var(--bone-dim); margin-top: -2px;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.qx-foot { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 6px 10px; flex-wrap: wrap; }
.qx-btns { display: flex; gap: 5px; margin-left: auto; }
.qx-hero { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 6px 14px; align-items: center; padding: 12px 14px;
  background: linear-gradient(100deg, rgba(224,178,58,0.1), #1b1814 55%); border: 1px solid #3a3020; border-left: 3px solid #e0b23a; }
.qx-chap { width: 58px; height: 58px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center;
  border: 2px solid #e0b23a; color: #f2c53d; background: radial-gradient(circle at 50% 35%, #3a2d14, #14110d); box-shadow: 0 3px 12px rgba(0,0,0,0.5); }
.qx-chap b { font-family: var(--font-title); font-size: 27px; line-height: 0.9; }
.qx-chap small { font-size: 9.5px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--bone-dim); }
.qx-hero-t { min-width: 0; }
.qx-hero-k { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #e0b23a; }
.qx-hero-n { font-family: var(--font-title); font-size: 24px; line-height: 1.1; color: var(--bone); }
.qx-hero-s { font-size: 15.5px; line-height: 1.3; color: #cbc3b1; margin-top: 3px; }
.qx-ends { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.qx-ends-row { display: flex; gap: 3px; }
.qx-ends-row i { display: flex; align-items: center; justify-content: center; width: 22px; height: 28px; border-radius: 3px 3px 0 0; border: 1px solid #3b342b; color: #6b6253; background: #14110e; }
.qx-ends-row i.on { color: var(--ec); border-color: var(--ec); background: color-mix(in srgb, var(--ec) 18%, #14110e); }
.qx-ends-row .pr-ico { width: 13px; height: 13px; }
.qx-ends small { font-size: 12px; color: var(--bone-dim); letter-spacing: 1px; text-transform: uppercase; }
.qx-todo .vx2-row { border-left-color: var(--gc); padding: 4px 10px 4px 6px; }
.qx-todo .vx2-ibox { width: 26px; height: 26px; }
.qx-todo .vx2-ibox .pr-ico { width: 16px; height: 16px; }
.qx-todo .vx2-rt b { font-weight: 500; font-size: 16px; }
.qx-doors { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 7px; }
.qx-door { --dc: #888; display: flex; flex-direction: column; gap: 6px; padding: 9px 10px 10px; background: #1b1814; border: 1px solid #2e2821; border-top: 3px solid var(--dc); min-width: 0; }
.qx-door.locked { background: #171410; }
.qx-door.locked .qx-dh .vx2-ibox, .qx-door.locked .qx-dn { opacity: 0.6; }
.qx-door.done { background: linear-gradient(180deg, color-mix(in srgb, var(--dc) 12%, #1b1814), #1b1814 70%); }
.qx-dh { display: flex; gap: 9px; align-items: center; }
.qx-dh .vx2-ibox { --gc: var(--dc); width: 34px; height: 34px; }
.qx-dn { flex: 1; min-width: 0; }
.qx-dn b { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-title); font-weight: 400; font-size: 19px; line-height: 1.1; color: var(--dc); }
.qx-dn span { display: block; font-size: 12.5px; color: var(--bone-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qx-st { flex: none; align-self: flex-start; font-size: 11px; font-weight: 800; letter-spacing: 1.2px; padding: 1px 6px; border-radius: 2px; text-transform: uppercase; color: var(--bone-dim); border: 1px solid #3b342b; }
.qx-st.done { color: #10120a; background: var(--cash); border-color: var(--cash); }
.qx-st.finale { color: #1a140c; background: #f2c53d; border-color: #f2c53d; }
.qx-st.active { color: #e0b23a; border-color: #6b5512; }
.qx-st.available { color: #4fc3d9; border-color: #2a5a64; }
.qx-dq { font-size: 14px; color: #cbc3b1; line-height: 1.2; }
.qx-dq em { font-style: normal; color: var(--bone-dim); }
.qx-dp { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--bone-dim); white-space: nowrap; }
.qx-dp .vx-bar { flex: 1; height: 7px; }
.qx-dp .vx-bar i { background: var(--dc); }
.qx-door .pm-chips .vx-chip { white-space: normal; line-height: 15px; padding-top: 2px; padding-bottom: 2px; }
.qx-dx { font-size: 14px; line-height: 1.25; color: var(--bone); display: flex; gap: 5px; }
.qx-dx .pr-ico { flex: none; width: 14px; height: 14px; margin-top: 2px; color: var(--dc); }
.qx-dx.why { color: var(--bone-dim); }
.qx-dx span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.qx-miles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.qx-fac { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; padding: 9px 12px; background: #1b1814; border: 1px solid #2e2821; border-left: 3px solid var(--gc); }
.qx-fac .vx2-ibox { grid-row: 1 / 3; width: 36px; height: 36px; }
.qx-fac b { font-size: 18px; color: var(--gc); }
.qx-fac .vx-bar { grid-column: 2 / -1; height: 8px; }
.qx-fac .vx-bar i { background: var(--gc); }
.qx-fac.hostile .vx-bar i { background: var(--blood-bright); }
.qx-note { font-size: 13.5px; color: var(--bone-dim); margin-top: 6px; display: flex; gap: 6px; align-items: flex-start; }
.qx-note .pr-ico { flex: none; width: 14px; height: 14px; margin-top: 1px; color: var(--rust); }
@media (max-width: 600px) {
  .qx-card { grid-template-columns: minmax(0, 1fr); }
  .qx-card > .vx2-face { display: none; }
  .qx-obj { font-size: 17px; }
  .qx-hero { grid-template-columns: auto minmax(0, 1fr); }
  .qx-ends { grid-column: 1 / -1; flex-direction: row; justify-content: flex-start; }
  .qx-hero-n { font-size: 20px; }
  .qx-btns { margin-left: 0; width: 100%; }
  .qx-btns .vx2-btn { flex: 1; }
  .vx2-tabs .tab { padding: 6px 9px; font-size: 15px; }
  .vx2-tabs .tab .lbl { display: none; }
  .vx2-tabs .tab.sel .lbl { display: inline; }
}

/* perks */
.px-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 10px; }
.px-pts { display: flex; align-items: center; gap: 10px; padding: 5px 14px 5px 6px; border-radius: 30px; background: #1b1814; border: 1px solid #2e2821; }
.px-pts b { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; font-size: 22px; font-weight: 800; color: #6b6253; background: #14110e; border: 2px solid #3b342b; }
.px-pts.on b { color: #10120a; background: var(--toxic); border-color: #d6f070; box-shadow: 0 0 14px rgba(165,194,52,0.45); animation: pxGlow 1.8s ease-in-out infinite; }
@keyframes pxGlow { 50% { box-shadow: 0 0 2px rgba(165,194,52,0.2); } }
.px-pts span { font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--bone-dim); line-height: 1.2; }
.px-pts span em { display: block; font-style: normal; font-size: 16px; letter-spacing: 0; text-transform: none; color: var(--bone); }
.px-trees { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.px-tree { --tree: #888; position: relative; padding: 8px 6px 10px; background: linear-gradient(180deg, color-mix(in srgb, var(--tree) 8%, #15120f), #12100d 40%); border: 1px solid #2a241d; border-top: 3px solid var(--tree); }
.px-th { display: flex; align-items: center; gap: 8px; padding: 0 4px 8px; }
.px-th .vx2-ibox { --gc: var(--tree); }
.px-th b { font-family: var(--font-title); font-weight: 400; font-size: 21px; color: var(--tree); flex: 1; }
.px-th small { font-size: 13px; color: var(--bone-dim); }
.px-th .vx-bar { width: 52px; }
.px-th .vx-bar i { background: var(--tree); }
.px-svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.px-svg path { fill: none; stroke: #4a4034; stroke-width: 2; stroke-dasharray: 4 4; stroke-linejoin: round; }
.px-svg path.on { stroke: var(--tree); stroke-dasharray: none; opacity: 0.85; }
.px-tier { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); justify-items: center; padding: 6px 0; }
.px-tier + .px-tier { margin-top: 6px; }
.px-tier::before { content: ''; position: absolute; left: 10%; right: 10%; top: -4px; border-top: 1px dashed #2a241d; }
.px-tier:first-of-type::before { display: none; }
.px-node { grid-row: 1; position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; width: min(84px, 100%); padding: 2px 0; background: none; border: none; cursor: pointer; color: var(--bone); font-family: var(--font-body); }
.px-orb { position: relative; display: flex; align-items: center; justify-content: center; width: 50px; height: 50px; border-radius: 50%;
  background: #14110e; border: 2px solid #3b342b; color: #6b6253; transition: transform 0.1s, box-shadow 0.15s; }
.px-orb .pr-ico { width: 24px; height: 24px; stroke-width: 1.5; }
.px-nm { font-size: 13px; line-height: 1.1; text-align: center; color: var(--bone-dim); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; min-height: 2.2em; }
.px-badge { position: absolute; right: -4px; bottom: -3px; display: flex; align-items: center; justify-content: center; min-width: 19px; height: 19px; padding: 0 3px; border-radius: 10px;
  font-size: 10.5px; font-weight: 800; background: #2a241d; color: var(--bone-dim); border: 1px solid #000; }
.px-badge .pr-ico { width: 11px; height: 11px; stroke-width: 2.2; }
.px-node.owned .px-orb { background: var(--tree); border-color: color-mix(in srgb, var(--tree) 60%, #fff); color: #120f0c; box-shadow: 0 0 12px color-mix(in srgb, var(--tree) 45%, transparent); }
.px-node.owned .px-nm { color: var(--bone); }
.px-node.owned .px-badge { background: var(--bone); color: #120f0c; }
.px-node.available .px-orb { border-color: var(--tree); color: var(--tree); background: color-mix(in srgb, var(--tree) 14%, #14110e); animation: pxAvail 1.6s ease-in-out infinite; }
.px-node.available .px-nm { color: var(--bone); }
@keyframes pxAvail { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--tree) 22%, transparent); } }
.px-node.nopoints .px-orb { border-color: color-mix(in srgb, var(--tree) 50%, #3b342b); color: color-mix(in srgb, var(--tree) 70%, #6b6253); }
.px-node.locked .px-orb { opacity: 0.55; }
.px-node:hover .px-orb, .px-node:focus-visible .px-orb, .px-node.pad-focus .px-orb, .px-node.sel .px-orb { transform: scale(1.08); box-shadow: 0 0 0 2px var(--bone); }
.px-node.pad-focus { outline: none !important; box-shadow: none !important; }
.px-node:focus { outline: none; }
.px-detail { position: sticky; bottom: -16px; z-index: 3; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 3px 12px; align-items: center; margin-top: 10px; padding: 9px 12px; min-height: 64px;
  box-shadow: 0 -10px 18px rgba(10,9,8,0.85); background: #14110e; border: 1px solid #2a241d; border-left: 3px solid var(--tree, var(--rust)); }
.px-detail .vx2-ibox { --gc: var(--tree, var(--rust)); grid-row: 1 / 3; width: 40px; height: 40px; }
.px-detail .vx2-ibox .pr-ico { width: 22px; height: 22px; }
.px-dn { font-family: var(--font-title); font-size: 19px; color: var(--bone); }
.px-dn small { font-family: var(--font-body); font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--tree, var(--bone-dim)); margin-left: 8px; }
.px-dd { grid-column: 2; font-size: 15px; line-height: 1.3; color: #cbc3b1; }
.px-dd .pm-chips { margin-top: 4px; }
.px-detail .ui-btn { grid-row: 1 / 3; grid-column: 3; }
.px-detail.empty { grid-template-columns: 1fr; color: var(--bone-dim); font-size: 15px; text-align: center; border-left-color: #2a241d; }
@media (max-width: 760px) {
  .px-trees { grid-template-columns: minmax(0, 1fr); }
  .px-detail { grid-template-columns: auto minmax(0, 1fr); bottom: -14px; }
  .px-detail .ui-btn { grid-row: auto; grid-column: 1 / -1; }
}
/* achievements */
.ax-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 6px; }
.ax { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 9px; align-items: center; padding: 8px 9px; background: #15130f; border: 1px solid #2a241d; min-width: 0; }
.ax-i { grid-row: 1 / 4; align-self: start; display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 50%; color: #5a5246; background: #1b1814; border: 1px solid #2e2821; }
.ax-i .pr-ico { width: 20px; height: 20px; }
.ax b { font-size: 15px; font-weight: 600; line-height: 1.15; color: var(--bone-dim); }
.ax span { font-size: 13px; line-height: 1.2; color: #7f7868; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.ax .ax-p { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--bone-dim); }
.ax .ax-p .vx-bar { flex: 1; height: 5px; }
.ax .ax-p .vx-bar i { background: var(--energy); opacity: 0.7; }
.ax.got { background: linear-gradient(120deg, rgba(214,179,60,0.13), #1b1814 60%); border-color: #4d3f14; }
.ax.got .ax-i { color: #1a140c; background: radial-gradient(circle at 40% 35%, #f6d25c, #b8891c); border-color: #f2c53d; box-shadow: 0 0 10px rgba(214,179,60,0.3); }
.ax.got b { color: var(--bone); }
.ax.got span { color: var(--bone-dim); }
.ax .ax-d { font-size: 11.5px; color: var(--energy); letter-spacing: 1px; text-transform: uppercase; }
.ax-head { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; flex-wrap: wrap; }
.ax-head .vx-bar { flex: 1; min-width: 120px; max-width: 320px; height: 8px; }
.ax-head .vx-bar i { background: var(--energy); }
.ax-filter { display: flex; gap: 4px; margin-left: auto; }
.ax-filter .ui-btn { padding: 3px 10px; font-size: 14px; min-height: 30px; }
.ax-filter .ui-btn.on { border-color: var(--rust); background: #2a231b; }

/* map side panel */
.map-legend.ml2 { width: 236px; padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.ml2-tabs { flex: none; display: flex; border-bottom: 1px solid var(--panel-edge); }
.ml2-tabs button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 7px 4px; background: transparent; border: none; border-bottom: 2px solid transparent;
  color: var(--bone-dim); font-family: var(--font-body); font-size: 14px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; }
.ml2-tabs button.sel { color: var(--bone); border-bottom-color: var(--blood); background: rgba(255,255,255,0.03); }
.ml2-tabs .pr-ico { width: 14px; height: 14px; }
.ml2-body { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 8px 10px; scrollbar-width: thin; scrollbar-color: #4a4034 transparent; }
.ml2-cat { margin-bottom: 6px; }
.ml2-ch { display: flex; align-items: center; gap: 7px; width: 100%; padding: 5px 6px; background: #1b1814; border: 1px solid #2e2821; border-radius: 2px; color: var(--bone);
  font-family: var(--font-body); font-size: 14px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; text-align: left; }
.ml2-ch:hover { border-color: var(--rust); }
.ml2-ch > .pr-ico { width: 15px; height: 15px; color: var(--rust); }
.ml2-ch span { flex: 1; }
.ml2-ch small { font-size: 12px; color: var(--bone-dim); letter-spacing: 0; }
.ml2-eye { display: flex; color: var(--toxic); }
.ml2-eye .pr-ico { width: 15px; height: 15px; }
.ml2-cat.off .ml2-ch { opacity: 0.55; }
.ml2-cat.off .ml2-eye { color: var(--bone-dim); }
.ml2-cat.off .ml2-items { display: none; }
.ml2-items { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 6px; padding: 4px 2px 0 4px; }
.ml2-it { display: flex; align-items: center; gap: 6px; font-size: 13.5px; line-height: 20px; color: #cbc3b1; min-width: 0; }
.ml2-it span:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ml2-it .ml-ico { width: 16px; height: 16px; font-size: 10px; }
.ml2-it .ml-ico.dot { width: 10px; height: 10px; }
.ml2-it .ml-ico.dia { width: 11px; height: 11px; }
.ml2-search { width: 100%; padding: 5px 8px; margin: 2px 0 6px; background: #0f0d0b; color: var(--bone); border: 1px solid var(--panel-edge); font-family: var(--font-body); font-size: 15px; user-select: text; }
.ml2-dist { margin: 8px 0 3px; font-size: 11.5px; letter-spacing: 2px; text-transform: uppercase; color: var(--dc, var(--bone-dim)); border-bottom: 1px solid #2a241d; padding-bottom: 2px; }
.ml2-dist:first-child { margin-top: 2px; }
.ml2-pl { display: flex; align-items: center; gap: 7px; width: 100%; padding: 3px 4px; background: none; border: 1px solid transparent; color: var(--bone); font-family: var(--font-body); font-size: 14.5px; cursor: pointer; text-align: left; border-radius: 2px; }
.ml2-pl:hover, .ml2-pl.pad-focus { background: #221d17; border-color: #3b342b; }
.ml2-pl span:nth-child(2) { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ml2-pl small { font-size: 11.5px; color: var(--bone-dim); white-space: nowrap; }
.ml2-pl .ml-ico { width: 18px; height: 18px; }
.map-btn .pr-ico { width: 16px; height: 16px; vertical-align: -3px; }
.map-btn.wide { display: inline-flex; align-items: center; gap: 5px; }
@media (max-width: 700px), (max-height: 520px) { .map-legend.ml2 { width: 200px; } .ml2-items { grid-template-columns: 1fr; } }
@media (pointer: coarse) { .ml2-pl { min-height: 36px; } .ml2-ch { min-height: 38px; } }
body.touch-ui .ml2-pl { min-height: 36px; }

/* crew */
.cw-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 7px; }
.cw-card { --gc: #40e0ff; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 10px; padding: 9px 10px; background: #1b1814; border: 1px solid #2e2821; border-left: 3px solid var(--gc); min-width: 0; }
.cw-card.me { --gc: #f0e8d0; }
.cw-av { position: relative; grid-row: 1 / 3; display: flex; align-items: center; justify-content: center; width: 46px; height: 46px; border-radius: 50%;
  font-family: var(--font-title); font-size: 22px; color: #120f0c; background: var(--gc); box-shadow: 0 2px 8px rgba(0,0,0,0.5); }
.cw-lv { position: absolute; right: -6px; bottom: -4px; min-width: 22px; height: 18px; padding: 0 4px; border-radius: 9px; font-family: var(--font-body); font-size: 11.5px; font-weight: 800; line-height: 16px; text-align: center;
  background: #14110e; color: var(--bone); border: 1px solid var(--gc); }
.cw-top { display: flex; align-items: baseline; gap: 6px; min-width: 0; flex-wrap: wrap; }
.cw-top b { font-size: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.cw-tag { font-size: 10.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 0 5px; border-radius: 2px; background: #2e2821; color: var(--bone-dim); }
.cw-hp { display: grid; grid-template-columns: auto 1fr auto; gap: 6px; align-items: center; font-size: 12.5px; color: var(--bone-dim); }
.cw-hp .pr-ico { width: 13px; height: 13px; color: var(--blood-bright); }
.cw-hp .vx-bar { height: 7px; }
.cw-meta { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
.cw-acts { grid-column: 1 / -1; display: flex; gap: 5px; }
.cw-acts .ui-btn { flex: 1; gap: 5px; padding: 4px 6px; font-size: 14px; min-height: 34px; }
.cw-acts .ui-btn .pr-ico { width: 15px; height: 15px; }
.cw-pot { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; margin-top: 10px; padding: 10px 12px; background: #1b1814; border: 1px solid #2e2821; border-left: 3px solid var(--cash); }
.cw-pot .vx2-ibox { --gc: var(--cash); grid-row: 1 / 3; width: 40px; height: 40px; }
.cw-pot .vx2-ibox .pr-ico { width: 22px; height: 22px; }
.cw-pot b { font-size: 24px; font-weight: 800; color: var(--cash); line-height: 1; }
.cw-pot b small { font-size: 12px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: var(--bone-dim); margin-left: 6px; }
.cw-pot .cw-pb { grid-row: 1 / 3; grid-column: 3; display: flex; gap: 5px; }
.cw-bonus { margin-top: 8px; display: flex; gap: 8px; align-items: center; padding: 6px 10px; font-size: 15px; color: var(--cash); background: rgba(127,191,77,0.08); border: 1px solid #34481f; }
.cw-bonus .pr-ico { width: 16px; height: 16px; }
.cw-keys { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; color: var(--bone-dim); }
.cw-keys kbd { font-size: 11.5px; min-width: 0; padding: 0 5px; margin-right: 4px; }
.cw-solo { display: flex; gap: 10px; align-items: center; padding: 10px 12px; margin-bottom: 8px; background: #14110e; border: 1px dashed #3b342b; color: var(--bone-dim); font-size: 15px; }
.cw-solo .pr-ico { width: 22px; height: 22px; color: var(--rust); flex: none; }
@media (max-width: 600px) { .cw-list { grid-template-columns: minmax(0, 1fr); } .cw-pot { grid-template-columns: auto minmax(0, 1fr); } .cw-pot .cw-pb { grid-row: auto; grid-column: 1 / -1; } .cw-pot .cw-pb .ui-btn { flex: 1; } }
`;
