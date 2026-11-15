// Offline ("plane") test against the REAL database. Needs: app served on PORT, playwright-core, Edge.
// Flow: open online -> trip opened (rates kept) -> offline: reload, add/edit expense, new trip -> reload offline
// -> back online -> a second browser sees everything. Test trips are deleted at the end.
import { chromium } from 'playwright-core';
const BASE = `http://127.0.0.1:${process.argv[2] || 8766}/`;
const results = [];
const ok = (name, cond, extra = '') => { const r = `${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`; results.push(r); console.log(r); };
const timeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + what)), ms))]);
const tag = 'בדיקת-אופליין-' + Date.now().toString(36);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const created = [];

async function makeTrip(name, cur) {
  await page.evaluate(() => { location.hash = '#/new'; });
  await page.waitForSelector('#f-name');
  await page.fill('#f-name', name); await page.fill('#f-loc', 'טיסה');
  await page.selectOption('#f-cur', cur);
  for (const p of ['אלעד', 'דנה']) { await page.fill('#f-person', p); await page.click('#f-add'); }
  await page.fill('#f-pin', '1234');
  await page.click('form button.primary');
  await page.waitForSelector('#fab', { timeout: 15000 });
  const id = decodeURIComponent(page.url().split('#/trip/')[1]); created.push(id); return id;
}
async function addExpense(amount, cur, details) {
  await page.click('#fab'); await page.waitForSelector('#x-amt');
  await page.fill('#x-amt', String(amount));
  await page.selectOption('#x-cur', cur);
  await page.waitForTimeout(500);
  const rate = (await page.locator('#x-rate').textContent()) || '';
  await page.fill('#x-cat', 'מזון'); await page.keyboard.press('Enter');
  await page.fill('#x-det', details);
  await page.click('#x-save'); await page.waitForTimeout(600);
  return rate;
}
const listHas = async t => (await page.locator('#txList').textContent()).includes(t);

try {
  // 1. Online: first open, service worker takes over, open a trip so rates are kept.
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForTimeout(1500);
  ok('service worker controls the page', await page.evaluate(() => !!navigator.serviceWorker.controller));
  const t1 = await makeTrip(tag + ' א', 'ILS');
  await page.waitForFunction(() => !!localStorage.getItem('tt-rates-at:ILS'), null, { timeout: 15000 }).catch(() => {});
  ok('rates kept on the phone while online', await page.evaluate(() => !!localStorage.getItem('tt-rate:EURILS') && !!localStorage.getItem('tt-rate:THBILS')));

  // 2. Offline: reload the trip page.
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('#fab', { timeout: 20000 });
  ok('app opens offline (reload)', true);
  ok('offline banner shown', (await page.locator('.offline').count()) > 0);

  // 3. Add an expense in a currency never used before (THB) and edit it.
  const rate = await addExpense(1000, 'THB', 'ארוחה במטוס');
  ok('THB rate available offline', rate.includes('אין חיבור') && /1 THB = [\d.]+ ILS/.test(rate), rate.trim().slice(0, 90));
  ok('offline expense appears', await listHas('ארוחה במטוס'));
  await page.locator('#txList .tx', { hasText: 'ארוחה במטוס' }).locator('[data-edit]').click();
  await page.waitForSelector('#x-amt'); await page.fill('#x-amt', '1200'); await page.click('#x-save'); await page.waitForTimeout(600);
  ok('offline edit saved', (await page.locator('#txList .tx', { hasText: 'ארוחה במטוס' }).textContent()).includes('1,200'));

  // 4. New trip while offline, with an expense.
  const t2 = await makeTrip(tag + ' ב', 'EUR');
  ok('new trip opens offline', !!t2);
  await addExpense(5, 'EUR', 'מים בשדה');
  ok('expense in offline trip appears', await listHas('מים בשדה'));

  // 5. Reload while still offline: everything is still there.
  await page.goto(BASE + '#/trip/' + t1); await page.reload(); await page.waitForSelector('#txList .tx', { timeout: 20000 });
  ok('after offline reload: edited expense kept', (await page.locator('#txList').textContent()).includes('1,200'));
  await page.evaluate(() => { location.hash = '#/'; }); await page.waitForSelector('.trip-card', { timeout: 15000 });
  ok('after offline reload: offline trip listed', (await page.locator('.trip-card').allTextContents()).some(t => t.includes(tag + ' ב')));

  // 6. Back online: a second browser sees it all.
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const ctx2 = await browser.newContext({ locale: 'he-IL' });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE);
  let synced = false;
  for (let i = 0; i < 20 && !synced; i++) {
    await p2.waitForTimeout(1500);
    synced = await timeout(p2.evaluate(async ([a, b]) => {
      const { store } = await import('./js/store.js');
      const [x, y] = await Promise.all([a, b].map(id => new Promise(res => { const u = store.onExpenses(id, l => { u(); res(l); }, err => res([{ err: String(err) }])); })));
      return x.some(e => e.details === 'ארוחה במטוס' && e.amount === 1200 && e.currency === 'THB' && e.convertedAmount > 0)
        && y.some(e => e.details === 'מים בשדה') && !!(await store.getTrip(b));
    }, [t1, t2]), 10000, 'sync check').catch(e => (console.log(e.message), false));
  }
  ok('second device sees offline changes after sync', synced);
  await ctx2.close();
} catch (e) {
  ok('no crash', false, e.message);
} finally {
  // Clean up the test trips (online).
  try {
    await ctx.setOffline(false);
    await timeout(page.evaluate(async ids => { const { store } = await import('./js/store.js'); for (const id of ids) await store.deleteTrip(id); }, created), 30000, 'delete');
    ok('test trips deleted', true);
  } catch (e) { ok('test trips deleted', false, e.message); }
  ok('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
}
