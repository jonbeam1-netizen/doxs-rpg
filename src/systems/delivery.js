// Pizza Butt: the shop + timed delivery missions (marker on game.world.markers, a beacon in the
// world, an arrow/timer on the HUD). Works on foot or in a car.
// game.sysDelivery = { active, start(), cancel() }
import * as THREE from 'three';
import { JOBS, PIZZA_CUSTOMERS } from '../data/jobs.js';
import { fmtMoney, pick, rand, chance } from '../core/util.js';
import { train, playerXZ, byTime } from './common.js';
import { placeMenu, say, choose } from './ui-kit.js';

export function installDelivery(game) {
  const st = game.state;
  let beacon = null;
  let customerNpc = null;

  const del = {
    active: null,

    async start() {
      const p = st.p;
      if (this.active) return;
      const d = JOBS.pizza;
      const n = await choose(game, {
        title: 'Delivery run',
        html: `Tony Butt slaps a stack of boxes on the counter. "Hot, fast, and don't eat the pepperonis. I counted 'em."<br><span class="sys-hint">Each drop costs ${d.energy} energy. Faster = bigger tips. Late pizzas pay half. A car helps. A LOT.</span>`,
        choices: [1, 3, 5].map((k) => ({ label: `${k} pizza${k > 1 ? 's' : ''}`, hint: `-${d.energy * k} energy`, disabled: p.energy < d.energy * k, value: k })),
      });
      if (!n) return;
      this.active = { left: n, total: n, done: 0, earned: 0, late: 0, tips: 0, perf: [], target: null, t: 0, limit: 60 };
      game.ui.closeAll();
      nextTarget();
      game.ui.toast(`Run started: ${n} pizza${n > 1 ? 's' : ''}. Follow the red beacon!`, 'good', 3500);
    },

    cancel(reason = 'You ditch the run. Tony Butt will remember this. Tony Butt remembers everything.') {
      if (!this.active) return;
      this.active = null;
      clearTarget();
      game.sysFx.missionHtml = '';
      game.ui.toast(reason, 'bad', 3500);
    },
  };
  game.sysDelivery = del;

  function markers() {
    if (!game.world) return null;
    if (!game.world.markers) game.world.markers = new Map();
    return game.world.markers;
  }

  function pickPoint(from) {
    const w = game.world;
    let best = null;
    for (let i = 0; i < 20; i++) {
      const pt = w?.randomSidewalkPoint?.() || { x: from.x + rand(-120, 120), z: from.z + rand(-120, 120) };
      const dd = Math.hypot(pt.x - from.x, pt.z - from.z);
      if (dd >= 35 && dd <= 170) return pt;
      if (!best || Math.abs(dd - 90) < Math.abs(Math.hypot(best.x - from.x, best.z - from.z) - 90)) best = pt;
    }
    return best;
  }

  function nextTarget() {
    const a = del.active;
    const from = playerXZ(game);
    const pt = pickPoint(from);
    const dist = Math.hypot(pt.x - from.x, pt.z - from.z);
    const [cname, cline] = pick(PIZZA_CUSTOMERS);
    a.target = { x: pt.x, z: pt.z, name: cname, line: cline };
    a.t = 0;
    a.limit = Math.round(18 + dist / 4.6);
    a.dist0 = dist;
    markers()?.set('pizza', { x: pt.x, z: pt.z, color: '#e2402f', label: 'Pizza delivery' });
    placeBeacon(pt.x, pt.z);
    try {
      customerNpc?.remove?.();
      customerNpc = game.npcs?.spawn?.({ kind: 'static', x: pt.x, z: pt.z, name: cname, color: 0x2a2420, wander: false, persistent: false });
    } catch (e) { customerNpc = null; }
  }

  function clearTarget() {
    markers()?.delete('pizza');
    if (beacon) { game.scene.remove(beacon); beacon.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); beacon = null; }
    try { if (customerNpc) game.npcs?.remove?.(customerNpc); } catch (e) { /* ignore */ }
    customerNpc = null;
  }

  function placeBeacon(x, z) {
    if (beacon) { game.scene.remove(beacon); beacon.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
    const g = new THREE.Group();
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 40, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xe2402f, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    );
    col.position.y = 20;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.15, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffc040 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    g.add(col, ring);
    g.position.set(x, 0, z);
    g.userData.ring = ring;
    game.scene.add(g);
    beacon = g;
  }

  function deliver() {
    const a = del.active;
    const p = st.p;
    const job = p.job?.id === 'pizza' ? p.job : { rank: 0 };
    const r = JOBS.pizza.ranks[job.rank] || JOBS.pizza.ranks[0];
    let pay = r.pay;
    let tip = 0;
    const late = a.t > a.limit;
    let speedTag = '';
    if (late) { pay = Math.round(pay * 0.5); a.late++; a.perf.push(0.15); }
    else {
      const speed = 1 - a.t / a.limit;
      tip = Math.round(rand(0.4, 1) * (3 + p.cha * 0.18) * (0.5 + speed));
      if (game.player?.vehicle) tip = Math.round(tip * 0.9);
      a.perf.push(0.45 + 0.55 * speed);
      speedTag = speed >= 0.6 ? ' ⚡ <b>BLAZING</b>' : speed >= 0.35 ? ' ⚡ fast' : '';
      a.tips += tip;
    }
    const total = pay + tip;
    st.addMoney(total, 'pizza');
    st.addStat('energy', -JOBS.pizza.energy);
    train(game, 'str', 0.06, 'job:pizza');
    a.earned += total;
    a.done++;
    a.left--;
    game.ui.toast(`<b>${a.target.name}:</b> ${late ? '"It\'s COLD. Like my ex-wife\'s heart." (half pay)' : a.target.line} <span class="ui-good">+${fmtMoney(total)}${tip ? ` (${fmtMoney(tip)} tip${speedTag})` : ''}</span>`, late ? 'bad' : 'money', 5000);
    if (a.left > 0) { nextTarget(); return; }
    finish();
  }

  function finish() {
    const a = del.active;
    del.active = null;
    clearTarget();
    game.sysFx.missionHtml = '';
    const p = st.p;
    if (p.job?.id !== 'pizza') return;
    p.job.shifts++;
    const c = game.jobs.career('pizza');
    c.shifts = p.job.shifts; c.rank = p.job.rank; c.total++;
    st.addXP(6 * a.total);
    game.bus.emit('job:worked', { jobId: 'pizza', rank: p.job.rank, pay: a.earned, deliveries: a.done });
    const promo = game.jobs.checkPromotion('pizza');
    let gradeTxt = '';
    if (a.perf.length && game.minigames?.record) {
      const sc = a.perf.reduce((x, y) => x + y, 0) / a.perf.length;
      const { grade, newBest } = game.minigames.record('pizza', sc, { jobId: 'pizza', deliveries: a.done });
      gradeTxt = ` · grade ${grade}${newBest ? ' (NEW BEST!)' : ''}`;
    }
    game.ui.bigText('RUN COMPLETE', `${a.done} delivered · ${fmtMoney(a.earned)} earned${a.tips ? ` (${fmtMoney(a.tips)} tips)` : ''}${a.late ? ` · ${a.late} late` : ''}${gradeTxt}`, 3000);
    if (promo) setTimeout(() => say(game, 'Pizza Butt', promo, 'Tony Butt'), 1200);
  }

  // ---------------- per-frame ----------------
  let spin = 0;
  game.addSystem({
    name: 'systems-delivery',
    update(dt) {
      const a = del.active;
      if (!a || !game.started) return;
      if (beacon) { spin += dt; beacon.userData.ring.rotation.z = spin * 2; beacon.userData.ring.position.y = 0.3 + Math.sin(spin * 3) * 0.2; }
      const paused = game.controlsLocked && !game.net?.connected;
      if (!paused) a.t += dt;
      const pos = playerXZ(game);
      const dx = a.target.x - pos.x, dz = a.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < (game.player?.vehicle ? 6 : 4) && !game.player?.dead) { deliver(); return; }
      if (a.t > a.limit * 2.2) {
        del.cancel(`${a.target.name} cancelled the order and posted a 1-star review: "Driver never came. Probably dead. Hope so." Run over.`);
        return;
      }
      if (game.player?.dead) { del.cancel('You died mid-delivery. The pizza survived. Somebody ate it.'); return; }
      // HUD: arrow relative to the camera, distance and timer
      const yaw = game.cameraRig?.yaw ?? 0;
      const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
      const ang = Math.atan2(dx * fwdZ - dz * fwdX, dx * fwdX + dz * fwdZ);
      const left = a.limit - a.t;
      const timer = left > 0 ? `<b>${Math.ceil(left)}s</b>` : '<b class="ui-bad">LATE</b>';
      // live tip estimate (average of the tip roll) + speed bonus tier, so hustling is visible
      const speed = Math.max(0, 1 - a.t / a.limit);
      const estTip = left > 0 ? Math.round(0.7 * (3 + st.p.cha * 0.18) * (0.5 + speed) * (game.player?.vehicle ? 0.9 : 1)) : 0;
      const tier = left <= 0 ? '<span class="ui-bad">half pay</span>' : speed >= 0.6 ? '<span style="color:#ffd84a">⚡⚡ BLAZING</span>' : speed >= 0.35 ? '<span style="color:#7fbf4d">⚡ FAST</span>' : '<span style="color:#a9a291">slow</span>';
      game.sysFx.missionHtml = `<div class="mission">🍕 ${a.done + 1}/${a.total} · <span class="arrow" style="transform:rotate(${(-ang * 180 / Math.PI).toFixed(0)}deg)">⬆</span> ${Math.round(dist)}m · ${timer} · tip ~${fmtMoney(estTip)} ${tier}</div>`;
    },
  });

  // ---------------- Pizza Butt (type 'pizza') ----------------
  game.locations.register('pizza', (g, loc) => placeMenu(g, loc, {
    hours: [10, 3],
    speaker: 'Tony Butt',
    closed: () => 'The neon butt sign is off. A note on the door: "CLOSED. Gone home. Butt will return at 10."',
    text: () => {
      const p = st.p;
      const mine = p.job?.id === 'pizza';
      return byTime(g, {
        morning: 'Tony is stretching dough with his hairy forearms. "We open at 10, but I\'m always open to cash."',
        day: '"Welcome to Pizza Butt, where every slice is a cheeky delight!" Tony says this with dead eyes.',
        evening: 'The dinner rush. Phones ringing. Tony is yelling at a calzone like it owes him money.',
        night: 'Late-night drunks stagger in. Tony flips a pizza with one hand and a guy with the other.',
      }) + (mine ? `<br><br><em>You're on the payroll. ${del.active ? `You have ${del.active.left} pizza(s) out for delivery!` : 'Grab a stack and go.'}</em>` : '');
    },
    options: () => {
      const p = st.p;
      const out = [
        { label: 'Buy a slice', hint: '$5 · +20 energy', run: () => { if (st.spend(5, 'food')) { st.addStat('energy', 20); st.heal(5); g.ui.toast('Greasy. Glorious. Your shirt is now translucent.', 'info'); } } },
        { label: 'Buy a "Big Butt" box to go (4 slices)', hint: '$18', run: () => g.items.buy('pizza_slice', 4, 4.5) },
      ];
      if (del.active) out.push({ label: 'Abandon the delivery run', hint: 'Tony will be sad', run: () => del.cancel() });
      out.push(...g.jobs.options('pizza'));
      out.push({ label: 'Ask Tony about the name', run: () => say(g, 'Pizza Butt', pick([
        '"My name is Tony Butt. My father was Tony Butt. His father? Anthony Buttocks. We shortened it at Ellis Island."',
        '"You think it\'s funny? Kids at school thought it was funny. Now I own a business and they deliver for me. Who\'s laughing? Me. I\'m laughing."',
      ]), 'Tony Butt') });
      return out;
    },
  }));

  game.bus.on('state:reset', () => { if (del.active) { del.active = null; clearTarget(); game.sysFx.missionHtml = ''; } });
  return del;
}
