// Civic buildings: bank (savings, ATM, loans, mutual fund), hospital, police station, church.
import { fmtMoney, pick, chance, rand, randInt, clamp } from '../core/util.js';
import { DRUGS, DRUG_ORDER } from '../data/drugs.js';
import { today, hasCourse, train, byTime, ensureState, capacity, netWorth } from './common.js';
import { placeMenu, say, choose, shopPanel } from './ui-kit.js';

function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function installCivic(game) {
  const st = game.state;
  const sfx = (n) => game.sysSfx?.play(n);

  // ================= BANK =================
  const loanMax = () => {
    const p = st.p;
    return Math.min(250000, Math.round(500 + p.level * 750 + p.int * 25 + Math.max(0, netWorth(p)) * 0.25));
  };
  const savingsRate = () => (hasCourse(st.p, 'mba') ? 0.003 : 0.002);

  async function deposit() {
    const p = st.p;
    if (p.money <= 0) return say(game, 'Teller', 'Gloria: "You want to deposit... nothing? I\'ll write that down. Nothing. Thank you."', 'Gloria');
    const n = await game.ui.promptNumber({ title: 'Deposit', text: 'Money in the bank is safe from muggers, arrests and your own stupidity.', max: p.money, min: 0 });
    if (!n || n > p.money) return;
    st.addMoney(-n, 'deposit');
    p.bank += n;
    st.changed('bank');
    sfx('cash');
  }
  async function withdraw(fee = 0) {
    const p = st.p;
    const max = Math.max(0, p.bank - fee);
    if (max <= 0) return say(game, 'Bank', fee ? 'The ATM displays: "INSUFFICIENT FUNDS. ALSO, INSUFFICIENT LIFE CHOICES."' : 'Gloria: "Your balance is zero. Like your prospects."');
    const n = await game.ui.promptNumber({ title: fee ? `ATM withdrawal (${fmtMoney(fee)} fee)` : 'Withdraw', text: fee ? 'The ATM hums judgmentally. Convenience fee applies. Inconvenience fee also applies.' : '', max, min: 0 });
    if (!n || n > max) return;
    p.bank -= n + fee;
    st.addMoney(n, 'withdraw');
    st.changed('bank');
  }

  async function loanMenu() {
    const p = st.p;
    const L = p.sys.loan;
    if (L) {
      const due = L.day + 14 - game.time.day;
      const i = await choose(game, {
        title: 'Loans', speaker: 'Mr. Vance, Loan Officer',
        html: `Mr. Vance steeples his fingers. "You owe us <b class="ui-bad">${fmtMoney(L.amount)}</b>. Interest is 1.5% per day, compounding, like your problems. ${due >= 0 ? `Due in <b>${due} days</b>.` : `<b class="ui-bad">${-due} DAYS OVERDUE.</b> We've sent... associates.`}"`,
        choices: [{ label: 'Repay (cash, then bank)', value: 'pay' }, { label: 'Pay part of it', value: 'part' }],
      });
      if (i === 'pay' || i === 'part') {
        const avail = p.money + p.bank;
        let n = L.amount;
        if (i === 'part') n = await game.ui.promptNumber({ title: 'Repay how much?', max: Math.min(avail, L.amount), min: 0 }) || 0;
        n = Math.min(n, avail, L.amount);
        if (n <= 0) return;
        const fromCash = Math.min(p.money, n);
        st.addMoney(-fromCash, 'loan');
        p.bank -= n - fromCash;
        L.amount = Math.round(L.amount - n);
        if (L.amount <= 0) { p.sys.loan = null; st.addStat('karma', 1); game.ui.toast('Loan paid off! Mr. Vance looks almost disappointed.', 'good'); } else game.ui.toast(`${fmtMoney(L.amount)} still owed.`, 'info');
        st.changed('bank');
      }
      return;
    }
    const max = loanMax();
    const n = await game.ui.promptNumber({ title: 'Take a loan', text: `Mr. Vance: "Based on your credit score — which is a frowny face — we can offer up to <b>${fmtMoney(max)}</b>. 1.5% daily interest. 14 days to repay. After that, we stop being nice. We were never nice."`, max, min: 0, initial: Math.min(1000, max) });
    if (!n) return;
    p.sys.loan = { amount: n, day: game.time.day };
    st.addMoney(n, 'loan');
    game.ui.toast(`Borrowed ${fmtMoney(n)}. Somewhere, a debt collector smiles in his sleep.`, 'money', 3500);
  }

  async function fundMenu() {
    const p = st.p;
    const i = await choose(game, {
      title: 'Rotwell Mutual Fund', speaker: 'Chip Sterling, Wealth Manager',
      html: `Chip adjusts his suspenders. "The Rotwell Mutual Fund. Totally not a pyramid. It's a <em>triangle</em>. Historically returns about a third of a percent a day... on average. Some days it eats your money. 1% withdrawal fee."<br><br>Your stake: <b>${fmtMoney(p.sys.fund)}</b>${p.sys.fundLast ? ` (yesterday: <span class="${p.sys.fundLast >= 0 ? 'ui-good' : 'ui-bad'}">${p.sys.fundLast >= 0 ? '+' : ''}${(p.sys.fundLast * 100).toFixed(2)}%</span>)` : ''}`,
      choices: [{ label: 'Invest (from cash)', value: 'in', disabled: p.money <= 0 }, { label: 'Cash out (to cash)', value: 'out', disabled: p.sys.fund <= 0 }],
    });
    if (i === 'in') {
      const n = await game.ui.promptNumber({ title: 'Invest', max: p.money, min: 0 });
      if (n > 0 && n <= p.money) { st.addMoney(-n, 'fund'); p.sys.fund += n; st.changed('fund'); }
    } else if (i === 'out') {
      const n = await game.ui.promptNumber({ title: 'Cash out', max: Math.floor(p.sys.fund), min: 0 });
      if (n > 0 && n <= p.sys.fund) { p.sys.fund -= n; st.addMoney(Math.floor(n * 0.99), 'fund'); st.changed('fund'); }
    }
  }

  game.locations.register('bank', (g, loc) => placeMenu(g, loc, {
    hours: [9, 17],
    speaker: 'Gloria the Teller',
    closed: () => 'The bank is closed. The ATM outside glows like a slot machine for people who already lost.',
    closedOptions: () => [
      { label: 'ATM: withdraw', hint: '$3 convenience fee', run: () => withdraw(3) },
      { label: 'ATM: deposit', run: () => deposit() },
      { label: 'ATM: check balance', run: () => say(g, 'ATM', `BALANCE: ${fmtMoney(st.p.bank)}<br>${st.p.bank < 100 ? 'The ATM prints a receipt that just says "lol".' : 'The ATM beeps approvingly. Or sarcastically. Hard to tell with ATMs.'}`) },
    ],
    text: () => {
      const p = st.p;
      return `${pick([
        'Gloria the teller looks at you over her glasses like you\'re a bounced check. "Next."',
        'The bank smells like carpet glue and old money. A security guard is asleep standing up.',
        'A pen on a chain. You try to steal it anyway. It\'s chained to your soul now.',
      ])}<br><br><span class="sys-hint">Savings earn ${(savingsRate() * 100).toFixed(1)}% per day (on up to $250k). Balance: <b>${fmtMoney(p.bank)}</b>${p.sys.fund ? ` · Fund: ${fmtMoney(p.sys.fund)}` : ''}${p.sys.loan ? ` · <span class="ui-bad">Loan: ${fmtMoney(p.sys.loan.amount)}</span>` : ''}</span>`;
    },
    options: () => [
      { label: 'Deposit', run: deposit },
      { label: 'Withdraw', run: () => withdraw(0) },
      { label: st.p.sys.loan ? 'Loan: repay' : 'Apply for a loan', hint: st.p.sys.loan ? fmtMoney(st.p.sys.loan.amount) : `up to ${fmtMoney(loanMax())}`, run: loanMenu },
      { label: 'Rotwell Mutual Fund', hint: 'risky investing', run: fundMenu },
      { label: 'Ask for a free lollipop', run: () => { const t = today(g); if (t.lolli) return say(g, 'Bank', 'Gloria: "One per day. That\'s federal law." It isn\'t.', 'Gloria'); t.lolli = true; st.addStat('energy', 2); return say(g, 'Bank', 'Gloria sighs and hands you a lollipop from the kids\' jar. It\'s root beer. Nobody\'s favorite. +2 energy.', 'Gloria'); } },
    ],
  }));

  function bankDaily() {
    const p = st.p;
    // savings interest
    if (p.bank > 0) {
      const base = Math.min(p.bank, 250000);
      const interest = Math.floor(base * savingsRate() + Math.max(0, p.bank - 250000) * 0.0005);
      if (interest > 0) { p.bank += interest; st.changed('bank'); p.sys.lastInterest = interest; }
    }
    // mutual fund
    if (p.sys.fund > 0) {
      let r = 0.0035 + gauss() * 0.025;
      if (chance(0.02)) r = -rand(0.15, 0.3);
      if (chance(0.02)) r = rand(0.08, 0.15);
      p.sys.fund = Math.max(0, Math.round(p.sys.fund * (1 + r)));
      p.sys.fundLast = r;
      if (r < -0.1) game.ui.toast(`Rotwell Mutual Fund "corrected" by ${(r * 100).toFixed(0)}%. Chip Sterling has stopped answering his phone.`, 'bad', 5000);
    }
    // loan interest + collections
    const L = p.sys.loan;
    if (L) {
      L.amount = Math.round(L.amount * 1.015);
      const overdue = game.time.day - (L.day + 14);
      if (overdue > 0) {
        L.amount = Math.round(L.amount * 1.03);
        if (p.bank > 0) {
          const seized = Math.min(p.bank, L.amount);
          p.bank -= seized; L.amount -= seized;
          game.ui.toast(`First Bank seized ${fmtMoney(seized)} from your account for your overdue loan.`, 'bad', 5000);
          if (L.amount <= 0) p.sys.loan = null;
        }
        if (p.sys.loan) { p.sys.collectors = true; st.addStat('karma', -1); }
        st.changed('bank');
      } else if (overdue === 0) game.ui.toast('Your loan is due TODAY. Mr. Vance sent a fruit basket. The fruit is threatening.', 'bad', 5000);
    }
  }

  // Debt collectors show up when you're out walking.
  game.bus.on('time:hour', () => {
    const p = st.p;
    if (!p.sys?.collectors || !game.started || game.ui.isBlocking() || game.player?.vehicle || game.player?.dead) return;
    if (!chance(0.35)) return;
    p.sys.collectors = false;
    const pos = game.player.pos;
    game.ui.toast('"Mr. Vance sends his regards." Two men in cheap suits crack their knuckles.', 'bad', 4000);
    const onLose = () => {
      const take = Math.floor(st.p.money * 0.6);
      st.addMoney(-take, 'collectors');
      if (st.p.sys.loan) st.p.sys.loan.amount = Math.max(0, st.p.sys.loan.amount - take);
      game.ui.toast(`The collectors took ${fmtMoney(take)} "toward your balance" and a kidney's worth of dignity.`, 'bad', 5000);
    };
    if (game.combat?.startBrawl) game.combat.startBrawl({ x: pos.x, z: pos.z, count: 2, kind: 'thug', tier: 1, label: 'Debt Collectors', onLose });
    else onLose();
  });

  // ================= HOSPITAL =================
  const medMult = () => (hasCourse(st.p, 'premed') ? 0.5 : 1) * (st.p.flags.insurance ? 0.5 : 1);

  game.locations.register('hospital', (g, loc) => placeMenu(g, loc, {
    hours: null,
    speaker: 'Nurse Gertrude',
    text: () => {
      const p = st.p;
      const hurt = p.hp < p.maxHp * 0.5;
      return `${byTime(g, {
        morning: 'Nurse Gertrude is drinking coffee out of a bedpan. "It\'s clean. Mostly. What do you want."',
        day: 'The waiting room has a TV playing a show about hospitals. A guy with a fork in his head is watching it. Taking notes.',
        evening: 'A man is waiting with a traffic cone stuck on his... you look away. Gertrude doesn\'t even blink.',
        night: 'The ER at night: gunshot wounds, a guy who swallowed a remote, and a raccoon in a neck brace. Gertrude has seen worse.',
      })}${hurt ? '<br><br><em>Gertrude looks at you: "Oof. You look like a dropped lasagna."</em>' : ''}<br><span class="sys-hint">Insurance: ${p.flags.insurance ? `active through day ${p.sys.insuranceUntil}` : 'none (uninsured — good luck, champ)'}</span>`;
    },
    options: () => {
      const p = st.p;
      const t = today(g);
      const missing = Math.ceil(p.maxHp - p.hp);
      const full = Math.max(10, Math.round(missing * 2 * medMult()));
      return [
        { label: 'Quick patch-up', hint: `${fmtMoney(Math.round(25 * medMult()))} · +35 HP`, disabled: missing <= 0, run: () => { if (st.spend(Math.round(25 * medMult()), 'hospital')) { g.time.advance(30); st.heal(35); return say(g, 'Patch-up', pick(['Gertrude slaps a bandage on you and says "walk it off". You walk it off.', 'An intern stitches you with what appears to be dental floss. Mint flavored.'])); } } },
        { label: 'Full treatment', hint: `${fmtMoney(full)} · full HP · 2h`, disabled: missing <= 0, run: () => { if (st.spend(full, 'hospital')) { g.time.advance(120); st.heal(p.maxHp); return say(g, 'Full Treatment', 'Dr. Sawbones fixes you up. You\'re pretty sure he left a sponge in there. "It\'s a souvenir," he says.'); } } },
        { label: p.flags.insurance ? 'Extend insurance (30 days)' : 'Buy health insurance (30 days)', hint: `$600 · half-price care · keep cash when you die`, run: async () => {
          if (!st.spend(600, 'insurance')) return;
          p.sys.insuranceUntil = Math.max(p.sys.insuranceUntil || 0, g.time.day) + 30;
          st.setFlag('insurance', true);
          return say(g, 'Insurance', 'You sign 40 pages. Page 31 says they can harvest one (1) organ of their choosing "in an emergency". Gertrude stamps it. You\'re covered!', 'Nurse Gertrude');
        } },
        { label: 'Sell plasma', hint: t.plasma ? 'come back tomorrow' : '+$ · -HP · -energy', disabled: !!t.plasma, run: async () => {
          if (p.hp < 30) return say(g, 'Plasma', 'Gertrude: "Honey, you don\'t have enough blood to sell. You barely have enough to keep."', 'Nurse Gertrude');
          t.plasma = true;
          g.time.advance(60);
          const pay = 40 + Math.min(40, p.level * 3);
          st.damage(15, 'plasma');
          st.addStat('energy', -20);
          st.addMoney(pay, 'plasma');
          return say(g, 'Plasma Center', `They drain a bag of you. It's yellow-ish. They pay you ${fmtMoney(pay)} and a juice box. The juice box is expired. Still the best part.`);
        } },
        { label: 'Rehab program', hint: `$800 · 12h · clears addiction`, disabled: (p.sys.addiction?.level || 0) < 5, run: async () => {
          if (!st.spend(800, 'rehab')) return;
          g.time.advance(720);
          game.sysFx.addAddiction(-100);
          game.sysFx.remove('withdrawal');
          st.addStat('karma', 2);
          return say(g, 'Rehab', 'Twelve hours of group therapy, a guy named Hank crying about his ferret, and lukewarm decaf. You come out clean and slightly in love with Hank\'s ferret.');
        } },
        { label: 'Cosmetic surgery', hint: p.sys.surgery >= 3 ? 'maxed out (any more and you\'ll melt)' : `${fmtMoney(5000 * (p.sys.surgery + 1))} · +5 Charm`, disabled: p.sys.surgery >= 3, run: async () => {
          const cost = 5000 * (p.sys.surgery + 1);
          if (!(await g.ui.confirm(`Get work done for ${fmtMoney(cost)}? Dr. Sawbones has a 60% success rate. The other 40% are "abstract".`))) return;
          if (!st.spend(cost, 'surgery')) return;
          g.time.advance(480);
          p.sys.surgery++;
          st.addStat('cha', 5, 'surgery');
          st.damage(20, 'surgery');
          return say(g, 'Surgery', pick(['You wake up with a chin you could cut glass with. Literally. Be careful kissing.', 'Your new nose is perfect. A little to the left, but perfect.', 'They tightened your face so much you now look permanently surprised. People find it charming.']));
        } },
        g.sysDating?.option?.('patty', loc),
      ].filter(Boolean);
    },
  }));

  // ================= POLICE =================
  const heatCost = () => {
    const p = st.p;
    return Math.round(p.heat * (300 + p.level * 60) * (hasCourse(p, 'crim_justice') ? 0.75 : 1) * (hasCourse(p, 'law') ? 0.5 : 1));
  };
  function clearAllHeat() {
    if (game.combat?.clearHeat) game.combat.clearHeat(true);
    else st.addHeat(-5);
  }

  game.locations.register('police', (g, loc) => placeMenu(g, loc, {
    hours: null,
    speaker: 'Desk Sergeant Mulligan',
    text: () => {
      const p = st.p;
      const job = p.job?.id === 'cop';
      if (p.heat >= 3 && !job) return 'You walk into a police station with a warrant out. Bold. Stupid, but bold. Sgt. Mulligan doesn\'t look up from his donut. "Fill out a form. Or pay up. Your choice, genius."';
      return job ? pick(['Officers nod at you. One slaps your back. One slaps your butt. You file a complaint. It\'s filed in the trash.', 'The precinct smells like burnt coffee and paperwork. Chief Hamhock yells "WHO ATE MY BEAR CLAW."'])
        : pick([
          'Sgt. Mulligan is eating a donut so slowly it\'s a power move. "Yeah? You here to confess or complain?"',
          'A guy in cuffs is yelling about his rights. Another guy is yelling about his lefts. Mulligan sighs.',
          'The "Most Wanted" board has a photo of a raccoon on it. Someone circled it in red. Twice.',
        ]);
    },
    options: () => {
      const p = st.p;
      const t = today(g);
      const out = [];
      if (p.heat > 0) out.push({ label: 'Pay off your heat ("administrative fees")', hint: `${fmtMoney(heatCost())} · clears ${p.heat}★`, run: async () => {
        const c = heatCost();
        if (!st.spend(c, 'heat')) return;
        clearAllHeat();
        p.sys.dealHeat = 0;
        return say(g, 'Rotwell PD', 'Mulligan pockets the cash without counting it. "Your file seems to have... fallen into a shredder. Clumsy me."', 'Sgt. Mulligan');
      } });
      if (p.sys.fines > 0) out.push({ label: 'Pay outstanding fines', hint: fmtMoney(p.sys.fines), run: () => { if (st.spend(p.sys.fines, 'fines')) { p.sys.fines = 0; game.ui.toast('Fines paid. Mulligan stamps your hand like it\'s a nightclub.', 'good'); } } });
      if (p.heat > 0) out.push({ label: 'Turn yourself in', hint: `${p.heat * 4}h in a cell · lose drugs on you`, run: async () => {
        if (!(await g.ui.confirm('Turn yourself in? You\'ll do time and they\'ll take any contraband on you.'))) return;
        const hrs = p.heat * 4;
        p.drugs = {};
        st.changed('drugs');
        clearAllHeat();
        p.sys.dealHeat = 0;
        g.time.advance(hrs * 60);
        st.addStat('karma', 2);
        p.totals.arrests = (p.totals.arrests || 0) + 1;
        return say(g, 'Holding Cell', `${hrs} hours in a cell with a guy named Moose who wants to "be your friend". You did not make a friend. You did make a shiv out of a spork. They took it.`);
      } });
      out.push({ label: 'Report a crime (anonymous tip line)', hint: t.snitch ? 'once a day' : '+karma, small reward', disabled: !!t.snitch, run: () => snitch() });
      if (p.job?.id === 'cop' && p.job.rank >= 1) out.push({ label: 'Visit the evidence locker', hint: '"inventory audit"', run: () => evidence() });
      out.push(...g.jobs.options('cop'));
      return out;
    },
  }));

  async function snitch() {
    const t = today(game);
    const what = await choose(game, {
      title: 'Tip Line', text: 'The tip line phone is a Garfield phone. Its eyes open when you pick it up.',
      choices: [
        { label: 'Report a drug dealer', value: 'dealer' },
        { label: 'Report your noisy neighbor', value: 'neighbor' },
        { label: 'Report Mr. Grimsby for "vibes"', value: 'grimsby' },
      ],
    });
    if (!what) return;
    t.snitch = true;
    if (what === 'dealer') {
      st.addStat('karma', 2);
      st.addMoney(50, 'tip');
      if (st.totalDrugs() > 0) { st.addHeat(1); return say(game, 'Tip Line', 'You describe the dealer in great detail. Mulligan writes it down... then looks at your bulging pockets. "Huh. Sounds a lot like you." (+1 heat, but they paid the $50 reward anyway. Bureaucracy.)'); }
      return say(game, 'Tip Line', 'You rat out a dealer. Mulligan hands you $50 and a sticker that says "I HELPED". Karma +2. Snitches get... stickers.');
    }
    if (what === 'neighbor') { st.addStat('karma', 1); return say(game, 'Tip Line', 'Mulligan: "We\'ll get right on that." He hangs up and goes back to playing solitaire on a computer from 1996.'); }
    st.addStat('karma', -1);
    return say(game, 'Tip Line', 'Mulligan: "Grimsby? He owns this building. And me. Please never call again." Karma -1 for wasting police time.');
  }

  async function evidence() {
    const t = today(game);
    const p = st.p;
    if (t.evidence) return say(game, 'Evidence Locker', 'The locker\'s already been "audited" today. By you. Suspiciously thoroughly.');
    const id = pick(DRUG_ORDER.slice(0, 6));
    const qty = randInt(2, 6);
    const room = capacity(p) - st.totalDrugs();
    const n = Math.min(qty, room);
    if (!(await game.ui.confirm(`There's ${qty}× ${DRUGS[id].name} in a box marked "DEFINITELY COUNTED". Pocket ${n}? (karma -3, small risk)`, { title: 'Evidence Locker' }))) return;
    t.evidence = true;
    if (n > 0) st.addDrug(id, n);
    st.addStat('karma', -3);
    if (chance(0.12)) game.jobs.fire('Internal Affairs had a camera in the evidence locker. A camera. In 2026. Who knew.');
  }

  // ================= CHURCH =================
  game.locations.register('church', (g, loc) => placeMenu(g, loc, {
    hours: [6, 22],
    speaker: 'Pastor Prosper',
    closed: () => 'The Church of the Holy Rebate is closed. The neon cross out front blinks "OPEN 6AM-10PM — JESUS SAVES (15% ON SELECT ITEMS)".',
    text: () => {
      const p = st.p;
      const k = p.karma;
      const read = k >= 40 ? 'Pastor Prosper beams. "A SAINT walks among us! A saint with a wallet, I hope."'
        : k >= 10 ? 'Pastor Prosper nods warmly. "Welcome, friend. The Lord sees your good deeds. The Lord also sees the collection plate."'
          : k > -20 ? 'Pastor Prosper shakes your hand a little too long, checking for a watch. "Welcome, sinner. We\'re all sinners. Some of us just tithe more."'
            : 'Pastor Prosper takes a step back. The holy water in the font starts to bubble. "Oh my. Oh dear. Oh, that\'s gonna cost extra."';
      return `${read}<br><br><em>${pick(['The pews are padded with velvet and coupons.', 'A stained glass window shows Jesus giving a thumbs up next to a "50% OFF" sign.', 'The choir is singing a hymn about compound interest.'])}</em>`;
    },
    options: () => {
      const p = st.p;
      const t = today(g);
      const sunday = g.time.day % 7 === 0;
      return [
        { label: 'Donate to the church', hint: '+karma', run: async () => {
          const n = await g.ui.promptNumber({ title: 'Donation', text: 'Pastor Prosper: "Give, and it shall be given unto you. Probably. Terms and conditions apply."', max: p.money, min: 0, initial: Math.min(100, p.money) });
          if (!n || n > p.money) return;
          st.addMoney(-n, 'donation');
          t.donated = (t.donated || 0) + n;
          const k = Math.min(12, Math.floor(Math.sqrt(t.donated / 20))) - Math.min(12, Math.floor(Math.sqrt((t.donated - n) / 20)));
          if (k > 0) st.addStat('karma', k);
          sfx('coin');
          return say(g, 'Donation', k > 0 ? pick(['Pastor Prosper blesses you, then blesses the money twice as hard.', 'A choir boy hands you a receipt for your taxes. And for your soul.']) : 'Pastor Prosper: "The Lord appreciates it! He\'s... a little full today, though." (Karma gains max out per day.)', 'Pastor Prosper');
        } },
        { label: 'Confess your sins', hint: t.confess ? 'once a day' : '$20 "suggested" · -heat / +karma', disabled: !!t.confess, run: async () => {
          if (!st.spend(20, 'confession')) return;
          t.confess = true;
          g.time.advance(30);
          const sins = pick(['You tell him about the drugs. He asks for a sample. "For research."', 'You confess to stealing a pen from the bank. He gasps. Then steals your pen.', 'You confess to everything. He takes notes. For a "book".']);
          if (p.heat > 0) st.addHeat(-1);
          if (p.karma < 0) st.addStat('karma', 3); else st.addStat('karma', 1);
          return say(g, 'Confession Booth', `${sins}<br><br>"Say three Hail Marys and Venmo me." You feel lighter. ${p.heat > 0 ? '(Pastor Prosper calls a cop buddy. -1 heat.)' : ''}`, 'Pastor Prosper');
        } },
        { label: 'Volunteer at the soup kitchen', hint: t.soup ? 'once a day' : '3h · -25 energy · +karma', disabled: !!t.soup || p.energy < 25, run: async () => {
          t.soup = true;
          st.addStat('energy', -25);
          g.time.advance(180);
          st.addStat('karma', 4);
          st.addXP(10);
          return say(g, 'Soup Kitchen', pick(['You ladle soup for three hours. A hobo calls you "an angel". Another one tries to bite you. Balance.', 'The soup is mostly hot water and a ham bone named Gerald. People love it. You feel good about yourself. Weird.']));
        } },
        { label: 'Bingo night', hint: g.time.isBetween(18, 22) ? '$10 card · 1h' : 'evenings 6–10PM', disabled: !g.time.isBetween(18, 22), run: () => bingo() },
        { label: 'Sunday service', hint: sunday && g.time.isBetween(9, 12) ? 'free · +karma' : 'Sundays 9AM–noon', disabled: !(sunday && g.time.isBetween(9, 12)) || !!t.service, run: async () => {
          t.service = true;
          g.time.advance(120);
          st.addStat('karma', 3);
          st.addStat('cha', 0.3);
          return say(g, 'Sunday Service', 'Pastor Prosper preaches about the Prosperity Gospel: "Jesus wants you to have a boat." The collection plate comes around four times. You feel spiritually renewed and financially audited.');
        } },
        { label: 'Buy holy water', hint: '$20', run: () => g.items.buy('holy_water', 1) },
        { label: 'Pray for luck', hint: t.pray ? 'once a day' : (p.karma >= 20 ? 'free' : 'needs karma 20'), disabled: !!t.pray || p.karma < 20, run: () => { t.pray = true; game.sysFx.add({ id: 'lucky', min: 360, label: 'Blessed (lucky)' }); return say(g, 'Prayer', 'You pray. For once, someone up there picks up. You feel lucky for the next few hours.'); } },
      ];
    },
  }));

  async function bingo() {
    if (!st.spend(10, 'bingo')) return;
    game.time.advance(60);
    const r = Math.random() + (game.sysFx.has('lucky') ? 0.08 : 0);
    let prize = 0;
    if (r > 0.97) prize = 500; else if (r > 0.88) prize = 100; else if (r > 0.72) prize = 30;
    const flavor = pick([
      'Old Mrs. Henderson has 14 cards and a dauber in each hand. She glares at you like you killed her husband. (You didn\'t. Probably.)',
      'B-12. G-56. Someone yells "BINGO" falsely and is dragged out by three grandmas.',
      'The caller is Pastor Prosper, who reads every number like it\'s a sermon. "O... SIXTY... NINE." He winks. Nobody laughs. Except you. Alone.',
    ]);
    if (prize) { st.addMoney(prize, 'bingo'); sfx('win'); }
    return say(game, 'Bingo Night', `${flavor}<br><br>${prize ? `<b class="ui-good">BINGO! You win ${fmtMoney(prize)}.</b> The grandmas will remember your face.` : 'You don\'t win. A grandma pats your hand and steals your dauber.'}`);
  }

  // ================= daily =================
  function daily() {
    const p = st.p;
    bankDaily();
    if (p.flags.insurance && p.sys.insuranceUntil && game.time.day > p.sys.insuranceUntil) {
      st.setFlag('insurance', false);
      game.ui.toast('Your health insurance expired. You are once again legally made of glass.', 'bad', 4000);
    }
  }

  return { daily, deposit, withdraw, loanMax };
}
