// Safe fetching for Accolm Check.
// The scanner fetches pages that a visitor names, so it must never be tricked
// into reaching the server's own network (Server-Side Request Forgery, SSRF).
'use strict';
const net = require('net');
const dns = require('dns');
const http = require('http');
const https = require('https');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
const MAX_URL_LENGTH = 2048;
const DEFAULTS = { timeoutMs: 8000, maxBytes: 1_500_000, maxRedirects: 3 };

// Convert dotted IPv4 to a 32-bit number.
function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}
function inCidr4(ip, base, bits) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4 = [
  ['0.0.0.0', 8],        // "this" network
  ['10.0.0.0', 8],       // private
  ['100.64.0.0', 10],    // carrier-grade NAT
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local, includes cloud metadata 169.254.169.254
  ['172.16.0.0', 12],    // private
  ['192.0.0.0', 24],     // IETF protocol assignments
  ['192.0.2.0', 24],     // documentation
  ['192.168.0.0', 16],   // private
  ['198.18.0.0', 15],    // benchmarking
  ['198.51.100.0', 24],  // documentation
  ['203.0.113.0', 24],   // documentation
  ['224.0.0.0', 4],      // multicast
  ['240.0.0.0', 4],      // reserved, includes 255.255.255.255
];

// Expand an IPv6 address into 8 numeric groups.
function expandV6(ip) {
  let addr = ip.toLowerCase().split('%')[0];
  // Handle embedded IPv4 such as ::ffff:127.0.0.1
  const v4 = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = ipv4ToInt(v4[1]);
    addr = addr.replace(v4[1], ((n >>> 16) & 0xffff).toString(16) + ':' + (n & 0xffff).toString(16));
  }
  const [head, tail] = addr.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const fill = addr.includes('::') ? new Array(8 - h.length - t.length).fill('0') : [];
  return [...h, ...fill, ...t].map((g) => parseInt(g || '0', 16));
}

// Some networks (certain VPNs, sandboxes and proxies) answer every DNS query with a
// "fake" address from 198.18.0.0/15 and tunnel the traffic out. On such a network an
// operator can allow that one range with TRUSTED_EGRESS_CIDRS=198.18.0.0/15.
// It is empty by default, so nothing internal is ever reachable out of the box.
function trustedCidrs() {
  return String(process.env.TRUSTED_EGRESS_CIDRS || '').split(',').map((x) => x.trim()).filter(Boolean)
    .map((c) => c.split('/')).filter(([b, n]) => net.isIPv4(b) && Number(n) >= 8 && Number(n) <= 32).map(([b, n]) => [b, Number(n)]);
}

function isBlockedIp(ip) {
  const family = net.isIP(ip);
  if (family === 4 && trustedCidrs().some(([b, n]) => inCidr4(ip, b, n))) return false;
  if (family === 4) return BLOCKED_V4.some(([base, bits]) => inCidr4(ip, base, bits));
  if (family === 6) {
    const g = expandV6(ip);
    if (g.every((x) => x === 0)) return true;                       // ::
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1 loopback
    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible: check the IPv4 part
    if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
      const v4 = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.');
      return isBlockedIp(v4);
    }
    if ((g[0] & 0xfe00) === 0xfc00) return true;  // fc00::/7 unique local
    if ((g[0] & 0xffc0) === 0xfe80) return true;  // fe80::/10 link-local
    if ((g[0] & 0xff00) === 0xff00) return true;  // ff00::/8 multicast
    if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
    if (g[0] === 0x0064 && g[1] === 0xff9b) return true; // NAT64 can reach IPv4 internals
    return false;
  }
  return true; // not an IP at all: refuse
}

class UnsafeUrlError extends Error {
  constructor(message) { super(message); this.name = 'UnsafeUrlError'; }
}

// Server-side validation of the URL a visitor typed. Returns a URL object.
function validateUrl(input) {
  if (typeof input !== 'string') throw new UnsafeUrlError('Please enter a website address.');
  let raw = input.trim();
  if (!raw) throw new UnsafeUrlError('Please enter a website address.');
  if (raw.length > MAX_URL_LENGTH) throw new UnsafeUrlError('That address is too long.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw; // allow "example.com"
  let url;
  try { url = new URL(raw); } catch { throw new UnsafeUrlError('That does not look like a valid web address.'); }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) throw new UnsafeUrlError('Only http and https addresses can be scanned.');
  if (url.username || url.password) throw new UnsafeUrlError('Addresses with a username or password are not allowed.');
  if (!ALLOWED_PORTS.has(url.port)) throw new UnsafeUrlError('Only standard web ports (80, 443, 8080, 8443) are allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new UnsafeUrlError('The address has no host name.');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home.arpa')) {
    throw new UnsafeUrlError('Local and internal addresses cannot be scanned.');
  }
  if (net.isIP(host) && isBlockedIp(host)) throw new UnsafeUrlError('Private, loopback and internal IP addresses cannot be scanned.');
  if (!net.isIP(host) && !host.includes('.')) throw new UnsafeUrlError('Please use a full public domain name, such as example.com.gh.');
  url.hash = '';
  return url;
}

// DNS lookup used by the socket itself. Checking here (not before the request)
// stops DNS rebinding: the IP we check is the IP we connect to.
function makeSafeLookup(resolver = dns.lookup) {
  return function safeLookup(hostname, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    resolver(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err);
      const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
      const bad = list.find((a) => isBlockedIp(a.address));
      if (bad || list.length === 0) {
        return callback(new UnsafeUrlError(`${hostname} points to a private or internal address, so it was not fetched.`));
      }
      if (options.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };
}

function requestOnce(url, opts) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, val) => { if (settled) return; settled = true; clearTimeout(hardTimer); fn(val); };
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'GET',
      lookup: opts.lookup,
      timeout: opts.timeoutMs,
      headers: {
        'User-Agent': 'AccolmCheck/1.0 (student project; automated privacy screening)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'Accept-Encoding': 'identity',
      },
    }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > opts.maxBytes) {
          finish(reject, new UnsafeUrlError(`The page is larger than the ${Math.round(opts.maxBytes / 1000)} KB size limit.`));
          res.destroy(); req.destroy();
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => finish(resolve, { status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', (e) => finish(reject, e));
    });
    // One overall deadline for connect + headers + body, so a slow trickle cannot hold the server.
    const hardTimer = setTimeout(() => { finish(reject, new Error('The website took too long to respond.')); req.destroy(); }, opts.timeoutMs);
    req.on('timeout', () => { finish(reject, new Error('The website took too long to respond.')); req.destroy(); });
    req.on('error', (e) => finish(reject, e));
    req.end();
  });
}

// Fetch a public page safely, following at most a few redirects, each re-validated.
async function safeFetch(input, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  opts.lookup = opts.lookup || makeSafeLookup(opts.resolver);
  let url = input instanceof URL ? input : validateUrl(input);
  const chain = [];
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    chain.push(url.href);
    const res = await requestOnce(url, opts);
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
      url = validateUrl(new URL(res.headers.location, url).href);
      continue;
    }
    return { ...res, finalUrl: url.href, redirects: chain };
  }
  throw new UnsafeUrlError('Too many redirects.');
}

module.exports = { validateUrl, isBlockedIp, makeSafeLookup, safeFetch, UnsafeUrlError, DEFAULTS };
