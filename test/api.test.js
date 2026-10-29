'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../src/db');
const { buildApp } = require('../src/app');

let server, base, db;
test.before(async () => {
  db = await createDb({ driver: 'sqlite', file: ':memory:' });
  server = buildApp(db, { scanLimit: 6, quiet: true }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await db.close(); });
const post = (body) => fetch(base + '/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('API refuses internal targets with 400 (SSRF)', async () => {
  for (const url of ['http://127.0.0.1:3000/api/scans', 'http://169.254.169.254/', 'file:///etc/passwd']) {
    const r = await post({ url });
    assert.equal(r.status, 400, url);
    assert.ok((await r.json()).error);
  }
});

test('demo scan is saved and can be read back as a report', async () => {
  const r = await post({ demo: 'non-compliant' });
  assert.equal(r.status, 201);
  const data = await r.json();
  assert.match(data.id, /^[A-Za-z0-9_-]{12}$/);
  const g = await fetch(`${base}/api/scans/${data.id}`);
  assert.equal(g.status, 200);
  const rep = await g.json();
  assert.equal(rep.result.score, data.score);
  assert.equal(rep.demo, true);
  const list = await (await fetch(base + '/api/scans')).json();
  assert.ok(list.some((s) => s.id === data.id));
});

test('unknown demo and bad report ids are rejected (server-side validation)', async () => {
  assert.equal((await post({ demo: '__proto__' })).status, 400);
  assert.equal((await fetch(`${base}/api/scans/${encodeURIComponent("1' OR '1'='1")}`)).status, 400);
  assert.equal((await fetch(`${base}/api/scans/AAAAAAAAAAAA`)).status, 404);
});

test('the app sends its own security headers', async () => {
  const r = await fetch(base + '/');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('scan endpoint is rate limited', async () => {
  let last;
  for (let i = 0; i < 8; i++) last = await post({ demo: 'compliant' });
  assert.equal(last.status, 429);
});
