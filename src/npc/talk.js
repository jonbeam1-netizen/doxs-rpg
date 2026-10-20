import { DISTRICTS } from '../data/locations.js';
import { WEAPONS } from '../data/weapons.js';
import { ITEMS } from '../data/items.js';
import { CHARACTERS, QUEST_ITEMS } from '../data/quests.js';
import { clamp, rand, randInt, pick, chance, fmtMoney, esc } from '../core/util.js';
import { line, RUMORS, INSULTS, COMEBACKS, TAUNTS } from './names.js';

// E on an NPC: a bark + role-specific options.
// Ambient chatter reacts to where you are (district), when (time of day), the weather
// (game.world.weather), and who you are (karma, heat, level, gang, main-story chapter, endings).
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
  'Twelve hours in the rendering plant and they pay me in \'exposure\'. To what? Salmonella.',
  'They replaced my coworker with a pigeon. The pigeon got a raise.',
  'Grimco made us sign a form saying we love our jobs. I signed it in tears. They count tears as \'engagement\'.',
  'Our union rep is a guy named Fran. Fran is a woman. Fran is the only one with a spine down there.',
];
const DRUNK_STORIES = [
  'My wife left me for a guy who owns TWO jet skis. Two! Who needs two?!',
  'I used to be somebody. A parking attendant. At the GOOD lot.',
  'You ever see a raccoon wearing a little hat? Me neither. But I believe.',
  'I proposed to a lamppost once. It said no. It was right. I wasn\'t ready.',
  'They threw me out of the Rusty Nail. The RUSTY NAIL. You have to set something on fire to get thrown out of the Rusty Nail.',
];
const HOBO_THANKS = [
  'Bless you, kid. I\'m gonna invest this in a diversified portfolio of malt liquor.',
  'The pigeons will hear of your generosity.',
  'You\'re alright. Here\'s a tip: never trust a man with two jet skis.',
  'I\'ll name my next box after you. It\'ll be a good box. Corrugated.',
];

// ---------------------------------------------------------------- context chatter
const WEATHER_TALK = {
  rain: ['This rain\'s gonna wash the smog right into my apartment. Again.', 'Rain in Rotwell is warm and a little sticky. Nobody asks why.', 'My shoes have been wet since 2011. This rain is just maintenance.'],
  storm: ['Lightning hit the Grimco tower twice today. Grimco billed the sky.', 'Storm like this, the power goes out in Gutterside and the rats throw a party.', 'Thunder\'s so loud my dog filed a noise complaint.'],
  fog: ['Can\'t see five feet in this fog. Good day to commit crimes. Not that I would. Out loud.', 'Fog this thick, the island foghorn goes all night. HAAAAWN. Like a cow with a mortgage.', 'I just said \'good morning\' to a fire hydrant. It didn\'t say it back. Rude.'],
  smog: ['Smog alert. They say stay inside. My inside has smog too. It\'s an open-concept apartment.', 'Breathing today is like licking a bus. A warm bus.', 'Grimco says this smog is \'mostly harmless\'. MOSTLY.'],
  clear: ['Sky looks almost blue today. Freaks me out. Something bad is coming.', 'Sunny-ish. I put on sunscreen. Then I remembered we don\'t get sun. Now I\'m just greasy.'],
  overcast: ['Grey again. The sky in Rotwell only comes in \'dishwater\'.', 'Another beige day under a beige sky. I\'m beige inside now too.'],
};
const TIME_TALK = {
  dawn: ['It\'s too early for this. It\'s too early for ANYTHING. Why are you awake? Why am I?', 'Morning in Rotwell: the garbage trucks start, the drunks stop, and the pigeons clock in.'],
  day: ['Lunch break. Fifteen minutes. I\'ve spent twelve of them looking for a bench that isn\'t wet.', 'Middle of the day and I\'m already tired. Rotwell does that. It drains you through the feet.'],
  evening: ['Sun\'s going down. Not that we can see it. The smog just gets darker.', 'Rush hour. In Rotwell that means everyone runs from something.'],
  night: ['It\'s late, pal. Nobody good is out this late. Including me. Including you.', 'After midnight the muggers work in shifts. Walk like you have a gun. Do you have a gun? Walk like you have two.'],
};
const DISTRICT_TALK = {
  downtown: ['Downtown: where the buildings are tall, the rent is taller, and the pigeons have tenure.', 'City Hall\'s right there. I spit in that direction once a day for luck.'],
  gutterside: ['Welcome to Gutterside. Watch your wallet, your step and your back. In that order.', 'Big Sal\'s ice cream truck came by. The jingle gives my kids nightmares. I don\'t have kids. That\'s how bad the jingle is.'],
  hilltop: ['Up here they water the lawns with champagne. The run-off goes to Gutterside. That\'s the champagne they drink down there.', 'Hilltop has private security for the private security. The guards have guards.'],
  rustyards: ['The Rustyards: everything rusts. The cranes. The boats. The workers. Me.', 'Smell that? That\'s the meat plant. And the docks. And despair. Mostly the meat plant.'],
  dustbowl: ['Out here the dust gets in everything. My teeth. My dreams. My will.', 'Bunker 9 hums at night. Everybody hears it. Nobody talks about it. I just talked about it. Forget I talked about it.'],
  blackwater: ['Island time, friend. Everything\'s slow out here. Except the gulls. The gulls are FAST.', 'Watch out for the clown at the Funland gate after ten. He\'s friendly. That\'s the scary part.'],
};

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
    let opts = [];
    try { opts = this._options(npc, role); } catch (e) { console.error('[npc] talk options failed', e); }
    opts.push({ label: 'Leave', hint: pick(['Walk away. Slowly.', 'Nope out.', 'Pretend you got a text.']) });
    let opener = line(npc.role, npc.kind);
    try { const r = this._recognize(npc, role); if (r) opener = r; } catch { /* ignore */ }
    g.ui.dialog({
      title: esc(npc.name),
      speaker: ROLE_LABEL[npc.role] ?? ROLE_LABEL[npc.kind] ?? '',
      text: `"${opener}"`,
      options: opts,
    });
  }

  say(npc, title, text, opts) {
    return this.game.ui.dialog({ title: esc(npc.name), speaker: ROLE_LABEL[npc.role] ?? '', text, options: opts });
  }

  // ------------------------------------------------------------ context
  _c() {
    const g = this.game, s = g.state, p = s.p;
    const pp = g.player?.pos || { x: 0, z: 0 };
    let district = 'downtown';
    try { district = g.world?.districtAt?.(pp.x, pp.z) || this.ctx.ambient?._district?.(pp.x, pp.z) || 'downtown'; } catch { /* ignore */ }
    const h = g.time?.hour ?? 12;
    const tod = h >= 5 && h < 9 ? 'dawn' : h >= 9 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'evening' : 'night';
    const q = g.quests;
    const ends = s.getFlag('endings', []) || [];
    const main = q ? ['main_rats', 'main_corp', 'main_mayor', 'main_bunker', 'main_hobo'].find((id) => q.isActive(id)) : null;
    return {
      district, tod, weather: g.world?.weather || 'overcast', karma: p.karma || 0, heat: p.heat || 0, level: p.level || 1,
      faction: q?.faction?.() || null, ends, main, prologue: !!q?.isActive?.('main_prologue'), cha: p.cha || 0,
    };
  }

  // Famous players get recognized (and some peds react to your rep) before they even open their mouths.
  _recognize(npc, role) {
    const c = this._c();
    if (['thug', 'gang', 'cop', 'swat', 'fighter'].includes(role)) {
      if (role === 'cop' && this.game.state.getFlag('ending_mayor') && chance(0.5)) return pick(['M-Mayor! Sir! Ma\'am! Your Honor! I wasn\'t doing anything! For once!', 'Mayor on the street! Everybody look honest!']);
      if ((role === 'thug' || role === 'gang') && this.game.state.getFlag('ending_kingpin') && chance(0.5)) return pick(['B-boss! Didn\'t see you there. This corner\'s yours. They\'re ALL yours.', 'It\'s the King of the Gutter. Be cool. BE COOL.']);
      return null;
    }
    if (c.ends.length && chance(0.3)) {
      const e = c.ends[c.ends.length - 1];
      return {
        kingpin: 'Oh god. You\'re the... the new boss. Of everything. I\'m paid up! I\'m PAID UP!',
        corporate: 'You\'re that Grimco big shot. Are you here to raise my rent in person? That\'s new.',
        mayor: 'Hey! The Mayor! The water\'s only beige now! Thanks! I guess!',
        escape: 'You\'re the one who opened the sky! My skin hurts! It\'s called a "tan"? I hate it! Thank you!',
        hobo: 'Your Crustiness! *They curtsy. Badly. Something pops.*',
      }[e] || null;
    }
    if (c.heat >= 2 && chance(0.4)) return pick(['Uh. Are those sirens for YOU? Don\'t stand near me.', 'I didn\'t see you. I\'m not seeing you right now. I\'m blind. Bye.']);
    return null;
  }

  smallTalk(npc, role) {
    const c = this._c(), g = this.game;
    const obs = [];
    obs.push(...(WEATHER_TALK[c.weather] || []));
    obs.push(...(TIME_TALK[c.tod] || []));
    obs.push(...(DISTRICT_TALK[c.district] || []));
    const pers = [];
    if (c.karma >= 40) pers.push('You\'re that do-gooder, right? Hobos talk about you. They say you smell nice. That\'s their highest honor.');
    if (c.karma <= -20) pers.push('I heard about you. Everybody heard about you. Please don\'t do to me what you did to that guy. Any of those guys.');
    if (c.heat >= 1) pers.push('There\'s a cop down the block looking at a picture. The picture looks like you. Just saying.');
    if (c.level >= 8) pers.push('You\'re getting a reputation, y\'know. Last week you were nobody. Now you\'re a somebody nobody wants to mess with.');
    else if (c.level <= 2) pers.push('You new here? You got that \'just woke up in the Roach Motel\' look.');
    if (c.faction === 'rats') pers.push('You run with the Rats? I can smell it. No offense. It\'s a strong smell.');
    if (c.faction === 'syndicate') pers.push('Velvet crew, huh? Nice threads. Bet they cost more than my kidneys. I\'ve priced my kidneys.');
    if (c.prologue) pers.push('Heard some drunk climbed the Bunker 9 fence the other night yelling about the sky. Wild. ...Wait, was that you?');
    const mainLines = {
      main_rats: 'Word on the street is Big Sal\'s got a new favorite rat. Word is it\'s you. Word is you should wash your hands.',
      main_corp: 'Somebody said you\'re running errands for the Contessa. Careful. The velvet\'s soft until it\'s a noose.',
      main_mayor: 'You\'re running against Swindell? Good luck. Last guy got audited by a bear.',
      main_bunker: 'You\'ve been asking about the bunker. Everybody who asks about the bunker ends up a little... different.',
      main_hobo: 'You trying to be the next Hobo King? Bold career move. Great benefits. The benefit is no rent.',
    };
    if (c.main && mainLines[c.main]) pers.push(mainLines[c.main]);
    if (c.ends.length >= 3) pers.push('You\'ve done it all, huh? Gang boss, suit, whatever. And you\'re STILL in Rotwell. That\'s the real ending, pal.');
    if (role === 'worker') pers.push(...WORK_GRIPES);
    if (role === 'snob') pers.push('Daddy says the poor are just rich people who didn\'t try hard enough. Daddy inherited a river.');
    // a little filler gossip so the personal line isn't always the same one
    pers.push(...[
      'My landlord installed a coin slot on the shower. Quarters only. Cold water costs extra.',
      'I saw a guy at the Gas-N-Gulp pay for a burrito with a burrito. They accepted it.',
      'Somebody stole my car battery. Then my car. Then they brought the battery back. Weird guy.',
      'My cousin works at the meat plant. He won\'t tell me what\'s in the Meat Loaf. He just cries.',
    ].filter(() => chance(0.5)));
    const text = `"${pick(obs)}"${pers.length && chance(0.8) ? `\n\n"${pick(pers)}"` : ''}`;
    this.say(npc, '', text);
    if (chance(0.15)) g.state.addStat('cha', 0.1, 'small talk');
  }

  _options(npc, role) {
    const g = this.game, s = g.state, p = s.p;
    const o = [];
    const insult = { label: 'Insult them', hint: 'Words hurt. Fists hurt more.', onSelect: () => this.insult(npc) };
    const shove = { label: 'Shove them', hint: 'Start a fight', onSelect: () => this.shove(npc) };
    const chat = { label: 'Small talk', hint: 'weather, gossip, you', onSelect: () => this.smallTalk(npc, role) };
    const flirt = { label: 'Flirt', hint: npc.data.flirted ? 'already crashed and burned' : 'Charm check (a hard one)', disabled: !!npc.data.flirted, onSelect: () => this.flirt(npc, role) };
    const tradeOpt = () => { const t = this._tradeOptions(npc, role); return t.length ? { label: 'Buy or sell something', hint: 'street prices', onSelect: () => this.trade(npc, role) } : null; };
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
        o.push({ label: 'Ask about the pigeons', onSelect: () => this.say(npc, '', `"${pick(['They\'re government drones, man. Why do you think they never sleep?', 'The pigeons told me the meat plant\'s hiring. Don\'t eat the product.', 'One of \'em owes me five bucks.', 'There\'s a pigeon parliament. They meet outside St. Mercy\'s. They\'ve got a councilman. A REAL one.'])}"`) });
        o.push({ label: 'Ask what\'s new on the street', hint: 'rumors', onSelect: () => this.rumor(npc, 0.55) });
        o.push(insult);
        break;
      }
      case 'drunk':
        o.push({ label: `Buy him a drink (${fmtMoney(5)})`, disabled: !s.canAfford(5), onSelect: () => this.drinkDrunk(npc) });
        o.push({ label: 'Ask what\'s wrong', onSelect: () => this.say(npc, '', `"${pick(DRUNK_STORIES)}"\n\nHe burps. It smells like regret and peach schnapps.`) });
        o.push(chat);
        o.push(flirt);
        o.push({ label: 'Insult him', hint: 'He WILL swing. Probably at a lamppost.', onSelect: () => this.insult(npc) });
        break;
      case 'shady':
        o.push({ label: `Buy a "Rolex" (${fmtMoney(80)})`, hint: 'What could go wrong?', disabled: !s.canAfford(80), onSelect: () => this.buyRolex(npc) });
        if (!p.weapons.includes('pistol')) o.push({ label: `"What else you got?" — a used 9mm (${fmtMoney(650)})`, hint: 'Serial number filed off. Smells like a crime.', disabled: !s.canAfford(650), onSelect: () => this.buyGun(npc, 'pistol', 650, 12) });
        else if (!p.weapons.includes('brass')) o.push({ label: `Brass knuckles (${fmtMoney(90)})`, disabled: !s.canAfford(90), onSelect: () => this.buyGun(npc, 'brass', 90, 0) });
        { const t = tradeOpt(); if (t) o.push({ ...t, label: 'Fence some "found" stuff' }); }
        o.push({ label: 'Ask for rumors', onSelect: () => this.rumor(npc, 0.3) });
        o.push(insult);
        break;
      case 'snob':
        o.push({ label: 'Ask for a "small loan"', hint: 'Charm check', onSelect: () => this.beg(npc, true) });
        o.push({ label: 'Compliment their outfit', onSelect: () => this.compliment(npc) });
        o.push(chat);
        o.push(flirt);
        { const t = tradeOpt(); if (t) o.push({ ...t, label: 'Sell them an "antique"', hint: 'rich people overpay' }); }
        o.push({ label: 'Ask for directions', onSelect: () => this.directions(npc) });
        o.push(insult);
        break;
      case 'worker':
        o.push({ label: 'Ask how work is going', onSelect: () => this.smallTalk(npc, 'worker') });
        o.push({ label: 'Ask for rumors', onSelect: () => this.rumor(npc, 0.4) });
        o.push({ label: 'Ask for directions', onSelect: () => this.directions(npc) });
        { const t = tradeOpt(); if (t) o.push(t); }
        o.push(flirt);
        o.push(insult);
        o.push(shove);
        break;
      case 'cop':
      case 'swat':
        if (p.heat > 0) o.push({ label: 'Turn yourself in', hint: 'Get it over with.', onSelect: () => this.ctx.police.arrest({ surrender: true }) });
        if (p.heat > 0 && s.hasItem('donut')) o.push({ label: 'Offer a donut', hint: 'Classic.', onSelect: () => { s.removeItem('donut'); s.addHeat(-1.5); this.say(npc, '', '"...I didn\'t see nothin\'. Glazed? You\'re a good citizen."'); } });
        o.push({ label: 'Ask about crime in the area', onSelect: () => this.rumor(npc, 0.6) });
        o.push({ label: 'Make small talk', onSelect: () => this.copTalk(npc) });
        o.push({ label: 'Insult the officer', hint: 'Bold. Stupid. Bold.', onSelect: () => this.insultCop(npc) });
        break;
      case 'thug':
      case 'gang':
        o.push({ label: `Pay "protection" (${fmtMoney(20)})`, disabled: !s.canAfford(20), onSelect: () => { s.spend(20, 'protection'); this.say(npc, '', '"Pleasure doin\' business. Nobody touches you on this block. For like ten minutes."'); npc.data.mugger = false; npc.aggressor = false; } });
        if (npc.faction) o.push({ label: 'Ask about the crew', onSelect: () => this.say(npc, '', `"${FACTION_TALK[npc.faction] || 'Mind your business.'}"`) });
        else o.push({ label: 'Ask for rumors', onSelect: () => this.rumor(npc, 0.3) });
        o.push({ label: 'Insult them', hint: 'Guaranteed fight.', onSelect: () => this.insult(npc) });
        o.push({ label: 'Throw the first punch', hint: 'brawl', onSelect: () => this.shove(npc) });
        break;
      case 'fighter':
        o.push(insult);
        o.push({ label: 'Throw the first punch', hint: 'brawl', onSelect: () => this.shove(npc) });
        break;
      default: { // ped
        o.push(chat);
        o.push({ label: 'Ask for rumors', hint: 'Charm helps', onSelect: () => this.rumor(npc, 0.5) });
        o.push({ label: 'Ask for directions', onSelect: () => this.directions(npc) });
        { const t = tradeOpt(); if (t) o.push(t); }
        o.push({ label: 'Bum some change', hint: 'Charm check', onSelect: () => this.beg(npc, false) });
        o.push(flirt);
        o.push(insult);
        o.push(shove);
      }
    }
    return o.slice(0, 8);
  }

  // ------------------------------------------------------------ actions
  giveHobo(npc, amt) {
    const s = this.game.state;
    if (!s.spend(amt, 'charity')) return;
    npc.data.given = true;
    s.addStat('karma', amt >= 20 ? 4 : amt >= 5 ? 2 : 1, 'charity');
    let text = `"${pick(HOBO_THANKS)}"`;
    if (amt >= 20 && chance(0.5)) {
      const lead = this._leadRumor();
      text += `\n\nHe leans in: "${lead ? lead.text : pick(RUMORS)}"${lead ? `\n\n(Marked on your map: ${lead.name})` : ''}`;
    }
    this.say(npc, '', text);
    this.ctx.fx.say(npc.group, 'God bless!', { ttl: 2 });
  }

  drinkDrunk(npc) {
    const s = this.game.state;
    if (!s.spend(5, 'drink')) return;
    if (chance(0.25)) {
      s.addStat('karma', 1, 'drinking buddy');
      this.say(npc, '', '"You\'re my best friend. My BEST friend. I\'d die for you. I\'d at least sprain something for you."\n\nHe hugs you. He is damp.');
    } else {
      const lead = chance(0.5) ? this._leadRumor() : null;
      this.say(npc, '', `"Hic. Okay, okay, listen..." ${lead ? lead.text : pick(RUMORS)}${lead ? `\n\n(Marked on your map: ${lead.name})` : ''}`);
    }
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
    // Point you at somewhere you'd actually want to go: the tracked objective, or a random place.
    let loc = pick(locs);
    try {
      const t = g.quests?.trackedId?.() && g.quests.targets(g.quests.trackedId())[0];
      if (t && chance(0.5)) {
        const d = Math.round(Math.hypot(t.x - g.player.pos.x, t.z - g.player.pos.z));
        const dn = DISTRICTS[g.world?.districtAt?.(t.x, t.z)]?.name || 'somewhere';
        this.say(npc, '', `"${esc(t.label || 'That')}? Yeah, I know it. ${dn}, maybe ${d} meters ${this._dir(t.x, t.z)}. Follow the big glowy beam in the sky, genius. Everybody can see it. Even me. And I'm squinting."`);
        return;
      }
    } catch { /* ignore */ }
    const d = Math.round(Math.hypot((loc.doorX ?? loc.x) - g.player.pos.x, (loc.doorZ ?? loc.z) - g.player.pos.z));
    const dn = DISTRICTS[loc.district]?.name || 'somewhere';
    const near = d < 60;
    this.say(npc, '', near
      ? `"${esc(loc.name)}? It's right there, genius. Like ${d} steps. Use your eyes."`
      : `"Lookin' for ${esc(loc.name)}? That's in ${dn}, maybe ${d} meters ${this._dir(loc.doorX ?? loc.x, loc.doorZ ?? loc.z)}. Check your map (M). Or don't, I'm not your mom."`);
  }

  _dir(x, z) {
    const pp = this.game.player.pos;
    const dx = x - pp.x, dz = z - pp.z;
    // world: +x east, -z north (matches the map)
    const ns = dz < -Math.abs(dx) * 0.4 ? 'north' : dz > Math.abs(dx) * 0.4 ? 'south' : '';
    const ew = dx > Math.abs(dz) * 0.4 ? 'east' : dx < -Math.abs(dz) * 0.4 ? 'west' : '';
    return (ns + ew) ? `${ns}${ns && ew ? '-' : ''}${ew} of here` : 'that way';
  }

  // A real side-quest lead (marks the giver on the map). -> { text, name } | null
  _leadRumor() {
    const q = this.game.quests;
    if (!q?.openRumors) return null;
    const all = q.openRumors();
    if (!all.length) return null;
    const known = q.leads?.() || {};
    const fresh = all.filter((r) => !(r.charId in known));
    const r = pick(fresh.length ? fresh : all);
    try { q.addLead(r.charId); } catch { /* ignore */ }
    return { text: r.def.rumor, name: CHARACTERS[r.charId]?.name || r.charId };
  }

  rumor(npc, base) {
    const g = this.game, p = g.state.p;
    if (npc.data.rumored) { this.say(npc, '', `"${pick(['I told you everything I know. Which is nothing. Twice.', 'Rumor? Here\'s a fresh one: you\'re annoying.'])}"`); return; }
    if (chance(clamp(base + p.cha * 0.01, 0, 0.95))) {
      npc.data.rumored = true;
      const lead = chance(0.65) ? this._leadRumor() : null;
      if (lead) { this.say(npc, '', `"${lead.text}"\n\n(Marked on your map: ${lead.name})`); return; }
      let extra = null;
      try { extra = chance(0.4) ? g.market?.rumor?.(0.7) : null; } catch { extra = null; }
      const c = this._c();
      const ctxRumors = [
        c.district === 'blackwater' ? 'Old Rustjaw only bites in the fog. And only if you\'re stupid enough to blow the foghorn at him.' : null,
        c.weather === 'fog' ? 'Fog days, the big catfish on the island come up to feed. Fishermen go crazy for it.' : null,
        c.tod === 'night' ? 'The Rusty Nail basement does roach races after dark. Don\'t bet on the one in the tiara. Or do. Your funeral.' : null,
        'Two-Finger Terry behind Lucky Larry\'s is planning something big. He\'s always planning something big. Sometimes it works.',
      ].filter(Boolean);
      this.say(npc, '', `"${extra ? `Market talk: ${extra}` : pick([...RUMORS, ...ctxRumors])}"`);
    } else this.say(npc, '', `"${pick(['Rumors? Here\'s one: you\'re ugly.', 'I don\'t talk to strangers. Especially stick-shaped ones.', 'Buy me a sandwich and maybe I\'ll remember something.', 'Rumor has it you should mind your business.'])}"`);
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

  // Mostly a joke. Charm, fame and booze nudge the odds; the dating system is where romance actually lives.
  flirt(npc, role) {
    const g = this.game, s = g.state, p = s.p;
    if (npc.data.flirted) return;
    npc.data.flirted = true;
    const c = this._c();
    let odds = 0.06 + p.cha * 0.006 + (c.ends.length ? 0.12 : 0) + (role === 'drunk' ? 0.25 : 0) - (role === 'snob' ? 0.05 : 0);
    odds = clamp(odds, 0.03, 0.6);
    const fails = [
      ['"Are you a parking ticket? \'Cause you\'ve got FINE written all over you."', '"I AM a parking ticket. I\'m a meter maid. You owe me forty bucks."'],
      ['"Is it hot in here, or is that the Rustyards chemical fire?"', '"It\'s the fire. Everyone\'s evacuating. Why are you flirting. RUN."'],
      ['*You wink.*', '*Something gets in your eye. You wink for nine straight minutes. They call you an ambulance. Not FOR you. They just call you "an ambulance" now.*'],
      ['"Do you come here often?"', '"I live here. This is my corner. You\'re standing on my bed."'],
      ['"My place or yours?"', '"Yours is the Roach Motel. Mine is my mom\'s basement. ...Neither. Neither is the answer."'],
      ['"Wanna see my stick?"', '"Buddy, you\'re a stick figure. You ARE the stick. I\'m looking at it. I\'m unimpressed."'],
      ['*You lean casually against the wall.*', '*There is no wall. You fall into a dumpster. They take a picture. It\'s going to be a meme by Tuesday.*'],
      ['"I\'m kind of a big deal around here."', '"You smell like a big deal. A big deal of garbage."'],
      ['"Did it hurt? When you fell from Hilltop?"', '"Yes. I was pushed. By my ex. Thanks for bringing it up."'],
      ['"You must be tired, \'cause you\'ve been running through my mind all day."', '"I have been running. From you. For three blocks. You just didn\'t notice."'],
    ];
    const snobFails = [['"Hey there, gorgeous."', '"Ew. EW. Security! A commoner is being AFFECTIONATE!"'], ['"Nice yacht. Bet it\'s not the only thing that\'s big."', '"My yacht has a restraining order against people like you. So do I. As of now."']];
    if (chance(odds)) {
      s.addStat('cha', 0.3, 'flirting');
      if (chance(0.3)) s.addStat('karma', 1);
      this.say(npc, '', `You: "${pick(['Nice night for it, huh?', 'You look like you have terrible taste in people. Want to prove it?', 'I\'d buy you a drink, but I spent it all on this outfit.'])}"\n\n"${pick([
        '...Okay, that was bad, but in a CONFIDENT way. I\'m not giving you my number. But I\'m thinking about it. ...Stop smiling.',
        'Ha! You\'re weird. I like weird. Call me. Don\'t actually call me. My phone is a shoe.',
        c.ends.length ? 'Wait, you\'re THAT guy? *They blush.* My mom\'s gonna kill me. In a good way.' : 'You\'re lucky you\'re funny-looking. Funny-looking is in this year.',
      ])}"\n\n(+Charm. For actual romance, take someone on a date. Club Velvet, the Greasy Spoon, wherever.)`);
      this.ctx.fx?.say?.(npc.group, pick(['*blushes*', 'Hmph.', 'Stop it.']), { ttl: 2 });
      return;
    }
    const [you, them] = pick(role === 'snob' ? snobFails : fails);
    this.say(npc, '', `You: ${you}\n\n${them}`);
    if (role === 'snob' && chance(0.3)) { s.addHeat(0.3); npc.state = 'flee'; npc.stateT = 0; npc.fleeFrom = { type: 'player' }; }
    else if (role === 'drunk' && chance(0.3)) this.ctx.fx?.say?.(npc.group, 'MARRY ME!', { ttl: 2.2 });
  }

  // ------------------------------------------------------------ street trading
  _stock(npc, role) {
    if (npc.data.stock !== undefined) return npc.data.stock;
    const c = this._c();
    const pools = {
      ped: ['cigs', 'gum', 'newspaper', 'scratch', 'chips', 'beer', 'coffee', 'breath_mints'],
      worker: ['coffee', 'energy_drink', 'cigs', 'donut', 'cup_noodles'],
      shady: ['cigs', 'painkillers', 'scratch', 'condom', 'lucky_foot'],
      snob: [],
    };
    let pool = pools[role] || pools.ped;
    if (c.district === 'blackwater') pool = ['bait_worms', 'isle_chowder', 'cigs', 'beer'];
    pool = pool.filter((id) => ITEMS[id]);
    if (!pool.length || chance(0.35)) { npc.data.stock = null; return null; }
    const id = pick(pool);
    const price = Math.max(1, Math.round((ITEMS[id].price || 3) * rand(1.2, 1.9)));
    npc.data.stock = { id, price };
    return npc.data.stock;
  }

  _junk() {
    const s = this.game.state, inv = s.p.inventory || {};
    const ok = ['junk_watch', 'fake_rolex', 'soggy_boot', 'scrap_metal', 'copper_wire', 'gold_tooth', 'duct_tape', 'prize_spider', 'prize_fingertrap', 'prize_rat', 'q_fake_watch', 'q_hobocoin', 'q_beer_ring'];
    return ok.filter((id) => (inv[id] || 0) > 0 && (ITEMS[id] || QUEST_ITEMS[id]));
  }

  _tradeOptions(npc, role) {
    if (npc.data.traded) return [];
    const out = [];
    const st = this._stock(npc, role);
    if (st) out.push({ kind: 'buy', ...st });
    const junk = this._junk();
    if (junk.length) out.push({ kind: 'sell', id: junk[0] });
    return out;
  }

  trade(npc, role) {
    const g = this.game, s = g.state;
    const nm = (id) => g.items?.name?.(id) ?? ITEMS[id]?.name ?? QUEST_ITEMS[id]?.name ?? id;
    const value = (id) => {
      if (id === 'q_hobocoin') return 1;
      if (id === 'q_fake_watch') return 12;
      if (id === 'q_beer_ring') return 3;
      const d = ITEMS[id]; let v = (d?.price || 5) * (d?.pawnMult ?? 1);
      if (id === 'fake_rolex') v = 30; // idiots are impressed
      return Math.max(1, Math.round(v * (role === 'snob' ? 0.9 : role === 'shady' ? 0.65 : 0.45)));
    };
    const opts = [];
    for (const t of this._tradeOptions(npc, role)) {
      if (t.kind === 'buy') {
        opts.push({ label: `Buy their ${esc(nm(t.id))} (${fmtMoney(t.price)})`, hint: ITEMS[t.id]?.desc ? esc(ITEMS[t.id].desc.slice(0, 60)) + (ITEMS[t.id].desc.length > 60 ? '...' : '') : '', disabled: !s.canAfford(t.price), onSelect: () => {
          if (!s.spend(t.price, 'street deal')) return;
          s.addItem(t.id, 1); npc.data.traded = true;
          this.say(npc, '', `"${pick(['Pleasure. Don\'t tell my wife I sold that.', 'No refunds. No questions. No eye contact.', 'You just made my whole day. My whole day was bad, but still.'])}"\n\nGot: ${nm(t.id)}.`);
        } });
      } else {
        const v = value(t.id);
        opts.push({ label: `Sell them your ${esc(nm(t.id))} (${fmtMoney(v)})`, hint: role === 'snob' ? '"An ANTIQUE? How quaint."' : 'street price', onSelect: () => {
          if (s.itemCount(t.id) <= 0) return;
          s.addItem(t.id, -1); s.addMoney(v, 'street sale'); npc.data.traded = true;
          this.say(npc, '', role === 'snob'
            ? `"A genuine ${nm(t.id)}? From the... street? How ghastly. How AUTHENTIC. I\'ll put it in the guest bathroom." They pay ${fmtMoney(v)} without blinking.`
            : `"${pick(['Eh. I know a guy who collects these. He\'s not well.', 'Deal. I\'m gonna regret this. I regret everything, so that\'s fine.', 'Sure. It\'s ugly. I\'m ugly. We\'ll get along.'])}" They hand you ${fmtMoney(v)}.`);
        } });
      }
    }
    opts.push({ label: 'Never mind' });
    this.say(npc, '', '"Whatcha got? Or whatcha want? Make it quick, I\'m standing here for a reason. The reason is I\'m tired."', opts);
  }

  copTalk(npc) {
    const g = this.game, c = this._c();
    const lines = [
      'Quiet shift. Somebody stole a manhole cover. We found the guy. He was IN the manhole.',
      'Chief says crime is down. We stopped writing it down. Same thing, statistically.',
      c.heat >= 1 ? 'You look familiar. Like a wanted poster. Hm. *He squints, then shrugs.* Nah. You\'re uglier.' : 'You seem like a law-abiding citizen. That makes you the weirdest guy on this block.',
      g.state.getFlag('ending_mayor') ? 'Ever since the new Mayor came in, we gotta actually ARREST people. It\'s exhausting. The paperwork has paperwork.' : 'Thorne\'s always on us about "corruption". Lady, it\'s called "networking".',
      c.tod === 'night' ? 'Night shift is the worst. The drunks are drunker, the muggers are muggier, and the donut place closes at ten.' : 'Day shift. The pigeons are the real criminals. You can\'t cuff a pigeon. I\'ve tried. They bite.',
    ];
    this.say(npc, '', `"${pick(lines)}"`);
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

  // You throw the first punch: a guaranteed fight, but it's on you (a little heat if it's a civilian).
  shove(npc) {
    const g = this.game;
    const civ = !['thug', 'gang', 'fighter'].includes(npc.role);
    const coward = civ && chance(npc.role === 'snob' ? 0.8 : npc.role === 'drunk' ? 0.05 : 0.35);
    g.ui.dialog({ title: esc(npc.name), text: coward
      ? `You shove them.\n\n"${pick(['HELP! HELP! A STICK IS ASSAULTING ME!', 'I bruise like a peach! You\'ll hear from my lawyer! He\'s my cousin!', 'Not the face! Not the— okay bye!'])}"\n\nThey run off screaming.`
      : `You shove them.\n\n"${pick(['Oh, you did NOT just do that.', 'Big mistake, toothpick.', 'I was having a NICE day!', 'FINALLY. Somebody worth hitting.'])}"`, options: [{ label: coward ? 'Well, that happened.' : 'Fists up!' }] })
      .then(() => {
        if (civ) { try { this.ctx.police?.crime?.('assault', npc.pos.x, npc.pos.z, npc); } catch { g.state.addHeat(0.3); } }
        if (coward) { npc.state = 'flee'; npc.stateT = 0; npc.fleeFrom = { type: 'player' }; }
        else this.startFight(npc);
      });
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
