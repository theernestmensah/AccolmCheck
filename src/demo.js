// Offline demo scans: read the fixture sites from disk instead of the network,
// so the project can be shown in a classroom with no internet.
'use strict';
const fs = require('fs');
const path = require('path');
const DEMOS = { 'non-compliant': 'non-compliant', compliant: 'compliant' };
function loadDemo(name) {
  const dir = DEMOS[name];
  if (!dir) throw new Error('Unknown demo.');
  const base = path.join(__dirname, '..', 'fixtures', dir);
  const meta = JSON.parse(fs.readFileSync(path.join(base, 'headers.json'), 'utf8'));
  const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
  const privacyFile = path.join(base, 'privacy.html');
  const privacyPage = fs.existsSync(privacyFile) ? { url: new URL('/privacy.html', meta.url).href, html: fs.readFileSync(privacyFile, 'utf8') } : null;
  return { url: meta.url, finalUrl: meta.url, status: 200, headers: meta.headers, html, privacyPage };
}
module.exports = { loadDemo, DEMOS };
