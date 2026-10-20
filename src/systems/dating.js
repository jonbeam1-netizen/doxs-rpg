// Dating: five original characters around town, relationship meters, flirting, gifts, dates,
// going steady (daily partner perks). Fade-to-black jokes only.
// state.p.dating[id] = { rel, lastFlirt, lastGift, lastSeen, dates, partner }
// state.p.sys.partner = id | null
// game.sysDating = { option(id, loc) -> menu option | null, name(id), menu(id), daily() }
import { ITEMS } from '../data/items.js';
import { fmtMoney, pick, chance, rand, clamp } from '../core/util.js';
import { hasCourse, today, ensureState } from './common.js';
import { say, choose, meter } from './ui-kit.js';

export const DATEABLES = {
  roxy: {
    name: 'Roxy Vile', where: 'nightclub', hours: [21, 4], minCha: 15,
    desc: 'Bassist for the punk band "Diarrhea Planet II". Safety pins in places safety pins shouldn\'t go.',
    likes: ['whiskey', 'moonshine', 'cigs', 'beer', 'malt'], hates: ['flowers', 'teddy', 'book_cheese'],
    greet: ['Roxy flicks a cigarette at your shoes. "Oh. It\'s you. The stick that keeps staring."', 'Roxy is headbanging alone in the corner to a song that isn\'t playing.', '"If you\'re gonna hit on me, at least make it interesting. Last guy quoted Nickelback."'],
    ok: ['"Ha! Okay, that was actually funny. Don\'t let it go to your head."', 'She punches your arm. Hard. That\'s affection, you think.', '"You\'re weird. I like weird. Weird is underrated."'],
    fail: ['"Wow. Was that a pickup line or a cry for help?"', 'She blows smoke directly into your face. Message received.', '"Nope. Try again when you\'re less... you."'],
    nightcap: 'You end up back at her place: a mattress, a bass amp, and a pet rat named Sid Vicious. The camera pans to the window. A car alarm goes off. Then another. Then all of them. Sid watches. Sid judges.',
    perk: '+25 energy every morning (she drags you to 6AM punk shows)', perkFx: (g) => g.state.addStat('energy', 25),
  },
  chad: {
    name: 'Chad Brickman', where: 'gym', hours: [6, 20], minCha: 8,
    desc: 'Personal trainer. 4% body fat, 0% inner monologue. Calls everyone "chief".',
    likes: ['protein_shake', 'steak', 'energy_drink', 'steroids'], hates: ['book_dummies', 'book_anatomy', 'book_cheese', 'book_seduction', 'cigs'],
    greet: ['Chad flexes at you as a greeting. Then flexes at the mirror as a goodbye.', '"Chief! You\'re here! Wanna see my calves? They\'re named Thunder and Also Thunder."', 'Chad is doing curls with a smaller, weaker Chad.'],
    ok: ['"Haha, chief, that\'s hilarious." He didn\'t get it. He\'s happy anyway.', 'Chad high-fives you so hard your wrist dislocates. He\'s into you.', '"You\'re like... a protein shake for my heart, chief."'],
    fail: ['"Huh?" Chad stares at you, buffering.', '"Not right now, chief, I\'m in the zone." He is lying on a mat.', 'Chad gets distracted by his own reflection mid-sentence.'],
    nightcap: 'Chad carries you home like a groom carrying a bride. Or like a man carrying a bag of protein powder. The camera cuts to a rocket launching. Then a second rocket. Then a whole space program.',
    perk: '+0.5 STR daily (couples workouts at 5AM)', perkFx: (g) => g.state.addStat('str', 0.5, 'partner'),
  },
  divina: {
    name: 'Lady Divina Graves', where: 'casino', hours: [18, 4], minCha: 40,
    desc: 'Goth heiress to the Graves Funeral Home fortune. Wears black lace and an expression of eternal boredom.',
    likes: ['necklace', 'rolex', 'champagne', 'perfume', 'cigar'], hates: ['fake_rolex', 'flowers', 'chocolates', 'roller_dog'],
    greet: ['Divina doesn\'t look up from her roulette chips. "You\'re standing in my light. I prefer the dark."', '"Mother says I should meet new people. Mother is in a jar on my mantel."', 'Divina is betting her family\'s money on black. Always black.'],
    ok: ['"...Amusing. Like a pet that learned a trick." She almost smiles. Almost.', 'Divina laughs once, softly, like a coffin closing. That\'s a good sign.', '"You may continue speaking. For now."'],
    fail: ['"How tedious." She turns away. The temperature drops 10 degrees.', '"Your aura is beige. Please leave."', 'Divina signals to a large man. He doesn\'t do anything. He just looms.'],
    nightcap: 'Back at the Graves estate, you\'re led to a bedroom with a coffin-shaped bed and 400 candles. The camera pans to a gargoyle on the roof. The gargoyle blushes. A bat flies into a window. Twice.',
    perk: '$250 "allowance" every morning (she pities your finances)', perkFx: (g) => g.state.addMoney(250, 'partner'),
  },
  patty: {
    name: 'Dr. Patty Melt', where: 'hospital', hours: [8, 20], minCha: 25,
    desc: 'Burnt-out ER doctor on her 30th straight hour. Survives on vending machine coffee and spite.',
    likes: ['coffee', 'energy_drink', 'mega_energy', 'chocolates', 'painkillers', 'wine_box'], hates: ['cigs', 'moonshine', 'cold_burrito'],
    greet: ['Dr. Patty yawns so wide you can see her soul. "If you\'re not bleeding, make it quick."', '"I just pulled a remote out of a man. Not his mouth. What do you want?"', 'Patty is asleep standing up, clutching a clipboard. She wakes up when you approach. "I\'m awake. I\'m a doctor."'],
    ok: ['"Huh. You made me laugh. That hasn\'t happened since med school."', 'Patty smiles. It\'s tired, but it\'s real.', '"You\'re... not terrible. Medically speaking."'],
    fail: ['"I don\'t have the energy for this. Or for anything."', 'Patty gets paged mid-sentence and leaves. You\'re talking to an empty hallway.', '"Your pickup line gave me a migraine."'],
    nightcap: 'You get exactly 11 minutes together in an on-call room before her pager goes off. The camera pans to a heart monitor. It beeps faster. Faster. A nurse walks in, sees nothing, walks out, sighs.',
    perk: 'Free full heal every morning', perkFx: (g) => g.state.heal(9999),
  },
  gus: {
    name: 'Gus "The Mustache" Romano', where: 'bar', locId: 'rusty_nail', hours: [17, 2], minCha: 5,
    desc: 'Washed-up lounge singer. Has one hit from 1983 ("Baby, Your Love Is Like Gravy"). Mustache is load-bearing.',
    likes: ['whiskey', 'cigar', 'flowers', 'teddy', 'wine_box'], hates: ['energy_drink', 'protein_shake'],
    greet: ['Gus serenades you with eight bars of "Baby, Your Love Is Like Gravy". Nobody asked. Everyone suffers.', '"Well, hel-LO there, sweet cheeks. Gus Romano. Maybe you heard of me. You haven\'t."', 'Gus is grooming his mustache with a tiny comb. It takes 20 minutes. It\'s worth it.'],
    ok: ['"Oh-ho-HO! You got moves, baby!" He twirls his mustache. You feel things.', 'Gus dedicates a song to you. It\'s the same song. It\'s always the same song.', '"You remind me of my third wife. She was wonderful. She left with my drummer."'],
    fail: ['"Baby, that line was flatter than my last album."', 'Gus pretends he didn\'t hear you and starts singing louder.', '"I\'ve been rejected by better. Literally. Cher once."'],
    nightcap: 'Gus puts on his own album and slow dances you to the bedroom. The camera pans to a record player. The needle skips. Skips. Skips. Then the whole record player catches fire. Gus: "Encore?"',
    perk: '+0.4 Charm daily (he teaches you showmanship)', perkFx: (g) => g.state.addStat('cha', 0.4, 'partner'),
  },
};

const DATES = [
  { id: 'diner', label: 'Dinner at the Greasy Spoon', cost: 30, rel: 8, minCha: 0, text: ['You split a Mystery Meat Platter. Marge watches you like a hawk. A hawk that wants you to tip.', 'You share a milkshake with two straws. One straw has someone else\'s lipstick on it.'] },
  { id: 'movie', label: 'Movie at the Grimplex 6', cost: 70, rel: 12, minCha: 10, text: ['You watch "Explosion 7: Explode Harder". Your date holds your hand during the scary parts. There were no scary parts.', 'The movie is a romantic comedy about a garbage truck. You both cry. Real tears.'] },
  { id: 'fancy', label: 'Dinner at Le Pretentieux', cost: 350, rel: 20, minCha: 30, text: ['The waiter sneers at your outfit in French. You order the cheapest wine; it is $140. Your date is impressed you didn\'t cry.', 'Foam. Every course is foam. You leave hungry but sophisticated.'] },
  { id: 'yacht', label: 'Sunset yacht cruise', cost: 2500, rel: 35, minCha: 60, text: ['You rent a yacht. It\'s a large pontoon boat named "Ship Happens". The sunset over the oily harbor is weirdly beautiful.', 'Champagne, a string quartet, and only one person falls overboard. It\'s the violinist. He\'s fine.'] },
];

export function installDating(game) {
  const st = game.state;
  const rec = (id) => (st.p.dating[id] ??= { rel: 0, lastFlirt: 0, lastGift: 0, lastSeen: 0, dates: 0, partner: false });
  const present = (id, loc) => {
    const d = DATEABLES[id];
    if (!d) return false;
    if (d.locId && loc && loc.id !== d.locId) return false;
    if (loc && loc.type !== d.where) return false;
    return game.time.isBetween(d.hours[0], d.hours[1]);
  };
  const relMult = () => (hasCourse(st.p, 'psych') ? 1.3 : 1);

  function chanceFor(id, bonus = 0) {
    const d = DATEABLES[id];
    const p = st.p;
    let c = 0.35 + (p.cha - d.minCha) / 60 + bonus;
    if (hasCourse(p, 'bs101')) c += 0.05;
    if (game.sysFx.has('fresh')) c += 0.08;
    if (st.p.look?.hat === 'fedora') c -= 0.1;
    c -= Math.max(0, (p.sys.drunk || 0) - 1) * 0.06;
    if (p.cha < d.minCha) c = Math.min(c, 0.15);
    return clamp(c, 0.05, 0.95);
  }

  function jealousy(id) {
    const pid = st.p.sys.partner;
    if (!pid || pid === id || !chance(0.25)) return '';
    const r = rec(pid);
    r.rel = clamp(r.rel - 15, 0, 100);
    if (r.rel < 30) breakUp(pid, `${DATEABLES[pid].name} heard you were flirting around town. They dumped you via a note taped to a brick. Through your window.`);
    return `<br><br><em class="ui-bad">Word gets back to ${DATEABLES[pid].name}. They are NOT happy. (-15)</em>`;
  }

  function breakUp(id, msg) {
    const r = rec(id);
    r.partner = false;
    if (st.p.sys.partner === id) st.p.sys.partner = null;
    st.changed('dating');
    game.ui.toast(msg, 'bad', 5000);
  }

  async function flirt(id) {
    const d = DATEABLES[id], r = rec(id);
    if (r.lastFlirt === game.time.day) return say(game, d.name, `"We already talked today. Don't be clingy." ${d.name.split(' ')[0]} is right. Be cool.`);
    r.lastFlirt = game.time.day;
    r.lastSeen = game.time.day;
    game.time.advance(15);
    const ok = chance(chanceFor(id));
    let txt;
    if (ok) {
      const gain = Math.round(rand(4, 9) * relMult());
      r.rel = clamp(r.rel + gain, 0, 100);
      txt = `${pick(d.ok)}<br><br><span class="ui-good">+${gain} relationship</span>`;
    } else {
      r.rel = clamp(r.rel - 2, 0, 100);
      txt = `${pick(d.fail)}<br><br><span class="ui-bad">-2 relationship</span>${st.p.cha < d.minCha ? `<br><span class="sys-hint">(${d.name.split(' ')[0]} is out of your league until ~${d.minCha} Charm.)</span>` : ''}`;
    }
    txt += jealousy(id);
    st.changed('dating');
    return say(game, `Flirting with ${d.name}`, txt, d.name);
  }

  async function gift(id) {
    const d = DATEABLES[id], r = rec(id);
    if (r.lastGift === game.time.day) return say(game, d.name, '"Another gift? Today? Okay, now it\'s weird."', d.name);
    const inv = Object.keys(st.p.inventory).filter((k) => ITEMS[k] && (ITEMS[k].gift || d.likes.includes(k) || ['food', 'drink', 'booze', 'smoke'].includes(ITEMS[k].cat)));
    if (!inv.length) return say(game, d.name, 'You pat your pockets. Lint. A bus ticket. Nothing giftable. Hit up a store (roses, chocolates, jewelry...).');
    const k = await choose(game, { title: `Give ${d.name.split(' ')[0]} a gift`, text: 'What are you giving?', choices: inv.map((x) => ({ label: `${ITEMS[x].name} ×${st.p.inventory[x]}`, value: x })) });
    if (!k) return;
    st.removeItem(k, 1);
    r.lastGift = game.time.day;
    r.lastSeen = game.time.day;
    let val = ITEMS[k].gift ?? Math.min(4, Math.ceil(ITEMS[k].price / 5));
    let txt;
    if (d.hates.includes(k)) { val = -6; txt = pick([`"${ITEMS[k].name}? Seriously?" They hand it back. Then take it back and throw it at you.`, `"Do you even KNOW me?" Apparently not.`]); }
    else if (d.likes.includes(k)) { val = Math.round(val * 2 + 4); txt = pick([`"No WAY. ${ITEMS[k].name}? You get me." They hug you. It lasts a beat too long. Nice.`, 'Their eyes light up. You nailed it.']); }
    else txt = pick(['"Oh. Thanks." They pocket it. Polite, but you\'re not getting a statue.', '"Aw, that\'s sweet." They mean it about 60%.']);
    val = Math.round(val * relMult());
    r.rel = clamp(r.rel + val, 0, 100);
    st.changed('dating');
    game.bus.emit('item:used', { id: k, qty: 1, gift: id });
    return say(game, `Gift for ${d.name}`, `${txt}<br><br><span class="${val >= 0 ? 'ui-good' : 'ui-bad'}">${val >= 0 ? '+' : ''}${val} relationship</span>`, d.name);
  }

  async function date(id) {
    const d = DATEABLES[id], r = rec(id);
    const p = st.p;
    const t = today(game);
    if (t['date_' + id]) return say(game, d.name, '"One date a day, tiger. I have a life. Sort of."', d.name);
    const pickD = await choose(game, {
      title: `Take ${d.name.split(' ')[0]} out`, html: `Where to? Dates take 3 hours and 15 energy.`,
      choices: DATES.map((x) => ({ label: x.label, hint: `${fmtMoney(x.cost)}${x.minCha ? ` · CHA ${x.minCha}` : ''}`, disabled: p.money < x.cost || p.cha < x.minCha || p.energy < 15, value: x.id })),
    });
    if (!pickD) return;
    const D = DATES.find((x) => x.id === pickD);
    if (!st.spend(D.cost, 'date')) return;
    st.addStat('energy', -15);
    game.time.advance(180);
    t['date_' + id] = true;
    r.lastSeen = game.time.day;
    const ok = chance(chanceFor(id, 0.25 + D.rel / 100));
    let txt = pick(D.text);
    if (ok) {
      const gain = Math.round(D.rel * relMult());
      r.rel = clamp(r.rel + gain, 0, 100);
      r.dates++;
      txt += `<br><br><span class="ui-good">Great date! +${gain} relationship.</span>`;
      if (r.rel >= 60 && (chance(0.6) || r.partner)) {
        txt += `<br><br><em>${d.nightcap}</em>`;
        if (st.hasItem('condom')) { st.removeItem('condom', 1); txt += '<br><span class="sys-hint">You came prepared. Responsible! The glow-in-the-dark part was a hit.</span>'; r.rel = clamp(r.rel + 3, 0, 100); }
        st.addStat('energy', 20);
        st.addStat('cha', 0.5, 'date');
        game.time.advance(120);
      }
    } else {
      r.rel = clamp(r.rel - 5, 0, 100);
      txt += `<br><br>${pick(['But then you knock a candle into their hair. It goes up like a Christmas tree.', 'But you call them by your ex\'s name. Twice. And your ex\'s name is "Gary".', 'But you get food poisoning mid-date and spend 40 minutes in the bathroom making noises.', 'But your card gets declined and they pay. They will never let you forget it.'])}<br><span class="ui-bad">-5 relationship</span>`;
    }
    txt += jealousy(id);
    st.changed('dating');
    game.bus.emit('date:result', { success: ok, npc: id });
    return say(game, `Date with ${d.name}`, txt, d.name);
  }

  async function official(id) {
    const d = DATEABLES[id], r = rec(id);
    const p = st.p;
    if (p.sys.partner && p.sys.partner !== id) {
      if (!(await game.ui.confirm(`You're with ${DATEABLES[p.sys.partner].name}. Dump them for ${d.name}?`))) return;
      breakUp(p.sys.partner, `You dumped ${DATEABLES[p.sys.partner].name}. They keyed "LOSER" into your front door.`);
      rec(p.sys.partner || id);
    }
    r.partner = true;
    p.sys.partner = id;
    st.changed('dating');
    game.bus.emit('date:result', { success: true, npc: id, partner: true });
    game.ui.bigText('IT\'S OFFICIAL', `You and ${d.name}`, 3000);
    game.sysSfx?.play('levelup');
    return say(game, d.name, `You ask ${d.name.split(' ')[0]} to go steady. ${pick(['They say yes before you finish the sentence.', 'They pretend to think about it for 3 seconds. Then tackle-hug you.'])}<br><br><b>Partner perk:</b> ${d.perk}.`, d.name);
  }

  async function menu(id) {
    const d = DATEABLES[id];
    for (let guard = 0; guard < 50; guard++) {
      const r = rec(id);
      const p = st.p;
      const relTxt = r.partner ? '<b style="color:#d84a8a">❤ Your partner</b>' : r.rel >= 80 ? 'Totally into you' : r.rel >= 50 ? 'Crushing on you' : r.rel >= 25 ? 'Interested' : r.rel > 0 ? 'Barely knows you' : 'Stranger';
      const opts = [
        { label: 'Flirt', hint: r.lastFlirt === game.time.day ? 'done today, come back tomorrow' : `${Math.round(chanceFor(id) * 100)}% chance`, disabled: r.lastFlirt === game.time.day, run: () => flirt(id) },
        { label: 'Give a gift', run: () => gift(id) },
        { label: 'Ask on a date', hint: r.rel < 25 ? 'needs relationship 25' : '3h', disabled: r.rel < 25, run: () => date(id) },
      ];
      if (!r.partner) opts.push({ label: 'Ask them to go steady', hint: r.rel >= 90 && r.dates >= 3 ? '❤' : 'needs 90 rel & 3 great dates', disabled: !(r.rel >= 90 && r.dates >= 3), run: () => official(id) });
      else opts.push({ label: 'Break up', hint: 'cold', run: async () => { if (await game.ui.confirm(`Dump ${d.name}?`)) { r.rel = 20; breakUp(id, `You dumped ${d.name}. They took it... about as well as you'd expect. Your stuff is on the curb.`); } } });
      opts.push({ label: 'Walk away' });
      const i = await game.ui.dialog({
        title: d.name, speaker: d.name,
        html: `${pick(d.greet)}<br><br><em>${d.desc}</em><br><br>Relationship: ${meter(r.rel, 100, '#d84a8a')} ${relTxt} (${Math.round(r.rel)}/100)${r.partner ? `<br><span class="sys-hint">Perk: ${d.perk}</span>` : ''}`,
        options: opts.map((o) => ({ label: o.label, hint: o.hint, disabled: o.disabled })),
      });
      if (i == null || !opts[i].run) return;
      await opts[i].run();
      if (p.hp <= 0) return;
    }
  }

  function option(id, loc) {
    if (!present(id, loc)) return null;
    const d = DATEABLES[id];
    const r = st.p.dating?.[id];
    return { label: `Talk to ${d.name}`, hint: r?.partner ? '❤ partner' : r?.rel ? `${Math.round(r.rel)}% rel` : 'dateable', run: () => menu(id) };
  }

  function daily() {
    const p = st.p;
    ensureState(p);
    for (const [id, r] of Object.entries(p.dating)) {
      if (!DATEABLES[id]) continue;
      const since = game.time.day - (r.lastSeen || 0);
      if (r.partner) {
        if (since > 4) r.rel = clamp(r.rel - 2, 0, 100);
        if (r.rel < 30) { breakUp(id, `${DATEABLES[id].name} broke up with you. "You\'re never around. I\'m dating a guy from the meat plant now. He\'s always around. Too around."`); continue; }
        try { DATEABLES[id].perkFx(game); } catch (e) { console.error(e); }
      } else if (since > 3 && r.rel > 0) r.rel = clamp(r.rel - 1, 0, 100);
    }
    if (p.sys.partner && DATEABLES[p.sys.partner]) game.ui.toast(`❤ ${DATEABLES[p.sys.partner].name}: ${DATEABLES[p.sys.partner].perk}.`, 'good', 3500);
  }

  const api = { option, menu, daily, name: (id) => DATEABLES[id]?.name ?? id, DATEABLES };
  game.sysDating = api;
  return api;
}
