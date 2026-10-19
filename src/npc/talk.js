import { DISTRICTS } from '../data/locations.js';
import { WEAPONS } from '../data/weapons.js';
import { clamp, rand, randInt, pick, chance, fmtMoney, esc } from '../core/util.js';
import { line, RUMORS, INSULTS, COMEBACKS, TAUNTS } from './names.js';

// E on an NPC: a bark + role-specific options.
const ROLE_LABEL = {
  ped: 'Pedestrian', worker: 'Wage Slave', snob: 'Hilltop Snob', shady: 'Shady Guy', hobo: 'Hobo', drunk: 'Drunk',
  thug: 'Street Thug', gang: 'Gang Member', cop: 'Rotwell PD', swat: 'SWAT', fighter: 'Fighter', dealer: 'Dealer', static: '',
};
const FACTION_TALK = {
  rats: 'Gutter Rats run these streets, rat-boy. You want in? Talk to the clubhouse. Bring cheese.',
  syndicate: 'The Velvet Syndicate doesn\'t "talk", darling. We negotiate. Your hourly rate is "free".',
  bikers: 'Dustbowl Bikers. We ride, we drink, we fight. Sometimes in the wrong order.',
};
const WORK_GRIPES = [
  'My boss microwaves fish in the break room. Every. Single. Day.',
  'Twelve hours in the rendering plant and they pay me in "exposure". To what? Salmonella.',
  'They replaced my coworker with a pigeon. The pigeon got a raise.',
];
const DRUNK_STORIES = [
  'My wife left me for a guy who owns TWO jet skis. Two! Who needs two?!',
  'I used to be somebody. A parking attendant. At the GOOD lot.',
  'You ever see a raccoon wearing a little hat? Me neither. But I believe.',
];
const HOBO_THANKS = [
  'Bless you, kid. I\'m gonna invest this in a diversified portfolio of malt liquor.',
  'The pigeons will hear of your generosity.',
  'You\'re alright. Here\'s a tip: never trust a man with two jet skis.',
];

export class Talk {
  constructor(game, ctx) {
    this.game = game;
    this.ctx = ctx;
  }

  async talk(npc) {
    const g = this.game;
    if (!npc || npc.dead) return;
    g.bus.emit('npc:talk', { npc });
    // face the player & pause
    const pp = g.player.pos;
    npc.state = 'idle'; npc.stateT = 0; npc.idleFor = 6; npc.goal = null; npc.vx = npc.vz = 0;
    npc.facing = Math.atan2(pp.x - npc.pos.x, pp.z - npc.pos.z);
    npc.group.rotation.y = npc.facing;

    if (typeof npc.spec.onTalk === 'function') {
      try { await npc.spec.onTalk(g, npc); } catch (e) { console.error('[npc] onTalk failed', e); }
      return;
    }
    if (npc.kind === 'dealer') {
      const d = npc.data?.district || this.ctx.ambient?._district(npc.pos.x, npc.pos.z) || 'downtown';
      g.locations.enter({ id: 'dealer_' + d, type: 'dealer', name: npc.name, district: d, npc });
      return;
    }
    const role = npc.role === 'gang' || npc.kind === 'gang' ? 'gang' : npc.role;
    const opts = this._options(npc, role);
    opts.push({ label: 'Leave', hint: pick(['Walk away. Slowly.', 'Nope out.', 'Pretend you got a text.']) });
    g.ui.dialog({
      title: esc(npc.name),
      speaker: ROLE_LABEL[npc.role] ?? ROLE_LABEL[npc.kind] ?? '',
      text: `"${line(npc.role, npc.kind)}"`,
      options: opts,
    });
  }

  say(npc, title, text, opts) {
    return this.game.ui.dialog({ title: esc(npc.name), speaker: ROLE_LABEL[npc.role] ?? '', text, options: opts });
  }

  _options(npc, role) {
    const g = this.game, s = g.state, p = s.p;
    const o = [];
    const insult = { label: 'Insult them', hint: 'Words hurt. Fists hurt more.', onSelect: () => this.insult(npc) };
    switch (role) {
      case 'hobo': {
        const given = npc.data.given;
        for (const amt of [1, 5, 20]) {
          o.push({
            label: `Give ${fmtMoney(amt)}`, hint: given ? 'You already helped this guy. Don\'t be weird.' : `+${amt >= 20 ? 4 : amt >= 5 ? 2 : 1} karma`,
            disabled: given || !s.canAfford(amt),
            onSelect: () => this.giveHobo(npc, amt),
          });
        }
        o.push({ label: 'Ask about the pigeons', onSelect: () => this.say(npc, '', `"${pick(['They\'re government drones, man. Why do you think they never sleep?', 'The pigeons told me the meat plant\'s hiring. Don\'t eat the product.', 'One of \'em owes me five bucks.'])}"`) });
        o.push(insult);
        break;
      }
      case 'drunk':
        o.push({ label: `Buy him a drink (${fmtMoney(5)})`, disabled: !s.canAfford(5), onSelect: () => this.drinkDrunk(npc) });
        o.push({ label: 'Ask what\'s wrong', onSelect: () => this.say(npc, '', `"${pick(DRUNK_STORIES)}"\n\nHe burps. It smells like regret and peach schnapps.`) });
        o.push({ label: 'Insult him', hint: 'He WILL swing. Probably at a lamppost.', onSelect: () => this.insult(npc) });
        break;
      case 'shady':
        o.push({ label: `Buy a "Rolex" (${fmtMoney(80)})`, hint: 'What could go wrong?', disabled: !s.canAfford(80), onSelect: () => this.buyRolex(npc) });
        if (!p.weapons.includes('pistol')) o.push({ label: `"What else you got?" — a used 9mm (${fmtMoney(650)})`, hint: 'Serial number filed off. Smells like a crime.', disabled: !s.canAfford(650), onSelect: () => this.buyGun(npc, 'pistol', 650, 12) });
        else if (!p.weapons.includes('brass')) o.push({ label: `Brass knuckles (${fmtMoney(90)})`, disabled: !s.canAfford(90), onSelect: () => this.buyGun(npc, 'brass', 90, 0) });
        o.push({ label: 'Ask for rumors', onSelect: () => this.rumor(npc, 0.15) });
        o.push(insult);
        break;
      case 'snob':
        o.push({ label: 'Ask for a "small loan"', hint: 'Charm check', onSelect: () => this.beg(npc, true) });
        o.push({ label: 'Compliment their outfit', onSelect: () => this.compliment(npc) });
        o.push({ label: 'Ask for directions', onSelect: () => this.directions(npc) });
        o.push(insult);
        break;
      case 'worker':
        o.push({ label: 'Ask how work is going', onSelect: () => this.say(npc, '', `"${pick(WORK_GRIPES)}"`) });
        o.push({ label: 'Ask for rumors', onSelect: () => this.rumor(npc, 0.4) });
        o.push({ label: 'Ask for directions', onSelect: () => this.directions(npc) });
        o.push(insult);
        break;
      case 'cop':
      case 'swat':
        if (p.heat > 0) o.push({ label: 'Turn yourself in', hint: 'Get it over with.', onSelect: () => this.ctx.police.arrest({ surrender: true }) });
        if (p.heat > 0 && s.hasItem('donut')) o.push({ label: 'Offer a donut', hint: 'Classic.', onSelect: () => { s.removeItem('donut'); s.addHeat(-1.5); this.say(npc, '', '"...I didn\'t see nothin\'. Glazed? You\'re a good citizen."'); } });
        o.push({ label: 'Ask about crime in the area', onSelect: () => this.rumor(npc, 0.6) });
        o.push({ label: 'Insult the officer', hint: 'Bold. Stupid. Bold.', onSelect: () => this.insultCop(npc) });
        break;
      case 'thug':
      case 'gang':
        o.push({ label: `Pay "protection" (${fmtMoney(20)})`, disabled: !s.canAfford(20), onSelect: () => { s.spend(20, 'protection'); this.say(npc, '', '"Pleasure doin\' business. Nobody touches you on this block. For like ten minutes."'); npc.data.mugger = false; npc.aggressor = false; } });
        if (npc.faction) o.push({ label: 'Ask about the crew', onSelect: () => this.say(npc, '', `"${FACTION_TALK[npc.faction] || 'Mind your business.'}"`) });
        else o.push({ label: 'Ask for rumors', onSelect: () => this.rumor(npc, 0.3) });
        o.push({ label: 'Insult them', hint: 'Guaranteed fight.', onSelect: () => this.insult(npc) });
        break;
      case 'fighter':
        o.push(insult);
        break;
      default: // ped
        o.push({ label: 'Ask for directions', onSelect: () => this.directions(npc) });
        o.push({ label: 'Ask for rumors', hint: 'Charm helps', onSelect: () => this.rumor(npc, 0.5) });
        o.push({ label: 'Bum some change', hint: 'Charm check', onSelect: () => this.beg(npc, false) });
        o.push(insult);
    }
    return o;
  }

  // ------------------------------------------------------------ actions
  giveHobo(npc, amt) {
    const s = this.game.state;
    if (!s.spend(amt, 'charity')) return;
    npc.data.given = true;
    s.addStat('karma', amt >= 20 ? 4 : amt >= 5 ? 2 : 1, 'charity');
    let text = `"${pick(HOBO_THANKS)}"`;
    if (amt >= 20 && chance(0.4)) text += `\n\nHe leans in: "${pick(RUMORS)}"`;
    this.say(npc, '', text);
    this.ctx.fx.say(npc.group, 'God bless!', { ttl: 2 });
  }

  drinkDrunk(npc) {
    const s = this.game.state;
    if (!s.spend(5, 'drink')) return;
    if (chance(0.25)) {
      s.addStat('karma', 1, 'drinking buddy');
      this.say(npc, '', '"You\'re my best friend. My BEST friend. I\'d die for you. I\'d at least sprain something for you."\n\nHe hugs you. He is damp.');
    } else this.say(npc, '', `"Hic. Okay, okay, listen..." ${pick(RUMORS)}`);
  }

  buyRolex(npc) {
    const s = this.game.state;
    if (!s.spend(80, 'rolex')) return;
    if (chance(0.35)) {
      s.addItem('rolex', 1);
      this.say(npc, '', '"Real gold. Real Swiss. Really fell off a really real truck."\n\nIt\'s... actually heavy. Huh. Might be worth something at the pawn shop.');
    } else {
      s.addItem('fake_rolex', 1);
      this.say(npc, '', '"Pleasure. No refunds. No eye contact."\n\nThe logo says "ROLAX". The second hand is painted on. It ticks anyway, somehow, menacingly.');
    }
    npc.state = 'flee'; npc.stateT = 0; npc.fleeFrom = { type: 'player' }; npc.leaving = true;
  }

  buyGun(npc, id, price, ammo) {
    const g = this.game, s = g.state;
    if (!s.spend(price, 'black market')) return;
    this.ctx.combat.giveWeapon(id, ammo);
    this.say(npc, '', `"${WEAPONS[id].name}. Barely used. Only by one guy. He doesn\'t need it anymore, if you catch my drift."\n\nPress Q to switch weapons.`);
    if (WEAPONS[id].kind === 'gun' && chance(0.3)) this.ctx.police.crime('vandalism', npc.pos.x, npc.pos.z);
  }

  directions(npc) {
    const g = this.game;
    const locs = (g.locations.list || []).filter((l) => l.name);
    if (!locs.length) { this.say(npc, '', '"Directions? Buddy, I don\'t even know where I am."'); return; }
    const loc = pick(locs);
    const d = Math.round(Math.hypot((loc.doorX ?? loc.x) - g.player.pos.x, (loc.doorZ ?? loc.z) - g.player.pos.z));
    const dn = DISTRICTS[loc.district]?.name || 'somewhere';
    const near = d < 60;
    this.say(npc, '', near
      ? `"${esc(loc.name)}? It's right there, genius. Like ${d} steps. Use your eyes."`
      : `"Lookin' for ${esc(loc.name)}? That's in ${dn}, maybe ${d} meters from here. Check your map (M). Or don't, I'm not your mom."`);
  }

  rumor(npc, base) {
    const p = this.game.state.p;
    if (chance(clamp(base + p.cha * 0.01, 0, 0.95))) this.say(npc, '', `"${pick(RUMORS)}"`);
    else this.say(npc, '', `"${pick(['Rumors? Here\'s one: you\'re ugly.', 'I don\'t talk to strangers. Especially stick-shaped ones.', 'Buy me a sandwich and maybe I\'ll remember something.'])}"`);
  }

  beg(npc, rich) {
    const g = this.game, s = g.state, p = s.p;
    if (npc.data.begged) { this.say(npc, '', '"You already asked me. Persistence is not a personality."'); return; }
    npc.data.begged = true;
    const odds = clamp((rich ? 0.15 : 0.25) + p.cha * 0.012, 0.05, 0.85);
    if (chance(odds)) {
      const amt = rich ? randInt(20, 100) : randInt(1, 8);
      s.addMoney(amt, 'begging');
      this.say(npc, '', rich ? `"Ugh, FINE. Here's ${fmtMoney(amt)}. Don't spend it on... whatever it is your kind eats."` : `"Here, ${fmtMoney(amt)}. Now leave me alone forever."`);
    } else if (rich && chance(0.4)) {
      s.addHeat(0.6);
      this.say(npc, '', '"Officer! OFFICER! A poor person is TALKING to me!"');
      npc.state = 'flee'; npc.stateT = 0; npc.fleeFrom = { type: 'player' };
    } else this.say(npc, '', `"${pick(['Get a job.', 'I gave at the office. The office is a lie.', 'Sorry, all I have is a credit card and contempt.'])}"`);
  }

  compliment(npc) {
    const s = this.game.state;
    if (chance(0.5 + s.p.cha * 0.01) && !npc.data.flattered) {
      npc.data.flattered = true;
      s.addStat('cha', 0.2, 'flattery');
      this.say(npc, '', '"Oh! Well. It IS hand-stitched by orphans. You have taste... for a peasant."');
    } else this.say(npc, '', '"Did you just... compliment me? Gross. I\'m telling my therapist."');
  }

  insult(npc) {
    const g = this.game;
    const burn = pick(INSULTS);
    const fightOdds = { ped: 0.25, worker: 0.5, snob: 0.02, shady: 0.45, hobo: 0.3, drunk: 0.9, thug: 1, gang: 1, fighter: 1 }[npc.role] ?? 0.4;
    if (npc.role === 'hobo') g.state.addStat('karma', -1, 'insulting a hobo');
    if (chance(fightOdds)) {
      g.ui.dialog({ title: esc(npc.name), text: `You: "${burn}"\n\n"${pick(['Oh, it is ON.', 'Square up, twig!', 'You\'re gonna regret those words. And your teeth.', 'Hold my beer. I don\'t have a beer. HOLD MY FIST.'])}"` , options: [{ label: 'Put \'em up!' }] })
        .then(() => this.startFight(npc));
    } else if (npc.role === 'snob') {
      g.ui.dialog({ title: esc(npc.name), text: `You: "${burn}"\n\n"I'll have you know my father owns this sidewalk." *calls the cops*` });
      g.state.addHeat(0.5);
      npc.state = 'flee'; npc.stateT = 0; npc.fleeFrom = { type: 'player' };
    } else {
      g.ui.dialog({ title: esc(npc.name), text: `You: "${burn}"\n\n"${pick(COMEBACKS)}"\n\nThey shuffle off, emotionally destroyed.` });
      if (chance(0.3)) g.state.addStat('cha', 0.1, 'sick burn');
      npc.state = 'flee'; npc.stateT = 0; npc.fleeFrom = { type: 'player' };
    }
  }

  // The insulted NPC throws the first punch (so it's self-defense, no heat).
  startFight(npc) {
    if (npc.dead) return;
    npc.aggressor = true;
    npc.provoked = true; npc.willFight = true;
    this.ctx.npcs._goHostile(npc, { type: 'player' });
    npc.cd = 0.5;
    this.ctx.fx.say(npc.group, pick(TAUNTS), { ttl: 2, kind: 'angry' });
    if (npc.faction) {
      for (const o of this.ctx.npcs.near(npc.pos.x, npc.pos.z, 20)) {
        if (o !== npc && o.faction === npc.faction && !o.hostile && !o.replica) { o.aggressor = true; this.ctx.npcs._goHostile(o, { type: 'player' }); }
      }
    }
  }

  insultCop(npc) {
    const g = this.game;
    g.ui.dialog({ title: esc(npc.name), text: `You: "${pick(INSULTS)}"\n\n"That's it. You're under arrest for contempt of cop."` });
    g.state.addHeat(Math.max(1, 1.2 - (g.state.p.heat % 1)));
    npc.aggressor = true;
    this.ctx.npcs._goHostile(npc, { type: 'player' });
    npc.data.pursuit = true;
  }
}
