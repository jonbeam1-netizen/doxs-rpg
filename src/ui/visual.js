// Small shared visual vocabulary for menus: icon chips, option classification, stat-effect chips.
//   chip(icon, text, kind)          one small pill: <icon> text   (kind: cash | cost | gain | muted | reason | info)
//   hintChips(hintHtml)             '$2 · +12 energy · needs STR 15' -> { chips: html, reason: 'needs STR 15' | '' }
//   classify(labelHtml)             -> { group, icon } for building menu cards
//   fxChips(fx)                     item fx { energy, hp, temp, perm } -> chips html
//   itemIcon(name, cat)             a line icon name for a shop product
//   bar(value, max, kind)           thin progress bar html
import { icon, hasIcon } from '../present/icons.js';

const decoder = typeof document !== 'undefined' ? document.createElement('textarea') : null;
export function plain(html) {
  const s = String(html ?? '').replace(/<[^>]*>/g, '');
  if (!decoder) return s;
  decoder.innerHTML = s;
  return decoder.value;
}
const escT = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function chip(ic, text, kind = 'muted', title = '') {
  return `<span class="vx-chip ${kind}"${title ? ` title="${escT(title)}"` : ''}>${ic && hasIcon(ic) ? icon(ic) : ''}${text != null && text !== '' ? `<b>${text}</b>` : ''}</span>`;
}

export function bar(value, max = 100, kind = '') {
  const pct = Math.max(0, Math.min(100, (100 * (Number(value) || 0)) / (max || 1)));
  return `<span class="vx-bar ${kind}"><i style="width:${pct.toFixed(1)}%"></i></span>`;
}

const STAT_ICON = { str: 'gym', int: 'bulb', cha: 'smile', karma: 'scale' };
const sgn = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);

// One hint part -> chip html, or null when it's a requirement / reason.
function partChip(raw) {
  const p = raw.trim();
  if (!p) return '';
  const low = p.toLowerCase();
  let m;
  if (low === 'free') return chip('money', 'free', 'gain');
  if ((m = /^\$[\d,.]+k?(\s*(\/|per|each|a)\s*[\w ]+)?/i.exec(p)) && m[0].length >= p.length - 2) return chip('money', escT(p.replace(/\s*\/\s*/g, '/')), 'cash');
  if ((m = /^([+\-−]?\s*\d+)\s*(max\s+)?energy$/i.exec(p))) {
    const n = Number(m[1].replace(/[−\s]/g, (c) => (c === '−' ? '-' : '')));
    return chip('bolt', sgn(n), n < 0 ? 'cost' : 'gain', 'energy');
  }
  if ((m = /^(\d+(\.\d+)?)\s*(h|hr|hrs|hours?|min|mins|minutes?)$/i.exec(p))) return chip('clock', m[1] + (/^m/i.test(m[3]) ? 'm' : 'h'), 'muted', 'takes');
  if ((m = /^([+\-−])?\s*(\d+)?\s*HP$/i.exec(p))) {
    const neg = m[1] === '-' || m[1] === '−';
    return chip('heart', (neg ? '−' : '+') + (m[2] || ''), neg ? 'cost' : 'gain', 'health');
  }
  if (/^full HP$/i.test(p)) return chip('heart', 'full', 'gain', 'health');
  if ((m = /^([+\-−]{1,2})\s*(\d+(\.\d+)?)?\s*((STR|INT|CHA|charm|strength|smarts)(\s*\/\s*(STR|INT|CHA|charm))*)\b(.*)$/i.exec(p))) {
    const neg = m[1][0] !== '+';
    const sign = neg ? '−' : m[1].replace(/-/g, '−');
    const norm = (s) => ({ charm: 'cha', strength: 'str', smarts: 'int' }[s.toLowerCase()] || s.toLowerCase());
    const stats = m[4].split('/').map((s) => norm(s.trim()));
    const rest = m[8]?.trim().replace(/^\(|\)$/g, '');
    return stats.map((s) => chip(STAT_ICON[s], sign + (m[2] || '') + ' ' + s.toUpperCase(), neg ? 'cost' : 'gain')).join('') + (rest ? chip('', escT(rest), 'muted') : '');
  }
  if ((m = /^karma\s*([+\-−]\s*\d+)$/i.exec(p)) || (m = /^([+\-−]\s*\d+)\s*karma$/i.exec(p))) {
    const n = Number(m[1].replace(/\s/g, '').replace('−', '-'));
    return chip('scale', sgn(n), n < 0 ? 'cost' : 'gain', 'karma');
  }
  if ((m = /^\+?\s*(\d+)\s*XP$/i.exec(p))) return chip('star', '+' + m[1], 'gain', 'XP');
  if (/^(stamina)$/i.test(p)) return chip('pulse', 'stamina', 'gain');
  if (/^(hurts|risky|dangerous)$/i.test(p)) return chip('warn', escT(p), 'cost');
  return chip('', escT(p.length > 28 ? p.slice(0, 26) + '…' : p), 'muted');
}

const REASON_RE = /^(needs?\b|requires?\b|not now|closed|once a day|done today|already|sold out|no room|full\b|members? only|come back|tomorrow|too (tired|drunk|broke))/i;

export function hintChips(hintHtml, disabled = false) {
  const text = plain(hintHtml);
  if (!text.trim()) return { chips: '', reason: '' };
  const parts = text.split(/\s+·\s+|\s*•\s*/);
  let reason = '';
  const out = [];
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    if (REASON_RE.test(p) && (disabled || /^needs?\b/i.test(p))) { reason = reason ? reason + ' · ' + p : p; continue; }
    out.push(partChip(p));
  }
  return { chips: out.join(''), reason };
}

// ---------------------------------------------------------------- option classification
const GROUPS = [
  ['money', /\b(deposit|withdraw|loan|account|invest|savings|pay (off|back|the|a|your)|fine|bail|donat|insurance|cash out|launder|fund|venture|business|legacy|charit)/],
  ['work', /\b(apply|shift|grab pizzas|delivery run|promotion|quit|clock in|on the clock|job)\b/],
  ['train', /\b(pump|lift|heavy session|treadmill|spar|study|read|class|course|enrol|seminar|practice|train|lesson|lecture|exam|workout|yoga|meditat|tutor|semester|shooting)/],
  ['play', /\b(high.?low|change rooms?|slots?|blackjack|roulette|poker|bet|dice|gambl|scratch|lotter|race|arcade|pool|darts|play|fight|bout|bracket|challenge|karaoke|arm.?wrestl|cage)/],
  ['food', /\b(coffee|platter|breakfast|pie|food|eat|meal|burger|sandwich|soup|special|snack|drink|beer|shot|whiskey|cocktail|booze|round|juice|wine|tab|order|slice|fries|dinner|lunch)\b/],
  ['rest', /\b(sleep|nap|rest|shower|heal|treat|doctor|patch|checkup|detox|rehab|sober)/],
  ['social', /\b(talk|gossip|chat|ask|flirt|date|hit on|dance|tour|meet|visit|pray|confess|listen|hang|party|vip|mingle|tip|hire|call|look around|watch|people.?watch|eavesdrop)/],
  ['shop', /\b(buy|shop|browse|sell|pawn|counter|racks|ink|tattoo|sale|membership|pass|stash|upgrade|rent|menu|pick up|get)\b/],
];
export const GROUP_NAMES = { work: 'Work', train: 'Train', food: 'Eat & drink', shop: 'Shop', play: 'Play', social: 'Talk', money: 'Money', rest: 'Rest', other: 'More' };
const GROUP_ICON = { work: 'work', train: 'gym', food: 'food', shop: 'bag', play: 'dice', social: 'talk', money: 'money', rest: 'bed', other: 'star' };
const ICON_RULES = [
  [/shoot|range|target/, 'gun'], [/fund|invest/, 'up'], [/venture|business/, 'work'], [/legacy|charit|lollipop|candy/, 'gift'], [/loan/, 'money'], [/promotion/, 'up'], [/\bquit\b/, 'x'], [/coffee|espresso/, 'cup'], [/treadmill|cardio|run/, 'pulse'], [/spar|fight|bout|cage|brawl|arm.?wrestl/, 'fist'],
  [/shower|bath/, 'drop'], [/study|read|book|library|class|course|lecture|exam|semester|seminar/, 'book'], [/membership|pass\b|card/, 'card'],
  [/beer|whiskey|shot|cocktail|booze|wine|drink|round/, 'drink'], [/sell|pawn/, 'money'], [/dance|karaoke|dj|music/, 'music'], [/pray|confess|church/, 'church'],
  [/tour|look around|watch/, 'eye'], [/sleep|nap|rest/, 'bed'], [/heal|doctor|treat|patch|checkup/, 'medical'], [/gift|flower/, 'gift'],
  [/date|flirt|hit on/, 'heart'], [/gun|ammo|counter/, 'gun'], [/tattoo|ink/, 'drop'], [/clothes|racks|threads/, 'shirt'], [/stash/, 'crate'],
  [/blackjack|poker|high.?low|cards/, 'cards'], [/slots?/, 'slots'], [/roulette/, 'roulette'], [/change rooms?/, 'door'], [/dice|bet|gambl|scratch|lotter/, 'dice'], [/race/, 'flag'], [/talk|gossip|chat|ask|locker|meet|call/, 'talk'],
  [/deposit|withdraw|loan|bank|invest|pay|bail|fine/, 'money'], [/juice|shake|protein/, 'cup'], [/food|eat|meal|platter|breakfast|pie|burger|slice|special|order/, 'food'],
  [/buy|shop|browse|sale|menu/, 'bag'],
];

// every keyword starts at a word boundary ('about' is not a bout)
const ICON_RULES_B = ICON_RULES.map(([re, n]) => [new RegExp('\\b(?:' + re.source + ')'), n]);

export function classify(labelHtml, opt = {}) {
  const low = plain(labelHtml).toLowerCase();
  let group = opt.group || null;
  if (!group) for (const [g, re] of GROUPS) if (re.test(low)) { group = g; break; }
  group ||= 'other';
  let ic = opt.icon || null;
  if (!ic) for (const [re, name] of ICON_RULES_B) if (re.test(low)) { ic = name; break; }
  return { group, icon: ic || GROUP_ICON[group] || 'star' };
}

// ---------------------------------------------------------------- items
const ITEM_RULES = [
  [/coffee|espresso/, 'cup'], [/energy|kardiak|shake|protein|soda|juice|water/, 'cup'], [/beer|whiskey|vodka|booze|wine|rum|gin|bottle|malt|forty|liquor|tequila|moonshine/, 'bottle'],
  [/cig|smoke|cigar|vape|joint/, 'cig'], [/ammo|rounds|shells|bullets/, 'ammo'], [/pistol|gun|rifle|shotgun|9mm|revolver|uzi|glock|magnum|smg/, 'gun'],
  [/knife|blade|machete|shiv|razor/, 'knife'], [/bat|pipe|crowbar|club|hammer|wrench|tire iron/, 'wrench'], [/vest|armor|armour|helmet/, 'badge'],
  [/book|novel|guide|manual|textbook|newspaper|magazine/, 'book'], [/flower|rose|chocolate|gift|teddy|perfume/, 'gift'], [/ring|necklace|gold|chain|watch|diamond|jewel|gem/, 'gem'],
  [/ticket|lotto|lottery|scratch/, 'ticket'], [/phone/, 'phone'], [/key|lockpick|pick/, 'key'], [/bandage|med|aspirin|first aid|kit|pill|cure|tylenol|ibuprofen/, 'medical'],
  [/shirt|jacket|hoodie|suit|pants|jeans|dress|coat|tee|clothes|outfit|shoes|boots|sneakers|hat|cap|beanie|fedora/, 'shirt'], [/tattoo|ink/, 'drop'],
  [/board|deck|skate|wheels|trucks/, 'flag'], [/burrito|dog|chips|noodle|pizza|donut|steak|meat|platter|burger|sandwich|snack|food|jerky|candy|pie|fries|taco|nuggets?|fish|shrimp|crab/, 'food'],
];
const CAT_ICON = { food: 'food', drink: 'cup', booze: 'bottle', smoke: 'cig', med: 'medical', gamble: 'ticket', gift: 'gift', book: 'book', upgrade: 'up', junk: 'crate', misc: 'bag' };
export function itemIcon(name, cat) {
  if (cat && CAT_ICON[cat]) return CAT_ICON[cat];
  const low = plain(name).toLowerCase();
  for (const [re, ic] of ITEM_RULES) if (re.test(low)) return ic;
  return 'bag';
}

export function fxChips(fx) {
  if (!fx) return '';
  let h = '';
  if (fx.energy) h += chip('bolt', sgn(fx.energy), fx.energy > 0 ? 'gain' : 'cost', 'energy');
  if (fx.hp) h += chip('heart', sgn(fx.hp), fx.hp > 0 ? 'gain' : 'cost', 'health');
  for (const k of ['str', 'int', 'cha']) {
    if (fx.temp?.[k]) h += chip(STAT_ICON[k], sgn(fx.temp[k]) + ' ' + k.toUpperCase(), 'gain', 'temporary boost');
    if (fx.perm?.[k]) h += chip(STAT_ICON[k], sgn(fx.perm[k]) + ' ' + k.toUpperCase(), 'gain', 'permanent');
  }
  if (fx.perm?.karma) h += chip('scale', sgn(fx.perm.karma), fx.perm.karma > 0 ? 'gain' : 'cost', 'karma');
  if (fx.drunk) h += chip('bottle', '+' + fx.drunk, 'cost', 'drunk');
  return h;
}
