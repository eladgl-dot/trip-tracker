// Firestore backend. Same interface as store-demo.js.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, writeBatch, serverTimestamp, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from '../config.js';
import { DEFAULT_CATEGORIES } from './logic.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Offline: data is kept in IndexedDB and synced when the network returns.
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

const withId = d => ({ id: d.id, ...d.data() });
const tripsCol = () => collection(db, 'trips');
const expCol = tripId => collection(db, 'trips', tripId, 'expenses');
const catDoc = () => doc(db, 'settings', 'categories');
const photoCol = tripId => collection(db, 'trips', tripId, 'photos');

export const kind = 'firebase';

export function ready() {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, user => {
      if (user) { stop(); resolve(); }
    });
    // Offline with a remembered user: onAuthStateChanged fires with the cached user.
    signInAnonymously(auth).catch(err => { if (!auth.currentUser) reject(err); });
  });
}

export const onTrips = (cb, onErr) => onSnapshot(tripsCol(), s => cb(s.docs.map(withId)), onErr);
export const onTrip = (id, cb, onErr) => onSnapshot(doc(db, 'trips', id), s => cb(s.exists() ? withId(s) : null), onErr);
export const getTrip = async id => { const s = await getDoc(doc(db, 'trips', id)); return s.exists() ? withId(s) : null; };

export const newTripId = () => doc(tripsCol()).id;
export async function createTripWithId(id, data) {
  await setDoc(doc(db, 'trips', id), { ...data, createdAt: serverTimestamp(), createdAtMs: Date.now() });
  return id;
}
export const updateTrip = (id, patch) => updateDoc(doc(db, 'trips', id), patch);

export async function deleteTrip(id) {
  const [exps, photos] = await Promise.all([getDocs(expCol(id)), getDocs(photoCol(id))]);
  let batch = writeBatch(db), n = 0;
  for (const d of [...exps.docs, ...photos.docs]) {
    batch.delete(d.ref);
    if (++n % 450 === 0) { await batch.commit(); batch = writeBatch(db); }
  }
  batch.delete(doc(db, 'trips', id));
  await batch.commit();
}

export const onExpenses = (tripId, cb, onErr) => onSnapshot(expCol(tripId), s => cb(s.docs.map(withId)), onErr);

export const newExpenseId = tripId => doc(expCol(tripId)).id;
// isNew: create with this id (from newExpenseId), else update. The caller doesn't block on the
// promise (offline it resolves only after sync) but still sees errors.
export const newPhotoId = tripId => doc(photoCol(tripId)).id;
// One batch: the expense, its new photos and removed photos all succeed or fail together.
export async function saveExpense(tripId, id, data, isNew = !id, { addPhotos = [], removePhotos = [] } = {}) {
  const batch = writeBatch(db), now = serverTimestamp();
  const ref = doc(db, 'trips', tripId, 'expenses', id || newExpenseId(tripId));
  if (isNew) batch.set(ref, { ...data, createdAt: now, updatedAt: now, createdAtMs: Date.now() });
  else batch.update(ref, { ...data, updatedAt: now });
  for (const p of addPhotos) batch.set(doc(db, 'trips', tripId, 'photos', p.id), { expenseId: ref.id, data: p.data, at: Date.now() });
  for (const pid of removePhotos) batch.delete(doc(db, 'trips', tripId, 'photos', pid));
  return batch.commit();
}
export const patchExpense = (tripId, id, patch) => updateDoc(doc(db, 'trips', tripId, 'expenses', id), patch);
// photoIds come from the expense itself, so this works offline without reading the photos.
export async function deleteExpense(tripId, id, photoIds = []) {
  const batch = writeBatch(db);
  photoIds.forEach(pid => batch.delete(doc(db, 'trips', tripId, 'photos', pid)));
  batch.delete(doc(db, 'trips', tripId, 'expenses', id));
  return batch.commit();
}

// Photos live in their own collection so the expense list stays small; loaded only when opened.
export async function getPhotos(tripId, expenseId) {
  const s = await getDocs(query(photoCol(tripId), where('expenseId', '==', expenseId)));
  return s.docs.map(withId).sort((a, b) => a.at - b.at);
}


export async function updateExpenses(tripId, updates) {
  let batch = writeBatch(db), n = 0;
  for (const { id, patch } of updates) {
    batch.update(doc(db, 'trips', tripId, 'expenses', id), { ...patch, updatedAt: serverTimestamp() });
    if (++n % 450 === 0) { await batch.commit(); batch = writeBatch(db); }
  }
  await batch.commit();
}

export function onCategories(cb, onErr) {
  let seeded = false;
  return onSnapshot(catDoc(), s => {
    if (!s.exists()) {
      if (!seeded && !s.metadata.fromCache) { seeded = true; setDoc(catDoc(), { list: DEFAULT_CATEGORIES }).catch(onErr); }
      cb(DEFAULT_CATEGORIES);
    } else cb(s.data().list || []);
  }, onErr);
}
export const setCategories = list => setDoc(catDoc(), { list });
// Adding uses arrayUnion so two devices (or an offline device) never overwrite each other's list.
export const addCategory = name => setDoc(catDoc(), { list: arrayUnion(name) }, { merge: true });

// Change category `from` to `to` in every expense of every trip. Returns how many changed.
export async function recategorizeAll(from, to) {
  const trips = await getDocs(tripsCol());
  let changed = 0;
  for (const t of trips.docs) {
    const hits = await getDocs(query(expCol(t.id), where('category', '==', from)));
    if (hits.empty) continue;
    let batch = writeBatch(db), n = 0;
    for (const d of hits.docs) {
      batch.update(d.ref, { category: to });
      if (++n % 450 === 0) { await batch.commit(); batch = writeBatch(db); }
    }
    await batch.commit();
    changed += hits.size;
  }
  return changed;
}

export const listTripsOnce = async () => (await getDocs(tripsCol())).docs.map(withId);
