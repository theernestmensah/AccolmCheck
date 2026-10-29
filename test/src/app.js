// Express app: API routes plus the static front end.
'use strict';
const path = require('path');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { validateUrl, UnsafeUrlError } = require('./ssrf');
const { scanUrl } = require('./scan');
const { analyze } = require('./scanner');
const { loadDemo, DEMOS } = require('./demo');
const { PRINCIPLES } = require('./act843');

function buildApp(db, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy ?? 1);

  // Demo fixture sites (deliberately insecure ones too) are served before the strict headers.
  app.use('/demo-site', express.static(path.join(__dirname, '..', 'fixtures')));

  // Practise what we preach: this app sends the same headers it checks for.
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.use(express.json({ limit: '4kb' }));

  const scanLimiter = rateLimit({
    windowMs: 60 * 1000, limit: options.scanLimit ?? 10, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Too many scans from your connection. Please wait a minute and try again.' },
  });

  app.get('/api/health', (req, res) => res.json({ ok: true, db: db.driver }));
  app.get('/api/principles', (req, res) => res.json(PRINCIPLES));

  app.post('/api/scan', scanLimiter, async (req, res) => {
    const body = req.body || {};
    try {
      let result; let demo = false;
      if (typeof body.demo === 'string') {
        if (!Object.prototype.hasOwnProperty.call(DEMOS, body.demo)) return res.status(400).json({ error: 'Unknown demo site.' });
        result = analyze(loadDemo(body.demo)); demo = true;
      } else {
        const url = validateUrl(body.url); // server-side validation, whatever the browser did
        result = await scanUrl(url, options.fetchOpts);
      }
      const id = await db.saveScan(result, demo);
      res.status(201).json({ id, ...result });
    } catch (e) {
      if (e instanceof UnsafeUrlError) return res.status(400).json({ error: e.message });
      const msg = /ENOTFOUND|EAI_AGAIN/.test(e.code || e.message) ? 'That website could not be found. Check the spelling.' :
        /ECONNREFUSED|ECONNRESET|certificate|SSL|EPROTO/i.test(e.code + ' ' + e.message) ? 'The website refused the connection or has a certificate problem.' :
        /too long|timeout/i.test(e.message) ? 'The website took too long to respond.' : 'The scan could not be completed for that address.';
      if (!options.quiet) console.error('[scan]', e.code || '', e.message);
      res.status(502).json({ error: msg });
    }
  });

  app.get('/api/scans', async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    res.json(await db.listScans(limit));
  });
  app.get('/api/scans/:id', async (req, res) => {
    if (!/^[A-Za-z0-9_-]{12}$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid report id.' });
    const scan = await db.getScan(req.params.id);
    if (!scan) return res.status(404).json({ error: 'Report not found.' });
    res.json(scan);
  });

  const pub = path.join(__dirname, '..', 'public');
  app.use('/vendor/bootstrap', express.static(path.join(__dirname, '..', 'node_modules', 'bootstrap', 'dist')));
  app.use(express.static(pub, { extensions: ['html'] }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((req, res) => res.status(404).sendFile(path.join(pub, '404.html')));
  return app;
}
module.exports = { buildApp };
