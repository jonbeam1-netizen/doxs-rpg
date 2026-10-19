import { FACTIONS, SMUGGLING, PROPHECIES, CHARACTERS } from '../data/quests.js';
import { fmtMoney, pick, randInt, chance, clamp } from '../core/util.js';

// Location handlers owned by the quests module:
//   hobo_camp, city_hall, gang_hq (rats | syndicate), bunker, warehouse
// plus repeatable faction jobs and Warehouse 13 smuggling runs.

const BUSINESS_TYPES = ['bar', 'diner', 'liquor', 'tattoo', 'fortune', 'pawn', 'store', 'pizza', 'gun_shop', 'clothing', 'casino', 'nightclub', 'gym', 'gas', 'junkyard', 'chop_shop', 'fight_club'];

export function installPlaces(game, q) {
  const g = game;
  const today = () => g.time.day;
  const once = (key) => { const k = 'daily_' + key; if (g.state.getFlag(k) === today()) return false; g.state.setFlag(k, today()); return true; };
  const usedToday = (key) => g.state.getFlag('daily_' + key) === today();
  const nar = (lines) => q.fmt((Array.isArray(lines) ? lines : [lines]).map((l) => (l.startsWith('> ') || l.startsWith('@ ') ? l : '> ' + l)));

  // ================================================================ JOB DEFS
  const jobSteps = (data) => {
    const brief = data.brief || '';
    switch (data.type) {
      case 'brawl': return [{
        text: `${data.title}: beat down the ${data.label} in ${q.districtName(data.district)}.`,
        obj: { type: 'brawl', at: data.at, count: data.count, kind: data.kind || 'gang', tier: data.tier, label: data.label, radius: 9 },
        arrive: [{ who: 'nar', t: [`> ${pick(['There they are. Leaning on a car that isn\'t theirs, being loud about things they don\'t understand.', 'They see you coming. One of them drops his sandwich. That\'s how you know he\'s serious.', 'A small crowd gathers. Rotwell loves a fight more than it loves breathing.'])}`] }],
      }];
      case 'collect': return [{
        text: `${data.title}: collect from ${data.locName}.`,
        obj: { type: 'goto', loc: data.loc, radius: 7 },
        run: async () => {
          if (chance(0.62)) {
            await q.say([{ who: 'nar', t: [`> ${pick([
              'The owner sees you, sighs, and hands over an envelope that\'s already labeled "PROTECTION (UGH)".',
              'The owner pays in a mix of cash, coins, and one sincere apology. You take all three.',
              'The owner tries to offer you a coupon instead. You stare. The coupon becomes cash.',
              'The owner pays up, then asks if you\'re hiring. Everyone in Rotwell is looking for a way out.',
            ])}`] }]);
            return 'advance';
          }
          await q.say([{ who: 'nar', t: [`> ${pick(['The owner\'s nephew steps out from the back with a baseball bat and a bad attitude.', 'Turns out the owner hired his OWN protection. Two guys named Moose. Both of them.'])}`] }]);
          return (await q.brawl({ count: randInt(1, 2), kind: 'thug', tier: Math.max(1, data.tier - 1), label: 'Uncooperative Locals' })) ? 'advance' : 'stay';
        },
      }];
      case 'deliver': return [{
        text: `${data.title}: get the package to ${data.destName}${data.needCar ? ' (driving)' : ''}. Don't be late.`,
        obj: { type: 'goto', loc: data.loc, at: data.at, radius: 8, timer: data.timer, needCar: !!data.needCar, label: data.destName },
        give: 'q_package', take: 'q_package',
        arrive: [{ who: 'nar', t: [`> ${pick([
          'A guy in sunglasses takes the package without a word, sniffs it, nods, and disappears into an alley he definitely doesn\'t live in.',
          'The client counts the package. You didn\'t know you could count a package. He found a way.',
          'A woman in a velvet scarf takes it and tips you a breath mint. "You need it," she says. Fair.',
          'The buyer asks if you opened it. You say no. He says "good". The package shifts slightly. You both pretend it didn\'t.',
        ])}`] }],
      }];
      case 'visit': return [{
        text: `${data.title}: hit all the spots before time runs out.`,
        obj: { type: 'visit', points: data.points, radius: 6, timer: data.timer },
        visitText: [
          'Tagged! A giant rat with a crown, spray-painted on a Hilltop mansion wall. A butler faints.',
          'Tagged! You add a little mustache to the rat. Art evolves.',
          'Tagged! A rich kid takes a picture and says "omg so gritty". Ugh.',
        ],
      }];
      default: return [];
    }
  };

  for (const f of Object.keys(FACTIONS)) {
    const F = FACTIONS[f];
    q.register({
      id: 'job_' + f, kind: 'job', repeatable: true, giver: F.boss,
      title: `${F.name} Job`,
      summary: `Work for the ${F.name}.`,
      steps: (data) => jobSteps(data),
      reward: (gg, qq) => ({ money: qq.data.pay, rep: { [f]: qq.data.rep }, xp: 40 + qq.data.rep * 4, heat: qq.data.heat || 0 }),
      onFail: () => q.addRep(f, -2),
    });
  }
  q.register({
    id: 'smuggle', kind: 'job', repeatable: true, giver: 'dot', title: 'Smuggling Run',
    summary: 'Dockside Dot needs a crate moved, fast and quiet.',
    steps: (data) => [{
      text: `Drive the ${data.cargoName} to ${data.destName} before the buyer bails.`,
      obj: { type: 'goto', loc: data.loc, radius: 9, timer: data.timer, needCar: true, label: data.destName },
      give: 'q_crate', take: 'q_crate',
      arrive: [{ who: 'nar', t: [`> ${pick([
        'The buyer, a man wearing two eyepatches (fashion, he insists), pays in cash and walks off with the crate under one arm.',
        'Three guys load the crate into a van marked "TOTALLY NORMAL FLOWERS". The van is full of flowers. And guns. Mostly guns.',
        'The buyer opens the crate a crack, looks inside, closes it, and silently hands you extra money. You will never know.',
        'A woman in a Grimco lab coat signs for the crate on a clipboard, then shreds the clipboard. Good doing business.',
      ])}`] }],
    }],
    reward: (gg, qq) => ({ money: qq.data.pay, xp: 50, heat: qq.data.heat || 0 }),
    onFail: () => { const s = g.state.getFlag('dot_trust', 0) || 0; g.state.setFlag('dot_trust', Math.max(0, s - 1)); },
    onComplete: () => g.state.setFlag('dot_trust', (g.state.getFlag('dot_trust', 0) || 0) + 1),
  });

  // Pick a destination location away from the player.
  const farLoc = (filter = () => true, minDist = 60) => {
    const pos = q.playerPos() || { x: 0, z: 0 };
    const all = g.locations.list.filter((l) => filter(l));
    const far = all.filter((l) => Math.hypot((l.doorX ?? l.x) - pos.x, (l.doorZ ?? l.z) - pos.z) > minDist);
    return pick(far.length ? far : all);
  };
  const distTo = (x, z) => { const p = q.playerPos() || { x: 0, z: 0 }; return Math.hypot(x - p.x, z - p.z); };

  function startFactionJob(f) {
    const F = FACTIONS[f];
    const t = pick(F.jobs);
    const ri = q.rankIndex(f);
    const mult = 1 + ri * 0.35;
    const data = { type: t.type, title: t.title, pay: Math.round(randInt(t.pay[0], t.pay[1]) * mult / 5) * 5, rep: t.rep + ri, heat: t.heat || 0, tier: 1 + Math.floor(ri / 1.5) };
    const hqDistrict = g.locations.get(F.hq)?.district;
    let brief = t.brief;
    if (t.type === 'brawl') {
      const ds = ['downtown', 'gutterside', 'rustyards', 'dustbowl', 'hilltop'].filter((d) => d !== hqDistrict || chance(0.3));
      const d = pick(ds);
      Object.assign(data, { district: d, at: q.districtPoint(d), count: 2 + Math.min(3, ri), kind: t.kind || 'gang', label: t.label });
      brief = brief.replace('{district}', q.districtName(d));
    } else if (t.type === 'collect') {
      const l = farLoc((l) => BUSINESS_TYPES.includes(l.type) && l.district !== hqDistrict, 40);
      Object.assign(data, { loc: l.id, locName: l.name });
      brief = brief.replace('{loc}', l.name);
    } else if (t.type === 'deliver') {
      let x, z, name, locId = null;
      if (t.district) { const p = q.districtPoint(t.district); x = p.x; z = p.z; name = `a drop point in ${q.districtName(t.district)}`; data.at = { x, z }; }
      else { const l = farLoc((l) => l.type !== 'gang_hq', 80); locId = l.id; x = l.doorX ?? l.x; z = l.doorZ ?? l.z; name = l.name; data.loc = locId; }
      const dist = distTo(x, z);
      data.needCar = !!t.needCar && !!g.vehicles;
      data.timer = Math.round(clamp(dist / (data.needCar || g.state.p.activeCar ? 9 : 5.5) + 40, 60, 300));
      data.destName = name;
      brief = brief.replace('{loc}', name).replace('{time}', `${Math.floor(data.timer / 60)}:${String(data.timer % 60).padStart(2, '0')}`);
    } else if (t.type === 'visit') {
      data.points = Array.from({ length: t.points || 3 }, () => ({ ...q.districtPoint(t.district), label: 'Tag spot' }));
      const pos = q.playerPos() || { x: 0, z: 0 };
      let len = 0, cx = pos.x, cz = pos.z;
      for (const p of data.points) { len += Math.hypot(p.x - cx, p.z - cz); cx = p.x; cz = p.z; }
      data.timer = Math.round(clamp(len / 5 + 60, 120, 360));
      brief = brief.replace('{time}', `${Math.floor(data.timer / 60)} minutes`);
    }
    data.brief = brief;
    data.payText = `${fmtMoney(data.pay)} + ${data.rep} rep`;
    return data;
  }

  // ================================================================ GANG HQ
  async function gangHq(gg, loc) {
    const f = loc.faction || (loc.id === 'rats_clubhouse' ? 'rats' : 'syndicate');
    const F = FACTIONS[f]; const boss = CHARACTERS[F.boss];
    const mine = q.faction() === f;
    const enemy = q.faction() === F.enemy;
    if (enemy || q.rep(f) <= -30) {
      const i = await g.ui.dialog({ title: loc.name, html: nar(F.hostile), options: [
        { label: 'Fight your way out', hint: 'brawl' }, { label: 'Run like hell', hint: '-10 energy' },
      ] });
      if (i === 0) {
        const won = await q.brawl({ count: 3, kind: 'gang', tier: 2, label: `${F.name} Bouncers` });
        if (won) { g.ui.toast(`You trashed the ${F.name}' doormen. They'll remember that.`, 'good'); q.addRep(F.enemy, 3); }
      } else { g.state.addStat('energy', -10); }
      return;
    }
    const lines = [pick(F.greet)];
    if (mine) lines.push(`> You're a ${q.rankName(f)} here. Rep: ${q.rep(f)}.`);
    else lines.push(`> Nobody's sure who let you in. Several people are sure they'd like you to leave.`);
    const opts = [];
    if (!mine && !q.faction()) {
      const ok = F.joinReq(g) && (!F.joinFee || g.state.canAfford(F.joinFee));
      opts.push({ label: `Ask to join the ${F.name}`, hint: ok ? (F.joinFee ? fmtMoney(F.joinFee) : '') : `needs ${F.joinReqText}`, disabled: !ok, onSelect: () => joinFlow(f) });
    }
    if (mine) {
      const active = q.isActive('job_' + f);
      opts.push({ label: active ? 'Ask for another job' : 'Take a job', hint: active ? 'finish your current one first' : 'cash + rep', disabled: active, onSelect: () => offerJob(f) });
      if (active) opts.push({ label: 'Bail on your current job', hint: '-2 rep', onSelect: () => q.abandon('job_' + f) });
      opts.push({ label: 'Hang out with the crew', hint: usedToday('hang_' + f) ? 'already did today' : '+rep, 1 hour', disabled: usedToday('hang_' + f), onSelect: () => hangOut(f) });
    }
    opts.push({ label: `Talk to ${boss.name}`, onSelect: () => q.talkTo(F.boss) });
    if (mine) opts.push({ label: 'Quit the gang', hint: 'they\'ll beat you out', onSelect: () => quitFlow(f) });
    opts.push({ label: 'Leave' });
    await g.ui.dialog({ title: loc.name, html: nar(lines), options: opts });
  }

  async function joinFlow(f) {
    const F = FACTIONS[f];
    if (f === 'syndicate') {
      const i = await g.ui.dialog({ title: F.name, speaker: 'TWO-TON TITO', html: q.fmt(['Membership is five hundred. Non-refundable. Non-negotiable. Non-optional, now that you\'ve asked. *He cracks his knuckles. It sounds like a car crash.*']), options: [{ label: `Pay ${fmtMoney(F.joinFee)}`, disabled: !g.state.canAfford(F.joinFee) }, { label: 'Never mind' }] });
      if (i !== 0 || !g.state.spend(F.joinFee, 'Syndicate dues')) return;
      await q.say([{ who: 'vivienne', t: ['Welcome to the family, darling. Lord Snifferton approves. He bit you, which means he approves. Do try not to bleed on the velvet.'] }]);
    } else {
      await q.say([{ who: 'sal', t: ['You wanna be a Rat? Okay. Initiation: you gotta eat one thing outta the clubhouse fridge. Any one thing.', '> You open the fridge. Something inside opens its eyes. You eat the mustard. Just the mustard. Straight from the bottle.', 'HAHA! Respect. Welcome to the Rats, ya beautiful animal.'] }]);
    }
    q.joinFaction(f);
  }

  async function quitFlow(f) {
    const F = FACTIONS[f];
    const ok = await g.ui.confirm(`Quit the ${F.name}? They don't do exit interviews. They do exit beatings.`, { yes: 'I\'m out', no: 'Stay' });
    if (!ok) return;
    const won = await q.brawl({ count: 4, kind: 'gang', tier: 2, label: `${F.name} (beat-out)` });
    if (won) { q.leaveFaction(); g.ui.bigText('YOU\'RE OUT', `You fought your way out of the ${F.name}. Nobody follows you. Mostly because they can't stand up.`, 3200); }
    else g.ui.toast('They beat you, then decided you still owe them. You\'re still in the gang.', 'bad', 4000);
  }

  async function hangOut(f) {
    if (!once('hang_' + f)) return;
    g.time.advance(60);
    const lines = f === 'rats' ? [
      'You play cards with the Rats. The deck has 61 cards. Nobody can explain it. You win a pack of gum and a tooth.',
      'Pus wakes up in his dryer and tells a story about a heist so stupid it loops back around to genius. Everyone cries laughing.',
      'You help repaint the ice cream truck. It\'s now a slightly different shade of "tetanus".',
    ] : [
      'You sip champagne with the Velvet crew and learn which fork is for stabbing. All of them. The answer is all of them.',
      'Two-Ton Tito shows you photos of his cats. There are forty photos. There are forty cats.',
      'The harpist plays a song about tax evasion. It\'s beautiful. You tear up a little.',
    ];
    await g.ui.dialog({ title: FACTIONS[f].name, html: nar(pick(lines)), options: [{ label: 'Good times.' }] });
    q.addRep(f, 2);
  }

  async function offerJob(f) {
    const F = FACTIONS[f];
    const data = startFactionJob(f);
    const i = await g.ui.dialog({ title: `${F.name} — ${data.title}`, speaker: CHARACTERS[F.boss].name.toUpperCase(), html: q.fmt([data.brief]), options: [
      { label: 'I\'m on it.', hint: data.payText }, { label: 'Got anything else?', hint: 'reroll' }, { label: 'Not now.' },
    ] });
    if (i === 0) { q.start('job_' + f, data); q.track('job_' + f); }
    else if (i === 1) offerJob(f);
  }

  g.locations.register('gang_hq', (gg, loc) => { gangHq(gg, loc); });

  // Bosses also hand out work on the street.
  for (const f of Object.keys(FACTIONS)) {
    const F = FACTIONS[f];
    q.charMenus[F.boss] = () => (q.faction() === f ? [{
      label: q.isActive('job_' + f) ? 'Got any more work?' : 'Got any work for me?', hint: q.isActive('job_' + f) ? 'finish your job first' : 'cash + rep',
      disabled: q.isActive('job_' + f), run: () => offerJob(f),
    }] : []);
  }

  // ================================================================ HOBO CAMP
  async function hoboCamp(gg, loc) {
    const lines = [pick([
      'Under the overpass: a burning barrel, a shopping cart throne, a dozen cardboard boxes arranged like a tiny, sad suburb. The traffic overhead sounds like the ocean, if the ocean honked.',
      'The camp is busy. A hobo named Tuesday is cooking a shoe. Another is giving a TED talk to a pigeon. Reg is presiding over all of it from his cart.',
      'Rain drips through the overpass in exactly one spot. The hobos have built a little shrine under it. They call it "The Faucet of Truth".',
    ])];
    if (g.state.getFlag('ending_hobo')) lines.push('> The hobos bow as you arrive. Someone has repainted your cart throne in gold spray paint. It\'s still sticky.');
    const opts = [
      { label: 'Talk to Crusty Reg', hint: q.charIndicator('reg') ? (q.charIndicator('reg') === '?' ? 'quest' : 'new!') : '', onSelect: () => q.talkTo('reg') },
      { label: 'Talk to Chad Bitsworth', hint: q.charIndicator('chad') ? 'quest' : '', onSelect: () => q.talkTo('chad') },
    ];
    if (!g.state.getFlag('reg_paid')) opts.push({ label: 'Pay Reg the $20 you owe him', hint: '$20, +karma', disabled: !g.state.canAfford(20), onSelect: () => { if (g.state.spend(20)) { g.state.setFlag('reg_paid'); g.state.addStat('karma', 2); g.ui.toast('Reg bites the bill to check it\'s real. Then he eats it. Then he un-eats it. "Debt cleared!"', 'good', 4200); } } });
    opts.push(
      { label: 'Sleep in a cardboard box', hint: 'restore some energy, risky', onSelect: () => sleepBox() },
      { label: 'Raid the dumpster buffet', hint: usedToday('dumpster') ? 'picked clean today' : 'free food, probably', disabled: usedToday('dumpster'), onSelect: () => dumpster() },
      { label: 'Listen to Reg\'s wisdom', hint: usedToday('wisdom') ? 'come back tomorrow' : '+1 INT, once a day', disabled: usedToday('wisdom'), onSelect: () => wisdom() },
      { label: 'Warm your hands by the barrel', onSelect: () => barrel() },
      { label: 'Donate $20 to the camp', hint: usedToday('donate') ? 'once a day' : '+2 karma', disabled: usedToday('donate') || !g.state.canAfford(20), onSelect: () => { if (g.state.spend(20, 'charity')) { once('donate'); g.state.addStat('karma', 2); g.ui.toast(pick(['A hobo blesses you. It\'s a wet blessing.', 'Tuesday buys a hot dog and names it after you.', 'Chad tries to invest it. Reg slaps his hand.']), 'good', 3600); } } },
      { label: 'Leave' },
    );
    await g.ui.dialog({ title: loc.name, html: nar(lines), options: opts });
  }

  async function sleepBox() {
    const mins = g.time.minutesUntil(7);
    g.time.advance(Math.min(mins, 10 * 60));
    const p = g.state.p;
    g.state.addStat('energy', Math.round(p.maxEnergy * 0.55));
    g.state.addStat('hp', 8);
    g.state.setFlag('slept_box', true);
    let extra = '';
    if (p.money > 20 && chance(0.3)) {
      const lost = Math.min(Math.round(p.money * 0.1), 200);
      g.state.addMoney(-lost, 'hobo tax');
      extra = ` A hobo named Tuesday "borrowed" ${fmtMoney(lost)} from your sock while you slept. He left an IOU drawn in crayon.`;
    }
    await g.ui.dialog({ title: 'Cardboard Box Hotel', html: nar([pick([
      'You crawl into a box that says FRAGILE. Accurate. You sleep like a baby: you wake up crying twice and wet once. It was rain. Probably.',
      'The box smells like a wet dog. A wet dog then crawls in with you. You both agree not to talk about it.',
      'You dream of a world without rent. You wake up with a pigeon nesting in your hair. It seems happy. That\'s something.',
    ]) + extra]), options: [{ label: 'Stretch. Everything cracks.' }] });
  }

  async function dumpster() {
    if (!once('dumpster')) return;
    if (chance(0.7)) {
      g.state.addStat('energy', 20); g.state.addStat('hp', 6);
      await g.ui.dialog({ title: 'Dumpster Buffet', html: nar(pick(['Half a burrito, still warm. You don\'t ask why it\'s warm. You eat it with the confidence of a man who has given up.', 'A whole box of Pizza Butt crusts. The crust is the best part. That\'s what you tell yourself.', 'An untouched wedding cake topper. And half the wedding cake. Somebody\'s marriage didn\'t make it to dessert.'])), options: [{ label: 'Delicious. Tragic, but delicious.' }] });
    } else {
      g.state.damage(10, 'food poisoning');
      await g.ui.dialog({ title: 'Dumpster Buffet', html: nar(pick(['It was a Rotwell Meat Loaf. You knew. You KNEW. Your stomach makes a noise like a dial-up modem.', 'The yogurt was not yogurt. You will be thinking about this one for years.'])), options: [{ label: 'Ugh.' }] });
    }
  }

  async function wisdom() {
    if (!once('wisdom')) return;
    g.time.advance(30);
    g.state.addStat('int', 1, 'hobo wisdom');
    await g.ui.dialog({ title: 'The Wisdom of the Crust', speaker: 'CRUSTY REG', html: q.fmt([pick(PROPHECIES)]), options: [{ label: 'Deep. Gross, but deep.' }] });
  }

  async function barrel() {
    g.state.addStat('hp', 3);
    g.time.advance(20);
    await g.ui.dialog({ title: 'The Barrel', html: nar(pick([
      'You warm your hands. A hobo next to you tells you he used to be a dentist. Then he tells you he used to be a pirate. Then a dentist again. He is very consistent about the dentist.',
      'The fire crackles. Someone passes you a jug. You take a sip. It\'s soup. Then it\'s not soup. Then it\'s soup again.',
      'Reg points at the fire. "Every flame is a little sun, Plunger. The real one\'s been missing for twenty years." Nobody knows what he means. You get a chill anyway.',
    ])), options: [{ label: 'Cozy. Disgusting, but cozy.' }] });
  }

  g.locations.register('hobo_camp', (gg, loc) => { hoboCamp(gg, loc); });

  // ================================================================ CITY HALL
  async function cityHall(gg, loc) {
    const isMayor = !!g.state.getFlag('ending_mayor');
    const lines = isMayor
      ? ['> City Hall. Your portrait hangs in the lobby now. Someone has already drawn a mustache on it. You decide to leave it: it\'s democracy.']
      : ['> Marble floors, a ceiling fan with a dead pigeon stuck in it, and an oil portrait of Mayor Swindell wearing a cape. A sign reads: CITIZEN COMPLAINTS — PLEASE SCREAM INTO THE BOX.'];
    const opts = [
      { label: 'Window 3 (Gladys)', hint: q.charIndicator('gladys') === '?' ? 'quest' : 'permits, fines, bees', onSelect: () => q.talkTo('gladys') },
      { label: isMayor ? 'Go to your office' : 'Request a meeting with the Mayor', onSelect: () => (isMayor ? mayorOffice() : q.talkTo('mayor')) },
      { label: 'Scream into the complaint box', hint: usedToday('scream') ? 'your throat hurts' : 'therapeutic', disabled: usedToday('scream'), onSelect: () => scream() },
      { label: 'Read the public bulletin board', hint: 'leads & rumors', onSelect: () => bulletin() },
      { label: 'Leave' },
    ];
    await g.ui.dialog({ title: loc.name, html: nar(lines), options: opts });
  }

  q.charMenus.gladys = () => {
    const heat = g.state.p.heat | 0;
    const cost = 250 * heat;
    return [
      { label: 'Pay off your outstanding "fines"', hint: heat > 0 ? `${fmtMoney(cost)}, clears heat` : 'you\'re clean', disabled: heat <= 0 || !g.state.canAfford(cost), run: async () => {
        if (!g.state.spend(cost, 'fines')) return;
        g.state.addHeat(-5);
        await q.say([{ who: 'gladys', t: ['*Stamp. Stamp. STAMP.* Your record is now spotless. Well. Spotted less. The bees took a cut.'] }]);
      } },
      { label: 'Ask about the bees', run: () => q.say([{ who: 'gladys', t: ['They\'re unionized. They get dental. I don\'t. I\'m allergic to bees. I\'ve been stung four thousand times. At this point I\'m mostly antibodies.'] }]) },
    ];
  };

  q.charMenus.mayor = () => [
    { label: 'Ask him about Grimco', run: () => q.say([{ who: 'mayor', t: ['Grimco? Never heard of it. *He is wearing a Grimco tie, Grimco cufflinks, and a lanyard that says GRIMCO VIP.* Lovely company. Very generous. To the CITY. Not me. Next question.'] }]) },
    { label: 'Ask him about the Lid', run: () => q.say([{ who: 'mayor', t: ['The LID? Ha! Ha ha. HA. *He sweats through his tuxedo.* That\'s a hobo thing. A hobo conspiracy. Hobos. Love \'em. Can\'t vote, but love \'em. SECURITY!'] }]) },
  ];

  async function mayorOffice() {
    const salary = once('salary');
    if (salary) g.state.addMoney(500, 'mayor salary');
    await g.ui.dialog({ title: 'The Mayor\'s Office', html: nar([
      'Your office: a big desk, a bigger chair, and a filing cabinet full of Swindell\'s old snacks. Thorne has left a salad on your desk with a note: "EAT A VEGETABLE, MAYOR."',
      salary ? 'A paycheck is waiting for you: $500. Public service! (Taxpayer-funded, morally acceptable, still kind of thrilling.)' : 'You already collected today\'s salary. Public servants serve. Then they wait until tomorrow.',
    ]), options: [{ label: 'Sign something important-looking' }] });
  }

  async function scream() {
    if (!once('scream')) return;
    const r = pick([
      'You scream into the box. The box screams back. Gladys doesn\'t look up. "It does that."',
      'You scream about the rent. A tiny slip of paper comes out: "YOUR COMPLAINT HAS BEEN RECEIVED AND IGNORED. THANK YOU."',
      'You scream so hard a bee leaves Gladys\'s hair to check on you. It\'s the kindest thing anyone\'s done for you all week.',
      'You scream. Somewhere deep below City Hall, something screams too. In B-flat.',
    ]);
    g.state.addStat('cha', 0.5, 'catharsis');
    await g.ui.dialog({ title: 'The Complaint Box', html: nar(r), options: [{ label: 'Feel 3% better' }] });
  }

  async function bulletin() {
    const leads = [];
    for (const [cid, c] of Object.entries(CHARACTERS)) {
      const offers = q.offersFor(cid);
      if (!offers.length) continue;
      const l = g.locations.get(c.loc);
      leads.push(`• <b>${offers[0].title}</b> — ask ${c.name}${l ? ` near ${l.name}` : ''}.`);
    }
    const rumors = [
      'LOST: one (1) glass eye. Answers to "Eye". — M. Ooze',
      'HELP WANTED: Pizza Butt. Must have car, pulse. Pulse optional.',
      'NOTICE: Highway 9 is closed for repairs. Highway 9 has been closed for repairs for 20 years.',
      'MISSING: Councilman Hobbs. Last seen dressed as a pigeon. Do not approach the pigeon.',
      'FOR SALE: Gently used rug. Do not ask. — L.L.',
      'Grimco reminds you: The Sky Is Fine. Stop Looking At It.',
    ];
    const html = `<div class="ui-section">Leads</div>${leads.length ? leads.slice(0, 8).map((l) => `<div class="q-lead">${l}</div>`).join('') : '<div class="ui-muted">Nothing new. Get stronger, smarter, nicer, or nastier.</div>'}
      <div class="ui-section">Tacked-up junk</div>${rumors.sort(() => Math.random() - 0.5).slice(0, 3).map((r) => `<div class="q-lead"><i>${r}</i></div>`).join('')}`;
    await g.ui.dialog({ title: 'Public Bulletin Board', html, options: [{ label: 'Back' }] });
  }

  g.locations.register('city_hall', (gg, loc) => { cityHall(gg, loc); });

  // ================================================================ BUNKER 9
  async function bunker(gg, loc) {
    g.state.setFlag('met_pickles', true);
    const escaped = g.state.getFlag('ending_escape');
    const lines = escaped
      ? ['> The bunker door hangs open. Daylight — actual daylight — pours down the stairwell. Corporal Pickles is sunbathing in his lawn chair with Madame Ooze. They wave.']
      : ['> Restricted Bunker 9. Razor wire, a buzzing fence, and a plastic flamingo in a gas mask. A sign: "NOTHING TO SEE HERE. SERIOUSLY. GO HOME. — GRIMCO".', '> The ground hums. In B-flat.'];
    const opts = [
      { label: 'Talk to Cpl. Pickles', hint: q.charIndicator('pickles') ? 'quest' : '', onSelect: () => q.talkTo('pickles') },
      { label: 'Touch the fence', hint: 'bad idea', onSelect: async () => {
        g.state.damage(6, 'electric fence');
        await g.ui.dialog({ title: 'The Fence', html: nar(pick(['ZZZAP. Your eyebrows stand up and leave. They\'ll be back. Probably.', 'ZZZAP. For a moment you can see through time. It\'s mostly more Rotwell.', 'ZZZAP. Pickles doesn\'t even look up. "Everybody does it once."'])), options: [{ label: 'Ow.' }] });
      } },
      { label: 'Read the warning signs', onSelect: () => g.ui.dialog({ title: 'Warning Signs', html: nar([
        '"DANGER: HIGH VOLTAGE." "DANGER: LOW MORALE." "DANGER: DO NOT FEED THE GUARD."',
        '"THIS FACILITY HAS GONE 0 DAYS WITHOUT A MEMORY INCIDENT."',
        '"IF YOU CAN READ THIS, YOU ARE TOO CLOSE. IF YOU CAN\'T, PLEASE CONTACT GRIMCO LITERACY SERVICES."',
      ]), options: [{ label: 'Unsettling.' }] }) },
    ];
    if (escaped) opts.push({ label: 'Walk down the stairs and look at the sky', onSelect: () => g.ui.dialog({ title: 'The Sky', html: nar(['You look up through the open Lid. Real sky. Blue-ish. A cloud drifts by shaped like a middle finger. Rotwell\'s still Rotwell. But it can breathe.']), options: [{ label: 'Breathe.' }] }) });
    opts.push({ label: 'Leave' });
    await g.ui.dialog({ title: loc.name, html: nar(lines), options: opts });
  }
  g.locations.register('bunker', (gg, loc) => { bunker(gg, loc); });

  // ================================================================ WAREHOUSE 13
  function smugglingOptions() {
    if (q.isActive('smuggle')) {
      return [{ label: 'Abandon the current run', hint: 'Dot will be annoyed', run: () => q.abandon('smuggle') }];
    }
    return SMUGGLING.map((c) => ({
      label: `Run: ${c.name}`, hint: `~${fmtMoney(c.base)}+${c.heat ? ', hot cargo' : ''}`,
      run: () => startSmuggle(c),
    }));
  }

  async function startSmuggle(c) {
    if (g.vehicles && !g.player.vehicle && !(g.state.p.cars || []).length) {
      await q.say([{ who: 'dot', t: ['No wheels, no deal, hon. Go get a car. Buy one, steal one, build one out of shopping carts, I don\'t care. Then come back.'] }]);
      return;
    }
    const l = farLoc((l) => l.district !== 'rustyards' && l.type !== 'gang_hq', 90);
    const x = l.doorX ?? l.x, z = l.doorZ ?? l.z;
    const dist = distTo(x, z);
    const trust = g.state.getFlag('dot_trust', 0) || 0;
    const timer = Math.round(clamp((dist / 9 + 45) * c.timeMult, 60, 300));
    const pay = Math.round((c.base + dist * 1.6) * (1 + Math.min(trust, 20) * 0.03) / 5) * 5;
    const data = { cargo: c.id, cargoName: c.name, loc: l.id, destName: l.name, timer, pay, heat: c.heat, payText: fmtMoney(pay), brief: `${c.name}: ${c.blurb} Deliver it to ${l.name} in ${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, '0')}.` };
    const i = await g.ui.dialog({ title: 'Warehouse 13', speaker: 'DOCKSIDE DOT', html: q.fmt([c.blurb, `Buyer's waiting at ${l.name}. Clock starts now: ${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, "0")}. Pays ${fmtMoney(pay)}.`]), options: [{ label: 'Load it up', hint: fmtMoney(pay) }, { label: 'Nah' }] });
    if (i !== 0) return;
    q.start('smuggle', data);
    q.track('smuggle');
  }

  q.charMenus.dot = () => smugglingOptions();

  async function warehouse(gg, loc) {
    const lines = ['> Warehouse 13: towers of unmarked crates, a forklift with a "HOW\'S MY DRIVING? DON\'T CALL" sticker, and a radio playing smooth jazz at a volume designed to cover screams.',
      `> Dockside Dot looks up from a clipboard. "${pick(['You here to work or to stare? Staring\'s extra.', 'Crates don\'t move themselves, hon. Well. One of \'em did. We don\'t talk about crate 47.', 'Rules: don\'t open nothing, don\'t sniff nothing, don\'t name nothing.'])}"`];
    const opts = smugglingOptions().map((o) => ({ label: o.label, hint: o.hint, onSelect: () => o.run() }));
    opts.push({ label: 'Ask what\'s in the crates', onSelect: () => q.say([{ who: 'dot', t: [pick(['Socks. Ten thousand socks. All left feet. Don\'t ask me why. The buyer has a lot of left feet.', 'Crate 12 is "medical supplies". Crate 13 is "medical supplies, but angrier".', 'You know what curiosity did to the cat? It got a job at Warehouse 13. Now it\'s a crate.'])] }]) });
    opts.push({ label: 'Leave' });
    await g.ui.dialog({ title: loc.name, html: nar(lines), options: opts });
  }
  g.locations.register('warehouse', (gg, loc) => { warehouse(gg, loc); });

  // Pickles: friendlier after the pizza.
  q.charMenus.pickles = () => (g.state.getFlag('pickles_pizza') ? [{ label: 'Ask about the bunker', run: () => q.say([{ who: 'pickles', t: [g.state.getFlag('knows_lid') ? 'You went in, didn\'t you? I can tell. You got that look. Like you found out your whole life is a group project nobody\'s grading.' : 'Listen, pizza buddy. Between you and me? Sometimes at night the sky... flickers. Like a TV. I don\'t think skies flicker.'] }]) }] : []);

  return { startFactionJob, offerJob };
}
