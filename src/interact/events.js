import * as THREE from 'three';
import { makeProp, softDot } from './meshes.js';
import { createStickman } from '../entities/stickman.js';

// Random street events that pop up near the player every few in-game hours:
//   fight     — two idiots brawling: bet on one or jump in (combat.startBrawl)
//   carfire   — a car jumped the curb and caught fire: stomp it out, roast a dog, loot it
//   flashmob  — six people dancing in sync for no reason: join or "pass the hat"
//   mugging   — stop it (karma) or help (cash, heat)
// Events are local to each player (cosmetic stickmen, not networked NPCs).

const KINDS = ['fight', 'carfire', 'flashmob', 'mugging'];
const NAMES_A = ['Big Tony', 'Meaty Mike', 'Hambone', 'Large Marge', 'Chonk Norris'];
const NAMES_B = ['Lil\' Steve', 'Twiggy Ray', 'Skinny Pete', 'Noodle Arms Nate', 'Wiry Wanda'];
const FIGHT_BARKS = ['SAY THAT AGAIN!', 'You scratched my Civic!', 'That\'s for my mama!', 'I\'ll bite, I swear!', 'Hold my beer! HOLD IT!'];
const CROWD_BARKS = ['WORLDSTAR!', 'Hit him in the dignity!', 'Oooooh!', 'I got $5 on the little guy!'];
const MOB_BARKS = ['*synchronized hip thrust*', 'FIVE SIX SEVEN EIGHT!', 'Smile! We\'re going viral!', '*jazz hands*'];

export function installEvents(game, I) {
  const st = game.state, w = game.world;
  const { fmt, pick, chance, randInt } = I;
  let ev = null;           // active event
  let lastHour = -99;      // game hour (total/60) of the last event
  let evSeq = 0;

  // ------------------------------------------------------------ particles (fire / smoke)
  function particles(n, color, size, blending, opacity) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, map: softDot(), transparent: true, opacity, depthWrite: false, blending }));
    pts.frustumCulled = false;
    pts.userData.seeds = Array.from({ length: n }, () => [Math.random(), (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 3.2, 0.6 + Math.random() * 0.6]);
    return pts;
  }
  function flow(pts, t, height, spread) {
    const pos = pts.geometry.attributes.position, S = pts.userData.seeds;
    for (let k = 0; k < S.length; k++) {
      const [ph, sx, sz, sp] = S[k];
      const a = (t * 0.7 * sp + ph) % 1;
      pos.setXYZ(k, sx * (1 - a * 0.5) + Math.sin(t * 3 + k) * 0.1 * a * spread, 1.0 + a * height, sz * (1 - a * 0.6));
    }
    pos.needsUpdate = true;
  }

  // ------------------------------------------------------------ helpers
  function man(opts, x, z, facing) {
    const m = createStickman(opts);
    m.group.position.set(x, 0, z);
    m.group.rotation.y = facing;
    return m;
  }
  function spotNear() {
    const pp = I.pp();
    for (let i = 0; i < 12; i++) {
      const s = w.sidewalkPointNear?.(pp.x, pp.z, 16, 34);
      if (!s) continue;
      if (game.locations.list.some((l) => Math.hypot((l.doorX ?? l.x) - s.x, (l.doorZ ?? l.z) - s.z) < 7)) continue;
      if (I.objects.some((o) => o.kind !== 'rat' && o.kind !== 'tag' && Math.hypot(o.x - s.x, o.z - s.z) < 5)) continue;
      let blocked = false;
      for (const [ox, oz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (game.physics.pointBlocked(s.x + ox, s.z + oz)) blocked = true;
      if (blocked) continue;
      return s;
    }
    return null;
  }
  function end(delay = 0, msg = null) {
    const e = ev;
    if (!e) return;
    e.over = true;
    if (msg) I.toast(msg, 'info', 2400);
    const kill = () => {
      if (e.killed) return; e.killed = true;
      I.remove(e.o);
      for (const m of e.men) { try { m.dispose(); } catch { /* ignore */ } }
      for (const p of e.fx || []) { p.geometry.dispose(); p.material.dispose(); }
      if (ev === e) ev = null;
      w.markers?.delete?.('ix:event');
    };
    w.markers?.delete?.('ix:event');
    if (delay > 0) setTimeout(kill, delay * 1000); else kill();
  }

  // ------------------------------------------------------------ spawners
  function spawn(kind, at) {
    if (ev) end();
    const s = at || spotNear();
    if (!s) return null;
    const pp = I.pp();
    const face = Math.atan2(pp.x - s.x, pp.z - s.z); // toward the player
    const g = new THREE.Group();
    const e = { kind, men: [], t: 0, life: 150, x: s.x, z: s.z, barkT: 2 };
    const local = (lx, lz) => [lx * Math.cos(face) + lz * Math.sin(face), -lx * Math.sin(face) + lz * Math.cos(face)];
    const add = (opts, lx, lz, f) => { const [x, z] = local(lx, lz); const m = man(opts, x, z, face + f); g.add(m.group); e.men.push(m); return m; };
    let prompt = '', label = '', solid = null;
    if (kind === 'fight') {
      e.names = [pick(NAMES_A), pick(NAMES_B)];
      e.a = add({ color: '#5a2a1a', build: 'chonky', hat: 'beanie', hatColor: '#2a2a2a' }, -0.8, 0, Math.PI / 2);
      e.b = add({ color: '#2a4a5a', build: 'scrawny', hat: 'cap', hatColor: '#c8a020' }, 0.8, 0, -Math.PI / 2);
      e.crowd = [add({ color: '#4a4a3a' }, -1.4, -1.8, 0.4), add({ color: '#3a2a3a', hat: 'fedora', hatColor: '#222' }, 1.5, -1.6, -0.5)];
      prompt = 'Street fight! <small>bet or jump in</small>'; label = 'Street fight';
      I.toast('You hear yelling nearby. Sounds like a <b>street fight</b>.', 'info', 3000);
    } else if (kind === 'carfire') {
      const car = makeProp('burntcar'); car.rotation.y = Math.PI / 2; g.add(car);
      e.fire = particles(46, 0xff7a20, 0.42, THREE.AdditiveBlending, 0.9);
      e.smoke = particles(30, 0x2a2622, 1.2, THREE.NormalBlending, 0.45);
      g.add(e.fire, e.smoke); e.fx = [e.fire, e.smoke];
      e.fire.rotation.y = e.smoke.rotation.y = Math.PI / 2;
      solid = [4.2, 2.0, 1.6];
      prompt = 'Burning car'; label = 'Car fire';
      I.toast('Something\'s burning. Smells like tires and bad decisions: a <b>car fire</b>.', 'info', 3000);
    } else if (kind === 'flashmob') {
      const cols = ['#c43a1a', '#2a6ab0', '#c8a020', '#3a8a4a', '#8a3a9a', '#e0e0d0'];
      e.dancers = [];
      for (let i = 0; i < 6; i++) e.dancers.push(add({ color: cols[i], hat: i % 2 ? 'cap' : null, hatColor: '#111' }, (i % 3 - 1) * 1.3, (i < 3 ? 0 : -1.4), 0));
      prompt = 'Flash mob! <small>join in</small>'; label = 'Flash mob';
      I.toast('Music starts out of nowhere. Oh no. It\'s a <b>flash mob</b>.', 'info', 3000);
    } else if (kind === 'mugging') {
      e.mugger = add({ color: '#1a1a1a', hat: 'beanie', hatColor: '#111' }, -0.7, 0, Math.PI / 2);
      e.victim = add({ color: '#8a8270', hat: 'fedora', hatColor: '#4a3a2a', build: 'shrimp' }, 0.7, 0, -Math.PI / 2);
      prompt = 'Mugging in progress'; label = 'Mugging';
      I.toast('"HELP! Somebody!" A <b>mugging</b>, right up the street.', 'bad', 3000);
    }
    ev = e;
    e.o = I.add({ id: 'event' + (++evSeq), kind: 'event', x: s.x, z: s.z, facing: 0, group: g, animated: true, cull: 140, useOffset: 0, radius: kind === 'flashmob' ? 4 : 3.4, solid, prompt, use: () => interact(e), enabled: () => !e.over && !e.busy });
    w.markers?.set?.('ix:event', { x: s.x, z: s.z, icon: '!', color: '#ff9a40', label });
    return e;
  }

  // ------------------------------------------------------------ interactions
  async function interact(e) {
    if (e.over || e.busy) return;
    e.busy = true;
    try {
      if (e.kind === 'fight') await fightMenu(e);
      else if (e.kind === 'carfire') await fireMenu(e);
      else if (e.kind === 'flashmob') await mobMenu(e);
      else if (e.kind === 'mugging') await mugMenu(e);
    } finally { e.busy = false; }
  }
  const done = (e, outcome) => game.bus.emit('interact:event', { kind: e.kind, outcome });

  async function fightMenu(e) {
    const [A, B] = e.names;
    await I.choose({
      title: 'Street Fight', html: `<b>${A}</b> (built like a fridge) vs <b>${B}</b> (built like a coat hanger). A small crowd has formed. Phones are out.`,
      options: [
        { label: `Bet on ${A}`, hint: 'Favorite · pays 1.5×', disabled: st.p.money < 5, run: () => bet(e, 0) },
        { label: `Bet on ${B}`, hint: 'Underdog · pays 3×', disabled: st.p.money < 5, run: () => bet(e, 1) },
        { label: 'Jump in', hint: 'Fight both. Win their lunch money.', run: () => {
          const x = e.x, z = e.z;
          end(0);
          game.combat?.startBrawl?.({ x, z, count: 2, kind: 'drunk', label: 'You jumped into a street fight', onWin: () => { const n = randInt(25, 70); st.addMoney(n, 'street fight'); I.toast(`Both idiots down. Their wallets agree to come with you: ${fmt(n)}.`, 'money', 3000); } });
          done(e, 'joined');
        } },
      ],
    });
  }
  async function bet(e, pickIdx) {
    const max = Math.min(st.p.money, 200);
    const amt = await game.ui.promptNumber({ title: 'Your bet', text: `On ${e.names[pickIdx]}. A guy in a fedora writes it on his hand.`, max, min: 5, initial: Math.min(20, max) });
    if (!amt || amt < 5 || !st.canAfford(amt) || e.over) return;
    st.addMoney(-amt, 'street bet');
    const winner = Math.random() < 0.62 ? 0 : 1;
    e.resolve = { t: 4.5, winner, pickIdx, amt };
    I.toast(`${fmt(amt)} on ${e.names[pickIdx]}. Here we go...`, 'info', 2200);
  }
  function resolveFight(e) {
    const { winner, pickIdx, amt } = e.resolve;
    e.resolve = null;
    (winner === 0 ? e.b : e.a).setDead(true);
    if (winner === pickIdx) {
      const pay = Math.round(amt * (pickIdx === 0 ? 1.5 : 3));
      st.addMoney(pay, 'street bet'); I.sfx('win');
      I.toast(`${e.names[winner]} wins! You collect ${fmt(pay)}. Blood money, but money.`, 'money', 3200);
      done(e, 'bet-won');
    } else {
      I.sfx('lose');
      I.toast(`${e.names[winner]} wins. Your ${fmt(amt)} is now the fedora guy's ${fmt(amt)}.`, 'bad', 3200);
      done(e, 'bet-lost');
    }
    I.say(e.crowd[0].group, pick(['WORLDSTAAAR!', 'I KNEW IT!', 'Rematch! REMATCH!']), { ttl: 2.4 });
    end(5);
  }

  async function fireMenu(e) {
    await I.choose({
      title: 'Car Fire', html: '<i>A sedan jumped the curb and is now enthusiastically on fire. Nobody\'s inside. Probably.</i>',
      options: [
        { label: 'Stomp it out', hint: '-10 energy · karma', run: () => {
          if (!st.useEnergy(10)) return;
          if (chance(0.7)) {
            st.addStat('karma', 2, 'car fire');
            const tip = chance(0.5) ? randInt(10, 40) : 0;
            if (tip) st.addMoney(tip, 'car fire');
            I.toast(`You put it out with your feet and a lot of yelling. Hero! ${tip ? `The owner tips you ${fmt(tip)}.` : 'Nobody thanks you. Classic.'}`, 'good', 3400);
            done(e, 'extinguished'); end(4);
            e.fire.visible = false;
          } else {
            st.damage(8, 'car fire');
            I.toast('Your shoe catches fire. You do the stop-drop-roll. Very dignified. -8 HP', 'bad', 3000);
          }
        } },
        { label: 'Roast a hot dog on it', hint: '+12 energy', disabled: I.usedToday('roast'), run: () => {
          I.markDay('roast'); st.addStat('energy', 12); I.sfx('gulp');
          I.toast('Smoky. Notes of brake fluid and upholstery. Honestly? Delicious.', 'good', 3000);
          done(e, 'roasted');
        } },
        { label: 'Loot the glovebox', hint: 'Cash. Burns. Bad karma.', disabled: !!e.looted, run: () => {
          e.looted = true;
          st.addStat('karma', -2, 'car fire');
          I.crime('steal');
          if (chance(0.3)) { st.damage(10, 'car fire'); I.toast('The glovebox is 400 degrees. So is your hand now. -10 HP', 'bad', 3000); }
          else { const n = randInt(15, 60); st.addMoney(n, 'glovebox'); I.toast(`${fmt(n)}, a parking ticket and a half-melted CD of smooth jazz. Worth it.`, 'money', 3200); }
          done(e, 'looted');
        } },
      ],
    });
  }

  async function mobMenu(e) {
    await I.choose({
      title: 'Flash Mob', html: '<i>Six strangers are dancing in perfect sync to a song coming from nowhere. One of them winks at you. This is a cry for help.</i>',
      options: [
        { label: 'Join the dance', hint: '-6 energy · charm check', run: () => {
          if (!st.useEnergy(6)) return;
          if (Math.random() < 0.3 + st.p.cha * 0.01) { st.addStat('cha', 0.5, 'flash mob'); I.toast('You nail the choreography. Someone filmed it. You\'re trending (locally).', 'good', 3200); done(e, 'nailed'); }
          else { I.toast('You\'re half a beat behind the whole time. Everyone noticed. The video has 2 million views.', 'info', 3400); done(e, 'flopped'); }
          e.joined = 5;
        } },
        { label: 'Pass the hat', hint: 'Pretend you organized this', disabled: !!e.hatted, run: () => {
          e.hatted = true;
          const n = randInt(5, 22); st.addMoney(n, 'flash mob'); st.addStat('karma', -1, 'flash mob');
          I.toast(`"Support the arts!" You collect ${fmt(n)} for a dance troupe you've never met.`, 'money', 3000);
          done(e, 'hustled');
        } },
      ],
    });
  }

  async function mugMenu(e) {
    await I.choose({
      title: 'Mugging', html: '<i>A guy in a ski mask is shaking down a tiny man in a fedora. "WALLET. NOW." The tiny man is crying into his own tie.</i>',
      options: [
        { label: 'Stop the mugger', hint: 'Fight · good karma', run: () => {
          const x = e.x, z = e.z, victim = e.victim;
          e.mugger.group.visible = false;
          game.combat?.startBrawl?.({
            x, z, count: 1, kind: 'thug', label: 'Stop the mugger!',
            onWin: () => { st.addStat('karma', 3, 'mugging'); const n = randInt(15, 50); st.addMoney(n, 'reward'); I.toast(`The tiny man hugs your leg and gives you ${fmt(n)}. "My hero!"`, 'good', 3200); I.bump('heroics'); done(e, 'stopped'); },
            onLose: () => { done(e, 'failed'); },
          });
          I.say(victim.group, 'My hero!! ...probably!', { ttl: 2.2 });
          end(6);
        } },
        { label: 'Help rob him', hint: 'Cash · bad karma · heat', run: () => {
          const n = randInt(30, 90);
          st.addMoney(n, 'mugging'); st.addStat('karma', -4, 'mugging');
          I.crime('assault');
          I.say(e.mugger.group, 'Uh... thanks, partner?', { ttl: 2.2 });
          I.toast(`You take a cut: ${fmt(n)}. The tiny man's tears are worth nothing. You checked.`, 'money', 3200);
          done(e, 'joined'); end(3);
        } },
        { label: 'Film it on your phone', run: () => { I.toast('You get great footage. Nobody is helped. Very modern.', 'info', 2800); st.addStat('karma', -1, 'mugging'); done(e, 'filmed'); end(3); } },
      ],
    });
  }

  // ------------------------------------------------------------ animation & lifetime
  I.hooks.frame.push((dt) => {
    const e = ev;
    if (!e) return;
    e.t += dt;
    const pp = I.pp();
    const far = Math.hypot(pp.x - e.x, pp.z - e.z) > 130;
    if (!e.over && !e.busy && (e.t > e.life || far)) { end(0); return; }
    if (!e.o.group.visible) return;
    const t = game.elapsed;
    for (const m of e.men) if (!m.dead) m.animate(dt, 0);
    if (e.kind === 'fight') {
      const speed = e.resolve ? 2.2 : 1;
      e.ph = (e.ph || 0) + dt * speed;
      if (e.ph > 0.7) { e.ph = 0; (Math.random() < 0.5 ? e.a : e.b).punch(); if (e.resolve || chance(0.3)) I.hitSfx('punch'); }
      for (const m of [e.a, e.b]) if (!m.dead) m.group.position.y = Math.abs(Math.sin(t * 6)) * 0.06;
      for (const c of e.crowd) { const P2 = c.parts; P2.armR.upper.rotation.set(-2.4 + Math.sin(t * 8) * 0.4, 0, -0.2); }
      if (e.resolve) { e.resolve.t -= dt; if (e.resolve.t <= 0) resolveFight(e); }
    } else if (e.kind === 'carfire') {
      if (e.fire.visible) flow(e.fire, t, 1.6, 1);
      flow(e.smoke, t * 0.6, 5, 3);
    } else if (e.kind === 'flashmob') {
      const k = Math.sin(t * 6), j = (e.joined = Math.max(0, (e.joined || 0) - dt));
      for (const d of e.dancers) {
        const P2 = d.parts;
        P2.armL.upper.rotation.set(-1.6 + k * 1.2, 0, 0.6); P2.armR.upper.rotation.set(-1.6 - k * 1.2, 0, -0.6);
        P2.armL.lower.rotation.x = P2.armR.lower.rotation.x = -0.4;
        P2.legL.upper.rotation.x = Math.max(0, k) * 0.5; P2.legR.upper.rotation.x = Math.max(0, -k) * 0.5;
        d.group.position.y = Math.abs(Math.sin(t * 6)) * 0.12;
        P2.torso.rotation.y = Math.sin(t * 3) * 0.4;
      }
      if (j > 0 && game.player.model?.parts) { const P2 = game.player.model.parts; P2.armL.upper.rotation.set(-1.6 + Math.sin(t * 6 + 0.4) * 1.2, 0, 0.6); P2.armR.upper.rotation.set(-1.6 - Math.sin(t * 6 + 0.4) * 1.2, 0, -0.6); }
    } else if (e.kind === 'mugging') {
      const M = e.mugger.parts, V = e.victim.parts;
      M.armR.upper.rotation.set(-Math.PI / 2 + Math.sin(t * 5) * 0.1, 0, -0.05); M.armR.lower.rotation.x = 0;
      V.armL.upper.rotation.set(-2.9, 0, 0.3); V.armR.upper.rotation.set(-2.9, 0, -0.3);
      e.victim.group.position.y = Math.abs(Math.sin(t * 14)) * 0.02; // trembling
    }
    e.barkT -= dt;
    if (e.barkT <= 0 && !e.over) {
      e.barkT = 3 + Math.random() * 3;
      if (Math.hypot(pp.x - e.x, pp.z - e.z) < 30) {
        if (e.kind === 'fight') I.say(pick([e.a, e.b, ...e.crowd]).group, pick(chance(0.5) ? FIGHT_BARKS : CROWD_BARKS), { ttl: 2 });
        else if (e.kind === 'flashmob') I.say(pick(e.dancers).group, pick(MOB_BARKS), { ttl: 2 });
        else if (e.kind === 'mugging') I.say((chance(0.5) ? e.mugger : e.victim).group, chance(0.5) ? pick(['WALLET. NOW.', 'Don\'t make me ask twice!', 'Nice hat. Gimme.']) : pick(['Please! It\'s my rent money!', 'HELP! Anyone!', 'Not the fedora!']), { ttl: 2 });
      }
    }
  });

  // ------------------------------------------------------------ scheduling
  game.bus.on('time:hour', ({ hoursPassed } = {}) => {
    if (!game.started || ev || hoursPassed > 2) return; // skipping time (sleep/work) doesn't spawn events
    const h = Math.floor(game.time.total / 60);
    if (h - lastHour < 3) return;
    if (game.player.vehicle || game.player.dead || game.controlsLocked || game.combat?.inBrawl?.()) return;
    if (game.world.districtAt?.(I.pp().x, I.pp().z) == null) return;
    if (!chance(0.5)) return;
    let kinds = KINDS.slice();
    if (game.time.isNight) kinds.push('mugging', 'fight'); else kinds.push('flashmob');
    if (spawn(pick(kinds))) lastHour = h;
  });
  game.bus.on('state:reset', () => { if (ev) end(0); lastHour = -99; });
  game.bus.on('player:arrested', () => { if (ev) end(0); });

  I.spawnEvent = (kind, at) => spawn(KINDS.includes(kind) ? kind : pick(KINDS), at);
  I.event = () => ev;
}
