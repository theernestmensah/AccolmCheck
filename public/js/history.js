(function () {
  'use strict';
  const { esc, date } = A843;
  const out = document.getElementById('rows');
  const BAND = { good: 'STRONG START', mid: 'NEEDS WORK', low: 'AT RISK' };

  fetch('/api/scans?limit=100').then((r) => (r.ok ? r.json() : Promise.reject(new Error()))).then((rows) => {
    if (!rows.length) {
      out.innerHTML = '<div class="notice"><p class="h">No targets scanned yet</p><p>Run the first scan, or try one of the simulations on the scan page. Every result will be logged here.</p><div class="acts"><a class="cta" href="/">New scan ▸</a></div></div>';
      return;
    }
    const avg = Math.round(rows.reduce((s, r) => s + Number(r.score), 0) / rows.length);
    document.getElementById('st-total').textContent = rows.length;
    document.getElementById('st-avg').textContent = avg;
    document.getElementById('st-risk').textContent = rows.filter((r) => r.band === 'low').length;
    document.getElementById('st-last').innerHTML = `<small>${esc(date(rows[0].createdAt))}</small>`;
    document.getElementById('stats').hidden = false;
    out.innerHTML = `<table class="archive">
      <thead><tr><th>Score</th><th>Target</th><th>Result</th><th>Scanned</th></tr></thead>
      <tbody>${rows.map((s) => `<tr class="band-${esc(s.band)}">
        <td class="sc"><b>${Number(s.score)}</b></td>
        <td><a class="host" href="/report?id=${encodeURIComponent(s.id)}">${esc(s.host || s.finalUrl)}</a>${s.demo ? '<span class="demo">SIM</span>' : ''}<span class="ttl">${esc(s.title)}</span></td>
        <td><span class="chip ${s.band === 'good' ? 'pass' : s.band === 'mid' ? 'warn' : 'fail'}">${esc(BAND[s.band] || s.band)}</span></td>
        <td class="when">${esc(date(s.createdAt))}</td>
      </tr>`).join('')}</tbody></table>`;
    // The whole row opens the report; the link inside stays the keyboard route.
    out.querySelector('tbody').addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (row && !e.target.closest('a')) row.querySelector('a').click();
    });
  }).catch(() => {
    out.innerHTML = '<div class="notice"><p class="h fix">Archive offline</p><p>The scan api did not answer. Refresh the page to try again.</p></div>';
  }).finally(() => out.removeAttribute('aria-busy'));
})();
