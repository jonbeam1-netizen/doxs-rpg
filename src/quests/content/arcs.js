// Relationship arcs (follow-ups for recurring side characters), post-game epilogue quests
// (one per ending) and the secret quest that opens once you've seen three endings.
import { pay, gate, leave, fight } from '../../data/quests.js';

const visited = (q) => (q.sd.points || []).filter((p) => p.done).length;
const endingsSeen = (g) => (g.state.getFlag('endings', []) || []).length;
const giveAmmo = (g, type, n) => { try { g.combat?.giveAmmo?.(type, n); } catch { /* ignore */ } };

export const ARC_QUESTS = {
  // ===================================================================== RELATIONSHIP ARCS
  // Pickles + Madame Ooze (after "Love in Bunker 9")
  side_wedding: {
    kind: 'side', title: 'Bunker Bells', giver: 'pickles',
    rumor: 'That bunker guard and the fortune teller are getting hitched. The guard\'s looking for a best man. Or a best anybody.',
    summary: 'Corporal Pickles is going to propose to Madame Ooze. He wants you as his best man. He has never been to a wedding. He has seen one on TV.',
    available: (g) => g.quests.isDone('side_letter'),
    offer: [
      { who: 'nar', t: ['> Corporal Pickles is pacing in front of the gate. He has combed his helmet.'] },
      ['Buddy. Buddy! The date at the Greasy Spoon went great. She read my palm. Then my other palm. Then she held both of them. For like an hour. Gus charged us rent.', 'I\'m gonna propose. And I want YOU as my best man. I don\'t have any other men. I have a lawn chair and the bunker.'],
    ],
    reward: { money: 500, karma: 6, stats: { cha: 2 }, xp: 300, flags: { pickles_married: true } },
    rewardText: '$500, +2 CHA, +6 karma, a slice of bunker wedding cake',
    steps: [
      {
        text: 'A proposal needs a ring. Get one from Lucky Larry\'s Pawn in Gutterside.',
        obj: { type: 'talk', who: 'larry' },
        talk: [
          { t: ['A ring? For the bunker guard and the one-eyed fortune teller? *He wipes away a tear.* That\'s beautiful. That\'s three hundred dollars beautiful.'],
            choices: [
              pay(300, 'Buy the ring ($300)'),
              { label: 'Trade him your Beer-Tab Engagement Ring', hint: 'from Rudy the drunk', if: (g) => g.state.hasItem('q_beer_ring'), hide: (g) => !g.state.hasItem('q_beer_ring'), do: (g) => { g.quests.takeItem('q_beer_ring'); },
                then: ['A genuine Rudy! He\'s proposed to half of Gutterside with these. They\'re collector\'s items. Deal. *He engraves the real ring for free: "U R MY BUNKER".*'] },
              { ...gate('cha', 30, 'Remind Larry about the rug. And Gerald.', 'advance', ['*He goes very pale.* ...Take the ring. Take it. We never talked about rugs. Rugs don\'t exist.']), hide: (g) => !g.quests.isDone('side_rug') },
              leave('Not right now.'),
            ] },
        ],
        onDone: (g) => g.quests.giveItem('q_ring'),
      },
      {
        text: 'Make sure Madame Ooze will say yes. Visit her tent in Gutterside. Be subtle.',
        obj: { type: 'talk', who: 'ooze' },
        talk: [
          ['> Before you can say a word, Madame Ooze holds up one hand. Her glass eye spins.', 'Yes. Tell him yes. I saw it in the cards three weeks ago. I saw the ring, I saw the helmet, I saw a man in a beer-can crown officiating. I saw a fight at a bachelor party. I saw YOU, darling, crying at the back.', '@ I\'m not going to cry.', 'You are going to cry SO much.'],
        ],
      },
      {
        text: 'Throw Pickles a bachelor party at the Rusty Nail after dark. Keep it from getting out of hand.',
        obj: { type: 'brawl', loc: 'rusty_nail', count: 4, kind: 'drunk', tier: 1, label: 'The Bachelor Party (It Got Out of Hand)', night: true, radius: 10 },
        arrive: [{ who: 'nar', t: ['> Pickles has had two beers. He is now shirtless, wearing his helmet, and challenging the entire bar to arm-wrestle. The entire bar accepts. Then the entire bar starts throwing chairs.', '> Your job as best man: calm everyone down. With your fists. Lovingly.'] }],
        win: ['> The bar is quiet. Pickles is asleep on the pool table, hugging the 8-ball. "I love her," he mumbles. "I love you. I love this ball."'],
      },
      {
        text: 'The wedding! Head to Bunker 9 in the Dustbowl.',
        obj: { type: 'goto', loc: 'bunker', radius: 12 },
        arrive: [
          { who: 'nar', t: ['> Folding chairs in front of the razor wire. A plastic flamingo in a gas mask wears a bow tie. Gus catered: hot dogs, arranged in a heart. Big Dale is the DJ. He only has one song. It\'s about trucks.'] },
          (g) => ({ who: 'nar', t: [
            '> Crusty Reg officiates in his beer-can crown. "Dearly beloved. We are gathered here in the shadow of a secret government bunker to join this man and this... medium."',
            g.state.getFlag('ending_escape') ? '> Sunlight pours through the open Lid and lands on the couple like a spotlight. Somebody\'s grandma faints. It\'s the first wedding in Rotwell with actual sunshine.' : '> The bunker hums along to the vows. In B-flat. Somewhere, a Grimco analyst watching on a monitor wipes away a tear and writes it down.',
          ] }),
          { who: 'pickles', t: ['*He opens the ring box. His hands are shaking so hard the ring does a little dance.* Ooze. Ozella. Madame. Will you be my... bunker?'] },
          { who: 'ooze', t: ['I already said yes, you beautiful idiot. Three weeks ago. In my head. *She kisses his helmet.*', '> Everyone cheers. Big Dale plays the truck song. You cry. You cry SO much. Madame Ooze looks at you and mouths "told you".'] },
        ],
        take: 'q_ring',
      },
    ],
  },

  // Brock Hardbody (after "Do You Even Lift?")
  side_brock2: {
    kind: 'side', title: 'Feelings Day', giver: 'brock',
    rumor: 'Brock from the Iron Lung is going through something. He cried at a protein bar commercial. Somebody should check on him.',
    summary: 'Ever since you beat him, Brock Hardbody has been having FEELINGS. He doesn\'t know what to do with them. He wants you to teach him. Then he wants a rematch.',
    available: (g) => g.quests.isDone('side_brock'),
    offer: [
      { who: 'nar', t: ['> Brock is flexing at his reflection. His reflection is crying. So is Brock.'] },
      ['Since you beat me... something broke. In here. *He points at his pec.* Not the pec. Behind the pec. The heart, I think. I didn\'t know I had one. I thought it was a muscle. It IS a muscle. Why is it SAD?', 'Teach me feelings. Then fight me again. I need to know if feelings make you stronger or weaker. *flex* For science.'],
    ],
    reward: { money: 500, weapon: 'sledge', stats: { str: 3 }, xp: 400, flags: { brock_feelings: true } },
    rewardText: '$500, +3 STR, Brock\'s "emotional support" sledgehammer',
    steps: [
      {
        text: (g, q) => `Take Brock on a feelings tour: Madame Ooze's tent, the Public Library and Club Velvet. (${visited(q)}/3)`,
        obj: { type: 'visit', points: [{ loc: 'madame_ooze', label: 'Feelings: the future' }, { loc: 'library', label: 'Feelings: poetry' }, { loc: 'club_velvet', label: 'Feelings: dancing' }], radius: 9 },
        visitText: [
          'Madame Ooze reads Brock\'s palm. "Your aura is... protein." Brock weeps. "That\'s all I\'ve ever wanted to be."',
          'Ms. Shush gives Brock a book of poetry. He reads one about a lonely lighthouse. He bench-presses the bookshelf to cope. "SHHHH," says Ms. Shush. "SORRY," sobs Brock, quietly, holding up a shelf.',
          'At Club Velvet, Brock slow-dances with his reflection in the mirror wall. Then with you. Then with the bouncer. The bouncer cries too. It\'s contagious.',
        ],
      },
      {
        text: (g, q) => `Brock wants to see how a REAL Rotwellian processes feelings: win 2 fights anywhere. (${q.sd.n || 0}/2)`,
        obj: { type: 'event', evt: 'brawl:won', count: 2 },
        marker: { loc: 'the_pit', label: 'The Pit (fight club)' },
        done: '> Brock watches you punch your way through your emotions and nods solemnly. "I see. You put the sad in your fists. Then you give it to someone else. That\'s sharing."',
      },
      {
        text: 'Rematch: fight Brock Hardbody, Emotionally Available, outside the Iron Lung Gym.',
        obj: { type: 'brawl', loc: 'iron_lung', count: 1, kind: 'fighter', tier: 4, label: 'Brock Hardbody (Emotionally Available)', boss: { name: 'Brock (Feelings Mode)', moves: ['combo', 'charge', 'slam'], scale: 1.2, color: '#7a3a2a' } },
        arrive: [{ who: 'brock', t: ['I\'ve been journaling. I\'ve been hydrating. I\'ve been crying in the steam room. I am FULL of feelings now. *flex* LET\'S SEE WHAT THEY DO.'] }],
        win: ['> Brock goes down. He lies on the sidewalk, smiling. "Feelings make you weaker," he says. "But they make losing feel... okay." He hands you his sledgehammer. It has a sticker on it: "IT\'S OKAY TO NOT BE OKAY."'],
      },
    ],
  },

  // Chad Bitsworth (after "HoboCoin to the Moon")
  side_chad2: {
    kind: 'side', title: 'Series A', giver: 'chad',
    rumor: 'Chad from under the overpass has a new app. It\'s for garbage. He says it\'s "disruptive". So is a fart in church.',
    summary: 'Chad Bitsworth survived HoboCoin. Now he\'s pitching DumpsterDash: food delivery, but the food is already in the dumpster. He needs beta testers and a meeting with Grimco.',
    available: (g) => g.quests.isDone('side_hobocoin'),
    offer: [
      { who: 'nar', t: ['> Chad is wearing a turtleneck made from a trash bag. He\'s holding a phone with a cracked screen and a lot of confidence.'] },
      ['Bro. HoboCoin taught me something. Pain. Also: pivot. Introducing DUMPSTERDASH. Like food delivery, but the food is already in a dumpster, so delivery is just... directions.', 'I need three beta testers and one meeting with a whale. The biggest whale in Rotwell. Grimsworth.'],
    ],
    reward: { xp: 350 }, rewardText: 'Equity. Or a hoodie. Or both.',
    steps: [
      {
        text: (g, q) => `Sign up three DumpsterDash beta testers around town. (${visited(q)}/3)`,
        obj: { type: 'visit', points: [{ district: 'gutterside', label: 'Beta tester' }, { district: 'rustyards', label: 'Beta tester' }, { district: 'dustbowl', label: 'Beta tester' }] },
        visitText: [
          'A hobo downloads DumpsterDash on a phone made of a calculator and a dream. He rates it five stars. He finds a half sandwich. It\'s a revolution.',
          'A dock worker signs up, then gives it one star: "Found a crab. Crab found me." Chad calls it "user engagement".',
          'A Dustbowl biker signs up just to leave a review: "my dumpster, my rules". The app crashes. Chad calls that "scaling".',
        ],
      },
      {
        text: 'Pitch DumpsterDash to Chadwick Grimsworth III outside Grimco Tower.',
        obj: { type: 'talk', who: 'grimsworth' },
        talk: [
          (g) => [g.state.getFlag('ending_corporate') ? '> Grimsworth listens to your pitch with the face of a man who now reports to you, or who used to report to you, or who reports to a ficus. "Garbage, delivered. Delicious. I\'ll be honest with you, because I legally have to now."' : '> Grimsworth listens to your pitch while an intern holds an umbrella over him. It isn\'t raining. It might, though. He likes to be ready.',
            'DumpsterDash. Garbage, monetized. Poverty, platformed. *His teeth sparkle so hard a bird hits the window.* I\'ll buy it. Fifty thousand dollars. For the company AND Mr. Bitsworth\'s non-compete. And his soul. Standard terms.'],
          { t: ['Your cut as "advisor" is five thousand. Do we have a deal?'],
            choices: [
              { label: 'Take the deal', hint: '+$5,000', do: (g, q) => { q.data.deal = 'sold'; g.state.addMoney(5000, 'DumpsterDash advisor'); } },
              { ...gate('cha', 30, 'Hold out for more', 'advance', ['*Grimsworth\'s smile flickers for one frame.* Nine thousand. And you will NEVER bring a hobo to my tower again.']), hint: 'needs CHA 30 · +$9,000', do: (g, q) => { q.data.deal = 'sold'; g.state.addMoney(9000, 'DumpsterDash advisor'); } },
              { label: 'Walk out. DumpsterDash stays independent.', hint: '+5 karma', do: (g, q) => { q.data.deal = 'indie'; g.state.addStat('karma', 5); } },
            ] },
        ],
      },
      {
        text: 'Tell Chad how the meeting went. He\'s under the overpass, refreshing an app with three users.',
        obj: { type: 'talk', who: 'chad' },
        talk: [
          (g, q) => (q.data.deal === 'indie'
            ? ['You walked OUT? On GRIMSWORTH? Bro. BRO. *He hugs you so hard his trash-bag turtleneck rips.* We\'re independent. We\'re a cult brand. We have three users and they would DIE for us. One of them almost did. Crab.', '> A week later, DumpsterDash has every hobo in Rotwell on it. Chad pays you in what he calls "revenue". It\'s $800 and a coupon for a free dumpster.']
            : ['They bought it? THEY BOUGHT IT? *He falls to his knees.* I EXITED. I\'m a founder with an EXIT. *His phone buzzes.* ...They shut it down. Immediately. They bought it to kill it. *He stares at the phone.*', 'I got a hoodie, bro. And a dollar. And a non-compete that says I can\'t "think about garbage". I LIVE in garbage. ...This is the best day of my life.']),
        ],
        onDone: (g, q) => { if (q.data.deal === 'indie') { g.state.addMoney(800, 'DumpsterDash'); g.state.setFlag('dumpsterdash_indie'); } else g.state.setFlag('dumpsterdash_sold'); },
      },
    ],
  },

  // Hank Gristlewood (after "Mystery Meat")
  side_hank2: {
    kind: 'side', title: 'Whistle While You Work', giver: 'hank',
    rumor: 'Hank from the meat plant has been looking over his shoulder all week. Grimco "Wellness" vans keep parking outside his house.',
    summary: 'Grimco found out somebody talked about the Meat Loaf. Now a "Wellness Team" is coming for Hank Gristlewood, and he needs help disappearing.',
    available: (g) => g.quests.isDone('side_meat'),
    offer: (() => [
      (g) => ({ who: 'nar', t: [g.state.getFlag('meat_whistle') ? '> Hank is hiding behind a stack of Meat Loaf pallets, wearing a fake mustache over his real mustache.' : '> Hank is waiting for you at the loading dock. He is holding a Meat Loaf sandwich. It is tying its own shoelace. He is not happy.'] }),
      (g) => (g.state.getFlag('meat_whistle')
        ? ['Grimco knows somebody talked to Thorne. They don\'t know it was me. They know it was SOMEBODY with a hairnet on their eyebrows. That\'s just me.', 'There\'s a "Wellness Team" coming to "help me relax". Permanently. I need out.']
        : ['Sneakers and sadness. I found the report in the Grimco trash. "Thank you for your discretion." YOU LIED TO ME.', '...But you\'re the only one who knows the truth, and now Grimco thinks I know too. They\'re sending a "Wellness Team". I hate that it\'s you.']),
      'Please. Help me disappear. I\'ll pay. I\'ve been saving for twenty years. For a boat. I don\'t even like boats.',
    ])(),
    reward: { money: 600, karma: 8, stats: { int: 1 }, xp: 350, flags: { hank_safe: true } },
    rewardText: '$600, +8 karma, a new life for Hank',
    steps: [
      {
        text: 'Protect Hank from the Grimco Wellness Team at the meat plant.',
        obj: { type: 'brawl', loc: 'meat_plant', count: 3, kind: 'thug', tier: 2, label: 'Grimco Wellness Team', radius: 12 },
        arrive: [{ who: 'nar', t: ['> A white van marked GRIMCO EMPLOYEE WELLNESS pulls up. Three men in scrubs step out carrying a yoga mat, a stress ball and a bat. "Mr. Gristlewood! Time for your mindfulness session!"'] }],
        win: ['> The Wellness Team retreats. One of them drops a clipboard: "SUBJECT: GRISTLEWOOD, H. — DIAGNOSIS: KNOWS TOO MUCH. TREATMENT: LONG NAP (VERY LONG)."'],
      },
      {
        text: (g) => `Get Hank into protective custody with ${g.state.getFlag('ending_mayor') ? 'Chief' : 'Det.'} Thorne at the PD.`,
        obj: { type: 'talk', who: 'thorne' },
        talk: [
          (g) => [g.state.getFlag('ending_mayor') ? 'Chief Thorne. Still feels weird. The witness protection budget is eleven dollars and a hat. I raised it. It used to be four dollars.' : 'Witness protection? In Rotwell? The budget is four dollars and a hat. The hat is mine.', 'Hank needs a new name, new papers, a new face. Papers I can do. Forged ones cost five hundred. Or you can forge them yourself, if you\'re smart. I won\'t watch. I\'ll eat my salad.'],
          { t: ['How do you want to do this?'],
            choices: [pay(500, 'Pay $500 for "official" papers'), gate('int', 25, 'Forge the papers yourself'), leave('I\'ll come back.')] },
          ['> The paperwork is done. Hank Gristlewood is officially dead. In his place: "Hank Seaweed", a vegan fry cook from out of town, starting Monday at the Rusty Hook on Blackwater Isle.'],
        ],
      },
      {
        text: 'Say goodbye to Hank (now "Hank Seaweed") at the meat plant before he ships out.',
        obj: { type: 'talk', who: 'hank' },
        talk: [
          ['*He\'s shaved his eyebrows. The hairnets are gone. He looks naked. Spiritually.* Hank Seaweed. Vegan. From "out of town". There is no out of town. Nobody will ever check.', (g) => (g.state.getFlag('meat_whistle') ? 'You told me the truth when nobody else would. Here: my life savings. It\'s six hundred dollars and a coupon for Meat Loaf. Burn the coupon.' : 'You lied to me. Then you saved me. That\'s the most Rotwell friendship there is. Here: six hundred dollars. And never, ever lie to a man about his lunch again.')],
        ],
      },
    ],
  },

  // Don Trashcanzo (after "The Raccoon Family")
  side_raccoon2: {
    kind: 'side', title: 'The Possum Thing', giver: 'trashcanzo',
    rumor: 'Word in the alleys: the raccoon guy behind Pizza Butt is looking for his nephew. A real raccoon. The possums took him. This is a sentence I said.',
    summary: 'The Possum Syndicate has kidnapped Little Ricky, Don Trashcanzo\'s nephew (an actual raccoon). The ransom notes are written on banana peels.',
    available: (g) => g.quests.isDone('side_raccoon'),
    offer: [
      { who: 'nar', t: ['> Don Trashcanzo sits on his trash-can throne, very still. Both of his raccoon bodyguards are wearing black armbands.'] },
      ['Cousin Garbage. They took Little Ricky. My sister\'s boy. He is a raccoon. A real one. He has a little hat.', '*He holds up a banana peel. Written on it in marker: "WE HAVE THE RACCOON. PLAY DEAD OR ELSE." The possums.*', 'Follow the peels. Find the boy. Then we teach the possums what "playing dead" really means.'],
    ],
    reward: { money: 900, weapon: 'machete', xp: 400, flags: { raccoon_capo: true } },
    rewardText: '$900, a machete, made raccoon (bigger family gifts)',
    steps: [
      {
        text: (g, q) => `Follow the banana-peel ransom notes. (${visited(q)}/3)`,
        obj: { type: 'visit', points: [{ district: 'downtown', label: 'Ransom peel' }, { district: 'hilltop', label: 'Ransom peel' }, { district: 'rustyards', label: 'Ransom peel' }] },
        visitText: [
          'Peel #1: "WE WANT 400 POUNDS OF PREMIUM GARBAGE." Below, smaller: "AND A NAP."',
          'Peel #2 in a Hilltop recycling bin: "NO COPS. NO RACCOONS. NO SUDDEN MOVEMENTS. WE STARTLE EASILY." It\'s true. They do.',
          'Peel #3 by the gas station in the Rustyards: a little hat. Little Ricky\'s hat. And tracks leading behind Fuel & Fumes.',
        ],
      },
      {
        text: 'Raid the Possum Syndicate hideout behind Fuel & Fumes in the Rustyards.',
        obj: { type: 'brawl', loc: 'fuel_fumes', count: 4, kind: 'gang', tier: 2, label: 'Don Possumbilio & the Possum Syndicate', radius: 12, boss: { name: 'Don Possumbilio', moves: ['combo', 'block'], scale: 1.0, color: '#8a8a8a', hat: 'fedora' } },
        arrive: [{ who: 'nar', t: ['> A dozen men in possum costumes are lying motionless behind the gas station. In the middle, in a little cage made from a shopping cart, sits a raccoon in a tiny tuxedo, eating a corn dog. He looks fine. He looks GREAT.', '> "Don Possumbilio," says the biggest possum, not moving. "We\'re playing dead. You can\'t hit us. It\'s the rules."'] }],
        win: ['> The possums play dead again, this time with commitment. You open the cage. Little Ricky climbs onto your shoulder, hisses at everyone, and finishes the corn dog.'],
      },
      {
        text: 'Bring Little Ricky home to Don Trashcanzo behind Pizza Butt.',
        obj: { type: 'talk', who: 'trashcanzo' },
        talk: [
          ['> Little Ricky leaps from your shoulder into the Don\'s arms. The bodyguard raccoons remove their armbands. One of them throws a tiny party popper.', 'Cousin. You have returned the blood of my blood. The fur of my fur. You are no longer Cousin Garbage.'],
          ['> In the excitement, the Don\'s raccoon mask slips. You catch a glimpse of what\'s under it. It\'s... another raccoon mask. And under THAT, for just a second, something with very real whiskers.', 'Some garbage is not for you to sort, Capo. *He adjusts the mask.* Take this blade. And from now on, the family gifts will be... larger.'],
        ],
      },
    ],
  },

  // ===================================================================== EPILOGUES (after each ending)
  epi_kingpin: {
    kind: 'side', title: 'Heavy Is the Hat', giver: 'sal',
    rumor: 'Gutter Rats are saying the new boss has a tribute route to run. And that the Velvet ain\'t as dead as everybody thinks.',
    summary: 'You run Rotwell\'s streets now. The tribute won\'t collect itself, and "Vivian (one N)" is trying to stage a velvet comeback.',
    available: (g) => !!g.state.getFlag('ending_kingpin'),
    offer: [
      (g) => (g.state.getFlag('ending_kingpin') === 'shared'
        ? ['Co-boss! The second steering wheel still don\'t work, but the first one\'s holdin\'. Listen: tribute day. The businesses gotta see our faces. Your face especially. Mine scares children. Yours scares accountants.']
        : ['*Sal, damp, in an ERRAND BOY tank top.* Boss. Tribute day. I made a list. I made it on a napkin. The napkin\'s wet. Everything\'s wet. The harbor\'s in my bones now.']),
      'Also, word is the Contessa\'s back in a wig, callin\' herself "Vivian, one N". She\'s puttin\' a crew together at the Golden Gutter. We gotta squash it.',
    ],
    reward: { money: 5000, xp: 800, car: 'wanda', carColor: '#e8e2d0', carFallback: 6000 },
    rewardText: '$5,000 and a brand-new ice cream truck (well, a van)',
    steps: [
      {
        text: (g, q) => `Collect tribute in person: the Golden Tooth, Club Velvet and the Gas-N-Gulp. (${visited(q)}/3)`,
        obj: { type: 'visit', points: [{ loc: 'golden_tooth', label: 'Tribute' }, { loc: 'club_velvet', label: 'Tribute' }, { loc: 'gas_n_gulp', label: 'Tribute' }], radius: 9 },
        visitText: [
          'The Golden Tooth (now unofficially the Golden Gutter) hands over an envelope and a complimentary pit boss. You decline the pit boss. He follows you anyway for a block.',
          'Club Velvet\'s manager pays in cash and crushed velvet. "Will there be anything else, boss?" There will not. He bows. His toupee doesn\'t.',
          'The Gas-N-Gulp pays in quarters and expired jerky. The clerk asks for a selfie. You allow it. She posts it with the caption "my landlord".',
        ],
      },
      {
        text: 'Crush "Vivian (one N)" and her comeback crew at the Golden Tooth.',
        obj: { type: 'brawl', loc: 'golden_tooth', count: 3, kind: 'gang', tier: 3, label: 'Vivian (One N)\'s Comeback Crew', radius: 12 },
        arrive: [{ who: 'vivienne', t: ['*In a blonde wig, sunglasses and a stick-on mustache.* I am NOT Vivienne. I am Vivian. One N. Completely different woman. And I am taking back what is mine. Hers. My cousin\'s.', '> Lord Snifferton, also in a tiny wig, growls at you.'] }],
        win: ['> The comeback crew scatters. "Vivian" escapes in a golf cart, wig flying, screaming "THIS ISN\'T OVER!" It\'s Rotwell. It never is. Lord Snifferton bites your ankle on the way out. For old times\' sake.'],
      },
      {
        text: 'Report back to Big Sal at the clubhouse.',
        obj: { type: 'talk', who: 'sal' },
        talk: [
          (g) => (g.state.getFlag('ending_kingpin') === 'shared'
            ? ['Tribute\'s in, Velvet\'s out, Gutterside\'s quiet. Well, loud. Normal loud. Partner, I got you a present. A new ice cream truck. It\'s a van. I painted a cone on it. The jingle plays our names. Both of \'em. Off-key.']
            : ['Tribute\'s in. Vivian\'s out. You did good, boss. I got you somethin\'. A new ice cream truck. It\'s a van. I painted a cone on it. It plays your name. ...I miss my truck. Don\'t tell nobody.']),
        ],
      },
    ],
  },

  epi_corp: {
    kind: 'side', title: 'Quarterly Results', giver: 'grimsworth',
    rumor: 'Grimco\'s new boss has a shareholder gala coming up. And HR wants a head. Specifically the janitor\'s.',
    summary: 'You\'re running Grimco now. Shareholders want line go up. HR wants Mopsy fired. And somewhere, the ficus is watching.',
    available: (g) => !!g.state.getFlag('ending_corporate'),
    offer: [
      (g) => (g.state.getFlag('ending_corporate') === 'coup'
        ? ['*Grimsworth, now at the lobby desk, beams.* Boss! Your first quarter! I\'ve prepared your calendar. It has three things on it. Please don\'t fire me. I\'ve only just learned to love the lanyard.']
        : ['Partner! Our first quarter as equals. I\'ve prepared a calendar. The ficus approved it. The ficus approves of everything. That\'s why we keep it.']),
      'Item one: HR wants Mopsy gone. Item two: the shareholder gala. Item three: there is no item three. That\'s just good management.',
    ],
    reward: { money: 10000, xp: 800, car: 'stretch', carColor: '#14141a', carFallback: 15000 },
    rewardText: '$10,000 and a stretch limo with a ficus in the back',
    steps: [
      {
        text: 'Decide Mopsy\'s fate. He\'s mopping outside Grimco Tower.',
        obj: { type: 'talk', who: 'mopsy' },
        talk: [
          ['*Mopsy is mopping the same spot. His hands are shaking.* I heard. HR wants me out. Twenty-two years. They told me to clean out my locker. My locker is where I sleep on Tuesdays.'],
          { t: ['> Mopsy looks at you. The mop looks at you. You have never been more aware of a mop.'],
            choices: [
              { label: 'Fire him. Shareholders want lean.', hint: '+$2,000 saved, -12 karma', do: (g, q) => { q.data.mopsy = 'fired'; g.state.addMoney(2000, 'cost savings'); g.state.addStat('karma', -12); g.state.setFlag('mopsy_fired'); },
                then: ['...Okay. *He hands you the mop.* She\'s yours now. Her name is Doris. She doesn\'t like you either.'] },
              { label: 'Give him a raise. Out of your own pocket.', hint: '-$1,000, +10 karma', if: (g) => g.state.canAfford(1000), do: (g, q) => { q.data.mopsy = 'raise'; g.state.spend(1000, 'Mopsy raise'); g.state.addStat('karma', 10); },
                then: ['A RAISE? *He drops the mop. He picks it up and apologizes to it.* I\'m gonna buy my mom a new van. With a second seat. For ME.'] },
              { ...gate('cha', 35, 'Promote him to Vice President of Mops', 'advance', ['Vice... President? *He straightens his jumpsuit.* I\'ll need a corner office. For the mop. She\'s earned it.']), do: (g, q) => { q.data.mopsy = 'vp'; g.state.addStat('karma', 6); g.state.addStat('cha', 1); } },
            ] },
        ],
      },
      {
        text: 'Attend the Grimco shareholder gala at Club Velvet after dark.',
        obj: { type: 'goto', loc: 'club_velvet', night: true, radius: 9 },
        arrive: [
          { who: 'nar', t: ['> Champagne, ice sculptures of the Grimco tooth logo, and two hundred shareholders chanting "LINE GO UP" in a low, ritual hum.', '> A man in a monocle grabs your arm. "The quarterly numbers, boss. Rent? Wages? Meat Loaf? What\'s the plan?"'],
            choices: [
              { label: '"Rent goes up 400%."', hint: '+$3,000, -10 karma', do: (g) => { g.state.addMoney(3000, 'bonus'); g.state.addStat('karma', -10); },
                then: [{ who: 'nar', t: ['> The shareholders applaud so hard one of them dislocates a shoulder. Down in Gutterside, a thousand landlords feel a warm glow they can\'t explain.'] }] },
              { label: '"Free Meat Loaf for every citizen."', hint: '+5 karma, the shareholders are confused', do: (g) => { g.state.addStat('karma', 5); },
                then: [{ who: 'nar', t: ['> Silence. Then a shareholder whispers "...it\'s a write-off." Then they all applaud. Somewhere, Hank Gristlewood screams into a pillow.'] }] },
            ] },
        ],
      },
      {
        text: (g, q) => (q.data.mopsy === 'fired' ? 'Disgruntled former employees are storming Grimco Tower. Mopsy is leading them. With Doris.' : 'Disgruntled former employees are storming Grimco Tower. Stop them.'),
        obj: { type: 'brawl', loc: 'grimco', count: 3, kind: 'thug', tier: 3, label: 'Disgruntled Former Employees', radius: 12 },
        arrive: [(g, q) => ({ who: 'nar', t: [q.data.mopsy === 'fired' ? '> Leading the mob is Mopsy, holding a mop like a battle standard. "DORIS AND I HAVE A GRIEVANCE," he yells. Doris drips menacingly.' : '> An angry mob of ex-Grimco staff marches up the steps waving staplers. Behind you, Mopsy grips his mop. "I got your back, boss. Doris does too."'] })],
        win: ['> The mob scatters, dropping staplers, lanyards and one framed "Employee of the Year 2009" certificate. The ficus in the lobby rustles approvingly. It\'s an indoor plant. There is no wind.'],
      },
      {
        text: 'Close the quarter with Grimsworth outside Grimco Tower.',
        obj: { type: 'talk', who: 'grimsworth' },
        talk: [
          ['Splendid quarter! Profits up, morale down, the ficus grew a quarter inch. That\'s a record. I\'ve had the limo detailed for you. It has a ficus in the back. Don\'t talk to it. It hears everything.'],
        ],
      },
    ],
  },

  epi_mayor: {
    kind: 'side', title: 'The First Hundred Days', giver: 'thorne',
    rumor: 'The new mayor\'s got a hundred days to prove they\'re not Swindell. Chief Thorne\'s keeping a list. It\'s on the corkboard.',
    summary: 'You\'re Mayor of Rotwell. Chief Thorne has a to-do list: potholes, the fire department, and a small matter of Swindell escaping from prison in a laundry cart.',
    available: (g) => !!g.state.getFlag('ending_mayor'),
    offer: [
      ['Mayor. *She says it like it tastes weird. It does.* Your first hundred days start now. I made you a list. Three items. I color-coded them. That\'s how you know I care.', 'One: potholes. Two: the fire department. Three... Swindell escaped. In a laundry cart. Don\'t ask how. The laundry guy is under investigation.'],
    ],
    reward: { money: 5000, karma: 10, xp: 800, items: { q_key_city: 1 }, flags: { swindell_caught: true } },
    rewardText: '$5,000, +10 karma, the Key to the City',
    steps: [
      {
        text: (g, q) => `Fill the worst potholes in the city. With what? Swindell's old campaign signs. (${visited(q)}/3)`,
        obj: { type: 'visit', points: [{ district: 'gutterside', label: 'Pothole' }, { district: 'rustyards', label: 'Pothole' }, { district: 'dustbowl', label: 'Pothole' }] },
        visitText: [
          'Gutterside pothole: it had a family living in it. You relocate them to a nicer pothole. They send a thank-you card.',
          'Rustyards pothole: twelve feet deep. A car was down there. A car from 1987. The driver is still in it, still honking. You fill around him.',
          'Dustbowl pothole: Mad Martha uses it as a jump. You fill it. She doesn\'t speak to you for a day. Then she builds a new ramp out of Swindell signs.',
        ],
      },
      {
        text: 'Cut the ribbon on the reopened fire department next to St. Mercy\'s.',
        obj: { type: 'goto', loc: 'st_mercy', radius: 10 },
        arrive: [{ who: 'nar', t: ['> A brand-new fire truck, a crowd of fifty, and a ribbon. You cut it. The crowd cheers.', '> The fire truck is on fire. The firefighters put it out with the OTHER fire truck. The crowd cheers harder. It\'s the best ribbon cutting in Rotwell history.'] }],
      },
      {
        text: 'Swindell has barricaded himself in City Hall with a flock of loyal pigeons. Take back your office.',
        obj: { type: 'brawl', loc: 'city_hall', count: 3, kind: 'thug', tier: 3, label: 'Ex-Mayor Swindell & His Loyalists', radius: 12, boss: { name: 'Dick Swindell', moves: ['charge', 'summon', 'block'], scale: 1.15, color: '#1c1c24', hat: 'tophat' } },
        arrive: [{ who: 'mayor', t: ['This is MY City Hall! I\'ve been mayor for ELEVEN TERMS! Nobody remembers voting for me and THAT\'S DEMOCRACY! Pigeons! DEFEND YOUR FATHER!', '> The pigeons look at him. They look at you. Half of them leave. The other half are guys in pigeon costumes, and they stay.'] }],
        win: ['> Swindell goes down on the steps, toupee first. A real pigeon lands on his head and does, at long last, its civic duty. Thorne cuffs him with a smile. You\'ve never seen her smile. It\'s terrifying. It\'s great.'],
      },
      {
        text: 'Report to Chief Thorne at the PD.',
        obj: { type: 'talk', who: 'thorne' },
        talk: [
          ['Potholes filled. Fire department open, mostly not on fire. Swindell back in a cell, eleven consecutive life sentences. I asked for twelve. For the pigeon.', 'Gladys made you this. A Key to the City. It doesn\'t open anything. She charged forty dollars to engrave it. Don\'t lose it. Actually, lose it. It\'s embarrassing.'],
        ],
      },
    ],
  },

  epi_escape: {
    kind: 'side', title: 'Sunburn', giver: 'fumble',
    rumor: 'Professor Fumble at the University says Rotwell\'s got a sun problem now. And Grimco wants to put the lid back on.',
    summary: 'The Lid is open. Rotwell is getting its first sunburn in twenty years, and Grimco has quietly sent a crew to close the sky again.',
    available: (g) => !!g.state.getFlag('ending_escape'),
    offer: [
      (g) => (g.state.getFlag('ending_escape') === 'alone'
        ? ['You squeezed out through the crack and... came BACK? *He squints at you.* Of course you did. Nobody leaves a toilet for good. And the crack is getting wider on its own. People can see the SUN. They don\'t know what it is.']
        : ['The SUN! The ACTUAL SUN! I\'ve been staring at it all week. I can no longer see the color blue. People are getting sunburned. They think it\'s a new Grimco product.']),
      'Worse: my pigeon intercepted a Grimco memo. "OPERATION RE-LID". They want to close the sky again. Help me hand out sunglasses, then stop them at the bunker.',
    ],
    reward: { money: 4000, stats: { int: 3 }, xp: 800, flags: { lid_secured: true } },
    rewardText: '$4,000, +3 INT, a permanently open sky',
    steps: [
      {
        text: (g, q) => `Hand out Fumble's homemade sunglasses (two bottle bottoms and a coat hanger) in four districts. (${visited(q)}/4)`,
        obj: { type: 'visit', points: [{ district: 'gutterside', label: 'Sunglasses' }, { district: 'downtown', label: 'Sunglasses' }, { district: 'rustyards', label: 'Sunglasses' }, { district: 'dustbowl', label: 'Sunglasses' }] },
        visitText: [
          'Gutterside: a hobo puts on the sunglasses, looks at the sun, and says "oh, THAT\'S what that is". He was sure it was a cop helicopter.',
          'Downtown: a businessman refuses sunglasses, says the sun is "a liberal hoax", and gets sunburned in the shape of his tie.',
          'Rustyards: the dock workers sunbathe on shipping containers for the first time. The seagulls are furious. They had a good thing going.',
          'Dustbowl: the bikers already had sunglasses. They have always had sunglasses. They were ready. They were born ready.',
        ],
      },
      {
        text: 'Stop the Grimco "Re-Lid" crew at Bunker 9 in the Dustbowl.',
        obj: { type: 'brawl', loc: 'bunker', count: 4, kind: 'thug', tier: 3, label: 'Grimco Re-Lid Crew', radius: 14 },
        arrive: [{ who: 'nar', t: ['> A Grimco van is parked at the bunker. Men in hazmat suits are unloading a crate labeled LID (SPARE). Corporal Pickles is lying in front of the van wheels. "YOU SHALL NOT PARK," he says.'] }],
        win: ['> The Re-Lid crew retreats in their van. The spare lid falls off the back and rolls away across the Dustbowl like a giant hubcap. Somewhere, Mad Martha is going to find it and turn it into a ramp.'],
      },
      {
        text: 'Tell Crusty Reg the sky is staying open.',
        obj: { type: 'talk', who: 'reg' },
        talk: [
          ['*Reg is lying in a lawn chair under the overpass in a pair of Fumble\'s bottle-bottom sunglasses.* The sky stays open, eh? Twenty years I lived down here waiting for somebody to undo what I built.', 'I designed the Lid, Plunger. And you unlocked it. That makes you the better scientist. Here. My old grant money. I hid it in a coffee can. Grimco never found it. Grimco never looks in coffee cans. They think they\'re beneath them.'],
        ],
      },
    ],
  },

  epi_hobo: {
    kind: 'side', title: 'Royal Duties', giver: 'reg',
    rumor: 'The Overpass Monarchy needs its king. There\'s a dispute over a box. There\'s ALWAYS a dispute over a box.',
    summary: 'You\'re the King of the Crust. Your subjects have disputes, your pigeons want knighthoods, and Grimco wants to bulldoze your kingdom for a parking garage.',
    available: (g) => !!g.state.getFlag('ending_hobo'),
    offer: [
      ['Your Crustiness. *He bows. Something in his back goes "pop".* Royal duties await. A dispute between subjects. Three pigeons await knighthood. And Grimco has filed a permit to turn our overpass into a parking garage.', 'A king\'s work is never done. Mostly because a king\'s work is mostly naps. But not today.'],
    ],
    reward: { money: 2000, stats: { cha: 3 }, karma: 5, xp: 800 },
    rewardText: '$2,000 in "found change", +3 CHA, +5 karma',
    steps: [
      {
        text: 'Settle a royal dispute: Chad and a hobo named Tuesday both claim the same cardboard box.',
        obj: { type: 'talk', who: 'chad' },
        talk: [
          ['Your Majesty! That box is MINE. I was incubating a startup in it. Tuesday says he was "sleeping" in it. Sleeping is not a business model, Tuesday!', '> Tuesday, holding the other end of the box, nods solemnly. "It is, if you do it right."'],
          { t: ['> Every hobo under the overpass falls silent. Your first royal ruling.'],
            choices: [
              { label: '"Cut the box in half."', hint: 'the wise ruling', do: (g) => { g.state.addStat('int', 1); },
                then: ['> Chad screams "NO, take the box, just don\'t hurt the box!" Tuesday shrugs: "Half a box is still a box." You give it to Chad for loving it. Tuesday gets a better box. Everyone weeps at your wisdom.'] },
              { label: '"The box goes to Tuesday. Sleep is sacred."', hint: '+karma', do: (g) => { g.state.addStat('karma', 3); },
                then: ['> Tuesday crawls into the box and is asleep before you finish the sentence. Chad pitches him a sleep-tracking app through the cardboard.'] },
              { label: '"The box goes to ME. I\'m the king."', hint: '+CHA, the subjects grumble', do: (g) => { g.state.addStat('cha', 1); g.state.addStat('karma', -2); },
                then: ['> You confiscate the box. It is a very good box. You sleep in it that night. It\'s the best sleep of your reign.'] },
            ] },
        ],
      },
      {
        text: (g, q) => `Knight three worthy pigeons across the realm. (${visited(q)}/3)`,
        obj: { type: 'visit', points: [{ district: 'downtown', label: 'Worthy pigeon' }, { district: 'hilltop', label: 'Worthy pigeon' }, { district: 'rustyards', label: 'Worthy pigeon' }] },
        visitText: [
          'Downtown: you knight a pigeon who has pooped on Swindell\'s statue every day for nine years. Sir Splatsworth. He bows. He poops. A true knight.',
          'Hilltop: you knight a pigeon who steals croissants from rich people\'s balconies. Dame Crumbsby. Hilltop files a complaint. The complaint is pooped on.',
          'Rustyards: you knight a pigeon with one leg who fought a seagull and won. Sir Hopsalot. The seagull attends the ceremony, out of respect.',
        ],
      },
      {
        text: 'Defend the Overpass from the Grimco Eviction Squad.',
        obj: { type: 'brawl', loc: 'hobo_camp', count: 4, kind: 'thug', tier: 3, label: 'Grimco Eviction Squad', radius: 12 },
        arrive: [{ who: 'nar', t: ['> A bulldozer with a Grimco logo rumbles toward the overpass, flanked by men in hard hats with clipboards. "This area is zoned for a parking garage. Please vacate the premises and take your... barrel."', '> Every hobo in Gutterside picks up a shopping cart. The pigeons take flight. Reg puts on his crown backward. It\'s war.'] }],
        win: ['> The Eviction Squad retreats. The bulldozer is now a planter. Tuesday is sleeping in the scoop. Long live the Crust.'],
      },
      {
        text: 'Return to Reg for your royal stipend.',
        obj: { type: 'talk', who: 'reg' },
        talk: [
          ['A good day\'s reigning, Your Crustiness. The barrel is warm, the box is settled, the pigeons are knighted, and Grimco has been told where to park.', 'Your royal stipend: two thousand dollars in change, collected from every fountain, couch cushion and parking meter in Gutterside. Some of it is foreign. Some of it is buttons. All of it is yours.'],
        ],
      },
    ],
  },

  // ===================================================================== SECRET: 3+ endings
  secret_plunger: {
    kind: 'side', title: 'The Last Flush', giver: 'reg',
    rumor: 'They say the old hobo under the overpass has one more secret. They say it\'s about Grimco. They say it\'s about a plant. They say a lot of things.',
    summary: 'Three doors opened. Reg says there\'s one thing nobody tells you about doors: somebody built them. Somebody is still holding the jar.',
    available: (g) => endingsSeen(g) >= 3,
    offer: [
      { who: 'nar', t: ['> Reg is not smiling. He has taken off his crown. Without it, he looks like what he is: an old scientist who has been very tired for a very long time.'] },
      ['Three doors, Plunger. Nobody\'s ever opened three. You know what that makes you? A statistical anomaly. Grimco HATES anomalies.', 'When I built the Lid, there was a sponsor above Grimsworth. Above the board. "The Chairman." Every vote, every rent hike, every Meat Loaf recipe: "THE CHAIRMAN VOTES YES." Nobody\'s ever seen him.', 'It\'s time somebody did. Let\'s go find out who\'s holding the jar.'],
    ],
    reward: { money: 25000, stats: { str: 3, int: 3, cha: 3 }, items: { q_golden_plunger: 1 }, xp: 3000 },
    rewardText: '$25,000, +3 to every stat, the Golden Plunger',
    steps: [
      {
        text: (g, q) => `Search the five doors for the Chairman's minutes: the Rats' clubhouse, the Velvet lounge, Rotwell PD, Bunker 9 and the Overpass. (${visited(q)}/5)`,
        obj: { type: 'visit', points: [{ loc: 'rats_clubhouse', label: 'Chairman\'s minutes' }, { loc: 'syndicate_lounge', label: 'Chairman\'s minutes' }, { loc: 'rotwell_pd', label: 'Chairman\'s minutes' }, { loc: 'bunker', label: 'Chairman\'s minutes' }, { loc: 'hobo_camp', label: 'Chairman\'s minutes' }], radius: 9 },
        visitText: [
          'Taped under Sal\'s old ice cream truck: a page of Grimco board minutes. "Motion to let the Gutter Rats exist, for contrast: THE CHAIRMAN VOTES YES."',
          'In the Velvet lounge\'s harp: "Motion to make the Syndicate our entertainment division: THE CHAIRMAN VOTES YES." Signed with a leaf.',
          'In a PD evidence locker labeled DO NOT OPEN (DONUTS): "Motion to keep one honest cop, as a control group: THE CHAIRMAN VOTES YES." Thorne is going to be so mad.',
          'At the bunker, behind the monitors: "Motion to let a subject find the binder every 7,000 days, to test containment: THE CHAIRMAN VOTES YES." You were a TEST.',
          'Under Reg\'s cart throne: "Motion to let the lead scientist walk away and live under an overpass, as a warning: THE CHAIRMAN VOTES YES." Every page signed with a leaf. A real, pressed leaf.',
        ],
        onDone: (g) => g.quests.giveItem('q_chairman'),
      },
      {
        text: 'Ask Mopsy outside Grimco Tower who cleans the Chairman\'s office.',
        obj: { type: 'talk', who: 'mopsy' },
        talk: [
          ['The Chairman? *He goes white.* I clean his office. Top floor. Twenty-two years. I never seen him. I just... water him.', '@ ...Water him?', 'Every Tuesday. Half a cup. He likes the window. Oh no. Oh no, I said too much. The mop is listening. *He looks at the mop.* Doris, you didn\'t hear that.'],
        ],
      },
      {
        text: 'Go to the top of Grimco Tower after dark and meet the Chairman.',
        obj: { type: 'brawl', loc: 'grimco', count: 3, kind: 'thug', tier: 4, label: 'The Board of Directors', night: true, radius: 12, boss: { name: 'THE CHAIRMAN', moves: ['slam', 'summon', 'block', 'charge'], scale: 1.6, color: '#2f5a26', hat: 'tophat', hatColor: '#0a0a0e' } },
        arrive: [
          { who: 'nar', t: ['> The top floor. A boardroom. Twelve empty chairs, two lawyers, and at the head of the table, in a pot shaped like a throne: the ficus.', '> It rustles. A tiny speaker taped to its trunk crackles: "THE CHAIRMAN VOTES... NO."', '> The lawyers attack. Then the ficus does. It\'s strapped into a Grimco forklift exoskeleton. It is terrifying. It is a plant.'] },
        ],
        win: [
          '> The exoskeleton sparks and collapses. The tiny speaker falls off the ficus. On the other end of its cord, hiding under the boardroom table with a laptop and a text-to-speech app: a sweaty young man in a Grimco lanyard.',
          '> "Hi," he says. "I\'m Kevin. The intern. Mr. Grimsworth\'s sweat intern. In 2013 they told me to \'handle the plant\'. Nobody ever checked. I\'ve been running Grimco through a ficus for eleven years. Nobody noticed. Nobody EVER notices."',
          '> Kevin hands you the laptop. "Please. I just want to go home. I don\'t know where home is. I\'ve been sleeping in the pot."',
        ],
      },
      {
        text: 'Bring the Chairman\'s minutes (and the ficus) to Crusty Reg under the overpass.',
        obj: { type: 'talk', who: 'reg' },
        take: 'q_chairman',
        talk: [
          ['*Reg reads every page. Then he looks at the ficus. Then he laughs so hard his crown falls into the barrel.* A PLANT. Twenty years of guilt, and it was a PLANT and an INTERN.', 'Plunger, you\'ve got the Chairman\'s laptop. One vote decides everything Grimco does. What do you do with it?'],
          { t: ['> The ficus sits in your arms. It rustles. It has no opinion. It never did.'],
            choices: [
              { label: 'Plant the ficus under the overpass. Open the vote to everybody.', hint: '+20 karma, the people\'s ficus', do: (g) => { g.state.addStat('karma', 20); g.state.setFlag('ficus_people'); },
                then: ['> You plant the ficus next to the burning barrel. Reg puts up a sign: THE CHAIRMAN — ONE CITIZEN, ONE VOTE. By morning there are four hundred votes. Three hundred of them are "free soup". The motion carries.', '> Kevin the intern stays. He finally has a home. It\'s a box. It\'s a nice box.'] },
              { label: 'Keep the laptop. You\'re the Chairman now.', hint: '+$50,000, -20 karma', do: (g) => { g.state.addStat('karma', -20); g.state.addMoney(50000, 'Chairman\'s discretionary fund'); g.state.setFlag('chairman'); },
                then: ['> You open the laptop. Type: "THE CHAIRMAN VOTES YES." Every bank account in Grimco tilts toward you like a pinball machine. Reg looks at you for a long time. "Well," he says. "Somebody had to hold the jar."', '> Kevin the intern asks if he can keep the ficus. You let him. It\'s the least you can do. It\'s also, literally, the least.'] },
            ] },
          ['*Reg fishes his crown out of the barrel and puts it on your head, still smoking.* Rotwell is a toilet, Plunger. You\'ve unclogged it three times. Here. A golden plunger. I had it made. It\'s not real gold. It\'s a real plunger. That\'s the important part.'],
        ],
        onDone: (g) => { g.state.setFlag('plunger_legend', true); setTimeout(() => g.ui.bigText('THE LAST FLUSH', 'You found the Chairman. Rotwell will never be the same. (It will be pretty similar.)', 4200), 400); },
      },
    ],
  },
};
