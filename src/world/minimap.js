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
const TYPE_LABEL = {
  home: 'Home', bar: 'Bar', gym: 'Gym', bank: 'Bank', hospital: 'Hospital', police: 'Police', store: 'Store', pizza: 'Pizza',
  car_dealer: 'Car dealer', gun_shop: 'Gun shop', clothing: 'Clothes', library: 'Library', city_hall: 'City Hall', university: 'University',
  casino: 'Casino', nightclub: 'Nightclub', office: 'Office', church: 'Church', gang_hq: 'Gang HQ', factory: 'Factory', chop_shop: 'Chop shop',
  fight_club: 'Fight club', warehouse: 'Warehouse', gas: 'Gas station', junkyard: 'Junkyard', race: 'Drag strip', bunker: 'Bunker', diner: 'Diner',
  liquor: 'Liquor', tattoo: 'Tattoo', fortune: 'Fortune teller', pawn: 'Pawn shop', hobo_camp: 'Hobo camp', dealer: 'Dealer',
  isle_arcade: 'Arcade', isle_seafood: 'Seafood', isle_pier: 'Pier', isle_lighthouse: 'Lighthouse', isle_cove: 'Smugglers cove', isle_prison: 'Prison',
};
const LABEL_TRIES = [[0, 0]];
for (let r = 12; r <= 60; r += 12) for (let a = 0; a < 8; a++) LABEL_TRIES.push([Math.round(Math.cos(a * Math.PI / 4) * r * 1.6), Math.round(Math.sin(a * Math.PI / 4) * r)]);
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
    el.style.cssText = 'position:absolute;left:50%;top:max(13%, var(--hud-c1, 0px));transform:translateX(-50%);width:max-content;max-width:min(620px, 60vw);text-align:center;pointer-events:none;opacity:0;transition:opacity .8s;text-shadow:3px 3px 0 #000,0 0 18px rgba(0,0,0,.8)';
    // below the dialog layer: a district title must never print across an open panel
    const root = document.getElementById('ui-root');
    root?.insertBefore(el, document.getElementById('dialog-layer'));
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

  // ---------------- full map (M)
  // Fills the viewport. Drag / wheel / pinch to pan and zoom, click or tap to drop a waypoint, right-click to
  // clear it. The static layer (ground, roads, blocks, district names) is cached per view; icons, markers,
  // friends and the player are redrawn on top at a constant screen size.
  openFull() {
    const g = this.game;
    if (this.panel && !this.panel.closed) { this.panel.close(); return; }
    const wrap = document.createElement('div');
    wrap.className = 'map-full';
    wrap.innerHTML = `<div class="map-view"><canvas></canvas>
        <div class="map-ctrls">
          <button class="map-btn" data-act="in" title="Zoom in">+</button>
          <button class="map-btn" data-act="out" title="Zoom out">−</button>
          <button class="map-btn" data-act="me" title="Center on me">◎</button>
          <button class="map-btn" data-act="fit" title="Whole city">⤢</button>
          <button class="map-btn wide" data-act="legend" title="Legend">Legend</button>
        </div>
        <div class="map-legend${this.legendOn ? '' : ' hidden'}"></div>
      </div>
      <div class="map-hint">Click to set a waypoint · right-click clears · drag to pan · wheel or pinch to zoom · M / Esc closes</div>`;
    const view = wrap.querySelector('.map-view');
    const cv = wrap.querySelector('canvas');
    const legend = wrap.querySelector('.map-legend');
    legend.innerHTML = this._legendHtml();
    this.fullCanvas = cv; this.fullView = view;
    this.mv = null; // view: { cx, cz, k (css px per meter), W, H, dpr }
    this.panel = g.ui.openPanel({
      title: `${CITY_NAME} — City Map`, body: wrap, width: 4000, className: 'map-modal',
      onClose: () => { this.panel = null; this.fullCanvas = null; this.fullView = null; this._mapResize = null; this._ro?.disconnect(); this._ro = null; },
    });

    const fit = () => {
      const V = this.mv; if (!V) return;
      V.k = this._fitK(); V.cx = this.ext.minX + this.mw / 2; V.cz = this.ext.minZ + this.mh / 2; V.fitted = true;
    };
    const resize = () => {
      const r = view.getBoundingClientRect();
      const W = Math.max(50, Math.round(r.width)), H = Math.max(50, Math.round(r.height));
      const dpr = Math.min(2, devicePixelRatio || 1);
      const first = !this.mv;
      this.mv = { ...(this.mv ?? {}), W, H, dpr };
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      if (first || this.mv.fitted) fit(); else this._clampView();
      this._statKey = null;
      this.drawFull();
    };
    this._mapResize = resize;
    this._ro?.disconnect();
    this._ro = new ResizeObserver(() => resize());
    this._ro.observe(view);
    resize();

    const toWorld = (cx, cy) => { const r = cv.getBoundingClientRect(), V = this.mv; return [V.cx + (cx - r.left - V.W / 2) / V.k, V.cz + (cy - r.top - V.H / 2) / V.k]; };
    const zoomAt = (f, sx, sy) => {
      const V = this.mv; if (!V) return;
      const [wx, wz] = sx == null ? [V.cx, V.cz] : toWorld(sx, sy);
      const k0 = V.k;
      V.k = Math.max(this._fitK() * 0.85, Math.min(7, V.k * f)); V.fitted = false;
      const s = k0 / V.k; V.cx = wx + (V.cx - wx) * s; V.cz = wz + (V.cz - wz) * s;
      this._clampView(); this.drawFull();
    };
    const center = () => { const f = this.focus(); const V = this.mv; if (!f || !V) return; V.k = Math.max(V.k, 1.6); V.fitted = false; V.cx = f.x; V.cz = f.z; this._clampView(); this.drawFull(); };
    wrap.querySelector('.map-ctrls').addEventListener('click', (ev) => {
      const act = ev.target.closest('[data-act]')?.dataset.act;
      if (act === 'in') zoomAt(1.5); else if (act === 'out') zoomAt(1 / 1.5);
      else if (act === 'fit') { fit(); this.drawFull(); } else if (act === 'me') center();
      else if (act === 'legend') { this.legendOn = !this.legendOn; legend.classList.toggle('hidden', !this.legendOn); this.drawFull(); }
    });

    // pointers: one = pan (or a tap = waypoint), two = pinch zoom
    const pts = new Map();
    let drag = null, pinch = null;
    cv.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      cv.setPointerCapture?.(ev.pointerId);
      pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pts.size === 1) drag = { x: ev.clientX, y: ev.clientY, moved: false, cx: this.mv.cx, cz: this.mv.cz };
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, k: this.mv.k };
        if (drag) drag.moved = true;
      }
    });
    cv.addEventListener('pointermove', (ev) => {
      if (!pts.has(ev.pointerId)) return;
      pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
      const V = this.mv;
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
        zoomAt((pinch.k * d / pinch.d) / V.k, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        return;
      }
      if (!drag) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 5) drag.moved = true;
      if (drag.moved) { V.cx = drag.cx - dx / V.k; V.cz = drag.cz - dy / V.k; V.fitted = false; this._clampView(); this.drawFull(); }
    });
    const up = (ev) => {
      if (!pts.has(ev.pointerId)) return;
      pts.delete(ev.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) {
        if (drag && !drag.moved && ev.type === 'pointerup') {
          const [wx, wz] = toWorld(ev.clientX, ev.clientY);
          g.world.markers.set('waypoint', { x: wx, z: wz, color: '#ffd040', label: 'Waypoint', icon: '✚' });
          this.drawFull();
        }
        drag = null;
      } else if (pts.size === 1) {
        const [p] = [...pts.values()];
        drag = { x: p[0], y: p[1], moved: true, cx: this.mv.cx, cz: this.mv.cz };
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (ev) => { ev.preventDefault(); zoomAt(Math.exp(-Math.max(-120, Math.min(120, ev.deltaY * (ev.deltaMode === 1 ? 33 : 1))) * 0.0032), ev.clientX, ev.clientY); }, { passive: false });
    cv.addEventListener('contextmenu', (ev) => { ev.preventDefault(); g.world.markers.delete('waypoint'); this.drawFull(); });
  }

  // District name spots: near each district's anchor, but in the emptiest nearby patch (away from the
  // place pins) so the big names never sit under a cluster of icons and labels.
  _distLabels() {
    if (this._dl) return this._dl;
    const locs = this.game.locations.list.map((l) => [l.doorX ?? l.x, l.doorZ ?? l.z]);
    const out = {};
    for (const [id, [ax, az]] of Object.entries(DIST_LABEL_POS)) {
      let best = [ax, az], bs = -Infinity;
      for (let gx = -200; gx <= 200; gx += 10) for (let gz = -160; gz <= 160; gz += 10) {
        const x = ax + gx, z = az + gz;
        if (id !== 'blackwater' && (x >= WATER_X - 20 || districtAt(x, z) !== id)) continue;
        if (x < this.ext.minX + 120 || x > this.ext.maxX - 120 || z < this.ext.minZ + 40 || z > this.ext.maxZ - 40) continue;
        let md = 400;
        for (const [lx, lz] of locs) md = Math.min(md, Math.hypot((lx - x) / 2.2, (lz - z) * 1.0));
        const sc = Math.min(md, 46) - Math.hypot(gx, gz) * 0.06;
        if (sc > bs) { bs = sc; best = [x, z]; }
      }
      out[id] = best;
    }
    return (this._dl = out);
  }

  _fitK() { const V = this.mv; return V ? Math.min(V.W / this.mw, V.H / this.mh) * 0.97 : 0.5; }

  _clampView() {
    const V = this.mv, E = this.ext;
    // keep the city on screen: the view centre can't leave the map, and at fit zoom it stays centred
    const hw = V.W / 2 / V.k, hh = V.H / 2 / V.k;
    const clampAx = (c, lo, hi, half) => (hi - lo <= half * 2 ? (lo + hi) / 2 : Math.max(lo + half, Math.min(hi - half, c)));
    V.cx = clampAx(V.cx, E.minX, E.maxX, hw);
    V.cz = clampAx(V.cz, E.minZ, E.maxZ, hh);
  }

  _legendHtml() {
    const types = [...new Set(this.game.locations.list.map((l) => l.type))].filter((t) => TYPE_ICON[t]);
    types.sort((a, b) => (TYPE_LABEL[a] ?? a).localeCompare(TYPE_LABEL[b] ?? b));
    const row = (ch, col, label, shape = 'pin') => `<div class="ml-row"><span class="ml-ico ${shape}" style="--c:${col}">${ch}</span>${esc(label)}</div>`;
    return `<div class="ml-sec">Places</div>${types.map((t) => row(TYPE_ICON[t][0], TYPE_ICON[t][1], TYPE_LABEL[t] ?? t.replace(/_/g, ' '))).join('')}
      <div class="ml-sec">Markers</div>
      ${row('➤', '#f0e8d0', 'You', 'me')}${row('', '#40e0ff', 'Friend', 'dot')}${row('✚', '#ffd040', 'Waypoint', 'dia')}
      ${row('★', '#ffd040', 'Main quest', 'dia')}${row('!', '#e8dcc0', 'Side quest / lead', 'dia')}`;
  }

  // Static layer for the current view (cached until the view or size changes).
  _drawStatic() {
    const V = this.mv, E = this.ext, L = this.layout;
    const key = `${V.cx.toFixed(2)}|${V.cz.toFixed(2)}|${V.k.toFixed(4)}|${V.W}|${V.H}|${V.dpr}`;
    if (this._statKey === key && this._stat) return this._stat;
    this._statKey = key;
    const c = this._stat ??= document.createElement('canvas');
    const PW = Math.round(V.W * V.dpr), PH = Math.round(V.H * V.dpr);
    if (c.width !== PW || c.height !== PH) { c.width = PW; c.height = PH; }
    const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#0c1214'; x.fillRect(0, 0, PW, PH);
    const k = V.k * V.dpr;
    // world -> device px
    const ox = PW / 2 - (V.cx - E.minX) * k, oy = PH / 2 - (V.cz - E.minZ) * k;
    x.imageSmoothingEnabled = true;
    x.drawImage(this.base, ox, oy, this.mw * k, this.mh * k);
    // zoomed past the raster's resolution: redraw roads and blocks as crisp vectors on top
    if (k > this.S * 1.15) {
      x.setTransform(k, 0, 0, k, ox - E.minX * k, oy - E.minZ * k);
      const vx0 = V.cx - V.W / 2 / V.k - 40, vx1 = V.cx + V.W / 2 / V.k + 40, vz0 = V.cz - V.H / 2 / V.k - 40, vz1 = V.cz + V.H / 2 / V.k + 40;
      x.lineCap = 'butt';
      for (const pass of [0, 1]) for (const e of L.edgeInfo) {
        const A = L.nodes[e.a], B = L.nodes[e.b];
        if (Math.max(A.x, B.x) < vx0 || Math.min(A.x, B.x) > vx1 || Math.max(A.z, B.z) < vz0 || Math.min(A.z, B.z) > vz1) continue;
        x.strokeStyle = pass ? (e.kind === 'ring' || e.kind === 'main' || e.kind === 'diag' ? '#8a857a' : e.kind === 'desert' || e.kind === 'drag' ? '#6a5e4a' : '#6e6a62') : '#3e3b36';
        x.lineWidth = pass ? e.hw * 2 : (e.hw + e.sw) * 2;
        x.beginPath(); x.moveTo(A.x, A.z); x.lineTo(B.x, B.z); x.stroke();
      }
      x.lineWidth = 1 / k;
      for (const l of L.lots) {
        if (l.x1 < vx0 || l.x0 > vx1 || l.z1 < vz0 || l.z0 > vz1) continue;
        x.fillStyle = ['parking', 'plaza', 'park', 'vacant', 'empty', 'junk'].includes(l.type) ? (l.type === 'parking' ? '#36342f' : 'rgba(40,36,30,0.6)') : '#262320';
        x.fillRect(l.x0, l.z0, l.x1 - l.x0, l.z1 - l.z0);
        x.strokeStyle = 'rgba(0,0,0,0.5)'; x.strokeRect(l.x0, l.z0, l.x1 - l.x0, l.z1 - l.z0);
      }
      x.lineWidth = 1.5 / k;
      for (const l of L.placed) {
        if (l.x1 < vx0 || l.x0 > vx1 || l.z1 < vz0 || l.z0 > vz1) continue;
        x.fillStyle = '#4a3a24'; x.fillRect(l.x0, l.z0, l.x1 - l.x0, l.z1 - l.z0);
        x.strokeStyle = '#c9a227'; x.strokeRect(l.x0, l.z0, l.x1 - l.x0, l.z1 - l.z0);
      }
      x.setTransform(1, 0, 0, 1, 0, 0);
    }
    // soft vignette so the edge of the panel doesn't look cut
    const vg = x.createRadialGradient(PW / 2, PH / 2, Math.min(PW, PH) * 0.35, PW / 2, PH / 2, Math.hypot(PW, PH) * 0.55);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    x.fillStyle = vg; x.fillRect(0, 0, PW, PH);
    return c;
  }

  drawFull() {
    const cv = this.fullCanvas, V = this.mv; if (!cv || !V) return;
    // the panel was resized (window resize / rotation) and the observer hasn't caught up yet
    const vr = this.fullView?.getBoundingClientRect();
    if (vr && vr.width > 0 && (Math.round(vr.width) !== V.W || Math.round(vr.height) !== V.H) && !this._resizing) { this._resizing = true; try { this._mapResize?.(); } finally { this._resizing = false; } return; }
    const g = this.game, x = cv.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(this._drawStatic(), 0, 0);
    x.setTransform(V.dpr, 0, 0, V.dpr, 0, 0); // CSS px from here on
    const P = (wx, wz) => [V.W / 2 + (wx - V.cx) * V.k, V.H / 2 + (wz - V.cz) * V.k];
    const onScreen = (sx, sy, m = 20) => sx > -m && sx < V.W + m && sy > -m && sy < V.H + m;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const taken = []; // label boxes already drawn (labels never pile on top of each other)
    const free = (b) => !taken.some((t) => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
    const label = (text, sx, sy, col, font, h = 14, dry = false) => {
      x.font = font;
      const w = x.measureText(text).width;
      const b = [sx - w / 2 - 3, sy - h / 2, sx + w / 2 + 3, sy + h / 2];
      if (b[0] < 2 || b[2] > V.W - 2 || b[1] < 2 || b[3] > V.H - 2 || !free(b)) return false;
      if (dry) return true;
      taken.push(b);
      x.lineWidth = 3.5; x.strokeStyle = 'rgba(0,0,0,0.9)'; x.strokeText(text, sx, sy);
      x.fillStyle = col; x.fillText(text, sx, sy);
      return true;
    };
    // keep labels out from under the map buttons and the legend
    for (const el of this.fullView?.querySelectorAll('.map-ctrls, .map-legend:not(.hidden)') ?? []) {
      const r = el.getBoundingClientRect(), o = cv.getBoundingClientRect();
      taken.push([r.left - o.left - 4, r.top - o.top - 4, r.right - o.left + 4, r.bottom - o.top + 4]);
    }
    // player first so nothing labels over it
    const f = this.focus();
    let me = null;
    if (f) { me = P(f.x, f.z); taken.push([me[0] - 14, me[1] - 14, me[0] + 14, me[1] + 14]); }
    // location pins
    const R = 8.5;
    const locs = g.locations.list.map((l) => ({ l, p: P(l.doorX ?? l.x, l.doorZ ?? l.z) })).filter((o) => onScreen(o.p[0], o.p[1]));
    for (const { p: [sx, sy] } of locs) taken.push([sx - R, sy - R, sx + R, sy + R]);
    // markers (quests, heists, waypoint) and friends come before place names
    const marks = [...(g.world.markers ?? [])].filter(([, m]) => m && Number.isFinite(m.x));
    marks.sort((a, b) => (a[0] === 'waypoint' ? 1 : 0) - (b[0] === 'waypoint' ? 1 : 0) || (a[1].tracked ? 1 : 0) - (b[1].tracked ? 1 : 0));
    // district names: small caps in the district's colour, nudged into the nearest gap between the pins
    {
      const fs = Math.round(Math.max(13, Math.min(20, 11 + V.k * 5)));
      const font = `${fs}px "Special Elite", monospace`;
      x.save();
      try { x.letterSpacing = '2px'; } catch { /* older canvas */ }
      for (const [id, [wx, wz]] of Object.entries(this._distLabels())) {
        const D = DISTRICTS[id]; if (!D) continue;
        const [ax, ay] = P(wx, wz);
        if (!onScreen(ax, ay, 80)) continue;
        const t = D.name.toUpperCase();
        const spot = LABEL_TRIES.find(([dx, dy]) => label(t, ax + dx, ay + dy, '', font, fs + 4, true));
        if (!spot) continue; // too crowded at this zoom: the HUD already names the district; zoom in to see it
        x.globalAlpha = 0.9;
        label(t, ax + spot[0], ay + spot[1], D.palette.accent, font, fs + 4);
        x.globalAlpha = 1;
      }
      x.restore();
    }
    for (const { l, p: [sx, sy] } of locs) {
      const [ch, col] = TYPE_ICON[l.type] ?? ['•', '#ccc'];
      x.fillStyle = 'rgba(0,0,0,0.85)'; x.beginPath(); x.arc(sx, sy, R, 0, 7); x.fill();
      x.strokeStyle = col; x.lineWidth = 1.5; x.stroke();
      x.font = 'bold 11px "Barlow Condensed", sans-serif'; x.fillStyle = col; x.fillText(ch, sx, sy + 0.5);
    }
    const pinsDrawn = [];
    for (const [id, m] of marks) {
      let [sx, sy] = P(m.x, m.z);
      const off = !onScreen(sx, sy, -12);
      if (off) { sx = Math.max(14, Math.min(V.W - 14, sx)); sy = Math.max(14, Math.min(V.H - 14, sy)); }
      drawMarker(x, sx, sy, m, id === 'waypoint', off, 1.5);
      taken.push([sx - 10, sy - 10, sx + 10, sy + 10]);
      pinsDrawn.push([id, m, sx, sy, off]);
    }
    for (const rp of g.net?.remotePlayers?.values?.() ?? []) {
      if (!rp?.pos) continue;
      let [sx, sy] = P(rp.pos.x, rp.pos.z);
      const off = !onScreen(sx, sy, -10);
      if (off) { sx = Math.max(10, Math.min(V.W - 10, sx)); sy = Math.max(10, Math.min(V.H - 10, sy)); }
      x.fillStyle = '#40e0ff'; x.strokeStyle = '#000'; x.lineWidth = 2;
      x.beginPath(); x.arc(sx, sy, 6, 0, 7); x.fill(); x.stroke();
      taken.push([sx - 7, sy - 7, sx + 7, sy + 7]);
      if (rp.name) label(String(rp.name), sx, sy - 15, '#40e0ff', 'bold 14px "Barlow Condensed", sans-serif');
    }
    // marker labels (tracked / waypoint first), then place names where they fit
    for (const [id, m, sx, sy, off] of pinsDrawn.reverse()) {
      if (!m.label || off) continue;
      if (id !== 'waypoint' && !m.tracked && V.k < 0.9) continue;
      label(String(m.label), sx, sy - 18, m.color ?? '#fff', '14px "Barlow Condensed", sans-serif');
    }
    const nameFont = `${V.k >= 1.2 ? 15 : 13}px "Barlow Condensed", sans-serif`;
    for (const { l, p: [sx, sy] } of locs) label(l.name, sx, sy + R + 9, '#e8dcc0', nameFont);
    // the player: arrow with a halo; pinned to the edge (dimmed) when panned off-screen
    if (me) {
      let [sx, sy] = me;
      const off = !onScreen(sx, sy, -14);
      if (off) { sx = Math.max(16, Math.min(V.W - 16, sx)); sy = Math.max(16, Math.min(V.H - 16, sy)); }
      const fac = g.player.vehicle ? (g.player.vehicle.group?.rotation?.y ?? g.player.facing) : g.player.facing;
      x.save(); x.translate(sx, sy);
      x.globalAlpha = off ? 0.6 : 1;
      x.fillStyle = 'rgba(240,232,208,0.16)'; x.beginPath(); x.arc(0, 0, 15, 0, 7); x.fill();
      x.strokeStyle = 'rgba(240,232,208,0.55)'; x.lineWidth = 1.5; x.stroke();
      x.rotate(Math.atan2(Math.cos(fac), Math.sin(fac)));
      x.fillStyle = '#f0e8d0'; x.strokeStyle = '#000'; x.lineWidth = 2.2;
      const s = 10;
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
