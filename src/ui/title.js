import { esc, pick } from '../core/util.js';
import { openCreator, applyBackground } from './creator.js';

// Title screen. Other modules can add buttons before it shows:
//   game.titleButtons.push({ label, onClick(game, name, begin) })
// begin(isNew, name) starts the game. A brand-new character (or "continue" with no
// save) goes through the character creator first.
// Starting a game emits 'game:start' { isNew, name, joinId }.
// The city flies by behind the menu (CameraRig orbits while !game.started).
const TAGLINES = [
  'Rotwell. Where dreams go to get mugged.',
  'Population: declining. Smell: increasing.',
  'Now with 40% more sewage per capita.',
  'The city that never sleeps. Because of the sirens.',
  'Voted "Most Likely to Give You Tetanus" nine years running.',
  'Come for the crime. Stay because your car got stolen.',
];

export function showTitle(game) {
  const layer = document.getElementById('title-layer');
  const params = new URLSearchParams(location.search);
  const joinId = params.get('join');
  let lastName = 'Dox';
  try { lastName = localStorage.getItem('doxsrpg_name') || 'Dox'; } catch { /* ignore */ }
  game.bus.emit('title:show');

  // In-page yes/no dialog (the game's own UI layer sits underneath the title).
  function ask(text, { yes = 'Yeah', no = 'Nah', title = 'You sure?' } = {}) {
    return new Promise((resolve) => {
      const m = document.createElement('div');
      m.className = 'title-modal';
      m.innerHTML = `<div class="ui-panel" style="max-width:420px">
        <div class="ui-title">${title}</div>
        <div class="ui-text">${esc(text)}</div>
        <div class="ui-row" style="justify-content:flex-end">
          <button class="ui-btn" data-v="0">${no}</button><button class="ui-btn primary" data-v="1">${yes}</button>
        </div></div>`;
      const done = (v) => { m.remove(); removeEventListener('keydown', onKey, true); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } else if (e.key === 'Enter') { e.stopPropagation(); done(true); } };
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1'); else if (e.target === m) done(false); });
      addEventListener('keydown', onKey, true);
      layer.appendChild(m);
      m.querySelector('.primary').focus();
    });
  }

  function render() {
    const hasSave = game.state.hasSave();
    layer.innerHTML = `
      <div class="title-screen">
        <div class="title-head">
          <div class="title-logo">DOX'S RPG</div>
          <div class="title-tag">${joinId ? 'Your buddy is waiting in the gutter. Go say hi.' : pick(TAGLINES)}</div>
        </div>
        <div class="title-box">
          <label class="title-label" for="title-name">Name</label>
          <input class="ui-input" id="title-name" maxlength="16" placeholder="Your name" value="${esc(lastName)}">
          <div id="title-buttons" class="title-buttons"></div>
        </div>
        <div class="title-foot">${[['WASD', 'move'], ['Mouse', 'look'], ['E', 'use'], ['F', 'drive'], ['O', 'phone'], ['P', 'perks'], ['F1', 'help'], ['Esc', 'menu']].map(([k, d]) => `<span><kbd>${k}</kbd>${d}</span>`).join('')}</div>
      </div>`;
    const nameEl = layer.querySelector('#title-name');
    const btns = layer.querySelector('#title-buttons');
    const getName = () => (nameEl.value.trim() || 'Dox').slice(0, 16);

    const add = (label, fn, primary = false) => {
      const b = document.createElement('button');
      b.className = 'ui-btn' + (primary ? ' primary' : '');
      b.style.width = '100%';
      b.innerHTML = label;
      b.addEventListener('click', () => { game.audio?.ui?.('click'); fn(getName()); });
      btns.appendChild(b);
      return b;
    };

    if (hasSave) add(joinId ? 'Join game with your saved character' : 'Continue', (n) => begin(false, n), true);
    add(joinId ? 'Join game (new character)' : 'New game', async (n) => {
      if (hasSave && !joinId && !(await ask('Start over? Your current save gets flushed like a goldfish.', { yes: 'Flush it', no: 'Keep it' }))) return;
      begin(true, n);
    }, !hasSave);
    for (const b of game.titleButtons || []) add(b.label, (n) => b.onClick(game, n, begin));

    nameEl.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') btns.firstChild?.click(); });
  }

  // Character creator → then start.
  async function begin(isNew, name) {
    if (!isNew && game.state.hasSave()) { start(false, name); return; }
    const screen = layer.querySelector('.title-screen');
    if (screen) screen.style.display = 'none';
    const res = await openCreator(game, layer, { name });
    if (!res) { if (screen) screen.style.display = ''; return; }
    start(true, res.name, res);
  }

  function start(isNew, name, created = null) {
    try { localStorage.setItem('doxsrpg_name', name); } catch { /* ignore */ }
    if (isNew) game.state.newGame(name);
    else if (!game.state.load()) game.state.newGame(name);
    game.state.p.name = name;
    if (created) {
      game.state.p.look = created.look;
      applyBackground(game, created.background);
      game.bus.emit('look:change', created.look);
      game.bus.emit('character:created', { name, look: created.look, background: created.background });
    }
    layer.innerHTML = '';
    game.ui.showHud(true);
    game.started = true;
    game.ui.updateHud();
    game.bus.emit('game:start', { isNew: isNew || !!created, name, joinId });
  }

  render();
}
