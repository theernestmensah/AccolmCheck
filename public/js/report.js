(function () {
  'use strict';
  const id = new URLSearchParams(location.search).get('id') || '';
  const out = document.getElementById('report');
  const copy = document.getElementById('copy-btn');
  document.getElementById('print-btn').addEventListener('click', () => window.print());
  copy.addEventListener('click', async () => {
    const label = copy.querySelector('span');
    try { await navigator.clipboard.writeText(location.href); label.textContent = 'Link copied'; } catch { label.textContent = location.href; }
    setTimeout(() => { label.textContent = 'Copy link'; }, 2400);
  });
  fetch('/api/scans/' + encodeURIComponent(id)).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `The server answered ${r.status}.`);
    const d = { ...data.result, createdAt: data.createdAt, demo: data.demo };
    document.title = `Accolm Check report: ${d.title}`;
    document.getElementById('report-id').textContent = data.id;
    A843.render(out, d, { log: { demo: data.demo }, reportId: data.id });
  }).catch((e) => {
    document.querySelector('.page-head .acts').hidden = true;
    out.innerHTML = `<section class="panel notice scan-error"><p class="label">Report unavailable</p><p class="h">${A843.esc(e.message)}</p>
      <p>The link may be incomplete, or the scan may have been removed.</p>
      <div class="acts"><a class="cta" href="/history">Open archive</a><a class="ghost" href="/">New scan</a></div></section>`;
  }).finally(() => out.removeAttribute('aria-busy'));
})();
