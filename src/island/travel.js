// Getting to Blackwater: the bridge toll ($5 or fists), the ferry ($10, both ways), and the prison gate.
import { pick, chance, randInt } from '../core/util.js';
import { isle, $, fadeOut, fadeIn, playerPos, sfx } from './common.js';

const FERRY_FARE = 10, TOLL = 5;

export function installTravel(game) {
  const st = game.state;
  const W = () => game.world?.island;
  let lastX = null, tollBusy = false, tollCooldown = 0;

  // ---------------------------------------------------------------- toll
  const paidToday = () => isle(game).tollDay === game.time.day;
  function markPaid() { isle(game).tollDay = game.time.day; st.changed('island'); }

  async function tollStop() {
    if (tollBusy) return;
    tollBusy = true;
    const inCar = !!game.player?.vehicle;
    const terry = game.npcs?.get?.('isle_toll_terry');
    try { if (terry && game.npcs?.say) game.npcs.say(terry, pick(['TOLL!', 'HALT, PEASANT!', 'FIVE BUCKS!']), { ttl: 2 }); } catch { /* cosmetic */ }
    const opts = [
      { label: `Pay the ${$(TOLL)} toll`, hint: st.p.money >= TOLL ? '' : 'you\'re broke', disabled: st.p.money < TOLL },
      { label: 'Fight the troll for it', hint: 'win = free crossing today' },
      { label: inCar ? 'Floor it' : 'Run past him', hint: 'he throws things' },
    ];
    const i = await game.ui.dialog({
      title: 'Blackwater Bridge Toll', speaker: 'Toll Troll Terry',
      html: pick([
        'A man the shape of a mailbox steps into the road wearing a reflective vest over no shirt. His nametag says TERRY. "Toll\'s five bucks. Bridge maintenance." The bridge has not been maintained since the Carter administration.',
        '"HALT." Terry holds up a hand with a tattoo of a smaller hand on it. "Five dollars or five knuckles. I accept both. I prefer knuckles."',
        'Terry is eating a whole fish like a sandwich. He does not stop eating it. "Toll." Chomp. "Five." Chomp. "Or else." Chomp.',
      ]),
      options: opts,
      closable: false,
    });
    try {
      if (i === 0) {
        if (st.spend(TOLL, 'toll')) { markPaid(); game.ui.toast(pick(['Terry pockets the five and salutes with the fish.', '"Pleasure doin\' business. Welcome to Blackwater. Don\'t die."']), 'info', 2600); sfx(game, 'coin'); }
      } else if (i === 1) {
        const pp = playerPos(game);
        if (game.combat?.startBrawl) {
          game.combat.startBrawl({
            x: pp.x + 3, z: pp.z, count: 1, kind: 'fighter', tier: 1 + Math.min(3, isle(game).tollFights), label: 'Toll Troll Terry',
            onWin: () => {
              markPaid(); isle(game).tollFights++;
              const loot = randInt(18, 60);
              st.addMoney(loot, 'toll box');
              game.ui.toast(`Terry taps out. You liberate ${$(loot)} from the toll box. Free crossing today.`, 'good', 3500);
            },
            onLose: () => {
              const fee = Math.min(st.p.money, TOLL + 20);
              if (fee > 0) st.addMoney(-fee, 'toll');
              markPaid();
              game.ui.toast(`Terry takes the toll plus a ${$(fee - TOLL > 0 ? fee - TOLL : 0)} "processing fee". He also takes your dignity, but that\'s free.`, 'bad', 3500);
            },
          });
        } else { markPaid(); }
      } else {
        // dodge: he throws a dead fish (or a crab at your windshield)
        if (chance(inCar ? 0.45 : 0.6)) {
          if (inCar) { game.ui.toast('THUNK. A crab hits your windshield and holds on, staring at you. Toll evasion noted. (+1 heat)', 'bad', 3500); st.addHeat(1); }
          else { st.damage(6, 'fish'); game.ui.toast('A frozen mackerel hits you in the back of the head. -6 HP. Terry yells "TOLL EVADER!"', 'bad', 3500); }
        } else game.ui.toast(pick(['Terry throws a fish and misses. He eats the next one instead.', 'You blow past. Terry shakes a tiny fist. "I\'ll remember your face!" He won\'t.']), 'info', 3000);
        markPaid(); // he gives up for the day either way
      }
    } finally { tollBusy = false; tollCooldown = 3; }
  }

  // ---------------------------------------------------------------- ferry
  async function ferry(to) {
    const I = W(); if (!I) return;
    if (game.player?.vehicle) { game.ui.toast('The ferry is foot passengers only. The captain says your car "has a vibe".', 'bad', 3000); return; }
    const dest = to === 'island' ? I.ferry.island : I.ferry.city;
    const ok = await game.ui.confirm(`Ride the S.S. Seasick to ${to === 'island' ? 'Blackwater Isle' : 'the Rustyards docks'} for ${$(FERRY_FARE)}? (about 20 minutes)`, { title: 'Ferry', yes: 'All aboard', no: 'Nah' });
    if (!ok) return;
    if (!st.spend(FERRY_FARE, 'ferry')) return;
    sfx(game, 'door');
    game.island?.foghorn?.(0.6);
    await fadeOut(800, pick(['The S.S. Seasick chugs across the black water...', 'Captain Lou steers with his knees and a beer in each hand...', 'A seagull steals your hat. The ride continues.']));
    game.time.advance(20);
    game.player.spawn(dest.x, dest.z, to === 'island' ? Math.PI / 2 : -Math.PI / 2);
    game.cameraRig.yaw = game.player.facing + Math.PI;
    if (to === 'island') markPaid(); // ferry fare covers the toll mood
    await new Promise((r) => setTimeout(r, 500));
    await fadeIn(700);
    game.ui.toast(to === 'island' ? 'Welcome to Blackwater Isle. Mind the gulls.' : 'Back on the mainland. It smells better here, which is saying something.', 'info', 2800);
    game.bus.emit('island:ferry', { to });
  }

  function setupInteracts() {
    const I = W(); if (!I) return;
    game.interact.add({ id: 'isle:ferry_island', x: I.ferry.island.x, z: I.ferry.island.z, radius: 3.5, prompt: () => `Ferry to the Rustyards <small>(${$(FERRY_FARE)})</small>`, onInteract: () => ferry('city') });
    game.interact.add({ id: 'isle:ferry_city', x: I.ferry.city.x, z: I.ferry.city.z, radius: 4, prompt: () => `Ferry to Blackwater Isle <small>(${$(FERRY_FARE)})</small>`, onInteract: () => ferry('island') });
    if (I.penGate) game.interact.add({
      id: 'isle:pen_gate', x: I.penGate.x, z: I.penGate.z, radius: 4, prompt: () => 'Rattle the prison gate',
      onInteract: () => game.ui.dialog({ title: 'Blackwater Pen — Main Gate', speaker: 'Tower Guard', text: pick([
        'You rattle the gate. A voice from the tower: "THAT\'S A LOCKED GATE, GENIUS. VISITORS USE THE DOOR WITH THE WORD \'VISITING\' ON IT."',
        'The gate is locked with three padlocks, a chain, and what appears to be a bicycle lock. A searchlight finds your face. You wave. It does not wave back.',
        'From somewhere inside the walls, someone laughs. "Hee hee. Hee." The gate stays locked. You walk away a little faster.',
      ]) }),
    });
  }

  // ---------------------------------------------------------------- per-frame: toll line
  game.addSystem({
    name: 'island-travel',
    update(dt) {
      if (!game.started || !game.player) return;
      const I = W(); if (!I) return;
      tollCooldown -= dt;
      const p = playerPos(game);
      if (lastX != null && lastX < I.tollX && p.x >= I.tollX && Math.abs(p.z - I.bridge.z) < 11 && !paidToday() && tollCooldown <= 0 && !game.ui.isBlocking() && !game.player.dead) tollStop();
      lastX = p.x;
    },
  });

  game.bus.on('game:start', () => { lastX = null; });
  setupInteracts();
  return { ferry, tollStop, paidToday };
}
