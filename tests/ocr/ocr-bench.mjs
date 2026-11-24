// Compares receipt-reading variants on the fake photos: amount / date / place right, and how many of the receipt's words came out right.
// Usage: node ocr-bench.mjs <appDir> [variant names…]
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
const APP = process.argv[2], HERE = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const truth = JSON.parse(readFileSync(join(HERE, 'ocr-img/truth.json'), 'utf8'));
const VARIANTS = {
  old: { prep: { crop: false, mode: 'gray' }, td: 'td-int' },
  gray_tok: { prep: { crop: true, mode: 'gray' }, td: 'td-int', tokens: 1 },
  flat_tok: { prep: { crop: true, mode: 'flat' }, td: 'td-int', tokens: 1 },
  bw_tok: { prep: { crop: true, mode: 'bw' }, td: 'td-int', tokens: 1 },
  flat4: { prep: { crop: true, mode: 'flat' }, td: 'td-int', tokens: 1, psm: '4' },
  flat6: { prep: { crop: true, mode: 'flat' }, td: 'td-int', tokens: 1, psm: '6' },
  flat11: { prep: { crop: true, mode: 'flat' }, td: 'td-int', tokens: 1, psm: '11' },
  flatnc_tok: { prep: { crop: false, mode: 'flat' }, td: 'td-int', tokens: 1 },
  flatbest_tok: { prep: { crop: true, mode: 'flat' }, td: 'td-best', tokens: 1 },
};
const pick = process.argv.slice(3); const names = pick.length ? pick : Object.keys(VARIANTS);
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.jpg': 'image/jpeg', '.gz': 'application/gzip', '.json': 'application/json' };
const b = await chromium.launch({ channel: 'msedge', headless: true });
const page = await b.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
await page.route('http://bench.local/**', r => {
  const p = new URL(r.request().url()).pathname;
  let f = p.startsWith('/img/') ? join(HERE, process.env.SET || 'ocr-img', p.slice(5)) : p.startsWith('/td-') ? join(HERE, p.slice(1)) : join(APP, p);
  if (p === '/') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><body>bench</body>' });
  if (!existsSync(f)) return r.fulfill({ status: 404, body: '' });
  r.fulfill({ contentType: TYPES[extname(f)] || 'application/octet-stream', body: readFileSync(f), headers: { 'access-control-allow-origin': '*' } });
});
await page.goto('http://bench.local/');
const norm = s => s.replace(/[״"']/g, '"').replace(/\s+/g, ' ').trim();
for (const name of names) {
  const v = VARIANTS[name]; const t0 = Date.now();
  const res = await page.evaluate(async ({ v, truth }) => {
    const O = await import('/js/ocr.js'), L = await import('/js/logic.js');
    await O.resetWorker();
    O.OCR_CFG.prep = v.prep; O.OCR_CFG.psm = v.psm || ''; O.OCR_CFG.rotateAuto = v.rotateAuto; O.OCR_CFG.langPath = 'http://bench.local/' + v.td;
    const out = [];
    for (const r of truth) {
      const blob = await (await fetch('/img/' + r.id + '.jpg')).blob();
      const got = await O.readReceipt(blob);
      const p = v.tokens ? L.parseReceipt(L.receiptText(L.receiptTokens(got.words)), { currency: 'ILS' }) : L.parseReceipt(got.text, { currency: 'ILS' });
      out.push({ id: r.id, text: v.tokens ? L.receiptText(L.receiptTokens(got.words)) : got.text, words: got.words.length, amount: p.amount, date: p.date, details: p.details, imgLen: got.image.length });
    }
    return out;
  }, { v, truth });
  let a = 0, d = 0, pl = 0, wordHit = 0, wordAll = 0;
  for (const r of res) {
    const T = truth.find(x => x.id === r.id);
    a += r.amount === T.amount; d += r.date === T.date; pl += norm(r.details).includes(norm(T.place));
    const said = new Set(norm(r.text).split(' '));
    for (const w of T.lines.join(' ').split(/\s+/)) { if (!w) continue; wordAll++; wordHit += said.has(norm(w)); }
  }
  console.log(`${name.padEnd(13)} amount ${a}/6  date ${d}/6  place ${pl}/6  words ${Math.round(100 * wordHit / wordAll)}%  (${Math.round((Date.now() - t0) / 1000)}s)`);
  if (process.env.SHOW) for (const r of res) console.log('  ', r.id, '|', r.amount, r.date, '|', r.details, '| words', r.words, process.env.SHOW === '2' ? '\n' + r.text : '');
}
await b.close();
