// Stat training: Iron Lung Gym (STR), Rotwell Public Library (INT), Rotwell University (courses).
// state.p.education[courseId] = { sessions, lastDay, done }
// state.p.sys.gym = { until (day), lifetime }
import { COURSES } from '../data/courses.js';
import { fmtMoney, pick, chance, randInt, clamp } from '../core/util.js';
import { train, today, hasCourse, reqCheck, reqHtml, reqMissing, activity, hourName, byTime } from './common.js';
import { placeMenu, say, choose, shopPanel } from './ui-kit.js';

export function installTraining(game) {
  const st = game.state;

  // ================= GYM =================
  const member = () => st.p.sys.gym.lifetime || st.p.sys.gym.until >= game.time.day;

  async function workout(kind) {
    const p = st.p;
    const W = {
      lift: { min: 60, energy: 12, str: 1.4, text: ['You bench press until a vein in your forehead says hello.', 'You curl in the squat rack. Brick screams like you shot his dog.', 'You do one more rep. Then another. Then you see your grandma, who is dead.'] },
      heavy: { min: 180, energy: 34, str: 4.6, text: ['Leg day. You will never walk normally again. You will walk like a cowboy who lost a bet.', 'Three hours of deadlifts. Your spine is now a suggestion.', 'Brick puts you through "The Mastodon Protocol". You throw up in a bucket labeled "FOR YOU".'] },
      cardio: { min: 60, energy: 10, str: 0.45, text: ['You run on the treadmill watching a cooking show. You burn 300 calories and gain 400 in envy.', 'The treadmill next to you is a 70-year-old woman. She laps you. On a treadmill. Somehow.'] },
      spar: { min: 60, energy: 16, str: 1.9, hp: 10, text: ['Brick spars with you. "Hands up! HANDS UP!" Your hands are up. They were always up. He hits you anyway.', 'You land one punch on Brick. He laughs, then sits on you. For 20 minutes.'] },
    }[kind];
    if (!activity(game, { minutes: W.min, energy: W.energy })) return;
    if (W.hp) st.damage(W.hp, 'spar');
    const gained = train(game, 'str', W.str, 'gym');
    st.addXP(Math.round(W.min / 15));
    let extra = '';
    if (kind === 'cardio' && p.maxEnergy < 200 && chance(0.3)) { p.maxEnergy += 1; st.changed('energy'); extra = '<br><span class="ui-good">Your stamina improves: +1 max energy.</span>'; }
    if (game.sysFx.has('roids') && chance(0.25)) extra += '<br><em>Roid rage! You scream at a water fountain. It had it coming.</em>';
    await say(game, 'Iron Lung Gym', `${pick(W.text)}${gained ? `<br><br>+${Math.round(gained * 100) / 100} STR` : ''}${extra}`);
  }

  game.locations.register('gym', (g, loc) => placeMenu(g, loc, {
    hours: [5, 23],
    speaker: 'Brick Mastodon',
    closed: () => 'Iron Lung is closed. Through the window you see Brick Mastodon still lifting in the dark. He doesn\'t leave. He might live here.',
    text: () => {
      const p = st.p;
      const look = p.str >= 100 ? '"Look at you. LOOK AT YOU. You\'re a MOUNTAIN. A beautiful, stupid mountain."'
        : p.str >= 40 ? '"Getting there, champ. Getting there. You\'re like a medium-size mountain. A hill."'
          : '"Oh no. Oh, buddy. Oh, little noodle. We have WORK to do."';
      return `${byTime(g, {
        morning: 'The 5AM crowd: veterans, psychopaths and one guy who has been on the stairmaster since 2011.',
        day: 'Grunting. Clanging. A smell like a gym sock marinated in Axe body spray.',
        evening: 'The after-work rush. Someone is filming themselves deadlifting. They drop it on their foot. Content!',
        night: 'Nearly empty. Just you, Brick, and the hum of the protein-shake fridge.',
      })}<br><br>Brick Mastodon, a man made entirely of veins, sizes you up: ${look}<br><span class="sys-hint">Membership: ${p.sys.gym.lifetime ? 'LIFETIME' : member() ? `through day ${p.sys.gym.until}` : 'none'}</span>`;
    },
    options: () => {
      const p = st.p;
      const m = member();
      const out = [];
      if (!m) {
        out.push({ label: 'Buy a day pass', hint: '$12', run: () => { if (st.spend(12, 'gym')) { p.sys.gym.until = game.time.day; game.ui.toast('Day pass! Wristband says "GUEST (WEAK)".', 'good'); } } });
        out.push({ label: 'Monthly membership', hint: '$150 / 30 days', run: () => { if (st.spend(150, 'gym')) { p.sys.gym.until = game.time.day + 29; game.ui.toast('Member! You get a keycard and a free towel (used).', 'good'); } } });
      }
      if (!p.sys.gym.lifetime) out.push({ label: 'Lifetime membership', hint: '$2,500', run: () => { if (st.spend(2500, 'gym')) { p.sys.gym.lifetime = true; game.ui.toast('LIFETIME MEMBER. Brick gives you a hug. Three ribs crack. Worth it.', 'good', 3500); } } });
      out.push({ label: 'Pump iron', hint: '1h · -12 energy', disabled: !m, run: () => workout('lift') });
      out.push({ label: 'Heavy session with Brick', hint: '3h · -34 energy', disabled: !m, run: () => workout('heavy') });
      out.push({ label: 'Treadmill', hint: '1h · -10 energy · stamina', disabled: !m, run: () => workout('cardio') });
      out.push({ label: 'Spar in the ring', hint: p.str < 15 ? 'needs STR 15' : '1h · -16 energy · hurts', disabled: !m || p.str < 15, run: () => workout('spar') });
      out.push({ label: 'Gym showers', hint: 'free', disabled: !m, run: () => { g.time.advance(15); game.sysFx.add({ id: 'fresh', min: 360, temp: { cha: 1 } }); return say(g, 'Gym Showers', pick(['Three naked old men discuss the stock market. You learn about bonds. You did not want to learn about bonds.', 'The water is cold. The floor is warm. You don\'t want to know why.'])); } });
      out.push({ label: 'Juice bar', run: () => shopPanel(g, { title: 'Juice Bar', speaker: 'Brick Mastodon', intro: '"Protein! PROTEIN! Your body is a temple. A temple made of chicken."', sections: [{ products: [
        { name: 'Swole Sludge Protein', desc: game.items.def('protein_shake').desc, price: 12, qty: true, buy: (q) => game.items.buy('protein_shake', q, 12) },
        { name: 'Kardiak Arrest Energy', desc: game.items.def('energy_drink').desc, price: 6, qty: true, buy: (q) => game.items.buy('energy_drink', q, 6) },
      ] }] }) });
      out.push({ label: 'Talk to Juicy Lou in the locker room', hint: 'shady', run: () => juicyLou() });
      const chad = g.sysDating?.option?.('chad', loc);
      if (chad) out.push(chad);
      return out;
    },
  }));

  async function juicyLou() {
    const i = await game.ui.dialog({
      title: 'Locker Room', speaker: 'Juicy Lou',
      html: 'A man with a tiny head on an enormous body whispers from behind a locker. "Psst. You wanna get BIG? Like, unnaturally, legally-questionable big? Juice-B-Gone. Double gains for a day. Side effects include: acne, rage, crying at commercials, and a certain... downsizing. Downstairs."',
      options: [{ label: 'Buy Juice-B-Gone', hint: '$250' }, { label: 'Ask about side effects', hint: 'more' }, { label: 'Back away slowly' }],
    });
    if (i === 0) game.items.buy('steroids', 1, 250);
    if (i === 1) return say(game, 'Locker Room', 'Lou: "Side effects? Pfft. Look at me. LOOK AT ME." His left pec twitches on its own. His voice cracks. He is 26 and has the skin of a pepperoni.', 'Juicy Lou');
  }

  // ================= LIBRARY =================
  game.locations.register('library', (g, loc) => placeMenu(g, loc, {
    hours: [8, 21],
    speaker: 'Mrs. Shush',
    closed: () => 'The library is closed. The book drop has been graffitied into "BOOK POOP". Someone has, in fact, pooped in it.',
    text: () => `${pick([
      'Mrs. Shush, the librarian, glares at you over her bifocals. She hasn\'t blinked since the Carter administration.',
      'A homeless guy is asleep on an encyclopedia. A teen is watching something loud on a public computer. Mrs. Shush is losing her mind, silently.',
      'The library smells like old paper, floor wax, and the sweaty guy who\'s always on computer 3.',
    ])}<br><span class="sys-hint">Reading is free. Your brain just has to pay attention.</span>`,
    options: () => {
      const p = st.p;
      const t = today(g);
      return [
        { label: 'Read for an hour', hint: '1h · -5 energy · +INT', run: async () => {
          if (!activity(g, { minutes: 60, energy: 5 })) return;
          const gain = train(g, 'int', 0.9, 'library', 40);
          return say(g, 'Reading', `${pick(['You read about the history of spoons. It\'s riveting. It\'s not.', 'You read a book on quantum physics. You understand one word: "the".', 'You read the entire "Garfield" collection. Educational? Debatable.', 'You read a romance novel called "Lust in the Rendering Plant". You learn several new words for "throbbing".'])}<br><br>+${Math.round(gain * 100) / 100} INT`);
        } },
        { label: 'Hit the books hard', hint: '3h · -18 energy · ++INT', run: async () => {
          if (!activity(g, { minutes: 180, energy: 18 })) return;
          const gain = train(g, 'int', 2.8, 'library', 40);
          st.addXP(8);
          return say(g, 'Study Session', `Three hours of hardcore studying. You highlight everything. Every word is yellow. You have learned that highlighting is not learning. +${Math.round(gain * 100) / 100} INT`);
        } },
        { label: 'Used book sale', run: () => shopPanel(g, { title: 'Friends of the Library Book Sale', speaker: 'Mrs. Shush', intro: '"All proceeds go to fixing the book drop. You know why."', sections: [{ products: ['book_dummies', 'book_cheese', 'book_barfight', 'book_anatomy', 'book_seduction', 'newspaper'].map((id) => {
          const d = game.items.def(id);
          const price = Math.max(1, Math.round(d.price * 0.85));
          return { name: d.name, desc: d.desc, price, qty: true, tag: st.itemCount(id) ? `You have ${st.itemCount(id)}` : '', buy: (q) => game.items.buy(id, q, price) };
        }) }] }) },
        { label: 'Use a public computer', hint: '30 min', run: async () => {
          g.time.advance(30);
          const m = g.market;
          const ids = Object.keys(m?.DRUGS || {});
          if (m && ids.length && chance(0.7)) {
            const id = pick(ids);
            const lo = m.cheapest(id), hi = m.priciest(id);
            return say(g, 'Computer 4', `You "research" on a forum called RotwellCandyTalk. Someone posted: "${m.name(id)} goes for ${fmtMoney(lo.price)} in ${lo.district}, ${fmtMoney(hi.price)} in ${hi.district}. Trust me bro."<br><br>Mrs. Shush appears behind you. "That\'s a <em>library</em> computer." She deletes your browser history with her mind.`);
          }
          return say(g, 'Computer 4', pick(['The computer takes 25 minutes to boot. It shows you a single cat GIF. Worth it.', 'You check your email: 300 spam messages and one from your mom that just says "call me". You won\'t.', 'The guy on computer 3 turns around and stares at you. You leave.']));
        } },
        { label: 'Nap in the reading room', hint: t.libnap ? 'Mrs. Shush is watching' : '1h · +12 energy', disabled: !!t.libnap, run: async () => {
          t.libnap = true;
          g.time.advance(60);
          if (chance(0.35)) return say(g, 'Reading Room', 'You doze off. Mrs. Shush slams a dictionary next to your head. You wake up screaming. Everyone shushes YOU. No energy for you.');
          st.addStat('energy', 12);
          return say(g, 'Reading Room', 'You nap face-down in an atlas. You wake up with Madagascar printed on your cheek. +12 energy.');
        } },
        { label: 'Study group for night school', hint: 'needs INT 25 · +CHA/INT · 2h', disabled: p.int < 25, run: async () => {
          if (!activity(g, { minutes: 120, energy: 12 })) return;
          train(g, 'int', 0.8, 'library', 40);
          train(g, 'cha', 0.6, 'library');
          return say(g, 'Study Group', 'You join a study group. Two people are dating, one is crying, and one is selling Adderall-ish. You learn about each of them and a little calculus.');
        } },
      ];
    },
  }));

  // ================= UNIVERSITY =================
  function enrolled() {
    return Object.keys(st.p.education).filter((id) => COURSES[id] && !hasCourse(st.p, id));
  }

  async function catalog() {
    const p = st.p;
    return shopPanel(game, {
      title: 'Rotwell University — Course Catalog', speaker: 'Dean Hargrove', width: 820,
      intro: '"Education is the key to success. Tuition is the lock. Here\'s the bill."<br><span class="sys-hint">Each course meets once a day at its start time. Show up within 30 minutes of the start (or early and wait). Finish all sessions to graduate.</span>',
      sections: () => [{ products: Object.entries(COURSES).map(([id, c]) => {
        const e = p.education[id];
        const done = hasCourse(p, id);
        const gains = Object.entries(c.gain).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(' ');
        return {
          name: c.name, price: c.fee, req: c.req,
          desc: `${c.desc}<br><b>${hourName(c.hour)}</b>, ${c.len}h × ${c.sessions} sessions · ${c.prof} · ${gains}/session<br><span class="ui-good">${c.perkText}</span>`,
          owned: !!e, ownedLabel: done ? 'GRADUATED' : `Enrolled (${e?.sessions || 0}/${c.sessions})`, btn: 'Enroll',
          buy: () => {
            if (!reqCheck(game, c.req).ok) return;
            if (!st.spend(c.fee, 'tuition')) return;
            p.education[id] = { sessions: 0, lastDay: 0, done: false };
            st.changed('education');
            game.sysSfx?.play('cash');
            game.ui.toast(`Enrolled in ${c.short}. First class: ${hourName(c.hour)}. Don't be late. (You'll be late.)`, 'good', 3500);
          },
        };
      }) }],
    });
  }

  async function attend(id) {
    const c = COURSES[id];
    const p = st.p;
    const e = p.education[id];
    if (e.lastDay === game.time.day) return say(game, c.short, 'You already went to this class today. The professor does not want to see you twice. Nobody does.');
    const now = game.time.minuteOfDay;
    const start = c.hour * 60;
    if (now > start + 30) return say(game, c.short, `${c.prof} locked the door at ${hourName(c.hour)}:30. Through the window you see your classmates learning without you. Come back tomorrow at ${hourName(c.hour)}.`);
    if (now < start - 90) return say(game, c.short, `Class is at ${hourName(c.hour)}. It's way too early. Even the janitor isn't here yet.`);
    if (now < start) {
      if (!(await game.ui.confirm(`Class starts at ${hourName(c.hour)} (${start - now} min). Wait around the quad?`))) return;
      game.time.advance(start - now);
    }
    const energy = 9 * c.len;
    if (p.energy < energy) return say(game, c.short, `You need ${energy} energy to stay awake through ${c.len} hours of ${c.prof}. You have ${Math.floor(p.energy)}. You fall asleep in the hallway instead.`);
    st.addStat('energy', -energy);
    game.time.advance(c.len * 60);
    let txt = '';
    for (const [k, v] of Object.entries(c.gain)) {
      const g2 = train(game, k, v, 'course:' + id, 60);
      txt += ` +${Math.round(g2 * 100) / 100} ${k.toUpperCase()}`;
    }
    e.sessions = (e.sessions || 0) + 1;
    e.lastDay = game.time.day;
    st.addXP(10 * c.len);
    st.changed('education');
    const lectures = {
      remedial_math: ['Mr. Pindle teaches long division using pizza slices. You eat the slices. You fail the quiz.', 'Today: fractions. A guy in the back asks if 1/3 is bigger than 1/4 "because 4 is bigger". Pindle weeps.'],
      bs101: ['Professor Blowhard lectures for 2 hours on a book he hasn\'t read. Riveting. You take notes on his technique.', 'Group exercise: convince a stranger you\'re a doctor. You convince three. One asks you to look at a mole.'],
      crim_justice: ['Sgt. Baton explains Miranda rights, then reads them to a student who was vaping.', 'Mock trial! You defend a man accused of stealing a hubcap. You lose. He was guilty. He was also the professor.'],
      chem: ['Dr. Blanco mixes two chemicals and the whole class gets a contact high. "Don\'t try this at home. Try it in an RV."', 'You learn the difference between "cooking" and "Cooking". Dr. Blanco coughs ominously.'],
      psych: ['Dr. Gaslight tells you class was cancelled today. It wasn\'t. You learn something anyway: never trust Dr. Gaslight.', 'Lesson: mirror people\'s body language. You mirror the professor. He mirrors you. It\'s a standoff. Nobody wins.'],
      naps: ['Coach Dozer teaches the "Power Nap Position". You master it. You wake up two hours later with a passing grade.', 'Dodgeball. You get hit in the face 14 times. Coach calls it "character building". You have lots of character now.'],
      mba: ['Chad Thundervest says "synergy" 400 times. You drink every time. You are not drinking water.', 'Case study: how to fire 3,000 people and give yourself a bonus. You take notes. Lots of notes.'],
      law: ['Judge Gavelton teaches you to object to everything. You object to lunch. Overruled.', 'Today: loopholes. You find one in the syllabus and skip the final. Gavelton respects it.'],
      premed: ['You dissect a frog. Then a pig. Then something from the meat plant that had... too many legs.', 'Dr. Sawbones demonstrates CPR on a mannequin. Then on a student who fainted from watching. Two for one.'],
    }[id] || ['You learn things.'];
    let done = '';
    if (e.sessions >= c.sessions && !e.done) {
      e.done = true;
      for (const [k, v] of Object.entries(c.bonus || {})) st.addStat(k, v, 'graduation');
      if (c.perk === 'naps') { p.maxEnergy += 10; st.changed('energy'); }
      if (c.perk === 'premed') { p.maxHp += 25; st.changed('hp'); }
      st.addXP(100);
      game.bus.emit('course:completed', { courseId: id });
      game.sysSfx?.play('levelup');
      setTimeout(() => game.ui.bigText('GRADUATED!', c.name, 3200), 50);
      done = `<br><br><b class="ui-good">GRADUATED!</b> You throw your cap in the air. It lands in a fountain. You don't care. ${c.perkText}`;
    }
    return say(game, `${c.short} — session ${e.sessions}/${c.sessions}`, `${pick(lectures)}<br><br>${txt}${done}`, c.prof);
  }

  game.locations.register('university', (g, loc) => placeMenu(g, loc, {
    hours: [7, 23],
    speaker: 'Dean Hargrove',
    closed: () => 'Rotwell U is closed. Campus security (one guy on a Segway) waves you off. "We open at 7! Get a life! Or a degree!"',
    text: () => {
      const list = enrolled();
      const sched = list.length ? list.map((id) => {
        const c = COURSES[id], e = st.p.education[id];
        return `<b>${c.short}</b> — ${hourName(c.hour)} (${e.sessions || 0}/${c.sessions})${e.lastDay === g.time.day ? ' <span class="ui-good">✓ today</span>' : ''}`;
      }).join('<br>') : '<span class="ui-muted">Not enrolled in anything. Your mom asks about it every Thanksgiving.</span>';
      return `${byTime(g, {
        morning: 'Students stumble across the quad clutching coffees the size of their heads. A frat guy is still asleep in a bush from Saturday.',
        day: 'The quad bustles with protestors protesting other protestors. A guy in a cape is handing out pamphlets about lizard people.',
        evening: 'Night school crowd: tired adults with lanyards and regrets. Somewhere a frat house is warming up the beer bong.',
        night: 'The campus is quiet except for a distant chant of "CHUG! CHUG! CHUG!"',
      })}<br><br><b>Your schedule</b><br>${sched}`;
    },
    options: () => {
      const p = st.p;
      const out = [{ label: 'Course catalog & enrollment', run: catalog }];
      for (const id of enrolled()) {
        const c = COURSES[id], e = p.education[id];
        const now = g.time.minuteOfDay, start = c.hour * 60;
        const can = e.lastDay !== g.time.day && now <= start + 30 && now >= start - 90;
        out.push({ label: `Attend: ${c.short}`, hint: e.lastDay === g.time.day ? 'done today' : can ? (now < start ? `starts ${hourName(c.hour)} (wait)` : 'in session!') : `at ${hourName(c.hour)}`, disabled: !can, run: () => attend(id) });
      }
      out.push({ label: 'Tutor freshmen for cash', hint: p.int < 40 ? 'needs INT 40' : `2h · ~${fmtMoney(Math.round(p.int * 0.6 * 2))}`, disabled: p.int < 40, run: async () => {
        if (!activity(g, { minutes: 120, energy: 14 })) return;
        const pay = Math.round(p.int * 0.6 * 2);
        st.addMoney(pay, 'tutoring');
        train(g, 'cha', 0.3, 'tutor');
        return say(g, 'Tutoring', `You tutor a freshman named Tanner. Tanner thinks the sun is a planet. You earn ${fmtMoney(pay)} and lose a bit of hope.`);
      } });
      if (g.time.isBetween(19, 23)) out.push({ label: 'Crash a frat party at Kappa Kegga Keg', hint: '+CHA · booze', run: async () => {
        g.time.advance(90);
        game.sysSfx?.play('gulp');
        game.sysFx.addDrunk(2.5);
        train(g, 'cha', 0.6, 'frat');
        st.addStat('int', -0.2);
        return say(g, 'Frat Party', pick([
          'You do a keg stand. A guy named Brayden calls you "bro" 46 times. You are now an honorary member of Kappa Kegga Keg. It\'s not an honor.',
          'Beer pong! You lose 9 games in a row and drink like a fish who lost a bet. A sorority girl draws a mustache on you. It\'s an improvement.',
          'Someone sets a couch on fire. Everyone cheers. You cheer. The fire department cheers. Nobody puts it out.',
        ]));
      } });
      out.push({ label: 'Wander the quad', run: () => { g.time.advance(20); return say(g, 'The Quad', pick(['A guy in a cape tells you about lizard people. You take a pamphlet. It\'s blank. "THEY ERASED IT," he whispers.', 'A girl offers you a free T-shirt for signing up for a credit card. You sign up for three. You have three T-shirts and $14,000 of credit card debt (not really).', 'The campus mascot, Rotty the Rat, is smoking behind the gym. He offers you one. You decline. He sheds on you.'])); } },
      );
      return out;
    },
  }));

  return { catalog, attend, member };
}
