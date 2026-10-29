(function () {
  'use strict';
  const form = document.getElementById('scan-form');
  const field = document.getElementById('scan-field');
  const input = document.getElementById('url');
  const btn = document.getElementById('scan-btn');
  const err = document.getElementById('form-error');
  const loading = document.getElementById('loading');
  const out = document.getElementById('result');
  const section = document.getElementById('results');
  const demos = document.querySelectorAll('[data-demo]');

  // Quick browser-side check for a friendlier message. The server checks again, properly.
  function looksLikeUrl(v) { return /^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(v.trim()); }

  function showError(msg) {
    err.textContent = msg;
    field.classList.toggle('has-error', !!msg);
    input.setAttribute('aria-invalid', String(!!msg));
  }

  function busy(on, label) {
    btn.disabled = on; btn.classList.toggle('is-loading', on);
    btn.querySelector('.label').textContent = on ? 'Checking…' : 'Check this site';
    demos.forEach((b) => { b.disabled = on; });
    loading.classList.toggle('show', on);
    loading.querySelector('span').textContent = on ? label : '';
  }

  const actions = (id, again) => `<a class="button" href="/report?id=${encodeURIComponent(id)}">Open shareable report</a>` +
    (again ? '<button type="button" class="button quiet" id="again">Scan another site</button>' : '');

  async function run(payload, label) {
    showError(''); busy(true, label);
    try {
      const res = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The scan failed. Please try again.');
      section.hidden = false;
      A843.render(out, data, { actions: actions(data.id, true) });
      document.getElementById('again').addEventListener('click', () => { input.value = ''; window.scrollTo({ top: 0, behavior: 'smooth' }); input.focus({ preventScroll: true }); });
      section.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      showError(e instanceof TypeError ? 'Could not reach Accolm Check. Check your connection and try again.' : e.message);
    } finally { busy(false); }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!looksLikeUrl(input.value)) { showError('Enter a website address, for example mybusiness.com.gh'); input.focus(); return; }
    run({ url: input.value.trim() }, 'Reading the page the way a visitor would…');
  });
  input.addEventListener('input', () => { if (err.textContent) showError(''); });
  demos.forEach((b) => b.addEventListener('click', () => run({ demo: b.dataset.demo }, 'Scanning the offline demo site…')));

  // The eight principles in the "yardstick" section
  fetch('/api/principles').then((r) => r.json()).then((p) => {
    document.getElementById('principles').innerHTML = A843.ledgerHtml(Object.values(p));
  });

  // Open a saved scan inline: /?scan=<report id>
  const id = new URLSearchParams(location.search).get('scan');
  if (id) {
    fetch('/api/scans/' + encodeURIComponent(id)).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data) return;
      section.hidden = false;
      A843.render(out, { ...data.result, demo: data.demo, createdAt: data.createdAt }, { actions: actions(data.id, false) });
      if (location.hash !== '#top') section.scrollIntoView();
    });
  }
})();
