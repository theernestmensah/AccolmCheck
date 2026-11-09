(function () {
  'use strict';
  const { esc } = A843;
  const form = document.getElementById('scan-form');
  const input = document.getElementById('url');
  const btn = document.getElementById('scan-btn');
  const out = document.getElementById('out');
  const said = document.getElementById('scan-status');
  const sims = document.querySelectorAll('[data-demo]');
  const DEMO_HOST = { 'non-compliant': 'adwoas-kitchen.demo', compliant: 'sika-tailoring.demo' };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let busy = false;

  // Quick browser-side check for a friendlier message. The server checks again, properly.
  function looksLikeUrl(v) { return /^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(v.trim()); }
  const hostOf = (v) => v.replace(/^https?:\/\//i, '').split(/[/?#]/)[0];

  function setBusy(on) {
    busy = on;
    btn.disabled = on;
    btn.firstChild.textContent = on ? 'Scanning ' : 'Initiate scan ';
    sims.forEach((b) => { b.disabled = on; });
  }

  function panel(host, mode) {
    out.innerHTML = `<div class="shell out-inner"><section class="panel scanning" aria-label="Scan in progress">
      <div class="sweep" aria-hidden="true"><i></i></div>
      <div>
        <p class="label">Scanning target</p>
        <p class="scan-host">${esc(host)}</p>
        <p class="scan-meta">ELAPSED <span class="elapsed">0.0</span> s · TIMEOUT 8.0 s · ${mode}</p>
        <ol class="pipeline busy"><li>RESOLVE</li><li>FETCH</li><li>PARSE FORMS</li><li>RUN 14 CHECKS</li><li>SCORE</li></ol>
      </div>
    </section></div>`;
    out.scrollIntoView({ behavior: FX.calm ? 'auto' : 'smooth', block: 'start' });
  }

  function failed(host, msg) {
    out.innerHTML = `<div class="shell out-inner"><section class="panel scanning scan-error" aria-label="Scan failed">
      <div class="sweep" aria-hidden="true"></div>
      <div>
        <p class="label">Scan failed${host ? ` · ${esc(host)}` : ''}</p>
        <p class="scan-host">${esc(msg)}</p>
        <p class="scan-meta">CHECK THE ADDRESS AND TRY AGAIN, OR RUN A SIMULATION</p>
      </div>
    </section></div>`;
    said.textContent = msg;
  }

  const actions = (id, again) => `<a class="cta" href="/report?id=${encodeURIComponent(id)}">Open report ▸</a>` +
    (again ? '<button type="button" class="ghost" id="again">New scan</button>' : '');

  async function run(payload, host) {
    if (busy) return;
    setBusy(true);
    input.setAttribute('aria-invalid', 'false');
    panel(host, payload.demo ? 'OFFLINE SIMULATION' : 'LIVE FETCH FROM SERVER');
    said.textContent = `Scanning ${host}…`;
    const shown = performance.now();
    const elapsed = out.querySelector('.elapsed');
    const timer = setInterval(() => { elapsed.textContent = ((performance.now() - shown) / 1000).toFixed(1); }, 100);
    try {
      const sent = performance.now();
      const res = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      const ms = performance.now() - sent;
      if (!res.ok) throw new Error(data.error || `The scan failed: the server answered ${res.status}${res.statusText ? ' ' + res.statusText : ''}.`);
      // Let the sweep finish a turn so the hand-over to the dashboard is visible.
      if (!FX.calm) await wait(Math.max(0, 1200 - (performance.now() - shown)));
      clearInterval(timer);
      out.querySelector('.pipeline').className = 'pipeline done';
      if (!FX.calm) await wait(350);
      const d = { ...data, demo: !!payload.demo };
      out.innerHTML = '<div class="shell out-inner"></div>';
      A843.render(out.firstChild, d, {
        log: { command: payload.demo ? `scan --simulate ${host}` : `scan ${host}`, demo: d.demo, ms },
        reportId: data.id, actions: actions(data.id, true),
      });
      said.textContent = `Scan finished. Score ${d.score} out of 100: ${d.band.label}. ${d.counts.fail} to fix now, ${d.counts.warn} to check, ${d.counts.pass} passed.`;
      document.getElementById('again').addEventListener('click', () => {
        input.value = '';
        window.scrollTo({ top: 0, behavior: FX.calm ? 'auto' : 'smooth' });
        input.focus({ preventScroll: true });
      });
    } catch (e) {
      clearInterval(timer);
      failed(host, e instanceof TypeError ? 'Could not reach the Accolm Check server. Check your connection and try again.' : e.message);
    } finally { setBusy(false); }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!looksLikeUrl(v)) {
      input.setAttribute('aria-invalid', 'true');
      failed(v, 'Enter a web address, for example mybusiness.com.gh');
      input.focus();
      return;
    }
    run({ url: v }, hostOf(v));
  });
  sims.forEach((b) => b.addEventListener('click', () => run({ demo: b.dataset.demo }, DEMO_HOST[b.dataset.demo])));

  // The eight principles in the briefing
  fetch('/api/principles').then((r) => (r.ok ? r.json() : Promise.reject(new Error()))).then((p) => {
    document.getElementById('principles').innerHTML = Object.values(p).map((x) =>
      `<article class="panel"><p class="l">s.17(${esc(x.letter)})</p><h3>${esc(x.name)}</h3><p>${esc(x.plain)}</p></article>`).join('');
  }).catch(() => {
    document.getElementById('principles').innerHTML = '<p class="loading-line bad">// could not load the principles: the scan api did not answer.</p>';
  });

  // Open a saved scan inline: /?scan=<report id>
  const id = new URLSearchParams(location.search).get('scan');
  if (id) {
    fetch('/api/scans/' + encodeURIComponent(id)).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data) return;
      out.innerHTML = '<div class="shell out-inner"></div>';
      A843.render(out.firstChild, { ...data.result, demo: data.demo, createdAt: data.createdAt }, { log: { command: `open ${data.id}`, demo: data.demo }, reportId: data.id, actions: actions(data.id, false) });
      if (location.hash !== '#top') out.scrollIntoView();
    });
  }
})();
