import * as THREE from 'three';
import { makeProp, softDot } from './meshes.js';
import { createStickman } from '../entities/stickman.js';
import { tile } from '../ui/visual2.js';

// Street furniture you can actually use: vending machines, ATMs, payphones,
// newspaper boxes, dumpsters & trash cans, parking meters, fire hydrants,
// street performers, hot dog carts and a three-card monte hustler.

export function installStreet(game, I) {
  const st = game.state, P = I.placer;
  const { pick, chance, randInt, fmt } = I;
  const p = () => st.p;

  // ------------------------------------------------------------ candidate spots
  const walls = P.wallSpots();
  const alleys = P.alleySpots(I.rng('alleys')).filter((s) => !game.world.onSidewalk(s.x, s.z));
  I.alleys = alleys;
  const curbs = [];
  {
    const rr = I.rng('curbs');
    for (const w of P.walks()) {
      if (w.len < 16) continue;
      for (const t of [0.28, 0.5, 0.72]) {
        const c = P.curbSpot(w, t + (rr() - 0.5) * 0.08);
        if (c) curbs.push({ ...c, walk: w });
      }
    }
  }
  I.curbs = curbs;

  const wallFit = (w, d) => (c) => P.againstWall(c, w, d);
  const curbFit = (w, d, front = 0.7) => (c) => (P.footprintFree(c.x, c.z, c.facing, w, d, front) && P.roomy(c.x, c.z, c.facing, w, d, 1.0) ? { x: c.x, z: c.z, facing: c.facing } : null);
  const alleyFit = (w, d) => (c) => {
    const r = P.againstWall(c, w, d);
    if (!r) return null;
    const fx = Math.sin(r.facing), fz = Math.cos(r.facing);
    return P.reachable(r.x + fx * (d / 2 + 0.9), r.z + fz * (d / 2 + 0.9), 1400) ? r : null;
  };
  const place = (kind, cands, count, fit, opts = {}) =>
    P.pick(cands, { count, kind, quota: opts.quota ?? I.quotas(count, opts.weights), minSame: opts.minSame ?? 45, rClear: opts.rClear ?? 2.6, fit, rng: I.rng('pick:' + kind) });

  // ------------------------------------------------------------ shared bits
  function buyItem(id, price, flavor) {
    if (!st.canAfford(price)) { I.toast(`That's ${fmt(price)}. You have ${fmt(p().money)} and a dream.`, 'bad'); return false; }
    if (game.items?.buy) return game.items.buy(id, 1, price) && (flavor && I.toast(flavor, 'info', 2400), true);
    if (!st.spend(price, 'street')) return false;
    st.addItem(id, 1);
    game.bus.emit('item:bought', { id, qty: 1 });
    return true;
  }
  const iname = (id) => game.items?.name?.(id) ?? id;
  const stink = () => { try { game.sysFx?.add?.({ id: 'ix_stink', label: 'Eau de Dumpster (natural)', min: 120, temp: { cha: -1 }, kind: 'bad' }); } catch { /* ignore */ } };
  const ownedStink = () => !!game.sysFx?.has?.('ix_stink');

  // ============================================================ VENDING MACHINES
  const VEND = [
    ['chips', 2, 'Bag of Mostly Air', 'Nine chips. You count them. Twice.'],
    ['energy_drink', 6, 'Kardiak Arrest Energy', 'The can is warm and slightly swollen. Delicious.'],
    ['cold_burrito', 4, 'Vending Burrito', 'It thunks down like a brick. A warm, damp brick.'],
    ['donut', 2, 'Glazed Donut', 'Best before: a date that has already happened.'],
  ];
  const vendIntro = ['The machine hums like it knows things about you.', 'A sticker reads "NO REFUNDS. NO REGRETS. NO WITNESSES."', 'Somebody wrote "IT LIES" on the coin slot in Sharpie.', 'One coil holds a single, ancient Twinkie. It stares back.'];
  for (const [i, r] of place('vending', walls, 12, wallFit(1.0, 0.8)).entries()) {
    const id = 'vend' + i;
    I.add({
      id, kind: 'vending', ...r, solid: [1.0, 0.8, 1.9], wallProp: true, useOffset: 0.95,
      prompt: 'Use vending machine',
      use: () => I.choose({
        title: 'SNAX & JUICE', html: `<i>${pick(vendIntro)}</i>`,
        options: [
          ...VEND.map(([item, price, name, flav]) => ({
            label: `${name} — ${fmt(price)}`,
            run: () => {
              if (chance(0.07) && st.canAfford(price)) {
                st.spend(price, 'vending');
                I.toast(`The machine eats your ${fmt(price)}. The ${name} dangles off the coil, mocking you.`, 'bad', 3200);
                return;
              }
              if (buyItem(item, price, flav)) { I.sfx('buy'); I.bump('vendBuys'); }
            },
          })),
          { label: 'Kick it', hint: 'Free snacks for the brave. Foot injuries for the rest.', run: () => kick(id) },
        ],
      }),
    });
  }
  function kick(id) {
    if (!I.ready('kick:' + id)) { I.toast("It's still wobbling from the last kick. Give it a minute to fear you again.", 'info'); return; }
    I.cool('kick:' + id, 45);
    I.bump('kicks');
    I.hitSfx('smack');
    game.player.model?.punch?.(0.3);
    const r = Math.random();
    if (r < 0.22) {
      st.addItem('energy_drink', 1);
      I.toast(`<b>CLUNK.</b> A free ${iname('energy_drink')} drops out. Capitalism has been defeated (once).`, 'good', 3000);
    } else if (r < 0.28) {
      st.addItem('energy_drink', 1); st.addItem('chips', 1);
      I.toast('Jackpot! A can AND a bag of chips. The machine sighs like an old man.', 'good', 3000);
    } else if (r < 0.48) {
      st.damage(4, 'vending machine');
      I.toast("You kick it. It doesn't move. Your foot files for divorce. -4 HP", 'bad', 3000);
    } else {
      I.toast(pick(['Nothing. A single sad rattle.', 'The display flickers "NICE TRY".', 'A coin falls out. It\'s a button.', 'The alarm chirps once, half-heartedly.']), 'info', 2400);
    }
    if (I.copNear(18) || chance(0.15)) I.crime('vandalism');
    game.bus.emit('interact:vandal', { kind: 'vending', id });
  }

  // ============================================================ ATMs
  const atmText = ['WELCOME TO GRIMCO BANK. PLEASE INSERT CARD, DIGNITY OR BOTH.', 'THIS ATM IS MONITORED. SMILE. NO, NOT LIKE THAT.', 'NOW WITH 30% FEWER SKIMMERS!', 'HAVE YOU CONSIDERED A SECOND JOB?'];
  for (const [i, r] of place('atm', walls, 10, wallFit(0.8, 0.55)).entries()) {
    I.add({
      id: 'atm' + i, kind: 'atm', ...r, solid: [0.8, 0.55, 1.6], wallProp: true, useOffset: 0.8,
      prompt: 'Use ATM',
      use: () => atmMenu(),
    });
  }
  const FEE = 2;
  async function atmMenu() {
    const P0 = p();
    await I.choose({
      title: 'Grimco ATM', html: `<div style="font-family:monospace;color:#7fd09a">${pick(atmText)}</div><div class="sys-hint" style="margin-top:8px">Cash ${fmt(P0.money)} · Bank ${fmt(P0.bank)} · ${fmt(FEE)} convenience fee (their convenience)</div>`,
      leave: 'Take card & leave',
      options: [
        { label: 'Withdraw', disabled: P0.bank <= FEE, run: async () => {
          const max = Math.max(0, p().bank - FEE);
          const n = await game.ui.promptNumber({ title: `Withdraw (${fmt(FEE)} fee)`, text: 'The machine whirs. It sounds disappointed in you.', max, min: 0 });
          if (!n || n > max) return;
          p().bank -= n + FEE; st.changed('bank');
          st.addMoney(n, 'withdraw'); I.sfx('cash');
          I.toast(`Withdrew ${fmt(n)}. Fee: ${fmt(FEE)}. Receipt: "lol".`, 'money', 2600);
        } },
        { label: 'Deposit', disabled: P0.money <= FEE, run: async () => {
          const max = Math.max(0, p().money - FEE);
          const n = await game.ui.promptNumber({ title: `Deposit (${fmt(FEE)} fee)`, text: 'Safe from muggers, cops and your own 3 AM decisions.', max, min: 0 });
          if (!n || n > max) return;
          st.addMoney(-(n + FEE), 'deposit');
          p().bank += n; st.changed('bank'); I.sfx('cash');
          I.toast(`Deposited ${fmt(n)}. The ATM burps contentedly.`, 'money', 2600);
        } },
        { label: 'Check balance (free!)', run: () => I.toast(p().bank > 5000 ? `Balance: ${fmt(p().bank)}. The ATM offers you a mint.` : p().bank > 0 ? `Balance: ${fmt(p().bank)}. The screen does a little shrug.` : 'Balance: $0. The ATM prints a coupon for a soup kitchen.', 'info', 3000) },
      ],
    });
  }

  // ============================================================ PAYPHONES
  const PRANKS = [
    'You ask if their refrigerator is running. They say it was repossessed. You both sit in silence.',
    'You call the Rotwell PD and ask for "Mike Hunt". The desk sergeant laughs. Then traces the call.',
    'You call a random number and moan like a ghost. Grandma moans back. Louder. You hang up, shaken.',
    'You order 40 pizzas to City Hall. The mayor calls back to say thanks.',
    'You tell a guy he won a free cruise. He cries. You feel bad. You hang up anyway.',
    'You prank call the Gutter Rats Clubhouse. They have caller ID. And your description.',
    'You call a psychic hotline. She knew it was you before you said anything. Creepy.',
    'You call a random number. It\'s you, from the future. He says "don\'t eat the mystery meat". Click.',
  ];
  const MOM = ['"You never call. You also never visit. Are you eating? You sound skinny. You ARE skinny. You\'re a stick."', '"Your cousin just became a dentist. What are YOU doing? ...I hear sirens."', '"I made your old room into a gym for Gary. Who\'s Gary? Don\'t worry about Gary."', '"Are you being safe? I saw the news. I know that was you. Mothers know."'];
  for (const [i, r] of place('payphone', walls, 8, wallFit(0.56, 0.34), { minSame: 60 }).entries()) {
    const id = 'phone' + i;
    I.add({
      id, kind: 'payphone', ...r, solid: [0.56, 0.34, 2], wallProp: true, useOffset: 0.7,
      prompt: 'Use payphone',
      use: () => I.choose({
        title: 'Payphone', html: '<i>The receiver is sticky. You don\'t want to know. $1 a call.</i>',
        options: [
          { label: 'Prank call a random number ($1)', run: () => {
            if (!st.spend(1, 'payphone')) return;
            I.bump('pranks');
            const line = pick(PRANKS);
            I.dialog({ title: 'Ring ring...', text: line, options: [{ label: 'Hang up' }] });
            if (/traces|caller ID/.test(line) || chance(0.08)) { st.addHeat(0.3); I.toast('Someone wrote down this number. Probably nothing.', 'bad'); }
            if (chance(0.4)) st.addStat('karma', -1, 'prank');
            game.bus.emit('interact:event', { kind: 'prank', outcome: 'done' });
          } },
          { label: 'Call in an anonymous tip ($1)', hint: 'Crime Stoppers pays. Sometimes. In theory.', run: () => {
            if (!st.spend(1, 'payphone')) return;
            if (I.usedToday('tip')) { I.toast('"You again? Sir, this is the third \'guy in a trenchcoat\' today." Click.', 'info', 3000); return; }
            I.markDay('tip'); I.bump('tips');
            if (p().heat > 0.5 && chance(0.45)) {
              st.addHeat(-1);
              I.toast('You report a suspicious stick figure across town who looks EXACTLY like you. The cops take the bait. -1 heat.', 'good', 3600);
            } else if (chance(0.55)) {
              const n = randInt(15, 60);
              st.addMoney(n, 'crime stoppers'); st.addStat('karma', 1, 'tip');
              I.toast(`Your tip about a chop shop pans out. Crime Stoppers wires you ${fmt(n)}. Snitches get... paid.`, 'money', 3600);
            } else {
              game.time.advance(30);
              I.toast('They put you on hold for 30 minutes. The hold music is a kazoo cover of a funeral march.', 'info', 3400);
            }
          } },
          { label: 'Call your mom ($1)', run: () => {
            if (!st.spend(1, 'payphone')) return;
            I.dialog({ title: 'Mom', speaker: 'Mom', text: pick(MOM), options: [{ label: '"Love you too, Ma."' }] });
            if (!I.usedToday('mom')) { I.markDay('mom'); st.addStat('karma', 1, 'mom'); }
          } },
          { label: 'Check the coin return', disabled: I.usedToday('coin:' + id), run: () => {
            I.markDay('coin:' + id);
            if (chance(0.35)) { const n = randInt(1, 3); st.addMoney(n, 'coin return'); I.toast(`${fmt(n)} in somebody's forgotten change. Finders keepers.`, 'money'); }
            else I.toast(pick(['Gum. Pre-chewed. Warm.', 'A single toenail. You slam it shut.', 'Nothing but a sticky feeling that lasts all day.']), 'info');
          } },
        ],
      }),
    });
  }

  // ============================================================ NEWSPAPER BOXES
  for (const [i, r] of place('newsbox', curbs, 8, curbFit(0.55, 0.5), { minSame: 60 }).entries()) {
    const id = 'news' + i;
    I.add({
      id, kind: 'newsbox', ...r, solid: [0.5, 0.45, 1], useOffset: 0.75, cull: 100,
      prompt: 'Rotwell Rag box',
      use: () => {
        const n = p().sys?.news;
        const head = n && n.day === game.time.day ? n.headline : null;
        return I.choose({
          title: 'The Rotwell Rag', html: head ? `Today's front page:<h3 style="margin:6px 0">${head}</h3>` : '<i>Through the scratched window: a headline, a crime scene photo, and a coupon for colon cleanse.</i>',
          options: [
            { label: 'Buy a paper ($1)', run: () => {
              if (!st.spend(1, 'newspaper')) return;
              I.bump('papers');
              if (game.sysNews?.open) setTimeout(() => game.sysNews.open(), 30);
              else st.addItem('newspaper', 1);
            } },
            { label: 'Pay once, take the whole stack', hint: 'The oldest con in print journalism.', disabled: I.usedToday('stack:' + id), run: () => {
              if (!st.spend(1, 'newspaper')) return;
              I.markDay('stack:' + id);
              st.addItem('newspaper', 3); st.addStat('karma', -1, 'newspaper');
              I.toast('You grab the whole stack. Three papers to sell, swat flies with, or read on the toilet.', 'info', 3000);
            } },
          ],
        });
      },
    });
  }

  // ============================================================ DUMPSTERS & TRASH CANS
  const JUNK = ['scrap_metal', 'duct_tape', 'junk_watch', 'scrap_metal', 'copper_wire'];
  const FOOD = ['cold_burrito', 'chips', 'roller_dog', 'donut'];
  const RARE_D = ['gold_tooth', 'fake_rolex', 'stolen_tv', 'lucky_foot'];
  const RARE_T = ['scratch', 'fake_rolex', 'gold_tooth'];
  const GROSS = ['A diaper. Used. You let go of it and also, briefly, of your will to live.', 'Coffee grounds and a love letter that says "never again, Kevin".', 'Something moved. You decide not to find out what.', 'A whole wedding cake. With a single bite taken. You have questions.', 'A single shoe. Size 14. Still warm.'];
  async function dive(o, big) {
    const key = 'dive:' + o.id;
    if (I.usedToday(key)) { I.toast(big ? 'You already picked this one clean today. Even the flies left.' : 'Empty. You already licked it clean. Figuratively.', 'info'); return; }
    if (!st.useEnergy(3)) return;
    I.markDay(key); I.bump('dives');
    game.time.advance(10);
    I.sfx('door');
    const r = Math.random();
    let loot = 'nothing';
    if (r < (big ? 0.07 : 0.04)) { loot = 'raccoon'; await raccoon(big); }
    else if (r < (big ? 0.14 : 0.07)) {
      const it = pick(big ? RARE_D : RARE_T); st.addItem(it, 1); loot = it;
      I.toast(`Under a pizza box: <b>${iname(it)}</b>! One man's trash is your retirement plan.`, 'good', 3600);
    } else if (r < 0.42) {
      const it = pick(big ? JUNK : ['duct_tape', 'junk_watch']); st.addItem(it, 1); loot = it;
      I.toast(`You fish out ${iname(it)}. Pawnable. Probably tetanus-free.`, 'good', 2800);
    } else if (r < 0.62) {
      const n = big ? randInt(2, 25) : randInt(1, 6); st.addMoney(n, 'dumpster'); loot = 'cash';
      I.toast(`${fmt(n)} in soggy bills. It smells like a crime but spends like money.`, 'money', 2800);
    } else if (r < 0.78) {
      const it = pick(FOOD); st.addItem(it, 1); loot = it;
      I.toast(`A ${iname(it)}, still in the wrapper. Mostly. Five-second rule applies to dumpsters, right?`, 'info', 2800);
    } else {
      I.toast(pick(GROSS), 'info', 3200);
    }
    if (chance(big ? 0.45 : 0.25)) { stink(); I.toast('You now smell like the inside of a dumpster. -1 Charm for a while.', 'bad', 2200); }
    game.bus.emit('interact:dive', { id: o.id, loot });
  }
  async function raccoon(big) {
    I.bump('raccoons');
    const snack = FOOD.find((f) => st.hasItem(f));
    const i = await I.dialog({
      title: 'RACCOON!', text: 'A raccoon the size of a beagle rises from the garbage like a furry little Godzilla. It has seen war. It wants your face.',
      options: [{ label: 'Fight it', hint: 'Strength check' }, { label: snack ? `Offer it your ${iname(snack)}` : 'Offer it a snack', disabled: !snack }, { label: 'Back away slowly' }],
    });
    if (i === 0) {
      if (p().str * 1.2 + Math.random() * 40 > 30) {
        const n = randInt(10, 40); st.addMoney(n, 'raccoon');
        I.toast(`You win. Barely. The raccoon drops ${fmt(n)} it was clearly saving for something. You monster.`, 'good', 3600);
        game.bus.emit('interact:event', { kind: 'raccoon', outcome: 'won' });
      } else {
        st.damage(randInt(10, 18), 'raccoon');
        I.toast('The raccoon wins. It takes your dignity and a chunk of your ear. You should probably get a shot.', 'bad', 3600);
        game.bus.emit('interact:event', { kind: 'raccoon', outcome: 'lost' });
      }
    } else if (i === 1 && snack) {
      st.removeItem(snack, 1); st.addStat('karma', 1, 'raccoon');
      if (chance(0.35)) { st.addItem('gold_tooth', 1); I.toast('The raccoon accepts. It returns with a gift: a gold tooth. You don\'t ask whose.', 'good', 3600); }
      else I.toast('The raccoon takes it and nods with respect. You have a friend now. A filthy, filthy friend.', 'good', 3200);
      game.bus.emit('interact:event', { kind: 'raccoon', outcome: 'friend' });
    } else {
      I.toast('You back away. It maintains eye contact the entire time. It will remember this.', 'info', 3000);
    }
  }
  for (const [i, r] of place('dumpster', alleys, 10, alleyFit(2.0, 1.2), { minSame: 50, rClear: 3 }).entries()) {
    const o = I.add({
      id: 'dump' + i, kind: 'dumpster', ...r, solid: [2.06, 1.26, 1.4], wallProp: true, useOffset: 1.2, radius: 2.1,
      prompt: () => (I.usedToday('dive:dump' + i) ? 'Dumpster <small>(picked clean today)</small>' : 'Dumpster dive'),
      use: () => dive(o, true),
    });
  }
  for (const [i, r] of place('trashcan', curbs, 10, curbFit(0.7, 0.7), { minSame: 50 }).entries()) {
    const o = I.add({
      id: 'can' + i, kind: 'trashcan', ...r, solid: [0.66, 0.66, 1], useOffset: 0.8, cull: 90,
      prompt: () => (I.usedToday('dive:can' + i) ? 'Trash can <small>(already rummaged)</small>' : 'Rummage through the trash'),
      use: () => dive(o, false),
    });
  }

  // ============================================================ PARKING METERS
  for (const [i, r] of place('meter', curbs, 12, curbFit(0.3, 0.3, 0.5), { minSame: 40, weights: { downtown: 0.45, hilltop: 0.25, gutterside: 0.12, rustyards: 0.12, dustbowl: 0, blackwater: 0.06 } }).entries()) {
    const id = 'meter' + i;
    I.add({
      id, kind: 'meter', ...r, solid: [0.26, 0.26, 1.4], useOffset: 0.65, cull: 80, radius: 1.6,
      prompt: () => (I.usedToday('meter:' + id) ? 'Parking meter <small>(already busted)</small>' : 'Bust open the parking meter'),
      use: () => {
        if (I.usedToday('meter:' + id)) { I.toast('It\'s already empty and hanging open like a sad little mouth.', 'info'); return; }
        if (!st.useEnergy(4)) return;
        I.markDay('meter:' + id); I.bump('meters');
        game.player.model?.punch?.(0.3); I.hitSfx('smack');
        const ok = Math.random() < Math.min(0.9, 0.35 + p().str * 0.012);
        if (ok) {
          const n = randInt(3, 18); st.addMoney(n, 'parking meter'); I.sfx('coin');
          I.toast(`<b>CRACK.</b> ${fmt(n)} in quarters pour out. The city's parking budget weeps.`, 'money', 3000);
        } else {
          st.damage(3, 'parking meter');
          I.toast('You punch the meter. The meter wins. It now reads "EXPIRED", like your hand.', 'bad', 3000);
        }
        I.crime('vandalism');
        game.bus.emit('interact:vandal', { kind: 'meter', id });
      },
    });
  }

  // ============================================================ FIRE HYDRANTS
  const hydrants = [];
  for (const [i, r] of place('hydrant', curbs, 8, curbFit(0.6, 0.6), { minSame: 70, weights: { downtown: 0.3, gutterside: 0.35, hilltop: 0.1, rustyards: 0.15, dustbowl: 0.05, blackwater: 0.05 } }).entries()) {
    const id = 'hyd' + i;
    const o = I.add({
      id, kind: 'hydrant', ...r, solid: [0.5, 0.5, 1], useOffset: 0.8, cull: 100, radius: 1.8,
      until: 0, spray: null,
      prompt: () => (o.until > game.time.total ? 'Splash around in the hydrant' : 'Crack open the fire hydrant'),
      use: () => {
        if (o.until > game.time.total) return splash(o);
        if (!st.useEnergy(5)) return;
        game.player.model?.punch?.(0.4);
        if (Math.random() > Math.min(0.92, 0.45 + p().str * 0.012)) { I.toast('You wrestle the valve. The valve wins. Maybe lift something first.', 'bad', 2600); return; }
        openHydrant(o, game.time.total + 60, true);
        I.crime('vandalism');
        I.bump('hydrants');
        game.bus.emit('interact:vandal', { kind: 'hydrant', id });
        I.toast('<b>FWOOOSH.</b> Free water park! Property values somewhere drop by $3.', 'good', 3000);
      },
    });
    hydrants.push(o);
  }
  // spray particles
  const sprayGeo = new THREE.BufferGeometry();
  const SPN = 120;
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPN * 3), 3));
  const sprayMat = new THREE.PointsMaterial({ color: 0xa8d0f4, size: 0.14, map: softDot(), transparent: true, opacity: 0.75, depthWrite: false });
  function openHydrant(o, until, local) {
    o.until = until;
    if (!o.spray) {
      const geo = sprayGeo.clone();
      o.spray = new THREE.Points(geo, sprayMat);
      o.spray.frustumCulled = false;
      o.spray.userData.seeds = Array.from({ length: SPN }, () => [Math.random(), (Math.random() - 0.5) * 0.5, 0.8 + Math.random() * 0.4]);
      o.group.add(o.spray);
      o.group.matrixAutoUpdate = true;
    }
    o.spray.visible = true;
    if (local) try { game.net?.broadcast?.({ t: 'interact:hydrant', id: o.id, until }); } catch { /* offline */ }
  }
  function splash(o) {
    if (o.splashed === o.until) { I.toast('You\'re already soaked. Any wetter and you\'d be a fish.', 'info'); return; }
    o.splashed = o.until;
    st.addStat('energy', 8);
    if (game.sysFx?.has?.('ix_stink')) game.sysFx.remove('ix_stink');
    if ((game.sysFx?.drunk || 0) > 0.5) game.sysFx.addDrunk?.(-1);
    I.bump('splashes');
    I.toast(pick(['Ice cold. You scream like a kettle. Refreshing!', 'You dance in the spray like it\'s 1987. A child films you.', 'You\'re clean! Ish! The water smells like pennies.']), 'good', 2800);
  }
  I.hooks.frame.push((dt) => {
    const now = game.time.total;
    for (const o of hydrants) {
      if (!o.spray?.visible) continue;
      if (o.until <= now) { o.spray.visible = false; continue; }
      if (!o.group.visible) continue;
      const pos = o.spray.geometry.attributes.position, seeds = o.spray.userData.seeds;
      const t = game.elapsed;
      for (let k = 0; k < SPN; k++) {
        const [ph, side, sp] = seeds[k];
        const a = (t * 1.3 * sp + ph) % 1; // 0..1 life
        const d = a * 3.2 * sp;
        pos.setXYZ(k, side * a * 0.8, 0.48 + d * 0.9 - a * a * 2.6, 0.25 + d);
      }
      pos.needsUpdate = true;
    }
  });
  game.net?.on?.('interact:hydrant', (msg) => {
    const o = hydrants.find((h) => h.id === msg?.id);
    const until = Number(msg?.until);
    if (o && Number.isFinite(until) && until > game.time.total && until < game.time.total + 240) openHydrant(o, until, false);
  });
  // Late joiners: the host tells them which hydrants are gushing right now.
  game.bus.on('net:player-joined', ({ id } = {}) => {
    try {
      if (!id || !game.net?.isHost) return;
      const now = game.time.total;
      for (const o of hydrants) if (o.until > now) game.net.sendTo(id, { t: 'interact:hydrant', id: o.id, until: o.until });
    } catch { /* offline */ }
  });

  // ============================================================ PERFORMERS
  const PERF = [
    { kind: 'busker', name: 'Strummin\' Steve', district: 'downtown', color: '#3a2a20', hat: 'fedora', hatColor: '#5a4030',
      lines: ['♪ My baby left me for a guy with a car... ♪', '♪ Wonderwall, but worse ♪', '♪ This one\'s about my landlord ♪', 'Requests are $5. Freebird is $50.'],
      thanks: ['Bless you, friend!', 'That\'s rent! Well, 1% of rent!', 'You\'re in the album credits now.'], heckled: ['Everyone\'s a critic.', 'I played Carnegie Hall! ...a hall. A hallway.'] },
    { kind: 'drummer', name: 'Bucket Boy Dre', district: 'gutterside', color: '#2a3a4a', hat: 'cap', hatColor: '#c43a1a',
      lines: ['*BAP BAP BADA-BAP*', '*drum solo intensifies*', 'Buckets don\'t lie!', '*TSSK TSSK BOOM*'],
      thanks: ['Ayyy, respect!', 'New buckets, here I come!', '*grateful rimshot*'], heckled: ['*aggressive drum fill at you*', 'Keep walking, Ringo.'] },
    { kind: 'preacher', name: 'Brother Ezekiel', district: 'downtown', color: '#1a1a1a', hat: 'tophat', hatColor: '#141414',
      lines: ['REPENT! The END is NIGH! Also the bus is late!', 'The Lord sees your browser history!', 'Rotwell is SODOM with worse parking!', 'Bless this crate and all who stand on it!'],
      thanks: ['Heaven just bumped you up a tier!', 'The Lord accepts small bills!', 'You are SAVED! (terms apply)'], heckled: ['I will PRAY for you. LOUDLY.', 'Judgment comes for hecklers FIRST!'] },
    { kind: 'busker', name: 'Accordion Al', district: 'rustyards', color: '#4a3a2a', hat: 'beanie', hatColor: '#2a4a2a',
      lines: ['♪ *wheeze* polka *wheeze* ♪', '♪ Sea shanty about a meat plant ♪', 'This squeezebox was my father\'s. He hated it too.'],
      thanks: ['Danke! Gracias! Thanks!', '*joyful wheeze*'], heckled: ['*sad accordion noises*', 'I have played for KINGS. Burger Kings.'] },
  ];
  const performers = [];
  for (const [i, def] of PERF.entries()) {
    const cands = walls.filter((s) => game.world.districtAt(s.x, s.z) === def.district);
    const [r] = P.pick(cands, { count: 1, kind: 'performer', minSame: 80, rClear: 3, rng: I.rng('perf' + i), fit: (c) => (P.footprintFree(c.x + Math.sin(c.facing) * 0.3, c.z + Math.cos(c.facing) * 0.3, c.facing, 1.0, 1.0, 1.2) && P.roomy(c.x, c.z, c.facing, 1.0, 1.4, 1.0, true) ? { x: c.x, z: c.z, facing: c.facing } : null) });
    if (!r) continue;
    const g = new THREE.Group();
    const man = createStickman({ color: def.color, hat: def.hat, hatColor: def.hatColor });
    g.add(man.group);
    if (def.kind === 'preacher') { const crate = makeProp('crate'); g.add(crate); man.group.position.y = 0.33; }
    if (def.kind === 'busker') { const gt = makeProp('guitar'); gt.position.set(0.02, 1.05, 0.2); gt.rotation.z = 0.9; man.group.add(gt); }
    if (def.kind === 'drummer') { const b = makeProp('bucketdrum'); b.position.set(0, 0, 0.45); g.add(b); }
    const hat = makeProp('tiphat'); hat.position.set(0.55, 0, 0.75); g.add(hat);
    const id = 'perf' + i;
    const o = I.add({
      id, kind: 'performer', ...r, group: g, man, def, animated: true, solid: [0.8, 0.8, 1.8], useOffset: 1.35, radius: 1.8, cull: 90,
      prompt: `Tip ${def.name}`, lineT: Math.random() * 5,
      use: () => tipMenu(o),
    });
    performers.push(o);
  }
  async function tipMenu(o) {
    const d = o.def;
    const tip = (n) => () => {
      if (!st.spend(n, 'tip')) return;
      I.bump('tipped', n);
      I.say(o.man.group, pick(d.thanks), { ttl: 2.6 });
      const key = 'karma:' + o.id;
      if (n >= 5 && !I.usedToday(key)) { I.markDay(key); st.addStat('karma', n >= 20 ? 2 : 1, 'tip'); }
      else I.toast(`${d.name} pockets your ${fmt(n)} with a nod.`, 'info', 2000);
      o.hype = 3;
      game.bus.emit('interact:tip', { id: o.id, amount: n });
    };
    await I.choose({
      title: d.name, html: `<i>${d.kind === 'preacher' ? 'He is standing on a crate yelling at a pigeon about the apocalypse. The pigeon seems convinced.' : d.kind === 'drummer' ? 'A kid hammering on paint buckets with the fury of a man twice his age and half his rhythm.' : 'A busker with a hat full of lint and a voice full of unpaid rent.'}</i>`,
      options: [
        { label: 'Tip $1', run: tip(1) }, { label: 'Tip $5', hint: 'Good karma', run: tip(5) }, { label: 'Tip $20', hint: 'Great karma', run: tip(20) },
        { label: 'Heckle', run: () => { I.say(o.man.group, pick(d.heckled), { ttl: 2.6 }); if (!I.usedToday('heckle:' + o.id)) { I.markDay('heckle:' + o.id); st.addStat('karma', -1, 'heckle'); } } },
      ],
    });
  }
  I.hooks.frame.push((dt) => {
    const pp = I.pp(), t = game.elapsed;
    for (const o of performers) {
      if (!o.group.visible) continue;
      const m = o.man, P2 = m.parts;
      m.animate(dt, 0);
      const k = o.def.kind, hype = (o.hype = Math.max(0, (o.hype || 0) - dt)) > 0 ? 1.6 : 1;
      if (k === 'busker') { P2.armR.upper.rotation.set(-0.7 + Math.sin(t * 11 * hype) * 0.18, 0, -0.35); P2.armR.lower.rotation.x = -0.6; P2.armL.upper.rotation.set(-1.1, 0, 0.7); P2.armL.lower.rotation.x = -0.9; }
      else if (k === 'drummer') { P2.armL.upper.rotation.set(-0.9 + Math.sin(t * 13 * hype) * 0.45, 0, 0.2); P2.armR.upper.rotation.set(-0.9 + Math.sin(t * 13 * hype + Math.PI) * 0.45, 0, -0.2); P2.armL.lower.rotation.x = P2.armR.lower.rotation.x = -0.7; }
      else { P2.armR.upper.rotation.set(-2.7 + Math.sin(t * 2.2) * 0.25, 0, -0.25); P2.armL.upper.rotation.set(-0.3 + Math.sin(t * 3.1) * 0.3, 0, 0.4); P2.torso.rotation.y = Math.sin(t * 0.8) * 0.2; }
      m.group.position.y = (k === 'preacher' ? 0.33 : 0) + Math.abs(Math.sin(t * 5 * hype)) * 0.03;
      o.lineT -= dt;
      if (o.lineT <= 0) {
        o.lineT = 7 + Math.random() * 6;
        if (Math.hypot(pp.x - o.x, pp.z - o.z) < 16) I.say(m.group, pick(o.def.lines), { ttl: 2.8 });
      }
    }
  });

  // ============================================================ HOT DOG CARTS
  const DOG_ANS = ['"It\'s beef." *long pause* "Beef-adjacent."', '"Family recipe. Family\'s not around anymore. Unrelated."', '"Don\'t ask what\'s in it and I won\'t ask what\'s in your pockets."', '"Pork, chicken, a little bit of mystery, a little bit of misery."'];
  const vendors = [];
  for (const [i, r] of place('hotdog', walls, 3, wallFit(1.7, 2.0), { minSame: 150, rClear: 3.5, weights: { downtown: 0.4, gutterside: 0.3, rustyards: 0.3 } }).entries()) {
    const g = new THREE.Group();
    const cart = makeProp('hotdog'); cart.position.z = 0.52; g.add(cart);
    const man = createStickman({ color: '#e8e0d0', skin: '#c89a70', hat: 'cap', hatColor: '#c43a1a' });
    man.group.position.z = -0.5; g.add(man.group);
    const id = 'dog' + i;
    const name = ['Sal', 'Big Lou', 'Nervous Gary'][i % 3];
    const o = I.add({
      id, kind: 'hotdog', ...r, group: g, man, animated: true, solid: [1.7, 2.0, 1.4], useOffset: 1.6, radius: 2, cull: 110,
      prompt: `Buy from ${name}'s Hot Dogs`,
      use: () => I.choose({
        title: `${name}'s Hot Dogs`, speaker: name, html: `<i>${name} wipes his hands on a rag that was white in a previous life.</i> "What'll it be?"`,
        options: [
          { label: 'Hot dog — $3', hint: '+14 energy', run: () => {
            if (!st.spend(3, 'hot dog')) return;
            st.addStat('energy', 14); I.sfx('gulp'); I.bump('hotdogs');
            I.toast(pick(['Snap! Juicy. Suspiciously juicy.', 'Mustard, onions, and a faint aftertaste of the 90s.', 'Best $3 you\'ve ever spent. Low bar.']), 'good', 2400);
          } },
          { label: 'Mystery Meat Special — $1', hint: '+22 energy. Risky.', run: () => {
            if (!st.spend(1, 'hot dog')) return;
            st.addStat('energy', 22); I.sfx('gulp'); I.bump('hotdogs');
            if (chance(0.35)) setTimeout(() => { st.damage(6, 'mystery meat'); I.toast('Your stomach makes a sound like a cat. A faint "meow". -6 HP.', 'bad', 3200); }, 600);
            else I.toast('Surprisingly good. You decide not to think about it ever again.', 'good', 2600);
          } },
          { label: 'Ask what\'s in the special', run: () => I.say(man.group, pick(DOG_ANS), { ttl: 3.4 }) },
        ],
      }),
    });
    vendors.push(o);
  }
  I.hooks.frame.push((dt) => { for (const o of vendors) if (o.group.visible) o.man.animate(dt, 0); });

  // ============================================================ THREE-CARD MONTE
  const hustlers = [];
  for (const [i, r] of place('monte', walls, 2, wallFit(1.0, 1.4), { minSame: 150, rClear: 3, weights: { downtown: 0.5, gutterside: 0.5 } }).entries()) {
    const g = new THREE.Group();
    const box = makeProp('montebox'); box.position.z = 0.35; g.add(box);
    const man = createStickman({ color: '#5a3a5a', hat: 'fedora', hatColor: '#2a1a2a', build: 'lanky' });
    man.group.position.z = -0.4; g.add(man.group);
    const id = 'monte' + i;
    const name = i === 0 ? 'Three-Card Terrence' : 'Shifty Lenny';
    const o = I.add({
      id, kind: 'monte', ...r, group: g, man, name, animated: true, solid: [0.8, 1.2, 1.4], useOffset: 1.25, radius: 1.8, cull: 90,
      prompt: `Play three-card monte with ${name}`, lineT: 3,
      use: () => monte(o),
    });
    hustlers.push(o);
  }
  async function monte(o) {
    const key = 'monteWins:' + o.id;
    const wins = I.usedToday(key) ? (I.S().n['mw:' + o.id] || 0) : 0;
    if (wins >= 3) { I.toast(`${o.name} is packing up. "You're bad for business, chief."`, 'info', 2600); return; }
    await I.choose({
      title: o.name, speaker: o.name, html: '"Find the lady, win double! Easy money! The queen is RED, the others are DEAD! Who\'s feeling lucky?"',
      options: [
        { label: 'Place a bet', hint: 'Win 2×. Odds get better with INT.', disabled: p().money < 5, run: () => monteRound(o) },
        { label: 'Flip his table', hint: 'He will not take it well.', run: () => {
          I.say(o.man.group, 'OH, YOU WANNA GO?', { ttl: 2 });
          game.combat?.startBrawl?.({ x: o.x, z: o.z, count: 1, kind: 'thug', label: `${o.name} is NOT amused`, onWin: () => { const n = randInt(20, 80); st.addMoney(n, 'monte'); I.toast(`You take ${o.name}'s bankroll: ${fmt(n)}. It's mostly ones.`, 'money', 3000); } });
        } },
      ],
    });
  }
  async function monteRound(o) {
    const max = Math.min(p().money, 250);
    const bet = await game.ui.promptNumber({ title: 'Bet', text: `${o.name} shuffles a deck of cards that has clearly been through a war.`, max, min: 5, initial: Math.min(20, max) });
    if (!bet || bet < 5 || !st.canAfford(bet)) return;
    I.sfx('card');
    const i = await I.dialog({ title: 'Follow the lady...', speaker: o.name, text: '*shuffle shuffle flick shuffle* "Where\'s the queen? Where\'s she at?"', options: [{ label: 'Left' }, { label: 'Middle' }, { label: 'Right' }], closable: false });
    if (i == null) return;
    const winP = Math.min(0.5, 0.28 + p().int * 0.003);
    const won = Math.random() < winP;
    const where = ['left', 'middle', 'right'];
    I.bump('montePlays');
    if (won) {
      st.addMoney(bet, 'monte'); I.sfx('win');
      const s = I.S(), k = 'monteWins:' + o.id;
      if (!I.usedToday(k)) { s.n['mw:' + o.id] = 0; I.markDay(k); }
      s.n['mw:' + o.id] = (s.n['mw:' + o.id] || 0) + 1;
      I.say(o.man.group, pick(['...beginner\'s luck.', 'Huh. HUH.', 'Ya cheatin\'! I\'m the one who cheats!']), { ttl: 2.4 });
      I.toast(`The queen! Right there on the ${where[i]}! +${fmt(bet)}`, 'money', 3000);
    } else {
      st.addMoney(-bet, 'monte'); I.sfx('lose');
      const j = (i + 1 + (Math.random() < 0.5 ? 0 : 1)) % 3;
      I.say(o.man.group, pick(['Ooh, so close!', 'Tough break, chief.', 'The lady\'s fickle!']), { ttl: 2.4 });
      I.toast(`He flips the ${where[i]}: the two of clubs. The queen was on the ${where[j]}. Or up his sleeve. -${fmt(bet)}`, 'bad', 3400);
    }
    game.bus.emit('interact:monte', { amount: won ? bet : -bet });
  }
  I.hooks.frame.push((dt) => {
    const t = game.elapsed;
    for (const o of hustlers) {
      if (!o.group.visible) continue;
      const P2 = o.man.parts; o.man.animate(dt, 0);
      P2.armL.upper.rotation.set(-0.9, Math.sin(t * 7) * 0.4, 0.15); P2.armR.upper.rotation.set(-0.9, Math.sin(t * 7 + 2) * 0.4, -0.15);
      P2.armL.lower.rotation.x = P2.armR.lower.rotation.x = -0.6;
      o.lineT -= dt;
      if (o.lineT <= 0) { o.lineT = 9 + Math.random() * 5; const pp = I.pp(); if (Math.hypot(pp.x - o.x, pp.z - o.z) < 14) I.say(o.man.group, pick(['Find the lady! Easy money!', 'Step right up, chief!', 'Nobody loses! (Everybody loses)', 'Hey you! You look lucky! And broke!']), { ttl: 2.5 }); }
    }
  });

  // sheet
  I.hooks.sheet.push((s) => tile({ icon: 'crate', color: 'var(--g-food)', value: s.n.dives || 0, label: 'Dumpsters dived' })
    + tile({ icon: 'money', color: 'var(--cash)', value: s.n.meters || 0, label: 'Meters busted' })
    + tile({ icon: 'drop', color: '#60c0ff', value: s.n.hydrants || 0, label: 'Hydrants opened' })
    + tile({ icon: 'music', color: 'var(--g-play)', value: fmt(s.n.tipped || 0), label: 'Busker tips' }));
}
