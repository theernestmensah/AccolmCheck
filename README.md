# Accolm Check

**Know what your website knows about people.**

Accolm Check is a web app that screens a website's public pages for how it collects personal data. You paste a web address. The server fetches the page safely, finds forms and fields that collect personal data (name, email, phone/WhatsApp, Ghana Card, date of birth, address, MoMo, payment card, special personal data), runs 14 checks and maps each finding to one of the eight principles in section 17 of Ghana's **Data Protection Act, 2012 (Act 843)**. You get a score, plain-language explanations, fixes, and a shareable report you can print or save as a PDF.

> It is an automated first-pass screening, **not legal advice**. It cannot see how data is stored or confirm registration with the Data Protection Commission, and a good score does not mean a site complies with Act 843.

Built by Ernest Abel Nanabanyin Mensah (BTech Computer Technology, Kumasi Technical University) as the project for his industrial attachment with Accolm. The name is a nod to Accolm, where the problem was first encountered. This is a student project, not an official Accolm product, and it is not endorsed by Accolm.

## Run it (Node.js 18 or newer)

```bash
cd accolm-check
npm install
npm test
npm start            # then open http://localhost:3000
```

No database server is needed: scan history goes into SQLite at `data/accolm-check.db`. Click **Adwoa's Kitchen (fails)** or **Sika Tailoring (passes)** to run the offline demo scans with no internet.

If `npm install` warns that install scripts were skipped and `better-sqlite3` fails to load, run `npm rebuild better-sqlite3` (or `npm install --allow-scripts`, depending on your npm version).

## Using MySQL instead of SQLite

```bash
mysql -u root -p < db/schema.mysql.sql
DB_DRIVER=mysql MYSQL_USER=root MYSQL_PASSWORD=yourpass MYSQL_DATABASE=accolmcheck npm start
```

Other variables: `MYSQL_HOST` (default 127.0.0.1), `MYSQL_PORT` (3306), `PORT` (3000), `SQLITE_FILE`.
On Windows PowerShell, set each variable first, for example `$env:DB_DRIVER="mysql"`.

## Pages and API

| Path | What it does |
|---|---|
| `/` | Scan form, demo buttons, results, the eight principles |
| `/report?id=…` | Printable, shareable report (use **Print or save as PDF**) |
| `/history` | Last 100 scans |
| `/demo-site/non-compliant/` and `/demo-site/compliant/` | The two fictional demo sites, for viewing |
| `POST /api/scan` | Body `{"url":"example.com"}` or `{"demo":"compliant"}`. Rate limited to 10 per minute per IP |
| `GET /api/scans`, `GET /api/scans/:id` | History and a single saved report |

## What it checks

| Check | Act 843 principle (s.17) | Section(s) |
|---|---|---|
| Page served over HTTPS | Data security safeguards | s.28 |
| Forms send personal data by POST to HTTPS | Data security safeguards | s.28 |
| Privacy notice published and linked beside forms | Openness | s.17, s.23, s.27 |
| Forms say why the data is needed | Specification of purpose | s.23 |
| Consent asked for, not pre-ticked | Lawfulness of processing | s.20 |
| Only necessary fields; special personal data flagged | Specification of purpose | s.19, s.37 |
| Marketing is a separate, unticked choice | Compatibility of further processing | s.40 |
| Trackers (Google Analytics/GTM, Meta Pixel, TikTok, Hotjar, Clarity) disclosed by a cookie notice | Openness | s.17 |
| Business name, address, email, phone shown | Accountability | s.27 |
| Data Protection Commission registration mentioned | Accountability | s.27, s.46 |
| Rights to access, correct, delete explained | Data subject participation | s.32, s.33 |
| Security headers: HSTS, CSP, X-Frame-Options/frame-ancestors, X-Content-Type-Options | Data security safeguards | s.28 |
| No http resources on an HTTPS page | Data security safeguards | s.28 |
| Email/phone fields use matching input types | Quality of information | s.26 |

Section numbers were checked against the Act text on GhaLII (https://ghalii.org/akn/gh/act/2012/843/eng@2012-05-18).
Score = weighted pass (1), check (0.5) and fix-now (0) results. 80+ is "Strong start", 50 to 79 is "Needs work", below 50 is "At risk".

## Security of the scanner itself

* Only `http`/`https`, only ports 80, 443, 8080 and 8443, and no `user:password@` URLs.
* `localhost`, `.local`, `.internal` and single-word hosts are refused. So are private, loopback, link-local (including cloud metadata 169.254.169.254), carrier-grade NAT, multicast and reserved IPv4/IPv6 ranges, including IPv4-mapped IPv6 and numeric tricks like `http://2130706433/`.
* The IP check runs inside the socket's DNS lookup, so the address that was checked is the address the app connects to (this protects against DNS rebinding).
* Up to 3 redirects are followed, and each one is validated again.
* There is an 8-second overall timeout and a 1.5 MB size limit, and the scanner reads at most 2 pages per scan (the page and its same-site privacy page).
* Rate limiting, a 4 KB JSON body limit and server-side validation of every input. All SQL uses prepared statements.
* Content from scanned sites is HTML-escaped before display. The app sends its own CSP, X-Frame-Options, nosniff and Referrer-Policy headers, and HSTS when served over HTTPS.

**Fake-IP networks.** Some VPNs and sandboxes answer every DNS query with an address in `198.18.0.0/15`, which the scanner blocks, so every live scan fails with "points to a private or internal address". On such a network, set `TRUSTED_EGRESS_CIDRS=198.18.0.0/15`. It is empty by default, and loopback and private ranges stay blocked even when it is set.

## Project layout

```
server.js            start the app
src/app.js           Express routes, headers, rate limit, validation
src/ssrf.js          URL validation and safe fetching
src/scanner.js       the checks (pure function, easy to test)
src/act843.js        the eight principles and section labels
src/scan.js          live scan: page plus privacy page
src/demo.js          offline demo scans from fixtures/
src/db.js            SQLite or MySQL with prepared statements
db/                  schema.sqlite.sql and schema.mysql.sql
public/              HTML, CSS, JS (Bootstrap 5 served locally from node_modules)
fixtures/            demo sites: non-compliant and compliant
test/                scanner, SSRF and API tests (node --test)
screenshots/         home, result, report, history, mobile, sample PDF
```

## Licence

MIT for the code. Bootstrap is MIT. The fonts (Bricolage Grotesque, Inter Tight, Space Mono) are under the SIL Open Font License.
