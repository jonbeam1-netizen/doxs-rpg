import { CHARACTERS, ENDINGS, FACTIONS, QUEST_ITEMS, INTRO, TUTORIAL } from '../data/quests.js';
import { esc, fmtMoney } from '../core/util.js';
import { KIND_COLORS } from './engine.js';

const CSS = `
.ui-text p, .ui-body p.q-say, .ui-body p.q-nar, .ui-body p.q-you { margin: 0 0 8px; }
.ui-body .q-nar { color: var(--bone-dim); font-style: italic; }
.ui-body .q-you b { color: var(--toxic, #a5c234); }
.ui-body .q-say { color: var(--bone); }
.ui-opt .q-mark { display:inline-block; width:16px; color:#e8e2d0; }
.ui-opt .q-mark.new { color:#f2c53d; }
.q-note { font-family: 'Special Elite', monospace; background:#d9cfb4; color:#2a1d10; padding:14px 18px; transform:rotate(-1.2deg);
  box-shadow: 0 4px 14px rgba(0,0,0,.6); margin: 4px 6px 12px; line-height:1.35; font-size:19px;
  background-image: radial-gradient(circle at 80% 20%, rgba(150,40,20,.35) 0 18px, transparent 19px), radial-gradient(circle at 15% 85%, rgba(90,60,20,.25) 0 30px, transparent 31px); }
.q-note small { font-size: 15px; }
#q-tracker { position:absolute; right:12px; top:300px; width:260px; text-align:right; pointer-events:none; text-shadow:1px 1px 0 #000; }
#q-tracker .qt-title { font-family: var(--font-title, 'Special Elite'), monospace; font-size:17px; letter-spacing:.5px; }
#q-tracker .qt-obj { font-size:16px; color: var(--bone); line-height:1.15; margin-top:2px; }
#q-tracker .qt-timer { font-size:22px; font-weight:800; color:#e2402f; margin-top:2px; }
#q-tracker .qt-more { font-size:13px; color: var(--bone-dim); margin-top:3px; }
#q-tracker .qt-key { font-size:12px; color: var(--bone-dim); }
@media (max-width:700px){ #q-tracker{ top:auto; bottom:64px; width:200px; } }
.q-log-tabs { display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap; }
.q-log-tabs .ui-btn.on { border-color: var(--rust, #b0672a); background:#2a231b; }
.q-card { background:#1b1814; border:1px solid #2e2821; border-left:4px solid #888; padding:10px 12px; margin-bottom:8px; }
.q-card h3 { margin:0 0 2px; font-size:20px; font-family: var(--font-title, 'Special Elite'), monospace; font-weight:400; }
.q-card .q-kind { font-size:12px; text-transform:uppercase; letter-spacing:1px; color: var(--bone-dim); }
.q-card .q-sum { color: var(--bone-dim); font-size:16px; margin:4px 0 6px; }
.q-card .q-obj { font-size:17px; }
.q-card .q-obj b { color:#f2c53d; }
.q-card .q-rew { font-size:15px; color: var(--cash, #8fbf4a); margin-top:4px; }
.q-card .q-row { display:flex; gap:8px; margin-top:6px; }
.q-card .q-row .ui-btn { font-size:14px; padding:4px 10px; }
.q-card.done { opacity:.7; border-left-color:#444; padding:6px 12px; }
.q-lead { font-size:16px; padding:4px 0; border-bottom:1px solid #2a241d; }
.q-lead b { color:#f2c53d; }
.q-rep { display:flex; align-items:center; gap:10px; margin:6px 0; font-size:17px; }
.q-rep .bar { flex:1; height:10px; background:#120f0c; border:1px solid #2e2821; position:relative; }
.q-rep .bar i { position:absolute; left:0; top:0; bottom:0; }
.ui-modal.q-ending { background: radial-gradient(ellipse at center, rgba(20,16,12,.94), rgba(0,0,0,.99)); padding:0; }
.ui-modal.q-ending .ui-panel { max-width:none !important; width:100%; height:100%; max-height:100vh; background:none; border:none; box-shadow:none;
  display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding:6vh 6vw; }
.q-end { max-width: 880px; width:100%; text-align:center; }
.q-end .q-end-sub { font-size:18px; letter-spacing:4px; text-transform:uppercase; color: var(--bone-dim); opacity:0; animation: qFade 1.2s .3s forwards; }
.q-end .q-end-title { font-family: var(--font-title, 'Special Elite'), monospace; font-size: clamp(42px, 8vw, 88px); line-height:1; margin:10px 0 24px; text-shadow: 4px 4px 0 #000;
  opacity:0; animation: qSlam .9s .6s forwards; }
.q-end p { font-size:20px; line-height:1.45; color: var(--bone); text-align:left; opacity:0; animation: qFade 1.4s forwards; margin:0 0 14px; }
.q-end .q-end-stats { display:grid; grid-template-columns: repeat(auto-fit, minmax(130px,1fr)); gap:8px; margin:22px 0; opacity:0; animation: qFade 1s forwards; }
.q-end .q-end-stats div { background:#1b1814; border:1px solid #2e2821; padding:8px; font-size:15px; color: var(--bone-dim); }
.q-end .q-end-stats b { display:block; font-size:22px; color: var(--bone); }
.q-end .q-end-btns { opacity:0; animation: qFade 1s forwards; display:flex; gap:10px; justify-content:center; }
@keyframes qFade { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:none; } }
@keyframes qSlam { 0% { opacity:0; transform: scale(2.2); } 60% { opacity:1; transform: scale(.95); } 100% { opacity:1; transform: scale(1); } }
.toast .q-toast-k { color:#f2c53d; text-transform:uppercase; font-size:14px; letter-spacing:1px; margin-right:6px; }
`;

export function injectStyles() {
  if (document.getElementById('quest-styles')) return;
  const s = document.createElement('style');
  s.id = 'quest-styles';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const KIND_LABEL = { main: 'Story', side: 'Side quest', job: 'Job', faction: 'Faction' };

export class QuestPanels {
  constructor(game, engine) {
    this.g = game;
    this.q = engine;
    injectStyles();
    this._buildTracker();
    this.logEntry = null;
    this.logTab = 'active';

    game.bus.on('quests:ending-request', ({ id, variant }) => this.showEnding(id, variant));
    game.bus.on('quests:changed', () => { this._trackerDirty = true; if (this.logEntry && !this.logEntry.closed) this._renderLog(); });

    addEventListener('keydown', (e) => {
      if (e.code !== 'KeyJ' || !game.started || e.repeat) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const top = game.ui.top?.();
      if (top && top === this.logEntry) { top.close(); return; }
      if (!game.ui.isBlocking()) this.openLog();
    });

    game.ui.sheetSections.push((g) => this._sheetSection(g));
    game.ui.menuButtons.push({ label: 'Quest log', hint: 'J', onClick: () => this.openLog() });
  }

  // ------------------------------------------------------------ tracker
  _buildTracker() {
    const el = document.createElement('div');
    el.id = 'q-tracker';
    (document.getElementById('hud') || document.getElementById('ui-root') || document.body).appendChild(el);
    this.trackerEl = el;
    this._trackerDirty = true;
    this._tt = 0;
  }

  updateTracker(dt) {
    this._tt += dt;
    const id = this.q.trackedId();
    const timeLeft = id ? this.q.get(id)?.sd?.timeLeft : null;
    if (!this._trackerDirty && this._tt < 0.25) return;
    this._tt = 0; this._trackerDirty = false;
    let html = '';
    if (id) {
      const d = this.q.def(id);
      const color = KIND_COLORS[d.kind] || '#ccc';
      const more = this.q.activeIds().length - 1;
      html = `<div class="qt-title" style="color:${color}">${esc(d.title)}</div><div class="qt-obj">${esc(this.q.objectiveText(id))}</div>`;
      if (timeLeft != null) {
        const s = Math.max(0, Math.ceil(timeLeft));
        html += `<div class="qt-timer">${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</div>`;
      }
      html += `<div class="qt-more">${more > 0 ? `+${more} more · ` : ''}<span class="qt-key">J: quest log</span></div>`;
    }
    if (this.trackerEl._last !== html) { this.trackerEl.innerHTML = html; this.trackerEl._last = html; }
  }

  // ------------------------------------------------------------ quest log
  openLog() {
    if (this.logEntry && !this.logEntry.closed) return this.logEntry;
    const wrap = document.createElement('div');
    this.logEntry = this.g.ui.openPanel({ title: 'Quest Log', body: wrap, width: 780, onClose: () => { this.logEntry = null; } });
    this.logEntry.isQuestLog = true;
    this._renderLog();
    return this.logEntry;
  }

  _renderLog() {
    const g = this.g, q = this.q, body = this.logEntry?.body;
    if (!body) return;
    const tabs = [['active', 'Active'], ['leads', 'Leads'], ['done', 'Completed'], ['factions', 'Factions & Endings']];
    let html = `<div class="q-log-tabs">${tabs.map(([k, l]) => `<button class="ui-btn ${this.logTab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>`;
    if (this.logTab === 'active') {
      const ids = q.activeIds().sort((a, b) => rank(q.def(a)) - rank(q.def(b)));
      if (!ids.length) html += '<div class="ui-muted">Nothing on your plate. Go bother somebody with a "!" over their head.</div>';
      const tracked = q.trackedId();
      for (const id of ids) {
        const d = q.def(id); const qq = q.get(id);
        const giver = CHARACTERS[d.giver]?.name;
        const steps = q.steps(id).length;
        const color = KIND_COLORS[d.kind] || '#888';
        const tl = qq.sd?.timeLeft;
        html += `<div class="q-card" style="border-left-color:${color}">
          <div class="q-kind">${KIND_LABEL[d.kind] || d.kind}${giver ? ' · from ' + esc(giver) : ''} · step ${qq.step + 1}/${steps}${id === tracked ? ' · <b style="color:#f2c53d">TRACKED</b>' : ''}</div>
          <h3 style="color:${color}">${esc(d.title)}</h3>
          ${d.summary || qq.data?.brief ? `<div class="q-sum">${esc(qq.data?.brief || d.summary)}</div>` : ''}
          <div class="q-obj"><b>▸</b> ${esc(q.objectiveText(id))}${tl != null ? ` <span class="ui-bad">(${Math.ceil(tl)}s left)</span>` : ''}</div>
          ${d.rewardText || qq.data?.payText ? `<div class="q-rew">Reward: ${esc(qq.data?.payText || d.rewardText)}</div>` : ''}
          <div class="q-row">${id !== tracked ? `<button class="ui-btn" data-track="${id}">Track</button>` : ''}${d.repeatable ? `<button class="ui-btn" data-abandon="${id}">Abandon</button>` : ''}</div>
        </div>`;
      }
    } else if (this.logTab === 'leads') {
      html += '<div class="ui-muted" style="margin-bottom:8px">People who might have work for you right now:</div>';
      let n = 0;
      for (const [cid, c] of Object.entries(CHARACTERS)) {
        const offers = q.offersFor(cid);
        if (!offers.length) continue;
        const loc = g.locations.get(c.loc);
        for (const d of offers) {
          n++;
          html += `<div class="q-lead"><b>!</b> <span style="color:${KIND_COLORS[d.kind]}">${esc(d.title)}</span> — ${esc(c.name)}${loc ? `, near <i>${esc(loc.name)}</i>` : ''}</div>`;
        }
      }
      const f = q.faction();
      if (f) html += `<div class="q-lead"><b>$</b> Repeatable jobs for the ${esc(FACTIONS[f].name)} at <i>${esc(g.locations.get(FACTIONS[f].hq)?.name || 'their HQ')}</i></div>`;
      else html += `<div class="q-lead"><b>$</b> Gangs pay for muscle: the Gutter Rats Clubhouse (Gutterside) or the Velvet Syndicate (Hilltop).</div>`;
      html += `<div class="q-lead"><b>$</b> Smuggling runs at Warehouse 13 in the Rustyards. Bring a car.</div>`;
      if (!n) html += '<div class="ui-muted" style="margin-top:8px">No new leads right now. Level up your stats, karma, or finish what you started.</div>';
    } else if (this.logTab === 'done') {
      const done = Object.entries(q.store).filter(([id, s]) => s.done && q.def(id));
      if (!done.length) html += '<div class="ui-muted">You haven\'t finished anything. Classic.</div>';
      for (const [id] of done) {
        const d = q.def(id);
        html += `<div class="q-card done" style="border-left-color:${KIND_COLORS[d.kind]}"><div class="q-kind">${KIND_LABEL[d.kind] || d.kind} · completed</div><h3>${esc(d.title)}</h3>${d.rewardText ? `<div class="q-rew">${esc(d.rewardText)}</div>` : ''}</div>`;
      }
      const jobs = ['job_rats', 'job_syndicate', 'smuggle'].map((k) => [k, g.state.getFlag('done_' + k, 0)]).filter(([, n]) => n);
      if (jobs.length) html += `<div class="ui-section">Odd jobs</div>` + jobs.map(([k, n]) => `<div class="q-lead">${esc(q.def(k)?.title || k)}: <b>${n}</b> done</div>`).join('');
    } else {
      html += this._factionHtml();
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.logTab = b.dataset.tab; this._renderLog(); }));
    body.querySelectorAll('[data-track]').forEach((b) => b.addEventListener('click', () => { q.track(b.dataset.track); }));
    body.querySelectorAll('[data-abandon]').forEach((b) => b.addEventListener('click', () => { q.abandon(b.dataset.abandon); }));
  }

  _factionHtml() {
    const g = this.g, q = this.q;
    const mine = q.faction();
    let html = '<div class="ui-section">Factions</div>';
    for (const F of Object.values(FACTIONS)) {
      const rep = q.rep(F.id);
      const pct = Math.max(0, Math.min(100, (rep / 220) * 100));
      html += `<div class="q-rep"><span style="width:170px;color:${F.color}">${esc(F.name)}${mine === F.id ? ' ★' : ''}</span>
        <span class="bar"><i style="width:${pct}%;background:${rep < 0 ? '#e2402f' : F.color}"></i></span>
        <span style="width:200px">${rep < 0 ? '<span class="ui-bad">Hostile</span>' : mine === F.id ? esc(q.rankName(F.id)) : 'Neutral'} (${rep})</span></div>`;
    }
    html += `<div class="ui-muted" style="font-size:15px">Joining one gang makes the other hate you. Detective Thorne won't work with gang members.</div>`;
    html += '<div class="ui-section">Endings reached</div>';
    const ends = g.state.getFlag('endings', []) || [];
    html += Object.entries(ENDINGS).map(([id, e]) => `<div class="q-lead">${ends.includes(id) ? `<b style="color:${e.color}">✔ ${esc(e.title)}</b>` : '<span class="ui-muted">??? — ' + esc(e.sub) + '</span>'}</div>`).join('');
    return html;
  }

  _sheetSection(g) {
    const q = this.q;
    const items = Object.entries(g.state.p.inventory || {}).filter(([id]) => QUEST_ITEMS[id]);
    const f = q.faction();
    const ends = g.state.getFlag('endings', []) || [];
    let html = '<div class="ui-section">Street cred</div><table class="ui-table">';
    html += `<tr><td>Gang</td><td>${f ? `${esc(FACTIONS[f].name)} — ${esc(q.rankName(f))} (${q.rep(f)} rep)` : 'Unaffiliated'}</td></tr>`;
    if (ends.length) html += `<tr><td>Titles</td><td>${ends.map((e) => esc(ENDINGS[e]?.title || e)).join(', ')}</td></tr>`;
    html += '</table>';
    if (items.length) html += `<div class="ui-section">Quest items</div><div class="ui-grid">${items.map(([id, n]) => `<div class="ui-card" title="${esc(QUEST_ITEMS[id].desc)}">${esc(QUEST_ITEMS[id].name)}${n > 1 ? ` <span class="ui-muted">×${n}</span>` : ''}<div class="ui-muted" style="font-size:14px">${esc(QUEST_ITEMS[id].desc)}</div></div>`).join('')}</div>`;
    return html;
  }

  // ------------------------------------------------------------ endings
  showEnding(id, variant) {
    const g = this.g, E = ENDINGS[id];
    if (!E) return;
    const p = g.state.p;
    const ends = [...(g.state.getFlag('endings', []) || [])];
    const first = !ends.includes(id);
    if (first) ends.push(id);
    g.state.setFlag('endings', ends);
    g.state.setFlag('ending_' + id, variant || true);
    g.bus.emit('ending:reached', { id, variant });
    try { g.net?.broadcast?.({ t: 'q_ending', name: p.name, title: E.title }); } catch { /* ignore */ }
    g.ui.closeAll();
    let paras = [];
    try { paras = E.epilogue(g, variant) || []; } catch (e) { console.error(e); }
    const delay = (i) => (1.6 + i * 1.1).toFixed(1);
    const stats = [
      ['Days in Rotwell', g.time.day], ['Level', p.level], ['Cash', fmtMoney(p.money)], ['Bank', fmtMoney(p.bank)],
      ['Strength', Math.floor(p.str)], ['Intelligence', Math.floor(p.int)], ['Charm', Math.floor(p.cha)], ['Karma', p.karma],
      ['Money earned', fmtMoney(p.totals?.earned || 0)], ['Fights won', p.totals?.fightsWon || 0], ['Product sold', p.totals?.drugsSold || 0], ['Times arrested', p.totals?.arrests || 0],
    ];
    const n = paras.length;
    const html = `<div class="q-end">
      <div class="q-end-sub">${esc(E.sub)}${first ? '' : ' (again)'}</div>
      <div class="q-end-title" style="color:${E.color}">${esc(E.title)}</div>
      ${paras.map((t, i) => `<p style="animation-delay:${delay(i)}s">${esc(t)}</p>`).join('')}
      <div class="q-end-stats" style="animation-delay:${delay(n)}s">${stats.map(([k, v]) => `<div><b>${esc(String(v))}</b>${esc(k)}</div>`).join('')}</div>
      <div class="ui-muted" style="opacity:0;animation:qFade 1s ${delay(n + 0.5)}s forwards;margin-bottom:12px">${ends.length}/${Object.keys(ENDINGS).length} endings found. Rotwell keeps going whether you like it or not.</div>
      <div class="q-end-btns" style="animation-delay:${delay(n + 0.8)}s"><button class="ui-btn primary" data-keep>Keep playing</button></div>
    </div>`;
    const entry = g.ui.openPanel({ title: '', body: html, closable: false, className: 'q-ending' });
    entry.body.querySelector('[data-keep]').addEventListener('click', () => {
      entry.close();
      g.ui.toast('The story\'s over. The rent isn\'t. Keep playing.', 'info', 4000);
      g.state.save(true);
    });
  }

  // ------------------------------------------------------------ intro
  async playIntro() {
    const g = this.g, q = this.q;
    await q.say(INTRO, { title: 'Roach Motel, Room 6', char: 'nar' });
    q.giveItem('q_note');
    q.start('main_prologue');
    g.state.setFlag('intro_done', true);
    TUTORIAL.forEach((t, i) => setTimeout(() => g.ui.toast(t, 'info', 5200), 1500 + i * 5000));
  }
}

function rank(d) { return { job: 0, main: 1, side: 2 }[d?.kind] ?? 3; }
