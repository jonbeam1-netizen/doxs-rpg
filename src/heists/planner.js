import { HEISTS, HEIST_ORDER, GEAR, GEAR_ORDER, MASKS, INTEL, PLANNER } from '../data/heists.js';
import { createBoard } from './meshes.js';
import { pick, fmtMoney, esc } from '../core/util.js';

// Two-Finger Terry and his heist board, out front of Lucky Larry's Pawn in Gutterside.
// Talk to him (or use the board) to pick a job, an approach, buy gear and choose solo / crew.

export class Planner {
  constructor(game, mgr) {
    this.g = game;
    this.mgr = mgr;
    this.npc = null;
    this.board = null;
    this.pos = null;
  }

  place() {
    const g = this.g;
    if (this.npc && !this.npc.removed && g.npcs?.get('heist_planner') === this.npc) return;
    const loc = g.locations.get('lucky_larrys') || g.locations.get('rats_clubhouse');
    if (!loc || !g.npcs?.spawn) return;
    const at = this.mgr.spotPos(loc.id, 'left');
    // slide a bit further along the wall, away from Lucky Larry himself
    const nx = Math.sin(at.f), nz = Math.cos(at.f), tx = nz, tz = -nx;
    let px = at.x - tx * 0.5 + nx * 1.0, pz = at.z - tz * 0.5 + nz * 1.0;
    const r = g.physics.resolveCircle(px, pz, 0.5); px = r.x; pz = r.z;
    this.pos = { x: px, z: pz };
    this.npc = g.npcs.spawn({
      id: 'heist_planner', kind: 'static', x: px, z: pz, facing: at.f, name: PLANNER.name,
      color: PLANNER.color, hat: PLANNER.hat, hatColor: PLANNER.hatColor, persistent: true, wander: false, hostile: false, networked: false,
      talkPrompt: PLANNER.prompt, onTalk: () => this.talk(), data: { heistPlanner: true },
    });
    if (!this.board) {
      this.board = createBoard();
      g.scene.add(this.board);
    }
    const bx = px - tx * 2.4 - nx * 0.6, bz = pz - tz * 2.4 - nz * 0.6;
    this.board.position.set(bx, 0, bz);
    this.board.rotation.y = at.f;
    g.interact.add({ id: 'heist:board', x: bx + nx * 0.9, z: bz + nz * 0.9, radius: 2.2, prompt: 'Study the heist board', onInteract: () => this.openBoard() });
    const markers = g.world?.markers;
    if (markers instanceof Map) markers.set('heist:planner', { x: px, z: pz, color: '#c41e1e', label: `${PLANNER.name} (heists)`, icon: 'H' });
  }

  // ------------------------------------------------------------------ talk
  async talk() {
    const g = this.g, mgr = this.mgr;
    const s = mgr.s;
    const opts = [];
    if (s) {
      opts.push({ label: s.leader === mgr.me() ? `Call off the ${esc(s.name)}` : `Bail on the ${esc(s.name)}`, hint: 'Counts as a failed job.' });
    } else {
      opts.push({ label: 'Show me the board', hint: 'Pick a job' });
    }
    opts.push({ label: 'Gear & masks', hint: 'Drills, thermite, picks, getaway cars, face-hiders' });
    opts.push({ label: 'Who are you, anyway?' });
    opts.push({ label: 'Leave', hint: 'Back away from the dumpster office.' });
    const i = await g.ui.dialog({ title: PLANNER.name, speaker: `${PLANNER.name} — ${PLANNER.title}`, text: s ? PLANNER.busy : pick(PLANNER.greet), options: opts });
    if (i === 0) {
      if (s) { if (await g.ui.confirm(`Walk away from the ${s.name}? Terry will act disappointed. He is not.`)) mgr.abort(); }
      else this.openBoard();
    } else if (i === 1) this.openShop();
    else if (i === 2) { await g.ui.dialog({ title: PLANNER.name, speaker: PLANNER.name, text: pick(PLANNER.who) }); this.talk(); }
  }

  // ------------------------------------------------------------------ board
  openBoard() {
    const g = this.g, mgr = this.mgr;
    if (mgr.s) { g.ui.toast(PLANNER.busy, 'bad'); return; }
    const h = mgr.h;
    const cards = HEIST_ORDER.map((id) => {
      const d = HEISTS[id];
      const st = mgr.status(id);
      const avg = Math.round((d.bags.count * (d.bags.value[0] + d.bags.value[1])) / 2 + (d.extra[0] + d.extra[1]) / 2);
      const needIntel = st.locked && INTEL[id] && !h.intel[id] && /inside line|way in/.test(st.why || '');
      return `<div class="hb-card ${st.ok ? '' : 'locked'}">
        <h4><span>${esc(d.name)}</span><span class="pay">~${fmtMoney(avg)}</span></h4>
        <div class="d">${esc(d.blurb)}</div>
        <div class="r ${st.ok ? 'ok' : 'no'}">${st.ok ? `✔ Ready · ${Math.floor(d.time / 60)} min clock · ${d.bags.count} bags` : esc(st.why || d.reqText)}</div>
        <div class="d" style="font-size:13px">Needs: ${esc(d.reqText)}${h.done[id] ? ` · pulled ${h.done[id]}× · best ${fmtMoney(h.best[id] || 0)}` : ''}</div>
        <div class="btns">${st.ok ? `<button class="ui-btn primary" data-plan="${id}">Plan it</button>` : ''}
          ${needIntel ? `<button class="ui-btn" data-intel="${id}">Buy ${esc(INTEL[id].name)} (${fmtMoney(INTEL[id].price)})</button>` : ''}</div>
      </div>`;
    }).join('');
    const body = `<div class="heist-board"><div class="sys-intro">${esc(pick(PLANNER.board))}</div>${cards}
      <div class="ui-row" style="margin-top:6px"><button class="ui-btn" data-shop>Gear &amp; masks</button></div></div>`;
    const panel = g.ui.openPanel({ title: 'The Heist Board', body, width: 620 });
    panel.body.addEventListener('click', async (e) => {
      const plan = e.target.closest('[data-plan]')?.dataset.plan;
      const intel = e.target.closest('[data-intel]')?.dataset.intel;
      if (plan) { panel.close(); this.plan(plan); }
      else if (intel) {
        const I = INTEL[intel];
        if (g.state.spend(I.price, 'intel')) {
          h.intel[intel] = true;
          g.state.changed('heists');
          g.ui.toast(`Bought the ${esc(I.name)}. ${esc(I.desc)}`, 'good', 4500);
          panel.close(); this.openBoard();
        }
      } else if (e.target.closest('[data-shop]')) { panel.close(); this.openShop(); }
    });
  }

  // ------------------------------------------------------------------ planning flow
  async plan(id) {
    const g = this.g, mgr = this.mgr, d = HEISTS[id];
    const st = mgr.status(id);
    if (!st.ok) { g.ui.toast(esc(st.why || pick(PLANNER.locked)), 'bad'); return; }
    const kinds = (ap) => new Set(d.objectives[ap].map((o) => o.type));
    const ai = await g.ui.dialog({
      title: d.name, speaker: PLANNER.name,
      text: `${d.blurb}\n\nHow do you wanna play it?`,
      options: [
        { label: 'Quiet', hint: `Picks, hacks, no alarm. Guards have eyes. Clean job bonus +${Math.round(((d.quietBonus || 1) - 1) * 100)}%.` },
        { label: 'Loud', hint: 'Guns, drills, screaming. Guards, reinforcements and cops. Faster, messier.' },
        { label: 'Never mind' },
      ],
    });
    if (ai !== 0 && ai !== 1) return;
    const approach = ai === 0 ? 'quiet' : 'loud';
    g.ui.toast(esc(pick(PLANNER[approach])), 'info', 3500);
    const ks = kinds(approach);
    const rec = [];
    if (ks.has('lockpick')) rec.push('picks');
    if (ks.has('hack')) rec.push('hacker');
    const holds = d.objectives[approach].filter((o) => o.type === 'hold' && o.fast);
    if (holds.some((o) => o.fast.drill)) rec.push('drill');
    if (holds.some((o) => o.fast.thermite)) rec.push('thermite');
    if (ks.has('truck_stop') && approach === 'loud') rec.push('spikes');
    rec.push('getaway');
    // gear check loop
    for (;;) {
      const h = mgr.h;
      const lines = rec.map((gid) => {
        const have = (h.gear[gid] || 0) > 0 || (gid === 'getaway' && (h.gear.getaway_fast || 0) > 0);
        return `${have ? '✔' : '✘'} ${GEAR[gid].name}${GEAR[gid].perm ? '' : have ? ` (×${h.gear[gid] || h.gear.getaway_fast || 0})` : ''}`;
      }).join('\n');
      const missing = rec.filter((gid) => !((h.gear[gid] || 0) > 0 || (gid === 'getaway' && (h.gear.getaway_fast || 0) > 0)));
      const opts = missing.map((gid) => ({ label: `Buy ${GEAR[gid].name} (${fmtMoney(GEAR[gid].price)})`, hint: GEAR[gid].desc, disabled: !g.state.canAfford(GEAR[gid].price), _gid: gid }));
      opts.push({ label: 'Roll out', hint: missing.length ? 'Missing gear makes it slower and harder. Not impossible. Just dumber.' : 'Let\'s get rich or die embarrassed.' });
      opts.push({ label: 'Back out' });
      const gi = await g.ui.dialog({
        title: `${d.name} — ${approach === 'quiet' ? 'Quiet' : 'Loud'}`, speaker: PLANNER.name,
        text: `Recommended kit:\n${lines}\n\nMask: ${MASKS[h.mask].name}${missing.length ? `\n\n"${pick(PLANNER.noGear)}"` : ''}`,
        options: opts,
      });
      if (gi == null || gi === opts.length - 1) return;
      if (gi === opts.length - 2) break;
      const gid = opts[gi]._gid;
      if (gid && g.state.spend(GEAR[gid].price, 'heist gear')) { h.gear[gid] = (h.gear[gid] || 0) + 1; g.state.changed('heists'); g.ui.toast(`Bought: ${esc(GEAR[gid].name)}`, 'good', 2000); }
    }
    // crew
    const net = g.net;
    const peers = net.connected ? (net.peers?.() || []) : [];
    if (net.connected && net.isClient) {
      const host = peers.find((p) => p.isHost)?.name || 'the host';
      const ci = await g.ui.dialog({
        title: 'Crew', speaker: PLANNER.name,
        text: `You're in ${host}'s game. Pitch it to them and the whole session can come along (the host runs the guards), or go it alone where only you can see the job.`,
        options: [{ label: `Pitch it to ${esc(host)}`, hint: 'Co-op: everybody who joins gets the markers and an even split.' }, { label: 'Go solo', hint: 'Just you. Your friends will see you running around in a mask, yelling.' }, { label: 'Back out' }],
      });
      if (ci === 0) {
        net.sendToHost({ t: 'heist:invite', pitch: true, id, approach, name: mgr.myName(), gear: mgr.myGearIds(), mask: mgr.h.mask });
        g.ui.toast(`Pitched the ${esc(d.name)} to ${esc(host)}. Waiting on the boss...`, 'info', 4000);
        return;
      }
      if (ci !== 1) return;
      mgr.startRun(id, approach, { invite: false });
      return;
    }
    let invite = false;
    if (net.connected && net.isHost && peers.length) {
      const ci = await g.ui.dialog({
        title: 'Crew', speaker: PLANNER.name,
        text: `You've got ${peers.length} friend${peers.length > 1 ? 's' : ''} in town. Bring 'em? Even split, everybody sees the markers, more guns, fewer problems. Or more problems. Depends on the friends.`,
        options: [{ label: `Invite the crew (${peers.map((p) => esc(p.name)).join(', ')})` }, { label: 'Go solo', hint: 'All the money. All the bullets.' }, { label: 'Back out' }],
      });
      if (ci !== 0 && ci !== 1) return;
      invite = ci === 0;
    }
    mgr.startRun(id, approach, { invite });
  }

  // ------------------------------------------------------------------ shop
  openShop() {
    const g = this.g, mgr = this.mgr;
    const render = () => {
      const h = mgr.h;
      const gear = GEAR_ORDER.map((gid) => {
        const G = GEAR[gid], n = h.gear[gid] || 0;
        const owned = G.perm && n > 0;
        return `<div class="sys-item ${owned ? 'owned' : ''}"><h4><span>${esc(G.name)}</span><span class="pr">${owned ? 'owned' : fmtMoney(G.price)}</span></h4>
          <div class="d">${esc(G.desc)}</div><div class="tag">${G.perm ? 'Keeps forever' : `One use · you have ${n}`}</div>
          <div class="btns">${owned ? '' : `<button class="ui-btn" data-buy="${gid}" ${g.state.canAfford(G.price) ? '' : 'disabled'}>Buy</button>`}</div></div>`;
      }).join('');
      const masks = Object.entries(MASKS).map(([mid, M]) => {
        const have = h.masks.includes(mid);
        return `<div class="sys-item ${h.mask === mid ? 'owned' : ''}"><h4><span>${esc(M.name)}</span><span class="pr">${have ? (h.mask === mid ? 'wearing' : 'owned') : fmtMoney(M.price)}</span></h4>
          <div class="d">${esc(M.desc)}</div>
          <div class="btns">${have ? (h.mask === mid ? '' : `<button class="ui-btn" data-wear="${mid}">Use this one</button>`) : `<button class="ui-btn" data-mask="${mid}" ${g.state.canAfford(M.price) ? '' : 'disabled'}>Buy</button>`}</div></div>`;
      }).join('');
      return `<div class="sys-cashline"><span>Cash <b>${fmtMoney(g.state.p.money)}</b></span><span>Press <kbd>V</kbd> to put your mask on/off</span></div>
        <div class="sys-sect">Tools of the trade</div><div class="sys-shop">${gear}</div>
        <div class="sys-sect">Masks</div><div class="sys-shop">${masks}</div>`;
    };
    const panel = g.ui.openPanel({ title: `${PLANNER.name}'s Trunk of Crime Stuff`, body: render(), width: 700 });
    panel.body.addEventListener('click', (e) => {
      const h = mgr.h;
      const buy = e.target.closest('[data-buy]')?.dataset.buy;
      const mk = e.target.closest('[data-mask]')?.dataset.mask;
      const wear = e.target.closest('[data-wear]')?.dataset.wear;
      if (buy && GEAR[buy] && g.state.spend(GEAR[buy].price, 'heist gear')) { h.gear[buy] = (h.gear[buy] || 0) + 1; g.ui.toast(`Bought: ${esc(GEAR[buy].name)}`, 'good', 2000); }
      else if (mk && MASKS[mk] && !h.masks.includes(mk) && g.state.spend(MASKS[mk].price, 'mask')) { h.masks.push(mk); h.mask = mk; g.ui.toast(`New face: ${esc(MASKS[mk].name)}. ${esc(MASKS[mk].desc)}`, 'good', 3000); mgr.onMaskChanged(); }
      else if (wear && h.masks.includes(wear)) { h.mask = wear; mgr.onMaskChanged(); }
      else return;
      g.state.changed('heists');
      panel.body.innerHTML = render();
    });
  }
}
