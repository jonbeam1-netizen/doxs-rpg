import { createStickman } from '../entities/stickman.js';
import { pick, chance, fmtMoney, weightedPick } from '../core/util.js';

// Random street encounters triggered on 'time:hour' with a cooldown. Each
// spawns a throwaway stick figure in front of you and opens a dialog.

export function installStreetEvents(game, q) {
  const g = game;
  let actor = null, actorT = 0;
  const p = () => g.state.p;
  const nar = (t) => q.fmt((Array.isArray(t) ? t : [t]).map((l) => (l.startsWith('> ') || l.startsWith('@ ') ? l : '> ' + l)));
  const say = (title, speaker, text, options) => g.ui.dialog({ title, speaker, html: q.fmt(Array.isArray(text) ? text : [text]), options });
  const after = (text, kind = 'info') => g.ui.toast(text, kind, 4600);

  function spawnActor(color = '#2a2a2a', hat = null, hatColor = 0x2a2420) {
    removeActor();
    const pl = g.player; if (!pl) return;
    const f = pl.facing;
    const x = pl.group.position.x + Math.sin(f) * 2.2, z = pl.group.position.z + Math.cos(f) * 2.2;
    const r = g.physics.resolveCircle(x, z, 0.45);
    const m = createStickman({ color, hat, hatColor });
    m.group.position.set(r.x, 0, r.z);
    m.group.rotation.y = Math.atan2(pl.group.position.x - r.x, pl.group.position.z - r.z);
    g.scene.add(m.group);
    actor = m; actorT = 25;
  }
  function removeActor() { if (actor) { actor.dispose(); actor = null; } }

  const EVENTS = [
    {
      id: 'preacher', w: 3, day: true,
      color: '#3a2a1a', hat: 'tophat',
      async run() {
        const i = await say('Street Preacher', 'BROTHER DOOMSDAY', [
          '> A man in a sandwich board reading "THE END IS NIGH (TUESDAY, AROUND LUNCH)" blocks your path.',
          'REPENT, SINNER! The Lid shall crack and the Smog shall fall and the RENT shall be DUE! Have you accepted the Great Plunger into your heart?',
        ], [
          { label: 'Toss him $5', hint: '+1 karma', disabled: !g.state.canAfford(5) },
          { label: 'Heckle him', hint: 'CHA' },
          { label: '"Wait, the Great Plunger?"' },
          { label: 'Walk away' },
        ]);
        if (i === 0 && g.state.spend(5)) { g.state.addStat('karma', 1); after('He blesses you with a wet thumb on the forehead. It smells like relish.', 'good'); }
        if (i === 1) {
          if (p().cha >= 15) { g.state.addStat('cha', 0.5); after('You out-preach the preacher. A small crowd follows YOU now. You lose them at a hot dog cart.', 'good'); }
          else after('He curses your descendants\' plumbing. You feel a gurgle somewhere deep inside you.', 'bad');
        }
        if (i === 2) await say('Street Preacher', 'BROTHER DOOMSDAY', ['The prophecy! A hobo told me! He said "a plunger walks among us" and then asked for a dollar! ...Wait. Is it YOU? *He drops to his knees.* UNCLOG US, LORD.'], [{ label: 'Back away slowly' }]);
      },
    },
    {
      id: 'rolex', w: 3,
      color: '#1a1a2a', hat: 'fedora',
      async run() {
        const i = await say('Psst!', 'WATCH GUY', [
          '> A man opens his jacket. It\'s lined with forty wristwatches. Several are still ticking. One is screaming.',
          'Genuine Rolecks, my friend. Not Rolex. ROLECKS. Totally different lawyer. Forty bucks. It tells time AND fortunes.',
        ], [
          { label: 'Buy one ($40)', disabled: !g.state.canAfford(40) },
          { label: 'Haggle', hint: 'CHA 12' },
          { label: 'Pass' },
        ]);
        if (i === 0 && g.state.spend(40)) { q.giveItem('q_fake_watch'); after('It tells the right time twice a day. Which is twice more than the bus schedule.'); }
        if (i === 1) {
          if (p().cha >= 12 && g.state.spend(15)) { q.giveItem('q_fake_watch'); after('Fifteen bucks! He calls you a "shark". He means it as a compliment. You think.', 'good'); }
          else after('"Forty is my final price. My kids gotta eat. My kids are also watches."', 'bad');
        }
      },
    },
    {
      id: 'flasher', w: 2, night: true,
      color: '#5a4a30', hat: 'fedora', hatColor: 0x3a2a1a,
      async run() {
        const i = await say('A Man in a Trench Coat', 'TRENCH COAT GUY', [
          '> A man in a long trench coat sidles up. "Wanna see something?" Before you can answer, he throws the coat open.',
          '> It\'s lined with hot dogs. Dozens of them, in little elastic loops. And also — briefly, regrettably — him. You\'ve seen more impressive things in a cocktail-weenie multipack.',
          'Hot dogs, three bucks. The other thing\'s not for sale.',
        ], [
          { label: 'Buy a hot dog ($3)', disabled: !g.state.canAfford(3) },
          { label: 'Punch him', hint: 'STR' },
          { label: 'Scream and run' },
        ]);
        if (i === 0 && g.state.spend(3)) { g.state.addStat('hp', 10); g.state.addStat('energy', 8); after('It\'s warm. You choose not to think about why it\'s warm.'); }
        if (i === 1) {
          if (p().str >= 10) { g.state.addStat('karma', 2); after('One punch. He flees, coat flapping, shedding hot dogs like a sad piñata. The pigeons feast.', 'good'); }
          else { g.state.damage(5, 'hot dog'); after('He blocks with a hot dog and slaps you with another. You lost a fight to processed meat.', 'bad'); }
        }
        if (i === 2) g.state.addStat('energy', -5);
      },
    },
    {
      id: 'mugger', w: 3, night: true,
      color: '#202020', hat: 'beanie',
      async run() {
        const take = Math.min(Math.round(p().money * 0.2), 400);
        const i = await say('Mugging!', 'MUGGER', [
          '> A guy with a knife and a ski mask steps out of an alley. The ski mask has a pom-pom. It\'s hard to take seriously. The knife is easy to take seriously.',
          `Wallet. Now. And I want the good wallet, not the decoy wallet. I know about the decoy wallet.`,
        ], [
          { label: `Hand over ${fmtMoney(take)}`, hint: '20% of your cash' },
          { label: 'Fight him', hint: 'brawl' },
          { label: 'Talk him out of it', hint: 'CHA 20' },
          { label: 'Run', hint: '-10 energy' },
        ]);
        if (i === 0) { g.state.addMoney(-take, 'mugged'); after('He takes it, then gives you a dollar back "for the bus". There is no bus.', 'bad'); }
        if (i === 1) {
          removeActor();
          const won = await q.brawl({ count: 1, kind: 'thug', tier: 1, label: 'Pom-Pom Mugger' });
          if (won) { const loot = 20 + Math.round(Math.random() * 80); g.state.addMoney(loot, 'reverse mugging'); after(`You reverse-mugged a mugger: ${fmtMoney(loot)} and a pom-pom.`, 'money'); }
        }
        if (i === 2) {
          if (p().cha >= 20) { g.state.addMoney(15, 'pity'); after('You talk about his dreams. He cries. He gives YOU fifteen bucks and leaves to "find himself". In Hilltop. Good luck, buddy.', 'good'); }
          else { g.state.addMoney(-take, 'mugged'); after('Your speech was bad. He mugs you twice as hard, emotionally.', 'bad'); }
        }
        if (i === 3) g.state.addStat('energy', -10);
      },
    },
    {
      id: 'tourist', w: 2, day: true,
      color: '#6a8aa0', hat: 'cap', hatColor: 0xd0c8b0,
      async run() {
        const i = await say('Lost Tourist', 'TOURIST', [
          '> A man in a fanny pack, socks with sandals, and a camera around his neck squints at a map of a completely different city.',
          'Excuse me! Which way is the nice part of Rotwell?',
        ], [
          { label: '"There isn\'t one."', hint: '+CHA' },
          { label: 'Give him honest directions to Hilltop', hint: '+karma' },
          { label: 'Rob him', hint: '+$, -karma, heat' },
        ]);
        if (i === 0) { g.state.addStat('cha', 0.5); after('He laughs. Then he stops laughing. Then he checks his return ticket. It\'s for Highway 9. Uh oh.'); }
        if (i === 1) { g.state.addStat('karma', 2); after('He thanks you and gives you a keychain shaped like a city he\'ll never see again.', 'good'); }
        if (i === 2) { g.state.addMoney(60, 'tourist'); g.state.addStat('karma', -8); g.state.addHeat(1); after('You take his $60 and his dignity. He takes a photo of you. It\'s a nice photo. The cops will love it.', 'bad'); }
      },
    },
    {
      id: 'wallet', w: 2,
      async run() {
        const i = await g.ui.dialog({ title: 'Dropped Wallet', html: nar([
          'You spot a wallet on the sidewalk: $120, a library card, and a photo of a family of five in matching Grimco polos, all smiling like hostages.',
        ]), options: [{ label: 'Keep the cash', hint: '+$120, -karma' }, { label: 'Turn it in to the PD', hint: '+karma' }] });
        if (i === 0) { g.state.addMoney(120, 'found wallet'); g.state.addStat('karma', -5); after('You keep it. The photo family keeps smiling. Forever. At you.'); }
        if (i === 1) { g.state.addStat('karma', 6); after('You drop it at the PD. Chief Lardner pockets the cash in front of you. Well. YOUR conscience is clean.', 'good'); }
      },
    },
    {
      id: 'magician', w: 2, day: true,
      color: '#3a1a3a', hat: 'tophat',
      async run() {
        const i = await say('Street Magic', 'THE AMAZING GERALDO', ['Pick a card! Any card! *He fans out a deck. You notice his other hand drifting toward your pocket.*'], [
          { label: 'Pick a card' }, { label: 'Grab his wrist', hint: 'INT 18' }, { label: 'No thanks' },
        ]);
        if (i === 0) { const l = Math.min(15, p().money); g.state.addMoney(-l, 'magic'); after(`"Is THIS your card?" It's your library card. Also, ${fmtMoney(l)} has vanished. Truly amazing.`, 'bad'); }
        if (i === 1) {
          if (p().int >= 18) { g.state.addMoney(30, 'caught a pickpocket'); after('You catch him mid-lift. He pays you $30 to not tell the Magicians\' Guild. There is a Magicians\' Guild. It\'s terrifying.', 'money'); }
          else { const l = Math.min(25, p().money); g.state.addMoney(-l, 'magic'); after('You grab his wrist. It\'s a fake wrist. His real hand already has your money. Bravo.', 'bad'); }
        }
      },
    },
    {
      id: 'survey', w: 2, day: true,
      color: '#c8c8c0', hat: 'cap', hatColor: 0x2a2a6a,
      async run() {
        const i = await say('Grimco Survey', 'GRIMCO SURVEYOR', ['Hi! Grimco Customer Experience Survey! On a scale of one to ten, how much do you LOVE Grimco? Wrong answers will be noted. And remembered. Forever.'], [
          { label: '"Ten. Eleven. A million."', hint: '+$10' }, { label: '"One."', hint: 'brave' }, { label: '"What\'s the Lid?"' },
        ]);
        if (i === 0) { g.state.addMoney(10, 'survey'); after('He gives you a $10 Grimco gift card. It can only be spent on Grimco. Everything is Grimco.'); }
        if (i === 1) { g.state.addStat('karma', 1); g.state.setFlag('grimco_watchlist', true); after('He writes your name down very slowly while staring into your eyes. Then he underlines it.', 'bad'); }
        if (i === 2) { after('His smile freezes. He walks away. Very fast. Without blinking. His clipboard says "TRIGGER WORD DETECTED".', 'bad'); }
      },
    },
    {
      id: 'raccoon', w: 3, req: () => !!g.state.getFlag('raccoon_friend'),
      async run() {
        const amt = 80 + Math.round(Math.random() * 70);
        g.state.addMoney(amt, 'the family');
        await g.ui.dialog({ title: 'A Gift from the Family', html: nar([`A raccoon in a tiny fedora waddles up, drops ${fmtMoney(amt)} at your feet, tips its hat, and waddles off. Courtesy of Don Trashcanzo. Cousin Garbage is never forgotten.`]), options: [{ label: 'Tip your hat back' }] });
      },
    },
    {
      id: 'proposal', w: 1, night: true,
      color: '#4a3020',
      async run() {
        const i = await say('A Drunk Approaches', 'RUDY', ['> A drunk man gets down on one knee. He\'s holding a ring made from a beer can tab.', 'You... you\'re the most beautiful stick I ever saw. Marry me. Or lend me a dollar. Either. Both?'], [
          { label: '"Yes."' }, { label: 'Lend him a dollar', disabled: !g.state.canAfford(1) }, { label: 'Step over him' },
        ]);
        if (i === 0) { q.giveItem('q_beer_ring'); after('He passes out happy. You\'re technically engaged now. Congratulations?', 'good'); }
        if (i === 1 && g.state.spend(1)) { g.state.addStat('karma', 1); after('He bites the dollar, declares you his best man, and wanders off to marry a lamppost.'); }
      },
    },
    {
      id: 'pigeon', w: 2, day: true,
      async run() {
        const r = Math.random();
        if (r < 0.5) { g.state.addStat('cha', -0.5); after('A pigeon poops on your head with sniper accuracy. A passerby says that\'s good luck. Then a second pigeon does it. "That\'s bad luck," she says, and leaves.', 'bad'); }
        else { g.state.addMoney(5, 'pigeon'); after('A pigeon drops a $5 bill at your feet and stares at you. You feel like you now owe the pigeons something. They feel it too.', 'money'); }
      },
    },
    {
      id: 'hotdog', w: 2,
      color: '#d0c8b0', hat: 'cap', hatColor: 0xc43a1a,
      async run() {
        const i = await say('Weiner Walt\'s Cart', 'WEINER WALT', ['Hot dogs! Hot dogs! Five bucks! Made from one hundred percent dog! ...HOT dog! Hot DOG! The emphasis matters!'], [
          { label: 'Buy one ($5)', hint: '+energy', disabled: !g.state.canAfford(5) }, { label: 'Pass' },
        ]);
        if (i === 0 && g.state.spend(5)) { g.state.addStat('energy', 15); g.state.addStat('hp', 5); after('Delicious. Suspicious. Deliciously suspicious.'); }
      },
    },
    {
      id: 'gangbro', w: 2, req: () => !!q.faction(),
      color: '#3a4a20', hat: 'cap',
      async run() {
        const f = q.faction();
        if (f === 'rats') {
          g.state.addMoney(50, 'Sal');
          await say('Gutter Rats', 'RAT KID', ['Yo! Sal says you\'re doin\' good. He said give you this. Fifty bucks. I was supposed to give you sixty. Don\'t tell him.'], [{ label: 'Thanks, kid' }]);
        } else {
          g.state.addMoney(75, 'Velvet');
          await say('Velvet Syndicate', 'VELVET COURIER', ['The Contessa sends her regards and a small token of appreciation. Seventy-five dollars, perfumed. Please don\'t spend it on anything tacky.'], [{ label: 'Spend it on something tacky' }]);
        }
      },
    },
    {
      id: 'hugs', w: 1, day: true,
      color: '#8a6a4a',
      async run() {
        const i = await say('FREE HUGS', 'HUG GUY', ['> A guy holding a cardboard sign that says FREE HUGS opens his arms wide. His fingers are... wiggling. Suspiciously.'], [{ label: 'Accept the hug' }, { label: '"Hands where I can see them."', hint: 'INT 15' }]);
        if (i === 0) { const l = Math.min(20, p().money); g.state.addMoney(-l, 'hug tax'); g.state.addStat('karma', 1); after(`It's a genuinely great hug. Also ${fmtMoney(l)} is gone. Worth it? ...Kinda worth it.`); }
        if (i === 1) { if (p().int >= 15) after('He sighs, lowers his arms, and hands back three wallets that aren\'t yours. You return them. Mostly.', 'good'); else { const l = Math.min(20, p().money); g.state.addMoney(-l, 'hug tax'); after('He hugs you anyway. Aggressively. Your wallet is lighter. Your heart, oddly, too.', 'bad'); } }
      },
    },
  ];

  let lastHour = -999;
  g.bus.on('time:hour', () => {
    if (!g.started || !g.player || g.player.dead || g.player.vehicle || g.ui.isBlocking() || !g.state.getFlag('intro_done')) return;
    const nowH = Math.floor(g.time.total / 60);
    if (nowH - lastHour < 3) return;
    const cooldown = g.state.getFlag('street_cd', 0) || 0;
    if (g.time.total < cooldown) return;
    if (!chance(0.28)) return;
    const night = g.time.isNight;
    const pool = EVENTS.filter((e) => (!e.night || night) && (!e.day || !night) && (!e.req || e.req()));
    if (!pool.length) return;
    const ev = weightedPick(pool.map((e) => [e, e.w]));
    lastHour = nowH;
    g.state.setFlag('street_cd', g.time.total + 180);
    trigger(ev);
  });

  async function trigger(ev) {
    try {
      if (ev.color) spawnActor(ev.color, ev.hat || null, ev.hatColor ?? 0x2a2420);
      await ev.run();
    } catch (e) { console.error('[quests] street event failed', ev.id, e); }
    actorT = Math.min(actorT, 6);
  }

  g.addSystem({
    name: 'quest-street',
    update(dt) {
      if (!actor) return;
      actorT -= dt;
      actor.animate(dt, 0, {});
      const pp = g.player?.group?.position;
      if (actorT <= 0 || (pp && Math.hypot(pp.x - actor.group.position.x, pp.z - actor.group.position.z) > 40)) removeActor();
    },
  });

  return { trigger: (id) => { const ev = EVENTS.find((e) => e.id === id); if (ev) trigger(ev); }, events: EVENTS };
}
