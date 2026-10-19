// Island buildings: The Rusty Hook (food, fish counter, fish-gutter job), Blackwater Light (keeper, lore,
// secret stash), Smugglers' Cove (fence + exotic weapons), Blackwater Pen visiting room (tips, smuggling).
import { placeMenu, shopPanel, say, choose } from '../systems/ui-kit.js';
import { pick, chance, randInt, clamp } from '../core/util.js';
import { DRUGS, DRUG_ORDER } from '../data/drugs.js';
import { WEAPONS } from '../data/weapons.js';
import { ITEMS } from '../data/items.js';
import { FISH, FISH_ORDER, INMATES, KEEPER_LORE, EXOTIC_WEAPONS } from './data.js';
import { isle, $, sfx } from './common.js';

export function installPlaces(game) {
  const st = game.state;
  const name = (id) => game.items?.name?.(id) ?? ITEMS[id]?.name ?? WEAPONS[id]?.name ?? id;

  // ================================================================ The Rusty Hook
  // Daily fish prices wobble with the "catch of the day" (deterministic per day, same for all players).
  function fishPrice(id) {
    const f = FISH[id]; if (!f) return 0;
    const d = game.time.day;
    let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
    const wob = 0.8 + ((Math.sin(d * 12.9898 + h * 0.001) * 43758.5453) % 1 + 1) % 1 * 0.5;
    const glut = FISH_ORDER[d % (FISH_ORDER.length - 1)] === id ? 0.6 : 1;
    return Math.max(1, Math.round(f.price * wob * glut));
  }

  function fishCounter() {
    return shopPanel(game, {
      title: 'Fish Counter', speaker: 'Mama Barnacle', width: 760,
      intro: () => `"Whatcha got, sweetie? I pay fair. Fair for ME." Today\'s glut: <b>${FISH[FISH_ORDER[game.time.day % (FISH_ORDER.length - 1)]].name}</b> (cheap).`,
      sections: () => {
        const have = FISH_ORDER.filter((id) => st.itemCount(id) > 0);
        return [{
          name: have.length ? 'Sell your catch' : 'You have no fish. Mama Barnacle looks personally offended.',
          products: have.map((id) => ({
            name: `${FISH[id].name} ×${st.itemCount(id)}`, desc: FISH[id].desc, priceLabel: `${$(fishPrice(id))} ea`, btn: 'Sell all',
            buy: () => {
              const n = st.itemCount(id); if (!n) return false;
              st.removeItem(id, n);
              st.addMoney(fishPrice(id) * n, 'fish');
              sfx(game, 'cash');
              game.bus.emit('island:fish-sold', { id, qty: n, price: fishPrice(id) });
              if (FISH[id].legendary) game.ui.toast('Mama Barnacle weeps. "I\'ll mount him over the fryer. He\'ll watch over us all."', 'good', 3500);
              return true;
            },
          })),
        }];
      },
      footer: 'Fish prices change daily. Pawn shops pay less. The Lawyerfish pays nobody.',
    });
  }

  function seafoodMenu() {
    const FOOD = ['isle_chowder', 'isle_fishchips', 'isle_eelroll', 'isle_shrimp'];
    return shopPanel(game, {
      title: 'The Rusty Hook — Menu', speaker: 'Mama Barnacle', width: 720,
      intro: '"Everything\'s fresh! Fresh-ish. Fresh adjacent. Caught this week, or last week, or by my late husband."',
      sections: () => [{ name: 'Eat here or take it to go (we recommend "go")', products: FOOD.map((id) => ({
        name: ITEMS[id].name, desc: ITEMS[id].desc, price: ITEMS[id].price, qty: true,
        buy: (q) => {
          if (!game.items.buy(id, q)) return false;
          if (id === 'isle_chowder' && chance(0.18)) setTimeout(() => { st.damage(8, 'chowder'); game.ui.toast('The chowder fights back. You make a speedrun to the outhouse. -8 HP.', 'bad', 3000); }, 400);
          return true;
        },
      })) }],
    });
  }

  game.locations.register('isle_seafood', (g, loc) => placeMenu(g, loc, {
    hours: [6, 2],
    speaker: 'Mama Barnacle',
    closed: () => 'The Rusty Hook is closed. A cat sleeps on the fryer. It glows faintly.',
    text: () => pick([
      'A shack that smells like low tide and a deep fryer had a baby. Mama Barnacle — four-foot-ten, arms like anchor chains, a cigarette that never goes out — slaps the counter. "Sit. Eat. Don\'t touch the lobster tank, Gerald bites."',
      'Nets hang from the ceiling with things still in them. A jukebox plays sea shanties about debt. Mama Barnacle is yelling at a crab. The crab is yelling back.',
      '"You look hungry, sweetie. And sad. I can fix one of those." Mama Barnacle flicks ash into the chowder. "Flavor."',
    ]),
    options: () => [
      { label: 'Order food', run: () => seafoodMenu() },
      { label: 'Sell fish at the counter', hint: `${FISH_ORDER.reduce((a, id) => a + st.itemCount(id), 0)} fish on you`, run: () => fishCounter() },
      ...(game.jobs?.options?.('fish_gutter') ?? []),
      { label: 'Gossip with Mama Barnacle', run: () => say(g, loc.name, pick([
        `"Hank says he saw Old Rustjaw last week. Hank also says he saw Elvis buyin\' bait. Hank sees a lot of things. Fish in the fog, sweetie."`,
        `"Eddie down at the cove? Sweet boy. Sells guns to pirates. Buys stolen TVs from the mainland. Calls his mother every Sunday. Good boy."`,
        `"That toll troll Terry? I changed his diapers. Now he charges me five bucks to get home. Kids."`,
        `"Market word: ${game.market?.rumor?.(0.8) ?? 'prices are up. Everything\'s up. Except my husband. He\'s down. In the water. Long story.'}"`,
      ]), 'Mama Barnacle') },
    ],
  }));

  // ================================================================ Blackwater Light
  game.locations.register('isle_lighthouse', async (g, loc) => {
    const s = isle(g);
    const K = s.keeper;
    for (let guard = 0; guard < 40; guard++) {
      const lore = KEEPER_LORE.map((l) => ({ ...l, label: l.label + (K.asked.includes(l.key) ? ' ✓' : '') }));
      const ready = K.asked.length >= KEEPER_LORE.length || K.drinks >= 2;
      const opts = [
        ...lore.map((l) => ({ label: l.label, run: async () => { if (!K.asked.includes(l.key)) { K.asked.push(l.key); st.addXP(5); } await say(g, loc.name, l.text, 'Keeper Ezekiel Brine'); } })),
        { label: 'Share a drink with him', hint: st.hasItem('whiskey') ? 'give Rotgut Whiskey' : st.hasItem('moonshine') ? 'give moonshine' : st.hasItem('beer') ? 'give a Piss Lite' : 'you have no booze', disabled: !['whiskey', 'moonshine', 'beer', 'malt'].some((i) => st.hasItem(i)), run: async () => {
          const it = ['whiskey', 'moonshine', 'malt', 'beer'].find((i) => st.hasItem(i));
          st.removeItem(it, 1);
          K.drinks += it === 'beer' || it === 'malt' ? 1 : 2;
          g.time.advance(30);
          await say(g, loc.name, pick([
            '"Ahh. That\'s the stuff. Tastes like a shipwreck." He wipes his beard on his sleeve, then on your sleeve.',
            '"Kid, you\'re alright. Most people bring me questions. You bring me liquid courage. Sit."',
          ]), 'Keeper Ezekiel Brine');
        } },
        ready && !K.secret ? { label: 'Ask what he\'s not telling you', run: async () => {
          K.secret = true; st.changed('island');
          await say(g, loc.name, '"Alright. You earned it." He leans in. Breath like a fish market fire. "The night of the Incident, I saw it from the lamp room. It weren\'t Giggles runnin\' that wheel. It was the <b>mayor\'s</b> people — dumpin\' somethin\' off the top car into the sea. Crates. Giggles saw too. That\'s why he\'s in the Pen, laughin\'. Nobody believes a clown.<br><br>And the big fish? Old Rustjaw <em>ate</em> one of those crates. That\'s why he\'s so big. You fish him in the fog, you\'ll know.<br><br>One more thing. Up in the lamp room, under the third step. My stash. Take it. I\'m too old to climb."', 'Keeper Ezekiel Brine');
          st.addXP(60);
        } } : null,
        K.secret && !K.stash ? { label: 'Climb the lighthouse (the stash)', hint: '-15 energy', disabled: st.p.energy < 15, run: async () => {
          if (!st.useEnergy(15)) return;
          K.stash = true; g.time.advance(30);
          const cash = 2000 + randInt(0, 1500);
          st.addMoney(cash, 'stash'); st.addItem('message_bottle', 1); st.addItem('whiskey', 2);
          st.addStat('int', 1, 'lighthouse');
          sfx(g, 'jackpot');
          await say(g, 'The Lamp Room', `Two hundred and twelve stairs. Your thighs file a complaint. Under the third step from the top: a coffee can. Inside: <b>${$(cash)}</b> in damp bills, two bottles of Rotgut, and a bottle with a message. Through the giant lens, Rotwell glitters like a dumpster fire seen from space. It's almost pretty.`);
        } } : null,
        K.stash ? { label: 'Climb up for the view', hint: '-8 energy · +karma', disabled: st.p.energy < 8, run: async () => {
          if (!st.useEnergy(8)) return; g.time.advance(30);
          if (chance(0.5)) st.addStat('karma', 1);
          await say(g, 'The Lamp Room', pick(['The lens hums. The beam sweeps over the black water, the bridge, the city. Somewhere down there, someone is having a worse day than you. Probably.', 'You watch the Ferris wheel turn by itself in the dark. One gondola is lit. It shouldn\'t be. You go back down very quickly.']));
        } } : null,
        { label: 'Ask him to sound the foghorn', run: async () => { g.island?.foghorn?.(1); await say(g, loc.name, '"HAAA! Love that sound. Scares the gulls and the Coast Guard."', 'Keeper Ezekiel Brine'); } },
      ].filter(Boolean);
      opts.push({ label: 'Leave', leave: true });
      const i = await g.ui.dialog({
        title: loc.name, speaker: 'Keeper Ezekiel Brine',
        html: pick([
          'A cramped cottage full of ship-in-a-bottles, most of them sinking. Keeper Ezekiel Brine — beard like a seabird nest, one glass eye that points at the door — waves a pipe at you. "Visitor! Wipe your boots. Actually don\'t, the floor\'s dirtier."',
          'The keeper is talking to a stuffed seagull named Admiral. He stops when he sees you. "The Admiral doesn\'t like strangers. Sit where he can see you."',
        ]),
        options: opts.map((o) => ({ label: o.label, hint: o.hint, disabled: o.disabled })),
      });
      if (i == null || opts[i].leave) return;
      try { await opts[i].run(); } catch (e) { console.error('[island] keeper', e); }
    }
  });

  // ================================================================ Smugglers' Cove (fence + exotic weapons)
  const isHot = (id) => {
    const d = ITEMS[id];
    if (!d) return /^(loot_|stolen_)/.test(id);
    if (d.fish || d.noSell) return false;
    if (d.stolen || d.hot || d.cat === 'loot') return true;
    if (d.cat === 'junk') return !['soggy_boot', 'scrap_metal', 'duct_tape'].includes(id);
    return d.cat === 'gift' && d.price >= 300;
  };
  const fenceValue = (id) => {
    const d = ITEMS[id];
    const base = d?.price ?? d?.value ?? 100;
    return Math.max(1, Math.floor(base * (d?.cat === 'gift' ? 0.7 : 0.85)));
  };
  const drugBuy = (id) => {
    const base = game.market?.price?.(id, 'blackwater') ?? DRUGS[id].base;
    return Math.floor(base * (DRUGS[id].base >= 480 ? 1.35 : 0.75));
  };

  function fence() {
    return shopPanel(game, {
      title: "Eddie Two-Boats' Discreet Acquisitions", speaker: 'Eddie Two-Boats', width: 820,
      intro: '"Two boats. One\'s for fishin\'. The other one\'s for... also fishin\'. For TVs. In the ocean. Don\'t worry about it." Eddie pays better than the pawn shop for hot goods, <b>premium for the rare stuff</b>, and he never calls the cops (they call him).',
      sections: () => {
        const p = st.p;
        const hot = Object.keys(p.inventory).filter((id) => p.inventory[id] > 0 && isHot(id));
        const drugs = DRUG_ORDER.filter((id) => (p.drugs[id] || 0) > 0);
        return [
          { name: 'Hot goods (he buys)', products: hot.map((id) => ({
            name: `${name(id)} ×${p.inventory[id]}`, desc: ITEMS[id]?.desc ?? '', priceLabel: `${$(fenceValue(id))} ea`, btn: 'Sell all',
            buy: () => { const n = st.itemCount(id); if (!n) return false; st.removeItem(id, n); st.addMoney(fenceValue(id) * n, 'fence'); isle(game).fenceSold += n; sfx(game, 'cash'); game.bus.emit('island:fenced', { id, qty: n }); return true; },
          })) },
          { name: 'Product (offshore rates — no heat)', products: drugs.map((id) => ({
            name: `${DRUGS[id].name} ×${p.drugs[id]}`, desc: DRUGS[id].base >= 480 ? 'Eddie\'s eyes light up. "The good stuff. Pirates LOVE this."' : '"Street trash. I\'ll take it, but I\'m not happy about it."', priceLabel: `${$(drugBuy(id))} ea`, btn: 'Sell all',
            buy: () => { const n = p.drugs[id] || 0; if (!n) return false; st.addDrug(id, -n); st.addMoney(drugBuy(id) * n, 'drugs'); p.totals.drugsSold = (p.totals.drugsSold || 0) + n; sfx(game, 'cash'); game.bus.emit('drug:sold', { drugId: id, qty: n, price: drugBuy(id), district: 'blackwater' }); if (chance(0.3)) st.addStat('karma', -1); return true; },
          })) },
          { name: 'Exotic hardware (no questions, no receipts)', products: [...EXOTIC_WEAPONS, 'smg', 'shotgun'].filter((w) => WEAPONS[w]).map((w) => {
            const d = WEAPONS[w];
            const price = Math.round(d.price * (EXOTIC_WEAPONS.includes(w) ? 1 : 1.3));
            return {
              name: d.name, price, owned: p.weapons.includes(w),
              desc: `${d.kind === 'gun' ? `Gun · ${d.damage} dmg · ${d.mag}-round mag · ${d.ammo} ammo` : `Melee · ${d.damage} dmg${d.reqStr ? ` · needs ${d.reqStr} STR` : ''}`}. ${{ harpoon: 'For whales. Or "whales".', flaregun: 'Sets things on fire. Signals boats. Ruins birthdays.', anchor: 'A literal anchor on a chain. Swing it. Commit to it.', cutlass: 'Arrr. Comes with no eyepatch. Eyepatch sold separately (also stolen).', smg: 'Off the back of a pirate.', shotgun: 'Sawed off by a guy named Two-Saws.' }[w] ?? ''}`,
              buy: () => {
                if (p.weapons.includes(w)) return false;
                if (game.sysShops?.buyWeapon) return game.sysShops.buyWeapon(w, price);
                if (!st.spend(price, 'weapon')) return false;
                game.combat?.giveWeapon?.(w, d.ammo ? d.mag * 4 : 0); game.combat?.equip?.(w);
                return true;
              },
            };
          }) },
        ];
      },
      footer: 'Ammo for the exotics: harpoon uses heavy rounds, flare pistol uses shotgun shells. Eddie doesn\'t sell ammo. "I\'m a boutique."',
    });
  }

  game.locations.register('isle_cove', (g, loc) => placeMenu(g, loc, {
    hours: [19, 6],
    speaker: 'Eddie Two-Boats',
    closed: () => 'A man in a captain\'s hat is "fishing" with no hook, staring at the horizon. "Cove\'s closed, pal. It\'s a cove. It\'s for lookin\' at. Come back after dark."',
    text: () => pick([
      'A tarp lean-to full of crates stenciled "DEFINITELY NOT GUNS" and "TVs (WET)". Eddie Two-Boats — gold teeth, captain\'s hat, flip-flops with socks — counts cash by lantern light. "Customer! Or a cop. Customers smile more."',
      'Waves lap at a beach made of 40% sand and 60% things nobody wanted. Eddie is arguing with a rowboat full of guys in balaclavas about the price of a jet ski. He waves you over. "One sec, these are my cousins."',
    ]),
    options: () => [
      { label: 'Do business', run: () => fence() },
      { label: 'Ask Eddie about the island', run: () => say(g, loc.name, pick([
        '"The Pen? I visit my uncle every Sunday. Bring him a cake with a little something in it. Not a file — files are old school. Cigarettes. Cigarettes are currency in there, man."',
        '"Funland closed \'cause of the Incident. Nobody talks about it. I talk about it, but nobody listens. Ask the lighthouse guy. Bring booze."',
        '"Ferry captain owes me money. Bridge troll owes me money. The fish owe me money. Everybody on this rock owes Eddie."',
      ]), 'Eddie Two-Boats') },
    ],
  }));

  // ================================================================ Blackwater Pen — visiting room
  const inmate = (id) => { const s = isle(game); return (s.inmates[id] ??= { visits: 0, gifts: 0 }); };

  async function visit(loc) {
    const s = isle(game);
    if (s.bannedDay === game.time.day) return say(game, loc.name, 'Guard: "YOU. You\'re banned for the day. Contraband. Don\'t make me say contraband again, I hate that word."', 'Officer Krumm');
    const pickI = await choose(game, {
      title: 'Who are you visiting?', html: 'A clipboard of inmates who\'ve agreed to visitors. Several entries just say "NO."',
      choices: INMATES.map((m) => ({ label: m.name, hint: `${m.crime}${inmate(m.id).visits ? ` · visits: ${inmate(m.id).visits}` : ''}`, value: m.id })),
    });
    if (!pickI) return;
    const m = INMATES.find((x) => x.id === pickI);
    const rec = inmate(m.id);
    game.time.advance(30);
    rec.visits++;
    st.changed('island');
    if (m.id === 'giggles' && rec.visits >= 1) game.state.setFlag('isle_claw_trick', true);
    const tip = m.tips[(rec.visits - 1) % m.tips.length];
    const rumor = chance(0.5) ? `<br><br>"Also, word from the yard: <em>${game.market?.rumor?.(0.85) ?? 'prices are crazy out there'}</em>"` : '';
    const opts = [{ label: 'Nod and leave' }];
    const wantName = name(m.want);
    const canSmuggle = st.hasItem(m.want);
    opts.unshift({ label: `Smuggle in ${wantName}`, hint: canSmuggle ? 'risky · pays well' : `you have no ${wantName}`, disabled: !canSmuggle || s.smuggleDay === game.time.day });
    const i = await game.ui.dialog({
      title: `Visiting: ${m.name}`, speaker: m.name,
      html: `${rec.visits === 1 ? m.hello + '<br><br>' : ''}${m.name} leans to the glass. "${tip}"${rumor}<br><br><span class="sys-hint">They could really use some <b>${wantName}</b>. Hint hint. Wink wink. The guard is picking his nose.</span>`,
      options: opts,
    });
    st.addXP(3);
    if (i === 0 && canSmuggle) return smuggle(loc, m);
  }

  async function smuggle(loc, m) {
    const s = isle(game);
    const p = st.p;
    s.smuggleDay = game.time.day;
    const value = ITEMS[m.want]?.price ?? 20;
    // risk: heat makes guards nervous; charm and the nap hour help
    let risk = 0.32 + p.heat * 0.08 - Math.min(0.2, p.cha * 0.004);
    if (game.time.hour === 15) risk -= 0.15; // Lenny's tip: the guards nap at 3PM
    risk = clamp(risk, 0.06, 0.8);
    st.removeItem(m.want, 1);
    if (chance(risk)) {
      st.addHeat(2);
      s.bannedDay = game.time.day;
      const fine = Math.min(p.money, 100 + value * 2);
      if (fine > 0) st.addMoney(-fine, 'fine');
      st.addStat('karma', -1);
      game.bus.emit('island:smuggle', { ok: false, inmate: m.id });
      return say(game, 'BUSTED', `Officer Krumm's hand slaps the glass. "CONTRABAND!" He says it like a sneeze. You're fined <b>${$(fine)}</b>, banned for the day, and the cops on the mainland just got a phone call. <b>+2 heat.</b><br><br>${m.name} mouths "worth it" through the glass.`, 'Officer Krumm');
    }
    const pay = Math.round(Math.max(120, value * rand3()) + p.cha * 2);
    st.addMoney(pay, 'smuggle');
    inmate(m.id).gifts++;
    st.addStat('karma', -1);
    game.bus.emit('island:smuggle', { ok: true, inmate: m.id, pay });
    sfx(game, 'cash');
    return say(game, 'Smuggled', `${pick(['You palm it through the slot while sneezing loudly.', 'You hide it in a hollowed-out Bible. The guard respects the Bible. The guard should not.', 'You slip it into a birthday card. It\'s not anyone\'s birthday. The guard sings anyway.'])} ${m.name} wires you <b>${$(pay)}</b> from "a friend outside". You do not ask which friend.`, m.name);
  }
  const rand3 = () => 4 + Math.random() * 4;

  game.locations.register('isle_prison', (g, loc) => placeMenu(g, loc, {
    hours: [9, 18],
    speaker: 'Officer Krumm',
    closed: () => 'Visiting hours are over. A guard in the tower points a searchlight at you and keeps it there. For a long time. Too long.',
    text: () => pick([
      'A grey room with a grey desk and a grey guard. Officer Krumm — mustache like a push broom, belly like a mortgage — doesn\'t look up from his crossword. "Name. Who you\'re seein\'. Empty your pockets. Not you, sir, you can keep your pockets."',
      'Plexiglass, phones on curly cords, and a vending machine that only sells sadness and one Snickers from 2009. Officer Krumm: "No contact, no cake, no funny business. Especially no funny business. We got a clown in here already."',
    ]),
    options: () => [
      { label: 'Visit an inmate', hint: '30 min', run: () => visit(loc) },
      { label: 'Ask Officer Krumm about the prison', run: () => say(g, loc.name, pick([
        '"Blackwater Pen. Maximum security, minimum budget. The walls are eight feet tall and the wire\'s electrified. Mostly. On weekdays."',
        '"Nobody\'s ever escaped. Well. Two guys. And the clown, once, for an afternoon. He came back on his own. Said the outside was \'too sad\'."',
        '"I\'ve been a guard here twenty years. I\'m basically doin\' time too. Except I get a pension. And a crossword."',
      ]), 'Officer Krumm') },
    ],
  }));

  return { fishPrice, fence };
}
