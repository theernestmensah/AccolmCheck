(function () {
  'use strict';
  const { esc } = A843;
  const form = document.getElementById('scan-form');
  const input = document.getElementById('url');
  const btn = document.getElementById('scan-btn');
  const out = document.getElementById('out');
  const said = document.getElementById('scan-status');
  const demos = document.querySelectorAll('[data-demo]');
  const DEMO_NAME = { 'non-compliant': 'adwoas-kitchen', compliant: 'sika-tailoring' };
  let busy = false;

  // Quick browser-side check for a friendlier message. The server checks again, properly.
  function looksLikeUrl(v) { return /^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(v.trim()); }

  function fail(command, msg) {
    out.innerHTML = `<ol class="log"><li class="cmdline"><span class="ps">$</span> ${esc(command)}</li><li class="err"><span class="bad">✗ error:</span> ${esc(msg)}</li></ol>`;
    said.textContent = msg;
  }

  function setBusy(on) {
    busy = on;
    btn.disabled = on;
    btn.textContent = on ? 'running…' : 'run ↵';
    demos.forEach((b) => { b.disabled = on; });
  }

  const actions = (id, again) => `<a class="key solid" href="/report?id=${encodeURIComponent(id)}">open shareable report</a>` +
    (again ? ' <button type="button" class="key" id="again">scan another site</button>' : '');

  async function run(payload, command) {
    if (busy) return;
    setBusy(true);
    input.setAttribute('aria-invalid', 'false');
    out.innerHTML = `<ol class="log"><li class="cmdline"><span class="ps">$</span> ${esc(command)}</li>
      <li><span class="spin"></span>${payload.demo ? 'reading the offline demo site' : 'reading the page the way a visitor would'} <span class="dim">(up to 8 s)</span></li></ol>`;
    const stop = A843.spinner(out.querySelector('.spin'));
    said.textContent = 'Scanning…';
    const started = performance.now();
    try {
      const res = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The scan failed: the server answered ${res.status}${res.statusText ? ' ' + res.statusText : ''}. Please try again.`);
      stop();
      const d = { ...data, demo: !!payload.demo };
      A843.render(out, d, { log: { command, demo: d.demo, ms: performance.now() - started }, reportId: data.id, actions: actions(data.id, true) });
      said.textContent = `Scan finished. Score ${d.score} out of 100: ${d.band.label}.`;
      document.getElementById('again').addEventListener('click', () => {
        input.value = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        input.focus({ preventScroll: true });
      });
      await A843.reveal(out);
    } catch (e) {
      stop();
      fail(command, e instanceof TypeError ? 'Could not reach the Accolm Check server. Check your connection and try again.' : e.message);
    } finally { setBusy(false); }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!looksLikeUrl(v)) {
      input.setAttribute('aria-invalid', 'true');
      fail(`scan ${v}`, 'Enter a web address, for example mybusiness.com.gh');
      input.focus();
      return;
    }
    run({ url: v }, `scan ${v}`);
  });
  demos.forEach((b) => b.addEventListener('click', () => run({ demo: b.dataset.demo }, `scan --demo ${DEMO_NAME[b.dataset.demo]}`)));

  // The eight principles in the manual page
  fetch('/api/principles').then((r) => (r.ok ? r.json() : Promise.reject(new Error()))).then((p) => {
    document.getElementById('principles').innerHTML = A843.ledgerHtml(Object.values(p));
  }).catch(() => {
    document.getElementById('principles').innerHTML = '<p class="dim"># could not load the principles: the server did not answer.</p>';
  });

  // Open a saved scan inline: /?scan=<report id>
  const id = new URLSearchParams(location.search).get('scan');
  if (id) {
    fetch('/api/scans/' + encodeURIComponent(id)).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data) return;
      A843.render(out, { ...data.result, demo: data.demo, createdAt: data.createdAt }, { log: { command: `report ${data.id}`, demo: data.demo }, reportId: data.id, actions: actions(data.id, false) });
      if (location.hash !== '#top') out.scrollIntoView();
    });
  }
})();
