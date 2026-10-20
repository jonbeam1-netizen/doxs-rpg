// New quest characters, quest items, and "the world remembers" lines for recurring characters.
// Merged into CHARACTERS / QUEST_ITEMS by ./index.js at import time (runtime only).
//
// `react(g)` -> string[]: lines a character may open with instead of an idle line (the engine picks
// one ~60% of the time), reacting to your gang, your endings and what you've learned on the main paths.

const F = (g, k) => g.state.getFlag(k);
const endings = (g) => g.state.getFlag('endings', []) || [];

// Shared reaction table builder. Keys: rats, syndicate, kingpin, corporate, mayor, escape, hobo,
// lid (saw the bunker), saint (karma >= 40), sinner (karma <= -20), famous (any ending), legend (3+ endings).
// Values: string | string[] | (variant, g) => string | string[].
export function reacts(t) {
  return (g) => {
    const out = [];
    const add = (v, arg) => { if (v == null) return; const r = typeof v === 'function' ? v(arg, g) : v; if (Array.isArray(r)) out.push(...r.filter(Boolean)); else if (r) out.push(r); };
    const fac = g.quests?.faction?.();
    if (fac === 'rats') add(t.rats);
    if (fac === 'syndicate') add(t.syndicate);
    for (const e of ['kingpin', 'corporate', 'mayor', 'escape', 'hobo']) { const v = F(g, 'ending_' + e); if (v) add(t[e], v); }
    if (F(g, 'knows_lid')) add(t.lid);
    const k = g.state.p.karma || 0;
    if (k >= 40) add(t.saint);
    if (k <= -20) add(t.sinner);
    if (endings(g).length) add(t.famous);
    if (endings(g).length >= 3) add(t.legend);
    if (t.extra) add(t.extra);
    return out;
  };
}

export const NEW_CHARACTERS = {
  krupnik: {
    name: 'Mrs. Krupnik', title: 'Roach Motel Manager', loc: 'roach_motel', slot: 0,
    color: '#5a3a4a', hat: 'beanie', hatColor: '#c8b8a0', talkPrompt: 'Talk to Mrs. Krupnik',
    idle: [
      'Room Six! You still owe me for the vomit. Not money. An apology. To the carpet.',
      'Checkout is at eleven. Check-in is whenever the cops drop you off.',
      'The roaches here are family. You are a guest. Guests can be evicted. Family is forever.',
      "No singing about lids after midnight. I don't care how true it is.",
    ],
  },
  remy: {
    name: 'Remy Fromage', title: 'Food Critic (Disgraced)', loc: 'gas_n_gulp', slot: 0,
    color: '#5a2a3a', hat: 'fedora', hatColor: '#1a1a1a', talkPrompt: 'Talk to Remy Fromage',
    idle: [
      'I once gave the moon two stars. Too far. Terrible parking.',
      'My palate is a ruin. I licked a Grimco press release in 1998 and lost the ability to taste joy.',
      "This hot dog has notes of tire fire and regret. I'd eat it again. That's the tragedy.",
      'A critic is just a hungry man with a thesaurus.',
    ],
  },
  muffy: {
    name: 'Muffy Van Snootington', title: 'Heiress & Influencer (12 Followers)', loc: 'club_velvet', slot: 0,
    color: '#c87a9a', hat: 'fedora', hatColor: '#f0e0e8', talkPrompt: 'Talk to Muffy',
    idle: [
      "Omigod, are you POOR? Can I touch your elbow? For content?",
      "Daddy says poverty is a lifestyle choice. I want to choose it. Ironically.",
      'My dog has a trust fund. My dog has a lawyer. My dog is suing my other dog.',
      "I tried tap water once. Is it supposed to crunch?",
    ],
  },
  fran: {
    name: 'Forklift Fran', title: 'Union Organizer (Nine Fingers)', loc: 'meat_plant', slot: 1,
    color: '#6a4a2a', hat: 'hardhat', hatColor: '#d0a030', talkPrompt: 'Talk to Forklift Fran',
    idle: [
      "I keep my tenth finger in a locket. The rendering line kept the rest of the hand's dignity.",
      'Grimco calls it a "family". Families don\'t make you pee in a bucket to hit quota.',
      'Solidarity, comrade. Also, you got a smoke?',
      "I've driven a forklift through three Grimco managers' cars. Allegedly. Twice allegedly.",
    ],
  },
  ethel: {
    name: 'Grandma Ethel', title: 'Dustbowl Moonshiner (81, Armed)', loc: 'double_wide', slot: 0,
    color: '#8a7a6a', hat: 'beanie', hatColor: '#e0d0b0', talkPrompt: 'Talk to Grandma Ethel',
    idle: [
      "My shotgun's name is Pastor. Pastor has delivered eleven sermons. All of 'em short.",
      'I been dyin\' since 1994. The doctors keep sayin\' "any day now". Joke\'s on them, I outlived three doctors.',
      'Moonshine cures everything. Colds, sadness, eyesight.',
      "Sit down, sugar. Not there. That's where the cat died.",
    ],
  },
  harriet: {
    name: "Cap'n Harriet Hooks", title: 'Retired Sea Captain (One Leg, One Grudge)', loc: 'blackwater_pier', slot: 1,
    color: '#2a3a4a', hat: 'cap', hatColor: '#e8e2d0', talkPrompt: 'Talk to Cap\'n Harriet',
    // out on the pier deck (the door offset would put her in the bay)
    spot: (g) => { const P = g.world?.island?.spots?.pier; return P ? { x: P.x - 1.5, z: P.z1 - 15, facing: Math.PI } : null; },
    idle: [
      "Forty years at sea. I lost a leg, an eye, a husband and a bet. Only one of those I want back. The bet.",
      'The fish here got opinions. Old Rustjaw\'s got a whole manifesto.',
      'Never trust a fish with a hubcap. That\'s just sailing.',
      "My wooden leg's made from the mast of my first ship. My second leg's made from my second husband's bowling pins.",
    ],
  },
  wendell: {
    name: 'Wendell Pratt', title: 'Ex-Funland Ride Operator', loc: 'funland_arcade', slot: 0,
    color: '#a03a3a', hat: 'cap', hatColor: '#f0c030', talkPrompt: 'Talk to Wendell',
    idle: [
      "Eleven years since the Incident. I still wear the vest. If I take it off, they win.",
      'The wheel turns by itself at night. I counted the rotations. It\'s Morse code. It says "HEE".',
      "I'm not paranoid. Everyone just keeps PROVING me right.",
      "Keep your hands and feet inside the ride at all times. Especially the feet. The wheel's hungry.",
    ],
  },
  rhonda: {
    name: 'Rhonda McGee', title: "Knuckles McGee's Wife (25 Years)", loc: 'blackwater_pen', slot: 0,
    color: '#7a2a5a', hat: 'beanie', hatColor: '#e05a9a', talkPrompt: 'Talk to Rhonda',
    idle: [
      "Twenty-five years married. Nineteen of 'em through plexiglass. Best years of my life.",
      'My Knuckles robbed fourteen banks. Thirteen successfully. The fourteenth was for me. Romance.',
      'Officer Krumm checks my hair for contraband every visit. My hair IS contraband.',
      "Love finds a way, sweetie. Usually through the visiting-room vent.",
    ],
  },
  marlene: {
    name: 'Gnarly Marlene', title: 'Skate Legend (Two Hip Replacements)', loc: 'skid_row_apts', slot: 0,
    color: '#3a5a5a', hat: 'beanie', hatColor: '#d03a3a', talkPrompt: 'Talk to Gnarly Marlene',
    idle: [
      'I was shredding Rotwell before your parents met. Possibly before your parents were LEGAL.',
      "Two hip replacements. The left one's titanium. The right one I stole off a mannequin.",
      'Skateboarding is not a crime. It\'s three or four crimes, depending on the rail.',
      "Kids today with their helmets. In my day we used our FACES.",
    ],
  },
  norman: {
    name: 'Nervous Norman', title: 'First Bank Teller (Robbed 41 Times)', loc: 'first_bank', slot: 0,
    color: '#5a6a7a', talkPrompt: 'Talk to Norman',
    idle: [
      'I sweat when I\'m nervous. I\'m always nervous. I go through six shirts a shift.',
      "Forty-one robberies. I've been called 'sir' by every masked man in this city. It's the only respect I get.",
      'Please don\'t make any sudden movements. Or slow ones. Or any movements.',
      "My mom packs my lunch. I'm forty-four. She packs it angry.",
    ],
  },
  lonnie: {
    name: 'Sweaty Lonnie', title: 'Two Guys & A Truck (One Guy, No Truck)', loc: 'dock_loft', slot: 0,
    color: '#7a5a3a', hat: 'cap', hatColor: '#3a6a3a', talkPrompt: 'Talk to Lonnie',
    idle: [
      "Two Guys & A Truck. The other guy quit. The truck's a shopping cart. I'm still the guy.",
      'Lift with your legs, not your back. Or lift with your friend. Friends are cheaper than chiropractors.',
      "I've moved pianos, safes, a hot tub and one guy's mom. She was the heaviest. Emotionally.",
      'I sweat so much the city charges me a water bill for my armpits.',
    ],
  },
  chet: {
    name: 'Chet Plungerton', title: 'The (Self-Proclaimed) Real Plunger', loc: 'gutter_liquor', slot: 0,
    color: '#c8c0b0', hat: 'tophat', hatColor: '#a02a2a', talkPrompt: 'Talk to Chet',
    idle: [
      "There's only ONE Plunger, buddy. It's me. I have business cards.",
      'Prophecy says the Plunger unclogs Rotwell. I unclogged three toilets this morning. Prophecy fulfilled.',
      "That's a plunger on my head. It's a crown. It's both. Stop looking at it.",
      "You? The Plunger? You look like a toilet brush that gave up.",
    ],
  },
  delphine: {
    name: 'Mrs. Delphine Hobbs', title: "The Councilman's Wife", loc: 'holy_rebate', slot: 1,
    color: '#4a3a6a', hat: 'fedora', hatColor: '#8a6aaa', talkPrompt: 'Talk to Mrs. Hobbs',
    idle: [
      "My husband has been missing three weeks. The house has never been so quiet. It's awful. It's wonderful. It's awful.",
      'The last thing Harold said to me was "coo". I thought it was a cough.',
      'I put up flyers. Somebody drew a beak on every one of them.',
      'Pastor Prosper says prayer helps. Prayer is fifteen dollars an hour.',
    ],
  },
};

// Recurring-character reactions (merged onto existing CHARACTERS entries as `react`).
export const REACTS = {
  reg: reacts({
    rats: 'Running with Sal, eh? Mind the bite marks, Plunger. They fester.',
    syndicate: "Velvet suits you, Plunger. Like a cat in a sweater. Uncomfortable for everyone.",
    kingpin: (v) => (v === 'shared' ? 'Two kings in one ice cream truck. History will call it a reign. Sal\'s doctors will call it diabetes.' : 'You drowned a bacteria and took his truck. Rotwell will never forget it. Neither will the harbor.'),
    corporate: "You're Grimco now, Plunger. Do you dream in quarterly reports? Do you wake up screaming? Good. That's the soul fighting back.",
    mayor: 'The Mayor! Visiting the overpass! Shall I curtsy? I would, but my knees pop like bubble wrap.',
    escape: (v) => (v === 'alone' ? 'You opened it a crack and squeezed through. And yet here you are. Nobody ever really leaves a toilet, Plunger. They just circle.' : 'Real sun, Plunger. I wept for three days. Then I got a sunburn on my bald spot and wept for two more.'),
    hobo: '*He bows so low his crown falls off.* Your Crustiness. The barrel awaits your royal warmth.',
    lid: 'You saw the photo. Don\'t look at me like that. I was younger. I had hair. I had ethics in a jar on my desk.',
    saint: 'Your aura is so clean it\'s making the pigeons nervous.',
    sinner: "You've been naughty, Plunger. The pigeons talk. They say you stink, morally.",
    legend: 'Three doors, Plunger. Three. Nobody\'s ever opened three. There\'s a fourth thing nobody tells you about doors...',
  }),
  chad: reacts({
    corporate: "Bro. BRO. You're Grimco now? Can you get me a meeting? I'll pitch the ficus.",
    mayor: 'Mayor! Can you make the overpass an Opportunity Zone? I want the tax break. For my box.',
    hobo: 'Your Majesty! I made a royal app. It\'s a crown emoji that costs nine dollars.',
    rats: 'Yo, Sal\'s crew bought HoboCoin with stolen copper. That\'s a real use case, bro.',
    famous: "You're like, famous now. Want to be a brand ambassador? There's no money. There's exposure. To me.",
  }),
  sal: reacts({
    syndicate: 'You smell like a dog\'s perfume. Get outta my sunlight.',
    corporate: 'A suit. A SUIT. In MY gutter. I oughta bite you on principle.',
    mayor: 'Mayor! Hey Mayor! Fix the pothole outside my truck. It\'s got a family in it now.',
    escape: "You opened the sky and now my ice cream melts. You know how much I paid for this ice cream? Nothin'. I stole it. Still.",
    hobo: 'The Crust King. Respect. A man with nothin\' is a man with nothin\' to lose. Also nothin\' to steal, which is annoying.',
    rats: 'My favorite rat! Keep your nose dirty and your tail low.',
  }),
  vivienne: reacts({
    rats: 'Lord Snifferton is growling at the sewer on your shoes. He has a refined nose. And rabies.',
    syndicate: 'My darling little climber. Do remember: every rung of the ladder is a face. Try not to step on mine.',
    mayor: 'Mayor. How quaint. You know I own the parking meters? Every quarter in this city kisses my hand.',
    escape: 'You let the sun in. My velvet is FADING, darling. I will send you the bill. It will be in blood. Or velvet.',
    hobo: 'The hobo king. Ugh. Lord Snifferton, don\'t lick him, you\'ll catch something democratic.',
  }),
  grimsworth: reacts({
    rats: 'A Gutter Rat! At my tower! Security, sanitize the sidewalk he\'s standing on. And the air.',
    mayor: 'Mayor! Delighted. Grimco looks forward to a long, profitable, entirely legal relationship. *His smile files a restraining order against his eyes.*',
    escape: 'You opened the Lid. Do you have ANY idea what that did to our Q3? Our research subjects are leaving. They\'re calling it "freedom". We\'re calling our lawyers.',
    hobo: 'The Overpass Monarchy. Grimco would love to sponsor your barrel. Grimco Barrel™. Think about it.',
    lid: 'I see you remember things. How unfortunate. For your insurance premiums.',
  }),
  thorne: reacts({
    rats: 'You\'re with the Rats now. I wrote your name on the corkboard. With a little rat face. I\'m petty when I\'m disappointed.',
    syndicate: 'Velvet looks good on you. Like a body bag looks good on a body. Keep walking.',
    kingpin: 'You run the streets now. I run a corkboard. Mine\'s going to have your face on it for a long, long time.',
    corporate: 'A corner office. Congratulations. I\'m building a case. It\'s got a corner too.',
    mayor: 'Mayor. *She almost smiles.* Don\'t screw it up. I\'ve still got the corkboard.',
    escape: 'You opened the sky and half the city ran. My caseload dropped sixty percent. I don\'t know what to do with my hands.',
    hobo: 'The King of the Overpass. Your subjects keep stealing my salads. Tell them hubcaps are evidence.',
    lid: 'You found something in that bunker. I can see it on you. When you\'re ready to make it a case, I\'m here.',
    saint: 'Your file is getting thin. In Rotwell, that\'s the nicest thing I can say about anybody.',
    sinner: 'Your file is getting thick. I had to buy a second folder. I don\'t have the budget for a second folder.',
  }),
  lardner: reacts({
    kingpin: '*He salutes you with a donut.* Boss. Envelope\'s on the dash. With a bow. I like bows.',
    mayor: 'M-Mayor! I\'m a crossing guard now. Did you know children are FAST? I didn\'t know children were fast.',
    corporate: 'Executive! My door\'s always open. My wallet\'s always open. My mouth\'s always open. Mostly for donuts.',
    rats: 'Sal\'s errand boy. Your envelope\'s late, by the way. I can tell. My stomach growls.',
  }),
  fumble: reacts({
    lid: 'You went IN? Did you see the binder? Was there a chart? I love a chart. Even an evil one.',
    escape: 'The sun! The actual sun! I\'ve been looking at it all week. I can no longer see the color blue. Worth it.',
    corporate: 'Grimco owns my grant money now. Which means YOU own my grant money. Please fund the pigeon program.',
    mayor: 'Mayor! The university needs funding. The pigeon needs a doctorate. He\'s earned it.',
  }),
  pickles: reacts({
    escape: 'The bunker\'s open now. I still guard it. Out of habit. And love.',
    lid: 'You went in, didn\'t you. You got the look. Like you found out your whole life is a group project nobody\'s grading.',
    mayor: 'Mayor! Can I get a raise? Or a second lawn chair? Either. Both is greedy.',
  }),
  ooze: reacts({
    famous: 'I foresaw your triumph, darling. I also foresaw you\'d still owe me twelve dollars.',
    escape: 'The sky is open and my crystal ball is full of glare. Business is terrible. Wonderful for you, though.',
    hobo: 'A king of nothing. The cards love it. The Fool card has been crying for a week.',
    corporate: 'Your aura went from beige to a sort of... spreadsheet green. Seek help.',
    extra: (v, g) => (g.state.getFlag('pickles_married') ? 'My husband the Corporal sends his love. He also sends you a burrito. It\'s in the mail. It\'s in a sock.' : null),
  }),
  brock: reacts({
    extra: (v, g) => (g.quests.isDone('side_brock') ? ['You beat me once. I think about it every day. Mostly in the shower. Crying. *flex*', '*flex* That one\'s for you. *flex* That one\'s for my therapist.'] : null),
    famous: 'You\'re famous now! Can I get a picture? I\'ll flex. I\'ll be flexing either way.',
  }),
  hank: reacts({
    extra: (v, g) => (g.state.getFlag('meat_whistle') ? 'Sneakers and sadness. I tell everybody. Nobody stops eating it. That\'s Rotwell.' : g.quests.isDone('side_meat') ? 'Just pork, you said. *He narrows his eyes.* Funny. My Meat Loaf sandwich tied its own shoelace today.' : null),
    corporate: 'Boss. Grimco boss. You gonna tell me what\'s in the Meat Loaf now? ...No? Didn\'t think so.',
  }),
  trashcanzo: reacts({
    kingpin: 'The family respects a king of the gutter. The gutter is where the best garbage collects.',
    corporate: 'You work for the big trash now. The family is... disappointed. *A raccoon in sunglasses slowly shakes its head.*',
    hobo: 'King of the Crust. Brother in garbage. The family kneels. Carefully. The family has bad knees.',
  }),
  gus: reacts({
    mayor: 'Mayor! The health inspector came by. I gave him the usual. He\'s still in the bathroom.',
    hobo: 'Your Crustiness! For you, the usual is free. Nobody knows what it is. It\'s still free.',
    famous: 'You\'re on the Wall of Gut now. Also the Wall of Fame. They\'re the same wall. It\'s greasy.',
  }),
  larry: reacts({
    kingpin: 'Boss! Everything in the shop is yours. Except that. And that. Okay, that\'s yours.',
    corporate: 'A Grimco big shot in MY shop! Want a lucky rabbit\'s foot? For the board meeting?',
    famous: 'I got a guy selling your autograph for twenty bucks. It\'s not your autograph. I\'ll cut you in.',
  }),
  pete: reacts({
    lid: 'That keycard I zapped... you used it, didn\'t you. Don\'t tell me what you saw. I got enough nightmares about blue barrels.',
    escape: 'Sun\'s out. My junk\'s rusting faster. That\'s progress, I guess.',
  }),
  martha: reacts({
    kingpin: 'Street king, huh. Debra says you can ride on her street. Once. Don\'t scratch her.',
    famous: 'Heard you made a name for yourself. Out here we only remember names on tombstones and race trophies.',
  }),
  prosper: reacts({
    mayor: 'Mayor! The Church of the Holy Rebate supports you. Our support is tax-deductible. For us.',
    corporate: 'An executive! Have you considered a Platinum Soul membership? It comes with a lanyard.',
    saint: 'You\'re so good it\'s bad for business. Nobody needs a rebate on a clean soul.',
    sinner: 'Child! Your sins! I can see them from here! *He licks his lips.* Let\'s talk pricing.',
  }),
  dolores: reacts({
    kingpin: 'Golden Gutter, they call it now. The tips are worse. The ashtrays are bigger. I\'ll allow it.',
    corporate: 'You took the Contessa\'s chair. Do me a favor: burn the velvet. I\'ll bring the lighter. I have nine.',
  }),
  mopsy: reacts({
    corporate: 'Boss! I mopped your name into the lobby floor. In bleach. It\'ll be there forever. Or until the floor dissolves.',
    escape: 'The bunker\'s open, so I don\'t clean it no more. Grimco gave me a new assignment: cleaning the SUN. I don\'t know how.',
  }),
  krupnik: reacts({
    famous: 'Room Six is famous now. I charge tours. Five dollars to see where you puked.',
    mayor: 'The Mayor stayed in Room Six! I\'m putting up a plaque. And raising the rent.',
    extra: (v, g) => (g.quests.isDone('side_roach') ? 'Duchess sends her love. And her four hundred grandchildren. They\'re in the walls. They love you.' : null),
  }),
};

export const NEW_ITEMS = {
  q_roach: { name: 'Duchess Crunchington (in a Matchbox)', desc: 'Champion racing roach. Hisses at strangers. Hisses at you, lovingly.' },
  q_roach_trophy: { name: 'Golden Roach Trophy', desc: 'A roach dipped in gold paint. It was alive when they painted it. It is fine. It is thriving.' },
  q_review: { name: "Remy's Review (Draft)", desc: 'A napkin covered in tiny angry handwriting and one grease thumbprint.' },
  q_still_parts: { name: 'Busted Moonshine Still', desc: 'Copper coils, a pressure gauge stuck on "YES", and a smell that removes eyebrows.' },
  q_still: { name: "Grandma Ethel's Still", desc: 'Fixed. Purring. Possibly sentient. Definitely flammable.' },
  q_ballots: { name: 'Crate of Soggy Ballots', desc: 'Eleven elections. Every one says the same thing: NOT SWINDELL.' },
  q_cake: { name: '"Anniversary" Cake', desc: 'A Greasy Spoon cake with a little something extra baked in. Heavier than a cake should be.' },
  q_ski_mask: { name: 'Professional Ski Mask', desc: 'Lucky Larry swears it has only been worn by successful criminals. It has a pom-pom.' },
  q_piano: { name: 'Grand Piano (Strapped to Your Roof)', desc: 'Belongs to Grimsworth Manor. Plays a chord every time you hit a pothole.' },
  q_plunger_card: { name: "Chet's Business Card", desc: '"CHET PLUNGERTON — THE PLUNGER™ — A GRIMCO HERO SOLUTION". Printed on Grimco letterhead.' },
  q_ring: { name: 'Wedding Ring', desc: 'For Corporal Pickles and Madame Ooze. Engraved: "U R MY BUNKER".' },
  q_chairman: { name: "The Chairman's Minutes", desc: 'Pages from Grimco board meetings. Every vote: "THE CHAIRMAN VOTES YES." The signature is a leaf.' },
  q_golden_plunger: { name: 'The Golden Plunger', desc: 'Proof you unclogged Rotwell. Three times. Heavy, gleaming, and still slightly damp.' },
  q_key_city: { name: 'Key to the City', desc: 'Opens nothing. Gladys charged you $40 to engrave it. Worth it.' },
};
