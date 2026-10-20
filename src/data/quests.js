/* =============================================================================
   ROTWELL — STORY BIBLE (quests/story module)
   =============================================================================
   ROTWELL is a smog-choked city that nobody ever leaves. Highway 9 "leads out"
   but somehow always curves back into Gutterside. Everyone knows. Nobody asks.

   THE TRUTH (revealed in Restricted Bunker 9, out in the Dustbowl):
     The smog is a dome — "the Lid". Rotwell is GRIMCO's Civic Endurance Study,
     PROJECT LID: a sealed city where Grimco measures exactly how much garbage a
     population will tolerate (rent, wages, meat, mayors) and sells the data to
     every corporation on Earth. Day 7,302 of observation.
     Last night YOU got blackout drunk, climbed the bunker fence, read the binder,
     and got zapped by a Grimco cleanup crew's FORGET-ME-NOT 3000. Before they got
     you, you scrawled a note on the back of a Pizza Butt coupon. You wake up with
     it, a hangover, and $50.

   POWERS THAT BE
   - MAYOR DICK SWINDELL: shaped like a bowling pin in a tux. Grimco's puppet.
     Cut the fire department because "fire is nature". Pigeons hate him.
   - GRIMCO: megacorp. Owns the water, the power, St. Mercy's, the meat plant, the
     mayor, and your moral fiber. CEO CHADWICK GRIMSWORTH III — teeth so white
     they have their own zip code; the first two Chadwicks died in "yachting
     accidents" (he was steering).
   - THE VELVET SYNDICATE (Hilltop): casino, nightclub and cute-named pharmaceuticals.
     Boss VIVIENNE VELOUR, "the Velvet Contessa", and her furious diamond-collared dog
     LORD SNIFFERTON. Muscle: TWO-TON TITO. Secretly Grimco's "entertainment division".
   - THE GUTTER RATS (Gutterside): slum gang run by BIG SAL MONELLA ("like the
     bacteria") out of a rusted ice cream truck that plays a jingle like a clown
     dying slowly. Bootleg cough syrup, chop shops, a guy named Pus.
   - ROTWELL PD: CHIEF BARNEY LARDNER, a stack of donuts in a uniform on the
     Syndicate payroll; DET. MARISOL THORNE, the last honest cop ("the weird one").
   - CRUSTY REG, Oracle of the Overpass: hobo prophet in a crown cut from a beer
     can. Calls you "the Plunger" (Rotwell is a toilet; you're what unclogs it).
     Secretly DR. REGINALD CRUSTWORTH, Project LID's original head scientist, who
     walked out and has been living under the overpass in penance ever since.

   FIVE DOORS (main paths -> endings)
     Rats (Kingpin)   main_rats   -> 'kingpin'   King of the Gutter
     Velvet/Grimco    main_corp   -> 'corporate' CEO of Rot
     Thorne's badge   main_mayor  -> 'mayor'     Mayor of Rotwell (high karma)
     Bunker 9         main_bunker -> 'escape'    Lifting the Lid (high INT)
     Reg's crown      main_hobo   -> 'hobo'      Long Live the Crust (joke)
   Rats and Velvet are mutually exclusive. Thorne won't work with gang members.
   ============================================================================= */

const $ = (n) => '$' + Math.round(n).toLocaleString('en-US');
const STATN = { str: 'STR', int: 'INT', cha: 'CHA', karma: 'Karma' };

// ---------------------------------------------------------------------------
// Script helpers. A "page" is a string, an array of lines, or
// { who, t | html, choices, next }. Line prefixes: '> ' narration, '@ ' you.
// Choices: { label, hint, if(g,q), hide(g,q), do(g,q,ctx) -> result, then: pages,
//            result }. Results: 'advance' | 'stay' | 'complete' | 'fail' |
//            'accept' | 'decline' | <step number>.
// ---------------------------------------------------------------------------
export const pay = (amount, label, result = 'advance', then = null) => ({
  label: label || `Pay ${$(amount)}`,
  // Say WHY it's greyed out: quest payments come out of your pockets, not the bank.
  hint: (g) => (g.state.canAfford(amount) ? $(amount)
    : `${$(amount)} cash · you have ${$(g.state.p.money)}${(g.state.p.bank || 0) > 0 ? ' (withdraw at an ATM)' : ''}`),
  if: (g) => g.state.canAfford(amount),
  do: (g) => { g.state.spend(amount, 'quest'); return result; },
  then,
});
export const gate = (stat, min, label, result = 'advance', then = null) => ({
  label, hint: `needs ${STATN[stat] || stat} ${min}`,
  if: (g) => (g.state.p[stat] ?? 0) >= min,
  result, then,
});
export const leave = (label = 'Not right now.') => ({ label, result: 'stay' });
// Marker for "earn money / get promoted" steps: where you work now (else Pizza Butt, which hires anyone).
const jobMarker = (label = 'Work a shift') => (g) => {
  const loc = g.jobs?.current?.()?.def?.loc || 'pizza_butt';
  const p = g.quests.locPos(loc) || g.quests.locPos('pizza_butt');
  return p && { ...p, label: `${label}: ${p.label}` };
};
export const fight = (spec, label, then = null, result = 'advance') => ({
  label, hint: 'fight',
  do: async (g) => ((await g.quests.brawl(spec)) ? result : 'stay'),
  then,
});

// ---------------------------------------------------------------------------
// Characters. `loc` = location they hang around (door + offset), `slot` picks a
// side so two characters at one door don't overlap. inside:true = only reachable
// through that location's menu (no street NPC).
// ---------------------------------------------------------------------------
export const CHARACTERS = {
  reg: {
    name: 'Crusty Reg', title: 'Oracle of the Overpass', loc: 'hobo_camp', slot: 0,
    color: '#4a3f2a', hat: 'crown', talkPrompt: 'Talk to Crusty Reg',
    idle: [
      'The pigeons have unionized, Plunger. Their demands are bread and vengeance.',
      "I dreamed of a man made of soup. He told me to buy low. I'm still thinking about it.",
      'Every gutter in Rotwell drains to the same place. So does every soul. The harbor. Bring a towel.',
      'Rotwell is a toilet. You are the plunger. Plungers don\'t get thanked, they get used. Then rinsed.',
      'The sky is a lid, kid. Ask yourself who\'s holding the jar.',
      "Don't eat the Rotwell Meat Loaf. I know a guy who did. Now he IS the meat loaf. Metaphorically. Mostly.",
      "Look at that smog. Gorgeous. Like a dirty diaper wrapped around a dream.",
      'You have the aura of a damp sock that believes in itself. Good. Hold onto that.',
      'I once had a lab coat. Now I have a box. The box has better ethics.',
    ],
  },
  chad: {
    name: 'Chad Bitsworth', title: 'Disrupted Ex-Founder', loc: 'hobo_camp', slot: 1,
    color: '#2a3a4a', hat: 'beanie', talkPrompt: 'Talk to Chad',
    idle: [
      "We're not homeless, bro. We're 'location-independent'.",
      "I'm pivoting. From 'broke' to 'pre-revenue'.",
      "My cardboard box has a co-working space. It's the other half of the box.",
      "Rise and grind, bro. Mostly grind. My teeth, at night, from stress.",
      "Uber for Dumpsters was ahead of its time. And also a crime, technically.",
    ],
  },
  sal: {
    name: 'Big Sal Monella', title: 'Boss of the Gutter Rats', loc: 'rats_clubhouse', slot: 0,
    color: '#3a4a20', hat: 'cap', hatColor: '#6a7a2a', talkPrompt: 'Talk to Big Sal',
    // Post-ending greeting (overrides idle chatter so the world remembers what you did).
    after: (g) => ({
      ruthless: '> Big Sal is back from his "retirement" at the harbor: damp, humbled, and wearing a tank top that says ERRAND BOY. "Boss. You still need jobs run? I need the work. The harbor\'s cold."',
      shared: 'Co-boss! The truck\'s got two steering wheels now. Neither one works. That\'s teamwork, baby.',
    })[g.state.getFlag('ending_kingpin')] || null,
    idle: [
      'Monella. Like the bacteria. You get one joke. You used it already. In your head. I saw.',
      "Ice cream truck don't sell ice cream. The jingle's a code. The code is 'run'.",
      "Gutterside's a family, kid. A family where everybody owes everybody money.",
      "I got a fungus that's started paying rent. That's the kind of man I am. Generous.",
      "Velvet thinks they're better 'cause they wear suits. I wear a tank top. It used to be a suit.",
    ],
  },
  vivienne: {
    name: 'Vivienne Velour', title: 'The Velvet Contessa', loc: 'syndicate_lounge', slot: 0,
    color: '#5a1020', hat: 'fedora', hatColor: '#2a0a12', talkPrompt: 'Speak with the Contessa',
    after: (g) => (g.state.getFlag('vivienne_gone') || g.state.getFlag('ending_kingpin')
      ? '> The Contessa is back, in a blonde wig, sunglasses and a stick-on mustache. "I am NOT Vivienne. I am her cousin. Vivian. One N. Completely different woman. Now. Business?"'
      : null),
    idle: [
      "Don't touch the velvet, darling. The velvet touches YOU. When it's ready.",
      'Lord Snifferton smells poverty on you. He\'s growling. He\'s also drooling, so it\'s complicated.',
      'Crime is just commerce that hasn\'t hired the right lawyer yet.',
      'I bathe in champagne. The cheap kind. I\'m frugal where it counts.',
      "Call me Viv one more time and you'll be upholstery.",
    ],
  },
  grimsworth: {
    name: 'Chadwick Grimsworth III', title: 'CEO, Grimco', loc: 'grimco', slot: 0,
    color: '#1c1c24', hat: 'tophat', hatColor: '#0a0a0e', talkPrompt: 'Talk to Mr. Grimsworth',
    after: (g) => ({
      coup: '> Grimsworth now staffs the Grimco lobby desk. His smile has not moved. "Welcome to Grimco, boss. Would you like a lanyard? I have made you forty lanyards."',
      partner: 'Partner! The ficus sends its regards. It voted to give us both a raise. We accepted on its behalf.',
    })[g.state.getFlag('ending_corporate')] || null,
    idle: [
      'Grimco: We Own That Too.',
      "Ethics? I've heard of it. We acquired it in '09 and dissolved it for tax purposes.",
      "I don't sweat. I have it done for me. By an intern. Named Kevin.",
      'Synergy! *He says it like a sneeze. A rich, rich sneeze.*',
      "My teeth are insured for more than your neighborhood. I've checked. I own the insurance.",
    ],
  },
  mopsy: {
    name: 'Mopsy', title: 'Grimco Night Janitor', loc: 'grimco', slot: 1,
    color: '#4a5a6a', hat: 'cap', hatColor: '#2a3a4a', talkPrompt: 'Talk to Mopsy',
    idle: [
      "Shh. The mop is listening. I don't know whose side it's on.",
      "I clean up Grimco's messes. Some of them scream.",
      'Twenty-two years. They gave me a gold watch. It\'s a sticker of a watch.',
      "I live in a van with my mom. It's fine. She has the good seat.",
    ],
  },
  thorne: {
    name: 'Det. Marisol Thorne', title: 'The Last Honest Cop', loc: 'rotwell_pd', slot: 0,
    color: '#1f2a44', hat: 'fedora', hatColor: '#3a3226', talkPrompt: 'Talk to Det. Thorne',
    idle: [
      "Six years building a case on this city. My corkboard has a corkboard.",
      "They call me 'the weird one' 'cause I don't take bribes. I take salads. Sad ones.",
      "Every crook in Rotwell is connected. It's a kickback centipede.",
      "Coffee's terrible here. Somebody keeps putting evidence in the pot.",
    ],
  },
  lardner: {
    name: 'Chief Barney Lardner', title: 'Chief of Rotwell PD', loc: 'rotwell_pd', slot: 1,
    color: '#1a2440', hat: 'cop', hatColor: '#141c30', talkPrompt: 'Talk to Chief Lardner',
    idle: [
      '*He eats a donut using a second donut as a plate.* What? It\'s efficient.',
      "Crime's down forty percent. We stopped writing it down.",
      "My door's always open. My wallet's always openER.",
      "Thorne? Good cop. Too good. Makes the rest of us look like us.",
    ],
  },
  mayor: {
    name: 'Mayor Dick Swindell', title: 'Mayor of Rotwell (Eleven Terms)', loc: 'city_hall', inside: true,
    idle: [
      'Grimco jobs! Grimco future! Grimco... *checks card* ...Grimco!',
      "I'm a man of the people. I've SEEN people. From my car.",
      "Fire is NATURE, son. I'm an environmentalist.",
      'Vote Swindell: Because You Already Did.',
    ],
  },
  gladys: {
    name: 'Gladys Pruitt', title: 'City Hall Clerk, Window 3 (of 1)', loc: 'city_hall', inside: true,
    idle: [
      "Take a number. The number is 4,812. We're serving number 9.",
      'The bees? They live in my hair. They have better benefits than me.',
      "Form 27-B? That's in the basement. Behind the bear. Don't make eye contact with the bear.",
    ],
  },
  fumble: {
    name: 'Prof. Ignatius Fumble', title: 'Rotwell U, Dept. of Applied Nonsense', loc: 'rotwell_u', slot: 0,
    color: '#6a6050', hat: 'beanie', hatColor: '#8a2a2a', talkPrompt: 'Talk to Prof. Fumble',
    idle: [
      "I'm teaching a pigeon calculus. He's better at it than my grad students.",
      'Tenure! Tenure means they can\'t fire me. They\'ve tried. With a literal cannon.',
      "Knowledge is power. Power is electricity. Electricity is why my eyebrows are gone.",
      "Never trust a corporation with a cheerful logo. Grimco's is a smiling tooth. Shudder.",
    ],
  },
  pickles: {
    name: 'Cpl. Dwayne Pickles', title: 'Bunker 9 Gate Guard', loc: 'bunker', slot: 0,
    color: '#4a5a30', hat: 'hardhat', hatColor: '#3a4a26', talkPrompt: 'Talk to Cpl. Pickles',
    idle: [
      'HALT! ...Oh, it\'s you. At ease. Not you. Me. I\'m at ease.',
      "I guard the gate. What's behind it? Classified. Also I don't know. Also I don't want to.",
      "Eighteen years on this gate. One lawn chair. Three burritos a shift.",
      "The bunker hums at night. I hum back. We have a thing.",
    ],
  },
  pete: {
    name: 'Scrapper Pete', title: 'Junkyard Owner (One Leg, No Patience)', loc: 'junkyard', slot: 0,
    color: '#5a4030', hat: 'cap', hatColor: '#7a3a1a', talkPrompt: 'Talk to Scrapper Pete',
    idle: [
      'Everything in this yard works. Except me. And the dog. And most of the yard.',
      'I can fix anything with a wrench and a bad attitude. I got two wrenches.',
      "Don't touch the blue barrels. They touch back.",
    ],
  },
  ooze: {
    name: 'Madame Ooze', title: 'Fortune Teller (Licensed in No States)', loc: 'madame_ooze', slot: 0,
    color: '#4a2050', hat: 'beanie', hatColor: '#7a2a8a', talkPrompt: 'Talk to Madame Ooze',
    idle: [
      'I see... a tall dark stranger. He is going to sell you a fake watch.',
      'The cards say you will die. Eventually. The cards are very good at "eventually".',
      "Cross my palm with silver, darling. Or a twenty. Or a sandwich.",
      'Your aura is beige. Beige! Do you know how rare that is? It\'s not rare. It\'s just sad.',
    ],
  },
  larry: {
    name: 'Lucky Larry', title: 'Pawnbroker', loc: 'lucky_larrys', slot: 0,
    color: '#3a3a2a', hat: 'fedora', hatColor: '#1a1a12', talkPrompt: 'Talk to Lucky Larry',
    idle: [
      "Lucky rabbit's foot? Lucky horseshoe? Lucky fourth rabbit's foot? Not so lucky for the rabbit.",
      "Everything's for sale. Including that. And that. Especially that.",
      "No refunds, no returns, no questions, no answers.",
    ],
  },
  gus: {
    name: 'Gutbuster Gus', title: 'Greasy Spoon Fry Cook', loc: 'greasy_spoon', slot: 0,
    color: '#6a5a4a', hat: 'cap', hatColor: '#d0c8b0', talkPrompt: 'Talk to Gus',
    idle: [
      'The grease trap hasn\'t been cleaned since the Before Times. It has a name now. Kevin.',
      "Our special today is 'the usual'. Nobody knows what it is. It's always available.",
      "I hairnet my beard. Health code. Also the beard tried to escape once.",
    ],
  },
  molar: {
    name: 'Dr. Fenwick Molar, D.D.S.', title: 'Unlicensed Dentist', loc: 'st_mercy', slot: 1,
    color: '#c8c8c0', talkPrompt: 'Talk to Dr. Molar',
    idle: [
      'Open wide! ...Wider. ...WIDER. Okay that\'s too wide, close a bit, you\'re scaring the van.',
      "Floss? Pah. Floss is a conspiracy by Big String.",
      "I collect teeth the way some men collect stamps. Wetly.",
    ],
  },
  trashcanzo: {
    name: 'Don Trashcanzo', title: 'Raccoon Godfather (Allegedly a Raccoon)', loc: 'pizza_butt', slot: 1,
    color: '#5a5a5a', hat: 'fedora', hatColor: '#1a1a1a', talkPrompt: 'Pay respects to the Don',
    idle: [
      "*He hisses respectfully.* The family thanks you for your patronage.",
      'I am a raccoon. Do not look at the zipper. There is no zipper.',
      "Leave the bin. Take the cannoli. Then leave the cannoli. It's mine.",
    ],
  },
  prosper: {
    name: 'Pastor Prosper Goldbloom', title: 'Church of the Holy Rebate', loc: 'holy_rebate', slot: 0,
    color: '#6a5020', hat: 'tophat', hatColor: '#c9a227', talkPrompt: 'Talk to Pastor Prosper',
    idle: [
      'Blessed are the meek, for they shall inherit the late fees.',
      "Salvation: now fifteen percent off with a Platinum Soul membership!",
      "Jesus turned water into wine. I turn donations into a boat. It's called ministry.",
    ],
  },
  brock: {
    name: 'Brock Hardbody', title: 'Iron Lung Gym Legend', loc: 'iron_lung', slot: 0,
    color: '#7a3a2a', talkPrompt: 'Talk to Brock',
    idle: [
      "*flex* Sorry. Involuntary. *flex* Sorry.",
      'Leg day? Every day is leg day if you only have legs. I have everything. I have so much.',
      "I eat forty eggs a day. My farts are registered with the city.",
    ],
  },
  shush: {
    name: 'Ms. Eudora Shush', title: 'Head Librarian', loc: 'library', slot: 0,
    color: '#4a3a4a', talkPrompt: 'Whisper to Ms. Shush',
    idle: [
      'Shhhhhhh.',
      'The library is a sanctuary. Last week a man was stabbed in the Biography section. Very quietly.',
      'Knowledge is free. Late fees are not.',
    ],
  },
  needles: {
    name: 'Needles', title: 'Tattoo Artist (Spelling Optional)', loc: 'ink_stinks', slot: 0,
    color: '#2a2a2a', hat: 'beanie', hatColor: '#1a3a1a', talkPrompt: 'Talk to Needles',
    idle: [
      'Walk-ins welcome! Walk-outs... less common.',
      "My hand only shakes when I'm sober. So I'm never sober. For the art.",
      "I can do any font. Mostly Comic Sans. It's all I know.",
    ],
  },
  dale: {
    name: 'Big Dale', title: 'Biker, Misspelled', loc: 'dirty_spur', slot: 0,
    color: '#3a2a1a', hat: 'cap', hatColor: '#1a1a1a', talkPrompt: 'Talk to Big Dale',
    idle: [
      'What you lookin\' at? My chest? EVERYBODY\'S lookin\' at my chest.',
      "I'm a simple man. I ride, I drink, I hit, I nap.",
    ],
  },
  martha: {
    name: 'Mad Martha', title: 'Queen of the Dustbowl', loc: 'drag_strip', slot: 0,
    color: '#5a2a1a', hat: 'beanie', hatColor: '#d6b33c', talkPrompt: 'Talk to Mad Martha',
    idle: [
      "Half the dust in this desert is mine. The other half doesn't know it yet.",
      'Brakes are for people with something to lose.',
      'I named my bike Debra. Debra has killed four men. Debra is a good girl.',
    ],
  },
  dolores: {
    name: 'Dolores Deal', title: 'Disgruntled Croupier', loc: 'golden_tooth', slot: 0,
    color: '#3a1a2a', talkPrompt: 'Talk to Dolores',
    idle: [
      'Twelve years dealing cards for the Velvet. She pays me in "exposure". To lung cancer.',
      "House always wins. I'm not the house. I'm the welcome mat.",
      "I smoke three at once. It's the only way to hit my quota of not caring.",
    ],
  },
  hank: {
    name: 'Hank Gristlewood', title: 'Meat Plant Lifer', loc: 'meat_plant', slot: 0,
    color: '#7a6a5a', hat: 'hardhat', hatColor: '#c9a227', talkPrompt: 'Talk to Hank',
    idle: [
      "Twenty years on the rendering line. I don't smell it anymore. That's the scary part.",
      "Don't eat the Meat Loaf. Don't eat the Meat Pie. Don't eat the Meat Meat.",
      "I got a hairnet on my eyebrows. Safety first. Dignity eighth.",
    ],
  },
  dot: {
    name: 'Dockside Dot', title: 'Warehouse 13 Foreman', loc: 'warehouse_13', slot: 0,
    color: '#5a4a2a', hat: 'hardhat', hatColor: '#b0672a', talkPrompt: 'Talk to Dockside Dot',
    idle: [
      "Don't ask what's in the crates. I don't ask. The crates don't ask. It's a whole system.",
      "If a crate starts talking, you didn't hear it.",
      "I've moved stuff for the Rats, the Velvet, Grimco and one time the Pope. Allegedly.",
    ],
  },
  gary: {
    name: 'Tony Butt', title: 'Owner, Pizza Butt', loc: 'pizza_butt', slot: 0,
    color: '#8a2a1a', hat: 'cap', hatColor: '#c43a1a', talkPrompt: 'Talk to Tony Butt',
    idle: [
      "Yes, my name is Tony Butt. Yes, I named the place after myself. No, I don't see what's funny.",
      'Pizza Butt: We Put the Cheese in Places.',
      "Our slogan used to be 'Stuffed Crust'. Legal made us stop. I don't know why.",
    ],
  },
};

// Quest-only inventory items (ids prefixed q_). Systems' items.name() won't know
// them; the quests module exposes game.quests.itemName(id).
export const QUEST_ITEMS = {
  q_note: { name: 'Mysterious Note', desc: 'Your handwriting. Ketchup. Hopefully ketchup.' },
  q_glass_eye: { name: "Madame Ooze's Glass Eye", desc: 'It keeps staring at you. From your pocket.' },
  q_rug: { name: 'Definitely a Rug', desc: 'Heavy. Warm. Occasionally sneezes.' },
  q_gut_belt: { name: 'Gutbuster Championship Belt', desc: "It's a regular belt. It no longer fits you." },
  q_hobocoin: { name: 'One (1) HoboCoin', desc: 'A bottle cap with a Sharpie dollar sign. Priceless. Worthless.' },
  q_teeth: { name: 'Bag of Teeth', desc: 'Rattles like maracas. Smells like a fight.' },
  q_gold_tooth: { name: 'Gold Tooth', desc: 'Installed. Shiny. +Charm.' },
  q_garbage: { name: 'Premium Garbage', desc: 'Tribute for the family. Half a lobster, a cashmere sock, a jar that winks.' },
  q_tithes: { name: 'Bag of Holy Money', desc: '$900 of tithes. Smells like beer, perfume, and casino carpet.' },
  q_book: { name: 'The Joy of Taxidermy, Vol. 2', desc: '22 years overdue. Highlighted. Beer-stained. Weasel-adjacent.' },
  q_pizza: { name: 'Hot Pizza Butt Pizza', desc: 'Pineapple, anchovy and despair. Deliver it hot.' },
  q_pizza_tag: { name: 'Employee of the Minute Badge', desc: 'Pizza Butt honors you for roughly sixty seconds.' },
  q_wallet: { name: "Chief Lardner's Wallet", desc: 'Contains cash, a donut punch card, and a photo of a donut.' },
  q_meat: { name: 'Jar of Mystery Meat', desc: 'It pulsed. Twice. You are choosing not to think about it.' },
  q_meat_report: { name: 'Lab Report: Mystery Meat', desc: '40% Grimco protein substrate, 30% sneakers, 30% "sad".' },
  q_leg: { name: "Scrapper Pete's Leg", desc: 'Titanium. Racing stripes. Cup holder.' },
  q_love_letter: { name: "Pickles' Love Poem", desc: "Rhymes 'bunker' with 'hunk-er'. Bold." },
  q_reply: { name: "Madame Ooze's Reply", desc: 'Scented with patchouli and cat.' },
  q_briefcase: { name: 'Velvet Briefcase', desc: 'Ticks. Purrs. Do not open.' },
  q_ledger: { name: 'Grimco Bribe Ledger', desc: "Labeled 'DEFINITELY NOT BRIBES'. Notarized evil." },
  q_keycard: { name: 'Sticky Grimco Keycard', desc: 'Demagnetized by soda. Opens nothing. Yet.' },
  q_keycard_live: { name: 'Zapped Grimco Keycard', desc: "Re-encoded with a car battery. Also opens Pete's garage." },
  q_package: { name: 'Suspicious Package', desc: "It's 'medicine'. For a 'friend'. Don't shake it." },
  q_crate: { name: 'Smuggling Crate', desc: 'Contents: yes.' },
  q_fake_watch: { name: "Genuine 'Rolecks'", desc: 'Tells the right time twice a day.' },
  q_beer_ring: { name: 'Beer-Tab Engagement Ring', desc: "You're technically engaged to a drunk named Rudy." },
  q_indulgence: { name: 'Certificate of Indulgence', desc: 'Valid for one (1) sin, any size. Non-transferable.' },
  q_box_crown: { name: 'Cardboard Scepter', desc: 'The Overpass recognizes your authority. The city does not.' },
};

// ---------------------------------------------------------------------------
// Intro (new game). Shown in Roach Motel, Room 6.
// ---------------------------------------------------------------------------
export const INTRO = [
  { who: 'nar', t: [
    '> Darkness. A ceiling fan wobbles overhead like it\'s thinking about murder.',
    '> You wake up in the Roach Motel, Room 6. Your head feels like a dropped lasagna. Your mouth tastes like a raccoon died in it and then held a funeral in it.',
  ], next: 'Ugh.' },
  (g) => ({ who: 'nar', t: [
    '> A cockroach the size of your thumb is sitting on your pillow, staring at you. You make eye contact. He doesn\'t blink. He doesn\'t have eyelids. Right now, neither do you.',
    `> You pat your pockets: ${$(Math.max(0, g.state.p.money))}, a lint ball shaped like a disappointed face, and a folded Pizza Butt coupon with something scribbled on the back. In your handwriting. And ketchup. Hopefully ketchup.`,
  ], next: 'Read the note' }),
  { who: 'nar', html: `<div class="q-note">DON'T TRUST ANYONE.<br>ESPECIALLY THE MAYOR.<br>THE BUNKER IS THE KEY.<br>THE KEY IS IN THE BUNKER???<br><br>Go see REG under the overpass.<br>You owe him $20.<br><br>Also you are banned from the Rusty Nail.<br>— ME (you)<br><br><small>P.S. DRINK WATER YOU IDIOT</small></div><div class="ui-text"><em>Under the writing there's a crude doodle of a rocket. At least, you really hope it's a rocket.</em></div>`, next: 'What the hell happened last night?' },
  { who: 'Mrs. Krupnik (Motel Manager)', t: [
    '> Somebody pounds on the door hard enough to knock a roach off the ceiling. It lands in your hair. It stays there. It lives there now.',
    'ROOM SIX! You paid the month in cash and vomit last night, so you can stay. But if you come home singing about "THE SKY IS A LID" at 3 AM again, I\'m calling the cops. And the cops are worse than me. Slightly.',
  ], next: 'Face the day. Or whatever this is.' },
];

export const TUTORIAL = [
  '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to walk, <kbd>Shift</kbd> to run. Try not to step in anything.',
  '<kbd>E</kbd> to talk to people, enter buildings and use things.',
  '<kbd>J</kbd> opens your quest log. Gold beacons in the sky mark where to go.',
  '<kbd>Tab</kbd> shows your stats, stash and sad little inventory.',
  '<kbd>M</kbd> opens the city map. <kbd>F</kbd> gets you in and out of cars (stolen or otherwise).',
];

// Debate rounds for the mayor path.
const DEBATE = [
  {
    q: 'Moderator: "Candidates, Rotwell\'s water is brown. What will you do?"',
    mayor: 'Swindell: "Brown is a NATURAL color, folks. Like dirt. Or my tan. Next question!"',
    stat: 'cha', min: 30,
    good: 'Promise clean water and point out the mayor\'s "tan" is spray paint',
    bad: 'Admit you also drink the brown water and kind of like it',
    win: '> The crowd roars. Someone throws a bottle of brown water at the mayor. It lands in his toupee. It stays there.',
    lose: '> A man in the front row yells "BROWN IS DELICIOUS!" and the crowd agrees with him. Somehow you lost to tap water.',
  },
  {
    q: 'Moderator: "Grimco owns the hospital, the power company, and the meat plant. Is that a problem?"',
    mayor: 'Swindell: "Grimco is a FAMILY. A family that donated generously to my... family. Next!"',
    stat: 'int', min: 25,
    good: 'Explain, with charts, exactly where every Grimco bribe went',
    bad: 'Say "monopolies are like Monopoly, and I like games"',
    win: '> You unroll a chart so long it reaches the parking lot. Swindell starts sweating so hard his tuxedo files for unemployment.',
    lose: '> Swindell hands out free Grimco hot dogs. The crowd forgets the question. You forget the question. The hot dog is fine.',
  },
  {
    q: 'Moderator: "Final question. Why should Rotwell trust YOU?"',
    mayor: 'Swindell: "Because I\'ve been mayor eleven terms! Nobody remembers voting for me, and THAT\'S the kind of stability Rotwell deserves."',
    stat: 'karma', min: 40,
    good: 'Tell them what you\'ve actually done for this city',
    bad: 'Promise free beer and see what happens',
    win: '> You list it all: the people you\'ve helped, the creeps you\'ve stopped, the hobos you\'ve fed. A grandma in the crowd faints. Then she gets back up to clap.',
    lose: '> The crowd likes free beer, but they\'ve heard it before. From Swindell. Who delivered. Damn it.',
  },
];

// Reg's riddles for the hobo path.
const RIDDLES = [
  {
    q: 'First riddle: "What gets wetter the more it dries?"',
    a: ['A towel', 'Rotwell', 'Me, in the rain, crying'], right: 1,
    yes: 'RIGHT! Rotwell! Every time the sun comes out it just gets moister somehow. Science can\'t explain it. I tried. I was science.',
  },
  {
    q: 'Second riddle: "The rich man needs it, the poor man has it, and if you eat it you die. What is it?"',
    a: ['Nothing', 'The Rotwell Meat Loaf', 'A Grimco stock option'], right: 1,
    yes: 'CORRECT. The rich man needs it — for his profit margins. The poor man has it — for dinner. And if you eat it... well. You know.',
  },
  {
    q: 'Final riddle: "What is the true crown of a king?"',
    a: ['Gold', 'Respect', 'Whatever is on his head when he wakes up'], right: 2,
    yes: 'YES! A king doesn\'t choose his crown, the crown chooses him. Mine was a beer can. Before that it was a pigeon. That was a rough week.',
  },
];

// ---------------------------------------------------------------------------
// QUESTS. kind: 'main' | 'side'. Steps: { text, obj, talk, arrive, win, give, take, run }
// obj types: talk{who} goto{loc|at,radius,needCar,night,timer,req,reqText}
//   brawl{loc|at,count,kind,label,tier,night} visit{points} stat{stat,min}
//   money{min|max} event{evt|evts,count,sum,filter,orCheck} check{check} wait{days}
//   flag{flag} home{} job{rank}
// ---------------------------------------------------------------------------
export const QUESTS = {
  // ======================= PROLOGUE =======================
  main_prologue: {
    kind: 'main', title: 'Rock Bottom', giver: 'reg',
    summary: 'You woke up in the Roach Motel with $50, a hangover, and a note in your own handwriting telling you to trust no one and see "Reg" under the overpass.',
    reward: { xp: 120 }, rewardText: '120 XP, and five doors out of this toilet bowl',
    steps: [
      {
        text: 'Find Reg under the overpass in Gutterside. Your note says you owe him $20.',
        obj: { type: 'talk', who: 'reg' },
        talk: [
          { who: 'nar', t: ['> Under the overpass, a man in a crown cut from a beer can is roasting a hot dog over a burning tire. He looks at you like he\'s been expecting you since the Bronze Age.'] },
          ['AH. The Plunger cometh. Sit, sit. Mind the needles. They\'re knitting needles. I\'m making a scarf out of pigeon feathers. The pigeons are not thrilled.', '@ Do I... know you?'],
          ['You know me, you don\'t know me, you owe me twenty bucks. Last night you came down here at 3 AM, shirtless, screaming "THE SKY IS A LID!", and borrowed twenty dollars for "bunker snacks".'],
          {
            t: ['A man always pays his debts. Or he doesn\'t, and the universe sends a guy to bite him. Usually Sal. Sal bites.'],
            choices: [
              { label: 'Pay Reg his $20', hint: '$20', if: (g) => g.state.canAfford(20),
                do: (g) => { g.state.spend(20, 'debt'); g.state.setFlag('reg_paid'); g.state.addStat('karma', 2); },
                then: ['An honest debtor! In ROTWELL! I\'m gonna cry. *He cries.* That\'s just the tire smoke. *It isn\'t.*'] },
              { label: 'Stiff him. You don\'t remember borrowing anything.',
                do: (g) => { g.state.addStat('karma', -2); },
                then: ['Ah. A businessman. You\'ll go far. Probably to prison, but far. You can pay me later, I\'m not going anywhere. Literally. I don\'t have shoes.'] },
            ],
          },
          ['Listen, Plunger. Rotwell is a toilet. A big, clogged, backed-up toilet. And every so often the universe sends a plunger.', '@ ...I\'m the plunger?', 'You\'re the plunger.', '@ That\'s the worst prophecy I\'ve ever heard.'],
          ['Prophecies aren\'t supposed to be GOOD, they\'re supposed to be ACCURATE. Now: a plunger needs a handle. Get a job. Eat something that wasn\'t in a dumpster. Lift something. Hit somebody. Sell something. Then come back.', '> (Follow the gold beacon and the objective in the top right. Press J for the quest log.)'],
        ],
      },
      {
        text: 'Get a job. Big Marge at the Greasy Spoon (down the street from the motel) hires anybody with a pulse. Apply and work one shift.',
        obj: { type: 'event', evt: 'job:worked', count: 1 },
        marker: { loc: 'greasy_spoon', label: 'Greasy Spoon (jobs)' },
        reward: { money: 20 },
        done: '> First paycheck, plus a $20 "didn\'t cry on the grill" bonus. Keep working shifts at the same place to get promoted to better pay.',
      },
      {
        text: 'Everything costs energy. Eat something: a meal at the Greasy Spoon, a slice at Pizza Butt, or snacks from the Gas-N-Gulp.',
        obj: { type: 'event', evts: ['money:change', 'item:bought'], count: 1, quiet: true,
          filter: (d, evt, g) => (evt === 'money:change' ? d?.reason === 'food' && d.amount < 0 : ['food', 'drink'].includes(g.items?.def?.(d?.id)?.cat)) },
        marker: { loc: ['greasy_spoon', 'pizza_butt', 'gas_n_gulp'], label: 'Food' },
        done: '> Calories acquired. Watch your energy bar: work, training and fights all drain it. Food and sleep refill it.',
      },
      {
        // Goal is relative to where you are when the step starts (a Gym Rat who levels up on
        // their first shift would otherwise skip the gym/library intro entirely).
        text: (g, q) => `Get less pathetic: raise STR, INT or CHA to ${q?.sd?.goal || 10}. Pump iron at the Iron Lung Gym ($12 day pass) or read at the Public Library (free), both Downtown.`,
        onStart: (g, q) => { const p = g.state.p; q.sd.goal = Math.max(10, Math.floor(Math.max(p.str, p.int, p.cha)) + 3); },
        obj: { type: 'check', check: (g, q) => Math.max(g.state.p.str, g.state.p.int, g.state.p.cha) >= (q?.sd?.goal || 10) },
        marker: { loc: ['iron_lung', 'library'], label: 'Gym / Library' },
        done: '> You feel slightly less pathetic. The bar was low. You cleared it. Barely. Like a drunk doing a limbo.',
      },
      {
        text: 'Two drunks are hassling the hobos under the overpass. Go knock them out (Left-click to punch, keep moving).',
        obj: { type: 'brawl', loc: 'hobo_camp', count: 2, kind: 'drunk', tier: 0, label: 'Drunk Doug & Drunker Doug', names: ['Drunk Doug', 'Drunker Doug'], radius: 12 },
        arrive: [{ who: 'nar', t: ['> Two men in matching stained tank tops are trying to steal Reg\'s burning barrel. One of them is hugging it. He is on fire a little.', '> "This is OUR barrel now," slurs Drunk Doug. "Fight us. Or don\'t. Please don\'t."'] }],
        win: ['> The Dougs go down like two sacks of wet laundry. In their pockets: $40 and a coupon for a free colonoscopy. Reg applauds with his feet.'],
        reward: { money: 40, karma: 1 },
      },
      {
        text: 'Make your first deal: buy any product from a street dealer (marked on your map, one in every district), then sell it somewhere it\'s worth more. Cheap in Gutterside, pricey in Hilltop.',
        obj: { type: 'event', evt: 'drug:sold', count: 1 },
        marker: { near: 'dealer', label: 'Street dealer' },
        done: '> Buy low, sell high, try not to get arrested. Selling raises heat; if the cops come, run, or pay it off at the PD.',
      },
      {
        text: 'Reg says Rotwell only respects cash. Get $250 in your pocket (shifts, deals, Pizza Butt deliveries...).',
        obj: { type: 'money', min: 250 },
        marker: jobMarker(),
      },
      {
        text: 'Go to City Hall downtown and see who runs this dump.',
        obj: { type: 'goto', loc: 'city_hall', radius: 9 },
        arrive: [
          { who: 'nar', t: ['> A crowd of six people and one confused dog stand in front of City Hall. On the steps, Mayor Dick Swindell — a man shaped like a bowling pin stuffed into a tuxedo — is mid-speech.'] },
          { who: 'mayor', t: ['...and THAT is why we cut the fire department, folks. Fire is NATURE. And I am an ENVIRONMENTALIST. Grimco jobs! Grimco future! Grimco... *checks card* ...Grimco!'] },
          { who: 'nar', t: ['> A pigeon lands on his head and empties its entire soul onto his toupee. He doesn\'t stop talking. He\'s a professional.'] },
          { who: 'thorne', t: ['> A woman in a rumpled trench coat slides up beside you and flashes a badge so briefly it could have been a cracker.', 'Detective Thorne. Rotwell PD. The one who doesn\'t take bribes, so the others call me "the weird one".', 'You were seen at Bunker 9 last night. Climbing the fence. In your underwear. Singing.', '@ ...What was I singing?'] },
          { who: 'thorne', t: ['Something about the sky being a lid. Look — I don\'t care what you did. I care what you SAW. When you remember, come find me at the PD.', '> She walks off. The mayor is now being chased down the steps by the pigeon. The crowd applauds. It\'s the best policy he\'s had in years.'] },
        ],
      },
      {
        text: 'Go back to Reg under the overpass and tell him what you saw.',
        obj: { type: 'talk', who: 'reg' },
        talk: [
          ['A LID, eh? Hmm. Hmmmmm. *He scratches his crotch thoughtfully, like a great philosopher.*', 'Listen close, Plunger. There are five doors out of this toilet bowl.'],
          ['Door one: the GUTTER. Big Sal Monella and his Gutter Rats run Gutterside out of a busted ice cream truck. Muscle, product, and a total absence of hygiene. That\'s the road to Street Kingpin.'],
          ['Door two: the VELVET. Vivienne Velour\'s Syndicate up in Hilltop — the casino, the club, pharmaceuticals with cute names. Classy, murderous, and in bed with Grimco. That road ends in a corner office.', 'Pick the Rats OR the Velvet, kid. Not both. They hate each other more than they hate cops.'],
          ['Door three: the BADGE. That honest cop, Thorne. Do enough good and you could clean this city up... or run it. You\'d need karma, kid. Real karma. Not the kind you buy at the Holy Rebate.'],
          ['Door four: the BUNKER. Whatever you saw out in the Dustbowl last night scared you bad enough to write yourself a note. Get smart. Book smart. Then go find out.'],
          ['And door five... *He adjusts his beer-can crown.* Well. Door five is me. Every king needs an heir. But you\'re not ready. You still smell like soap.', 'Go. Choose. Or don\'t. The toilet doesn\'t care. It just keeps flushing.'],
          { who: 'nar', t: ['> Each door ends the story a different way. Open the quest log (J) and check the GOALS tab to see what every door needs and what to do next. You can chase more than one, and Rotwell keeps going after an ending.'] },
        ],
      },
    ],
  },

  // ======================= PATH: GUTTER RATS -> KINGPIN =======================
  main_rats: {
    kind: 'main', title: 'Rat Race', giver: 'sal', ending: 'kingpin',
    summary: 'Big Sal Monella wants to take the whole city from the Velvet Syndicate. You\'re his new favorite rat.',
    available: (g) => g.quests.isDone('main_prologue') && g.quests.faction() !== 'syndicate',
    lockedText: (g) => (g.quests.faction() === 'syndicate'
      ? 'You smell like velvet and snitching. Get outta my sight before I bite you.'
      : 'Reg ain\'t vouched for you yet. Go see the old crust under the overpass.'),
    offer: [
      { who: 'nar', t: ['> A rusted ice cream truck idles behind the clubhouse, playing a warped jingle that sounds like a clown dying slowly. A huge man in a stained tank top leans out the window, licking a frozen hot dog like a popsicle.'] },
      ['Big Sal Monella. Like the bacteria. Everybody makes the joke once. Nobody makes it twice.', 'Reg sent you? Reg sends me a lot of losers. One of \'em cleans my truck with his tongue now. Ask him how it\'s going. He can\'t answer. Tongue\'s tired.'],
      {
        t: ['The Velvet\'s been creepin\' into my gutter with their perfume and their fancy pills. I wanna take it ALL. Gutterside, the casino, Hilltop. You wanna be a Rat, you start at the bottom. And down here, the bottom is... *He gestures at the gutter.* ...literal.'],
        choices: [
          { label: 'I\'m in. Make me a Rat.', hint: 'joins the Gutter Rats (needs STR 10)', if: (g) => g.quests.faction() === 'rats' || g.state.p.str >= 10, do: (g) => { g.quests.joinFaction('rats'); return 'accept'; } },
          { label: 'Not today, Sal.', result: 'decline' },
        ],
      },
    ],
    reward: { xp: 2500, money: 15000, rep: { rats: 200 } }, rewardText: 'The streets. All of them. (+$15,000 first week of tribute)',
    steps: [
      {
        text: 'Teach the Velvet peddlers in Gutterside a lesson. They\'re hanging around the Greasy Spoon.',
        obj: { type: 'brawl', loc: 'greasy_spoon', count: 3, kind: 'gang', tier: 1, label: 'Velvet Peddlers' },
        arrive: [{ who: 'nar', t: ['> Three men in crushed-velvet blazers are selling "Champagne Snow" to a hobo who\'s paying in buttons.', '> "Ugh. A Rat," one sniffs. "Somebody spray it with something."'] }],
        win: ['> The velvet boys flee, leaving behind one loafer and a cloud of expensive cologne. The hobo keeps the buttons. And the loafer. He\'s having a great day.'],
      },
      {
        text: (g, q) => `Move product: sell 10 units of anything, to anyone. (${q.sd.n || 0}/10)`,
        obj: { type: 'event', evt: 'drug:sold', count: 10, sum: 'qty' },
        marker: { near: 'dealer', label: 'Street dealer' },
      },
      {
        text: 'Sal needs wheels for a job. Drive any car to Chop Chop Customs in the Rustyards. (Buy a beater at Lemon Lot, or press F next to someone else\'s.)',
        obj: { type: 'goto', loc: 'chop_chop', needCar: true, radius: 12 },
        arrive: [{ who: 'nar', t: ['> Sal\'s mechanic, a man with three fingers and strong opinions about all of them, circles your car.', '> "Nice. We\'ll put a spoiler on it shaped like a rat tail. And a horn that plays the Rat anthem." He honks it. The anthem is just screaming.'] }],
      },
      {
        text: (g) => `Sal says you hit like a wet napkin. Get your STR to 30 (now ${Math.floor(g.state.p.str)}). Iron Lung Gym, the meat plant, or Rat jobs at the clubhouse.`,
        obj: { type: 'stat', stat: 'str', min: 30 },
        marker: { loc: 'iron_lung', label: 'Iron Lung Gym' },
      },
      {
        text: 'Report back to Big Sal at the clubhouse.',
        obj: { type: 'talk', who: 'sal' },
        talk: [
          ['Look at you! Arms like hams. Stolen hams, but hams. Now listen up. *He unrolls a map. It\'s drawn on a pizza box. There\'s cheese on the casino.*'],
          ['The Golden Tooth. Vivienne\'s casino in Hilltop. The vault\'s under the craps tables. We\'re gonna rob it, and then we\'re gonna rob it again just to be rude.', 'We need an inside man. There\'s a croupier, Dolores. She hates the Contessa almost as much as she hates her own life. Grease her up. Financially. Don\'t be weird.'],
        ],
      },
      {
        text: 'Bribe Dolores the croupier outside the Golden Tooth ($1,000, or charm her with CHA 40).',
        obj: { type: 'talk', who: 'dolores' },
        talk: [
          { who: 'nar', t: ['> A tired woman in a sequined vest is smoking three cigarettes at once.'] },
          ['Twelve years I\'ve been dealing cards for that velvet witch. She pays me in "exposure". I\'m exposed, alright. To second-hand everything.'],
          {
            t: ['You\'re with Sal? Ugh. Fine. I hate rats less than I hate her. Make it worth my while, sweetheart.'],
            choices: [
              pay(1000, 'Slide her $1,000'),
              gate('cha', 40, 'Promise her a corner office in the new order (and mean it, kinda)'),
              leave('I\'ll come back with something better.'),
            ],
          },
          ['The vault code is the Contessa\'s dog\'s birthday. 0-4-2-0. ...Yes, really. She thinks it\'s "whimsical".', 'Go after dark. Don\'t kill anyone I like. That\'s nobody, so, go nuts.'],
        ],
      },
      {
        text: 'Rob the Golden Tooth vault after dark (8 PM - 6 AM). Four guards will jump you: bring a real weapon (Bang Bang Bros, Downtown) and bandages, and shake any cops first.',
        obj: { type: 'brawl', loc: 'golden_tooth', count: 4, kind: 'gang', tier: 2, label: 'Casino Security', night: true, req: (g) => (g.state.p.heat || 0) < 2, reqText: 'Sirens everywhere. Shake the cops (or pay off your heat at the PD) before you hit the vault.' },
        arrive: [{ who: 'nar', t: ['> 0-4-2-0. The vault door swings open with a sad little "ding". Then every alarm in Hilltop goes off, and five very large men in velvet tuxedos come running, cracking their knuckles in unison. They\'ve rehearsed that.'] }],
        win: ['> The vault is full of cash, gold chips, and a framed photo of Vivienne kissing a stack of money. You take the money. You leave the photo. You\'re not a monster.'],
        reward: { money: 4000 },
      },
      {
        text: 'Vivienne is sending Two-Ton Tito after the Rats. Hit the Velvet Syndicate lounge in Hilltop first. (Bring a real weapon and some bandages.)',
        obj: { type: 'brawl', loc: 'syndicate_lounge', count: 4, kind: 'gang', tier: 3, label: 'Two-Ton Tito & the Velvet Goons', boss: { name: 'Two-Ton Tito', moves: ['combo', 'charge'], weapon: 'brass', dmg: 1, scale: 1.3 } }, // Tito + 3 goons (5 goons + a bat-wielding, guarding Tito was a coin flip at STR 32)
        arrive: [{ who: 'nar', t: ['> Two-Ton Tito fills the doorway. Not metaphorically. They had to widen it. Twice.', '> "The Contessa says hello," he rumbles. "And goodbye. Mostly goodbye."'] }],
        win: ['> Two-Ton Tito goes down like a sack of wet laundry. The building shakes. Somewhere upstairs, Vivienne screams into a pillow embroidered with her own face.'],
      },
      {
        text: (g) => `Grease the cops before the takeover: have $7,500 on you (now ${$(g.state.p.money)}). Rat jobs, heists and the market pay best.`,
        obj: { type: 'money', min: 7500 },
        marker: { loc: 'rats_clubhouse', label: 'Rat jobs (clubhouse)' },
      },
      {
        text: 'FINALE: Meet Big Sal at the clubhouse. It\'s time to take the city.', finale: true,
        obj: { type: 'talk', who: 'sal' },
        talk: [
          ['*Sal is sitting on the hood of the ice cream truck, staring at the smog like it owes him money.*', 'Kid. We did it. Gutterside AND Hilltop. The Velvet\'s on the run. Chief Lardner\'s on OUR payroll now. We\'re gonna need a bigger ice cream truck.'],
          {
            t: ['But there can only be one Big Cheese... and I ain\'t sure it\'s me anymore. My back\'s shot. My liver\'s a raisin. My fungus is thinking about running for office.'],
            choices: [
              { label: 'Share the throne with Sal. Rats stick together.', hint: '-$7,500 payoffs · +karma', do: (g, q) => { q.data.variant = 'shared'; g.state.addStat('karma', 5); g.state.addMoney(-Math.min(7500, g.state.p.money), 'payoffs'); return 'complete'; } },
              { ...fight({ count: 1, kind: 'fighter', tier: 4, label: 'Big Sal Monella' }, 'Take the crown. Sal can retire... to the harbor.', ['> Sal goes down swinging and biting. Mostly biting. The Rats watch in silence, then slowly, one by one, they kneel. One of them kneels in something. It\'s fine.'], 'complete'), hint: 'boss fight · -$7,500 payoffs · -karma' },
            ],
          },
        ],
        onDone: (g, q) => { if (!q.data.variant) { q.data.variant = 'ruthless'; g.state.addStat('karma', -20); g.state.addMoney(-Math.min(7500, g.state.p.money), 'payoffs'); } },
      },
    ],
  },

  // ======================= PATH: VELVET / GRIMCO -> CORPORATE =======================
  main_corp: {
    kind: 'main', title: 'The Velvet Ladder', giver: 'vivienne', ending: 'corporate',
    summary: 'The Velvet Contessa took you in. Grimco\'s CEO has other plans. Climb the velvet ladder, one face at a time.',
    available: (g) => g.quests.isDone('main_prologue') && g.quests.faction() !== 'rats',
    lockedText: (g) => (g.quests.faction() === 'rats'
      ? 'Lord Snifferton smells sewer on you. He is a dog of refinement. Remove yourself.'
      : 'Darling, I don\'t take meetings with people nobody\'s heard of. Go get some sort of reputation. Talk to that dreadful hobo under the overpass.'),
    offer: [
      { who: 'nar', t: ['> A woman dressed head to toe in crimson velvet reclines on a chaise longue in the middle of the sidewalk. A bodyguard holds an umbrella over her. It isn\'t raining. A tiny, furious dog in a diamond collar glares at you from her lap.'] },
      ['Vivienne Velour. You may call me Contessa. You may NOT call me Viv. The last man who called me Viv is now a coat.', '*She strokes the dog.* This is Lord Snifferton. He can smell poverty. He\'s growling, darling.'],
      {
        t: ['Reg and his little "doors". How quaint. The Syndicate isn\'t a door, sweetie. It\'s a ladder. Velvet-lined. And every rung is somebody\'s face. Membership requires a certain... polish.'],
        choices: [
          { label: 'Climb the ladder. Join the Syndicate.', hint: 'joins the Velvet Syndicate (needs CHA 15)', if: (g) => g.quests.faction() === 'syndicate' || g.state.p.cha >= 15, do: (g) => { g.quests.joinFaction('syndicate'); return 'accept'; } },
          { label: 'I\'m allergic to velvet.', result: 'decline' },
        ],
      },
    ],
    reward: { xp: 2500, money: 30000, rep: { syndicate: 200 } }, rewardText: 'The top floor. (+$30,000 signing bonus)',
    steps: [
      {
        text: 'Deliver the Contessa\'s velvet briefcase to Grimco Tower in Hilltop. 3 minutes. Do NOT open it.',
        obj: { type: 'goto', loc: 'grimco', timer: 180, radius: 8 },
        give: 'q_briefcase', take: 'q_briefcase',
        arrive: [{ who: 'nar', t: ['> A Grimco receptionist with a smile that looks stapled on takes the briefcase. It ticks. It also... purrs?', '> "Mr. Grimsworth thanks the Contessa for the quarterly kittens," she says. You decide, very firmly, not to ask.'] }],
        failText: 'The briefcase started screaming. You panicked. The Contessa is disappointed in a way that feels physical. Try again.',
      },
      {
        text: (g, q) => `Launder Syndicate money: play 3 rounds at the Golden Tooth Casino. (${q.sd.n || 0}/3)`,
        obj: { type: 'event', evt: 'casino:result', count: 3 },
        marker: { loc: 'golden_tooth', label: 'Golden Tooth Casino' },
      },
      {
        text: 'Torch the Rats\' stash: crash the Gutter Rats clubhouse in Gutterside.',
        obj: { type: 'brawl', loc: 'rats_clubhouse', count: 4, kind: 'gang', tier: 2, label: 'Gutter Rats' },
        win: ['> You kick over the stash: three crates of bootleg cough syrup, a bucket of mysterious mayonnaise, and Big Sal\'s diary. First entry: "Dear Diary, today I bit a man." You leave it. Some things are sacred.'],
      },
      {
        text: 'The Contessa wants eyes inside the legit world. Get a job and earn a promotion (or already hold a promoted rank).',
        obj: { type: 'event', evt: 'job:promoted', count: 1, orCheck: (g) => (g.state.p.job?.rank ?? 0) >= 1 },
        marker: jobMarker('Get promoted'),
      },
      {
        text: 'Meet Grimco\'s CEO, Chadwick Grimsworth III, outside Grimco Tower.',
        obj: { type: 'talk', who: 'grimsworth' },
        talk: [
          { who: 'nar', t: ['> A man with teeth so white they have their own zip code shakes your hand, then wipes his hand on a passing intern.'] },
          ['Chadwick Grimsworth the Third. The first two were tragic yachting accidents. I was steering. *He laughs like a leaf blower.*'],
          ['Vivienne speaks highly of you. That means she thinks you\'re disposable. I think you\'re... promising.', 'Grimco owns the water, the power, the hospital, the mayor and the moral fiber of this city. The Syndicate is merely our entertainment division. And entertainment, my friend, has gotten expensive.'],
          {
            t: ['I want her out. You\'ll take her chair. Velvet, cash, and a corner office overlooking the poors. What do you say?'],
            choices: [
              { label: 'Betray Vivienne? ...Yeah, okay.', result: 'advance' },
              leave('Let me think about it.'),
            ],
          },
        ],
      },
      {
        text: 'Executives don\'t sleep in motels. Buy a real home (Double-Wide Dreams in the Dustbowl is the cheapest at $3,500).',
        obj: { type: 'home' },
        marker: { loc: 'double_wide', label: 'Double-Wide Dreams ($3,500)' },
      },
      {
        text: 'Hostile takeover: confront the Contessa at the Velvet Syndicate lounge.',
        obj: { type: 'talk', who: 'vivienne' },
        talk: [
          ['Darling. Darling, darling, darling. I know Chadwick sent you. He\'s sent eleven of you. Lord Snifferton ate the last one\'s shoes. With the feet still in them.'],
          {
            t: ['So? Are you going to threaten me? In MY velvet?'],
            choices: [
              gate('cha', 40, 'Talk her into an early retirement', 'advance', [
                { who: 'nar', t: ['> You talk like you\'ve never talked before: offshore accounts, a villa with a moat, a tasteful exit, a lifetime supply of caviar for Lord Snifferton.'] },
                ['...A moat? With swans? Mean swans? ...FINE. Take the stupid Syndicate. Snifferton, we\'re leaving. Bite him on the way out.', '> Lord Snifferton bites you on the ankle. It\'s a love bite. It\'s still a bite.'],
              ]),
              fight({ count: 4, kind: 'gang', tier: 3, label: 'Velvet Loyalists' }, 'Take it by force', [
                '> Vivienne escapes through a secret door with her dog, a wig, and three suitcases of money, screaming "THIS ISN\'T OVER!" Which, in Rotwell, it never is.',
              ]),
              leave('Not yet.'),
            ],
          },
        ],
        onDone: (g) => g.state.setFlag('vivienne_gone'),
      },
      {
        text: (g) => `A seat on Grimco\'s board costs money. Have $15,000 on you (now ${$(g.state.p.money)}). Syndicate jobs, heists and the market pay best.`,
        obj: { type: 'money', min: 15000 },
        marker: { loc: 'syndicate_lounge', label: 'Syndicate jobs (lounge)' },
      },
      {
        text: 'FINALE: Attend the Grimco board meeting. Meet Grimsworth outside Grimco Tower.', finale: true,
        obj: { type: 'talk', who: 'grimsworth' },
        talk: [
          ['Welcome to the board. The board is: me, my lawyer, a ficus, and my other lawyer. The ficus votes yes. The ficus always votes yes. That\'s why it\'s on the board.'],
          {
            t: ['You\'re in, partner. Welcome to the top floor. The air\'s thinner up here. That\'s because we bottle it and sell it downstairs. Shall we shake on it?'],
            choices: [
              { label: 'Shake his hand. Partners.', hint: '-$15,000 board seat', do: (g, q) => { q.data.variant = 'partner'; g.state.addMoney(-Math.min(15000, g.state.p.money), 'board seat'); return 'complete'; } },
              { ...gate('int', 35, 'Call a shareholder vote and kick HIM out', 'complete', null), hint: 'needs INT 35 · -$15,000 board seat · -karma', then: [
                '> You produce proxy votes from every shell company you set up while laundering for Vivienne. The ficus switches sides. Grimsworth is escorted out by security, still smiling, because his face is legally unable to stop.',
              ] },
            ],
          },
        ],
        onDone: (g, q) => { if (!q.data.variant) { q.data.variant = 'coup'; g.state.addMoney(-Math.min(15000, g.state.p.money), 'board seat'); g.state.addStat('karma', -10); } },
      },
    ],
  },

  // ======================= PATH: THORNE -> MAYOR =======================
  main_mayor: {
    kind: 'main', title: 'Clean Sweep', giver: 'thorne', ending: 'mayor',
    summary: 'Detective Thorne has spent six years building a case against Rotwell\'s rotten top brass. She needs a nobody to help her burn it down — legally. Then maybe that nobody runs for mayor.',
    available: (g) => g.quests.isDone('main_prologue') && !g.quests.faction() && g.state.p.karma >= 10,
    lockedText: (g) => (g.quests.faction()
      ? 'You run with a gang. I can smell it. Quit, or get out of my face. Preferably both.'
      : g.quests.isDone('main_prologue') ? 'Come back when you\'ve done something decent. Help a grandma. Don\'t mug the grandma. (Needs 10 karma: volunteer at the Holy Rebate soup kitchen, call the PD tip line, donate at the overpass camp, help people on the street.)'
        : 'Not now, kid. Remember what you saw first.'),
    offer: [
      { who: 'nar', t: ['> Detective Thorne is eating a sad salad out of a hubcap on the hood of her car.'] },
      ['You. Bunker kid. You came back. That\'s either brave or stupid, and in Rotwell those are the same department.'],
      ['I\'ve been building a case on this city for six years. Mayor Swindell takes kickbacks from Grimco. Chief Lardner takes them from the Syndicate. The Syndicate takes them from everybody. It\'s a kickback centipede.'],
      {
        t: ['I need a civilian nobody suspects. You look like nobody. Want to help me burn it all down? Legally. Mostly legally.'],
        choices: [{ label: 'Let\'s clean this city up.', result: 'accept' }, { label: 'I like my kneecaps where they are.', result: 'decline' }],
      },
    ],
    reward: { xp: 2500, karma: 10, money: 10000 }, rewardText: 'A city. A sash. A lot of paperwork. (+$10,000 "discretionary fund")',
    steps: [
      {
        text: 'Wear a wire into the Rusty Nail after dark (8 PM - 6 AM) and listen in on Chief Lardner.',
        obj: { type: 'goto', loc: 'rusty_nail', night: true, radius: 8 },
        arrive: [
          { who: 'nar', t: ['> Thorne tapes a microphone to your chest. With duct tape. Your chest hair screams silently.', '> In a corner booth, Chief Lardner — a man built like a stack of donuts in a uniform — is counting cash with a velvet-blazered goon.'] },
          { who: 'lardner', t: ['Tell the Contessa the raid on her casino got "lost in the mail". And tell her I want a bigger envelope next time. With a bow. I like bows.'] },
          { who: 'nar', t: ['> Your wire squeals with feedback. Every head in the bar turns. The jukebox stops. Somebody drops a glass. It was YOUR glass.', '> Time to leave. Fast.'] },
        ],
      },
      {
        text: 'Lardner\'s off-duty goons followed you out of the Rusty Nail. Survive.',
        obj: { type: 'brawl', loc: 'rusty_nail', count: 3, kind: 'thug', tier: 2, label: 'Lardner\'s Goons', radius: 14 },
        win: ['> One goon drops his badge as he runs. It\'s a chocolate coin wrapped in gold foil. Rotwell PD budget cuts are real.'],
      },
      {
        text: (g) => `Become someone people would vote for: reach 25 karma (now ${g.state.p.karma}). Soup kitchen and confession at the Holy Rebate, the PD tip line, good deeds on the street.`,
        obj: { type: 'stat', stat: 'karma', min: 25 },
        marker: { loc: 'holy_rebate', label: 'Church of the Holy Rebate' },
      },
      {
        text: (g) => `Learn to talk like a politician: reach 30 CHA (now ${Math.floor(g.state.p.cha)}). Public speaking club at the Library, dancing at Club Velvet, BS 101 at the University.`,
        obj: { type: 'stat', stat: 'cha', min: 30 },
        marker: { loc: 'library', label: 'Library (speaking club)' },
      },
      {
        text: 'Register as a mayoral candidate with Gladys at City Hall ($2,500 filing fee).',
        obj: { type: 'talk', who: 'gladys' },
        talk: [
          { who: 'nar', t: ['> Behind bulletproof glass sits a woman with a beehive hairdo the size of an actual beehive. It IS an actual beehive. Bees go in. Bees come out.'] },
          ['Window 3. You want Window 3? This IS Window 3. There\'s only one window. We numbered it for morale.'],
          {
            t: ['Mayoral candidacy? Hoo boy. Nobody\'s run against Swindell in twenty years. Last guy who tried got audited by a bear. Filing fee is twenty-five hundred.'],
            choices: [pay(2500, 'Pay the filing fee'), leave('I\'ll come back with the money.')],
          },
          ['> Gladys stamps your form so hard it gets a concussion.', 'Congratulations, you\'re a candidate. Please sign this waiver regarding the bear.'],
        ],
      },
      {
        text: (g, q) => `Spread the word: put up campaign posters in all four other districts. (${(q.sd.points || []).filter((p) => p.done).length}/4)`,
        obj: { type: 'visit', points: [{ district: 'gutterside', label: 'Poster spot' }, { district: 'hilltop', label: 'Poster spot' }, { district: 'rustyards', label: 'Poster spot' }, { district: 'dustbowl', label: 'Poster spot' }] },
        visitText: [
          'Poster up. A hobo immediately draws a mustache on your face. It\'s... honestly an improvement.',
          'Poster up. A Hilltop lady sniffs it, says "a candidate of the PEOPLE? How ghastly," and buys three.',
          'Poster up. A dock worker salutes it, then uses it to wrap a fish. That\'s a vote.',
          'Poster up. A biker staples it to his own forehead as a show of support. Please don\'t encourage this.',
        ],
      },
      {
        text: 'Thorne needs hard evidence: raid Grimco Tower\'s records after dark.',
        obj: { type: 'brawl', loc: 'grimco', count: 4, kind: 'thug', tier: 2, label: 'Grimco Security', night: true },
        win: ['> In a filing cabinet labeled DEFINITELY NOT BRIBES, you find a ledger. Every payment to Swindell, itemized and notarized. Grimco kept receipts. They are VERY organized evil.'],
        winGive: 'q_ledger',
      },
      {
        text: 'Bring the bribe ledger to Detective Thorne at the PD.',
        obj: { type: 'talk', who: 'thorne' },
        take: 'q_ledger',
        talk: [
          ['This... this is it. Six years. *She wipes away a tear. Or salad dressing. Hard to tell.*', 'I\'ll handle the arrests: Lardner, the Grimco accountants, the bear. You handle the debate. Swindell\'s going to fight dirty. Fight dirtier — but, you know. Ethically.'],
        ],
      },
      {
        text: (g) => `FINALE: Win the mayoral debate at City Hall. Win 2 of 3 rounds: CHA 30 ${g.state.p.cha >= 30 ? '✓' : '✗'} · INT 25 ${g.state.p.int >= 25 ? '✓' : '✗'} · Karma 40 ${g.state.p.karma >= 40 ? '✓' : '✗'}`, finale: true,
        obj: { type: 'goto', loc: 'city_hall', radius: 9 },
        run: async (g, q) => {
          await g.quests.say([{ who: 'nar', t: ['> The debate stage is two podiums and a folding table. Swindell\'s podium is taller. He\'s standing on a stack of Grimco phone books.', '> The moderator is a local news anchor whose hair has not moved since 1987.'] }]);
          let wins = 0;
          for (const r of DEBATE) {
            const ok = (g.state.p[r.stat] ?? 0) >= r.min;
            const i = await g.quests.ask({ title: 'The Debate', speaker: 'MODERATOR', text: `${r.q}\n\n${r.mayor}`, options: [
              { label: r.good, hint: `${STATN[r.stat]} ${r.min}${ok ? '' : ' (you don\'t have it)'}` },
              { label: r.bad },
            ] });
            const won = i === 0 && ok;
            if (won) wins++;
            await g.quests.say([{ who: 'nar', t: [won ? r.win : r.lose] }]);
          }
          if (wins >= 2) {
            await g.quests.say([{ who: 'nar', t: ['> The votes are counted. By hand. By Gladys. The bees help.', '> The results: you win by a landslide. Swindell gets eleven votes, all from Grimco mailboxes. He is arrested on the steps by Detective Thorne, still holding a hot dog.'] }]);
            return 'complete';
          }
          await g.quests.say([{ who: 'nar', t: ['> You lose the debate. Swindell does a victory lap around the podium. The election is postponed "due to a bear". Polish yourself up and try again.'] }]);
          return 'stay';
        },
      },
    ],
  },

  // ======================= PATH: BUNKER 9 -> ESCAPE =======================
  main_bunker: {
    kind: 'main', title: 'The Lid', giver: 'reg', ending: 'escape',
    summary: 'Last night you saw something in Restricted Bunker 9 that made you write yourself a warning. Get smart enough to find out what — and maybe get out.',
    available: (g) => g.quests.isDone('main_prologue'),
    offer: [
      ['So. The bunker. *Reg stops smiling. It\'s the first time you\'ve seen him not smile. His teeth were doing a lot of work.*'],
      ['Whatever you saw in there, it scared you enough to write a note before they wiped you. Grimco doesn\'t wipe people for fun. Well. Mostly not for fun.', 'Go look at the fence. Talk to the guard. Then, Plunger... get smart. You\'re gonna need every brain cell you haven\'t drowned yet.'],
      { t: ['You want to know what\'s under the Lid?'], choices: [{ label: 'I need to know.', result: 'accept' }, { label: 'Ignorance is bliss.', result: 'decline' }] },
    ],
    reward: { xp: 2500, stats: { int: 5 }, money: 12000 }, rewardText: 'The truth. And the sky. (+$12,000 book deal advance)',
    steps: [
      {
        text: 'Scout Restricted Bunker 9 in the Dustbowl.',
        obj: { type: 'goto', loc: 'bunker', radius: 12 },
        arrive: [
          { who: 'nar', t: ['> A chain-link fence topped with razor wire, warning signs, and a sun-bleached plastic flamingo wearing a gas mask. A guard in an oversized helmet is asleep in a lawn chair.'] },
          { who: 'pickles', t: ['*snort* HALT! Who goes— oh. Oh no. It\'s YOU.', 'You threw up on my boots last night. Then you hugged me. Then you threw up on the hug.'] },
          { who: 'pickles', t: ['Look, buddy, I don\'t know what you saw down there and I don\'t WANT to know. I want to finish my shift, go home and microwave a burrito until it\'s lava. No keycard, no entry.', '> Behind him, the bunker hums. In B-flat. Like a refrigerator full of secrets.'] },
        ],
        onDone: (g) => g.state.setFlag('met_pickles'),
      },
      {
        text: (g) => `Get smart enough to understand the symbol scrawled on your note: reach INT 20 (now ${Math.floor(g.state.p.int)}). The Public Library is free.`,
        obj: { type: 'stat', stat: 'int', min: 20 },
        marker: { loc: 'library', label: 'Public Library' },
      },
      {
        text: 'Show your note to Professor Fumble at Rotwell University in Hilltop.',
        obj: { type: 'talk', who: 'fumble' },
        talk: [
          { who: 'nar', t: ['> A wild-haired professor is trying to teach a pigeon calculus on a chalkboard. The pigeon is winning.'] },
          ['Hm? A note? *He sniffs it.* Pizza Butt coupon. Two-for-one. Expired. And this symbol... a circle with a lid on it... oh. Oh dear.', 'That\'s Grimco\'s PROJECT LID. I signed an NDA about it. In blood. Their blood type requirements were VERY specific.'],
          ['If you want in, you\'ll need a keycard. Grimco\'s night janitor has a master card — he cleans EVERYTHING, bunkers included. Name\'s Mopsy. Lovely man. Smells like bleach and regret.'],
        ],
      },
      {
        text: 'Get a keycard from Mopsy, the janitor outside Grimco Tower.',
        obj: { type: 'talk', who: 'mopsy' },
        talk: [
          { who: 'nar', t: ['> A janitor in a Grimco jumpsuit is mopping the same square of sidewalk. It\'s been clean for an hour. He\'s emotionally attached.'] },
          ['Keycard? SHHH! Grimco could be listening. The MOP could be listening. I don\'t know whose side the mop is on.'],
          {
            t: ['Five hundred bucks. I got a mortgage. On a van. That I live in. With my mom.'],
            choices: [
              pay(500, 'Pay Mopsy $500'),
              gate('cha', 25, 'Promise to put in a good word with his mom'),
              { label: 'Mug the janitor', hint: 'fight, -karma', do: async (g, q) => { const ok = await g.quests.brawl({ count: 1, kind: 'thug', tier: 1, label: 'Mopsy (and his mop)', names: ['Mopsy'] }); if (ok) { g.state.addStat('karma', -10); if (q) q.data.mugged = true; } return ok ? 'advance' : 'stay'; } },
              leave('Later.'),
            ],
          },
          (g, q) => (q?.data?.mugged
            ? ['> Mopsy lies in a puddle of his own mop water, sobbing. You fish a sticky keycard out of his jumpsuit.', 'It\'s demagnetized, you jerk! I spilled a soda on it! Take it to Scrapper Pete out in the Dustbowl. He can fix anything. Maybe he can fix your PERSONALITY.']
            : ['> Mopsy hands you a keycard. It\'s sticky. You don\'t ask.', 'It\'s demagnetized, though. Spilled a soda on it. Take it to Scrapper Pete out in the Dustbowl. He can fix anything. He fixed my marriage. With a crowbar. We\'re divorced now. Very fixed.']),
        ],
        onDone: (g) => g.quests.giveItem('q_keycard'),
      },
      {
        text: 'Have Scrapper Pete fix the keycard at his junkyard in the Dustbowl.',
        obj: { type: 'talk', who: 'pete' },
        talk: [
          { who: 'nar', t: ['> A grizzled man is beating a microwave with a wrench. It\'s not clear who started it.'] },
          ['A Grimco keycard? Pfff. I can re-magnetize it with a car battery and a strong opinion. But the encryption? That\'s brain work, kid. I\'m a wrench guy.', 'Write the code yourself. Get smart. REAL smart. Then come back and I\'ll zap it for ya.'],
        ],
      },
      {
        text: (g) => (g.state.getFlag('pickles_code') ? 'You already have Pickles\' secret door code! Head back to Pete.' : `Get smart enough to crack Grimco\'s encryption: reach INT 35 (now ${Math.floor(g.state.p.int)}). Library, University courses, books. (Or find someone who knows the code...)`),
        obj: { type: 'check', check: (g) => g.state.p.int >= 35 || !!g.state.getFlag('pickles_code') },
        marker: { loc: ['library', 'rotwell_u'], label: 'Study' },
      },
      {
        text: 'Go back to Scrapper Pete to zap the keycard.',
        obj: { type: 'talk', who: 'pete' },
        take: 'q_keycard',
        talk: [
          ['> Pete clips jumper cables to the keycard and a car battery. Sparks fly. One of his eyebrows catches fire. He doesn\'t notice.', 'There. Good as new. Better. It now also opens my garage. Don\'t open my garage.'],
        ],
        onDone: (g) => g.quests.giveItem('q_keycard_live'),
      },
      {
        text: 'Sneak into Bunker 9 after dark (8 PM - 6 AM).',
        obj: { type: 'goto', loc: 'bunker', night: true, radius: 12 },
        arrive: [
          { who: 'nar', t: ['> Pickles is asleep, cuddling a burrito. You swipe the keycard. The door opens with a hiss that sounds a lot like someone whispering "ssssucker".', '> Inside: cold concrete, flickering lights, and a wall of monitors showing EVERY corner of Rotwell. The Roach Motel. The Rusty Nail. The overpass. Your room. Oh god, your room. Including the bathroom.'] },
          { who: 'nar', t: ['> A sign over the monitors reads: GRIMCO CIVIC ENDURANCE STUDY — PROJECT LID. DAY 7,302 OF OBSERVATION. SUBJECT SATISFACTION: "LOL".'] },
          { who: 'nar', t: ['> A dusty binder explains everything. The smog over Rotwell isn\'t smog. It\'s a dome. A lid. Highway 9 doesn\'t leave the city, it curves right back into Gutterside.', '> Grimco has spent twenty years measuring exactly how much garbage a population will put up with — rent, wages, meat, mayors — and selling the data to every company on Earth.'] },
          { who: 'nar', t: ['> One monitor is labeled INCIDENT — LAST NIGHT. You press play. It\'s you, shirtless, drunk, reading the binder aloud and sobbing "I KNEW IT, THE SKY IS A LID". Then a cleanup crew zaps you with a device labeled FORGET-ME-NOT 3000. On your way out, you steal a pen and a Pizza Butt coupon from one of them. Smart drunk. Dumb sober.'] },
          { who: 'nar', t: ['> Pinned to the wall: a staff photo of the original Project LID science team. In the middle, younger, cleaner, in a lab coat with a name tag: DR. REGINALD CRUSTWORTH.', '> Reg.', '> Then the alarms start. A voice on the intercom: "Cleanup crew to sector nine. Bring the BIG zapper."'] },
        ],
        onDone: (g) => g.state.setFlag('knows_lid'),
      },
      {
        text: 'Survive the Grimco Cleanup Crew at Bunker 9. Four armed goons: if you skipped leg day, bring a gun (Two-Finger Terry sells a used 9mm for $450) and first aid kits (press Y to heal).',
        obj: { type: 'brawl', loc: 'bunker', count: 4, kind: 'thug', tier: 3, label: 'Grimco Cleanup Crew', radius: 14 },
        // The reveal ends with the alarm going off and you standing in the fight zone: give a beat to
        // decide instead of dropping an under-geared player straight into four tier-3 goons.
        arrive: [{ who: 'nar', t: ['> Four Grimco goons in hazmat suits pile out of a van. One of them is carrying the BIG zapper. It is, regrettably, very big.'],
          choices: [
            { label: 'Fight your way out', hint: 'tough fight', result: 'advance' },
            { label: 'Run for it (come back with a gun and first aid)', result: 'stay' },
          ] }],
        win: ['> The BIG zapper breaks over somebody\'s skull. Not yours. You keep your memories. Even the bad ones. Especially the bad ones.'],
      },
      {
        text: (g) => `FINALE: The Lid\'s exit controls need a genius. Reach INT 45 (now ${Math.floor(g.state.p.int)}), then return to Bunker 9.`, finale: true,
        obj: { type: 'goto', loc: 'bunker', radius: 12, req: (g) => g.state.p.int >= 45, reqText: 'The Lid Control Terminal runs Grimco OS 3.1. You need INT 45 to even find the power button.' },
        run: async (g, q) => {
          await g.quests.say([{ who: 'nar', t: ['> The Lid Control Terminal. It runs Grimco OS 3.1, which crashes if you look at it with emotion. A sticky note on the screen says "password is password". It isn\'t.'] }]);
          const qs = [
            { q: 'SECURITY QUESTION 1: What is the airspeed of an unladen Rotwell pigeon?', a: ['Fast enough to poop on the mayor', '24 mph', 'Pigeons don\'t fly here, they lurk'], right: 0 },
            { q: 'SECURITY QUESTION 2: Solve for X: Rent = Wages × X.', a: ['X = 0.5', 'X = Grimco', 'X = 3, and rising'], right: 2 },
            { q: 'SECURITY QUESTION 3: Who REALLY owns Rotwell?', a: ['The people', 'Grimco', 'Nobody. It owns itself. It\'s a toilet.'], right: 1 },
          ];
          for (const s of qs) {
            const i = await g.quests.ask({ title: 'Grimco OS 3.1', speaker: 'TERMINAL', text: s.q, options: s.a.map((label) => ({ label })) });
            if (i !== s.right) {
              await g.quests.say([{ who: 'nar', t: ['> ACCESS DENIED. Also, you\'re ugly. — Grimco OS', '> The terminal reboots. It takes eleven minutes. Step outside, come back in, and try again.'] }]);
              return 'stay';
            }
          }
          await g.quests.say([{ who: 'nar', t: ['> ACCESS GRANTED. A big red button labeled OPEN LID (DO NOT) lights up.', '> The intercom crackles. It\'s Reg. "Plunger... I helped build that thing. Twenty years I\'ve lived under the overpass waiting for someone stupid enough to push that button. Do what\'s right. Or what\'s fun. In Rotwell, they\'re rarely the same."'] }]);
          const c = await g.quests.ask({ title: 'The Big Red Button', text: 'How wide do you open the Lid?', options: [
            { label: 'All the way. Everybody gets out.', hint: '+karma' },
            { label: 'Just a crack. Just big enough for you.', hint: '-karma' },
          ] });
          if (c === 1) { q.data.variant = 'alone'; g.state.addStat('karma', -15); } else { q.data.variant = 'everyone'; g.state.addStat('karma', 30); }
          return 'complete';
        },
      },
    ],
  },

  // ======================= PATH: REG -> HOBO KING =======================
  main_hobo: {
    kind: 'main', title: 'Long Live the Crust', giver: 'reg', ending: 'hobo',
    summary: 'Reg wants an heir. Pass the Trials of the Crust and inherit the Overpass: the burning barrel, the shopping cart, the cardboard throne, and the respect of every pigeon in Gutterside.',
    available: (g) => g.quests.isDone('main_prologue') && !!g.state.getFlag('reg_paid') && g.state.p.level >= 4,
    lockedText: (g) => (!g.quests.isDone('main_prologue') ? null
      : !g.state.getFlag('reg_paid') ? 'You still owe me twenty bucks, Plunger. A king doesn\'t name an heir who stiffs him.'
        : 'You\'re not ready for the crown, Plunger. Live a little. Bleed a little. (Reach level 4.)'),
    offer: [
      ['Plunger. I\'m old. My knees are crunchy. My liver\'s been repossessed. A king needs an heir.', '*He taps his beer-can crown.* This crown has been passed down for generations. Well. Since Tuesday. I made it Tuesday.'],
      { t: ['Pass the Trials of the Crust and the Overpass is yours. All of it. The burning barrel. The shopping cart. The cardboard throne. The respect of every pigeon in Gutterside.'],
        choices: [{ label: 'I accept the Trials of the Crust.', result: 'accept' }, { label: 'I\'d rather keep my dignity.', result: 'decline' }] },
    ],
    reward: { xp: 2000, items: { q_box_crown: 1 }, stats: { cha: 5 } }, rewardText: 'The Overpass. The barrel. The crown. (+5 CHA, royal bearing)',
    steps: [
      {
        text: 'Trial of Stench: sleep in a cardboard box under the overpass.',
        marker: { loc: 'hobo_camp', label: 'Cardboard box (overpass)' },
        obj: { type: 'flag', flag: 'slept_box' },
        onStart: (g) => g.state.setFlag('slept_box', false),
      },
      {
        text: 'Trial of Poverty: have $5 or less in your pockets. (Reg says the bank doesn\'t count. Reg doesn\'t understand banks.)',
        marker: { loc: 'first_bank', label: 'First Bank (stash your cash)' },
        obj: { type: 'money', max: 5 },
        done: '> You are broke. Truly, cleanly broke. Somewhere under the overpass, Reg feels a disturbance in the filth and smiles.',
      },
      {
        text: (g, q) => `Trial of the Can: dig through the marked dumpsters in four districts (follow the beacons). (${(q.sd.points || []).filter((p) => p.done).length}/4)`,
        obj: { type: 'visit', points: [{ district: 'downtown', label: 'Dumpster' }, { district: 'hilltop', label: 'Dumpster' }, { district: 'rustyards', label: 'Dumpster' }, { district: 'dustbowl', label: 'Dumpster' }] },
        visitText: [
          'Downtown dumpster: 14 cans and a half-eaten birthday cake that says "HAPPY RETIREMENT, DOUG". Rest well, Doug.',
          'Hilltop dumpster: imported cans. They\'re still cans, but they\'re snobby about it.',
          'Rustyards dumpster: 9 cans and a seagull who fights you for each one. You win. Mostly.',
          'Dustbowl dumpster: 22 cans and a raccoon who looks at you with deep, deep respect.',
        ],
      },
      {
        text: 'Trial of Pigeons: defeat the Pigeon Lord and his flock on the steps of City Hall.',
        obj: { type: 'brawl', loc: 'city_hall', count: 4, kind: 'drunk', tier: 1, label: 'The Pigeon Lord & His Flock', radius: 10 },
        arrive: [{ who: 'nar', t: ['> A "pigeon" the size of a beagle, missing one eye and wearing a bottle cap as a crown, glares at you from the City Hall steps. Behind him, his followers coo menacingly.', '> They are clearly, CLEARLY, men in pigeon costumes. You decide to respect it.'] }],
        win: ['> The Pigeon Lord falls. His flock scatters, molting. One of them drops a pigeon-costume head; underneath, it\'s Councilman Hobbs. He makes you swear never to speak of this.'],
      },
      {
        text: 'Trial of Wisdom: answer Reg\'s riddles under the overpass.',
        obj: { type: 'talk', who: 'reg' },
        run: async (g) => {
          await g.quests.say([['Sit, Plunger. Wisdom time. *He sits on a bucket. The bucket sighs.*']], { char: 'reg' });
          for (const r of RIDDLES) {
            const i = await g.quests.ask({ title: 'Trial of Wisdom', speaker: 'CRUSTY REG', text: r.q, options: r.a.map((label) => ({ label })) });
            if (i !== r.right) {
              await g.quests.say([['WRONG! Come back when you\'ve thought about it. Think with your gut. Your gut\'s smarter than you. It\'s seen things.']], { char: 'reg' });
              return 'stay';
            }
            await g.quests.say([[r.yes]], { char: 'reg' });
          }
          return 'advance';
        },
      },
      {
        text: (g, q) => `Trial of the Fist: a king defends his overpass. Win 5 street brawls: bar fights, The Pit, gang jobs, anything. (${q.sd.n || 0}/5)`,
        marker: { loc: 'the_pit', label: 'The Pit (fight club)' },
        obj: { type: 'event', evt: 'brawl:won', count: 5 },
      },
      {
        text: (g) => `Trial of Charity: a king serves his people. Get your karma to 25 (now ${g.state.p.karma}). Soup kitchen at the Holy Rebate, donations at the camp, good deeds.`,
        obj: { type: 'stat', stat: 'karma', min: 25 },
        marker: { loc: 'holy_rebate', label: 'Church of the Holy Rebate' },
      },
      {
        text: 'FINALE: Return to Reg under the overpass for your coronation.', finale: true,
        obj: { type: 'talk', who: 'reg' },
        talk: [
          { who: 'nar', t: ['> Every hobo in Gutterside has gathered under the overpass. Someone has strung up Christmas lights. They\'re not plugged in. It\'s the thought that counts.'] },
          (g) => (g.state.getFlag('knows_lid')
            ? ['I know you saw the photo, Plunger. Dr. Reginald Crustworth. I built the Lid. Then I walked out the front door of Grimco and never stopped walking. Until I hit this overpass.', 'Down here I learned the only thing they couldn\'t measure: a bum with nothing to lose is the freest man in Rotwell.']
            : ['I wasn\'t always a hobo, Plunger. I used to have a lab coat. A parking space. A dental plan. Then I learned what I was building, and I walked away.', 'Down here I learned the only thing they couldn\'t measure: a bum with nothing to lose is the freest man in Rotwell.']),
          ['*He lifts the beer-can crown off his own head and places it on yours. It\'s sticky. It smells like victory and light beer.*', 'Rise, King of the Crust! Protector of the Barrel! Lord of the Cart! Your first royal decree?'],
          { t: ['> The hobos wait. A pigeon lands on your shoulder. It\'s a sign.'],
            choices: [
              { label: '"Free soup. Every day. Not just Thursdays."', do: (g, q) => { q.data.variant = 'soup'; g.state.addStat('karma', 5); return 'complete'; } },
              { label: '"Everybody gets a better box."', do: (g, q) => { q.data.variant = 'box'; g.state.addStat('karma', 5); return 'complete'; } },
            ] },
        ],
      },
    ],
  },

  // ======================= SIDE QUESTS =======================
  side_eye: {
    kind: 'side', title: 'The Eye of the Beholder', giver: 'ooze',
    summary: 'A pigeon stole Madame Ooze\'s glass eye while she was napping with her mouth open. She sleeps with her eye out. It\'s a comfort thing.',
    offer: [
      { who: 'nar', t: ['> Inside a tent that smells of patchouli and cat, a woman with enormous earrings and one empty eye socket stares at you with her other eye. Hard.'] },
      ['Madame Ooze sees ALL. Well. Madame Ooze sees HALF. A pigeon flew off with my glass eye this morning. Right off my nightstand.'],
      'Bring it back, darling, and I\'ll read your fortune for free. Forever. Or until I die, which the cards say is Thursday. Every Thursday. The cards are idiots.',
    ],
    reward: { money: 250, stats: { cha: 2 }, karma: 3, xp: 150 }, rewardText: '$250, +2 CHA, +3 karma, free fortunes forever',
    onComplete: (g) => g.state.setFlag('ooze_friend'),
    steps: [
      {
        text: (g, q) => `Follow the trail of pigeon droppings around Downtown. (${(q.sd.points || []).filter((p) => p.done).length}/3)`,
        obj: { type: 'visit', points: [{ district: 'downtown', label: 'Droppings' }, { district: 'downtown', label: 'Droppings' }, { district: 'downtown', label: 'Droppings' }] },
        visitText: [
          'Droppings. Still warm. The trail continues. You hate that you know they\'re warm.',
          'A pigeon feather and a tiny receipt for "1 eye, glass". They\'re fencing it.',
          'The trail leads behind the Public Library. You hear cooing. Aggressive cooing.',
        ],
      },
      {
        text: 'Beat up the pigeon gang hoarding shiny things behind the Public Library.',
        obj: { type: 'brawl', loc: 'library', count: 3, kind: 'drunk', tier: 1, label: 'Shiny-Thing Pigeon Gang' },
        arrive: [{ who: 'nar', t: ['> Three enormous pigeons — no, three men dressed as pigeons, no, three REAL pigeons the size of men? — guard a pile of bottle caps, keys, and one glass eye. Rotwell, man.'] }],
        win: ['> Among the bottle caps, keys and one wedding ring is the glass eye, staring at you accusingly. You pocket it. It keeps staring. From your pocket.'],
        winGive: 'q_glass_eye',
      },
      {
        text: 'Return the glass eye to Madame Ooze in Gutterside.',
        obj: { type: 'talk', who: 'ooze' }, take: 'q_glass_eye',
        talk: [
          ['> She pops it back in with a wet SCHLOOP. It\'s facing the wrong way. She doesn\'t fix it.', 'AH! I see EVERYTHING again! Including your future: you will meet a tall dark stranger. He will rob you. Wear comfortable shoes.'],
        ],
      },
    ],
  },

  side_rug: {
    kind: 'side', title: 'Definitely Not a Body', giver: 'larry',
    summary: 'Lucky Larry needs a "rug" driven to the docks at night. It\'s just a rug. It\'s full of rug. Stop making it weird.',
    offer: [
      { who: 'nar', t: ['> Lucky Larry wears three gold chains, a lucky rabbit\'s foot, a lucky horseshoe, and an extremely unlucky face.'] },
      ['Hey pal. Hey. Buddy. You got a car? I got a rug. Big rug. Heavy rug. Rug\'s gotta go to the Rustyards docks tonight. Guy\'s gonna pick it up. For the rug.', '@ What\'s in the rug?'],
      'Rug stuff! Fibers! A rug\'s worth of... rug. Why you gotta make it weird? Six hundred bucks. And don\'t unroll it. Rugs hate being unrolled. It\'s a whole thing.',
    ],
    reward: { xp: 200 }, rewardText: '$600 (or a clear-ish conscience)',
    steps: [
      {
        text: 'Drive the "rug" to the Rustyards docks after dark. Larry\'s buyer won\'t wait: 5 minutes.',
        obj: { type: 'goto', at: { district: 'rustyards' }, needCar: true, night: true, timer: 300, radius: 10, label: 'Rug drop' },
        give: 'q_rug',
        failText: 'The buyer left. You drive around with a rug that occasionally sighs. Larry sends a text: "TRY AGAIN TOMORROW NIGHT. DO NOT UNROLL."',
        arrive: [
          { who: 'nar', t: ['> You pop the trunk at the end of the pier. The rug... sneezes.', '@ ...', '> "Bless me," says the rug.'] },
          { who: 'Gerald (the rug)', t: ['Is this the docks? Oh no. Oh no no no. Listen, buddy — I\'m Gerald, Larry\'s business partner! I found out he\'s been selling fake lucky charms! I mean, they\'re ALL fake, but these were EXTRA fake—'],
            choices: [
              { label: 'Unroll Gerald and let him go', hint: '+karma', do: (g, q) => { q.data.freed = true; g.state.addStat('karma', 10); g.state.addMoney(300, 'gerald'); g.quests.giveItem('q_fake_watch'); },
                then: [{ who: 'nar', t: ['> Gerald hands you $300 from his sock and a cheap watch, then sprints down the pier shrieking with joy. Larry is not going to like this.'] }] },
              { label: 'Leave the rug for pickup. Not your business.', hint: '-karma', do: (g) => { g.state.addStat('karma', -10); },
                then: [{ who: 'nar', t: ['> A boat with no lights glides in. A man with a hook for a hand takes the rug, nods, and says "Larry says thanks." The rug screams all the way out to sea. It\'s fine. It\'s probably fine.'] }] },
            ] },
        ],
        onDone: (g) => g.quests.takeItem('q_rug'),
      },
      {
        text: 'Go back to Lucky Larry\'s Pawn.',
        obj: { type: 'talk', who: 'larry' },
        talk: [
          (g, q) => (q.data.freed
            ? ['You WHAT? You let the RUG go?! Do you know how hard it is to find a rug like that? He had MY money in his socks!', '...Get out. GET OUT. Here, take a smaller rug as a parting gift. It\'s empty. Probably.']
            : ['Rug\'s delivered? Beautiful. Here\'s six hundred. You never saw a rug. I never had a rug. Rugs don\'t exist.']),
        ],
        onDone: (g, q) => { if (!q.data.freed) g.state.addMoney(600, 'rug'); },
      },
    ],
  },

  side_hotdog: {
    kind: 'side', title: 'Gutbuster', giver: 'gus',
    summary: 'The Greasy Spoon\'s Gutbuster Challenge: thirty hot dogs, ten minutes. Win and get your face on the Wall of Gut. Lose and clean the bathroom. The bathroom has moods.',
    offer: [
      { who: 'nar', t: ['> A sweating fry cook with forearms like hams and a hairnet on his beard slams a plate down in front of you.'] },
      'GUTBUSTER CHALLENGE! Thirty dogs, ten minutes. Win and you get five hundred bucks, your face on the Wall of Gut, and a championship belt made from a real belt. Lose, and you clean the bathroom. You do NOT want to clean the bathroom. The bathroom has moods.',
    ],
    reward: { money: 500, stats: { str: 1 }, items: { q_gut_belt: 1 }, xp: 150 }, rewardText: '$500, +1 STR, the Gutbuster Belt',
    steps: [
      {
        text: 'Pay Gus the $50 entry fee and eat thirty hot dogs. (Costs energy.)',
        obj: { type: 'talk', who: 'gus' },
        run: async (g) => {
          const i = await g.quests.ask({ title: 'Gutbuster Challenge', speaker: 'GUTBUSTER GUS', text: 'Fifty bucks to enter. Hot dogs are "beef". The quotation marks are legally required.', options: [
            { label: 'Pay $50 and strap in', hint: '$50, 25 energy', disabled: !g.state.canAfford(50) || g.state.p.energy < 25 },
            { label: 'Maybe after I stretch my stomach', hint: 'leave' },
          ] });
          if (i !== 0) return 'stay';
          g.state.spend(50, 'contest'); g.state.useEnergy(25);
          let eaten = 0, gut = 0;
          const cap = 18 + g.state.p.str * 0.4 + Math.random() * 6;
          const rounds = [
            'Round 1: The bell rings. The dogs glisten. Your opponent, a man named Tiny, unhinges his jaw.',
            'Round 2: You\'re sweating mustard. Tiny is crying but still eating. The crowd chants "GUT! GUT! GUT!"',
            'Round 3: Final minutes. Your body is begging. Your soul has left and is watching from the ceiling fan.',
          ];
          for (const r of rounds) {
            const c = await g.quests.ask({ title: `Gutbuster — ${eaten}/30 dogs down`, text: r, options: [
              { label: 'Dunk the buns in water and pace yourself', hint: '+7 dogs · easy on the gut' },
              { label: 'Two at a time. Fortune favors the gross.', hint: '+10 dogs · risky' },
              { label: 'Unhinge your jaw like a snake', hint: g.state.p.str >= 15 ? '+13 dogs · very risky (STR helps)' : 'needs STR 15', disabled: g.state.p.str < 15 },
            ] });
            const add = c === 2 ? 13 : c === 1 ? 10 : 7;
            const strain = c === 2 ? 9 : c === 1 ? 8 : 4;
            eaten += add; gut += strain + Math.random() * 4;
            if (gut > cap) break;
          }
          if (eaten >= 30 && gut <= cap) {
            await g.quests.say([{ who: 'nar', t: [`> ${eaten} DOGS. The bell rings. Tiny passes out face-first into a bucket of relish. Gus hoists your arm like a boxing champ, and immediately regrets it, because the arm is greasy.`, '> Your photo goes up on the Wall of Gut, between a man who died and a man who should have.'] }]);
            return 'complete';
          }
          g.state.damage(10, 'hot dogs');
          await g.quests.say([{ who: 'nar', t: [`> At dog number ${eaten}, your stomach files a formal complaint. Then it files it again, onto the table. Onto Tiny. Onto Gus.`, '> You spend the next hour cleaning the bathroom. The bathroom is in a mood. You can try again any time.'] }]);
          return 'stay';
        },
      },
    ],
  },

  side_hobocoin: {
    kind: 'side', title: 'HoboCoin to the Moon', giver: 'chad',
    summary: 'Chad Bitsworth, disrupted ex-founder, is launching HoboCoin: a cryptocurrency backed by the most stable asset in Rotwell — despair.',
    offer: [
      { who: 'nar', t: ['> A guy in a filthy fleece vest and no shoes is pitching investors. The investors are pigeons. One of them seems interested.'] },
      ['Chad Bitsworth. Serial entrepreneur. My last startup, Uber for Dumpsters, got disrupted. By actual dumpsters.', 'Now I\'m building HoboCoin. It\'s a cryptocurrency backed by the most stable asset in Rotwell: despair.'],
      'Get in early, bro. Ground floor. The ground floor is literally where I sleep.',
    ],
    reward: { xp: 200 }, rewardText: 'Generational wealth (or a bottle cap)',
    steps: [
      {
        text: 'Invest in HoboCoin with Chad ($200 minimum).',
        obj: { type: 'talk', who: 'chad' },
        talk: [
          { t: ['How much are we putting in, bro? Remember: it\'s not gambling if there\'s a whitepaper. The whitepaper is a napkin.'],
            choices: [200, 1000, 5000].map((amt) => ({ label: `Invest ${$(amt)}`, hint: amt === 5000 ? 'diamond hands' : '', if: (g) => g.state.canAfford(amt), do: (g, q) => { g.state.spend(amt, 'HoboCoin'); q.data.invest = amt; } }))
              .concat([leave('I need to think about my portfolio.')]) },
          ['LET\'S GOOOO! You\'re a whale, bro. A beautiful, gullible whale. Now we pump. Hang these flyers.'],
        ],
      },
      {
        text: (g, q) => `Pump it: hang HoboCoin flyers in 3 spots around town. (${(q.sd.points || []).filter((p) => p.done).length}/3)`,
        obj: { type: 'visit', points: [{ district: 'gutterside', label: 'Flyer spot' }, { district: 'downtown', label: 'Flyer spot' }, { district: 'hilltop', label: 'Flyer spot' }] },
        visitText: [
          'Flyer up: "HOBOCOIN: Number Go Up (Probably)". A hobo buys in with a sock.',
          'Flyer up. A Grimco analyst reads it, laughs, then quietly takes a picture of it.',
          'Flyer up in Hilltop. Security removes it in four seconds. Twelve rich kids already bought in.',
        ],
      },
      {
        text: (g, q) => `Wait for HoboCoin to "moon". (Check back with Chad on day ${q.sd.due || '?'}.)`,
        marker: { who: 'chad' },
        obj: { type: 'wait', days: 2 },
      },
      {
        text: 'Check on your HoboCoin investment with Chad.',
        obj: { type: 'talk', who: 'chad' },
        run: async (g, q) => {
          const odds = Math.min(0.8, 0.3 + g.state.p.int / 200);
          const inv = q.data.invest || 200;
          if (Math.random() < odds) {
            g.state.addMoney(inv * 4, 'HoboCoin');
            await g.quests.say([['BRO. BRO. BROOOO. We mooned! HoboCoin hit a market cap of eleven million dollars and a sandwich! A Grimco hedge fund bought in by accident!', `> Chad hands you ${$(inv * 4)} in a garbage bag. He\'s crying. He\'s hugging the bag. He\'s hugging you. He smells like a server room on fire.`]], { char: 'chad' });
          } else {
            g.state.addMoney(Math.round(inv * 0.1), 'HoboCoin refund');
            g.quests.giveItem('q_hobocoin');
            await g.quests.say([['Bro... we got rugged. By me. I rugged us. I panicked and bought a hot tub. It\'s in the river now.', `> He hands you ${$(inv * 0.1)} and one (1) HoboCoin. It\'s a bottle cap with a Sharpie dollar sign. You keep it. As a lesson.`]], { char: 'chad' });
          }
          return 'complete';
        },
      },
    ],
  },

  side_teeth: {
    kind: 'side', title: 'Fresh Teeth', giver: 'molar',
    summary: 'Dr. Fenwick Molar, D.D.S. (Doctor of Dubious Surgery) wants fresh teeth. Not his. Other people\'s. For science. And dentures. And a necklace.',
    offer: [
      { who: 'nar', t: ['> A man in a blood-spattered lab coat leans out of a van marked "DENTISTRY & CANDY — FREE RIDES". That\'s not a red flag. That\'s a whole parade of them.'] },
      ['Dr. Fenwick Molar, D.D.S. Doctor of Dental Surgery. Or Doctor of Dubious Surgery. The board and I disagree.', 'I need fresh teeth, friend. Teeth come loose in fights — it\'s natural! Just pick them up. Five teeth, and I\'ll make it worth your while.'],
    ],
    reward: { money: 300, xp: 150 }, rewardText: '$300 and a gold tooth (+3 CHA)',
    steps: [
      {
        text: (g, q) => `Collect 5 teeth by winning fights. (${q.sd.n || 0}/5)`,
        marker: { loc: 'the_pit', label: 'The Pit (fight club)' },
        obj: { type: 'event', evts: ['brawl:won', 'npc:killed'], count: 5, filter: (d, evt) => evt !== 'npc:killed' || d?.byPlayer },
        done: '> Your pocket rattles like a maraca full of bad decisions. Five teeth.',
      },
      {
        text: 'Bring the teeth to Dr. Molar behind St. Mercy\'s.',
        obj: { type: 'talk', who: 'molar' },
        talk: [
          ['*He pours the teeth into his hand and sniffs them like fine wine.* Oh, these are MAGNIFICENT. This one still has a filling! I\'ll call him Gerald.'],
          { t: ['As promised: a gold tooth, installed free of charge. Hold still. Don\'t scream. Okay, scream a little, the van likes it.'],
            choices: [
              { label: 'Get the gold tooth', hint: '+3 CHA, -5 HP', do: (g) => { g.state.damage(5, 'dentistry'); g.state.addStat('cha', 3); g.quests.giveItem('q_gold_tooth'); } },
              { label: 'Get the gold tooth AND sell him one of yours', hint: '+3 CHA, +$100, -20 HP', do: (g) => { g.state.damage(20, 'dentistry'); g.state.addStat('cha', 3); g.state.addMoney(100, 'own tooth'); g.quests.giveItem('q_gold_tooth'); } },
            ] },
          ['> You leave with a gold tooth glinting in your smile. Strangers notice you now. Mostly muggers, but still. Noticed.'],
        ],
      },
    ],
  },

  side_raccoon: {
    kind: 'side', title: 'The Raccoon Family', giver: 'trashcanzo',
    summary: 'Don Trashcanzo, a very short man in a raccoon costume (he insists he IS a raccoon), demands tribute: premium garbage from across the city.',
    offer: [
      { who: 'nar', t: ['> Behind Pizza Butt, a very short man in a full raccoon costume sits on a trash-can throne, flanked by two actual raccoons wearing tiny gold chains.'] },
      ['You come to me, on the day of my daughter\'s garbage day, and you don\'t even bring a gift? *He hisses. The raccoons hiss. One of them is wearing sunglasses.*'],
      'I am Don Trashcanzo. I am a raccoon. Do not question it. The family needs tribute: the GOOD garbage, from three dumpsters in three districts. Do this, and the family will look after you, Cousin.',
    ],
    reward: { money: 400, weapon: 'knife', xp: 250 }, rewardText: '$400, a switchblade, and the family\'s protection',
    onComplete: (g) => g.state.setFlag('raccoon_friend'),
    steps: [
      {
        text: (g, q) => `Collect premium garbage from dumpsters in Hilltop, the Rustyards and the Dustbowl. (${(q.sd.points || []).filter((p) => p.done).length}/3)`,
        obj: { type: 'visit', points: [{ district: 'hilltop', label: 'Premium dumpster' }, { district: 'rustyards', label: 'Premium dumpster' }, { district: 'dustbowl', label: 'Premium dumpster' }] },
        visitText: [
          'Hilltop garbage: half a lobster, a cashmere sock, and a breakup letter written in calligraphy. Premium.',
          'Rustyards garbage: something wet. Something is always wet. You take it anyway.',
          'Dustbowl garbage: a jar of pickled... something. It winks at you. You wink back. You\'re in this now.',
        ],
      },
      {
        text: 'The Possum Syndicate is muscling in on the family. Rumble at Scrapper Pete\'s Junkyard.',
        obj: { type: 'brawl', loc: 'junkyard', count: 4, kind: 'gang', tier: 2, label: 'The Possum Syndicate' },
        arrive: [{ who: 'nar', t: ['> A dozen guys in possum costumes are lying motionless all over the junkyard. Playing dead. It\'s their whole thing.', '> Then they all get up at the same time. It is genuinely terrifying.'] }],
        win: ['> The possums play dead again. This time for real-ish. One of them whispers, "Tell my mother I was a raccoon."'],
      },
      {
        text: 'Bring the tribute to Don Trashcanzo behind Pizza Butt.',
        obj: { type: 'talk', who: 'trashcanzo' },
        talk: [
          ['*He sniffs the lobster. A single tear rolls down his raccoon mask.* You have done the family a great service.', 'From this day, you are Cousin Garbage. Take this blade. It has opened many cans. Some of them were cans.'],
        ],
      },
    ],
  },

  side_tithe: {
    kind: 'side', title: 'Tithe Me Harder', giver: 'prosper',
    summary: 'Pastor Prosper Goldbloom of the Church of the Holy Rebate wants you to collect overdue tithes from three sinners. The Lord wants His cut. The Pastor wants a cut of His cut.',
    offer: [
      { who: 'nar', t: ['> A preacher in a gold suit holds a collection plate the size of a hubcap. His smile has a price tag on it.'] },
      ['Brother! Sister! Valued customer! I\'m Pastor Prosper Goldbloom of the Church of the Holy Rebate, where salvation is fifteen percent off with a membership card!'],
      'Three of my flock haven\'t tithed this quarter. One\'s at the Rusty Nail, one\'s at Club Velvet, one\'s at the Golden Tooth. Collect gently. Firmly. ETERNALLY.',
    ],
    reward: { xp: 200 }, rewardText: 'Depends on your soul',
    steps: [
      {
        text: (g, q) => `Collect tithes from three sinners: Rusty Nail, Club Velvet, Golden Tooth. (${(q.sd.points || []).filter((p) => p.done).length}/3)`,
        obj: { type: 'visit', points: [{ loc: 'rusty_nail', label: 'Sinner' }, { loc: 'club_velvet', label: 'Sinner' }, { loc: 'golden_tooth', label: 'Sinner' }], radius: 8 },
        visitText: [
          'A drunk outside the Rusty Nail pays $300 in quarters, plus a confession you did not ask for and cannot unhear.',
          'A bouncer at Club Velvet pays $300 and asks if Jesus does bottle service.',
          'A gambler outside the Golden Tooth pays $300 in chips, then asks to borrow them back. In chips.',
        ],
        onDone: (g) => g.quests.giveItem('q_tithes'),
      },
      {
        text: 'Decide what to do with $900 of holy money. (Talk to Pastor Prosper... or don\'t.)',
        obj: { type: 'talk', who: 'prosper' },
        talk: [
          { t: ['Ahh, the sweet jingle of redemption! Hand it over, child, and receive the blessing of a ten-percent finder\'s fee.'],
            choices: [
              { label: 'Hand it all over', hint: '+$90, an Indulgence', do: (g) => { g.quests.takeItem('q_tithes'); g.state.addMoney(90, 'tithe cut'); g.quests.giveItem('q_indulgence'); return 'complete'; },
                then: ['Bless you! Here is your Certificate of Indulgence: valid for one (1) sin of any size. Choose wisely. Or don\'t. It\'s pre-forgiven.'] },
              { label: 'Keep it. God works in mysterious ways.', hint: '+$900, -15 karma', do: (g) => { g.quests.takeItem('q_tithes'); g.state.addMoney(900, 'holy money'); g.state.addStat('karma', -15); return 'complete'; },
                then: ['May your pockets be blessed and your soul be AUDITED! *He shakes his fist. It\'s wearing four rings.*'] },
              { label: 'Give it to the hobos under the overpass instead', hint: '+karma', result: 'advance',
                then: ['WHAT? To the POOR? That\'s... that\'s technically in the book, isn\'t it. Damn it. Fine. FINE.'] },
            ] },
        ],
      },
      {
        text: 'Hand out the holy money to the hobos under the overpass.',
        obj: { type: 'goto', loc: 'hobo_camp', radius: 9 },
        take: 'q_tithes',
        arrive: [{ who: 'nar', t: ['> You hand out $900 to the hobos. Reg buys a bigger box. Chad immediately invests his share in HoboCoin. A hobo named Tuesday hugs you and cries.', '> It\'s the best smell you\'ve ever been hugged by. That isn\'t saying much, but it\'s saying something.'] }],
        onDone: (g) => g.state.addStat('karma', 20),
      },
    ],
  },

  side_brock: {
    kind: 'side', title: 'Do You Even Lift?', giver: 'brock',
    summary: 'Brock Hardbody, undefeated king of the Iron Lung Gym, will fight you once you\'re swole enough to be worth his time.',
    offer: [
      { who: 'nar', t: ['> A man so muscular his veins have veins is flexing at his own reflection in a parked car. The car looks uncomfortable.'] },
      ['Brock Hardbody. Nine years undefeated at the Iron Lung. Nobody can beat me. Nobody can even TALK to me without me flexing. *flex* See? I can\'t stop.', 'You want a shot at the title, little noodle? Get to twenty-five strength. Then we brawl.'],
    ],
    reward: { money: 300, weapon: 'brass', stats: { str: 2 }, xp: 250 }, rewardText: '$300, brass knuckles, +2 STR',
    steps: [
      { text: (g) => `Get your STR to 25 (now ${Math.floor(g.state.p.str)}).`, obj: { type: 'stat', stat: 'str', min: 25 }, marker: { loc: 'iron_lung', label: 'Iron Lung Gym' } },
      {
        text: 'Fight Brock Hardbody outside the Iron Lung Gym downtown.',
        obj: { type: 'brawl', loc: 'iron_lung', count: 1, kind: 'fighter', tier: 3, label: 'Brock Hardbody' },
        arrive: [{ who: 'brock', t: ['You came! *flex* You actually came! *flex* Nobody ever comes! *flex* I\'m so happy I could punch you! I\'m going to punch you!'] }],
        win: ['> Brock goes down. He lies on the sidewalk and starts crying. "I\'ve never... lost... before. Is this what feelings are? I hate them. Teach me more." He gives you his lucky brass knuckles. They\'re warm. Everything about Brock is warm.'],
      },
    ],
  },

  side_overdue: {
    kind: 'side', title: 'Overdue', giver: 'shush',
    summary: '"The Joy of Taxidermy, Volume Two" is twenty-two years overdue. The borrower is a biker called Gravel at the Dirty Spur. Ms. Shush wants it back. Quietly. Or loudly. She\'s stopped caring.',
    offer: [
      { who: 'nar', t: ['> A tiny old librarian with a voice like a knife being sharpened in a quiet room.'] },
      ['Shhhhhh. Young... person. "The Joy of Taxidermy, Volume Two" is TWENTY-TWO YEARS overdue. The fine is now four thousand dollars and one firstborn.', 'The borrower is a biker at the Dirty Spur. They call him "Gravel". I call him a disgrace to the Dewey Decimal System. Retrieve it.'],
    ],
    reward: { money: 150, stats: { int: 3 }, xp: 150 }, rewardText: '$150, +3 INT, a lifetime of quiet judgment',
    steps: [
      {
        text: 'Retrieve the book from "Gravel" outside the Dirty Spur in the Dustbowl.',
        obj: { type: 'goto', loc: 'dirty_spur', radius: 9 },
        arrive: [
          { who: 'nar', t: ['> Outside the Dirty Spur, a biker the size of a vending machine is reading "The Joy of Taxidermy, Volume Two" with a highlighter.'] },
          { who: 'Gravel', t: ['Whatchu want? I\'m at the good part. He\'s stuffing a weasel. Look at its little face. Look at it.'],
            choices: [
              gate('cha', 20, 'Convince him the library has Volume Three (it doesn\'t)', 'advance', [{ who: 'Gravel', t: ['...There\'s a VOLUME THREE? *He hands you the book reverently.* Tell the librarian Gravel says... Gravel says shh.'] }]),
              pay(200, 'Buy it off him for $200', 'advance', [{ who: 'Gravel', t: ['Two hundred? For a library book? You got a problem, man. Here. Read the weasel chapter. It changed me.'] }]),
              fight({ count: 1, kind: 'drunk', tier: 2, label: 'Gravel' }, 'Take it by force', ['> Gravel goes down clutching his highlighter. "Chapter nine," he wheezes. "The ferret. Don\'t skip it."']),
              leave('Let him finish the chapter.'),
            ] },
        ],
        onDone: (g) => g.quests.giveItem('q_book'),
      },
      {
        text: 'Return the book to Ms. Shush at the Rotwell Public Library.',
        obj: { type: 'talk', who: 'shush' }, take: 'q_book',
        talk: [['*She sniffs the book.* It smells like beer and weasel. Acceptable. Your fine is forgiven. Your soul, however, remains overdue. Shhhh.']],
      },
    ],
  },

  side_tattoo: {
    kind: 'side', title: 'Born to Dine', giver: 'needles',
    summary: 'Needles was supposed to tattoo "BORN TO DIE" on Big Dale\'s chest. He wrote "BORN TO DINE". With a little fork. Calm Dale down before Needles dies.',
    offer: [
      { who: 'nar', t: ['> A tattoo artist with a shaky hand, a fully tattooed face, and an empty bottle of tequila taped to his tattoo gun.'] },
      ['Bro. BRO. I messed up. Big Dale from the Dirty Spur wanted "BORN TO DIE" across his chest. I wrote "BORN TO DINE". With a little fork. I don\'t know why I drew a fork, man.', 'He\'s gonna kill me. Go talk to him. Calm him down. Or distract him. Or fake my death. Whatever\'s cheapest.'],
    ],
    reward: { money: 200, stats: { cha: 2 }, xp: 150 }, rewardText: '$200 and a free tattoo (+2 CHA)',
    steps: [
      {
        text: 'Talk Big Dale down outside the Dirty Spur.',
        obj: { type: 'talk', who: 'dale' },
        talk: [
          { who: 'nar', t: ['> A biker with a fresh, angry tattoo across his chest: BORN TO DINE, and a beautifully detailed fork.'] },
          { t: ['You from Needles? I\'mma kill him. I\'mma kill him slow. I\'mma kill him at a RESTAURANT so he gets the irony.'],
            choices: [
              gate('cha', 25, 'Convince him "Born to Dine" is way cooler', 'advance', [{ who: 'nar', t: ['> You explain that "Born to Die" is a cliché, and "Born to Dine" says "I am a man of APPETITES. A man who LIVES."', '> Dale stares at his chest for a long time. "Born... to DINE." He weeps. "I\'ve never felt so seen."'] }]),
              pay(300, 'Pay for a cover-up: a skull eating a steak', 'advance', [['A skull... eating a steak... *He wipes his eyes.* That\'s beautiful, man. That\'s me. Tell Needles he lives. Today.']]),
              fight({ count: 1, kind: 'fighter', tier: 3, label: 'Big Dale' }, 'Fight him', ['> Dale goes down. From the ground he mumbles, "...born to dine..." and falls asleep. Problem solved, technically.']),
              leave('Back away slowly.'),
            ] },
        ],
      },
      {
        text: 'Tell Needles at Ink Stinks that he gets to live.',
        obj: { type: 'talk', who: 'needles' },
        talk: [['I LIVE? I LIVE! Free tattoo, bro, anything you want. ...Too late, I already started. It\'s a pigeon. It\'s... honestly, it\'s a pretty good pigeon.']],
      },
    ],
  },

  side_pizza: {
    kind: 'side', title: '30 Minutes or It\'s Free', giver: 'gary',
    summary: 'Tony Butt of Pizza Butt needs a delivery driver. Two pizzas, two addresses, two time limits. Late pizza is free pizza, and free pizza comes out of YOUR pay.',
    offer: [
      { who: 'nar', t: ['> A man in a Pizza Butt uniform with a name tag that reads TONY BUTT. Yes, that\'s his real name. Yes, he named the restaurant after himself. No, he does not get the joke.'] },
      'My delivery guy quit. Then he died. Then he un-died and quit again. I need a driver. Two pizzas, two addresses, two time limits. Pizza Butt: We Put the Cheese in Places.',
    ],
    reward: { money: 200, items: { q_pizza_tag: 1 }, xp: 150 }, rewardText: '$200 + tips, Employee of the Minute',
    onComplete: (g) => g.state.setFlag('pickles_pizza'),
    steps: [
      {
        text: 'Deliver a hot pizza to Grimco Tower in Hilltop before it gets cold!',
        obj: { type: 'goto', loc: 'grimco', timer: 150, radius: 8 },
        give: 'q_pizza', take: 'q_pizza',
        failText: 'Too late! The pizza is cold. Tony takes it out of your pay and hands you another one. Go!',
        arrive: [{ who: 'nar', t: ['> A Grimco executive takes the pizza, eats one slice, and drops the rest in the trash in front of you, maintaining eye contact.', '> He tips you a business card. It says: "TIP: Be Rich."'] }],
      },
      {
        text: 'Deliver a pizza to the guard at Bunker 9 in the Dustbowl. It\'s far. Drive!',
        obj: { type: 'goto', loc: 'bunker', timer: 240, radius: 12 },
        give: 'q_pizza', take: 'q_pizza',
        failText: 'Too late! Pickles\' pizza is a cold, sad disc. Tony gives you another. HURRY.',
        arrive: [{ who: 'pickles', t: ['> Corporal Pickles takes the pizza like it\'s a newborn baby.', 'Pineapple and anchovy. Nobody else gets me. *He tips you $50 and a single tear.*'] }],
        onDone: (g) => g.state.addMoney(50, 'tip'),
      },
      {
        text: 'Collect your pay from Tony Butt.',
        obj: { type: 'talk', who: 'gary' },
        talk: [['Two on-time deliveries! You\'re Pizza Butt\'s Employee of the Minute! Here\'s your pay and your badge. ...Okay, minute\'s up. Give it back. Kidding. Keep it. I have a box of them.']],
      },
    ],
  },

  side_mime: {
    kind: 'side', title: 'Silence of the Mimes', giver: 'lardner',
    summary: 'A mime troupe has been "trapped in invisible boxes" outside Threads & Dreads Thrift for three days. One of them stole Chief Lardner\'s wallet. For real.',
    offer: [
      { who: 'nar', t: ['> Chief Lardner is leaning on his cruiser, eating a donut with another donut.'] },
      ['You. Civilian. You look like you got nothing to do. There\'s a mime troupe downtown outside Threads & Dreads. Customers can\'t get in. One of \'em mimed stealing my wallet.', 'Then he ACTUALLY stole my wallet. Go rough \'em up. Unofficially. I\'d do it, but I\'m... busy. *He eats the second donut with the first donut.*'],
    ],
    reward: { money: 150, xp: 150 }, rewardText: '$150 and the Chief owes you (heat cleared)',
    onComplete: (g) => { g.state.setFlag('lardner_owes'); g.state.addHeat(-5); },
    steps: [
      {
        text: 'Break up the mime troupe outside Threads & Dreads Thrift downtown.',
        obj: { type: 'brawl', loc: 'threads', count: 3, kind: 'thug', tier: 1, label: 'The Mime Troupe' },
        arrive: [{ who: 'nar', t: ['> Three mimes pull an invisible rope. When they see you, they roll up invisible sleeves.', '> Then they take out very real switchblades.'] }],
        win: ['> The last mime mimes "calling for help". Nobody comes. Nobody ever comes for a mime. He drops a wallet with a donut punch card in it.'],
        winGive: 'q_wallet',
      },
      {
        text: 'Return the wallet to Chief Lardner at the PD.',
        obj: { type: 'talk', who: 'lardner' },
        talk: [
          { t: ['> You check the wallet on the way. Three hundred bucks, a donut punch card (11 of 12 punches), and a photo of a donut. Framed.'],
            choices: [
              { label: 'Return it untouched', hint: '+karma', do: (g) => { g.quests.takeItem('q_wallet'); g.state.addStat('karma', 3); },
                then: [{ who: 'lardner', t: ['*He counts it.* ...It\'s all here. Huh. Honest. Weird. I don\'t like it, but I respect it. Your little problems with my boys? They\'re gone.'] }] },
              { label: 'Skim the $300 first', hint: '+$300, -karma', do: (g) => { g.quests.takeItem('q_wallet'); g.state.addMoney(300, 'skim'); g.state.addStat('karma', -5); },
                then: [{ who: 'lardner', t: ['*He counts it.* ...Empty. Classic mimes. Whatever, I\'ll arrest somebody poor to make up for it. Your little problems with my boys? Gone.'] }] },
            ] },
        ],
      },
    ],
  },

  side_meat: {
    kind: 'side', title: 'Mystery Meat', giver: 'hank',
    summary: 'A Grimco truck dropped forty barrels at the meat plant labeled "NOT PEOPLE (PROBABLY)". Hank needs to know about the "probably".',
    offer: [
      { who: 'nar', t: ['> A meat plant worker in a stained apron with hairnets on every hair, including his eyebrows.'] },
      ['Twenty years on the rendering line. I don\'t ask what goes in the Rotwell Meat Loaf. But last week a Grimco truck dropped off forty barrels labeled "NOT PEOPLE (PROBABLY)".', 'The "probably" is keepin\' me up at night. Grab a sample from the loading dock and get it tested at the university. Please. I gotta know if I\'ve been eatin\' my coworkers.'],
    ],
    reward: { xp: 250 }, rewardText: 'Depends on whose side you\'re on',
    steps: [
      {
        text: 'Grab a sample from the meat plant\'s loading dock in the Rustyards.',
        obj: { type: 'goto', loc: 'meat_plant', radius: 9 },
        arrive: [{ who: 'nar', t: ['> You scoop a sample into a jar. The meat... pulses. Once. You decide that was your imagination.', '> It pulses again. You decide to stop deciding things.'] }],
        onDone: (g) => g.quests.giveItem('q_meat'),
      },
      {
        text: 'Get the sample tested by Professor Fumble at Rotwell University.',
        obj: { type: 'talk', who: 'fumble' }, take: 'q_meat',
        talk: [
          ['> Fumble squints into a microscope. Then a second microscope. Then he drinks a beaker of something green and squints again.'],
          ['Good news: it\'s not people! Bad news: it\'s forty percent Grimco "protein substrate", thirty percent recycled sneakers, and thirty percent something my spectrometer can only identify as "sad".', 'Not a chemical. Just... sad. Here\'s the report. Burn it after reading. Actually, burn it before reading, it\'s safer.'],
        ],
        onDone: (g) => g.quests.giveItem('q_meat_report'),
      },
      {
        text: 'Decide what to do with the report. Hank is waiting at the meat plant.',
        obj: { type: 'talk', who: 'hank' },
        talk: [
          { t: ['Well? WELL? Am I a cannibal? Just tell me straight. I can take it. I can\'t take it. Tell me anyway.'],
            choices: [
              { label: 'Tell Hank the truth and blow the whistle to Det. Thorne', hint: '+15 karma, $200', do: (g) => { g.quests.takeItem('q_meat_report'); g.state.addStat('karma', 15); g.state.addMoney(200, 'Hank'); g.state.setFlag('meat_whistle'); },
                then: ['Sneakers and sadness. Okay. Okay. That\'s... honestly better than I feared. Here\'s two hundred. I\'m going vegetarian. I\'m going to eat a whole field.'] },
              { label: 'Lie to Hank and sell the report to Grimco', hint: '+$1,500, -15 karma', do: (g) => { g.quests.takeItem('q_meat_report'); g.state.addMoney(1500, 'Grimco hush money'); g.state.addStat('karma', -15); },
                then: ['It\'s just pork? Oh thank god. *He takes a big bite of a Meat Loaf sandwich.* Mmm. Sadness.', '> Later, a Grimco courier hands you an envelope with $1,500 and a note: "Thank you for your discretion. Enjoy a complimentary Meat Loaf."'] },
            ] },
        ],
      },
    ],
  },

  side_martha: {
    kind: 'side', title: 'Queen of the Dust', giver: 'martha',
    summary: 'Mad Martha runs the Dustbowl Drag Strip. Win two races there and earn her respect — and maybe a ride.',
    offer: [
      { who: 'nar', t: ['> A leathery woman with a mohawk the color of a warning sign sits on a motorcycle welded together from four other motorcycles.'] },
      ['Mad Martha. I run the drag strip, the bikers, and about half the dust in this desert. The other half\'s mine too, it just don\'t know it yet.', 'You want respect out here, city mouse? Win two races at my strip. Win \'em clean or win \'em dirty. Just win.'],
    ],
    reward: { xp: 300 }, rewardText: 'A bike (or $2,500 if you have nowhere to park it)',
    steps: [
      { text: (g, q) => `Win 2 races at the Dustbowl Drag Strip. (${q.sd.n || 0}/2)`, obj: { type: 'event', evt: 'race:won', count: 2 }, marker: { loc: 'drag_strip', label: 'Dustbowl Drag Strip' } },
      {
        text: 'Claim your prize from Mad Martha at the drag strip.',
        obj: { type: 'talk', who: 'martha' },
        talk: [['Two wins. Not bad for a city mouse. Here — take Debra\'s little sister. Treat her right, or I\'ll treat YOU wrong.']],
        onDone: (g) => g.quests.giveCar(['widowmaker', 'moped'], '#d6b33c', 2500),
      },
    ],
  },

  side_leg: {
    kind: 'side', title: 'A Leg to Stand On', giver: 'pete',
    summary: 'Someone stole Scrapper Pete\'s titanium prosthetic leg (racing stripes, cup holder). It\'s in Lucky Larry\'s window for $150.',
    offer: [
      { who: 'nar', t: ['> Scrapper Pete hops over on one leg and a rusty muffler.'] },
      ['Somebody stole my good leg! Titanium. Racing stripes. Cup holder. Now I gotta walk on this muffler like an animal.', 'Saw it in the window at Lucky Larry\'s Pawn in Gutterside. Hundred and fifty bucks. Go buy it back for me. I\'m good for it. I\'m good for almost everything.'],
    ],
    reward: { money: 150, weapon: 'crowbar', xp: 150 }, rewardText: 'A crowbar and your $150 back',
    steps: [
      {
        text: 'Buy Pete\'s leg back from Lucky Larry ($150).',
        obj: { type: 'talk', who: 'larry' },
        talk: [
          { t: ['Ah, the leg! Lovely leg. Cup holder. Had a guy offer me four hundred for it. A guy with no legs! Imagine! A hundred fifty to you, friend.'],
            choices: [pay(150, 'Buy the leg'), gate('cha', 20, 'Haggle: "That leg is stolen, Larry."', 'advance', ['...Fine. FINE. Take it. It was making the other merchandise nervous.']), leave('Not right now.')] },
        ],
        onDone: (g) => g.quests.giveItem('q_leg'),
      },
      {
        text: 'Bring the leg back to Scrapper Pete at the junkyard.',
        obj: { type: 'talk', who: 'pete' }, take: 'q_leg',
        talk: [['*He snaps it on with a satisfying CLUNK and immediately does a jig.* I\'m WHOLE again! Mostly! Here — take this crowbar. It\'s opened more doors than a doorman. And your money back. Pete pays his debts.']],
      },
    ],
  },

  side_letter: {
    kind: 'side', title: 'Love in Bunker 9', giver: 'pickles',
    summary: 'Corporal Pickles is in love with Madame Ooze. He wrote her a poem. It rhymes "bunker" with "hunk-er".',
    available: (g) => !!g.state.getFlag('met_pickles') || g.quests.isActive('main_bunker') || g.quests.isDone('side_pizza'),
    offer: [
      { who: 'nar', t: ['> Corporal Pickles shifts awkwardly, red-faced under his helmet.'] },
      ['Hey, uh. You get around town, right? There\'s this... lady. Madame Ooze. The fortune teller. She told me I\'d meet the love of my life, and then she looked at me for a long time. Like, a LONG time. With her one eye.', 'I wrote her a letter. It\'s a poem. It rhymes "bunker" with "hunk-er". Will you deliver it?'],
    ],
    reward: { money: 100, karma: 5, xp: 150 }, rewardText: '$100, +5 karma, and a friend on the inside',
    onComplete: (g) => g.state.setFlag('pickles_code'),
    steps: [
      {
        text: 'Deliver Pickles\' love poem to Madame Ooze in Gutterside.',
        obj: { type: 'talk', who: 'ooze' }, give: 'q_love_letter', take: 'q_love_letter',
        talk: [
          ['> She reads it aloud: "Roses are red, the bunker is gray, I guard it all night, and I\'d guard you all day. You\'re a hunk-er, I\'m in the bunker..." She stops. She is silent for a long time.'],
          ['He rhymed "bunker" with "hunk-er". Darling, that is the most romantic thing a man has ever done for me. The last one rhymed "Ooze" with "booze" and then threw up in my crystal ball.', 'Take him my reply. And tell him to wear the helmet. I like the helmet.'],
        ],
        onDone: (g) => g.quests.giveItem('q_reply'),
      },
      {
        text: 'Bring Madame Ooze\'s reply back to Corporal Pickles at Bunker 9.',
        obj: { type: 'talk', who: 'pickles' }, take: 'q_reply',
        talk: [['*He reads it. He reads it again. He takes off his helmet, and he is crying.* She said YES. To a DATE. At the Greasy Spoon!', 'Buddy... I owe you. Here — the night code for the bunker\'s side door. Don\'t tell anyone. Don\'t tell ME I told you. It\'s 0-0-0-0. They never changed it. Nobody changes anything here.']],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// FACTIONS — repeatable jobs at the gang HQs.
// ---------------------------------------------------------------------------
export const FACTIONS = {
  rats: {
    id: 'rats', name: 'Gutter Rats', boss: 'sal', hq: 'rats_clubhouse', color: '#a5c234', enemy: 'syndicate',
    joinReq: (g) => g.state.p.str >= 10, joinReqText: 'STR 10',
    ranks: [[0, 'Sewer Pup'], [25, 'Gutter Punk'], [60, 'Rat Lieutenant'], [120, 'Rat Baron'], [220, 'Big Cheese-in-Waiting']],
    greet: [
      '> The clubhouse is a gutted laundromat. The dryers are full of guns. One dryer is full of a guy named Pus, napping.',
      '> Somebody is cooking something in a hubcap. It smells like victory and sewer.',
      '> A Rat is teaching another Rat to pick locks using Sal\'s ice cream truck. The jingle won\'t stop.',
    ],
    hostile: '> The door opens two inches. Twelve eyes stare out. "It\'s the Velvet\'s pet," someone hisses. Then the door opens all the way, and so do the switchblades.',
    jobs: [
      { id: 'beatdown', type: 'brawl', title: 'Beatdown', kind: 'gang', label: 'Velvet Dealers',
        brief: 'Some Velvet clowns are slinging on our turf in {district}. Make \'em un-sling.', pay: [180, 380], rep: 6, heat: 0 },
      { id: 'collect', type: 'collect', title: 'Collection',
        brief: '{loc} is late on their "protection". Remind \'em protection includes protection from US.', pay: [200, 450], rep: 5, heat: 1 },
      { id: 'delivery', type: 'deliver', title: 'Special Delivery', timed: true,
        brief: 'Run this "medicine" to a guy outside {loc}. You got {time}. Don\'t shake it.', pay: [250, 550], rep: 7, heat: 1 },
      { id: 'tag', type: 'visit', title: 'Tag Hilltop', district: 'hilltop', timed: true, points: 3,
        brief: 'Spray the Rat sigil in three spots in Hilltop. The rich HATE that. You got {time}.', pay: [200, 400], rep: 6, heat: 1 },
    ],
  },
  syndicate: {
    id: 'syndicate', name: 'Velvet Syndicate', boss: 'vivienne', hq: 'syndicate_lounge', color: '#b3263e', enemy: 'rats',
    joinReq: (g) => g.state.p.cha >= 15, joinReqText: 'CHA 15 + $500 membership', joinFee: 500,
    ranks: [[0, 'Velvet Doormat'], [25, 'Associate'], [60, 'Made Man in a Suit'], [120, 'Velvet Underboss'], [220, 'Heir to the Velvet']],
    greet: [
      '> The lounge smells like cigars, money, and a tiny dog\'s cologne. A harpist plays something sad and expensive.',
      '> Two-Ton Tito is doing a crossword. He looks up. "Seven letters, \'violence, but classy\'." He doesn\'t wait for an answer.',
      '> A waiter offers you champagne, then takes it back when he sees your shoes.',
    ],
    hostile: '> The bouncer at the velvet rope looks at you, sniffs, and presses a button. A trapdoor doesn\'t open, but a side door does, and out come four very well-dressed problems.',
    jobs: [
      { id: 'debt', type: 'collect', title: 'Debt Collection',
        brief: 'A gentleman at {loc} owes the Golden Tooth. Collect. Politely. Then impolitely.', pay: [250, 500], rep: 5, heat: 1 },
      { id: 'courier', type: 'deliver', title: 'Discreet Courier', timed: true,
        brief: 'A velvet case for a client outside {loc}. You have {time}. Do not open the case. The case does not like to be opened.', pay: [300, 600], rep: 7, heat: 0 },
      { id: 'pest', type: 'brawl', title: 'Pest Control', kind: 'gang', label: 'Gutter Rats',
        brief: 'Gutter Rats are getting brave in {district}. Remind them they\'re vermin.', pay: [200, 420], rep: 6, heat: 0 },
      { id: 'disposal', type: 'deliver', title: 'Vehicle Disposal', timed: true, needCar: true, district: 'rustyards',
        brief: 'Drive a "sensitive vehicle" to the Rustyards. Don\'t look in the trunk. You have {time}.', pay: [350, 650], rep: 8, heat: 1 },
    ],
  },
};

// Warehouse 13 smuggling cargo.
export const SMUGGLING = [
  { id: 'crate', name: 'Mystery Crate', blurb: 'It\'s ticking. Probably a clock. Probably.', base: 250, timeMult: 1.0, heat: 0 },
  { id: 'animals', name: 'Exotic Animals', blurb: 'It\'s moving. And it\'s angry. Something in there just said "ow" in a human voice.', base: 450, timeMult: 0.85, heat: 0 },
  { id: 'purses', name: 'Knockoff "Velvetini" Handbags', blurb: 'Two hundred designer bags, all spelled slightly wrong.', base: 350, timeMult: 1.0, heat: 1 },
  { id: 'waste', name: 'Grimco "Medical Waste"', blurb: 'It glows. It hums. It\'s warm in a way that makes your teeth itch.', base: 700, timeMult: 0.8, heat: 1 },
];

// ---------------------------------------------------------------------------
// ENDINGS
// ---------------------------------------------------------------------------
export const ENDINGS = {
  kingpin: {
    title: 'KING OF THE GUTTER', sub: 'Street Kingpin Ending', color: '#a5c234',
    epilogue: (g, v) => [
      v === 'shared'
        ? 'You and Big Sal rule Rotwell side by side from a brand-new, extra-long ice cream truck with a hot tub in the back. The jingle now plays your name. It still sounds like a clown dying, but a rich one.'
        : 'Big Sal\'s ice cream truck is now yours. Sal "retired" to the harbor. On Sundays the Rats leave a frozen hot dog on the pier for him. Nobody knows who eats it.',
      'The Velvet Syndicate is a memory and a lot of abandoned velvet. The Golden Tooth is now the Golden Gutter. The house still always wins. You are the house.',
      'Chief Lardner works for you now. He\'s gained forty pounds. Of envelopes.',
      'Every gutter in Rotwell drains to you. That was a metaphor. It\'s also, legally, now your plumbing problem.',
    ],
  },
  corporate: {
    title: 'CEO OF ROT', sub: 'Corporate Overlord Ending', color: '#c9a227',
    epilogue: (g, v) => [
      v === 'partner'
        ? 'You and Chadwick Grimsworth III run Grimco as equal partners. You golf on a course built over Gutterside. Your caddy is the former mayor.'
        : 'Chadwick Grimsworth III now lives under the overpass with Reg. He is, by all accounts, happier. The ficus is your vice president.',
      'Grimco\'s quarterly profits rise 400%. Rent rises 400%. Wages rise "a vibe". You get a bonus for each.',
      'The Velvet Syndicate is now the Grimco Entertainment & Pharmaceutical Wellness Division. The pills still have cute names. The lawyers are better.',
      'You never see the street again. You see it from the top floor, through bulletproof glass, at night, when it looks like stars. Dirty, poor stars.',
    ],
  },
  mayor: {
    title: 'MAYOR OF ROTWELL', sub: 'Reformer Ending', color: '#6fa8dc',
    epilogue: (g) => [
      'You are sworn in on the steps of City Hall. A pigeon lands on your head and does nothing. The crowd gasps. It\'s a sign.',
      'Ex-Mayor Swindell gets eleven consecutive terms of his own — in prison. Chief Lardner is demoted to crossing guard. The donuts are confiscated as evidence. Detective Thorne is the new Chief. She still eats salad out of a hubcap. It\'s a mood.',
      'The water is now merely beige. The fire department is back. The bear has been promoted to head of the IRS office.',
      g.state.p.karma >= 70 ? 'They put up a statue of you in the park. The pigeons, out of respect, only poop on it on weekends.' : 'They put up a statue of you in the park. The pigeons treat it exactly like every other statue.',
      'Rotwell is still a toilet. But for the first time in twenty years, somebody is cleaning it.',
    ],
  },
  escape: {
    title: 'LIFTING THE LID', sub: 'Escape Ending', color: '#e8e2d0',
    epilogue: (g, v) => (v === 'alone' ? [
      'You open the Lid just a crack — enough for one stick figure to squeeze through. The rest of Rotwell goes on paying rent to a dome.',
      'Outside, you sell your story to every news channel on Earth. Grimco denies everything, then sues you, then offers you a job. You take the job.',
      'Sometimes, at night, you look back at the city: a grey bubble on the horizon, flickering. You swear you can hear a hobo yelling "PLUNGER" from all the way out here.',
    ] : [
      'You push the button. The Lid groans, shudders, and opens like the world\'s largest trash can. Twenty years of smog rolls out into the world, which immediately files a complaint.',
      'For the first time in two decades, the people of Rotwell see the actual sun. The consensus: "It\'s... fine?" Somebody tries to sell it to tourists by noon.',
      'Highway 9 now leads OUT. Half the city leaves. Half the city stays, because the rent is finally dropping. Reg cries under the overpass for three days straight. He says it\'s the sunlight. It isn\'t.',
      'Grimco\'s board is arrested by people from outside, who are horrified, and also secretly taking notes.',
    ]),
  },
  hobo: {
    title: 'LONG LIVE THE CRUST', sub: 'Hobo King Ending', color: '#b0672a',
    epilogue: (g, v) => [
      'You are crowned King of the Overpass with a beer-can crown. Your throne is a shopping cart with one bad wheel. It turns slightly left. So do you.',
      v === 'soup' ? 'Your first decree, Free Soup Every Day, is enforced with terrifying efficiency by an army of hobos and one very large raccoon. The soup is mostly hot water and optimism. It is the best soup in Rotwell.' : 'Your first decree, Everybody Gets a Better Box, triggers the greatest cardboard heist in Rotwell history. Grimco loses an entire warehouse of shipping boxes overnight. Nobody is ever charged.',
      'Reg becomes your royal advisor. He mostly advises naps. They are excellent naps.',
      'Rotwell still sucks. But under the overpass, around the burning barrel, it sucks a little bit less. Long live the Crust.',
    ],
  },
};

// Wisdom Reg dispenses at the camp (once per day for +INT).
export const PROPHECIES = [
  'A man who sleeps on a bench sees the stars. A man who sleeps in a mansion sees his ceiling. Both are bitten by bugs. Only one of them pays for it.',
  'The rent is a ghost, Plunger. It haunts you once a month and it is never satisfied.',
  'Never fight a man with nothing to lose. Unless he\'s small. Then, honestly, it\'s fine.',
  'The rat does not hate the trap. The rat hates the cheese for lying.',
  'Grimco measures everything. Steps, sighs, sobs. Make them measure a laugh, kid. It confuses the machines.',
  'Every king was once a guy who said "I\'ll be king" and nobody stopped him in time.',
  'The pigeon knows no borders. The pigeon knows no shame. Be the pigeon.',
  'Money comes and goes. Mostly goes. Mostly to Hilltop.',
  'You can\'t polish a turd, Plunger. But you CAN roll it in glitter and sell it in the Golden Tooth gift shop.',
  'The smog is not the sky. The sky is not the limit. The limit is a lid. Remember that.',
];
