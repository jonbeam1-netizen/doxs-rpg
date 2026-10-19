import * as THREE from 'three';
import { makeProp } from './meshes.js';

// Collectibles: 40 golden "Rotwell Rat" figurines tucked into alleys and odd
// corners of every district + Blackwater Isle, and 20 graffiti spots where you
// spray your own tag (hold E).

export const RAT_TOTAL = 40;
export const TAG_TOTAL = 20;
const RAT_REWARDS = {
  10: { money: 250, text: 'The Rotwell Rat Collectors Society mails you $250 and a letter signed in what you hope is ketchup.' },
  20: { money: 500, item: 'lucky_foot', text: 'The Society sends $500 and a rabbit\'s foot. "Rats and rabbits. We don\'t judge."' },
  30: { money: 1000, stats: { cha: 2, int: 2 }, text: 'You can now hear the rats talking. They give surprisingly good advice. +2 CHA, +2 INT, $1,000.' },
  40: { money: 5000, flag: 'rat_king', text: 'All 40! The rats of Rotwell bow before you. You are the RAT KING. $5,000 and eternal shame.' },
};
const TAG_COLORS = ['#e2402f', '#a5c234', '#40b0ff', '#ffb020', '#d050e0', '#40e0b0', '#ff6aa0'];

export function installCollect(game, I) {
  const st = game.state, P = I.placer, w = game.world;
  const { fmt, pick } = I;

  // ============================================================ ROTWELL RATS
  const ratQuota = { downtown: 9, gutterside: 9, hilltop: 7, rustyards: 6, dustbowl: 4, blackwater: 5 };
  const special = [];
  try {
    const B = w.island?.bridge;
    if (B) special.push({ x: (B.x0 + B.x1) / 2 + 13, z: B.z + B.hw - 1.4, facing: Math.PI, src: 'bridge' });
    const F = w.island?.ferry;
    if (F) { special.push({ x: F.city.x + 3.5, z: F.city.z + 3.5, facing: 0, src: 'ferry' }); special.push({ x: F.island.x - 3, z: F.island.z + 4, facing: 0, src: 'ferry' }); }
    const camp = game.locations.get('hobo_camp');
    if (camp) special.push({ x: camp.doorX + 5, z: camp.doorZ + 2.5, facing: 0, src: 'camp' });
    const lh = w.island?.lighthouse;
    if (lh) special.push({ x: lh.x + 5, z: lh.z + 5, facing: 0, src: 'lighthouse' });
  } catch (e) { console.error('[interact] rat specials', e); }

  const ratFit = (c) => {
    if (c.src === 'alley') {
      const fx = Math.sin(c.facing), fz = Math.cos(c.facing);
      const wd = P.wallDist(c.x, c.z, fx, fz, 1.2);
      if (wd == null) return null;
      const x = c.x - fx * (wd - 0.32), z = c.z - fz * (wd - 0.32);
      if (P.blocked(x, z) || !P.reachable(c.x, c.z, 1600)) return null;
      return { x, z, facing: c.facing + Math.PI * 0.5 };
    }
    if (P.blocked(c.x, c.z) || game.physics.resolveCircle(c.x, c.z, 0.4).hit) return null;
    if (c.src !== 'bridge' && !P.reachable(c.x, c.z, 1200)) return null;
    return { x: c.x, z: c.z, facing: c.facing };
  };
  // specials first (they're the fun ones), then alleys
  const ratSpots = [
    ...P.pick(special, { count: special.length, kind: 'rat', minSame: 10, rClear: 1, fit: ratFit, rng: I.rng('rat-special') }),
  ];
  for (const r of ratSpots) if (ratQuota[r.district] > 0) ratQuota[r.district]--;
  const need = RAT_TOTAL - ratSpots.length;
  ratSpots.push(...P.pick(I.alleys || [], { count: need, kind: 'rat', quota: ratQuota, minSame: 28, rClear: 1.2, fit: ratFit, rng: I.rng('rats') }));

  // soft glow halo shared by every rat
  const haloTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,220,120,0.9)'); g.addColorStop(0.35, 'rgba(255,200,80,0.35)'); g.addColorStop(1, 'rgba(255,200,80,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const haloMat = new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

  const rats = [];
  ratSpots.forEach((r, i) => {
    const g = new THREE.Group();
    const fig = makeProp('rat'); g.add(fig);
    const halo = new THREE.Sprite(haloMat); halo.scale.set(1.1, 1.1, 1); halo.position.y = 0.22; g.add(halo);
    const o = I.add({ id: 'rat' + i, kind: 'rat', ...r, group: g, fig, animated: true, cull: 55 });
    rats.push(o);
  });

  function ratCount() { return I.S().rats.length; }
  function syncRats() {
    const have = new Set(I.S().rats);
    for (const o of rats) { o.hidden = have.has(o.id); if (o.hidden) o.group.visible = false; }
  }
  function collectRat(o) {
    const s = I.S();
    if (s.rats.includes(o.id)) return;
    s.rats.push(o.id);
    o.hidden = true; o.group.visible = false;
    const n = s.rats.length;
    I.sfx('coin');
    I.toast(`🐀 <b>Rotwell Rat</b> ${n}/${RAT_TOTAL}. ${pick(['It\'s tiny, golden and judging you.', 'It squeaks when you squeeze it. You squeeze it a lot.', 'Somebody hid this here. Somebody with too much time.', 'Into the pocket it goes. It smells like pennies.'])}`, 'good', 3000);
    game.bus.emit('interact:collect', { id: o.id, kind: 'rat', count: n, total: RAT_TOTAL });
    st.addXP(10);
    for (const [k, R] of Object.entries(RAT_REWARDS)) {
      if (n >= +k && !s.ratRewards.includes(+k)) {
        s.ratRewards.push(+k);
        if (R.money) st.addMoney(R.money, 'rat reward');
        if (R.item) st.addItem(R.item, 1);
        if (R.stats) for (const [sk, v] of Object.entries(R.stats)) st.addStat(sk, v, 'rats');
        if (R.flag) st.setFlag(R.flag, true);
        game.ui.bigText(+k === RAT_TOTAL ? 'RAT KING OF ROTWELL' : `${k} RATS!`, R.text, 4200);
        I.sfx('levelup');
        game.bus.emit('interact:milestone', { kind: 'rats', count: +k });
      }
    }
  }
  I.hooks.frame.push((dt) => {
    const pp = I.pp(), t = game.elapsed;
    if (game.player.vehicle || game.player.dead) return;
    for (const o of rats) {
      if (o.hidden || !o.group.visible) continue;
      o.fig.rotation.y = t * 1.6 + o.x;
      o.fig.position.y = 0.06 + Math.sin(t * 2.4 + o.z) * 0.05;
      if ((pp.x - o.x) ** 2 + (pp.z - o.z) ** 2 < 1.25) collectRat(o);
    }
  });

  // ============================================================ GRAFFITI
  const tagQuota = { gutterside: 6, downtown: 4, rustyards: 4, dustbowl: 2, hilltop: 1, blackwater: 3 };
  const tagFit = (c) => {
    const fx = Math.sin(c.facing), fz = Math.cos(c.facing), sx = fz, sz = -fx;
    const wd = P.wallDist(c.x, c.z, fx, fz, 1.2);
    if (wd == null) return null;
    const wx = c.x - fx * wd, wz = c.z - fz * wd;
    for (const a of [-1.3, -0.6, 0.6, 1.3]) {
      if (!P.tall(wx - fx * 0.1 + sx * a, wz - fz * 0.1 + sz * a)) return null; // a real wall continues
      if (P.blocked(wx + fx * 0.5 + sx * a, wz + fz * 0.5 + sz * a)) return null;  // nothing in front of it
      // the wall surface must be flat across the width (no pilasters / setbacks)
      const d2 = P.wallDist(c.x + sx * a, c.z + sz * a, fx, fz, 1.2);
      if (d2 == null || Math.abs(d2 - wd) > 0.12) return null;
    }
    return { x: wx + fx * 0.06, z: wz + fz * 0.06, facing: c.facing };
  };
  // Alley side walls first (blank brick, where graffiti belongs), then building fronts to top up.
  const alleyTagFit = (c) => { const r = tagFit(c); return r && P.reachable(c.x, c.z, 1400) ? r : null; };
  const tagSpots = P.pick(I.alleys || [], { count: TAG_TOTAL, kind: 'tag', quota: tagQuota, minSame: 45, rClear: 2.4, fit: alleyTagFit, rng: I.rng('tags') });
  if (tagSpots.length < TAG_TOTAL) tagSpots.push(...P.pick(P.wallSpots(), { count: TAG_TOTAL - tagSpots.length, kind: 'tag', minSame: 45, rClear: 2.4, fit: tagFit, rng: I.rng('tags2') }));

  const blankMat = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(10,8,6,0.32)'; x.fillRect(14, 14, 484, 228);
    x.strokeStyle = 'rgba(235,228,210,0.85)'; x.lineWidth = 6; x.setLineDash([22, 14]);
    x.strokeRect(14, 14, 484, 228);
    x.setLineDash([]);
    x.fillStyle = 'rgba(235,228,210,0.85)';
    x.font = 'bold 52px "Special Elite", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('YOUR TAG HERE', 256, 112);
    x.font = '30px "Special Elite", monospace';
    x.fillText('(this wall is too clean)', 256, 172);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  })();
  const decalGeo = new THREE.PlaneGeometry(2.3, 1.15);

  function tagMaterial(name, color) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    const text = String(name || 'DOX').toUpperCase().replace(/[^A-Z0-9 !?$&*-]/g, '').slice(0, 12) || 'DOX';
    let size = 150;
    x.font = `900 ${size}px "Barlow Condensed", Impact, sans-serif`;
    while (x.measureText(text).width > 440 && size > 40) { size -= 6; x.font = `900 ${size}px "Barlow Condensed", Impact, sans-serif`; }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.save(); x.translate(256, 132); x.rotate(-0.06);
    x.lineJoin = 'round';
    x.lineWidth = 26; x.strokeStyle = '#111'; x.strokeText(text, 0, 0);
    x.lineWidth = 10; x.strokeStyle = '#f4f0e6'; x.strokeText(text, 0, 0);
    const gr = x.createLinearGradient(0, -size / 2, 0, size / 2);
    gr.addColorStop(0, color); gr.addColorStop(1, '#1a1612');
    x.fillStyle = color; x.fillText(text, 0, 0);
    x.globalAlpha = 0.35; x.fillStyle = gr; x.fillText(text, 0, 0); x.globalAlpha = 1;
    // drips
    const wTxt = x.measureText(text).width;
    x.fillStyle = color;
    for (let i = 0; i < 6; i++) { const dx = -wTxt / 2 + ((i * 97) % wTxt); x.fillRect(dx, size * 0.32, 5, 18 + ((i * 37) % 40)); }
    x.restore();
    // crown
    x.fillStyle = '#ffd040'; x.strokeStyle = '#111'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(412, 52); x.lineTo(424, 22); x.lineTo(438, 44); x.lineTo(452, 18); x.lineTo(464, 44); x.lineTo(478, 22); x.lineTo(488, 52); x.closePath(); x.stroke(); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }

  const tags = [];
  tagSpots.forEach((r, i) => {
    const g = new THREE.Group();
    const decal = new THREE.Mesh(decalGeo, blankMat);
    decal.position.y = 1.55;
    g.add(decal);
    const id = 'tag' + i;
    const o = I.add({
      id, kind: 'tag', ...r, group: g, decal, cull: 70, useOffset: 1.1, radius: 2.0,
      owner: null,
      prompt: () => (o.owner ? `Spray over ${I.esc(o.owner)}'s tag <small>(hold E)</small>` : 'Spray your tag <small>(hold E)</small>'),
      enabled: () => !I.S().tags[id] && !I.holding(),
      use: () => startSpray(o),
    });
    tags.push(o);
  });
  const myColor = () => TAG_COLORS[[...String(st.p.name || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_COLORS.length];

  function setTag(o, name, color) {
    if (o.decal.material !== blankMat) o.decal.material.map?.dispose?.(), o.decal.material.dispose();
    if (!name) { o.decal.material = blankMat; o.owner = null; return; }
    o.decal.material = tagMaterial(name, color);
    o.owner = name;
  }
  function syncTags() {
    const s = I.S();
    for (const o of tags) {
      if (s.tags[o.id]) setTag(o, st.p.name, myColor());
      else if (o.owner && o.mine) setTag(o, null);
      o.mine = !!s.tags[o.id];
    }
  }

  let sprayT = 0;
  function startSpray(o) {
    if (I.S().tags[o.id]) return;
    if (!st.useEnergy(3)) return;
    sprayT = 0;
    I.hold({
      label: `Spraying your tag... <small>keep holding <kbd>E</kbd></small>`, time: 3, x: o.ix, z: o.iz, r: 2.6,
      tick: (dt) => { sprayT -= dt; if (sprayT <= 0) { sprayT = 0.45; I.sfx('spray'); } game.player.model?.punch?.(0.4); },
      cancel: () => I.toast('You stop spraying. Half a tag is just a cry for help.', 'info', 2000),
      done: () => finishTag(o),
    });
  }
  function finishTag(o) {
    const s = I.S();
    s.tags[o.id] = game.time.day;
    o.mine = true;
    const color = myColor();
    setTag(o, st.p.name, color);
    const n = Object.keys(s.tags).length;
    I.bump('tagsSprayed');
    st.addXP(15);
    const seen = I.copNear(26);
    if (seen) { I.crime('vandalism'); I.toast('A cop saw that. Art is a crime in this town.', 'bad', 2600); }
    I.toast(`🎨 Tag ${n}/${TAG_TOTAL}. ${pick(['A masterpiece. The bricks have never looked better.', 'Banksy wishes. Banksy would never.', 'Your name, in letters three feet tall. Mom would be so proud. Of something else.', 'Street cred: rising. Property value: falling.'])}`, 'good', 3000);
    game.bus.emit('interact:tag', { id: o.id, count: n, total: TAG_TOTAL });
    try { game.net?.broadcast?.({ t: 'interact:tag', id: o.id, name: String(st.p.name || '').slice(0, 16), color }); } catch { /* offline */ }
    if (n === TAG_TOTAL && !st.getFlag('tag_king')) {
      st.setFlag('tag_king', true); st.addMoney(1000, 'graffiti');
      game.ui.bigText('ALL CITY', 'Your tag is on every wall in Rotwell. A gallery offers you $1,000 to stop.', 4200);
      game.bus.emit('interact:milestone', { kind: 'tags', count: n });
    }
  }
  const okColor = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : TAG_COLORS[0]);
  game.net?.on?.('interact:tag', (msg, from) => {
    if (from && from === game.net.localId) return;
    const o = tags.find((t) => t.id === msg?.id);
    if (!o || I.S().tags[o.id]) return; // your own tag stays on your screen
    setTag(o, String(msg.name || 'someone').slice(0, 16), okColor(msg.color));
    o.mine = false;
  });
  game.net?.on?.('interact:tags', (msg, from) => {
    if (from && from === game.net.localId) return;
    for (const e of (Array.isArray(msg?.list) ? msg.list : []).slice(0, TAG_TOTAL)) {
      const o = tags.find((t) => t.id === e?.id);
      if (o && !I.S().tags[o.id]) { setTag(o, String(e.name || 'someone').slice(0, 16), okColor(e.color)); o.mine = false; }
    }
  });
  const shareTags = () => {
    const s = I.S();
    const list = tags.filter((o) => s.tags[o.id]).map((o) => ({ id: o.id, name: String(st.p.name || '').slice(0, 16), color: myColor() }));
    if (list.length) try { game.net?.broadcast?.({ t: 'interact:tags', list }); } catch { /* offline */ }
  };
  game.bus.on('net:player-joined', shareTags);
  game.bus.on('net:connected', () => setTimeout(shareTags, 1500));
  game.bus.on('net:disconnected', () => { for (const o of tags) if (o.owner && !o.mine) setTag(o, null); });

  // ============================================================ sync with save
  I.hooks.reset.push(() => { syncRats(); syncTags(); });
  game.bus.on('game:start', () => { syncRats(); syncTags(); });
  game.bus.on('look:change', () => syncTags());

  I.hooks.sheet.push((s) => `<span class="ix-rats">🐀 Rotwell Rats <b>${s.rats.length}/${RAT_TOTAL}</b></span> · 🎨 Tags <b>${Object.keys(s.tags).length}/${TAG_TOTAL}</b>`);
  I.rats = rats; I.tags = tags;
}
