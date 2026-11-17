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

test('cleanGroups: one group per person, only participants, max 10, no empty, default names', () => {
  assert.equal(L.MAX_GROUPS, 10);
  const solo = ['ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ', 'ל', 'מ'];
  const g = L.cleanGroups([
    { name: '', members: ['א', 'ב'] },
    { name: 'זוג', members: ['ב', 'ג', 'זר'] }, // ב already taken, זר not in trip
    { name: 'ריק', members: [] },
    ...solo.map(p => ({ members: [p] }))
  ], ['א', 'ב', 'ג', ...solo]);
  assert.equal(g.length, L.MAX_GROUPS);
  assert.deepEqual(g[0], { name: 'א וב', members: ['א', 'ב'] });
  assert.deepEqual(g[1], { name: 'זוג', members: ['ג'] });
  assert.deepEqual(g.map(x => x.members[0]), ['א', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ']);
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

// ---------- home: my trips, tags, search, grouping (Step 20) ----------
const trip = (id, extra = {}) => ({ id, name: 'טיול ' + id, location: 'מקום', participants: ['אלעד'], startDate: '2026-08-12', tags: [], ...extra });

test('normTags: trims, drops empty, removes duplicates (any case), max 10, max 20 chars', () => {
  assert.deepEqual(L.normTags([' משפחה ', '', 'Ski', 'ski', 'משפחה']), ['משפחה', 'Ski']);
  assert.equal(L.normTags(Array.from({ length: 15 }, (_, i) => 't' + i)).length, L.MAX_TAGS);
  assert.equal(L.normTags(['x'.repeat(40)])[0].length, 20);
  assert.deepEqual(L.normTags(undefined), []);
});
test('tagColor: same tag always the same color, from the palette', () => {
  assert.deepEqual(L.tagColor('משפחה'), L.tagColor('משפחה'));
  assert.ok(L.TAG_COLORS.includes(L.tagColor('עבודה')));
  assert.ok(L.TAG_COLORS.includes(L.tagColor('')));
});
test('allTags: every tag once, most used first', () => {
  const ts = [trip('a', { tags: ['חו״ל', 'משפחה'] }), trip('b', { tags: ['משפחה'] }), trip('c')];
  assert.deepEqual(L.allTags(ts), ['משפחה', 'חו״ל']);
});
test('tripMatches: name, location, tags; participants only for my trips', () => {
  const t = trip('a', { name: 'איטליה', location: 'צפון', participants: ['איתי'], tags: ['משפחה'] });
  assert.ok(L.tripMatches(t, 'איט', false));
  assert.ok(L.tripMatches(t, 'צפו', false));
  assert.ok(L.tripMatches(t, 'משפ', false));
  assert.ok(L.tripMatches(t, '', false));
  assert.ok(!L.tripMatches({ ...t, name: 'יוון' }, 'איתי', false), 'other people\'s names never searchable');
  assert.ok(L.tripMatches({ ...t, name: 'יוון' }, 'איתי', true));
  assert.ok(L.tripMatches(trip('b', { name: 'Rome' }), 'ROME', false));
});
test('filterTrips: scope, tag and search together', () => {
  const ts = [trip('a', { tags: ['משפחה'] }), trip('b', { tags: ['חברים'] }), trip('c', { tags: ['משפחה'], name: 'יוון' })];
  const mine = new Set(['a', 'b']);
  assert.deepEqual(L.filterTrips(ts, { mine, scope: 'mine' }).map(t => t.id), ['a', 'b']);
  assert.deepEqual(L.filterTrips(ts, { mine, scope: 'all' }).map(t => t.id), ['a', 'b', 'c']);
  assert.deepEqual(L.filterTrips(ts, { mine, scope: 'all', tag: 'משפחה' }).map(t => t.id), ['a', 'c']);
  assert.deepEqual(L.filterTrips(ts, { mine, scope: 'all', tag: 'משפחה', query: 'יוו' }).map(t => t.id), ['c']);
});
test('sortTrips: newest start date first, then newest created', () => {
  const ts = [trip('a', { startDate: '2025-01-01' }), trip('b', { startDate: '2026-01-01', createdAtMs: 1 }), trip('c', { startDate: '2026-01-01', createdAtMs: 2 }), trip('d', { startDate: '' })];
  assert.deepEqual(L.sortTrips(ts).map(t => t.id), ['c', 'b', 'a', 'd']);
});
test('groupTrips by year: newest year first, no date last', () => {
  const ts = [trip('a', { startDate: '2025-05-01' }), trip('b', { startDate: '2026-01-01' }), trip('c', { startDate: '' }), trip('d', { startDate: '2026-09-01' })];
  const g = L.groupTrips(ts, 'year');
  assert.deepEqual(g.map(x => x.label), ['2026', '2025', L.NO_DATE]);
  assert.deepEqual(g[0].trips.map(t => t.id), ['d', 'b']);
});
test('groupTrips by tag: under the first tag, "ללא תגית" last', () => {
  const ts = [trip('a', { tags: ['משפחה', 'חו״ל'] }), trip('b', { tags: ['חברים'] }), trip('c'), trip('d', { tags: ['משפחה'] })];
  const g = L.groupTrips(ts, 'tag');
  assert.deepEqual(g.map(x => x.label), ['חברים', 'משפחה', L.NO_TAG]);
  assert.deepEqual(g[1].trips.map(t => t.id), ['a', 'd']);
  assert.equal(g[0].tag, 'חברים');
});
test('groupTrips none: one group without a label', () => {
  const g = L.groupTrips([trip('a'), trip('b')], 'none');
  assert.equal(g.length, 1); assert.equal(g[0].label, ''); assert.equal(g[0].trips.length, 2);
  assert.deepEqual(L.groupTrips([], 'year'), []);
});
test('normTags: string input is ignored, emoji not cut in half', () => {
  assert.deepEqual(L.normTags('משפחה'), []);
  const t = L.normTags(['😀'.repeat(25)])[0];
  assert.equal([...t].length, 20); assert.ok(!/[\uD800-\uDBFF]$/.test(t));
});
test('tags ignore case: one filter chip, same color, filter matches', () => {
  const ts = [trip('a', { tags: ['Family'] }), trip('b', { tags: ['family'] })];
  assert.deepEqual(L.allTags(ts), ['Family']);
  assert.deepEqual(L.tagColor('Family'), L.tagColor('family'));
  assert.equal(L.filterTrips(ts, { scope: 'all', tag: 'family' }).length, 2);
});
test('groupTrips by tag with a tag filter: trips go under the filtered tag', () => {
  const ts = [trip('a', { tags: ['משפחה', 'עבודה'] }), trip('b', { tags: ['עבודה'] })];
  const g = L.groupTrips(ts, 'tag', 'עבודה');
  assert.equal(g.length, 1); assert.equal(g[0].label, 'עבודה'); assert.equal(g[0].trips.length, 2);
});

// ---------- budget (Step 22) ----------
const bTrip = (budget, extra = {}) => ({ participants: ['א', 'ב'], startDate: '2026-09-27', endDate: '2026-10-05', budget, ...extra });
const bDays = [['2026-09-27', 480], ['2026-09-28', 610], ['2026-09-29', 395], ['2026-09-30', 720], ['2026-10-01', 505], ['2026-10-02', 530]]
  .map(([date, v]) => ex('א', v, { date }));

test('budgetSummary: none when no budget or zero', () => {
  assert.equal(L.budgetSummary(bTrip(undefined), bDays, '2026-10-02'), null);
  assert.equal(L.budgetSummary(bTrip({ amount: 0, per: 'trip' }), bDays, '2026-10-02'), null);
});
test('budgetSummary: mid-trip numbers (mockup example)', () => {
  const b = L.budgetSummary(bTrip({ amount: 4500, per: 'trip' }), bDays, '2026-10-02');
  assert.equal(b.total, 4500); assert.equal(b.daily, 500); assert.equal(b.tripDays, 9);
  assert.equal(b.spent, 3240); assert.equal(b.left, 1260);
  assert.equal(b.elapsed, 6); assert.equal(b.daysLeft, 3);
  assert.equal(b.allowedPerDay, 420); assert.equal(b.avgPerDay, 540); assert.equal(b.projection, 4860);
  assert.equal(b.pct, 0.72); assert.ok(Math.abs(b.expectedPct - 6 / 9) < 1e-9); assert.equal(b.level, 'ok');
  assert.equal(b.days.length, 9);
  assert.deepEqual(b.days[1], { date: '2026-09-28', spent: 610, diff: 110, future: false, today: false });
  assert.equal(b.days[5].today, true);
  assert.deepEqual(b.days[6], { date: '2026-10-03', spent: 0, diff: 0, future: true, today: false, allowed: 420 });
});
test('budgetSummary: per-day amount × trip days', () => {
  assert.equal(L.budgetSummary(bTrip({ amount: 500, per: 'day' }), bDays, '2026-10-02').total, 4500);
});
test('budgetSummary: refunds lower what is spent (net)', () => {
  const b = L.budgetSummary(bTrip({ amount: 4500, per: 'trip' }), [...bDays, { ...inc('א', 240), date: '2026-10-01' }], '2026-10-02');
  assert.equal(b.spent, 3000); assert.equal(b.days[4].spent, 265);
});
test('budgetSummary: levels ok / warn (80%+) / over', () => {
  const lvl = amt => L.budgetSummary(bTrip({ amount: amt, per: 'trip' }), bDays, '2026-10-02').level;
  assert.equal(lvl(4500), 'ok'); assert.equal(lvl(4050), 'warn'); assert.equal(lvl(3000), 'over');
  const o = L.budgetSummary(bTrip({ amount: 3000, per: 'trip' }), bDays, '2026-10-02');
  assert.equal(o.left, -240); assert.equal(o.allowedPerDay, 0);
});
test('budgetSummary: before and after the trip', () => {
  const pre = L.budgetSummary(bTrip({ amount: 4500, per: 'trip' }), [], '2026-09-01');
  assert.equal(pre.elapsed, 0); assert.equal(pre.allowedPerDay, 500); assert.equal(pre.projection, null); assert.equal(pre.avgPerDay, null);
  const post = L.budgetSummary(bTrip({ amount: 4500, per: 'trip' }), bDays, '2026-11-01');
  assert.equal(post.elapsed, 9); assert.equal(post.daysLeft, 0); assert.equal(post.allowedPerDay, null); assert.equal(post.projection, null);
  assert.equal(post.avgPerDay, 360); assert.ok(post.days.every(d => !d.future));
});
test('budgetSummary: trip without dates → total only', () => {
  const b = L.budgetSummary(bTrip({ amount: 4500, per: 'trip' }, { startDate: '', endDate: '' }), bDays, '2026-10-02');
  assert.equal(b.left, 1260); assert.equal(b.tripDays, null); assert.equal(b.daily, null);
  assert.deepEqual(b.days, []); assert.equal(b.allowedPerDay, null); assert.equal(b.expectedPct, null);
});
test('validateTrip: budget must be a positive number; per day needs dates', () => {
  assert.deepEqual(L.validateTrip({ ...bTrip({ amount: 500, per: 'day' }), name: 'x', location: 'y', defaultCurrency: 'EUR' }), {});
  assert.ok(L.validateTrip({ ...bTrip({ amount: 500, per: 'day' }, { startDate: '', endDate: '' }), name: 'x', location: 'y', defaultCurrency: 'EUR' }).budget);
  assert.ok(L.validateTrip({ ...bTrip({ amount: -5, per: 'trip' }), name: 'x', location: 'y', defaultCurrency: 'EUR' }).budget);
});
test('budgetSummary: expenses outside the trip dates are shown apart and not in the daily average', () => {
  const list = [...bDays, ex('א', 300, { date: '2026-09-01' }), ex('א', 100, { date: '' })];
  const b = L.budgetSummary(bTrip({ amount: 4500, per: 'trip' }), list, '2026-10-02');
  assert.equal(b.spent, 3640); assert.equal(b.outside, 400);
  assert.equal(b.avgPerDay, 540); assert.equal(b.projection, 5260); // 540 × 9 + 400 outside
  assert.equal(L.round2(b.days.reduce((s, d) => s + d.spent, 0) + b.outside), b.spent);
});
test('budgetSummary: future-dated expense inside the trip is not in the average so far', () => {
  const b = L.budgetSummary(bTrip({ amount: 4500, per: 'trip' }), [...bDays, ex('א', 900, { date: '2026-10-04' })], '2026-10-02');
  assert.equal(b.avgPerDay, 540); assert.equal(b.projection, 5760); assert.equal(b.outside, 0);
});
test('budgetSummary: refunds bigger than expenses → pct never below 0', () => {
  const b = L.budgetSummary(bTrip({ amount: 1000, per: 'trip' }), [{ ...inc('א', 200), date: '2026-09-28' }], '2026-10-02');
  assert.equal(b.spent, -200); assert.equal(b.pct, 0); assert.equal(b.level, 'ok');
});
test('budgetSummary: any amount over the budget is level "over"', () => {
  const b = L.budgetSummary(bTrip({ amount: 3239.99, per: 'trip' }), bDays, '2026-10-02');
  assert.ok(b.left < 0); assert.equal(b.level, 'over');
});

// ---- Step 23: undo + trip trash
test('trash: deleted flag, days left, expiry after 30 days', () => {
  const day = 864e5, at = Date.UTC(2026, 10, 1);
  assert.equal(L.isDeleted({}), false);
  assert.equal(L.isDeleted({ deletedAt: null }), false);
  assert.equal(L.isDeleted({ deletedAt: at }), true);
  assert.equal(L.trashDaysLeft({ deletedAt: at }, at), 30);
  assert.equal(L.trashDaysLeft({ deletedAt: at }, at + 27.5 * day), 3);
  assert.equal(L.trashDaysLeft({ deletedAt: at }, at + 40 * day), 0);
  assert.equal(L.trashExpired({ deletedAt: at }, at + 30 * day - 1), false);
  assert.equal(L.trashExpired({ deletedAt: at }, at + 30 * day), true);
  assert.equal(L.trashExpired({}, at + 99 * day), false);
});

function fakeTimers() {
  let n = 0; const map = new Map();
  return { set: (fn, ms) => { map.set(++n, fn); return n; }, clear: id => map.delete(id), fire: () => { const fns = [...map.values()]; map.clear(); fns.forEach(f => f()); }, get count() { return map.size; } };
}
test('pending deletes: commit after time, undo cancels, flush commits all', () => {
  const tm = fakeTimers(), done = [];
  const p = L.pendingDeletes(8000, tm);
  p.add('a', () => done.push('a'));
  p.add('b', () => done.push('b'));
  p.add('a', () => done.push('a2')); // same key twice is ignored
  assert.ok(p.has('a') && p.has('b'));
  assert.equal(p.undo('a'), true);
  assert.equal(p.undo('a'), false);
  assert.equal(p.has('a'), false);
  tm.fire();
  assert.deepEqual(done, ['b']);
  assert.equal(p.size, 0);
  p.add('c', () => done.push('c')); p.add('d', () => done.push('d'));
  p.flush();
  assert.deepEqual(done, ['b', 'c', 'd']);
  assert.equal(tm.count, 0);
  assert.equal(p.undo('c'), false); // too late
});
test('pending deletes: a failing commit does not stop the others', () => {
  const tm = fakeTimers(), done = [];
  const p = L.pendingDeletes(8000, tm);
  p.add('x', () => { throw new Error('boom'); });
  p.add('y', () => done.push('y'));
  p.flush();
  assert.deepEqual(done, ['y']);
});

// ---- Step 24: countries, view currency, receipt reading
test('countries: names in Hebrew/English/Russian from the code', () => {
  assert.equal(L.countryName('IT', 'he'), 'איטליה');
  assert.equal(L.countryName('IT', 'en'), 'Italy');
  assert.equal(L.countryName('IT', 'ru'), 'Италия');
  assert.equal(L.countryName('ZZ', 'he'), '');
  assert.ok(L.COUNTRY_CODES.includes('BG') && !L.COUNTRY_CODES.includes('EU'));
});
test('countries: clean list keeps known codes once, max 10', () => {
  assert.deepEqual(L.cleanCountries(['it', 'IT', 'ZZ', 'FR', null]), ['IT', 'FR']);
  assert.equal(L.cleanCountries(L.COUNTRY_CODES).length, L.MAX_COUNTRIES);
  assert.deepEqual(L.cleanCountries(undefined), []);
});
test('countries: suggested from trip name, place and expense addresses', () => {
  assert.deepEqual(L.suggestCountries(['איטליה 2026', 'רומא']), ['IT']);
  assert.deepEqual(L.suggestCountries(['Trip to France', 'Bar Centrale, Via Roma 12, Firenze, Italia']), ['FR', 'IT']);
  assert.deepEqual(L.suggestCountries(['סופיה', 'רחוב ויטושה, סופיה, בולגריה']), ['BG']);
  assert.deepEqual(L.suggestCountries(['איטליה'], ['IT']), []); // already picked
  assert.deepEqual(L.suggestCountries(['Oman trip to Romania']), ['OM', 'RO']);
  assert.deepEqual(L.suggestCountries(['Germany', 'Romantic weekend']), ['DE']); // "Oman" inside "Romantic" is not a match
});
test('countries: group trips by country, several countries together, none last', () => {
  const trips = [
    { id: 'a', startDate: '2026-01-01', countries: ['IT'] },
    { id: 'b', startDate: '2025-01-01', countries: ['BG'] },
    { id: 'c', startDate: '2024-01-01', countries: ['FR', 'IT'] },
    { id: 'd', startDate: '2023-01-01' },
    { id: 'e', startDate: '2022-01-01', countries: ['IT'] }];
  const g = L.groupTrips(trips, 'country');
  assert.deepEqual(g.map(x => x.key), ['country:IT', 'country:BG', 'country:*', 'country:']); // A–Z by Hebrew name
  assert.deepEqual(g[0].trips.map(t => t.id), ['a', 'e']);
  assert.equal(g[1].country, 'BG'); assert.equal(g[0].label, 'איטליה');
  assert.equal(g[2].label, L.MANY_COUNTRIES); assert.equal(g[3].label, L.NO_COUNTRY);
});
test('view currency: rate of the expense day, else the day before, else after, else fallback', () => {
  const m = { '2026-10-01': 3.5, '2026-10-02': 3.4, '2026-10-05': 3.3 };
  assert.equal(L.rateOnDate(m, '2026-10-02', 9), 3.4);
  assert.equal(L.rateOnDate(m, '2026-10-04', 9), 3.4); // weekend: last working day
  assert.equal(L.rateOnDate(m, '2026-09-20', 9), 3.5); // before the first known day
  assert.equal(L.rateOnDate({}, '2026-10-04', 9), 9);
  assert.equal(L.rateOnDate(null, '', 2), 2);
});
test('view currency: expenses converted with their own day rate', () => {
  const m = { '2026-10-03': 4, '2026-10-04': 3.975 };
  const list = [ex('א', 10, { date: '2026-10-03' }), ex('ב', 72, { date: '2026-10-04' }), inc('א', 5)];
  const v = L.toViewCurrency(list, m, 3.7);
  assert.deepEqual(v.map(e => e.convertedAmount), [40, 286.2, 20]); // income dated 28.9 → first known rate (4)
  assert.equal(list[0].convertedAmount, 10); // original untouched
  assert.equal(L.toViewCurrency(list, m, 1, true), list); // same currency: no change
});
test('view currency: days still missing a rate', () => {
  const m = { '2026-10-03': 4 };
  assert.deepEqual(L.rateRange([{ date: '2026-10-05' }, { date: '2026-10-01' }, { date: '' }], '2026-11-17'), { from: '2026-10-01', to: '2026-10-05' });
  assert.equal(L.rateRange([{ date: '2027-01-01' }], '2026-11-17'), null); // future only: today's rate
  assert.equal(L.rateRange([], '2026-11-17'), null);
  assert.equal(L.hasRatesFor(m, { from: '2026-10-03', to: '2026-10-03' }), true);
  assert.equal(L.hasRatesFor(m, { from: '2026-10-01', to: '2026-10-05' }), false);
});
test('receipt: Italian bar receipt', () => {
  const r = L.parseReceipt(`BAR CENTRALE\nVia Roma 12, Firenze\n04/10/2026 13:42\n2 x Cappuccino 7,00\n1 x Cornetto 3,00\nTOTALE EUR 10,00\nCONTANTI 20,00\nRESTO 10,00`, { currency: 'ILS' });
  assert.equal(r.amount, 10); assert.equal(r.currency, 'EUR'); assert.equal(r.date, '2026-10-04');
  assert.equal(r.details, 'BAR CENTRALE'); assert.equal(r.category, 'מסעדות ובתי קפה');
});
test('receipt: Hebrew supermarket, total on the next line, thousands', () => {
  const r = L.parseReceipt(`שופרסל דיל\nקבלה מס 4471\n12.11.26\nחלב 6.90\nסה"כ לתשלום\n1,234.50 ₪`, { currency: 'EUR' });
  assert.equal(r.amount, 1234.5); assert.equal(r.currency, 'ILS'); assert.equal(r.date, '2026-11-12');
  assert.equal(r.details, 'שופרסל דיל'); assert.equal(r.category, 'סופרמרקט ומצרכים');
});
test('receipt: Russian, no currency sign → trip currency', () => {
  const r = L.parseReceipt(`ООО Такси Город\n2026-03-07\nИТОГО: 850.00`, { currency: 'EUR' });
  assert.equal(r.amount, 850); assert.equal(r.currency, 'EUR'); assert.equal(r.date, '2026-03-07');
  assert.equal(r.category, 'מוניות והסעות');
});
test('receipt: no total word → biggest amount; nothing found → empty', () => {
  const r = L.parseReceipt(`MUSEO DEGLI UFFIZI\nBiglietto intero 25.00\nPrenotazione 4.00\n29.00\nTel 055 123456`, { currency: 'EUR' });
  assert.equal(r.amount, 29); assert.equal(r.category, 'מוזיאונים ותרבות');
  const n = L.parseReceipt('~~ ### ~~', { currency: 'EUR' });
  assert.equal(n.amount, null); assert.equal(n.date, ''); assert.equal(n.details, ''); assert.equal(n.currency, 'EUR');
});
test('receipt: OCR noise and US dates', () => {
  const r = L.parseReceipt(`Starbucks\n11/25/2026\nSubtotal $ 8.40\nTax 0.67\nTotal $ 9.07`, { currency: 'EUR' });
  assert.equal(r.amount, 9.07); assert.equal(r.currency, 'USD'); assert.equal(r.date, '2026-11-25');
  assert.equal(L.parseReceipt('Total 32/13/2026 5.00').date, ''); // impossible date ignored
});
test('trip theme: only light, dark or auto', () => {
  assert.equal(L.tripTheme({ theme: 'dark' }), 'dark');
  assert.equal(L.tripTheme({ theme: 'auto' }), 'auto');
  assert.equal(L.tripTheme({}), 'light');
  assert.equal(L.tripTheme({ theme: 'x' }), 'light');
});
test('review 1.19: view currency must be a known code different from the input currency', () => {
  assert.equal(L.viewCurrencyOf({ defaultCurrency: 'EUR', viewCurrency: 'ILS' }), 'ILS');
  assert.equal(L.viewCurrencyOf({ defaultCurrency: 'EUR', viewCurrency: 'EUR' }), '');
  assert.equal(L.viewCurrencyOf({ defaultCurrency: 'EUR', viewCurrency: '"><img src=x onerror=alert(1)>' }), '');
  assert.equal(L.viewCurrencyOf({ defaultCurrency: 'EUR' }), '');
});
test('review 1.19: days after the last known rate use today\'s rate', () => {
  assert.equal(L.rateOnDate({ '2026-10-01': 3.5 }, '2026-12-01', 3.7), 3.7);
  assert.equal(L.rateOnDate({ '2026-10-01': 3.5, '2026-10-02': 3.4 }, '2026-10-02', 3.7), 3.4);
});
test('review 1.19: a hole of more than 5 days in the stored rates means fetch again', () => {
  const m = { '2026-01-01': 1, '2026-01-02': 1, '2026-03-30': 1, '2026-03-31': 1 };
  assert.equal(L.hasRatesFor(m, { from: '2026-01-01', to: '2026-03-31' }), false);
  assert.equal(L.hasRatesFor({ '2026-01-02': 1, '2026-01-05': 1, '2026-01-06': 1 }, { from: '2026-01-02', to: '2026-01-06' }), true); // weekend is fine
});
test('review 1.19: receipt totals that mention VAT, and paid amounts on the same line', () => {
  assert.equal(L.parseReceipt('Shop\nTOTAL (incl. VAT) 21.00\nCard 21.00').amount, 21);
  assert.equal(L.parseReceipt('Shop\nTotal 12.50 Paid 20.00').amount, 12.5);
  assert.equal(L.parseReceipt('Shop\nסה"כ כולל מע"מ 84.90\nמזומן 100.00').amount, 84.9);
  assert.equal(L.parseReceipt('Shop\nSubtotal 10.00\nTotale 12.20\nPagato 50,00').amount, 12.2);
  assert.equal(L.parseReceipt('Currency exchange office\nTotal 30.00').amount, 30);
  assert.equal(L.parseReceipt('Eurospin\nTotale 9.99', { currency: 'ILS' }).currency, 'ILS'); // "Euro" inside a shop name is not €
});
