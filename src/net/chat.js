import { esc } from '../core/util.js';

// Co-op chat overlay (bottom-left). T opens the input, Enter sends, Esc cancels.
// Lines fade after a while; opening the input shows the recent history again.

const STYLE = `
#net-chat { position: absolute; left: 14px; bottom: 44px; width: min(440px, calc(100vw - 28px)); z-index: 3;
  font-family: var(--font-body); pointer-events: none; text-shadow: 1px 1px 0 #000; }
#net-chat .nc-log { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow: hidden; padding: 4px 6px; }
#net-chat.open .nc-log { background: rgba(10,9,8,0.72); border: 1px solid var(--panel-edge); }
#net-chat .nc-line { font-size: 17px; line-height: 1.2; color: var(--bone); word-wrap: break-word; transition: opacity .8s; }
#net-chat .nc-line.faded { opacity: 0; }
#net-chat.open .nc-line.faded { opacity: .85; }
#net-chat .nc-line.hide { display: none; }
#net-chat.open .nc-line.hide { display: block; }
#net-chat .nc-name { font-weight: 800; color: var(--toxic); }
#net-chat .nc-sys { color: var(--bone-dim); font-style: italic; }
#net-chat .nc-emote { color: var(--rust); font-style: italic; }
#net-chat .nc-bad { color: var(--blood-bright); }
#net-chat .nc-money { color: var(--cash); font-weight: 600; }
#net-chat input { display: none; pointer-events: auto; margin-top: 4px; width: 100%; padding: 6px 9px; font-size: 18px;
  background: rgba(10,9,8,0.92); color: var(--bone); border: 1px solid var(--rust); font-family: var(--font-body); outline: none; user-select: text; }
#net-chat.open input { display: block; }
.net-hud { display: inline-block; padding: 3px 9px; background: rgba(10,9,8,0.75); border: 1px solid var(--panel-edge); font-size: 15px; letter-spacing: .5px; }
.net-hud b { color: var(--toxic); }
.net-hud.warn b { color: var(--energy); }
.net-hud.bad b { color: var(--blood-bright); }
.net-hud kbd { font-size: 12px; min-width: 16px; margin: 0 2px 0 6px; padding: 0 3px; }
.net-invite .ni-link { display: flex; gap: 6px; margin: 6px 0 4px; }
.net-invite .ni-link input { flex: 1; font-size: 16px; }
.net-invite .ni-status { margin: 4px 0 8px; font-size: 18px; }
.net-invite .ni-tip { font-size: 15px; color: var(--bone-dim); margin-top: 8px; }
`;

const MAX_LINES = 40;
const VISIBLE_MS = 12000;

export class Chat {
  // onSubmit(text) is called with the trimmed input.
  constructor(game, { onSubmit }) {
    this.game = game;
    this.onSubmit = onSubmit;
    this.isOpen = false;
    if (!document.getElementById('net-style')) {
      const st = document.createElement('style');
      st.id = 'net-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }
    const root = document.createElement('div');
    root.id = 'net-chat';
    root.innerHTML = `<div class="nc-log"></div><input type="text" maxlength="160" autocomplete="off" spellcheck="false" placeholder="Say something… (/wave /dance /flip /help)">`;
    (document.getElementById('ui-root') || document.body).appendChild(root);
    this.root = root;
    this.log = root.querySelector('.nc-log');
    this.input = root.querySelector('input');
    root.style.display = 'none';

    addEventListener('keydown', (e) => {
      if (this.isOpen || e.repeat || e.code !== 'KeyT') return;
      if (!game.started || game.ui.isBlocking() || game.input?.isTyping?.()) return;
      e.preventDefault();
      this.open();
    });
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // keep WASD / Esc / Tab away from the game while typing
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = this.input.value.trim();
        this.close();
        if (text) { try { this.onSubmit?.(text); } catch (err) { console.error('[net] chat submit failed', err); } }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    this.input.addEventListener('blur', () => { if (this.isOpen) this.close(); });
    game.bus.on('game:start', () => { root.style.display = ''; });
  }

  open() {
    this.isOpen = true;
    this.game.input?.releasePointer?.();
    this.root.classList.add('open');
    this.input.value = '';
    this.input.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('open');
    this.input.value = '';
    this.input.blur();
  }

  // html must already be safe (use the helpers below).
  addLine(html, cls = '') {
    const el = document.createElement('div');
    el.className = 'nc-line ' + cls;
    el.innerHTML = html;
    this.log.appendChild(el);
    while (this.log.children.length > MAX_LINES) this.log.firstChild.remove();
    // only the last ~10 are shown while open
    const kids = this.log.children;
    for (let i = 0; i < kids.length - 10; i++) kids[i].classList.add('hide');
    setTimeout(() => el.classList.add('faded'), VISIBLE_MS);
  }

  say(name, text) { this.addLine(`<span class="nc-name">${esc(name)}:</span> ${esc(text)}`); }
  system(text, kind = '') { this.addLine(`<span class="nc-sys ${kind ? 'nc-' + kind : ''}">${esc(text)}</span>`); }
  emote(name, verb) { this.addLine(`<span class="nc-emote">* ${esc(name)} ${esc(verb)}</span>`); }
}
