// Saves the four posters from site/poster.html into site/posters/, where /a3, /a4, /social and /message serve them.
//
//   npm install playwright && npx playwright install chromium   (once)
//   node tools/posters.cjs                                       (all four)
//   node tools/posters.cjs --closes "12 December" --honours a4   (options, then any formats to limit it to)
//
// --closes adds the closing date to the small print and --org the organiser ("NAME (RCN 20000000)"); --honours
// swaps the prize words for the honours ones, for when the game runs for honours (see "Before taking real money"
// in the README). The A3 and A4 are PDFs at the exact paper size with the fonts embedded; Social and Message are
// PNGs at their pixel sizes.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, '..', 'site');
const OUT = path.join(SITE, 'posters');
const JOBS = [
  { f: 'a3', file: 'preslink-arcade-a3.pdf', w: 1123, h: 1588 },
  { f: 'a4', file: 'preslink-arcade-a4.pdf', w: 794, h: 1123 },
  { f: 'social', file: 'preslink-arcade-social.png', w: 1080, h: 1350 },
  { f: 'message', file: 'preslink-arcade-message.png', w: 1200, h: 630 },
];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' };

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i < 0 ? '' : args.splice(i, 2)[1] || ''; };
const closes = opt('--closes');
const org = opt('--org');
const honours = args.includes('--honours') && !!args.splice(args.indexOf('--honours'), 1);
const only = args.filter((a) => JOBS.some((j) => j.f === a));

// A small static server over site/, so the fonts and pictures load exactly as they do online.
const server = http.createServer((req, res) => {
  const file = path.join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  fs.mkdirSync(OUT, { recursive: true });
  for (const j of JOBS.filter((x) => !only.length || only.includes(x.f))) {
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const q = new URLSearchParams({ f: j.f, render: '' });
    if (closes) q.set('closes', closes);
    if (org) q.set('org', org);
    if (honours) q.set('mode', 'honours');
    await page.goto(`${base}/poster.html?${q}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // Nothing may spill off the sheet.
    const spill = await page.evaluate(() => {
      const s = document.querySelector('.sheet').getBoundingClientRect();
      return [...document.querySelectorAll('.sheet *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && (r.right > s.right + .5 || r.bottom > s.bottom + .5 || r.left < s.left - .5); }).map((el) => el.className || el.tagName);
    });
    const out = path.join(OUT, j.file);
    if (j.file.endsWith('.pdf')) await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
    else await (await page.$('.sheet')).screenshot({ path: out });
    console.log(`${j.f}: ${path.relative(process.cwd(), out)}${spill.length ? ' | spills: ' + [...new Set(spill)].join(', ') : ''}${errors.length ? ' | errors: ' + errors.join(' / ') : ''}`);
    await page.close();
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
