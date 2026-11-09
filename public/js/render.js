// Shared rendering for scan results (home page and report page), drawn as a HUD dashboard.
// Everything that came from a scanned website is escaped before it is shown,
// because a hostile page could put HTML or script in its title or field names.
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SEV = { fail: 'FIX NOW', warn: 'CHECK', pass: 'PASS', na: 'N/A' };
  const SENSITIVE = ['Ghana Card / national ID', 'Date of birth', 'Payment card', 'Mobile money number'];
  const ORDER = { fail: 0, warn: 1, pass: 2 };
  const RISK = { low: ['HIGH', 3], mid: ['ELEVATED', 2], good: ['LOW', 1] };
  const AXIS = { accountability: 'ACCOUNTABILITY', lawfulness: 'LAWFULNESS', purpose: 'PURPOSE', compatibility: 'FURTHER USE', quality: 'QUALITY', openness: 'OPENNESS', security: 'SECURITY', participation: 'PARTICIPATION' };
  const REACH = { pass: 1, warn: 0.6, fail: 0.25, na: 0.08 };
  const EMPTY = { fail: 'nothing needs fixing right away.', warn: 'nothing is left to check by hand.', pass: 'no checks passed on this page.' };

  // Scan dates are stored in UTC without a zone ("2026-10-28 20:22:05").
  function date(s) {
    return s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  }
  const chip = (s) => `<span class="chip ${esc(s)}">${SEV[s] || ''}</span>`;
  const ruleId = (id) => 'R-' + String(id).toUpperCase().replace(/_/g, '-');
  const head = (n, title, meta = '') => `<header class="ph"><span class="pid">${n}</span><h2>${title}</h2>${meta ? `<span class="meta">${meta}</span>` : ''}</header>`;

  // ---------- score gauge: 54 segments over 270 degrees ----------
  function gaugeSvg(score) {
    const N = 54; const lit = Math.round((score / 100) * N); const out = [];
    for (let i = 0; i < N; i++) {
      const a = (135 + (270 * i) / (N - 1)) * (Math.PI / 180);
      const r1 = i % 9 === 0 ? 78 : 82; const r2 = 96;
      out.push(`<line class="tick${i < lit ? ' on' : ''}" x1="${(110 + r1 * Math.cos(a)).toFixed(1)}" y1="${(110 + r1 * Math.sin(a)).toFixed(1)}" x2="${(110 + r2 * Math.cos(a)).toFixed(1)}" y2="${(110 + r2 * Math.sin(a)).toFixed(1)}"/>`);
    }
    return `<svg viewBox="0 0 220 220" aria-hidden="true"><circle class="ring" cx="110" cy="110" r="70"/>${out.join('')}</svg>`;
  }

  // ---------- principle radar: one axis per principle of s.17 ----------
  function radarSvg(principles) {
    const R = 112; const n = principles.length;
    const pt = (k, r) => { const a = (-90 + (360 / n) * k) * (Math.PI / 180); return [r * Math.cos(a), r * Math.sin(a)]; };
    const ring = (f) => principles.map((_, k) => pt(k, R * f).map((v) => v.toFixed(1)).join(',')).join(' ');
    const area = principles.map((p, k) => pt(k, R * (REACH[p.status] || 0.08)).map((v) => v.toFixed(1)).join(',')).join(' ');
    const axes = principles.map((_, k) => { const [x, y] = pt(k, R); return `<line class="axis" x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');
    const verts = principles.map((p, k) => { const [x, y] = pt(k, R * (REACH[p.status] || 0.08)); return `<circle class="v ${esc(p.status)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/>`; }).join('');
    const labels = principles.map((p, k) => {
      const [x, y] = pt(k, R + 16);
      const anchor = Math.abs(x) < 8 ? 'middle' : x > 0 ? 'start' : 'end';
      const dy = y < -R ? -2 : y > R ? 10 : 4;
      return `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}"><tspan class="l">(${esc(p.letter)})</tspan> ${esc(AXIS[p.key] || p.name.toUpperCase())}</text>`;
    }).join('');
    return `<svg class="radar" viewBox="-200 -150 400 300" role="img" aria-label="Radar of the eight principles: ${principles.map((p) => `${p.name} ${SEV[p.status]}`).join(', ')}">
      ${[0.25, 0.5, 0.75, 1].map((f) => `<polygon class="rings" points="${ring(f)}"/>`).join('')}${axes}
      <polygon class="area" points="${area}"/>${verts}${labels}</svg>`;
  }

  // ---------- what the scanner did, line by line, built only from the saved result ----------
  function logLines(d, meta = {}) {
    const lines = [];
    const line = (sym, key, val) => lines.push(`<li class="ln"><span class="sym">${sym}</span><span class="k">${key}</span><span>${val}</span></li>`);
    const find = (id) => d.findings.find((f) => f.id === id);
    const code = (c) => `<span class="${c < 400 ? 'ok' : 'bad'}">${Number(c) || ''}</span>`;
    if (meta.command) lines.push(`<li class="cmd"><span class="ps">$</span> ${esc(meta.command)}</li>`);
    if (meta.demo) line('→', 'read', `${esc(d.finalUrl)} <span class="dim">(offline simulation)</span>`);
    else if (d.url && d.url !== d.finalUrl) { line('→', 'get', esc(d.url)); line('↪', 'redirect', `${esc(d.finalUrl)} ${code(d.httpStatus)}`); }
    else line('→', 'get', `${esc(d.finalUrl)} ${code(d.httpStatus)}`);
    const forms = d.forms || [];
    const personal = forms.filter((f) => f.personal && f.personal.length);
    line('→', 'forms', `${forms.length} found · ${personal.length} collect${personal.length === 1 ? 's' : ''} personal data`);
    for (const f of personal) line('', '', `#${esc(f.id)} ${esc(String(f.method).toUpperCase())} → ${esc(f.action)} · ${f.personal.length} personal field${f.personal.length === 1 ? '' : 's'}`);
    const pn = find('privacy_notice');
    if (pn) line('→', 'privacy', { pass: '<span class="ok">notice linked</span>', warn: '<span class="warn">notice found, not beside every form</span>', fail: '<span class="bad">no notice found</span>' }[pn.status] || '');
    line('→', 'trackers', d.trackers && d.trackers.length ? `<span class="warn">${d.trackers.map(esc).join(', ')}</span>` : '<span class="ok">none seen</span>');
    const h = find('headers');
    if (h) { const n = (h.evidence.match(/: present/g) || []).length; line('→', 'headers', `<span class="${n === 4 ? 'ok' : n ? 'warn' : 'bad'}">${n} of 4</span> security headers set`); }
    const c = d.counts;
    const t = meta.ms ? ` <span class="dim">· ${meta.ms < 1000 ? `${Math.round(meta.ms)} ms` : `${(meta.ms / 1000).toFixed(1)} s`}</span>` : '';
    lines.push(`<li class="done"><span class="ok">✓</span> ${d.findings.length} checks · <span class="fix">${c.fail} fix</span> · <span class="check">${c.warn} check</span> · <span class="pass">${c.pass} pass</span>${t}</li>`);
    return lines;
  }

  function exposureHtml(d) {
    const inv = d.inventory || {};
    const keys = Object.keys(inv);
    const kind = (k) => (k.startsWith('Special') ? 'special' : SENSITIVE.includes(k) ? 'sensitive' : '');
    const tag = { special: 'SPECIAL · s.37', sensitive: 'SENSITIVE', '': '' };
    const tokens = keys.length
      ? '<ul class="tokens">' + keys.map((k) => `<li class="tok ${kind(k)}">${esc(k)}${inv[k] > 1 ? `<span class="x">×${inv[k]}</span>` : ''}${kind(k) ? `<span class="tg">${tag[kind(k)]}</span>` : ''}</li>`).join('') + '</ul>'
      : '<p class="empty-note">No forms collecting personal data were found on this page.</p>';
    const trk = d.trackers && d.trackers.length
      ? `<div class="trk"><p class="label">Third-party trackers detected · ${d.trackers.length}</p><ul>${d.trackers.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`
      : '<div class="trk"><p class="label">Third-party trackers detected · 0</p></div>';
    return tokens + trk;
  }

  function findingHtml(f) {
    return `<details class="fnd ${esc(f.status)}" data-status="${esc(f.status)}">
      <summary><span class="sev">${SEV[f.status]}</span><span class="rid">${esc(ruleId(f.id))}</span><span class="ft">${esc(f.title)}</span><span class="fs">${esc((f.sections[0] || '').split(' ')[0])}${f.sections.length > 1 ? '+' : ''}</span><span class="chev"></span></summary>
      <div class="fbody">
        <p class="explain">${esc(f.explain)}</p>
        <dl>
          <dt>EVIDENCE</dt><dd class="ev">${esc(f.evidence)}</dd>
          ${f.status !== 'pass' ? `<dt>REMEDIATION</dt><dd>${esc(f.fix)}</dd>` : ''}
          <dt>PRINCIPLE</dt><dd>(${esc(f.principleLetter)}) ${esc(f.principleName)} · ${f.sections.map(esc).join(' · ')}</dd>
        </dl>
      </div>
    </details>`;
  }

  function countUp(el, to) {
    if (!el) return;
    if (calm()) { el.textContent = to; return; }
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / 1100);
      el.textContent = Math.round(to * (1 - (1 - p) ** 3));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  // opts.log: { command, demo, ms } prints the scan log; opts.reportId; opts.actions (HTML)
  function render(el, d, opts = {}) {
    const findings = [...d.findings].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    const c = d.counts;
    const n = { all: findings.length, fail: c.fail, warn: c.warn, pass: c.pass };
    const score = Math.max(0, Math.min(100, Number(d.score) || 0));
    const [risk, bars] = RISK[d.band.key] || ['—', 0];
    const filters = [['all', 'All'], ['fail', 'Fix now'], ['warn', 'Check'], ['pass', 'Pass']];
    el.innerHTML = `<div class="dash band-${esc(d.band.key)}">
      <section class="panel span-4" aria-labelledby="p1">
        ${head('01', '<span id="p1">Threat score</span>')}
        <div class="gauge">${gaugeSvg(score)}
          <div class="gauge-read" role="img" aria-label="Score ${score} out of 100, ${esc(d.band.label)}"><span class="gauge-num" aria-hidden="true">${score}</span><span class="gauge-of" aria-hidden="true">/ 100</span><span class="gauge-band" aria-hidden="true">${esc(d.band.label.toUpperCase())}</span></div>
        </div>
        <p class="risk">RISK LEVEL <b>${risk}</b><span class="risk-bars" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= bars ? 'on' : ''}"></i>`).join('')}</span></p>
      </section>
      <section class="panel span-8" aria-labelledby="p2">
        ${head('02', '<span id="p2">Target intel</span>', opts.reportId ? `Report ${esc(opts.reportId)}` : '')}
        <dl class="intel-kv">
          <dt>Target</dt><dd class="url">${esc(d.finalUrl)}</dd>
          <dt>Page title</dt><dd>${esc(d.title)}</dd>
          <dt>Scanned</dt><dd>${esc(date(d.createdAt) || 'just now')}${d.demo ? ' <span class="dim">· offline simulation</span>' : ''}</dd>
          <dt>Checks run</dt><dd>${n.all}</dd>
        </dl>
        <div class="counters">
          <div class="counter fail"><b data-count="${c.fail}">${c.fail}</b><span>FIX NOW</span></div>
          <div class="counter warn"><b data-count="${c.warn}">${c.warn}</b><span>CHECK</span></div>
          <div class="counter pass"><b data-count="${c.pass}">${c.pass}</b><span>PASS</span></div>
        </div>
        ${opts.actions ? `<div class="acts">${opts.actions}</div>` : ''}
      </section>
      <section class="panel span-5 radar-panel" aria-labelledby="p3">${head('03', '<span id="p3">Principle radar</span>', 'Act 843 · s.17')}${radarSvg(d.principles)}
        <p class="legend" aria-hidden="true">${[['pass', 'PASS', '--pass'], ['warn', 'CHECK', '--check'], ['fail', 'FIX NOW', '--fix']].map(([k, label, v]) =>
          `<span><i data-c="${v}"></i>${label} ${d.principles.filter((p) => p.status === k).length}</span>`).join('')}</p></section>
      <section class="panel span-7" aria-labelledby="p4">
        ${head('04', '<span id="p4">Principle matrix</span>', `${d.principles.filter((p) => p.status === 'pass').length} / ${d.principles.length} clear`)}
        <ol class="matrix">${d.principles.map((p) => `<li class="${esc(p.status)}"><span class="l">s.17(${esc(p.letter)})</span><span><span class="n">${esc(p.name)}</span><span class="p">${esc(p.plain)}</span></span>${chip(p.status)}</li>`).join('')}</ol>
      </section>
      <section class="panel span-6" aria-labelledby="p5">${head('05', '<span id="p5">Data exposure</span>', `${Object.keys(d.inventory || {}).length} data types`)}${exposureHtml(d)}</section>
      <section class="panel span-6" aria-labelledby="p6">${head('06', '<span id="p6">Scan log</span>')}<ol class="log">${logLines(d, opts.log || {}).join('')}</ol></section>
      <section class="panel span-12 findings-panel" aria-labelledby="p7">
        ${head('07', `<span id="p7">Findings</span>`, `${n.all} rules evaluated`)}
        <div class="fhead">
          <div class="filters" role="group" aria-label="Filter findings">${filters.map(([k, label]) => `<button type="button" data-filter="${k}" aria-pressed="${k === 'all'}">${label}<span class="n">${n[k]}</span></button>`).join('')}</div>
          <button type="button" class="expand" aria-expanded="false">Expand all</button>
        </div>
        ${findings.map(findingHtml).join('')}
        <p class="none" hidden></p>
      </section>
      <p class="advisory span-12"><span aria-hidden="true">⚠</span><span><b>ADVISORY</b>Automated first-pass screening, not legal advice. Accolm Check reads only what any visitor can see on the page and, where linked, its privacy page. It cannot see how data is stored, who can access it, or whether the business is on the Data Protection Register. A good score does not mean the site complies with Act 843; a low score shows where to look first.</span></p>
    </div>`;

    el.querySelectorAll('.legend i').forEach((i) => i.style.setProperty('--lc', `var(${i.dataset.c})`));

    // entrance, gauge segments and counters
    const panels = el.querySelectorAll('.dash > *');
    if (!calm()) panels.forEach((p, i) => { p.classList.add('enter'); p.style.setProperty('--i', i); });
    countUp(el.querySelector('.gauge-num'), score);
    el.querySelectorAll('[data-count]').forEach((b) => countUp(b, Number(b.dataset.count)));
    if (!calm()) {
      const ticks = [...el.querySelectorAll('.gauge .tick.on')];
      ticks.forEach((t) => t.classList.remove('on'));
      ticks.forEach((t, i) => setTimeout(() => t.classList.add('on'), 120 + i * 20));
    }

    // filters and expand-all
    const none = el.querySelector('.none');
    const rows = [...el.querySelectorAll('.fnd')];
    el.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.filter;
      el.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      rows.forEach((f) => { f.hidden = k !== 'all' && f.dataset.status !== k; });
      none.hidden = n[k] > 0;
      none.textContent = '// ' + (EMPTY[k] || '');
    }));
    const expand = el.querySelector('.expand');
    expand.addEventListener('click', () => {
      const open = expand.getAttribute('aria-expanded') !== 'true';
      rows.forEach((f) => { f.open = open; });
      expand.setAttribute('aria-expanded', String(open));
      expand.textContent = open ? 'Collapse all' : 'Expand all';
    });
  }

  // Print every finding, then put the page back as it was.
  let openedForPrint = [];
  window.addEventListener('beforeprint', () => {
    openedForPrint = [...document.querySelectorAll('details.fnd:not([open])')];
    openedForPrint.forEach((x) => { x.open = true; });
  });
  window.addEventListener('afterprint', () => { openedForPrint.forEach((x) => { x.open = false; }); openedForPrint = []; });

  window.A843 = { render, esc, date };
})();
