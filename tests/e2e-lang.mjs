// Step 25 browser checks (demo mode): 🌐 language pill, English / Russian, direction, remembered per phone.
// Prints the Hebrew text still on screen in English mode (should be trip data only). Usage: node e2e-lang.mjs <port> [outDir]
import { chromium } from 'playwright-core';
const BASE = `http://127.0.0.1:${process.argv[2] || 8791}/`;
const OUT = process.argv[3] || '.';
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
const shot = n => page.screenshot({ path: `${OUT}/${n}.png` });
const noHScroll = async n => ok(`no horizontal scroll (${n})`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
const dir = () => page.evaluate(() => document.documentElement.dir);
// Hebrew text nodes on screen, minus the trip's own data (names, places, details people typed).
const hebrewLeft = () => page.evaluate(() => {
  const out = new Set();
  const w = document.createTreeWalker(document.querySelector('#app'), NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    const s = n.textContent.trim();
    if (!/[֐-׿]/.test(s)) continue;
    const el = n.parentElement;
    if (el.closest('bdi, .tb-t b, .ava, h1, h3, .tx .t, .tx .com, .geo-link, .chips .chip, .person b, .members, .xfer b, .filter button, .tag, .bd-name, .pn, option')) continue;
    out.add(s.slice(0, 60));
  }
  for (const el of document.querySelectorAll('#app [placeholder], #app [aria-label], #app [title]'))
    for (const a of ['placeholder', 'aria-label', 'title']) { const v = el.getAttribute(a); if (v && /[֐-׿]/.test(v) && !el.closest('.tx, .person, .trip-card')) out.add(`[${a}] ${v.slice(0, 50)}`); }
  return [...out];
});

try {
  await page.addInitScript(() => { try { localStorage.setItem('tt-help-seen', '1'); } catch {} });
  await page.goto(BASE + '?demo');
  await page.waitForSelector('.trip-card');
  ok('Hebrew phone → Hebrew, right-to-left', await dir() === 'rtl' && (await page.locator('#langBtn').textContent()).includes('עב'));
  await page.click('#langBtn');
  ok('pill opens a menu with 3 languages', await page.locator('#langMenu [data-lang]').count() === 3 && (await page.locator('#langMenu').textContent()).includes('Русский'));
  ok('current language is checked', await page.locator('#langMenu [data-lang=he]').getAttribute('aria-checked') === 'true');
  await page.screenshot({ path: `${OUT}/25-menu-he.png` });
  await page.click('[data-lang=en]'); await page.waitForTimeout(300);
  ok('English → left-to-right', await dir() === 'ltr' && await page.evaluate(() => document.documentElement.lang) === 'en');
  ok('English home texts', (await page.locator('.topbar').textContent()).includes('Shared trip expenses') && (await page.locator('#groupBtn').textContent()).includes('Group:'));
  ok('pill shows EN', (await page.locator('#langBtn').textContent()).includes('EN'));
  ok('page title in English', (await page.title()).startsWith('Tiyulon'));
  ok('dates dd/mm/yyyy', /\d{2}\/\d{2} – \d{2}\/\d{2}\/\d{4}/.test(await page.locator('.trip-card').first().textContent()));
  const fab = await page.locator('#newTrip').boundingBox();
  ok('+ button on the right in English', fab.x > 390 / 2 - 20, String(fab.x));
  await noHScroll('home en'); await shot('25-home-en');
  ok('home: no leftover Hebrew', (await hebrewLeft()).length === 0, (await hebrewLeft()).join(' | '));

  // trip page in English
  await page.locator('.trip-card').first().click();
  await page.waitForSelector('input.code'); await page.fill('input.code', '1234'); await page.click('.dialog button.primary');
  await page.waitForSelector('#stats .stat');
  ok('trip tabs in English', (await page.locator('[data-tab=list]').textContent()).includes('Expenses'));
  ok('net balance label', (await page.locator('#stats .stat.big .muted').first().textContent()).includes('Net balance'));
  ok('categories translated in the chart', (await page.locator('#chart').textContent()).match(/Restaurants|Lodging|Flights|Museums|Supermarket|Taxis|Public transport|Attractions/) !== null);
  ok('day headings dd/mm/yyyy with English weekday', /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w* \d{2}\/\d{2}\/\d{4}/.test(await page.locator('.day-head').first().textContent()), await page.locator('.day-head').first().textContent());
  ok('back arrow points left', (await page.locator('#hero a.ib').first().textContent()).trim() === '←');
  await noHScroll('trip en'); await shot('25-trip-en');
  const leftTrip = await hebrewLeft();
  ok('trip page: no leftover Hebrew', leftTrip.length === 0, leftTrip.join(' | '));
  await page.click('[data-tab=settle]'); await page.waitForTimeout(200);
  ok('settle in English', (await page.locator('#settle').textContent()).includes('Who pays whom'));
  const leftSettle = await hebrewLeft();
  ok('settle: no leftover Hebrew', leftSettle.length === 0, leftSettle.join(' | '));
  await shot('25-settle-en');
  await page.click('[data-tab=list]');
  // add-expense sheet
  await page.click('#fab'); await page.waitForSelector('#x-amt');
  ok('sheet in English', (await page.locator('.sheet h2').textContent()).includes('Add entry') && (await page.locator('#x-scan').textContent()).includes('Scan receipt'));
  ok('category list in English', (await page.locator('#x-cat').textContent()).includes('Restaurants & cafés'));
  await page.click('#x-save'); await page.waitForTimeout(200);
  ok('errors in English', (await page.locator('.sheet .err').allTextContents()).join(' ').includes('Enter an amount above zero'));
  await page.locator('.sheet').screenshot({ path: `${OUT}/25-sheet-en.png` });
  await page.click('.sheet [data-x]'); await page.waitForTimeout(300);
  // edit trip form
  await page.click('#hero [data-edit-trip]'); await page.waitForSelector('#f-name');
  ok('trip form in English', (await page.locator('label[for=f-cur]').textContent()).includes('Input currency'));
  await page.fill('#f-cty-in', 'Ital');
  ok('country names in English', (await page.locator('#f-cty-list').textContent()).includes('Italy'));
  const leftForm = await page.evaluate(() => [...document.querySelectorAll('.sheet label, .sheet .lbl, .sheet .muted, .sheet button')].map(e => e.textContent.trim()).filter(s => /[֐-׿]/.test(s) && !/^⭐?\s*\S+\s*✕?$/.test(s)));
  ok('trip form: no leftover Hebrew', leftForm.length === 0, leftForm.join(' | '));
  await page.click('.sheet [data-x]'); await page.waitForTimeout(300);

  // Russian, remembered after reload
  await page.goto(BASE + '?demo#/'); await page.waitForSelector('#langBtn');
  await page.click('#langBtn'); await page.click('[data-lang=ru]'); await page.waitForTimeout(300);
  ok('Russian home', (await page.locator('.topbar').textContent()).includes('Общие расходы поездки') && await dir() === 'ltr');
  await page.reload(); await page.waitForSelector('#langBtn');
  ok('choice kept after reload', (await page.locator('#langBtn').textContent()).includes('RU'));
  await page.locator('.trip-card').first().click(); await page.waitForSelector('#stats .stat');
  ok('Russian trip page', (await page.locator('[data-tab=list]').textContent()).includes('Расходы'));
  await noHScroll('trip ru'); await shot('25-trip-ru');
  const leftRu = await hebrewLeft();
  ok('Russian: no leftover Hebrew', leftRu.length === 0, leftRu.join(' | '));

  // admin panel stays Hebrew
  await page.goto(BASE + '?demo#/'); await page.waitForSelector('#adminBtn');
  await page.click('#adminBtn'); await page.waitForSelector('input.code'); await page.fill('input.code', '363636'); await page.click('.dialog button.primary');
  await page.waitForSelector('#a-trip', { timeout: 5000 }).catch(() => {});
  ok('admin panel stays Hebrew, right-to-left', await dir() === 'rtl' && (await page.locator('#app').textContent()).includes('ניהול'));
  await page.goto(BASE + '?demo#/'); await page.waitForSelector('#langBtn');
  ok('leaving admin: back to Russian', await dir() === 'ltr');

  // back to Hebrew
  await page.click('#langBtn'); await page.click('[data-lang=he]'); await page.waitForTimeout(300);
  ok('back to Hebrew, right-to-left', await dir() === 'rtl' && (await page.locator('.topbar').textContent()).includes('הוצאות משותפות'));
  ok('no JS errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('script finished', false, e.message);
}
console.log(results.join('\n'));
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
await browser.close();
