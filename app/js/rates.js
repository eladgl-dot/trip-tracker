// Live exchange rates with a localStorage fallback for when there is no signal abroad.
const CACHE = 'tt-rate:';

function remember(from, to, rate) {
  try { localStorage.setItem(CACHE + from + to, JSON.stringify({ rate, at: Date.now() })); } catch {}
}
export function cachedRate(from, to) {
  try { return JSON.parse(localStorage.getItem(CACHE + from + to)); } catch { return null; }
}

async function fetchJson(url, ms = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

// Returns { rate, source: 'live' | 'cache', at } or throws when nothing is available.
export async function getRate(from, to) {
  if (from === to) return { rate: 1, source: 'live', at: Date.now() };
  try {
    const j = await fetchJson(`https://open.er-api.com/v6/latest/${from}`);
    const rate = j?.rates?.[to];
    if (j.result === 'success' && rate > 0) { remember(from, to, rate); return { rate, source: 'live', at: Date.now() }; }
  } catch {}
  try {
    const j = await fetchJson(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
    const rate = j?.rates?.[to];
    if (rate > 0) { remember(from, to, rate); return { rate, source: 'live', at: Date.now() }; }
  } catch {}
  const c = cachedRate(from, to);
  if (c?.rate > 0) return { rate: c.rate, source: 'cache', at: c.at };
  const back = cachedRate(to, from);
  if (back?.rate > 0) return { rate: 1 / back.rate, source: 'cache', at: back.at };
  throw new Error('no rate');
}
