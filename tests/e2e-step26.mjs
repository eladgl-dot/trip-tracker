// Step 26 browser checks (demo mode): receipt photo on a table → split Hebrew amounts joined, the check screen
// (coloured boxes, tap a field then a word), fixes go back into the form. Needs network the first time (the receipt reader).
// Usage: node e2e-step26.mjs <port> [outDir]
import { chromium } from 'playwright-core';
const BASE = `http://127.0.0.1:${process.argv[2] || 8791}/`;
const OUT = process.argv[3] || '.';
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', hasTouch: true, colorScheme: 'light' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
const noHScroll = async n => ok(`no horizontal scroll (${n})`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

// A Hebrew café receipt photographed on a dark table, tilted, with a shadow. The tip (11.00) is not the total (84.90).
const LINES = ['קפה לנדוור', 'דיזנגוף 112 תל אביב', '17/11/2026  14:32', 'הפוך גדול        18.00', 'כריך טונה        42.90',
  'מים מינרלים      12.00', 'טיפ              11.00', 'סה"כ לתשלום      84.90', 'תודה ולהתראות!'];
async function receiptPhoto() {
  const rp = await ctx.newPage();
  await rp.setViewportSize({ width: 900, height: 1300 });
  await rp.setContent(`<body style="margin:0;width:900px;height:1300px;background:radial-gradient(circle at 30% 20%,#6b5a48,#2b241d);display:flex;align-items:center;justify-content:center;overflow:hidden">
    <div style="position:relative;transform:rotate(-3deg);background:#f7f5ee;padding:40px 44px 60px;width:520px;box-shadow:0 20px 50px rgba(0,0,0,.6);font:28px/1.5 'Miriam Fixed','Courier New';color:#2a2a2a;direction:rtl">
    ${LINES.map((l, i) => `<div style="white-space:pre;${i === 0 ? 'text-align:center;font-weight:700;font-size:34px' : ''}">${l}</div>`).join('')}
    <div style="position:absolute;inset:0;background:linear-gradient(115deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.4) 100%)"></div></div></body>`);
  const buf = await rp.screenshot({ type: 'jpeg', quality: 85 }); await rp.close();
  return buf;
}

try {
  await page.addInitScript(() => { try { localStorage.setItem('tt-help-seen', '1'); } catch {} });
  await page.goto(BASE + '?demo');
  await page.waitForSelector('.trip-card');
  await page.locator('.trip-card').first().click();
  await page.waitForSelector('input.code'); await page.fill('input.code', '1234'); await page.click('.dialog button.primary');
  await page.waitForSelector('#stats .stat');

  await page.click('#fab'); await page.waitForSelector('#x-amt');
  const photo = await receiptPhoto();
  await page.click('#x-scan');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-scan=gal]')]);
  await chooser.setFiles({ name: 'cafe.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.waitForSelector('#x-scan-st.done', { timeout: 180000 });
  // The OCR may misread a digit (that is what the check screen is for), but the amount must come from the total line, not the tip.
  const amt = await page.inputValue('#x-amt');
  ok('Hebrew receipt: an amount, not the tip (11.00)', +amt > 0 && amt !== '11.00', amt);
  ok('Hebrew receipt: date', await page.inputValue('#x-date') === '2026-11-17', await page.inputValue('#x-date'));
  ok('check link shown after the scan', await page.locator('#x-scan-check').isVisible());
  await page.locator('.sheet').screenshot({ path: `${OUT}/26-sheet.png` });

  // the check screen
  await page.click('#x-scan-check'); await page.waitForSelector('.rc-dialog .rc-w');
  ok('check screen: every found word is a tap target', await page.locator('.rc-w').count() >= 15, String(await page.locator('.rc-w').count()));
  ok('check screen: amount box green (one word)', await page.locator('.rc-w.amount').count() === 1);
  ok('check screen: date box blue', await page.locator('.rc-w.date').count() === 1);
  ok('check screen: place boxes orange', await page.locator('.rc-w.place').count() >= 1);
  ok('no edge lines as words', await page.locator('.rc-w[aria-label="|"]').count() === 0);
  ok('place chip = the shop name', (await page.locator('.rc-chip.place b').textContent()) === 'קפה לנדוור', await page.locator('.rc-chip.place b').textContent());
  const onTotal = await page.evaluate(() => { // the green box sits on the same row as סה"כ
    const g = document.querySelector('.rc-w.amount').getBoundingClientRect();
    return [...document.querySelectorAll('.rc-w')].some(b => /סה/.test(b.getAttribute('aria-label')) && Math.abs(b.getBoundingClientRect().top - g.top) < g.height);
  });
  ok('green box is on the total line', onTotal);
  ok('chips show the values', +(await page.locator('.rc-chip.amount b').textContent()) === +amt && (await page.locator('.rc-chip.date b').textContent()) === '17/11/2026');
  // the boxes sit on the words: the green box is near the bottom-left area of the image, inside it
  const inside = await page.evaluate(() => { const i = document.querySelector('.rc-img img').getBoundingClientRect(); return [...document.querySelectorAll('.rc-w')].every(b => { const r = b.getBoundingClientRect(); return r.left >= i.left - 1 && r.right <= i.right + 1 && r.top >= i.top - 1 && r.bottom <= i.bottom + 1; }); });
  ok('all boxes inside the photo', inside);
  await noHScroll('check screen');
  await page.screenshot({ path: `${OUT}/26-check.png` });

  // fix the amount: tap the field, then 12.00
  await page.click('.rc-chip.amount');
  ok('field chosen → hint says what to tap', (await page.locator('.rc-hint').textContent()).includes('סכום'));
  const twelve = page.locator('.rc-w[aria-label="12.00"]');
  ok('12.00 found as one word', await twelve.count() === 1);
  await twelve.click();
  ok('green box moved to 12.00', await page.locator('.rc-w.amount').getAttribute('aria-label') === '12.00');
  ok('chip shows 12.00 ✓', (await page.locator('.rc-chip.amount b').textContent()) === '12.00' && await page.locator('.rc-chip.amount.chg').count() === 1);
  // a word that is not a number is refused for the amount
  await page.locator('.rc-w[aria-label="טיפ"]').click().catch(() => {});
  ok('a word is not an amount → kept 12.00', await page.locator('.rc-w.amount').getAttribute('aria-label') === '12.00');
  // place from two words
  await page.click('.rc-chip.place');
  // two Hebrew words that are not the shop name (the OCR may read a word slightly differently each time)
  const heb = await page.$$eval('.rc-w:not(.place)', bs => bs.map((b, i) => ({ i: +b.dataset.i, t: b.getAttribute('aria-label') })).filter(x => /^[\u05d0-\u05ea]{2,}$/.test(x.t)));
  const [wa, wb] = heb;
  await page.click(`.rc-w[data-i="${wa.i}"]`);
  await page.click(`.rc-w[data-i="${wb.i}"]`);
  ok('place: two words in tap order', (await page.locator('.rc-chip.place b').textContent()) === `${wa.t} ${wb.t}`, await page.locator('.rc-chip.place b').textContent());
  ok('place: both boxes orange, the old ones not', await page.locator('.rc-w.place').count() === 2);
  await page.click(`.rc-w[data-i="${wb.i}"]`);
  ok('place: tap again removes', (await page.locator('.rc-chip.place b').textContent()) === wa.t);
  await page.click(`.rc-w[data-i="${wb.i}"]`);
  await page.click('[data-zoom]');
  ok('zoom makes the photo wider than the screen', await page.evaluate(() => document.querySelector('.rc-img').getBoundingClientRect().width > innerWidth));
  await page.screenshot({ path: `${OUT}/26-check-zoom.png` });
  await page.click('[data-zoom]');
  await page.screenshot({ path: `${OUT}/26-check-fixed.png` });
  await page.click('.rc-panel [data-ok]'); await page.waitForTimeout(300);
  ok('done → amount in the form', await page.inputValue('#x-amt') === '12.00');
  ok('done → details in the form', await page.inputValue('#x-det') === `${wa.t} ${wb.t}`);
  ok('done → date untouched', await page.inputValue('#x-date') === '2026-11-17');
  ok('sheet still open', await page.locator('.sheet #x-amt').isVisible());

  // ✕ closes without changes
  await page.click('#x-scan-check'); await page.waitForSelector('.rc-dialog .rc-w');
  ok('opens again with the fixed picks', await page.locator('.rc-w.amount').getAttribute('aria-label') === '12.00');
  await page.click('.rc-chip.amount'); await page.locator('.rc-w[aria-label="18.00"]').click();
  await page.click('.rc-top [data-x]'); await page.waitForTimeout(300);
  ok('✕ keeps the form as it was', await page.inputValue('#x-amt') === '12.00');

  // English: the screen's own texts are translated
  await page.click('.sheet [data-x]'); await page.waitForTimeout(300);
  await page.goto(BASE + '?demo#/'); await page.waitForSelector('#langBtn');
  await page.click('#langBtn'); await page.click('[data-lang=en]'); await page.waitForTimeout(300);
  await page.locator('.trip-card').first().click(); await page.waitForSelector('#stats .stat');
  await page.click('#fab'); await page.waitForSelector('#x-amt');
  await page.click('#x-scan');
  const [ch2] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-scan=gal]')]);
  await ch2.setFiles({ name: 'cafe.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.waitForSelector('#x-scan-st.done', { timeout: 180000 });
  ok('English: check link', (await page.locator('#x-scan-check').textContent()).includes('Check on the receipt'));
  await page.click('#x-scan-check'); await page.waitForSelector('.rc-dialog .rc-w');
  const chrome = await page.locator('.rc-top h2, .rc-hint, .rc-chip small, .rc-panel [data-ok]').allTextContents();
  ok('English: screen texts', chrome.join(' ').includes('Tap a field') && chrome.join(' ').includes('Amount') && chrome.join(' ').includes('Done') && !/[֐-׿]/.test(chrome.join(' ')), chrome.join(' | '));
  await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/26-check-en.png` });
  await page.click('.rc-top [data-x]');
  await page.click('.sheet [data-x]'); await page.waitForTimeout(300);
  await page.goto(BASE + '?demo#/'); await page.waitForSelector('#langBtn');
  await page.click('#langBtn'); await page.click('[data-lang=he]'); await page.waitForTimeout(300);
  ok('no JS errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('script finished', false, e.message);
}
console.log(results.join('\n'));
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
await browser.close();
