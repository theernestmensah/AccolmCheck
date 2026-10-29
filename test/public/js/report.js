(function () {
  'use strict';
  const id = new URLSearchParams(location.search).get('id') || '';
  const out = document.getElementById('report');
  const copy = document.getElementById('copy-btn');
  document.getElementById('print-btn').addEventListener('click', () => window.print());
  copy.addEventListener('click', async () => {
    const label = copy.querySelector('span');
    try { await navigator.clipboard.writeText(location.href); label.textContent = 'Link copied'; } catch { label.textContent = location.href; }
    setTimeout(() => { label.textContent = 'Copy share link'; }, 2400);
  });
  fetch('/api/scans/' + encodeURIComponent(id)).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Report not found.');
    const d = { ...data.result, createdAt: data.createdAt, demo: data.demo, id: data.id };
    document.title = `Accolm Check report: ${d.title}`;
    document.getElementById('report-id').textContent = 'Report ' + data.id;
    A843.render(out, d);
  }).catch((e) => {
    document.querySelector('.page-actions').hidden = true;
    out.innerHTML = `<div class="empty">
      <span class="empty-mark"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="m13 13 4 4" stroke-linecap="round"/></svg></span>
      <h2>We could not open this report</h2>
      <p>${A843.esc(e.message)} The link may be incomplete, or the scan may have been removed.</p>
      <div class="page-actions"><a class="button" href="/history">See all scans</a><a class="button secondary" href="/">Run a new scan</a></div>
    </div>`;
  }).finally(() => out.removeAttribute('aria-busy'));
})();
