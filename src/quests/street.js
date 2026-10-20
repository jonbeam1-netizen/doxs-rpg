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
        const amt = (g.state.getFlag('raccoon_capo') ? 200 : 80) + Math.round(Math.random() * 70);
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
    // ---------------------------------------------------------------- round 6 encounters
    {
      id: 'umbrella', w: 4, req: () => ['rain', 'storm'].includes(g.world?.weather),
      color: '#2a3a5a', hat: 'cap', hatColor: 0x1a2a4a,
      async run() {
        const price = g.world?.weather === 'storm' ? 40 : 20;
        const i = await say('Surge Pricing', 'UMBRELLA ULYSSES', [
          '> A man in a trench coat made entirely of umbrellas steps out of a doorway. He is perfectly dry. You are not.',
          `Umbrella? ${fmtMoney(price)}. Yesterday they were two bucks. Yesterday it wasn't raining. That's economics, baby.`,
        ], [
          { label: `Buy one (${fmtMoney(price)})`, hint: '+energy, stay dry', disabled: !g.state.canAfford(price) },
          { label: 'Haggle', hint: 'CHA 18' },
          { label: 'Snatch one and run', hint: '-karma' },
          { label: 'Stay wet. Wet builds character.' },
        ]);
        if (i === 0 && g.state.spend(price, 'umbrella')) { g.state.addStat('energy', 10); after('It\'s a good umbrella. It lasts eleven minutes, then the wind turns it into modern art. Still: eleven dry minutes.', 'good'); }
        if (i === 1) {
          if (p().cha >= 18 && g.state.spend(5, 'umbrella')) { g.state.addStat('energy', 10); after('"Five bucks? FIVE? You\'re killing me." He sells it anyway. He respects a shark. Even a soggy one.', 'good'); }
          else after('"The price just went up. Because of the attitude. That\'s also economics."', 'bad');
        }
        if (i === 2) { g.state.addStat('karma', -2); g.state.addStat('energy', 6); after('You grab one and sprint. He doesn\'t chase you. He just opens a new umbrella. He has hundreds. He has a system.', 'bad'); }
        if (i === 3) { g.state.addStat('energy', -4); if (chance(0.5)) g.state.addStat('cha', 0.3, 'wet t-shirt'); after('You stay wet. A woman under an awning looks at you, looks at your soaked shirt, and nods slowly. Huh.'); }
      },
    },
    {
      id: 'fan', w: 4, req: () => (g.state.getFlag('endings', []) || []).length > 0,
      color: '#6a4a7a', hat: 'cap', hatColor: 0xe0c040,
      async run() {
        const ends = g.state.getFlag('endings', []) || [];
        const T = { kingpin: 'King of the Gutter', corporate: 'CEO of Rot', mayor: 'Mayor', escape: 'Lid-Lifter', hobo: 'King of the Crust' }[ends[ends.length - 1]] || 'the Plunger';
        const i = await say('A Fan!', 'SUPERFAN', [
          '> Somebody shrieks. A guy in a homemade T-shirt with your stick-figure face on it is running at you, holding a marker.',
          `OH MY GOD. It's the ${T}! I made this shirt! I made eleven! Sign it! Sign ME! Sign my mom! She's at home but I'll bring her!`,
        ], [
          { label: 'Sign his shirt', hint: '+CHA' },
          { label: 'Sign his forehead', hint: 'permanent marker' },
          { label: 'Charge him $20 for the autograph', hint: '+$20, -karma' },
          { label: '"You have me confused with someone else."' },
        ]);
        if (i === 0) { g.state.addStat('cha', 0.5, 'fame'); after('He weeps. He will never wash the shirt. You can already tell he has never washed the shirt.', 'good'); }
        if (i === 1) { g.state.addStat('karma', 1); after('You sign his forehead. He asks you to add "BEST FRIEND". You do. He has to go to a job interview tomorrow. He doesn\'t care.', 'good'); }
        if (i === 2) { g.state.addMoney(20, 'autograph'); g.state.addStat('karma', -1); after('He pays $20 without blinking. He\'s already selling it on the corner for $40. Capitalism: you\'ve mastered it.', 'money'); }
        if (i === 3) after('"...You\'re right. You\'re way uglier in person." He leaves. Fame is fleeting. Insults are forever.', 'bad');
      },
    },
    {
      id: 'recruiter', w: 2, day: true,
      color: '#c8c8c0', hat: 'cap', hatColor: 0x2a2a6a,
      async run() {
        const knows = !!g.state.getFlag('knows_lid');
        const i = await say('Grimco Rewards', 'GRIMCO RECRUITER', [
          '> A smiling man in a Grimco polo blocks the sidewalk with a folding table, a banner that says GRIMCO CITIZEN REWARDS, and a smile that has never once reached his eyes.',
          knows ? '...Wait. *He checks a tablet. His smile freezes.* You\'re flagged. You KNOW, don\'t you. About the... *he whispers* ...the L-word. Here. Fifty dollars. Please forget you saw me. Again.' : 'Sign up for Grimco Citizen Rewards! Earn points every time you pay rent, breathe smog, or eat Meat Loaf! Redeem points for more Meat Loaf!',
        ], knows ? [
          { label: 'Take the fifty and "forget"', hint: '+$50' },
          { label: '"I remember everything. Tell your boss."', hint: '+karma' },
        ] : [
          { label: 'Sign up', hint: '+$10 gift card, Grimco knows your name' },
          { label: 'Flip the table', hint: 'STR 15' },
          { label: '"No thanks."' },
        ]);
        if (knows) {
          if (i === 0) { g.state.addMoney(50, 'hush money'); after('He hands you fifty dollars in a Grimco envelope labeled "MEMORY ADJUSTMENT (VOLUNTARY)". You remember it anyway.', 'money'); }
          if (i === 1) { g.state.addStat('karma', 2); after('He packs up his table in nine seconds flat and speed-walks away, speaking urgently into his collar.', 'good'); }
          return;
        }
        if (i === 0) { g.state.addMoney(10, 'Grimco rewards'); g.state.setFlag('grimco_watchlist', true); after('You get a Grimco Rewards card and $10. The card has a camera in it. You\'re pretty sure the card has a camera in it.'); }
        if (i === 1) {
          if (p().str >= 15) { g.state.addStat('karma', 2); g.state.addStat('cha', 0.3, 'table flip'); after('You flip the table. Pamphlets everywhere. A hobo applauds. A pigeon steals a pen.', 'good'); }
          else { g.state.damage(4, 'table'); after('You try to flip the table. It\'s bolted to the sidewalk. Of course it is. Grimco owns the sidewalk.', 'bad'); }
        }
      },
    },
    {
      id: 'grandpa', w: 2, day: true,
      color: '#8a8070', hat: 'fedora', hatColor: 0x5a4a3a,
      async run() {
        const i = await say('Lost', 'CONFUSED OLD MAN', [
          '> A very old man in a very old suit is turning in slow circles on the corner, holding a car key from 1987.',
          'Excuse me, young... stick. I parked my Buick right here. In 1987. Have you seen it? It\'s brown. Everything was brown back then. It still is, I suppose.',
        ], [
          { label: 'Help him look', hint: '+karma, 30 minutes' },
          { label: 'Sell him "directions to 1987" ($20)', hint: 'CHA 15 · -karma' },
          { label: '"Sir, it\'s been towed. For thirty years."' },
        ]);
        if (i === 0) {
          g.time.advance(30); g.state.addStat('karma', 3);
          if (chance(0.5)) { g.state.addMoney(20, '1987 twenty'); after('You find his Buick two blocks away, buried under parking tickets. He tips you a twenty from 1987. It\'s still good. Money\'s money.', 'good'); }
          else after('You never find the Buick. You find his house, though. His wife hugs you. She thought he was at the Buick.', 'good');
        }
        if (i === 1) {
          if (p().cha >= 15) { g.state.addMoney(20, 'scam'); g.state.addStat('karma', -4); after('You point him toward Highway 9 and take his twenty. Highway 9 loops back to Gutterside. He\'ll be back. They always come back.', 'bad'); }
          else after('"Young man, I was running cons before your parents met. Nice try." He swats you with a hat and leaves.', 'bad');
        }
        if (i === 2) after('He takes it surprisingly well. "Thirty years? Huh. Explains the parking tickets." He wanders off toward a bus stop that has also been closed since 1987.');
      },
    },
    {
      id: 'spouse', w: 2, req: () => !g.state.getFlag('street_spouse'),
      color: '#7a3a3a', hat: 'beanie', hatColor: 0xe0a0c0,
      async run() {
        g.state.setFlag('street_spouse', true);
        const i = await say('Remember Me?', 'BRENDA', [
          '> A woman in a wedding veil, a tank top and one high heel taps you on the shoulder. She is holding a marriage certificate written on a Rusty Nail napkin.',
          'Honey! It\'s me! Brenda! We got married! The night you climbed the bunker fence! You were shirtless, crying about the sky, and you proposed to me with a bottle cap. It was BEAUTIFUL. Where have you BEEN?',
        ], [
          { label: 'Pay $50 to "annul" the napkin', hint: '$50', disabled: !g.state.canAfford(50) },
          { label: '"Brenda. Let\'s give it a shot."', hint: 'romance?' },
          { label: 'Inspect the napkin closely', hint: 'INT 18' },
        ]);
        if (i === 0 && g.state.spend(50, 'annulment')) after('She tears the napkin in half, kisses you on the cheek, and leaves. "It was fun while you were blackout drunk," she says. It was, apparently.');
        if (i === 1) {
          const l = Math.min(60, p().money);
          g.state.addMoney(-l, 'honeymoon');
          g.state.addStat('cha', 0.5, 'marriage');
          after(`You take Brenda for a honeymoon at the Greasy Spoon. It's lovely. She leaves to "powder her nose" and never comes back. Neither does ${fmtMoney(l)}. You're divorced now. You think.`, 'bad');
        }
        if (i === 2) {
          if (p().int >= 18) { g.state.addMoney(20, 'scam bust'); after('The napkin says "Brenda + ________". The blank is filled in with whatever name the guy said last. She does this to every drunk in Gutterside. She pays you $20 to keep quiet.', 'money'); }
          else { const l = Math.min(30, p().money); g.state.addMoney(-l, 'alimony'); after(`You squint at it. It looks legit. You pay ${fmtMoney(l)} in "alimony" to make her go away. You were never married. You'll never know that.`, 'bad'); }
        }
      },
    },
    {
      id: 'shakedown', w: 2, day: true,
      color: '#1a2440', hat: 'cop', hatColor: 0x141c30,
      async run() {
        const mayor = !!g.state.getFlag('ending_mayor');
        const owed = !!g.state.getFlag('lardner_owes');
        if (mayor || owed) {
          await say('Officer Dooley', 'OFFICER DOOLEY', [
            '> A cop with powdered sugar on his badge steps in front of you, hand out. "Sidewalk tax, pal. Twenty-five bucks for walkin\'—" He squints at you.',
            mayor ? 'MAYOR! Your Honor! I wasn\'t... this isn\'t... I was collecting for the orphans! There are no orphans! I\'ll go now! *He salutes and runs into a lamppost.*' : 'Oh. You\'re the one who got the Chief\'s wallet back. My bad. Have a donut. On the house. The house is the evidence locker.',
          ], [{ label: 'Carry on, officer.' }]);
          if (owed && !mayor) g.state.addStat('energy', 6);
          return;
        }
        const i = await say('Sidewalk Tax', 'OFFICER DOOLEY', [
          '> A cop with powdered sugar on his badge steps in front of you, hand out.',
          'Sidewalk tax, pal. Twenty-five bucks for walkin\' on a public sidewalk. Fifty if you\'re walkin\' funny. You\'re walkin\' a little funny.',
        ], [
          { label: 'Pay the "tax" ($25)', disabled: !g.state.canAfford(25) },
          { label: '"There\'s no sidewalk tax."', hint: '+1 heat' },
          { label: 'Talk your way out of it', hint: 'CHA 22' },
          { label: 'Offer him a donut', hint: 'needs a donut', disabled: !g.state.hasItem('donut') },
        ]);
        if (i === 0 && g.state.spend(25, 'sidewalk tax')) after('He pockets it. "Receipt?" he asks. "No," he answers. He walks off whistling.', 'bad');
        if (i === 1) { g.state.addHeat(1); g.state.addStat('karma', 1); after('"Oh, there is NOW." He writes you a ticket for "contempt of sidewalk". Then he follows you for a block, just to be annoying.', 'bad'); }
        if (i === 2) {
          if (p().cha >= 22) { g.state.addStat('cha', 0.3); after('You explain the Rotwell Municipal Code to him in detail. He gets bored, then sleepy, then leaves. Knowledge is power. Boredom is a weapon.', 'good'); }
          else { g.state.addMoney(-Math.min(50, p().money), 'sidewalk tax'); after('Your speech was weak. "That\'s the walkin\'-funny rate," he says, and takes fifty.', 'bad'); }
        }
        if (i === 3) { g.state.removeItem('donut', 1); after('His eyes go soft. "...Glazed?" He takes it with both hands like a holy relic. "Have a nice day, citizen." He means it.', 'good'); }
      },
    },
    {
      id: 'snatcher', w: 2,
      async run() {
        const FOOD = ['cold_burrito', 'roller_dog', 'pizza_slice', 'donut', 'chips', 'diner_special', 'steak'];
        const food = FOOD.find((id) => g.state.hasItem(id));
        const what = food ? (g.items?.name?.(food) || 'snack') : 'five dollars';
        const i = await g.ui.dialog({ title: 'Raccoon!', html: nar([
          `A raccoon drops from an awning, lands on your shoulder, and snatches your ${what}. It sits on a trash can three feet away and looks at you. It does not run. It doesn't need to.`,
        ]), options: [
          { label: 'Chase it', hint: '-10 energy' },
          { label: 'Fight it for your stuff', hint: 'STR 12' },
          { label: 'Let it have it. It earned it.', hint: '+karma' },
        ] });
        const lose = () => { if (food) g.state.removeItem(food, 1); else g.state.addMoney(-Math.min(5, p().money), 'raccoon'); };
        if (i === 0) { g.state.addStat('energy', -10); if (chance(0.35)) after('You chase it for four blocks. It gets bored and drops your stuff. You win. You are very sweaty.', 'good'); else { lose(); after('It leads you through three dumpsters and a laundromat. You lose it. You lose your dignity. The raccoon gains a following.', 'bad'); } }
        if (i === 1) { if (p().str >= 12) after('You stare it down. It drops your stuff, hisses, and leaves with a look that says "this isn\'t over". It isn\'t. Raccoons remember.', 'good'); else { lose(); g.state.damage(4, 'raccoon'); after('The raccoon wins. Decisively. In front of witnesses. One of them takes a photo.', 'bad'); } }
        if (i === 2) {
          lose(); g.state.addStat('karma', 1);
          if (g.state.getFlag('raccoon_friend')) { g.state.addMoney(25, 'the family'); after('The raccoon recognizes you. It tips an invisible hat, then leaves $25 on the trash can. Courtesy of the family, Cousin.', 'money'); }
          else after('The raccoon eats it in front of you, slowly, maintaining eye contact. You feel like you just paid a tax. You did.');
        }
      },
    },
    {
      id: 'rivalgang', w: 3, req: () => !!q.faction(),
      color: '#5a1020', hat: 'fedora', hatColor: 0x2a0a12,
      async run() {
        const f = q.faction();
        const enemy = f === 'rats' ? 'Velvet Syndicate' : 'Gutter Rats';
        const i = await say(`${enemy} Trouble`, f === 'rats' ? 'VELVET GOON' : 'RAT PUNK', [
          f === 'rats' ? '> A man in a crushed-velvet tracksuit blocks your path, sniffing the air theatrically. "Do you SMELL that? Smells like sewer. Smells like... a Gutter Rat."' : '> A skinny guy in a stained tank top spits on your shoe. "Nice suit, Velvet. Smells like your mom\'s perfume. She left it at my place."',
          'This block is ours. You wanna walk it, you pay the toll. Fifty bucks. Or we dance.',
        ], [
          { label: 'Pay the $50 toll', hint: '-rep', disabled: !g.state.canAfford(50) },
          { label: 'Dance (fight)', hint: 'brawl · +rep if you win' },
          { label: 'Name-drop your boss', hint: 'CHA 25' },
        ]);
        if (i === 0 && g.state.spend(50, 'toll')) { q.addRep(f, -1); after('He takes the money and laughs. Somewhere, your boss feels a disturbance.', 'bad'); }
        if (i === 1) {
          removeActor();
          const won = await q.brawl({ count: 2, kind: 'gang', tier: 2, label: `${enemy} Punks` });
          if (won) { q.addRep(f, 3); after('They limp off. Word will get around. Your crew will hear about it by dinner.', 'good'); }
        }
        if (i === 2) {
          if (p().cha >= 25) { q.addRep(f, 1); after(`You mention ${f === 'rats' ? 'Big Sal' : 'the Contessa'} by name, slowly, while smiling. He goes pale and finds somewhere else to be.`, 'good'); }
          else { g.state.addMoney(-Math.min(50, p().money), 'toll'); after('"Never heard of \'em." He takes fifty and your confidence.', 'bad'); }
        }
      },
    },
    {
      id: 'nightbus', w: 2, night: true,
      async run() {
        const D = ['downtown', 'gutterside', 'hilltop', 'rustyards', 'dustbowl'];
        const here = (() => { const pp = q.playerPos(); try { return g.world?.districtAt?.(pp.x, pp.z); } catch { return null; } })();
        if (here === 'blackwater') return;
        const dest = pick(D.filter((d) => d !== here));
        const i = await g.ui.dialog({ title: 'The Night Bus', html: nar([
          'A bus pulls up. A real Rotwell city bus. It has not run since the mayor\'s third term. The headlights flicker. The driver has no eyebrows and a very calm smile.',
          `The sign on the front says ${q.districtName(dest).toUpperCase()}. Then it says NOWHERE. Then ${q.districtName(dest).toUpperCase()} again.`,
        ]), options: [
          { label: `Get on ($2) — ride to ${q.districtName(dest)}`, hint: 'fast travel, probably', disabled: !g.state.canAfford(2) },
          { label: 'Absolutely not' },
        ] });
        if (i !== 0 || !g.state.spend(2, 'bus fare')) { if (i === 1) after('The bus doors close. It drives off. It has no license plate. It has no wheels. You decide you didn\'t see that.'); return; }
        removeActor();
        g.time.advance(20);
        const pt = q.districtPoint(dest);
        try { g.player.spawn(pt.x, pt.z, g.player.facing || 0); } catch (e) { console.error('[quests] night bus', e); }
        after(pick([
          `The ride takes twenty minutes. Nobody else is on the bus. Everybody else is on the bus. You get off in ${q.districtName(dest)} and it's gone before you turn around.`,
          `A man in the back row eats an entire rotisserie chicken without blinking. You get off in ${q.districtName(dest)}. You will never speak of the chicken.`,
        ]));
      },
    },
    {
      id: 'gull', w: 4, day: true, req: () => { const pp = q.playerPos(); try { return g.world?.districtAt?.(pp.x, pp.z) === 'blackwater'; } catch { return false; } },
      async run() {
        const fish = Object.keys(p().inventory || {}).find((id) => id.startsWith('fish_') && id !== 'fish_rustjaw' && g.state.itemCount(id) > 0);
        const i = await g.ui.dialog({ title: 'Seagull!', html: nar([
          fish ? `A seagull the size of a dog lands on your head, grabs your ${g.items?.name?.(fish) || 'fish'}, and takes off. Then it lands on a post right in front of you to eat it. Taunting.` : 'A seagull the size of a dog lands in front of you and screams. Just screams. It wants something. It wants EVERYTHING.',
        ]), options: [
          { label: 'Throw a rock', hint: 'STR 10' },
          { label: 'Scream back', hint: 'CHA' },
          { label: 'Accept your place in the food chain' },
        ] });
        if (i === 0) { if (p().str >= 10) after('BONK. The gull drops everything and leaves, furious. It will tell the other gulls. They will remember.', 'good'); else { if (fish) g.state.removeItem(fish, 1); after('You miss. The rock hits a tourist. The gull laughs. Gulls can laugh. You didn\'t know that until now.', 'bad'); } }
        if (i === 1) { g.state.addStat('cha', 0.3, 'dominance'); if (fish && chance(0.5)) g.state.removeItem(fish, 1); after('You scream. The gull screams. A local joins in. Now the whole pier is screaming. It\'s cathartic. It\'s Blackwater.'); }
        if (i === 2) { if (fish) g.state.removeItem(fish, 1); g.state.addStat('karma', 1); after('The gull eats in peace. It nods at you. A gull\'s respect is the only respect on this island that\'s free.'); }
      },
    },
    {
      id: 'lenny', w: 3, req: () => !!g.state.getFlag('lenny_free'),
      color: '#6a5a3a', hat: 'beanie', hatColor: 0x3a3a3a,
      async run() {
        g.state.heal?.(20); g.state.addStat('energy', 20);
        await say('Best Friend!', 'BIG LENNY', [
          '> A dumpster lid flips open. Big Lenny Two-Times pops out, beaming, holding half a sandwich.',
          'BEST FRIEND! I been hiding in dumpsters! It\'s like the Pen but with better food! Here! I saved you half! I licked it to keep it safe!',
        ], [{ label: 'Eat the sandwich. Friendship is sacrifice.' }]);
        after('It\'s actually a great sandwich. Lenny waves and closes the lid. "SEE YOU IN ANOTHER DUMPSTER!" (+20 HP, +20 energy)', 'good');
      },
    },
    {
      id: 'hypeman', w: 3, req: () => !!g.state.getFlag('chet_hype'),
      color: '#c8c0b0', hat: 'tophat', hatColor: 0xa02a2a,
      async run() {
        const i = await say('Your Hype Man', 'CHET PLUNGERTON', [
          '> Chet Plungerton sprints up behind you with a megaphone and a plunger crown.',
          'LADIES AND GENTLEMEN AND PIGEONS! THE ONE! THE ONLY! THE REAL PLUNGER! *He points at you.* THIS GUY UNCLOGS!',
        ], [{ label: 'Wave to the crowd', hint: '+CHA' }, { label: '"Chet, please. I\'m buying milk."' }]);
        if (i === 0) { g.state.addStat('cha', 0.5, 'hype'); after('Three people clap. One of them is Chet. One is a pigeon. It counts.', 'good'); }
        else after('"HE\'S BUYING MILK, PEOPLE! THE PLUNGER DRINKS MILK! STRONG BONES! STRONG UNCLOGGING!" It does not stop for a block and a half.');
      },
    },
  ];

  let lastHour = -999;
  // Never shove a modal in the player's face mid-fight, mid-chase, mid-heist, on a board,
  // right after a time skip, or while they're walking up to a quest objective.
  function busy(hoursPassed) {
    if (hoursPassed > 2) return true;
    if (g.combat?.inBrawl?.() || (p().heat || 0) >= 1 || g.heists?.active || g.skate?.on) return true;
    const pp = g.player.group.position;
    if ((g.npcs?.near?.(pp.x, pp.z, 25) || []).some((n) => n.hostile && !n.dead)) return true;
    try {
      for (const id of q.activeIds()) for (const t of q.targets(id)) if (Math.hypot(t.x - pp.x, t.z - pp.z) < 30) return true;
    } catch { /* ignore */ }
    return false;
  }

  g.bus.on('time:hour', ({ hoursPassed } = {}) => {
    if (!g.started || !g.player || g.player.dead || g.player.vehicle || g.ui.isBlocking() || !g.state.getFlag('intro_done')) return;
    if (busy(hoursPassed)) return;
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
