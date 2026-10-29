// Shared rendering for scan results (home page and report page).
// Everything that came from a scanned website is escaped before it is shown,
// because a hostile page could put HTML or script in its title or field names.
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STATUS = { pass: 'Pass', warn: 'Check', fail: 'Fix now', na: 'Not tested' };
  const SENSITIVE = ['Ghana Card / national ID', 'Date of birth', 'Payment card', 'Mobile money number'];
  const ORDER = { fail: 0, warn: 1, pass: 2 };
  const RING = 2 * Math.PI * 52; // circumference of the score dial
  const EMPTY = { fail: 'Nothing needs fixing right away.', warn: 'Nothing is left to check by hand.', pass: 'No checks passed on this page.' };
  const ICON = {
    info: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v4.5M10 6.2v.1" stroke-linecap="round"/></svg>',
    fix: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  // Scan dates are stored in UTC without a zone ("2026-10-28 20:22:05").
  function date(s) {
    return s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  }
  const status = (s) => `<span class="status ${esc(s)}">${STATUS[s] || ''}</span>`;

  // The eight principles as a reference list, with no results attached (home page).
  function ledgerHtml(principles) {
    return '<ol class="ledger">' + principles.map((p) => `
      <li><span class="letter">(${esc(p.letter)})</span><div><h3>${esc(p.name)}</h3><p>${esc(p.plain)}</p></div></li>`).join('') + '</ol>';
  }

  // The eight principles with this scan's result for each.
  function principlesHtml(principles) {
    return '<ul class="pstatus">' + principles.map((p) => `
      <li title="${esc(p.plain)}"><span class="letter">(${esc(p.letter)})</span><span>${esc(p.name)}</span>${status(p.status)}</li>`).join('') + '</ul>';
  }

  function findingHtml(f) {
    return `<article class="finding ${esc(f.status)}" data-status="${esc(f.status)}">
      <div class="finding-top">${status(f.status)}<span class="finding-ref">${esc(f.principleName)} · ${f.sections.map(esc).join(' · ')}</span></div>
      <h4>${esc(f.title)}</h4>
      <p>${esc(f.explain)}</p>
      <div class="evidence"><span>What we found</span>${esc(f.evidence)}</div>
      ${f.status !== 'pass' ? `<div class="fix"><span class="fix-label">${ICON.fix}How to fix</span><p>${esc(f.fix)}</p></div>` : ''}
    </article>`;
  }

  function inventoryHtml(inv) {
    const keys = Object.keys(inv || {});
    if (!keys.length) return '<p class="muted">No forms collecting personal data were found on this page.</p>';
    const kind = (k) => (k.startsWith('Special') ? 'special' : SENSITIVE.includes(k) ? 'sensitive' : '');
    const kinds = new Set(keys.map(kind));
    const key = [kinds.has('sensitive') && '<span class="k-sensitive">Sensitive</span>', kinds.has('special') && '<span class="k-special">Special personal data (s.37)</span>'].filter(Boolean).join('');
    return '<ul class="chips">' + keys.map((k) => `<li class="chip ${kind(k)}">${esc(k)}${inv[k] > 1 ? `<span class="chip-n">×${inv[k]}</span>` : ''}</li>`).join('') + '</ul>' +
      (key ? `<p class="chip-key">${key}</p>` : '');
  }

  function headHtml(d, opts) {
    const score = Math.max(0, Math.min(100, Number(d.score) || 0));
    const when = date(d.createdAt);
    const c = d.counts;
    return `<header class="report-head band-${esc(d.band.key)}">
      <div class="dial" role="img" aria-label="Score: ${score} out of 100">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="52"/><circle class="value" cx="60" cy="60" r="52" stroke-dasharray="${(RING * score / 100).toFixed(1)} ${RING.toFixed(1)}"/></svg>
        <div class="dial-label" aria-hidden="true"><span class="dial-num">${score}</span><span class="dial-of">out of 100</span></div>
      </div>
      <div>
        <p class="report-kicker">Screening result${d.demo ? ' · demo site' : ''}</p>
        <h2 class="band-label">${esc(d.band.label)}</h2>
        <p class="site-title">${esc(d.title)}</p>
        <p class="site-meta">${esc(d.finalUrl)}${when ? ` · Scanned ${esc(when)}` : ''}</p>
      </div>
      ${opts.actions ? `<div class="report-actions no-print">${opts.actions}</div>` : ''}
      <div class="tally">
        <div class="tally-bar" aria-hidden="true"><span class="t-fail" data-n="${c.fail}"></span><span class="t-warn" data-n="${c.warn}"></span><span class="t-pass" data-n="${c.pass}"></span></div>
        <p class="tally-legend"><span><b>${c.fail}</b> to fix now</span><span><b>${c.warn}</b> to check</span><span><b>${c.pass}</b> passed</span><span class="total">${c.fail + c.warn + c.pass} checks in total</span></p>
      </div>
    </header>`;
  }

  function render(el, d, opts = {}) {
    const findings = [...d.findings].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    const n = { all: findings.length, fail: d.counts.fail, warn: d.counts.warn, pass: d.counts.pass };
    const filters = [['all', 'All'], ['fail', 'Fix now'], ['warn', 'Check'], ['pass', 'Pass']];
    el.innerHTML = `<div class="report">
      ${headHtml(d, opts)}
      <p class="notice">${ICON.info}<span><b>Automated first-pass screening, not legal advice.</b> Accolm Check reads only what any visitor can see on the page and, where linked, its privacy page. It cannot see how data is stored, who can access it, or whether the business is on the Data Protection Register. A good score does not mean the site complies with Act 843; a low score shows where to look first.</span></p>
      <div class="report-body">
        <aside class="report-side">
          <section class="panel">
            <h3>What this page asks people for</h3>
            ${inventoryHtml(d.inventory)}
            ${d.trackers && d.trackers.length ? `<p class="trackers">Third-party trackers seen: <b>${d.trackers.map(esc).join(', ')}</b></p>` : ''}
          </section>
          <section class="panel">
            <h3>The eight principles of section 17</h3>
            ${principlesHtml(d.principles)}
          </section>
        </aside>
        <section aria-labelledby="findings-title">
          <div class="findings-head">
            <div><h3 id="findings-title">Findings and fixes</h3><p>Most urgent first. Each check is tied to a section of Act 843.</p></div>
            <div class="segmented no-print" role="group" aria-label="Filter findings">${filters.map(([k, label]) =>
              `<button type="button" data-filter="${k}" aria-pressed="${k === 'all'}">${label}<span class="n">${n[k]}</span></button>`).join('')}</div>
          </div>
          <div class="findings">${findings.map(findingHtml).join('')}</div>
          <p class="findings-empty" hidden></p>
        </section>
      </div>
    </div>`;
    el.querySelectorAll('.tally-bar span').forEach((s) => { const v = Number(s.dataset.n); if (v) s.style.flexGrow = v; else s.remove(); });
    el.querySelectorAll('.finding').forEach((f, i) => f.style.setProperty('--i', Math.min(i, 12)));
    const empty = el.querySelector('.findings-empty');
    el.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.filter;
      el.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      el.querySelectorAll('.finding').forEach((f) => { f.hidden = k !== 'all' && f.dataset.status !== k; });
      empty.hidden = n[k] > 0;
      empty.textContent = EMPTY[k] || '';
    }));
  }

  window.A843 = { render, esc, date, ledgerHtml, principlesHtml };
})();
