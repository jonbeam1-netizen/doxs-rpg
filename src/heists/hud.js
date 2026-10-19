import { esc, fmtMoney, clamp } from '../core/util.js';

// Heist HUD: objective list / timer / loot (left side, under the stat panel),
// a centered hold-progress bar and a "suspicion" meter for quiet jobs.

const CSS = `
#heist-hud { position:absolute; left:12px; top:186px; width:270px; pointer-events:none; text-shadow:1px 1px 0 #000;
  background:linear-gradient(180deg, rgba(14,12,10,.85), rgba(14,12,10,.55)); border:1px solid var(--panel-edge); border-left:3px solid var(--blood);
  padding:8px 10px; font-size:15px; line-height:1.2; display:none; }
#heist-hud.on { display:block; }
#heist-hud .hh-title { font-family:var(--font-title); font-size:18px; color:var(--bone); display:flex; justify-content:space-between; gap:6px; }
#heist-hud .hh-mode { font-size:12px; letter-spacing:1px; padding:1px 6px; border:1px solid #3b342b; color:var(--bone-dim); align-self:center; }
#heist-hud .hh-mode.loud { color:#fff; background:var(--blood); border-color:var(--blood-bright); animation: hhBlink 1s steps(2) infinite; }
@keyframes hhBlink { 50% { background:#6d1510; } }
#heist-hud .hh-timer { font-size:26px; font-weight:800; color:var(--energy); margin:2px 0 4px; }
#heist-hud .hh-timer.low { color:var(--blood-bright); animation: hhBlink2 .6s steps(2) infinite; }
@keyframes hhBlink2 { 50% { opacity:.55; } }
#heist-hud .hh-obj { color:var(--bone-dim); padding-left:16px; position:relative; margin:1px 0; }
#heist-hud .hh-obj:before { content:'○'; position:absolute; left:0; }
#heist-hud .hh-obj.done { color:#6a7a5a; text-decoration:line-through; }
#heist-hud .hh-obj.done:before { content:'✔'; color:var(--cash); }
#heist-hud .hh-obj.cur { color:var(--bone); font-weight:700; }
#heist-hud .hh-obj.cur:before { content:'▶'; color:var(--energy); }
#heist-hud .hh-obj .pg { color:var(--energy); font-weight:400; }
#heist-hud .hh-loot { margin-top:6px; padding-top:5px; border-top:1px solid #3b342b; color:var(--bone-dim); }
#heist-hud .hh-loot b { color:var(--cash); }
#heist-hud .hh-crew { margin-top:4px; font-size:13px; color:var(--bone-dim); }
#heist-hud .hh-crew .out { text-decoration:line-through; color:#6d1510; }
#heist-hud .hh-keys { margin-top:5px; font-size:12px; color:#8a8370; }
#heist-prog { position:absolute; left:50%; bottom:calc(22% + 46px); transform:translateX(-50%); width:320px; display:none; pointer-events:none; text-align:center; text-shadow:1px 1px 0 #000; }
#heist-prog.on { display:block; }
#heist-prog .lbl { font-size:17px; margin-bottom:3px; }
#heist-prog .bar { height:14px; background:#1d1915; border:1px solid #000; position:relative; overflow:hidden; }
#heist-prog .bar i { position:absolute; left:0; top:0; bottom:0; background:linear-gradient(90deg, #6b5512, var(--energy)); }
#heist-sus { position:absolute; left:50%; top:16%; transform:translateX(-50%); display:none; pointer-events:none; text-align:center; text-shadow:1px 1px 0 #000; }
#heist-sus.on { display:block; }
#heist-sus .eye { font-size:30px; }
#heist-sus .bar { width:140px; height:7px; background:#1d1915; border:1px solid #000; margin:2px auto 0; position:relative; }
#heist-sus .bar i { position:absolute; left:0; top:0; bottom:0; background:var(--blood-bright); }
.heist-board .hb-card { background:#1b1814; border:1px solid #2e2821; padding:8px 10px; margin-bottom:6px; }
.heist-board .hb-card.locked { opacity:.55; }
.heist-board .hb-card h4 { margin:0; font-size:19px; display:flex; justify-content:space-between; gap:8px; }
.heist-board .hb-card h4 .pay { color:var(--cash); white-space:nowrap; }
.heist-board .hb-card .d { font-size:15px; color:var(--bone-dim); margin:3px 0; }
.heist-board .hb-card .r { font-size:13px; }
.heist-board .hb-card .r.ok { color:var(--cash); } .heist-board .hb-card .r.no { color:var(--blood-bright); }
.heist-board .hb-card .btns { display:flex; gap:6px; margin-top:5px; flex-wrap:wrap; }
.heist-board .hb-card .btns .ui-btn { padding:3px 10px; font-size:16px; }
.heist-mg { text-align:center; }
.heist-mg .track { position:relative; height:30px; background:#14110e; border:2px solid #3b342b; margin:12px 0; overflow:hidden; }
.heist-mg .track .zone { position:absolute; top:0; bottom:0; background:rgba(127,191,77,.4); }
.heist-mg .track .needle { position:absolute; top:-2px; bottom:-2px; width:4px; margin-left:-2px; background:var(--bone); box-shadow:0 0 6px #fff; }
.heist-mg .pins { display:flex; justify-content:center; gap:8px; margin:6px 0; }
.heist-mg .pins span { width:18px; height:34px; border:2px solid #3b342b; background:#1b1814; }
.heist-mg .pins span.set { background:var(--cash); border-color:#3c5a26; }
.heist-mg .grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; margin:10px 0; }
.heist-mg .grid button { font-family:var(--font-title); font-size:20px; padding:8px 0; background:#14110e; color:var(--toxic); border:1px solid #2e3a1a; cursor:pointer; }
.heist-mg .grid button:hover { background:#22301a; }
.heist-mg .target { font-family:var(--font-title); font-size:32px; color:var(--toxic); letter-spacing:4px; }
.heist-mg .status { min-height:24px; font-size:17px; }
.heist-mg .status.bad { color:var(--blood-bright); } .heist-mg .status.good { color:var(--cash); }
.heist-mg .tbar { height:6px; background:#1d1915; border:1px solid #000; position:relative; margin-top:4px; }
.heist-mg .tbar i { position:absolute; left:0; top:0; bottom:0; background:var(--energy); }
`;

export class HeistHud {
  constructor(game) {
    this.game = game;
    if (!document.getElementById('heist-styles')) {
      const st = document.createElement('style');
      st.id = 'heist-styles';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const root = document.getElementById('ui-root') || document.body;
    this.el = document.createElement('div'); this.el.id = 'heist-hud'; root.appendChild(this.el);
    this.prog = document.createElement('div'); this.prog.id = 'heist-prog';
    this.prog.innerHTML = '<div class="lbl"></div><div class="bar"><i></i></div>';
    root.appendChild(this.prog);
    this.sus = document.createElement('div'); this.sus.id = 'heist-sus';
    this.sus.innerHTML = '<div class="eye">👁</div><div class="bar"><i></i></div>';
    root.appendChild(this.sus);
    this._last = '';
    this._progShown = false;
  }

  hide() {
    this.el.classList.remove('on');
    this.showProgress(null);
    this.showSuspicion(0);
    this._last = '';
  }

  // s: heist snapshot; me: local id; extra: { carrying, inCar, def }
  render(s, me, extra = {}) {
    if (!s || !this.game.started) { this.hide(); return; }
    const hudVisible = !document.getElementById('hud')?.classList.contains('hidden');
    const t = Math.max(0, Math.ceil(s.timeLeft));
    const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
    const cur = s.obj.findIndex((o) => !o.done && o.type !== 'escape');
    const escIdx = s.obj.findIndex((o) => o.type === 'escape');
    const lootStarted = s.bags.some((b) => b.s !== 'g') || s.obj.some((o) => o.type === 'loot' && o.done);
    const rows = s.obj.map((o, i) => {
      let cls = o.done ? 'done' : '';
      if (!o.done && (i === cur || (o.type === 'escape' && lootStarted))) cls = 'cur';
      let pg = '';
      if (o.type === 'hold' && !o.done && o.prog > 0) pg = ` <span class="pg">${Math.floor((100 * o.prog) / o.need)}%</span>`;
      if (o.type === 'loot') {
        const got = s.bags.filter((b) => b.s !== 'g' && b.s !== 'x').length;
        if (s.bags.length) pg = ` <span class="pg">${got}/${s.bags.length}</span>`;
      }
      if (o.type === 'truck_stop' && !o.done && s.truck) pg = s.truck.rams ? ` <span class="pg">rams ${s.truck.rams}/3</span>` : '';
      if (o.type === 'escape' && i === escIdx && !lootStarted) cls = '';
      return `<div class="hh-obj ${cls}">${esc(o.label)}${pg}</div>`;
    }).join('');
    const secured = s.bags.filter((b) => b.s === 's').reduce((a, b) => a + b.v, 0) + (s.extraGot || 0);
    const moving = s.bags.filter((b) => b.s === 'c' || b.s === 'k').reduce((a, b) => a + b.v, 0);
    const mine = s.bags.filter((b) => (b.s === 'c' || b.s === 'k') && b.by === me);
    const crew = s.crew.map((c) => `<span class="${c.out ? 'out' : ''}">${esc(c.name)}${c.id === me ? ' (you)' : ''}${c.masked ? ' 🎭' : ''}</span>`).join(', ');
    const html = `<div class="hh-title"><span>${esc(s.name)}</span><span class="hh-mode ${s.alarm ? 'loud' : ''}">${s.alarm ? 'ALARM' : s.approach === 'quiet' ? 'QUIET' : 'LOUD'}</span></div>
      <div class="hh-timer ${t <= 45 ? 'low' : ''}">${mm}:${ss}</div>
      ${rows}
      <div class="hh-loot">Secured <b>${fmtMoney(secured)}</b>${moving ? ` · in transit ${fmtMoney(moving)}` : ''}${mine.length ? `<br>You: ${mine.filter((b) => b.s === 'c').length ? '🎒 carrying a bag' : ''}${mine.some((b) => b.s === 'k') ? ` 🚗 ${mine.filter((b) => b.s === 'k').length} bag(s) in your car` : ''}` : ''}</div>
      ${s.crew.length > 1 ? `<div class="hh-crew">Crew: ${crew}</div>` : ''}
      <div class="hh-keys"><kbd>G</kbd> mask · <kbd>X</kbd> drop bag · <kbd>E</kbd> work/grab</div>`;
    if (html !== this._last) { this.el.innerHTML = html; this._last = html; }
    this.el.classList.toggle('on', hudVisible);
  }

  showProgress(label, frac = 0) {
    if (!label) { if (this._progShown) { this.prog.classList.remove('on'); this._progShown = false; } return; }
    this.prog.querySelector('.lbl').innerHTML = label;
    this.prog.querySelector('i').style.width = `${clamp(frac, 0, 1) * 100}%`;
    if (!this._progShown) { this.prog.classList.add('on'); this._progShown = true; }
  }

  showSuspicion(v) {
    const on = v > 0.02;
    this.sus.classList.toggle('on', on);
    if (on) this.sus.querySelector('i').style.width = `${clamp(v, 0, 1) * 100}%`;
  }
}
