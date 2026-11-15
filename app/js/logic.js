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

// ---------- search ----------
export function matchesSearch(e, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [e.details, e.comment, e.category, e.paidBy, e.address].some(f => (f || '').toLowerCase().includes(q));
}

export function sortTransactions(list) {
  return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAtMs || 0) - (a.createdAtMs || 0));
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

export function formatAccuracy(m) {
  if (!(m >= 0)) return '';
  return m < 1000 ? `±${Math.round(m)} מ׳` : `±${(m / 1000).toFixed(1)} ק״מ`;
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
export const shareMessage = (tripName, link, pin = '') =>
  `🧳 הוצאות הטיול "${tripName}"\n${link}` + (pin ? `\n🔑 סיסמה: ${pin}` : '');
export const shareUrl = text => 'https://wa.me/?text=' + encodeURIComponent(text);
