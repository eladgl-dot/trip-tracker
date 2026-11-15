// Trip PINs are stored as a SHA-256 hash, never as the digits themselves.
// The trip id is mixed in, so the same PIN gives a different hash on every trip.
export async function hashPin(tripId, pin) {
  const bytes = new TextEncoder().encode(`triptracker:${tripId}:${pin}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const hashAdmin = code => sha256(`triptracker:admin:${code}`);

export async function checkPin(trip, pin) {
  if (trip.pinHash) return trip.pinHash === await hashPin(trip.id, pin);
  return trip.pin === pin; // trips created by hand in the console with a plain "pin" field
}
