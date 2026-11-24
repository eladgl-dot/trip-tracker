// Pure logic: no DOM, no Firebase. Tested by tests/logic.test.mjs (node --test).

export const UNCATEGORIZED = 'ללא קטגוריה';

export const DEFAULT_CATEGORIES = [
  'טיסות', 'לינה ומלונות', 'השכרת רכב', 'דלק', 'חניה וכבישי אגרה',
  'תחבורה ציבורית', 'מוניות והסעות', 'מסעדות ובתי קפה', 'אוכל רחוב וגלידות', 'סופרמרקט ומצרכים',
  'אטרקציות ופארקים', 'מוזיאונים ותרבות', 'סיורים מודרכים', 'קניות וביגוד', 'מתנות ומזכרות',
  'תקשורת ו-eSIM', 'ביטוח נסיעות', 'בריאות ובית מרקחת', 'כביסה וניקיון', 'ציוד לטיול',
  'חיי לילה וברים', 'ספורט ופעילות אתגרית', 'ספא ורוגע', 'טיפים', 'עמלות המרה ומשיכה',
  'ויזות ואישורים', 'שמירת חפצים', 'בייביסיטר / פעילות לילדים', 'צילום ומזכרות דיגיטליות', 'שונות'
];

const EMOJI = {
  'טיסות': '✈️', 'לינה ומלונות': '🏨', 'השכרת רכב': '🚗', 'דלק': '⛽', 'חניה וכבישי אגרה': '🅿️',
  'תחבורה ציבורית': '🚌', 'מוניות והסעות': '🚕', 'מסעדות ובתי קפה': '🍝', 'אוכל רחוב וגלידות': '🍦',
  'סופרמרקט ומצרכים': '🛒', 'אטרקציות ופארקים': '🎡', 'מוזיאונים ותרבות': '🏛️', 'סיורים מודרכים': '🧭',
  'קניות וביגוד': '🛍️', 'מתנות ומזכרות': '🎁', 'תקשורת ו-eSIM': '📶', 'ביטוח נסיעות': '🛡️',
  'בריאות ובית מרקחת': '💊', 'כביסה וניקיון': '🧺', 'ציוד לטיול': '🎒', 'חיי לילה וברים': '🍸',
  'ספורט ופעילות אתגרית': '🧗', 'ספא ורוגע': '💆', 'טיפים': '💁', 'עמלות המרה ומשיכה': '🏧',
  'ויזות ואישורים': '🛂', 'שמירת חפצים': '🧳', 'בייביסיטר / פעילות לילדים': '🧸',
  'צילום ומזכרות דיגיטליות': '📸', 'שונות': '📦', [UNCATEGORIZED]: '❔'
};
export const categoryEmoji = name => EMOJI[name] || '🏷️';

export const CURRENCIES = [
  { code: 'ILS', symbol: '₪', name: 'שקל' }, { code: 'EUR', symbol: '€', name: 'אירו' },
  { code: 'USD', symbol: '$', name: 'דולר אמריקאי' }, { code: 'GBP', symbol: '£', name: 'לירה שטרלינג' },
  { code: 'JPY', symbol: '¥', name: 'ין יפני' }, { code: 'THB', symbol: '฿', name: 'באט תאילנדי' },
  { code: 'CHF', symbol: 'CHF', name: 'פרנק שווייצרי' }, { code: 'CAD', symbol: 'C$', name: 'דולר קנדי' },
  { code: 'AUD', symbol: 'A$', name: 'דולר אוסטרלי' }, { code: 'CZK', symbol: 'Kč', name: 'קורונה צ׳כית' },
  { code: 'HUF', symbol: 'Ft', name: 'פורינט הונגרי' }, { code: 'PLN', symbol: 'zł', name: 'זלוטי פולני' },
  { code: 'TRY', symbol: '₺', name: 'לירה טורקית' }, { code: 'GEL', symbol: '₾', name: 'לארי גאורגי' },
  { code: 'AED', symbol: 'AED', name: 'דירהם' }, { code: 'EGP', symbol: 'E£', name: 'לירה מצרית' },
  { code: 'JOD', symbol: 'JD', name: 'דינר ירדני' }, { code: 'SEK', symbol: 'kr', name: 'כתר שוודי' },
  { code: 'NOK', symbol: 'kr', name: 'כתר נורווגי' }, { code: 'DKK', symbol: 'kr', name: 'כתר דני' },
  { code: 'ISK', symbol: 'kr', name: 'כתר איסלנדי' }, { code: 'RON', symbol: 'lei', name: 'לאו רומני' },
  { code: 'BGN', symbol: 'лв', name: 'לב בולגרי' }, { code: 'INR', symbol: '₹', name: 'רופי הודי' },
  { code: 'CNY', symbol: '¥', name: 'יואן סיני' }, { code: 'VND', symbol: '₫', name: 'דונג וייטנאמי' },
  { code: 'MXN', symbol: 'Mex$', name: 'פסו מקסיקני' }, { code: 'BRL', symbol: 'R$', name: 'ריאל ברזילאי' },
  { code: 'ZAR', symbol: 'R', name: 'ראנד' }, { code: 'NZD', symbol: 'NZ$', name: 'דולר ניו זילנדי' }
];
export const currencySymbol = code => (CURRENCIES.find(c => c.code === code) || {}).symbol || code;

// Half away from zero, so -728.625 -> -728.63 just like 728.625 -> 728.63.
export const round2 = n => Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100 || 0;

export function formatMoney(amount, code) {
  const n = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? '−' : ''}${currencySymbol(code)} ${n}`;
}

// Parse a user-typed amount: accepts "85.5", "85,5", "1,234.50".
export function parseAmount(text) {
  let s = String(text ?? '').trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  if (!/^\d*\.?\d+$/.test(s)) return NaN;
  return Number(s);
}

export const convert = (amount, rate) => round2(amount * rate);

// ---------- summary ----------
export function daysBetween(a, b) {
  const d = (Date.parse(b) - Date.parse(a)) / 86400000;
  return Math.round(d) + 1;
}

export function tripDayCount(trip, expenses, today = new Date().toISOString().slice(0, 10)) {
  if (trip.startDate && trip.endDate && trip.endDate >= trip.startDate) {
    if (today < trip.startDate) return daysBetween(trip.startDate, trip.endDate);
    const end = today < trip.endDate ? today : trip.endDate;
    return daysBetween(trip.startDate, end);
  }
  const days = new Set(expenses.map(e => e.date).filter(Boolean));
  return Math.max(days.size, 1);
}

export function summarize(trip, expenses, today) {
  let totalExpenses = 0, totalIncome = 0;
  for (const e of expenses) {
    if (e.type === 'income') totalIncome += e.convertedAmount; else totalExpenses += e.convertedAmount;
  }
  totalExpenses = round2(totalExpenses); totalIncome = round2(totalIncome);
  const net = round2(totalExpenses - totalIncome);
  const days = tripDayCount(trip, expenses, today);
  const people = Math.max(trip.participants.length, 1);
  return { totalExpenses, totalIncome, net, days, perDay: round2(net / days), perPerson: round2(net / people) };
}

// Group expenses (not income) by a key. Returns [{name, value, count}] sorted by value desc.
export function groupExpenses(expenses, keyFn) {
  const map = new Map();
  for (const e of expenses) {
    if (e.type === 'income') continue;
    const k = keyFn(e);
    const g = map.get(k) || { name: k, value: 0, count: 0 };
    g.value += e.convertedAmount; g.count++;
    map.set(k, g);
  }
  return [...map.values()].map(g => ({ ...g, value: round2(g.value) })).sort((a, b) => b.value - a.value);
}

export const byCategory = expenses => groupExpenses(expenses, e => e.category || UNCATEGORIZED);
export const byPayer = expenses => groupExpenses(expenses, e => e.paidBy);
export function byDay(expenses) {
  return groupExpenses(expenses, e => e.date).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- settle up ----------
// Equal split of net expenses. Income lowers the total; whoever received it owes it to the group.
export function balances(participants, expenses) {
  const paid = Object.fromEntries(participants.map(p => [p, 0]));
  const received = Object.fromEntries(participants.map(p => [p, 0]));
  let net = 0;
  for (const e of expenses) {
    if (!(e.paidBy in paid)) continue; // payer no longer in the trip: ignore in the split
    if (e.type === 'income') { received[e.paidBy] += e.convertedAmount; net -= e.convertedAmount; }
    else { paid[e.paidBy] += e.convertedAmount; net += e.convertedAmount; }
  }
  const share = participants.length ? net / participants.length : 0;
  return participants.map(name => ({
    name,
    paid: round2(paid[name]),
    received: round2(received[name]),
    share: round2(share),
    balance: round2(paid[name] - received[name] - share)
  }));
}

// Greedy: biggest debtor pays biggest creditor. At most n-1 transfers.
export function settleTransfers(balanceList) {
  const cents = balanceList.map(b => ({ name: b.name, c: Math.round(b.balance * 100) }));
  const creditors = cents.filter(x => x.c > 0).sort((a, b) => b.c - a.c);
  const debtors = cents.filter(x => x.c < 0).map(x => ({ ...x, c: -x.c })).sort((a, b) => b.c - a.c);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].c, creditors[j].c);
    if (amt > 1) out.push({ from: debtors[i].name, to: creditors[j].name, amount: amt / 100 });
    debtors[i].c -= amt; creditors[j].c -= amt;
    if (debtors[i].c <= 1) i++;
    if (creditors[j].c <= 1) j++;
  }
  return out;
}

// ---------- groups (couples / families settle as one) ----------
export const MAX_GROUPS = 10;

export function groupName(members) {
  if (members.length < 2) return members[0] || '';
  return `${members.slice(0, -1).join(', ')} ו${members[members.length - 1]}`;
}

// Keeps only participants, each person in one group (first wins), drops empty groups, max MAX_GROUPS.
export function cleanGroups(groups, participants) {
  const inTrip = new Set(participants), used = new Set(), out = [];
  for (const g of groups || []) {
    const members = (g.members || []).filter(p => inTrip.has(p) && !used.has(p));
    if (!members.length) continue;
    members.forEach(p => used.add(p));
    out.push({ name: (g.name || '').trim() || groupName(members), members });
    if (out.length === MAX_GROUPS) break;
  }
  return out;
}

// Sums per-person balances into groups; people not in a group stay as they are. Groups come first.
export function groupBalances(balanceList, groups) {
  const byName = new Map(balanceList.map(b => [b.name, b]));
  const used = new Set();
  const sum = (members, key) => round2(members.reduce((a, p) => a + byName.get(p)[key], 0));
  const units = [];
  // Transfers are matched by name, so a group never takes a person's name or another group's.
  const grouped = new Set((groups || []).flatMap(g => g.members || []));
  const taken = new Set(balanceList.map(b => b.name).filter(n => !grouped.has(n)));
  const unique = n => { let x = n, i = 2; while (taken.has(x)) x = `${n} (${i++})`; taken.add(x); return x; };
  for (const g of groups || []) {
    const members = g.members.filter(p => byName.has(p) && !used.has(p));
    if (!members.length) continue;
    members.forEach(p => used.add(p));
    units.push({ name: unique(g.name || groupName(members)), members, isGroup: true,
      paid: sum(members, 'paid'), received: sum(members, 'received'), share: sum(members, 'share'), balance: sum(members, 'balance') });
  }
  for (const b of balanceList) if (!used.has(b.name)) units.push({ ...b, members: [b.name], isGroup: false });
  return units;
}

// ---------- trip color ----------
export const TRIP_COLORS = [
  { key: 'sky', name: 'תכלת-סגול', from: '#E0F2FE', to: '#EDE9FE' }, { key: 'mint', name: 'מנטה', from: '#D1FAE5', to: '#E0F2FE' },
  { key: 'peach', name: 'אפרסק', from: '#FFE4E6', to: '#FEF3C7' }, { key: 'sun', name: 'שמש', from: '#FEF9C3', to: '#FFEDD5' },
  { key: 'lav', name: 'לבנדר', from: '#EDE9FE', to: '#FCE7F3' }, { key: 'ocean', name: 'ים', from: '#CFFAFE', to: '#DBEAFE' },
  { key: 'sand', name: 'חול', from: '#F5F5F4', to: '#FEF3C7' }, { key: 'rose', name: 'ורוד', from: '#FCE7F3', to: '#FFE4E6' }
];
export const tripColor = key => TRIP_COLORS.find(c => c.key === key) || TRIP_COLORS[0];

// ---------- budget ----------
// trip.budget = { amount, per: 'trip' | 'day' } in the trip currency. Compared with the net spend (expenses − refunds).
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
export function budgetSummary(trip, expenses, today = new Date().toISOString().slice(0, 10)) {
  const b = trip.budget;
  if (!b || !(b.amount > 0)) return null;
  const dated = !!(trip.startDate && trip.endDate && trip.endDate >= trip.startDate);
  const tripDays = dated ? daysBetween(trip.startDate, trip.endDate) : null;
  const total = round2(b.per === 'day' && tripDays ? b.amount * tripDays : b.amount);
  let spent = 0; const perDate = new Map();
  for (const e of expenses) {
    const v = e.type === 'income' ? -e.convertedAmount : e.convertedAmount;
    spent += v; if (e.date) perDate.set(e.date, (perDate.get(e.date) || 0) + v);
  }
  spent = round2(spent);
  const left = round2(total - spent);
  const pct = Math.max(0, Math.round(spent / total * 10000) / 10000); // refunds bigger than expenses → 0%, not negative
  const level = left < 0 ? 'over' : pct >= 0.8 ? 'warn' : 'ok';
  const base = { total, spent, left, pct, level, tripDays, daily: null, elapsed: null, daysLeft: null, expectedPct: null, allowedPerDay: null, avgPerDay: null, projection: null, outside: 0, days: [] };
  if (!dated) return base;
  const elapsed = today < trip.startDate ? 0 : today > trip.endDate ? tripDays : daysBetween(trip.startDate, today);
  const daysLeft = tripDays - elapsed;
  const daily = round2(total / tripDays);
  const allowedPerDay = daysLeft > 0 ? round2(Math.max(left, 0) / daysLeft) : null;
  // Average so far = only days of the trip up to today. Expenses outside the trip dates (or undated) are shown apart.
  let soFar = 0, inTrip = 0;
  for (const [date, v] of perDate) if (date >= trip.startDate && date <= trip.endDate) { inTrip += v; if (date <= today) soFar += v; }
  const outside = round2(spent - inTrip);
  const avgPerDay = elapsed > 0 ? round2(soFar / elapsed) : null;
  const projection = elapsed > 0 && daysLeft > 0 ? round2(soFar / elapsed * tripDays + spent - soFar) : null;
  const days = [];
  for (let i = 0; i < tripDays; i++) {
    const date = addDays(trip.startDate, i), s = round2(perDate.get(date) || 0), future = date > today;
    days.push({ date, spent: s, diff: future ? 0 : round2(s - daily), future, today: date === today, ...(future ? { allowed: allowedPerDay } : {}) });
  }
  return { ...base, outside, daily, elapsed, daysLeft, expectedPct: elapsed / tripDays, allowedPerDay, avgPerDay, projection, days };
}

// ---------- home: tags, search, grouping ----------
export const MAX_TAGS = 10;
export const NO_DATE = 'ללא תאריך';
export const NO_TAG = 'ללא תגית';
// Soft pastel chip colors; a tag's color comes from its name, so it is the same on every phone.
export const TAG_COLORS = [
  { bg: '#FFE4E6', ink: '#9F1239' }, { bg: '#DCFCE7', ink: '#166534' }, { bg: '#E0E7FF', ink: '#3730A3' }, { bg: '#FEF3C7', ink: '#92400E' },
  { bg: '#CFFAFE', ink: '#155E75' }, { bg: '#F3E8FF', ink: '#6B21A8' }, { bg: '#FFEDD5', ink: '#9A3412' }, { bg: '#E2E8F0', ink: '#334155' }
];
export function tagColor(name) {
  let h = 0;
  for (const ch of String(name || '').toLowerCase()) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}
export function normTags(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const raw of list) {
    const t = [...String(raw || '').trim().replace(/\s+/g, ' ')].slice(0, 20).join('').trim(); // by character, so an emoji is never cut in half
    if (t && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, MAX_TAGS);
}
// Tags compare without case ("Family" = "family"); the first spelling seen is shown.
const tagKey = t => String(t || '').toLowerCase();
export const hasTag = (trip, tag) => (trip.tags || []).some(x => tagKey(x) === tagKey(tag));
export function allTags(trips) {
  const n = new Map();
  for (const t of trips) for (const tag of t.tags || []) { const k = tagKey(tag), v = n.get(k); n.set(k, v ? { ...v, n: v.n + 1 } : { name: tag, n: 1 }); }
  return [...n.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'he')).map(x => x.name);
}
// Participant names are searchable only in my own trips (owner: other people's names stay hidden).
export function tripMatches(t, query, mine) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  const fields = [t.name, t.location, ...(t.tags || []), ...cleanCountries(t.countries).flatMap(c => [countryName(c, 'he'), countryName(c, 'en')]), ...(mine ? t.participants || [] : [])];
  return fields.some(f => (f || '').toLowerCase().includes(q));
}
export function filterTrips(trips, { mine = new Set(), scope = 'mine', tag = '', query = '' } = {}) {
  return trips.filter(t => (scope === 'all' || mine.has(t.id)) && (!tag || hasTag(t, tag)) && tripMatches(t, query, mine.has(t.id)));
}
export const sortTrips = trips => [...trips].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '') || (b.createdAtMs || 0) - (a.createdAtMs || 0));
// mode 'year' | 'tag' | 'none' → [{ key, label, tag?, trips }]. By tag with a tag filter on: every trip goes under the filtered tag.
export function groupTrips(trips, mode, filterTag = '', lang = 'he') {
  const sorted = sortTrips(trips);
  if (!sorted.length) return [];
  if (mode === 'none') return [{ key: 'all', label: '', trips: sorted }];
  if (mode === 'country') { // one country → its group; several → "כמה מדינות"; none → last
    const cm = new Map();
    for (const t of sorted) {
      const cs = cleanCountries(t.countries), k = cs.length > 1 ? '*' : cs[0] || '';
      if (!cm.has(k)) cm.set(k, []);
      cm.get(k).push(t);
    }
    const rank = k => k === '' ? 2 : k === '*' ? 1 : 0;
    return [...cm.keys()].sort((a, b) => rank(a) - rank(b) || countryName(a, lang).localeCompare(countryName(b, lang), lang))
      .map(k => ({ key: 'country:' + k, label: k === '*' ? MANY_COUNTRIES : k ? countryName(k, lang) || k : NO_COUNTRY, ...(k && k !== '*' ? { country: k } : {}), trips: cm.get(k) }));
  }
  const map = new Map();
  for (const t of sorted) {
    const k = mode === 'tag' ? (filterTag && hasTag(t, filterTag) ? filterTag : t.tags?.[0] || '') : (t.startDate || '').slice(0, 4);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  const keys = [...map.keys()].sort((a, b) => !a - !b || (mode === 'tag' ? a.localeCompare(b, 'he') : b.localeCompare(a)));
  return keys.map(k => ({ key: mode + ':' + k, label: k || (mode === 'tag' ? NO_TAG : NO_DATE), ...(mode === 'tag' && k ? { tag: k } : {}), trips: map.get(k) }));
}

// ---------- search ----------
export function matchesSearch(e, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [e.details, e.comment, e.category, e.paidBy, e.address].some(f => (f || '').toLowerCase().includes(q));
}

export function sortTransactions(list) {
  return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

// The item tapped in the chart ({kind: 'cat'|'day', name}) goes first in the list; order is kept in both parts.
// Income is never "in focus" because the charts count expenses only.
export function focusSplit(list, focus) {
  if (!focus) return { first: [], rest: [...list] };
  const key = focus.kind === 'day' ? e => e.date : e => e.category || UNCATEGORIZED;
  const first = [], rest = [];
  for (const e of list) (e.type !== 'income' && key(e) === focus.name ? first : rest).push(e);
  return { first, rest };
}

// ---------- validation ----------
export const isPin4 = s => /^\d{4}$/.test(s);
export const isCode6 = s => /^\d{6}$/.test(s);

export function validateTrip(t) {
  const errors = {};
  if (!t.name?.trim()) errors.name = 'יש להזין שם לטיול';
  if (!t.location?.trim()) errors.location = 'יש להזין מיקום';
  if (!t.defaultCurrency) errors.defaultCurrency = 'יש לבחור מטבע';
  if (!t.participants?.length) errors.participants = 'יש להוסיף לפחות משתתף אחד';
  if (t.startDate && t.endDate && t.endDate < t.startDate) errors.endDate = 'תאריך הסיום לפני תאריך ההתחלה';
  if ('pin' in t && !isPin4(t.pin || '')) errors.pin = 'סיסמה של 4 ספרות בדיוק';
  if (t.budget) {
    if (!(t.budget.amount > 0) || !Number.isFinite(t.budget.amount)) errors.budget = 'תקציב צריך להיות מספר גדול מ-0 (או להשאיר ריק)';
    else if (t.budget.per === 'day' && !(t.startDate && t.endDate)) errors.budget = 'תקציב ליום צריך תאריכי התחלה וסיום';
  }
  return errors;
}

export function validateExpense(x) {
  const errors = {};
  if (!(x.amount > 0)) errors.amount = 'יש להזין סכום גדול מאפס';
  if (!x.currency) errors.currency = 'יש לבחור מטבע';
  if (!(x.exchangeRateToTripDefault > 0)) errors.rate = 'חסר שער המרה';
  if (!x.category?.trim()) errors.category = 'יש לבחור קטגוריה';
  if (!x.date) errors.date = 'יש לבחור תאריך';
  if (!x.details?.trim()) errors.details = 'יש להזין פירוט';
  if (!x.paidBy) errors.paidBy = 'יש לבחור מי שילם';
  return errors;
}

// When a trip's default currency changes from old to new with rate r (1 old = r new).
export function reconvert(expense, newCurrency, rate) {
  const newRate = expense.currency === newCurrency ? 1 : round2x(expense.exchangeRateToTripDefault * rate);
  return { exchangeRateToTripDefault: newRate, convertedAmount: convert(expense.amount, newRate) };
}
const round2x = n => Math.round(n * 1e6) / 1e6;

// ---------- access ----------
export const ACCESS_MS = 3 * 24 * 60 * 60 * 1000;
export const hasAccess = (expiry, now = Date.now()) => Number(expiry) > now;

// ---------- photos and location ----------
// Fit w×h inside max×max, keeping the ratio. Never enlarges.
export function fitSize(w, h, max) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}
export const MAX_PHOTOS = 3;
// Only our own shrunk JPEGs may be shown (photo data comes from the shared database).
export const isPhotoData = d => typeof d === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d);
// Photo ids to keep on an expense: the saved ones minus the removed ones, plus the new ones.
// Does not depend on the saved photos having been loaded (offline, slow network).
export const nextPhotoIds = (saved = [], removed = [], added = []) => [...saved.filter(id => !removed.includes(id)), ...added];

export function formatAccuracy(m, units = ['מ׳', 'ק״מ']) {
  if (!(m >= 0)) return '';
  return m < 1000 ? `±${Math.round(m)} ${units[0]}` : `±${(m / 1000).toFixed(1)} ${units[1]}`;
}

// Short address from an OpenStreetMap Nominatim reverse reply: place name, street, town, country.
export function formatAddress(j) {
  if (!j) return '';
  const a = j.address || {};
  // OpenStreetMap sometimes has internal codes ("1_33051") instead of names: skip those.
  const real = s => !!s && /\p{L}{2}/u.test(s) && !s.includes('_');
  const street = real(a.road) ? a.road + (a.house_number ? ' ' + a.house_number : '') : (real(a.neighbourhood) ? a.neighbourhood : '');
  const town = a.city || a.town || a.village || a.hamlet || a.suburb || a.municipality || a.county || a.state || '';
  const parts = [real(j.name) && j.name !== a.road ? j.name : '', street, town, a.country || ''].filter(Boolean);
  return parts.length ? parts.join(', ') : (j.display_name || '');
}
export const mapsUrl = loc => `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;

// WhatsApp share: the link sits on its own line so it stays clickable inside Hebrew text.
export const shareMessage = (tripName, link, pin = '', words = ['הוצאות הטיול', 'סיסמה']) =>
  `🧳 ${words[0]} "${tripName}"\n${link}` + (pin ? `\n🔑 ${words[1]}: ${pin}` : '');
export const shareUrl = text => 'https://wa.me/?text=' + encodeURIComponent(text);

// ---- Undo after delete, and the trip trash (deleted trips are kept 30 days, restorable by the manager)
export const UNDO_MS = 8000;
export const TRASH_DAYS = 30;
const DAY_MS = 864e5;
export const isDeleted = t => !!t?.deletedAt;
export const trashDaysLeft = (t, now) => Math.max(0, Math.ceil((t.deletedAt + TRASH_DAYS * DAY_MS - now) / DAY_MS));
export const trashExpired = (t, now) => isDeleted(t) && now - t.deletedAt >= TRASH_DAYS * DAY_MS;

// Deletes that wait UNDO_MS before they really happen. undo(key) cancels one; flush() runs all now
// (used when the page changes or the app is hidden, so a delete is never lost).
export function pendingDeletes(ms = UNDO_MS, timers = { set: (f, t) => setTimeout(f, t), clear: id => clearTimeout(id) }) {
  const map = new Map();
  const finish = key => {
    const p = map.get(key); if (!p) return;
    timers.clear(p.timer); map.delete(key);
    try { p.commit(); } catch (e) { console.error(e); }
  };
  return {
    add(key, commit) { if (!map.has(key)) map.set(key, { commit, timer: timers.set(() => finish(key), ms) }); },
    undo(key) { const p = map.get(key); if (!p) return false; timers.clear(p.timer); map.delete(key); return true; },
    has: key => map.has(key),
    flush() { [...map.keys()].forEach(finish); },
    get size() { return map.size; },
  };
}

// ---------- Step 24: trip theme ----------
export const THEMES = ['light', 'dark', 'auto'];
export const tripTheme = t => THEMES.includes(t?.theme) ? t.theme : 'light';

// ---------- Step 24: countries (names come from the browser, flags from app/flags/<code>.svg) ----------
export const COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CP CR CU CV CW CX CY CZ DE DG DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PC PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' ');
export const MAX_COUNTRIES = 10;
export const MANY_COUNTRIES = 'כמה מדינות';
export const NO_COUNTRY = 'ללא מדינה';
const regionNames = new Map();
export function countryName(code, lang = 'he') {
  if (!COUNTRY_CODES.includes(code)) return '';
  try {
    if (!regionNames.has(lang)) regionNames.set(lang, new Intl.DisplayNames([lang], { type: 'region' }));
    const n = regionNames.get(lang).of(code);
    return n && n !== code ? n : '';
  } catch { return ''; }
}
export const flagUrl = code => `./flags/${String(code).toLowerCase()}.svg`;
export function cleanCountries(list) {
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    const k = String(c || '').toUpperCase();
    if (COUNTRY_CODES.includes(k) && !out.includes(k)) out.push(k);
  }
  return out.slice(0, MAX_COUNTRIES);
}
// Country names in the languages people write and OpenStreetMap answers in; matched as whole words.
// Hebrew may have a one/two-letter prefix (לאיטליה, ובצרפת).
const SUGGEST_LANGS = ['he', 'en', 'ru', 'it', 'es', 'fr', 'de'];
let nameIndex = null;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function countryPatterns() {
  if (nameIndex) return nameIndex;
  nameIndex = [];
  for (const code of COUNTRY_CODES) {
    const names = new Set(SUGGEST_LANGS.map(l => countryName(code, l)).filter(n => n && [...n].length >= 4));
    for (const n of names) {
      const he = /[֐-׿]/.test(n);
      nameIndex.push({ code, re: new RegExp(`(?<!\\p{L})${he ? '(?:[ובלמהשכ]{1,2})?' : ''}${reEsc(n)}(?!\\p{L})`, 'iu') });
    }
  }
  return nameIndex;
}
export function suggestCountries(texts, picked = []) {
  const found = [];
  (texts || []).forEach((txt, ti) => {
    if (!txt) return;
    for (const { code, re } of countryPatterns()) {
      const m = re.exec(txt);
      if (m && !picked.includes(code)) found.push({ code, pos: ti * 1e6 + m.index });
    }
  });
  found.sort((a, b) => a.pos - b.pos);
  return [...new Set(found.map(f => f.code))];
}

// ---------- Step 24: view currency (each expense converted with the rate of its own day) ----------
// map = { 'YYYY-MM-DD': rate } from the trip currency to the view currency (working days only).
// The view currency of a trip: only a known code that differs from the input currency (the value comes from the shared database).
export const viewCurrencyOf = t => {
  const v = t?.viewCurrency;
  return v && v !== t.defaultCurrency && CURRENCIES.some(c => c.code === v) ? v : '';
};
export function rateOnDate(map, date, fallback) {
  if (!map) return fallback;
  if (map[date] > 0) return map[date];
  const days = Object.keys(map).filter(d => map[d] > 0).sort();
  if (!days.length) return fallback;
  if (date > days[days.length - 1] && fallback > 0) return fallback; // newer than every stored rate: today's rate
  let best = null;
  for (const d of days) { if (d <= date) best = d; else break; }
  return map[best ?? days[0]];
}
export function toViewCurrency(expenses, map, fallback, same = false) {
  if (same) return expenses;
  return expenses.map(e => { const r = rateOnDate(map, e.date, fallback); return { ...e, viewRate: r, convertedAmount: round2(e.convertedAmount * r) }; });
}
// Dates that need a past rate (future days use today's rate).
export function rateRange(expenses, today) {
  const ds = expenses.map(e => e.date).filter(d => d && d <= today).sort();
  return ds.length ? { from: ds[0], to: ds[ds.length - 1] } : null;
}
// The stored map covers the range when it has a rate on or before the first day and one on or after the last day.
// Also false when the stored days inside the range have a hole longer than a long weekend (two separate fetches merged).
export function hasRatesFor(map, range) {
  if (!range) return true;
  const days = Object.keys(map || {}).sort();
  if (!days.length) return false;
  if (!(days[0] <= range.from && days[days.length - 1] >= range.to)) return false;
  const inside = days.filter(d => d >= range.from && d <= range.to);
  for (let i = 1; i < inside.length; i++) if ((Date.parse(inside[i]) - Date.parse(inside[i - 1])) / 864e5 > 6) return false;
  return true;
}

// ---------- Step 24: reading a receipt (text from the phone's OCR) ----------
const TOTAL_WORDS = /(סה["״']?\s?כ|סך\s?הכל|לתשלום|total|totale|importe|importo|summe|gesamt|итого|итог|к\s?оплате|всего|montant|suma|razem|celkem|összesen|toplam|amount\s?due|to\s?pay)/i;
// A line that STARTS with one of these is not the total (subtotal, tax, cash handed over, change, card).
const NOT_TOTAL = /^[^\p{L}\p{N}]*(sub\s?-?total|subtotale|iva|vat|tax|mwst|מע["״']?מ|ндс|resto|change|עודף|contanti|cash|מזומן|сдача|pagato|paid|card|carta|bancomat|אשראי|наличные)(?!\p{L})/iu;
const SIGNS = [[/€|\bEUR\b|\beuros?\b/i, 'EUR'], [/₪|ש["״']ח|\bNIS\b|\bILS\b/i, 'ILS'], [/£|\bGBP\b/i, 'GBP'], [/\bUSD\b|\$\s?\d|\d\s?\$/i, 'USD'],
  [/\bCHF\b/i, 'CHF'], [/₺|\bTRY\b/, 'TRY'], [/฿|\bTHB\b/i, 'THB'], [/\d\s?лв|лв\.?\s?\d|\bBGN\b/i, 'BGN'], [/Kč|\bCZK\b/i, 'CZK'],
  [/zł|\bPLN\b/i, 'PLN'], [/\bFt\b|\bHUF\b/, 'HUF'], [/\bRON\b|\blei\b/i, 'RON'], [/₾|\bGEL\b/i, 'GEL'], [/\bAED\b/i, 'AED'],
  [/\bJOD\b/i, 'JOD'], [/\bJPY\b|円/i, 'JPY'], [/₹|\bINR\b/i, 'INR'], [/₫|\bVND\b/i, 'VND']];
const CAT_WORDS = [
  [/gelat|ice\s?cream|גלידה|мороженое/i, 'אוכל רחוב וגלידות'],
  [/caff[eè]|cafe|café|coffee|cappuccino|espresso|starbucks|\bbar\b|ristorante|restaurant|pizzeria|trattoria|osteria|bistro|מסעדה|קפה|פיצה|кафе|ресторан|кофе/i, 'מסעדות ובתי קפה'],
  [/supermerc|supermarket|conad|\bcoop\b|carrefour|lidl|aldi|\bspar\b|billa|kaufland|\bmarket\b|שופרסל|רמי לוי|סופר|супермаркет|магазин/i, 'סופרמרקט ומצרכים'],
  [/taxi|uber|\bbolt\b|מונית|такси/i, 'מוניות והסעות'],
  [/hotel|albergo|hostel|b&b|airbnb|מלון|отель|гостиница/i, 'לינה ומלונות'],
  [/muse[oiu]|uffizi|מוזיאון|музей/i, 'מוזיאונים ותרבות'],
  [/farmacia|pharma|apotheke|בית מרקחת|аптека/i, 'בריאות ובית מרקחת'],
  [/benzin|\bfuel\b|petrol|diesel|gasolin|carburant|\besso\b|\bshell\b|\beni\b|דלק|бензин|азс/i, 'דלק'],
  [/parking|parcheggio|חניה|парковка/i, 'חניה וכבישי אגרה'],
  [/trenitalia|\btreno\b|\btrain\b|\bbahn\b|\bmetro\b|\bbus\b|רכבת|אוטובוס|поезд|метро|автобус/i, 'תחבורה ציבורית'],
];
// "1.234,50" / "1,234.50" / "10,00" / "9.07" → number. The last . or , followed by 1–2 digits is the decimal point.
const AMOUNT_RE = /\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?(?!\d)|\d+(?:[.,]\d{1,2})?(?!\d)/g;
function toNumber(s) {
  const m = /[.,](\d{1,2})$/.exec(s);
  const whole = (m ? s.slice(0, m.index) : s).replace(/[.,\s]/g, '');
  return Number(whole + (m ? '.' + m[1] : ''));
}
const stripDates = line => line.replace(/\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/g, ' ').replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ');
function amountsIn(line, decimalsOnly) {
  const out = [];
  for (const m of stripDates(line).matchAll(AMOUNT_RE)) {
    if (decimalsOnly && !/[.,]\d{2}$/.test(m[0])) continue;
    const n = toNumber(m[0]);
    if (n > 0 && n < 1e7) out.push(n);
  }
  return out;
}
function findDate(text) {
  const mk = (y, mo, d) => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    const s = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s ? s : '';
  };
  const iso = /(20\d{2})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) { const r = mk(+iso[1], +iso[2], +iso[3]); if (r) return r; }
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/g)) {
    let [a, b, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += 2000;
    const r = b > 12 && a <= 12 ? mk(y, a, b) : mk(y, b, a); // day first, unless that can't be (US style)
    if (r) return r;
  }
  return '';
}
export function parseReceipt(text, { currency = 'EUR', categories = DEFAULT_CATEGORIES } = {}) {
  text = String(text || '');
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // amount: the biggest number on a "total" line (or the line after it); otherwise the biggest number with cents
  const cands = [];
  lines.forEach((l, i) => {
    const m = TOTAL_WORDS.exec(l);
    if (!m || NOT_TOTAL.test(l)) return;
    const here = amountsIn(l.slice(m.index + m[0].length), false); // the first number after the word ("Total 12.50 Paid 20.00" → 12.50)
    const next = here.length ? here : amountsIn(lines[i + 1] || '', false);
    if (next.length) cands.push(next[0]);
  });
  if (!cands.length) lines.forEach(l => { if (!NOT_TOTAL.test(l) && !/tel|phone|טל|тел|p\.?\s?iva/i.test(l)) cands.push(...amountsIn(l, true)); });
  const amount = cands.length ? Math.max(...cands) : null;
  let cur = '';
  for (const [re, code] of SIGNS) if (re.test(text) && CURRENCIES.some(c => c.code === code)) { cur = code; break; }
  const letters = l => (l.match(/\p{L}/gu) || []).length;
  const details = (lines.find(l => letters(l) >= 3 && letters(l) >= l.replace(/\s/g, '').length * 0.6) || '').slice(0, 60);
  let category = '';
  for (const [re, name] of CAT_WORDS) if (re.test(text) && categories.includes(name)) { category = name; break; }
  return { amount, currency: cur || currency, date: findDate(text), details, category };
}

// ---------- Step 26: receipt words (from the OCR, with their boxes) and the check screen ----------
// word = { text, line, b: [x0, y0, x1, y1] } in image pixels. On Hebrew lines Tesseract reads "84.90" as two words "90 84":
// the dot is lost and the halves come out swapped. Two digit-only words side by side on the same line, the right one
// exactly 2 digits, the gap at most 1.6 × the text height (a printed dot on a fixed-width receipt), are one amount. Lines with a time or date are left alone (19:05).
const DIGITS = /^\d{1,5}$/;
export function receiptTokens(words) {
  const out = [];
  const byLine = new Map();
  (words || []).forEach((w, i) => {
    if (!/[\p{L}\p{N}\p{Sc}]/u.test(w.text)) return; // "|", "—": the paper's edge or a printed line, not a word (a lone "€" stays)
    if (!byLine.has(w.line)) byLine.set(w.line, []); byLine.get(w.line).push({ ...w, ids: [i] });
  });
  const hebrew = (words || []).some(w => /[\u05d0-\u05ea]/.test(w.text)); // only Hebrew receipts split numbers this way
  for (const line of byLine.values()) {
    const timeOrDate = !hebrew || line.some(w => /\d[:/.-]\d/.test(w.text));
    const used = new Set();
    if (!timeOrDate) {
      const nums = line.filter(w => DIGITS.test(w.text)).sort((a, b) => a.b[0] - b.b[0]);
      for (let k = 0; k + 1 < nums.length; k++) {
        const l = nums[k], r = nums[k + 1], h = Math.max(l.b[3] - l.b[1], r.b[3] - r.b[1]);
        const gap = r.b[0] - l.b[2], midL = (l.b[1] + l.b[3]) / 2, midR = (r.b[1] + r.b[3]) / 2;
        if (r.text.length !== 2 || l.text.length > 3 || gap < 0 || gap > 1.6 * h || Math.abs(midL - midR) > h / 2 || used.has(l) || used.has(r)) continue;
        if (line.some(o => o !== l && o !== r && o.b[2] > l.b[2] && o.b[0] < r.b[0])) continue; // another word sits between them
        used.add(l); used.add(r);
        const first = line.indexOf(l) < line.indexOf(r) ? l : r;
        first.merged = { text: `${l.text}.${r.text}`, b: [l.b[0], Math.min(l.b[1], r.b[1]), r.b[2], Math.max(l.b[3], r.b[3])], ids: [...first.ids, ...(first === l ? r : l).ids] };
        (first === l ? r : l).drop = true;
      }
    }
    for (const w of line) if (!w.drop) out.push(w.merged ? { text: w.merged.text, line: w.line, b: w.merged.b, ids: w.merged.ids } : { text: w.text, line: w.line, b: w.b, ids: w.ids });
  }
  return out;
}
export function receiptText(tokens) {
  const lines = [];
  for (const t of tokens) { if (!lines.length || lines[lines.length - 1].line !== t.line) lines.push({ line: t.line, words: [] }); lines[lines.length - 1].words.push(t.text); }
  return lines.map(l => l.words.join(' ')).join('\n');
}
// What the tapped words mean for a field: amount → number or null, date → 'yyyy-mm-dd' or '', place → text.
export function wordValue(field, texts) {
  const s = (texts || []).join(' ').trim();
  if (field === 'amount') { if (findDate(s) || /\d[:/]\d/.test(s)) return null; const m = s.replace(/[^\d.,\s]/g, '').trim().match(AMOUNT_RE); const n = m ? toNumber(m[0]) : 0; return n > 0 && n < 1e7 ? n : null; }
  if (field === 'date') return findDate(s);
  return s.slice(0, 60);
}
// The tokens the app used for each field (indexes into tokens), to colour them on the check screen.
export function receiptPicks(tokens, got) {
  const picks = { amount: [], date: [], place: [] };
  const lineText = l => tokens.filter(t => t.line === l).map(t => t.text).join(' ').replace(/\s+/g, ' ').trim();
  if (got.amount > 0) {
    const hits = tokens.map((t, i) => i).filter(i => wordValue('amount', [tokens[i].text]) === got.amount);
    const onTotal = hits.filter(i => TOTAL_WORDS.test(lineText(tokens[i].line)));
    const i = (onTotal.length ? onTotal : hits).pop();
    if (i !== undefined) picks.amount = [i];
  }
  if (got.date) { const i = tokens.findIndex(t => findDate(t.text) === got.date); if (i >= 0) picks.date = [i]; }
  if (got.details) {
    const t = tokens.find(t => lineText(t.line).slice(0, 60) === got.details);
    if (t) picks.place = tokens.map((x, i) => i).filter(i => tokens[i].line === t.line);
  }
  return picks;
}
// One tap on the check screen. amount / date: that word. place: the first tap starts again, later taps add or remove.
export function tapWord(picks, field, i, fresh) {
  const next = { amount: [...picks.amount], date: [...picks.date], place: [...picks.place] };
  if (field !== 'place') next[field] = [i];
  else if (fresh) next.place = [i];
  else next.place = next.place.includes(i) ? next.place.filter(x => x !== i) : [...next.place, i];
  return next;
}
