// Event-driven sounds: doors + shop bells, register / coins, quest stings, big-moment
// ducking, subtle dialog button hover/click, and a polish layer over the systems synth
// (game.sysSfx) so its money / level-up sounds use the nicer patches here and its other
// patches are trimmed + softened instead of hitting the bus at full square-wave volume.

const NO_DOOR = new Set(['dealer', 'hobo_camp', 'race', 'junkyard', 'isle_pier', 'isle_cove']);
const SHOP_BELL = new Set(['store', 'liquor', 'pawn', 'tattoo', 'gas', 'clothing', 'gun_shop', 'fortune', 'diner', 'pizza', 'isle_seafood', 'car_dealer', 'shop', 'pharmacy']);
// Spending money on these is not a purchase — no cheerful register.
const LOSS = /mug|rob|fine|bail|jail|confisc|stol|hospital|medical|surgery|death|died|lost|bet|casino|monte|tax|tithe|bribe|loan|ransom|heist/i;

export function installAudioHooks(game) {
  const A = game.audio;
  const bus = game.bus;

  // ---------------------------------------------------------------- doors
  let inside = false;
  bus.on('location:enter', (loc) => {
    if (!loc || !A.running()) return;
    const type = loc.type || '';
    if (NO_DOOR.has(type) || loc.open || String(loc.id || '').startsWith('dealer_')) return;
    if (!A.throttle('door', 600)) return;
    const S = A.samples;
    const seedy = /motel|hobo|pawn|junk|bar|club|squat|crack|trap|alley/.test(type);
    if (S?.has('door_open')) {
      if (seedy && S.has('door_creak')) S.play('door_creak'); else S.play('door_open');
    } else A.play('doorOpen', { vol: 0.9 });
    if (SHOP_BELL.has(type)) A.play('shopBell', { delay: 0.12 });
    inside = true;
  });
  bus.on('ui:close', () => {
    if (!inside) return;
    inside = false;
    if (!A.running()) return;
    if (A.samples?.has('door_close')) A.samples.play('door_close', { delay: 0.05 });
    else A.play('doorClose', { delay: 0.05, vol: 0.8 });
  });

  // ---------------------------------------------------------------- money
  let lastMoney = { amount: 0, reason: '' };
  bus.on('money:change', (m) => { lastMoney = m || lastMoney; });

  // ---------------------------------------------------------------- quests & big moments
  bus.on('quest:started', () => { if (A.throttle('quest', 700)) A.play('questStart'); });
  bus.on('quest:step', () => { if (A.throttle('quest', 700)) A.play('questStep'); });
  bus.on('quest:completed', () => { A.throttle('quest', 0); A.play('questDone'); A.duck(0.3, 3); });
  bus.on('ending:reached', () => A.duck(0.25, 6));
  bus.on('heist:completed', () => { A.play('questDone'); A.duck(0.3, 3); });
  bus.on('heist:failed', () => A.play('fail'));
  bus.on('player:died', () => A.duck(0.3, 3));

  // ---------------------------------------------------------------- systems synth polish
  let trim = null;
  function trimNode() {
    const ctx = A.ctx;
    if (trim && trim.ctx === ctx) return trim.node;
    const g = ctx.createGain(); g.gain.value = 0.55;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4800; lp.Q.value = 0.5;
    g.connect(lp); lp.connect(A.sfx);
    trim = { ctx, node: g };
    return g;
  }
  // Recorded money/door sounds where they exist (synth patch as fallback). Income is decided a
  // beat later so a drug sale can claim it with the 'sell' sound instead of doubling up.
  const S = () => A.samples;
  const rec = (g, o) => (S()?.has(g) ? (S().play(g, o), true) : false);
  let incomeT = null;
  function income() {
    const amt = lastMoney.amount || 0;
    if (amt >= 200) { if (!rec('coins')) A.play('cash', { big: true }); }
    else if (!rec('coin_drop', { vol: amt >= 40 ? 1 : 0.75 })) A.play('coin', { n: amt >= 40 ? 2 : 1 });
  }
  bus.on('drug:sold', () => {
    if (!A.running()) return;
    if (incomeT) { clearTimeout(incomeT); incomeT = null; }
    if (!rec('sell')) income();
  });
  const OVERRIDE = {
    coin: () => { if (incomeT) clearTimeout(incomeT); incomeT = setTimeout(() => { incomeT = null; income(); }, 40); },
    buy: () => (LOSS.test(lastMoney.reason || '') ? A.play('moneyLoss') : (rec('buy') || A.play('kaching'))),
    cash: () => (rec('coins') || A.play('cash', { big: true })),
    levelup: () => { if (!rec('level_up')) A.play('promoted'); A.duck(0.4, 1.8); },
    door: () => (rec('door_open') || A.play('doorOpen')),
    // return false = not handled -> the original (trimmed) synth patch plays
    punch: () => rec('hit_crit', { vol: 0.8 }),
    gulp: () => rec('drink'),
  };

  // ---------------------------------------------------------------- items & props
  const DRINK = new Set(['drink', 'booze']);
  bus.on('item:used', (e) => {
    if (!A.running() || !e?.id || e.gift) return;
    const cat = game.items?.def?.(e.id)?.cat;
    if (DRINK.has(cat)) rec('drink');
    else if (cat === 'med') rec('heal', { vol: 0.8 });
    else if (cat === 'food' || cat === 'smoke') rec('sack', { vol: 0.5, rate: 1.15 }); // wrapper rustle
  });
  bus.on('interact:dive', () => { if (A.running()) { rec('crate', { vol: 0.8 }); rec('sack', { delay: 0.25, vol: 0.8 }); } });
  bus.on('interact:vandal', () => { if (A.running()) rec('crate', { vol: 1.1, rate: 0.9 }); });
  bus.on('weapon:gained', () => { if (A.running()) rec('item_pickup'); });
  function wrapSys() {
    const S = game.sysSfx;
    if (!S || S._audioWrapped || typeof S.play !== 'function') return;
    const orig = S.play.bind(S);
    S._audioWrapped = true;
    S.play = (name, ...rest) => {
      if (!A.running()) return;
      const o = OVERRIDE[name];
      if (o) { let r; try { r = o(); } catch { /* cosmetic */ } if (r !== false) return; }
      const real = A.sfx;
      try { A.sfx = trimNode(); orig(name, ...rest); } catch { /* cosmetic */ } finally { A.sfx = real; }
    };
  }
  bus.on('game:start', wrapSys);
  game.addSystem({ name: 'audio-hooks', update() { if (!game.sysSfx?._audioWrapped) wrapSys(); } });

  // ---------------------------------------------------------------- dialog buttons: hover + click
  const BTN = '.ui-opt, .ui-btn, .ui-x';
  const SELF_VOICED = '.phone-modal, .title-modal, .creator'; // these already play their own click
  let hovered = null;
  addEventListener('pointerover', (e) => {
    const b = e.target?.closest?.(BTN);
    if (b === hovered) return;
    hovered = b;
    if (!b || b.classList.contains('disabled') || b.disabled || e.pointerType === 'touch') return;
    A.ui('hover');
  }, true);
  addEventListener('click', (e) => {
    const b = e.target?.closest?.(BTN);
    if (!b || b.closest(SELF_VOICED)) return;
    A.ui(b.classList.contains('disabled') || b.disabled ? 'error' : 'click');
  }, true);
  addEventListener('keydown', (e) => {
    if (!/^(Digit|Numpad)[1-9]$/.test(e.code)) return;
    const i = Number(e.code.slice(-1)) - 1;
    const stack = game.ui?.stack;
    const top = stack?.length ? stack[stack.length - 1] : null;
    if (!top?.isDialog) return;
    const opt = top.el?.querySelectorAll?.('.ui-opt')?.[i];
    if (opt) A.ui(opt.classList.contains('disabled') ? 'error' : 'click');
  }, true);
}
