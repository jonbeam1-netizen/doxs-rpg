import * as THREE from 'three';
import { BOARDS, BOARD_ORDER, createBoardMesh } from './boards.js';
import { shopPanel, injectStyles } from '../systems/ui-kit.js';
import { pick, fmtMoney, esc } from '../core/util.js';

// Skidmark Kev, the skate rat outside Threads & Dreads.
// Unlock flow (state.p.skate.quest.stage):
//   none  -> (level >= 3, accept) -> hunt   marker 'skate:quest' + beacon in Gutterside/Rustyards
//   hunt  -> (walk up)            -> brawl with the Board Thieves
//   brawl won                     -> won    marker moves to Kev
//   won   -> (talk to Kev)        -> done   free Warped Plank, shop unlocked (state.p.skate.unlocked)
export const VENDOR_ID = 'skate_vendor';
const NAME = 'Skidmark Kev';
const MIN_LEVEL = 3;

const BRUSH_OFFS = [
  '"Bro. BRO. You\'ve got level-one energy. You smell like a participation trophy. Come back when the streets know your name."',
  '"Nah. I don\'t sell boards to tourists. Go get punched a few times. Get some life experience. Get some scabs."',
  '"Are those... clean shoes? Ew. Get away from my aura, poser. Come back when you\'ve lived a little."',
  '"I can smell the training wheels on you from here. Scram, fresh meat."',
];

const GREETINGS = [
  '"Sup, shredder. Buying, or just loitering? Loitering is free. I\'m loitering right now. Professionally."',
  '"Yo. You still alive? Sick. Most of my customers end up as a cautionary tale on a lamppost."',
  '"Welcome to Kev\'s Boards. Est. whenever the cops stop asking. All sales final, all injuries yours."',
  '"Ayyy, it\'s my favorite customer. Don\'t tell the others. I don\'t have others."',
];

const TIPS = `<b>G</b> hop on / off the board (on foot).<br><b>W</b> push · <b>Shift+W</b> push harder · <b>S</b> brake (with <b>A</b>/<b>D</b> = powerslide)<br>
<b>A</b>/<b>D</b> carve · <b>Space</b> ollie · <b>Click</b> kickflip (from the ground or mid-air)<br>
<b>Click + D</b> heelflip · <b>Click + S</b> pop shove-it · <b>Click + A</b> varial flip<br>
<em>"Land with your feet on the bolts, not your face on the curb. Hit a wall going fast and you'll eat it. Ask me how I know. Actually don't."</em>`;

export class SkateVendor {
  constructor(game, skate) {
    this.game = game;
    this.skate = skate; // controller (index.js)
    this.npc = null;
    this.beacon = null;
    this.fighting = false;
  }

  get data() { return this.skate.data(); }

  // ------------------------------------------------------------ placement
  spawn() {
    const g = this.game;
    if (!g.npcs?.spawn) return;
    const existing = g.npcs.get?.(VENDOR_ID);
    if (existing && !existing.removed) { this.npc = existing; return; }
    const pt = this._spot();
    if (!pt) return;
    this.npc = g.npcs.spawn({
      id: VENDOR_ID, kind: 'static', name: NAME, x: pt.x, z: pt.z, facing: pt.facing,
      color: 0x1d2a22, hat: 'cap', hatColor: 0xa3201a, wander: false, persistent: true,
      talkPrompt: `Talk to ${NAME} <small>(skate rat)</small>`,
      onTalk: () => this.talk(),
    });
    // A board leaning on his leg so he reads as "the skate guy" from across the street.
    if (this.npc && !this.npc.group.getObjectByName('skateboard')) {
      const b = createBoardMesh('street');
      b.position.set(0.38, 0.4, 0.12);
      b.rotation.set(-Math.PI / 2 + 0.22, 0.3, 0);
      b.userData.blob.visible = false;
      this.npc.group.add(b);
    }
  }

  _spot() {
    const g = this.game;
    const loc = g.locations?.get?.('threads');
    let dx, dz, cx, cz;
    if (loc) {
      cx = loc.doorX ?? loc.x; cz = loc.doorZ ?? loc.z;
      dx = cx - loc.x; dz = cz - loc.z;
    } else {
      const sp = g.world?.spawn || { x: 0, z: 0 };
      cx = sp.x + 6; cz = sp.z + 6; dx = 1; dz = 0;
    }
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;      // out of the door, toward the street
    const tx = -nz, tz = nx;                 // along the sidewalk
    for (const [o, s] of [[2.2, 4], [2.2, -4], [3, 5], [3, -5], [2, 6.5], [3.5, 3]]) {
      const x = cx + nx * o + tx * s, z = cz + nz * o + tz * s;
      if (g.physics.pointBlocked(x, z)) continue;
      const r = g.physics.resolveCircle(x, z, 0.6);
      if (Math.hypot(r.x - x, r.z - z) > 0.3) continue;
      return { x, z, facing: Math.atan2(nx, nz) };
    }
    return { x: cx + nx * 2.5, z: cz + nz * 2.5, facing: Math.atan2(nx, nz) };
  }

  // ------------------------------------------------------------ dialog
  async talk() {
    const g = this.game, d = this.data, p = g.state.p;
    const ui = g.ui;
    const q = d.quest;
    const speaker = NAME;
    if (!d.unlocked && q.stage === 'won') return this._reward();
    if (!d.unlocked && (p.level || 1) < MIN_LEVEL) {
      await ui.dialog({ title: "Kev's Boards (a blanket on the sidewalk)", speaker,
        html: `${pick(BRUSH_OFFS)}<div class="ui-muted" style="margin-top:8px">Kev won't deal with you until you're <b>level ${MIN_LEVEL}</b>.</div>`,
        options: [{ label: 'Slink away' }] });
      return;
    }
    if (!d.unlocked && q.stage === 'none') {
      if (!q.district) q.district = pick(['gutterside', 'rustyards']);
      const i = await ui.dialog({ title: "Kev's Boards", speaker,
        html: `"Okay... okay. You've been around. You've got that 'slept in a dumpster at least twice' glow. Respect."<br><br>
          "Listen. Some goons jacked my personal board last night. My <b>BABY</b>. Seven plies of pure love, and they're probably using her as a cheese board right now. They hang out down in <b>${esc(this._districtName(q))}</b>."<br><br>
          "Get her back and I'll hook you up. Open the shop to ya and everything."`,
        options: [{ label: "I'll get your board back.", hint: 'Starts "Board Thieves"' }, { label: 'Sounds like a you problem.' }] });
      if (i === 0) this.startQuest();
      return;
    }
    if (!d.unlocked && q.stage === 'hunt') {
      await ui.dialog({ title: "Kev's Boards", speaker,
        html: `"Did you get her? No? Then why are you talking to me. They're in <b>${esc(this._districtName(q))}</b>. Check your map — big glowy thing. Can't miss it. Even you."`,
        options: [{ label: 'On it.' }] });
      return;
    }
    // Shop is open.
    for (let guard = 0; guard < 20; guard++) {
      const i = await ui.dialog({ title: "Kev's Boards", speaker,
        html: pick(GREETINGS),
        options: [{ label: 'Browse boards', hint: `${d.owned.length}/${BOARD_ORDER.length} owned` }, { label: 'Any tips?' }, { label: 'Later, Kev.' }] });
      if (i === 0) { await this.openShop(); return; }
      if (i === 1) { await ui.dialog({ title: "Kev's Tips", speaker, html: TIPS, options: [{ label: 'Rad.' }] }); continue; }
      return;
    }
  }

  _districtName(q) {
    return ({ gutterside: 'Gutterside', rustyards: 'the Rustyards' })[q.district] || 'the bad part of town (worse than here)';
  }

  async _reward() {
    const g = this.game, d = this.data;
    await g.ui.dialog({ title: "Kev's Boards", speaker: NAME,
      html: `"MY BABY!" <em>He sniffs the deck. Deeply. For too long.</em> "...Yeah. That's her. Smells like victory and a little bit like pee."<br><br>
        "Here — take this plank I had lyin' around. It's garbage, but it rolls. And the shop's open to you now. Don't tell nobody I'm nice."`,
      options: [{ label: 'Take the plank' }] });
    if (!d.owned.includes('plank')) d.owned.push('plank');
    d.board = d.board || 'plank';
    d.unlocked = true;
    d.quest.stage = 'done';
    this.refreshQuestVisuals();
    g.state.changed('skate');
    g.ui.toast('Got the <b>Warped Plank</b>! Press <kbd>G</kbd> to ride it.', 'good', 5000);
    g.ui.bigText('BOARD UNLOCKED', 'Press G to skate. Click to kickflip.', 2800, 'win');
    g.bus.emit('skate:unlocked', {});
  }

  // ------------------------------------------------------------ shop
  openShop() {
    const g = this.game;
    injectStyles();
    const mph = (v) => Math.round(v * 2.237);
    const stars = (v, lo, hi) => { const n = Math.max(1, Math.min(5, Math.round(1 + ((v - lo) / (hi - lo)) * 4))); return '★'.repeat(n) + '☆'.repeat(5 - n); };
    return shopPanel(g, {
      title: "Kev's Boards",
      speaker: NAME,
      intro: '"Every board is pre-owned. By who? Don\'t worry about it."',
      width: 780,
      sections: () => {
        const d = this.data;
        return [{
          name: 'Decks',
          products: BOARD_ORDER.map((id) => {
            const b = BOARDS[id];
            const owned = d.owned.includes(id);
            const riding = d.board === id;
            return {
              key: id, name: b.name, price: id === 'plank' ? null : b.price, priceLabel: id === 'plank' ? 'Reward' : undefined,
              desc: b.desc,
              tag: `Top ${mph(b.top)} mph · Pop ${stars(b.pop, 5, 6.8)} · Flip ${stars(-b.flip, -0.6, -0.36)} · Carve ${stars(b.turn, 1.7, 2.7)}${b.motor ? ' · Motor + battery' : ''}`,
              owned,
              ownedLabel: riding ? 'Your board' : 'Owned',
              ownedAction: owned && !riding ? 'Use this one' : undefined,
              onOwned: () => { this.skate.selectBoard(id); },
              disabled: id === 'plank' && !owned,
              btn: id === 'plank' ? 'Reward only' : 'Buy',
              buy: () => {
                if (id === 'plank') return false;
                if (!g.state.spend(b.price, 'skateboard')) return false;
                if (!d.owned.includes(id)) d.owned.push(id);
                this.skate.selectBoard(id);
                g.state.changed('skate');
                g.ui.toast(`Bought the <b>${b.name}</b> for ${fmtMoney(b.price)}. Kev kisses the cash.`, 'money', 3500);
                return true;
              },
            };
          }),
        }];
      },
      footer: 'Press <kbd>G</kbd> on the street to ride your selected board.',
    });
  }

  // ------------------------------------------------------------ quest
  startQuest() {
    const g = this.game, d = this.data;
    const q = d.quest;
    const district = q.district || pick(['gutterside', 'rustyards']);
    let pt = null;
    const from = this.npc?.pos || g.player.pos;
    for (let i = 0; i < 25; i++) {
      const c = g.world?.randomSidewalkPoint?.(district);
      if (!c) break;
      pt = c;
      if (Math.hypot(c.x - from.x, c.z - from.z) > 40) break;
    }
    if (!pt) { const sp = g.world?.spawn || { x: 0, z: 0 }; pt = { x: sp.x + 30, z: sp.z + 30 }; }
    q.stage = 'hunt'; q.district = district; q.x = Math.round(pt.x * 10) / 10; q.z = Math.round(pt.z * 10) / 10;
    g.state.changed('skate');
    this.refreshQuestVisuals();
    g.ui.toast(`New job: <b>Board Thieves</b> — get Kev's board back from the goons in ${this._districtName(q)}. (Marked on your map.)`, 'info', 5500);
  }

  refreshQuestVisuals() {
    const g = this.game, q = this.data.quest;
    const markers = g.world ? (g.world.markers instanceof Map ? g.world.markers : (g.world.markers = new Map())) : null;
    this._clearBeacon();
    if (q.stage === 'hunt' && q.x != null) {
      markers?.set('skate:quest', { x: q.x, z: q.z, color: '#3ad0c0', label: 'Board Thieves', icon: '!' });
      this._placeBeacon(q.x, q.z);
    } else if (q.stage === 'won' && this.npc) {
      markers?.set('skate:quest', { x: this.npc.pos.x, z: this.npc.pos.z, color: '#3ad0c0', label: 'Return the board to Kev', icon: '!' });
    } else markers?.delete('skate:quest');
  }

  _placeBeacon(x, z) {
    const g = this.game;
    const grp = new THREE.Group();
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 50, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x3ad0c0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    col.position.y = 25;
    grp.add(col);
    // Kev's stolen board, upside down on the pavement.
    const b = createBoardMesh('pro');
    b.rotation.set(0, 0.7, Math.PI);
    b.position.y = 0.18;
    b.userData.blob.visible = false;
    grp.add(b);
    grp.position.set(x, 0, z);
    g.scene.add(grp);
    this.beacon = grp;
  }

  _clearBeacon() {
    if (!this.beacon) return;
    this.beacon.removeFromParent();
    this.beacon.children[0]?.geometry?.dispose();
    this.beacon.children[0]?.material?.dispose();
    this.beacon = null;
  }

  update(dt) {
    const g = this.game, q = this.data.quest, pl = g.player;
    if (this.beacon) this.beacon.children[0].material.opacity = 0.16 + 0.08 * Math.sin(g.elapsed * 3);
    if (q.stage !== 'hunt' || this.fighting || q.x == null) return;
    if (!pl || pl.dead || pl.vehicle || g.controlsLocked) return;
    if (Math.hypot(pl.pos.x - q.x, pl.pos.z - q.z) > 7) return;
    if (!g.combat?.startBrawl) return;
    if (g.combat.inBrawl?.()) return;
    this.fighting = true;
    const count = (g.state.p.level || 1) >= 6 ? 3 : 2;
    try {
      g.combat.startBrawl({
        x: q.x, z: q.z, count, kind: 'thug', label: 'Board Thieves',
        onWin: () => this._won(),
        onLose: () => this._lost(),
      });
      g.npcs?.say?.(pl.group, pick(['Hey! That\'s Kev\'s board!', 'Drop the deck, dorks.', 'That board has a FAMILY.']), { ttl: 2 });
    } catch (e) { console.error('[skate] brawl failed', e); this.fighting = false; }
  }

  _won() {
    const g = this.game, q = this.data.quest;
    this.fighting = false;
    if (q.stage !== 'hunt') return;
    q.stage = 'won';
    g.state.changed('skate');
    this.refreshQuestVisuals();
    g.ui.toast('You pried Kev\'s board out of a goon\'s sweaty hands. It\'s sticky. Take it back to <b>Skidmark Kev</b> by Threads & Dreads.', 'good', 6000);
  }

  _lost() {
    this.fighting = false;
    this.game.ui.toast('The Board Thieves kept the board. And a bit of your dignity. Go back and try again.', 'bad', 4500);
  }

  reset() {
    this.fighting = false;
    this.refreshQuestVisuals();
  }
}
