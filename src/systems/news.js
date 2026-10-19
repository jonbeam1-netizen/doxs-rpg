// The Rotwell Rag: a daily newspaper with a crude headline, local news, market hints, horoscope.
// Printed on 'time:day' (after the market update), announced with a toast each morning.
// state.p.sys.news = { day, headline, stories:[{h, b}], announced }
// game.sysNews = { open(), announce(force), daily() }
import { DRUGS } from '../data/drugs.js';
import { DISTRICTS } from '../data/locations.js';
import { pick, chance, fmtMoney, randInt } from '../core/util.js';
import { LADDER } from './fightclub.js';

const NAMES = ['Gary Pusswell', 'Doreen Flapjack', 'Mayor Phil Grubbs', 'Councilman Dick Wiggins', 'Brenda Scabbs', 'Earl "Two Teeth" Mudd', 'Pastor Rick', 'Mr. Grimsby', 'Chef Lardo', 'a man named Steve'];
const LOCAL = [
  ['{name} ARRESTED FOR PUNCHING A SWAN', '"It looked at me funny," says {name}. The swan declined to comment. The swan has a lawyer.'],
  ['MAYOR CUTS RIBBON ON NEW POTHOLE', 'The pothole, now the largest in the county, has its own ZIP code and a small population of ducks.'],
  ['MEAT PLANT DENIES "IT\'S PEOPLE"', 'Rotwell Meat & Rendering issued a statement: "It is mostly not people." Sales are up 12%.'],
  ['LOCAL MAN STUCK IN PORTA-POTTY FOR THREE DAYS', '"I\'ve made peace with it," he told reporters through the vent. Firefighters say "tomorrow, maybe".'],
  ['RACCOON ELECTED TO SCHOOL BOARD', 'The raccoon, running unopposed, has already eaten two budget proposals. Experts call it "an improvement".'],
  ['GRIMCO ANNOUNCES LAYOFFS, RECORD PROFITS, IN SAME SENTENCE', 'CEO Mr. Grimsby celebrated by buying a third yacht to park inside his second yacht.'],
  ['{name} WINS HOT DOG EATING CONTEST, LOSES EVERYTHING ELSE', '83 dogs in 10 minutes. Doctors describe {name}\'s condition as "a sausage casing with a face".'],
  ['CITY COUNCIL VOTES TO RENAME GUTTERSIDE "LUXURY SOUTH"', 'Rents doubled overnight. Nothing else changed. A man is still on fire on 5th Street. He\'s fine.'],
  ['PIGEON GANG WAR ESCALATES DOWNTOWN', 'Witnesses describe "coordinated pooping". Police have no leads, only stains.'],
  ['CHURCH OF THE HOLY REBATE LAUNCHES "SIN NOW, PAY LATER" PLAN', 'Pastor Rick: "Jesus forgives. Our financing department forgives at 24.9% APR."'],
  ['LOCAL MOTEL VOTED "MOST LIKELY TO GIVE YOU SOMETHING"', 'The Roach Motel accepted the award. The award was immediately eaten by roaches.'],
  ['MAN MARRIES HIS CAR; CAR FILES FOR DIVORCE', 'The 1987 sedan cited "irreconcilable differences" and "he keeps putting things in my glove box".'],
  ['TRAFFIC JAM ENTERS ITS FOURTH WEEK', 'Commuters have formed a small society on the I-9. They have a mayor now. He is better than ours.'],
  ['{name} CAUGHT LICKING CASINO SLOT MACHINE', '"For luck," said {name}. The Golden Tooth has since installed a sign reading "NO LICKING THE MACHINES (AGAIN)".'],
];
const WEATHER = ['Smog with a chance of more smog.', 'Acid drizzle. Bring an umbrella you don\'t love.', 'Hot. Humid. Smells like the meat plant. Wind from the east (sorry).', 'Overcast and depressed, like everyone.', 'A brief sunny spell around noon. Nobody will believe it.'];
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const HOROSCOPE = ['Today you will find money on the ground. It\'s wet. Take it anyway.', 'Avoid men with mustaches. Especially singing ones.', 'A stranger will offer you a burrito. Decline. DECLINE.', 'Your lucky number is 7. Your unlucky number is all the other ones.', 'Love is in the air. So is sewage. Mostly sewage.', 'Lift something heavy today. Then put it down. That\'s it. That\'s the horoscope.', 'The stars say: buy low, sell high. The stars are not financial advisors.'];
const CLASSIFIEDS = ['FOR SALE: Haunted futon. Ghost not included (he left). $40 OBO.', 'LOST: My dignity. Last seen at the Rusty Nail karaoke night. Reward.', 'WANTED: Roommate. Must love cats, hate cops, and tolerate a man named Moose.', 'FREE: Used mattress. Only slightly stabbed.', 'MISSED CONNECTION: You were eating a roller dog at Gas-N-Gulp. I was the roller dog. Call me.'];

export function installNews(game) {
  const st = game.state;

  function fill(s, upper = false) { const n = pick(NAMES); return s.replace(/\{name\}/g, upper ? n.toUpperCase() : n); }

  function daily() {
    const p = st.p;
    const m = game.market;
    const ev = m?.todayEvent?.();
    const stories = [];
    let headline;
    if (ev) {
      headline = ev.headline;
      const where = ev.district ? DISTRICTS[ev.district]?.name : 'citywide';
      stories.push({ h: 'CRIME BEAT', b: `${ev.mult > 1 ? 'Police are celebrating a "major blow" to the supply of' : 'Sources report a sudden flood of'} ${DRUGS[ev.drug]?.name} (${where}). Street prices are expected to ${ev.mult > 1 ? 'SKYROCKET' : 'CRATER'} for the next ${ev.days} day${ev.days > 1 ? 's' : ''}. "Just say no," says the police chief, eating a confiscated brownie.` });
    } else {
      const [h, b] = pick(LOCAL);
      headline = fill(h, true);
      stories.push({ h: 'LOCAL', b: fill(b) });
    }
    const [h2, b2] = pick(LOCAL);
    stories.push({ h: fill(h2, true), b: fill(b2) });
    if (m) stories.push({ h: 'MARKET WATCH (ALLEGEDLY)', b: `An anonymous source who smells like cigarettes tells the Rag: "${m.rumor(0.9)}"` });
    // personal / player flavored stories
    const champ = p.flags?.pit_champion;
    stories.push({ h: 'SPORTS', b: champ ? `A scrawny stick figure named ${p.name} remains Champion of The Pit. Big Mother has reportedly taken up knitting. Angrily.` : `${LADDER[LADDER.length - 1].name} remains undefeated at The Pit. Challengers are advised to update their wills.` });
    if ((p.totals?.drugsSold || 0) > 200 && chance(0.5)) stories.push({ h: 'POLICE SEEK "STICK-THIN" DEALER', b: 'Witnesses describe the suspect as "about two lines thick" and "always carrying a suspicious fanny pack".' });
    if (p.karma >= 50 && chance(0.4)) stories.push({ h: 'LOCAL SAINT SPOTTED', b: `Residents report a "weirdly nice" stick figure helping at the soup kitchen. Pastor Rick has trademarked them.` });
    stories.push({ h: 'WEATHER', b: pick(WEATHER) });
    stories.push({ h: 'HOROSCOPE', b: `<b>${pick(SIGNS)}:</b> ${pick(HOROSCOPE)}` });
    stories.push({ h: 'CLASSIFIEDS', b: pick(CLASSIFIEDS) });
    p.sys.news = { day: game.time.day, headline, stories, announced: false };
  }

  function announce(force = false) {
    const p = st.p;
    const n = p.sys?.news;
    if (!n || n.day !== game.time.day || n.announced) return;
    if (!force && game.time.hour < 6) return;
    n.announced = true;
    game.ui.toast(`📰 <b>THE ROTWELL RAG:</b> ${n.headline}`, 'info', 7000);
    if (p.sys.lastInterest) { game.ui.toast(`🏦 Bank interest: +${fmtMoney(p.sys.lastInterest)}`, 'money', 4000); p.sys.lastInterest = 0; }
  }

  function open() {
    const p = st.p;
    if (!p.sys.news || p.sys.news.day !== game.time.day) daily();
    const n = p.sys.news;
    const body = `<div class="sys-news"><div class="mast">THE ROTWELL RAG</div>
      <div class="sys-hint" style="text-align:center;font-family:var(--font-body)">Day ${n.day} · ${randInt(1, 3) === 1 ? '"All The News That\'s Fit To Wipe With"' : '"Rotwell\'s Only Newspaper, Unfortunately"'} · 25¢ (you didn't pay)</div>
      <h2 style="margin-top:10px">${n.headline}</h2>
      ${n.stories.map((s) => `<p><b>${s.h}</b> — ${s.b}</p>`).join('')}</div>`;
    game.ui.openPanel({ title: '', body, width: 640 });
  }

  game.bus.on('time:hour', ({ hour }) => { if (game.started && hour >= 6 && hour <= 11) announce(); });

  const api = { daily, announce, open };
  game.sysNews = api;
  return api;
}
