// "How to play" card: the 30-second version of the game. Shown from the title screen
// (its own modal, the game UI isn't up yet) and from the pause menu (a normal panel).
// Controls switch between keyboard / touch / controller; the tab starts on whatever
// the player is using right now.

export function inputMode(game) {
  if (game?.gamepad?.index != null) return 'pad';
  if (game?.touch?.enabled || document.body.classList.contains('touch-ui')) return 'touch';
  return 'kb';
}

const K = (...keys) => keys.map((k) => `<kbd>${k}</kbd>`).join('');

const CONTROLS = {
  kb: [
    [K('W', 'A', 'S', 'D'), 'walk · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump'],
    ['<b>Mouse</b>', 'look around (click the game to grab it)'],
    [K('E'), 'talk, enter, use. Most of the game lives here'],
    ['<b>LMB</b> / <b>RMB</b>', 'punch / kick · <kbd>C</kbd> block · <kbd>Z</kbd> roll · <kbd>Y</kbd> heal'],
    [K('F'), 'get in a car. Any car. Yours now'],
    [K('J') + K('M') + K('Tab'), 'quests · map · stats'],
    [K('O') + K('P'), 'phone · perks'],
    [K('F1') + K('Esc'), 'all controls · pause'],
  ],
  touch: [
    ['<b>Left thumb</b>', 'walk (push to the edge to run)'],
    ['<b>Right thumb</b>', 'look around · pinch to zoom'],
    ['<b>Use</b>', 'talk, enter, use. Most of the game lives here'],
    ['<b>Attack</b>', 'punch (hold for a haymaker)'],
    ['<b>Car</b>', 'get in a car. Any car. Yours now'],
    ['<b>•••</b>', 'kick, block, roll, heal, phone, map, quests, stats'],
    ['<b>❚❚</b>', 'pause menu'],
  ],
  pad: [
    ['<b>LS</b> / <b>RS</b>', 'walk / look'],
    ['<b>X</b>', 'talk, enter, use. Most of the game lives here'],
    ['<b>RT</b> / <b>B</b>', 'punch / kick · <b>LB</b> block · <b>LT</b> lock on'],
    ['<b>Y</b>', 'get in a car. Any car. Yours now'],
    ['<b>D-pad</b>', 'phone · bag · quests · map'],
    ['<b>Start</b> / <b>Select</b>', 'pause · stats'],
  ],
};
const MODE_LABEL = { kb: 'Keyboard', touch: 'Touch', pad: 'Controller' };

export function howToHtml(mode = 'kb') {
  const tabs = Object.keys(CONTROLS).map((m) => `<button class="ht-tab${m === mode ? ' sel' : ''}" data-ht="${m}">${MODE_LABEL[m]}</button>`).join('');
  const rows = (m) => CONTROLS[m].map(([k, d]) => `<div class="ht-k">${k}</div><div class="ht-d">${d}</div>`).join('');
  return `<div class="howto">
    <p class="ht-lead">You wake up broke, hungover and covered in mystery sauce in <b>Rotwell</b>. Climb out of the gutter. Any way you like.</p>
    <ul class="ht-list">
      <li><b>Work</b> jobs for cash. <b>Train</b> STR / INT / CHA at the gym, library or college to unlock better jobs.</li>
      <li><b>Eat and sleep</b>: everything costs energy. Or skip the honest part: deal, jack cars, rob places. Heat ★ brings cops.</li>
      <li><b>Follow the gold beacon.</b> Crusty Reg under the overpass starts the story: five ways out, five endings.</li>
    </ul>
    <div class="ht-head"><span>Controls</span><span class="ht-tabs">${tabs}</span></div>
    ${Object.keys(CONTROLS).map((m) => `<div class="ht-grid${m === mode ? '' : ' hidden'}" data-ht-grid="${m}">${rows(m)}</div>`).join('')}
    <div class="ht-head"><span>Co-op</span></div>
    <p class="ht-coop"><b>Host co-op game</b> → copy the invite link → friends open it. Up to 4 of you, one city, separate wallets. Same link, same mess.</p>
  </div>`;
}

export function wireHowTo(root) {
  root.querySelectorAll('[data-ht]').forEach((b) => b.addEventListener('click', () => {
    const m = b.dataset.ht;
    root.querySelectorAll('[data-ht]').forEach((x) => x.classList.toggle('sel', x === b));
    root.querySelectorAll('[data-ht-grid]').forEach((g) => g.classList.toggle('hidden', g.dataset.htGrid !== m));
  }));
}

// In-game (pause menu).
export function openHowTo(game) {
  const entry = game.ui.openPanel({ title: 'How to Play', body: howToHtml(inputMode(game)), width: 600, className: 'howto-modal' });
  wireHowTo(entry.body);
  return entry;
}
