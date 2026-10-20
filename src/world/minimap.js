import * as THREE from 'three';
import { DISTRICTS, CITY_NAME } from '../data/locations.js';
import { esc } from '../core/util.js';
import { districtAt, WATER_X, HALF } from './layout.js';
import { GROUND_COL } from './roads.js';

// Minimap (rotating, circular), full-screen city map (M), waypoint beacon,
// and the district title card.

const TYPE_ICON = {
  home: ['H', '#7ad06a'], bar: ['B', '#ff9a40'], gym: ['G', '#ff5a4a'], bank: ['$', '#ffd040'], hospital: ['+', '#ff3a3a'],
  police: ['★', '#5a8aff'], store: ['S', '#c8c8c8'], pizza: ['P', '#ffb040'], car_dealer: ['C', '#e8d020'], gun_shop: ['¤', '#c0c0c0'],
  clothing: ['T', '#ff80d0'], library: ['L', '#c8b090'], city_hall: ['⌂', '#d8d0b0'], university: ['U', '#c08060'], casino: ['♠', '#ffd040'],
  nightclub: ['♪', '#ff40c0'], office: ['O', '#80ff60'], church: ['†', '#e8e0c0'], gang_hq: ['☠', '#a8ff30'], factory: ['F', '#b08070'],
  chop_shop: ['C', '#ff9030'], fight_club: ['!', '#ff3a1a'], warehouse: ['W', '#a0a0a0'], gas: ['⛽', '#60c060'], junkyard: ['J', '#b09060'],
  race: ['R', '#ffcc40'], bunker: ['☢', '#d0d040'], diner: ['D', '#ff6060'], liquor: ['L', '#7aff5a'], tattoo: ['I', '#ff60e0'],
  fortune: ['?', '#c080ff'], pawn: ['$', '#ffc020'], hobo_camp: ['~', '#a09070'], dealer: ['•', '#ff00ff'],
  isle_arcade: ['A', '#ff70d0'], isle_seafood: ['F', '#60c0ff'], isle_pier: ['J', '#80d0ff'], isle_lighthouse: ['¡', '#fff0a0'],
  isle_cove: ['$', '#c0a060'], isle_prison: ['#', '#c0c0c0'],
};
const DIST_LABEL_POS = { downtown: [0, -15], hilltop: [0, -520], rustyards: [470, 0], gutterside: [0, 600], dustbowl: [-500, 40], blackwater: [1060, -245] };

export class MapSystem {
  constructor(game, layout, opts = {}) {
    this.game = game;
    this.layout = layout;
    this.ext = opts.ext ?? { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };
    this.coast = opts.coast ?? null;
    this.spots = opts.spots ?? null;
    this.mw = this.ext.maxX - this.ext.minX; this.mh = this.ext.maxZ - this.ext.minZ;
    this.S = 1.25; // base canvas px per meter
    this.base = this._buildBase();
    this.canvas = game.ui.minimap;
    this.ctx = this.canvas?.getContext('2d');
    this.frame = 0;
    this.panel = null;
    this.beacon = this._makeBeacon();
    game.scene.add(this.beacon);
    this.district = null;
    this._card = this._makeCard();
  }

  _buildBase() {
    const S = this.S, E = this.ext;
    const NW = Math.ceil(this.mw * S), NH = Math.ceil(this.mh * S);
    const c = document.createElement('canvas'); c.width = NW; c.height = NH;
    const x = c.getContext('2d');
    const P = (wx, wz) => [(wx - E.minX) * S, (wz - E.minZ) * S];
    // ground per district (city), oily water everywhere east of the quay
    const step = 8;
    x.fillStyle = '#0c1214'; x.fillRect(0, 0, NW, NH);
    for (let i = 0; i < NW; i += step) for (let j = 0; j < NH; j += step) {
      const wx = i / S + E.minX, wz = j / S + E.minZ;
      if (wx >= WATER_X) continue;
      const d = districtAt(wx, wz);
      x.fillStyle = shade(GROUND_COL[d], 0.42); x.fillRect(i, j, step, step);
    }
    // Blackwater Isle landmass
    if (this.coast) {
      x.beginPath();
      this.coast.forEach(([cx, cz], k) => { const [px, py] = P(cx, cz); if (k) x.lineTo(px, py); else x.moveTo(px, py); });
      x.closePath();
      x.fillStyle = shade(GROUND_COL.blackwater ?? '#4e4a3c', 0.5); x.fill();
      x.strokeStyle = '#3a3a30'; x.lineWidth = 3; x.stroke();
    }
    const L = this.layout;
    // sidewalks then roads
    x.lineCap = 'butt';
    for (const pass of [0, 1]) for (const e of L.edgeInfo) {
      const A = L.nodes[e.a], B = L.nodes[e.b];
      x.strokeStyle = pass ? (e.kind === 'ring' || e.kind === 'main' || e.kind === 'diag' ? '#8a857a' : e.kind === 'desert' || e.kind === 'drag' ? '#6a5e4a' : '#6e6a62') : '#3e3b36';
      x.lineWidth = (pass ? e.hw * 2 : (e.hw + e.sw) * 2) * S;
      x.beginPath(); x.moveTo(...P(A.x, A.z)); x.lineTo(...P(B.x, B.z)); x.stroke();
    }
    // buildings
    for (const l of L.lots) {
      if (['parking', 'plaza', 'park', 'vacant', 'empty', 'junk'].includes(l.type)) { x.fillStyle = l.type === 'parking' ? '#36342f' : 'rgba(40,36,30,0.6)'; }
      else x.fillStyle = '#262320';
      x.fillRect(...P(l.x0, l.z0), (l.x1 - l.x0) * S, (l.z1 - l.z0) * S);
      x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 1; x.strokeRect(...P(l.x0, l.z0), (l.x1 - l.x0) * S, (l.z1 - l.z0) * S);
    }
    for (const l of L.placed) {
      x.fillStyle = '#4a3a24'; x.fillRect(...P(l.x0, l.z0), (l.x1 - l.x0) * S, (l.z1 - l.z0) * S);
      x.strokeStyle = '#c9a227'; x.lineWidth = 1.5; x.strokeRect(...P(l.x0, l.z0), (l.x1 - l.x0) * S, (l.z1 - l.z0) * S);
    }
    // piers / overpass
    x.fillStyle = '#5a4a38';
    for (const pz of [-420, -170, 160, 410]) x.fillRect(...P(WATER_X, pz - 5), 68 * S, 10 * S);
    const SP = this.spots;
    if (SP) {
      x.fillRect(...P(SP.ferry.x0, SP.ferry.z - 3), (SP.ferry.x1 - SP.ferry.x0) * S, 6 * S);
      x.fillRect(...P(SP.pier.x - 3, SP.pier.z0), 6 * S, (SP.pier.z1 - SP.pier.z0) * S);
      // Funland, prison, lighthouse
      const F = SP.funland, Pn = SP.prison;
      x.fillStyle = 'rgba(120,40,70,0.35)'; x.fillRect(...P(F.x0, F.z0), (F.x1 - F.x0) * S, (F.z1 - F.z0) * S);
      x.strokeStyle = '#a04070'; x.lineWidth = 2; x.strokeRect(...P(F.x0, F.z0), (F.x1 - F.x0) * S, (F.z1 - F.z0) * S);
      const [fx, fz] = P(SP.ferris.x, SP.ferris.z); x.strokeStyle = '#c06040'; x.lineWidth = 3; x.beginPath(); x.moveTo(fx, fz - SP.ferris.r * S); x.lineTo(fx, fz + SP.ferris.r * S); x.stroke();
      const CO = SP.coaster; const [ccx, ccz] = P(CO.cx, CO.cz); x.strokeStyle = '#8a5a3a'; x.lineWidth = 2; x.beginPath(); x.ellipse(ccx, ccz, CO.rx * S, CO.rz * S, 0, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#2a2a2a'; x.fillRect(...P(Pn.x0, Pn.z0), (Pn.x1 - Pn.x0) * S, (Pn.z1 - Pn.z0) * S);
      x.strokeStyle = '#9a9a90'; x.lineWidth = 2.5; x.strokeRect(...P(Pn.x0, Pn.z0), (Pn.x1 - Pn.x0) * S, (Pn.z1 - Pn.z0) * S);
      const [lx, lz] = P(SP.lighthouse.x, SP.lighthouse.z); x.fillStyle = '#e8e0c0'; x.beginPath(); x.arc(lx, lz, 4 * S, 0, 7); x.fill();
    }
    x.fillStyle = 'rgba(120,115,105,0.55)'; x.fillRect(...P(-420, 428), 840 * S, 24 * S);
    return c;
  }

  _makeBeacon() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 140, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 70;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 32), new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
    g.add(beam, ring);
    g.visible = false;
    g.userData = { beam, ring };
    return g;
  }

  _makeCard() {
    const el = document.createElement('div');
    el.id = 'district-card';
    el.style.cssText = 'position:absolute;left:50%;top:max(13%, var(--hud-c1, 0px));transform:translateX(-50%);width:max-content;max-width:min(620px, 60vw);text-align:center;pointer-events:none;opacity:0;transition:opacity .8s;z-index:5;text-shadow:3px 3px 0 #000,0 0 18px rgba(0,0,0,.8)';
    document.getElementById('ui-root')?.appendChild(el);
    return el;
  }

  showCard(d) {
    const D = DISTRICTS[d];
    if (!D || !this._card) return;
    this._card.innerHTML = `<div style="font-family:'Special Elite',monospace;font-size:clamp(24px, 4.2vw, 46px);line-height:1.05;color:#e8dcc0;letter-spacing:2px">${esc(D.name)}</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:clamp(13px, 1.5vw, 18px);color:${D.palette.accent};max-width:560px;margin:4px auto 0;text-transform:uppercase;letter-spacing:1px">${'☠'.repeat(D.danger)} danger · ${esc(D.vibe.split('.')[0])}</div>`;
    this._card.style.opacity = '1';
    clearTimeout(this._cardT);
    this._cardT = setTimeout(() => { this._card.style.opacity = '0'; }, 3200);
  }

  focus() {
    const p = this.game.player;
    if (!p) return null;
    return p.vehicle?.group?.position ?? p.group.position;
  }

  update(dt) {
    const g = this.game;
    const f = this.focus();
    if (!f) return;
    // district tracking
    this._dT = (this._dT ?? 0) - dt;
    if (this._dT <= 0) {
      this._dT = 0.4;
      const d = districtAt(f.x, f.z);
      if (d !== this.district) {
        this.district = d;
        g.ui.setHud('district', esc(DISTRICTS[d]?.name ?? d));
        if (g.started) this.showCard(d);
        g.bus.emit('district:enter', { district: d });
      }
    }
    // waypoint beacon
    const wp = g.world?.markers?.get('waypoint');
    if (wp) {
      this.beacon.visible = true;
      this.beacon.position.set(wp.x, 0, wp.z);
      this.beacon.userData.ring.scale.setScalar(1 + Math.sin(g.elapsed * 3) * 0.15);
      if (Math.hypot(wp.x - f.x, wp.z - f.z) < 7) { g.world.markers.delete('waypoint'); g.ui.toast('Waypoint reached. Now what?', 'info', 1800); }
    } else this.beacon.visible = false;

    // minimap: redrawn at a fixed rate (~30 Hz on High) instead of every other frame, so 144 Hz
    // screens don't pay for 72 redraws a second
    this.frame++;
    this.miniT = (this.miniT ?? 1) + dt;
    const hz = g.world?.quality?.miniHz ?? 30;
    if (this.ctx && this.miniT >= 0.9 / hz) { this.miniT = 0; this.drawMini(f); }
    if (this.panel && !this.panel.closed && this.frame % 10 === 0) this.drawFull();
  }

  drawMini(f) {
    const g = this.game, x = this.ctx, W = this.canvas.width, R = W / 2;
    const yaw = g.cameraRig?.yaw ?? 0;
    const inCar = !!g.player?.vehicle;
    const ppm = inCar ? 0.55 : 0.85; // minimap px per meter
    const Z = ppm / this.S;
    x.save();
    x.clearRect(0, 0, W, W);
    x.beginPath(); x.arc(R, R, R - 1, 0, Math.PI * 2); x.clip();
    x.fillStyle = '#0d0c0b'; x.fillRect(0, 0, W, W);
    x.translate(R, R); x.rotate(yaw); x.scale(Z, Z);
    x.translate(-(f.x - this.ext.minX) * this.S, -(f.z - this.ext.minZ) * this.S);
    x.imageSmoothingEnabled = true;
    x.drawImage(this.base, 0, 0);
    x.restore();
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const toS = (wx, wz) => { const dx = (wx - f.x) * ppm, dz = (wz - f.z) * ppm; return [R + dx * cs - dz * sn, R + dx * sn + dz * cs]; };
    x.save();
    x.beginPath(); x.arc(R, R, R - 1, 0, Math.PI * 2); x.clip();
    // locations
    x.font = 'bold 10px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const l of g.locations.list) {
      const [sx, sy] = toS(l.doorX ?? l.x, l.doorZ ?? l.z);
      if (Math.hypot(sx - R, sy - R) > R - 6) continue;
      const [ch, col] = TYPE_ICON[l.type] ?? ['•', '#ccc'];
      x.fillStyle = 'rgba(0,0,0,0.75)'; x.beginPath(); x.arc(sx, sy, 6.5, 0, 7); x.fill();
      x.strokeStyle = col; x.lineWidth = 1.5; x.stroke();
      x.fillStyle = col; x.fillText(ch, sx, sy + 0.5);
    }
    // hostile NPCs
    try {
      const list = g.npcs?.list?.() ?? [];
      for (const n of list) {
        if (n.dead || !n.pos) continue;
        const [sx, sy] = toS(n.pos.x, n.pos.z);
        if (Math.hypot(sx - R, sy - R) > R - 4) continue;
        if (n.hostile) { x.fillStyle = '#ff2a1a'; x.beginPath(); x.arc(sx, sy, 3, 0, 7); x.fill(); }
        else if (n.kind === 'cop') { x.fillStyle = '#4a7aff'; x.beginPath(); x.arc(sx, sy, 2.5, 0, 7); x.fill(); }
      }
    } catch { /* ignore */ }
    // remote players
    for (const rp of g.net?.remotePlayers?.values?.() ?? []) {
      if (!rp?.pos) continue;
      let [sx, sy] = toS(rp.pos.x, rp.pos.z);
      const d = Math.hypot(sx - R, sy - R);
      if (d > R - 8) { sx = R + (sx - R) / d * (R - 8); sy = R + (sy - R) / d * (R - 8); }
      x.fillStyle = '#40e0ff'; x.strokeStyle = '#000'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(sx, sy, 4.5, 0, 7); x.fill(); x.stroke();
    }
    // markers (clamped to the rim)
    for (const [id, m] of g.world.markers ?? []) {
      if (m == null || !Number.isFinite(m.x)) continue;
      let [sx, sy] = toS(m.x, m.z);
      const d = Math.hypot(sx - R, sy - R);
      const off = d > R - 9;
      if (off) { sx = R + (sx - R) / d * (R - 9); sy = R + (sy - R) / d * (R - 9); }
      drawMarker(x, sx, sy, m, id === 'waypoint', off);
    }
    x.restore();
    // player arrow
    const fac = g.player.vehicle ? (g.player.vehicle.group?.rotation?.y ?? g.player.facing) : g.player.facing;
    const vx = Math.sin(fac), vz = Math.cos(fac);
    const ax = vx * cs - vz * sn, ay = vx * sn + vz * cs;
    const ang = Math.atan2(ay, ax);
    x.save(); x.translate(R, R); x.rotate(ang);
    x.fillStyle = '#f0e8d0'; x.strokeStyle = '#000'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(9, 0); x.lineTo(-6, 6); x.lineTo(-3, 0); x.lineTo(-6, -6); x.closePath(); x.stroke(); x.fill();
    x.restore();
    // north marker on the rim
    const [nx, ny] = [R + (0 * cs - (-1) * sn) * (R - 10), R + (0 * sn + (-1) * cs) * (R - 10)];
    x.font = 'bold 13px "Special Elite", monospace'; x.fillStyle = '#c9a227'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.strokeStyle = '#000'; x.lineWidth = 3; x.strokeText('N', nx, ny); x.fillText('N', nx, ny);
    // rim
    x.beginPath(); x.arc(R, R, R - 1.5, 0, Math.PI * 2); x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 3; x.stroke();
  }

  // ---------------- full map
  openFull() {
    const g = this.game;
    if (this.panel && !this.panel.closed) { this.panel.close(); return; }
    const asp = this.mw / this.mh;
    const cw = Math.round(Math.max(420, Math.min(innerWidth - 80, (innerHeight - 170) * asp, 1240)));
    const ch = Math.round(cw / asp);
    const size = cw;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<canvas width="${cw * 2}" height="${ch * 2}" style="width:${cw}px;height:${ch}px;display:block;margin:0 auto;cursor:crosshair;border:2px solid #3b342b;background:#0d0c0b"></canvas>
      <div style="text-align:center;margin-top:6px;font-size:14px;opacity:.75">Click to set a waypoint · right-click to clear · M / Esc to close</div>`;
    const cv = wrap.querySelector('canvas');
    this.fullCanvas = cv; this.fullSize = cw * 2; this.fullH = ch * 2;
    this.panel = g.ui.openPanel({ title: `${CITY_NAME} — City Map`, body: wrap, width: size + 60, onClose: () => { this.panel = null; } });
    const E = this.ext;
    const toWorld = (ev) => { const r = cv.getBoundingClientRect(); return [((ev.clientX - r.left) / r.width) * this.mw + E.minX, ((ev.clientY - r.top) / r.height) * this.mh + E.minZ]; };
    cv.addEventListener('click', (ev) => {
      const [wx, wz] = toWorld(ev);
      g.world.markers.set('waypoint', { x: wx, z: wz, color: '#ffd040', label: 'Waypoint', icon: '✚' });
      this.drawFull();
    });
    cv.addEventListener('contextmenu', (ev) => { ev.preventDefault(); g.world.markers.delete('waypoint'); this.drawFull(); });
    this.drawFull();
  }

  drawFull() {
    const cv = this.fullCanvas; if (!cv) return;
    const g = this.game, x = cv.getContext('2d'), N = this.fullSize, NH = this.fullH, k = N / this.mw, E = this.ext;
    const P = (wx, wz) => [(wx - E.minX) * k, (wz - E.minZ) * k];
    x.clearRect(0, 0, N, NH);
    x.drawImage(this.base, 0, 0, N, NH);
    // grime vignette
    const vg = x.createRadialGradient(N / 2, NH / 2, NH * 0.3, N / 2, NH / 2, N * 0.6); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = vg; x.fillRect(0, 0, N, NH);
    // districts
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const [id, [wx, wz]] of Object.entries(DIST_LABEL_POS)) {
      const D = DISTRICTS[id]; const [sx, sy] = P(wx, wz);
      if (!D) continue;
      x.font = `${Math.round(NH / 30)}px "Special Elite", monospace`;
      x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText(D.name.toUpperCase(), sx, sy);
      x.fillStyle = D.palette.accent; x.fillText(D.name.toUpperCase(), sx, sy);
    }
    // locations
    const fs = Math.round(NH / 72);
    for (const l of g.locations.list) {
      const [sx, sy] = P(l.doorX ?? l.x, l.doorZ ?? l.z);
      const [ch, col] = TYPE_ICON[l.type] ?? ['•', '#ccc'];
      x.fillStyle = 'rgba(0,0,0,0.85)'; x.beginPath(); x.arc(sx, sy, fs * 0.85, 0, 7); x.fill();
      x.strokeStyle = col; x.lineWidth = 2; x.stroke();
      x.font = `bold ${fs}px "Barlow Condensed", sans-serif`; x.fillStyle = col; x.fillText(ch, sx, sy + 1);
      x.font = `${Math.round(fs * 0.95)}px "Barlow Condensed", sans-serif`;
      x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,0.9)'; x.strokeText(l.name, sx, sy + fs * 1.6);
      x.fillStyle = '#e8dcc0'; x.fillText(l.name, sx, sy + fs * 1.6);
    }
    // markers
    for (const [id, m] of g.world.markers ?? []) {
      if (m == null || !Number.isFinite(m.x)) continue;
      const [sx, sy] = P(m.x, m.z);
      drawMarker(x, sx, sy, m, id === 'waypoint', false, 1.8);
      if (m.label) { x.font = `${Math.round(fs * 0.9)}px "Barlow Condensed", sans-serif`; x.lineWidth = 4; x.strokeStyle = '#000'; x.strokeText(m.label, sx, sy - fs * 1.8); x.fillStyle = m.color ?? '#fff'; x.fillText(m.label, sx, sy - fs * 1.8); }
    }
    for (const rp of g.net?.remotePlayers?.values?.() ?? []) {
      if (!rp?.pos) continue;
      const [sx, sy] = P(rp.pos.x, rp.pos.z);
      x.fillStyle = '#40e0ff'; x.beginPath(); x.arc(sx, sy, fs * 0.6, 0, 7); x.fill(); x.strokeStyle = '#000'; x.lineWidth = 2; x.stroke();
      if (rp.name) { x.font = `${fs}px "Barlow Condensed", sans-serif`; x.fillStyle = '#40e0ff'; x.fillText(rp.name, sx, sy - fs * 1.4); }
    }
    const f = this.focus();
    if (f) {
      const [sx, sy] = P(f.x, f.z);
      const fac = g.player.vehicle ? (g.player.vehicle.group?.rotation?.y ?? g.player.facing) : g.player.facing;
      x.save(); x.translate(sx, sy); x.rotate(Math.atan2(Math.cos(fac), Math.sin(fac)));
      x.fillStyle = '#f0e8d0'; x.strokeStyle = '#000'; x.lineWidth = 3;
      const s = fs * 1.1;
      x.beginPath(); x.moveTo(s, 0); x.lineTo(-s * 0.7, s * 0.7); x.lineTo(-s * 0.3, 0); x.lineTo(-s * 0.7, -s * 0.7); x.closePath(); x.stroke(); x.fill();
      x.restore();
    }
  }
}

function drawMarker(x, sx, sy, m, isWp, off, scale = 1) {
  const col = m.color ?? '#ffd040';
  const r = (isWp ? 6 : m.tracked ? 6 : 5) * scale;
  x.save(); x.translate(sx, sy);
  x.fillStyle = col; x.strokeStyle = '#000'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(0, -r); x.lineTo(r, 0); x.lineTo(0, r); x.lineTo(-r, 0); x.closePath(); x.fill(); x.stroke();
  if (m.icon) { x.fillStyle = '#000'; x.font = `bold ${Math.round(r * 1.3)}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(m.icon, 0, 0.5); }
  if (off) { x.globalAlpha = 0.6; x.strokeStyle = col; x.beginPath(); x.arc(0, 0, r + 3, 0, 7); x.stroke(); }
  x.restore();
}

function shade(hex, f) { const n = parseInt(hex.slice(1), 16); return `rgb(${((n >> 16) & 255) * f | 0},${((n >> 8) & 255) * f | 0},${(n & 255) * f | 0})`; }
