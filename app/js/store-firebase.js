// Firestore backend. Same interface as store-demo.js.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, writeBatch, serverTimestamp, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from '../config.js';
import { DEFAULT_CATEGORIES, splitParts } from './logic.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Offline: data is kept in IndexedDB and synced when the network returns.
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

const withId = d => ({ id: d.id, ...d.data() });
const tripsCol = () => collection(db, 'trips');
const expCol = tripId => collection(db, 'trips', tripId, 'expenses');
const catDoc = () => doc(db, 'settings', 'categories');
const photoCol = tripId => collection(db, 'trips', tripId, 'photos');
// Attached files (Step 27): trips/{id}/files/{fid} = name, type, size, expenseId, parts; the file itself is split
// into base64 pieces trips/{id}/files/{fid}/parts/p0..pN (a Firestore record holds at most 1 MB).
const fileCol = tripId => collection(db, 'trips', tripId, 'files');
const partRef = (tripId, fid, i) => doc(db, 'trips', tripId, 'files', fid, 'parts', 'p' + i);
const dropFile = (batch, tripId, f) => { for (let i = 0; i < (f.parts || 0); i++) batch.delete(partRef(tripId, f.id, i)); batch.delete(doc(db, 'trips', tripId, 'files', f.id)); };

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
  const [exps, photos, files] = await Promise.all([getDocs(expCol(id)), getDocs(photoCol(id)), getDocs(fileCol(id))]);
  const refs = [...exps.docs.map(d => d.ref), ...photos.docs.map(d => d.ref)];
  for (const f of files.docs) { for (let i = 0; i < (f.data().parts || 0); i++) refs.push(partRef(id, f.id, i)); refs.push(f.ref); }
  let batch = writeBatch(db), n = 0;
  for (const r of refs) {
    batch.delete(r);
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
export const newFileId = tripId => doc(fileCol(tripId)).id;
// One batch: the expense, its new photos and removed photos/files all succeed or fail together.
// Each new file (up to 5 MB → ~7 MB of text) goes first in a batch of its own: a batch may carry at most 10 MB.
// Nothing is awaited in between, so it also works offline (the writes wait in the phone's queue, in order).
export async function saveExpense(tripId, id, data, isNew = !id, { addPhotos = [], removePhotos = [], addFiles = [], removeFiles = [] } = {}) {
  const ref = doc(db, 'trips', tripId, 'expenses', id || newExpenseId(tripId));
  const fileWrites = addFiles.map(f => {
    const b = writeBatch(db), parts = splitParts(f.data);
    b.set(doc(db, 'trips', tripId, 'files', f.id), { expenseId: ref.id, name: f.name, type: f.type, size: f.size, parts: parts.length, at: Date.now() });
    parts.forEach((p, i) => b.set(partRef(tripId, f.id, i), { data: p }));
    return b.commit();
  });
  const batch = writeBatch(db), now = serverTimestamp();
  if (isNew) batch.set(ref, { ...data, createdAt: now, updatedAt: now, createdAtMs: Date.now() });
  else batch.update(ref, { ...data, updatedAt: now });
  for (const p of addPhotos) batch.set(doc(db, 'trips', tripId, 'photos', p.id), { expenseId: ref.id, data: p.data, at: Date.now() });
  for (const pid of removePhotos) batch.delete(doc(db, 'trips', tripId, 'photos', pid));
  for (const f of removeFiles) dropFile(batch, tripId, f);
  return Promise.all([...fileWrites, batch.commit()]);
}
export const patchExpense = (tripId, id, patch) => updateDoc(doc(db, 'trips', tripId, 'expenses', id), patch);
// photoIds come from the expense itself, so this works offline without reading the photos.
export async function deleteExpense(tripId, id, photoIds = [], files = []) {
  const batch = writeBatch(db);
  photoIds.forEach(pid => batch.delete(doc(db, 'trips', tripId, 'photos', pid)));
  files.forEach(f => dropFile(batch, tripId, f));
  batch.delete(doc(db, 'trips', tripId, 'expenses', id));
  return batch.commit();
}

// Photos live in their own collection so the expense list stays small; loaded only when opened.
export async function getPhotos(tripId, expenseId) {
  const s = await getDocs(query(photoCol(tripId), where('expenseId', '==', expenseId)));
  return s.docs.map(withId).sort((a, b) => a.at - b.at);
}
// Every photo of the trip (the 🧷 screen).
export async function getAllPhotos(tripId) {
  const s = await getDocs(photoCol(tripId));
  return s.docs.map(withId);
}
// The file's base64 text, put back together from its pieces.
export async function getFileData(tripId, f) {
  const parts = await Promise.all(Array.from({ length: f.parts || 0 }, (_, i) => getDoc(partRef(tripId, f.id, i))));
  if (parts.some(p => !p.exists())) throw new Error('file-missing');
  return parts.map(p => p.data().data).join('');
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
