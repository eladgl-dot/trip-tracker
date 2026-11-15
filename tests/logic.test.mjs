import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../app/js/logic.js';

const ex = (paidBy, v, extra = {}) => ({ type: 'expense', paidBy, amount: v, convertedAmount: v, category: 'שונות', date: '2026-09-28', ...extra });
const inc = (paidBy, v) => ({ type: 'income', paidBy, amount: v, convertedAmount: v, date: '2026-09-28' });

test('balances: equal split, sums to zero', () => {
  const b = L.balances(['א', 'ב', 'ג'], [ex('א', 90), ex('ב', 30)]);
  assert.deepEqual(b.map(x => x.balance), [50, -10, -40]);
  assert.equal(b[0].share, 40);
});

test('balances: income lowers the total and the receiver owes it', () => {
  // 3034.50 paid, 120 refund received by אלעד -> net 2914.50, share 728.625
  const b = L.balances(['אלעד', 'שני', 'נויה', 'ליב'],
    [ex('אלעד', 1245), ex('שני', 909.36), ex('נויה', 880.14), inc('אלעד', 120)]);
  const m = Object.fromEntries(b.map(x => [x.name, x.balance]));
  assert.equal(m['ליב'], -728.63);
  assert.equal(m['אלעד'], 396.38);
  assert.ok(Math.abs(b.reduce((a, x) => a + x.balance, 0)) < 0.03);
});

test('balances: payer not in the trip is ignored', () => {
  const b = L.balances(['א'], [ex('זר', 50), ex('א', 10)]);
  assert.equal(b[0].balance, 0);
});

test('settleTransfers: fewest transfers, amounts match', () => {
  const t = L.settleTransfers([{ name: 'א', balance: 50 }, { name: 'ב', balance: -10 }, { name: 'ג', balance: -40 }]);
  assert.deepEqual(t, [{ from: 'ג', to: 'א', amount: 40 }, { from: 'ב', to: 'א', amount: 10 }]);
});

test('settleTransfers: one debtor, many creditors', () => {
  const t = L.settleTransfers([{ name: 'ל', balance: -100 }, { name: 'א', balance: 60 }, { name: 'ש', balance: 40 }]);
  assert.equal(t.length, 2);
  assert.equal(t.reduce((a, x) => a + x.amount, 0), 100);
});

test('settleTransfers: all even -> nothing', () => {
  assert.deepEqual(L.settleTransfers([{ name: 'א', balance: 0 }, { name: 'ב', balance: 0.01 }]), []);
});

test('summarize: totals, per day, per person', () => {
  const trip = { participants: ['א', 'ב'], startDate: '2026-09-27', endDate: '2026-10-05' };
  const s = L.summarize(trip, [ex('א', 100), ex('ב', 50), inc('א', 30)], '2026-12-01');
  assert.equal(s.totalExpenses, 150); assert.equal(s.totalIncome, 30); assert.equal(s.net, 120);
  assert.equal(s.days, 9); assert.equal(s.perDay, 13.33); assert.equal(s.perPerson, 60);
});

test('tripDayCount: mid-trip counts until today; no dates counts expense days', () => {
  const trip = { startDate: '2026-09-27', endDate: '2026-10-05' };
  assert.equal(L.tripDayCount(trip, [], '2026-09-30'), 4);
  assert.equal(L.tripDayCount({}, [ex('א', 1, { date: '2026-01-01' }), ex('א', 1, { date: '2026-01-03' })]), 2);
});

test('byCategory / byDay ignore income and sort', () => {
  const list = [ex('א', 10, { category: 'דלק', date: '2026-01-02' }), ex('א', 30, { category: 'טיסות', date: '2026-01-01' }), inc('א', 99)];
  assert.deepEqual(L.byCategory(list).map(g => g.name), ['טיסות', 'דלק']);
  assert.deepEqual(L.byDay(list).map(g => g.name), ['2026-01-01', '2026-01-02']);
});

test('parseAmount handles comma and dot', () => {
  assert.equal(L.parseAmount('85,5'), 85.5);
  assert.equal(L.parseAmount('1,234.50'), 1234.5);
  assert.equal(L.parseAmount(' 12 '), 12);
  assert.ok(Number.isNaN(L.parseAmount('abc')));
  assert.ok(Number.isNaN(L.parseAmount('')));
});

test('formatMoney puts the symbol first', () => {
  assert.equal(L.formatMoney(1234.5, 'EUR'), '€ 1,234.50');
  assert.equal(L.formatMoney(-5, 'ILS'), '−₪ 5.00');
});

test('reconvert after default currency change', () => {
  const e = { amount: 96, currency: 'CHF', exchangeRateToTripDefault: 1.064, convertedAmount: 102.14 };
  const r = L.reconvert(e, 'ILS', 4); // 1 EUR = 4 ILS
  assert.equal(r.exchangeRateToTripDefault, 4.256); assert.equal(r.convertedAmount, 408.58);
  const same = L.reconvert({ amount: 50, currency: 'ILS', exchangeRateToTripDefault: 0.25, convertedAmount: 12.5 }, 'ILS', 4);
  assert.deepEqual(same, { exchangeRateToTripDefault: 1, convertedAmount: 50 });
});

test('validation', () => {
  assert.deepEqual(Object.keys(L.validateTrip({ name: '', location: '', participants: [], pin: '12' })).sort(),
    ['defaultCurrency', 'location', 'name', 'participants', 'pin']);
  assert.deepEqual(L.validateTrip({ name: 'a', location: 'b', defaultCurrency: 'EUR', participants: ['x'], pin: '1234' }), {});
  assert.ok(L.validateExpense({}).amount);
  assert.ok(L.isCode6('363636') && !L.isCode6('36363'));
});

test('search matches details, comment, category, payer', () => {
  const e = ex('שני', 5, { details: 'רכבל', comment: 'כולל טיפ' });
  for (const q of ['רכבל', 'טיפ', 'שונות', 'שני']) assert.ok(L.matchesSearch(e, q), q);
  assert.ok(!L.matchesSearch(e, 'מלון'));
});

test('access expiry', () => {
  assert.ok(L.hasAccess(Date.now() + 1000));
  assert.ok(!L.hasAccess(Date.now() - 1));
  assert.ok(!L.hasAccess(null));
  assert.equal(L.ACCESS_MS, 259200000);
});

test('every default category has its own emoji', () => {
  for (const c of L.DEFAULT_CATEGORIES) assert.notEqual(L.categoryEmoji(c), '🏷️', c);
  assert.equal(L.DEFAULT_CATEGORIES.length, 30);
});

test('fitSize keeps ratio and never enlarges', () => {
  assert.deepEqual(L.fitSize(4000, 3000, 1000), { w: 1000, h: 750 });
  assert.deepEqual(L.fitSize(3000, 4000, 1000), { w: 750, h: 1000 });
  assert.deepEqual(L.fitSize(800, 600, 1000), { w: 800, h: 600 });
});

test('accuracy text', () => {
  assert.equal(L.formatAccuracy(34.6), '±35 מ׳');
  assert.equal(L.formatAccuracy(1500), '±1.5 ק״מ');
  assert.equal(L.formatAccuracy(NaN), '');
});

test('address from a Nominatim reply', () => {
  assert.equal(L.formatAddress({ name: 'Gelateria', address: { road: 'Via Roma', house_number: '5', town: 'Sirmione', country: 'איטליה' } }),
    'Gelateria, Via Roma 5, Sirmione, איטליה');
  assert.equal(L.formatAddress({ address: { road: 'Via Roma', city: 'Milano', country: 'איטליה' } }), 'Via Roma, Milano, איטליה');
  assert.equal(L.formatAddress({ name: '1_33051', address: { road: '1_33051', neighbourhood: 'Cinque Vie', city: 'מילנו', country: 'איטליה' } }), 'Cinque Vie, מילנו, איטליה');
  assert.equal(L.formatAddress({ display_name: 'X' }), 'X');
  assert.equal(L.formatAddress(null), '');
  assert.equal(L.mapsUrl({ lat: 45.5, lng: 10.6 }), 'https://www.google.com/maps/search/?api=1&query=45.5,10.6');
});

test('search matches the address', () => {
  assert.ok(L.matchesSearch(ex('א', 1, { details: 'x', address: 'Sirmione, איטליה' }), 'sirmione'));
});

test('photo data must be our JPEG data URL', () => {
  assert.ok(L.isPhotoData('data:image/jpeg;base64,/9j/4AAQ=='));
  assert.ok(!L.isPhotoData('x" onerror="alert(1)'));
  assert.ok(!L.isPhotoData('data:image/svg+xml;base64,PHN2Zz4='));
  assert.ok(!L.isPhotoData(null));
});

test('photo ids survive an edit even if saved photos never loaded', () => {
  assert.deepEqual(L.nextPhotoIds(['a', 'b', 'c'], [], ['d']), ['a', 'b', 'c', 'd']);
  assert.deepEqual(L.nextPhotoIds(['a', 'b'], ['a'], []), ['b']);
  assert.deepEqual(L.nextPhotoIds(undefined, [], ['x']), ['x']);
});

test('street names with numbers are kept', () => {
  assert.equal(L.formatAddress({ address: { road: 'Route 101', town: 'Eilat', country: 'ישראל' } }), 'Route 101, Eilat, ישראל');
});

test('shareMessage: trip name, link on its own line, password only when given', () => {
  const link = 'https://x.github.io/trip-tracker/#/trip/abc';
  assert.equal(L.shareMessage('איטליה', link), `🧳 הוצאות הטיול "איטליה"\n${link}`);
  assert.equal(L.shareMessage('איטליה', link, '0123'), `🧳 הוצאות הטיול "איטליה"\n${link}\n🔑 סיסמה: 0123`);
});

test('shareUrl: WhatsApp link with the whole message encoded', () => {
  const u = L.shareUrl('א b\n&');
  assert.equal(u, 'https://wa.me/?text=' + encodeURIComponent('א b\n&'));
});

// ---------- groups (Step 14) ----------
test('groupName: from members', () => {
  assert.equal(L.groupName(['דני']), 'דני');
  assert.equal(L.groupName(['דני', 'רותי']), 'דני ורותי');
  assert.equal(L.groupName(['א', 'ב', 'ג']), 'א, ב וג');
});

test('cleanGroups: one group per person, only participants, max 5, no empty, default names', () => {
  const g = L.cleanGroups([
    { name: '', members: ['א', 'ב'] },
    { name: 'זוג', members: ['ב', 'ג', 'זר'] }, // ב already taken, זר not in trip
    { name: 'ריק', members: [] },
    { members: ['ד'] }, { members: ['ה'] }, { members: ['ו'] }, { members: ['ז'] }
  ], ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז']);
  assert.equal(g.length, L.MAX_GROUPS);
  assert.deepEqual(g[0], { name: 'א וב', members: ['א', 'ב'] });
  assert.deepEqual(g[1], { name: 'זוג', members: ['ג'] });
  assert.deepEqual(g.map(x => x.members[0]), ['א', 'ג', 'ד', 'ה', 'ו']);
  assert.deepEqual(L.cleanGroups(undefined, ['א']), []);
});

test('groupBalances: groups sum members, people alone stay, sums to zero', () => {
  const bal = L.balances(['דני', 'רותי', 'יוסי', 'מיכל', 'אבי'],
    [ex('דני', 2500), ex('רותי', 120), ex('יוסי', 215)]);
  const u = L.groupBalances(bal, [{ name: 'דני ורותי', members: ['דני', 'רותי'] }, { name: 'יוסי ומיכל', members: ['יוסי', 'מיכל'] }]);
  assert.deepEqual(u.map(x => x.name), ['דני ורותי', 'יוסי ומיכל', 'אבי']);
  assert.deepEqual(u.map(x => x.members.length), [2, 2, 1]);
  assert.equal(u[0].isGroup, true); assert.equal(u[2].isGroup, false);
  assert.equal(u[0].paid, 2620); assert.equal(u[0].share, 1134);
  assert.equal(u[0].balance, 1486); assert.equal(u[1].balance, -919); assert.equal(u[2].balance, -567);
  const t = L.settleTransfers(u);
  assert.deepEqual(t, [{ from: 'יוסי ומיכל', to: 'דני ורותי', amount: 919 }, { from: 'אבי', to: 'דני ורותי', amount: 567 }]);
});

test('groupBalances: no groups = same as people', () => {
  const bal = L.balances(['א', 'ב'], [ex('א', 10)]);
  assert.deepEqual(L.groupBalances(bal, []).map(x => [x.name, x.balance]), [['א', 5], ['ב', -5]]);
});

// ---------- trip color (Step 16) ----------
test('tripColor: known key, else default', () => {
  assert.equal(L.TRIP_COLORS.length, 8);
  assert.equal(L.tripColor('mint').key, 'mint');
  assert.equal(L.tripColor('nope').key, L.TRIP_COLORS[0].key);
  assert.equal(L.tripColor(undefined).key, 'sky');
});

test('groupBalances: names stay unique (group named like a person / two same names)', () => {
  const bal = L.balances(['א', 'ב', 'ג', 'ד', 'ה'], [ex('א', 50)]);
  const u = L.groupBalances(bal, [{ name: 'ה', members: ['א', 'ב'] }, { name: 'ה', members: ['ג', 'ד'] }]);
  const names = u.map(x => x.name);
  assert.equal(new Set(names).size, names.length, names.join('|'));
  assert.ok(names.includes('ה'), 'the person keeps their own name');
});

// ---------- focus: chosen category/day first in the list ----------
test('focusSplit: chosen category first, the rest after, both keep their order', () => {
  const list = [
    ex('א', 1, { id: 'a', category: 'דלק', date: '2026-10-02' }),
    ex('א', 2, { id: 'b', category: 'טיסות', date: '2026-10-01' }),
    ex('א', 3, { id: 'c', category: 'דלק', date: '2026-09-30' }),
    ex('א', 4, { id: 'd', category: 'שונות', date: '2026-09-29' })
  ];
  const r = L.focusSplit(list, { kind: 'cat', name: 'דלק' });
  assert.deepEqual(r.first.map(e => e.id), ['a', 'c']);
  assert.deepEqual(r.rest.map(e => e.id), ['b', 'd']);
});

test('focusSplit: no focus = everything in rest, first empty', () => {
  const list = [ex('א', 1, { id: 'a' }), ex('א', 2, { id: 'b' })];
  const r = L.focusSplit(list, null);
  assert.deepEqual(r.first, []);
  assert.deepEqual(r.rest.map(e => e.id), ['a', 'b']);
});

test('focusSplit: by day; income never counts as in focus (charts count expenses only)', () => {
  const list = [
    ex('א', 1, { id: 'a', date: '2026-09-28' }),
    { ...inc('א', 5), id: 'i', date: '2026-09-28', category: 'שונות' },
    ex('א', 2, { id: 'b', date: '2026-09-29' })
  ];
  const r = L.focusSplit(list, { kind: 'day', name: '2026-09-28' });
  assert.deepEqual(r.first.map(e => e.id), ['a']);
  assert.deepEqual(r.rest.map(e => e.id), ['i', 'b']);
});

test('focusSplit: missing category matches "ללא קטגוריה" like the chart', () => {
  const list = [ex('א', 1, { id: 'a', category: '' }), ex('א', 2, { id: 'b' })];
  const r = L.focusSplit(list, { kind: 'cat', name: L.UNCATEGORIZED });
  assert.deepEqual(r.first.map(e => e.id), ['a']);
});
