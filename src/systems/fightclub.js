// The Pit (type 'fight_club'): an underground ranked ladder with purses, plus betting on other fights.
// state.p.sys.pitRank = number of ladder fighters beaten.
import { fmtMoney, pick, chance, rand, randInt, clamp } from '../core/util.js';
import { today, brawlSpot } from './common.js';
import { placeMenu, say, choose } from './ui-kit.js';

export const LADDER = [
  { name: 'Wet Willy', str: 8, purse: 60, bio: 'Fights exclusively with wet willies. It\'s gross. It works.' },
  { name: 'Tiny Tina', str: 16, purse: 120, bio: 'Six-foot-eight. Named ironically. Hits unironically.' },
  { name: 'Knuckles McGee', str: 26, purse: 250, bio: 'Has knuckle tattoos that say "KNUC KLES". Not great at spelling. Great at punching.' },
  { name: 'The Dentist', str: 38, purse: 500, bio: 'Collects teeth. Yours are next. Has a little bag for them.' },
  { name: 'Sister Mercy', str: 52, purse: 900, bio: 'Ex-nun. Excommunicated for "excessive smiting". Shows none.' },
  { name: 'Gravy Train', str: 68, purse: 1700, bio: '400 pounds of meat-plant muscle. Smells like gravy. Hits like a train.' },
  { name: 'Johnny Two-Necks', str: 88, purse: 3200, bio: 'Has two necks. Nobody knows how. Twice as hard to choke.' },
  { name: 'El Colostomo', str: 112, purse: 6000, bio: 'Masked luchador. Has a colostomy bag. Uses it as a weapon. You\'ve been warned.' },
  { name: 'The Accountant', str: 140, purse: 12000, bio: 'Mild-mannered CPA by day. Breaks bones by night. Itemizes your injuries.' },
  { name: 'BIG MOTHER', str: 180, purse: 30000, bio: 'The undefeated champion of The Pit. Nobody has seen her lose. Nobody who\'s seen her lose has been seen again.' },
];

const BET_FIGHTERS = ['Meat Locker', 'Dirty Dan', 'Kid Concussion', 'The Plumber', 'Steve', 'Raging Bull (a guy named Bull)', 'Granny Smash', 'The Intern', 'Lefty Loosey', 'Captain Crunch(es)', 'Slippery Pete', 'Mr. Elbows', 'Big Toe Tony', 'Baby Face Barry'];

export function installFightClub(game) {
  const st = game.state;
  const sfx = (n) => game.sysSfx?.play(n);
  const tierOf = (i) => Math.min(7, Math.floor(i * 0.75));

  async function fight(loc, i, exhibition = false) {
    const p = st.p;
    const f = LADDER[i];
    const purse = exhibition ? Math.round(f.purse * 0.35) : f.purse;
    if (p.hp < p.maxHp * 0.4) return say(game, 'The Pit', 'Screamin\' Steve looks at you: "You\'re already half dead! Come back when you\'re only a quarter dead!"', "Screamin' Steve");
    if (p.energy < 15) return say(game, 'The Pit', '"You look tired, pal. Sleep. Then come get punched."', "Screamin' Steve");
    const ans = await game.ui.dialog({
      title: `${exhibition ? 'Exhibition' : 'Ladder'} fight: ${f.name}`, speaker: "Screamin' Steve",
      html: `"IN THIS CORNER... weighing in at WHO CARES... ${f.name.toUpperCase()}!"<br><br><em>${f.bio}</em><br><br>Their STR ~${f.str}. Yours: ${Math.floor(p.str)}. Purse: <b>${fmtMoney(purse)}</b>. Loser pays nothing but blood.`,
      options: [{ label: 'Step into the Pit' }, { label: 'Chicken out' }],
    });
    if (ans !== 0) return;
    st.addStat('energy', -15);
    const onWin = () => {
      st.addMoney(purse, 'pit');
      st.addXP(20 + i * 15);
      if (!exhibition) p.sys.pitRank = Math.max(p.sys.pitRank, i + 1);
      st.changed('pit');
      sfx('win');
      if (!exhibition && i === LADDER.length - 1) {
        st.setFlag('pit_champion', true);
        game.ui.bigText('CHAMPION OF THE PIT', 'Big Mother is down. The crowd throws money. And chairs.', 4000);
      } else game.ui.toast(`You beat ${f.name}! Purse: ${fmtMoney(purse)}. ${exhibition ? '' : `Pit rank ${p.sys.pitRank}/${LADDER.length}.`}`, 'money', 4500);
    };
    const onLose = () => {
      game.ui.toast(pick([`${f.name} folds you like a lawn chair. The crowd boos. You hear it from the floor.`, `You wake up under the bleachers. ${f.name} took your shoes as a trophy.`]), 'bad', 4500);
    };
    game.ui.closeAll();
    if (game.combat?.startBrawl) {
      const spot = brawlSpot(game, loc);
      game.combat.startBrawl({ x: spot.x, z: spot.z, count: 1, kind: 'fighter', tier: tierOf(i), label: `The Pit: ${f.name}`, onWin, onLose });
      return 'leave';
    }
    // fallback stat roll
    const c = clamp(p.str / (p.str + f.str) + (p.hp / p.maxHp - 0.7) * 0.2, 0.05, 0.95);
    const won = chance(c);
    sfx('punch');
    st.damage(won ? randInt(10, 30) : randInt(30, 55), 'pit');
    if (won) { p.totals.fightsWon++; onWin(); } else { p.totals.fightsLost++; onLose(); }
    return 'leave';
  }

  async function betOnFight() {
    const p = st.p;
    const t = today(game);
    t.pitBets = (t.pitBets || 0) + 1;
    const a = pick(BET_FIGHTERS);
    let b = pick(BET_FIGHTERS);
    while (b === a) b = pick(BET_FIGHTERS);
    const pa = rand(30, 120), pb = rand(30, 120);
    const probA = pa / (pa + pb);
    const oddsA = Math.max(1.05, (1 / probA) * 0.9), oddsB = Math.max(1.05, (1 / (1 - probA)) * 0.9);
    const side = await choose(game, {
      title: 'Dirty Dave\'s Book', speaker: 'Dirty Dave',
      html: `Dirty Dave licks his pencil. "Next bout: <b>${a}</b> vs <b>${b}</b>. Pick your poison."`,
      choices: [{ label: a, hint: `pays ${oddsA.toFixed(2)}×`, value: 'a' }, { label: b, hint: `pays ${oddsB.toFixed(2)}×`, value: 'b' }],
    });
    if (!side) return;
    const max = Math.min(p.money, 5000 + p.sys.pitRank * 2000);
    if (max < 5) return say(game, 'Dirty Dave', '"No money, no honey. Scram."', 'Dirty Dave');
    const bet = await game.ui.promptNumber({ title: 'Bet how much?', text: `Max ${fmtMoney(max)}.`, max, min: 5, initial: Math.min(50, max) });
    if (!bet || bet > p.money) return;
    st.addMoney(-bet, 'pit bet');
    game.time.advance(20);
    const aWins = chance(probA);
    const winner = aWins ? a : b, loser = aWins ? b : a;
    const pbp = [
      `${a} opens with a haymaker. ${b} eats it like a sandwich.`,
      `${pick([a, b])} bites an ear. The ref (a drunk guy named Ref) allows it.`,
      `${pick([a, b])} throws a chair. Then a smaller chair. Then a stool.`,
      `${loser} slips on a tooth. Possibly their own.`,
      `${winner} lands a flying elbow from the top of a vending machine. ${loser} is DOWN.`,
    ];
    const won = (side === 'a') === aWins;
    const pay = won ? Math.floor(bet * (side === 'a' ? oddsA : oddsB)) : 0;
    if (pay) { st.addMoney(pay, 'pit bet'); sfx('win'); } else sfx('lose');
    game.bus.emit('casino:result', { game: 'pit_bet', amount: pay - bet });
    return say(game, 'Fight!', `${pbp.join('<br>')}<br><br><b>${winner} wins!</b> ${won ? `<span class="ui-good">You collect ${fmtMoney(pay)}.</span> Dirty Dave pays you in wrinkled fives that smell like feet.` : `<span class="ui-bad">You lose ${fmtMoney(bet)}.</span> Dirty Dave tucks your money into his sock.`}`);
  }

  game.locations.register('fight_club', (g, loc) => placeMenu(g, loc, {
    hours: [20, 5],
    speaker: "Screamin' Steve",
    closed: () => 'The Pit is just a basement under a shipping warehouse. During the day it\'s a "yoga studio". A sign says "NAMASTE (OUT OF HERE) — FIGHTS AT 8PM".',
    text: () => {
      const p = st.p;
      const rank = p.sys.pitRank;
      const next = LADDER[rank];
      let ladder = '<div style="margin-top:8px">';
      LADDER.forEach((f, i) => {
        ladder += `<div class="sys-fighter ${i < rank ? 'beaten' : i === rank ? 'next' : ''}"><span>${i + 1}. ${f.name}</span><span class="sys-hint">STR ~${f.str} · ${fmtMoney(f.purse)}</span></div>`;
      });
      ladder += '</div>';
      return `${pick([
        'A basement packed with screaming dockworkers, bookies and one confused tourist. The ring is a kiddie pool filled with sawdust and regret.',
        'The first rule of The Pit: you DO talk about The Pit. Constantly. It\'s great marketing.',
        'Screamin\' Steve, the announcer, has screamed so much he has no voice left. He screams anyway. Silently.',
      ])}<br><br>${next ? `Next on the ladder: <b>${next.name}</b>.` : '<b class="ui-good">You are the Champion of The Pit.</b> People buy you drinks. People fear you. Your mom still doesn\'t call.'}${ladder}`;
    },
    options: () => {
      const p = st.p;
      const t = today(g);
      const rank = p.sys.pitRank;
      const out = [];
      if (rank < LADDER.length) out.push({ label: `Fight ${LADDER[rank].name}`, hint: `purse ${fmtMoney(LADDER[rank].purse)}`, run: () => fight(loc, rank) });
      if (rank > 0) out.push({ label: 'Exhibition rematch', hint: t.exhibition ? 'once a night' : `vs ${LADDER[rank - 1].name} · smaller purse`, disabled: !!t.exhibition, run: () => { t.exhibition = true; return fight(loc, rank - 1, true); } });
      out.push({ label: 'Bet on a fight', hint: 'Dirty Dave\'s book', run: betOnFight });
      out.push({ label: 'Buy a round for the crowd', hint: '$100 · +CHA/-karma?', run: () => { if (st.spend(100)) { st.addStat('cha', 0.5, 'pit'); g.sysFx.addDrunk(1); return say(g, 'The Pit', 'You buy a round. The crowd chants your name. Then they fight over the beer. A man loses an eyebrow.'); } } });
      return out;
    },
  }));

  return { LADDER };
}
