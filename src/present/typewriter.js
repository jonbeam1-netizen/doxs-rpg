// Typewriter reveal for dialog text. The not-yet-typed remainder of each text node sits in a
// transparent span, so the layout (line wraps, panel height) is final from the first frame and
// nothing jumps while it types. Works on any trusted HTML (<p>, <em>, <b>, notes...).
//
//   const tw = typewrite(el, { cps, maxSec, onChar(ch) , onDone() })
//   tw.finish()   reveal everything now          tw.typing   still going?
const PAUSE = { '.': 6, '!': 6, '?': 6, ',': 2.5, ';': 3, ':': 3, '—': 3 };

export function typewrite(el, { cps = 95, maxSec = 2.2, onChar = null, onDone = null } = {}) {
  const nodes = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue && n.nodeValue.trim()) nodes.push(n);
  let total = 0;
  const parts = nodes.map((n) => {
    const full = n.nodeValue;
    total += full.length;
    const rest = document.createElement('span');
    rest.className = 'tw-rest';
    rest.textContent = full;
    n.nodeValue = '';
    n.parentNode.insertBefore(rest, n.nextSibling);
    return { n, rest, full };
  });
  // long speeches type faster so nothing takes more than ~maxSec
  const rate = Math.max(cps, total / maxSec * 1.25);
  let pi = 0, ci = 0, budget = 0, last = performance.now(), timer = 0;
  const api = { typing: total > 0, finish, total };

  function flush(p, k) { p.n.nodeValue = p.full.slice(0, k); p.rest.textContent = p.full.slice(k); }

  function step() {
    const now = performance.now();
    budget += Math.min(0.25, (now - last) / 1000) * rate;
    last = now;
    let typed = 0;
    while (pi < parts.length && budget > 0) {
      const p = parts[pi];
      const ch = p.full[ci];
      const cost = 1 + (PAUSE[ch] && p.full[ci + 1] !== ch && (p.full[ci + 1] ?? ' ') === ' ' ? PAUSE[ch] : 0);
      budget -= cost;
      ci++;
      if (ch !== ' ') { typed++; if (typed % 2 === 1) { try { onChar?.(ch); } catch { /* cosmetic */ } } }
      if (ci >= p.full.length) { flush(p, ci); pi++; ci = 0; } else if (budget <= 0) flush(p, ci);
    }
    if (pi >= parts.length) end();
  }

  function end() {
    clearInterval(timer); timer = 0;
    for (const p of parts) { p.n.nodeValue = p.full; p.rest.remove(); }
    if (!api.typing) return;
    api.typing = false;
    try { onDone?.(); } catch { /* ignore */ }
  }

  function finish() { if (api.typing) end(); }

  if (api.typing) timer = setInterval(step, 16);
  return api;
}
