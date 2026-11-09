(function () {
  'use strict';
  const { esc, date } = A843;
  const out = document.getElementById('rows');
  const sub = document.getElementById('history-sub');
  const BAND = { good: 'STRONG START', mid: 'NEEDS WORK', low: 'AT RISK' };
  const stop = A843.spinner(document.getElementById('loading-spin'));

  fetch('/api/scans?limit=100').then((r) => (r.ok ? r.json() : Promise.reject(new Error()))).then((rows) => {
    if (!rows.length) {
      out.innerHTML = '<ol class="log"><li class="dim"># no scans yet. Run one from <a href="/">scan</a>, or try one of the demo sites there.</li></ol>';
      return;
    }
    sub.textContent = `${rows.length} ${rows.length === 1 ? 'scan' : 'scans'}, newest first · open any row for its full report`;
    out.innerHTML = `<table class="ls">
      <thead><tr><th class="num">score</th><th>result</th><th>scanned</th><th>site</th></tr></thead>
      <tbody>${rows.map((s) => `<tr class="band-${esc(s.band)}">
        <td class="num">${Number(s.score)}</td>
        <td class="res">${esc(BAND[s.band] || s.band)}</td>
        <td class="when">${esc(date(s.createdAt))}</td>
        <td class="site"><a href="/report?id=${encodeURIComponent(s.id)}">${esc(s.host || s.finalUrl)}</a>${s.demo ? ' <span class="dim">[demo]</span>' : ''}<span class="t">${esc(s.title)}</span></td>
      </tr>`).join('')}</tbody></table>`;
    // The whole row opens the report; the link inside stays the keyboard route.
    out.querySelector('tbody').addEventListener('click', (e) => {
      const link = e.target.closest('tr') && e.target.closest('tr').querySelector('a');
      if (link && !e.target.closest('a')) link.click();
    });
  }).catch(() => {
    out.innerHTML = '<ol class="log"><li><span class="bad">✗ error:</span> history could not be loaded: the server did not answer. Refresh to try again.</li></ol>';
  }).finally(() => { stop(); out.removeAttribute('aria-busy'); });
})();
