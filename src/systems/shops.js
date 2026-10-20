// Shops: convenience stores & gas stations, liquor, clothing (+hats/haircuts/wardrobe), tattoos,
// pawn shop, gun shop (with an after-hours backroom).
// game.sysShops = { wardrobe() }
import { ITEMS } from '../data/items.js';
import { WEAPONS, AMMO } from '../data/weapons.js';
import { HAT_TYPES } from '../entities/stickman.js';
import { fmtMoney, pick, chance, randInt, clamp } from '../core/util.js';
import { ensureState, today, byTime, capacity } from './common.js';
import { placeMenu, shopPanel, say, choose } from './ui-kit.js';

// ---------------- clothing data ----------------
export const OUTFITS = {
  default: { name: 'Basic Black Stick', color: '#141414', price: 0, cha: 0, desc: 'Your birthday suit. The one you were drawn in.' },
  flannel: { name: 'Thrift Store Flannel', color: '#6a2a20', price: 45, cha: 1, desc: 'Smells like a lumberjack\'s divorce. Previous owner: "Big Dale".' },
  hazmat: { name: 'Hazmat Chic', color: '#c9c23a', price: 90, cha: 1, desc: 'Fashionable AND protects against the meat plant air. Mostly fashionable.' },
  jumpsuit: { name: 'Prison Orange Jumpsuit', color: '#d2691e', price: 70, cha: 1.5, desc: 'People step aside on the sidewalk. Respect? Fear? Both.' },
  tracksuit: { name: 'Velour Tracksuit', color: '#2a3f7a', price: 150, cha: 2, desc: 'Soft as a baby seal. Says "JUICY" on the butt. It is accurate.' },
  biker: { name: 'Biker Leathers', color: '#2b2118', price: 450, cha: 3, desc: 'Creaks when you walk. The Dirty Spur crowd will respect you. A little.' },
  camo: { name: 'Swamp Camo', color: '#4a5a32', price: 300, cha: 2, desc: 'You blend in perfectly with a bush. Useful never.' },
  purple: { name: 'Pimp Purple Suit', color: '#6b2a8a', price: 1100, cha: 5, desc: 'Comes with a cane you are not allowed to have. Wide lapels. Wider ego.' },
  funeral: { name: 'Funeral-Ready Suit', color: '#1a1a22', price: 1800, cha: 6, desc: 'Good for funerals, job interviews and funerals you caused.' },
  powder: { name: 'Powder Blue Tux', color: '#8ab4d8', price: 3200, cha: 8, desc: 'Prom 1977 energy. Unbeatable. Undeniable. Unwashable.' },
  white: { name: 'Miami Vice White', color: '#e6e0d0', price: 6500, cha: 10, desc: 'Linen suit, no socks, all confidence. Do not eat spaghetti in this.' },
  gold: { name: 'Gold Lamé Disaster', color: '#c9a227', price: 12000, cha: 13, desc: 'You look like a trophy that came to life and chose violence.' },
  red: { name: 'Blood-Red Power Suit', color: '#8a1a1a', price: 30000, cha: 18, desc: 'Hand-stitched by a tailor who now lives in fear. CEO energy.' },
};
export const HATS = {
  cap: { name: 'Trucker Cap', price: 18, cha: 0.5, desc: 'Says "I ♥ MY TRUCK". You do not have a truck.' },
  beanie: { name: 'Gutter Beanie', price: 25, cha: 0.5, desc: 'Worn in all seasons by people who own a podcast.' },
  hardhat: { name: 'Hard Hat', price: 40, cha: 0.5, desc: 'Walk onto any construction site and nobody stops you. Life hack.' },
  fedora: { name: 'Fedora', price: 160, cha: 1.5, desc: 'M\'lady. Lowers Charm with women by a lot, raises it with yourself by more.' },
  cop: { name: 'Novelty Cop Hat', price: 260, cha: 1, desc: 'Impersonating an officer is illegal. Impersonating a stripper dressed as one is fine.' },
  tophat: { name: 'Top Hat', price: 700, cha: 3, desc: 'Monocle sold separately. Class sold never.' },
  crown: { name: 'Gold Crown', price: 60000, cha: 12, desc: 'Literally a crown. Peasants weep. Larry at the pawn shop drools.' },
};
const HAT_COLORS = { 'Charcoal': '#2a2420', 'Blood': '#8a1a1a', 'Mustard': '#c9a227', 'Navy': '#1f2d55', 'Bone': '#e6dfcf', 'Toxic': '#7aa020', 'Hot Pink': '#d84a8a' };

const TATTOOS = {
  mom: { name: '"MOM" in a heart', price: 60, cha: 1, karma: 1, desc: 'Classic. Your mom would cry. Happy tears? Unclear.' },
  noregerts: { name: '"NO REGERTS"', price: 50, cha: 0, desc: 'Nancy insists it\'s spelled right. It\'s not. You have one regert now.' },
  barbed: { name: 'Barbed Wire Armband', price: 120, cha: 1.5, str: 1, desc: 'Makes your noodle arms look 3% more dangerous.' },
  tramp: { name: 'Lower Back Masterpiece', price: 90, cha: 2, desc: 'A butterfly on fire with the word "ANGEL". The lower back is the classiest canvas.' },
  ex: { name: 'Ex\'s Name (Crossed Out)', price: 100, cha: 1, desc: '"BRENDA" with a big X. Then a new name below: "BRENDA 2".' },
  spiderweb: { name: 'Elbow Spiderweb', price: 200, cha: 1.5, karma: -2, desc: 'Says "I did time" without saying "I did time for stealing cheese".' },
  reaper: { name: 'Grim Reaper Riding a Shark', price: 450, cha: 3.5, desc: 'The shark is wearing sunglasses. The reaper is giving a thumbs up. Art.' },
  teardrop: { name: 'Face Teardrop', price: 300, cha: 2, karma: -5, str: 1, desc: 'Street cred +100. Job interviews -100.' },
  eagle: { name: 'Full Back Eagle', price: 1400, cha: 6, desc: 'An eagle holding a smaller eagle holding a gun. America, basically.' },
  sleeve: { name: 'Full Sleeve: Demons & Pizza', price: 2500, cha: 8, desc: 'Nancy\'s magnum opus. Demons eating pizza. Pizza eating demons. A cycle.' },
  drunk_tat: { name: '"TACO BELL" Butt Heart', price: 0, cha: 0, hidden: true, desc: 'You don\'t remember getting this. Nobody does.' },
};

export function installShops(game) {
  // cosmetic Charm goes through the style cap (src/systems/ventures.js, STYLE_CAP)
  const styleCha = (n, src) => (game.lifestyle?.styleGain ? game.lifestyle.styleGain(n, src) : game.state.addStat('cha', n, src));
  const st = game.state;
  const sfx = (n) => game.sysSfx?.play(n);

  const itemProducts = (ids, mult = 1) => ids.filter((id) => ITEMS[id]).map((id) => {
    const d = ITEMS[id];
    const price = Math.max(1, Math.round(d.price * mult));
    if (d.cat === 'upgrade') {
      const owned = capacity(st.p) >= d.capacity;
      return { name: d.name, desc: d.desc, price, owned, ownedLabel: 'Have it (or bigger)', buy: () => game.items.buy(id, 1, price) };
    }
    const have = st.itemCount(id);
    return { name: d.name, desc: d.desc, price, qty: true, tag: have ? `You have ${have}` : '', buy: (q) => game.items.buy(id, q, price) };
  });

  // ---------------- convenience stores / gas / liquor ----------------
  const STORE = {
    store: {
      hours: null,
      clerk: () => (game.time.isNight ? 'Dwayne (night shift)' : 'Crystal'),
      text: () => byTime(game, {
        morning: 'Crystal is restocking the roller dogs. "These are from yesterday. These are from... I don\'t know. Before me."',
        day: 'Fluorescent lights buzz like angry bees. Crystal is reading a magazine called "Nails & Felonies".',
        evening: 'The slushie machine makes a noise like it\'s giving birth. Crystal doesn\'t look up.',
        night: 'Dwayne, the night clerk, has a neck tattoo of a different neck tattoo. "No bathroom. No loitering. No eye contact."',
      }),
      sections: [
        ['Grub', ['cold_burrito', 'roller_dog', 'donut', 'chips', 'cup_noodles', 'protein_shake']],
        ['Drinks', ['coffee', 'energy_drink', 'mega_energy', 'beer', 'malt']],
        ['Pharmacy (Shelf by the Mop)', ['bandage', 'painkillers', 'first_aid', 'hangover_cure', 'detox_tea']],
        ['Lottery & Smokes', ['scratch', 'scratch_gold', 'cigs']],
        ['Romance Aisle', ['flowers', 'chocolates', 'teddy', 'breath_mints', 'gum', 'cologne', 'condom', 'fake_rolex']],
        ['Misc', ['newspaper', 'duct_tape', 'fanny_pack', 'duffel']],
      ],
    },
    gas: {
      hours: (g, loc) => (loc?.id === 'dusty_pump' ? [6, 24] : null),
      clerk: (loc) => (loc?.id === 'dusty_pump' ? 'Ma Tucker' : 'Sludge'),
      text: (loc) => (loc?.id === 'dusty_pump'
        ? pick(['Ma Tucker sits behind the counter with a shotgun across her lap and a crossword. "Seven letters, means \'stranger who better be buyin\' somethin\'\'."', 'A dusty fan pushes hot air around. Ma Tucker spits into a can. Misses. Doesn\'t care.'])
        : pick(['Sludge, a dockworker with arms like hams, rings you up without looking. "Diesel, snacks, or trouble?"', 'The floor is sticky with motor oil and spilled slushie. The jerky display has a jerky that moved.'])),
      sections: (loc) => [
        ['Road Food', ['cold_burrito', 'roller_dog', 'donut', 'chips', 'coffee', 'energy_drink', 'mega_energy']],
        ['Six-Pack Corner', ['beer', 'malt', 'cigs']],
        ['First Aid', ['bandage', 'painkillers', 'hangover_cure']],
        ['Lottery', ['scratch', 'scratch_gold']],
        loc?.id === 'dusty_pump' ? ['Desert Outfitters', ['rucksack', 'duct_tape']] : ['Dock Supply', ['duffel', 'duct_tape']],
      ],
    },
    liquor: {
      hours: [10, 2],
      clerk: () => 'Old Earl',
      text: () => byTime(game, {
        morning: 'Old Earl unlocks the bulletproof glass. "Mornin\'. First customer\'s always a regular. You a regular?" You are now.',
        day: 'Old Earl watches you through three inches of bulletproof glass. He has seen every kind of person. He likes none of them.',
        evening: 'A line of thirsty Gutterside residents snakes out the door. Earl moves with the speed of a man with no reason to hurry.',
        night: 'Earl\'s eyes are red. The shop is red. Everything is red. "Last call\'s at two. Buy double."',
      }),
      sections: [
        ['Beer & Malt', ['beer', 'malt']],
        ['Hard Stuff', ['wine_box', 'whiskey', 'moonshine', 'champagne']],
        ['Smokes', ['cigs', 'cigar']],
        ['Lottery', ['scratch', 'scratch_gold']],
        ['Recovery', ['hangover_cure', 'chips']],
      ],
    },
  };

  for (const type of Object.keys(STORE)) {
    const S = STORE[type];
    game.locations.register(type, (g, loc) => placeMenu(g, loc, {
      hours: typeof S.hours === 'function' ? S.hours(g, loc) : S.hours,
      speaker: S.clerk(loc),
      closed: () => `Closed. A sign says "BACK SOON" and has said so since 1994. You can see ${S.clerk(loc)} sleeping behind the counter.`,
      text: () => S.text(loc),
      options: () => [
        { label: 'Shop', hint: 'browse the aisles', run: () => shopPanel(g, {
          title: loc.name, speaker: S.clerk(loc),
          sections: () => (typeof S.sections === 'function' ? S.sections(loc) : S.sections).map(([name, ids]) => ({ name, products: itemProducts(ids, type === 'liquor' ? 0.95 : 1) })),
          footer: 'Tip: use items from your inventory (I).',
        }) },
        { label: 'Chat with the clerk', run: () => say(g, loc.name, clerkChat(type, loc), S.clerk(loc)) },
        type !== 'liquor' ? { label: 'Use the bathroom', hint: '"customers only"', run: () => bathroom() } : null,
        type === 'liquor' && game.time.hour >= 18 ? { label: 'Grab a 40 and drink it in the lot', hint: '$5', run: () => { if (st.spend(5)) { sfx('gulp'); game.sysFx.addDrunk(2); st.addStat('karma', -1); return say(g, 'Parking Lot', 'You drink an Old Colon 40 behind the dumpster with a guy named Tooth. He tells you about the war. Which war? He doesn\'t know either.'); } } } : null,
      ],
    }));
  }

  function clerkChat(type, loc) {
    const lines = {
      store: ['"You gonna buy something or just absorb the air conditioning?"', '"The burritos are fine. Probably. Last guy who complained? Never saw him again. Unrelated."', `"Someone won ${fmtMoney(randInt(500, 2000))} on a Lucky Turd yesterday. It wasn't you. It'll never be you."`],
      gas: ['"Pump 3 is broken. Pump 2 is haunted. Pump 1 is fine but it judges you."', '"We sell jerky made from... jerk. Don\'t ask what kind."'],
      liquor: ['"I\'ve been sellin\' booze for 40 years. Never touched a drop. Just kidding, I\'m drunk right now."', '"A man walks into a bar. Then he walks in here, because bars are expensive. That\'s the joke. That\'s my life."'],
    }[type];
    let t = pick(lines);
    if (chance(0.4) && game.market) t += `<br><br><em>Leaning in: "${game.market.rumor(0.75)}"</em>`;
    return t;
  }

  function bathroom() {
    const t = today(game);
    game.time.advance(10);
    if (t.bathroom) return say(game, 'Bathroom', 'You go back in. It\'s worse now. You did that.');
    t.bathroom = true;
    const r = Math.random();
    if (r < 0.15) { st.addMoney(randInt(5, 30), 'found'); return say(game, 'Bathroom', 'Someone left cash on the sink. Next to a needle. You take the cash. You leave the needle. Growth.'); }
    if (r < 0.3) { st.addStat('karma', -1); return say(game, 'Bathroom', 'You write "FOR A GOOD TIME CALL GRIMCO HR" on the stall. Petty. Satisfying.'); }
    return say(game, 'Bathroom', pick([
      'The bathroom key is attached to a hubcap. The bathroom itself is a crime scene. You hold your breath for nine minutes.',
      'There\'s no toilet paper. There\'s a phone book. From 1987. You make do.',
      'Graffiti on the wall says "DWAYNE WAS HERE". Dwayne is the clerk. Dwayne is always here.',
    ]));
  }

  // ---------------- clothing ----------------
  function setLook(patch) {
    const p = st.p;
    p.look = Object.assign({}, p.look || {}, patch);
    st.changed('look');
    game.bus.emit('look:change', p.look);
  }

  async function pickHatColor() {
    return choose(game, { title: 'Pick a color', text: 'Fabrizio holds up swatches. "Choose wisely. Or don\'t. You will anyway."', choices: Object.entries(HAT_COLORS).map(([n, c]) => ({ label: `<span style="color:${c}">■</span> ${n}`, value: c })) });
  }

  function clothingSections() {
    const p = st.p;
    return [
      { name: 'Outfits', products: Object.entries(OUTFITS).filter(([id]) => id !== 'default').map(([id, o]) => ({
        name: `<span style="color:${o.color}">■</span> ${o.name}`, desc: o.desc, price: o.price, tag: `+${o.cha} Charm (first purchase)`,
        owned: p.sys.outfits.includes(id), ownedAction: p.look?.color === o.color ? null : 'Wear',
        onOwned: () => { setLook({ color: o.color }); game.ui.toast(`You change into the ${o.name}.`, 'info'); },
        buy: () => {
          if (!st.spend(o.price, 'clothes')) return;
          p.sys.outfits.push(id);
          styleCha(o.cha, 'outfit');
          setLook({ color: o.color });
          sfx('cash');
          game.ui.toast(pick(['Fabrizio: "Finally, you look like someone. Someone bad, but someone."', 'Fabrizio: "Stunning. Truly. I\'m lying, but it\'s still an improvement."']), 'good', 3000);
        },
      })) },
      { name: 'Hats', products: Object.entries(HATS).filter(([id]) => HAT_TYPES.includes(id)).map(([id, h]) => ({
        name: h.name, desc: h.desc, price: h.price, tag: `+${h.cha} Charm (first purchase)`,
        owned: p.sys.hats.includes(id), ownedAction: p.look?.hat === id ? 'Take off' : 'Wear',
        onOwned: async () => {
          if (p.look?.hat === id) { setLook({ hat: null }); return; }
          const c = await pickHatColor();
          setLook({ hat: id, hatColor: c || p.look?.hatColor || '#2a2420' });
        },
        buy: async () => {
          if (!st.spend(h.price, 'clothes')) return;
          p.sys.hats.push(id);
          styleCha(h.cha, 'hat');
          const c = await pickHatColor();
          setLook({ hat: id, hatColor: c || '#2a2420' });
          sfx('cash');
        },
      })) },
      { name: 'Accessories', products: itemProducts(['trenchcoat', 'cologne', 'perfume']) },
    ];
  }

  game.locations.register('clothing', (g, loc) => placeMenu(g, loc, {
    hours: [9, 21],
    speaker: 'Fabrizio',
    closed: () => 'The mannequins in the window stare at you. One of them is missing a head. It\'s closed, but you feel watched.',
    text: () => byTime(g, {
      morning: 'Fabrizio steams a shirt with the intensity of a surgeon. "We just opened. Your outfit has been closed for years."',
      day: 'Fabrizio looks you up and down like you\'re a stain. "Darling. DARLING. No. Come. We fix."',
      evening: '"Closing soon, so make it fast. Fashion waits for no one. Except me. Fashion waits for me."',
      night: 'Fabrizio is counting the register and judging you simultaneously.',
    }) + `<br><span class="sys-hint">Every new outfit or hat permanently boosts Charm the first time you buy it — up to a style cap (${Math.min(25, Math.round(st.p.sys.style ?? 0))}/25 used). Past that, it's pure vanity.</span>`,
    options: () => {
      const t = today(g);
      return [
        { label: 'Browse the racks', run: () => shopPanel(g, { title: 'Threads & Dreads', speaker: 'Fabrizio', intro: '"Thrift store prices, boutique attitude."', sections: clothingSections }) },
        { label: 'Gutter Mullet haircut', hint: `$30 · +Charm${t.haircut ? ' (done today)' : ''}`, disabled: !!t.haircut, run: () => haircut(30, 0.7, 'Fabrizio\'s cousin Sal hacks at your head with kitchen shears. Business in the front, crime scene in the back.') },
        { label: 'Hilltop Fade', hint: `$140 · ++Charm${t.haircut ? ' (done today)' : ''}`, disabled: !!t.haircut, run: () => haircut(140, 1.8, 'Fabrizio personally sculpts your hair while whispering affirmations. "You are less ugly. Less ugly. LESS UGLY."') },
        { label: 'Try on clothes in the changing room', hint: 'free, 20 min', run: () => { g.time.advance(20); return say(g, 'Changing Room', pick(['You try on a sequin jumpsuit. For a moment you are a god. Then you see the price tag.', 'The mirror is cracked. Or it was fine and your face cracked it. Fabrizio says the second one.', 'There\'s a stranger\'s underwear in here. Fabrizio says it\'s "vintage".'])); } },
      ];
    },
  }));

  async function haircut(price, cha, text) {
    const t = today(game);
    if (!st.spend(price, 'haircut')) return;
    t.haircut = true;
    game.time.advance(40);
    game.sysSfx?.play('spray');
    const gain = st.p.sys.haircuts ?? 0;
    st.p.sys.haircuts = gain + 1;
    st.addStat('cha', cha * (gain < 20 ? 1 : 0.3), 'haircut');
    await say(game, 'Haircut', text);
  }

  // Wardrobe (from home): swap owned outfits & hats for free.
  async function wardrobe() {
    const p = st.p;
    ensureState(p);
    return shopPanel(game, {
      title: 'Wardrobe', intro: 'Your closet. It smells like your bad decisions, neatly folded.',
      sections: () => [
        { name: 'Outfits', products: p.sys.outfits.filter((id) => OUTFITS[id]).map((id) => ({
          name: `<span style="color:${OUTFITS[id].color}">■</span> ${OUTFITS[id].name}`, desc: OUTFITS[id].desc, owned: true,
          ownedAction: p.look?.color === OUTFITS[id].color ? null : 'Wear', ownedLabel: 'Wearing',
          onOwned: () => setLook({ color: OUTFITS[id].color }),
        })) },
        { name: 'Hats', products: [
          { name: 'No hat', desc: 'Let your scalp breathe. It needs it.', owned: true, ownedAction: p.look?.hat ? 'Wear' : null, ownedLabel: 'Bareheaded', onOwned: () => setLook({ hat: null }) },
          ...p.sys.hats.filter((id) => HATS[id]).map((id) => ({
            name: HATS[id].name, desc: HATS[id].desc, owned: true, ownedAction: p.look?.hat === id ? 'Recolor' : 'Wear',
            onOwned: async () => { const c = await pickHatColor(); setLook({ hat: id, hatColor: c || p.look?.hatColor || '#2a2420' }); },
          })),
        ] },
      ],
    });
  }

  // ---------------- tattoo ----------------
  game.locations.register('tattoo', (g, loc) => placeMenu(g, loc, {
    hours: [12, 4],
    speaker: 'Needles Nancy',
    closed: () => 'Ink Stinks is dark. A flickering sign reads "WALK-INS WELCOME (NOT NOW)".',
    text: () => {
      const p = st.p;
      const mine = p.sys.tattoos.filter((t) => TATTOOS[t]);
      return pick([
        'Needles Nancy\'s hands are shaking. "Don\'t worry, they stop shaking once I start. Mostly. Sit."',
        'The needle buzzes. Someone in the back is screaming. "That\'s just Kevin. He wanted a full face tattoo. He\'s fine."',
        'Nancy is eating a sandwich and tattooing a guy at the same time. There is mustard in his tattoo now.',
      ]) + (mine.length ? `<br><br><span class="sys-hint">Your ink: ${mine.map((t) => TATTOOS[t].name).join(', ')}</span>` : '');
    },
    options: () => [
      { label: 'Get inked', run: () => shopPanel(g, {
        title: 'Ink Stinks — Flash Sheet', speaker: 'Needles Nancy', intro: '"Pick one off the wall. No custom work. Last custom job I did was a portrait of a guy\'s mother. It was not his mother."',
        sections: () => [{ products: Object.entries(TATTOOS).filter(([, t]) => !t.hidden).map(([id, t]) => ({
          name: t.name, desc: t.desc, price: t.price, owned: st.p.sys.tattoos.includes(id),
          tag: `${t.cha ? `+${t.cha} Charm ` : ''}${t.str ? `+${t.str} STR ` : ''}${t.karma ? `${t.karma > 0 ? '+' : ''}${t.karma} Karma` : ''}`,
          buy: () => {
            if (!st.spend(t.price, 'tattoo')) return;
            g.time.advance(90);
            st.damage(5, 'tattoo');
            st.p.sys.tattoos.push(id);
            if (t.cha) styleCha(t.cha, 'tattoo');
            if (t.str) st.addStat('str', t.str, 'tattoo');
            if (t.karma) st.addStat('karma', t.karma);
            game.ui.toast(pick(['Nancy: "Done! Don\'t look at it for a week. Or ever, honestly."', 'It stings like hell. You look like hell. Cool.', 'Nancy stops shaking halfway through. Unfortunately, it\'s the second half.']), 'good', 3500);
          },
        })) }],
      }) },
      { label: 'Laser removal', hint: '$150 each (it\'s a clothes iron)', disabled: !st.p.sys.tattoos.length, run: async () => {
        const id = await choose(g, { title: 'Remove which one?', text: 'Nancy plugs in a clothes iron. "This is a laser. Technically."', choices: st.p.sys.tattoos.map((t) => ({ label: TATTOOS[t]?.name ?? t, value: t })) });
        if (!id || !st.spend(150, 'tattoo')) return;
        st.p.sys.tattoos = st.p.sys.tattoos.filter((x) => x !== id);
        const t = TATTOOS[id];
        if (t?.cha) st.addStat('cha', -t.cha * 0.8);
        if (t?.karma < 0) st.addStat('karma', 2);
        st.damage(12, 'laser');
        game.time.advance(60);
        return say(g, 'Laser Removal', 'Sssssss. It smells like bacon. Your bacon. The tattoo is gone. So is some skin.');
      } },
      { label: 'Get a piercing', hint: '$40', run: async () => {
        if (!st.spend(40)) return;
        const where = pick(['eyebrow', 'nose', 'lip', 'tongue', 'nipple', '"somewhere secret"']);
        st.damage(3, 'piercing');
        styleCha(where === 'tongue' ? 1 : 0.5, 'piercing');
        return say(g, 'Piercing', `Nancy pierces your ${where} with what she claims is a "sterilized" safety pin. She licked it first. That\'s how she sterilizes.`);
      } },
    ],
  }));

  // ---------------- pawn shop ----------------
  function pawnStock() {
    const p = st.p;
    if (p.sys.pawn?.day === game.time.day) return p.sys.pawn;
    const wPool = Object.keys(WEAPONS).filter((w) => w !== 'fists' && w !== 'goldengun' && WEAPONS[w].price <= 15000);
    const gPool = ['rolex', 'fake_rolex', 'fake_rolex', 'necklace', 'perfume', 'teddy', 'stolen_tv', 'book_anatomy', 'book_seduction', 'cigar', 'champagne', 'lucky_foot', 'first_aid'];
    const weapons = [], goods = [];
    for (let i = 0; i < 4; i++) { const w = pick(wPool); if (!weapons.includes(w)) weapons.push(w); }
    for (let i = 0; i < 5; i++) { const it = pick(gPool); if (!goods.includes(it)) goods.push(it); }
    p.sys.pawn = { day: game.time.day, weapons, goods, sold: [] };
    return p.sys.pawn;
  }
  const pawnItemPrice = (id) => Math.max(1, Math.floor((ITEMS[id]?.price ?? 0) * (ITEMS[id]?.pawnMult ?? (ITEMS[id]?.cat === 'junk' ? 0.6 * (st.getFlag('perk_scrap_eye') ? 1.4 : 1) : 0.35))));
  const pawnWeaponPrice = (id) => Math.floor((WEAPONS[id]?.price ?? 0) * 0.35);

  game.locations.register('pawn', (g, loc) => placeMenu(g, loc, {
    hours: [9, 21],
    speaker: 'Lucky Larry',
    closed: () => 'Lucky Larry\'s is gated up. A sign: "IF YOU ROB US, WE ROB YOU BACK." There\'s a drawing of a gun with a smiley face.',
    text: () => pick([
      'Lucky Larry has a gold tooth, a fake Rolex, and a real attitude. "Buyin\' or sellin\'? If it\'s hot, I don\'t wanna know. If it\'s REAL hot, I wanna know the price."',
      'The shop is wall-to-wall guitars, wedding rings and broken dreams. Larry polishes a trombone that\'s seen things.',
      'Larry: "No questions asked! Except one: how much do you want for it? And also: is it stolen? Don\'t answer that one."',
    ]),
    options: () => [
      { label: 'Sell your stuff', run: () => pawnSell() },
      { label: 'Browse the merchandise', hint: 'cheap weapons & "found" goods', run: () => pawnBuy() },
      { label: 'The locked case', hint: 'rare oddities · collector perks', run: () => game.lifestyle?.openOddities() },
      { label: 'Ask Larry why he\'s "Lucky"', run: () => say(g, loc.name, pick([
        '"I got hit by lightning six times. Survived all six. Also lost both my wives in the same lightning strike. Lucky AND single."',
        '"I found a winning lottery ticket in a dead guy\'s shoe. Don\'t ask why I was in a dead guy\'s shoe."',
      ]), 'Lucky Larry') },
    ],
  }));

  function pawnSell() {
    const p = st.p;
    return shopPanel(game, {
      title: "Lucky Larry's — Selling", speaker: 'Lucky Larry', intro: '"Lemme see what you got. ...Mm-hm. Mm-hm. Garbage. But I buy garbage."',
      sections: () => [
        { name: 'Items', products: Object.entries(p.inventory).filter(([id, q]) => q > 0 && ITEMS[id] && !ITEMS[id].noSell).map(([id, q]) => ({
          name: ITEMS[id].name, desc: `You have ${q}.`, priceLabel: `${fmtMoney(pawnItemPrice(id))} ea`, btn: 'Sell 1', qty: false,
          buy: () => { if (st.removeItem(id, 1)) { st.addMoney(pawnItemPrice(id), 'pawn'); sfx('cash'); } },
        })) },
        { name: 'Weapons', products: p.weapons.filter((w) => w !== 'fists' && WEAPONS[w]).map((w) => ({
          name: WEAPONS[w].name, desc: p.weapon === w ? 'Currently equipped.' : '', priceLabel: fmtMoney(pawnWeaponPrice(w)), btn: 'Sell',
          buy: async () => {
            if (!(await game.ui.confirm(`Sell your ${WEAPONS[w].name} for ${fmtMoney(pawnWeaponPrice(w))}?`))) return;
            p.weapons = p.weapons.filter((x) => x !== w);
            if (p.weapon === w) { if (game.combat?.equip) game.combat.equip('fists'); else p.weapon = 'fists'; }
            st.changed('weapons');
            st.addMoney(pawnWeaponPrice(w), 'pawn');
            sfx('cash');
          },
        })) },
      ],
    });
  }

  function pawnBuy() {
    const p = st.p;
    return shopPanel(game, {
      title: "Lucky Larry's — Merchandise", speaker: 'Lucky Larry', intro: '"Stock changes daily. Like my underwear. Ideally."',
      sections: () => {
        const s = pawnStock();
        return [
          { name: 'Weapons (no background check, no warranty, no questions)', products: s.weapons.map((w) => {
            const d = WEAPONS[w];
            const price = Math.round(d.price * 0.65);
            return {
              name: d.name, desc: `${d.kind === 'gun' ? 'Gun' : 'Melee'} · ${d.damage} dmg${d.ammo ? ` · ${d.ammo} ammo` : ''}. ${pick(['Slightly used.', 'Serial number filed off "for aesthetics".', 'Previous owner "doesn\'t need it anymore".'])}`,
              price, owned: p.weapons.includes(w), req: d.reqStr ? { str: d.reqStr } : null,
              buy: () => buyWeapon(w, price),
            };
          }) },
          { name: '"Found" Goods (karma -1)', products: s.goods.filter((id) => !s.sold.includes(id)).map((id) => {
            const price = Math.round(ITEMS[id].price * 0.5);
            return { name: ITEMS[id].name, desc: ITEMS[id].desc, price, buy: () => { if (game.items.buy(id, 1, price)) { s.sold.push(id); st.addStat('karma', -1); } } };
          }) },
        ];
      },
    });
  }

  function buyWeapon(w, price) {
    const p = st.p;
    const d = WEAPONS[w];
    if (p.weapons.includes(w)) return false;
    if (d.reqStr && p.str < d.reqStr) { game.ui.toast(`You need ${d.reqStr} STR to swing that without hurting yourself.`, 'bad'); return false; }
    if (!st.spend(price, 'weapon')) return false;
    if (game.combat?.giveWeapon) game.combat.giveWeapon(w, d.ammo ? (d.mag || 6) : 0);
    else {
      p.weapons.push(w);
      if (d.ammo) p.ammo[d.ammo] = (p.ammo[d.ammo] || 0) + (d.mag || 6);
      st.changed('weapons');
    }
    sfx('cash');
    game.bus.emit('item:bought', { id: w, qty: 1, weapon: true });
    if (game.combat?.equip) game.combat.equip(w); else { p.weapon = w; st.changed('weapon'); }
    game.ui.toast(`${d.name} acquired and equipped. ${d.ammo ? 'Comes with one mag. ' : ''}Q to switch weapons.`, 'good', 3500);
    return true;
  }

  // ---------------- gun shop ----------------
  const LEGAL = ['bat', 'knife', 'crowbar', 'machete', 'sledge', 'pistol', 'revolver', 'rifle'];
  const BACKROOM = ['brass', 'shotgun', 'smg', 'goldengun'];
  function gunProducts(list, mult, backroom) {
    const p = st.p;
    return list.filter((w) => WEAPONS[w]).map((w) => {
      const d = WEAPONS[w];
      const price = Math.round(d.price * mult);
      const req = d.kind === 'gun' ? (backroom ? (w === 'goldengun' ? { level: 10 } : null) : { karma: -20, level: 2 }) : { str: d.reqStr || 0 };
      return {
        name: d.name, price, owned: p.weapons.includes(w), req,
        desc: `${d.kind === 'gun' ? `Gun · ${d.damage} dmg · ${d.mag}-round mag · ${d.ammo} ammo` : `Melee · ${d.damage} dmg`}. ${GUN_DESC[w] || ''}`,
        buy: () => buyWeapon(w, price),
      };
    });
  }
  function ammoProducts(mult) {
    const p = st.p;
    return Object.entries(AMMO).map(([id, a]) => ({
      name: a.name, price: Math.round(a.price * mult), qty: true, tag: `You have ${p.ammo[id] || 0}`,
      buy: (q) => { if (st.spend(Math.round(a.price * mult) * q, 'ammo')) { if (game.combat?.giveAmmo) game.combat.giveAmmo(id, a.qty * q); else { p.ammo[id] = (p.ammo[id] || 0) + a.qty * q; st.changed('ammo'); } sfx('cash'); } },
    }));
  }
  const GUN_DESC = {
    bat: '"For baseball," Buck winks. There is no baseball in Rotwell.',
    knife: 'Flick it open dramatically. Cut yourself. Every time.',
    crowbar: 'Opens doors, crates, and arguments.',
    machete: 'For "gardening". The garden is a guy named Steve.',
    sledge: 'Hit things very hard, very slowly. A lifestyle.',
    pistol: 'The starter gun. Like a starter home, but for crime.',
    revolver: 'Six shots. Big boom. You will feel like a cowboy and sound like a bomb.',
    rifle: 'For hunting deer. Or "deer". Scope sold separately (it\'s a toilet paper tube).',
    brass: 'Technically illegal. Technically awesome.',
    shotgun: 'Sawed off by Chuck himself using a bread knife. Took three days.',
    smg: '"It\'s like a pistol that won\'t shut up." Fully automatic, fully illegal.',
    goldengun: 'Solid gold. Insanely heavy. Impractical. You need it.',
  };

  async function backroom(loc) {
    const p = st.p;
    if (!p.flags.backroom_pw && p.cha < 40) {
      return say(game, 'Back Alley Door', 'You knock. A slot slides open. "Password?" You guess "password". "...Nice try, cop." The slot slams shut.<br><br><span class="sys-hint">Someone at a bar might know the password. Or be charming enough (CHA 40) to talk your way in.</span>', 'Chuck Bang');
    }
    if (!p.flags.backroom_pw) { st.setFlag('backroom_pw', true); game.ui.toast('Chuck likes your face. You\'re in.', 'good'); }
    return shopPanel(game, {
      title: 'The Backroom', speaker: 'Chuck Bang',
      intro: 'Chuck leads you past crates marked "TOTALLY NOT GUNS" into a room lit by one bare bulb. "Cash only. No receipts. If anyone asks, you bought a lamp."',
      sections: () => [{ name: 'Off-Menu', products: gunProducts(BACKROOM, 1, true) }, { name: 'Bulk Ammo (markup for discretion)', products: ammoProducts(1.25) }],
    });
  }

  game.locations.register('gun_shop', (g, loc) => placeMenu(g, loc, {
    hours: [9, 21],
    speaker: 'Buck Bang',
    closed: () => (g.time.isBetween(22, 3)
      ? 'Bang Bang Bros. is locked behind steel shutters. But around back, there\'s a door with a slot... and light underneath.'
      : 'Bang Bang Bros. is locked behind steel shutters. Around back there\'s a door with a slot, dark for now. Word is it opens 10 PM to 3 AM.'),
    closedOptions: () => (g.time.isBetween(22, 3) ? [{ label: 'Knock on the back door', hint: 'after hours', run: () => backroom(loc) }] : []),
    text: () => pick([
      'Buck Bang, a man shaped like a gun safe, cleans a rifle on the counter. "Welcome to Bang Bang Bros. If it goes bang, we got it. If it doesn\'t, we\'ll make it."',
      'A mounted deer head on the wall is wearing sunglasses. Buck: "That\'s Chuck\'s ex-wife. Just kiddin\'. It\'s a deer. Or IS it."',
      'Buck: "Second Amendment, baby! Also the First. I don\'t know the others. Whatcha need?"',
    ]),
    options: () => {
      const p = st.p;
      return [
        { label: 'Browse the counter', run: () => shopPanel(g, {
          title: 'Bang Bang Bros. Firearms', speaker: 'Buck Bang',
          intro: `"Guns need a background check. We check if you got a background. Karma above -20 and you're at least level 2."`,
          sections: () => [{ name: 'Melee', products: gunProducts(LEGAL.filter((w) => WEAPONS[w]?.kind === 'melee'), 1) }, { name: 'Firearms', products: gunProducts(LEGAL.filter((w) => WEAPONS[w]?.kind === 'gun'), 1) }, { name: 'Ammo', products: ammoProducts(1) }],
        }) },
        { label: 'Use the shooting range', hint: '$25 · 1h', run: async () => {
          if (!p.weapons.some((w) => WEAPONS[w]?.kind === 'gun')) return say(g, 'Range', 'Buck: "You need a gun for the gun range. That\'s, like, the whole thing."', 'Buck Bang');
          if (!st.spend(25)) return;
          g.time.advance(60);
          const score = Math.round(Math.random() * 40 + p.int * 0.2 + p.str * 0.2);
          st.addXP(10);
          if (chance(0.5)) st.addStat('int', 0.2, 'range');
          return say(g, 'Shooting Range', `You blast a paper target shaped like Mr. Grimsby. Score: <b>${score}</b>. ${score > 50 ? 'Buck nods with respect.' : 'Buck: "You shot the ceiling twice. The ceiling is fine. You\'re not."'}`);
        } },
        { label: 'Ask about "other merchandise"', run: () => say(g, loc.name, 'Buck looks around, then leans in. "Come back after 10PM. Use the back door. Bring cash, a password, and no wire."', 'Buck Bang') },
      ];
    },
  }));

  const api = { wardrobe, OUTFITS, HATS, TATTOOS, buyWeapon, setLook };
  game.sysShops = api;
  return api;
}
