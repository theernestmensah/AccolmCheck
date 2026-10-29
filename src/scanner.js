// Accolm Check: the scanning rules.
// analyze() is a pure function: it takes a page that has already been fetched
// and returns findings. That makes it easy to test with fixture pages.
'use strict';
const cheerio = require('cheerio');
const { PRINCIPLES, SECTIONS } = require('./act843');

// ---------- 1. Recognising personal data fields ----------
// Order matters: the first category that matches wins
// (so "email address" is counted as email, not as a postal address).
const FIELD_RULES = [
  { key: 'password', label: 'Password', test: (f) => f.type === 'password' },
  { key: 'email', label: 'Email address', test: (f) => f.type === 'email' || /e-?mail/.test(f.text) || f.autocomplete === 'email' },
  { key: 'ghana_card', label: 'Ghana Card / national ID', sensitive: true, test: (f) => /ghana[\s_-]?card|national[\s_-]?id|\bnia\b|id[\s_-]?(card[\s_-]?)?(number|no)\b|gha-\d/.test(f.text) },
  { key: 'dob', label: 'Date of birth', sensitive: true, test: (f) => /date[\s_-]?of[\s_-]?birth|\bdob\b|birth[\s_-]?date|birthday|\bbday\b/.test(f.text) || f.autocomplete === 'bday' },
  { key: 'payment', label: 'Payment card', sensitive: true, test: (f) => /card[\s_-]?number|\bcvv\b|\bcvc\b|expiry|cc-(number|exp|csc)/.test(f.text) || /^cc-/.test(f.autocomplete) },
  { key: 'momo', label: 'Mobile money number', sensitive: true, test: (f) => /\bmomo\b|mobile[\s_-]?money|wallet[\s_-]?(number|no)/.test(f.text) },
  { key: 'special', label: 'Special personal data (religion, health, ethnicity, politics)', special: true, test: (f) => /religio|denomination|ethnic|tribe|\bhealth\b|medical|disabilit|political|party[\s_-]?affiliation/.test(f.text) },
  { key: 'phone', label: 'Phone / WhatsApp number', test: (f) => f.type === 'tel' || /phone|mobile|\btel\b|whatsapp|contact[\s_-]?number/.test(f.text) || f.autocomplete === 'tel' },
  { key: 'address', label: 'Home or digital address', test: (f) => /address|street|digital[\s_-]?addr|ghanapost|\bgps\b|house[\s_-]?(no|number)|residence/.test(f.text) || /^address|street-address|postal-code/.test(f.autocomplete) },
  { key: 'name', label: 'Name', test: (f) => /full[\s_-]?name|first[\s_-]?name|last[\s_-]?name|surname|\bfname\b|\blname\b|your[\s_-]?name|^name\b|\bname$/.test(f.text) || /name$/.test(f.autocomplete) },
  { key: 'gender', label: 'Gender', test: (f) => /\bgender\b|\bsex\b/.test(f.text) },
];

function fieldText($, el, $form) {
  const $el = $(el);
  const id = $el.attr('id');
  let label = '';
  if (id) label = $form.find(`label[for="${id.replace(/"/g, '')}"]`).text();
  if (!label) label = $el.closest('label').text();
  return [
    $el.attr('name'), id, $el.attr('placeholder'), $el.attr('aria-label'), $el.attr('title'), label,
  ].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

function classifyField(f) {
  return FIELD_RULES.find((r) => r.test(f)) || null;
}

// ---------- 2. Helpers ----------
const TRACKERS = [
  { name: 'Google Analytics / gtag', re: /google-analytics\.com|googletagmanager\.com\/gtag|gtag\(\s*['"]config|ga\(\s*['"]create/i },
  { name: 'Google Tag Manager', re: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/ },
  { name: 'Meta (Facebook) Pixel', re: /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init/i },
  { name: 'TikTok Pixel', re: /analytics\.tiktok\.com|ttq\.load/i },
  { name: 'Hotjar', re: /static\.hotjar\.com|hotjar/i },
  { name: 'Microsoft Clarity', re: /clarity\.ms/i },
];
const CMP_RE = /cookiebot|onetrust|cookieyes|osano|termly|iubenda|cookieconsent|cookie-consent|cookie-banner|cookie_notice|cookie-notice/i;
const PRIVACY_LINK_RE = /privacy|data[\s-]?protection|personal[\s-]?data/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+233|\b0)[\s-]?[235]\d[\s-]?\d{3}[\s-]?\d{4}\b/;
const GH_DIGITAL_ADDRESS_RE = /\b[A-Z]{2}-\d{3,4}-\d{4}\b/;
const ADDRESS_RE = /p\.?\s?o\.?\s?box|\bstreet\b|\broad\b|\bavenue\b|digital address|\b(accra|kumasi|tema|takoradi|tamale|cape coast)\b/i;
const DPC_RE = /data protection commission|registered (with|under) the (ghana )?data protection|\bdpc\b[^.]{0,40}(regist|number|no\.)/i;
const RIGHTS_TERMS = [/\baccess\b/i, /correct|rectif/i, /delet|eras/i, /object/i, /withdraw/i];
const PURPOSE_RE = /we (will )?use|we collect|purpose|so that we|in order to|to (contact|reply|respond|process|deliver|send)|why we (ask|collect|need)|only (be )?used/i;
const CONSENT_RE = /agree|consent|privacy|terms|accept|i understand/i;
const MARKETING_RE = /newsletter|marketing|offers|promotion|promo|special deals|news and updates|sms alerts/i;

function textOf($, sel) { return $(sel).text().replace(/\s+/g, ' ').trim(); }

function score(status) { return status === 'pass' ? 1 : status === 'warn' ? 0.5 : 0; }

// ---------- 3. The analysis ----------
function analyze({ url, finalUrl, status = 200, headers = {}, html = '', privacyPage = null }) {
  const pageUrl = new URL(finalUrl || url);
  const isHttps = pageUrl.protocol === 'https:';
  const $ = cheerio.load(html);
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const bodyText = textOf($, 'body');
  const fullHtml = html;
  const $p = privacyPage ? cheerio.load(privacyPage.html) : null;
  const privacyText = $p ? textOf($p, 'body') : '';
  const findings = [];
  const add = (f) => findings.push({ ...f, principleName: PRINCIPLES[f.principle].name, principleLetter: PRINCIPLES[f.principle].letter });

  // Forms and the personal data they collect
  const forms = [];
  $('form').each((i, formEl) => {
    const $form = $(formEl);
    const fields = [];
    $form.find('input, select, textarea').each((_, el) => {
      const type = ($(el).attr('type') || (el.tagName === 'input' ? 'text' : el.tagName)).toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'search'].includes(type) && !(type === 'radio' && /gender|sex/i.test($(el).attr('name') || ''))) return;
      const f = { type, autocomplete: ($(el).attr('autocomplete') || '').toLowerCase(), text: fieldText($, el, $form) };
      const rule = classifyField(f);
      fields.push({ name: $(el).attr('name') || $(el).attr('id') || '(unnamed)', type, category: rule ? rule.key : null, categoryLabel: rule ? rule.label : null, sensitive: !!(rule && rule.sensitive), special: !!(rule && rule.special) });
    });
    // de-duplicate radio groups
    const seen = new Set();
    const uniq = fields.filter((f) => { const k = f.name + f.category; if (seen.has(k)) return false; seen.add(k); return true; });
    const personal = uniq.filter((f) => f.category);
    const checkboxes = $form.find('input[type=checkbox]').map((_, el) => {
      const $el = $(el); const id = $el.attr('id');
      const label = ((id ? $form.find(`label[for="${id}"]`).text() : '') || $el.closest('label').text() || $el.attr('name') || '').replace(/\s+/g, ' ').trim();
      return { label, checked: $el.attr('checked') !== undefined, required: $el.attr('required') !== undefined };
    }).get();
    const actionAttr = $form.attr('action');
    let action;
    try { action = new URL(actionAttr || pageUrl.href, pageUrl).href; } catch { action = pageUrl.href; }
    const context = ($form.text() + ' ' + $form.prev().text() + ' ' + $form.parent().children().not('form').text()).replace(/\s+/g, ' ').slice(0, 2000);
    const hasPrivacyLinkNear = $form.find('a').filter((_, a) => PRIVACY_LINK_RE.test($(a).text() + ' ' + ($(a).attr('href') || ''))).length > 0 ||
      $form.parent().find('a').filter((_, a) => PRIVACY_LINK_RE.test($(a).text() + ' ' + ($(a).attr('href') || ''))).length > 0;
    forms.push({
      index: i + 1,
      id: $form.attr('id') || $form.attr('name') || `form-${i + 1}`,
      method: ($form.attr('method') || 'get').toLowerCase(),
      action, fields: uniq, personal, checkboxes, context, hasPrivacyLinkNear,
    });
  });
  const personalForms = forms.filter((f) => f.personal.length > 0);
  const hasPersonal = personalForms.length > 0;

  // Privacy link anywhere on the page
  const privacyLinks = $('a[href]').filter((_, a) => PRIVACY_LINK_RE.test($(a).text() + ' ' + $(a).attr('href'))).map((_, a) => {
    try { return new URL($(a).attr('href'), pageUrl).href; } catch { return null; }
  }).get().filter(Boolean);

  // A. HTTPS
  add({
    id: 'https', title: 'Page is served over HTTPS', principle: 'security', sections: [SECTIONS.s28], weight: 3,
    status: isHttps ? 'pass' : 'fail',
    evidence: `Final address: ${pageUrl.href}`,
    explain: isHttps ? 'The connection is encrypted, so data typed on this page cannot be read by others on the same network.' : 'The page is not encrypted. Anything typed into it, such as names and phone numbers, can be read or changed on the way to the server.',
    fix: 'Install a free TLS certificate (for example from Let\'s Encrypt or your host) and redirect all http:// traffic to https://.',
  });

  // B. Forms send data safely
  if (hasPersonal) {
    const insecure = personalForms.filter((f) => f.action.startsWith('http:'));
    const viaGet = personalForms.filter((f) => f.method === 'get');
    const st = insecure.length ? 'fail' : viaGet.length ? 'warn' : 'pass';
    add({
      id: 'form_transport', title: 'Forms send personal data securely', principle: 'security', sections: [SECTIONS.s28], weight: 3, status: st,
      evidence: personalForms.map((f) => `${f.id}: ${f.method.toUpperCase()} → ${f.action}`).join('; '),
      explain: st === 'pass' ? 'Each form that collects personal data sends it over HTTPS using POST.' :
        st === 'fail' ? 'At least one form sends personal data to an unencrypted http:// address.' :
        'At least one form uses GET, which puts personal data in the web address, browser history and server logs.',
      fix: 'Make every form use method="post" and an https:// action. Then check every field again on the server, because browser checks can be bypassed.',
    });
  }

  // C. Privacy notice
  add({
    id: 'privacy_notice', title: 'A privacy notice is published and linked', principle: 'openness', sections: [SECTIONS.s17, SECTIONS.s23, SECTIONS.s27], weight: 3,
    status: privacyLinks.length ? (hasPersonal && !personalForms.every((f) => f.hasPrivacyLinkNear) ? 'warn' : 'pass') : 'fail',
    evidence: privacyLinks.length ? `Found: ${[...new Set(privacyLinks)].slice(0, 3).join(', ')}` : 'No link containing "privacy" or "data protection" was found.',
    explain: privacyLinks.length ? (hasPersonal && !personalForms.every((f) => f.hasPrivacyLinkNear) ? 'There is a privacy notice, but it is not linked next to every form, so people may not see it when they hand over their data.' : 'Visitors can read how their data is handled.') :
      'Visitors are not told what data is collected, why, who receives it or how to contact the person responsible.',
    fix: 'Publish a short privacy notice that says what you collect, why, who receives it, how long you keep it and how people can ask to see or correct it. Link it in the footer and beside every form.',
  });

  // D. Purpose at the point of collection
  if (hasPersonal) {
    const missing = personalForms.filter((f) => !PURPOSE_RE.test(f.context));
    add({
      id: 'purpose', title: 'Forms say why the data is needed', principle: 'purpose', sections: [SECTIONS.s23], weight: 2,
      status: missing.length ? 'warn' : 'pass',
      evidence: missing.length ? `No purpose statement found near: ${missing.map((f) => f.id).join(', ')}` : 'Each personal-data form explains its purpose.',
      explain: missing.length ? 'People should know why you are asking for their details at the moment they give them.' : 'Each form tells people why their details are being collected.',
      fix: 'Add one plain sentence above the submit button, for example: "We use your phone number only to confirm your booking."',
    });
  }

  // E. Consent
  if (hasPersonal) {
    const withConsent = personalForms.filter((f) => f.checkboxes.some((c) => CONSENT_RE.test(c.label) && !MARKETING_RE.test(c.label)));
    const preTicked = personalForms.filter((f) => f.checkboxes.some((c) => CONSENT_RE.test(c.label) && c.checked));
    const st = preTicked.length ? 'warn' : withConsent.length === personalForms.length ? 'pass' : 'warn';
    add({
      id: 'consent', title: 'Consent is asked for, not assumed', principle: 'lawfulness', sections: [SECTIONS.s20], weight: 2, status: st,
      evidence: `${withConsent.length} of ${personalForms.length} personal-data form(s) have a consent checkbox${preTicked.length ? '; some are pre-ticked' : ''}.`,
      explain: st === 'pass' ? 'People actively agree before their data is processed.' :
        preTicked.length ? 'A consent box that is already ticked is not a real choice.' :
        'No consent checkbox was found. Act 843 allows other lawful reasons (for example a contract), but if you rely on consent, ask for it clearly.',
      fix: 'Add an unticked checkbox such as "I agree to Business Ltd using these details as described in the privacy notice", linked to the notice.',
    });
  }

  // F. Minimality (s.19) and special personal data
  if (hasPersonal) {
    const issues = []; let special = false;
    for (const f of personalForms) {
      const cats = f.personal.map((p) => p.category);
      if (f.personal.length > 6) issues.push(`${f.id} asks for ${f.personal.length} personal fields`);
      const simple = /contact|message|enquir|newsletter|subscribe|quote|callback/i.test(f.id + ' ' + f.context) && !/checkout|payment|register|account|apply|booking|order/i.test(f.id);
      const sens = f.personal.filter((p) => p.sensitive && p.category !== 'payment');
      if (simple && sens.length) issues.push(`${f.id} looks like a simple enquiry form but asks for ${[...new Set(sens.map((p) => p.categoryLabel))].join(', ')}`);
      if (cats.includes('special')) { special = true; issues.push(`${f.id} asks for special personal data (${f.personal.filter((p) => p.special).map((p) => p.name).join(', ')})`); }
    }
    add({
      id: 'minimality', title: 'Only necessary data is collected', principle: 'purpose', sections: [SECTIONS.s19, ...(special ? [SECTIONS.s37] : [])], weight: 3,
      status: special ? 'fail' : issues.length ? 'warn' : 'pass',
      evidence: issues.length ? issues.join('; ') : 'Field counts look proportionate.',
      explain: issues.length ? 'Section 19 says personal data may only be processed if it is necessary, relevant and not excessive for the purpose. Extra fields are extra risk if the data leaks.' + (special ? ' Data about religion, health, ethnicity or politics is special personal data and needs a strong justification.' : '') : 'The forms ask for a reasonable amount of personal data for what they appear to do.',
      fix: 'For each field ask: "What breaks if we remove this?" Remove fields you cannot justify, make others optional, and never ask for Ghana Card or date of birth in a contact form.',
    });
  }

  // G. Marketing kept separate (compatibility of further processing)
  const marketingBoxes = forms.flatMap((f) => f.checkboxes.filter((c) => MARKETING_RE.test(c.label)));
  if (marketingBoxes.length) {
    const pre = marketingBoxes.filter((c) => c.checked);
    add({
      id: 'marketing', title: 'Marketing is a separate, unticked choice', principle: 'compatibility', sections: [SECTIONS.s40], weight: 1,
      status: pre.length ? 'fail' : 'pass',
      evidence: marketingBoxes.map((c) => `"${c.label.slice(0, 80)}"${c.checked ? ' (pre-ticked)' : ''}`).join('; '),
      explain: pre.length ? 'Using contact details for marketing is a new purpose. A pre-ticked box means people are signed up without choosing it.' : 'Marketing is opt-in, separate from the main purpose of the form.',
      fix: 'Leave marketing boxes unticked and separate from any consent needed for the main service.',
    });
  }

  // H. Trackers and cookie notice
  const scriptsBlob = $('script').map((_, s) => ($(s).attr('src') || '') + ' ' + $(s).html()).get().join('\n') + ' ' + $('img[src], iframe[src], noscript').map((_, e) => $(e).attr('src') || $(e).html() || '').get().join(' ');
  const trackers = TRACKERS.filter((t) => t.re.test(scriptsBlob)).map((t) => t.name);
  const banner = CMP_RE.test(fullHtml) || /cookie/i.test(bodyText) && /accept|consent|manage|preferences|reject/i.test(bodyText);
  add({
    id: 'trackers', title: 'Tracking tools are disclosed', principle: 'openness', sections: [SECTIONS.s17], weight: 2,
    status: !trackers.length ? 'pass' : banner ? 'pass' : 'warn',
    evidence: trackers.length ? `Trackers found: ${trackers.join(', ')}. Cookie notice: ${banner ? 'yes' : 'not found'}.` : 'No common third-party trackers found in the page source.',
    explain: !trackers.length ? 'No common analytics or advertising trackers were found.' : banner ? 'Trackers are present and visitors are shown a cookie notice.' : 'The page shares visitor activity with third parties (such as Google or Meta) without telling visitors.',
    fix: 'Add a cookie notice that names the tools you use and lets visitors decline non-essential tracking, and mention them in your privacy notice.',
  });

  // I. Who is responsible (controller identity and contact)
  const contactBlob = bodyText + ' ' + privacyText + ' ' + $('a[href^="mailto:"], a[href^="tel:"]').map((_, a) => $(a).attr('href')).get().join(' ');
  const hasEmail = EMAIL_RE.test(contactBlob);
  const hasPhone = PHONE_RE.test(contactBlob) || /tel:\+?\d/.test(contactBlob);
  const hasAddr = GH_DIGITAL_ADDRESS_RE.test(contactBlob) || ADDRESS_RE.test(contactBlob);
  const contactCount = [hasEmail, hasPhone, hasAddr].filter(Boolean).length;
  add({
    id: 'controller', title: 'The business says who it is and how to reach it', principle: 'accountability', sections: [SECTIONS.s27], weight: 2,
    status: contactCount >= 2 ? 'pass' : contactCount === 1 ? 'warn' : 'fail',
    evidence: `Email: ${hasEmail ? 'yes' : 'no'}, phone: ${hasPhone ? 'yes' : 'no'}, physical or digital address: ${hasAddr ? 'yes' : 'no'}.`,
    explain: 'Section 27(2) expects people to know the name and address of whoever is collecting their data, so they know who is accountable.',
    fix: 'Show the registered business name, a physical or GhanaPost digital address, an email address and a phone number in the footer or privacy notice.',
  });

  // J. Data Protection Commission registration mentioned
  const dpc = DPC_RE.test(bodyText + ' ' + privacyText);
  add({
    id: 'dpc', title: 'Data Protection Commission registration is mentioned', principle: 'accountability', sections: [SECTIONS.s27, SECTIONS.s46], weight: 1,
    status: dpc ? 'pass' : 'warn',
    evidence: dpc ? 'The site mentions the Data Protection Commission.' : 'No mention of the Data Protection Commission was found.',
    explain: 'Act 843 requires data controllers to register with the Data Protection Commission. Stating the registration builds trust. This tool cannot check the register itself.',
    fix: 'If you are registered, state it in your privacy notice. If not, register with the Data Protection Commission before collecting personal data.',
  });

  // K. Data subject rights
  const rightsSource = privacyText || bodyText;
  const rightsFound = RIGHTS_TERMS.filter((r) => r.test(rightsSource)).length;
  add({
    id: 'rights', title: 'People are told how to see, correct or delete their data', principle: 'participation', sections: [SECTIONS.s32, SECTIONS.s33], weight: 2,
    status: !privacyPage && !privacyLinks.length ? 'fail' : rightsFound >= 2 ? 'pass' : 'warn',
    evidence: privacyPage ? `Privacy page read: ${privacyPage.url}. Rights terms found: ${rightsFound} of ${RIGHTS_TERMS.length}.` : privacyLinks.length ? 'A privacy link exists but could not be read; checked this page only.' : 'No privacy notice to check.',
    explain: 'People have the right to ask what data you hold about them and to have it corrected or deleted.',
    fix: 'Add a "Your rights" section: how to request a copy, a correction or deletion, and who to email.',
  });

  // L. Security headers
  const hdr = {
    'Strict-Transport-Security': !!h['strict-transport-security'],
    'Content-Security-Policy': !!h['content-security-policy'],
    'X-Frame-Options or frame-ancestors': !!h['x-frame-options'] || /frame-ancestors/i.test(h['content-security-policy'] || ''),
    'X-Content-Type-Options': /nosniff/i.test(h['x-content-type-options'] || ''),
  };
  const nHdr = Object.values(hdr).filter(Boolean).length;
  add({
    id: 'headers', title: 'Browser security headers are set', principle: 'security', sections: [SECTIONS.s28], weight: 3,
    status: nHdr === 4 ? 'pass' : nHdr >= 2 ? 'warn' : 'fail',
    evidence: Object.entries(hdr).map(([k, v]) => `${k}: ${v ? 'present' : 'missing'}`).join('; '),
    explain: 'These headers tell browsers to always use HTTPS, block injected scripts and stop the page being framed by another site to trick users.',
    fix: 'Ask your host or add to your server config: Strict-Transport-Security, a Content-Security-Policy, X-Frame-Options: DENY (or CSP frame-ancestors) and X-Content-Type-Options: nosniff.',
  });

  // M. Mixed content
  if (isHttps) {
    const mixed = $('script[src^="http:"], iframe[src^="http:"], link[rel=stylesheet][href^="http:"], img[src^="http:"]').length;
    add({
      id: 'mixed', title: 'No insecure (http) resources on an HTTPS page', principle: 'security', sections: [SECTIONS.s28], weight: 1,
      status: mixed ? 'warn' : 'pass',
      evidence: mixed ? `${mixed} resource(s) loaded over http://` : 'All resources use HTTPS or relative paths.',
      explain: mixed ? 'Insecure scripts or frames can be swapped on the way and used to read what people type.' : 'The page does not pull in insecure resources.',
      fix: 'Change every http:// resource link to https:// or host the file yourself.',
    });
  }

  // N. Quality of information
  if (hasPersonal) {
    const typed = personalForms.flatMap((f) => f.fields.filter((x) => x.category === 'email' || x.category === 'phone'));
    const good = typed.filter((x) => (x.category === 'email' && x.type === 'email') || (x.category === 'phone' && x.type === 'tel'));
    add({
      id: 'quality', title: 'Fields help people enter accurate data', principle: 'quality', sections: [SECTIONS.s26], weight: 1,
      status: !typed.length || good.length === typed.length ? 'pass' : 'warn',
      evidence: typed.length ? `${good.length} of ${typed.length} email/phone fields use the matching input type.` : 'No email or phone fields to check.',
      explain: 'Using type="email" and type="tel" helps people enter correct details. This only helps accuracy: the server must still validate every value, because browser checks can be bypassed.',
      fix: 'Use type="email" and type="tel", add a hint such as "e.g. 024 123 4567", and validate the same rules on the server.',
    });
  }

  // ---------- Score ----------
  const scored = findings.filter((f) => f.weight > 0);
  const total = scored.reduce((a, f) => a + f.weight, 0);
  const got = scored.reduce((a, f) => a + f.weight * score(f.status), 0);
  const value = total ? Math.round((got / total) * 100) : 0;
  const band = value >= 80 ? { key: 'good', label: 'Strong start' } : value >= 50 ? { key: 'mid', label: 'Needs work' } : { key: 'low', label: 'At risk' };

  // Principle summary (worst status wins)
  const order = { fail: 0, warn: 1, pass: 2 };
  const principles = Object.entries(PRINCIPLES).map(([key, p]) => {
    const fs = findings.filter((f) => f.principle === key);
    const worst = fs.length ? fs.reduce((w, f) => (order[f.status] < order[w] ? f.status : w), 'pass') : 'na';
    return { key, letter: p.letter, name: p.name, plain: p.plain, status: worst, checks: fs.map((f) => f.id) };
  });

  const inventory = {};
  for (const f of personalForms) for (const p of f.personal) inventory[p.categoryLabel] = (inventory[p.categoryLabel] || 0) + 1;

  return {
    url: url, finalUrl: pageUrl.href, httpStatus: status,
    title: $('title').first().text().trim().slice(0, 200) || pageUrl.hostname,
    score: value, band, findings, principles,
    forms: forms.map(({ context, ...rest }) => rest),
    inventory, trackers,
    counts: { pass: findings.filter((f) => f.status === 'pass').length, warn: findings.filter((f) => f.status === 'warn').length, fail: findings.filter((f) => f.status === 'fail').length },
  };
}

// Pick the privacy page link to read (same site only, to keep the scan small).
function findPrivacyLink(html, baseUrl) {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  let best = null;
  $('a[href]').each((_, a) => {
    if (best) return;
    const t = $(a).text() + ' ' + $(a).attr('href');
    if (!PRIVACY_LINK_RE.test(t)) return;
    try {
      const u = new URL($(a).attr('href'), base);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '')) { u.hash = ''; best = u.href; }
    } catch { /* ignore bad links */ }
  });
  return best;
}

module.exports = { analyze, findPrivacyLink, classifyField, FIELD_RULES };
