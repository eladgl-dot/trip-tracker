import { chromium } from 'playwright-core';
const BASE = 'http://127.0.0.1:8765/';
const OUT = process.argv[2] || '.';
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'he-IL', hasTouch: true,
  permissions: ['geolocation'], geolocation: { latitude: 41.8986, longitude: 12.4769, accuracy: 50 } });
const ICON = 'D:/New Projects/Local_AI_projects/Trip_expense_tracker/app/icons/icon-512.png';
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const shot = n => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const noHScroll = async n => ok(`no horizontal scroll (${n})`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
const tapRing = async host => { const b = await page.locator(host + ' .donut').boundingBox(); await page.mouse.click(b.x + b.width / 2 + b.width * 0.379, b.y + b.height / 2); };
const toastText = async () => (await page.locator('#toast').textContent()).trim();

try {
  await page.goto(BASE + '?demo');
  await page.waitForSelector('.trip-card', { timeout: 15000 });
  ok('home shows seeded trip', await page.locator('.trip-card').count() === 1);
  ok('demo banner', await page.locator('.demo-bar').isVisible());
  await noHScroll('home'); await shot('01-home');

  ok('version shown on home', /גרסה\s*\d+\.\d+/.test(await page.locator('.version').textContent()), (await page.locator('.version').textContent()).trim());

  // install banner: shown only when the browser offers install (simulated Android offer)
  ok('no install banner without an offer', await page.locator('.install').count() === 0);
  const offer = () => page.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.prompted = true; }; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); dispatchEvent(e); });
  await offer(); await page.waitForTimeout(100);
  ok('install banner appears on offer', await page.locator('.install').isVisible());
  await noHScroll('install banner'); await shot('01b-install');
  await page.click('#installGo'); await page.waitForTimeout(200);
  ok('"התקנה" opens the browser install window', await page.evaluate(() => window.prompted === true));
  ok('declined install hides banner', await page.locator('.install').count() === 0);
  await page.evaluate(() => localStorage.removeItem('tt-install-hide'));
  await offer(); await page.waitForTimeout(100);
  await page.click('#installX'); await page.waitForTimeout(100);
  const snooze = await page.evaluate(() => (+localStorage['tt-install-hide'] - Date.now()) / 86400000);
  ok('✕ hides banner for 7 days', await page.locator('.install').count() === 0 && snooze > 6.9 && snooze <= 7, snooze.toFixed(2));
  await offer(); await page.waitForTimeout(100);
  ok('stays hidden while snoozed', await page.locator('.install').count() === 0);

  // PIN
  await page.locator('.trip-card').click();
  await page.waitForSelector('input.code');
  await page.fill('input.code', '0000'); await page.click('.dialog button.primary');
  await page.waitForTimeout(300);
  ok('wrong PIN rejected', (await page.locator('.dialog .err').textContent()).includes('שגוי'));
  await page.fill('input.code', '1234'); await page.click('.dialog button.primary');
  await page.waitForSelector('#stats .stat');
  ok('right PIN opens trip', page.url().includes('#/trip/'));
  ok('3-day access saved', await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('tt-access:') && +localStorage[k] - Date.now() > 2.9 * 86400000)));
  const net = await page.locator('#stats .stat.big .money').textContent();
  ok('net = 1,630.20 (seed data)', net.includes('1,630.20'), net);
  await noHScroll('trip'); await shot('02-trip');

  // charts
  await tapRing('#chart');
  const center = await page.locator('#chart .donut-center').textContent();
  ok('tap slice shows sum + %', center.includes('%') && center.includes('לינה'), center.trim());
  await page.locator('.legend button').nth(1).click();
  ok('tap legend row', (await page.locator('#chart .donut-center').textContent()).includes('השכרת רכב'));
  await page.click('[data-ch=day]');
  await page.locator('.bar').first().click();
  const tip = await page.locator('.tip').textContent();
  ok('tap bar shows day details', tip.includes('תנועות'), tip.trim());
  await shot('03-bars');

  // search
  await page.fill('#search', 'רכבל');
  ok('search filters', await page.locator('#txList .tx').count() === 1);
  await page.fill('#search', 'אלעד');
  ok('search by payer (3 paid + 1 refund)', await page.locator('#txList .tx').count() === 4);
  await page.fill('#search', '');

  // add expense in USD with new category
  await page.click('#fab');
  await page.waitForSelector('#x-amt');
  ok('add sheet defaults to expense', await page.locator('[data-t=expense][aria-pressed=true]').count() === 1);
  ok('paidBy defaults to first participant', await page.inputValue('#x-who') === 'אלעד');
  await page.fill('#x-amt', '50');
  await page.selectOption('#x-cur', 'USD');
  await page.waitForFunction(() => /1 USD = [\d.]+ EUR/.test(document.querySelector('#x-rate')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  const rateTxt = await page.locator('#x-rate').textContent();
  ok('live USD→EUR rate shown', /1 USD = [\d.]+ EUR/.test(rateTxt), rateTxt.trim().slice(0, 80));
  await shot('04-add');
  ok('category is a dropdown, nothing chosen yet', await page.locator('select#x-cat').count() === 1 && await page.inputValue('#x-cat') === '');
  ok('first dropdown row adds a new category', (await page.locator('#x-cat option').nth(1).textContent()).includes('להוסיף קטגוריה חדשה'));
  ok('new-category field hidden at first', !(await page.locator('#x-newcat').isVisible()));
  await page.selectOption('#x-cat', { index: 1 });
  ok('choosing "add new" opens text field + button', await page.locator('#x-newcat-in').isVisible() && await page.locator('#x-newcat-add').isVisible());
  await page.click('#x-save'); await page.waitForTimeout(200);
  ok('save with empty new-category box shows category error', await page.locator('.sheet [data-f=category].invalid').count() === 1);
  await page.fill('#x-newcat-in', 'רכבל הרים'); await page.keyboard.press('Enter');
  ok('Enter adds it (does not save the form)', await page.locator('.sheet').count() === 1 && !(await page.locator('#x-newcat').isVisible()));
  ok('new category is selected in the dropdown', await page.inputValue('#x-cat') === 'רכבל הרים');
  await shot('04b-category');
  await page.fill('#x-det', 'רכבל לפסגה');
  await page.fill('#x-com', 'בדיקה');
  await page.click('#x-save');
  await page.waitForTimeout(400);
  ok('saved expense appears', (await page.locator('#txList').textContent()).includes('רכבל לפסגה'));
  ok('USD row shows converted', (await page.locator('#txList .tx', { hasText: 'רכבל לפסגה' }).textContent()).includes('≈'));
  ok('new category saved globally', await page.evaluate(() => JSON.parse(localStorage['tt-demo-db']).categories.includes('רכבל הרים')));

  // validation
  await page.click('#fab'); await page.waitForSelector('#x-amt');
  await page.click('#x-save');
  ok('empty form shows errors', await page.locator('.sheet .invalid').count() >= 3);
  await page.click('.sheet [data-x]'); await page.waitForTimeout(250);

  // edit
  await page.locator('#txList .tx', { hasText: 'רכבל לפסגה' }).locator('[data-edit]').click();
  await page.waitForSelector('#x-amt');
  ok('edit keeps saved rate', (await page.locator('#x-rate').textContent()).includes('השער ששמור'));
  await page.fill('#x-amt', '60'); await page.click('#x-save'); await page.waitForTimeout(400);
  ok('edit saved', (await page.locator('#txList .tx', { hasText: 'רכבל לפסגה' }).textContent()).includes('60.00'));

  // the two big add buttons are gone; income is chosen inside the sheet
  ok('top add buttons removed', await page.locator('#hero [data-add], #hero .add-top').count() === 0);
  await page.click('#fab'); await page.waitForSelector('#x-amt');
  await page.click('[data-t=income]');
  ok('income chosen in the sheet', await page.locator('[data-t=income][aria-pressed=true]').count() === 1);
  await page.click('.sheet [data-x]'); await page.waitForTimeout(250);

  // delete
  await page.locator('#txList .tx', { hasText: 'רכבל לפסגה' }).locator('[data-del]').click();
  await page.click('.dialog [data-ok]'); await page.waitForTimeout(400);
  ok('delete removes row', !(await page.locator('#txList').textContent()).includes('רכבל לפסגה'));

  // settle
  await page.click('[data-tab=settle]');
  ok('balance cards = 4', await page.locator('#settle .person').count() === 4);
  const xfers = await page.locator('#settle .xfer').count();
  ok('transfers shown', xfers >= 1 && xfers <= 3, `${xfers}`);
  const sum = await page.evaluate(() => [...document.querySelectorAll('#settle .bal .money')].reduce((a, e) => a + parseFloat(e.textContent.replace(/[^\d.\-−]/g, '').replace('−', '-')), 0));
  ok('balances sum to ~0', Math.abs(sum) < 0.05, sum.toFixed(2));
  await noHScroll('settle'); await shot('05-settle');
  await page.click('[data-who="ליב"]');
  ok('filter dims others', await page.locator('#settle .person.dim').count() === 3);
  await tapRing('#pie2');
  ok('settle pie tappable', (await page.locator('#pie2 .donut-center').textContent()).includes('%'));
  await shot('06-settle-filter');

  // edit trip
  await page.click('#editTrip'); await page.waitForSelector('#f-name');
  await page.locator('#f-chips [data-rm]').first().click(); // אלעד has transactions
  ok('cannot remove participant with transactions', (await toastText()).includes('אי אפשר'));
  await page.fill('#f-person', 'דנה'); await page.click('#f-add');
  await page.click('.sheet button.primary'); await page.waitForTimeout(400);
  ok('participant added', (await page.locator('#hero').textContent()).includes('דנה'));

  // currency change EUR -> ILS
  await page.click('#editTrip'); await page.waitForSelector('#f-cur');
  await page.selectOption('#f-cur', 'ILS'); await page.click('.sheet button.primary');
  await page.waitForSelector('.dialog [data-ok]', { timeout: 15000 });
  await page.click('.dialog [data-ok]'); await page.waitForTimeout(600);
  const net2 = await page.locator('#stats .stat.big .money').textContent().catch(() => '');
  await page.click('[data-tab=list]');
  const net3 = await page.locator('#stats .stat.big .money').textContent();
  ok('currency switched to ILS and amounts converted', net3.includes('₪') && !net3.includes('1,630.20'), net3);

  // print
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#pdf');
  await page.emulateMedia({ media: 'print' });
  ok('print report built', (await page.locator('#print').textContent()).includes('כל התנועות'));
  await shot('07-print');
  await page.emulateMedia({ media: 'screen' });

  // location + photos
  const txt = sel => page.locator(sel).textContent();
  ok('seeded row shows address link', (await txt('#txList')).includes('לאציזה'));
  await page.click('#fab'); await page.waitForSelector('#x-geo');
  await page.waitForFunction(() => document.querySelector('#x-geo').textContent.includes('±50'), null, { timeout: 8000 }).catch(() => {});
  ok('GPS chip shows first accuracy', (await txt('#x-geo')).includes('±50 מ׳'), (await txt('#x-geo')).trim());
  await ctx.setGeolocation({ latitude: 41.8987, longitude: 12.4768, accuracy: 8 });
  await page.waitForFunction(() => document.querySelector('#x-geo').textContent.includes('±8'), null, { timeout: 8000 }).catch(() => {});
  ok('GPS chip updates accuracy live', (await txt('#x-geo')).includes('±8 מ׳'));
  const icon = (await import('node:fs')).readFileSync(ICON);
  await page.setInputFiles('#x-gal', [{ name: 'a.png', mimeType: 'image/png', buffer: icon }, { name: 'b.png', mimeType: 'image/png', buffer: icon }]);
  await page.waitForFunction(() => document.querySelectorAll('#x-photos .thumb img').length === 2, null, { timeout: 8000 }).catch(() => {});
  ok('two photos shown as thumbs', await page.locator('#x-photos .thumb img').count() === 2);
  ok('photo was shrunk to JPEG', (await page.locator('#x-photos img').first().getAttribute('src')).startsWith('data:image/jpeg'));
  await page.setInputFiles('#x-gal', [{ name: 'c.png', mimeType: 'image/png', buffer: icon }, { name: 'd.png', mimeType: 'image/png', buffer: icon }]);
  await page.waitForFunction(() => document.querySelectorAll('#x-photos .thumb img').length === 3, null, { timeout: 8000 }).catch(() => {});
  ok('max 3 photos, add buttons hidden', await page.locator('#x-photos .thumb img').count() === 3 && await page.locator('[data-gal]').count() === 0);
  await page.fill('#x-amt', '12'); await page.selectOption('#x-cat', 'מסעדות ובתי קפה');
  await page.fill('#x-det', 'קפה ברומא'); await shot('11-geo-photos');
  await page.click('#x-save'); await page.waitForTimeout(500);
  const row = page.locator('#txList .tx', { hasText: 'קפה ברומא' });
  ok('row shows photo count', (await row.textContent()).includes('📷 3'));
  ok('saved last GPS fix', await page.evaluate(() => Object.values(JSON.parse(localStorage['tt-demo-db']).expenses).flatMap(o => Object.values(o)).find(e => e.details === 'קפה ברומא')?.location?.acc === 8));
  await page.waitForFunction(() => [...document.querySelectorAll('#txList .tx')].find(r => r.textContent.includes('קפה ברומא'))?.querySelector('.geo-link')?.textContent.includes('רומא'), null, { timeout: 15000 }).catch(() => {});
  const addr = (await row.locator('.geo-link').textContent()).trim();
  ok('address looked up (Hebrew)', addr.includes('רומא'), addr);
  await row.locator('[data-pics]').click(); await page.waitForSelector('.viewer img');
  ok('viewer opens at 1/3', (await txt('.vbar .num')) === '1 / 3');
  await page.click('.vbar [data-n]'); ok('viewer next → 2/3', (await txt('.vbar .num')) === '2 / 3');
  await page.click('.vbar [data-x]'); await page.waitForTimeout(250);
  await row.locator('[data-edit]').click(); await page.waitForFunction(() => document.querySelectorAll('#x-photos .thumb img').length === 3, null, { timeout: 5000 }).catch(() => {});
  ok('edit loads saved photos', await page.locator('#x-photos .thumb img').count() === 3);
  ok('edit shows saved address', (await txt('#x-geo')).includes('רומא'));
  await page.locator('#x-photos [data-rm]').first().click();
  await page.click('#x-save'); await page.waitForTimeout(400);
  ok('removing a photo updates count', (await row.textContent()).includes('📷 2'));
  ok('removed photo deleted from store', await page.evaluate(() => Object.values(JSON.parse(localStorage['tt-demo-db']).photos).flatMap(o => Object.values(o)).length === 2));
  await row.locator('[data-del]').click(); await page.click('.dialog [data-ok]'); await page.waitForTimeout(400);
  ok('deleting expense deletes its photos', await page.evaluate(() => Object.values(JSON.parse(localStorage['tt-demo-db']).photos).flatMap(o => Object.values(o)).length === 0));
  // permission denied → clear message, saving still works
  await ctx.clearPermissions();
  await page.click('#fab'); await page.waitForSelector('#x-geo');
  await page.waitForFunction(() => /אין הרשאה|ללא מיקום/.test(document.querySelector('#x-geo').textContent), null, { timeout: 8000 }).catch(() => {});
  ok('GPS denied shows message', /אין הרשאה|ללא מיקום/.test(await txt('#x-geo')), (await txt('#x-geo')).trim());
  await page.click('[data-x]'); await page.waitForTimeout(250);
  await ctx.grantPermissions(['geolocation']);

  // create trip
  await page.goto(BASE + '#/new'); await page.waitForSelector('#f-name');
  await page.click('form button.primary');
  ok('create form validates', await page.locator('.invalid').count() >= 3);
  await page.fill('#f-name', 'סוף שבוע באילת'); await page.fill('#f-loc', 'אילת');
  await page.fill('#f-start', '2026-12-10'); await page.fill('#f-end', '2026-12-12');
  await page.selectOption('#f-cur', 'ILS');
  await page.fill('#f-person', 'אלעד'); await page.keyboard.press('Enter');
  await page.fill('#f-person', 'שני'); await page.keyboard.press('Enter');
  await page.locator('#f-pin').pressSequentially('12ab34');
  ok('PIN field keeps digits only', await page.inputValue('#f-pin') === '1234');
  await shot('08-create');
  await page.click('form button.primary');
  await page.waitForSelector('#hero h1');
  ok('new trip opens', (await page.locator('#hero h1').textContent()).includes('אילת'));
  ok('empty state', (await page.locator('#txList').textContent()).includes('עדיין אין תנועות'));

  // admin
  await page.goto(BASE + '#/'); await page.waitForSelector('#adminBtn');
  await page.click('#adminBtn'); await page.fill('input.code', '111111'); await page.click('.dialog button.primary');
  await page.waitForTimeout(200);
  ok('wrong admin code rejected', (await page.locator('.dialog .err').textContent()).includes('שגוי'));
  await page.fill('input.code', '363636'); await page.click('.dialog button.primary');
  await page.waitForSelector('#a-cats .cat-row');
  ok('admin shows 31 categories', (await page.locator('#a-cat-title').textContent()).includes('31'));
  // rename "דלק" -> "דלק ותדלוק"
  await page.locator('.cat-row', { hasText: 'דלק' }).first().locator('[data-ren]').click();
  await page.locator('.cat-row input').fill('דלק ותדלוק'); await page.locator('.cat-row button.primary').click();
  await page.waitForTimeout(400);
  ok('rename updates expenses', await page.evaluate(() => Object.values(JSON.parse(localStorage['tt-demo-db']).expenses).flatMap(o => Object.values(o)).some(e => e.category === 'דלק ותדלוק')));
  // delete "אוכל רחוב וגלידות"
  await page.locator('.cat-row', { hasText: 'אוכל רחוב' }).locator('[data-rm]').click();
  await page.click('.dialog [data-ok]'); await page.waitForTimeout(400);
  ok('delete moves expenses to ללא קטגוריה', await page.evaluate(() => Object.values(JSON.parse(localStorage['tt-demo-db']).expenses).flatMap(o => Object.values(o)).some(e => e.category === 'ללא קטגוריה')));
  await page.fill('#a-new', 'פארקי מים'); await page.click('#a-add button');
  await page.waitForTimeout(300);
  ok('add category', (await page.locator('#a-cats').textContent()).includes('פארקי מים'));
  // change PIN of first trip
  await page.selectOption('#a-trip', { label: 'חופשה משפחתית בצפון איטליה' }); await page.fill('#a-pin', '9999'); await page.click('#a-pin-form button'); await page.waitForTimeout(300);
  await noHScroll('admin'); await shot('09-admin');

  // delete trip via ⋮ (the new trip still has access)
  await page.goto(BASE + '#/'); await page.waitForSelector('.trip-card');
  const before = await page.locator('.trip-card').count();
  await page.locator('.trip-card', { hasText: 'אילת' }).locator('.kebab').click();
  await page.evaluate(() => sessionStorage.removeItem('tt-admin'));
  await page.click('.menu button'); await page.waitForSelector('input.code');
  ok('delete asks for admin code', (await page.locator('.dialog h2').textContent()).includes('מחיקת טיול'));
  await page.locator('input.code').pressSequentially('123456'); await page.click('.dialog button.primary'); await page.waitForTimeout(200);
  ok('delete: wrong admin code rejected', (await page.locator('.dialog .err').textContent()).includes('שגוי'));
  await page.fill('input.code', ''); await page.locator('input.code').pressSequentially('363636'); await page.click('.dialog button.primary');
  await page.waitForSelector('.dialog [data-ok]'); await page.click('.dialog [data-ok]'); await page.waitForTimeout(400);
  ok('trip deleted', await page.locator('.trip-card').count() === before - 1);
  // new PIN works on Italy trip (access removed by admin change)
  await page.locator('.trip-card', { hasText: 'איטליה' }).click(); await page.fill('input.code', '9999'); await page.click('.dialog button.primary');
  await page.waitForSelector('#hero', { timeout: 5000 }).catch(() => {});
  ok('admin-changed PIN works', page.url().includes('#/trip/'));

  // desktop width
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(200); await noHScroll('desktop'); await shot('10-desktop');
} catch (e) {
  ok('script ran to the end', false, e.message.split('\n')[0]);
  await shot('99-error');
}
ok('no JS errors', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(results.join('\n'));
await browser.close();




