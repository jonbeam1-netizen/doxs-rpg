// New side quests: one-offs spread over every district and the island.
// Uses only objective types the engine supports (see data/quests.js header).
// `rumor` = what a pedestrian says when you ask around (talk.js points you at the giver).
import { pay, gate, leave, fight } from '../../data/quests.js';

const $ = (n) => '$' + Math.round(n).toLocaleString('en-US');
const visited = (q) => (q.sd.points || []).filter((p) => p.done).length;
const heistsDone = (g) => Object.values(g.state.p.heists?.done || {}).reduce((a, n) => a + (Number(n) || 0), 0);
const hasBoard = (g) => (g.state.p.skate?.owned?.length || 0) > 0;
// Co-op: how many friends are standing near you.
export const friendsNear = (g, r = 18) => {
  const pos = g.quests.playerPos(); const rp = g.net?.remotePlayers;
  if (!pos || !rp || !g.net?.connected) return 0;
  let n = 0;
  for (const p of rp.values()) if (p?.pos && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < r) n++;
  return n;
};
const giveAmmo = (g, type, n) => { try { g.combat?.giveAmmo?.(type, n); } catch { /* no combat module */ } };
const visitingHours = (g) => g.time.hour >= 9 && g.time.hour < 18;

export const SIDE_QUESTS = {
  // ------------------------------------------------------------------ GUTTERSIDE: comedic errand
  side_roach: {
    kind: 'side', title: 'Crunch Time', giver: 'krupnik',
    rumor: 'Mrs. Krupnik at the Roach Motel lost her racing roach. She\'s offering cash. For a ROACH. In that motel. Imagine the competition.',
    summary: 'Somebody roach-napped Duchess Crunchington, Mrs. Krupnik\'s champion racing cockroach, right out of her shoebox stable at the Roach Motel.',
    available: (g) => g.quests.isDone('main_prologue') || g.state.p.level >= 2,
    offer: [
      { who: 'nar', t: ['> Mrs. Krupnik is standing in the motel parking lot in a bathrobe, holding an empty shoebox lined with velvet and tiny trophies.'] },
      ['ROOM SIX. Good. You have the face of a person who knows criminals. Somebody took my Duchess. Duchess Crunchington. Three-time champion of the Gutterside Roach Derby.', '@ Your... roach?', 'She is not a roach. She is an ATHLETE. She does the 40-inch dash in under two seconds. She has a better resting heart rate than you.'],
      'Find her. Bring her home. I will pay you, and I will stop charging you for the vomit. Both. That is how much I love her.',
    ],
    reward: { money: 350, stats: { cha: 1 }, items: { q_roach_trophy: 1 }, flags: { krupnik_friend: true } },
    rewardText: '$350, a golden roach trophy, Krupnik\'s eternal (conditional) love',
    steps: [
      {
        text: 'Ask around. Needles at Ink Stinks tattoos every lowlife in Gutterside.',
        obj: { type: 'talk', who: 'needles' },
        talk: [
          ['A roach? Funny you ask, bro. Guy came in yesterday wanting a tattoo of a roach in a tiara. On his neck. Paid me in these.', '> He hands you a stack of greasy tickets: RUSTY NAIL BASEMENT DERBY — ADMIT ONE — NO COPS, NO REFUNDS, NO SHOES.'],
          ['Roach races, bro. In the basement of the Rusty Nail, after dark. I did the tiara in Comic Sans. It\'s the only font I know. He loved it.'],
        ],
      },
      {
        text: 'Crash the underground roach derby in the Rusty Nail basement (Downtown) after dark (8 PM - 6 AM).',
        obj: { type: 'goto', loc: 'rusty_nail', night: true, radius: 8 },
        arrive: [
          { who: 'nar', t: ['> In the basement: a plywood racetrack, forty drunks, a bookie named Moth, and a roach in a tiara labeled "THE COUNTESS (NOT STOLEN)". She is clearly Duchess. She hisses at the bookie. Good girl.'] },
          { who: 'Moth the Bookie', t: ['Placin\' a bet, friend? The Countess is the favorite. Totally legit roach. Born here. In this basement. Raised by wolves. Small wolves.'],
            choices: [
              pay(150, 'Buy "the Countess" outright ($150)', 'advance', [{ who: 'Moth the Bookie', t: ['A hundred fifty? For a ROACH? ...Sold. You\'re weird. I respect weird.'] }]),
              gate('cha', 20, 'Tell Moth the Countess has roach flu and it\'s contagious to humans', 'advance', [{ who: 'nar', t: ['> You cough meaningfully. Moth drops the matchbox like it\'s on fire. Forty drunks back away. Somebody throws up just from the suggestion.'] }]),
              fight({ count: 2, kind: 'drunk', tier: 1, label: 'Moth & the Roach Jockeys' }, 'Grab the matchbox and swing at anyone who objects', [{ who: 'nar', t: ['> The jockeys go down. One of them was riding a roach. Metaphorically. You hope.'] }]),
              leave('Watch a race first. For research.'),
            ] },
          { who: 'nar', t: ['> You pop open the matchbox. Duchess Crunchington looks up at you, hisses, then lays about forty eggs in your palm.', '> Congratulations. You are a grandparent. Or a legal guardian. Rotwell family law is vague on roaches.'] },
        ],
        onDone: (g) => g.quests.giveItem('q_roach'),
      },
      {
        text: 'Bring Duchess (and her forty little surprises) home to Mrs. Krupnik at the Roach Motel.',
        obj: { type: 'talk', who: 'krupnik' }, take: 'q_roach',
        talk: [
          ['DUCHESS! My baby! *She kisses the matchbox. On the lips. If roaches have lips.* And... EGGS? She\'s a MOTHER?', '> She stares at the eggs. Then at you. Her eyes fill with tears.'],
          ['A dynasty. A ROACH DYNASTY. Room Six, you have given this motel a future. A terrible, crunchy future.', 'Here. Your money. Your trophy. And from now on, the vomit is forgiven. Forgotten, no. Forgiven, yes.'],
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ DOWNTOWN: food tour + moral choice
  side_critic: {
    kind: 'side', title: 'One Star', giver: 'remy',
    rumor: 'There\'s a food critic outside the Gas-N-Gulp who can\'t taste anything anymore. He needs a tongue for hire. Don\'t make it weird.',
    summary: 'Remy Fromage, once the most feared food critic in Rotwell, has lost his sense of taste. He needs a tongue for hire for his final review: "The Definitive Guide to Rotwell\'s Worst Food".',
    available: (g) => g.quests.isDone('main_prologue'),
    lockedText: () => 'Not now, I\'m mourning my palate. Come back when you\'ve eaten something in this city and survived.',
    offer: [
      { who: 'nar', t: ['> A thin man in a cape and beret is sniffing a gas station hot dog with deep suspicion.'] },
      ['Remy Fromage. You know the name. You fear the name. I once gave the moon two stars. "Too far. Bad parking."', 'Alas. Grimco catered my last birthday. Since then I taste nothing. Only... beige.'],
      'I am writing my final masterpiece: the worst food in Rotwell. I need a tongue. Yours is... adequate. Eat what I tell you. Report back. I pay in cash and immortality.',
    ],
    reward: { xp: 200 }, rewardText: 'Depends on your journalistic integrity',
    steps: [
      {
        text: (g, q) => `Taste-test for Remy: the Greasy Spoon (Gutterside), Pizza Butt (Downtown) and the Rusty Hook on Blackwater Isle. (${visited(q)}/3)`,
        obj: { type: 'visit', points: [{ loc: 'greasy_spoon', label: 'Taste: "the Usual"' }, { loc: 'pizza_butt', label: 'Taste: Pineapple-Anchovy' }, { loc: 'rusty_hook', label: 'Taste: Mystery Chowder' }], radius: 9 },
        visitText: [
          'Tasting note: "the Usual" at the Greasy Spoon. Notes of fryer oil, broken dreams and a single hair that is not Gus\'s. Two stars. It knows what it is.',
          'Tasting note: Pineapple-Anchovy at Pizza Butt. The pineapple and the anchovy are fighting. The cheese is the referee. The cheese is losing.',
          'Tasting note: Mystery Chowder at the Rusty Hook. There is a button in it. The button is the best part. You keep the button.',
        ],
        onDone: (g) => g.state.damage(6, 'food criticism'),
      },
      {
        text: 'Report your tasting notes to Remy outside the Gas-N-Gulp.',
        obj: { type: 'talk', who: 'remy' },
        talk: [
          ['*He scribbles furiously on a napkin.* "The cheese is losing." MAGNIFICENT. You have the soul of a critic and the stomach of a goat.'],
          ['But. *He lowers his voice.* My editor received an envelope. From Grimco. Two thousand dollars if the final chapter is a FIVE-STAR review of the Rotwell Meat Loaf.', 'I cannot taste it. You must. Go to the meat plant. Eat a slice. Then we decide what kind of men we are.'],
        ],
      },
      {
        text: 'Eat a slice of Rotwell Meat Loaf straight off the line at the meat plant (Rustyards).',
        obj: { type: 'goto', loc: 'meat_plant', radius: 9 },
        arrive: [
          { who: 'nar', t: ['> A worker in four hairnets hands you a slice of Meat Loaf on a paper towel. It is grey. It is warm. It is, very faintly, humming.', '> You eat it. It tastes like a wet Tuesday. Like licking a parking garage. Like the moment you realize your ex was right.', '> It stays down. That is the scariest part.'] },
        ],
        onDone: (g) => { g.state.damage(8, 'Meat Loaf'); g.state.addStat('energy', 10); },
      },
      {
        text: 'Go back to Remy and decide what goes in the final chapter.',
        obj: { type: 'talk', who: 'remy' },
        talk: [
          { t: ['Well? WELL? Speak, tongue! Is it a five-star experience? Or is it the end of Western cuisine?'],
            choices: [
              { label: 'Tell the truth: zero stars, and name Grimco\'s bribe', hint: '+8 karma, $300', do: (g) => { g.state.addStat('karma', 8); g.state.addMoney(300, 'Remy'); g.state.setFlag('critic_truth'); return 'complete'; },
                then: ['ZERO STARS. They will sue me into the sea. I have never felt so alive. *He hands you his last $300 and a signed napkin.* Go. Eat honestly.'] },
              { label: 'Write the five-star review and split the bribe', hint: '+$1,000, -8 karma', do: (g) => { g.state.addStat('karma', -8); g.state.addMoney(1000, 'Grimco review'); g.state.setFlag('critic_sold'); return 'complete'; },
                then: ['"A symphony of protein." "Moist in all the right places." *He weeps as he writes it.* I have become a brochure. Here is your half. Never speak to me of this.'] },
              { ...gate('int', 25, 'Write it yourself: a savage review disguised as praise, in iambic pentameter', 'complete', ['"O Loaf, thou humming slab of grey despair, / thou art the reason God invented air." *Remy reads it four times.* Grimco will never notice. Everyone else will never forget. Here, $500 and my beret. It has seen things.']),
                do: (g) => { g.state.addMoney(500, 'Remy'); g.state.addStat('cha', 2); g.state.addStat('karma', 4); g.state.setFlag('critic_truth'); return 'complete'; } },
            ] },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ HILLTOP: rich-kid comedy, choice
  side_poor: {
    kind: 'side', title: 'Slumming It', giver: 'muffy',
    rumor: 'Some Hilltop heiress outside Club Velvet is paying people to show her "how poor people live". Charge her double. She can\'t count.',
    summary: 'Muffy Van Snootington wants to experience authentic poverty for her influencer channel. Daddy will not approve. Daddy has a private army.',
    available: (g) => g.quests.isDone('main_prologue'),
    offer: [
      { who: 'nar', t: ['> A young woman in a fur coat (it\'s August) is filming herself in front of Club Velvet. She points the phone at you. "Oh. My. GOD. A real poor person. Chat, look at his SHOES."'] },
      ['I\'m Muffy. Van Snootington. Of the Hilltop Van Snootingtons. Daddy owns the water rights to the river. Not the water. The RIGHTS.', 'I want to do a series: "Muffy Gets Real". I eat poor food, I sleep poor places, I cry on camera. Twelve followers can\'t be wrong.'],
      'You\'ll be my poverty guide. I\'ll pay you. In money! Do you guys still use money?',
    ],
    reward: { xp: 250 }, rewardText: 'Depends what you do with her',
    steps: [
      {
        text: 'Get Muffy an "authentic" dinner: buy a Gas Station Burrito (Gas-N-Gulp, a vending machine, anywhere sad).',
        obj: { type: 'event', evt: 'item:bought', count: 1, quiet: true, filter: (d) => d?.id === 'cold_burrito', orCheck: (g) => g.state.hasItem('cold_burrito') },
        marker: { loc: 'gas_n_gulp', label: 'Gas-N-Gulp (burritos)' },
        take: 'cold_burrito',
        done: '> Muffy films the burrito from nine angles. "It\'s cold in the MIDDLE and hot on the OUTSIDE? That\'s so brave."',
      },
      {
        text: 'Take Muffy to meet "the locals" under the overpass in Gutterside.',
        obj: { type: 'goto', loc: 'hobo_camp', radius: 10 },
        arrive: [
          { who: 'nar', t: ['> Muffy arrives in a golf cart driven by a butler. She takes one look at the burning barrel, the cardboard suburb and Reg on his shopping cart throne, and screams. Then she screams again, but happier.'] },
          { who: 'reg', t: ['A debutante! Under MY overpass! Child, for forty dollars I will give you an authentic hobo blessing.', '> She pays him four hundred. He blesses her with a wet thumb and a pigeon feather. She livestreams it. Eleven of her twelve followers unfollow. The twelfth is her dad.'] },
          { who: 'Muffy', t: ['This is it. This is REAL. I\'m staying. I\'m going to be a hobo. Daddy is going to DIE.', '> Her phone rings. The caller ID says DADDY (LAWYER). Somewhere up the hill, a helicopter starts up.'] },
        ],
      },
      {
        text: 'Daddy sent his "family recovery specialists". Defend the camp under the overpass.',
        obj: { type: 'brawl', loc: 'hobo_camp', count: 3, kind: 'thug', tier: 2, label: 'Van Snootington Retrieval Team', radius: 12 },
        arrive: [{ who: 'nar', t: ['> Three men in matching polo shirts and earpieces march under the overpass. "Miss Van Snootington, your father requests your presence. And a full decontamination."', '> Muffy hides behind you. Reg hides behind Muffy. Chad tries to sell them HoboCoin.'] }],
        win: ['> The retrieval team retreats, polo shirts torn, one of them weeping into his earpiece: "Sir, the poor people FOUGHT BACK." Muffy has filmed the whole thing. It is the best content of her life.'],
      },
      {
        text: 'Muffy went back to Club Velvet to "pack" (buy a $900 designer cardboard box). Decide her future.',
        obj: { type: 'talk', who: 'muffy' },
        talk: [
          { t: ['So? Am I poor now? I bought this box. It\'s Italian. I\'m keeping my credit cards in it, for safety. What do I do?'],
            choices: [
              { label: 'Send her home to Daddy', hint: '+$1,500 finder\'s fee, -2 karma', do: (g) => { g.state.addMoney(1500, 'Van Snootington'); g.state.addStat('karma', -2); g.state.setFlag('muffy_home'); return 'complete'; },
                then: ['Ugh. FINE. Poverty is so much WORK. *Daddy\'s butler hands you an envelope with $1,500 and a wet wipe.* "For your hands, sir. Or whatever those are."'] },
              { label: 'Let her give her trust fund to the overpass and go full hobo', hint: '+10 karma, +$300', do: (g) => { g.state.addMoney(300, 'Muffy'); g.state.addStat('karma', 10); g.state.setFlag('muffy_hobo'); return 'complete'; },
                then: ['*She hands Reg her black card.* Here. I don\'t need it. I have a box now. *Reg buys every hobo in Gutterside a hot dog. Then a hot tub. Then the hot dog stand.* Muffy tips you $300. "My last money ever. Probably. Daddy will cave by Thursday."'] },
              { ...gate('cha', 30, 'Pitch a compromise: "Poverty Retreats" for rich kids, with you as consultant', 'complete', ['Weekend poverty retreats for Hilltop kids? Cold burritos, real cardboard, a hobo blessing, and a spa day after? *She\'s already filming the ad.* You\'re a GENIUS. You get a cut. Daddy gets a tax write-off. Everybody wins except the hobos, who also win, because I\'m paying them.']),
                do: (g) => { g.state.addMoney(800, 'Poverty Retreats'); g.state.addStat('cha', 2); g.state.addStat('karma', 2); g.state.setFlag('muffy_biz'); return 'complete'; } },
            ] },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ RUSTYARDS: moral choice
  side_union: {
    kind: 'side', title: 'Local 666', giver: 'fran',
    rumor: 'Forklift Fran at the meat plant is trying to start a union. Grimco HR has a guy named Todd. Nobody likes Todd.',
    summary: 'Forklift Fran is organizing the meat plant workers into Rendering Workers Local 666. Grimco would very much like the names of everyone who signed.',
    available: (g) => g.quests.isDone('main_prologue'),
    offer: [
      { who: 'nar', t: ['> A stocky woman in a hard hat leans on a forklift, smoking two cigarettes at once. One of her fingers is missing. There is a locket around her neck. You can guess what\'s in it.'] },
      ['Forklift Fran. Rendering Workers Local 666. Sixty-six six members strong. That\'s six hundred and sixty-six. We\'re bad at signs.', 'Grimco pays us in scrip, makes us work doubles in the rendering vat, and calls the bathroom break "time theft".'],
      'We\'re going union. I need somebody nobody knows to hang flyers around the Rustyards. Somebody Grimco can\'t fire. You look unemployable. That\'s a compliment.',
    ],
    reward: (g, q) => (q.data.sold ? { xp: 150 } : { money: 600, karma: 10, xp: 250, stats: { str: 1 } }),
    rewardText: '$600, +10 karma, the eternal solidarity of Local 666 (if you don\'t sell out)',
    steps: [
      {
        text: (g, q) => `Hang union flyers around the Rustyards. (${visited(q)}/3)`,
        obj: { type: 'visit', points: [{ district: 'rustyards', label: 'Union flyer spot' }, { district: 'rustyards', label: 'Union flyer spot' }, { district: 'rustyards', label: 'Union flyer spot' }] },
        visitText: [
          'Flyer up: "UNION MEETING TONIGHT — FREE DONUTS (STALE) — BRING YOUR FINGERS (THE ONES YOU HAVE LEFT)".',
          'Flyer up. A dock worker reads it, nods, and quietly takes six more for his cousins. All his cousins are named Mike.',
          'Flyer up. A Grimco security camera on a pole slowly turns to look at it. Then at you. Then it zooms in. Rude.',
        ],
      },
      {
        text: 'Report to Fran at the meat plant. Somebody from Grimco HR is waiting there.',
        obj: { type: 'goto', loc: 'meat_plant', radius: 9 },
        arrive: [
          { who: 'nar', t: ['> Instead of Fran, a man in a Grimco lanyard steps out from behind a pallet of Meat Loaf. His smile has been through corporate training. It passed.'] },
          { who: 'Todd from HR', t: ['Hi! Todd. HR. Love the energy. Love the flyers. Love the font choice. Bold.', 'Here\'s the thing, buddy. Somebody in there has a list. Names. Everyone who signed the union card. Grimco would like to... celebrate those people. Individually. In a small room.'],
            choices: [
              { label: 'Take Todd\'s $2,000 and hand over the list', hint: '+$2,000, -15 karma', do: (g, q) => { q.data.sold = true; g.state.addMoney(2000, 'Grimco HR'); g.state.addStat('karma', -15); g.state.setFlag('union_sold'); return 3; },
                then: [{ who: 'nar', t: ['> You find the list on Fran\'s clipboard and hand it over. Todd sniffs it like fine wine. "Pleasure. You\'d make a great manager. That\'s the worst thing I can say about anybody."'] }] },
              { label: 'Tell Todd where he can staple his lanyard', hint: 'he calls security', result: 'advance',
                then: [{ who: 'Todd from HR', t: ['Wow. Okay. Love the passion. Hate the decision. SYNERGY SQUAD!', '> Three men in Grimco polos and knee pads jog out of the plant doing synchronized lunges.'] }] },
            ] },
        ],
      },
      {
        text: 'Fight off the Grimco Synergy Squad at the meat plant.',
        obj: { type: 'brawl', loc: 'meat_plant', count: 3, kind: 'thug', tier: 2, label: 'Grimco Synergy Squad', radius: 12 },
        win: ['> The Synergy Squad retreats, pulling a hamstring in unison. Todd drops his lanyard and runs. Somewhere inside the plant, six hundred and sixty-six people start chanting your name. They get it wrong. It\'s fine.'],
      },
      {
        text: 'Find Forklift Fran outside the meat plant.',
        obj: { type: 'talk', who: 'fran' },
        talk: [
          (g, q) => (q.data.sold
            ? ['*She flicks her cigarette at your shoes.* You sold the list to Todd. I saw. Everybody saw. Todd showed everybody. Todd is not subtle.', 'Funny thing, though. That list? I swapped it this morning. It was every Grimco middle manager\'s name. They just "celebrated" eleven of their own people in a small room. Half of HR got fired.', 'So you\'re a rat. But a USEFUL rat. Get out of my plant before I forklift you into the river.']
            : ['You beat the Synergy Squad? With your FISTS? Comrade. COMRADE. *She hugs you. She smells like Meat Loaf and diesel.*', 'Local 666 is official. First demand: bathroom breaks. Second demand: Hank stops eating the product. Third demand: a forklift race on Fridays. Grimco agreed to two of them. Guess which ones.', 'Here: union dues. Everybody chipped in. Some of it is in scrip. Most of it is real. Solidarity forever.']),
        ],
        onDone: (g, q) => { if (!q.data.sold) g.state.setFlag('union_won'); },
      },
    ],
  },

  // ------------------------------------------------------------------ DUSTBOWL: short investigation + twist
  side_still: {
    kind: 'side', title: 'Still Kickin\'', giver: 'ethel',
    rumor: 'Grandma Ethel out at the trailer park got her moonshine still stolen. She\'s 81 and armed. Whoever took it is already dead, they just don\'t know it yet.',
    summary: 'Somebody stole Grandma Ethel\'s moonshine still from behind her double-wide. She\'s 81, on oxygen, and her shotgun is named Pastor.',
    available: (g) => g.quests.isDone('main_prologue') || g.state.p.level >= 3,
    offer: [
      { who: 'nar', t: ['> A tiny old woman in a housecoat sits on the steps of a double-wide, an oxygen tank on one side and a shotgun on the other. She\'s whittling something. It might be a duck. It might be a weapon.'] },
      ['Sugar. Somebody stole my still. Forty years that still has been in this family. It made the moonshine at my wedding. All three of my weddings.', 'I\'d go after \'em myself, but my hip\'s plastic and Pastor here ain\'t had his coffee.'],
      'Find out who took it. Bring it home. I\'ll make it worth your while. In liquor and lead.',
    ],
    reward: { money: 200, weapon: 'shotgun', items: { moonshine: 3 }, xp: 250 },
    rewardText: '$200, three jars of moonshine and Grandma\'s sawed-off',
    onComplete: (g) => giveAmmo(g, 'shells', 10),
    steps: [
      {
        text: 'Ask Big Dale at the Dirty Spur. Every bottle in the Dustbowl passes through that bar.',
        obj: { type: 'talk', who: 'dale' },
        talk: [
          ['Ethel\'s still? Yeah, we been drinkin\' its product all week. Tastes like a lightning bolt with a grudge. Bought it off two fellas by the junkyard.', '@ Who?', 'The Junior brothers. Junior and Also Junior. Forty-somethin\' years old, both of \'em, still live with their meemaw. Said she was "basically dead" and wouldn\'t miss it.'],
          ['*He thinks about it.* Wait. Their meemaw\'s Ethel. ...Oh no. Don\'t tell her I told you. She shot me once. In 1996. I still got the pellet. I named it Gerald.'],
        ],
      },
      {
        text: 'Confront Junior and Also Junior at Scrapper Pete\'s Junkyard.',
        obj: { type: 'brawl', loc: 'junkyard', count: 2, kind: 'drunk', tier: 2, label: 'Junior & Also Junior', names: ['Junior', 'Also Junior'] },
        arrive: [{ who: 'nar', t: ['> Two enormous, bearded men in matching overalls are sitting on a busted copper still, drinking from it directly. "Meemaw said we could have it when she died," says Junior. "She\'s been dyin\' for thirty years," says Also Junior. "We got impatient."'] }],
        win: ['> The Juniors go down crying for their meemaw. You take the still. It\'s dented, leaking and hissing a little, like a cat that\'s been through a war.'],
        winGive: 'q_still_parts',
      },
      {
        text: 'The still is busted. Get Scrapper Pete to fix it.',
        obj: { type: 'talk', who: 'pete' },
        take: 'q_still_parts',
        talk: [
          { t: ['Ethel\'s still! I fixed this thing in \'79 and \'88 and twice in \'02. It\'s seen more surgery than me. Parts\'ll cost ya.'],
            choices: [
              pay(100, 'Pay Pete $100 for parts'),
              gate('int', 20, 'Rewire the pressure valve yourself while Pete watches'),
              leave('I\'ll come back.'),
            ] },
          ['> CLANG. HISS. The still lets out a sound like a satisfied burp. Pete\'s other eyebrow catches fire. He doesn\'t notice.', 'There. She\'ll cook again. Tell Ethel I said hi, and that I\'m sorry about 1996. She\'ll know.'],
        ],
        onDone: (g) => g.quests.giveItem('q_still'),
      },
      {
        text: 'Bring the still home to Grandma Ethel at Double-Wide Dreams.',
        obj: { type: 'talk', who: 'ethel' }, take: 'q_still',
        talk: [
          { t: ['My baby! Look at her. Purrin\'. Now: WHO took her?'],
            choices: [
              { label: 'Tell her the truth: the Juniors', hint: '+karma', do: (g) => { g.state.addStat('karma', 4); },
                then: ['MY OWN GRANDBABIES? *She cocks Pastor.* Sugar, take this and go. I gotta go have a conversation with some boys about inheritance law.', '> Somewhere near the junkyard, two forty-year-old men start running before they even know why.'] },
              { label: 'Lie: it was the Velvet Syndicate', hint: '-karma, extra moonshine', do: (g) => { g.state.addStat('karma', -3); g.quests.giveItem('moonshine', 2); g.state.setFlag('ethel_war'); },
                then: ['Those Hilltop velvet weasels? *She spits. It hits a fly.* Then it\'s WAR. Here, two extra jars. For the war effort.', '> Grandma Ethel has declared war on Hilltop. Hilltop has not been informed. Hilltop will find out.'] },
            ] },
          ['And you keep this. *She hands you a sawed-off shotgun with PASTOR carved on the stock.* He\'s retired. Take him to church.'],
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ BLACKWATER: fishing legend
  side_rustjaw: {
    kind: 'side', title: 'The Hubcap Leviathan', giver: 'harriet',
    rumor: 'One-legged sea captain on Pier Zero swears she\'s gonna land Old Rustjaw. Island folk say she\'s been trying for twenty years. Island folk say a lot of things.',
    summary: 'Cap\'n Harriet Hooks has spent twenty years hunting Old Rustjaw, the hubcap-jawed catfish of Blackwater. She needs a second pair of arms. And legs. Especially legs.',
    available: (g) => g.state.p.level >= 3 || !!g.state.p.progress?.districts?.blackwater,
    offer: [
      { who: 'nar', t: ['> A woman with a wooden leg, an eyepatch and a captain\'s hat older than the bridge is glaring at the black water like it owes her alimony.'] },
      ['Cap\'n Harriet Hooks. Forty years at sea. Twenty of \'em hunting one fish. Old Rustjaw. Ninety pounds of spite with a hubcap in his jaw.', 'He took my leg. He took my boat. He took my husband, Leonard, in 2004. Leonard was a lousy husband but he was MY lousy husband.'],
      'I need a deckhand who can fish, can fight, and can follow orders. You look like you can do one of those. Prove the rest.',
    ],
    reward: { xp: 400 }, rewardText: 'A harpoon gun, or ninety pounds of legend',
    steps: [
      {
        text: (g, q) => `Prove you can fish: catch 3 fish at Pier Zero. Rent a rod from Mumbling Hank or bring your own. (${q.sd.n || 0}/3)`,
        obj: { type: 'event', evt: 'island:fish', count: 3 },
        marker: { loc: 'blackwater_pier', label: 'Pier Zero (fishing)' },
        done: '> Harriet watches you reel in your third fish and grunts. From her, that\'s a standing ovation.',
      },
      {
        text: 'Get the fog tables from Keeper Ezekiel at Blackwater Light. Harriet says he knows when Rustjaw feeds.',
        obj: { type: 'goto', loc: 'blackwater_light', radius: 9 },
        arrive: [
          { who: 'Keeper Ezekiel Brine', t: ['Harriet sent you? Ha! That woman. Twenty years. She proposed to me once, y\'know. I said no. She threw me off the pier. Love\'s funny.', 'Here\'s the secret: Rustjaw comes up when the foghorn sounds after dark. Thinks it\'s another big fish. Lonely old bastard. Blow the horn at night on Pier Zero and he\'ll come.'] },
          { who: 'nar', t: ['> He hands you a damp notebook full of tide charts, fish drawings and, on one page, a little heart with "H + E" scratched out.'] },
        ],
      },
      {
        text: 'Meet Harriet at Pier Zero after dark (8 PM - 6 AM) and sound the foghorn. Bring your strength. Or your brain. Or both.',
        obj: { type: 'goto', loc: 'blackwater_pier', night: true, radius: 10 },
        run: async (g, q) => {
          try { g.island?.foghorn?.(1); } catch { /* cosmetic */ }
          const p = g.state.p;
          const again = !!p.island?.rustjaw;
          await g.quests.say([{ who: 'nar', t: [
            '> Harriet blows the foghorn. HAAAAAWWWNNNN. The black water goes still. Then something rises: a rusted hubcap, a whisker as thick as a garden hose, and an eye the size of a dinner plate.',
            again ? '> He looks at you. He REMEMBERS you. He did not like being caught the first time.' : '> Old Rustjaw. Ninety pounds. Older than the bridge. He bites the bait Harriet threw, and the whole pier groans.',
          ] }], { char: 'harriet' });
          const rounds = [
            { t: 'Round 1: Rustjaw dives. The line screams. The pier shakes. Harriet yells "HOLD HIM!"', opts: [['Haul him in with brute force', 'str', 25], ['Let him run, then reel when he tires', 'int', 22], ['Sing him a sea shanty to calm him down', 'cha', 22]] },
            { t: 'Round 2: He breaches. The hubcap glints in the fog. He\'s trying to wrap the line around a piling.', opts: [['Wrestle the line free', 'str', 30], ['Read the current and steer him into open water', 'int', 28], ['Whistle like a lonely lady catfish', 'cha', 28]] },
            { t: 'Round 3: He\'s at the pier. Exhausted. Furious. Harriet drops the net. "NOW, DECKHAND!"', opts: [['Grab him by the hubcap', 'str', 20], ['Time the net with the swell', 'int', 18], ['Look him in the eye and say "it\'s over, buddy"', 'cha', 18]] },
          ];
          let wins = 0;
          for (const r of rounds) {
            const opts = r.opts.map(([label, st, min]) => ({ label, hint: `${st.toUpperCase()} ${min}${(p[st] ?? 0) >= min ? '' : ' (risky)'}` }));
            const i = await g.quests.ask({ title: 'Old Rustjaw', speaker: 'CAP\'N HARRIET', text: r.t, options: opts });
            if (i == null) return 'stay';
            const [, st, min] = r.opts[i];
            const ok = (p[st] ?? 0) >= min || Math.random() < 0.3;
            if (ok) wins++; else { g.state.damage(8, 'catfish'); g.state.useEnergy(5); }
            g.ui.toast(ok ? 'He gives ground!' : 'He yanks you into the railing. Ow.', ok ? 'good' : 'bad', 2200);
          }
          if (wins < 2) {
            await g.quests.say([{ who: 'nar', t: ['> SNAP. The line breaks. Rustjaw sinks back into the fog, flipping you off with a fin the size of a car door.', '> Harriet sighs. "Twenty years. What\'s one more night. Come back after dark, deckhand. Get stronger. Or smarter. Or prettier."'] }], { char: 'harriet' });
            return 'stay';
          }
          await g.quests.say([{ who: 'nar', t: ['> Rustjaw flops onto the pier, gasping, enormous. Jammed in the hubcap in his jaw is a gold wedding ring.', '> Harriet goes pale. "That\'s... that\'s Leonard\'s ring." She kneels down. The fish looks up at her with the eyes of a disappointed husband.', '> "Leonard?" she whispers. "He always said he\'d come back as something big."'] }], { char: 'harriet' });
          const c = await g.quests.ask({ title: 'Old Rustjaw', text: 'Harriet is crying. The fish is gasping. The ring glints. What do you do?', options: [
            { label: 'Let him go. Some legends belong in the water.', hint: '+12 karma' },
            { label: 'Land him. Ninety pounds of legend is worth $2,600 at the Rusty Hook.', hint: 'a legendary fish, -10 karma' },
          ] });
          if (c === 1) { q.data.kept = true; g.state.addItem('fish_rustjaw', 1); g.state.addStat('karma', -10); }
          else { q.data.freed = true; g.state.addStat('karma', 12); }
          return 'advance';
        },
      },
      {
        text: 'Talk to Cap\'n Harriet on Pier Zero.',
        obj: { type: 'talk', who: 'harriet' },
        talk: [
          (g, q) => (q.data.kept
            ? ['*She won\'t look at you.* You took him. Fine. FINE. He\'s yours. Sell him to Mama Barnacle. She\'ll mount him over the fryer.', 'Twenty years I hunted him, and when I finally had him, I didn\'t want him. That\'s marriage, deckhand. That\'s marriage.']
            : ['*She watches the ripples.* Thank you, deckhand. He\'ll be back next fog. I\'ll be here. We\'ll yell at each other. It\'ll be like old times.', 'Take this. My harpoon gun. I won\'t be needing it. Leonard always hated it anyway.']),
        ],
        onDone: (g, q) => {
          if (q.data.kept) { g.state.addMoney(300, 'Harriet'); return; }
          g.quests.giveWeapon('harpoon'); giveAmmo(g, 'heavy', 6);
        },
      },
    ],
  },

  // ------------------------------------------------------------------ BLACKWATER: Funland conspiracy
  side_funland: {
    kind: 'side', title: 'Hee Hee Hee', giver: 'wendell',
    rumor: 'The guy in the Funland vest outside the arcade? Wendell. Says the Incident was a cover-up. He says it to everybody. He says it to the gulls.',
    summary: 'Wendell Pratt ran the Funland Ferris wheel the night of the Incident. Eleven years later he still wears the vest, and he still thinks somebody powerful wanted it shut down.',
    available: (g) => g.state.p.level >= 3 || !!g.state.p.progress?.districts?.blackwater,
    offer: [
      { who: 'nar', t: ['> A man in a faded Funland staff vest is pacing outside the arcade with a corkboard under his arm. The corkboard has more string than cork.'] },
      ['Wendell Pratt. Ride operator, Funland, eleven years ago. I was on shift the night of the Incident. Everybody blames Mr. Giggles. Mr. Giggles was on the PA. Mr. Giggles didn\'t do anything except laugh.', 'Somebody was on that wheel. Somebody dumped something off the top car. And then somebody shut the whole park down and paid for a prison next door. Coincidence? *He taps the string.* NO.'],
      'Help me prove it. Look around the old park. Talk to Giggles. You\'re not crazy like me. People might believe you.',
    ],
    reward: { xp: 400, items: { prize_jacket: 1 } }, rewardText: 'The truth (and a Funland staff jacket)',
    steps: [
      {
        text: (g, q) => `Search the ruins of Funland and the island for evidence. (${visited(q)}/3)`,
        obj: { type: 'visit', points: [{ district: 'blackwater', label: 'Evidence?' }, { district: 'blackwater', label: 'Evidence?' }, { district: 'blackwater', label: 'Evidence?' }] },
        visitText: [
          'Half-buried in the sand: a waterlogged crate stenciled CITY OF ROTWELL — ELECTION SERVICES. Empty. Smells like low tide and democracy.',
          'Tangled in a fishing net: a soggy, unopened ballot. The box next to "SWINDELL" is blank. The box next to "LITERALLY ANYONE ELSE" is checked.',
          'Under the bandstand: a VOTE SWINDELL button, a broken flashlight, and a single red clown nose. Uh oh.',
        ],
      },
      {
        text: 'Mr. Giggles in the Blackwater Pen only talks to people wearing a clown nose. Get a Squeaky Clown Nose (Funland prize counter, or the clown at the gate at night).',
        obj: { type: 'check', check: (g) => g.state.hasItem('prize_nose') },
        marker: { loc: 'funland_arcade', label: 'Funland Arcade (prize counter)' },
        done: '> HONK. You put it on. You feel ridiculous. Mr. Giggles is going to love it.',
      },
      {
        text: 'Visit Mr. Giggles at Blackwater Pen (visiting hours 9 AM - 6 PM). Wear the nose.',
        obj: { type: 'goto', loc: 'blackwater_pen', radius: 10, req: visitingHours, reqText: 'Visiting hours are 9 AM - 6 PM. Officer Krumm points at the sign. Then at you. Then at the sign.' },
        take: 'prize_nose',
        arrive: [
          { who: 'nar', t: ['> Behind the plexiglass, a man in faded greasepaint lights up when he sees your nose. "HEE. A friend. A FRIEND. Give it here." Officer Krumm lets you pass it through. He doesn\'t want to argue with the clown either.'] },
          { who: 'Mr. Giggles', t: ['Ballots, friend. That\'s what they were. Eleven elections\' worth. Swindell\'s people would ride the wheel to the top every election night and dump the real votes into the bay. HEE.', 'I saw them from the PA booth. I laughed because what else do you do? They said I caused the Incident. The Incident was me SEEING it.', 'They still do it. Every term. Night after the count. And they keep the extras in the old ticket booth until they dump them. Go look after dark. Bring friends. Bring fists. Hee.'] },
        ],
      },
      {
        text: 'Ambush Swindell\'s ballot dumpers at the Funland Arcade after dark (8 PM - 6 AM).',
        obj: { type: 'brawl', loc: 'funland_arcade', count: 3, kind: 'thug', tier: 2, label: 'Swindell\'s Ballot Boys', night: true, radius: 12 },
        arrive: [{ who: 'nar', t: ['> Three men in VOTE SWINDELL windbreakers are loading a crate onto a dolly next to the dead Ferris wheel. One of them is whistling the Funland theme. The wheel creaks and starts to turn by itself. Everybody pretends not to notice.'] }],
        win: ['> The Ballot Boys flee across the bridge. They leave the crate: hundreds of soggy ballots, and every single one says NOT SWINDELL.'],
        winGive: 'q_ballots',
      },
      {
        text: 'Bring the crate of ballots to Wendell outside the Funland Arcade.',
        obj: { type: 'talk', who: 'wendell' },
        talk: [
          ['*He opens the crate. He reads a ballot. He reads another. He sits down on the curb.* I was right. Eleven years. I was RIGHT. Nobody ever voted for him.'],
          { t: ['So what now? You got the proof. Somebody\'s gonna want it. Lots of somebodies.'],
            choices: [
              { label: 'Give the ballots to Det. Thorne. Make it a case.', hint: '+12 karma, $500', do: (g) => { g.quests.takeItem('q_ballots'); g.state.addStat('karma', 12); g.state.addMoney(500, 'Wendell'); g.state.setFlag('ballots_thorne'); return 'complete'; },
                then: [(g) => (g.state.getFlag('ending_mayor') ? ['Chief Thorne will love this. Swindell gets another eleven terms. In a cell.', '> Wendell hands you $500 in Funland tokens he got exchanged at the pawn shop. And his vest. No. He keeps the vest. He gives you a jacket.'] : ['Thorne? The honest one? *He laughs, and for once it doesn\'t sound crazy.* Yeah. Yeah, let\'s make the weird one\'s day.', '> Wendell hands you $500 and a Funland staff jacket. "Employee of the month. Eleven years running."'])] },
              { label: 'Sell them back to Swindell\'s people', hint: '+$3,000, -12 karma', do: (g) => { g.quests.takeItem('q_ballots'); g.state.addMoney(3000, 'hush money'); g.state.addStat('karma', -12); g.state.setFlag('ballots_sold'); return 'complete'; },
                then: ['You... you\'re selling them BACK? *Wendell stares at you like you\'re the wheel.* Fine. Take your money. Take the jacket too. I don\'t want anything you touched.', '> A Swindell staffer pays you $3,000 in a campaign envelope. It has a little American flag sticker on it. And a bloodstain.'] },
            ] },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ BLACKWATER: prison break favor
  side_jailbreak: {
    kind: 'side', title: 'Happy Anniversary', giver: 'rhonda',
    rumor: 'There\'s a lady outside the Pen on the island who wants her husband out for their anniversary. Out-out. Not visiting-out.',
    summary: 'Rhonda McGee wants her husband, bank robber Knuckles McGee, home for their 25th anniversary. Not on parole. Over the wall.',
    available: (g) => g.state.p.level >= 4 || !!g.state.p.progress?.districts?.blackwater,
    offer: [
      { who: 'nar', t: ['> A woman with hair teased higher than the prison wall is chain-smoking outside the visiting entrance. Her shirt says I ♥ MY CONVICT.'] },
      ['Rhonda McGee. Wife of Knuckles McGee. Fourteen banks, thirteen successful. Twenty-five years married, nineteen of \'em through plexiglass.', 'Our anniversary is this week. I want my man home for it. I got a plan. It involves a cake. A very heavy cake.'],
      'Gus at the Greasy Spoon bakes "special" cakes for the right price. You get the cake, you get it to Knuckles, you meet him by the wall after dark. Easy.',
    ],
    reward: { xp: 400, car: 'commuter', carColor: '#c8b88a', carFallback: 3000 },
    rewardText: 'Knuckles\' old getaway car: the most invisible car ever built',
    steps: [
      {
        text: 'Get a "special" cake from Gutbuster Gus at the Greasy Spoon (Gutterside).',
        obj: { type: 'talk', who: 'gus' },
        talk: [
          { t: ['A cake for Rhonda McGee? *He winks with his whole face.* Yeah, I know the recipe. Flour, eggs, sugar, and "a little something for the inside". The little something is a hacksaw. Hundred bucks.'],
            choices: [
              pay(100, 'Pay Gus $100'),
              gate('cha', 25, 'Remind Gus you survived the Gutbuster bathroom. He owes you.'),
              leave('Come back later.'),
            ] },
          ['> He hands you a cake that weighs as much as a bowling ball. On top, in frosting: HAPPY 25TH. DO NOT EAT.'],
        ],
        onDone: (g) => g.quests.giveItem('q_cake'),
      },
      {
        text: 'Smuggle the cake to Knuckles at Blackwater Pen (visiting hours 9 AM - 6 PM).',
        obj: { type: 'goto', loc: 'blackwater_pen', radius: 10, req: visitingHours, reqText: 'Visiting hours are 9 AM - 6 PM. Come back when Krumm\'s at his desk.' },
        take: 'q_cake',
        run: async (g) => {
          const p = g.state.p;
          const odds = Math.max(0.25, Math.min(0.9, 0.55 + p.cha / 100 - (p.heat || 0) * 0.1));
          const i = await g.quests.ask({ title: 'Visiting Room', speaker: 'OFFICER KRUMM', text: 'Whatcha got there? A cake? For an inmate? Hm. *He sniffs it.* Smells like... cake. And metal. Why\'s it smell like metal?', options: [
            { label: '"It\'s an iron-fortified cake. For his anemia."', hint: `${Math.round(odds * 100)}% odds (CHA helps, heat hurts)` },
            { label: 'Wait until 3 PM, when the guards nap', hint: g.time.hour === 15 ? 'it\'s nap time!' : 'come back at 3 PM' , disabled: g.time.hour !== 15 },
            { label: 'Leave and come back later' },
          ] });
          if (i === 2 || i == null) return 'stay';
          if (i === 1 || Math.random() < odds) {
            await g.quests.say([{ who: 'nar', t: [i === 1 ? '> Krumm is asleep on his crossword. You slide the cake through the slot. Knuckles catches it like a football.' : '> "Anemia. Huh. My mom had that." Krumm waves the cake through. Knuckles catches it like a newborn.', '> Knuckles mouths through the glass: "TONIGHT. NORTH WALL. BRING A CAR."'] }]);
            return 'advance';
          }
          g.state.addHeat(1);
          await g.quests.say([{ who: 'nar', t: ['> Krumm cuts the cake. CLANK. A hacksaw. He looks at you for a long, long time.', '> "I\'m gonna pretend this is a novelty cake," he says, eating a slice around the saw. "Come back tomorrow. With a less obvious cake." He hands back the rest of it, saw and all. (+1 heat. Try again later, or at 3 PM when the guards nap.)'] }]);
          return 'stay';
        },
      },
      {
        text: 'Wait by the prison wall after dark (8 PM - 6 AM) with a car for the getaway.',
        obj: { type: 'goto', at: { loc: 'blackwater_pen' }, needCar: true, night: true, radius: 14, label: 'Getaway spot (prison wall)' },
        arrive: [
          { who: 'nar', t: ['> A rope made of bedsheets drops over the wall. Somebody very large climbs down it, very slowly, eating something.', '> It is not Knuckles McGee. It is Big Lenny Two-Times, holding the last slice of cake.'] },
          { who: 'Big Lenny', t: ['Hi! I\'m Lenny! Knuckles said the outside is too sad and he likes his cell. He gave me the cake. I ate the cake. The saw was in the cake. I ate some of the saw.', 'Are we best friends now? We\'re best friends now. Where are we going? Do you have food?'],
            choices: [
              { label: 'Drive Lenny to freedom', hint: '+3 heat, a friend for life', do: (g, q) => { q.data.lenny = 'free'; g.state.addHeat(3); g.state.addStat('karma', 2); g.state.setFlag('lenny_free'); },
                then: [{ who: 'nar', t: ['> You floor it across the bridge. Lenny hangs out the window screaming "FREEDOOOM" and eating a bug. Sirens wail behind you. Lenny waves at them.'] }] },
              { label: 'Drive Lenny back around to the front gate', hint: '+5 karma, $200 from Krumm', do: (g, q) => { q.data.lenny = 'back'; g.state.addStat('karma', 5); g.state.addMoney(200, 'Krumm'); g.state.setFlag('lenny_back'); },
                then: [{ who: 'nar', t: ['> Officer Krumm takes Lenny back in, gives you $200 out of his own wallet, and says "nobody saw nothin\'". Lenny waves goodbye. "BYE BEST FRIEND. VISIT ME. BRING FOOD."'] }] },
            ] },
        ],
      },
      {
        text: 'Break the news to Rhonda outside the Pen.',
        obj: { type: 'talk', who: 'rhonda' },
        talk: [
          (g, q) => [
            'He... stayed in? He said the OUTSIDE was too sad? *She lights two cigarettes and smokes them both.* ...Yeah. That sounds like my Knuckles. He always did like a routine.',
            q.data.lenny === 'free' ? 'And you busted out LENNY instead? Lenny eats like a garbage disposal with a credit card. Well. Somebody\'s gonna have a happy anniversary.' : 'And you took Lenny back. Good. Lenny would\'ve eaten my couch.',
          ],
          ['Here. Knuckles\' old getaway car. The Beige Commuter. He robbed thirteen banks in it and nobody ever remembered seeing it. It\'s the least memorable car ever built. I can\'t even picture it now and I\'m looking right at the keys.'],
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ DOWNTOWN: skateboard
  side_skate: {
    kind: 'side', title: 'Old School', giver: 'marlene',
    rumor: 'There\'s an old lady skater outside Skid Row Apartments looking for somebody with a board and no fear. Mostly no fear.',
    summary: 'Gnarly Marlene, 68, two hip replacements, wants to shred Rotwell one last time. She needs a crew. You are the crew.',
    available: (g) => hasBoard(g),
    lockedText: () => 'No board? Then what are we talking about, kid? Skidmark Kev by Threads & Dreads sells \'em. Come back with something under your feet besides shame.',
    offer: [
      { who: 'nar', t: ['> A grey-haired woman in a torn band shirt and knee pads is doing kickflips on the sidewalk. Her hips click with every landing. It sounds like castanets.'] },
      ['Gnarly Marlene. I was skating Rotwell before Grimco paved over the good ditches. I invented the "Swindell Gap". I broke both hips doing it. Both times.', 'One last session. You, me, Hilltop. The rich hate skaters. That\'s the best part.'],
      'Show me you can ride first. Then we go somewhere we\'re not allowed.',
    ],
    reward: { money: 700, stats: { str: 1, cha: 2 }, xp: 300 }, rewardText: '$700, +CHA, and Marlene\'s pro deck',
    onComplete: (g) => {
      const s = g.state.p.skate;
      if (s && Array.isArray(s.owned) && !s.owned.includes('pro')) { s.owned.push('pro'); g.state.changed('skate'); g.ui.toast('New board: <b>Marlene\'s old pro deck</b> (G to ride)', 'good', 3600); }
    },
    steps: [
      {
        text: (g, q) => `Show Marlene you can ride: land 8 tricks on your board (G to mount, Space to ollie, click to kickflip). (${q.sd.n || 0}/8)`,
        obj: { type: 'event', evt: 'skate:trick', count: 8 },
        marker: { who: 'marlene' },
        done: '> Marlene nods. "Sloppy. Brave. Stupid. You remind me of me."',
      },
      {
        text: (g, q) => `Skate Hilltop Heights: land 5 tricks while in Hilltop. The rich hate it. (${q.sd.n || 0}/5)`,
        obj: { type: 'event', evt: 'skate:trick', count: 5, filter: (d, evt, g) => { const p = g.quests.playerPos(); return !!p && g.world?.districtAt?.(p.x, p.z) === 'hilltop'; } },
        marker: { loc: 'rotwell_u', label: 'Hilltop (skate here)' },
        done: '> A butler drops a tray of champagne. A woman in pearls clutches her pearls. Marlene cackles from somewhere behind you.',
      },
      {
        text: 'Hilltop Private Security (Segway Division) is coming for you. Fight them off outside Grimsworth Manor.',
        obj: { type: 'brawl', loc: 'hilltop_mansion', count: 3, kind: 'thug', tier: 2, label: 'Segway Security', radius: 12 },
        arrive: [{ who: 'nar', t: ['> Three security guards on Segways roll up at a terrifying four miles an hour. "Skateboarding is prohibited in Hilltop," one says through a megaphone. He is four feet away.'] }],
        win: ['> One Segway rolls on without its rider, down the hill, all the way to Gutterside. Somebody there will be very happy.'],
      },
      {
        text: 'Meet Marlene at the City Hall steps for her last trick: the Swindell Gap.',
        obj: { type: 'goto', loc: 'city_hall', radius: 10 },
        arrive: [
          { who: 'nar', t: ['> Marlene is waiting at the top of the City Hall steps, board under her arm. Twelve steps. A fountain. A bronze statue of Swindell pointing at nothing.', '> She drops in. She ollies. She clears the steps, grinds the statue\'s pointing arm, and lands on the fountain rim. Her hips make a sound like a xylophone falling down stairs.'] },
          { who: 'marlene', t: ['STILL GOT IT! *She is lying in the fountain.* Don\'t help me up. I live here now.', 'You know who stole Swindell\'s toupee in \'89 and ran it up the flagpole? Me. On this board. Here. Take it. It\'s got one more great session in it. Make it yours.'] },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ DOWNTOWN: heist-adjacent
  side_teller: {
    kind: 'side', title: 'Inside Man', giver: 'norman',
    rumor: 'The sweaty teller at the First Bank keeps asking customers how to "get into crime". He\'s been robbed forty-one times. Maybe he\'s just jealous.',
    summary: 'Nervous Norman, First Bank teller, recognized you from a heist. He\'s not going to turn you in. He wants you to teach him.',
    available: (g) => heistsDone(g) > 0,
    lockedText: (g) => (g.state.p.level >= 2 ? '*He sweats at you.* Please make your deposit. Please don\'t rob me. Please. I have a mother. She\'s terrifying.' : null),
    offer: [
      { who: 'nar', t: ['> A teller in a sweat-soaked short-sleeve shirt corners you outside the bank. He\'s shaking. He\'s also smiling.'] },
      ['I know it was you. The heist. You wore a mask, but you\'re the only stick figure in Rotwell who walks like a shopping cart with a bad wheel.', 'Don\'t worry! I\'m not calling anybody. I\'ve been robbed forty-one times. Forty-one! I\'ve said "please don\'t shoot" more times than "good morning".'],
      'I want to be on the OTHER side of the counter. Teach me. Make me a criminal. I\'ll make it worth your while. I know where the bank keeps everything. Emotionally, too.',
    ],
    reward: { xp: 350 }, rewardText: 'A "clerical error" in your favor',
    steps: [
      {
        text: 'Every criminal needs a mask. Buy Norman a "professional" ski mask from Lucky Larry\'s Pawn (Gutterside).',
        obj: { type: 'talk', who: 'larry' },
        talk: [
          { t: ['A ski mask? For a bank teller? Hah! Sure. This one\'s been worn by four successful criminals and one unsuccessful one. He\'s fine. Mostly. Forty bucks.'],
            choices: [pay(40, 'Buy the ski mask ($40)'), leave('Not right now.')] },
        ],
        onDone: (g) => g.quests.giveItem('q_ski_mask'),
      },
      {
        text: 'Supervise Norman\'s first "practice job" at the Gas-N-Gulp (Downtown). He\'s armed with a banana.',
        obj: { type: 'goto', loc: 'gas_n_gulp', radius: 9 }, take: 'q_ski_mask',
        arrive: [
          { who: 'nar', t: ['> Norman pulls on the ski mask, holds a banana like a gun, kicks open the door and screams "THIS IS A ROBBERY! I THINK!"', '> The clerk looks up. She is seventy. She has a perm. She says: "NORMAN EUGENE PATTERSON."', '> It is his mom.'] },
          { who: 'Norman\'s Mom', t: ['You are ROBBING me? With a BANANA? I packed that banana! In your LUNCH!'],
            choices: [
              gate('cha', 20, 'Explain it\'s a "role-play exercise for bank security training"', 'advance', [{ who: 'Norman\'s Mom', t: ['...Training. Hmph. Well, he\'s doing it WRONG. You hold the banana sideways. Like the gangsters. *She shows him.*'] }]),
              pay(5, 'Pay for the Slurpee he panicked and drank ($5)', 'advance', [{ who: 'nar', t: ['> You pay for the Slurpee. Norman\'s mom grounds him. He is forty-four. He accepts it.'] }]),
              { label: 'Run. Leave Norman behind.', hint: '-karma', do: (g) => { g.state.addStat('karma', -2); }, then: [{ who: 'nar', t: ['> You run. Behind you, you hear a forty-four-year-old man being spanked with a rolled-up newspaper. You will hear it in your dreams.'] }] },
            ] },
        ],
      },
      {
        text: (g, q) => `Norman's real talent: he knows the armored truck schedule. Case the route with him. (${visited(q)}/3)`,
        obj: { type: 'visit', points: [{ district: 'downtown', label: 'Truck stop' }, { district: 'rustyards', label: 'Truck stop' }, { district: 'hilltop', label: 'Truck stop' }] },
        visitText: [
          'Downtown stop: Norman times the guard\'s coffee break. Four minutes. Three if the coffee\'s hot. "He always burns his tongue. Always."',
          'Rustyards stop: the truck idles here for nine minutes while the driver argues with his wife on the phone. Norman knows her. "She\'s right, by the way."',
          'Hilltop stop: the guards tip the casino valet in cash. In bags. Norman wipes his forehead. "This is the most alive I\'ve felt since the forty-first robbery."',
        ],
        onDone: (g) => g.state.setFlag('norman_intel'),
      },
      {
        text: 'Meet Norman outside the First Bank.',
        obj: { type: 'talk', who: 'norman' },
        talk: [
          ['They fired me. Mom called the bank. "Fraternizing with criminals." Nineteen years and they gave me a sheet cake and a security escort.', '*He leans in, sweating directly onto your shoulder.* But before I left, I made a little... clerical error. In your account. A big little error. Two thousand five hundred dollars big.'],
          { t: ['Keep it. Or don\'t. I\'m a criminal now, I don\'t care. *He cares a lot.*'],
            choices: [
              { label: 'Keep the "clerical error"', hint: '+$2,500 in the bank, -3 karma', do: (g) => { const p = g.state.p; p.bank = (p.bank || 0) + 2500; g.state.changed('bank'); g.state.addStat('karma', -3); g.state.setFlag('norman_crew'); return 'complete'; },
                then: ['Wonderful. Wonderful! I\'m a thief. *He bursts into tears of joy.* If you ever need someone who knows a vault, I\'m around. I\'m always around. I don\'t have anywhere else to go.'] },
              { label: 'Make him put it back. Go straight, Norman.', hint: '+6 karma', do: (g) => { g.state.addStat('karma', 6); g.state.addMoney(250, 'Norman'); g.state.setFlag('norman_straight'); return 'complete'; },
                then: ['Straight? ...Yeah. Yeah, maybe I\'m not built for this. I sweat through ski masks. *He hands you $250 of his own money.* For the lessons. I\'m going to open a banana stand. Mom will help. Mom will yell.'] },
            ] },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ RUSTYARDS: co-op friendly
  side_movers: {
    kind: 'side', title: 'Heavy Lifting', giver: 'lonnie',
    rumor: 'Sweaty Lonnie by the Dockside Loft needs a mover. It\'s a two-person job. Bring a friend, if you have friends. Do you have friends?',
    summary: 'Sweaty Lonnie\'s moving business is down to one guy and a shopping cart. He has a grand piano to move from Grimsworth Manor to the Rustyards. It\'s a two-person job. Bring a friend if you\'ve got one.',
    available: (g) => g.quests.isDone('main_prologue'),
    offer: [
      { who: 'nar', t: ['> A man drenched in sweat is leaning on a shopping cart full of moving blankets. The cart has a sign: TWO GUYS & A TRUCK. The "TWO" has been crossed out. So has "TRUCK".'] },
      ['Lonnie. Two Guys & A Truck. The other guy quit. The truck got repossessed. The cart, I found.', 'Big job. A grand piano from Grimsworth Manor up in Hilltop to the Dockside Loft here. Some rich guy sold it to some other rich guy. It\'s a two-person lift.'],
      'If you got a buddy, bring \'em. Co-op, it\'s called. If not... how strong are you? Honestly?',
    ],
    reward: (g, q) => ({ money: 700 + (q.data.coop ? 300 : 0), xp: 300, stats: { str: 1 } }),
    rewardText: '$700 (+$300 if a friend helped lift)',
    steps: [
      {
        text: 'Lift the piano at Grimsworth Manor in Hilltop. STR 30 alone, STR 15 with a friend standing next to you, or pay some hobos.',
        obj: { type: 'goto', loc: 'hilltop_mansion', radius: 10 },
        run: async (g, q) => {
          const friends = friendsNear(g, 18);
          const str = g.state.p.str;
          const i = await g.quests.ask({ title: 'Grimsworth Manor', speaker: 'SWEATY LONNIE', text: `${friends ? `Okay, you brought ${friends > 1 ? 'friends' : 'a friend'}! Everybody grab a leg. Not MY leg.` : 'Just you, huh? Okay. Lift with your legs. Pray with your back.'}\n\n> The piano is black, enormous, and has a brass plaque: PROPERTY OF C. GRIMSWORTH III. TOUCH IT AND DIE.`, options: [
            { label: friends ? 'Lift it together' : 'Lift it yourself', hint: friends ? `needs STR 15 (you: ${Math.floor(str)})` : `needs STR 30 (you: ${Math.floor(str)})`, disabled: str < (friends ? 15 : 30) },
            { label: 'Pay four hobos to carry it ($200)', hint: '$200', disabled: !g.state.canAfford(200) },
            { label: 'Come back stronger (or with a friend)' },
          ] });
          if (i === 0) {
            if (friends) q.data.coop = true;
            g.state.useEnergy(15);
            await g.quests.say([{ who: 'nar', t: [friends ? '> You and your crew lift it in one smooth motion. Teamwork! Lonnie cries. The butler gasps.' : '> You lift it alone. Something in your spine says a word your mother wouldn\'t like. The piano goes on the roof of the car. Lonnie straps it down with dental floss.'] }]);
            return 'advance';
          }
          if (i === 1 && g.state.spend(200, 'hobo movers')) {
            await g.quests.say([{ who: 'nar', t: ['> Four hobos carry the piano out of the mansion while playing "Chopsticks" on it. The butler faints. Tuesday from the overpass waves at you from underneath it.'] }]);
            return 'advance';
          }
          return 'stay';
        },
      },
      {
        text: 'Drive the piano to the Dockside Loft in the Rustyards before the butler calls the cops. (Driving. It\'s on your roof.)',
        obj: { type: 'goto', loc: 'dock_loft', needCar: true, timer: 260, radius: 12 },
        give: 'q_piano', take: 'q_piano',
        failText: 'Too slow. The butler called the cops, the cops called Lonnie, Lonnie called you crying. He talked them down. Try again: the piano is back on your roof somehow.',
        arrive: [{ who: 'nar', t: ['> You pull up at the Dockside Loft. Every pothole on the way played a chord. The last one played a little jazz.'] }],
      },
      {
        text: 'Help Lonnie unload. Something inside the piano is going "thunk".',
        obj: { type: 'talk', who: 'lonnie' },
        talk: [
          { who: 'nar', t: ['> Lonnie lifts the lid. Instead of strings: forty bricks of white powder wrapped in crimson velvet. Little tags: CHAMPAGNE SNOW — PROPERTY OF V.V.', '> Lonnie goes pale, which on Lonnie is a shade of wet beige. "I\'m a mule. I\'m a MULE. I moved a piano for the Syndicate. My mother\'s gonna kill me. My MOVER mother."'] },
          { t: ['What do we do? WHAT DO WE DO?'],
            choices: [
              { label: 'Dump it all in the harbor', hint: '+8 karma, the Velvet will come for it', do: (g, q) => { q.data.dumped = true; g.state.addStat('karma', 8); if (g.quests.faction() === 'syndicate') g.quests.addRep('syndicate', -10); return 'advance'; },
                then: [{ who: 'nar', t: ['> Forty bricks go into the Rustyards harbor. The seagulls dive for them. The seagulls are going to have a VERY interesting night.'] }] },
              { label: 'Return it to the Velvet for a finder\'s fee', hint: '+$1,200, -4 karma', do: (g, q) => { q.data.returned = true; g.state.addMoney(1200, 'Velvet finder\'s fee'); g.state.addStat('karma', -4); if (g.quests.faction() === 'syndicate') g.quests.addRep('syndicate', 5); return 'complete'; },
                then: [{ who: 'nar', t: ['> A Velvet courier arrives within four minutes, counts the bricks, tips you $1,200 and leaves a breath mint on the piano. "The Contessa appreciates discretion. And movers."'] }] },
            ] },
        ],
      },
      {
        text: 'The Velvet Syndicate wants their piano filling back. Defend the Dockside Loft.',
        obj: { type: 'brawl', loc: 'dock_loft', count: 3, kind: 'gang', tier: 2, label: 'Velvet Collectors', radius: 12 },
        arrive: [{ who: 'nar', t: ['> Three men in crushed-velvet tracksuits step out of a town car. "Where\'s the snow?" "In the harbor." "...The WHOLE harbor?" They crack their knuckles in unison. They\'ve rehearsed that.'] }],
        win: ['> The Velvet Collectors limp back to their town car. Lonnie peeks out from inside the piano. "Is it over? Can I come out? I live in here now?"'],
      },
    ],
  },

  // ------------------------------------------------------------------ GUTTERSIDE: rivalry
  side_rival: {
    kind: 'side', title: 'The Other Plunger', giver: 'chet',
    rumor: 'Some clown with a plunger on his head is telling everyone at the Booze Hut that HE\'S the Plunger from Reg\'s prophecy. You gonna take that?',
    summary: 'Chet Plungerton says HE is the Plunger from Reg\'s prophecy. He has business cards. He has a plunger hat. He challenged you to three contests, and he will not shut up.',
    available: (g) => g.quests.isDone('main_prologue') && g.state.p.level >= 3,
    lockedText: (g) => (g.quests.isDone('main_prologue') ? 'You? The Plunger? Come back when you\'re level 3, rookie. Business card? *He hands you one. It says PLUNGER (THE REAL ONE).*' : null),
    offer: [
      { who: 'nar', t: ['> A man in a cheap suit with a toilet plunger strapped to his head like a crown is handing out business cards outside the Booze Hut. He stops when he sees you.'] },
      ['Well, well, well. The "Plunger". *He does air quotes with plungers.* Chet Plungerton. THE Plunger. The prophecy is about me, pal. It\'s literally in my name.', 'This town ain\'t big enough for two plungers. Three contests: drinking, driving, fighting. Loser leaves the prophecy.'],
    ],
    reward: { xp: 400 }, rewardText: 'Sole custody of the prophecy',
    steps: [
      {
        text: 'Contest one: out-drink Chet at the Rusty Nail (Downtown).',
        obj: { type: 'goto', loc: 'rusty_nail', radius: 9 },
        run: async (g) => {
          const p = g.state.p;
          await g.quests.say([{ who: 'chet', t: ['Bartender! Two of the worst things you have. Keep \'em coming until one of us is a puddle.'] }]);
          const gut = 0.45 + p.str / 120 + (p.level || 1) / 60;
          let you = 0, chet = 0;
          for (let r = 1; r <= 3; r++) {
            const i = await g.quests.ask({ title: `Drinking Contest — Round ${r}`, speaker: 'CHET PLUNGERTON', text: ['Round one: Piss Lite. It\'s mostly water. The water is mostly Rotwell.', 'Round two: Rotgut Whiskey. The bottle has a skull on it. The skull looks worried.', 'Final round: the house special, "The Drain Cleaner". It\'s blue. It\'s smoking. It is legally a liquid.'][r - 1], options: [
              { label: 'Chug it', hint: `${Math.round(Math.min(0.95, gut) * 100)}% odds (STR & level help)` },
              { label: 'Pour half down your shirt when he\'s not looking', hint: p.int >= 15 ? 'INT 15: sneaky' : 'needs INT 15', disabled: p.int < 15 },
            ] });
            if (i == null) return 'stay';
            if (i === 1 || Math.random() < gut) you++; else chet++;
          }
          if (you >= 2) {
            await g.quests.say([{ who: 'nar', t: ['> Chet slides off his stool in slow motion, plunger-first, and suctions himself to the floor. He stays there. The bartender puts a coaster on him.'] }]);
            return 'advance';
          }
          g.state.damage(10, 'drinking contest');
          await g.quests.say([{ who: 'nar', t: ['> You wake up in the Rusty Nail bathroom with a plunger-shaped hickey on your forehead. Chet has drawn a mustache on you. Try again when you can hold your liquor.'] }]);
          return 'stay';
        },
      },
      {
        text: 'Contest two: beat Chet in a race. Win any race at the Dustbowl Drag Strip.',
        obj: { type: 'event', evt: 'race:won', count: 1 },
        marker: { loc: 'drag_strip', label: 'Dustbowl Drag Strip' },
        done: '> Chet shows up to the strip in a minivan with PLUNGER MOBILE spray-painted on the side. You win. He blames the minivan. The minivan is his mom\'s.',
      },
      {
        text: 'Contest three: fight Chet at The Pit in the Rustyards.',
        obj: { type: 'brawl', loc: 'the_pit', count: 1, kind: 'fighter', tier: 2, label: 'Chet Plungerton', boss: { name: 'Chet Plungerton', moves: ['combo', 'charge'], scale: 1.05, color: '#c8c0b0', hat: 'tophat' } },
        arrive: [{ who: 'chet', t: ['This is it! Plunger versus "Plunger"! *He removes his plunger hat and kisses it.* This is for my sponsors.', '@ ...Sponsors?', 'NOTHING. FIGHT ME.'] }],
        win: ['> Chet goes down. His plunger hat pops off and rolls into the crowd. A business card falls out of his pocket. It\'s on Grimco letterhead.'],
        winGive: 'q_plunger_card',
      },
      {
        text: 'Confront Chet outside the Booze Hut about that Grimco business card.',
        obj: { type: 'talk', who: 'chet' }, take: 'q_plunger_card',
        talk: [
          ['*He won\'t look at you.* Okay. OKAY. Grimco hired me. Focus groups said poor people wanted a hero. So they made one. Me. "The Plunger™". There\'s merch. There\'s a jingle.', 'I just wanted to be somebody, man. Reg never called me a plunger. Reg called me "that guy who owes me nine dollars".'],
          { t: ['So what now, "real" Plunger?'],
            choices: [
              { label: '"There\'s only one Plunger. Get out of Gutterside."', hint: '+2 CHA', do: (g) => { g.state.addStat('cha', 2); g.state.setFlag('chet_gone'); return 'complete'; },
                then: ['*He takes off the plunger crown and leaves it on the curb.* Fine. I\'m going to Hilltop. I\'ll be an influencer. Rich people love a guy with a gimmick.'] },
              { label: '"Be my hype man instead."', hint: '+3 karma, a loud friend', do: (g) => { g.state.addStat('karma', 3); g.state.setFlag('chet_hype'); return 'complete'; },
                then: ['Your... hype man? *His eyes well up.* Nobody\'s ever wanted me to be their anything. I\'ll tell EVERYBODY. Loudly. Constantly. You\'ll hate it.'] },
              { ...gate('cha', 25, 'Sell the "Plunger" brand to Grimco yourself', 'complete', ['You\'re gonna sell... YOURSELF? To Grimco? *He stares in awe.* That\'s the most Rotwell thing I\'ve ever seen. Here\'s the guy\'s number. Ask for Todd.', '> Todd from Grimco HR pays $2,500 for exclusive rights to "The Plunger™". Somewhere under the overpass, Reg sneezes and doesn\'t know why.']),
                hint: 'needs CHA 25 · +$2,500, -6 karma', do: (g) => { g.state.addMoney(2500, 'brand deal'); g.state.addStat('karma', -6); g.state.setFlag('plunger_brand'); return 'complete'; } },
            ] },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ HILLTOP/CITY: missing person investigation
  side_hobbs: {
    kind: 'side', title: 'Missing: Councilman Hobbs', giver: 'delphine',
    rumor: 'Councilman Hobbs went missing. Last seen dressed as a pigeon. His wife\'s been hanging around the Holy Rebate in Hilltop asking for help.',
    summary: 'City Councilman Harold Hobbs has been missing for three weeks. His wife Delphine wants him found. The flyers on the City Hall bulletin board say he was last seen dressed as a pigeon.',
    available: (g) => g.quests.isDone('main_prologue'),
    offer: [
      { who: 'nar', t: ['> A tired woman in a lavender hat is pinning a MISSING flyer to the church door. Somebody has drawn a beak on the photo. She draws a mustache over the beak, to "balance it out".'] },
      ['Delphine Hobbs. My husband, Harold, is a city councilman. Three weeks ago he went to a "committee meeting" in a pigeon costume and never came home.', 'The police won\'t help. Chief Lardner said, and I quote, "a pigeon is a pigeon, lady". Please. Find out what happened to him. I\'ll pay.'],
    ],
    reward: { xp: 300 }, rewardText: 'Depends what you tell her',
    steps: [
      {
        text: 'Ask Gladys at City Hall (Window 3) what Councilman Hobbs was working on.',
        obj: { type: 'talk', who: 'gladys' },
        talk: [
          ['Hobbs? Oh, he filed Form 27-P. "Extended Pigeon Leave". Very rare form. I had to get it from behind the bear.', '> She slides a form under the glass. Under REASON FOR LEAVE, in shaky handwriting: "The council is a cage. The sky is a city. Coo."'],
          ['Last address on file is "the roofs". That\'s not an address, hon. I wrote it down anyway. Check where the pigeons roost. They move around. Like hobos with wings.'],
        ],
      },
      {
        text: (g, q) => `Check the pigeon roosts around the city for signs of the councilman. (${visited(q)}/3)`,
        obj: { type: 'visit', points: [{ district: 'downtown', label: 'Pigeon roost' }, { district: 'gutterside', label: 'Pigeon roost' }, { district: 'rustyards', label: 'Pigeon roost' }] },
        visitText: [
          'Downtown roost: feathers, a half-eaten bagel, and a council-issue tie folded neatly into a nest. Somebody has been sleeping here. Somebody with a pension.',
          'Gutterside roost: a notepad full of meeting minutes. Every line is "coo". The last page says "MOTION TO POOP ON SWINDELL: CARRIED UNANIMOUSLY".',
          'Rustyards roost: fresh droppings and a trail of bird seed leading toward St. Mercy\'s. The flock is gathering. You hear cooing. Organized cooing.',
        ],
      },
      {
        text: 'The Pigeon Parliament gathers outside St. Mercy\'s Hospital Downtown. Break up the meeting.',
        obj: { type: 'brawl', loc: 'st_mercy', count: 4, kind: 'drunk', tier: 1, label: 'The Pigeon Parliament', radius: 12 },
        arrive: [(g) => ({ who: 'nar', t: [
          '> A dozen figures in pigeon costumes are holding a session on the hospital steps. A gavel. A bucket of seed. A banner: ORDER OF THE COO.',
          g.quests.isDone('main_hobo') ? '> At the head of the flock sits the Pigeon Lord, bottle-cap crown and one eye. He sees you. "YOU AGAIN," he coos. "THE KING OF THE CRUST. THIS IS PERSONAL."' : '> A one-eyed "pigeon" in a bottle-cap crown bangs the gavel. "The chair recognizes... AN INTRUDER. Flock! PECK!"',
        ] })],
        win: ['> The flock scatters, molting. One of them is too slow: a paunchy pigeon in reading glasses. You grab him by the feathers. Under the beak: Councilman Harold Hobbs.', '> "Please," he says. "Up here nobody asks me to vote for Swindell\'s budget. Up here I just poop on him. Don\'t make me go home."'],
      },
      {
        text: 'Go back to Mrs. Hobbs at the Church of the Holy Rebate and tell her... something.',
        obj: { type: 'talk', who: 'delphine' },
        talk: [
          { t: ['Did you find him? Is he alive? Is he... a pigeon?'],
            choices: [
              { label: 'Tell her the truth: he\'s a pigeon now, and he\'s happy', hint: '+6 karma, $400', do: (g) => { g.state.addStat('karma', 6); g.state.addMoney(400, 'Mrs. Hobbs'); g.state.setFlag('hobbs_pigeon'); return 'complete'; },
                then: ['Happy? Harold? He hasn\'t been happy since the 1990 budget vote. *She stares into the distance.* ...Do they make those costumes in lavender?', '> A week later, a lavender pigeon joins the Parliament. The flock votes her in unanimously. She brings sandwiches.'] },
              { label: 'Drag him home. A councilman belongs in council.', hint: '+2 karma, $800', do: (g) => { g.state.addStat('karma', 2); g.state.addMoney(800, 'Mrs. Hobbs'); g.state.setFlag('hobbs_home'); return 'complete'; },
                then: ['*Harold shuffles in, still in half the costume. Delphine looks at him for a long time.* ...You know, the house was so quiet without you. *She hands you $800.* Take him back. TAKE HIM BACK. I\'m kidding. Mostly. Here\'s your money.'] },
              { label: 'Lie: "He\'s dead. I\'m so sorry. Here\'s the life insurance paperwork."', hint: '+$1,500, -10 karma', do: (g) => { g.state.addStat('karma', -10); g.state.addMoney(1500, 'insurance "finder\'s fee"'); g.state.setFlag('hobbs_dead'); return 'complete'; },
                then: ['Dead? *A long pause.* ...I see. *She fills out the paperwork extremely fast. She hands you $1,500 "for your trouble".* I\'m going to Hilltop Spa. For grieving. For several months.', '> Somewhere on a roof, a pigeon in reading glasses reads his own obituary and coos with joy.'] },
            ] },
        ],
      },
    ],
  },
};
