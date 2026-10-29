(function () {
  'use strict';
  const list = document.getElementById('rows');
  const sub = document.getElementById('history-sub');
  const { esc, date } = A843;
  const BAND = { good: ['Strong start', 'pass'], mid: ['Needs work', 'warn'], low: ['At risk', 'fail'] };
  const ARROW = '<svg class="arrow" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function empty(title, text, icon) {
    document.querySelector('.history-cols').hidden = true;
    list.outerHTML = `<div class="empty">
      <span class="empty-mark">${icon}</span>
      <h2>${title}</h2><p>${text}</p>
      <div class="page-actions"><a class="button" href="/">Scan a site</a></div>
    </div>`;
  }

  fetch('/api/scans?limit=100').then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((rows) => {
    if (!rows.length) {
      return empty('No scans yet', 'Run your first scan, or try one of the offline demo sites on the scan page. Every result will be listed here.',
        '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="3" width="13" height="14" rx="2"/><path d="M7 7.5h6M7 10.5h6M7 13.5h3.5" stroke-linecap="round"/></svg>');
    }
    sub.textContent = `${rows.length} ${rows.length === 1 ? 'scan' : 'scans'}, newest first. Open any row for its full report.`;
    list.innerHTML = rows.map((s) => {
      const [label, st] = BAND[s.band] || [s.band, 'na'];
      return `<li><a class="row band-${esc(s.band)}" href="/report?id=${encodeURIComponent(s.id)}">
        <span class="score-chip" aria-label="Score ${Number(s.score)} out of 100">${Number(s.score)}</span>
        <span class="row-main"><span class="row-title">${esc(s.title)}${s.demo ? '<span class="tag">Demo</span>' : ''}</span><span class="row-url">${esc(s.finalUrl)}</span></span>
        <span class="row-meta"><span><span class="status ${st}">${esc(label)}</span></span><span class="row-date">${esc(date(s.createdAt))}</span></span>
        ${ARROW}</a></li>`;
    }).join('');
    list.removeAttribute('aria-busy');
  }).catch(() => {
    empty('History could not be loaded', 'Accolm Check could not reach its database. Refresh the page to try again.',
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 3.5 17.5 16.5h-15Z" stroke-linejoin="round"/><path d="M10 8.5v3.5M10 14.2v.1" stroke-linecap="round"/></svg>');
  });
})();
