// Bars (The Rusty Nail, The Dirty Spur) and Club Velvet.
// Drinks, gossip (price hints, quest hints, the gun shop backroom password), arm wrestling (mash),
// darts / quarters (timing), bar fights (combat.startBrawl, stat-roll fallback), dancing, VIP.
import { fmtMoney, pick, chance, rand, randInt, clamp } from '../core/util.js';
import { today, train, byTime, activity, brawlSpot } from './common.js';
import { placeMenu, say, choose, gamePanel, betInput, shopPanel } from './ui-kit.js';
import { gainMult } from './minigame.js';

const BARS = {
  rusty_nail: {
    keeper: 'One-Eyed Sal', special: ['The Tetanus Shot', 12, 2.5, 'Whiskey, motor oil (allegedly a joke), and a rusty nail for garnish. Do not eat the garnish.'],
    wrestlers: [['Skinny Pete', 8, 'a guy whose arms are basically two straws'], ['Dockworker Dan', 25, 'smells like fish and confidence'], ['Hairy Mary', 45, 'has a beard more impressive than yours'], ['The Forklift', 75, 'has never lost. Has never blinked.']],
    game: 'darts', fightCount: [1, 2], fightTier: 0,
    text: {
      morning: 'The Rusty Nail at noon: three regulars who never left, sitting in the exact same spots as yesterday. One might be dead. Sal checks him with a broom.',
      day: 'Sal polishes a glass with a rag dirtier than the glass. The jukebox plays the same Skynyrd song for the ninth time.',
      evening: 'After-work crowd. Office drones loosen their ties and their morals. Someone is crying at the end of the bar. Someone is always crying at the end of the bar.',
      night: 'The Rusty Nail at 1AM: pool cues, bad decisions, and a karaoke machine somebody should have shot years ago.',
    },
  },
  dirty_spur: {
    keeper: 'Big Bertha', special: ['Gasoline & Gravel', 14, 3.2, 'Bertha mixes it in a hubcap. It\'s on fire. You\'re supposed to drink it on fire.'],
    wrestlers: [['Tiny', 40, 'is not tiny. Tiny is enormous.'], ['Grease', 70, 'has a tattoo of himself arm wrestling'], ['Mama Bear', 110, 'runs the biker gang. Has killed a man with her forearm (rumor)'], ['Big Bertha', 150, 'the bartender. She puts down her rag. Uh oh.']],
    game: 'quarters', fightCount: [2, 3], fightTier: 1,
    text: {
      morning: 'The Dirty Spur barely opened. Bertha is sweeping up teeth from last night. "Some of these are mine," she says.',
      day: 'Motorcycles out front. A biker named Skull is reading a romance novel at the bar. Nobody makes fun of him. Nobody would dare.',
      evening: 'The bikers roll in. Leather creaks. Someone puts a quarter in the jukebox and it plays a song about a truck that is also a woman.',
      night: 'Smoke, sweat, and a bar fight brewing in the corner like a pot of chili. The bathroom door says "ABANDON HOPE".',
    },
  },
};

export function installNightlife(game) {
  const st = game.state;
  const sfx = (n) => game.sysSfx?.play(n);

  function drink(name, price, drunk, desc) {
    if (!st.spend(price, 'bar')) return;
    sfx('gulp');
    game.sysFx.addDrunk(drunk);
    if (chance(0.15)) st.addStat('cha', 0.2, 'liquid courage');
    game.time.advance(20);
    return say(game, name, desc);
  }

  // ---------------- gossip ----------------
  function gossip(locId, keeper) {
    const p = st.p;
    const t = today(game);
    t.gossip = (t.gossip || 0) + 1;
    game.time.advance(20);
    const bits = [];
    if (game.market) bits.push(`"${game.market.rumor(0.85)}"`);
    if (!p.flags.backroom_pw && chance(locId === 'dirty_spur' ? 0.35 : 0.2)) {
      st.setFlag('backroom_pw', true);
      bits.push('Leaning in: "You want real hardware? Bang Bang Bros, back door, after 10. Password\'s <b>banana hammock</b>. Don\'t say I told ya."');
    }
    try { const h = game.quests?.hint?.(); if (h) bits.push(`"${h}"`); } catch (e) { /* optional */ }
    bits.push(pick([
      '"Heard Grimco\'s hiring. Heard they also fire people out of a cannon. Into the river. Corporate policy."',
      '"The Pit down in the Rustyards pays good money if you can take a punch. And give one. Mostly take, though."',
      '"Madame Ooze over in Gutterside? Spooky lady. Real spooky. She knew my PIN number. I never told her my PIN number."',
      '"Golden Tooth\'s got two security guys named Tony. Win too big and they toss ya. Literally. Like a frisbee."',
      '"Scrapper Pete\'s got a car for sale out at the junkyard. It\'s mostly rust held together by more rust."',
      '"Mutual fund at the bank? Chip Sterling? He sold my grandma a timeshare on the moon."',
      '"Cops\'ll forget your face if you drop by the station with an envelope. Or confess at the Holy Rebate. Pastor Rick\'s got a cop cousin."',
    ]));
    return say(game, 'Gossip', bits.join('<br><br>'), keeper);
  }

  // ---------------- arm wrestling (button mash) ----------------
  async function armWrestle(B) {
    const p = st.p;
    const opp = await choose(game, {
      title: 'Arm Wrestling', text: 'Who do you want to lose to?',
      choices: B.wrestlers.map(([n, s, d]) => ({ label: n, hint: `STR ~${s} · ${d}`, value: { n, s } })),
    });
    if (!opp) return;
    const maxBet = Math.max(10, Math.round(20 + opp.s * 8));
    return gamePanel(game, {
      title: `Arm Wrestling vs ${opp.n}`, width: 520,
      build(api) {
        const bi = betInput(5, maxBet, Math.min(maxBet, 20));
        api.body.innerHTML = `<div class="sys-intro">${opp.n} plants an elbow on the sticky table and grins. Your STR ${Math.floor(p.str)} vs their ~${opp.s}.</div>
          <div class="sys-tug"><div class="knot" style="left:50%"></div></div>
          <div class="ui-row">${bi.html}</div>
          <div class="ui-row" style="margin-top:8px"><button class="ui-btn primary" data-go>Lock hands</button><button class="ui-btn" data-mash style="font-size:22px;padding:10px 40px" disabled>PUSH! (click / Space)</button></div>
          <div class="sys-hint">Mash as fast as you can. First to slam the other's hand wins. 10 seconds max.</div>`;
        const getBet = bi.wire(api.body, game);
        const knot = api.body.querySelector('.knot');
        const mashBtn = api.body.querySelector('[data-mash]');
        const goBtn = api.body.querySelector('[data-go]');
        let x = 0, live = false, bet = 0, timeLeft = 0;
        const myPow = 0.034 * (1 + p.str / 40) * (game.sysFx.has('drug_hobo_dust') ? 1.15 : 1);
        const oppPow = 0.012 * (1 + opp.s / 40);
        const push = () => { if (!live) return; x += myPow; sfx('tick'); };
        const onKey = (e) => { if (e.code === 'Space' && live) { e.preventDefault(); push(); } };
        addEventListener('keydown', onKey);
        api.onClose(() => removeEventListener('keydown', onKey));
        mashBtn.addEventListener('mousedown', push);
        const end = (won) => {
          live = false;
          mashBtn.disabled = true; goBtn.disabled = false;
          if (won) {
            st.addMoney(bet * 2, 'arm wrestling');
            train(game, 'str', 0.3, 'arm wrestling');
            st.addXP(5);
            api.status(`SLAM! ${opp.n}'s hand hits the table. ${pick(['The bar erupts.', 'Somebody buys you a beer. It\'s warm. You drink it anyway.', `${opp.n} demands a rematch. You pretend not to hear.`])} <b>+${fmtMoney(bet)}</b>`, 'good');
            sfx('win');
          } else {
            st.damage(3, 'arm wrestling');
            api.status(`${opp.n} slams your hand down so hard the table cracks. ${pick(['Your wrist makes a noise like bubble wrap.', 'You hear laughter. It\'s yours. It\'s nervous.'])} <b>-${fmtMoney(bet)}</b>`, 'bad');
            sfx('lose');
          }
          api.cash();
        };
        goBtn.addEventListener('click', () => {
          bet = getBet();
          if (p.money < bet) { game.ui.toast('You can\'t cover that bet.', 'bad'); return; }
          if (p.energy < 5) { game.ui.toast('Too tired. Your arm is spaghetti.', 'bad'); return; }
          st.addMoney(-bet, 'arm wrestling');
          st.addStat('energy', -5);
          x = 0; live = true; timeLeft = 10;
          goBtn.disabled = true; mashBtn.disabled = false;
          api.status('GO GO GO!');
          api.cash();
        });
        api.timer(() => {
          if (!live) return;
          x -= oppPow * rand(0.6, 1.4);
          timeLeft -= 0.05;
          knot.style.left = `${50 + clamp(x, -1, 1) * 48}%`;
          if (x >= 1) end(true);
          else if (x <= -1) end(false);
          else if (timeLeft <= 0) end(x > 0);
        }, 50);
      },
    });
  }

  // ---------------- timing games: darts / quarters ----------------
  async function timingGame(kind) {
    const p = st.p;
    const darts = kind === 'darts';
    const throws = darts ? 3 : 5;
    return gamePanel(game, {
      title: darts ? 'Darts' : 'Quarters', width: 540,
      build(api) {
        const bi = betInput(5, 300, 20);
        api.body.innerHTML = `<div class="sys-intro">${darts ? 'A drunk named Lenny challenges you to darts. He has one eye closed. Both of them, actually.' : 'A biker slaps a shot glass on the table. "Bounce it in. Miss and you drink. Loser pays."'}</div>
          <div class="sys-track"><div class="zone" style="left:${darts ? 32 : 38}%;width:${darts ? 36 : 24}%"></div><div class="zone2" style="left:${darts ? 47 : 46}%;width:${darts ? 6 : 8}%"></div><div class="needle" style="left:0%"></div></div>
          <div class="sys-big score">—</div>
          <div class="ui-row">${bi.html}</div>
          <div class="ui-row" style="margin-top:8px"><button class="ui-btn primary" data-go>Start</button><button class="ui-btn" data-throw style="font-size:20px;padding:8px 36px" disabled>${darts ? 'THROW' : 'BOUNCE'} (click / Space)</button></div>
          <div class="sys-hint">Stop the needle in the red for max points. Drunk? The needle gets faster. Good luck.</div>`;
        const getBet = bi.wire(api.body, game);
        const needle = api.body.querySelector('.needle');
        const tBtn = api.body.querySelector('[data-throw]');
        const goBtn = api.body.querySelector('[data-go]');
        const scoreEl = api.body.querySelector('.score');
        let pos = 0, dir = 1, live = false, n = 0, score = 0, bet = 0;
        const speed = () => (darts ? 1.3 : 1.1) * (1 + (p.sys.drunk || 0) * 0.15) * (1 - Math.min(0.3, p.int / 400));
        const opp = () => darts ? Math.round(rand(20, 100) + rand(0, 40)) : randInt(1, 4);
        let oppScore = 0;
        const doThrow = () => {
          if (!live) return;
          const d = Math.abs(pos - 0.5);
          let pts;
          if (darts) pts = d < 0.03 ? 50 : d < 0.08 ? 25 : d < 0.18 ? 10 : d < 0.3 ? 5 : 0;
          else pts = d < 0.04 ? 1 : d < 0.12 ? (chance(0.6) ? 1 : 0) : 0;
          score += pts;
          n++;
          sfx(darts ? 'dart' : 'coin');
          if (!darts && !pts) game.sysFx.addDrunk(0.4);
          if (darts && d > 0.45 && chance(0.5)) api.status('You hit a guy in the butt. He doesn\'t notice. He\'s been hit before.', 'bad');
          else api.status(darts ? (pts === 50 ? 'BULLSEYE!' : pts ? `${pts} points` : 'Wall. You hit the wall.') : (pts ? 'Plink! In the glass!' : 'Miss! Drink up.'), pts ? 'good' : 'bad');
          scoreEl.textContent = `You: ${score}  (${n}/${throws})`;
          if (n >= throws) {
            live = false;
            tBtn.disabled = true; goBtn.disabled = false;
            const won = score > oppScore;
            const tie = score === oppScore;
            if (won) { st.addMoney(bet * 2, kind); st.addXP(4); sfx('win'); }
            else if (tie) st.addMoney(bet, kind);
            else sfx('lose');
            api.status(`You ${score} vs them ${oppScore}. ${won ? `You win <b>${fmtMoney(bet)}</b>!` : tie ? 'Tie. Bet returned.' : `You lose ${fmtMoney(bet)}. ${darts ? 'Lenny does a victory dance. It\'s upsetting.' : 'The biker makes you finish his drink too.'}`}`, won ? 'good' : tie ? '' : 'bad');
            if (!won && !darts) game.sysFx.addDrunk(1);
            api.cash();
          }
        };
        const onKey = (e) => { if (e.code === 'Space' && live) { e.preventDefault(); doThrow(); } };
        addEventListener('keydown', onKey);
        api.onClose(() => removeEventListener('keydown', onKey));
        tBtn.addEventListener('mousedown', doThrow);
        goBtn.addEventListener('click', () => {
          bet = getBet();
          if (p.money < bet) { game.ui.toast('You can\'t cover that bet.', 'bad'); return; }
          st.addMoney(-bet, kind);
          game.time.advance(20);
          live = true; n = 0; score = 0; oppScore = opp();
          tBtn.disabled = false; goBtn.disabled = true;
          scoreEl.textContent = `You: 0  (0/${throws})`;
          api.status(`They scored ${oppScore}. Your turn.`);
          api.cash();
        });
        let last = performance.now();
        api.timer(() => {
          const now = performance.now();
          const dt = (now - last) / 1000; last = now;
          if (!live) return;
          pos += dir * speed() * dt;
          if (pos > 1) { pos = 1; dir = -1; } else if (pos < 0) { pos = 0; dir = 1; }
          const wob = (p.sys.drunk || 0) > 1 ? Math.sin(now / 90) * 0.01 * p.sys.drunk : 0;
          needle.style.left = `${clamp(pos + wob, 0, 1) * 98}%`;
        }, 16);
      },
    });
  }

  // ---------------- bar fight ----------------
  async function barFight(loc, B) {
    const p = st.p;
    const isSpur = loc.id === 'dirty_spur';
    const count = randInt(B.fightCount[0], B.fightCount[1]);
    const label = isSpur ? 'Biker Bar Brawl' : 'Bar Fight';
    const onWin = () => {
      const loot = randInt(15, 60) * count * (isSpur ? 2 : 1);
      st.addMoney(loot, 'bar fight');
      st.addStat('str', 0.5, 'bar fight');
      st.addStat('karma', -1);
      game.ui.toast(`You win the ${label.toLowerCase()}! You "find" ${fmtMoney(loot)} on the floor. And a tooth.`, 'money', 4000);
      if (chance(0.3)) st.addItem('gold_tooth', 1);
    };
    const onLose = () => {
      const lost = Math.min(p.money, randInt(10, 50) * (isSpur ? 2 : 1));
      if (lost) st.addMoney(-lost, 'bar fight');
      game.ui.toast(`You wake up in the dumpster out back. ${lost ? `${fmtMoney(lost)} lighter.` : ''} Someone drew on your face.`, 'bad', 4500);
    };
    const start = pick(isSpur
      ? ['You call a biker\'s motorcycle "cute". The whole bar goes silent. Chairs scrape.', 'You knock over a guy\'s beer. He looks at the beer. He looks at you. He looks at his friends.']
      : ['You tell a guy his mom is a Pizza Butt delivery driver. She is. He\'s sensitive about it.', 'You throw a pretzel at a man\'s head. It bounces off. He takes off his glasses.']);
    const ans = await game.ui.dialog({ title: label, html: `${start}<br><br>Throw down? (${count} opponent${count > 1 ? 's' : ''})`, options: [{ label: 'FIGHT!' }, { label: 'Apologize and back off' }] });
    if (ans !== 0) return;
    game.ui.closeAll();
    if (game.combat?.startBrawl) {
      const spot = brawlSpot(game, loc);
      game.combat.startBrawl({ x: spot.x, z: spot.z, count, kind: 'drunk', tier: B.fightTier, label, onWin, onLose });
      return 'leave';
    }
    // fallback: stat roll
    const opp = 15 * count * (1 + B.fightTier);
    const won = chance(clamp(p.str / (p.str + opp) + (p.sys.drunk > 2 ? 0.05 : 0), 0.08, 0.92));
    st.damage(won ? randInt(5, 20) : randInt(20, 40), 'bar fight');
    sfx('punch');
    if (won) { p.totals.fightsWon++; onWin(); } else { p.totals.fightsLost++; onLose(); }
    return 'leave';
  }

  // ---------------- karaoke ----------------
  async function karaoke() {
    if (!activity(game, { minutes: 30, energy: 5 })) return;
    const song = pick(['"Baby, Your Love Is Like Gravy"', '"Don\'t Stop Believin\' (In Me)"', '"My Heart Will Go On (And On And On)"', '"I Will Survive (Probably)"']);
    const p = st.p;
    const good = chance(clamp(0.35 + p.cha / 120 + (p.sys.drunk > 1 ? 0.1 : 0), 0.1, 0.9));
    if (good) { train(game, 'cha', 0.8, 'karaoke'); st.addMoney(randInt(5, 25), 'tips'); }
    else st.addStat('cha', -0.1);
    return say(game, 'Karaoke', `You belt out ${song}. ${good ? 'The bar goes wild. A woman throws her bra. A man throws his bra. Tips land in your shoe. +Charm' : 'It\'s a hate crime against music. A man in the back quietly weeps. Sal unplugs the machine mid-chorus.'}`);
  }

  // ---------------- BAR handler ----------------
  game.locations.register('bar', (g, loc) => {
    const B = BARS[loc.id] || BARS.rusty_nail;
    return placeMenu(g, loc, {
      hours: [11, 4],
      speaker: B.keeper,
      closed: () => `${loc.name} is closed. A drunk is asleep against the door, hugging it like a lover. He murmurs "last call... last call..."`,
      text: () => byTime(g, B.text) + (loc.id === 'dirty_spur' && st.p.cha < 20 ? '<br><br><em>A biker stares at your outfit and snorts. You feel deeply judged.</em>' : ''),
      options: () => {
        const p = st.p;
        const out = [
          { label: 'Beer', hint: '$4', run: () => drink('Beer', 4, 1, pick(['Cold, yellow and flat. Like a Tuesday.', 'Tastes like the tap was installed by a plumber who hated beer.'])) },
          { label: 'Shot of whiskey', hint: '$8', run: () => drink('Whiskey', 8, 1.6, pick(['It goes down like a lit match.', 'Your eyes water. Your ancestors applaud.'])) },
          { label: `House special: ${B.special[0]}`, hint: `$${B.special[1]}`, run: () => drink(B.special[0], B.special[1], B.special[2], B.special[3]) },
          { label: `Chat up ${B.keeper}`, hint: 'gossip, rumors & hints', run: () => gossip(loc.id, B.keeper) },
          { label: 'Arm wrestling', hint: 'bet on your bicep', run: () => armWrestle(B) },
          { label: B.game === 'darts' ? 'Darts' : 'Quarters', hint: 'timing game · bet', run: () => timingGame(B.game) },
          { label: 'Start a bar fight', hint: loc.id === 'dirty_spur' ? 'bikers. lots of bikers.' : 'it\'s a Rusty Nail tradition', run: () => barFight(loc, B) },
        ];
        if (loc.id === 'rusty_nail') {
          out.push({ label: 'Karaoke', hint: '+CHA or eternal shame', disabled: !g.time.isBetween(19, 4), run: karaoke });
          if (p.job?.id === 'bartender') { out.unshift(...g.jobs.lead('bartender')); out.push(...g.jobs.trail('bartender')); } else out.push(...g.jobs.options('bartender'));
          const gus = g.sysDating?.option?.('gus', loc);
          if (gus) out.push(gus);
        } else {
          out.push({ label: 'Pool hustle', hint: 'needs INT 20 · $50 stakes', disabled: p.int < 20, run: async () => {
            if (!st.spend(50)) return;
            game.time.advance(45);
            const won = chance(clamp(0.3 + p.int / 200, 0.3, 0.75));
            if (won) st.addMoney(110, 'pool');
            return say(g, 'Pool', won ? 'You play dumb for two games, then run the table. The biker you hustled stares at you for a long time, then buys you a beer. Respect.' : 'You play dumb for two games. Then you play dumb for real. You lose $50 and a little dignity.');
          } });
        }
        return out;
      },
    });
  });

  // Dance floor payout (res = minigame result or null). Returns the summary html.
  function danceApply(g, res) {
    const p = st.p;
    if (!activity(g, { minutes: 60, energy: 12 })) return 'Your legs file a formal complaint. Too tired to dance.';
    const gm = res ? gainMult(res) : 1;
    const gain = train(g, 'cha', 1.3 * gm, 'dancing');
    let ev = '';
    const s = res && !res.skipped ? res.score : 0.5;
    if (chance(0.15 + 0.15 * s)) {
      const win = chance(clamp(p.cha / 80 + (s - 0.5) * 0.6, 0.1, 0.9));
      ev = win ? '<br><br>A dance-off breaks out! You do the worm. The crowd chants your name (they get it wrong). You win a free bottle of Fancy Bubbles!' : '<br><br>A dance-off breaks out! You attempt a split. Something tears. It\'s your pants. And maybe a hamstring.';
      if (win) st.addItem('champagne', 1); else st.damage(5, 'dance');
    }
    const line = s >= 0.82 ? pick(['The crowd parts like you\'re a sweaty Moses. Phones come out. You\'re going viral. In a good way, this time.', 'You move like liquid. Greasy, beautiful liquid. A bachelorette party adopts you.'])
      : pick(['You dance like nobody\'s watching. Everybody is watching. Some are filming.', 'You do the robot. A real robot would be embarrassed for you. Still, people clap.', 'You grind on a pillar. The pillar grinds back. It\'s a man in a gray outfit.']);
    return `${line}${gain ? `<br><br>+${Math.round(gain * 100) / 100} CHA` : ''}${res ? `<br><span class="sys-hint">Gains ×${gm.toFixed(2)} (${res.skipped ? 'autopilot' : 'grade ' + res.grade})</span>` : ''}${ev}`;
  }

  // ================= CLUB VELVET =================
  game.locations.register('nightclub', (g, loc) => {
    const p = st.p;
    const t = today(g);
    const vip = p.job?.id === 'bouncer' || p.cha >= 40;
    return placeMenu(g, loc, {
      hours: [21, 4],
      speaker: 'Velvet Vince',
      closed: () => `Club Velvet is dark. Velvet Vince is out front smoking. "We open at 9PM. Come back looking ${p.cha < 20 ? 'less like that' : 'like that, but later'}."`,
      closedOptions: () => g.jobs.options('bouncer').filter((o) => !o.label.startsWith('Work')),
      text: () => `${pick([
        'Bass so loud your organs rearrange. Lasers. Fog. A guy in sunglasses indoors at midnight is selling "vitamins" by the bathroom.',
        'Club Velvet: red velvet walls, red velvet ropes, red velvet cake nobody is allowed to eat. The DJ is a 50-year-old named DJ Moist.',
        'Sweaty bodies grind under a disco ball the size of a car. Someone is crowd-surfing. There\'s no stage.',
      ])}${!t.clubIn && !vip ? `<br><br><em>Vince blocks the rope: "$20 cover. Unless you\'re fabulous (CHA 40). You\'re not."</em>` : ''}`,
      options: () => {
        const inside = t.clubIn || vip;
        if (!inside) {
          return [
            { label: 'Pay the cover', hint: '$20', run: () => { if (st.spend(20, 'cover')) { t.clubIn = true; game.ui.toast('Vince stamps your hand. The stamp is a tiny middle finger.', 'info'); } } },
            { label: 'Try to sweet-talk Vince', hint: 'CHA check', run: async () => {
              if (t.vinceTry) return say(g, 'Club Velvet', '"I already said no. Saying it again costs extra."', 'Velvet Vince');
              t.vinceTry = true;
              if (chance(clamp(p.cha / 50, 0.05, 0.9))) { t.clubIn = true; return say(g, 'Club Velvet', 'Vince sighs and unclips the rope. "Fine. But I\'m watching you." He is. The whole night.', 'Velvet Vince'); }
              return say(g, 'Club Velvet', '"Nice try. I\'ve heard better lines from a parking meter."', 'Velvet Vince');
            } },
            ...g.jobs.options('bouncer'),
          ];
        }
        const out = [
          { label: 'Hit the dance floor', hint: '1h · -12 energy · +CHA · rhythm game', run: async () => {
            if (p.energy < 12) { st.useEnergy(12); return; }
            const apply = (res) => danceApply(g, res);
            if (!game.minigames?.has('dance')) return say(g, 'Dance Floor', apply(null));
            return game.minigames.run('dance', {
              title: 'Club Velvet — Dance Floor',
              intro: 'DJ Moist drops a beat that sounds like a car alarm having a breakdown. The floor is sticky. The lights are lasers. Your body is ready. Your body is wrong, but ready.',
              stakes: '1h · -12 energy · base +1.3 CHA (before soreness/diminishing returns)',
              diff: clamp((p.cha || 0) / 120, 0, 1),
              skipLabel: 'Skip (auto, 80% gains)', skipLine: 'You sway in the corner holding a drink, nodding like you know the song. You don\'t. Nobody does.',
              context: { place: 'nightclub' },
              apply,
            });
          } },
          { label: 'Velvet Martini', hint: '$15', run: () => drink('Velvet Martini', 15, 1.5, 'It\'s red, it\'s velvety, it tastes like cough syrup and ambition.') },
          { label: 'Bottle service', hint: '$500 · VIP booth · +CHA', disabled: p.cha < 30, run: async () => {
            if (!st.spend(500, 'bottle service')) return;
            game.time.advance(90);
            game.sysFx.addDrunk(2);
            train(game, 'cha', 1.5, 'vip', 50, { tiring: false }); // diminishing like other CHA sources (it was a flat, repeatable +1.5)
            const tip = chance(0.3);
            if (tip && game.market) return say(g, 'VIP Booth', `Sparklers! A bottle girl! People you don't know pretend to know you. A drunk hedge-fund guy whispers: "${game.market.rumor(0.95)}"`);
            return say(g, 'VIP Booth', 'Sparklers! Champagne! A rapper named Lil Gristle sits at your booth, drinks your bottle, and leaves. You feel famous by proximity.');
          } },
          { label: 'The bathroom line', hint: '"vitamins"', run: () => game.market?.openDealer({ id: 'dealer_club', type: 'dealer', name: 'Bathroom Stall Guy', district: loc.district || 'hilltop' }) },
          ...g.jobs.options('bouncer'),
        ];
        const roxy = g.sysDating?.option?.('roxy', loc);
        if (roxy) out.splice(2, 0, roxy);
        return out;
      },
    });
  });

  return { gossip, armWrestle, timingGame };
}
