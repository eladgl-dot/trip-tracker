// Step 27 browser checks (demo mode): attachments on an expense (photos, PDF, Word, any file, 5 in all, 5 MB each),
// paste a screenshot, amount 0 with a file (asks first), the 🧷 screen with tabs, open a file, go to its expense.
// Usage: node e2e-step27.mjs <port> [outDir]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const BASE = `http://127.0.0.1:${process.argv[2] || 8791}/`;
const OUT = process.argv[3] || '.';
const ICON = 'D:/New Projects/Local_AI_projects/Trip_expense_tracker/app/icons/icon-192.png';
process.on('uncaughtException', e => { if (e?.name !== 'TargetClosedError') throw e; }); // the PDF tab closing at the very end
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', hasTouch: true, colorScheme: 'light', acceptDownloads: true });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
const noHScroll = async n => ok(`no horizontal scroll (${n})`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
const db = () => page.evaluate(() => JSON.parse(localStorage['tt-demo-db']));
const allFiles = async () => Object.values((await db()).files || {}).flatMap(o => Object.values(o));
const toastText = () => page.locator('#toast').textContent();
const icon = readFileSync(ICON);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

try {
  await page.addInitScript(() => { try { localStorage.setItem('tt-help-seen', '1'); } catch {} });
  await page.goto(BASE + '?demo');
  await page.waitForSelector('.trip-card');
  await page.locator('.trip-card').first().click();
  await page.waitForSelector('input.code'); await page.fill('input.code', '1234'); await page.click('.dialog button.primary');
  await page.waitForSelector('#stats .stat');
  ok('header has the 🧷 button', await page.locator('#hero [data-files]').count() === 1);

  // ---- the sheet
  await page.click('#fab'); await page.waitForSelector('#x-amt');
  ok('4 add buttons: camera, gallery, file, paste', await page.locator('#x-att-btns [data-cam], #x-att-btns [data-gal], #x-att-btns [data-file], #x-att-btns [data-paste]').count() === 4);
  ok('label with a paper clip drawing (no emoji)', await page.locator('.att-lbl svg.clip').count() === 1 && !(await page.locator('.att-lbl').textContent()).includes('📎'));
  await page.setInputFiles('#x-file', [
    { name: 'Booking-Roma.pdf', mimeType: 'application/pdf', buffer: PDF },
    { name: 'Insurance.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK fake docx') },
    { name: 'Tickets.zip', mimeType: 'application/zip', buffer: Buffer.from('PK fake zip') }]);
  await page.waitForFunction(() => document.querySelectorAll('#x-photos .doc-chip').length === 3, null, { timeout: 5000 }).catch(() => {});
  ok('3 files as chips', await page.locator('#x-photos .doc-chip').count() === 3);
  ok('count 3 / 5', (await page.locator('#x-att-n').textContent()).includes('3 / 5'));
  ok('PDF chip: icon, name, size', (await page.locator('.doc-chip').first().textContent()).includes('Booking-Roma.pdf') && (await page.locator('.doc-chip .ft-pdf').first().textContent()) === 'PDF');
  // too big → refused at once
  await page.setInputFiles('#x-file', [{ name: 'Big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5 * 1024 * 1024 + 10, 65) }]);
  await page.waitForTimeout(300);
  ok('file over 5 MB refused when added', (await toastText()).includes('גדול מדי') && (await toastText()).includes('Big.pdf') && (await toastText()).includes('5.1MB') && await page.locator('.doc-chip').count() === 3, await toastText());
  // paste a screenshot (Ctrl+V)
  await page.evaluate(async () => {
    const b = await (await fetch('icons/icon-192.png')).blob();
    const dt = new DataTransfer(); dt.items.add(new File([b], 'shot.png', { type: 'image/png' }));
    document.querySelector('.sheet').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('#x-photos .thumb img').length === 1, null, { timeout: 5000 }).catch(() => {});
  ok('Ctrl+V screenshot → photo', await page.locator('#x-photos .thumb img').count() === 1);
  // 📋 button reads the clipboard
  const wrote = await page.evaluate(async () => { try { const b = await (await fetch('icons/icon-192.png')).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); return true; } catch (e) { return e.message; } });
  if (wrote === true) {
    await page.click('#x-att-btns [data-paste]');
    await page.waitForFunction(() => document.querySelectorAll('#x-photos .thumb img').length === 2, null, { timeout: 5000 }).catch(() => {});
    ok('📋 button → photo from the clipboard', await page.locator('#x-photos .thumb img').count() === 2);
  } else ok('📋 button (clipboard not available in this browser test)', false, String(wrote));
  ok('5 reached: add buttons gone, message shown', await page.locator('#x-att-btns [data-file]').count() === 0 && (await page.locator('#x-att-btns').textContent()).includes('עד 5'));
  await page.evaluate(async () => { // a 6th by paste → refused
    const b = await (await fetch('icons/icon-192.png')).blob();
    const dt = new DataTransfer(); dt.items.add(new File([b], 'six.png', { type: 'image/png' }));
    document.querySelector('.sheet').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(300);
  ok('6th file refused', (await toastText()).includes('עד 5') && await page.locator('#x-photos .thumb, #x-photos .doc-chip').count() === 5);
  await noHScroll('sheet with files'); await page.locator('.sheet').screenshot({ path: `${OUT}/27-sheet.png` });

  // ---- amount 0 with files → asks first
  await page.selectOption('#x-cat', 'לינה ומלונות'); await page.fill('#x-det', 'מסמכי נסיעה');
  await page.click('#x-save'); await page.waitForSelector('.dialog [data-ok]', { timeout: 3000 }).catch(() => {});
  ok('no amount → "no cost" question', (await page.locator('.dialog').last().textContent()).includes('לא הוזן סכום'));
  await page.screenshot({ path: `${OUT}/27-zero.png` });
  await page.locator('.dialog [data-x]').last().click(); await page.waitForTimeout(250);
  ok('cancel → still in the sheet', await page.locator('.sheet #x-amt').isVisible());
  await page.click('#x-save'); await page.waitForSelector('.dialog [data-ok]');
  await page.locator('.dialog [data-ok]').last().click(); await page.waitForTimeout(500);
  const row = page.locator('#txList .tx', { hasText: 'מסמכי נסיעה' });
  ok('saved with amount 0', await row.count() === 1 && (await db()).expenses && Object.values((await db()).expenses).flatMap(o => Object.values(o)).find(e => e.details === 'מסמכי נסיעה')?.amount === 0);
  ok('row: paper clip + 5', (await row.locator('.pics').textContent()).trim() === '5' && await row.locator('.pics svg.clip').count() === 1);
  ok('3 files stored', (await allFiles()).length === 3);
  const saved = Object.values((await db()).expenses).flatMap(o => Object.values(o)).find(e => e.details === 'מסמכי נסיעה');
  ok('expense keeps a short file list', saved.files?.length === 3 && saved.files.every(f => f.id && f.name && f.size > 0 && f.parts >= 1 && !('data' in f)));
  // amount empty without files → error as before
  await page.click('#fab'); await page.waitForSelector('#x-amt'); await page.click('#x-save'); await page.waitForTimeout(200);
  ok('no file → amount still required', (await page.locator('.sheet .err').allTextContents()).join(' ').includes('סכום'));
  await page.click('.sheet [data-x]'); await page.waitForTimeout(300);

  // ---- 🧷 screen
  await page.click('#hero [data-files]'); await page.waitForSelector('.att-dialog');
  const tabs = await page.locator('.att-tabs button').allTextContents();
  ok('tabs with counts: photos / documents / other', tabs.length === 3 && tabs[1].includes('(2)') && tabs[2].includes('(1)'), tabs.join(' | '));
  await page.waitForSelector('.att-grid img', { timeout: 5000 }).catch(() => {});
  ok('photos tab: our 2 photos', await page.locator('.att-head', { hasText: 'מסמכי נסיעה' }).count() === 1);
  await noHScroll('attachments – photos'); await page.screenshot({ path: `${OUT}/27-att-photos.png` });
  await page.locator('.att-tabs [data-tab=doc]').click(); await page.waitForTimeout(200);
  ok('documents tab: PDF and Word', (await page.locator('.att-row').count()) === 2 && (await page.locator('.att-body').textContent()).includes('Insurance.docx'));
  const [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 5000 }).catch(() => null), page.locator('.att-open', { hasText: 'Booking-Roma.pdf' }).click()]);
  await page.waitForTimeout(500);
  ok('PDF opens in a new tab', !!popup && (popup.url().startsWith('blob:') || popup.url() === 'about:blank'), popup?.url());
  ok('then "saved on this phone"', (await page.locator('.att-row', { hasText: 'Booking-Roma.pdf' }).textContent()).includes('שמור בטלפון'));
  await page.screenshot({ path: `${OUT}/27-att-docs.png` });
  await page.locator('.att-tabs [data-tab=other]').click(); await page.waitForTimeout(200);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.locator('.att-open', { hasText: 'Tickets.zip' }).click()]);
  ok('other file is handed to the phone (download)', dl?.suggestedFilename() === 'Tickets.zip', dl?.suggestedFilename());
  await page.locator('.att-row .go').first().click(); await page.waitForSelector('.sheet #x-det'); await page.waitForTimeout(300);
  ok('"to the entry" opens its expense', await page.inputValue('#x-det') === 'מסמכי נסיעה' && await page.locator('.att-dialog').count() === 0);
  ok('edit: files shown', await page.locator('.doc-chip').count() === 3);
  await page.locator('.doc-chip', { hasText: 'Tickets.zip' }).locator('.x').click();
  await page.click('#x-save'); await page.waitForSelector('.dialog [data-ok]'); await page.locator('.dialog [data-ok]').last().click(); await page.waitForTimeout(500);
  ok('removed file deleted from the store', (await allFiles()).length === 2 && (await row.locator('.pics').textContent()).trim() === '4');

  // ---- delete the expense → its files go too
  await row.locator('[data-del]').click(); await page.evaluate(() => dispatchEvent(new Event('pagehide'))); await page.waitForTimeout(300);
  ok('deleting the expense deletes its files', (await allFiles()).length === 0);

  // ---- a file planted in the shared database with an html type must never open as a page on our address
  await page.evaluate(() => {
    const d = JSON.parse(localStorage['tt-demo-db']);
    const tid = Object.keys(d.trips)[0], eid = Object.keys(d.expenses[tid])[0];
    d.expenses[tid][eid].files = [{ id: 'evil1', name: 'evil.pdf', type: 'text/html', size: 40, parts: 1 }];
    (d.files[tid] ||= {}).evil1 = { expenseId: eid, name: 'evil.pdf', type: 'text/html', size: 40, data: btoa('<script>window.opener.pwned=1</script>'), at: 1 };
    localStorage['tt-demo-db'] = JSON.stringify(d);
  });
  await page.reload(); await page.waitForSelector('#stats .stat');
  await page.click('#hero [data-files]'); await page.waitForSelector('.att-dialog');
  await page.locator('.att-tabs [data-tab=doc]').click(); await page.waitForTimeout(200);
  const [pop2, dl2] = await Promise.all([page.waitForEvent('popup', { timeout: 2500 }).catch(() => null), page.waitForEvent('download', { timeout: 2500 }).catch(() => null),
    page.locator('.att-open', { hasText: 'evil.pdf' }).click()]);
  await page.waitForTimeout(300);
  ok('html disguised as PDF: no tab, only a download', !pop2 && !!dl2 && !(await page.evaluate(() => window.pwned)), `popup=${!!pop2} download=${!!dl2}`);
  await page.click('.att-top [data-x]'); await page.waitForTimeout(250);
  // ---- copied text that also carries a picture pastes as text
  await page.click('#fab'); await page.waitForSelector('#x-amt');
  const hijacked = await page.evaluate(async () => {
    const b = await (await fetch('icons/icon-192.png')).blob();
    const dt = new DataTransfer(); dt.setData('text/plain', 'hello'); dt.items.add(new File([b], 'x.png', { type: 'image/png' }));
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    document.querySelector('#x-com').dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  await page.waitForTimeout(300);
  ok('text paste is not taken as an attachment', !hijacked && await page.locator('#x-photos .thumb').count() === 0);
  await page.click('.sheet [data-x]'); await page.waitForTimeout(300);

  // ---- English
  await page.goto(BASE + '?demo#/'); await page.waitForSelector('#langBtn');
  await page.click('#langBtn'); await page.click('[data-lang=en]'); await page.waitForTimeout(300);
  await page.locator('.trip-card').first().click(); await page.waitForSelector('#stats .stat');
  await page.click('#fab'); await page.waitForSelector('#x-amt');
  const lbl = (await page.locator('.att-lbl').textContent()) + ' ' + (await page.locator('#x-att-btns').textContent());
  ok('English: Attachments, File, Paste', lbl.includes('Attachments') && lbl.includes('File') && lbl.includes('Paste'), lbl);
  await page.click('.sheet [data-x]'); await page.waitForTimeout(300);
  await page.click('#hero [data-files]'); await page.waitForSelector('.att-dialog');
  ok('English: 🧷 screen', (await page.locator('.att-dialog').textContent()).includes('Documents') && !/[֐-׿]/.test(await page.locator('.att-top, .att-tabs').allTextContents().then(a => a.join(''))));
  await page.screenshot({ path: `${OUT}/27-att-en.png` });
  await page.click('.att-top [data-x]');
  await page.goto(BASE + '?demo#/'); await page.waitForSelector('#langBtn');
  await page.click('#langBtn'); await page.click('[data-lang=he]'); await page.waitForTimeout(300);
  ok('no JS errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('script finished', false, e.message);
}
console.log(results.join('\n'));
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
for (const p of ctx.pages()) await p.close().catch(() => {});
await browser.close();
