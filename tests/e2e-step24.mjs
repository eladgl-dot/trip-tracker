// Step 24 browser checks (demo mode): trip theme, countries + flags, view currency, receipt scan.
// Needs network (past rates + the receipt reader download). Usage: node e2e-step24.mjs <port> [outDir]
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
const shot = n => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: false });
const noHScroll = async n => ok(`no horizontal scroll (${n})`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

try {
  await page.addInitScript(() => { try { localStorage.setItem('tt-help-seen', '1'); } catch {} });
  await page.goto(BASE + '?demo');
  await page.waitForSelector('.trip-card');
  ok('home follows the phone (auto)', await theme() === 'auto');

  // open the demo trip
  await page.locator('.trip-card').first().click();
  await page.waitForSelector('input.code'); await page.fill('input.code', '1234'); await page.click('.dialog button.primary');
  await page.waitForSelector('#stats .stat');
  ok('old trip without a theme = light', await theme() === 'light');
  ok('no view currency yet: plain currency chip, no switch', await page.locator('#hero .cur-sw').count() === 0 && await page.locator('#hero .chip.mint').count() === 1);

  // trip form: new fields
  await page.click('#hero [data-edit-trip]'); await page.waitForSelector('#f-cty-in');
  ok('form: countries, view currency, theme fields', await page.locator('#f-vcur').count() === 1 && await page.locator('[data-th]').count() === 3);
  ok('form: label says מטבע הזנה', (await page.locator('label[for=f-cur]').textContent()).includes('מטבע הזנה'));
  await page.fill('#f-cty-in', 'איטל');
  ok('country search finds Italy with a flag', (await page.locator('#f-cty-list [data-cadd=IT]').count()) === 1 && await page.locator('#f-cty-list [data-cadd=IT] img.flag').count() === 1);
  await page.press('#f-cty-in', 'Enter');
  ok('Enter adds the first match', await page.locator('#f-cty .chip').count() === 1);
  await page.fill('#f-cty-in', 'fra'); await page.click('#f-cty-list [data-cadd=FR]');
  ok('English search works too (fra → France)', await page.locator('#f-cty .chip').count() === 2);
  await page.click('#f-cty [data-crm="1"]');
  ok('✕ removes a country', await page.locator('#f-cty .chip').count() === 1);
  await page.fill('#f-name', 'טיול לצרפת'); await page.waitForTimeout(100);
  ok('suggestion from the trip name (צרפת)', await page.locator('#f-cty-sug [data-cadd=FR]').count() === 1);
  await page.click('#f-cty-sug [data-cadd=FR]');
  ok('tap the suggestion adds it', await page.locator('#f-cty .chip').count() === 2);
  await page.selectOption('#f-vcur', 'ILS');
  await page.click('[data-th=dark]');
  await page.locator('.sheet').screenshot({ path: `${OUT}/24-form.png` });
  await page.click('.sheet button.primary'); await page.waitForTimeout(600);

  // theme
  ok('trip theme dark applied', await theme() === 'dark');
  ok('dark background', (await bg()) === 'rgb(11, 18, 32)', await bg());
  ok('trip header shows 2 flags', await page.locator('#hero .tb-meta img.flag').count() === 2);

  // view currency
  await page.waitForSelector('#hero .cur-sw');
  await page.waitForFunction(() => document.querySelector('#stats .stat.big .money')?.textContent.includes('₪'), null, { timeout: 15000 }).catch(() => {});
  const net = await page.locator('#stats .stat.big .money').textContent();
  ok('totals in ₪ (view currency)', net.includes('₪'), net);
  const n = Number(net.replace(/[^\d.]/g, ''));
  ok('₪ total ≈ €1,630.20 × 3.3–4.6', n > 1630.2 * 3.3 && n < 1630.2 * 4.6, String(n));
  ok('note: rate of each day', (await page.locator('#stats .view-note').textContent()).includes('השער של היום'));
  ok('switch: ₪ pressed', await page.locator('.cur-sw [data-cur=ILS]').getAttribute('aria-pressed') === 'true');
  const card = page.locator('#txList .tx').first();
  ok('expense card: ₪ first, € under it', (await card.locator('.amt .money').first().textContent()).includes('₪') && (await card.locator('.amt small').textContent()).includes('€'));
  ok('settle in ₪', (await page.locator('#settle .bal .money').first().textContent()).includes('₪'));
  await noHScroll('trip dark ₪'); await shot('24-trip-dark-ils');
  await page.click('.cur-sw [data-cur=EUR]'); await page.waitForTimeout(200);
  ok('switch to € shows input currency', (await page.locator('#stats .stat.big .money').textContent()).includes('1,630.20'));
  ok('choice kept on this phone', await page.evaluate(() => Object.entries(localStorage).some(([k, v]) => k.startsWith('tt-view:') && v === 'in')));
  await page.reload(); await page.waitForSelector('#stats .stat'); await page.waitForTimeout(300);
  ok('after reload still €', (await page.locator('#stats .stat.big .money').textContent()).includes('1,630.20'));
  await page.click('.cur-sw [data-cur=ILS]'); await page.waitForTimeout(800);
  ok('back to ₪', (await page.locator('#stats .stat.big .money').textContent()).includes('₪'));
  ok('past rates kept on the phone', await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('tt-day:EURILS'))));

  // receipt scan
  await page.click('#fab'); await page.waitForSelector('#x-amt');
  ok('scan bar on a new expense', await page.locator('#x-scan').isVisible() && (await page.locator('#x-scan').textContent()).includes('סריקת קבלה'));
  const h = await page.locator('#x-scan').evaluate(b => b.getBoundingClientRect().height);
  ok('scan bar is thin (≤ 48px)', h <= 48, String(h));
  await page.locator('.sheet').screenshot({ path: `${OUT}/24-sheet-dark.png` });
  // make a receipt picture
  const rp = await ctx.newPage();
  await rp.setViewportSize({ width: 420, height: 380 });
  await rp.setContent(`<body style="margin:0;background:#fff"><pre style="font:22px/1.4 'Courier New',monospace;padding:24px;color:#111">BAR CENTRALE
Via Roma 12, Firenze
04/10/2026  13:42
2 x Cappuccino    7.00
1 x Cornetto      3.00
TOTALE EUR       10.00</pre></body>`);
  const receipt = await rp.screenshot({ type: 'png' }); await rp.close();
  await page.setInputFiles('#x-scan-in', { name: 'receipt.png', mimeType: 'image/png', buffer: receipt });
  await page.waitForSelector('#x-scan-st.done', { timeout: 120000 });
  const stTxt = await page.locator('#x-scan-st').textContent();
  ok('scan finished with filled fields', stTxt.includes('מולא מהקבלה'), stTxt);
  ok('scan: amount 10.00', await page.inputValue('#x-amt') === '10.00', await page.inputValue('#x-amt'));
  ok('scan: date 2026-10-04', await page.inputValue('#x-date') === '2026-10-04', await page.inputValue('#x-date'));
  ok('scan: details from the shop line', (await page.inputValue('#x-det')).toUpperCase().includes('BAR CENTRALE'), await page.inputValue('#x-det'));
  ok('scan: category café', await page.inputValue('#x-cat') === 'מסעדות ובתי קפה', await page.inputValue('#x-cat'));
  ok('scan: fields marked yellow', await page.locator('.ocr').count() >= 3);
  ok('scan: receipt photo attached', await page.locator('#x-photos .thumb img').count() === 1);
  await page.locator('.sheet').screenshot({ path: `${OUT}/24-scan-filled.png` });
  await page.click('#x-save'); await page.waitForTimeout(500);
  ok('saved', (await page.locator('#toast').textContent()).includes('נשמר'));

  // edit: no scan bar
  await page.locator('#txList [data-edit]').first().click(); await page.waitForSelector('#x-amt');
  ok('no scan bar when editing', await page.locator('#x-scan').count() === 0);
  await page.click('.sheet [data-x]'); await page.waitForTimeout(300);

  // budget page follows the theme and currency
  // home: flags + "by country"
  await page.goto(BASE + '?demo#/'); await page.waitForSelector('.trip-card');
  ok('home back to auto theme', await theme() === 'auto');
  ok('home card shows flags', await page.locator('.trip-card img.flag').count() >= 2);
  ok('home card shows € → ₪', (await page.locator('.trip-card .chip.mint').first().textContent()).includes('→'));
  await page.click('#groupBtn'); await page.click('[data-group=country]'); await page.waitForTimeout(200);
  const heads = await page.locator('.sec').allTextContents();
  ok('grouping "by country" has a "כמה מדינות" section', heads.some(t => t.includes('כמה מדינות')), heads.join(' | '));
  await page.fill('#tripSearch', 'France'); await page.waitForTimeout(150);
  ok('search by country name (English)', await page.locator('.trip-card').count() >= 1);
  await page.fill('#tripSearch', '');
  await noHScroll('home'); await shot('24-home-country');

  // dark phone: home goes dark
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(100);
  ok('dark phone → dark home', (await bg()) === 'rgb(11, 18, 32)', await bg());
  await shot('24-home-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  ok('no JS errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('script finished', false, e.message);
}
console.log(results.join('\n'));
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
await browser.close();
