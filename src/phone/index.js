import { esc, fmtMoney, pick, chance } from '../core/util.js';
import { DISTRICTS } from '../data/locations.js';
import { DRUGS, DRUG_ORDER } from '../data/drugs.js';
import { CHARACTERS, QUESTS } from '../data/quests.js';

// The in-game smartphone ("Grimphone 3"). Key: O.
// Apps: Map, Bank, Stats, Contacts (taxi / dealer / lawyer / mom / quest characters), Texts,
// Radio, Camera (photo mode), Settings (volumes, mouse sensitivity, invert Y, HUD size, graphics).
//
// game.phone = { open(app?), close(), text(from, body, {silent}), isOpen() }
// Persistent: state.p.phone = { texts: [{from, body, day, time, read}], momDay }
// Events emitted: phone:text {from}, phone:taxi {to, cost}

const SPAM = [
  ['+1 (555) 0199', 'CONGRATULATIONS!! You have won a FREE cruise!! Just send $400 port fee + your mom\'s maiden name'],
  ['Rotwell Water Dept', 'BOIL NOTICE: Please boil all tap water. Then maybe don\'t drink it anyway. Just a feeling.'],
  ['Unknown', 'hey is this still steve'],
  ['Unknown', 'u up? ...sorry wrong number. sorry. SO sorry. please forget the last 9 texts'],
  ['Grimco Rewards', 'Your Grimco Points balance: 3. Redeem for 1 (one) slightly used napkin!'],
  ['Pizza Gutter', 'Your pizza is on its way! You didn\'t order a pizza. It\'s still on its way.'],
  ['Car Warranty Guy', 'We\'ve been trying to reach you about your car\'s extended warranty. We know where you live.'],
  ['St. Mercy\'s Billing', 'FINAL NOTICE: You owe $3.50 for "one (1) cotton ball, emotional". Pay or we take it back.'],
  ['Mayor Swindell', 'VOTE SWINDELL! Fewer taxes! More me! (This text paid for by Swindell for Swindell)'],
  ['Unknown', 'I know what you did last Tuesday. Bro that was HILARIOUS. Call me.'],
  ['HoboCoin', 'HoboCoin is UP 4000%! (from $0.0001) Buy now before Reg finds out how money works!'],
  ['Rotwell PD', 'Reminder: crime is illegal. Thank you for your cooperation. —The Management'],
  ['Madame Ooze', 'The spirits say: you will text me back. The spirits also say: $5/minute.'],
  ['Gym Bro Kyle', 'yo did u skip leg day again?? i can SMELL it'],
  ['Booze Hut', 'HAPPY HOUR is now from 6am to 6am! Liver sold separately.'],
  ['Unknown', 'Ur package could not be delivered bc it was eaten. Pls advise.'],
];
const MOM_LINES = [
  "Your cousin Brenda just bought a house. Just saying. No reason.",
  "Are you eating? You sound skinny. Can a voice sound skinny? Yours does.",
  "I saw a man on the news running from the police in his underwear. I said 'that's not my baby.' Was it?",
  "Your father says hi. Actually he said something else but I'm translating.",
  "When are you going to settle down with a nice stick person?",
  "I'm not mad. I'm just disappointed. And a little mad.",
];
const TAXI_LINES = ['Piss Cab Co. — "We smell like it so you don\'t have to."', 'Your driver Vlad has 2.1 stars. That\'s up from yesterday.', 'Please do not ask about the stain.'];

const APPS = [
  { id: 'map', name: 'Map', icon: '🗺', color: '#3e5a2a' },
  { id: 'bank', name: 'Bank', icon: '$', color: '#2e5a3a' },
  { id: 'stats', name: 'Stats', icon: '▲', color: '#2c3b4a' },
  { id: 'contacts', name: 'Contacts', icon: '✆', color: '#5b4a2a' },
  { id: 'texts', name: 'Texts', icon: '✉', color: '#4a2a4a' },
  { id: 'radio', name: 'Radio', icon: '♫', color: '#6a2a1a' },
  { id: 'camera', name: 'Camera', icon: '◉', color: '#3a3a3a' },
  { id: 'settings', name: 'Settings', icon: '⚙', color: '#444038' },
];

export async function installPhone(game) {
  const st = game.state;
  const P = () => {
    const p = st.p;
    if (!p.phone || typeof p.phone !== 'object') p.phone = {};
    p.phone.texts ??= [];
    return p.phone;
  };
  let entry = null, app = 'home', scroll = 0;

  // HUD scale setting
  let hudScale = 1;
  try { hudScale = Number(localStorage.getItem('doxsrpg_hudscale')) || 1; } catch { /* ignore */ }
  const applyHudScale = () => document.documentElement.style.setProperty('--hud-user-scale', String(hudScale));
  applyHudScale();

  // ---------------------------------------------------------------- texts
  function unread() { return P().texts.filter((t) => !t.read).length; }
  function refreshBubble() {
    if (!game.started) return;
    const n = unread();
    game.ui.setBubble('phone', n ? { icon: '✆', text: `${n} new text${n > 1 ? 's' : ''}`, key: 'O', onClick: () => open('texts') } : null);
  }
  function text(from, body, { silent = false } = {}) {
    const ph = P();
    ph.texts.push({ from, body, day: game.time.day, time: game.time.label().replace(/^Day \d+ · /, ''), read: false });
    if (ph.texts.length > 50) ph.texts.splice(0, ph.texts.length - 50);
    st.changed('phone');
    game.bus.emit('phone:text', { from });
    if (!silent) {
      game.audio?.ui?.('text');
      if (!isOpen()) game.ui.toast(`<span class="ui-muted">✆ ${esc(from)}:</span> ${esc(body.length > 60 ? body.slice(0, 57) + '…' : body)}`, 'info', 3000);
    }
    refreshBubble();
    if (isOpen() && app === 'texts') render();
  }

  game.bus.on('time:hour', () => {
    if (!game.started) return;
    const h = game.time.hour;
    if (h >= 8 && h <= 23 && chance(0.1)) { const [f, b] = pick(SPAM); text(f, b); }
  });
  const lastQuestObj = {};
  const questFrom = (id) => CHARACTERS[QUESTS[id]?.giver]?.name || 'Unknown Number';
  const questText = (id, prefix) => setTimeout(() => {
    try {
      const obj = game.quests?.objectiveText?.(id);
      if (!obj || lastQuestObj[id] === obj) return; // start + step often fire together
      lastQuestObj[id] = obj;
      // "Go talk to <giver>" texted BY the giver reads like nonsense; skip it.
      const st = game.quests?.current?.(id);
      if (st?.obj?.type === 'talk' && st.obj.who === QUESTS[id]?.giver) return;
      // The quest engine already toasts every objective; the text is a quiet log
      // entry (bubble + phone) rather than a second toast stacked on top.
      text(questFrom(id), `${prefix}${obj}`, { silent: true });
    } catch { /* ignore */ }
  }, 900);
  game.bus.on('quest:started', ({ id } = {}) => { if (game.started && QUESTS[id]) questText(id, 'So here\'s the deal: '); });
  game.bus.on('quest:step', ({ id } = {}) => { if (game.started && QUESTS[id]) questText(id, 'Next up: '); });
  const nearGiver = (id) => {
    try {
      const c = game.quests?.charPos?.(QUESTS[id]?.giver), pp = game.player?.group?.position;
      return !!(c && pp && Math.hypot(c.x - pp.x, c.z - pp.z) < 40);
    } catch { return false; }
  };
  // (no "nice work" text from someone you're standing next to)
  game.bus.on('quest:completed', ({ id } = {}) => { if (game.started && QUESTS[id] && !QUESTS[id].repeatable && !nearGiver(id) && chance(0.6)) setTimeout(() => text(questFrom(id), pick(['Nice work. Don\'t let it go to your head. There\'s not much room in there.', 'Done? Huh. Didn\'t think you had it in you. Still don\'t, honestly.', 'You did it! I owe you one. (I will never pay it back.)'])), 1500); });
  game.bus.on('player:arrested', () => { if (game.started) setTimeout(() => text('Mom', pick(['I saw your mugshot on the news. You looked tired. Are you sleeping?', 'The neighbors are TALKING. Call me.'])), 4000); });
  game.bus.on('car:destroyed', (d = {}) => { if (game.started && !d.remote && chance(0.5)) setTimeout(() => text('Rotwell Mutual Insurance', 'We noticed your vehicle is on fire. Your premium has been increased. Thank you for choosing Rotwell Mutual.'), 3000); });
  game.bus.on('player:levelup', ({ level } = {}) => { if (game.started && level % 3 === 0) setTimeout(() => text('Mom', `Level ${level}! I told everyone at church. They didn't care. I'm proud of you.`), 2500); });

  // ---------------------------------------------------------------- open / close
  function isOpen() { return !!entry && !entry.closed; }
  function open(a = 'home') {
    if (isOpen()) { app = a; render(); return; }
    if (game.ui.isBlocking()) return;
    app = a;
    const el = document.createElement('div');
    el.className = 'phone';
    entry = game.ui.openPanel({ body: el, width: 360, className: 'phone-modal', onClose: () => { game.audio?.ui?.('close'); entry = null; } });
    entry.isPhone = true;
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    game.audio?.ui?.('open');
    render();
  }
  function close() { if (isOpen()) entry.close(); }

  function render() {
    if (!isOpen()) return;
    const el = entry.body.querySelector('.phone');
    const n = unread();
    const scr = el.querySelector('.ph-screen');
    scroll = scr && app === el._app ? scr.scrollTop : 0;
    el._app = app;
    const appDef = APPS.find((x) => x.id === app);
    el.innerHTML = `
      <div class="ph-status"><span>${esc(game.time.label().replace(/^Day \d+ · /, ''))}</span><span>Grimphone 3</span><span>▮▮▯ 12%</span></div>
      <div class="ph-bar">${app !== 'home' ? '<button class="ph-back" data-nav="home">‹</button>' : ''}<span>${app === 'home' ? `Day ${game.time.day}` : appDef?.name || ''}</span></div>
      <div class="ph-screen">${screen(n)}</div>
      <div class="ph-foot"><button class="ph-home" data-nav="home" title="Home"></button></div>`;
    el.querySelector('.ph-screen').scrollTop = scroll;
  }

  function screen(n) {
    const p = st.p;
    switch (app) {
      case 'home':
        return `<div class="ph-wall">${esc(p.name)}</div><div class="ph-grid">${APPS.map((a) => `<button class="ph-app" data-nav="${a.id}"><span class="ph-ico" style="background:${a.color}">${a.icon}${a.id === 'texts' && n ? `<i class="ph-badge">${n}</i>` : ''}</span><span>${a.name}</span></button>`).join('')}</div>
          <div class="ph-tip">Tip: <kbd>O</kbd> opens and closes the phone.</div>`;
      case 'bank':
        return `<div class="ph-card"><div class="ui-muted">Cash</div><div class="ph-big ui-good">${fmtMoney(p.money)}</div>
            <div class="ui-muted" style="margin-top:6px">First Bank of Rotwell</div><div class="ph-big">${fmtMoney(p.bank)}</div></div>
          <button class="ui-btn ph-wide" data-act="dep">Deposit cash <small>$2 app fee</small></button>
          <button class="ui-btn ph-wide" data-act="wd">Withdraw <small>$2 app fee</small></button>
          ${game.net?.connected ? '<button class="ui-btn ph-wide" data-act="gift">Send cash to a friend</button>' : ''}
          <div class="ph-tip">Mobile banking: like real banking, but you can do it on the toilet.</div>`;
      case 'stats': {
        const pk = game.perks;
        return `<div class="ph-card"><b>${esc(p.name)}</b> — Level ${p.level}<div class="ui-muted">${p.xp} XP into this level</div></div>
          <table class="ui-table ph-table">
            <tr><td>HP</td><td>${Math.ceil(p.hp)} / ${p.maxHp}</td></tr><tr><td>Energy</td><td>${Math.floor(p.energy)} / ${p.maxEnergy}</td></tr>
            <tr><td>STR / INT / CHA</td><td>${Math.floor(p.str)} / ${Math.floor(p.int)} / ${Math.floor(p.cha)}</td></tr>
            <tr><td>Karma</td><td>${p.karma}</td></tr><tr><td>Heat</td><td>${'★'.repeat(p.heat | 0) || 'none'}</td></tr>
            <tr><td>Perk points</td><td>${pk ? pk.points() : 0}</td></tr>
            <tr><td>Achievements</td><td>${game.achievements ? `${game.achievements.count()} / ${game.achievements.list.length}` : '-'}</td></tr>
            <tr><td>Days survived</td><td>${game.time.day}</td></tr><tr><td>Earned (lifetime)</td><td>${fmtMoney(p.totals.earned)}</td></tr>
            <tr><td>Fights W/L</td><td>${p.totals.fightsWon} / ${p.totals.fightsLost}</td></tr><tr><td>Arrests</td><td>${p.totals.arrests}</td></tr>
          </table>
          <button class="ui-btn ph-wide" data-act="perks">Open perks &amp; achievements</button>`;
      }
      case 'contacts': {
        const quest = questContacts();
        return `<div class="ph-list">
          <button class="ph-row" data-act="taxi"><b>Piss Cab Co.</b><span>Taxi anywhere in town</span></button>
          <button class="ph-row" data-act="dealer"><b>"Pharmacist" (Dealer)</b><span>Street prices, no questions</span></button>
          <button class="ph-row" data-act="lawyer"><b>Saul-ish Goodmanly, Esq.</b><span>Makes heat go away. For a price.</span></button>
          <button class="ph-row" data-act="mom"><b>Mom</b><span>She's worried. She's always worried.</span></button>
          ${quest.map((q) => `<button class="ph-row" data-act="qc" data-q="${q.id}"><b>${esc(q.name)}</b><span>Re: ${esc(q.title)}</span></button>`).join('')}
        </div>`;
      }
      case 'texts': {
        const ts = P().texts.slice().reverse();
        const html = ts.length ? ts.map((t) => `<div class="ph-msg ${t.read ? '' : 'new'}"><div class="ph-msg-h"><b>${esc(t.from)}</b><span>Day ${t.day} ${esc(t.time || '')}</span></div><div>${esc(t.body)}</div></div>`).join('') : '<div class="ui-muted ph-empty">No texts. Nobody loves you. Yet.</div>';
        for (const t of P().texts) t.read = true;
        setTimeout(refreshBubble, 0);
        return `<div class="ph-list">${html}</div>${ts.length ? '<button class="ui-btn ph-wide" data-act="cleartexts">Delete all</button>' : ''}`;
      }
      case 'radio': {
        const R = game.radio;
        if (!R) return '<div class="ui-muted ph-empty">Radio app crashed. Classic.</div>';
        const cur = R.current();
        return `<div class="ph-list">${R.STATIONS.map((s) => `<button class="ph-row ${cur?.id === s.id ? 'sel' : ''}" data-act="station" data-s="${s.id}"><b>${s.freq}</b><span>${s.genre} — ${s.tag}</span></button>`).join('')}
          <button class="ph-row ${!cur ? 'sel' : ''}" data-act="station" data-s="off"><b>Off</b><span>Silence. Just you and your thoughts. Yikes.</span></button></div>
          <label class="ph-check"><input type="checkbox" data-set="earbuds" ${R.earbuds ? 'checked' : ''}> Earbuds (listen on foot)</label>
          <label class="ph-slider">Radio volume <input type="range" min="0" max="1" step="0.05" data-set="radio" value="${R.volume}"></label>
          <div class="ph-tip">In a car: <kbd>,</kbd> <kbd>.</kbd> change station.</div>`;
      }
      case 'settings': {
        const R = game.radio, rig = game.cameraRig;
        const gfxBtn = game.ui.menuButtons.find((b) => /^Graphics/i.test(b.label));
        const A = game.audio;
        return `<label class="ph-slider">Master volume <input type="range" min="0" max="1" step="0.05" data-set="master" value="${A?.volume ?? 0.6}"></label>
          ${(A?.BUSES || []).map((b) => `<label class="ph-slider">${A.BUS_LABELS[b]} <input type="range" min="0" max="1" step="0.05" data-set="bus:${b}" value="${A.getBusVolume(b)}"></label>`).join('')}
          ${R ? `<label class="ph-slider">Car radio <input type="range" min="0" max="1" step="0.05" data-set="radio" value="${R.volume}"></label>
          <label class="ph-slider">Menu music <input type="range" min="0" max="1" step="0.05" data-set="music" value="${R.musicVolume}"></label>` : ''}
          <label class="ph-slider">Mouse sensitivity <b data-out="sens">${(rig?.sensitivity ?? 1).toFixed(2)}×</b><input type="range" min="0.2" max="3" step="0.05" data-set="sens" value="${rig?.sensitivity ?? 1}"></label>
          <label class="ph-check"><input type="checkbox" data-set="invy" ${rig?.invertY ? 'checked' : ''}> Invert mouse Y</label>
          <div class="ph-seg"><span>HUD size</span>${[0.8, 1, 1.2].map((v) => `<button class="ui-btn ${Math.abs(hudScale - v) < 0.01 ? 'primary' : ''}" data-act="hud" data-v="${v}">${v === 0.8 ? 'S' : v === 1 ? 'M' : 'L'}</button>`).join('')}</div>
          ${gfxBtn ? `<button class="ui-btn ph-wide" data-act="gfx">${esc(gfxBtn.label)}</button>` : ''}
          <button class="ui-btn ph-wide" data-act="help">Controls (F1)</button>
          <button class="ui-btn ph-wide" data-act="save">Save game</button>`;
      }
      default: return '';
    }
  }

  function questContacts() {
    const q = game.quests;
    if (!q?.activeIds) return [];
    const seen = new Set();
    const out = [];
    for (const id of q.activeIds()) {
      const giver = QUESTS[id]?.giver;
      const ch = CHARACTERS[giver];
      if (!ch || seen.has(giver)) continue;
      seen.add(giver);
      out.push({ id, giver, name: ch.name, title: QUESTS[id].title || id });
    }
    return out;
  }

  // ---------------------------------------------------------------- actions
  function onInput(e) {
    const k = e.target.dataset.set;
    if (!k) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
    if (k === 'master') game.audio?.setVolume(v);
    else if (k.startsWith('bus:')) game.audio?.setBusVolume?.(k.slice(4), v);
    else if (k === 'radio') game.radio?.setVolume(v);
    else if (k === 'music') game.radio?.setMusicVolume(v);
    else if (k === 'sens') { game.cameraRig?.setSensitivity(v); const o = entry.body.querySelector('[data-out=sens]'); if (o) o.textContent = `${Number(v).toFixed(2)}×`; }
    else if (k === 'invy') game.cameraRig?.setInvertY(v);
    else if (k === 'earbuds') game.radio?.setEarbuds(v);
  }

  async function onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    game.audio?.ui?.('click');
    if (b.dataset.nav) {
      const id = b.dataset.nav;
      if (id === 'map') { close(); if (game.world?.openMap) game.world.openMap(); else game.ui.toast('No signal. The map is just a picture of a sad face.', 'bad'); return; }
      if (id === 'camera') { close(); game.ui.setPhotoMode(true); return; }
      app = id; render(); return;
    }
    const act = b.dataset.act;
    const p = st.p;
    switch (act) {
      case 'dep': case 'wd': {
        const dep = act === 'dep';
        const max = dep ? p.money - 2 : p.bank;
        if (max < (dep ? 1 : 3)) { game.ui.toast(dep ? "You can't even cover the $2 fee. Impressive." : 'Your account has less in it than the fee. Bold.', 'bad'); return; }
        const n = await game.ui.promptNumber({ title: dep ? 'Deposit' : 'Withdraw', text: '$2 convenience fee. Because capitalism.', max, min: 0 });
        if (!n || (!dep && n < 3)) { render(); return; }
        if (dep) { p.bank += n; st.addMoney(-(n + 2), 'deposit'); }
        else { p.bank -= n; st.addMoney(n - 2, 'withdraw'); }
        st.changed('bank');
        game.audio?.ui?.('cash');
        render();
        return;
      }
      case 'gift': { const gb = game.ui.menuButtons.find((x) => /give cash/i.test(x.label)); close(); gb?.onClick(game); return; }
      case 'perks': close(); game.perks?.open('perks'); return;
      case 'taxi': taxi(); return;
      case 'dealer': dealer(); return;
      case 'lawyer': lawyer(); return;
      case 'mom': mom(); return;
      case 'qc': questCall(b.dataset.q); return;
      case 'cleartexts': P().texts = []; st.changed('phone'); refreshBubble(); render(); return;
      case 'station': game.radio?.set(b.dataset.s); render(); return;
      case 'hud': hudScale = Number(b.dataset.v) || 1; try { localStorage.setItem('doxsrpg_hudscale', String(hudScale)); } catch { /* ignore */ } applyHudScale(); render(); return;
      case 'gfx': { const gb = game.ui.menuButtons.find((x) => /^Graphics/i.test(x.label)); gb?.onClick(game); render(); return; }
      case 'help': close(); game.ui.showControls(); return;
      case 'save': st.save(false); return;
      default:
    }
  }

  // ---------------------------------------------------------------- contacts
  function here() {
    const pos = game.player.vehicle ? game.player.vehicle.group.position : game.player.pos;
    return { x: pos.x, z: pos.z, d: game.world?.districtAt?.(pos.x, pos.z) };
  }

  async function taxi() {
    const pl = game.player;
    if (pl.vehicle) { game.ui.toast('You\'re literally in a car right now. Drive yourself, genius.', 'bad'); return; }
    if ((st.p.heat | 0) >= 2) { game.ui.toast('Piss Cab: "Not with half the cops in Rotwell on your ass. Click."', 'bad', 3200); return; }
    const h = here();
    const locs = game.locations.list.filter((l) => l.doorX != null);
    const byD = {};
    for (const l of locs) (byD[l.district] ??= []).push(l);
    const districtOpts = Object.keys(byD).map((d) => ({ label: DISTRICTS[d]?.name || d, hint: `${byD[d].length} stops`, keepOpen: false, onSelect: () => pickStop(d) }));
    close();
    game.ui.dialog({ title: 'Piss Cab Co.', speaker: 'Dispatcher', html: `<em>${esc(pick(TAXI_LINES))}</em><br>Where to, sweetie? We charge by the smell— by the mile.`, options: [...districtOpts, { label: 'Hang up' }] });

    function pickStop(d) {
      const opts = byD[d].map((l) => {
        const dist = Math.hypot(l.doorX - h.x, l.doorZ - h.z);
        const cost = Math.round(8 + dist * 0.06);
        return { label: esc(l.name), hint: fmtMoney(cost), disabled: st.p.money < cost, onSelect: () => ride(l, dist, cost) };
      });
      game.ui.dialog({ title: DISTRICTS[d]?.name || d, text: 'Pick a stop. Seatbelts are decorative.', options: [...opts, { label: 'Back', onSelect: () => taxi() }] });
    }
  }

  function fade(on) {
    let f = document.getElementById('phone-fade');
    if (!f) { f = document.createElement('div'); f.id = 'phone-fade'; (document.getElementById('ui-root') || document.body).appendChild(f); }
    f.classList.toggle('on', on);
  }

  function ride(loc, dist, cost) {
    if (!st.spend(cost, 'taxi')) return;
    const pl = game.player;
    pl.moveLocked = true;
    fade(true);
    game.ui.toast(pick(['Vlad hits every pothole. On purpose.', 'The cab smells like wet dog and regret.', 'Vlad tells you about his crypto for 20 minutes.', 'You fall asleep. You wake up with a new tattoo? No. Just a sticker.']), 'info', 2600);
    setTimeout(() => {
      try {
        const facing = Math.atan2(loc.doorX - loc.x, loc.doorZ - loc.z);
        pl.spawn(loc.doorX + Math.sin(facing) * 1.2, loc.doorZ + Math.cos(facing) * 1.2, facing);
        if (game.cameraRig) game.cameraRig.yaw = facing + Math.PI;
        game.time.advance?.(Math.round(5 + dist / 12));
      } catch (e) { console.error('[phone] taxi failed', e); }
      game.bus.emit('phone:taxi', { to: loc.id, cost });
      setTimeout(() => { fade(false); pl.moveLocked = false; game.ui.toast(`Dropped off at <b>${esc(loc.name)}</b>. Tip not included. Or expected.`, 'good', 2400); }, 450);
    }, 700);
  }

  function dealer() {
    const h = here();
    const dists = Object.keys(DISTRICTS);
    const m = game.market;
    close();
    if (!m?.price) { game.ui.dialog({ title: 'Pharmacist', text: 'The number you have dialed has been disconnected. Probably for a reason.' }); return; }
    const rows = DRUG_ORDER.map((id) => {
      const prices = dists.map((d) => { try { return m.price(id, d); } catch { return null; } });
      const valid = prices.filter((x) => x != null);
      const lo = Math.min(...valid), hi = Math.max(...valid);
      return `<tr><td>${esc(m.name?.(id) || DRUGS[id].name)}</td>${prices.map((x, i) => `<td class="${x === lo ? 'ui-good' : x === hi ? 'ui-bad' : ''}${dists[i] === h.d ? ' here' : ''}">${x == null ? '-' : fmtMoney(x)}</td>`).join('')}</tr>`;
    }).join('');
    game.ui.dialog({
      title: 'Your "Pharmacist"',
      speaker: 'Text from: 💊 (do not save this number)',
      width: 760,
      html: `<div class="ui-text">${pick(['yo. prices today. delete this after. or dont im not ur mom', 'k here\'s the menu. green = cheap, red = rich people tax', 'prices. dont call me on this line again. text. TEXT.'])}</div>
        <div style="overflow-x:auto"><table class="ui-table dealer-table"><tr><th></th>${dists.map((d) => `<th class="${d === h.d ? 'here' : ''}">${esc(DISTRICTS[d].name.replace(/^The /, ''))}</th>`).join('')}</tr>${rows}</table></div>`,
      options: [{ label: 'Thanks. Deleting this now. (You will not delete this.)' }],
    });
  }

  async function lawyer() {
    const heat = st.p.heat;
    close();
    if (heat <= 0.05) { game.ui.dialog({ title: 'Saul-ish Goodmanly, Esq.', speaker: 'Saul-ish', text: "You're clean! Squeaky! Call me when you've done some crimes. I'll be here. Billing." }); return; }
    if (heat >= 3) { game.ui.dialog({ title: 'Saul-ish Goodmanly, Esq.', speaker: 'Saul-ish', text: "Three stars?! Kid, there are HELICOPTERS. Lose the cops first, then call me. I don't do car chases. Bad knees." }); return; }
    const cost = Math.round(250 * Math.max(1, Math.ceil(heat)) * (game.perks?.mult('fineCost') ?? 1));
    const ok = await game.ui.confirm('', { title: 'Saul-ish Goodmanly, Esq.', html: `<div class="ui-speaker">Saul-ish</div><div class="ui-text">I can make a star disappear. Paperwork gets lost, a cop's kid gets a scholarship... <b>${fmtMoney(cost)}</b>. Cash. Unmarked. Ideally not sticky.</div>`, yes: `Pay ${fmtMoney(cost)}`, no: 'Hang up' });
    if (ok && st.spend(cost, 'lawyer')) { st.addHeat(-1); game.ui.toast('One star, gone. "It never happened."', 'good'); }
  }

  function mom() {
    const ph = P();
    close();
    let line = pick(MOM_LINES), give = 0;
    if (ph.momDay !== game.time.day) {
      ph.momDay = game.time.day;
      if (chance(0.35)) { give = 20; line += " I'm sending you $20. Don't spend it on drugs. Or do, I'm not your boss. I'm your MOTHER.";  }
    } else line = "You already called today. Twice in one day? What's wrong? Are you dying? Is it the drugs? IT'S THE DRUGS.";
    game.ui.dialog({ title: 'Mom', speaker: 'Mom', text: line, options: [{ label: 'Love you, Mom.' }, { label: 'Pretend the call dropped' }] });
    if (give) st.addMoney(give, 'mom');
  }

  function questCall(id) {
    const giver = QUESTS[id]?.giver;
    const ch = CHARACTERS[giver];
    close();
    if (!ch) return;
    const obj = game.quests?.objectiveText?.(id) || 'Figure it out yourself.';
    const idle = Array.isArray(ch.idle) && ch.idle.length ? pick(ch.idle) : 'Yeah?';
    game.ui.dialog({
      title: `Calling ${ch.name}...`, speaker: ch.name,
      html: `<div class="ui-text">${esc(idle)}</div><div class="ui-text"><em>Hint:</em> ${esc(obj)}</div>`,
      options: [{ label: 'Track this quest', onSelect: () => game.quests?.track?.(id) }, { label: 'Hang up' }],
    });
  }

  // ---------------------------------------------------------------- input
  game.addSystem({
    name: 'phone',
    update() {
      if (!game.started) return;
      if (game.input.wasPressed('KeyO')) {
        if (game.ui.photoMode) { game.ui.setPhotoMode(false); return; }
        const top = game.ui.top();
        if (top?.isPhone) close();
        else if (!game.ui.isBlocking()) open('home');
      }
      if (isOpen() && app === 'home') {
        // keep the clock fresh
        const s = entry.body.querySelector('.ph-status span');
        const lbl = game.time.label().replace(/^Day \d+ · /, '');
        if (s && s.textContent !== lbl) s.textContent = lbl;
      }
    },
  });
  game.bus.on('game:start', ({ isNew } = {}) => {
    P();
    setTimeout(refreshBubble, 600);
    if (isNew) {
      // Don't pile onto the intro: the welcome text arrives once the first objective is done (or ~60 s in).
      let sent = false;
      const send = () => { if (sent) return; sent = true; off(); setTimeout(() => text('Unknown', 'welcome to rotwell lol. press O to look at ur phone like a normal person'), 9000); };
      const off = game.bus.on('quest:step', ({ id, step } = {}) => { if (id === 'main_prologue' && step >= 1) send(); });
      setTimeout(send, 60000);
    }
  });
  game.bus.on('state:reset', () => { P(); refreshBubble(); });
  game.ui.menuButtons.push({ label: 'Phone', hint: 'O', onClick: () => setTimeout(() => open('home'), 0) });

  game.phone = { open, close, text, isOpen };
}
