// Demo backend: everything lives in this browser's localStorage. Open the app with ?demo to use it.
// Same interface as store-firebase.js.
import { DEFAULT_CATEGORIES } from './logic.js';
import { hashPin } from './pin.js';

const KEY = 'tt-demo-db';
const listeners = new Set();
let data;

function load() {
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch { data = null; }
  if (!data) data = { trips: {}, expenses: {}, categories: [...DEFAULT_CATEGORIES] };
  data.photos ||= {};
}
function save() {
  // Storage full (photos): undo the in-memory change and throw; async callers show an error toast.
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch { load(); queueMicrotask(() => listeners.forEach(fn => fn())); throw new Error('אין מקום בזיכרון הדפדפן (מצב הדגמה)'); }
  queueMicrotask(() => listeners.forEach(fn => fn()));
}
const watch = fn => { listeners.add(fn); queueMicrotask(fn); return () => listeners.delete(fn); };
const id = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
const clone = o => JSON.parse(JSON.stringify(o));

export const kind = 'demo';

export async function ready() {
  load();
  if (!Object.keys(data.trips).length && !data.seeded) await seed();
}

export const onTrips = cb => watch(() => cb(Object.entries(data.trips).map(([k, v]) => ({ id: k, ...clone(v) }))));
export const onTrip = (tid, cb) => watch(() => cb(data.trips[tid] ? { id: tid, ...clone(data.trips[tid]) } : null));
export const getTrip = async tid => data.trips[tid] ? { id: tid, ...clone(data.trips[tid]) } : null;

export const newTripId = id;
export async function createTripWithId(tid, t) {
  data.trips[tid] = { ...clone(t), createdAtMs: Date.now() }; data.expenses[tid] = {}; save(); return tid;
}
export async function updateTrip(tid, patch) { Object.assign(data.trips[tid], clone(patch)); save(); }
export async function deleteTrip(tid) { delete data.trips[tid]; delete data.expenses[tid]; delete data.photos[tid]; save(); }

export const onExpenses = (tid, cb) => watch(() => cb(Object.entries(data.expenses[tid] || {}).map(([k, v]) => ({ id: k, ...clone(v) }))));
export const newExpenseId = () => id();
export const newPhotoId = () => id();
export async function saveExpense(tid, eid, e, isNew = !eid, { addPhotos = [], removePhotos = [] } = {}) {
  data.expenses[tid] ||= {};
  if (!isNew) Object.assign(data.expenses[tid][eid], clone(e), { updatedAtMs: Date.now() });
  else { eid ||= id(); data.expenses[tid][eid] = { ...clone(e), createdAtMs: Date.now() }; }
  const ph = (data.photos[tid] ||= {});
  for (const p of addPhotos) ph[p.id] = { expenseId: eid, data: p.data, at: Date.now() };
  for (const pid of removePhotos) delete ph[pid];
  save(); return eid;
}
export async function patchExpense(tid, eid, patch) { if (data.expenses[tid]?.[eid]) { Object.assign(data.expenses[tid][eid], clone(patch)); save(); } }
export async function deleteExpense(tid, eid) {
  delete data.expenses[tid][eid];
  for (const [pid, p] of Object.entries(data.photos[tid] || {})) if (p.expenseId === eid) delete data.photos[tid][pid];
  save();
}
export async function getPhotos(tid, eid) {
  return Object.entries(data.photos[tid] || {}).filter(([, p]) => p.expenseId === eid).map(([k, p]) => ({ id: k, ...p })).sort((a, b) => a.at - b.at);
}

export async function updateExpenses(tid, updates) {
  for (const { id: eid, patch } of updates) Object.assign(data.expenses[tid][eid], clone(patch));
  save();
}

export const onCategories = cb => watch(() => cb([...data.categories]));
export async function setCategories(list) { data.categories = [...list]; save(); }
export async function addCategory(name) { if (!data.categories.includes(name)) { data.categories.push(name); save(); } }
export async function recategorizeAll(from, to) {
  let n = 0;
  for (const exps of Object.values(data.expenses))
    for (const e of Object.values(exps)) if (e.category === from) { e.category = to; n++; }
  save(); return n;
}
export const listTripsOnce = async () => Object.entries(data.trips).map(([k, v]) => ({ id: k, ...clone(v) }));

async function seed() {
  data.seeded = true;
  const tid = id();
  data.trips[tid] = {
    name: 'חופשה משפחתית בצפון איטליה', location: 'מילאנו ואגם גארדה',
    startDate: '2026-09-27', endDate: '2026-10-05', defaultCurrency: 'EUR',
    participants: ['אלעד', 'שני', 'ליב', 'נויה'], pinHash: await hashPin(tid, '1234'), createdAtMs: Date.now()
  };
  const rows = [
    ['expense', 1032, 'EUR', 1, 'לינה ומלונות', '2026-09-27', 'מלון בסירמיונה – 3 לילות', '', 'נויה'],
    ['expense', 395.86, 'EUR', 1, 'השכרת רכב', '2026-09-27', 'השכרת רכב ל-9 ימים', 'כולל ביטוח מלא', 'אלעד'],
    ['expense', 85.5, 'EUR', 1, 'מסעדות ובתי קפה', '2026-09-28', 'ארוחת ערב בבורגטו', 'כולל טיפ ושתייה', 'אלעד'],
    ['expense', 96, 'CHF', 1.064, 'אטרקציות ופארקים', '2026-09-28', 'כרטיסים לרכבל', '', 'שני'],
    ['income', 120, 'EUR', 1, 'השכרת רכב', '2026-09-28', 'החזר פיקדון רכב', '', 'אלעד'],
    ['expense', 64.2, 'EUR', 1, 'סופרמרקט ומצרכים', '2026-09-29', 'קניות בקונאד', '', 'שני'],
    ['expense', 48, 'EUR', 1, 'דלק', '2026-09-30', 'תדלוק', '', 'אלעד'],
    ['expense', 22.5, 'EUR', 1, 'אוכל רחוב וגלידות', '2026-10-01', 'גלידה בלאציזה', '', 'ליב']
  ];
  data.expenses[tid] = {};
  rows.forEach(([type, amount, currency, rate, category, date, details, comment, paidBy], i) => {
    data.expenses[tid][id()] = {
      type, amount, currency, exchangeRateToTripDefault: rate, convertedAmount: Math.round(amount * rate * 100) / 100,
      category, date, details, comment, paidBy, createdAtMs: Date.now() + i,
      ...(i === 7 ? { location: { lat: 45.5049, lng: 10.7326, acc: 12, at: Date.now() }, address: 'לאציזה, איטליה', photoIds: [] } : {})
    };
  });
  save();
}
