// Assorted places: Madame Ooze (fortune), Scrapper Pete's Junkyard, The Greasy Spoon (diner),
// Rotwell Meat & Rendering (factory), Grimco Tower (office).
import { ITEMS } from '../data/items.js';
import { DRUGS } from '../data/drugs.js';
import { DISTRICTS } from '../data/locations.js';
import { fmtMoney, pick, chance, rand, randInt, clamp } from '../core/util.js';
import { today, train, byTime, activity } from './common.js';
import { placeMenu, say, choose, shopPanel } from './ui-kit.js';

export function installPlaces(game) {
  const st = game.state;
  const sfx = (n) => game.sysSfx?.play(n);

  // ================= FORTUNE TELLER =================
  function prophecy(exact) {
    const ev = game.market?.nextEvent?.();
    if (!ev) return exact ? 'The crystal ball shows... nothing. Fog. A pigeon. "Tomorrow the market sleeps," she whispers. "Prices drift like a drunk on a boat."' : null;
    const up = ev.mult > 1;
    const name = DRUGS[ev.drug]?.name ?? ev.drug;
    const where = ev.district ? DISTRICTS[ev.district]?.name : 'all of Rotwell';
    if (exact) return `The ball swirls purple. "Tomorrow... <b>${name}</b>... ${up ? 'becomes <b class="sys-up">RARE and PRICEY</b>' : 'floods the streets, <b class="sys-down">CHEAP as sin</b>'}... in <b>${where}</b>. For ${ev.days} day${ev.days > 1 ? 's' : ''}. The spirits also say you need a haircut."`;
    return `"I see... ${up ? 'a shortage' : 'a great glut'} of something ${pick(['sparkly', 'powdery', 'buzzing', 'sad', 'expensive'])}... '${name.split(' ')[0]}' something... soon."`;
  }

  game.locations.register('fortune', (g, loc) => placeMenu(g, loc, {
    hours: [14, 4],
    speaker: 'Madame Ooze',
    closed: () => 'A beaded curtain hangs over a locked door. A sign: "MADAME OOZE SEES ALL. EXCEPT BEFORE 2PM. SHE IS SLEEPING."',
    text: () => {
      const p = st.p;
      const aura = p.karma >= 40 ? 'golden, like a fresh pancake' : p.karma >= 10 ? 'a nice, mild beige' : p.karma > -20 ? 'murky, like dishwater' : p.karma > -50 ? 'brown. Deeply brown.' : 'black as a dealer\'s heart';
      return `${pick([
        'Incense so thick you can chew it. Madame Ooze sits behind a crystal ball that is clearly a fishbowl with a lightbulb in it. Her eyes roll back. "I\'ve been expecting you." She says this to everyone.',
        'A cat with one eye watches you from a shelf of skulls. Madame Ooze shuffles tarot cards with fingernails as long as chopsticks.',
        'Madame Ooze is eating a hot dog. "The spirits are hungry," she explains. "I\'m the spirits."',
      ])}<br><br>"Your aura is ${aura}."`;
    },
    options: () => {
      const p = st.p;
      const t = today(g);
      return [
        { label: 'Palm reading', hint: '$15', run: async () => {
          if (!st.spend(15, 'fortune')) return;
          g.time.advance(15);
          let txt = pick([
            '"Your lifeline is long. Your love line is short. Your money line... is that a stain?"',
            '"You will meet a tall, dark stranger. He will steal your wallet. Hide your wallet."',
            '"I see great wealth in your future. Not YOURS. Just nearby. You\'ll be able to see it."',
            '"Beware the man with two necks." (What? What does that mean?) "You\'ll know."',
            '"Your hand is very sweaty. That is not a prophecy. That\'s just gross."',
          ]);
          const hint = chance(0.5) ? prophecy(false) : null;
          if (hint) txt += `<br><br>${hint}`;
          if (p.karma <= -30 && chance(0.3) && !g.sysFx.has('cursed')) {
            g.sysFx.add({ id: 'cursed', min: 2880 });
            txt += '<br><br><b class="ui-bad">Her eyes go white. "YOUR SINS STINK." She curses you. Lady Luck has blocked your number for two days.</b>';
          }
          return say(g, 'Palm Reading', txt, 'Madame Ooze');
        } },
        { label: 'Gaze into the crystal ball', hint: t.ball ? 'once a day' : '$75 · tomorrow\'s market', disabled: !!t.ball, run: async () => {
          if (!st.spend(75, 'fortune')) return;
          t.ball = true;
          g.time.advance(20);
          return say(g, 'Crystal Ball', prophecy(true), 'Madame Ooze');
        } },
        { label: 'Tarot reading', hint: '$40', run: async () => {
          if (!st.spend(40, 'fortune')) return;
          g.time.advance(20);
          const cards = ['The Hobo', 'The Rat King', 'Three of Burritos', 'The Pawn Shop (Reversed)', 'The Gold Tooth', 'Death (Just Kidding)', 'The Tower (Grimco)', 'Ace of Cops'];
          let h = null;
          try { h = g.quests?.hint?.(); } catch (e) { /* optional */ }
          const job = g.jobs?.current?.();
          const advice = h || pick([
            job ? `"Your job at ${job.def?.name ?? 'work'}... keep going. A promotion sniffs at your heels like a dog."` : '"The cards say: get a job, you bum."',
            p.str < 30 ? '"The cards say: lift. Your arms are noodles. The cards are worried."' : '"Your strength is great. Your judgment... less so."',
            p.int < 30 ? '"The cards say: read a book. Any book. Even a cereal box."' : '"Your mind is sharp. Sharp enough to cut yourself on."',
            '"The Pit in the Rustyards calls to you. Or that\'s indigestion."',
          ]);
          return say(g, 'Tarot', `She flips three cards: <b>${pick(cards)}</b>, <b>${pick(cards)}</b>, <b>${pick(cards)}</b>.<br><br>${advice}`, 'Madame Ooze');
        } },
        g.sysFx.has('cursed') ? { label: 'Lift your curse', hint: '$200', run: () => { if (st.spend(200, 'curse')) { g.sysFx.remove('cursed'); return say(g, 'Curse Lifted', 'She waves a dead chicken over your head and spits on your shoes. "It is done." You feel lighter. Your shoes feel wetter.', 'Madame Ooze'); } } } : null,
        { label: 'Buy a lucky rabbit\'s foot', hint: '$100 · casino luck for a day', run: () => g.items.buy('lucky_foot', 1, 100) },
        { label: 'Love potion', hint: '$60 · +5 Charm for 2h', run: () => { if (st.spend(60)) { g.sysFx.add({ id: 'love_potion', label: 'Love potion', min: 120, temp: { cha: 5 } }); sfx('gulp'); return say(g, 'Love Potion', 'It tastes like cherry cough syrup and a little like feet. "Works on everyone," she says. "Except me. I am immune to your nonsense."', 'Madame Ooze'); } } },
      ];
    },
  }));

  // ================= JUNKYARD =================
  const JUNK_PAY = { scrap_metal: 1, copper_wire: 1, junk_watch: 0.6, duct_tape: 0.5, stolen_tv: 0.4, gold_tooth: 0.5 };
  game.locations.register('junkyard', (g, loc) => placeMenu(g, loc, {
    hours: [6, 21],
    speaker: 'Scrapper Pete',
    closed: () => 'The junkyard gate is chained. Mr. Chompers, the junkyard dog, presses his face to the fence and growls a low, wet growl. He remembers you.',
    text: () => byTime(g, {
      morning: 'Scrapper Pete is eating beans out of a hubcap. "Mornin\'. Mr. Chompers already ate. Probably. Keep your hands close."',
      day: 'Mountains of rusted cars shimmer in the heat. Pete is crushing a minivan and singing opera. Badly. Mr. Chompers howls along.',
      evening: 'The sun sets over a pyramid of washing machines. It\'s almost beautiful. Then a raccoon screams.',
      night: 'Pete is drinking from a gas can. "It\'s moonshine. Or gas. Same thing at this point."',
    }),
    options: () => {
      const p = st.p;
      const owned = (p.cars || []).some((c) => c.carId === 'rustbucket');
      return [
        { label: 'Dig through the junk', hint: '2h · -20 energy', run: async () => {
          if (!activity(g, { minutes: 120, energy: 20 })) return;
          const found = {};
          const n = 1 + Math.floor(p.str / 25) + randInt(0, 2);
          for (let i = 0; i < n; i++) {
            const r = Math.random();
            const k = r < 0.55 ? 'scrap_metal' : r < 0.72 ? 'copper_wire' : r < 0.82 ? 'junk_watch' : r < 0.92 ? 'duct_tape' : r < 0.97 ? 'cold_burrito' : 'gold_tooth';
            found[k] = (found[k] || 0) + 1;
          }
          for (const [k, q] of Object.entries(found)) st.addItem(k, q);
          train(g, 'str', 0.5, 'junkyard');
          let extra = '';
          if (chance(0.06)) {
            const w = pick(['bat', 'crowbar', 'bottle', 'knife']);
            if (!p.weapons.includes(w)) {
              if (g.combat?.giveWeapon) g.combat.giveWeapon(w); else { p.weapons.push(w); st.changed('weapons'); }
              extra = `<br><b class="ui-good">You also found a ${w === 'bottle' ? 'broken bottle' : w}! Q to switch weapons.</b>`;
            }
          }
          if (chance(0.15)) { st.damage(8, 'junk'); extra += '<br><em>Mr. Chompers nips your butt. Not hard. Just enough to establish dominance.</em>'; }
          return say(g, 'Digging', `${pick(['You crawl through a dead station wagon. There\'s a family photo inside. Everyone in it looks sad.', 'You dig through a fridge. It still smells like 1998.', 'You find a mannequin arm. It\'s holding a smaller mannequin arm. You don\'t ask.'])}<br><br>Found: ${Object.entries(found).map(([k, q]) => `${q}× ${ITEMS[k].name}`).join(', ')}${extra}`);
        } },
        { label: 'Sell scrap to Pete', run: () => shopPanel(g, {
          title: 'Pete\'s Scale', speaker: 'Scrapper Pete', intro: '"Toss it on the scale. Don\'t mind the thumb. That\'s my thumb. It\'s always there."',
          sections: () => [{ products: Object.keys(JUNK_PAY).filter((k) => st.itemCount(k) > 0).map((k) => {
            const each = Math.max(1, Math.floor(ITEMS[k].price * JUNK_PAY[k]));
            return {
              name: ITEMS[k].name, desc: `You have ${st.itemCount(k)}.`, priceLabel: `${fmtMoney(each)} ea`, btn: 'Sell all',
              buy: () => { const q = st.itemCount(k); st.removeItem(k, q); st.addMoney(each * q, 'scrap'); sfx('cash'); },
            };
          }) }],
          footer: 'Got nothing to sell? Dig through the piles first.',
        }) },
        { label: 'Buy "The Rustbucket"', hint: owned ? 'you already own one (one is plenty)' : '$450 · it (mostly) runs', disabled: owned, run: async () => {
          if (!(await g.ui.confirm('Pete pats a car that is 70% rust and 30% duct tape. "She\'s a beauty. Brakes work on Tuesdays. $450, no refunds, no warranty, no questions, no airbags." Buy it?', { title: 'The Rustbucket' }))) return;
          if (!g.vehicles?.giveCar) return say(g, 'Junkyard', 'Pete: "Hold on, the car lot paperwork guy ain\'t here. Come back later." (Vehicles not available.)', 'Scrapper Pete');
          if (!st.spend(450, 'car')) return;
          g.vehicles.giveCar('rustbucket');
          return 'leave';
        } },
        { label: 'Pet Mr. Chompers', run: () => {
          const t = today(g);
          if (t.chompers) return say(g, 'Mr. Chompers', 'Mr. Chompers has had enough of you for one day. He shows you exactly how many teeth he has. It\'s a lot.');
          t.chompers = true;
          if (chance(0.5)) { st.addStat('karma', 1); return say(g, 'Mr. Chompers', 'Mr. Chompers rolls over. You rub his belly. For a moment, the junkyard is a beautiful place. +1 karma.'); }
          st.damage(10, 'dog');
          return say(g, 'Mr. Chompers', 'Mr. Chompers bites your hand, then licks it, then bites it again. Pete: "That means he likes ya!"');
        } },
        ...g.jobs.options('scrapper'),
      ];
    },
  }));

  // ================= DINER =================
  function eat(name, price, energy, hp, text) {
    if (!st.spend(price, 'food')) return;
    game.time.advance(20);
    st.addStat('energy', energy);
    if (hp > 0) st.heal(hp); else if (hp < 0) st.damage(-hp, 'food');
    return say(game, name, text, 'Big Marge');
  }
  game.locations.register('diner', (g, loc) => placeMenu(g, loc, {
    hours: [5, 23],
    speaker: 'Big Marge',
    closed: () => 'The Greasy Spoon is closed. Through the window, you see a rat mopping the floor. It\'s doing a better job than the day guy.',
    text: () => byTime(g, {
      morning: 'Big Marge slaps a coffee in front of you before you sit down. "You look like garbage, sugar. Eat something." The coffee is 40% grounds.',
      day: 'Truckers, cops, and a guy in a bathrobe who\'s been here since Tuesday. Marge yells "ORDER UP" at nobody in particular.',
      evening: 'The dinner rush: seniors with coupons and teenagers with fake IDs. The pie case has a pie in it that has a pie inside it.',
      night: 'Late-night diner vibes: drunks soaking up booze with hash browns, a hooker reading Dostoevsky, Marge chain-smoking over the fryer.',
    }),
    options: () => [
      { label: 'Coffee', hint: '$2 · +12 energy', run: () => eat('Coffee', 2, 12, 0, pick(['It\'s so strong it walks to the table by itself.', 'Marge refills it without asking. And again. And again. You can hear your heartbeat in your teeth.'])) },
      { label: 'Mystery Meat Platter', hint: '$9 · +34 energy', run: () => eat('Mystery Meat Platter', 9, 34, 10, pick(['It tastes like chicken. And pork. And something that was never on a farm.', 'Marge: "It\'s beef." It isn\'t. "It\'s beef." Okay.'])) },
      { label: 'Heart Attack Breakfast', hint: '$13 · +55 energy · -HP', run: () => eat('Heart Attack Breakfast', 13, 55, -5, 'Six eggs, a pound of bacon, pancakes fried in bacon, and gravy on all of it. Your arteries file a restraining order. Delicious.') },
      { label: 'Slice of pie', hint: '$4 · +10 energy', run: () => eat('Pie', 4, 10, 3, pick(['Cherry pie. There\'s a pit in it. Marge: "That\'s how ya know it\'s homemade." It\'s from a box.', 'Apple pie. It\'s actually good. Suspiciously good. Don\'t question it.'])) },
      { label: 'Get food to go', run: () => shopPanel(g, { title: 'Greasy Spoon — To Go', speaker: 'Big Marge', sections: [{ products: ['diner_special', 'coffee', 'hangover_cure', 'cold_burrito', 'steak'].map((id) => ({ name: ITEMS[id].name, desc: ITEMS[id].desc, price: ITEMS[id].price, qty: true, buy: (q) => g.items.buy(id, q) })) }] }) },
      { label: 'Gossip with Marge', run: () => {
        g.time.advance(15);
        const r = g.market?.rumor?.(0.8);
        return say(g, 'Big Marge', `${pick(['"You didn\'t hear it from me, sugar, but..."', '"My cousin\'s husband\'s parole officer says..."', '"The truckers been talkin\'..."'])} ${r ? `"${r}"` : '"Nothin\'. Quiet week. Too quiet."'}`, 'Big Marge');
      } },
      ...(g.lifestyle?.placeOptions?.('greasy_spoon') || []),
      ...g.jobs.options('diner'),
    ],
  }));

  // ================= FACTORY =================
  game.locations.register('factory', (g, loc) => placeMenu(g, loc, {
    hours: [5, 23],
    speaker: 'Foreman Gristle',
    closed: () => 'The plant is closed for "cleaning". The cleaning is a guy with a hose. You can hear him crying.',
    text: () => `${pick([
      'The smell hits you like a truck made of other trucks. Conveyor belts carry things you\'d rather not identify. Somewhere, a bone saw whines.',
      'Foreman Gristle, a man shaped like a refrigerator wearing a hairnet, wipes his hands on an apron that\'s seen things. "You here to work or to faint? People do both."',
      'A sign reads "DAYS WITHOUT AN ACCIDENT: 0". Someone has written "LOL" beneath it in what you hope is ketchup.',
    ])}<br><span class="sys-hint">Hard labor. Builds STR fast. Needs STR to get hired.</span>`,
    options: () => [
      ...g.jobs.options('factory'),
      { label: 'Buy "employee meat" cheap', hint: '$15 · a steak (probably)', run: () => g.items.buy('steak', 1, 15) },
      { label: 'Take the plant tour', hint: '30 min', run: () => { g.time.advance(30); return say(g, 'Plant Tour', pick(['The tour guide shows you where hot dogs come from. You become a vegetarian for 11 minutes.', 'You see the "Rendering Room". You will never un-see the Rendering Room. You hear it in your dreams.', 'Gristle shows you the meat grinder he calls "Big Bertha\'s Little Sister". He pats it like a dog.'])); } },
    ],
  }));

  // ================= OFFICE =================
  game.locations.register('office', (g, loc) => placeMenu(g, loc, {
    hours: [7, 19],
    speaker: 'Deborah from Reception',
    closed: () => 'Grimco Tower is locked. On the 40th floor, one light is on. Mr. Grimsby never goes home. Some say he sleeps in a filing cabinet.',
    text: () => {
      const job = g.jobs.current();
      return `${pick([
        'Grimco Tower: forty floors of glass, beige carpet and despair. A motivational poster in the lobby says "SYNERGY". Someone has added "IS A LIE".',
        'Deborah from Reception doesn\'t look up from her solitaire. "Do you have an appointment? No? Then you can wait. Forever."',
        'The elevator plays a muzak version of a death metal song. Middle managers in identical khakis shuffle past like zombies.',
      ])}${job?.id === 'office' ? `<br><br><em>Your badge says "${job.title}". Deborah still doesn't know your name.</em>` : ''}`;
    },
    options: () => {
      const p = st.p;
      const t = today(g);
      const rank = p.job?.id === 'office' ? p.job.rank : -1;
      return [
        ...g.jobs.options('office'),
        { label: 'Free "Leadership" seminar', hint: '2h · +INT/CHA', run: async () => {
          if (!activity(g, { minutes: 120, energy: 10 })) return;
          train(g, 'int', 0.5, 'seminar', 50);
          train(g, 'cha', 0.4, 'seminar');
          return say(g, 'Seminar', 'A man in a headset paces a stage yelling "WHAT\'S YOUR WHY?" You don\'t know your why. You eat six free muffins. That\'s your why.');
        } },
        rank >= 0 ? { label: 'Steal office supplies', hint: t.supplies ? 'once a day' : 'karma -1', disabled: !!t.supplies, run: () => {
          t.supplies = true;
          st.addStat('karma', -1);
          const k = pick(['duct_tape', 'coffee', 'coffee', 'chips', 'newspaper']);
          st.addItem(k, randInt(1, 3));
          return say(g, 'Supply Closet', `You stuff your pockets with ${ITEMS[k].name}s and 400 paperclips. Nobody notices. Nobody ever notices you here.`);
        } } : null,
        rank >= 3 ? { label: 'Executive washroom', hint: 'VP perk', run: () => { g.time.advance(20); st.addStat('energy', 15); g.sysFx.add({ id: 'fresh', min: 360, temp: { cha: 2 } }); return say(g, 'Executive Washroom', 'Marble. Gold faucets. A man whose only job is to hand you a towel and compliment your shoes. You have never felt more powerful. +energy, Fresh.'); } } : null,
      ];
    },
  }));

  return {};
}
