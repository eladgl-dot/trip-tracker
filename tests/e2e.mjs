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
const toastText = async () => (await page.locator('#toast').textContent()).trim();

try {
  await page.goto(BASE + '?demo');
  await page.waitForSelector('.trip-card', { timeout: 15000 });
  // "מה זה?" help: opens by itself on the first visit, levels open one at a time
  await page.waitForSelector('.sheet.help', { timeout: 3000 }).catch(() => {});
  ok('help opens by itself on first visit', await page.locator('.sheet.help').count() === 1);
  ok('help: 4 basic steps, lead mentions documenting', await page.locator('.help .help-step').count() === 4 && (await page.locator('.help-lead').textContent()).includes('מתעדים'));
  ok('help: more levels hidden at first', await page.locator('#help-more').isHidden() && await page.locator('#help-pro').isHidden());
  await shot('00a-help');
  await page.click('[data-lvl=more]');
  ok('help: "רוצים לדעת עוד" opens level 2 only', await page.locator('#help-more').isVisible() && await page.locator('#help-pro').isHidden());
  await page.click('[data-lvl=pro]');
  ok('help: "למתקדמים" opens level 3', await page.locator('#help-pro').isVisible() && await page.locator('#help-pro .help-tip').count() === 6);
  await noHScroll('help');
  await page.click('.help-done'); await page.waitForTimeout(300);
  ok('help closes with הבנתי', await page.locator('.sheet.help').count() === 0);
  await page.reload(); await page.waitForSelector('.trip-card'); await page.waitForTimeout(600);
  ok('help does not open again by itself', await page.locator('.sheet.help').count() === 0);
  ok('"מה זה?" pill in top bar', (await page.locator('.topbar #helpBtn').textContent()).includes('מה זה?'));
  await page.click('#helpBtn'); await page.waitForSelector('.sheet.help');
  ok('pill opens help', await page.locator('.sheet.help').count() === 1);
  await page.click('.help-x'); await page.waitForTimeout(300);
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
  ok('+ button says "להוסיף הוצאה"', (await page.locator('#fab').textContent()).includes('להוסיף הוצאה'));

  // WhatsApp share
  await page.evaluate(() => { window.opened = []; window.open = u => { window.opened.push(u); return {}; }; });
  ok('share button in the banner, labelled שיתוף', await page.locator('#hero #share').count() === 1 && (await page.locator('#share').textContent()).includes('שיתוף'));
  ok('no share row at the bottom any more', await page.locator('.share-row').count() === 0);
  await shot('02b-share-button');
  await page.click('#share'); await page.waitForSelector('[data-link]');
  await shot('02c-share-ask');
  await page.click('[data-link]'); await page.waitForTimeout(200);
  const msg1 = await page.evaluate(() => decodeURIComponent((window.opened[0] || '').split('text=')[1] || ''));
  ok('"רק קישור" opens WhatsApp with name + trip link, no password', msg1.includes('#/trip/') && msg1.includes('הוצאות הטיול') && !msg1.includes('סיסמה'), msg1.replace(/\n/g, ' | '));
  await page.click('#share'); await page.click('[data-pin]'); await page.waitForSelector('input.code');
  await page.fill('input.code', '9999'); await page.click('.dialog button.wa-go'); await page.waitForTimeout(300);
  ok('wrong password is not sent', (await page.locator('.dialog .err').textContent()).includes('שגוי') && await page.evaluate(() => window.opened.length) === 1);
  await page.fill('input.code', '1234'); await shot('02d-share-pin'); await page.click('.dialog button.wa-go'); await page.waitForTimeout(300);
  const msg2 = await page.evaluate(() => decodeURIComponent((window.opened[1] || '').split('text=')[1] || ''));
  ok('with password: message has 🔑 סיסמה: 1234', msg2.includes('🔑 סיסמה: 1234') && msg2.includes('#/trip/'));
  await page.goto(BASE + '?demo#/'); await page.waitForSelector('.trip-card .lock');
  ok('lock text: "עוד X ימים צריך להזין את הסיסמא שוב"', /עוד \d+ ימים צריך להזין את הסיסמא שוב/.test(await page.locator('.trip-card .lock').textContent()));
  await page.locator('.trip-card').click(); await page.waitForSelector('#stats .stat');

  // charts
  ok('breakdown rows (no donut)', await page.locator('#chart .bd-row').count() >= 2 && await page.locator('.donut').count() === 0);
  ok('biggest category first with amount + %', /לינה[\s\S]*%/.test(await page.locator('#chart .bd-row').first().textContent()));
  ok('no focus pill before a tap', await page.locator('.focus-pill').count() === 0);
  const catName = (await page.locator('#chart .bd-row').nth(1).locator('.bd-name').textContent()).replace(/^\S+\s/, '').trim();
  await page.locator('#chart .bd-row').nth(1).click();
  const info = await page.locator('#chart .bd-row.on .bd-info').textContent();
  ok('tap row shows count', info.includes('תנועות'), info.trim());
  ok('tapped category: focus pill above list', (await page.locator('#txList .focus-pill').textContent()).includes(catName), catName);
  const cats = await page.locator('#txList .tx').evaluateAll(els => els.map(e => ({ cat: e.querySelector('.mid .muted').textContent.split(' · ')[0].trim(), dim: e.classList.contains('dim') })));
  const nFirst = cats.findIndex(c => c.dim) < 0 ? cats.length : cats.findIndex(c => c.dim);
  ok('tapped category items come first', nFirst > 0 && cats.slice(0, nFirst).every(c => c.cat === catName), JSON.stringify(cats.slice(0, nFirst + 1)));
  ok('others after a divider, faded', await page.locator('#txList .focus-sep').count() === 1 && cats.slice(nFirst).every(c => c.dim));
  ok('nothing lost from the list', cats.length === await page.evaluate(() => document.querySelectorAll('#txList .tx').length) && cats.length >= 8, String(cats.length));
  await noHScroll('breakdown'); await shot('02c-breakdown');
  // the choice survives a redraw (e.g. live update) and ✕ clears it
  await page.fill('#search', ' '); await page.fill('#search', '');
  ok('focus kept after redraw', await page.locator('#txList .focus-pill').count() === 1 && await page.locator('#chart .bd-row.on').count() === 1);
  await page.fill('#search', 'zzzz-nothing');
  ok('search with no results keeps the focus pill + ✕', await page.locator('#txList .focus-pill [data-unfocus]').count() === 1);
  await page.fill('#search', '');
  await page.click('#txList [data-unfocus]');
  ok('✕ clears focus (list + chart)', await page.locator('.focus-pill').count() === 0 && await page.locator('#chart .bd-row.on').count() === 0 && await page.locator('#txList .tx.dim').count() === 0);
  await page.locator('#chart .bd-row').nth(1).click(); await page.locator('#chart .bd-row').nth(1).click();
  ok('tapping the same row again clears focus', await page.locator('.focus-pill').count() === 0);
  // header: no "טיולון" bar, back/edit inside banner, one participants pill, slim bar on scroll
  ok('no old top bar on trip page', await page.locator('#view .topbar').count() === 0);
  ok('back + edit in banner', await page.locator('#hero a.ib[href="#/"]').count() === 1 && await page.locator('#hero [data-edit-trip]').count() === 1);
  ok('participants pill shows 👥 4 (no word)', /👥\s*4/.test(await page.locator('#hero [data-people]').textContent()) && !(await page.locator('#hero [data-people]').textContent()).includes('משתתפים'));
  ok('banner: 4 pills (people, currency, share, PDF)', await page.locator('#hero .chip').count() === 4);
  const tops = await page.locator('#hero .tb-chips .chip').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  ok('all 4 pills on one row at 390px', new Set(tops).size === 1, tops.join(','));
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
  ok('slim bar hidden at top', !(await page.locator('#miniBar').getAttribute('class')).includes('on'));
  await page.evaluate(() => scrollTo(0, 900)); await page.waitForTimeout(400);
  ok('slim bar shows when scrolled', (await page.locator('#miniBar').getAttribute('class')).includes('on'));
  ok('slim bar: name + days · net', /ימים/.test(await page.locator('#miniBar').textContent()));
  await page.screenshot({ path: `${OUT}/02d-slim-bar.png` });
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
  ok('PDF next to share in the banner', await page.locator('#hero .tb-share #pdf').count() === 1 && await page.locator('#hero .tb-share #share').count() === 1);
  ok('slim bar has no share/PDF', await page.locator('#miniBar #share, #miniBar #pdf').count() === 0);
  await page.click('#hero [data-people]'); await page.waitForSelector('.people-list');
  ok('people popup lists all', await page.locator('.people-list li').count() === 4);
  await shot('02e-people'); await page.click('.dialog [data-x]'); await page.waitForTimeout(250);
  await page.click('[data-ch=day]');
  await page.locator('.bar').first().click();
  const tip = await page.locator('.tip').textContent();
  ok('tap bar shows day details', tip.includes('תנועות'), tip.trim());
  ok('tapped day: focus pill + divider "לא ביום הנבחר"', await page.locator('#txList .focus-pill').count() === 1 && (await page.locator('#txList .focus-sep').textContent()).includes('לא ביום הנבחר'));
  await page.click('[data-ch=cat]');
  ok('switching chart clears focus', await page.locator('.focus-pill').count() === 0);
  await page.click('[data-ch=day]');
  await shot('03-bars');

  // long description / comment must not widen the cards (bug 2026-11-16: one long word made every card 548px on a 390px phone)
  const longOk = await page.evaluate(() => {
    const t = document.querySelector('#txList .tx .t'); const old = t.textContent;
    t.textContent = 'https://www.example.com/a-very-long-link-without-any-spaces-1234567890abcdefghijklmnopqrstuvwxyz ' + 'מילה '.repeat(60);
    const list = document.querySelector('#txList').getBoundingClientRect().width;
    const ok = [...document.querySelectorAll('#txList .tx')].every(c => c.getBoundingClientRect().width <= list + 1)
      && document.documentElement.scrollWidth <= innerWidth + 1 && t.getBoundingClientRect().height < 80;
    t.textContent = old; return ok;
  });
  ok('long description: cards stay screen-wide, text cut to 2 lines', longOk);

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

  // long comment saved through the form: cut to 2 lines, tap opens it, stays open after a search redraw
  const rowR = () => page.locator('#txList .tx', { hasText: 'רכבל לפסגה' });
  const oldCom = await (async () => { await rowR().locator('[data-edit]').click(); await page.waitForSelector('#x-com'); return page.locator('#x-com').inputValue(); })();
  await page.fill('#x-com', 'https://www.example.com/receipts/a-very-long-link-without-any-spaces-1234567890abcdefghijklmnopqrstuvwxyz ' + 'הערה ארוכה מאוד '.repeat(5));
  await page.click('#x-save'); await page.waitForTimeout(500);
  const com = rowR().locator('.com');
  const h0 = (await com.boundingBox()).height;
  ok('long comment is cut (has tap-to-open)', await com.getAttribute('aria-expanded') === 'false' && (await com.getAttribute('class')).includes('cut'));
  ok('short description has no tap-to-open', await rowR().locator('.t').getAttribute('role') === null);
  await noHScroll('long comment');
  await com.click(); await page.waitForTimeout(150);
  ok('tap opens the full comment', await com.getAttribute('aria-expanded') === 'true' && (await com.boundingBox()).height > h0 + 20);
  await page.fill('#search', 'רכבל'); await page.waitForTimeout(150);
  ok('opened comment stays open after redraw', await rowR().locator('.com').getAttribute('aria-expanded') === 'true');
  await page.fill('#search', '');
  await rowR().locator('.com').click(); await page.waitForTimeout(150);
  ok('tap again closes it', await rowR().locator('.com').getAttribute('aria-expanded') === 'false');
  await shot('03b-long-comment');
  await rowR().locator('[data-edit]').click(); await page.waitForSelector('#x-com');
  await page.fill('#x-com', oldCom); await page.click('#x-save'); await page.waitForTimeout(400);

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
  ok('settle chart uses rows', await page.locator('#pie2 .bd-row').count() >= 1);
  await shot('06-settle-filter');
  await page.click('[data-who=""]');

  // groups
  ok('groups banner shown', await page.locator('#settle .grp-banner').count() === 1);
  await page.click('#settle .grp-banner [data-groups]'); await page.waitForSelector('.pool');
  const names = await page.locator('.pool [data-in]').evaluateAll(b => b.map(x => x.dataset.in));
  await page.click(`.pool [data-in="${names[0]}"]`); await page.click(`.pool [data-in="${names[1]}"]`);
  ok('first tap opens a group', await page.locator('.grp').count() === 1 && await page.locator('.grp .chip.in').count() === 2);
  ok('picked people leave the pool', await page.locator('.pool [data-in]').count() === names.length - 2);
  await page.click('[data-newg]'); await page.click(`.pool [data-in="${names[2]}"]`);
  ok('second group gets the next tap', await page.locator('.grp').nth(1).locator('.chip.in').count() === 1);
  ok('auto group name', (await page.locator('.grp input').first().getAttribute('placeholder')) === `${names[0]} ו${names[1]}`);
  await shot('06b-groups-sheet');
  await page.click('.sheet [data-save]'); await page.waitForTimeout(400);
  ok('settle shows 3 units', await page.locator('#settle .person').count() === 3);
  ok('group bar shown', /2 קבוצות · 1 לבד/.test(await page.locator('#settle .gbar').textContent()));
  const gsum = await page.evaluate(() => [...document.querySelectorAll('#settle .bal .money')].reduce((a, e) => a + parseFloat(e.textContent.replace(/[^\d.\-−]/g, '').replace('−', '-')), 0));
  ok('group balances sum to ~0', Math.abs(gsum) < 0.05, gsum.toFixed(2));
  ok('transfers between units', await page.locator('#settle .xfer').count() <= 2);
  await noHScroll('settle groups'); await shot('06c-settle-groups');
  await page.click('#hero [data-people]'); await page.waitForSelector('.people-list');
  ok('popup shows group tag', await page.locator('.people-list .chip').count() === 3);
  await page.click('.dialog [data-g]'); await page.waitForSelector('.grp');
  ok('popup button opens groups sheet', await page.locator('.grp').count() === 2);
  await page.locator('.grp').first().locator('[data-delg]').click();
  await page.locator('.grp').first().locator('[data-delg]').click();
  await page.click('.sheet [data-save]'); await page.waitForTimeout(400);
  ok('groups removed → 4 people again', await page.locator('#settle .person').count() === 4);
  await page.click('#settle [data-hide-banner]');
  ok('banner hidden, bottom button stays', await page.locator('#settle .grp-banner').count() === 0 && await page.locator('#settle [data-groups]').count() === 1);

  // edit trip
  await page.click('#hero [data-edit-trip]'); await page.waitForSelector('#f-name');
  ok('8 color swatches', await page.locator('[data-color]').count() === 8);
  await page.click('[data-color=mint]');
  await page.locator('#f-chips [data-rm]').first().click(); // אלעד has transactions
  ok('cannot remove participant with transactions', (await toastText()).includes('אי אפשר'));
  await page.fill('#f-person', 'דנה'); await page.click('#f-add');
  await page.click('.sheet button.primary'); await page.waitForTimeout(400);
  ok('participant added', /👥\s*5/.test(await page.locator('#hero [data-people]').textContent()));
  const heroStyle = await page.locator('#hero').getAttribute('style');
  ok('trip color applied', /D1FAE5|209, 250, 229/i.test(heroStyle), heroStyle);

  // currency change EUR -> ILS
  await page.click('#hero [data-edit-trip]'); await page.waitForSelector('#f-cur');
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

  // home: my trips, tags, filter, search, grouping (Step 20)
  await page.goto(BASE + '#/'); await page.waitForSelector('.trip-card');
  const cards = () => page.locator('#trips .trip-card');
  const card2 = name => page.locator('#trips .trip-card', { hasText: name });
  ok('home: search, mine/all tabs, group pill', await page.locator('#tripSearch').count() === 1 && await page.locator('[data-scope]').count() === 2 && (await page.locator('#groupBtn').textContent()).includes('לפי שנה'));
  ok('home: created + opened trips are "mine"', (await page.locator('[data-n=mine]').textContent()).includes('2') && await page.locator('[data-scope=mine]').getAttribute('aria-selected') === 'true' && await cards().count() === 2);
  ok('home: "+ טיול חדש" floating', await page.locator('a.fab[href="#/new"]').count() === 1);
  await card2('אילת').locator('.kebab').click();
  ok('⋮ menu: tags, remove from mine, delete', await page.locator('.menu [data-m]').count() === 3 && await page.locator('.menu [data-m=unmine]').count() === 1);
  await page.click('.menu [data-m=tags]'); await page.waitForSelector('.sheet .tagpick');
  await page.fill('.tagpick-in', 'משפחה'); await page.keyboard.press('Enter');
  await page.fill('.tagpick-in', 'סקי'); await page.click('.tagpick-add');
  await page.fill('.tagpick-in', 'סקי'); await page.keyboard.press('Enter');
  ok('tag picker: no duplicate tags', await page.locator('.tp-on .tag').count() === 2);
  await shot('11a-tags'); await page.click('.sheet [data-save]'); await page.waitForTimeout(400);
  ok('tags shown on the card', (await card2('אילת').locator('.tags').textContent()).includes('סקי'));
  await card2('איטליה').locator('.kebab').click(); await page.click('.menu [data-m=tags]'); await page.waitForSelector('.sheet .tagpick');
  ok('tag picker suggests tags from other trips', await page.locator('.tp-sugg [data-addtag="משפחה"]').count() === 1);
  await page.click('.tp-sugg [data-addtag="משפחה"]'); await page.click('.sheet [data-save]'); await page.waitForTimeout(400);
  await page.click('#tagRow [data-tag="סקי"]');
  ok('tag filter: only trips with the tag', await cards().count() === 1 && (await page.locator('#homeCount').textContent()).includes('1'));
  await page.click('#tagRow [data-tag="סקי"]');
  ok('tap tag again clears filter', await cards().count() === 2);
  await page.fill('#tripSearch', 'אילת');
  ok('search by place', await cards().count() === 1);
  await page.fill('#tripSearch', 'ליב');
  ok('search my trips by participant', await cards().count() === 1 && await card2('איטליה').count() === 1);
  await page.fill('#tripSearch', 'zzzz');
  ok('search with no result', (await page.locator('#trips .empty').textContent()).includes('לא נמצאו'));
  await page.fill('#tripSearch', '');
  await page.click('#groupBtn'); await page.click('[data-group=tag]'); await page.waitForTimeout(150);
  ok('group by tag: section per first tag', (await page.locator('#trips .sec').first().textContent()).includes('משפחה') && (await page.locator('#groupBtn').textContent()).includes('לפי תגית'));
  await page.click('#groupBtn'); await page.click('[data-group=year]'); await page.waitForTimeout(150);
  ok('group by year: year sections', await page.locator('#trips .sec').count() >= 1 && /\d{4}/.test(await page.locator('#trips .sec').first().textContent()));
  await noHScroll('home redesign'); await shot('11b-home');
  // remove from mine → shows in "all" without names, can be added back
  await card2('אילת').locator('.kebab').click(); await page.click('.menu [data-m=unmine]'); await page.waitForTimeout(200);
  ok('remove from mine', await cards().count() === 1 && (await page.locator('[data-n=mine]').textContent()).includes('1'));
  await page.click('[data-scope=all]');
  ok('all trips: other trip is plain, no participants', await cards().count() === 2 && await card2('אילת').evaluate(c => c.classList.contains('other')) && !(await card2('אילת').textContent()).includes('משתתפים'));
  await page.fill('#tripSearch', 'שני');
  ok('all trips: participant names not searchable in other trips', await card2('איטליה').count() === 1 && await card2('אילת').count() === 0);
  await page.fill('#tripSearch', '');
  await shot('11c-all');
  await card2('אילת').locator('.kebab').click(); await page.click('.menu [data-m=mine]'); await page.waitForTimeout(300);
  await page.click('[data-scope=mine]');
  ok('add back to mine', await cards().count() === 2);
  await page.reload(); await page.waitForSelector('.trip-card');
  ok('home view remembered after reload', await page.locator('[data-scope=mine]').getAttribute('aria-selected') === 'true' && (await page.locator('#groupBtn').textContent()).includes('לפי שנה'));

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
  await page.click('.menu [data-m=del]'); await page.waitForSelector('input.code');
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




