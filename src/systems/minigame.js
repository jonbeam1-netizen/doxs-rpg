// Minigame framework for the grind loops (job shifts, gym, classes, library, dance floor).
//
//   game.minigames.run(id, opts) -> Promise<result | null>
//     opts: { title, intro (html flavor), stakes (html: what's on the line), diff (0..1), variant, data,
//             playLabel, skipLabel, apply(result) -> html  (pays out; called once, at the end of play or skip),
//             context (anything; forwarded in the event) }
//     null = backed out at the intro screen (nothing was spent). Otherwise `apply` has run.
//   result: { id, score (0..1, null when skipped), grade ('F'..'S' | 'AUTO'), skipped, info, newBest, prevBest }
//
//   Every minigame: intro (how to play, best grade, Start / Skip) -> 15-45s of play -> result screen
//   (grade, flavor, rewards). Escape mid-game ends it with the partial score (unfinished work counts as failed).
//
// Economy: payMult(result) 0.6x (F) .. 1.0x (score .55, a solid C) .. 1.5x (perfect S); skipping = 0.8x.
//          gainMult(result) 0.6x .. 1.0x .. 1.3x for stat gains (still run through train(): soreness/dim rules).
//
// Save: p.mg = { best: {id: grade}, top: {id: score}, plays: {id: n}, sGrades: n }   (plain JSON)
// Event: 'minigame:result' { id, grade, score, skipped, newBest, context }
//
// Testing (the pane is usually hidden, so timers crawl): game.minigames.active = { id, inst, step(sec), key(code), end() }
import { clamp, pick } from '../core/util.js';

export const GRADES = [['S', 0.93], ['A', 0.82], ['B', 0.68], ['C', 0.5], ['D', 0.3], ['F', -1]];
const ORDER = 'FDCBAS';
export const SKIP_MULT = 0.8;
export const gradeOf = (s) => GRADES.find(([, t]) => s >= t)[0];
export const gradeRank = (g) => ORDER.indexOf(g);
export function payMult(r) {
  if (!r || r.skipped) return SKIP_MULT;
  const s = clamp(r.score ?? 0, 0, 1);
  return s < 0.55 ? 0.6 + 0.4 * (s / 0.55) : 1 + 0.5 * ((s - 0.55) / 0.45);
}
export function gainMult(r) {
  if (!r || r.skipped) return SKIP_MULT;
  const s = clamp(r.score ?? 0, 0, 1);
  return s < 0.55 ? 0.6 + 0.4 * (s / 0.55) : 1 + 0.3 * ((s - 0.55) / 0.45);
}
export const pct = (m) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;

const GRADE_COLOR = { S: '#ffd84a', A: '#7fbf4d', B: '#a5c234', C: '#d6b33c', D: '#b0672a', F: '#e2402f', AUTO: '#a9a291' };
const GRADE_LINE = {
  S: ['FLAWLESS. Somebody get this person a plaque. A cheap one.', 'Perfection. Disgusting, beautiful perfection.', 'You are, briefly, the best at something. Savor it.'],
  A: ['Damn near perfect. Your mom would be proud, if she called.', 'Excellent work. Suspiciously excellent.', 'You crushed it. Mostly in the good way.'],
  B: ['Solid. Better than the last guy. The last guy is in a ditch.', 'Good job. Not great. Good.', 'Above average, which in Rotwell is basically genius.'],
  C: ['Perfectly mediocre. You are the human equivalent of beige.', 'Fine. Just... fine.', 'Nobody died. Probably.'],
  D: ['Yikes. That was a cry for help.', 'You technically showed up.', 'Somewhere, a supervisor sighs into a coffee cup.'],
  F: ['A catastrophe. They\'ll be telling this story at your funeral.', 'That was so bad it looped around to being art. It is not art.', 'Total disaster. Even the rats are embarrassed for you.'],
};

const KEY_ALIAS = {
  KeyA: 'ArrowLeft', KeyD: 'ArrowRight', KeyW: 'ArrowUp', KeyS: 'ArrowDown',
  Numpad1: 'Digit1', Numpad2: 'Digit2', Numpad3: 'Digit3', Numpad4: 'Digit4', Numpad5: 'Digit5', Numpad6: 'Digit6',
  Numpad7: 'Digit7', Numpad8: 'Digit8', Numpad9: 'Digit9', NumpadEnter: 'Enter',
};

let stylesDone = false;
function injectMgStyles() {
  if (stylesDone) return;
  stylesDone = true;
  const el = document.createElement('style');
  el.id = 'mg-styles';
  el.textContent = `
  .mg { user-select: none; -webkit-user-select: none; touch-action: manipulation; }
  .mg .hidden { display: none !important; }
  .mg-how { background:#15120f; border:1px solid #2e2821; padding: 8px 12px; margin: 8px 0; font-size: 16px; line-height: 1.35; }
  .mg-how b { color: var(--energy); }
  .mg-how kbd, .mg kbd { display:inline-block; min-width: 18px; padding: 0 5px; border:1px solid #5a4e3e; border-bottom-width: 3px; border-radius: 3px; background:#221d17; font-family: var(--font-body); font-size: 14px; text-align:center; color: var(--bone); }
  .mg-stakes { color: var(--bone-dim); font-size: 15px; margin: 4px 0 2px; }
  .mg-best { font-size: 15px; color: var(--bone-dim); }
  .mg-best b { font-family: var(--font-title); font-size: 18px; }
  .mg-row { display:flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 10px; }
  .mg-row .ui-btn { font-size: 19px; padding: 9px 18px; min-height: 46px; }
  .mg-top { display:flex; align-items:center; gap: 10px; margin-bottom: 6px; }
  .mg-time { flex: 1; height: 10px; background:#1d1915; border:1px solid #000; position: relative; overflow: hidden; }
  .mg-time i { position:absolute; left:0; top:0; bottom:0; background: var(--energy); transition: width .1s linear; }
  .mg-time.low i { background: var(--blood-bright); }
  .mg-score { font-family: var(--font-title); font-size: 18px; min-width: 120px; text-align: right; white-space: nowrap; }
  .mg-stage { position: relative; min-height: 210px; background: radial-gradient(ellipse at center, #1e1a15, #0f0d0b); border: 2px solid #2e2821; border-radius: 4px; overflow: hidden; padding: 8px; }
  .mg-msg { min-height: 26px; text-align:center; font-size: 18px; margin: 6px 0 2px; transition: opacity .2s; }
  .mg-msg.good { color: var(--cash); } .mg-msg.bad { color: var(--blood-bright); } .mg-msg.gold { color: #ffd84a; }
  .mg-pad { display:flex; gap: 8px; justify-content:center; flex-wrap: wrap; margin-top: 8px; }
  .mg-pad button { flex: 1 1 90px; max-width: 170px; min-height: 64px; font-size: 22px; font-family: var(--font-title); background:#221d17; color: var(--bone);
    border: 2px solid #4a4034; border-bottom-width: 5px; border-radius: 6px; cursor: pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; line-height: 1.05; padding: 4px 6px; touch-action: manipulation; }
  .mg-pad button small { font-family: var(--font-body); font-size: 13px; color: var(--bone-dim); margin-top: 2px; }
  .mg-pad button:active, .mg-pad button.hit { transform: translateY(3px); border-bottom-width: 2px; background:#33291f; }
  .mg-pad button.wide { max-width: 360px; flex-basis: 220px; }
  .mg-pad button.red { border-color: #6d1510; } .mg-pad button.green { border-color: #3c5a26; } .mg-pad button.gold { border-color: #8a7122; }
  .mg-result { text-align:center; }
  .mg-grade { font-family: var(--font-title); font-size: 96px; line-height: 1; margin: 6px 0 0; text-shadow: 3px 4px 0 #000; animation: mgPop .35s ease-out; }
  .mg-grade.auto { font-size: 48px; }
  .mg-newbest { color: #ffd84a; font-family: var(--font-title); font-size: 18px; letter-spacing: 1px; }
  .mg-flavor { font-size: 17px; color: var(--bone-dim); margin: 2px 0 8px; font-style: italic; }
  .mg-rewards { text-align:left; background:#15120f; border:1px solid #2e2821; padding: 8px 12px; font-size: 16.5px; line-height: 1.35; }
  @keyframes mgPop { from { transform: scale(2.2) rotate(-8deg); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes mgShake { 0%,100% { transform:none } 25% { transform: translateX(-5px) } 75% { transform: translateX(5px) } }
  .mg-shake { animation: mgShake .18s linear; }
  @keyframes mgFloat { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-36px); opacity: 0; } }
  .mg-float { position:absolute; pointer-events:none; font-family: var(--font-title); font-size: 20px; animation: mgFloat .8s ease-out forwards; text-shadow: 1px 1px 0 #000; z-index: 5; }
  /* shared bits used by several games */
  .mg-track { position:relative; height: 34px; background:#14110e; border:2px solid #3b342b; margin: 10px 0; overflow:hidden; border-radius: 3px; }
  .mg-track .z { position:absolute; top:0; bottom:0; }
  .mg-track .z.ok { background: rgba(127,191,77,.35); } .mg-track .z.top { background: rgba(255,216,74,.75); } .mg-track .z.bad { background: rgba(226,64,47,.6); }
  .mg-track .z.mark { background: rgba(255,216,74,.8); width: 3%; } .mg-track .z.mark.done { background: rgba(127,191,77,.8); }
  .mg-track .ndl { position:absolute; top:-2px; bottom:-2px; width: 5px; margin-left: -2px; background: var(--bone); box-shadow: 0 0 8px #fff; }
  .mg-card { background:#e9e2d0; color:#141210; border-radius: 4px; padding: 8px 10px; box-shadow: 2px 3px 0 rgba(0,0,0,.5); }
  .mg-big { font-family: var(--font-title); font-size: 30px; text-align:center; }
  .mg-chip { display:inline-block; padding: 2px 8px; margin: 2px; border-radius: 3px; background:#2a231b; border: 1px solid #4a4034; font-size: 15px; }
  .mg-chip.on { background: #3c5a26; border-color: #7fbf4d; }
  .mg-chip.no { background: #4a0e0a; border-color: #e2402f; text-decoration: line-through; }
  /* canvas scenes (mg/art.js) */
  .mg-stage.mg-cv { padding: 0; min-height: 0; background: #0f0d0b; }
  .mg-scene { position: relative; line-height: 0; }
  .mg-canvas { display: block; width: 100%; height: auto; touch-action: manipulation; }
  .mg-ui { position: absolute; inset: 0; pointer-events: none; line-height: 1.25; }
  .mg-ui .on { pointer-events: auto; }
  .mg-ic { display: inline-block; vertical-align: middle; image-rendering: auto; pointer-events: none; }
  .mg-pad button .mg-ic { width: 34px !important; height: 34px !important; margin-bottom: 1px; }
  .mg-pad button.ic { flex: 1 1 54px; max-width: 120px; min-height: 60px; font-size: 16px; padding: 4px 3px; }
  .mg-pad button.ic small { font-size: 12px; }
  /* intro: icon rows instead of a wall of text */
  .mg-howgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px; margin: 8px 0 4px; }
  .mg-hw { display: flex; align-items: center; gap: 8px; background: #1b1713; border: 1px solid #3b342b; border-radius: 6px; padding: 5px 8px; font-size: 16px; line-height: 1.2; }
  .mg-hw .mg-ic { flex: 0 0 auto; }
  .mg-hw b { color: var(--energy); }
  .mg-hw .ks { white-space: nowrap; }
  .mg-howfoot { font-size: 15px; color: var(--bone-dim); margin-top: 4px; }
  .mg-howfoot b { color: var(--bone); }
  .mg-how.grid { background: none; border: 0; padding: 0; margin: 4px 0; }
  @media (max-width: 520px) { .mg-howgrid { grid-template-columns: 1fr; } .mg-pad button { min-height: 52px; } .mg-pad button.ic { flex-basis: 54px; } }
  /* HTML-in-scene helpers */
  .mg-ans { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
  .mg-ans button { min-height: 56px; font-size: 17px; text-align: left; display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #efe8d6; color: #141210; border: 2px solid #4a4034;
    border-bottom-width: 5px; border-radius: 6px; cursor: pointer; font-family: var(--font-body); line-height: 1.15; touch-action: manipulation; }
  .mg-ans button i { font-style: normal; flex: 0 0 30px; height: 30px; border-radius: 50%; background: #2a231b; color: #ffd84a; display: grid; place-items: center; font-family: var(--font-title); font-size: 17px; }
  .mg-ans button.right { background: #b9dc96; border-color: #3c5a26; } .mg-ans button.wrong { background: #e8a090; border-color: #6d1510; }
  @media (max-width: 520px) { .mg-ans { grid-template-columns: 1fr; } }
  /* quiz classroom */
  .qz-room { display: flex; gap: 6px; align-items: stretch; background: linear-gradient(#3a3026, #241a12); padding: 8px 8px 10px; border-radius: 4px; }
  .qz-prof { flex: 0 0 104px; align-self: flex-end; }
  .qz-board { flex: 1; position: relative; background: radial-gradient(ellipse at 30% 20%, #3f6a4a, #24402e 75%); border: 8px solid #7a5228; border-radius: 4px;
    box-shadow: inset 0 0 30px rgba(0,0,0,.55), 0 3px 0 #000; padding: 6px 12px 12px; color: #eef0e8; font-family: var(--font-title); min-height: 150px; line-height: 1.3; }
  .qz-head { display: flex; justify-content: space-between; font-size: 13px; opacity: .75; letter-spacing: 1px; }
  .qz-q { font-size: 21px; margin-top: 6px; text-shadow: 0 0 2px rgba(255,255,255,.45); }
  .qz-stamp { position: absolute; right: 8px; bottom: 4px; display: flex; align-items: center; gap: 4px; font-size: 22px; }
  .qz-stamp:not(:empty) { animation: mgPop .3s ease-out; }
  @media (max-width: 520px) { .qz-prof { flex-basis: 64px; } .qz-q { font-size: 17px; } }
  /* lineup witness card */
  .mg-wit { background: #efe8d6; color: #141210; border-radius: 4px 4px 0 0; padding: 6px 10px 6px 30px; position: relative; line-height: 1.25; font-size: 16.5px;
    background-image: repeating-linear-gradient(#efe8d6 0 21px, #c8d4e0 21px 22px); border-left: 0; }
  .mg-wit::before { content: ''; position: absolute; left: 20px; top: 0; bottom: 0; width: 2px; background: #d27a7a; }
  .mg-wit small { display: block; font-size: 13px; color: #6a5a4a; }
  .mg-wit-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .mg-wit-chips span { display: inline-flex; align-items: center; gap: 4px; background: #fff; border: 2px solid #141210; border-radius: 16px; padding: 1px 9px 1px 3px; font-weight: 700; font-size: 15px; }
  .mg-wit-chips i { font-style: normal; }
  /* email: Grimco Mail 97 */
  .em-mon { background: linear-gradient(#cfc6ae, #a9a08a); padding: 10px 10px 14px; border-radius: 10px; border: 2px solid #000; box-shadow: inset 0 2px 0 #e8e0c8; position: relative; }
  .em-scr { background: #0f7a7a; border: 3px solid #222; border-radius: 4px; position: relative; overflow: hidden; font-family: Tahoma, Verdana, sans-serif; color: #111; line-height: 1.2; }
  .em-title { display: flex; justify-content: space-between; align-items: center; background: linear-gradient(90deg, #0a246a, #3a6ea5); color: #fff; font-size: 13px; font-weight: 700; padding: 3px 6px; }
  .em-wb i { display: inline-block; width: 16px; height: 14px; margin-left: 2px; background: #c0c0c0; color: #000; font-style: normal; font-size: 10px; line-height: 13px; text-align: center; border: 1px solid #fff; border-right-color: #404040; border-bottom-color: #404040; }
  .em-body { display: flex; background: #d4d0c8; min-height: 268px; }
  .em-side { width: 118px; flex: 0 0 auto; background: #ece9d8; border-right: 2px solid #9a968a; padding: 4px; display: flex; flex-direction: column; gap: 2px; }
  .em-f { display: flex; align-items: center; gap: 4px; font-size: 13px; padding: 3px 4px; border-radius: 2px; cursor: pointer; }
  .em-f span { flex: 1; } .em-f b { font-size: 12px; background: #fff; border: 1px solid #888; border-radius: 8px; padding: 0 5px; min-width: 14px; text-align: center; }
  .em-f.on { background: #316ac5; color: #fff; } .em-f.on b { color: #000; }
  .em-f.bump b { animation: mgPop .3s ease-out; background: #ffd84a; }
  .em-mug { margin-top: auto; text-align: center; font-size: 30px; line-height: 1; } .em-mug small { display: block; font-size: 8px; color: #6a5a4a; }
  .em-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .em-list { background: #fff; border-bottom: 2px solid #9a968a; }
  .em-row { display: flex; align-items: center; gap: 6px; padding: 2px 6px; font-size: 13px; border-bottom: 1px solid #e4e0d4; white-space: nowrap; overflow: hidden; color: #555; }
  .em-row.sel { background: #316ac5; color: #fff; font-weight: 700; }
  .em-from { width: 128px; flex: 0 0 auto; overflow: hidden; text-overflow: ellipsis; }
  .em-subj { flex: 1; overflow: hidden; text-overflow: ellipsis; } .em-tm { font-size: 11px; opacity: .7; }
  .em-imp { display: inline-block; font-style: normal; color: #fff; background: #c0201a; border-radius: 3px; padding: 0 4px; margin-right: 3px; font-weight: 900; }
  .em-more { font-size: 11px; color: #888; padding: 1px 6px; }
  .em-prev { flex: 1; padding: 8px 10px; background: #fffef8; position: relative; }
  .em-prev.em-in { animation: emIn .22s ease-out; }
  @keyframes emIn { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
  .em-ph { display: flex; gap: 10px; align-items: center; }
  .em-pf { font-weight: 700; font-size: 17px; } .em-pa { font-size: 13px; color: #555; font-family: 'Courier New', monospace; }
  .em-ps { font-size: 19px; font-weight: 700; margin: 6px 0 2px; font-family: var(--font-body); line-height: 1.15; }
  .em-pb { font-size: 13px; color: #444; font-style: italic; }
  .em-pat { display: flex; align-items: center; gap: 6px; margin-top: 6px; } .em-pat .mg-time { background: #ccc; }
  .em-fx { position: absolute; inset: 0; pointer-events: none; }
  .em-ghost { position: absolute; left: 118px; right: 0; bottom: 0; height: 130px; transition: none; animation-duration: .45s; animation-fill-mode: forwards; animation-timing-function: ease-in; box-shadow: 0 4px 12px rgba(0,0,0,.5); }
  .em-ghost.go-r { animation-name: emGoR; } .em-ghost.go-hr { animation-name: emGoHR; } .em-ghost.go-d { animation-name: emGoD; } .em-ghost.go-x { animation-name: emGoD; }
  @keyframes emGoR { to { transform: translate(120%, -40%) rotate(12deg) scale(.4); opacity: 0; } }
  @keyframes emGoHR { to { transform: translate(-80%, -100%) scale(.15); opacity: 0; } }
  @keyframes emGoD { 50% { transform: scale(.6) rotate(-8deg); } to { transform: translate(-60%, -40%) scale(.05) rotate(-40deg); opacity: 0; } }
  .em-stamp { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 6px; font-family: var(--font-title); font-size: 30px;
    padding: 4px 14px 4px 6px; border: 4px solid currentColor; border-radius: 8px; background: rgba(255,255,255,.88); animation: emStamp .7s ease-out forwards; }
  .em-stamp.ok { color: #2e7a1e; } .em-stamp.bad { color: #c0201a; }
  @keyframes emStamp { 0% { transform: translate(-50%, -50%) scale(2.2) rotate(-10deg); opacity: 0; } 20% { transform: translate(-50%, -50%) scale(1) rotate(-6deg); opacity: 1; } 75% { opacity: 1; } 100% { transform: translate(-50%, -60%) scale(1) rotate(-6deg); opacity: 0; } }
  @media (max-width: 520px) { .em-side { width: 70px; } .em-f span { display: none; } .em-from { width: 70px; } .em-mug { display: none; } .em-ghost { left: 70px; } }
  `;
  document.head.appendChild(el);
}

export function installMinigames(game) {
  injectMgStyles();
  const GAMES = {};
  const mg = {
    GAMES,
    active: null,
    register(id, def) { GAMES[id] = def; },
    has: (id) => !!GAMES[id],
    store() {
      const p = game.state.p;
      p.mg ??= {};
      p.mg.best ??= {}; p.mg.top ??= {}; p.mg.plays ??= {}; p.mg.sGrades ??= 0;
      return p.mg;
    },
    best(id) { return this.store().best[id] || null; },
    run: (id, opts = {}) => run(id, opts),
    // Grade something that isn't a panel minigame (e.g. a Pizza Butt run): persist + emit. Returns { grade, newBest }.
    record(id, score, context) {
      const store = this.store();
      const prev = store.best[id] || null;
      const grade = gradeOf(clamp(score, 0, 1));
      const newBest = !prev || gradeRank(grade) > gradeRank(prev);
      if (newBest) store.best[id] = grade;
      store.plays[id] = (store.plays[id] || 0) + 1;
      if (score > (store.top[id] ?? -1)) store.top[id] = Math.round(score * 1000) / 1000;
      if (grade === 'S') store.sGrades++;
      game.state.changed('mg');
      try { game.bus.emit('minigame:result', { id, grade, score, skipped: false, newBest: newBest && !!prev, context }); } catch (e) { console.error(e); }
      return { grade, newBest: newBest && !!prev };
    },
    gradeOf, payMult, gainMult,
  };
  game.minigames = mg;

  function sfx(name) { try { game.sysSfx?.play?.(name); } catch { /* audio is optional */ } }

  function run(id, opts) {
    const def = GAMES[id];
    if (!def) return Promise.resolve(null);
    return new Promise((resolve) => {
      const store = mg.store();
      const prevBest = store.best[id] || null;
      const wrap = document.createElement('div');
      wrap.className = 'mg';
      const how = typeof def.how === 'function' ? def.how(opts) : def.how;
      wrap.innerHTML = `
        <div class="mg-intro">
          ${opts.intro ? `<div class="sys-intro">${opts.intro}</div>` : ''}
          <div class="mg-how ${String(how || '').includes('mg-howgrid') ? 'grid' : ''}">${how || ''}</div>
          ${opts.stakes ? `<div class="mg-stakes">${opts.stakes}</div>` : ''}
          <div class="mg-best">Best grade: ${prevBest ? `<b style="color:${GRADE_COLOR[prevBest]}">${prevBest}</b>` : '<i>never played</i>'} · Grade multiplies the payout: <b>F 0.6×</b> … <b>C 1×</b> … <b>S 1.5×</b>${def.statGame ? ' (stats: up to 1.3×)' : ''}</div>
          <div class="mg-row"><button class="ui-btn primary" data-start>${opts.playLabel || 'Start'} <kbd>Enter</kbd></button><button class="ui-btn" data-skip>${opts.skipLabel || 'Skip (auto, 80%)'} <kbd>X</kbd></button></div>
        </div>
        <div class="mg-play hidden">
          <div class="mg-top"><div class="mg-time"><i style="width:100%"></i></div><div class="mg-score"></div></div>
          <div class="mg-stage"></div>
          <div class="mg-msg"></div>
          <div class="mg-pad"></div>
        </div>
        <div class="mg-result hidden"></div>`;
      const $ = (s) => wrap.querySelector(s);
      let phase = 'intro';
      let inst = null;
      let loop = null;
      let result = null;
      let finished = false;
      const entry = game.ui.openPanel({
        title: opts.title || def.name, body: wrap, width: def.width || 620,
        onClose: () => {
          removeEventListener('keydown', onKey, true);
          if (loop) clearInterval(loop);
          loop = null;
          if (mg.active?.wrap === wrap) mg.active = null;
          if (phase === 'play' && !finished) {
            let s = 0;
            try { s = inst?.partial?.() ?? 0; } catch (e) { console.error(e); }
            finish(clamp(s, 0, 1), { aborted: true }, true);
            game.ui.toast(`You bailed early. Grade: <b>${result.grade}</b>.`, 'bad', 3000);
          }
          try { inst?.destroy?.(); } catch (e) { /* ignore */ }
          resolve(phase === 'intro' ? null : result);
        },
      });

      // ---------------------------------------------------------------- play api
      const msgEl = $('.mg-msg');
      let msgT = 0;
      const api = {
        game, opts, diff: clamp(opts.diff ?? 0, 0, 1), variant: opts.variant, data: opts.data, p: game.state.p,
        stage: $('.mg-stage'),
        sfx,
        time(frac) { const t = $('.mg-time'); t.firstElementChild.style.width = `${clamp(frac, 0, 1) * 100}%`; t.classList.toggle('low', frac < 0.2); },
        score(html) { $('.mg-score').innerHTML = html; },
        msg(html, kind = '', ms = 1100) { msgEl.className = 'mg-msg ' + kind; msgEl.innerHTML = html; msgT = ms / 1000; },
        float(text, x, y, color = '#fff') {
          const f = document.createElement('div');
          f.className = 'mg-float'; f.textContent = text; f.style.left = `${x}px`; f.style.top = `${y}px`; f.style.color = color;
          api.stage.appendChild(f); setTimeout(() => f.remove(), 800);
        },
        shake() { const s = api.stage; s.classList.remove('mg-shake'); void s.offsetWidth; s.classList.add('mg-shake'); },
        // buttons: [{ k: 'ArrowLeft', label: 'GRAB', sub: '← / A', cls: 'green' }]
        pad(buttons) {
          const padEl = $('.mg-pad');
          padEl.innerHTML = buttons.map((b) => `<button type="button" tabindex="-1" data-k="${b.k}" class="${b.cls || ''}">${b.label}${b.sub ? `<small>${b.sub}</small>` : ''}</button>`).join('');
        },
        flashKey(k) { const b = wrap.querySelector(`.mg-pad [data-k="${k}"]`); if (b) { b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 90); } },
        done(score, info = {}) { if (!finished) finish(clamp(score, 0, 1), info); },
        press: (code) => press(code),   // canvas hit regions route taps through here
      };

      function press(code) {
        if (phase !== 'play' || !inst || finished) return false;
        let handled = false;
        try { handled = inst.key?.(code) !== false; } catch (e) { console.error('[minigame] key failed', e); }
        api.flashKey(code);
        return handled;
      }

      function onKey(e) {
        if (entry.closed || game.ui.top() !== entry) return;
        if (e.repeat) { if (phase === 'play') e.preventDefault(); return; }
        const code = KEY_ALIAS[e.code] || e.code;
        if (phase === 'intro') {
          if (code === 'Enter' || code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); start(); }
          else if (e.code === 'KeyX') { e.preventDefault(); e.stopImmediatePropagation(); skip(); }
          return;
        }
        if (phase === 'result') {
          if (code === 'Enter' || code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); entry.close(); }
          return;
        }
        if (code === 'Escape' || code === 'Tab' || code === 'F1') return;
        if (press(code)) { e.preventDefault(); e.stopImmediatePropagation(); }
      }
      addEventListener('keydown', onKey, true);

      $('.mg-pad').addEventListener('pointerdown', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        e.preventDefault();
        press(b.dataset.k);
      });
      // keyboard/gamepad-synthesized clicks (detail 0); real pointer clicks were handled on pointerdown
      $('.mg-pad').addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (b && e.detail === 0) press(b.dataset.k);
      });
      // stage elements may be clickable too (data-k on any element inside the stage)
      api.stage.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        e.preventDefault();
        press(b.dataset.k);
      });
      $('[data-start]').addEventListener('click', () => start());
      $('[data-skip]').addEventListener('click', () => skip());

      function tick(dt) {
        if (finished || !inst) return;
        if (msgT > 0) { msgT -= dt; if (msgT <= 0) msgEl.innerHTML = ''; }
        try { inst.tick?.(dt); } catch (e) { console.error('[minigame] tick failed', e); api.done(inst?.partial?.() ?? 0); }
      }

      function start() {
        if (phase !== 'intro') return;
        phase = 'play';
        $('.mg-intro').classList.add('hidden');
        $('.mg-play').classList.remove('hidden');
        sfx('mgStart');
        try { inst = def.create(api); } catch (e) { console.error('[minigame] create failed', e); finish(0.55, { broken: true }); return; }
        let last = performance.now();
        loop = setInterval(() => {
          const now = performance.now();
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          tick(dt);
        }, 16);
        mg.active = {
          id, wrap, inst, api,
          step(sec = 1) { let t = sec; while (t > 0 && !finished) { const d = Math.min(1 / 60, t); tick(d); t -= d; } },
          key: (code) => press(code),
          manual() { if (loop) { clearInterval(loop); loop = null; } },   // tests: stop the real clock, drive with step()
          end: () => entry.close(),
          get phase() { return phase; },
          get result() { return result; },
        };
      }

      function skip() {
        if (phase !== 'intro') return;
        phase = 'play';
        finish(null, { skipped: true });
      }

      function finish(score, info = {}, silent = false) {
        if (finished) return;
        finished = true;
        if (loop) { clearInterval(loop); loop = null; }
        const skipped = score == null;
        const grade = skipped ? 'AUTO' : gradeOf(score);
        let newBest = false;
        if (!skipped) {
          store.plays[id] = (store.plays[id] || 0) + 1;
          if (!prevBest || gradeRank(grade) > gradeRank(prevBest)) { store.best[id] = grade; newBest = !!prevBest || grade !== 'F'; }
          if (score > (store.top[id] ?? -1)) store.top[id] = Math.round(score * 1000) / 1000;
          if (grade === 'S') store.sGrades++;
          game.state.changed('mg');
        }
        result = { id, score: skipped ? null : score, grade, skipped, info, newBest, prevBest };
        let rewards = '';
        try { rewards = opts.apply?.(result) || ''; } catch (e) { console.error('[minigame] apply failed', e); }
        try { game.bus.emit('minigame:result', { id, grade, score: result.score, skipped, newBest, context: opts.context }); } catch (e) { console.error(e); }
        if (!skipped) sfx(gradeRank(grade) >= 4 ? 'mgGreat' : gradeRank(grade) >= 2 ? 'mgOk' : 'mgBad');
        if (silent) { phase = 'result'; return; }
        showResult(rewards, info);
      }

      function showResult(rewards, info) {
        phase = 'result';
        $('.mg-intro').classList.add('hidden');
        $('.mg-play').classList.add('hidden');
        const r = result;
        const flavor = r.skipped ? (opts.skipLine || 'You coast through on autopilot. Nobody notices. Nobody ever notices.')
          : (def.lines?.[r.grade] ? pick(def.lines[r.grade]) : pick(GRADE_LINE[r.grade]));
        const el = $('.mg-result');
        el.innerHTML = `
          <div class="mg-grade ${r.skipped ? 'auto' : ''}" style="color:${GRADE_COLOR[r.grade]}">${r.skipped ? 'AUTOPILOT' : r.grade}</div>
          ${r.skipped ? '<div class="sys-hint">Skipped: 80% of a normal payout.</div>' : `<div class="sys-hint">Score ${Math.round(r.score * 100)}%${info.stats ? ' · ' + info.stats : ''}</div>`}
          ${r.newBest ? '<div class="mg-newbest">NEW PERSONAL BEST!</div>' : ''}
          <div class="mg-flavor">${flavor}</div>
          ${rewards ? `<div class="mg-rewards">${rewards}</div>` : ''}
          <div class="mg-row"><button class="ui-btn primary" data-ok>Continue <kbd>Enter</kbd></button></div>`;
        el.classList.remove('hidden');
        el.querySelector('[data-ok]').addEventListener('click', () => entry.close());
        if (r.newBest && gradeRank(r.grade) >= 4) setTimeout(() => sfx('mgBest'), 450);
      }
    });
  }

  return mg;
}

// Small shared helpers for minigame implementations.
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
export const digitIndex = (code) => DIGITS.indexOf(code);
