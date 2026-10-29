'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { validateUrl, isBlockedIp, makeSafeLookup, safeFetch, UnsafeUrlError } = require('../src/ssrf');

test('blocks private, loopback, link-local and reserved IPs', () => {
  for (const ip of ['127.0.0.1', '127.8.8.8', '10.0.0.1', '172.16.5.4', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe']) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
});

test('allows ordinary public IPs', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '41.66.200.1', '172.32.0.1', '2606:4700:4700::1111']) assert.equal(isBlockedIp(ip), false, ip);
});

test('rejects unsafe URLs before any request is made', () => {
  const bad = ['file:///etc/passwd', 'ftp://example.com', 'gopher://example.com', 'javascript:alert(1)', 'http://localhost/', 'http://LOCALHOST:8080',
    'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.0.0.1/', 'http://017700000001/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/latest/meta-data/', 'http://printer.local/', 'http://admin:secret@example.com/', 'http://example.com:22/',
    'http://intranet/', '', '   ', 'x'.repeat(3000)];
  for (const u of bad) assert.throws(() => validateUrl(u), UnsafeUrlError, u.slice(0, 60));
  assert.throws(() => validateUrl(42), UnsafeUrlError);
});

test('accepts and normalises ordinary public URLs', () => {
  assert.equal(validateUrl('example.com').href, 'https://example.com/');
  assert.equal(validateUrl('http://shop.example.com.gh/contact#form').href, 'http://shop.example.com.gh/contact');
  assert.equal(validateUrl('https://example.com:8443/x').port, '8443');
});

test('DNS lookup refuses hostnames that resolve to internal IPs (DNS rebinding)', async () => {
  const fakeResolver = (host, opts, cb) => cb(null, [{ address: host === 'evil.test' ? '10.0.0.5' : '93.184.216.34', family: 4 }]);
  const lookup = makeSafeLookup(fakeResolver);
  await assert.rejects(new Promise((res, rej) => lookup('evil.test', {}, (e, a) => (e ? rej(e) : res(a)))), UnsafeUrlError);
  const ok = await new Promise((res, rej) => lookup('good.test', {}, (e, a) => (e ? rej(e) : res(a))));
  assert.equal(ok, '93.184.216.34');
  // a host with one public and one private address is still refused
  const mixed = makeSafeLookup((h, o, cb) => cb(null, [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]));
  await assert.rejects(new Promise((res, rej) => mixed('mixed.test', {}, (e, a) => (e ? rej(e) : res(a)))), UnsafeUrlError);
});

test('safeFetch refuses to connect when the real lookup returns loopback', async () => {
  // "localtest.me"-style trick: a public-looking name that resolves to 127.0.0.1
  const resolver = (h, o, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }]);
  await assert.rejects(safeFetch('http://looks-public.example/', { resolver }), UnsafeUrlError);
});

// For the next tests a local server stands in for a public website.
// The test supplies a lookup that sends "public.test" to it, which the real app never does.
function startServer(handler) {
  return new Promise((resolve) => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(s)); });
}
const toLocal = (port) => ({ lookup: (h, o, cb) => { if (typeof o === 'function') cb = o; return o && o.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4); }, port });

test('redirects are re-checked: a redirect to cloud metadata is refused', async () => {
  const s = await startServer((req, res) => { res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' }); res.end(); });
  const { port } = s.address();
  await assert.rejects(safeFetch(new URL(`http://public.test:${port}/`), { lookup: toLocal(port).lookup }), /private|internal/i);
  s.close();
});

test('responses larger than the size limit are cut off', async () => {
  const s = await startServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('a'.repeat(50_000)); });
  const { port } = s.address();
  await assert.rejects(safeFetch(new URL(`http://public.test:${port}/`), { lookup: toLocal(port).lookup, maxBytes: 10_000 }), /limit/);
  s.close();
});

test('slow servers time out', async () => {
  const s = await startServer(() => { /* never answer */ });
  const { port } = s.address();
  const t0 = Date.now();
  await assert.rejects(safeFetch(new URL(`http://public.test:${port}/`), { lookup: toLocal(port).lookup, timeoutMs: 300 }), /too long/);
  assert.ok(Date.now() - t0 < 2000);
  s.closeAllConnections(); s.close();
});


test('TRUSTED_EGRESS_CIDRS only opens the named range, never loopback', () => {
  process.env.TRUSTED_EGRESS_CIDRS = '198.18.0.0/15';
  try {
    assert.equal(isBlockedIp('198.18.0.7'), false);
    assert.equal(isBlockedIp('127.0.0.1'), true);
    assert.equal(isBlockedIp('10.0.0.1'), true);
    assert.throws(() => validateUrl('http://127.0.0.1/'), UnsafeUrlError);
  } finally { delete process.env.TRUSTED_EGRESS_CIDRS; }
  assert.equal(isBlockedIp('198.18.0.7'), true);
});
