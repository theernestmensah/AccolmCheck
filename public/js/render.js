// Shared rendering for scan results (home page and report page), drawn as console output.
// Everything that came from a scanned website is escaped before it is shown,
// because a hostile page could put HTML or script in its title or field names.
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TAG = { pass: 'PASS', warn: 'CHECK', fail: 'FIX', na: '—' };
  const SENSITIVE = ['Ghana Card / national ID', 'Date of birth', 'Payment card', 'Mobile money number'];
  const ORDER = { fail: 0, warn: 1, pass: 2 };
  const METER = 30; // cells in the score bar
  const EMPTY = { fail: 'nothing needs fixing right away.', warn: 'nothing is left to check by hand.', pass: 'no checks passed on this page.' };
  const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scan dates are stored in UTC without a zone ("2026-10-28 20:22:05").
  function date(s) {
    return s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  }
  const tag = (s) => `<span class="tag ${esc(s)}">[${TAG[s] || '—'}]</span>`;
  const shortSec = (sections) => (sections[0] || '').split(' ')[0] + (sections.length > 1 ? '+' : '');

  // Braille spinner for a line that is still running; returns a function that stops it.
  function spinner(el) {
    const frames = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
    let i = 0;
    el.textContent = frames[0];
    const t = setInterval(() => { el.textContent = frames[++i % frames.length]; }, 80);
    return () => clearInterval(t);
  }

  // The eight principles as a manual-page list, with no results attached (home page).
  function ledgerHtml(principles) {
    return '<dl class="opts">' + principles.map((p) => `<dt>(${esc(p.letter)}) ${esc(p.name)}</dt><dd>${esc(p.plain)}</dd>`).join('') + '</dl>';
  }

  // What the scanner did, line by line, built only from the saved result.
  function logLines(d, meta = {}) {
    const lines = [];
    const line = (sym, key, val) => lines.push(`<li class="ln"><span class="sym">${sym}</span><span class="k">${key}</span><span>${val}</span></li>`);
    const find = (id) => d.findings.find((f) => f.id === id);
    const status = (code) => `<span class="${code < 400 ? 'ok' : 'bad'}">${Number(code) || ''}</span>`;
    if (meta.command) lines.push(`<li class="cmdline"><span class="ps">$</span> ${esc(meta.command)}</li>`);
    if (meta.demo) line('→', 'read', `${esc(d.finalUrl)} <span class="dim">(offline demo copy)</span>`);
    else if (d.url && d.url !== d.finalUrl) { line('→', 'GET', esc(d.url)); line('↪', 'redirect', `${esc(d.finalUrl)} ${status(d.httpStatus)}`); }
    else line('→', 'GET', `${esc(d.finalUrl)} ${status(d.httpStatus)}`);
    const forms = d.forms || [];
    const personal = forms.filter((f) => f.personal && f.personal.length);
    line('→', 'forms', `${forms.length} found · ${personal.length} collect${personal.length === 1 ? 's' : ''} personal data`);
    for (const f of personal) {
      line('', '', `#${esc(f.id)} ${esc(String(f.method).toUpperCase())} → ${esc(f.action)} · ${f.personal.length} personal field${f.personal.length === 1 ? '' : 's'}`);
    }
    const pn = find('privacy_notice');
    if (pn) line('→', 'privacy', { pass: '<span class="ok">notice linked</span>', warn: '<span class="warn">notice found, not linked beside every form</span>', fail: '<span class="bad">no notice found</span>' }[pn.status] || '');
    line('→', 'trackers', d.trackers && d.trackers.length ? `<span class="warn">${d.trackers.map(esc).join(', ')}</span>` : '<span class="ok">none seen</span>');
    const h = find('headers');
    if (h) {
      const n = (h.evidence.match(/: present/g) || []).length;
      line('→', 'headers', `<span class="${n === 4 ? 'ok' : n ? 'warn' : 'bad'}">${n} of 4</span> security headers set`);
    }
    const c = d.counts;
    lines.push(`<li class="done"><span class="ok">✓</span> ${d.findings.length} checks run · <span class="fix">${c.fail} fix</span> · <span class="check">${c.warn} check</span> · <span class="pass">${c.pass} pass</span>${meta.ms ? ` <span class="dim">· ${meta.ms < 1000 ? `${Math.round(meta.ms)} ms` : `${(meta.ms / 1000).toFixed(1)} s`}</span>` : ''}</li>`);
    return lines;
  }

  function inventoryHtml(d) {
    const inv = d.inventory || {};
    const keys = Object.keys(inv);
    const trackers = d.trackers && d.trackers.length ? `<p class="legend">trackers: <span class="check">${d.trackers.map(esc).join(', ')}</span></p>` : '';
    if (!keys.length) return '<p class="dim">No forms collecting personal data were found on this page.</p>' + trackers;
    const kind = (k) => (k.startsWith('Special') ? 'special' : SENSITIVE.includes(k) ? 'sensitive' : '');
    const mark = { special: '**', sensitive: '*', '': '' };
    const kinds = new Set(keys.map(kind));
    const legend = [kinds.has('sensitive') && '<span class="check">*</span> sensitive', kinds.has('special') && '<span class="fix">**</span> special personal data (s.37)'].filter(Boolean).join('   ');
    return '<ul class="collects">' + keys.map((k) => `<li class="${kind(k)}">${esc(k.toLowerCase())}${mark[kind(k)]}${inv[k] > 1 ? `<span class="n"> ×${inv[k]}</span>` : ''}</li>`).join('') + '</ul>' +
      (legend ? `<p class="legend">${legend}</p>` : '') + trackers;
  }

  function principlesHtml(principles) {
    return '<ol class="leaders">' + principles.map((p) => `<li title="${esc(p.plain)}"><span class="l">(${esc(p.letter)})</span><span class="name">${esc(p.name)}</span><span class="dots"></span>${tag(p.status)}</li>`).join('') + '</ol>';
  }

  function findingHtml(f) {
    return `<details class="f ${esc(f.status)}" data-status="${esc(f.status)}"${f.status === 'pass' ? '' : ' open'}>
      <summary>${tag(f.status)}<span class="sec">${esc(shortSec(f.sections))}</span><span class="t">${esc(f.title)}</span></summary>
      <div class="fb">
        <p class="what">${esc(f.explain)}</p>
        <p class="kvrow"><span>found</span><span class="v">${esc(f.evidence)}</span></p>
        ${f.status !== 'pass' ? `<p class="kvrow"><span>fix</span><span class="v">${esc(f.fix)}</span></p>` : ''}
        <p class="ref">(${esc(f.principleLetter)}) ${esc(f.principleName)} · ${f.sections.map(esc).join(' · ')}</p>
      </div>
    </details>`;
  }

  // opts.log: { command, demo, ms } to print the scan log; opts.reportId; opts.actions (HTML)
  function render(el, d, opts = {}) {
    const findings = [...d.findings].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    const c = d.counts;
    const n = { all: findings.length, fail: c.fail, warn: c.warn, pass: c.pass };
    const score = Math.max(0, Math.min(100, Number(d.score) || 0));
    const filled = Math.round((score / 100) * METER);
    const when = date(d.createdAt) || 'just now';
    const filters = [['all', 'all'], ['fail', 'fix'], ['warn', 'check'], ['pass', 'pass']];
    el.innerHTML = `
      ${opts.log ? `<ol class="log" aria-label="Scan log">${logLines(d, opts.log).join('')}</ol>` : ''}
      <section class="sect summary band-${esc(d.band.key)}" aria-labelledby="sum-h">
        <h2 id="sum-h">Summary</h2>
        <div class="body">
          <p class="score"><span class="num">${score}</span><span class="of">/100</span><span class="verdict">${esc(d.band.label.toUpperCase())}</span></p>
          <p class="meter" aria-hidden="true"><span class="br">[</span>${'█'.repeat(filled)}<span class="empty">${'░'.repeat(METER - filled)}</span><span class="br">]</span></p>
          <dl class="kv">
            <dt>target</dt><dd>${esc(d.finalUrl)}</dd>
            <dt>title</dt><dd>${esc(d.title)}</dd>
            <dt>scanned</dt><dd>${esc(when)}${d.demo ? ' <span class="dim">· demo site</span>' : ''}</dd>
            <dt>checks</dt><dd><span class="fix">${c.fail} fix</span> · <span class="check">${c.warn} check</span> · <span class="pass">${c.pass} pass</span> <span class="dim">of ${n.all}</span></dd>
            ${opts.reportId ? `<dt>report</dt><dd>${esc(opts.reportId)}</dd>` : ''}
          </dl>
          ${opts.actions ? `<p class="actions">${opts.actions}</p>` : ''}
          <p class="comment">Automated first-pass screening, not legal advice. Accolm Check reads only what any visitor can see on the page and, where linked, its privacy page. It cannot see how data is stored, who can access it, or whether the business is on the Data Protection Register. A good score does not mean the site complies with Act 843; a low score shows where to look first.</p>
        </div>
      </section>
      <section class="sect" aria-labelledby="col-h"><h2 id="col-h">Collects</h2><div class="body">${inventoryHtml(d)}</div></section>
      <section class="sect" aria-labelledby="pri-h"><h2 id="pri-h">Principles <span class="dim">· s.17</span></h2><div class="body">${principlesHtml(d.principles)}</div></section>
      <section class="sect" aria-labelledby="fin-h">
        <h2 id="fin-h">Findings</h2>
        <div class="body">
          <div class="filters" role="group" aria-label="Filter findings">${filters.map(([k, label]) =>
            `<button type="button" data-filter="${k}" aria-pressed="${k === 'all'}">${label} ${n[k]}</button>`).join('')}</div>
          ${findings.map(findingHtml).join('')}
          <p class="none" hidden></p>
        </div>
      </section>`;
    const none = el.querySelector('.none');
    el.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.filter;
      el.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      el.querySelectorAll('.f').forEach((f) => { f.hidden = k !== 'all' && f.dataset.status !== k; });
      none.hidden = n[k] > 0;
      none.textContent = '# ' + (EMPTY[k] || '');
    }));
  }

  // Print the log and sections one after another, like output arriving in a terminal.
  function reveal(el) {
    const items = [...el.querySelectorAll('.log li:not(.cmdline), :scope > .sect')];
    if (calm()) return Promise.resolve();
    items.forEach((i) => i.classList.add('pending'));
    return new Promise((done) => {
      let k = 0;
      (function next() {
        if (k >= items.length) return done();
        const item = items[k++];
        item.classList.remove('pending');
        setTimeout(next, item.tagName === 'LI' ? 110 : 70);
      })();
    });
  }

  // Bottom status line: does the API answer?
  function status() {
    const el = document.getElementById('api-status');
    if (!el) return;
    fetch('/api/health').then((r) => (r.ok ? r.json() : Promise.reject(new Error()))).then((h) => {
      el.innerHTML = `api <span class="on">● online</span> · db ${esc(h.db)}`;
    }).catch(() => { el.innerHTML = 'api <span class="off">○ offline</span>'; });
  }

  // Print every finding, then put the page back as it was.
  let openedForPrint = [];
  window.addEventListener('beforeprint', () => {
    openedForPrint = [...document.querySelectorAll('details.f:not([open])')];
    openedForPrint.forEach((x) => { x.open = true; });
  });
  window.addEventListener('afterprint', () => { openedForPrint.forEach((x) => { x.open = false; }); openedForPrint = []; });

  status();
  window.A843 = { render, reveal, spinner, esc, date, ledgerHtml };
})();
