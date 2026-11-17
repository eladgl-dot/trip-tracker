// GPS while the expense form is open, and street address from OpenStreetMap (Nominatim).
import { formatAddress } from './logic.js';
import { lang } from './i18n.js';

// Calls onUpdate({ state: 'wait'|'fix'|'denied'|'off', loc }) every time the phone reports a new fix.
// Returns stop(). The last fix is the one that gets saved.
export function watchLocation(onUpdate) {
  if (!('geolocation' in navigator) || !window.isSecureContext) { onUpdate({ state: 'off' }); return () => {}; }
  onUpdate({ state: 'wait' });
  const id = navigator.geolocation.watchPosition(
    p => onUpdate({ state: 'fix', loc: { lat: round6(p.coords.latitude), lng: round6(p.coords.longitude), acc: Math.round(p.coords.accuracy), at: Date.now() } }),
    err => onUpdate({ state: err.code === 1 ? 'denied' : 'off' }),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}
const round6 = n => Math.round(n * 1e6) / 1e6;

export async function reverseGeocode(loc) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=${lang},en&lat=${loc.lat}&lon=${loc.lng}`;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw Object.assign(new Error('geocode ' + res.status), { status: res.status });
    return formatAddress(await res.json());
  } finally { clearTimeout(t); }
}

// Fill in addresses for expenses that have a point but no address yet (saved offline, or just now).
// One lookup per 1.2 s (Nominatim allows 1/s). Keyed by expense + point, so a moved point is looked up again.
// Before writing, the expense must still exist with the same point and no address.
const latest = new Map();        // tripId -> current expense list
const attempts = new Map();      // key -> failed tries
const queued = new Set(), queue = [];
let busy = false, pausedUntil = 0;
const keyOf = (tripId, e) => `${tripId}/${e.id}/${e.location.lat},${e.location.lng}`;
const current = (tripId, id) => (latest.get(tripId) || []).find(x => x.id === id);

export function fillAddresses(tripId, expenses, patch) {
  latest.set(tripId, expenses);
  for (const e of expenses) {
    if (!e.location || e.address) continue;
    const key = keyOf(tripId, e);
    if (queued.has(key) || (attempts.get(key) || 0) >= 3) continue;
    queued.add(key); queue.push({ key, tripId, id: e.id, patch });
  }
  pump();
}
async function pump() {
  if (busy || !queue.length || !navigator.onLine) return;
  if (Date.now() < pausedUntil) { setTimeout(pump, pausedUntil - Date.now()); return; }
  busy = true;
  const job = queue.shift();
  const e = current(job.tripId, job.id);
  let wait = 0;
  if (e?.location && !e.address && keyOf(job.tripId, e) === job.key) {
    wait = 1200;
    try {
      const address = await reverseGeocode(e.location);
      const now = current(job.tripId, job.id); // may have changed during the lookup
      if (address && now?.location && !now.address && keyOf(job.tripId, now) === job.key) job.patch(job.tripId, job.id, { address }); // not awaited: offline it resolves only after sync
      queued.delete(job.key);
    } catch (err) {
      attempts.set(job.key, (attempts.get(job.key) || 0) + 1);
      if (err?.status === 429) pausedUntil = Date.now() + 10 * 60 * 1000;
      setTimeout(() => queued.delete(job.key), 60 * 1000); // allow a retry a minute later
    }
  } else queued.delete(job.key);
  setTimeout(() => { busy = false; pump(); }, wait);
}
addEventListener('online', pump);
