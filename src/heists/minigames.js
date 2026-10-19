import { pick, randInt, clamp } from '../core/util.js';

// Lockpick + hacking minigames. They're modal panels driven by update(dt)
// from the heist system (so they tick even when requestAnimationFrame doesn't).
// Each returns { update(dt), close(), done } and calls onDone(success, why).

export function startLockpick(game, { pins = 3, hard = false, skill = 1, title = 'Lockpicking', onDone }) {
  const wrap = document.createElement('div');
  wrap.className = 'heist-mg';
  wrap.innerHTML = `<div class="sys-hint">${hard ? 'No lockpick set. You\'re using a bobby pin and hope.' : 'Tension wrench in, pick up. Feel for the click.'}</div>
    <div class="pins">${'<span></span>'.repeat(pins)}</div>
    <div class="track"><div class="zone"></div><div class="needle"></div></div>
    <div class="status">Press <kbd>Space</kbd> / <kbd>E</kbd> (or click) when the needle is in the green.</div>
    <div class="ui-row" style="justify-content:center;margin-top:6px"><button class="ui-btn primary" data-set>Set pin</button></div>`;
  const st = { p: 0, dir: 1, pin: 0, miss: 0, z0: 0, w: Math.min(0.4, (hard ? 0.1 : 0.16) * Math.sqrt(skill)), done: false, cool: 0 };
  const zoneEl = wrap.querySelector('.zone'), needle = wrap.querySelector('.needle'), status = wrap.querySelector('.status');
  const pinEls = [...wrap.querySelectorAll('.pins span')];
  const newZone = () => { st.z0 = 0.08 + Math.random() * (0.84 - st.w); zoneEl.style.left = `${st.z0 * 100}%`; zoneEl.style.width = `${st.w * 100}%`; };
  newZone();
  let finished = false;
  const finish = (ok, why) => {
    if (finished) return;
    finished = true; st.done = true;
    api.done = true;
    entry.onClose = null;
    entry.close();
    try { onDone?.(ok, why); } catch (e) { console.error('[heists] lockpick done failed', e); }
  };
  const tryPin = () => {
    if (st.done || st.cool > 0) return;
    if (st.p >= st.z0 && st.p <= st.z0 + st.w) {
      pinEls[st.pin]?.classList.add('set');
      st.pin++;
      game.combat?.sfx?.('click', { vol: 0.5 });
      if (st.pin >= pins) { status.className = 'status good'; status.textContent = '*click* You\'re in.'; st.cool = 0.4; setTimeout(() => finish(true), 350); return; }
      status.className = 'status good'; status.textContent = pick(['Click!', 'Got one.', 'Ooh, that\'s the stuff.', 'Pin set. Don\'t breathe.']);
      newZone();
    } else {
      st.miss++;
      status.className = 'status bad';
      status.textContent = st.miss >= 3 ? 'SNAP. Pick\'s broken. So is your confidence.' : pick(['Nope. Scraaaape.', 'Missed. Someone heard that.', 'Your hand slipped. Sweaty much?']);
      st.cool = 0.35;
      if (st.miss >= 3) setTimeout(() => finish(false, 'snap'), 500);
    }
  };
  wrap.querySelector('[data-set]').addEventListener('click', tryPin);
  const entry = game.ui.openPanel({ title, body: wrap, width: 460, onClose: () => { if (!finished) { finished = true; api.done = true; onDone?.(false, 'abort'); } } });
  const api = {
    done: false,
    update(dt) {
      if (st.done) return;
      if (st.cool > 0) st.cool -= dt;
      const sp = ((hard ? 0.95 : 0.7) + st.pin * 0.16) / Math.sqrt(skill);
      st.p += st.dir * sp * dt;
      if (st.p > 1) { st.p = 1; st.dir = -1; } else if (st.p < 0) { st.p = 0; st.dir = 1; }
      needle.style.left = `${st.p * 100}%`;
      const inp = game.input;
      if (inp.wasPressed('Space') || inp.wasPressed('KeyE')) tryPin();
    },
    close() { finish(false, 'abort'); },
  };
  return api;
}

const HEX = '0123456789ABCDEF';
const code = () => HEX[randInt(0, 15)] + HEX[randInt(0, 15)];

export function startHack(game, { rounds = 3, hard = false, skill = 1, title = 'Hacking', onDone }) {
  const wrap = document.createElement('div');
  wrap.className = 'heist-mg';
  wrap.innerHTML = `<div class="sys-hint">${hard ? 'No Hack-O-Matic. You\'re typing on a TV remote taped to a phone.' : 'Hack-O-Matic 3000 engaged. It beeps encouragingly.'}</div>
    <div>Find this handshake: <span class="target"></span></div>
    <div class="grid"></div>
    <div class="tbar"><i></i></div>
    <div class="status">Round <b class="rn">1</b>/${rounds}</div>`;
  const grid = wrap.querySelector('.grid'), tgtEl = wrap.querySelector('.target'), tbar = wrap.querySelector('.tbar i'), status = wrap.querySelector('.status');
  const st = { round: 0, target: '', limit: (hard ? 5 : 7) * skill, t: 0, shuffle: 0, every: (hard ? 0.9 : 1.5) * Math.sqrt(skill), done: false };
  let finished = false;
  const finish = (ok, why) => {
    if (finished) return;
    finished = true; st.done = true; api.done = true;
    entry.onClose = null;
    entry.close();
    try { onDone?.(ok, why); } catch (e) { console.error('[heists] hack done failed', e); }
  };
  const fill = () => {
    const codes = new Set([st.target]);
    while (codes.size < 12) codes.add(code());
    const arr = [...codes].sort(() => Math.random() - 0.5);
    grid.innerHTML = arr.map((c) => `<button data-c="${c}">${c}</button>`).join('');
  };
  const newRound = () => {
    st.target = code(); st.t = 0; st.shuffle = 0;
    tgtEl.textContent = st.target;
    status.className = 'status';
    status.innerHTML = `Round <b>${st.round + 1}</b>/${rounds}`;
    fill();
  };
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-c]');
    if (!b || st.done) return;
    if (b.dataset.c === st.target) {
      st.round++;
      game.combat?.sfx?.('click', { vol: 0.5 });
      if (st.round >= rounds) { status.className = 'status good'; status.textContent = 'ACCESS GRANTED. Hackerman.'; st.done = true; setTimeout(() => finish(true), 400); return; }
      newRound();
    } else {
      st.t += 1.5;
      status.className = 'status bad';
      status.textContent = pick(['ACCESS DENIED. Rude.', 'Wrong. The firewall laughs at you.', 'Nope. Somewhere, an IT guy smirks.']);
    }
  });
  const entry = game.ui.openPanel({ title, body: wrap, width: 480, onClose: () => { if (!finished) { finished = true; api.done = true; onDone?.(false, 'abort'); } } });
  newRound();
  const api = {
    done: false,
    update(dt) {
      if (st.done) return;
      st.t += dt;
      st.shuffle += dt;
      tbar.style.width = `${clamp(1 - st.t / st.limit, 0, 1) * 100}%`;
      if (st.shuffle >= st.every) { st.shuffle = 0; fill(); }
      if (st.t >= st.limit) {
        st.done = true;
        status.className = 'status bad';
        status.textContent = 'TIMED OUT. The system locked you out and called you a nerd.';
        setTimeout(() => finish(false, 'timeout'), 600);
      }
    },
    // debug/test helper: solve the current round
    _solve() { const b = grid.querySelector(`button[data-c="${st.target}"]`); b?.click(); },
    close() { finish(false, 'abort'); },
  };
  return api;
}
