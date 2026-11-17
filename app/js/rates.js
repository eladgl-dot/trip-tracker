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

// While online, keep every currency → trip currency rate on the phone (one call, at most every 6 hours),
// so expenses in any currency get a rate on a plane or abroad without signal.
const PREFETCH = 'tt-rates-at:';
export async function prefetchRates(base, now = Date.now()) {
  let last = 0;
  try { last = Number(localStorage.getItem(PREFETCH + base)) || 0; } catch {}
  if (now - last < 6 * 3600e3) return;
  try {
    const j = await fetchJson(`https://open.er-api.com/v6/latest/${base}`);
    if (j?.result !== 'success' || !j.rates) return;
    for (const [code, r] of Object.entries(j.rates)) {
      if (code === base || !(r > 0)) continue;
      remember(code, base, 1 / r);
      remember(base, code, r);
    }
    try { localStorage.setItem(PREFETCH + base, String(now)); } catch {}
  } catch {} // offline or blocked: try again next time
}

// Past rates per day (ECB via Frankfurter), kept on the phone so the view currency works offline.
// Returns { map: { 'YYYY-MM-DD': rate }, today: rate|null }. Never throws.
const DAY = 'tt-day:';
const readDays = (from, to) => { try { return JSON.parse(localStorage.getItem(DAY + from + to)) || {}; } catch { return {}; } };
export async function getDayRates(from, to, range, covered) {
  let map = readDays(from, to);
  if (range && !covered(map, range)) {
    try {
      const j = await fetchJson(`https://api.frankfurter.dev/v1/${range.from}..${range.to}?from=${from}&to=${to}`, 8000);
      // a range that starts on a weekend gets the Friday before it (Frankfurter does that), so "covered" holds next time
      for (const [d, r] of Object.entries(j?.rates || {})) if (r?.[to] > 0) map[d] = r[to];
      if (j?.start_date && j.start_date > range.from && map[j.start_date]) map[range.from] = map[j.start_date];
      if (j?.end_date && j.end_date < range.to && map[j.end_date]) map[range.to] = map[j.end_date];
      try { localStorage.setItem(DAY + from + to, JSON.stringify(map)); } catch {}
    } catch {} // offline or currency not in the ECB list: today's rate is used for the missing days
  }
  let today = null;
  try { today = (await getRate(from, to)).rate; } catch {}
  return { map, today };
}
