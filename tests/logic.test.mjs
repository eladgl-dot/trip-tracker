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
