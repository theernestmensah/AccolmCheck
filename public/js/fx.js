// HUD effects shared by every page: server status light, UTC clock, boot sequence,
// wireframe globe, decoding headline and live telemetry. The numbers shown are real
// (server round trip, scan counts, recent targets); the motion only dresses them.
// With "reduce motion" switched on, everything renders once and stays still.
(function () {
  'use strict';
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // One health check feeds the status light, the boot sequence and the telemetry strip.
  const started = performance.now();
  const health = fetch('/api/health', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
    .then((h) => ({ ok: true, db: h.db, ms: Math.max(1, Math.round(performance.now() - started)) }))
    .catch(() => ({ ok: false }));

  health.then((h) => {
    document.querySelectorAll('[data-sys]').forEach((el) => {
      el.innerHTML = h.ok
        ? `<span class="dot on"></span><span class="txt">SYS ONLINE · ${h.ms} ms</span>`
        : '<span class="dot off"></span><span class="txt">API OFFLINE</span>';
    });
  });

  function clock() {
    const el = document.getElementById('clock');
    if (!el) return;
    const tick = () => { el.textContent = new Date().toISOString().slice(11, 19) + ' UTC'; };
    tick();
    setInterval(tick, 1000);
  }

  // ---------- boot sequence: once per visit, home page only ----------
  function boot() {
    if (!document.body.hasAttribute('data-boot') || calm) return Promise.resolve();
    try {
      if (sessionStorage.getItem('ac-boot') === '1') return Promise.resolve();
      sessionStorage.setItem('ac-boot', '1');
    } catch { /* storage blocked: show it anyway */ }
    const el = document.createElement('div');
    el.className = 'boot';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="boot-box"><p class="bt">ACCOLM<span>//</span>CHECK</p><ol></ol><div class="boot-bar"><i></i></div><p class="boot-skip">press any key to skip</p></div>';
    document.body.appendChild(el);
    const list = el.querySelector('ol');
    const bar = el.querySelector('.boot-bar i');
    const steps = [
      ['scanner rules', async () => '14 checks'],
      ['act 843 · section 17', async () => '8 principles'],
      ['scan api', async () => {
        const h = await Promise.race([health, wait(1100).then(() => null)]);
        return !h ? '<span class="warn">PENDING</span>' : h.ok ? `ONLINE · ${h.ms} ms` : '<span class="bad">OFFLINE</span>';
      }],
      ['ready', async () => '▮'],
    ];
    let skipped = false;
    let finish;
    const done = new Promise((r) => { finish = r; });
    const close = () => {
      if (el.classList.contains('done')) return;
      el.classList.add('done');
      setTimeout(() => el.remove(), 500);
      removeEventListener('keydown', skip); removeEventListener('pointerdown', skip);
      finish();
    };
    const skip = () => { skipped = true; close(); };
    addEventListener('keydown', skip); addEventListener('pointerdown', skip);
    (async () => {
      for (let i = 0; i < steps.length && !skipped; i++) {
        const [k, v] = steps[i];
        const li = document.createElement('li');
        li.innerHTML = `<span>&gt; ${k}</span><span class="lead-dots">${'.'.repeat(60)}</span><b>…</b>`;
        list.appendChild(li);
        li.querySelector('b').innerHTML = await v();
        bar.style.width = `${((i + 1) / steps.length) * 100}%`;
        await wait(230);
      }
      await wait(250);
      close();
    })();
    return done;
  }

  // ---------- decoding headline ----------
  function decode(root) {
    if (!root || calm) return;
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@<>/=+*';
    root.querySelectorAll('[data-decode]').forEach((s, idx) => {
      const final = s.textContent;
      const order = [...final].map((_, i) => 0.25 + Math.random() * 0.55 + (i / final.length) * 0.2);
      const start = performance.now() + idx * 110;
      const dur = 950;
      (function frame(now) {
        const p = (now - start) / dur;
        let out = '';
        for (let i = 0; i < final.length; i++) out += p >= order[i] || /[\s.]/.test(final[i]) ? final[i] : glyphs[(Math.random() * glyphs.length) | 0];
        s.textContent = out;
        if (p < 1) requestAnimationFrame(frame); else s.textContent = final;
      })(performance.now());
    });
  }

  // ---------- wireframe globe with packets leaving Accra ----------
  function globe(canvas) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const DEG = Math.PI / 180;
    const vec = (lat, lon) => [Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG), Math.cos(lat * DEG) * Math.cos(lon * DEG)];
    const dots = [];
    const N = 1300;
    for (let i = 0; i < N; i++) { // Fibonacci sphere
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * Math.PI * (3 - Math.sqrt(5));
      dots.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    const cities = [[6.52, 3.38], [5.36, -4.01], [51.5, -0.13], [50.1, 8.68], [40.7, -74], [38.9, -77.0], [-23.5, -46.6], [-26.2, 28.0], [-1.29, 36.8], [30.0, 31.2], [25.2, 55.3], [19.1, 72.9], [1.35, 103.8], [14.7, -17.4]];
    const accra = vec(5.6, -0.19);
    const slerp = (a, b, t) => {
      const d = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      const s = Math.sin(d) || 1;
      const k1 = Math.sin((1 - t) * d) / s; const k2 = Math.sin(t * d) / s;
      return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
    };
    const STEPS = 56;
    const arcs = cities.map(([la, lo], i) => {
      const b = vec(la, lo);
      const path = [];
      for (let k = 0; k <= STEPS; k++) {
        const t = k / STEPS; const p = slerp(accra, b, t); const lift = 1 + 0.2 * Math.sin(Math.PI * t);
        path.push([p[0] * lift, p[1] * lift, p[2] * lift]);
      }
      return { b, path, off: i / cities.length, speed: 0.11 + (i % 5) * 0.025 };
    });
    const tilt = -0.36; const ct = Math.cos(tilt); const st = Math.sin(tilt);
    let W = 0; let H = 0; let R = 0; let cx = 0; let cy = 0;
    function size() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(W, H) * 0.34; cx = W / 2; cy = H / 2;
    }
    function project(v, rot) {
      const cr = Math.cos(rot); const sr = Math.sin(rot);
      const x = v[0] * cr + v[2] * sr; const z0 = -v[0] * sr + v[2] * cr;
      const y = v[1] * ct - z0 * st; const z = v[1] * st + z0 * ct;
      return [cx + x * R, cy - y * R, z];
    }
    const buckets = Array.from({ length: 6 }, () => []);
    function draw(time) {
      const rot = -0.25 + time * 0.00007;
      ctx.clearRect(0, 0, W, H);
      const halo = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 1.45);
      halo.addColorStop(0, 'rgba(34,227,255,0.10)'); halo.addColorStop(1, 'rgba(34,227,255,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 1.45, 0, Math.PI * 2); ctx.fill();
      // rim and orbit
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(34,227,255,0.28)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.setLineDash([2, 7]); ctx.lineDashOffset = -time * 0.02;
      ctx.strokeStyle = 'rgba(34,227,255,0.35)'; ctx.beginPath(); ctx.ellipse(cx, cy, R * 1.3, R * 0.36, -0.42, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      const sa = time * 0.0005;
      const sx = cx + Math.cos(sa) * R * 1.3 * Math.cos(-0.42) - Math.sin(sa) * R * 0.36 * Math.sin(-0.42);
      const sy = cy + Math.cos(sa) * R * 1.3 * Math.sin(-0.42) + Math.sin(sa) * R * 0.36 * Math.cos(-0.42);
      ctx.fillStyle = '#E6FBFF'; ctx.fillRect(sx - 2, sy - 2, 4, 4);
      // ticks around the rim
      ctx.strokeStyle = 'rgba(34,227,255,0.35)';
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2 + time * 0.00004; const l = i % 6 === 0 ? 10 : 4;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R * 1.08), cy + Math.sin(a) * (R * 1.08));
        ctx.lineTo(cx + Math.cos(a) * (R * 1.08 + l), cy + Math.sin(a) * (R * 1.08 + l)); ctx.stroke();
      }
      // dots, grouped by brightness to keep the frame cheap
      buckets.forEach((b) => { b.length = 0; });
      for (const d of dots) {
        const p = project(d, rot);
        if (p[2] < -0.2) continue;
        buckets[p[2] < 0 ? 0 : Math.min(5, 1 + Math.floor(p[2] * 5))].push(p);
      }
      buckets.forEach((b, i) => {
        ctx.fillStyle = `rgba(34,227,255,${i === 0 ? 0.07 : 0.16 + i * 0.13})`;
        const s = i === 0 ? 1 : 1.2 + i * 0.12;
        for (const p of b) ctx.fillRect(p[0] - s / 2, p[1] - s / 2, s, s);
      });
      // arcs and packets
      for (const arc of arcs) {
        ctx.beginPath();
        let on = false;
        for (const v of arc.path) {
          const p = project(v, rot);
          if (p[2] < -0.05) { on = false; continue; }
          if (on) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); on = true; }
        }
        ctx.strokeStyle = 'rgba(34,227,255,0.22)'; ctx.stroke();
        const t = (time * 0.001 * arc.speed + arc.off) % 1;
        const k = Math.floor(t * STEPS);
        for (let j = 0; j < 6 && k - j >= 0; j++) {
          const p = project(arc.path[k - j], rot);
          if (p[2] < -0.05) break;
          ctx.fillStyle = j === 0 ? '#E6FBFF' : `rgba(34,227,255,${0.5 - j * 0.08})`;
          const s = j === 0 ? 3 : 2;
          ctx.fillRect(p[0] - s / 2, p[1] - s / 2, s, s);
        }
        const e = project(arc.b, rot);
        if (e[2] > 0) { ctx.fillStyle = 'rgba(230,251,255,0.8)'; ctx.fillRect(e[0] - 1.5, e[1] - 1.5, 3, 3); }
      }
      // Accra
      const a = project(accra, rot);
      if (a[2] > 0) {
        const pulse = (time * 0.0008) % 1;
        ctx.strokeStyle = `rgba(242,183,5,${1 - pulse})`; ctx.beginPath(); ctx.arc(a[0], a[1], 4 + pulse * 18, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#F2B705'; ctx.fillRect(a[0] - 3, a[1] - 3, 6, 6);
        ctx.strokeStyle = 'rgba(242,183,5,0.6)'; ctx.beginPath(); ctx.moveTo(a[0] + 6, a[1] - 6); ctx.lineTo(a[0] + 26, a[1] - 26); ctx.lineTo(a[0] + 40, a[1] - 26); ctx.stroke();
        ctx.fillStyle = 'rgba(230,241,250,0.9)'; ctx.font = '600 11px ChakraPetch, sans-serif'; ctx.fillText('ACCRA', a[0] + 44, a[1] - 28);
        ctx.fillStyle = 'rgba(141,162,182,0.9)'; ctx.font = '10px SpaceMono, monospace'; ctx.fillText('5.60°N 0.19°W', a[0] + 44, a[1] - 15);
      }
    }
    let raf = 0; let visible = true;
    const loop = (t) => { draw(t); raf = requestAnimationFrame(loop); };
    const run = () => { if (!raf && visible && !document.hidden && !calm) raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    size();
    draw(9000);
    new ResizeObserver(() => { size(); if (!raf) draw(9000); }).observe(canvas);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) run(); else stop(); }).observe(canvas);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()));
    run();
  }

  // ---------- live telemetry ----------
  function countTo(el, to, suffix = '') {
    if (calm) { el.innerHTML = `${to}${suffix}`; return; }
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / 900);
      el.innerHTML = `${Math.round(to * (1 - (1 - p) ** 3))}${suffix}`;
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  function telemetry() {
    const scans = document.getElementById('tm-scans');
    const latency = document.getElementById('tm-latency');
    const feed = document.getElementById('tm-feed');
    if (!scans && !latency && !feed) return;
    health.then((h) => { if (latency) latency.innerHTML = h.ok ? `${h.ms}<small>ms</small>` : '<span class="bad">OFF</span>'; });
    fetch('/api/scans?limit=200').then((r) => (r.ok ? r.json() : Promise.reject(new Error()))).then((rows) => {
      if (scans) countTo(scans, rows.length, rows.length >= 200 ? '<small>+</small>' : '');
      if (!feed) return;
      if (!rows.length) { feed.innerHTML = '<span class="dim">no targets yet: run the first scan</span>'; return; }
      const cls = { good: 'pass', mid: 'check', low: 'fix' };
      const items = rows.slice(0, 10).map((s) => `<a href="/report?id=${encodeURIComponent(s.id)}">${esc(s.host || s.finalUrl)}</a><b class="${cls[s.band] || ''}">${Number(s.score)}</b>`).join('');
      feed.innerHTML = `<span>${items}</span><span aria-hidden="true">${items}</span>`;
      feed.querySelectorAll('[aria-hidden] a').forEach((a) => { a.tabIndex = -1; });
    }).catch(() => {
      if (scans) scans.innerHTML = '<span class="bad">—</span>';
      if (feed) feed.innerHTML = '<span class="bad">feed offline: the scan api did not answer</span>';
    });
  }

  clock();
  telemetry();
  globe(document.getElementById('globe'));
  boot().then(() => decode(document.querySelector('.hero-title')));
  window.FX = { health, calm };
})();
