// Desk-job minigames: email (Grimco), lineup (Rotwell PD), idcheck (Club Velvet bouncer).
import { clamp, pick, chance, randInt } from '../../core/util.js';
import { shuffle, DIGITS, digitIndex } from '../minigame.js';
import { scene, cached, blit, rr, ell, fs, line, blob, text, wrapText, glow, grime, rng, TAU, COL, FT, FB, mix, easeOut, easeBack, stick, face, bubble, SHIRT, HAIRC, meter } from './art.js';
import { drawIcon, howHtml, padIc, iconImg, iconURL } from './icons.js';

const L = 'ArrowLeft', R = 'ArrowRight', D = 'ArrowDown';

// ------------------------------------------------------------------------------------------ avatars
const AVC = new Map();
function avatarURL(key, spec, px = 64) {
  const k = `${key}:${px}`;
  if (AVC.has(k)) return AVC.get(k);
  const cv = document.createElement('canvas'); cv.width = cv.height = px * 2;
  const c = cv.getContext('2d'); c.scale((px * 2) / 100, (px * 2) / 100);
  c.save(); ell(c, 50, 50, 48, 48); c.clip();
  c.fillStyle = spec.bg || '#555'; c.fillRect(0, 0, 100, 100);
  if (spec.f) {
    if (spec.tie || spec.suit) { c.beginPath(); c.moveTo(14, 100); c.quadraticCurveTo(18, 74, 50, 72); c.quadraticCurveTo(82, 74, 86, 100); c.closePath(); fs(c, spec.suit || '#222', '#000', 2); if (spec.tie) { c.beginPath(); c.moveTo(46, 74); c.lineTo(54, 74); c.lineTo(57, 100); c.lineTo(43, 100); c.closePath(); fs(c, spec.tie, '#000', 1.5); } }
    else { c.beginPath(); c.moveTo(14, 100); c.quadraticCurveTo(18, 76, 50, 74); c.quadraticCurveTo(82, 76, 86, 100); c.closePath(); fs(c, spec.shirt || '#6a6a6a', '#000', 2); }
    face(c, 50, 46, 24, spec.f);
    if (spec.crown) { c.beginPath(); c.moveTo(32, 22); c.lineTo(36, 6); c.lineTo(43, 16); c.lineTo(50, 2); c.lineTo(57, 16); c.lineTo(64, 6); c.lineTo(68, 22); c.closePath(); fs(c, '#ffd84a', '#000', 2); }
  } else if (spec.ic) {
    drawIcon(c, spec.ic, 50, 52, 70);
  } else if (spec.text) {
    text(c, spec.text, 50, 54, { size: 44, color: '#fff', lw: 4, fam: FT });
  }
  c.restore();
  ell(c, 50, 50, 48, 48); fs(c, null, '#000', 3);
  const url = cv.toDataURL();
  AVC.set(k, url);
  return url;
}
const BOSS = { bg: '#2a3a5a', suit: '#1c1c22', tie: '#b3261e', f: { hair: 'gray', hairStyle: 'bald', expr: 'angry', stache: true, glasses: true } };
const SENDERS = {
  'Mr. Grimsby': [BOSS, 'grimsby@grimco.biz'],
  'Client: Hamhock Meats': [{ bg: '#8a3a3a', ic: 'rump' }, 'orders@hamhockmeats.com'],
  'Client: Rotwell PD': [{ bg: '#1a2a4a', shirt: '#1a2a4a', f: { hat: 'cap', hatColor: '#1a2a4a', stache: true } }, 'procurement@rotwellpd.gov'],
  Accounting: [{ bg: '#3a5a3a', shirt: '#ddd', f: { hair: 'brown', hairStyle: 'bun', glasses: true } }, 'accounting@grimco.biz'],
  Legal: [{ bg: '#4a4a4a', suit: '#333', tie: '#2e5fa8', f: { hair: 'black', glasses: true, expr: 'sad' } }, 'legal@grimco.biz'],
  'totallyrealprince@rotmail': [{ bg: '#c8a020', shirt: '#7a3fa0', crown: true, f: { shades: true, expr: 'happy', hair: 'black' } }, 'totallyrealprince@rotmail.ng'],
  Gary: [{ bg: '#d4782a', shirt: '#e8e070', f: { hair: 'red', stache: true, expr: 'happy' } }, 'gary.gary@grimco.biz'],
  HotSinglesNearRendering: [{ bg: '#d0306a', ic: 'heart' }, 'hot@singles-near-u.biz'],
  'Rewards Center': [{ bg: '#6a2a8a', text: '$' }, 'winner@rewardz-center.win'],
  'Crypto Chad': [{ bg: '#2a8a6a', shirt: '#111', f: { shades: true, hat: 'cap', hatColor: '#111', expr: 'smug' } }, 'chad@grimcoin.moon'],
  Facilities: [{ bg: '#5a5a2a', shirt: '#4a5a6a', f: { hat: 'hardhat', beard: true, hair: 'brown' } }, 'facilities@grimco.biz'],
  Brenda: [{ bg: '#7a3a6a', shirt: '#c0392b', f: { hair: 'blond', hairStyle: 'long', expr: 'angry' } }, 'brenda.k@grimco.biz'],
  Anonymous: [{ bg: '#222', text: '?' }, 'anonymous@grimco.biz'],
  'Intern Kyle': [{ bg: '#3a6a9a', shirt: '#3c8a3a', f: { hair: 'brown', expr: 'shock', hat: 'beanie' } }, 'intern.kyle@grimco.biz'],
  'Mr. Grimbsy': [{ ...BOSS, f: { ...BOSS.f, look: 1 } }, 'grimbsy@grimc0.biz'],
  'Mr Grimsby (real)': [{ ...BOSS, f: { ...BOSS.f, look: -1 } }, 'grimsby.real@rotmail.ru'],
  'IT Departmint': [{ bg: '#1a6a8a', text: 'IT' }, 'it-departmint@grimco-support.xyz'],
  'Mr. Grimsbee': [{ ...BOSS, f: { ...BOSS.f, expr: 'smug' } }, 'ceo-grimsbee@freemail.ro'],
};
const BODY = {
  reply: ['Per my last email, per my last email.', 'Need this yesterday. Thanks in advance (mandatory).', 'Looping you in. You are now in the loop. There is no exit.', 'Please action this at your earliest inconvenience.'],
  spam: ['CLICK HERE!!! LIMITED TIME!!! (forever)', 'Forward to 10 people or a raccoon will find you.', 'You have been selected. For what? CLICK.', 'lol lol lol lol. lol.'],
  hr: ['This has been going on for weeks. Please advise. Please.', 'I have photos. I wish I didn\'t.', 'I am writing this from inside the supply closet.', 'Someone please do something. Anything. Fire Gary.'],
  phish: ['Do this quickly and quietly. Thanks, Boss (real)', 'Don\'t verify this with anyone. Trust me. I am boss.', 'Reply with your pasword and your mother\'s pasword.'],
};

export function registerOffice(mg) {
  // ========================================================================================== EMAIL
  const MAIL = {
    reply: [
      ['Mr. Grimsby', 'Need the Q3 synergy deck by EOD (end of decade)'],
      ['Mr. Grimsby', 'Quick sync to circle back on the low-hanging fruit'],
      ['Client: Hamhock Meats', 'Re: our order of 40,000 staplers'],
      ['Mr. Grimsby', 'Let\'s deep-dive the paradigm. Bring a snorkel.'],
      ['Accounting', 'Your expense report: explain the $90 "emotional support sandwich"'],
      ['Client: Rotwell PD', 'Invoice for the riot gear (pastel edition)'],
      ['Mr. Grimsby', 'Move the needle. Literally. It\'s in my chair.'],
      ['Legal', 'Please confirm you did NOT reply-all to the board'],
    ],
    spam: [
      ['totallyrealprince@rotmail', 'A Prince of Rotwell needs your bank PIN'],
      ['Gary', 'FW: FW: FW: FW: send to 10 coworkers or you DIE'],
      ['HotSinglesNearRendering', 'Hot singles in your meat plant!!!'],
      ['Gary', 'lol look at this dog (attachment: 400MB)'],
      ['Rewards Center', 'U WON a FREE cruise (you are the cruise)'],
      ['Crypto Chad', 'GrimCoin to the MOON. Moon not guaranteed.'],
      ['Facilities', 'Mandatory fun survey (optional) (mandatory)'],
      ['Gary', 'who wants to see my mole'],
    ],
    hr: [
      ['Brenda', 'WHO keeps microwaving FISH in the break room'],
      ['Anonymous', 'Dale from Accounting keeps sniffing my chair'],
      ['Facilities', 'Someone pooped in the supply closet. Again. It\'s signed.'],
      ['Brenda', 'Steve is wearing ONLY the tie again'],
      ['Anonymous', 'Gary\'s "jokes" are now a podcast. In the break room. Live.'],
      ['Intern Kyle', 'My manager made me lick the stapler for "team bonding"'],
      ['Brenda', 'Someone replaced the coffee with gravy. It was Gary.'],
    ],
    phish: [
      ['Mr. Grimbsy', 'URGENT: buy me 40 gift cards. Do not tell Mr. Grimsby.'],
      ['Mr Grimsby (real)', 'Plz wire $5000 to my nephew, he is a real boss'],
      ['IT Departmint', 'Your pasword expired. Reply with pasword.'],
      ['Mr. Grimsbee', 'CEO here. Send me your social security. For synergy.'],
    ],
  };
  const av = (from, px) => { const s = SENDERS[from] || [{ bg: '#555', text: from[0] }]; return `<img class="mg-ic" src="${avatarURL(from, s[0], px)}" style="width:${px}px;height:${px}px;border-radius:50%">`; };
  const addr = (from) => (SENDERS[from] || [0, 'someone@somewhere'])[1];
  const isBossy = (from) => /Grims|Grimb/.test(from);
  mg.register('email', {
    name: 'Inbox Zero (Hero)', width: 680,
    how: howHtml([
      { ic: 'reply', k: ['←', 'A'], t: '<b>REPLY</b> to real work: the boss, clients, departments.' },
      { ic: 'trash', k: ['↓', 'S'], t: '<b>DELETE</b> spam, chain letters, Gary — and <b>fake bosses</b>.' },
      { ic: 'hr', k: ['→', 'D'], t: '<b>FORWARD TO HR</b> anything creepy or crimey.' },
      { ic: 'mail', t: 'Fake bosses: <b>misspelled names</b>, weird addresses, gift cards.' },
    ], 'Each email has a patience bar. ~40 seconds.'),
    lines: { S: ['Inbox zero. Mr. Grimsby calls it "visionary" and steals the credit. Classic.'], F: ['You replied-all to a dick pic. Not your own. Somehow worse.'] },
    create(api) {
      const N = 14 + Math.round(api.diff * 4), patience = 6.5 - api.diff * 2.2, T = 45;
      let t = 0, i = 0, cur = null, sum = 0, right = 0, left = 0, streak = 0;
      const counts = { sent: 0, hr: 0, trash: 0 };
      const deck = [];
      for (let k = 0; k < N; k++) {
        let kind = pick(['reply', 'reply', 'spam', 'spam', 'hr']);
        if (api.diff >= 0.25 && chance(0.18 + api.diff * 0.1)) kind = 'phish';
        const [from, subj] = pick(MAIL[kind]);
        deck.push({ kind, from, subj, body: pick(BODY[kind]), want: kind === 'reply' ? L : kind === 'hr' ? R : D, time: `${9 + Math.floor(k / 3)}:${String((k * 17) % 60).padStart(2, '0')}` });
      }
      api.stage.classList.add('mg-cv');
      api.stage.innerHTML = `<div class="em-mon"><div class="em-scr">
        <div class="em-title"><span>✉ Grimco Mail 97 — Inbox</span><span class="em-wb"><i>_</i><i>□</i><i>×</i></span></div>
        <div class="em-body">
          <div class="em-side">
            <div class="em-f on">${iconImg('mail', 22)}<span>Inbox</span><b data-c="in"></b></div>
            <div class="em-f" data-k="${L}">${iconImg('reply', 22)}<span>Sent</span><b data-c="sent">0</b></div>
            <div class="em-f" data-k="${R}">${iconImg('hr', 22)}<span>HR</span><b data-c="hr">0</b></div>
            <div class="em-f" data-k="${D}">${iconImg('trash', 22)}<span>Trash</span><b data-c="trash">0</b></div>
            <div class="em-mug">☕<small>WORLD'S OKAYEST EMPLOYEE</small></div>
          </div>
          <div class="em-main"><div class="em-list" data-list></div><div class="em-prev" data-prev></div></div>
        </div>
        <div class="em-fx" data-fx></div>
      </div></div>`;
      api.pad([{ k: L, label: padIc('reply', 'REPLY'), sub: '← / A · real work', cls: 'green ic' }, { k: D, label: padIc('trash', 'DELETE'), sub: '↓ / S · spam & fakes', cls: 'ic' }, { k: R, label: padIc('hr', 'HR'), sub: '→ / D · creepy / crimey', cls: 'red ic' }]);
      const $ = (s) => api.stage.querySelector(s);
      const listEl = $('[data-list]'), prevEl = $('[data-prev]'), fxEl = $('[data-fx]');
      const row = (m, sel) => `<div class="em-row ${sel ? 'sel' : ''}">${av(m.from, 26)}<span class="em-from">${m.from}</span><span class="em-subj">${isBossy(m.from) ? '<i class="em-imp">!</i>' : ''}${m.subj}</span><span class="em-tm">${m.time}</span></div>`;
      const show = () => {
        cur = deck[i]; left = patience;
        if (!cur) return;
        listEl.innerHTML = deck.slice(i, i + 5).map((m, k) => row(m, k === 0)).join('') + (N - i > 5 ? `<div class="em-more">+ ${N - i - 5} more unread…</div>` : '');
        prevEl.innerHTML = `<div class="em-ph">${av(cur.from, 58)}<div><div class="em-pf">${cur.from}</div><div class="em-pa">&lt;${addr(cur.from)}&gt;</div></div></div>
          <div class="em-ps">${isBossy(cur.from) ? '<i class="em-imp">!</i> ' : ''}${cur.subj}</div><div class="em-pb">${cur.body}</div>
          <div class="em-pat"><span>⏳</span><div class="mg-time" style="height:9px"><i data-pt style="width:100%"></i></div></div>`;
        prevEl.classList.remove('em-in'); void prevEl.offsetWidth; prevEl.classList.add('em-in');
        $('[data-c="in"]').textContent = N - i;
        api.sfx('tick');
      };
      const fly = (code, good) => {
        const g = prevEl.cloneNode(true);
        g.classList.remove('em-in'); g.classList.add('em-ghost', code === L ? 'go-r' : code === R ? 'go-hr' : code === D ? 'go-d' : 'go-x');
        fxEl.appendChild(g); setTimeout(() => g.remove(), 500);
        const st = document.createElement('div');
        st.className = `em-stamp ${good ? 'ok' : 'bad'}`;
        st.innerHTML = `${iconImg(good ? 'ok' : 'no', 44)}<span>${code === 'timeout' ? 'IGNORED' : code === L ? 'SENT' : code === R ? 'TO HR' : 'TRASHED'}</span>`;
        fxEl.appendChild(st); setTimeout(() => st.remove(), 700);
        const f = code === L ? 'sent' : code === R ? 'hr' : code === D ? 'trash' : null;
        if (f) { counts[f]++; const ce = $(`[data-c="${f}"]`); ce.textContent = counts[f]; ce.parentElement.classList.remove('bump'); void ce.offsetWidth; ce.parentElement.classList.add('bump'); }
      };
      const answer = (code) => {
        const good = code === cur.want;
        fly(code, good);
        if (good) { right++; streak++; sum += 0.75 + 0.25 * (left / patience); api.sfx('hit'); api.msg(streak >= 3 ? `${pick(['Handled.', 'Synergized.', 'Leveraged.', 'Circled back.'])} <b style="color:#ffd84a">x${streak} streak</b>` : pick(['Handled.', 'Synergized.', 'Leveraged.', 'Circled back.', 'Actioned. (That\'s a verb now.)']), 'good', 500); }
        else {
          streak = 0;
          api.sfx('miss'); api.shake();
          const why = code === 'timeout' ? 'Ignored. It\'s now a "fire". You\'re the arsonist.'
            : cur.kind === 'phish' ? (code === L ? 'You bought 40 gift cards for a scammer. Grimsby is "disappointed but not surprised".' : 'HR just forwarded it back. It\'s spam. Delete it.')
              : cur.kind === 'hr' ? 'That needed HR. Now YOU\'RE in the email chain.'
                : cur.kind === 'spam' ? (code === L ? 'You replied to Gary. He replied back. Forty times.' : 'HR does not care about Gary\'s dog.')
                  : 'That was your boss. Mr. Grimsby is typing in ALL CAPS.';
          api.msg(why, 'bad', 1300);
        }
        i++;
        api.score(`✉ ${right}/${i}`);
        if (i >= N) { api.done(sum / N, { stats: `${right}/${N} handled right` }); return; }
        show();
      };
      show(); api.score('✉ 0/0');
      return {
        partial: () => sum / N,
        tick(dt) {
          t += dt;
          api.time(1 - i / N);
          if (!cur) return;
          left -= dt;
          const pt = prevEl.querySelector('[data-pt]');
          if (pt) { pt.style.width = `${clamp(left / patience, 0, 1) * 100}%`; pt.parentElement.classList.toggle('low', left / patience < 0.3); }
          if (left <= 0) answer('timeout');
          if (t >= T && cur) api.done(sum / N, { stats: `${right}/${N} handled right` });
        },
        key(code) { if (code !== L && code !== R && code !== D) return false; if (cur) answer(code); },
      };
    },
  });

  // ========================================================================================== LINEUP
  const HATS = ['none', 'cap', 'tophat', 'beanie'];
  const HAT_WORDS = { none: 'no hat', cap: 'a ball cap', tophat: 'a top hat', beanie: 'a beanie' };
  const SHIRTS = ['red', 'blue', 'green', 'yellow', 'purple'];
  const KEYS = ['shirt', 'hat', 'stache', 'glasses', 'tall', 'scar', 'tattoo'];
  const chipIc = (k, v) => ({ shirt: `shirt:${v}`, hat: v === 'none' ? 'nohat' : v, stache: v ? 'stache' : 'nostache', glasses: v ? 'glasses' : 'noglasses', tall: v ? 'tall' : 'short', scar: v ? 'scar' : 'noscar', tattoo: v ? 'tattoo' : 'notattoo' }[k]);
  const chipTx = (k, v) => ({ shirt: `${v} shirt`, hat: HAT_WORDS[v], stache: v ? 'mustache' : 'no mustache', glasses: v ? 'glasses' : 'no glasses', tall: v ? 'tall' : 'short', scar: v ? 'face scar' : 'no scar', tattoo: v ? 'tattoo' : 'no tattoo' }[k]);
  function luBackground(c, W, H) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a3036'); g.addColorStop(1, '#1a1e22');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let ft = 2; ft <= 8; ft++) {
      const y = 266 - ft * 30;
      if (y < 0) continue;
      line(c, 0, y, W, y, 'rgba(230,223,207,.35)', ft % 1 ? 1 : 2);
      line(c, 0, y + 15, W, y + 15, 'rgba(230,223,207,.12)', 1);
      text(c, `${ft}'`, 14, y - 7, { size: 13, color: 'rgba(230,223,207,.7)', stroke: null });
      text(c, `${ft}'`, W - 14, y - 7, { size: 13, color: 'rgba(230,223,207,.7)', stroke: null });
    }
    c.fillStyle = '#15181b'; c.fillRect(0, 266, W, H - 266);
    line(c, 0, 266, W, 266, '#000', 3);
    text(c, 'ROTWELL PD', W / 2, 18, { size: 14, color: 'rgba(230,223,207,.25)', stroke: null, fam: FT });
    grime(c, 0, 0, W, 266, 40, rng(4), 'rgba(0,0,0,', 0.3);
  }
  mg.register('lineup', {
    name: 'Suspect Lineup', width: 700,
    how: howHtml([
      { ic: ['cap', 'stache', 'glasses'], t: 'Read the <b>witness statement</b>.' },
      { ic: ['tall', 'scar', 'tattoo'], t: 'Pick the <b>one</b> suspect who matches <b>every</b> detail.' },
      { ic: 'ok', k: ['1', '…', '6'], t: 'or tap a suspect. Faster = better.' },
    ], '6 lineups. Wrong pick = an innocent man in jail (Hamhock calls that "Tuesday").'),
    lines: { S: ['The Chief gives you a donut from the GOOD box. Detective material.'], F: ['You arrested the witness, the lawyer and a mop.'] },
    create(api) {
      const rounds = 6, N = 4 + Math.round(api.diff * 2), timeR = 10 - api.diff * 3, nTraits = 2 + Math.round(api.diff * 2);
      let r = 0, left = timeR, sum = 0, right = 0, cur = null, wait = 0, picked = -1, born = 0, tt0 = 0;
      const W = 680, H = 300;
      const S = scene(api, W, H);
      const wit = document.createElement('div');
      wit.className = 'mg-wit';
      S.box.before(wit);
      api.pad([]);
      const randT = () => ({ shirt: pick(SHIRTS), hat: pick(HATS), stache: chance(0.5), glasses: chance(0.45), tall: chance(0.5), scar: chance(0.35), tattoo: chance(0.35) });
      const phrase = (k, v) => ({ shirt: `a <b>${v}</b> shirt`, hat: `<b>${HAT_WORDS[v]}</b>`, stache: v ? 'a <b>mustache</b>' : '<b>no mustache</b>', glasses: v ? '<b>glasses</b>' : '<b>no glasses</b>', tall: v ? 'a <b>tall</b> build' : 'a <b>short</b> build', scar: v ? 'a <b>scar</b> on his face' : '<b>no scar</b>', tattoo: v ? 'a <b>tattoo</b>' : '<b>no tattoos</b>' }[k]);
      const matches = (s, c, ks) => ks.every((k) => s[k] === c[k]);
      const newRound = () => {
        const culprit = randT();
        const ks = shuffle(KEYS).slice(0, nTraits);
        const sus = [culprit];
        let guard = 0;
        while (sus.length < N && guard++ < 200) {
          const s = chance(0.7) ? { ...culprit } : randT();
          const k = pick(ks);
          if (k === 'shirt') s.shirt = pick(SHIRTS.filter((c) => c !== culprit.shirt));
          else if (k === 'hat') s.hat = pick(HATS.filter((h) => h !== culprit.hat));
          else s[k] = !culprit[k];
          if (chance(0.5)) { const o = pick(KEYS.filter((x) => !ks.includes(x))); if (o) s[o] = o === 'shirt' ? pick(SHIRTS) : o === 'hat' ? pick(HATS) : !s[o]; }
          if (!matches(s, culprit, ks)) sus.push(s);
        }
        const order = shuffle(sus).map((s) => ({ ...s, _c: s === culprit, expr: pick(['neutral', 'smug', 'sad', 'angry', 'shock', 'neutral']), sweat: chance(0.3) ? 2 : 0, hair: pick(['black', 'brown', 'blond', 'gray']), ph: Math.random() * 6 }));
        cur = { culprit, ks, order, ans: order.findIndex((o) => o._c) };
        left = timeR; picked = -1; born = tt0;
        const smell = pick(['regret', 'hot dogs', 'Axe body spray and fear', 'a wet basement', 'cheap cologne and cheaper decisions', 'my uncle']);
        wit.innerHTML = `<div class="mg-wit-q"><small>Witness #${r + 1} (${pick(['a drunk', 'a nun', 'a guy in a bathrobe', 'a very confident child', 'a man holding a ferret'])}):</small>"The guy had ${ks.map((k) => phrase(k, culprit[k])).join(', ')}. He smelled like ${smell}."</div>
          <div class="mg-wit-chips">${ks.map((k) => `<span>${iconImg(chipIc(k, culprit[k]), 30)}<i>${chipTx(k, culprit[k])}</i></span>`).join('')}</div>`;
      };
      newRound();
      api.score('🚔 0/0');
      const draw = (c, tt) => {
        tt0 = tt;
        blit(c, cached('lu:bg', W, H, luBackground), 0, 0);
        const n = cur.order.length, colW = (W - 40) / n;
        // overhead light
        const lg = c.createRadialGradient(W / 2, -40, 20, W / 2, -40, 420); lg.addColorStop(0, 'rgba(255,250,220,.18)'); lg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = lg; c.fillRect(0, 0, W, H);
        cur.order.forEach((s, i) => {
          const x = 20 + colW * (i + 0.5);
          const enter = easeOut(clamp((tt - born - i * 0.06) / 0.35, 0, 1));
          const showRes = wait > 0;
          if (showRes && i === cur.ans) { glow(c, x, 160, 110, 'rgba(127,191,77,.35)'); }
          if (showRes && i === picked && picked !== cur.ans) { glow(c, x, 160, 100, 'rgba(226,64,47,.35)'); }
          const h = s.tall ? 196 : 146;
          const sway = Math.sin(tt * 1.4 + s.ph) * 0.06;
          c.save(); c.translate(0, (1 - enter) * 30); c.globalAlpha = enter;
          stick(c, x, 266, { h, shirt: s.shirt, hat: s.hat === 'none' ? null : s.hat, stache: s.stache, glasses: s.glasses, scar: s.scar, tattoo: s.tattoo, hair: s.hair, expr: showRes && i === picked ? (i === cur.ans ? 'sad' : 'shock') : s.expr, sweat: s.sweat, arms: [[0.18 + sway, 0.05], [0.18 - sway, 0.05]], pants: '#2a2a30', lw: 4.5 });
          c.restore();
          // floor number
          rr(c, x - 22, 270, 44, 26, 4); fs(c, '#efe8d6', '#000', 2);
          text(c, String(i + 1), x, 284, { size: 22, color: '#141210', stroke: null, fam: FT });
          if (showRes && i === cur.ans) drawIcon(c, 'ok', x + 34, 70, 40);
          if (showRes && i === picked && picked !== cur.ans) { drawIcon(c, 'no', x + 34, 70, 40); text(c, 'INNOCENT', x, 110, { size: 18, color: '#ff8070', lw: 4, fam: FT }); }
          S.hit(x - colW / 2, 30, colW, H - 30, DIGITS[i]);
        });
        if (wait > 0 && picked === cur.ans) text(c, 'BOOK \'EM!', W / 2, 40, { size: 30, color: COL.gold, lw: 6, fam: FT });
      };
      return {
        partial: () => sum / rounds,
        tick(dt) {
          if (wait > 0) { wait -= dt; if (wait <= 0) { if (r >= rounds) { api.done(sum / rounds, { stats: `${right}/${rounds} collars` }); return; } newRound(); } }
          else { left -= dt; api.time(left / timeR); if (left <= 0) this.key('timeout'); }
          S.frame(dt, draw);
        },
        key(code) {
          if (wait > 0 || !cur) return code === 'timeout' ? undefined : false;
          const i = code === 'timeout' ? -1 : digitIndex(code);
          if (code !== 'timeout' && (i < 0 || i >= cur.order.length)) return false;
          picked = i;
          if (i === cur.ans) { right++; sum += 0.6 + 0.4 * clamp(left / timeR, 0, 1); api.sfx('stamp'); api.msg(pick(['Book \'em!', 'GOT HIM. He confesses to three other things.', 'Nailed it. He cries. You cry. Beautiful.']), 'good'); S.flash('rgba(127,191,77,.25)'); }
          else {
            api.sfx('miss'); S.shake(6);
            api.msg(code === 'timeout' ? 'Too slow. The suspect walked. Literally, out the door.' : pick(['Wrong guy! He was just there for the free coffee.', 'Innocent man arrested. The Chief says "close enough".', 'Nope. That\'s the witness\'s cousin.']), 'bad', 1300);
          }
          r++; wait = 1.1;
          api.score(`🚔 ${right}/${r}`);
        },
      };
    },
  });

  // ========================================================================================== IDCHECK
  const YEAR = 2031;
  const FIRST = ['Chad', 'Destinee', 'Barry', 'Tiffanee', 'Moist', 'Brayden', 'Krystal', 'Dr.', 'Lil', 'Big', 'Duke', 'Skyler', 'Gertrude', 'Rocco'];
  const LAST = ['Brosky', 'Sparkles', 'Bigsby', 'McPartyface', 'Kevin', 'Thunderthighs', 'Gristle', 'Vape', 'Fontaine', 'Noodle', 'Hamhock Jr.', 'DeVille'];
  const HAIRK = ['black', 'blond', 'red', 'gray'];
  const SHOES = ['dress', 'boots', 'heels', 'flipflops'];
  const SHOE_IC = { sneakers: 'runshoe', dress: 'dressshoe', boots: 'boots', heels: 'heels', flipflops: 'flipflops' };
  const SHOE_TX = { sneakers: 'SNEAKERS', dress: 'dress shoes', boots: 'boots', heels: 'heels', flipflops: 'flip-flops (bold)' };
  function idBackground(c, W, H) {
    c.fillStyle = '#3a2420'; c.fillRect(0, 0, W, H);
    for (let y = 40; y < H; y += 14) for (let x = (y / 14) % 2 ? -12 : 0; x < 330; x += 26) { rr(c, x + 1, y + 1, 24, 12, 1); fs(c, '#6a3a30'); }
    grime(c, 0, 40, 330, H - 40, 60, rng(8), 'rgba(0,0,0,', 0.35);
    // door
    rr(c, 214, 86, 96, 200, 3); fs(c, '#141010', '#000', 3); rr(c, 222, 94, 80, 192, 2); fs(c, '#2a1a20');
    ell(c, 290, 190, 4, 4); fs(c, '#c8a030');
    c.fillStyle = '#1a1414'; c.fillRect(0, 286, 330, H - 286);
    // carpet
    c.fillStyle = '#6a0e1a'; c.fillRect(200, 286, 124, H - 286);
    // right side: the bouncer's podium
    const g = c.createLinearGradient(330, 0, W, 0); g.addColorStop(0, '#1c1714'); g.addColorStop(1, '#141110');
    c.fillStyle = g; c.fillRect(330, 40, W - 330, H - 40);
    line(c, 330, 40, 330, H, '#000', 3);
    // rule strip
    c.fillStyle = '#1f2a22'; c.fillRect(0, 0, W, 40); line(c, 0, 40, W, 40, '#5a4a30', 3);
  }
  mg.register('idcheck', {
    name: 'The Velvet Rope', width: 680,
    how: (o) => howHtml([
      { ic: 'id', t: `Today is <b>${YEAR}</b>. Check every ID against <b>Vince's rules</b>:` },
      { ic: 'calendar', t: '<b>21+</b> and <b>not expired</b>' },
      ...((o.diff ?? 0) >= 0.4 ? [{ ic: 'scar', t: '<b>photo must match</b> the face (hair, mustache, glasses)' }] : []),
      ...((o.diff ?? 0) >= 0.9 ? [{ ic: 'runshoe', t: '<b>NO SNEAKERS</b>' }] : []),
      { ic: 'ok', k: ['←', 'A'], t: '<b>LET IN</b>' }, { ic: 'no', k: ['→', 'D'], t: '<b>BOUNCE</b>' },
    ], '10 patrons, and they get impatient.'),
    lines: { S: ['Vince fist-bumps you. Your hand goes numb for an hour. Worth it.'], F: ['You let in three 16-year-olds and a raccoon in a trench coat.'] },
    create(api) {
      const N = 10, patience = 7 - api.diff * 2.5;
      const rules = ['age', 'exp', ...(api.diff >= 0.4 ? ['photo'] : []), ...(api.diff >= 0.9 ? ['shoes'] : [])];
      let i = 0, left = patience, sum = 0, right = 0, cur = null, wait = 0, born = 0, verdict = null, tt0 = 0;
      const W = 660, H = 310;
      const S = scene(api, W, H);
      api.pad([{ k: L, label: padIc('ok', 'LET IN'), sub: '← / A', cls: 'green ic' }, { k: R, label: padIc('no', 'BOUNCE'), sub: '→ / D', cls: 'red ic' }]);
      const next = () => {
        const face0 = { hair: pick(HAIRK), stache: chance(0.4), glasses: chance(0.35), hairStyle: chance(0.3) ? 'long' : 'short' };
        const c0 = { name: `${pick(FIRST)} ${pick(LAST)}`, born: YEAR - randInt(21, 58), exp: YEAR + randInt(0, 5), face: face0, photo: { ...face0 }, sneakers: rules.includes('shoes') ? chance(0.25) : chance(0.5), bad: null };
        if (rules.includes('shoes') && c0.sneakers) c0.bad = 'shoes';
        if (!c0.bad && chance(0.5)) {
          const b = pick(rules.filter((x) => x !== 'shoes'));
          c0.bad = b;
          if (b === 'age') c0.born = YEAR - randInt(16, 20);
          if (b === 'exp') c0.exp = YEAR - randInt(1, 6);
          if (b === 'photo') { const k = pick(['hair', 'stache', 'glasses']); c0.photo[k] = k === 'hair' ? pick(HAIRK.filter((h) => h !== face0.hair)) : !face0[k]; }
        }
        c0.shoe = c0.sneakers ? 'sneakers' : pick(SHOES);
        c0.shirt = pick(['red', 'blue', 'purple', 'black', 'white', 'yellow']);
        c0.donor = pick(['YES', 'ALREADY DID', 'KIDNEY ONLY', 'NO (selfish)']);
        c0.say = pick(['I know Vince.', 'Do you know who I am?', 'I\'m on the list. Under "VIP". Or "Steve".', 'My cousin owns this club. Different club, but still.', 'Hurry up, I gotta pee so bad.', 'That\'s an old photo. I\'ve had work done.', 'Is this the line for the bathroom?']);
        c0.idn = `${randInt(100, 999)}-${randInt(10, 99)}-${randInt(1000, 9999)}`;
        cur = c0; left = patience; born = tt0; verdict = null;
        api.sfx('whoosh');
      };
      next(); api.score('🚪 0/0');
      const drawCard = (c, x, y, tt) => {
        const cw = 300, ch = 186;
        c.save(); c.translate(x, y);
        c.fillStyle = 'rgba(0,0,0,.45)'; rr(c, 6, 8, cw, ch, 12); c.fill();
        const g = c.createLinearGradient(0, 0, cw, ch); g.addColorStop(0, '#f2ead0'); g.addColorStop(1, '#d4cab0');
        rr(c, 0, 0, cw, ch, 12); fs(c, g, '#000', 2.5);
        c.save(); rr(c, 0, 0, cw, ch, 12); c.clip();
        c.fillStyle = '#6d1510'; c.fillRect(0, 0, cw, 30);
        text(c, 'STATE OF ROTWELL', 12, 15, { size: 15, color: '#f2ead0', stroke: null, fam: FT, align: 'left' });
        text(c, 'DRIVER LICENSE-ISH', cw - 10, 15, { size: 12, color: '#f2c8b0', stroke: null, align: 'right' });
        // hologram shimmer
        const hx = ((tt * 90) % (cw + 200)) - 100;
        const hg = c.createLinearGradient(hx - 40, 0, hx + 40, ch); hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(0.5, 'rgba(180,255,240,.28)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = hg; c.fillRect(0, 30, cw, ch);
        for (let k = 0; k < 6; k++) { ell(c, 200 + k * 14, 150, 22, 22); fs(c, null, 'rgba(120,140,160,.12)', 1); }
        if (cur.bad === 'exp') { line(c, 0, 108, cw, 92, 'rgba(255,255,255,.55)', 2); line(c, 0, 110, cw, 94, 'rgba(0,0,0,.12)', 1); }
        c.restore();
        // photo
        c.save();
        if (cur.bad === 'photo') { c.translate(64, 98); c.rotate(-0.06); c.translate(-64, -98); }
        rr(c, 12, 40, 104, 116, 4); fs(c, '#a8b8c8', '#555', 2);
        c.save(); rr(c, 12, 40, 104, 116, 4); c.clip();
        c.beginPath(); c.moveTo(20, 160); c.quadraticCurveTo(24, 128, 64, 126); c.quadraticCurveTo(104, 128, 108, 160); c.closePath(); fs(c, '#6a6a7a', '#000', 2);
        face(c, 64, 92, 30, { ...cur.photo, expr: 'neutral' });
        c.restore();
        if (cur.bad === 'photo') { ell(c, 112, 44, 9, 6); c.fillStyle = 'rgba(240,240,200,.6)'; c.fill(); }
        c.restore();
        // fields
        const fx = 128;
        const lab = (s, yy) => text(c, s, fx, yy, { size: 11, color: '#7a6a5a', stroke: null, align: 'left' });
        lab('NAME', 44); text(c, cur.name, fx, 62, { size: 19, color: '#141210', stroke: null, align: 'left', maxW: 166 });
        lab('BORN', 82);
        if (cur.bad === 'age') { rr(c, fx - 2, 88, 54, 22, 3); fs(c, 'rgba(255,255,255,.7)'); text(c, String(cur.born), fx, 100, { size: 21, color: '#2a2a7a', stroke: null, align: 'left', fam: FT }); }
        else text(c, String(cur.born), fx, 100, { size: 21, color: '#141210', stroke: null, align: 'left' });
        if (api.diff < 0.4) text(c, `(age ${YEAR - cur.born})`, fx + 60, 101, { size: 14, color: '#666', stroke: null, align: 'left' });
        lab('EXPIRES', 122); text(c, String(cur.exp), fx, 140, { size: 21, color: '#141210', stroke: null, align: 'left' });
        text(c, `ID ${cur.idn}`, fx + 80, 140, { size: 11, color: '#7a6a5a', stroke: null, align: 'left' });
        text(c, `ORGAN DONOR: ${cur.donor}`, 12, 172, { size: 12, color: '#6d1510', stroke: null, align: 'left' });
        // verdict stamp
        if (verdict) {
          const k = easeBack(clamp((tt - verdict.t) / 0.2, 0, 1));
          c.save(); c.translate(cw / 2, ch / 2); c.rotate(-0.25); c.scale(2.2 - 1.2 * k, 2.2 - 1.2 * k); c.globalAlpha = Math.min(1, k * 1.3);
          const col = verdict.in ? '#2e7a1e' : '#c0201a';
          rr(c, -90, -26, 180, 52, 6); fs(c, null, col, 5);
          text(c, verdict.in ? 'APPROVED' : 'DENIED', 0, 2, { size: 34, color: col, stroke: null, fam: FT });
          c.restore();
        }
        c.restore();
      };
      const draw = (c, tt) => {
        tt0 = tt;
        blit(c, cached('id:bg', W, H, idBackground), 0, 0);
        // rules strip
        const items = [['calendar', `TODAY ${YEAR}`], ['id', `21+ (born ≤${YEAR - 21})`], ['clock', 'NOT EXPIRED'], ...(rules.includes('photo') ? [['scar', 'PHOTO = FACE']] : []), ...(rules.includes('shoes') ? [['runshoe', 'NO SNEAKERS']] : [])];
        const sw = W / items.length;
        items.forEach(([ic, tx], k) => { drawIcon(c, ic, sw * k + 20, 20, 28); if (ic === 'runshoe') { line(c, sw * k + 8, 32, sw * k + 32, 8, '#e2402f', 4); } text(c, tx, sw * k + 38, 21, { size: 15, color: k === 0 ? COL.gold : '#e6dfcf', stroke: null, align: 'left', maxW: sw - 44 }); });
        // neon sign
        const fl = Math.sin(tt * 30) > -0.9 ? 1 : 0.3;
        glow(c, 262, 66, 70, `rgba(255,60,170,${0.35 * fl})`);
        rr(c, 210, 52, 104, 28, 6); fs(c, '#1a0a14', '#000', 2);
        text(c, 'VELVET', 262, 67, { size: 20, color: fl > 0.5 ? '#ff7ad0' : '#7a3a60', stroke: null, fam: FT });
        // patron
        const enter = easeOut(clamp((tt - born) / 0.35, 0, 1));
        let px = 130 - (1 - enter) * 160, rot = 0, alpha = 1;
        if (verdict) {
          const k = clamp((tt - verdict.t) / 0.6, 0, 1);
          if (verdict.in) { px = 130 + k * 130; alpha = 1 - Math.max(0, k - 0.5) * 2; }
          else { px = 130 - easeOut(k) * 240; rot = -k * 1.2; }
        }
        const impatient = clamp(1 - left / patience, 0, 1);
        c.save(); c.globalAlpha = alpha; c.translate(px, 296); c.rotate(rot); c.translate(-px, -296);
        const tap = impatient > 0.5 ? Math.max(0, Math.sin(tt * 14)) * 0.25 : 0;
        stick(c, px, 296, { h: 196, shirt: cur.shirt, pants: '#22222a', hair: cur.face.hair, hairStyle: cur.face.hairStyle, stache: cur.face.stache, glasses: cur.face.glasses, shoes: cur.shoe, expr: verdict ? (verdict.in ? 'happy' : 'shock') : impatient > 0.6 ? 'angry' : 'neutral', sweat: impatient > 0.7 ? 2 : 0, legs: [[0.2, -0.02], [0.2 + tap, -0.02 - tap]], arms: [[0.3, 0.3], [0.3, 0.3]], lw: 5 });
        c.restore();
        // rope (opens on approve)
        const open = verdict?.in ? clamp((tt - verdict.t) / 0.25, 0, 1) : 0;
        for (const sx of [36, 200]) { rr(c, sx - 5, 228, 10, 62, 3); fs(c, '#c8a030', '#000', 2); ell(c, sx, 226, 9, 9); fs(c, '#e8c050', '#000', 2); }
        c.beginPath(); c.moveTo(40, 236);
        if (open < 1) c.quadraticCurveTo(118, 280 - open * 0, 196 - open * 140, 236 + open * 50);
        c.strokeStyle = '#000'; c.lineWidth = 11; c.stroke(); c.strokeStyle = '#a0102a'; c.lineWidth = 7; c.stroke();
        // shoe zoom
        ell(c, 290, 264, 30, 30); fs(c, '#efe8d6', '#000', 3);
        drawIcon(c, SHOE_IC[cur.shoe], 290, 262, 44);
        text(c, SHOE_TX[cur.shoe], 290, 302, { size: 13, color: cur.shoe === 'sneakers' && rules.includes('shoes') ? '#ff8070' : COL.bone, lw: 3 });
        // speech
        if (!verdict) { bubble(c, 8, 48, 190, 44, 120, 100); wrapText(c, `"${cur.say}"`, 103, 62, 176, 16, { size: 14, color: '#141210', stroke: null }); }
        // ID card (slides in)
        const cx = 346 + (1 - enter) * 320;
        drawCard(c, cx, 70, tt);
        meter(c, 352, 276, 290, 12, clamp(left / patience, 0, 1), left / patience < 0.3 ? '#e2402f' : '#d6b33c', '#1d1915');
        text(c, 'PATIENCE', 498, 300, { size: 12, color: '#a9a291', stroke: null });
        S.hit(0, 40, 330, 270, L); S.hit(330, 40, 330, 230, R);
      };
      return {
        partial: () => clamp((sum - 0.4 * (i - right)) / N, 0, 1),
        tick(dt) {
          if (wait > 0) { wait -= dt; if (wait <= 0) { if (i >= N) { api.done(clamp((sum - 0.4 * (i - right)) / N, 0, 1), { stats: `${right}/${N} correct calls` }); return; } next(); } }
          else { left -= dt; api.time(left / patience); if (left <= 0) this.key('timeout'); }
          S.frame(dt, draw);
        },
        key(code) {
          if (wait > 0 || !cur) return code === 'timeout' ? undefined : false;
          if (code !== L && code !== R && code !== 'timeout') return false;
          const shouldIn = !cur.bad;
          const ok = code !== 'timeout' && (code === L) === shouldIn;
          verdict = { in: code === L, t: tt0 };
          if (ok) { right++; sum += 0.75 + 0.25 * clamp(left / patience, 0, 1); api.sfx(code === L ? 'hit' : 'stamp'); S.mark(true, 496, 50); api.msg(code === L ? pick(['In you go.', 'Enjoy the bass. And the smell.']) : pick(['BOUNCED. Like a bad check.', 'Get outta here, kid.', 'Rejected. They cry in the parking lot.']), 'good', 700); }
          else {
            api.sfx('miss'); S.shake(6); S.mark(false, 496, 50);
            const why = code === 'timeout' ? 'Too slow. They climbed over the rope.'
              : shouldIn ? 'That ID was fine. You bounced a paying customer. Vince is doing math at you.'
                : { age: `They're ${YEAR - cur.born}. That's a CHILD, by club law.`, exp: 'Expired ID. Vince\'s rule two. Or four. There are a lot of rules.', photo: 'That\'s not their photo. That\'s their cousin. Or a stranger.', shoes: 'SNEAKERS. In Club Velvet. Vince is physically ill.' }[cur.bad];
            api.msg(why, 'bad', 1400);
          }
          i++; wait = 0.75;
          api.score(`🚪 ${right}/${i}`);
        },
      };
    },
  });
}
