import { CHARACTERS, ENDINGS, FACTIONS, QUEST_ITEMS, INTRO, TUTORIAL } from '../data/quests.js';
import { esc, fmtMoney } from '../core/util.js';
import { KIND_COLORS } from './engine.js';
import { goalsHtml, goalsSheetHtml, PATHS } from './goals.js';
import { chip, bar } from '../ui/visual.js';
import { ic, chip2, sect, tile, pips, faceSlot, fillFaces, rewardChips, KIND_ICON } from '../ui/visual2.js';

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
.q-goal-main { background:#1b1814; border:1px solid #2e2821; border-left:4px solid #f2c53d; padding:10px 12px; margin-bottom:6px; }
.q-goal-main h3 { margin:0 0 2px; font-size:21px; font-family: var(--font-title, 'Special Elite'), monospace; font-weight:400; color:#f2c53d; }
.q-goal-main .q-kind { font-size:12px; text-transform:uppercase; letter-spacing:1px; color: var(--bone-dim); }
.q-goal-main .q-sum { color: var(--bone-dim); font-size:16px; margin:4px 0 6px; }
.q-card .q-reqs { margin:6px 0 2px; display:flex; flex-wrap:wrap; gap:4px; }
#q-tracker .qt-fin { display:inline-block; font-size:12px; letter-spacing:2px; background:#f2c53d; color:#1a140c; padding:0 6px; margin-right:6px; vertical-align:middle; }
.q-end .q-end-reward { font-size:18px; color:#f2c53d; margin:6px 0 4px; opacity:0; animation: qFade 1s forwards; }
.q-end .q-end-left { text-align:left; font-size:16px; color: var(--bone-dim); margin:4px auto 14px; max-width:620px; opacity:0; animation: qFade 1s forwards; }
.toast .q-toast-k { color:#f2c53d; text-transform:uppercase; font-size:14px; letter-spacing:1px; margin-right:6px; }
`;

export function injectStyles() {
  if (document.getElementById('quest-styles')) return;
  const s = document.createElement('style');
  s.id = 'quest-styles';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const KIND_LABEL = { main: 'Story', side: 'Side quest', job: 'Job', faction: 'Gang', epilogue: 'Epilogue', secret: 'Secret' };

export class QuestPanels {
  constructor(game, engine) {
    this.g = game;
    this.q = engine;
    injectStyles();
    this._buildTracker();
    this.logEntry = null;
    this.logTab = 'goals';

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
      const fin = !!this.q.current(id)?.finale;
      html = `<div class="qt-title" style="color:${color}">${fin ? '<span class="qt-fin">FINALE</span>' : ''}${esc(d.title)}</div><div class="qt-obj">${esc(this.q.objectiveText(id).replace(/^FINALE: /, ''))}</div>`;
      if (timeLeft != null) {
        const s = Math.max(0, Math.ceil(timeLeft));
        const waiting = this.q.current(id)?.obj?.night && !this.g.time.isNight;
        html += `<div class="qt-timer">${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${waiting ? ' <span class="qt-key">(clock starts after 8 PM)</span>' : ''}</div>`;
      }
      html += `<div class="qt-more">${more > 0 ? `+${more} more · ` : ''}<span class="qt-key">J: quest log</span></div>`;
    } else {
      let h = null; try { h = this.q.hint(); } catch { /* ignore */ }
      if (h) html = `<div class="qt-title" style="color:${KIND_COLORS.main}">${esc(h.title)}</div><div class="qt-obj">${esc(h.text)}</div>`;
    }
    if (this.trackerEl._last !== html) { this.trackerEl.innerHTML = html; this.trackerEl._last = html; }
  }

  // ------------------------------------------------------------ quest log
  openLog() {
    if (this.logEntry && !this.logEntry.closed) return this.logEntry;
    const wrap = document.createElement('div');
    this.logEntry = this.g.ui.openPanel({ title: 'Quest Log', body: wrap, width: 800, className: 'qx-modal', onClose: () => { this.logEntry = null; } });
    this.logEntry.isQuestLog = true;
    this.logEntry.body.addEventListener('click', (e) => this._onLogClick(e));
    this._renderLog();
    return this.logEntry;
  }

  _onLogClick(e) {
    const q = this.q, b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tab) { this.logTab = b.dataset.tab; this._renderLog(); return; }
    if (b.dataset.track) { q.track(b.dataset.track); return; }
    if (b.dataset.abandon) { q.abandon(b.dataset.abandon); return; }
    let pt = null, what = '';
    try {
      if (b.dataset.mapq) { pt = q.targets(b.dataset.mapq)[0] || null; what = q.def(b.dataset.mapq)?.title || ''; }
      else if (b.dataset.mapc) { pt = q.charPos(b.dataset.mapc); what = CHARACTERS[b.dataset.mapc]?.name || ''; }
      else if (b.dataset.mapl) { pt = q.locPos(b.dataset.mapl); what = pt?.label || ''; }
      else return;
    } catch { pt = null; }
    if (!pt || !Number.isFinite(pt.x)) { this.g.ui.toast('No marker for that one yet. Follow the objective.', 'info', 2200); return; }
    this.logEntry?.close();
    const map = this.g.cityMap;
    if (map?.openFull) map.openFull({ focus: { x: pt.x, z: pt.z, label: what } });
    else this.g.world?.openMap?.();
  }

  _kindOf(id, d) {
    const k = /^epi_/.test(id) ? 'epilogue' : /^secret_/.test(id) ? 'secret' : d?.kind || 'side';
    return { key: k, label: KIND_LABEL[k] || k, icon: KIND_ICON[k] || 'flag', color: KIND_COLORS[d?.kind] || '#888' };
  }

  _questCard(id, tracked) {
    const q = this.q;
    const d = q.def(id); const qq = q.get(id);
    const K = this._kindOf(id, d);
    const giver = CHARACTERS[d.giver]?.name;
    const steps = q.steps(id).length;
    const tl = qq.sd?.timeLeft;
    const fin = !!q.current(id)?.finale;
    let hasPt = false; try { hasPt = q.targets(id).length > 0; } catch { hasPt = false; }
    const brief = qq.data?.brief || d.summary;
    const timer = tl != null ? ` <span class="qx-timer">${Math.floor(Math.ceil(tl) / 60)}:${String(Math.ceil(tl) % 60).padStart(2, '0')}</span>` : '';
    return `<div class="qx-card${id === tracked ? ' tracked' : ''}" style="--qc:${K.color}">
      ${faceSlot(giver || '', K.icon)}
      <div class="qx-id">
        <div class="qx-kind"><span class="k">${ic(K.icon)}${esc(K.label)}</span>${giver ? `<span>from ${esc(giver)}</span>` : ''}${fin ? chip('star', 'FINALE', 'gold') : ''}${id === tracked ? chip2('target', 'Tracked', 'gold') : ''}</div>
        <div class="qx-title">${esc(d.title)}</div>
        <div class="qx-step">${pips(qq.step, steps)}<span>Step ${qq.step + 1}/${steps}</span></div>
      </div>
      <div class="qx-obj">${ic('flag')}<span>${esc(q.objectiveText(id).replace(/^FINALE: /, ''))}${timer}</span></div>
      ${brief ? `<div class="qx-sum" title="${esc(brief)}">${esc(brief)}</div>` : ''}
      <div class="qx-foot">
        <span class="pm-chips">${rewardChips(d.reward && typeof d.reward === 'object' ? d.reward : null, d.rewardText, { pay: qq.data?.payText })}</span>
        <span class="qx-btns">
          ${hasPt ? `<button class="ui-btn vx2-btn go" data-mapq="${id}">${ic('pin')}<span>Show on map</span></button>` : ''}
          ${id !== tracked ? `<button class="ui-btn vx2-btn" data-track="${id}">${ic('target')}<span>Track</span></button>` : ''}
          ${d.repeatable ? `<button class="ui-btn vx2-btn" data-abandon="${id}">${ic('x')}<span>Abandon</span></button>` : ''}
        </span>
      </div>
    </div>`;
  }

  _leadsCount() {
    let n = 0;
    try { for (const cid of Object.keys(CHARACTERS)) n += this.q.offersFor(cid).length; } catch { /* ignore */ }
    return n;
  }

  _renderLog() {
    const g = this.g, q = this.q, body = this.logEntry?.body;
    if (!body) return;
    const nAct = q.activeIds().length;
    const nLead = this._leadsCount();
    const tabs = [['goals', 'flag', 'Goals', ''], ['active', 'list', 'Active', nAct], ['leads', 'talk', 'Leads', nLead], ['done', 'trophy', 'Done', ''], ['factions', 'skull', 'Gangs & endings', '']];
    let html = `<div class="tabs vx2-tabs">${tabs.map(([k, ico, l, n]) => `<button class="tab ${this.logTab === k ? 'sel' : ''}" data-tab="${k}">${ic(ico)}<span class="lbl">${l}</span>${n ? `<span class="vx2-n${k === 'leads' ? ' hot' : ''}">${n}</span>` : ''}</button>`).join('')}</div>`;
    if (this.logTab === 'goals') {
      try { html += goalsHtml(g); } catch (e) { console.error('[quests] goals failed', e); html += '<div class="ui-muted">Goals unavailable.</div>'; }
    } else if (this.logTab === 'active') {
      const tracked = q.trackedId();
      const ids = q.activeIds().sort((a, b) => (b === tracked) - (a === tracked) || rank(q.def(a)) - rank(q.def(b)));
      // Kev's skateboard job lives in the skate module; list it here so the log isn't missing it.
      let skateQ = null;
      try { const sq = g.skate?.data?.()?.quest; if (sq && (sq.stage === 'hunt' || sq.stage === 'won')) skateQ = sq; } catch { /* no skate module */ }
      html += '<div class="qx-list">';
      for (const id of ids) html += this._questCard(id, tracked);
      if (skateQ) {
        html += `<div class="qx-card" style="--qc:${KIND_COLORS.side}">${faceSlot('Skidmark Kev', 'board')}
          <div class="qx-id"><div class="qx-kind"><span class="k">${ic('board')}Side job</span><span>from Skidmark Kev</span></div><div class="qx-title">Board Thieves</div>
            <div class="qx-step">${pips(skateQ.stage === 'won' ? 1 : 0, 2)}<span>Step ${skateQ.stage === 'won' ? 2 : 1}/2</span></div></div>
          <div class="qx-obj">${ic('flag')}<span>${skateQ.stage === 'won' ? 'Bring the board back to Skidmark Kev near Threads &amp; Dreads (Downtown).' : 'Get Kev\'s board back from the goons in Gutterside (marked on your map).'}</span></div>
          <div class="qx-foot"><span class="pm-chips">${chip2('board', 'skateboard (G to ride)', 'gain')}${chip('bag', 'Kev\'s shop', 'gain')}</span></div></div>`;
      }
      html += '</div>';
      if (!ids.length && !skateQ) html += `<div class="vx2-empty">${ic('list')}Nothing on your plate. Go bother somebody with a "!" over their head.</div>`;
    } else if (this.logTab === 'leads') {
      let rows = '';
      for (const [cid, c] of Object.entries(CHARACTERS)) {
        const offers = q.offersFor(cid);
        if (!offers.length) continue;
        const loc = g.locations.get(c.loc);
        for (const d of offers) {
          const K = this._kindOf(d.id, d);
          rows += `<div class="vx2-row" style="--gc:${K.color}">${faceSlot(c.name, K.icon, 'sm')}<span class="vx2-rt"><b style="color:${K.color}">${esc(d.title)}</b><span>${esc(K.label)} · ${esc(c.name)}${loc ? ` · near ${esc(loc.name)}` : ''}</span></span>
            <button class="ui-btn vx2-iconbtn" data-mapc="${cid}" title="Show on map">${ic('pin')}</button></div>`;
        }
      }
      const f = q.faction();
      const gang = f
        ? `<div class="vx2-row" style="--gc:${FACTIONS[f].color}"><span class="vx2-ibox" style="--gc:${FACTIONS[f].color}">${ic('skull')}</span><span class="vx2-rt"><b>Repeatable jobs for the ${esc(FACTIONS[f].name)}</b><span>at ${esc(g.locations.get(FACTIONS[f].hq)?.name || 'their HQ')}</span></span>${g.locations.get(FACTIONS[f].hq) ? `<button class="ui-btn vx2-iconbtn" data-mapl="${FACTIONS[f].hq}" title="Show on map">${ic('pin')}</button>` : ''}</div>`
        : `<div class="vx2-row" style="--gc:var(--blood-bright)"><span class="vx2-ibox" style="--gc:var(--blood-bright)">${ic('skull')}</span><span class="vx2-rt"><b>Gangs pay for muscle</b><span>the Gutter Rats Clubhouse (Gutterside) or the Velvet Syndicate (Hilltop)</span></span></div>`;
      const smug = `<div class="vx2-row" style="--gc:var(--g-work)"><span class="vx2-ibox" style="--gc:var(--g-work)">${ic('car')}</span><span class="vx2-rt"><b>Smuggling runs</b><span>Warehouse 13 in the Rustyards. Bring a car.</span></span></div>`;
      html += `${sect('talk', 'People with work for you', 'right now')}<div class="vx2-rows two">${rows || `<div class="vx2-empty">${ic('talk')}No new leads right now. Level up your stats, karma, or finish what you started.</div>`}</div>`;
      html += `${sect('money', 'Steady money')}<div class="vx2-rows">${gang}${smug}</div>`;
    } else if (this.logTab === 'done') {
      const done = Object.entries(q.store).filter(([id, s]) => s.done && q.def(id));
      if (!done.length) html += `<div class="vx2-empty">${ic('trophy')}You haven't finished anything. Classic.</div>`;
      else {
        html += `${sect('check', 'Completed', `${done.length}`)}<div class="vx2-cards">`;
        for (const [id] of done) {
          const d = q.def(id); const K = this._kindOf(id, d);
          html += `<div class="vx2-mini" style="--gc:${K.color}"${d.rewardText ? ` title="${esc(d.rewardText)}"` : ''}><span class="vx2-ibox">${ic('check')}</span><span class="vx2-rt"><b>${esc(d.title)}</b><span>${esc(K.label)}</span></span></div>`;
        }
        html += '</div>';
      }
      const jobs = ['job_rats', 'job_syndicate', 'smuggle'].map((k) => [k, g.state.getFlag('done_' + k, 0)]).filter(([, n]) => n);
      if (jobs.length) html += sect('work', 'Odd jobs') + `<div class="vx2-tiles">${jobs.map(([k, n]) => tile({ icon: k === 'smuggle' ? 'car' : 'skull', value: n, label: esc(q.def(k)?.title || k), color: k === 'smuggle' ? 'var(--g-work)' : FACTIONS[k.slice(4)]?.color || 'var(--rust)' })).join('')}</div>`;
    } else {
      html += this._factionHtml();
    }
    body.innerHTML = html;
    fillFaces(body, g);
  }

  _factionHtml() {
    const g = this.g, q = this.q;
    const mine = q.faction();
    let html = sect('skull', 'Gangs');
    html += '<div class="vx2-rows">';
    for (const F of Object.values(FACTIONS)) {
      const rep = q.rep(F.id);
      const st = rep < 0 ? chip('warn', 'Hostile', 'cost') : mine === F.id ? chip('star', esc(q.rankName(F.id)), 'gold') : chip('', 'Neutral', 'muted');
      html += `<div class="qx-fac${rep < 0 ? ' hostile' : ''}" style="--gc:${F.color}"><span class="vx2-ibox">${ic('skull')}</span>
        <span><b>${esc(F.name)}</b>${mine === F.id ? ' <span class="cw-tag">member</span>' : ''}</span>
        <span class="pm-chips">${st}${chip('', `${rep} rep`, 'muted')}</span>
        ${bar(Math.max(0, rep), 220)}</div>`;
    }
    html += '</div>';
    html += `<div class="qx-note">${ic('warn')}<span>Joining one gang makes the other hate you. Detective Thorne won't work with gang members.</span></div>`;
    const ends = g.state.getFlag('endings', []) || [];
    html += sect('trophy', 'Endings', `${ends.length}/${Object.keys(ENDINGS).length}`);
    html += `<div class="vx2-cards">${Object.entries(ENDINGS).map(([id, e]) => ends.includes(id)
      ? `<div class="vx2-mini" style="--gc:${e.color}"><span class="vx2-ibox">${ic('trophy')}</span><span class="vx2-rt"><b style="color:${e.color}">${esc(e.title)}</b><span>${esc(e.sub)}</span></span></div>`
      : `<div class="vx2-mini dim"><span class="vx2-ibox" style="--gc:#6b6253">${ic('lock')}</span><span class="vx2-rt"><b>???</b><span>${esc(e.sub)}</span></span></div>`).join('')}</div>`;
    return html;
  }

  _sheetSection(g) {
    const q = this.q;
    const items = Object.entries(g.state.p.inventory || {}).filter(([id]) => QUEST_ITEMS[id]);
    const f = q.faction();
    const ends = g.state.getFlag('endings', []) || [];
    let html = '';
    try { html += goalsSheetHtml(g); } catch (e) { console.error('[quests] goals sheet failed', e); }
    html += sect('skull', 'Street cred');
    html += '<div class="vx2-tiles">';
    if (f) {
      const F = FACTIONS[f];
      html += tile({ icon: 'skull', color: F.color, value: esc(q.rankName(f)), label: esc(F.name), bar: [Math.max(0, q.rep(f)), 220], title: `${q.rep(f)} rep` });
    } else html += tile({ icon: 'skull', color: '#6b6253', value: 'Unaffiliated', label: 'Gang' });
    html += tile({ icon: 'trophy', color: '#e0b23a', value: `${ends.length}<small>/${Object.keys(ENDINGS).length}</small>`, label: 'Endings', sub: ends.map((e) => esc(ENDINGS[e]?.title || e)).join(' · ') });
    html += '</div>';
    if (items.length) html += sect('key', 'Quest items') + `<div class="cs-slots">${items.map(([id, n]) => `<div class="cs-slot" title="${esc(QUEST_ITEMS[id].desc)}"><span class="cs-si">${ic('key')}</span><span class="cs-sn">${esc(QUEST_ITEMS[id].name)}</span>${n > 1 ? `<b class="cs-sq">×${n}</b>` : ''}</div>`).join('')}</div>`;
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
    // Beating the game: keep everything, plus a New-Game+-style bonus for each new ending.
    if (first) {
      try {
        p.progress ??= {};
        p.progress.bonusPoints = (p.progress.bonusPoints || 0) + 2;
        g.state.setFlag('postgame', true);
        g.state.addXP(500);
        g.state.changed('progress');
      } catch (e) { console.error('[quests] ending reward failed', e); }
    }
    const left = PATHS.filter((x) => !ends.includes(x.ending));
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
      ${first ? `<div class="q-end-reward" style="animation-delay:${delay(n + 0.3)}s">Title earned: <b>${esc(E.title)}</b> · +2 perk points · +500 XP</div>` : ''}
      <div class="ui-muted" style="opacity:0;animation:qFade 1s ${delay(n + 0.5)}s forwards;margin-bottom:8px">${ends.length}/${Object.keys(ENDINGS).length} endings found. You keep your money, stats and stuff. Rotwell keeps going whether you like it or not.</div>
      ${left.length ? `<div class="q-end-left" style="animation-delay:${delay(n + 0.6)}s">Still out there: ${left.map((x) => `<b>${esc(ENDINGS[x.ending].sub)}</b> (${esc(x.door)}: ${esc(x.style.toLowerCase())})`).join(' · ')}. Check the Goals tab (J).</div>` : '<div class="q-end-left">Every ending found. You are the undisputed plunger of Rotwell.</div>'}
      <div class="q-end-btns" style="animation-delay:${delay(n + 0.8)}s"><button class="ui-btn primary" data-keep>Keep playing</button></div>
    </div>`;
    const entry = g.ui.openPanel({ title: '', body: html, closable: false, className: 'q-ending' });
    entry.body.querySelector('[data-keep]').addEventListener('click', () => {
      entry.close();
      g.ui.toast('The story\'s over. The rent isn\'t. Keep playing: other endings, heists, the island and achievements are waiting (J, Goals tab).', 'info', 6000);
      g.state.save(true);
    });
  }

  // ------------------------------------------------------------ intro
  async playIntro() {
    const g = this.g, q = this.q;
    await q.say(INTRO, { title: 'Roach Motel, Room 6', char: 'nar' });
    // The player just read the note and the chapter card says what this is: only toast the first
    // objective, so a new player isn't buried under five toasts at once.
    q.giveItem('q_note', 1, true);
    q.start('main_prologue', {}, { silent: true });
    g.state.setFlag('intro_done', true);
    g.bus.emit('intro:done');
    setTimeout(() => { try { if (q.isActive('main_prologue')) g.ui.toast(`<span class="q-toast-k">Objective</span> ${q.objectiveText('main_prologue')}`, 'info', 6000); } catch { /* ignore */ } }, 600);
    TUTORIAL.forEach((t, i) => setTimeout(() => g.ui.toast(t, 'info', 5200), 1500 + i * 5000));
  }
}

function rank(d) { return { job: 0, main: 1, side: 2 }[d?.kind] ?? 3; }
