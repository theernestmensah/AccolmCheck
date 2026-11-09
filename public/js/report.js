(function () {
  'use strict';
  const id = new URLSearchParams(location.search).get('id') || '';
  const out = document.getElementById('report');
  const copy = document.getElementById('copy-btn');
  const stop = A843.spinner(document.getElementById('loading-spin'));
  document.getElementById('print-btn').addEventListener('click', () => window.print());
  copy.addEventListener('click', async () => {
    const label = copy.querySelector('span');
    try { await navigator.clipboard.writeText(location.href); label.textContent = 'link copied'; } catch { label.textContent = location.href; }
    setTimeout(() => { label.textContent = 'copy link'; }, 2400);
  });
  fetch('/api/scans/' + encodeURIComponent(id)).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `The server answered ${r.status}.`);
    const d = { ...data.result, createdAt: data.createdAt, demo: data.demo };
    document.title = `Accolm Check report: ${d.title}`;
    document.getElementById('report-id').textContent = data.id;
    A843.render(out, d, { log: { demo: data.demo }, reportId: data.id });
  }).catch((e) => {
    document.querySelector('.page-head .actions').hidden = true;
    out.innerHTML = `<ol class="log"><li><span class="bad">✗ error:</span> ${A843.esc(e.message)}</li>
      <li class="dim"># the link may be incomplete, or the scan may have been removed. Try <a href="/history">history</a> or <a href="/">scan a site</a>.</li></ol>`;
  }).finally(() => { stop(); out.removeAttribute('aria-busy'); });
})();
