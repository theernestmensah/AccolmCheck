'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze, classifyField, findPrivacyLink } = require('../src/scanner');
const { loadDemo } = require('../src/demo');

const byId = (r) => Object.fromEntries(r.findings.map((f) => [f.id, f.status]));
const page = (html, extra = {}) => analyze({ url: 'https://shop.example/', finalUrl: 'https://shop.example/', headers: {}, html, ...extra });

test('non-compliant demo scores low and fails the key checks', () => {
  const r = analyze(loadDemo('non-compliant'));
  const s = byId(r);
  assert.ok(r.score < 30, `score ${r.score}`);
  assert.equal(r.band.key, 'low');
  for (const id of ['https', 'form_transport', 'privacy_notice', 'minimality', 'marketing', 'controller', 'headers', 'rights']) assert.equal(s[id], 'fail', id);
  for (const id of ['purpose', 'consent', 'trackers', 'dpc', 'quality']) assert.equal(s[id], 'warn', id);
  assert.deepEqual(r.trackers, ['Google Analytics / gtag', 'Meta (Facebook) Pixel']);
  assert.ok(r.inventory['Ghana Card / national ID']);
  assert.ok(r.inventory['Special personal data (religion, health, ethnicity, politics)']);
});

test('compliant demo passes every check', () => {
  const r = analyze(loadDemo('compliant'));
  assert.equal(r.score, 100);
  assert.equal(r.counts.fail + r.counts.warn, 0);
  assert.ok(r.principles.every((p) => p.status === 'pass'), 'all eight principles pass');
});

test('every finding maps to one of the eight section 17 principles', () => {
  const r = analyze(loadDemo('non-compliant'));
  assert.equal(r.principles.length, 8);
  const letters = r.principles.map((p) => p.letter).join('');
  assert.equal(letters, 'abcdefgh');
  for (const f of r.findings) {
    assert.match(f.principleLetter, /^[a-h]$/);
    assert.ok(f.sections.length >= 1 && f.explain && f.fix, f.id);
  }
});

test('field classifier recognises Ghanaian personal data fields', () => {
  const c = (o) => (classifyField({ type: 'text', autocomplete: '', ...o }) || {}).key;
  assert.equal(c({ text: 'email address' }), 'email');           // not "address"
  assert.equal(c({ text: 'ghana card number' }), 'ghana_card');
  assert.equal(c({ text: 'gha-123456789-0' }), 'ghana_card');
  assert.equal(c({ text: 'momo number' }), 'momo');
  assert.equal(c({ text: 'whatsapp' }), 'phone');
  assert.equal(c({ text: 'x', type: 'tel' }), 'phone');
  assert.equal(c({ text: 'digital address (ghanapost gps)' }), 'address');
  assert.equal(c({ text: 'date of birth' }), 'dob');
  assert.equal(c({ text: 'religion' }), 'special');
  assert.equal(c({ text: 'full name' }), 'name');
  assert.equal(c({ text: 'card number' }), 'payment');
  assert.equal(c({ text: 'quantity' }), undefined);
});

test('a page with no forms is not penalised for form checks', () => {
  const r = page('<html><head><title>Hi</title></head><body><p>Hello</p><a href="/privacy">Privacy</a></body></html>');
  const s = byId(r);
  assert.equal(s.form_transport, undefined);
  assert.equal(s.consent, undefined);
  assert.equal(s.minimality, undefined);
  assert.deepEqual(r.inventory, {});
});

test('GET forms with personal data are flagged; http action fails', () => {
  assert.equal(byId(page('<form method="get"><input name="email" type="email"></form>')).form_transport, 'warn');
  assert.equal(byId(page('<form method="post" action="http://x.example/s"><input name="email"></form>')).form_transport, 'fail');
  assert.equal(byId(page('<form method="post" action="/s"><input name="email"></form>')).form_transport, 'pass');
});

test('pre-ticked consent box is not treated as consent', () => {
  const r = page('<form method="post"><input name="phone" type="tel"><label><input type="checkbox" checked> I agree to the privacy notice</label></form>');
  assert.equal(byId(r).consent, 'warn');
  const ok = page('<form method="post"><input name="phone" type="tel"><label><input type="checkbox"> I agree to the privacy notice</label></form>');
  assert.equal(byId(ok).consent, 'pass');
});

test('trackers without a cookie notice are flagged; with a notice they pass', () => {
  const gtm = '<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script>';
  assert.equal(byId(page(gtm)).trackers, 'warn');
  assert.equal(byId(page(gtm + '<div class="cookie-banner">We use cookies <button>Accept</button></div>')).trackers, 'pass');
});

test('security headers are counted', () => {
  const full = { 'Strict-Transport-Security': 'max-age=1', 'Content-Security-Policy': "frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' };
  assert.equal(byId(page('<p>x</p>', { headers: full })).headers, 'pass'); // frame-ancestors counts as anti-framing
  assert.equal(byId(page('<p>x</p>', { headers: { 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' } })).headers, 'warn');
  assert.equal(byId(page('<p>x</p>')).headers, 'fail');
});

test('Ghana contact details are recognised', () => {
  const r = page('<footer>Call 024 123 4567 or visit us at AK-039-5028, Kumasi. info@shop.example</footer>');
  assert.equal(byId(r).controller, 'pass');
});

test('privacy link discovery stays on the same site', () => {
  assert.equal(findPrivacyLink('<a href="/privacy-policy">Privacy</a>', 'https://shop.example/'), 'https://shop.example/privacy-policy');
  assert.equal(findPrivacyLink('<a href="https://other.example/privacy">Privacy</a>', 'https://shop.example/'), null);
  assert.equal(findPrivacyLink('<a href="javascript:alert(1)">Privacy</a>', 'https://shop.example/'), null);
});

test('hostile page content is kept as plain data (escaped later by the front end)', () => {
  const r = page('<title><img src=x onerror=alert(1)></title><form method="post"><input name="<script>"></form>');
  assert.equal(typeof r.title, 'string');
  assert.ok(r.score >= 0 && r.score <= 100);
});
