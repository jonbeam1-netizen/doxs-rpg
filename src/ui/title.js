import { esc } from '../core/util.js';

// Title screen. Other modules can add buttons before it shows:
//   game.titleButtons.push({ label, onClick(game, name) })
// Starting a game emits 'game:start' { isNew, name }.
export function showTitle(game) {
  const layer = document.getElementById('title-layer');
  const hasSave = game.state.hasSave();
  const params = new URLSearchParams(location.search);
  const joinId = params.get('join');
  let lastName = 'Dox';
  try { lastName = localStorage.getItem('doxsrpg_name') || 'Dox'; } catch { /* ignore */ }

  layer.innerHTML = `
    <div class="title-screen">
      <div class="title-logo">DOX'S RPG</div>
      <div class="title-tag">${joinId ? 'Your buddy is waiting in the gutter. Go say hi.' : 'Rotwell. Where dreams go to get mugged.'}</div>
      <div class="title-box">
        <input class="ui-input" id="title-name" maxlength="16" placeholder="Your name" value="${esc(lastName)}">
        <div id="title-buttons" style="display:flex;flex-direction:column;gap:8px"></div>
      </div>
      <div class="title-foot">WASD move · Mouse look · E use · F drive · Tab stats · Esc menu</div>
    </div>`;
  const nameEl = layer.querySelector('#title-name');
  const btns = layer.querySelector('#title-buttons');
  const getName = () => (nameEl.value.trim() || 'Dox').slice(0, 16);

  const add = (label, fn, primary = false) => {
    const b = document.createElement('button');
    b.className = 'ui-btn' + (primary ? ' primary' : '');
    b.style.width = '100%';
    b.innerHTML = label;
    b.addEventListener('click', () => fn(getName()));
    btns.appendChild(b);
  };

  const begin = (isNew, name) => {
    try { localStorage.setItem('doxsrpg_name', name); } catch { /* ignore */ }
    if (isNew) game.state.newGame(name);
    else if (!game.state.load()) game.state.newGame(name);
    game.state.p.name = name;
    layer.innerHTML = '';
    game.ui.showHud(true);
    game.started = true;
    game.ui.updateHud();
    game.bus.emit('game:start', { isNew, name, joinId });
  };

  if (hasSave) add('Continue', (n) => begin(false, n), true);
  add(joinId ? 'Join game (new character)' : 'New game', async (n) => {
    if (hasSave && !joinId && !confirm('Start over? Your current save will be overwritten.')) return;
    begin(true, n);
  }, !hasSave);
  if (joinId && hasSave) {
    btns.firstChild.innerHTML = 'Join game with your saved character';
  }
  for (const b of game.titleButtons || []) add(b.label, (n) => b.onClick(game, n, begin));

  nameEl.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') btns.firstChild?.click(); });
}
