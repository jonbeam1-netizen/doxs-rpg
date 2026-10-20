// Items: using, buying, the inventory panel (I key) and character-sheet hooks.
// game.items = { name(id), def(id), use(id), buy(id, qty, price), sellPrice(id), openInventory(), ITEMS }
import { ITEMS, ITEM_CATS } from '../data/items.js';
import { WEAPONS } from '../data/weapons.js';
import { DRUGS, DRUG_ORDER } from '../data/drugs.js';
import { COURSES } from '../data/courses.js';
import { JOBS } from '../data/jobs.js';
import { fmtMoney, pick, chance, randInt, esc } from '../core/util.js';
import { ensureState, capacity, hasCourse, today, dim } from './common.js';
import { meter } from './ui-kit.js';
import { icon } from '../present/icons.js';
import { chip, fxChips, itemIcon } from '../ui/visual.js';

export function installItems(game) {
  const st = game.state;

  const items = {
    ITEMS,
    def: (id) => ITEMS[id],
    name: (id) => ITEMS[id]?.name ?? WEAPONS[id]?.name ?? game.quests?.itemName?.(id) ?? String(id).replace(/^q_/, '').replace(/_/g, ' '),
    isQuestItem: (id) => !ITEMS[id] && String(id).startsWith('q_'),
    sellPrice: (id) => Math.max(1, Math.floor((ITEMS[id]?.price ?? 0) * 0.4)),

    // Buy (price = unit price override). Upgrades apply immediately.
    buy(id, qty = 1, price = null) {
      const d = ITEMS[id];
      if (!d) return false;
      const unit = price ?? d.price;
      if (d.cat === 'upgrade') {
        const p = st.p;
        if (capacity(p) >= d.capacity) { game.ui.toast('You already have a bigger bag, hoarder.', 'bad'); return false; }
        if (!st.spend(unit, 'shop')) return false;
        p.sys.capacity = d.capacity;
        st.changed('capacity');
        game.ui.toast(`${d.name}: you can now carry ${d.capacity} units of "merchandise".`, 'good');
        game.bus.emit('item:bought', { id, qty: 1 });
        return true;
      }
      if (!st.spend(unit * qty, 'shop')) return false;
      st.addItem(id, qty);
      game.bus.emit('item:bought', { id, qty });
      game.ui.toast(`Bought ${qty > 1 ? qty + '× ' : ''}${d.name}.`, 'good', 1600);
      return true;
    },

    use(id) {
      const d = ITEMS[id];
      if (!d) {
        if (game.quests?.useItem && st.hasItem(id)) { try { return game.quests.useItem(id); } catch (e) { console.error(e); } }
        game.ui.toast(`${items.name(id)}: hang onto it. Someone will want it.`, 'info');
        return false;
      }
      if (!st.hasItem(id)) { game.ui.toast("You don't have that. Check your pockets. Gross.", 'bad'); return false; }
      if (d.noUse || !d.fx) { game.ui.toast(useless(d), 'info'); return false; }
      const fx = d.fx;
      const p = st.p;
      // special handlers that can veto
      if (fx.special && specials[fx.special]) {
        const r = specials[fx.special](d, id);
        if (r === false) return false;
      }
      st.removeItem(id, 1);
      if (fx.time) game.time.advance(fx.time);
      if (fx.energy) {
        let energy = fx.energy;
        // Caffeine stacks badly: each extra drink within 6 game-hours gives 40% less, so chugging
        // a six-pack of Kardiak Arrest isn't an infinite gym membership. Food and sleep are unaffected.
        if (energy > 0 && d.cat === 'drink') {
          const now = game.time.total;
          p.sys ??= {};
          p.sys.caf = (Array.isArray(p.sys.caf) ? p.sys.caf : []).filter((t) => now - t < 360 && now >= t);
          const n = p.sys.caf.length;
          energy = Math.max(1, Math.round(energy * Math.pow(0.6, n)));
          p.sys.caf.push(now);
          if (n >= 2) game.ui.toast(`Your heart is doing a drum solo. Only +${energy} energy. (Caffeine wears off in a few hours. Eat or sleep instead.)`, 'bad', 3200);
        }
        st.addStat('energy', energy);
      }
      if (fx.hp > 0) st.heal(fx.hp);
      if (fx.hp < 0) st.damage(-fx.hp, 'item');
      if (fx.sober) { game.sysFx.sober(); game.sysFx.remove('hungover'); }
      if (fx.drunk) game.sysFx.addDrunk(fx.drunk);
      if (fx.temp) {
        const { min = 60, ...mods } = fx.temp;
        game.sysFx.add({ id: 'item_' + id, label: d.name, min, temp: mods, kind: 'good' });
      }
      if (fx.speed) game.sysFx.add({ id: 'speed_' + id, label: d.name, min: fx.speedMin ?? 60, speed: fx.speed, kind: 'drug' });
      if (fx.effect) game.sysFx.add({ id: fx.effect, min: fx.min ?? 60 });
      let bookGain = '';
      if (fx.perm) {
        // Books used to be flat, repeatable +INT with no limit: $700 of Gray's Anatomy = +25 INT,
        // which skipped every INT gate in the game. Now each title teaches you less every re-read
        // (1, 1/2, 1/4...) and high stats learn less from a $25 paperback (same curve as studying).
        let k = 1;
        if (d.cat === 'book') {
          p.sys ??= {};
          const read = (p.sys.booksRead ??= {});
          k = Math.pow(0.5, read[id] || 0);
          read[id] = (read[id] || 0) + 1;
        }
        const gains = [];
        for (const [stat, v] of Object.entries(fx.perm)) {
          const amt = d.cat === 'book' && v > 0 ? Math.round(dim(v * k, p[stat] ?? 0, 50) * 100) / 100 : v;
          // wearable "permanent Charm" goodies (the Funland jacket...) count as style: capped (systems/ventures.js)
          const got = stat === 'cha' && v > 0 && d.cat !== 'book' && game.lifestyle?.styleGain ? game.lifestyle.styleGain(amt, 'item:' + id) : st.addStat(stat, amt, 'item:' + id);
          if (d.cat === 'book' && v > 0) gains.push(`+${Math.round((got ?? amt) * 100) / 100} ${stat.toUpperCase()}`);
        }
        if (d.cat === 'book') bookGain = ` ${gains.join(' ')}${k < 1 ? ' (you\'ve read this one before)' : ''}.`;
      }
      if (fx.addiction) game.sysFx.addAddiction(fx.addiction);
      if (d.cat === 'book') game.ui.toast(`You read ${d.name} cover to cover.${bookGain} ${pick(['Your brain feels sore.', 'You moved your lips the whole time.', 'You understood at least 40% of it.'])}`, 'stat', 2600);
      else if (!fx.special) game.ui.toast(useLine(d), 'info', 2200);
      game.bus.emit('item:used', { id, qty: 1 });
      return true;
    },

    openInventory: () => openInventory(),
  };
  game.items = items;

  function useless(d) {
    if (d.gift) return `${d.name} is a gift. Give it to someone you're dating.`;
    if (d.cat === 'junk') return `${d.name}: pawn it or sell it at the junkyard. Licking it does nothing. You checked.`;
    return `You can't really "use" ${d.name}. Not in public anyway.`;
  }
  function useLine(d) {
    const by = {
      food: ['Nom. Your stomach files a complaint.', 'You inhale it in three bites.', 'Delicious. Probably.'],
      drink: ['Glug glug. Your heart does a little dance.', 'You can see sounds now.'],
      booze: ['Down the hatch!', 'Burns so good.', "You're not an alcoholic, you're a connoisseur."],
      smoke: ['*cough* So cool. *cough*', 'You look like a 1950s movie star with emphysema.'],
      med: ['Medicine! Science! Probably!', 'You feel slightly less dead.'],
      misc: ['Done.'],
      gift: ['Yum.'],
    };
    return `${d.name}: ${pick(by[d.cat] || by.misc)}`;
  }

  // ---------------- specials ----------------
  const specials = {
    burrito() {
      if (chance(0.2)) setTimeout(() => { st.damage(5, 'burrito'); game.ui.toast('The burrito fights back. You lose 5 HP and some dignity in an alley.', 'bad'); }, 200);
      else game.ui.toast('Gas Station Burrito: hot lava core, ice cold edges. Somehow perfect.', 'info');
    },
    holy() {
      game.sysFx.remove('withdrawal');
      // +1 karma, but only for the first two bottles a day (no buying sainthood by the crate).
      const t = today(game);
      t.holy = (t.holy || 0) + 1;
      if (t.holy <= 2) st.addStat('karma', 1, 'item:holy_water');
      game.ui.toast('The holy water soothes your soul and also your withdrawal. Praise be. Burp.', 'good');
    },
    scratch(d, id) {
      setTimeout(() => scratchCard(id === 'scratch_gold'), 50);
    },
    scratch_gold() { setTimeout(() => scratchCard(true), 50); },
    news() { setTimeout(() => game.sysNews?.open(), 50); },
  };

  function scratchCard(gold) {
    const r = Math.random();
    const table = gold
      ? [[0.0005, 250000], [0.004, 10000], [0.02, 1000], [0.08, 100], [0.22, 30], [0.42, 20]]
      : [[0.0004, 25000], [0.004, 1000], [0.025, 100], [0.09, 10], [0.3, 2]];
    let prize = 0, acc = 0;
    for (const [pr, v] of table) { acc += pr; if (r < acc) { prize = v; break; } }
    const symbols = gold ? ['🚽', '💰', '👑', '💩'] : ['💩', '🍀', '💲', '🦷'];
    const show = prize ? Array(3).fill(gold ? '💰' : '💲').join(' ') : [pick(symbols), pick(symbols), '💩'].join(' ');
    if (prize) st.addMoney(prize, 'scratch');
    const lose = ['Nothing. The turd mocks you.', 'Loser! But you knew that.', "So close! (You weren't close.)", 'You scratch so hard you tear the card. Also you lost.'];
    game.ui.dialog({
      title: gold ? 'Golden Toilet Scratcher' : 'Lucky Turd Scratch-Off',
      html: `<div class="sys-big" style="font-size:44px">${show}</div><div style="text-align:center;margin-top:8px">${prize ? `<b class="ui-good">WINNER! ${fmtMoney(prize)}</b>${prize >= 1000 ? '<br>You scream so loud a dog runs into traffic.' : ''}` : pick(lose)}</div>`,
      options: [
        ...(st.hasItem(gold ? 'scratch_gold' : 'scratch') ? [{ label: 'Scratch another', onSelect: () => items.use(gold ? 'scratch_gold' : 'scratch') }] : []),
        { label: 'OK' },
      ],
    });
  }

  // ---------------- inventory panel (I key) ----------------
  let invEntry = null;
  function openInventory(tab = 'items') {
    if (invEntry && !invEntry.closed) return invEntry;
    const wrap = document.createElement('div');
    wrap.className = 'sp';
    invEntry = game.ui.openPanel({ title: 'Pockets & Bag', body: wrap, width: 760, className: 'sp-modal inv-modal', onClose: () => { invEntry = null; } });
    invEntry.isInventory = true;
    let descs = [];
    const render = () => {
      const p = st.p;
      const inv = Object.entries(p.inventory).filter(([, q]) => q > 0);
      const district = game.world?.districtAt?.(game.player.pos.x, game.player.pos.z) || 'downtown';
      descs = [];
      const tile = ({ ic, name, q, chips = '', desc = '', btn = '', cls = '', color = '' }) => {
        const i = descs.push(`<b>${name}</b> ${desc}`) - 1;
        return `<div class="sp-item inv-tile ${cls}" data-dsc="${i}"><div class="sp-top"><span class="sp-ico"${color ? ` style="color:${color}"` : ''}>${icon(ic)}</span>${q != null ? `<span class="inv-q">×${q}</span>` : ''}</div>
          <div class="sp-name">${name}</div>${chips ? `<div class="pm-chips">${chips}</div>` : ''}${btn ? `<div class="sp-btns">${btn}</div>` : ''}</div>`;
      };
      let html = `<div class="inv-head"><div class="tabs inv-tabs">
        ${['items', 'drugs', 'weapons'].map((t) => `<button class="tab ${t === tab ? 'sel' : ''}" data-tab="${t}">${icon({ items: 'bag', drugs: 'pill', weapons: 'fist' }[t])} ${{ items: 'Items', drugs: 'Contraband', weapons: 'Weapons' }[t]}</button>`).join('')}</div>
        <span class="pm-wallet">${chip('money', fmtMoney(p.money), 'cash', 'cash')}${chip('heart', `${Math.ceil(p.hp)}/${p.maxHp}`, 'muted', 'HP')}${chip('bolt', `${Math.floor(p.energy)}/${p.maxEnergy}`, 'muted', 'energy')}</span></div><div class="sp-scroll inv-scroll">`;
      if (tab === 'items') {
        if (!inv.length) html += '<div class="cs-empty">Pocket lint, a bus transfer from 2009, and one (1) mystery pill that you decide not to take.</div>';
        const byCat = {};
        for (const [id, q] of inv) (byCat[ITEMS[id]?.cat || (String(id).startsWith('q_') ? 'quest' : 'misc')] ??= []).push([id, q]);
        for (const cat of ['quest', ...Object.keys(ITEM_CATS)]) {
          if (!byCat[cat]) continue;
          html += `<div class="pm-sect"><span>${ITEM_CATS[cat] ?? 'Quest Items'}</span></div><div class="sp-grid">`;
          for (const [id, q] of byCat[cat]) {
            const d = ITEMS[id] || { name: items.name(id), desc: game.quests?.itemDesc?.(id) ?? 'Important-looking. Do not sell it. Do not eat it.' };
            const usable = d.fx && !d.noUse;
            html += tile({ ic: cat === 'quest' ? 'key' : itemIcon(d.name, d.cat), name: d.name, q, chips: fxChips(d.fx), desc: d.desc || '', cls: cat === 'quest' ? 'owned' : '',
              btn: usable ? `<button class="ui-btn primary" data-use="${id}">Use</button>` : '' });
          }
          html += '</div>';
        }
      } else if (tab === 'drugs') {
        const total = st.totalDrugs();
        const add = p.sys.addiction?.level || 0;
        html += `<div class="inv-bars"><span class="cs-vl">${icon('bag')}Bag</span>${meter(total, capacity(p), 'var(--toxic)')}<span class="cs-vn">${total}/${capacity(p)}</span>
          <span class="cs-vl">${icon('pill')}Addiction</span>${meter(add, 100, add > 50 ? 'var(--blood-bright)' : 'var(--toxic)')}<span class="cs-vn">${Math.round(add)}%</span></div>
          <div class="pm-notes"><span>Prices for ${district}. Sell at dealers.${add >= 25 ? ' Go a few hours without and the shakes kick in.' : ''}</span></div>`;
        const owned = DRUG_ORDER.filter((id) => (p.drugs[id] || 0) > 0);
        if (!owned.length) html += '<div class="cs-empty" style="margin-top:8px">Nothing. Clean as a nun\'s browser history.</div>';
        else {
          html += '<div class="sp-grid" style="margin-top:8px">';
          for (const id of owned) {
            const pr = game.market?.price?.(id, district) ?? DRUGS[id].base;
            html += tile({ ic: 'pill', name: DRUGS[id].name, q: p.drugs[id], color: DRUGS[id].color, chips: chip('money', `${fmtMoney(pr)} ea`, 'cash', 'street value'), desc: DRUGS[id].desc, cls: 'drug',
              btn: `<button class="ui-btn" data-drug="${id}">Sample</button>` });
          }
          html += '</div>';
        }
      } else {
        html += '<div class="sp-grid">';
        for (const id of p.weapons) {
          const w = WEAPONS[id];
          if (!w) continue;
          const eq = p.weapon === id;
          html += tile({ ic: w.ammo ? 'gun' : /fist/i.test(w.name) ? 'fist' : /knife|blade|machete|shiv/i.test(w.name) ? 'knife' : 'wrench', name: w.name, cls: eq ? 'owned' : '',
            chips: chip('fist', `${w.damage}`, 'muted', 'damage') + (w.ammo ? chip('ammo', `${p.ammo[w.ammo] || 0}`, (p.ammo[w.ammo] || 0) > 0 ? 'muted' : 'cost', w.ammo) : '') + (eq ? chip('', 'equipped', 'gain') : ''),
            desc: w.desc || '', btn: eq ? '' : `<button class="ui-btn" data-equip="${id}">Equip</button>` });
        }
        html += '</div>';
      }
      html += '</div><div class="sp-detail"><span class="ui-muted">Hover or tap something for details.</span></div>';
      wrap.innerHTML = html;
    };
    const showDesc = (e) => {
      const t = e.target.closest?.('[data-dsc]');
      const d = wrap.querySelector('.sp-detail');
      if (t && d) d.innerHTML = descs[Number(t.dataset.dsc)] || '';
    };
    wrap.addEventListener('mouseover', showDesc);
    wrap.addEventListener('focusin', showDesc);
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) { showDesc(e); return; }
      if (b.dataset.tab) { tab = b.dataset.tab; render(); return; }
      if (b.dataset.use) { items.use(b.dataset.use); }
      if (b.dataset.drug) { game.market?.use?.(b.dataset.drug); }
      if (b.dataset.equip) {
        const id = b.dataset.equip;
        if (game.combat?.equip) game.combat.equip(id);
        else { st.p.weapon = id; st.changed('weapon'); }
        game.ui.toast(`Equipped ${WEAPONS[id]?.name}.`, 'info', 1500);
      }
      if (invEntry && !invEntry.closed) render();
    });
    render();
    invEntry.render = render;
    return invEntry;
  }

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyI' || !game.started) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const top = game.ui.top();
    if (top?.isInventory) { top.close(); return; }
    if (top?.isSheet) { top.close(); openInventory(); return; }
    if (!game.ui.isBlocking()) openInventory();
  });

  // ---------------- character sheet section ----------------
  game.ui.sheetSections.push((g) => {
    const p = g.state.p;
    ensureState(p);
    const job = g.jobs?.current?.();
    const edu = Object.entries(p.education || {}).filter(([id]) => COURSES[id]);
    const dates = Object.entries(p.dating || {}).filter(([, d]) => d.rel > 0);
    const fxList = (p.effects || []).map((e) => e.label);
    const card = (ic, k, v, extra = '') => `<div class="life-card"><span class="cs-si">${icon(ic)}</span><span class="life-t"><small>${k}</small><b>${v}</b>${extra}</span></div>`;
    let html = `<div class="pm-sect cs-h">${icon('home')}<span>Life</span></div><div class="life-grid">
      ${card('work', 'Job', job ? `${job.title} <span class="ui-muted">@ ${JOBS[job.id]?.name}</span>` : '<span class="ui-muted">Unemployed. Your mom is so proud.</span>', job ? `<span class="pm-chips">${chip('money', `${fmtMoney(job.pay)}/${JOBS[job.id]?.kind === 'delivery' ? 'drop' : 'hr'}`, 'cash')}${chip('clock', `${job.shifts} shifts`, 'muted')}</span>` : '')}
      ${card('home', 'Home', g.locations.get(p.home)?.name ?? p.home)}
      ${card('pill', 'Drug bag', `${g.state.totalDrugs()} / ${capacity(p)}`, `${meter(g.state.totalDrugs(), capacity(p), 'var(--toxic)')}${p.sys.addiction.level >= 1 ? `<span class="pm-chips">${chip('pill', `addiction ${Math.round(p.sys.addiction.level)}%`, p.sys.addiction.level >= 25 ? 'cost' : 'muted')}</span>` : ''}`)}
      ${card('heart', 'Partner', p.sys.partner ? (g.sysDating?.name?.(p.sys.partner) ?? p.sys.partner) : '<span class="ui-muted">Forever alone (for now)</span>')}
      ${p.sys.loan ? card('money', 'Loan', `<span class="ui-bad">${fmtMoney(p.sys.loan.amount)}</span> <span class="ui-muted">owed to First Bank</span>`) : ''}
    </div>
    ${fxList.length ? `<div class="pm-chips" style="margin-top:6px">${fxList.map((l) => chip('bolt', l, 'muted')).join('')}</div>` : ''}`;
    if (edu.length) {
      html += `<div class="pm-sect cs-h">${icon('school')}<span>Education</span></div><div class="life-grid">`;
      for (const [id, e] of edu) {
        const c = COURSES[id];
        const done = hasCourse(p, id);
        html += card('book', c.short, done ? '<span class="ui-good">Graduated</span>' : `${e.sessions || 0}/${c.sessions} sessions`, done ? '' : meter(e.sessions || 0, c.sessions, 'var(--xp)'));
      }
      html += '</div>';
    }
    if (dates.length) {
      html += `<div class="pm-sect cs-h">${icon('heart')}<span>Romance</span></div><div class="life-grid">`;
      for (const [id, d] of dates) html += card('heart', g.sysDating?.name?.(id) ?? id, d.partner ? '❤ partner' : Math.round(d.rel) + '%', meter(d.rel, 100, '#d84a8a'));
      html += '</div>';
    }
    html += `<div class="ui-row" style="margin-top:10px"><button class="ui-btn primary" data-sys-inv="items">Open inventory (I)</button><button class="ui-btn" data-sys-inv="drugs">Contraband</button><button class="ui-btn" data-sys-news="1">Today's paper</button></div>`;
    return html;
  });
  game.bus.on('ui:sheet-open', (entry) => {
    entry?.el?.querySelectorAll('[data-sys-inv]').forEach((b) => b.addEventListener('click', () => { entry.close(); openInventory(b.dataset.sysInv); }));
    entry?.el?.querySelector('[data-sys-news]')?.addEventListener('click', () => { entry.close(); game.sysNews?.open(); });
  });

  game.ui.menuButtons.push({ label: 'Inventory', hint: 'I', onClick: () => openInventory() });
  return items;
}

