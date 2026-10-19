// Name generators and NPC-module-local flavor text (fallbacks for kinds the
// shared barks.js doesn't cover yet). All original.
import { pick } from '../core/util.js';
import * as Barks from '../data/barks.js';

const FIRST = ['Gary', 'Darlene', 'Ricky', 'Bev', 'Clint', 'Tammy', 'Dwayne', 'Lorraine', 'Earl', 'Crystal', 'Vince', 'Brenda',
  'Duane', 'Sheila', 'Lyle', 'Marcy', 'Floyd', 'Rhonda', 'Kurt', 'Wanda', 'Gus', 'Nadine', 'Boyd', 'Trish', 'Merle', 'Deb',
  'Chet', 'Patsy', 'Hank', 'Cookie', 'Dale', 'Peg', 'Lonnie', 'Fern', 'Rusty', 'Jolene', 'Skip', 'Velma', 'Butch', 'Glenda'];
const LAST = ['Puddlesworth', 'McGriddle', 'Stinkman', 'Crumb', 'Bologna', 'Grubb', 'Whiffle', 'Dregs', 'Sludgeford', 'Moist',
  'Dumpsterton', 'Pickles', 'Butts', 'Gristle', 'Smegg', 'Skidmore', 'Wartley', 'Fumbles', 'Lardner', 'Scabbard', 'Gunkel',
  'Ratchet', 'Mildew', 'Pustule', 'Grimes', 'Sweatman', 'Noodle', 'Crustacean', 'Loinbottom', 'Bunion'];
const THUG_NICK = ['Knuckles', 'Two-Teeth', 'Shivvy', 'Big Lenny', 'Lil Stabs', 'Meatball', 'Skidmark', 'Brick', 'Spud',
  'Jawbreaker', 'Ketchup', 'Tuna', 'Mugsy', 'The Dentist', 'Crowbar Carl', 'Nosebleed', 'Pothole', 'Gravy'];
const SNOB_FIRST = ['Chadwick', 'Penelope', 'Thurston', 'Bunny', 'Winslow', 'Muffy', 'Sterling', 'Caroline', 'Bartholomew', 'Tinsley'];
const SNOB_LAST = ['Moneybags III', 'Van Snootington', 'Trustfund', 'Goldsworth', 'Pemberton-Smug', 'Yachtley', 'Highbrow'];
const BIKER = ['Diesel', 'Gravel Gertie', 'Tank', 'Road Rash', 'Grizz', 'Mad Dog Doug', 'Chrome Dome', 'Exhaust', 'Big Tina', 'Spark Plug'];
const HOBO = ['Pigeon Pete', 'Cardboard Kenny', 'Mumbles', 'Sir Trashalot', 'Captain Gutter', 'Old Socks', 'Doc Drainpipe', 'Gutterball Gail'];
const DRUNK = ['Sloshy Steve', 'Hiccup Harold', 'Barstool Barb', 'Tipsy Tom', 'Wobbly Walt', 'Last-Call Lou'];
const FIGHTER = ['The Meat Grinder', 'Knuckle Sandwich', 'Iron Gut Ivan', 'Bonecrusher Betty', 'Lil Concussion', 'The Plumber',
  'Kid Gingivitis', 'Big Mama Haymaker', 'The Unwashed', 'Professor Pain', 'Sweaty Pete', 'The Accountant'];
const COP = ['Officer', 'Sgt.', 'Deputy', 'Det.'];

export function genName(role) {
  switch (role) {
    case 'thug': return `${pick(THUG_NICK)}`;
    case 'gang': return `${pick(THUG_NICK)} ${pick(LAST)}`;
    case 'biker': return pick(BIKER);
    case 'snob': return `${pick(SNOB_FIRST)} ${pick(SNOB_LAST)}`;
    case 'hobo': return pick(HOBO);
    case 'drunk': return pick(DRUNK);
    case 'fighter': return pick(FIGHTER);
    case 'cop': return `${pick(COP)} ${pick(LAST)}`;
    case 'swat': return `SWAT ${pick(['Unit', 'Grunt', 'Bulldozer', 'Hammer'])} ${Math.floor(Math.random() * 90 + 10)}`;
    default: return `${pick(FIRST)} ${pick(LAST)}`;
  }
}

// Local fallback lines per role, used when barks.js has nothing for that kind.
export const LINES = {
  ped: ["Don't make eye contact with me. I'm on a cleanse.", 'I have exact change and zero patience.', 'Whatever you\'re selling, I already caught it.'],
  worker: ['Twelve-hour shift at the rendering plant. I can taste the smell.', "My foreman calls me 'hey you'. It's on my paycheck.", 'Union meeting tonight. Free stale donuts.'],
  snob: ['Ew. Are you... from below the hill?', "Daddy says people like you are a 'tax write-off'.", 'Please stand downwind of me.'],
  shady: ['Psst. You wanna buy a watch? Very real. Extremely real. Do not get it wet.', 'I got stuff. Stuff that fell off a truck. The truck is also for sale.'],
  thug: ['Nice face. Shame if someone rearranged it.', 'You lost, stick boy?', 'This is a toll sidewalk.'],
  gang: ['Wrong block, chief.', "You're standin' on our turf. Our turf has feelings.", 'Keep walkin\' before you start limpin\'.'],
  biker: ['My bike is louder than your whole personality.', 'I eat gravel for breakfast. Then I eat breakfast.'],
  hobo: ['The pigeons know things, man. THE PIGEONS KNOW.', 'Spare change? Spare a kidney? I take both.'],
  drunk: ["I'm not drunk, YOU'RE drunk. ...wait, which one of you said that?", 'I love you, man. I hate you. Wanna fight? I love you.'],
  cop: ["Move along, citizen. Or don't. I get paid either way.", 'I smell crime. Or that\'s my lunch.'],
  dealer: ["Psst. You lookin'? I got the good stuff. And also the bad stuff. Mostly the bad stuff."],
  fighter: ['I\'m gonna fold you like a lawn chair.', 'Your mama hits harder. I know. I fought her.'],
};

export function line(role, kind) {
  try {
    const B = Barks.BARKS;
    if (B && B[role]) return Barks.bark(role);
    if (LINES[role]) return pick(LINES[role]);
    if (B && B[kind]) return Barks.bark(kind);
    if (typeof Barks.bark === 'function') return Barks.bark(kind);
  } catch { /* fall through */ }
  return pick(LINES[role] || LINES[kind] || LINES.ped);
}

export const WARNINGS = [
  'Nice shoes. Gimme.', 'Wallet. Now. Or I start practicing dentistry.', "Hey! You! You look like you owe me money.",
  'Ooh, a tourist. I love tourists. They squish.', "Hold still, I'm gonna borrow your face.", 'Empty your pockets, Twiggy.',
];
export const TAUNTS = [
  'Come here, ya bendy straw!', 'I\'mma fold you like a cheap lawn chair!', 'Your mama fights better and she\'s a lamp!',
  'Stay still so I can hit you!', 'Ow! Okay, that one was fair.', 'I\'ve been hit harder by my therapist!',
];
export const HURT = ['OW!', 'My spleen!', 'Not the face!', 'Ugh!', 'I felt that in my wallet!', 'MOMMY!', 'Oof!', 'Ack!'];
export const FLEE = ['I got kids! Well, a ferret!', 'NOPE.', 'I\'m calling my lawyer! He\'s also my cousin!', 'Truce! TRUCE!', 'This ain\'t worth minimum wage!'];
export const COP_YELL = ['STOP RESISTING!', 'Freeze, dirtbag!', 'Taste the law!', 'Hands where I can see \'em!', 'Get on the ground! The dirty ground!'];
export const DEATH_SUBS = [
  'You died. The city didn\'t even notice.', 'Turns out you\'re not bulletproof. Weird.', 'Flatlined like your credit score.',
  'Somebody\'s gonna steal your shoes.', 'The pigeons are already arguing over you.', 'Your last words were "hold my beer".',
];
export const KO_SUBS = ['You wake up in a puddle. Hopefully water.', 'Someone drew a mustache on you.', 'Your wallet feels lighter. So does your dignity.'];
export const RUMORS = [
  'They say the meat plant\'s "mystery loaf" has a pulse. Don\'t eat Tuesdays.',
  'There\'s a bunker out in the Dustbowl. Guys go in. Guys come out... weirder.',
  'Casino up on the hill rigs the slots. And the toilets. Don\'t ask how.',
  'Gutter Rats run Gutterside. The Syndicate runs everything else. The rats don\'t know yet.',
  'Cops at Rotwell PD will "lose" your file if you make it worth their while.',
  'The Pit in the Rustyards pays cash for broken noses. Yours or theirs.',
  'A guy under the overpass says he\'s the rightful mayor. Honestly? He\'d be better.',
  'Bikers at the Dirty Spur hate three things: cops, cars, and salad.',
  'If you sleep at the Roach Motel, check your shoes. Check them TWICE.',
  'Dealers move product in every district. Prices swing like a drunk at last call.',
];
export const INSULTS = [
  'Your face looks like a dropped lasagna.', 'You smell like a wet ashtray\'s diary.', 'Nice outfit. Did a raccoon pick it?',
  'You\'re the human version of a participation trophy.', 'I\'ve seen better posture on a sack of laundry.', 'Your mom gives great directions. To my house.',
];
export const COMEBACKS = ['Oh yeah? Well... YOUR face!', '...I\'m telling my mom.', 'Wow. Okay. Wow.', 'That\'s it. Square up.', 'I\'m gonna cry later about this.'];
