// Orchestrates one live scan: fetch the page safely, optionally its privacy page, then analyse.
'use strict';
const { safeFetch } = require('./ssrf');
const { analyze, findPrivacyLink } = require('./scanner');

async function scanUrl(url, fetchOpts = {}) {
  const page = await safeFetch(url, fetchOpts);
  const type = String(page.headers['content-type'] || '');
  if (type && !/html|xml/i.test(type)) throw new Error('That address did not return a web page (HTML).');
  let privacyPage = null;
  const link = findPrivacyLink(page.body, page.finalUrl);
  if (link && link !== page.finalUrl) {
    try {
      const p = await safeFetch(link, fetchOpts);
      if (p.status < 400) privacyPage = { url: p.finalUrl, html: p.body };
    } catch { /* privacy page unreachable: the scan still runs on the main page */ }
  }
  return analyze({ url: url.href || String(url), finalUrl: page.finalUrl, status: page.status, headers: page.headers, html: page.body, privacyPage });
}
module.exports = { scanUrl };
