// Presentation layer: dialog portraits + typewriter text, story moments (letterbox + framed camera),
// chapter title cards, and prompt icons. Reads quest/NPC data at runtime; owns no game state except
// the 'present_seen' flag (chapter cards already shown).
//
// game.present = {
//   moment({ focus, text, speaker, duration, card, shot, cine }) -> Promise   (see moment.js)
//   card({ kicker, title, sub }, ms)          chapter-style title card on its own
//   portrait(speaker, { look, mood }) -> <canvas> | null
//   lookFor(speaker) -> look | null            what a dialog with this speaker would show
//   skip(), active, auto (bool: automatic story moments on/off for this session), enabled (saved setting)
// }
// Dialog extras: game.ui.dialog({ ..., mood, portrait: false | look, typewriter: false }).
import { portraitElement, portraitCanvas } from './portrait.js';
import { typewrite } from './typewriter.js';
import { icon, TYPE_ICON } from './icons.js';
import { Cinema } from './moment.js';

const PALETTE = ['#141414', '#1c1c24', '#2a2420', '#3a2f25', '#2a3a4a', '#3a4a20', '#4a1a1a', '#5a1020', '#1f2a44', '#4a3f2a', '#333333', '#2e3a33', '#4a5a6a', '#5a4630', '#3d2b3d'];
const HAT_COLORS = ['#2a2420', '#3a2a1a', '#1a1a1a', '#4a1a1a', '#2a3a4a', '#3a3a2a', '#5a4a3a'];
const HATS = [null, null, null, 'cap', 'cap', 'beanie', 'beanie', 'fedora', 'hardhat', 'tophat'];
const NOT_A_PERSON = /\b(text from|terminal|radio|tv|news|machine|arcade|bulletin|notice|sign|intercom|pa system|computer|atm|grimco os|menu)\b/i;
const DEFAULT_MOOD = { vivienne: 'smug', grimsworth: 'smug', lardner: 'smug', mayor: 'smug', chad: 'smug' };
const NUM = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const decoder = document.createElement('textarea');
function plain(html) { decoder.innerHTML = String(html ?? '').replace(/<[^>]*>/g, ''); return decoder.value; }
function norm(s) { return plain(s).split(/\s+[—–-]\s+|\s*\(/)[0].trim().toLowerCase(); }

export async function installPresent(game) {
  const ui = game.ui;
  const params = new URLSearchParams(location.search);
  let CHARACTERS = {}, ENDINGS = {}, goals = null;
  try { ({ CHARACTERS = {}, ENDINGS = {} } = await import('../data/quests.js')); } catch (e) { console.warn('[present] quest data unavailable', e); }
  try { goals = await import('../quests/goals.js'); } catch { goals = null; }

  let enabled = true;
  try { enabled = localStorage.getItem('doxsrpg_cine') !== '0'; } catch { /* ignore */ }

  // ------------------------------------------------------------------ who's talking?
  const charByName = new Map();
  for (const [id, c] of Object.entries(CHARACTERS)) if (c?.name) charByName.set(norm(c.name), id);
  let locNames = null, locCount = -1;
  function locIndex() {
    const list = game.locations?.list || [];
    if (list.length !== locCount) {
      locCount = list.length;
      locNames = new Map();
      for (const l of list) if (l?.name) locNames.set(String(l.name).trim().toLowerCase(), l.type);
    }
    return locNames;
  }

  // Talking to an NPC (E on them) marks them as the face of the dialogs that follow.
  let talk = null;
  game.bus.on('npc:talk', ({ npc } = {}) => { if (npc) talk = { npc, t: performance.now() }; });

  function hashedLook(name) {
    const r = rng(hash(name));
    const pick = (a) => a[Math.floor(r() * a.length)];
    const look = { color: pick(PALETTE), hat: pick(HATS), hatColor: pick(HAT_COLORS) };
    if (/\b(officer|cop|pd|police|sgt|sergeant|guard|chief)\b/i.test(name)) Object.assign(look, { color: '#1a2440', hat: 'cop', hatColor: '#141c30' });
    else if (/\b(det\.?|detective)\b/i.test(name)) Object.assign(look, { hat: 'fedora' });
    if (r() < 0.12) look.build = pick(['chonky', 'scrawny', 'lanky', 'shrimp']);
    return look;
  }

  function npcLook(npc) { return { color: npc.color ?? npc.spec?.color, hat: npc.hat ?? npc.spec?.hat ?? null, hatColor: npc.hatColor ?? npc.spec?.hatColor }; }

  // -> { look, charId } | null
  function resolve(args) {
    if (args.portrait === false) return null;
    if (args.portrait && typeof args.portrait === 'object') return { look: args.portrait };
    const raw = String(args.speaker || '');
    if (!raw.trim()) return null;
    const key = norm(raw);
    if (!key) return null;
    const charId = charByName.get(key);
    if (charId) {
      const c = CHARACTERS[charId];
      const look = c.color ? { color: c.color, hat: c.hat || null, hatColor: c.hatColor, skin: c.skin, build: c.build } : { ...hashedLook(c.name), ...(c.hat ? { hat: c.hat } : {}) };
      return { look, charId };
    }
    const p = game.state?.p;
    if (p?.name && key === String(p.name).trim().toLowerCase()) return { look: p.look || { color: 0x101010 } };
    // the NPC you just walked up to (talk.js labels its dialogs with the role, onTalk with a short name)
    if (talk) {
      const fresh = performance.now() - talk.t < 2500;
      const n = talk.npc;
      const pp = game.player?.pos;
      const near = n && !n.dead && pp && Math.hypot(n.pos.x - pp.x, n.pos.z - pp.z) < 7;
      if (near && (fresh || key === norm(n.name))) { talk.t = performance.now(); return { look: npcLook(n) }; }
      if (!near) talk = null;
    }
    // a nearby NPC with that name (shopkeepers standing in the world)
    try {
      const pp = game.player.pos;
      const n = game.npcs?.near?.(pp.x, pp.z, 9)?.find((o) => norm(o.name) === key);
      if (n) return { look: npcLook(n) };
    } catch { /* ignore */ }
    if (NOT_A_PERSON.test(raw) || locIndex().has(plain(raw).trim().toLowerCase())) return null;
    return { look: hashedLook(key) };
  }

  function moodOf(args, text, charId) {
    if (args.mood) return args.mood;
    const t = text.slice(0, 600);
    if (/\b(kill|you're dead|dead meat|smash|break your|i hate|shut up|get out|fight me|idiot|moron|scram)\b/i.test(t)
      || ((t.match(/!/g) || []).length >= 2 && /\b[A-Z]{4,}\b/.test(t))) return 'angry';
    if (/\b(please|help me|scared|afraid|oh no|don't hurt|i'm sorry|oh god)\b/i.test(t)) return 'worried';
    if (DEFAULT_MOOD[charId]) return DEFAULT_MOOD[charId];
    if (/\b(darling|heh|obviously|of course|naturally|sweetie|my dear|adorable)\b|\*(smirk|grin)/i.test(t)) return 'smug';
    return 'neutral';
  }

  // ------------------------------------------------------------------ dialog decorator
  const recent = [];                 // texts typed lately: re-opened menus show instantly
  const reduce = matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let blipT = 0;
  function blip(pitch) {
    const A = game.audio;
    if (!A?.running?.() || !A.play) return;
    const now = performance.now();
    if (now - blipT < 48) return;
    blipT = now;
    A.play((ctx, dest, t) => {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(pitch * (0.94 + Math.random() * 0.12), t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.016, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
      o.connect(lp); lp.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.06);
    }, { bus: 'ui' });
  }

  ui.dialogDecorators.push(({ wrap, textEl, args, entry }) => {
    const text = textEl.textContent || '';
    // portrait
    let who = null;
    try { who = resolve(args); } catch (e) { console.warn('[present] portrait lookup failed', e); }
    if (who) {
      const mood = moodOf(args, text, who.charId);
      const box = document.createElement('div');
      box.className = 'pr-portrait';
      box.appendChild(portraitElement(who.look, mood));
      wrap.querySelector('.ui-dlg-head')?.prepend(box);
      wrap.classList.add('has-portrait');
    }
    // typewriter
    if (args.typewriter === false || reduce) return;
    if (!text.trim() || text.length > 1400) return;
    if (textEl.querySelector('table,button,input,select,textarea,canvas,img,svg,iframe,video,.ui-grid,.ui-card,.ui-row,[id]')) return;
    const key = (args.speaker || '') + '|' + text;
    if (recent.includes(key)) return;
    recent.push(key); if (recent.length > 40) recent.shift();
    const pitch = args.speaker ? 150 + (hash(norm(args.speaker)) % 180) : 520;
    wrap.classList.add('tw-on');
    const tw = typewrite(textEl, {
      onChar: () => blip(pitch),
      onDone: () => wrap.classList.remove('tw-on'),
    });
    Object.defineProperty(entry, 'typing', { get: () => tw.typing, configurable: true });
    entry.finishTyping = () => tw.finish();
    entry.onClosed = () => tw.finish();
    wrap.querySelector('.ui-dlg-head')?.addEventListener('click', () => tw.finish());
  });

  // ------------------------------------------------------------------ prompt icons
  ui.promptDecorate = (html) => {
    const m = /^\s*(<kbd>[^<]*<\/kbd>)\s*(Enter|Talk to|Speak with|Speak to|Chat with|Visit)\s+([\s\S]+)$/.exec(html);
    if (!m) return html;
    const [, k, verb, rest] = m;
    let ic = 'talk';
    if (verb === 'Enter' || verb === 'Visit') ic = TYPE_ICON[locIndex().get(plain(rest).trim().toLowerCase())] || 'door';
    return `${k}<span class="pr-pi">${icon(ic)}</span><span class="pr-pv">${verb} </span><span class="pr-pn">${rest}</span>`;
  };

  // ------------------------------------------------------------------ moments
  const cinema = new Cinema(game);
  game.addSystem({ name: 'present', update: (dt) => { try { cinema.update(dt); } catch (e) { console.error('[present] update failed', e); cinema._end?.(); } } });

  const present = {
    auto: !game.devMode || params.has('moments'),
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; try { localStorage.setItem('doxsrpg_cine', enabled ? '1' : '0'); } catch { /* ignore */ } },
    get active() { return cinema.active; },
    moment: (spec) => cinema.moment(spec),
    card: (c, ms) => cinema.card(c, ms),
    skip: () => cinema.skip(),
    lookFor: (speaker) => resolve({ speaker })?.look ?? null,
    portrait(speaker, { look = null, mood = 'neutral' } = {}) {
      const l = look || resolve({ speaker })?.look;
      return l ? portraitCanvas(l, mood) : null;
    },
    _cinema: cinema,
  };
  game.present = present;

  ui.menuButtons.push({
    get label() { return `Story cinematics: ${enabled ? 'On' : 'Off'}`; },
    hint: 'camera moments',
    onClick: () => { present.enabled = !enabled; ui.toast(`Story cinematics ${enabled ? 'on' : 'off'}.`, 'info', 1800); },
  });

  // Is it a good time to take the camera? (never mid-fight, mid-chase, mid-heist)
  function calm() {
    const g = game;
    if (!g.started || g.player?.dead || ui.photoMode) return false;
    if ((g.state?.p?.heat ?? 0) >= 2) return false;
    try { if (g.heists?.active) return false; } catch { /* ignore */ }
    try { if (g.combat?.inBrawl?.()) return false; } catch { /* ignore */ }
    try {
      const pp = g.player.pos;
      if (g.npcs?.near?.(pp.x, pp.z, 16)?.some((n) => n.hostile && !n.dead)) return false;
    } catch { /* ignore */ }
    return true;
  }
  const autoOn = () => present.auto && enabled;

  const seen = () => { const s = game.state.getFlag('present_seen', null); return Array.isArray(s) ? s : []; };
  function once(key) {
    const s = seen();
    if (s.includes(key)) return false;
    game.state.setFlag('present_seen', [...s, key].slice(-60));
    return true;
  }

  function play(spec, ttl = 25000) {
    // checked again when it actually starts (things change while a dialog is still open)
    const item = { ...spec, guard: () => autoOn() && calm() };
    return cinema.moment(item, ttl);
  }

  function giverFocus(def, id) {
    const pp = game.player.pos;
    const npc = def.giver ? game.npcs?.get?.('q_' + def.giver) : null;
    if (npc && !npc.dead && Math.hypot(npc.pos.x - pp.x, npc.pos.z - pp.z) < 45) return npc;
    try {
      const t = game.quests.targets?.(id)?.[0];
      if (t && Number.isFinite(t.x) && Math.hypot(t.x - pp.x, t.z - pp.z) < 90) return { x: t.x, z: t.z };
    } catch { /* ignore */ }
    return 'player';
  }

  function pathOf(id) { return goals?.PATHS?.find((p) => p.id === id) || null; }

  function onQuest(kind, { id, step } = {}) {
    const q = game.quests;
    const def = q?.def?.(id);
    if (!def || def.kind !== 'main' || !autoOn()) return;
    if (kind === 'start') {
      let card = null;
      if (id === 'main_prologue') {
        let sub = '';
        try { sub = goals?.chapter?.(game)?.text || ''; } catch { /* ignore */ }
        card = { kicker: 'Chapter One', title: def.title, sub };
      } else {
        const p = pathOf(id);
        card = { kicker: 'Chapter Three', title: def.title, sub: p ? `${p.door} · ${p.style}` : '' };
      }
      if (!once('start:' + id)) card = null;
      const giver = CHARACTERS[def.giver];
      play({ focus: giverFocus(def, id), speaker: card ? '' : (giver?.name || ''), text: card ? '' : def.title, card, duration: card ? 4.2 : 3.2 });
    } else if (kind === 'done') {
      if (def.ending) return; // the ending screen takes over
      play({ focus: 'player', shot: 'hero', duration: 3.2 });
      if (id === 'main_prologue' && once('chapter:doors')) {
        let sub = 'Pick a way out of this toilet.';
        try { const t = goals?.chapter?.(game)?.text; if (t) sub = t.split('. ')[0].replace(/\.?$/, '.'); } catch { /* ignore */ }
        play({ cine: false, card: { kicker: 'Chapter Two', title: 'Five Doors', sub } });
      }
    } else if (kind === 'step') {
      let st = null;
      try { st = q.steps(id)?.[step]; } catch { /* ignore */ }
      if (!st?.finale || !once('finale:' + id)) return;
      let sub = '';
      try { sub = q.objectiveText(id) || ''; } catch { /* ignore */ }
      play({ focus: giverFocus({}, id), shot: 'wide', card: { kicker: 'Finale', title: def.title, sub: plain(sub).slice(0, 90) }, duration: 4.2 });
    }
  }
  game.bus.on('quest:started', (d) => onQuest('start', d));
  game.bus.on('quest:completed', (d) => onQuest('done', d));
  game.bus.on('quest:step', (d) => onQuest('step', d));

  // After the ending screen is dismissed: a slow pull-back over the city.
  game.bus.on('ending:reached', ({ id } = {}) => {
    if (!autoOn()) return;
    const E = ENDINGS[id];
    play({ focus: 'player', shot: 'aerial', speaker: E?.title || '', text: E?.sub || '', duration: 6 }, 15 * 60 * 1000);
  });

  // Dev sessions skip auto moments (tests drive the player), but the API still works.
  game.bus.on('game:start', () => { cinema.queue.length = 0; });
}
