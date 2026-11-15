import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Fake browser storage and network for rates.js.
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
} });
let calls = 0, online = true;
globalThis.fetch = async () => {
  calls++;
  if (!online) throw new TypeError('Failed to fetch');
  return { ok: true, json: async () => ({ result: 'success', rates: { ILS: 1, EUR: 0.25, USD: 0.27 } }) };
};

const { prefetchRates, getRate } = await import('../app/js/rates.js');
beforeEach(() => { store.clear(); calls = 0; online = true; });

test('prefetchRates: one call keeps every currency → trip currency rate for offline use', async () => {
  await prefetchRates('ILS');
  assert.equal(calls, 1);
  online = false;
  const eur = await getRate('EUR', 'ILS');
  assert.equal(eur.source, 'cache');
  assert.equal(eur.rate, 4);
  assert.ok(Math.abs((await getRate('USD', 'ILS')).rate - 1 / 0.27) < 1e-9);
});

test('prefetchRates: skips the network when it ran in the last 6 hours', async () => {
  const t0 = Date.now();
  await prefetchRates('ILS', t0);
  await prefetchRates('ILS', t0 + 5 * 3600e3);
  assert.equal(calls, 1);
  await prefetchRates('ILS', t0 + 7 * 3600e3);
  assert.equal(calls, 2);
});

test('prefetchRates: offline it fails quietly and tries again next time', async () => {
  online = false;
  await prefetchRates('ILS');
  online = true;
  await prefetchRates('ILS');
  assert.equal(calls, 2);
});
