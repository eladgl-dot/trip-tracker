// TripTracker – screens and routing. Routes: #/ home · #/new · #/trip/<id> · #/admin
import { store } from './store.js';
import * as L from './logic.js';
import { esc, $, $$, toast, modal, confirmBox, codePrompt, reportError, formatDate, dateRange, todayIso, closeAll, undoToast, hideUndoToast } from './ui.js';
import { breakdown, bars } from './charts.js';
import { hashPin, checkPin, hashAdmin } from './pin.js';
import { getRate, prefetchRates, getDayRates } from './rates.js';
import { readReceipt } from './ocr.js';
import { t, t as T, N, lang, LANGS, setLang, applyDir, backArrow, fwdArrow, isRtl, holdHebrew } from './i18n.js';
import { watchLocation, fillAddresses } from './geo.js';
import { shrinkImage } from './photo.js';
import { ADMIN_HASH } from '../config.js';

const view = $('#app');
let cleanups = [];
let categories = [...L.DEFAULT_CATEGORIES];
const catListeners = new Set();

const ACCESS_KEY = id => 'tt-access:' + id;
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
};
const grantAccess = id => { ls.set(ACCESS_KEY(id), String(Date.now() + L.ACCESS_MS)); addMine(id); };
const accessLeft = id => Number(ls.get(ACCESS_KEY(id))) - Date.now();
const isAdmin = () => sessionStorage.getItem('tt-admin') === '1';
// "My trips" = trips this phone created or opened with the password (no accounts). Kept after the access expires.
const MINE_KEY = 'tt-mine';
let mineMem = null; // used when the browser blocks storage (some private modes)
function mineIds() {
  let list = null;
  try { list = JSON.parse(ls.get(MINE_KEY)); } catch {}
  if (!Array.isArray(list) && mineMem) return new Set(mineMem);
  if (!Array.isArray(list)) { // first run after the update: every trip this phone ever unlocked is "mine"
    list = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('tt-access:')) list.push(k.slice(10)); } } catch {}
    ls.set(MINE_KEY, JSON.stringify(list));
  }
  mineMem = new Set(list);
  return new Set(list);
}
const saveMine = set => { mineMem = new Set(set); ls.set(MINE_KEY, JSON.stringify([...set])); };
const addMine = id => { const s = mineIds(); if (!s.has(id)) { s.add(id); saveMine(s); } };
const removeMine = id => { const s = mineIds(); s.delete(id); saveMine(s); };

let knownTags = []; // every tag used in any trip; filled by the home page, offered in the tag picker
const tagChip = (tag, extra = '') => { const c = L.tagColor(tag); return `<span class="tag ${extra}" style="--tg:${c.bg};--ti:${c.ink}"><bdi>${esc(tag)}</bdi></span>`; };

// Home view settings, remembered on this phone: scope 'mine'|'all', group 'year'|'tag'|'none', tag filter.
const HOME_KEY = 'tt-home';
const homePrefs = () => { try { return JSON.parse(ls.get(HOME_KEY)) || {}; } catch { return {}; } };
const GROUP_NAMES = { year: N('לפי שנה'), tag: N('לפי תגית'), country: N('לפי מדינה'), none: N('בלי קיבוץ') };

// Theme: a trip page uses the trip's setting (light / dark / auto); every other page follows the phone.
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  const dark = mode === 'dark' || (mode === 'auto' && darkQuery.matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0B1220' : '#F3F6FA');
}
darkQuery.addEventListener?.('change', () => applyTheme(document.documentElement.dataset.theme || 'auto'));
// Country flags (pictures, because Windows shows emoji flags as letters).
const cName = c => L.countryName(c, lang) || L.countryName(c);
const flagImg = c => `<img class="flag" src="${L.flagUrl(c)}" alt="${esc(cName(c))}" title="${esc(cName(c))}" width="21" height="16" loading="lazy">`;
const flagsOf = t => { const cs = L.cleanCountries(t.countries); return cs.length ? `<span class="flags">${cs.map(flagImg).join('')}</span>` : ''; };

const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };
// Writes resolve only after the server confirms; offline they are queued, so never block the UI on them.
const fire = p => Promise.resolve(p).catch(reportError);
// Expense deletes wait L.UNDO_MS so "↩ ביטול" can cancel them. Whatever still waits runs when the page changes or the app is hidden.
const pending = L.pendingDeletes();
const flushNow = () => { if (pending.size) { pending.flush(); hideUndoToast(); } };
addEventListener('pagehide', flushNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
// Trips in the trash longer than L.TRASH_DAYS are deleted for good by the first phone that sees them.
const purged = new Set();
function purgeExpired(trips) {
  const now = Date.now();
  for (const t of trips) if (L.trashExpired(t, now) && !purged.has(t.id)) { purged.add(t.id); store.deleteTrip(t.id).catch(() => purged.delete(t.id)); }
}

// ---------------------------------------------------------------- boot
banners();
view.innerHTML = `<div class="wrap" style="padding-top:40px"><div class="skeleton"></div><div class="skeleton"></div></div>`;
try {
  await store.ready();
} catch (err) {
  console.error(err);
  view.innerHTML = `<div class="wrap" style="padding-top:40px"><div class="card center">
    <div style="font-size:48px">📡</div><h2>${t('לא ניתן להתחבר')}</h2>
    <p class="muted">${t('בפעם הראשונה צריך חיבור לאינטרנט. אם יש חיבור, ייתכן שההתחברות האנונימית ב-Firebase לא מופעלת.')}</p>
    <p class="muted small" dir="ltr">${esc(err.code || err.message)}</p>
    <div class="row2"><button class="btn primary" onclick="location.reload()">${t('נסו שוב')}</button><a class="btn ghost" href="?demo">${t('מצב הדגמה')}</a></div>
  </div></div>`;
  throw err;
}
store.onCategories(list => { categories = list; catListeners.forEach(fn => fn()); }, reportError);
window.addEventListener('hashchange', route);
route();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  // A new version took over: reload once so the screen runs the new code (not while a form is open).
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return; reloaded = true;
      if (!document.querySelector('.scrim')) location.reload(); else toast(t('גרסה חדשה מוכנה – היא תיטען ברענון הבא'));
    });
  }
}

function banners() {
  const b = $('#banner');
  const draw = () => {
    b.innerHTML = (store.kind === 'demo' ? `<div class="demo-bar">🧪 ${t('מצב הדגמה: הנתונים נשמרים רק בדפדפן הזה')} · <a href="?demo=0">${t('מעבר לנתונים האמיתיים')}</a></div>` : '')
      + (navigator.onLine ? '' : `<div class="offline">📴 ${t('אין חיבור. השינויים נשמרים ויסונכרנו כשהחיבור יחזור')}</div>`);
  };
  addEventListener('online', draw); addEventListener('offline', draw); draw();
  banners.redraw = draw;
}

function route() {
  cleanups.forEach(fn => fn()); cleanups = [];
  closeAll();
  pending.flush(); hideUndoToast();
  holdHebrew(false); // the admin panel holds Hebrew right-to-left; every other page uses the chosen language
  window.scrollTo(0, 0);
  const h = location.hash.replace(/^#\/?/, '');
  const [page, id, sub] = h.split('/');
  // trip pages: the theme remembered from the last visit until the trip loads; other pages follow the phone
  applyTheme(page === 'trip' && id ? L.THEMES.find(x => x === ls.get('tt-theme:' + id)) || 'auto' : 'auto');
  if (page === 'new') return createTripPage();
  if (page === 'trip' && id && sub === 'budget') return budgetPage(id);
  if (page === 'trip' && id) return tripPage(id);
  if (page === 'admin') return isAdmin() ? adminPage() : (go('#/'), askAdmin());
  homePage();
}

// ---------------------------------------------------------------- WhatsApp share
const WA_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#25D366"/><path fill="#fff" d="M16 7.2a8.8 8.8 0 0 0-7.6 13.2L7.2 24.8l4.5-1.2A8.8 8.8 0 1 0 16 7.2Zm0 16a7.2 7.2 0 0 1-3.7-1l-.3-.2-2.6.7.7-2.5-.2-.3A7.2 7.2 0 1 1 16 23.2Zm4-5.4c-.2-.1-1.3-.6-1.5-.7s-.4-.1-.5.1-.6.7-.7.9-.3.2-.5.1a5.9 5.9 0 0 1-2.9-2.6c-.2-.4.2-.4.6-1.2a.4.4 0 0 0 0-.4l-.7-1.6c-.2-.4-.4-.4-.5-.4h-.4a.8.8 0 0 0-.6.3 2.5 2.5 0 0 0-.8 1.9 4.4 4.4 0 0 0 .9 2.3 10 10 0 0 0 3.8 3.4c1.4.6 2 .7 2.7.6a2.3 2.3 0 0 0 1.5-1.1 1.9 1.9 0 0 0 .1-1.1c0-.1-.2-.2-.5-.3Z"/></svg>`;
async function shareTrip(trip) {
  if (!trip) return;
  const link = location.origin + location.pathname + '#/trip/' + encodeURIComponent(trip.id);
  const m = modal(`<h2>${t('שיתוף בוואטסאפ')}</h2>
    <p class="muted">${t('לשתף גם את סיסמת הטיול באותה הודעה?')}<br>${t('בלי הסיסמה, מי שמקבל את הקישור יצטרך לבקש אותה.')}</p>
    <div class="stack"><button class="btn wa-go" data-pin>${t('כן, עם הסיסמה')}</button><button class="btn ghost" data-link>${t('רק קישור')}</button></div>`, { label: t('שיתוף בוואטסאפ') });
  m.el.querySelector('[data-pin]').onclick = () => m.close('pin');
  m.el.querySelector('[data-link]').onclick = () => m.close('link');
  const how = await m.result;
  if (!how) return;
  let pin = '';
  if (how === 'pin') {
    const ok = await codePrompt({
      title: t('סיסמת הטיול'), text: t('הקלידו את 4 הספרות כדי לצרף אותן להודעה'), length: 4, ok: t('לשתף'), okClass: 'wa-go',
      check: async code => { const good = await checkPin(trip, code); if (good) pin = code; return good; }
    });
    if (!ok) return;
  }
  const url = L.shareUrl(L.shareMessage(trip.name, link, pin, [t('הוצאות הטיול'), t('סיסמה')]));
  if (!window.open(url, '_blank')) location.href = url; // popup blocked: hand over to WhatsApp in this window
}

// ---------------------------------------------------------------- install banner (Android / desktop Chrome, Edge)
// (constants live inside: route() runs before this part of the module is reached)
addEventListener('appinstalled', () => { window.ttInstall = null; drawInstall(); });
function drawInstall() {
  const INSTALL_HIDE = 'tt-install-hide', INSTALL_SNOOZE_MS = 7 * 86400000; // owner: after ✕ it comes back in 7 days
  const host = $('#install'); if (!host) return;
  const hidden = Number(ls.get(INSTALL_HIDE)) > Date.now();
  if (!window.ttInstall || hidden) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="install" role="region" aria-label="${t('התקנה')}">
      <div class="ic" aria-hidden="true">🧳</div>
      <div class="txt"><b>${t('להתקין כאפליקציה?')}</b><span class="muted">${t('פותחים ממסך הבית, עובד גם בלי אינטרנט')}</span></div>
      <button class="btn primary sm" id="installGo">${t('התקנה')}</button>
      <button class="x" id="installX" title="${t('סגירה')}" aria-label="${t('סגירה')}">✕</button></div>`;
  const snooze = () => ls.set(INSTALL_HIDE, String(Date.now() + INSTALL_SNOOZE_MS));
  $('#installGo').onclick = async () => {
    const e = window.ttInstall; if (!e) return;
    window.ttInstall = null; // the offer can be used only once
    e.prompt();
    const { outcome } = await e.userChoice.catch(() => ({}));
    if (outcome !== 'accepted') snooze();
    drawInstall();
  };
  $('#installX').onclick = () => { snooze(); drawInstall(); };
}

// ---------------------------------------------------------------- help ("מה זה?")
// Most common use first; each "▾" opens the next, less common level.
const HELP_STEPS = [
  [N('פותחים טיול'), N('"+ טיול חדש": שם, תאריכים, מי נוסע, מטבע וסיסמה של 4 ספרות.')],
  [N('מתעדים כל הוצאה'), N('"+ להוסיף הוצאה": כמה, על מה, מתי ומי שילם. מטבע זר? מומר לבד.')],
  [N('משתפים עם מי שנוסע איתכם'), N('"שיתוף" שולח בוואטסאפ קישור (ואם רוצים – גם את הסיסמה). כולם רואים ומוסיפים.')],
  [N('מתחשבנים'), N('בלשונית "התחשבנות" רואים מי מעביר כמה למי.')]
];
const HELP_MORE = [
  ['↩️', N('ביטול מחיקה'), N('מחקתם תנועה או טיול בטעות? יש {s} שניות ללחוץ "↩ ביטול" בהודעה שלמטה.')],
  ['💰', N('תקציב'), N('✏️ בפרטי הטיול: תקציב לכל הטיול או ליום (לא חובה). המשבצת "תקציב" מראה כמה נשאר; לחיצה – פירוט וחלוקה לפי יום.')],
  ['⭐', N('הטיולים שלי'), N('במסך הראשי רואים רק טיולים שיצרתם או פתחתם עם הסיסמה. טיולים של אחרים ב"כל הטיולים" – בלי סכומים ובלי שמות.')],
  ['🏷️', N('תגיות, חיפוש וקיבוץ'), N('⋮ על טיול ← "תגיות" (משפחה, חברים, עבודה…). לחיצה על תגית מסננת; "קיבוץ" מסדר לפי שנה או תגית; 🔍 מחפש שם, מקום או תגית.')],
  ['📊', N('לאן הלך הכסף'), N('"פילוח" לפי קטגוריה או לפי יום, וממוצע ליום ולאדם. לחיצה על שורה מביאה את ההוצאות שלה לראש הרשימה.')],
  ['👨‍👩‍👧', N('זוגות ומשפחות'), N('מחלקים לקבוצות (עד {g}), וכל קבוצה מתחשבנת כמו אדם אחד.')],
  ['↩️', N('החזר כספי'), N('קיבלתם כסף בחזרה? מוסיפים "הכנסה" והיא יורדת מהסך הכול.')],
  ['✏️', N('טעיתם?'), N('✏️ לעריכה ו-🗑️ למחיקה בכל הוצאה. 🔍 חיפוש לפי מילה או שם.')],
  ['📄', N('סיכום ל-PDF'), N('כפתור PDF בראש הטיול – דוח מסודר של כל ההוצאות, לשמירה או לשליחה.')]
];
const HELP_PRO = [
  ['✈️', N('עובד בלי אינטרנט'), N('במטוס או בלי קליטה – רושמים כרגיל, הכול מסתנכרן כשחוזרת הרשת.')],
  ['📷', N('קבלה ומיקום'), N('אפשר לצרף צילום קבלה, והמקום נשמר על המפה.')],
  ['💱', N('שער המרה'), N('השער נלקח אוטומטית; אפשר להקליד שער משלכם.')],
  ['🔒', N('סיסמת הטיול'), N('נזכרת במכשיר ל-3 ימים, ואז מבקשים שוב.')],
  ['📲', N('אפליקציה במסך הבית'), N('"התקנה" מוסיפה אייקון לטלפון, כמו אפליקציה רגילה.')],
  ['🎨', N('צבע וקטגוריות'), N('✏️ בראש הטיול: צבע, תאריכים ומשתתפים. קטגוריה חדשה – ישר מתוך הוספת הוצאה.')]
];
function helpSheet() {
  helpShown = true; // also counts when storage is full/blocked
  try { localStorage.setItem('tt-help-seen', '1'); } catch {}
  const v = { s: L.UNDO_MS / 1000, g: L.MAX_GROUPS };
  const tips = list => list.map(([ic, h, d]) => `<div class="help-tip"><i aria-hidden="true">${ic}</i><div><b>${esc(t(h))}</b><span>${esc(t(d, v))}</span></div></div>`).join('');
  const m = modal(`<div class="help-head"><h2>❓ ${t('מה זה טיולון?')}</h2><button type="button" class="help-x" data-x title="${t('סגירה')}" aria-label="${t('סגירה')}">✕</button></div>
    <p class="help-lead">${t('מתעדים את כל הוצאות הטיול במקום אחד – כמה, על מה, מתי ואיפה – ורואים לאן הלך הכסף. נוסעים יחד? האפליקציה גם אומרת בסוף מי חייב למי.')}</p>
    <div class="help-lvl">${t('איך מתחילים')}</div>
    ${HELP_STEPS.map(([h, d], i) => `<div class="help-step"><span class="n num" aria-hidden="true">${i + 1}</span><div><b>${esc(t(h))}</b><span>${esc(t(d))}</span></div></div>`).join('')}
    <button type="button" class="help-more" data-lvl="more" aria-expanded="false" aria-controls="help-more">${t('רוצים לדעת עוד?')} ▾</button>
    <div id="help-more" hidden><div class="help-lvl" tabindex="-1">${t('עוד דברים שימושיים')}</div>${tips(HELP_MORE)}
      <button type="button" class="help-more" data-lvl="pro" aria-expanded="false" aria-controls="help-pro">${t('למתקדמים')} ▾</button></div>
    <div id="help-pro" hidden><div class="help-lvl" tabindex="-1">${t('למתקדמים')}</div>${tips(HELP_PRO)}</div>
    <button type="button" class="btn primary block help-done" data-x>${t('הבנתי')} 👍</button>`, { sheet: true, label: t('מה זה טיולון?') });
  m.el.classList.add('help');
  setTimeout(() => $('.help-x', m.el)?.focus({ preventScroll: true }), 50);
  $$('[data-x]', m.el).forEach(b => b.onclick = () => m.close());
  $$('[data-lvl]', m.el).forEach(b => b.onclick = () => {
    const sec = $('#help-' + b.dataset.lvl, m.el);
    sec.hidden = false; b.remove();
    const head = sec.querySelector('.help-lvl');
    head.focus({ preventScroll: true }); // the button is gone: keep keyboard/reader focus on the new part
    head.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
}
// A function declaration (hoisted): homePage() runs while this module is still loading.
// Key 'tt-help-seen' is written in helpSheet() too.
var helpShown = false; // var: hoisted like helpSeen
function helpSeen() { if (helpShown) return true; try { return localStorage.getItem('tt-help-seen') === '1'; } catch { return true; } }

// ---------------------------------------------------------------- home
function homePage() {
  view.innerHTML = `
    <header class="topbar home-top">
      <div class="brand"><h1>🧳 ${t('טיולון')}</h1><span class="muted">${t('הוצאות משותפות לטיול')}</span></div>
      <div class="top-pills"><div class="lang-wrap"><button type="button" class="lang-pill" id="langBtn" aria-haspopup="menu" aria-expanded="false" aria-label="${t('שפה')}"><span aria-hidden="true">🌐</span> ${LANGS.find(l => l.code === lang).short} ▾</button></div>
      <button type="button" class="help-pill" id="helpBtn">❓ ${t('מה זה?')}</button></div>
      <button class="icon-btn" id="adminBtn" title="${t('פאנל ניהול')}" aria-label="${t('פאנל ניהול')}">⚙️</button>
    </header>
    <div class="wrap home">
      <div id="install"></div>
      <input class="search" id="tripSearch" type="search" placeholder="🔍 ${t('חיפוש טיול, מקום, תגית')}" aria-label="${t('חיפוש טיולים')}" autocomplete="off">
      <div class="tabs scope" role="group" aria-label="${t('אילו טיולים להציג')}">
        <button type="button" data-scope="mine">⭐ ${t('שלי')} <span class="num" data-n="mine"></span></button>
        <button type="button" data-scope="all">🌍 ${t('כל הטיולים')} <span class="num" data-n="all"></span></button>
      </div>
      <div class="tag-row" id="tagRow" role="group" aria-label="${t('סינון לפי תגית')}"></div>
      <div class="home-bar"><span id="homeCount" class="muted"></span>
        <button type="button" class="pill-btn" id="groupBtn" aria-haspopup="menu"></button></div>
      <div id="trips"><div class="skeleton"></div></div>
      <p class="version muted small center">${t('גרסה')} <span class="num" dir="ltr">${esc(window.TT_VERSION || '?')}</span></p>
    </div>
    <a class="fab" id="newTrip" href="#/new"><span aria-hidden="true">+</span>${t('טיול חדש')}</a>`;
  $('#adminBtn').onclick = askAdmin;
  $('#helpBtn').onclick = helpSheet;
  if (!helpSeen()) { // first visit on this device: open once
    const timer = setTimeout(() => { if ($('#helpBtn') && !$('.scrim') && !helpSeen()) helpSheet(); }, 300);
    cleanups.push(() => clearTimeout(timer));
  }
  drawInstall();
  addEventListener('tt-install', drawInstall); cleanups.push(() => removeEventListener('tt-install', drawInstall));
  const host = $('#trips');
  const closeMenus = e => { if (!e.target.closest('.kebab, .menu, #groupBtn, #langBtn')) { $$('.menu').forEach(m => m.remove()); $('#langBtn')?.setAttribute('aria-expanded', 'false'); } };
  document.addEventListener('click', closeMenus);
  cleanups.push(() => document.removeEventListener('click', closeMenus));

  let alive = true; cleanups.push(() => { alive = false; });
  const p = homePrefs();
  const st = { trips: null, query: '', scope: ['mine', 'all'].includes(p.scope) ? p.scope : '', scopeChosen: ['mine', 'all'].includes(p.scope), group: GROUP_NAMES[p.group] ? p.group : 'year', tag: p.tag || '', toggled: new Set() };
  const savePrefs = () => ls.set(HOME_KEY, JSON.stringify({ scope: st.scopeChosen ? st.scope : undefined, group: st.group, tag: st.tag })); // an auto-picked tab is not remembered

  const card = (t, mine) => {
    const tags = (t.tags || []).map(x => tagChip(x)).join('');
    if (!mine) return `<article class="card trip-card other" data-id="${esc(t.id)}" tabindex="0" role="button" aria-label="${esc(t.name)} – ${T('פתיחה עם סיסמה')}">
        <button class="kebab" title="${T('אפשרויות')}" aria-label="${T('אפשרויות')}">⋮</button>
        <h3><bdi>${esc(t.name)}</bdi></h3>
        <div class="muted">${flagsOf(t) || '📍'} <bdi>${esc(t.location)}</bdi>${t.startDate ? ` · <span class="num">${esc(dateRange(t.startDate, t.endDate))}</span>` : ''}</div>
        <div class="tags">${tags}<span class="muted small">🔒 ${T('פתיחה עם סיסמה')}</span></div>
      </article>`;
    const left = accessLeft(t.id);
    const days = Math.ceil(left / 86400000);
    return `<article class="card trip-card" style="${tripStyle(t.color)}" data-id="${esc(t.id)}" tabindex="0" role="button" aria-label="${esc(t.name)}">
        <button class="kebab" title="${T('אפשרויות')}" aria-label="${T('אפשרויות')}">⋮</button>
        <h3><bdi>${esc(t.name)}</bdi>${st.scope === 'all' ? ` <span class="star" title="${T('שלי')}" aria-label="${T('שלי')}">⭐</span>` : ''}</h3>
        <div class="muted">${flagsOf(t) || '📍'} <bdi>${esc(t.location)}</bdi></div>
        <div class="chips">
          ${t.startDate ? `<span class="chip sky num">${esc(dateRange(t.startDate, t.endDate))}</span>` : ''}
          <span class="chip">👥 ${T('{n} משתתפים', { n: t.participants.length })}</span>
          <span class="chip mint">${L.viewCurrencyOf(t) ? `<bdi dir="ltr">${esc(L.currencySymbol(t.defaultCurrency))} ${esc(t.defaultCurrency)} → ${esc(L.currencySymbol(L.viewCurrencyOf(t)))}</bdi>` : `${esc(L.currencySymbol(t.defaultCurrency))} ${esc(t.defaultCurrency)}`}</span>
        </div>
        ${tags ? `<div class="tags">${tags}</div>` : ''}
        ${left > 0 ? `<div class="lock">🔓 ${days <= 1 ? T('מחר צריך להזין את הסיסמה שוב') : T('עוד {n} ימים צריך להזין את הסיסמה שוב', { n: days })}</div>` : ''}
      </article>`;
  };

  const draw = () => {
    if (!st.trips) return;
    const trips = st.trips, mine = mineIds();
    if (!st.scope) st.scope = trips.some(t => mine.has(t.id)) ? 'mine' : 'all'; // nothing of mine yet: show everything
    knownTags = L.allTags(trips);
    if (st.tag && !knownTags.some(x => x.toLowerCase() === st.tag.toLowerCase())) st.tag = '';
    const nMine = trips.filter(t => mine.has(t.id)).length;
    $('[data-n=mine]').textContent = `(${nMine})`; $('[data-n=all]').textContent = `(${trips.length})`;
    $$('[data-scope]').forEach(b => { b.setAttribute('aria-selected', b.dataset.scope === st.scope); b.setAttribute('aria-pressed', b.dataset.scope === st.scope); });
    // tag filter: only tags that appear in the trips of the current tab
    const scopeTags = L.allTags(st.scope === 'all' ? trips : trips.filter(t => mine.has(t.id)));
    if (st.tag && !scopeTags.some(x => x.toLowerCase() === st.tag.toLowerCase())) scopeTags.unshift(st.tag);
    $('#tagRow').innerHTML = scopeTags.length ? `<button type="button" class="tag-f ${st.tag ? '' : 'on'}" data-tag="" aria-pressed="${!st.tag}">${t('הכל')}</button>`
      + scopeTags.map(x => { const c = L.tagColor(x); return `<button type="button" class="tag-f ${st.tag === x ? 'on' : ''}" data-tag="${esc(x)}" aria-pressed="${st.tag === x}" style="--tg:${c.bg};--ti:${c.ink}"><bdi>${esc(x)}</bdi>${st.tag === x ? ' ✓' : ''}</button>`; }).join('') : '';
    $('#groupBtn').textContent = `${t('קיבוץ:')} ${t(GROUP_NAMES[st.group])} ▾`;

    const opts = { mine, scope: st.scope, tag: st.tag, query: st.query };
    const shown = L.filterTrips(trips, opts);
    const filtered = !!(st.query.trim() || st.tag);
    const total = st.scope === 'all' ? trips.length : nMine;
    $('#homeCount').innerHTML = filtered ? t('<b class="num">{a}</b> מתוך <span class="num">{b}</span>', { a: shown.length, b: total }) : (shown.length === 1 ? t('טיול אחד') : t('<span class="num">{n}</span> טיולים', { n: shown.length }));
    host.style.display = 'grid'; host.style.gridTemplateColumns = 'minmax(0, 1fr)'; host.style.gap = 'var(--s3)';

    if (!trips.length) {
      host.innerHTML = `<div class="empty"><div class="big">🗺️</div><p>${t('עוד אין טיולים.')}<br>${t('לחצו על "+ טיול חדש" כדי להתחיל.')}</p></div>`;
      return;
    }
    let html = '';
    if (!shown.length) {
      html = st.scope === 'mine' && !nMine
        ? `<div class="empty"><div class="big">⭐</div><p>${t('עוד אין טיולים שלך בטלפון הזה.')}<br>${t('טיול שתיצרו או תפתחו עם הסיסמה יופיע כאן.')}</p></div>`
        : `<div class="empty">${t('לא נמצאו טיולים')}${st.query.trim() ? ` ${t('עבור')} "<bdi>${esc(st.query.trim())}</bdi>"` : ''}${st.tag ? ` ${t('עם התגית')} "<bdi>${esc(st.tag)}</bdi>"` : ''}</div>`;
    } else {
      const groups = L.groupTrips(shown, st.group, st.tag, lang);
      html = groups.map((g, i) => {
        const defOpen = filtered || st.group !== 'year' || i === 0 || g.label === String(new Date().getFullYear());
        const open = st.toggled.has(g.key) ? !defOpen : defOpen;
        const head = !g.label ? '' : `<button type="button" class="sec ${open ? '' : 'closed'}" data-sec="${esc(g.key)}" aria-expanded="${open}">
            ${g.tag ? tagChip(g.tag) : `<span>${g.country ? flagImg(g.country) + ' ' : ''}<bdi>${esc(t(g.label))}</bdi></span>`}
            <span class="cnt">· ${g.trips.length === 1 ? t('טיול אחד') : t('<span class="num">{n}</span> טיולים', { n: g.trips.length })}</span><span class="chev" aria-hidden="true">${open ? '▾' : isRtl() ? '◂' : '▸'}</span></button>`;
        return head + (open ? g.trips.map(t => card(t, mine.has(t.id))).join('') : '');
      }).join('');
    }
    if (st.scope === 'mine' && (filtered || !nMine)) { // more matches outside "mine"
      const more = L.filterTrips(trips, { ...opts, scope: 'all' }).filter(t => !mine.has(t.id)).length;
      if (more) html += `<button type="button" class="hint" data-scope-all>🌍 ${more === 1 ? t('עוד טיול אחד מתאים ב"כל הטיולים" – להציג') : t('עוד <span class="num">{n}</span> טיולים מתאימים ב"כל הטיולים" – להציג', { n: more })}</button>`;
    }
    host.innerHTML = html;

    $$('.trip-card', host).forEach(c => {
      const trip = trips.find(t => t.id === c.dataset.id);
      c.onclick = e => { if (!e.target.closest('.kebab, .menu')) openTrip(trip); };
      c.onkeydown = e => { if (e.key === 'Enter' && e.target === c) openTrip(trip); };
      $('.kebab', c).onclick = e => {
        e.stopPropagation();
        const had = $('.menu', c);
        $$('.menu').forEach(m => m.remove());
        if (had) return;
        const isMine = mine.has(trip.id);
        c.insertAdjacentHTML('beforeend', `<div class="menu" role="menu">
          <button role="menuitem" data-m="tags">🏷️ ${t('תגיות')}</button>
          ${isMine ? `<button role="menuitem" data-m="unmine">🙈 ${t('להסיר מהטיולים שלי')}</button>` : `<button role="menuitem" data-m="mine">⭐ ${t('להוסיף לטיולים שלי')}</button>`}
          <button class="red" role="menuitem" data-m="del">🗑️ ${t('מחיקת טיול')}</button></div>`);
        $$('.menu button', c).forEach(b => b.onclick = async ev => {
          ev.stopPropagation(); $('.menu', c).remove();
          const m = b.dataset.m;
          if (m === 'del') deleteTripFlow(trip);
          else if (m === 'unmine') { removeMine(trip.id); toast(T('הוסר מ"שלי". הטיול עצמו לא נמחק')); draw(); }
          else if (m === 'mine') { if (await unlock(trip) && alive) { toast(T('נוסף ל"שלי" ⭐'), 'good'); draw(); } }
          else if (m === 'tags') { if (await unlock(trip) && alive) { draw(); tagSheet(trip); } }
        });
      };
    });
  };

  const onHomeClick = e => {
    const s = e.target.closest('[data-scope]');
    if (s) { st.scope = s.dataset.scope; st.scopeChosen = true; savePrefs(); draw(); return; }
    if (e.target.closest('[data-scope-all]')) { st.scope = 'all'; st.scopeChosen = true; savePrefs(); draw(); return; }
    const tg = e.target.closest('[data-tag]');
    if (tg) { st.tag = st.tag === tg.dataset.tag ? '' : tg.dataset.tag; savePrefs(); draw(); return; }
    const sec = e.target.closest('[data-sec]');
    if (sec) { const k = sec.dataset.sec; st.toggled.has(k) ? st.toggled.delete(k) : st.toggled.add(k); draw(); return; }
    if (e.target.closest('#groupBtn')) {
      const had = $('#groupMenu'); $$('.menu').forEach(m => m.remove());
      if (had) return;
      $('.home-bar').insertAdjacentHTML('beforeend', `<div class="menu" id="groupMenu" role="menu">${Object.entries(GROUP_NAMES).map(([k, n]) =>
        `<button role="menuitemradio" aria-checked="${st.group === k}" data-group="${k}">${st.group === k ? '✓ ' : ''}${t(n)}</button>`).join('')}</div>`);
      return;
    }
    if (e.target.closest('#langBtn')) { // 🌐 language: remembered on this phone; the page is drawn again in the new language
      const had = $('#langMenu'); $$('.menu').forEach(m => m.remove());
      $('#langBtn').setAttribute('aria-expanded', String(!had));
      if (had) return;
      $('.lang-wrap').insertAdjacentHTML('beforeend', `<div class="menu" id="langMenu" role="menu">${LANGS.map(l =>
        `<button role="menuitemradio" aria-checked="${l.code === lang}" data-lang="${l.code}" lang="${l.code}"><code>${l.short}</code><bdi>${l.name}</bdi>${l.code === lang ? '<span class="ck">✓</span>' : ''}</button>`).join('')}</div>`);
      return;
    }
    const lg = e.target.closest('[data-lang]');
    if (lg) { const changed = lg.dataset.lang !== lang; $('#langMenu')?.remove(); if (changed) { setLang(lg.dataset.lang); banners.redraw?.(); route(); } return; }
    const g = e.target.closest('[data-group]');
    if (g) { st.group = g.dataset.group; st.toggled.clear(); savePrefs(); $('#groupMenu')?.remove(); draw(); }
  };
  view.addEventListener('click', onHomeClick); cleanups.push(() => view.removeEventListener('click', onHomeClick));
  $('#tripSearch').oninput = e => { st.query = e.target.value; draw(); };

  cleanups.push(store.onTrips(trips => {
    purgeExpired(trips);
    st.trips = trips.filter(t => !L.isDeleted(t)).map(t => ({ ...t, tags: L.normTags(t.tags) }));
    draw();
  }, err => { host.innerHTML = `<div class="empty"><div class="big">🔒</div><p>${t('אין גישה לנתונים.')}</p></div>`; reportError(err); }));
}

// Tag picker used in the trip form and in the ⋮ → תגיות sheet. Returns a getter for the chosen tags.
function bindTagPicker(root, initial) {
  let tags = L.normTags(initial);
  const box = $('.tagpick', root), input = $('.tagpick-in', root);
  const draw = () => {
    const sugg = knownTags.filter(x => !tags.some(y => y.toLowerCase() === x.toLowerCase())).slice(0, 12);
    $('.tp-on', box).innerHTML = tags.length ? tags.map((x, i) => { const c = L.tagColor(x);
      return `<span class="tag" style="--tg:${c.bg};--ti:${c.ink}"><bdi>${esc(x)}</bdi><button type="button" data-rmtag="${i}" aria-label="${esc(t('הסרת התגית {x}', { x }))}">✕</button></span>`; }).join('')
      : `<span class="muted small">${t('אין עדיין תגיות')}</span>`;
    $('.tp-sugg', box).innerHTML = sugg.map(x => `<button type="button" class="tag add" data-addtag="${esc(x)}">+ <bdi>${esc(x)}</bdi></button>`).join('');
  };
  const add = name => {
    const next = L.normTags([...tags, name]);
    if (next.length === tags.length && name.trim()) { toast(tags.length >= L.MAX_TAGS ? t('עד {n} תגיות לטיול', { n: L.MAX_TAGS }) : t('התגית כבר קיימת')); return; }
    tags = next; draw();
  };
  box.addEventListener('click', e => {
    const rm = e.target.closest('[data-rmtag]'); if (rm) { tags.splice(+rm.dataset.rmtag, 1); draw(); return; }
    const ad = e.target.closest('[data-addtag]'); if (ad) add(ad.dataset.addtag);
  });
  const addTyped = () => { if (input.value.trim()) { add(input.value); input.value = ''; input.focus(); } };
  $('.tagpick-add', root).onclick = addTyped;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } });
  draw();
  return () => { if (input.value.trim()) { tags = L.normTags([...tags, input.value]); input.value = ''; } return tags; };
}
function tagPickerHtml() { return `<div class="field tagpick"><span class="lbl">${t('תגיות')} <span class="small">${t('(למשל: משפחה, חברים, עבודה)')}</span></span>
    <div class="tags tp-on"></div><div class="tags tp-sugg"></div>
    <div class="chip-input"><input class="tagpick-in" maxlength="20" placeholder="${t('תגית חדשה…')}" autocomplete="off" enterkeyhint="done" aria-label="${t('תגית חדשה')}"><button type="button" class="btn ghost sm tagpick-add">${t('הוספה')}</button></div></div>`; }

function tagSheet(trip) {
  const m = modal(`<h2>🏷️ ${t('תגיות')} – <bdi>${esc(trip.name)}</bdi></h2>${tagPickerHtml()}
    <p class="muted small">${t('התגיות משותפות: כל מי שפותח את הטיול רואה אותן.')}</p>
    <div class="row2"><button type="button" class="btn ghost" data-x>${t('ביטול')}</button><button type="button" class="btn primary" data-save>${t('שמירה')}</button></div>`, { sheet: true, label: t('תגיות') });
  const read = bindTagPicker(m.el, trip.tags);
  $('[data-x]', m.el).onclick = () => m.close();
  $('[data-save]', m.el).onclick = () => { fire(store.updateTrip(trip.id, { tags: read() })); m.close(); toast(T('התגיות נשמרו'), 'good'); };
}

async function unlock(trip) {
  if (accessLeft(trip.id) > 0) { addMine(trip.id); return true; } // opening a trip makes it "mine" again
  const ok = await codePrompt({
    title: '🔒 ' + trip.name, text: t('סיסמת הטיול (4 ספרות)'), length: 4,
    note: t('הגישה תישמר במכשיר הזה ל-3 ימים'), check: code => checkPin(trip, code)
  });
  if (ok) grantAccess(trip.id);
  return ok;
}
async function openTrip(trip) { if (await unlock(trip)) go('#/trip/' + trip.id); }

// Admin code check; a correct code also opens the admin session for this tab.
async function adminCode(title) {
  if (isAdmin()) return true;
  const ok = await codePrompt({ title, text: t('קוד מנהל (6 ספרות)'), length: 6, check: async c => await hashAdmin(c) === ADMIN_HASH });
  if (ok) sessionStorage.setItem('tt-admin', '1');
  return ok;
}

async function deleteTripFlow(trip) {
  if (!await adminCode('🗑️ ' + t('מחיקת טיול'))) return;
  const ok = await confirmBox(t('מחיקת טיול'), t('למחוק את "{name}" וכל התנועות שלו?', { name: trip.name }), { ok: t('מחיקה'), danger: true });
  if (!ok) return;
  // Soft delete: hidden everywhere, restorable from the admin panel for L.TRASH_DAYS days (the user just sees "נמחק").
  fire(store.updateTrip(trip.id, { deletedAt: Date.now() }));
  undoToast(T('נמחק: {x}', { x: trip.name }), () => { fire(store.updateTrip(trip.id, { deletedAt: null })); toast(T('שוחזר'), 'good'); }, L.UNDO_MS);
}

async function askAdmin() {
  if (await adminCode('⚙️ ' + t('פאנל ניהול'))) go('#/admin');
}

// ---------------------------------------------------------------- trip form (create + edit)
function currencyOptions(selected) {
  return L.CURRENCIES.map(c => `<option value="${c.code}" ${c.code === selected ? 'selected' : ''}>${c.code} ${c.symbol !== c.code ? c.symbol + ' ' : ''}– ${esc(T(c.name))}</option>`).join('');
}

function tripFormHtml(t, withPin) {
  return `
    <div class="field" data-f="name"><label class="lbl" for="f-name">${T('שם הטיול')} *</label><input id="f-name" maxlength="80" value="${esc(t.name || '')}" autocomplete="off"><p class="err"></p></div>
    <div class="field" data-f="location"><label class="lbl" for="f-loc">${T('מיקום / יעד')} *</label><input id="f-loc" maxlength="80" value="${esc(t.location || '')}" autocomplete="off"><p class="err"></p></div>
    <div class="row2 field" data-f="endDate">
      <div><label class="lbl" for="f-start">${T('תאריך התחלה')}</label><input id="f-start" type="date" value="${esc(t.startDate || '')}"></div>
      <div><label class="lbl" for="f-end">${T('תאריך סיום')}</label><input id="f-end" type="date" value="${esc(t.endDate || '')}"></div>
      <p class="err" style="grid-column:1/-1"></p>
    </div>
    <div class="field"><label class="lbl" for="f-cty-in">🌍 ${T('מדינות')}</label>
      <div class="chips" id="f-cty"></div>
      <input id="f-cty-in" type="search" placeholder="${T('חיפוש מדינה…')}" autocomplete="off" enterkeyhint="search">
      <div class="cty-list" id="f-cty-list" role="group" aria-label="${T('תוצאות חיפוש מדינה')}"></div>
      <div class="cty-sug" id="f-cty-sug"></div></div>
    <div class="field" data-f="defaultCurrency"><label class="lbl" for="f-cur">${T('מטבע הזנה')} * <span class="small">${T('(ברירת המחדל להוצאה חדשה)')}</span></label><select id="f-cur">${currencyOptions(t.defaultCurrency || 'EUR')}</select><p class="err"></p></div>
    <div class="field"><label class="lbl" for="f-vcur">${T('מטבע תצוגה')} <span class="small">${T('(סכומים, התחשבנות, תקציב, גרפים)')}</span></label>
      <select id="f-vcur"><option value="">${T('כמו מטבע ההזנה')}</option>${currencyOptions(L.viewCurrencyOf(t))}</select>
      <p class="muted small">${T('כל הוצאה מומרת לפי השער של היום שבו שולמה. בדף הטיול אפשר לעבור בין שני המטבעות.')}</p></div>
    <div class="field" data-f="budget"><label class="lbl" for="f-bud">💰 ${T('תקציב')} <span class="small">${T('(לא חובה)')}</span></label>
      <div class="toggle" role="group" aria-label="${T('סוג התקציב')}" id="f-bud-per"><button type="button" data-per="trip" aria-pressed="${t.budget?.per !== 'day'}">${T('לכל הטיול')}</button><button type="button" data-per="day" aria-pressed="${t.budget?.per === 'day'}">${T('ליום')}</button></div>
      <div class="chip-input bud-in"><input id="f-bud" class="num" inputmode="decimal" autocomplete="off" placeholder="${T('ריק = בלי תקציב')}" value="${t.budget?.amount ?? ''}"><span class="chip mint" id="f-bud-cur"></span></div>
      <p class="muted small" id="f-bud-hint"></p><p class="err"></p></div>
    <div class="field"><span class="lbl" id="f-color-l">${T('צבע הטיול')}</span>
      <div class="swatches" id="f-color" role="radiogroup" aria-labelledby="f-color-l">${L.TRIP_COLORS.map(c => `<button type="button" role="radio" class="sw"
        data-color="${c.key}" aria-checked="${L.tripColor(t.color).key === c.key}" aria-label="${T(c.name)}" title="${T(c.name)}" style="background:${tripBg(c.key)}"></button>`).join('')}</div></div>
    <div class="field"><span class="lbl" id="f-theme-l">🌓 ${T('ערכת צבעים לטיול')}</span>
      <div class="toggle three" role="group" aria-labelledby="f-theme-l" id="f-theme">${[['light', '☀️ ' + T('בהיר')], ['dark', '🌙 ' + T('כהה')], ['auto', '📱 ' + T('אוטומטי')]].map(([k, n]) =>
        `<button type="button" data-th="${k}" aria-pressed="${L.tripTheme(t) === k}">${n}</button>`).join('')}</div>
      <p class="muted small">${T('כל מי שפותח את הטיול רואה אותו כך. אוטומטי = לפי הגדרת הטלפון.')}</p></div>
    ${tagPickerHtml()}
    <div class="field" data-f="participants">
      <label class="lbl" for="f-person">${T('משתתפים')} * <span class="small">${T('(⭐ = ברירת המחדל ב"מי שילם"; לחיצה על שם הופכת אותו לראשון)')}</span></label>
      <div class="chips" id="f-chips" style="margin-bottom:8px"></div>
      <div class="chip-input"><input id="f-person" maxlength="30" placeholder="${T('הקלידו שם ולחצו הוספה')}" autocomplete="off" enterkeyhint="done"><button type="button" class="btn ghost sm" id="f-add">${T('הוספה')}</button></div>
      <p class="err"></p>
    </div>
    ${withPin ? `<div class="field" data-f="pin"><label class="lbl" for="f-pin">${T('סיסמת טיול (4 ספרות)')} *</label>
      <input id="f-pin" class="code num" style="font-size:26px;letter-spacing:10px" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off"><p class="err"></p></div>` : ''}`;
}

// Wires the form. lockedNames: participants that can't be removed (they have transactions).
function bindTripForm(root, t, lockedNames = new Set(), hints = []) {
  const people = [...(t.participants || [])];
  const chips = $('#f-chips', root), input = $('#f-person', root);
  const draw = () => {
    chips.innerHTML = people.map((p, i) => `<span class="chip ${i === 0 ? 'sky' : ''}">
      <button type="button" data-first="${i}" title="${T('הפוך לברירת מחדל')}">${i === 0 ? '⭐ ' : ''}${esc(p)}</button>
      <button type="button" data-rm="${i}" aria-label="${esc(T('הסרת {x}', { x: p }))}">✕</button></span>`).join('');
    $$('[data-rm]', chips).forEach(b => b.onclick = () => {
      const name = people[+b.dataset.rm];
      if (lockedNames.has(name)) return toast(T('אי אפשר להסיר את {name}: יש לו/ה תנועות בטיול', { name }), 'bad');
      people.splice(+b.dataset.rm, 1); draw();
    });
    $$('[data-first]', chips).forEach(b => b.onclick = () => { const [p] = people.splice(+b.dataset.first, 1); people.unshift(p); draw(); });
  };
  const add = () => {
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (people.includes(name)) { toast(T('השם כבר ברשימה')); return; }
    people.push(name); input.value = ''; draw(); input.focus();
  };
  $('#f-add', root).onclick = add;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  let color = L.tripColor(t.color).key;
  $$('[data-color]', root).forEach(b => b.onclick = () => {
    color = b.dataset.color;
    $$('[data-color]', root).forEach(x => x.setAttribute('aria-checked', x === b));
  });
  const readTags = bindTagPicker(root, t.tags);
  // theme
  let theme = L.tripTheme(t);
  $$('[data-th]', root).forEach(b => b.onclick = () => { theme = b.dataset.th; $$('[data-th]', root).forEach(x => x.setAttribute('aria-pressed', x === b)); });
  // countries: search box + suggestions from the trip name, place and the expenses' addresses
  const ctys = L.cleanCountries(t.countries);
  const ctyIn = $('#f-cty-in', root);
  const ctyBtn = (c, cls) => `<button type="button" class="cty-btn ${cls}" data-cadd="${c}">${flagImg(c)} ${esc(cName(c))}${cls === 'sug' ? ' +' : ''}</button>`;
  const drawCty = () => {
    $('#f-cty', root).innerHTML = ctys.map((c, i) => `<span class="chip sky">${flagImg(c)} ${esc(cName(c))}<button type="button" data-crm="${i}" aria-label="${esc(T('הסרת {x}', { x: cName(c) }))}">✕</button></span>`).join('');
    const q = ctyIn.value.trim().toLowerCase();
    const hits = !q ? [] : L.COUNTRY_CODES.filter(c => !ctys.includes(c) && ['he', 'en', 'ru'].some(l => L.countryName(c, l).toLowerCase().includes(q)))
      .sort((a, b) => cName(a).localeCompare(cName(b), lang)).slice(0, 8);
    $('#f-cty-list', root).innerHTML = q && !hits.length ? `<span class="muted small">${T('לא נמצאה מדינה')}</span>` : hits.map(c => ctyBtn(c, '')).join('');
    const sug = ctys.length >= L.MAX_COUNTRIES ? [] : L.suggestCountries([$('#f-name', root).value, $('#f-loc', root).value, ...hints], ctys).slice(0, 3);
    $('#f-cty-sug', root).innerHTML = sug.length ? `<span class="lbl2">💡 ${T('הצעה:')}</span>${sug.map(c => ctyBtn(c, 'sug')).join('')}` : '';
  };
  ctyIn.closest('.field').addEventListener('click', ev => { // on the field, not root: root may be the page, reused by later screens
    const add = ev.target.closest('[data-cadd]'), rm = ev.target.closest('[data-crm]');
    if (add && ctys.length < L.MAX_COUNTRIES) { ctys.push(add.dataset.cadd); ctyIn.value = ''; drawCty(); }
    else if (rm) { ctys.splice(+rm.dataset.crm, 1); drawCty(); }
  });
  ctyIn.addEventListener('input', drawCty);
  ctyIn.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); $('#f-cty-list [data-cadd]', root)?.click(); } });
  ['#f-name', '#f-loc'].forEach(sel => $(sel, root).addEventListener('input', drawCty));
  drawCty();
  // budget: amount + "for the whole trip / per day"; the hint shows the other number
  let per = t.budget?.per === 'day' ? 'day' : 'trip', budTouched = false;
  const budHint = () => {
    const cur = $('#f-cur', root).value, a = L.parseAmount($('#f-bud', root).value);
    const s = $('#f-start', root).value, e = $('#f-end', root).value;
    const days = s && e && e >= s ? L.daysBetween(s, e) : 0;
    $('#f-bud-cur', root).textContent = `${L.currencySymbol(cur)} ${cur}`;
    $$('[data-per]', root).forEach(x => x.setAttribute('aria-pressed', x.dataset.per === per));
    const f = v => L.formatMoney(v, cur);
    $('#f-bud-hint', root).textContent = !(a > 0) ? '' : !days ? (per === 'day' ? T('תקציב ליום צריך תאריכי התחלה וסיום') : '')
      : per === 'trip' ? T('= {x} ליום · {n} ימים', { x: '\u2066' + f(L.round2(a / days)) + '\u2069', n: days }) : T('= {x} לכל הטיול · {n} ימים', { x: '\u2066' + f(L.round2(a * days)) + '\u2069', n: days });
  };
  $$('[data-per]', root).forEach(x => x.onclick = () => { per = x.dataset.per; budTouched = true; budHint(); });
  $('#f-bud', root).addEventListener('input', () => { budTouched = true; });
  ['#f-bud', '#f-start', '#f-end', '#f-cur'].forEach(sel => $(sel, root).addEventListener('input', budHint));
  $('#f-cur', root).addEventListener('change', budHint);
  budHint();
  const pin = $('#f-pin', root);
  if (pin) pin.addEventListener('input', () => pin.value = pin.value.replace(/\D/g, '').slice(0, 4));
  draw();

  const read = function () {
    if (input.value.trim()) add(); // a typed name that wasn't added yet still counts
    const data = {
      name: $('#f-name', root).value.trim(), location: $('#f-loc', root).value.trim(),
      startDate: $('#f-start', root).value, endDate: $('#f-end', root).value,
      defaultCurrency: $('#f-cur', root).value, participants: [...people], color, tags: readTags(),
      countries: [...ctys], theme, viewCurrency: $('#f-vcur', root).value === $('#f-cur', root).value ? '' : $('#f-vcur', root).value,
      budget: $('#f-bud', root).value.trim() ? { amount: L.round2(L.parseAmount($('#f-bud', root).value)), per } : null
    };
    if (pin) data.pin = pin.value;
    const errors = L.validateTrip(data);
    $$('[data-f]', root).forEach(f => { const e = errors[f.dataset.f]; f.classList.toggle('invalid', !!e); $('.err', f).textContent = e ? T(e) : ''; });
    const first = $('.invalid input, .invalid select', root);
    if (first) { first.focus(); return null; }
    return data;
  };
  read.budgetTouched = () => budTouched;
  return read;
}

function createTripPage() {
  view.innerHTML = `
    <header class="topbar"><a class="icon-btn" href="#/" title="${t('חזרה')}" aria-label="${t('חזרה')}">${backArrow()}</a><h1>${t('טיול חדש')}</h1><span style="width:44px"></span></header>
    <form class="wrap" novalidate><div class="card">${tripFormHtml({}, true)}
      <button class="btn primary block">${t('יצירת טיול')}</button></div></form>`;
  const read = bindTripForm(view, {});
  $('#f-name').focus();
  $('form', view).onsubmit = async e => {
    e.preventDefault();
    const data = read(); if (!data) return;
    const id = store.newTripId();
    const { pin, ...rest } = data;
    const trip = { ...rest, pinHash: await hashPin(id, pin) };
    fire(store.createTripWithId(id, trip));
    grantAccess(id);
    toast(T('הטיול נוצר 🎉'), 'good');
    go('#/trip/' + id);
  };
}

// ---------------------------------------------------------------- view currency
// Totals in the trip's view currency, each expense at the rate of its own day (owner, Step 24).
// The € ⇄ ₪ choice is per phone. Rates load in the background; until then the input currency is shown.
const viewKey = id => 'tt-view:' + id;
function viewState(id, redraw) {
  let vr = null, job = '';
  return {
    reset() { vr = null; job = ''; },
    compute(t, expenses) {
      const pair = L.viewCurrencyOf(t);
      const base = { pair, cur: t.defaultCurrency, list: expenses, trip: t, wait: false, fail: false };
      if (!pair || ls.get(viewKey(id)) === 'in') return base;
      const range = L.rateRange(expenses, todayIso());
      const pairKey = t.defaultCurrency + '>' + pair, key = pairKey + ':' + (range ? range.from + '..' + range.to : '');
      if ((!vr || vr.key !== key) && job !== key) {
        job = key;
        getDayRates(t.defaultCurrency, pair, range, L.hasRatesFor).then(r => { if (job === key) { vr = { ...r, key, pairKey }; redraw(); } });
      }
      const ok = vr && vr.pairKey === pairKey ? vr : null;
      if (!ok) return { ...base, wait: true };
      const today = ok.today > 0 ? ok.today : L.rateOnDate(ok.map, todayIso(), 0);
      if (!(today > 0)) return { ...base, fail: true };
      return { pair, cur: pair, wait: false, fail: false, list: L.toViewCurrency(expenses, ok.map, today),
        trip: t.budget ? { ...t, budget: { ...t.budget, amount: L.round2(t.budget.amount * today) } } : t };
    }
  };
}

// ---------------------------------------------------------------- trip page
async function tripPage(id) {
  let day = null; try { day = sessionStorage.getItem('tt-focus-day:' + id); sessionStorage.removeItem('tt-focus-day:' + id); } catch {} // tap on a day in the budget screen
  view.innerHTML = `<div class="wrap" style="padding-top:40px"><div class="skeleton"></div></div>`;
  if (accessLeft(id) <= 0) {
    const here = () => location.hash === '#/trip/' + id; // the user may have navigated away meanwhile
    const t = await store.getTrip(id).catch(() => null);
    if (!here()) return;
    if (!t) { toast(T('הטיול לא נמצא'), 'bad'); return go('#/'); }
    if (L.isDeleted(t)) return deletedTripScreen(t, true);
    const ok = await unlock(t);
    if (!here()) return;
    if (!ok) return go('#/');
  }
  const st = { trip: null, all: [], expenses: [], v: null, gone: false, tab: 'list', search: '', chart: day ? 'day' : 'cat', focus: day ? { kind: 'day', name: day } : null, who: '', built: false };
  let alive = true; cleanups.push(() => { alive = false; });
  const vs = viewState(id, () => { if (alive) drawAll(); });
  const fmt = v => L.formatMoney(v, st.v?.cur || st.trip.defaultCurrency);
  // Expenses waiting to be deleted (undo still possible) are hidden from every view.
  const hideKey = eid => id + ':' + eid;
  const showList = () => { st.expenses = st.all.filter(x => !pending.has(hideKey(x.id))); };
  st.del = e => {
    if (!e) return;
    const k = hideKey(e.id);
    pending.flush(); // the previous toast (and its undo) is replaced
    pending.add(k, () => { dropCached(id, e.files); return fire(store.deleteExpense(id, e.id, e.photoIds, e.files)); });
    showList(); drawAll();
    undoToast(T('נמחק: {x}', { x: e.details }), () => {
      if (!pending.undo(k)) return;
      showList(); drawAll(); toast(T('שוחזר'), 'good');
      $(`[data-edit="${CSS.escape(e.id)}"]`)?.closest('.tx')?.classList.add('flash');
    }, L.UNDO_MS);
  };

  const build = () => {
    view.innerHTML = `
      <header class="tripbar" id="hero"></header>
      <header class="tripbar mini-bar" id="miniBar" aria-hidden="true"></header>
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="list">${T('הוצאות וסיכומים')}</button>
        <button role="tab" data-tab="settle">${T('התחשבנות')}</button>
      </div>
      <div id="tabList" class="wrap">
        <div class="stats" id="stats"></div>
        <div class="card"><div class="card-head"><h2>${T('פילוח')}</h2>
          <div class="toggle" role="group"><button data-ch="cat">${T('לפי קטגוריה')}</button><button data-ch="day">${T('לפי יום')}</button></div></div>
          <div id="chart"></div></div>
        <div class="toolbar">
          <input class="search" id="search" type="search" placeholder="🔍 ${T('חיפוש: פירוט, הערה, קטגוריה, משלם')}" aria-label="${T('חיפוש תנועות')}">
        </div>
        <div id="txList" style="display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s3)"></div>
      </div>
      <div id="tabSettle" class="hidden">
        <div class="filter" id="who" role="group" aria-label="${T('סינון לפי משתתף')}"></div>
        <div class="wrap" style="margin-top:var(--s3)" id="settle"></div>
      </div>
      <button class="fab" id="fab"><span aria-hidden="true">+</span>${T('להוסיף הוצאה')}</button>`;
    // Material-style: when the big banner scrolls away, a slim bar stays at the top.
    const io = new IntersectionObserver(([en]) => {
      const show = !en.isIntersecting && en.boundingClientRect.top < 0;
      $('#miniBar').classList.toggle('on', show); $('#miniBar').setAttribute('aria-hidden', !show);
    });
    io.observe($('#hero')); cleanups.push(() => io.disconnect());
    const onClick = e => {
      if (e.target.closest('[data-edit-trip]')) editTripSheet(st);
      else if (e.target.closest('[data-files]')) attachmentsScreen(st);
      else if (e.target.closest('[data-people]')) peoplePopup(st);
      else if (e.target.closest('[data-groups]')) groupsSheet(st);
      else if (e.target.closest('#share')) shareTrip(st.trip);
      else if (e.target.closest('#pdf')) printReport(st);
      else if (e.target.closest('[data-unfocus]')) setFocus(null);
      else if (e.target.closest('[data-cur]')) { ls.set(viewKey(id), e.target.closest('[data-cur]').dataset.cur === st.trip.defaultCurrency ? 'in' : 'view'); drawAll(); }
      else if (e.target.closest('[data-hide-banner]')) { try { localStorage.setItem('tt-grp-banner-' + st.trip.id, '0'); } catch {} drawSettle(); }
    };
    view.addEventListener('click', onClick); cleanups.push(() => view.removeEventListener('click', onClick));
    $('#fab').onclick = () => expenseSheet(st, null, 'expense');
    $$('[data-tab]').forEach(b => b.onclick = () => { st.tab = b.dataset.tab; drawTabs(); });
    $$('[data-ch]').forEach(b => b.onclick = () => { if (st.chart === b.dataset.ch) return; st.chart = b.dataset.ch; st.focus = null; drawChart(); drawList(); });
    $('#search').oninput = e => { st.search = e.target.value; drawList(); };
    const txHost = $('#txList');
    txHost.addEventListener('click', ev => {
      const el = ev.target.closest('.clamp.cut');
      if (el && !String(getSelection?.() || '')) toggleClamp(el); // a drag to select text does not toggle
    });
    txHost.addEventListener('keydown', ev => {
      const el = ev.target.closest('.clamp.cut');
      if (el && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); toggleClamp(el); }
    });
    let clampRaf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(clampRaf); clampRaf = requestAnimationFrame(markClamps); });
    ro.observe(txHost); cleanups.push(() => { ro.disconnect(); cancelAnimationFrame(clampRaf); });
    document.fonts?.ready.then(() => { if (txHost.isConnected) markClamps(); });
    st.built = true;
  };

  const drawTabs = () => {
    $$('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === st.tab));
    $('#tabList').classList.toggle('hidden', st.tab !== 'list');
    $('#tabSettle').classList.toggle('hidden', st.tab !== 'settle');
    if (st.tab === 'list') markClamps();
  };

  // Long description/comment is cut to 2 lines with "…"; tapping it shows the whole text.
  // Measured again after a redraw, tab switch, font load or resize. Opened texts stay open across redraws.
  const openTexts = new Set();
  const markClamps = () => $$('#txList .clamp').forEach(el => {
    const k = el.dataset.k;
    if (openTexts.has(k)) { el.classList.add('cut', 'open'); }
    else {
      if (!el.clientHeight) return; // hidden tab: measure later
      el.classList.remove('open');
      el.classList.toggle('cut', el.scrollHeight > el.clientHeight + 1);
    }
    const cut = el.classList.contains('cut');
    if (cut) { el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-expanded', String(openTexts.has(k))); }
    else { el.removeAttribute('tabindex'); el.removeAttribute('role'); el.removeAttribute('aria-expanded'); }
  });
  const toggleClamp = el => {
    const k = el.dataset.k, open = !openTexts.has(k);
    if (open) openTexts.add(k); else openTexts.delete(k);
    el.classList.toggle('open', open); el.setAttribute('aria-expanded', String(open));
    if (!open) markClamps();
  };

  const drawHero = () => {
    const t = st.trip;
    const len = t.startDate && t.endDate ? L.daysBetween(t.startDate, t.endDate) : 0;
    const btns = title => [`<a class="ib" href="#/" title="${T('לכל הטיולים')}" aria-label="${T('לכל הטיולים')}">${backArrow()}</a>`, title,
      `<button class="ib" data-files title="${T('קבצים מצורפים')}" aria-label="${T('קבצים מצורפים')}">🧷</button>`,
      `<button class="ib" data-edit-trip title="${T('עריכת פרטי טיול')}" aria-label="${T('עריכת פרטי טיול')}">✏️</button>`].join('');
    const hero = $('#hero');
    hero.style.cssText = tripStyle(t.color);
    hero.innerHTML = `<div class="tb-row">${btns(`<h1>${esc(t.name)}</h1>`)}</div>
      <div class="tb-meta">${flagsOf(t) || '📍'} <bdi>${esc(t.location)}</bdi> · <span class="num">${esc(dateRange(t.startDate, t.endDate))}</span>${len > 0 ? ` · ${T('{n} ימים', { n: len })}` : ''}</div>
      <div class="chips tb-chips"><button type="button" class="chip ppl" data-people title="${T('משתתפים')}" aria-label="${T('משתתפים')} (${t.participants.length})">👥 <span class="num">${t.participants.length}</span></button>
        ${st.v.pair ? `<span class="cur-sw" role="group" aria-label="${T('מטבע תצוגה')}">${[t.defaultCurrency, st.v.pair].map(c =>
          `<button type="button" data-cur="${esc(c)}" aria-pressed="${(st.v.wait || st.v.fail ? ls.get(viewKey(id)) === 'in' ? t.defaultCurrency : st.v.pair : st.v.cur) === c}" title="${esc(c)}">${esc(L.currencySymbol(c))}</button>`).join('')}</span>`
          : `<span class="chip mint">${esc(L.currencySymbol(t.defaultCurrency))} ${esc(t.defaultCurrency)}</span>`}
        <span class="tb-share"><button type="button" class="chip wa-chip" id="share" title="${T('שיתוף בוואטסאפ')}">${WA_ICON}${T('שיתוף')}</button>
          <button type="button" class="chip pdf-chip" id="pdf" title="${T('ייצוא PDF')}">📄 PDF</button></span></div>`;
    const s = L.summarize(t, st.v.list, todayIso());
    const mini = $('#miniBar');
    mini.style.cssText = tripStyle(t.color);
    mini.innerHTML = `<div class="tb-row">${btns(`<div class="tb-t"><b>${esc(t.name)}</b><span>${T('{n} ימים', { n: s.days })} · <bdi class="money">${esc(fmt(s.net))}</bdi></span></div>`)}</div>`;
  };

  const drawStats = () => {
    const s = L.summarize(st.v.trip, st.v.list, todayIso());
    const t = st.trip, note = esc(st.v.cur !== t.defaultCurrency ? '💱 ' + T('ב-{c} · כל הוצאה לפי השער של היום שבו שולמה', { c: st.v.cur })
      : st.v.wait ? '💱 ' + T('טוען שערים ל-{c}…', { c: st.v.pair }) : st.v.fail ? '⚠️ ' + T('אין שער ל-{c} כרגע (אין חיבור?) – מוצג ב-{d}', { c: st.v.pair, d: t.defaultCurrency }) : '');
    $('#stats').innerHTML = `
      <div class="card stat big"><div><div class="muted">${T('מאזן נטו (הוצאות פחות החזרים)')}</div><div class="v"><span class="money">${fmt(s.net)}</span></div>${note ? `<div class="view-note">${note}</div>` : ''}</div>
        <span class="chip sky">${T('{n} ימים', { n: s.days })} · ${T('{n} תנועות', { n: st.expenses.length })}</span></div>
      ${(b => b ? budgetTile(st.v.trip, b, fmt) : '')(L.budgetSummary(st.v.trip, st.v.list, todayIso()))}
      <div class="card stat exp"><div class="muted">${T('סה"כ הוצאות')}</div><div class="v neg"><span class="money">${fmt(s.totalExpenses)}</span></div></div>
      <div class="card stat inc"><div class="muted">${T('הכנסות / החזרים')}</div><div class="v pos"><span class="money">+${fmt(s.totalIncome)}</span></div></div>
      <div class="card stat"><div class="muted">${T('ממוצע ליום')}</div><div class="v"><span class="money">${fmt(s.perDay)}</span></div></div>
      <div class="card stat"><div class="muted">${T('ממוצע לאדם')}</div><div class="v"><span class="money">${fmt(s.perPerson)}</span></div></div>`;
  };

  const drawChart = () => {
    $$('[data-ch]').forEach(b => b.setAttribute('aria-pressed', b.dataset.ch === st.chart));
    const host = $('#chart');
    const scrollX = host.querySelector('.bars-scroll')?.scrollLeft;
    const items = st.chart === 'cat' ? L.byCategory(st.v.list) : L.byDay(st.v.list);
    if (st.focus && !items.some(d => d.name === st.focus.name)) st.focus = null; // its last expense was deleted/moved
    const selected = st.focus?.name ?? null;
    const onSelect = name => { st.focus = name ? { kind: st.chart, name } : null; drawList(); };
    if (st.chart === 'cat') breakdown(host, items, { fmt, label: n => `${L.categoryEmoji(n)} ${T(n)}`, selected, onSelect });
    else bars(host, items, { fmt, total: L.summarize(st.trip, st.v.list).totalExpenses, selected, onSelect });
    const sc = host.querySelector('.bars-scroll');
    if (sc && scrollX != null) sc.scrollLeft = scrollX;
  };
  const setFocus = f => { st.focus = f; drawChart(); drawList(); };

  const drawList = () => {
    const host = $('#txList');
    const focusPill = n => {
      const f = st.focus;
      if (!f) return '';
      const what = f.kind === 'cat' ? `${L.categoryEmoji(f.name)} <bdi>${esc(T(f.name))}</bdi>`
        : `📅 <bdi>${esc(formatDate(f.name, { weekday: 'short' }))}</bdi>`;
      return `<div class="focus-pill"><span>${what} · ${T('<span class="num">{n}</span> ראשונות', { n })}</span>
          <button type="button" class="x" data-unfocus title="${T('ביטול')}" aria-label="${T('ביטול הסידור')}">✕</button></div>`;
    };
    const list = L.sortTransactions(st.v.list.filter(e => L.matchesSearch(e, st.search)));
    if (!st.expenses.length) {
      host.innerHTML = `<div class="empty"><div class="big">🧾</div><p>${T('עדיין אין תנועות.')}<br>${T('לחצו על + כדי להוסיף את ההוצאה הראשונה.')}</p></div>`; return;
    }
    if (!list.length) { host.innerHTML = focusPill(0) + `<div class="empty">${T('לא נמצאו תנועות עבור')} "${esc(st.search)}"</div>`; return; }
    const card = (e, dim) => {
      const inc = e.type === 'income';
      // Showing the view currency: it goes first and the paid amount under it. Otherwise the paid amount first, as before.
      const viewing = st.v.cur !== st.trip.defaultCurrency, sign = inc ? '+' : '';
      const big = viewing && e.currency !== st.v.cur ? sign + fmt(e.convertedAmount) : sign + L.formatMoney(e.amount, e.currency);
      const small = e.currency === st.v.cur ? '' : viewing ? L.formatMoney(e.amount, e.currency) : '≈ ' + fmt(e.convertedAmount);
      return `<div class="card tx ${inc ? 'income' : ''}${dim ? ' dim' : ''}">
        <div class="ic" aria-hidden="true">${inc ? '↩️' : L.categoryEmoji(e.category)}</div>
        <div class="mid">
          <div class="t clamp" data-k="${esc(e.id)}:t">${esc(e.details)}</div>
          <div class="muted">${esc(T(e.category))} · ${inc ? T('התקבל ע"י') : T('שולם ע"י')} <bdi>${esc(e.paidBy)}</bdi></div>
          ${e.comment ? `<div class="muted com clamp" data-k="${esc(e.id)}:c">💬 ${esc(e.comment)}</div>` : ''}
          ${e.location ? `<a class="geo-link" href="${esc(L.mapsUrl(e.location))}" target="_blank" rel="noopener">📍 ${esc(e.address || T('מיקום במפה'))}</a>` : ''}
          <div class="acts"><button class="mini" data-edit="${esc(e.id)}" title="${T('עריכה')}" aria-label="${T('עריכה')}">✏️</button>
            ${L.attachCount(e) ? `<button class="mini pics" data-pics="${esc(e.id)}" title="${T('קבצים מצורפים')}" aria-label="${T('{n} קבצים מצורפים', { n: L.attachCount(e) })}">${CLIP_SVG}<span class="num">${L.attachCount(e)}</span></button>` : ''}
            <button class="mini del" data-del="${esc(e.id)}" title="${T('מחיקה')}" aria-label="${T('מחיקה')}">🗑️</button></div>
        </div>
        <div class="amt ${inc ? 'pos' : 'neg'}"><span class="money">${esc(big)}</span>
          ${small ? `<small class="money">${esc(small)}</small>` : ''}</div>
      </div>`;
    };
    const days = (part, dim) => {
      let lastDay = null, out = '';
      for (const e of part) {
        if (e.date !== lastDay) {
          lastDay = e.date;
          out += `<div class="day-head${dim ? ' dim' : ''}">${esc(formatDate(e.date, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }))}</div>`;
        }
        out += card(e, dim);
      }
      return out;
    };
    const { first, rest } = L.focusSplit(list, st.focus);
    let html;
    if (!st.focus) html = days(rest, false);
    else {
      const f = st.focus;
      html = focusPill(first.length)
        + days(first, false)
        + (rest.length ? `<div class="focus-sep">${f.kind === 'cat' ? T('לא בקטגוריה הנבחרת') : T('לא ביום הנבחר')} · <span class="num">${rest.length}</span></div>` + days(rest, true) : '');
    }
    host.innerHTML = html;
    $$('[data-edit]', host).forEach(b => b.onclick = () => expenseSheet(st, st.expenses.find(x => x.id === b.dataset.edit)));
    markClamps();
    $$('[data-pics]', host).forEach(b => b.onclick = async () => {
      const ex = st.expenses.find(x => x.id === b.dataset.pics);
      if (ex?.files?.length) return expenseSheet(st, ex); // files: the sheet shows and opens them
      const pics = await store.getPhotos(st.trip.id, b.dataset.pics).catch(err => (reportError(err), []));
      const ok = pics.map(p => p.data).filter(L.isPhotoData);
      if (ok.length) photoViewer(ok, 0); else toast(T('התמונות עדיין לא סונכרנו למכשיר הזה'));
    });
    $$('[data-del]', host).forEach(b => b.onclick = () => st.del(st.expenses.find(x => x.id === b.dataset.del)));
  };

  const drawSettle = () => {
    const t = st.trip;
    if (st.who && !t.participants.includes(st.who)) st.who = '';
    $('#who').innerHTML = ['', ...t.participants].map(p => `<button data-who="${esc(p)}" aria-pressed="${st.who === p}">${p ? esc(p) : T('כולם')}</button>`).join('');
    $$('[data-who]').forEach(b => b.onclick = () => { st.who = b.dataset.who; drawSettle(); });

    const bal = L.balances(t.participants, st.v.list);
    const groups = L.cleanGroups(t.groups, t.participants);
    const units = L.groupBalances(bal, groups);
    const transfers = L.settleTransfers(units);
    const unitOf = Object.fromEntries(units.flatMap(u => u.members.map(p => [p, u.name])));
    const mine = st.who ? unitOf[st.who] : '';
    const shown = st.who ? transfers.filter(x => x.from === mine || x.to === mine) : transfers;
    const pieItems = st.who ? L.byCategory(st.v.list.filter(e => e.paidBy === st.who)) : L.byPayer(st.v.list);
    let bannerOn = true; try { bannerOn = localStorage.getItem('tt-grp-banner-' + t.id) !== '0'; } catch {}
    const solo = units.filter(u => !u.isGroup).length;
    const host = $('#settle');
    host.innerHTML = `
      ${groups.length ? `<div class="gbar"><span>👨‍👩‍👧 ${groups.length === 1 ? T('קבוצה אחת') : T('{n} קבוצות', { n: groups.length })}${solo ? ` · ${T('{n} לבד', { n: solo })}` : ''}</span>
          <button type="button" class="btn sm ghost" data-groups>${T('עריכת קבוצות')}</button></div>`
        : bannerOn ? `<div class="grp-banner"><button type="button" class="x" data-hide-banner title="${T('הסתרה')}" aria-label="${T('הסתרת ההודעה')}">✕</button>
          <b>👨‍👩‍👧 ${T('יש בטיול זוגות או משפחות?')}</b>
          <p>${T('אפשר לאחד אנשים לקבוצה, וההתחשבנות תהיה בין הקבוצות: מי מעביר למי – פעם אחת לכל זוג.')}</p>
          <button type="button" class="btn primary block" data-groups>${T('לחלק את האנשים לקבוצות')}</button></div>` : ''}
      <div class="card"><h2>${st.who ? esc(T('ההוצאות ששילם/ה {x} לפי קטגוריה', { x: st.who })) : T('מי שילם כמה')}</h2><div id="pie2"></div></div>
      <h2 style="margin:var(--s2) var(--s2) 0">${T('יתרות')}</h2>
      ${units.map(u => {
        const cls = u.balance > 0.009 ? 'pos' : u.balance < -0.009 ? 'neg' : 'zero';
        const ini = u.isGroup ? u.members.slice(0, 3).map(p => [...p][0] || '?').join('+') : ([...u.name][0] || '?');
        const many = u.isGroup;
        return `<div class="card person ${many ? 'group' : ''} ${st.who && mine !== u.name ? 'dim' : ''}">
          <div class="ava ${many ? 'multi' : ''}" aria-hidden="true">${esc(ini)}</div>
          <div><b>${esc(u.name)}</b>${many ? `<div class="members">${u.members.map(esc).join(', ')}</div>` : ''}</div>
          <span class="bal ${cls}" title="${cls === 'pos' ? T('מגיע') : cls === 'neg' ? T('חייב') : T('מאוזן')}"><span class="money">${u.balance > 0.009 ? '+' : ''}${fmt(u.balance)}</span></span>
          <div class="muted"><span>${many ? T('שילמו') : T('שילם/ה')} <bdi class="money">${fmt(u.paid)}</bdi></span><span>${many ? T('חלקם') : T('חלקו/ה')} <bdi class="money">${fmt(u.share)}</bdi></span>
            ${u.received ? `<span>${many ? T('קיבלו החזר') : T('קיבל/ה החזר')} <bdi class="money">${fmt(u.received)}</bdi></span>` : ''}</div>
        </div>`;
      }).join('')}
      <div class="card"><h2>💸 ${T('מי מעביר למי')} ${transfers.length ? `(${T('{n} העברות', { n: transfers.length })})` : ''}</h2>
        ${!transfers.length ? `<p class="muted center">🎉 ${T('כולם מאוזנים, אין צורך בהעברות')}</p>` : !shown.length ? `<p class="muted center">${esc(T('ל{x} אין העברות', { x: st.who }))}</p>` :
          `<div style="display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s2)">${shown.map(x => `<div class="xfer"><b>${esc(x.from)}</b> <span aria-hidden="true">${fwdArrow()}</span><span class="muted">${units.find(u => u.name === x.from)?.isGroup ? T('מעבירים ל') : T('מעביר/ה ל')}</span> <b>${esc(x.to)}</b>
            <span class="amt money">${fmt(x.amount)}</span></div>`).join('')}</div>`}
        ${st.who && mine !== st.who ? `<p class="hint">${esc(T('{x} בקבוצה "{g}" – מוצגות ההעברות של הקבוצה', { x: st.who, g: mine }))}</p>` : ''}
        <p class="hint">${T('חלוקה שווה של ההוצאות נטו בין {n} המשתתפים', { n: t.participants.length })}${groups.length ? T(', מקובצים ל-{n}', { n: units.length }) : ''}</p>
      </div>
      ${!groups.length && !bannerOn ? `<div class="center" style="margin-top:var(--s2)"><button type="button" class="btn ghost" data-groups>👨‍👩‍👧 ${T('לחלק את האנשים לקבוצות')}</button></div>` : ''}`;
    breakdown($('#pie2'), pieItems, { fmt, label: n => st.who ? `${L.categoryEmoji(n)} ${T(n)}` : n });
  };

  const drawAll = () => {
    if (!st.trip || st.gone) return;
    if (!st.built) build();
    st.v = vs.compute(st.trip, st.expenses);
    drawHero(); drawTabs(); drawStats(); drawChart(); drawList(); drawSettle();
  };

  let gotExpenses = false;
  cleanups.push(store.onTrip(id, trip => {
    if (!trip) { toast(T('הטיול נמחק'), 'bad'); return go('#/'); }
    if (L.isDeleted(trip)) { st.gone = true; return deletedTripScreen(trip); }
    if (st.gone) return route(); // restored meanwhile: start the page fresh
    st.trip = trip; applyTheme(L.tripTheme(trip)); ls.set('tt-theme:' + id, L.tripTheme(trip)); if (gotExpenses) drawAll();
    prefetchRates(trip.defaultCurrency); // keep rates on the phone for offline (at most every 6 h)
  }, reportError));
  const onOnline = () => { if (!st.trip) return; prefetchRates(st.trip.defaultCurrency); if (st.v?.fail) { vs.reset(); drawAll(); } };
  addEventListener('online', onOnline); cleanups.push(() => removeEventListener('online', onOnline));
  cleanups.push(store.onExpenses(id, list => {
    st.all = list; showList(); gotExpenses = true; drawAll();
    fillAddresses(id, st.expenses, (tid, eid, patch) => fire(store.patchExpense(tid, eid, patch)));
  }, reportError));
}

// A trip in the trash. Others just see "נמחק"; the manager can bring it back.
function deletedTripScreen(t, reload = false) {
  closeAll();
  view.innerHTML = `<header class="topbar"><a class="icon-btn" href="#/" title="${T('חזרה')}" aria-label="${T('חזרה')}">${backArrow()}</a><h1>${T('טיול')}</h1></header>
    <div class="wrap"><div class="card empty"><div class="big" aria-hidden="true">🗑️</div><h2>${T('הטיול נמחק')}</h2>
      <button class="btn ghost" id="restoreTrip">↩ ${T('שחזור (מנהל)')}</button></div></div>`;
  $('#restoreTrip').onclick = async () => {
    if (!await adminCode('↩ ' + T('שחזור טיול'))) return;
    fire(store.updateTrip(t.id, { deletedAt: null })); toast(T('הטיול שוחזר'), 'good');
    if (reload && location.hash.startsWith('#/trip/')) route(); // otherwise the trip listener restarts the page
  };
}

// ---------------------------------------------------------------- budget screen (#/trip/<id>/budget)
const RING_C = 2 * Math.PI * 70;
function budgetTile(trip, b, fmt) {
  const over = b.left < 0;
  const tick = b.expectedPct != null && b.elapsed > 0 && b.daysLeft > 0;
  const right = tick ? `<span><i class="tick-key" aria-hidden="true"></i> ${T('היום אמורים להיות ב-<span class="num">{p}%</span>', { p: Math.round(b.expectedPct * 100) })}</span>`
    : b.tripDays == null ? '' : b.daysLeft === 0 ? `<span>${T('הטיול הסתיים')}</span>` : `<span>${T('<span class="num">{n}</span> ימים נשארו', { n: b.daysLeft })}</span>`;
  return `<a class="card btile ${b.level}" href="#/trip/${encodeURIComponent(trip.id)}/budget">
      <div class="b-top"><span class="b-lbl">💰 ${T('תקציב')}</span><span class="b-go">${T('לפרטים')} ${isRtl() ? '◂' : '▸'}</span></div>
      <div class="b-top"><span class="b-v ${over ? 'neg' : ''}"><span class="money">${esc(fmt(Math.abs(b.left)))}</span> <small>${over ? T('מעל התקציב') : T('נשארו')}</small></span>
        <span class="b-of">${over ? T('תקציב') : T('מתוך')} <span class="money">${esc(fmt(b.total))}</span></span></div>
      <div class="meter" role="img" aria-label="${T('נוצלו {p}% מהתקציב', { p: Math.round(b.pct * 100) })}"><i style="width:${Math.min(b.pct, 1) * 100}%"></i>${tick ? `<span class="tick" style="inset-inline-start:${b.expectedPct * 100}%"></span>` : ''}</div>
      <div class="b-legend"><span><span class="num">${Math.round(b.pct * 100)}%</span> ${T('נוצל')}</span>${right}</div></a>`;
}

async function budgetPage(id) {
  if (accessLeft(id) <= 0) return go('#/trip/' + encodeURIComponent(id)); // the trip page asks for the password
  view.innerHTML = `<div class="wrap" style="padding-top:40px"><div class="skeleton"></div></div>`;
  const st = { trip: null, expenses: [], mode: 'total' };
  let gotT = false, gotE = false;
  let alive = true; cleanups.push(() => { alive = false; });
  const vs = viewState(id, () => { if (alive) draw(); });
  let cur = '';
  const fmt = v => L.formatMoney(v, cur || st.trip.defaultCurrency);
  const short = v => L.formatMoney(Math.round(v), cur || st.trip.defaultCurrency).replace(/\.00$/, '');
  const draw = () => {
    if (!gotT || !gotE) return;
    const v = vs.compute(st.trip, st.expenses); cur = v.cur;
    const t = v.trip, b = L.budgetSummary(t, v.list, todayIso());
    const head = `<header class="bhead" style="${tripStyle(t.color)}"><div class="bh-row">
        <a class="ib" href="#/trip/${encodeURIComponent(t.id)}" title="${T('חזרה לטיול')}" aria-label="${T('חזרה לטיול')}">${backArrow()}</a>
        <h1>💰 ${T('תקציב')} · <bdi>${esc(t.name)}</bdi></h1>
        <button type="button" class="ib" data-edit-budget title="${T('עריכת התקציב')}" aria-label="${T('עריכת התקציב')}">✏️</button></div></header>`;
    if (!b) {
      view.innerHTML = head + `<div class="wrap"><div class="empty"><div class="big">💰</div><p>${T('אין תקציב לטיול הזה.')}</p>
        <button type="button" class="btn primary" data-edit-budget>✏️ ${T('להוסיף תקציב')}</button></div></div>`;
      return bind();
    }
    const tabs = `<div class="tabs" role="tablist"><button role="tab" data-bmode="total" aria-selected="${st.mode === 'total'}">${T('סה"כ')}</button>
      <button role="tab" data-bmode="day" aria-selected="${st.mode === 'day'}">${T('לפי יום')}</button></div>`;
    let body = '';
    if (st.mode === 'total') {
      const col = { ok: '#047857', warn: '#F59E0B', over: '#BE123C' }[b.level];
      const over = b.left < 0;
      const diff = b.avgPerDay != null && b.daily != null ? round(b.avgPerDay - b.daily) : null;
      body = `<div class="card b-main">
          <svg class="ring" width="170" height="170" viewBox="0 0 170 170" role="img" aria-label="${T('נוצלו {p}% מהתקציב', { p: Math.round(b.pct * 100) })}">
            <circle cx="85" cy="85" r="70" fill="none" stroke="var(--track)" stroke-width="16"/>
            <circle cx="85" cy="85" r="70" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${Math.min(b.pct, 1) * RING_C} ${RING_C}" transform="rotate(-90 85 85)"/>
            <text x="85" y="84" text-anchor="middle" class="ring-v">${Math.round(b.pct * 100)}%</text><text x="85" y="108" text-anchor="middle" class="ring-s">${T('נוצל')}</text></svg>
          <div class="b-big ${over ? 'neg' : ''}"><span class="money">${esc(fmt(Math.abs(b.left)))}</span></div>
          <div class="muted center">${over ? T('מעל התקציב של') : T('נשארו מתוך')} <span class="money">${esc(fmt(b.total))}</span></div></div>
        <div class="row2 b-kv">
          <div class="card"><span class="muted">${T('הוצאנו')}</span><b><span class="money">${esc(fmt(b.spent))}</span></b></div>
          ${b.tripDays ? `<div class="card"><span class="muted">${T('ימים שנשארו')}</span><b>${b.daysLeft === 0 ? T('הטיול הסתיים') : T('<span class="num">{a}</span> מתוך <span class="num">{b}</span>', { a: b.daysLeft, b: b.tripDays })}</b></div>` : ''}
          ${b.avgPerDay != null ? `<div class="card"><span class="muted">${T('ממוצע ליום עד עכשיו')}</span><b><span class="money">${esc(short(b.avgPerDay))}</span>
            ${diff ? `<small class="${diff > 0 ? 'neg' : 'pos'}">${diff > 0 ? '▲' : '▼'} <span class="num">${Math.abs(Math.round(diff))}</span></small>` : ''}</b></div>` : ''}
          ${b.daily != null ? `<div class="card"><span class="muted">${T('תקציב ליום')}</span><b><span class="money">${esc(short(b.daily))}</span></b></div>` : ''}
        </div>
        ${b.allowedPerDay != null ? (over
          ? `<div class="b-tip warn">⚠️ ${T('כבר מעל התקציב ב-{x}.', { x: `<b><span class="money">${esc(fmt(-b.left))}</span></b>` })}</div>`
          : `<div class="b-tip">👉 ${b.daysLeft === 1 ? T('כדי לעמוד בתקציב: עד {x} ליום ביום שנשאר.', { x: `<b><span class="money">${esc(short(b.allowedPerDay))}</span></b>` })
            : T('כדי לעמוד בתקציב: עד {x} ליום ב-{n} הימים שנשארו.', { x: `<b><span class="money">${esc(short(b.allowedPerDay))}</span></b>`, n: `<span class="num">${b.daysLeft}</span>` })}</div>`) : ''}
        ${b.projection != null ? (b.projection > b.total
          ? `<div class="b-tip warn">📈 ${T('בקצב הנוכחי הטיול יעלה בערך {x} – {y} מעל התקציב.', { x: `<b><span class="money">${esc(short(b.projection))}</span></b>`, y: `<span class="money">${esc(short(b.projection - b.total))}</span>` })}</div>`
          : `<div class="b-tip good">📈 ${T('בקצב הנוכחי הטיול יעלה בערך {x} – בתוך התקציב', { x: `<b><span class="money">${esc(short(b.projection))}</span></b>` })} 👍</div>`) : ''}
        ${!b.tripDays ? `<p class="muted small center">${T('בלי תאריכי טיול אין חישוב ליום. אפשר להוסיף תאריכים ב-✏️.')}</p>` : ''}`;
    } else if (!b.tripDays) {
      body = `<div class="empty"><div class="big">📅</div><p>${T('כדי לראות תקציב לפי יום צריך תאריכי התחלה וסיום לטיול.')}</p>
        <button type="button" class="btn primary" data-edit-budget>✏️ ${T('להוסיף תאריכים')}</button></div>`;
    } else {
      const max = Math.max(b.daily * 1.25, ...b.days.map(d => d.spent), ...b.days.map(d => d.allowed || 0)) || 1;
      const pastDays = b.days.filter(d => !d.future);
      const nOver = pastDays.filter(d => d.spent > b.daily).length;
      body = `<div class="card b-daily"><div><span class="muted">${T('תקציב ליום')}</span><b><span class="money">${esc(short(b.daily))}</span></b></div>
          ${b.avgPerDay != null ? `<div class="b-end"><span class="muted">${T('ממוצע בפועל')}</span><b class="${b.avgPerDay > b.daily ? 'neg' : 'pos'}"><span class="money">${esc(short(b.avgPerDay))}</span></b></div>` : ''}</div>
        <div class="card b-days">${b.days.map(d => {
          const label = `${d.today ? `<b>${T('היום')}</b> ` : ''}${esc(formatDate(d.date, { weekday: 'short' }))}`;
          const w = d.future ? (d.allowed || 0) / max * 100 : Math.max(d.spent, 0) / max * 100;
          const cls = d.future ? 'f' : d.spent > b.daily ? 'o' : '';
          const amt = d.future ? `<span class="money">${esc(short(d.allowed || 0))}</span><small>${T('מותר')}</small>`
            : `<span class="money">${esc(short(d.spent))}</span><small class="${d.diff > 0 ? 'neg' : 'pos'}">${d.diff > 0 ? '▲' : '▼'} <span class="num">${Math.abs(Math.round(d.diff))}</span></small>`;
          return `<button type="button" class="drow ${d.today ? 'today' : ''} ${d.future ? 'fut' : ''}" data-day="${esc(d.date)}" ${d.future ? 'disabled' : ''}>
            <span class="d-lbl">${label}</span><span class="bar"><i class="${cls}" style="width:${w}%"></i><span class="line" style="inset-inline-start:${b.daily / max * 100}%"></span></span>
            <span class="amt">${amt}</span></button>`;
        }).join('')}
          ${b.outside ? `<div class="drow out"><span class="d-lbl">${T('מחוץ לתאריכי הטיול')}</span><span></span><span class="amt"><span class="money">${esc(short(b.outside))}</span></span></div>` : ''}
          <div class="b-legend"><span><i class="tick-key" aria-hidden="true"></i> ${T('קו = {x} ליום', { x: `<span class="money">${esc(short(b.daily))}</span>` })}</span>
            <span>${T('<span class="num">{a}</span> ימים בתקציב · <span class="num">{b}</span> מעל', { a: pastDays.length - nOver, b: nOver })}</span></div></div>
        <p class="muted small center">${T('לחיצה על יום מציגה את ההוצאות שלו בדף הטיול.')}</p>`;
    }
    view.innerHTML = head + tabs + `<div class="wrap">${body}</div>`;
    bind();
  };
  const round = v => Math.round(v * 100) / 100;
  const bind = () => {
    $$('[data-edit-budget]').forEach(x => x.onclick = () => editTripSheet(st));
    $$('[data-bmode]').forEach(x => x.onclick = () => { st.mode = x.dataset.bmode; draw(); $(`[data-bmode=${st.mode}]`)?.focus(); });
    $$('[data-day]').forEach(x => x.onclick = () => {
      try { sessionStorage.setItem('tt-focus-day:' + id, x.dataset.day); } catch {}
      go('#/trip/' + id);
    });
  };
  cleanups.push(store.onTrip(id, trip => {
    if (!trip) { toast(T('הטיול נמחק'), 'bad'); return go('#/'); }
    if (L.isDeleted(trip)) return go('#/trip/' + encodeURIComponent(id)); // the trip page shows "הטיול נמחק"
    st.trip = trip; gotT = true; applyTheme(L.tripTheme(trip)); draw();
  }, reportError));
  cleanups.push(store.onExpenses(id, list => { st.expenses = list; gotE = true; draw(); }, reportError));
}

// ---------------------------------------------------------------- trip color, participants, groups
function tripBg(key) { const c = L.tripColor(key); return `linear-gradient(135deg, ${c.from}, ${c.to})`; }
// Inline style for a tinted surface: the light gradient plus its two colors, which the dark theme mixes into dark.
function tripStyle(key) { const c = L.tripColor(key); return `background:${tripBg(key)};--tf:${c.from};--tt:${c.to}`; }

function peoplePopup(st) {
  const t = st.trip;
  const groupOf = Object.fromEntries(L.cleanGroups(t.groups, t.participants).flatMap(g => g.members.map(p => [p, g.name])));
  const m = modal(`<h2>👥 ${T('משתתפים')} (${t.participants.length})</h2>
    <ul class="people-list">${t.participants.map(p => `<li><span class="ava" aria-hidden="true">${esc([...p][0] || '?')}</span><span class="pn">${esc(p)}</span>
      ${groupOf[p] ? `<span class="chip">${esc(groupOf[p])}</span>` : ''}</li>`).join('')}</ul>
    <div class="row2"><button class="btn ghost" data-g>👨‍👩‍👧 ${T('לחלק לקבוצות')}</button><button class="btn primary" data-x>${T('סגירה')}</button></div>`, { label: T('משתתפים') });
  $('[data-x]', m.el).onclick = () => m.close();
  $('[data-g]', m.el).onclick = () => { m.close(); groupsSheet(st); };
}

const GROUP_COLORS = ['#38BDF8', '#A78BFA', '#F472B6', '#34D399', '#FBBF24', '#FB923C', '#2DD4BF', '#818CF8', '#A3E635', '#F87171']; // one per group, MAX_GROUPS long
function groupsSheet(st) {
  const t = st.trip;
  // Work on a copy. A name the user didn't type stays '', so the shown name follows the members.
  const inTrip = new Set(t.participants), seen = new Set();
  const groups = (t.groups || []).map(g => ({
    name: g.name || '',
    members: (g.members || []).filter(p => inTrip.has(p) && !seen.has(p) && seen.add(p))
  })).filter(g => g.members.length).slice(0, L.MAX_GROUPS);
  let active = 0;
  const m = modal(`<h2>${T('חלוקה לקבוצות')}</h2><p class="muted" style="margin:-8px 0 var(--s3)">${T('כל אדם יכול להיות בקבוצה אחת בלבד. מי שלא בקבוצה מתחשבן לבד.')}</p>
    <div id="g-body"></div>
    <div class="row2" style="margin-top:var(--s4)"><button class="btn ghost" data-x>${T('ביטול')}</button><button class="btn primary" data-save>${T('שמירה')}</button></div>`, { sheet: true, label: T('חלוקה לקבוצות') });
  const body = $('#g-body', m.el);
  const draw = () => {
    const used = new Set(groups.flatMap(g => g.members));
    const free = t.participants.filter(p => !used.has(p));
    active = Math.max(0, Math.min(active, groups.length - 1));
    body.innerHTML = `${groups.map((g, i) => `<div class="grp ${i === active ? 'on' : ''}" data-act="${i}" style="--g:${GROUP_COLORS[i]}">
        <div class="grp-head"><i aria-hidden="true"></i><input data-name="${i}" maxlength="40" value="${esc(g.name)}" placeholder="${esc(L.groupName(g.members) || T('קבוצה {n}', { n: i + 1 }))}" aria-label="${T('שם הקבוצה')}">
          <button type="button" class="mini" data-delg="${i}" title="${T('מחיקת קבוצה')}" aria-label="${T('מחיקת קבוצה')}">🗑️</button></div>
        <div class="chips">${g.members.length ? g.members.map(p => `<span class="chip in"><span>${esc(p)}</span><button type="button" data-out="${esc(p)}" aria-label="${esc(T('הוצאת {x} מהקבוצה', { x: p }))}">✕</button></span>`).join('')
          : `<span class="muted">${i === active ? T('לחצו על שם למטה כדי להוסיף') : T('לחצו כאן ואז על שם למטה')}</span>`}</div></div>`).join('')}
      <button type="button" class="add-grp" data-newg ${groups.length >= L.MAX_GROUPS ? 'disabled' : ''}>+ ${T('קבוצה חדשה ({a} מתוך {b})', { a: groups.length, b: L.MAX_GROUPS })}</button>
      <div class="pool"><div class="pool-l">${free.length ? (groups.length ? T('בלי קבוצה – לחיצה מוסיפה לקבוצה המסומנת') : T('בלי קבוצה – לחיצה פותחת קבוצה חדשה')) : T('כולם בקבוצות') + ' 👍'}</div>
        <div class="chips">${free.map(p => `<button type="button" class="chip" data-in="${esc(p)}">${esc(p)} ＋</button>`).join('')}</div></div>`;
  };
  body.addEventListener('input', e => { const i = e.target.dataset.name; if (i != null) groups[+i].name = e.target.value; });
  body.addEventListener('click', e => {
    if (e.target.matches('input')) return;
    const el = e.target.closest('button, [data-act]'); if (!el) return;
    const d = el.dataset;
    if (d.in != null) {
      if (!groups.length) { groups.push({ name: '', members: [] }); active = 0; }
      groups[active].members.push(d.in);
    } else if (d.out != null) {
      const g = groups.find(x => x.members.includes(d.out)); g.members = g.members.filter(p => p !== d.out);
    } else if (d.delg != null) { groups.splice(+d.delg, 1); if (+d.delg < active) active--; }
    else if (d.newg != null) { if (groups.length < L.MAX_GROUPS) { groups.push({ name: '', members: [] }); active = groups.length - 1; } }
    else if (d.act != null) { if (+d.act === active) return; active = +d.act; }
    else return;
    draw();
  });
  draw();
  $('[data-x]', m.el).onclick = () => m.close();
  $('[data-save]', m.el).onclick = () => {
    const out = groups.filter(g => g.members.length).map(g => ({ name: g.name.trim(), members: g.members }));
    fire(store.updateTrip(t.id, { groups: out }));
    m.close(); toast(out.length ? T('הקבוצות נשמרו') : T('הקבוצות נמחקו'), 'good');
  };
}

function editTripSheet(st) {
  const t = st.trip;
  const locked = new Set(st.expenses.map(e => e.paidBy));
  const m = modal(`<h2>${T('עריכת פרטי טיול')}</h2><form novalidate>${tripFormHtml(t, false)}
    <div class="row2"><button type="button" class="btn ghost" data-x>${T('ביטול')}</button><button class="btn primary">${T('שמירה')}</button></div></form>`, { sheet: true, label: T('עריכת פרטי טיול') });
  const read = bindTripForm(m.el, t, locked, [...new Set(st.expenses.map(e => e.address).filter(Boolean))].slice(0, 40));
  $('[data-x]', m.el).onclick = () => m.close();
  $('form', m.el).onsubmit = async e => {
    e.preventDefault();
    const data = read(); if (!data) return;
    if (t.groups?.length) data.groups = t.groups // drop people who left the trip, and groups left empty
      .map(g => ({ name: g.name || '', members: (g.members || []).filter(p => data.participants.includes(p)) })).filter(g => g.members.length);
    const btn = $('button.primary', m.el);
    // A budget the user did not touch is in the old currency and gets converted with the expenses.
    const convertBudget = !!(data.budget && t.budget && !read.budgetTouched());
    if (data.defaultCurrency !== t.defaultCurrency && (st.expenses.length || convertBudget)) {
      btn.disabled = true; btn.textContent = T('טוען שער…');
      let r;
      try { r = await getRate(t.defaultCurrency, data.defaultCurrency); }
      catch { btn.disabled = false; btn.textContent = T('שמירה'); return toast(T('אין שער המרה כרגע (אין חיבור?). נסו שוב מאוחר יותר'), 'bad'); }
      btn.disabled = false; btn.textContent = T('שמירה');
      const what = st.expenses.length ? (convertBudget ? T('כל {n} התנועות והתקציב יומרו', { n: st.expenses.length }) : T('כל {n} התנועות יומרו', { n: st.expenses.length })) : T('התקציב יומר');
      const ok = await confirmBox(T('החלפת מטבע הטיול'),
        T('{what} מ-{a} ל-{b} לפי שער {r}{c}. להמשיך?', { what, a: t.defaultCurrency, b: data.defaultCurrency, r: r.rate.toFixed(4), c: r.source === 'cache' ? ' ' + T('(שער שמור)') : '' }));
      if (!ok) return;
      // Expenses first; the trip's currency and budget only after they succeed, so they never disagree.
      const { defaultCurrency, budget, ...rest } = data;
      const newBudget = convertBudget ? { ...budget, amount: L.round2(budget.amount * r.rate) } : budget;
      fire(store.updateTrip(t.id, rest));
      fire(store.updateExpenses(t.id, st.expenses.map(x => ({ id: x.id, patch: L.reconvert(x, defaultCurrency, r.rate) })))
        .then(() => store.updateTrip(t.id, { defaultCurrency, budget: newBudget })));
      m.close(); toast(T('הפרטים נשמרו'), 'good');
      return;
    }
    fire(store.updateTrip(t.id, data));
    m.close(); toast(T('הפרטים נשמרו'), 'good');
  };
}

// ---------------------------------------------------------------- add / edit transaction
function expenseSheet(st, existing, type = 'expense') {
  const t = st.trip;
  const e = existing || { type, currency: t.defaultCurrency, date: todayIso(), paidBy: t.participants[0], category: '', details: '', comment: '' };
  const r = { rate: existing ? existing.exchangeRateToTripDefault : 1, source: existing ? 'saved' : 'live', at: 0, manual: false };
  const m = modal(`
    <h2>${existing ? T('עריכת תנועה') : T('הוספת תנועה')}</h2>
    ${existing ? '' : `<button type="button" class="scan-bar" id="x-scan" aria-expanded="false" aria-controls="x-scan-menu"><span aria-hidden="true">📷</span> ${T('סריקת קבלה')}</button>
      <div class="scan-menu hidden" id="x-scan-menu" role="menu">
        <button type="button" role="menuitem" data-scan="cam">📷 ${T('צילום עכשיו')}</button>
        <button type="button" role="menuitem" data-scan="gal">🖼️ ${T('מהגלריה')}</button></div>
      <input type="file" id="x-scan-cam" accept="image/*" capture="environment" hidden>
      <input type="file" id="x-scan-gal" accept="image/*" hidden>
      <div class="scan-st hidden" id="x-scan-st" aria-live="polite"></div>`}
    <form novalidate>
      <div class="type-toggle" role="group" aria-label="${T('סוג תנועה')}">
        <button type="button" data-t="expense">${T('הוצאה')}</button><button type="button" data-t="income">${T('הכנסה / החזר')}</button></div>
      <div class="amount-row field">
        <div data-f="amount"><label class="lbl" for="x-amt">${T('סכום')} *</label>
          <input id="x-amt" class="amount num" inputmode="decimal" autocomplete="off" placeholder="0" value="${existing ? e.amount : ''}"><p class="err"></p></div>
        <div><label class="lbl" for="x-cur">${T('מטבע')} *</label><select id="x-cur">${L.CURRENCIES.map(c => `<option ${c.code === e.currency ? 'selected' : ''}>${c.code}</option>`).join('')}</select></div>
      </div>
      <div class="rate-box hidden" id="x-rate" aria-live="polite"></div>
      <div class="field" data-f="category"><label class="lbl" for="x-cat">${T('קטגוריה')} *</label>
        <select id="x-cat"></select>
        <div class="newcat hidden" id="x-newcat">
          <input id="x-newcat-in" maxlength="40" autocomplete="off" enterkeyhint="done" placeholder="${T('שם הקטגוריה החדשה')}" aria-label="${T('שם הקטגוריה החדשה')}">
          <button type="button" class="btn primary sm" id="x-newcat-add">${T('להוסיף')}</button>
          <button type="button" class="x" id="x-newcat-x" title="${T('ביטול')}" aria-label="${T('ביטול')}">✕</button>
        </div><p class="err"></p></div>
      <div class="row2 field">
        <div data-f="date"><label class="lbl" for="x-date">${T('תאריך')} *</label><input id="x-date" type="date" value="${esc(e.date)}"><p class="err"></p></div>
        <div data-f="paidBy"><label class="lbl" for="x-who" id="x-who-lbl">${T('מי שילם')} *</label><select id="x-who">${t.participants.map(p => `<option ${p === e.paidBy ? 'selected' : ''}>${esc(p)}</option>`).join('')}
          ${existing && !t.participants.includes(e.paidBy) ? `<option selected>${esc(e.paidBy)}</option>` : ''}</select><p class="err"></p></div>
      </div>
      <div class="field" data-f="details"><label class="lbl" for="x-det">${T('פירוט')} *</label><input id="x-det" maxlength="120" placeholder="${T('למשל: כרטיסים לרכבל')}" value="${esc(e.details)}"><p class="err"></p></div>
      <div class="field"><label class="lbl" for="x-com">${T('הערה')}</label><input id="x-com" maxlength="200" placeholder="${T('אופציונלי')}" value="${esc(e.comment || '')}"></div>
      <div class="geo-box" id="x-geo" aria-live="polite"></div>
      <div class="field"><span class="lbl att-lbl">${CLIP_SVG}<span>${T('קבצים מצורפים')}</span><span class="num" id="x-att-n"></span></span><div class="photos" id="x-photos"></div>
        <div class="att-btns" id="x-att-btns"></div>
        <input type="file" id="x-cam" accept="image/*" capture="environment" hidden>
        <input type="file" id="x-gal" accept="image/*" multiple hidden>
        <input type="file" id="x-file" multiple hidden></div>
      <div class="${existing ? 'row2' : ''}" style="${existing ? 'grid-template-columns:auto 1fr 1fr' : 'display:grid;grid-template-columns:1fr 1fr;gap:var(--s3)'}">
        ${existing ? `<button type="button" class="btn danger" data-del title="${T('מחיקה')}">🗑️</button>` : ''}
        <button type="button" class="btn ghost" data-x>${T('ביטול')}</button><button class="btn primary" id="x-save">${T('שמירה')}</button>
      </div>
    </form>`, { sheet: true, label: existing ? T('עריכת תנועה') : T('הוספת תנועה') });
  const el = m.el;
  let kind = e.type;
  const amt = $('#x-amt', el), cur = $('#x-cur', el), box = $('#x-rate', el), cat = $('#x-cat', el);

  const drawType = () => {
    $$('[data-t]', el).forEach(b => b.setAttribute('aria-pressed', b.dataset.t === kind));
    $('#x-who-lbl', el).textContent = (kind === 'income' ? T('מי קיבל') : T('מי שילם')) + ' *';
  };
  $$('[data-t]', el).forEach(b => b.onclick = () => { kind = b.dataset.t; drawType(); });
  drawType();

  // ---- rate box
  const drawRate = () => {
    if (cur.value === t.defaultCurrency) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden', 'warn');
    if (r.loading) { box.textContent = '💱 ' + T('טוען שער יציג…'); return; }
    if (!(r.rate > 0)) {
      box.classList.add('warn');
      box.innerHTML = `⚠️ ${T('אין חיבור לשער חי ואין שער שמור. הזינו שער ידני:')} <span dir="ltr">1 ${esc(cur.value)} = <input id="x-man" inputmode="decimal" aria-label="${T('שער ידני')}"> ${esc(t.defaultCurrency)}</span>`;
      const man = $('#x-man', box);
      man.oninput = () => { r.rate = L.parseAmount(man.value); r.manual = true; r.keepBox = true; };
      man.onchange = drawRate;
      return;
    }
    const a = L.parseAmount(amt.value);
    const conv = a > 0 ? `<b class="money">≈ ${esc(L.formatMoney(L.convert(a, r.rate), t.defaultCurrency))}</b>` : '';
    const src = r.manual ? T('שער ידני') : r.source === 'saved' ? T('השער ששמור בתנועה') : r.source === 'cache' ? T('שער שמור מ-{d} (אין חיבור)', { d: formatDate(new Date(r.at).toISOString().slice(0, 10)) }) : T('שער יציג עדכני');
    box.innerHTML = `💱 <span class="money">1 ${cur.value} = ${r.rate.toFixed(4)} ${t.defaultCurrency}</span> · ${conv}
      <br><small>${src} · ${T('השער יישמר בתנועה ולא ישתנה בעתיד')} ·
      <button type="button" class="linkish" id="x-edit-rate" style="border:0;background:none;color:inherit;text-decoration:underline;padding:0">${T('שינוי ידני')}</button>
      ${r.source === 'saved' ? ` · <button type="button" id="x-refresh" style="border:0;background:none;color:inherit;text-decoration:underline;padding:0">${T('רענון לשער של היום')}</button>` : ''}</small>`;
    $('#x-edit-rate', box).onclick = () => {
      box.innerHTML = `💱 1 ${cur.value} = <input id="x-man" inputmode="decimal" value="${r.rate}" aria-label="${T('שער ידני')}"> ${t.defaultCurrency}`;
      const man = $('#x-man', box); man.focus(); man.select();
      man.oninput = () => { const v = L.parseAmount(man.value); if (v > 0) { r.rate = v; r.manual = true; } };
      man.onchange = drawRate; man.onblur = drawRate;
    };
    const refresh = $('#x-refresh', box);
    if (refresh) refresh.onclick = loadRate;
  };
  let rateCall = 0;
  async function loadRate() {
    const call = ++rateCall; // only the latest request may write the rate
    if (cur.value === t.defaultCurrency) { Object.assign(r, { rate: 1, source: 'live', manual: false, loading: false }); return drawRate(); }
    r.loading = true; drawRate();
    const want = cur.value;
    let res;
    try { res = await getRate(want, t.defaultCurrency); } catch { res = { rate: NaN }; }
    if (call !== rateCall) return; // a newer request (or a switch back) took over
    Object.assign(r, res, { manual: false, loading: false });
    drawRate();
  }
  cur.onchange = loadRate;
  amt.oninput = () => { if (!box.querySelector('input')) drawRate(); };
  if (!existing && cur.value !== t.defaultCurrency) loadRate(); else drawRate();

  // ---- category: a plain dropdown (the phone's own picker). First row adds a new category.
  const NEW_CAT = '__new_category__';
  const newBox = $('#x-newcat', el), newIn = $('#x-newcat-in', el);
  const extra = []; // categories added in this sheet; saved to the shared list on Save
  let chosen = e.category || '';
  const drawCats = () => {
    const all = [...new Set([...categories, ...extra, ...(chosen ? [chosen] : [])])];
    cat.innerHTML = `<option value="" disabled hidden>${T('בחרו קטגוריה')}</option>
      <option value="${NEW_CAT}">➕ ${T('להוסיף קטגוריה חדשה')}</option>`
      + all.map(c => `<option value="${esc(c)}">${L.categoryEmoji(c)} ${esc(T(c))}</option>`).join('');
    cat.value = newBox.classList.contains('hidden') ? chosen : NEW_CAT;
  };
  const closeNew = () => { newBox.classList.add('hidden'); newIn.value = ''; drawCats(); };
  const addNew = () => {
    const name = newIn.value.trim();
    if (!name) return newIn.focus();
    const same = [...categories, ...extra].find(c => c === name);
    if (!same) extra.push(name);
    chosen = name; closeNew();
    $('[data-f=category]', el).classList.remove('invalid'); $('[data-f=category] .err', el).textContent = '';
  };
  cat.onchange = () => {
    if (cat.value === NEW_CAT) { newBox.classList.remove('hidden'); newIn.focus(); return; }
    chosen = cat.value; newBox.classList.add('hidden'); newIn.value = '';
  };
  $('#x-newcat-add', el).onclick = addNew;
  $('#x-newcat-x', el).onclick = () => { closeNew(); cat.focus(); };
  newIn.onkeydown = ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); addNew(); }
    else if (ev.key === 'Escape') { ev.stopPropagation(); closeNew(); }
  };
  drawCats();
  const onCats = () => drawCats();
  catListeners.add(onCats);
  m.result.then(() => catListeners.delete(onCats));

  // ---- location: a new expense watches the GPS while the form is open; Save keeps the last fix
  let loc = existing?.location || null, locChanged = false, geo = existing ? 'saved' : 'wait', stopGeo = () => {};
  const geoBox = $('#x-geo', el);
  const startGeo = () => {
    stopGeo();
    stopGeo = watchLocation(u => {
      geo = u.state;
      if (u.loc) { loc = u.loc; locChanged = true; }
      drawGeo();
    });
  };
  const endGeo = state => { stopGeo(); stopGeo = () => {}; geo = state; drawGeo(); };
  const linkBtn = (id, text) => `<button type="button" class="linkish" id="${id}">${text}</button>`;
  function drawGeo() {
    const acc = loc ? L.formatAccuracy(loc.acc, [T('מ׳'), T('ק״מ')]) : '';
    let html;
    if (geo === 'wait') html = `<span class="pulse" aria-hidden="true"></span> 📍 ${T('מאתר מיקום…')} ${linkBtn('g-skip', T('בלי מיקום'))}`;
    else if (geo === 'fix') html = `<span class="pulse" aria-hidden="true"></span> 📍 ${T('מיקום נקלט')} <bdi class="num">${acc}</bdi> · ${T('מתעדכן עד השמירה')} ${linkBtn('g-skip', T('בלי מיקום'))}`;
    else if (geo === 'denied') html = `📍 ${T('אין הרשאה למיקום. אפשר לאשר בהגדרות הדפדפן')} ${linkBtn('g-start', T('נסו שוב'))}`;
    else if (loc) html = `📍 <a href="${esc(L.mapsUrl(loc))}" target="_blank" rel="noopener">${esc(!locChanged && existing?.address || T('מיקום במפה'))}</a> <bdi class="num">${acc}</bdi> ${linkBtn('g-start', T('עדכון'))} · ${linkBtn('g-del', T('הסרה'))}`;
    else html = `📍 ${T('ללא מיקום')} ${linkBtn('g-start', T('הוספת מיקום'))}`;
    geoBox.innerHTML = html;
    geoBox.classList.toggle('live', geo === 'wait' || geo === 'fix');
    const on = (id, fn) => { const b = $('#' + id, geoBox); if (b) b.onclick = fn; };
    on('g-start', startGeo);
    on('g-skip', () => { loc = existing?.location || null; locChanged = false; endGeo(existing ? 'saved' : 'off'); });
    on('g-del', () => { loc = null; locChanged = true; drawGeo(); });
  }
  if (existing) drawGeo(); else startGeo();
  m.result.then(() => stopGeo());

  // ---- attachments: photos (shrunk on the phone) and files (PDF, Word, anything up to 5 MB) – 5 in all (Step 27)
  const pics = [], removed = [], docs = [], removedFiles = [];
  let shrinking = 0, reading = 0;
  let unseen = existing?.photoIds?.length || 0; // saved photos not loaded (yet) still count toward the 5
  const used = () => pics.length + unseen + docs.length + shrinking + reading;
  const picsBox = $('#x-photos', el), attBtns = $('#x-att-btns', el);
  if (existing?.files?.length) docs.push(...existing.files.map(f => ({ ...f })));
  function drawPics() {
    picsBox.innerHTML = pics.map((p, i) => `<div class="thumb"><button type="button" class="open" data-open="${i}" aria-label="${T('הצגת תמונה {n}', { n: i + 1 })}"><img src="${L.isPhotoData(p.data) ? p.data : ''}" alt=""></button>
        <button type="button" class="x" data-rm="${i}" aria-label="${T('הסרת תמונה {n}', { n: i + 1 })}">✕</button></div>`).join('')
      + docs.map((f, i) => `<div class="doc-chip"><button type="button" class="open" data-fopen="${i}" title="${esc(f.name)}"><span class="ic" aria-hidden="true">${fileIcon(f)}</span>
          <span class="nm"><b dir="auto">${esc(f.name)}</b><small class="num">${L.fileSizeText(f.size)}</small></span></button>
          <button type="button" class="x" data-frm="${i}" aria-label="${T('הסרת {x}', { x: f.name })}">✕</button></div>`).join('')
      + (shrinking || reading ? `<div class="thumb busy">⏳</div>` : '');
    const n = used();
    $('#x-att-n', el).textContent = n ? `${n} / ${L.MAX_FILES}` : '';
    attBtns.innerHTML = n < L.MAX_FILES
      ? `<button type="button" class="btn ghost sm" data-cam>📷 ${T('צילום')}</button><button type="button" class="btn ghost sm" data-gal>🖼️ ${T('גלריה')}</button>`
        + `<button type="button" class="btn ghost sm" data-file>📄 ${T('קובץ')}</button><button type="button" class="btn ghost sm" data-paste>📋 ${T('הדבקה')}</button>`
      : `<p class="muted small">${T('אפשר עד {n} קבצים להוצאה. להוספה – הסירו קובץ.', { n: L.MAX_FILES })}</p>`;
    $$('[data-open]', picsBox).forEach(b => b.onclick = () => photoViewer(pics.map(p => p.data), +b.dataset.open));
    $$('[data-rm]', picsBox).forEach(b => b.onclick = () => { const [p] = pics.splice(+b.dataset.rm, 1); if (p.id) removed.push(p.id); drawPics(); });
    $$('[data-fopen]', picsBox).forEach(b => b.onclick = () => openFile(t.id, docs[+b.dataset.fopen]));
    $$('[data-frm]', picsBox).forEach(b => b.onclick = () => { const [f] = docs.splice(+b.dataset.frm, 1); if (f.id) removedFiles.push(f); drawPics(); });
    const on = (sel, fn) => { const b = $(sel, attBtns); if (b) b.onclick = fn; };
    on('[data-cam]', () => $('#x-cam', el).click());
    on('[data-gal]', () => $('#x-gal', el).click());
    on('[data-file]', () => $('#x-file', el).click());
    on('[data-paste]', async () => {
      try { const files = await clipboardImages(); if (files.length) return addAny(files); } catch {}
      toast(T('אין תמונה בלוח. העתיקו צילום מסך ונסו שוב'));
    });
  }
  // Any file: a picture is shrunk to a photo; anything else is kept as it is (5 MB at most, checked right here).
  async function addAny(list) {
    for (const f of [...list]) {
      const fk = L.fileKind(f.name, f.type);
      const problem = L.attachProblem(used(), fk === 'photo' ? 0 : f.size);
      if (problem === 'full') { toast(T('אפשר עד {n} קבצים להוצאה', { n: L.MAX_FILES }), 'bad'); break; }
      if (problem === 'big') { toast('⚠️ ' + T('{x} גדול מדי ({s}). אפשר לצרף קבצים עד 5MB.', { x: f.name, s: L.fileSizeText(f.size) }), 'bad'); continue; }
      if (fk === 'photo') {
        shrinking++; drawPics();
        try { pics.push({ data: await shrinkImage(f) }); } catch { toast(T('לא הצלחתי לקרוא את התמונה'), 'bad'); }
        shrinking--;
      } else {
        reading++; drawPics();
        try { docs.push({ name: f.name || T('קובץ'), type: f.type || '', size: f.size, data: await readB64(f) }); } catch { toast(T('לא הצלחתי לקרוא את הקובץ'), 'bad'); }
        reading--;
      }
      if (el.isConnected) drawPics();
    }
  }
  for (const id of ['#x-cam', '#x-gal', '#x-file']) $(id, el).onchange = ev => { addAny(ev.target.files); ev.target.value = ''; };
  // Ctrl+V / paste anywhere in the sheet: a copied screenshot or file becomes an attachment (text pastes as usual)
  el.addEventListener('paste', ev => {
    const files = [...(ev.clipboardData?.files || [])];
    if (!files.length || ev.clipboardData.types.includes('text/plain')) return; // copied text (even with a picture) pastes as text
    ev.preventDefault(); addAny(files);
  });
  drawPics();
  if (existing?.photoIds?.length) store.getPhotos(t.id, existing.id).then(list => {
    const saved = list.filter(p => existing.photoIds.includes(p.id) && !removed.includes(p.id) && L.isPhotoData(p.data));
    pics.unshift(...saved.map(p => ({ id: p.id, data: p.data })));
    unseen = Math.max(0, existing.photoIds.length - saved.length - removed.length);
    if (el.isConnected) drawPics();
  }).catch(reportError);

  // ---- receipt scan (new expense only): read the photo on the phone, fill the form, the user checks and saves
  const scanBtn = $('#x-scan', el);
  if (scanBtn) {
    const stBox = $('#x-scan-st', el), menu = $('#x-scan-menu', el);
    const mark = f => { f.classList.add('ocr'); f.addEventListener('input', () => f.classList.remove('ocr'), { once: true }); f.addEventListener('change', () => f.classList.remove('ocr'), { once: true }); };
    const status = (pct, text) => {
      stBox.classList.remove('hidden', 'done');
      stBox.innerHTML = `${esc(text)}<div class="prog"><i style="width:${Math.round(pct * 100)}%"></i></div>`;
    };
    // tap the bar → small menu: camera now (opens the camera directly) or a photo from the gallery
    const showMenu = on => { menu.classList.toggle('hidden', !on); scanBtn.setAttribute('aria-expanded', on); };
    scanBtn.onclick = () => showMenu(menu.classList.contains('hidden'));
    $$('[data-scan]', menu).forEach(b => b.onclick = () => { showMenu(false); $(b.dataset.scan === 'cam' ? '#x-scan-cam' : '#x-scan-gal', el).click(); });
    const onScan = async ev => {
      const input = ev.target, file = input.files[0]; input.value = '';
      if (!file) return;
      scanBtn.disabled = true;
      const before = { amt: amt.value, cur: cur.value, date: $('#x-date', el).value }; // fields the user changes while it reads stay theirs
      // the receipt photo is kept with the expense
      if (used() < L.MAX_FILES) addAny([file]);
      let read = null;
      try { read = await readReceipt(file, status); }
      catch (err) {
        console.error(err);
        stBox.classList.add('done');
        stBox.textContent = '⚠️ ' + (navigator.onLine ? T('לא הצלחתי לקרוא את הקבלה. אפשר למלא ידנית.') : T('בפעם הראשונה צריך חיבור כדי להוריד את קבצי הזיהוי. אפשר למלא ידנית.'));
        scanBtn.disabled = false; return;
      }
      scanBtn.disabled = false;
      if (!el.isConnected) return; // sheet closed meanwhile
      // Hebrew lines split amounts ("84.90" → "90 84"); the word boxes put them back together (Step 26)
      const tokens = L.receiptTokens(read.words);
      const got = L.parseReceipt(tokens.length ? L.receiptText(tokens) : read.text, { currency: cur.value, categories });
      const scan = tokens.length ? { tokens, image: read.image, w: read.w, h: read.h, picks: L.receiptPicks(tokens, got) } : null;
      const filled = [];
      const amtFree = amt.value === before.amt, curFree = cur.value === before.cur;
      if (got.amount > 0 && amtFree) { amt.value = got.amount.toFixed(2); mark(amt); filled.push(T('סכום')); }
      if (got.amount > 0 && amtFree && curFree && got.currency !== cur.value && L.CURRENCIES.some(c => c.code === got.currency)) { cur.value = got.currency; mark(cur); loadRate(); filled.push(T('מטבע')); }
      else drawRate();
      if (got.date && $('#x-date', el).value === before.date) { $('#x-date', el).value = got.date; mark($('#x-date', el)); filled.push(T('תאריך')); }
      if (got.details && !$('#x-det', el).value.trim()) { $('#x-det', el).value = got.details; mark($('#x-det', el)); filled.push(T('פירוט')); }
      let scanCat = '';
      if (got.category && !chosen) { chosen = scanCat = got.category; drawCats(); mark(cat); filled.push(T('קטגוריה')); }
      stBox.classList.remove('hidden'); stBox.classList.add('done');
      stBox.innerHTML = `<span>${esc(filled.length ? '🟨 ' + T('מולא מהקבלה: {x} – בדקו את השדות המסומנים ושמרו', { x: filled.join(', ') }) : '⚠️ ' + T('לא נמצא סכום בקבלה. אפשר לצלם שוב (ישר ובאור טוב) או למלא ידנית.'))}</span>`
        + (scan ? `<button type="button" class="scan-check" id="x-scan-check">🔍 ${T('בדיקה על הקבלה')}</button>` : '');
      // check screen: the fixes go into the form
      if (scan) $('#x-scan-check', el).onclick = async () => {
        const res = await receiptCheck(scan);
        if (!res || !el.isConnected) return;
        scan.picks = res.picks;
        const val = f => L.wordValue(f, res.picks[f].map(i => scan.tokens[i].text));
        if (res.changed.has('amount') && val('amount')) { amt.value = val('amount').toFixed(2); mark(amt); drawRate(); }
        if (res.changed.has('date') && val('date')) { $('#x-date', el).value = val('date'); mark($('#x-date', el)); }
        if (res.changed.has('place')) {
          const place = val('place');
          if (place) { $('#x-det', el).value = place; mark($('#x-det', el)); } // all words removed: keep what was there
          if (!chosen || chosen === scanCat) { // the category came from the scan: pick it again from the new place
            const c = L.parseReceipt(place, { categories }).category;
            if (c && c !== chosen) { chosen = scanCat = c; drawCats(); mark(cat); }
          }
        }
      };
    };
    $('#x-scan-cam', el).onchange = onScan;
    $('#x-scan-gal', el).onchange = onScan;
  }

  // ---- save / delete
  $('[data-x]', el).onclick = () => m.close();
  const del = $('[data-del]', el);
  if (del) del.onclick = () => { m.close(); st.del(existing); };
  $('form', el).onsubmit = async ev => {
    ev.preventDefault();
    if (r.loading) return toast(T('רגע, טוען שער…'));
    if (shrinking || reading) return toast(T('רגע, מעבד תמונה…'));
    const hasFiles = pics.length + unseen + docs.length > 0;
    let amount = L.parseAmount(amt.value);
    if (hasFiles && !amt.value.trim()) amount = 0; // a file without a cost (passport copy, visa – owner Step 27)
    const rate = cur.value === t.defaultCurrency ? 1 : r.rate;
    const amt2 = amount > 0 ? L.round2(amount) : amount;
    const x = {
      type: kind, amount: amt2, currency: cur.value,
      exchangeRateToTripDefault: rate, convertedAmount: amt2 > 0 && rate > 0 ? L.convert(amt2, rate) : 0,
      category: newBox.classList.contains('hidden') ? chosen.trim() : newIn.value.trim(), // open but empty -> "choose a category" error
      date: $('#x-date', el).value, details: $('#x-det', el).value.trim(),
      comment: $('#x-com', el).value.trim(), paidBy: $('#x-who', el).value,
      location: loc
    };
    if (locChanged || !loc) x.address = ''; // filled in from the new point by fillAddresses
    const errors = L.validateExpense(x, { hasFiles });
    $$('[data-f]', el).forEach(f => { const er = errors[f.dataset.f]; f.classList.toggle('invalid', !!er); $('.err', f).textContent = er ? T(er) : ''; });
    if (errors.rate) { toast(T('חסר שער המרה. הזינו שער ידני'), 'bad'); return; }
    const bad = $('.invalid input, .invalid select', el);
    if (bad) { bad.focus(); return; }
    if (x.amount === 0 && !(await confirmBox(T('לא הוזן סכום'), T('הרשומה תישמר בלי עלות ולא תשנה את המאזן. לשמור בכל זאת?'), { ok: T('שמירה') }))) { amt.focus(); return; }
    if (!el.isConnected) return;
    if (!categories.includes(x.category) && x.category !== L.UNCATEGORIZED) fire(store.addCategory(x.category));
    const eid = existing?.id || store.newExpenseId(t.id);
    const addPhotos = pics.filter(p => !p.id).map(p => ({ id: store.newPhotoId(t.id), data: p.data }));
    x.photoIds = L.nextPhotoIds(existing?.photoIds, removed, addPhotos.map(p => p.id));
    const addFiles = docs.filter(f => !f.id).map(f => ({ id: store.newFileId(t.id), name: f.name, type: f.type, size: f.size, data: f.data }));
    x.files = [...docs.filter(f => f.id).map(({ id, name, type, size, parts }) => ({ id, name, type, size, parts })),
      ...addFiles.map(f => ({ id: f.id, name: f.name, type: f.type, size: f.size, parts: L.splitParts(f.data).length }))];
    dropCached(t.id, removedFiles);
    fire(store.saveExpense(t.id, eid, x, !existing, { addPhotos, removePhotos: removed, addFiles, removeFiles: removedFiles }));
    m.close(); toast(existing ? T('עודכן') : T('נשמר') + ' ✓', 'good');
  };
  if (!existing) setTimeout(() => amt.focus(), 80);
}

// ---------------------------------------------------------------- attachments (Step 27)
// A plain paper clip (own drawing: the 📎 emoji is drawn as "Clippy" on Windows – owner).
const CLIP_SVG = '<svg class="clip" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const FILE_CACHE = 'tt-files'; // opened files, kept on the phone (sw.js leaves this cache alone)
const fileKey = (tid, fid) => location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '') + `tt-file/${tid}/${fid}`;
// A small file-type label (PDF / DOC / XLS / TXT / ZIP…) instead of emoji that look like books.
function fileIcon(f) {
  const b = L.fileBadge(f.name, f.type);
  return `<span class="ft ft-${['PDF', 'DOC', 'XLS', 'TXT'].includes(b) ? b.toLowerCase() : 'other'}">${esc(b)}</span>`;
}
const b64ToBlob = (b64, type) => {
  const bin = atob(b64), a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type: type || 'application/octet-stream' });
};
const readB64 = file => new Promise((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => bad(r.error);
  r.readAsDataURL(file);
});
async function cachedFileIds(tid) {
  try {
    const pre = fileKey(tid, ''), keys = await (await caches.open(FILE_CACHE)).keys();
    return new Set(keys.map(k => k.url).filter(u => u.startsWith(pre)).map(u => u.slice(pre.length)));
  } catch { return new Set(); }
}
// Opens an attached file: f = { id, name, type, size, parts } (saved) or { name, type, data } (not saved yet).
// The first open downloads it and keeps it on the phone, so after that it opens offline (owner 6A).
// PDF / text / pictures open in a new tab; Word, Excel and the rest are handed to the phone (download → its app).
async function openFile(tid, f) {
  const safe = L.openType(f.name, f.type); // never the stored type: it comes from the shared database
  const win = safe ? window.open('', '_blank') : null; // opened now, while the tap still counts (popup blockers)
  try {
    let blob = null;
    if (f.data) blob = b64ToBlob(f.data);
    else {
      const key = fileKey(tid, f.id);
      let c = null;
      try { c = await caches.open(FILE_CACHE); const hit = await c.match(key); if (hit) blob = await hit.blob(); } catch {}
      if (!blob) {
        toast(T('מוריד את הקובץ…'));
        blob = b64ToBlob(await store.getFileData(tid, f));
        try { await c?.put(key, new Response(blob, { headers: { 'content-type': 'application/octet-stream' } })); } catch {}
      }
    }
    blob = new Blob([blob], { type: safe || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = f.name || 'file'; document.body.append(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60000); // a big PDF may take a while to load in its tab
    return true;
  } catch (err) {
    win?.close();
    console.error(err);
    toast(navigator.onLine ? T('לא הצלחתי לפתוח את הקובץ') : T('הקובץ עוד לא שמור בטלפון. צריך חיבור כדי להוריד אותו פעם אחת'), 'bad');
    return false;
  }
}
// Opened copies of deleted files leave the phone too.
async function dropCached(tid, files) {
  if (!files?.length) return;
  try { const c = await caches.open(FILE_CACHE); await Promise.all(files.map(f => c.delete(fileKey(tid, f.id)))); } catch {}
}
// Pictures on the clipboard (a screenshot), for the 📋 button.
async function clipboardImages() {
  if (!navigator.clipboard?.read) return [];
  const out = [];
  for (const it of await navigator.clipboard.read()) {
    const ty = it.types.find(x => x.startsWith('image/'));
    if (ty) out.push(new File([await it.getType(ty)], `screenshot-${Date.now()}.${ty.split('/')[1]}`, { type: ty }));
  }
  return out;
}

// All the trip's attachments (🧷 in the header): tabs Photos / Documents / Other, grouped by expense, each can open its expense.
const ATT_TABS = [['photo', N('תמונות')], ['doc', N('מסמכים')], ['other', N('אחר')]];
function attachmentsScreen(st) {
  const tid = st.trip.id;
  const all = L.tripAttachments(st.expenses);
  const count = k => all[k].reduce((n, g) => n + g.items.length, 0);
  let tab = ATT_TABS.find(([k]) => count(k))?.[0] || 'photo';
  let photos = null, cached = new Set();
  const m = modal(`<div class="att-top"><button type="button" class="icon-btn" data-x aria-label="${T('סגירה')}">✕</button><h2>🧷 ${T('קבצים מצורפים')}</h2></div>
    <div class="att-tabs" role="tablist">${ATT_TABS.map(([k, he]) => `<button type="button" role="tab" data-tab="${k}">${T(he)} <span class="num">(${count(k)})</span></button>`).join('')}</div>
    <div class="att-body" id="att-body"></div>`, { label: T('קבצים מצורפים') });
  m.el.classList.add('att-dialog');
  const body = $('#att-body', m.el);
  const head = e => `<bdi>${esc(formatDate(e.date, {}))}</bdi> · ${esc(e.details)}`;
  const go = id => { const ex = st.expenses.find(x => x.id === id); m.close(); if (ex) expenseSheet(st, ex); };
  const draw = async () => {
    $$('[data-tab]', m.el).forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
    const groups = all[tab];
    if (!groups.length) { body.innerHTML = `<p class="muted center att-empty">${T('אין כאן קבצים עדיין')}</p>`; return; }
    if (tab === 'photo') {
      if (!photos) {
        body.innerHTML = '<p class="muted center att-empty">⏳</p>';
        const list = await store.getAllPhotos(tid).catch(err => (reportError(err), []));
        photos = new Map(list.filter(p => L.isPhotoData(p.data)).map(p => [p.id, p.data]));
        if (tab !== 'photo' || !m.el.isConnected) return;
      }
      body.innerHTML = groups.map(g => `<button type="button" class="att-head" data-go="${esc(g.expense.id)}">${head(g.expense)} <span aria-hidden="true">${fwdArrow()}</span></button>
        <div class="att-grid">${g.items.map(it => photos.has(it.id)
          ? `<button type="button" class="att-ph" data-ph="${esc(g.expense.id)}" data-pid="${esc(it.id)}" aria-label="${T('תמונות')}"><img src="${photos.get(it.id)}" alt=""></button>`
          : `<div class="att-ph missing" title="${T('התמונות עדיין לא סונכרנו למכשיר הזה')}">⏳</div>`).join('')}</div>`).join('');
      $$('[data-ph]', body).forEach(b => b.onclick = () => {
        const list = groups.find(x => x.expense.id === b.dataset.ph).items.filter(it => photos.has(it.id));
        photoViewer(list.map(it => photos.get(it.id)), list.findIndex(it => it.id === b.dataset.pid), { onGo: () => go(b.dataset.ph) });
      });
    } else {
      body.innerHTML = groups.map(g => g.items.map(f => `<div class="att-row">
          <button type="button" class="att-open" data-fid="${esc(f.id)}" data-eid="${esc(g.expense.id)}"><span class="ic" aria-hidden="true">${fileIcon(f)}</span>
            <span class="t"><b dir="auto">${esc(f.name)}</b><small>${head(g.expense)} · <span class="num">${L.fileSizeText(f.size)}</span></small>
            ${cached.has(f.id) ? `<small class="saved">✓ ${T('שמור בטלפון')}</small>` : ''}</span></button>
          <button type="button" class="go" data-go="${esc(g.expense.id)}">${T('להוצאה')}</button></div>`).join('')).join('');
      $$('[data-fid]', body).forEach(b => b.onclick = async () => {
        const f = groups.find(x => x.expense.id === b.dataset.eid).items.find(x => x.id === b.dataset.fid);
        if (await openFile(tid, f) && !cached.has(f.id)) { cached = await cachedFileIds(tid); if (m.el.isConnected) draw(); }
      });
    }
    $$('[data-go]', body).forEach(b => b.onclick = () => go(b.dataset.go));
  };
  $$('[data-tab]', m.el).forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
  $('[data-x]', m.el).onclick = () => m.close();
  cachedFileIds(tid).then(s => { cached = s; if (tab !== 'photo' && m.el.isConnected) draw(); });
  draw();
  $('[data-x]', m.el).focus();
}

// ---------------------------------------------------------------- receipt check (Step 26)
// The receipt with the words the OCR found. Each field has its own colour; tap a field, then the right word.
// With no field chosen, a tapped word goes to the field it looks like (a date, a number, else the place).
// Resolves { picks, changed } on "סיום", undefined when closed.
const RC_FIELDS = [['amount', N('סכום')], ['date', N('תאריך')], ['place', N('מקום')]];
function receiptCheck(scan) {
  const { tokens, w, h } = scan;
  let picks = scan.picks, field = '', fresh = false;
  const changed = new Set();
  const pct = v => (v * 100).toFixed(3) + '%';
  const m = modal(`<div class="rc-top"><button type="button" class="icon-btn" data-x aria-label="${T('סגירה')}">✕</button>
      <h2>${T('בדיקה על הקבלה')}</h2>
      <button type="button" class="icon-btn" data-zoom aria-pressed="false" aria-label="${T('הגדלה')}">🔍</button></div>
    <div class="rc-photo"><div class="rc-img"><img alt="${T('הקבלה')}" src="${scan.image}">
      ${tokens.map((tk, i) => `<button type="button" class="rc-w" data-i="${i}" aria-label="${esc(tk.text)}" style="left:${pct(tk.b[0] / w)};top:${pct(tk.b[1] / h)};width:${pct((tk.b[2] - tk.b[0]) / w)};height:${pct((tk.b[3] - tk.b[1]) / h)}"></button>`).join('')}
    </div></div>
    <div class="rc-panel"><p class="rc-hint" aria-live="polite"></p>
      <div class="rc-chips">${RC_FIELDS.map(([f, he]) => `<button type="button" class="rc-chip ${f}" data-f="${f}" aria-pressed="false"><small><i></i>${T(he)}</small><b></b></button>`).join('')}</div>
      <button type="button" class="btn primary" data-ok>${T('סיום')}</button></div>`, { label: T('בדיקה על הקבלה') });
  m.el.classList.add('rc-dialog');
  const texts = f => picks[f].map(i => tokens[i].text);
  const shown = f => {
    const v = L.wordValue(f, texts(f));
    if (f === 'amount') return v ? v.toFixed(2) : '—';
    if (f === 'date') return v ? formatDate(v, { year: true }) : '—';
    return v || '—';
  };
  const draw = () => {
    $$('.rc-w', m.el).forEach(b => {
      const i = +b.dataset.i;
      const on = RC_FIELDS.find(([f]) => picks[f].includes(i));
      for (const [f] of RC_FIELDS) b.classList.toggle(f, picks[f].includes(i));
      b.setAttribute('aria-pressed', !!on); b.title = on ? T(on[1]) : ''; // not by colour only
    });
    $$('.rc-chip', m.el).forEach(c => {
      const f = c.dataset.f;
      $('b', c).textContent = shown(f);
      c.classList.toggle('on', f === field); c.setAttribute('aria-pressed', f === field);
      c.classList.toggle('chg', changed.has(f));
    });
    const name = field && T(RC_FIELDS.find(x => x[0] === field)[1]);
    $('.rc-hint', m.el).textContent = !field ? T('הקישו על שדה ואז על המילה הנכונה בקבלה')
      : field === 'place' ? T('{x}: הקישו על מילים לפי הסדר · הקשה שוב מסירה', { x: name }) : T('{x}: הקישו על המילה הנכונה', { x: name });
  };
  $$('.rc-chip', m.el).forEach(c => c.onclick = () => { field = c.dataset.f; fresh = true; draw(); });
  let lastAuto = '';
  const onWord = i => {
    const text = tokens[i].text;
    let f = field;
    if (!f) { // no field chosen: the word goes where it fits; place words in a row add up
      f = L.wordValue('date', [text]) ? 'date' : L.wordValue('amount', [text]) && !/\p{L}/u.test(text) ? 'amount' : 'place';
      fresh = !(f === 'place' && lastAuto === 'place'); lastAuto = f;
    }
    if (f === 'amount' && !L.wordValue('amount', [text])) return toast(T('זה לא סכום – הקישו על מספר'));
    if (f === 'date' && !L.wordValue('date', [text])) return toast(T('זה לא תאריך – הקישו על תאריך'));
    picks = L.tapWord(picks, f, i, fresh);
    fresh = false; changed.add(f);
    draw();
  };
  // a tap on a word, or next to one (words are small on a phone): the nearest word within 24 px
  $('.rc-img', m.el).onclick = e => {
    const hit = e.target.closest('.rc-w');
    if (hit) return onWord(+hit.dataset.i);
    let best = -1, bd = 24;
    $$('.rc-w', m.el).forEach(b => {
      const r = b.getBoundingClientRect();
      const d = Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom));
      if (d < bd) { bd = d; best = +b.dataset.i; }
    });
    if (best >= 0) onWord(best);
  };
  $('[data-zoom]', m.el).onclick = e => { const on = $('.rc-img', m.el).classList.toggle('zoom'); e.currentTarget.setAttribute('aria-pressed', on); };
  $('[data-x]', m.el).onclick = () => m.close();
  $('[data-ok]', m.el).onclick = () => m.close({ picks, changed });
  draw();
  $('[data-x]', m.el).focus();
  return m.result;
}

// ---------------------------------------------------------------- admin
// Full-screen photo viewer with previous / next.
function photoViewer(list, start, { onGo } = {}) {
  let i = start;
  const m = modal(`<div class="viewer"><img alt=""><div class="vbar">
      <button type="button" class="btn ghost sm" data-p aria-label="${T('הקודמת')}">${backArrow()}</button>
      <span class="num" aria-live="polite"></span>
      <button type="button" class="btn ghost sm" data-n aria-label="${T('הבאה')}">${fwdArrow()}</button>
      ${onGo ? `<button type="button" class="btn ghost sm" data-go>${T('להוצאה')}</button>` : ''}
      <button type="button" class="btn primary sm" data-x>${T('סגירה')}</button></div></div>`, { label: T('תמונות') });
  m.el.classList.add('photo-dialog');
  const draw = () => {
    $('img', m.el).src = list[i];
    $('.vbar .num', m.el).textContent = `${i + 1} / ${list.length}`;
    $('[data-p]', m.el).disabled = i === 0; $('[data-n]', m.el).disabled = i === list.length - 1;
  };
  $('[data-p]', m.el).onclick = () => { if (i > 0) { i--; draw(); } };
  $('[data-n]', m.el).onclick = () => { if (i < list.length - 1) { i++; draw(); } };
  $('[data-x]', m.el).onclick = () => m.close();
  if (onGo) $('[data-go]', m.el).onclick = () => { m.close(); onGo(); };
  draw();
}

function adminPage() {
  holdHebrew(true); // owner: the admin panel stays Hebrew (dialogs too); route() lets go again
  view.innerHTML = `
    <header class="topbar"><a class="icon-btn" href="#/" title="חזרה" aria-label="חזרה">→</a><h1>⚙️ ניהול</h1>
      <button class="icon-btn" id="logout" title="יציאה מהניהול" aria-label="יציאה מהניהול">🚪</button></header>
    <div class="wrap">
      <div class="card" id="a-trash-card" hidden><h2>🗑️ טיולים שנמחקו</h2><div id="a-trash"></div>
        <p class="muted">אחרי ${L.TRASH_DAYS} יום הטיול נמחק לצמיתות.</p></div>
      <div class="card"><h2>🔑 שינוי סיסמת טיול</h2>
        <div class="field"><label class="lbl" for="a-trip">טיול</label><select id="a-trip"></select></div>
        <form class="row2" id="a-pin-form" novalidate><input id="a-pin" class="num" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="4 ספרות חדשות" style="text-align:center;letter-spacing:6px" aria-label="סיסמה חדשה">
          <button class="btn primary">שמירת סיסמה</button></form></div>
      <div class="card"><h2 id="a-cat-title">🏷️ קטגוריות</h2>
        <form class="row2 field" style="grid-template-columns:1fr auto" id="a-add" novalidate><input id="a-new" maxlength="40" placeholder="קטגוריה חדשה" aria-label="קטגוריה חדשה"><button class="btn primary">הוספה</button></form>
        <div id="a-cats"></div>
        <p class="muted">שינוי שם מעדכן את כל התנועות בכל הטיולים. מחיקה מעבירה אותן ל"${L.UNCATEGORIZED}".</p></div>
    </div>`;
  $('#logout').onclick = () => { sessionStorage.removeItem('tt-admin'); go('#/'); };
  $('#a-trash').onclick = async ev => {
    const r = ev.target.closest('[data-restore]'), p = ev.target.closest('[data-purge]');
    if (r) { fire(store.updateTrip(r.dataset.restore, { deletedAt: null })); toast('הטיול שוחזר', 'good'); }
    const t = p && gone.find(x => x.id === p.dataset.purge);
    if (t && await confirmBox('מחיקה לצמיתות', `למחוק לצמיתות את "${t.name}" וכל התנועות שלו? אי אפשר לבטל.`, { ok: 'מחיקה לצמיתות', danger: true }))
      fire(store.deleteTrip(t.id)).then(() => toast('נמחק לצמיתות'));
  };

  let gone = [];
  cleanups.push(store.onTrips(all => {
    purgeExpired(all);
    const now = Date.now(), trips = all.filter(t => !L.isDeleted(t));
    gone = all.filter(t => L.isDeleted(t) && !L.trashExpired(t, now)).sort((a, b) => b.deletedAt - a.deletedAt);
    $('#a-trash-card').hidden = !gone.length;
    $('#a-trash').innerHTML = gone.map(t => {
      const n = L.trashDaysLeft(t, now), when = new Date(t.deletedAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
      return `<div class="trash-row"><span class="t"><b>${esc(t.name)}</b><br><span class="muted">נמחק ${esc(when)} · ${n > 1 ? `עוד ${n} ימים` : 'יימחק מחר'}</span></span>
        <button class="btn ghost sm" data-restore="${esc(t.id)}">↩ שחזור</button>
        <button class="mini del" data-purge="${esc(t.id)}" title="מחיקה לצמיתות" aria-label="מחיקה לצמיתות של ${esc(t.name)}">✕</button></div>`;
    }).join('');
    const sel = $('#a-trip'), keep = sel.value;
    trips.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    sel.innerHTML = trips.length ? trips.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('') : '<option value="">אין טיולים</option>';
    if (keep) sel.value = keep;
  }, reportError));
  const pin = $('#a-pin');
  pin.oninput = () => pin.value = pin.value.replace(/\D/g, '').slice(0, 4);
  $('#a-pin-form').onsubmit = async e => {
    e.preventDefault();
    const id = $('#a-trip').value;
    if (!id) return;
    if (!L.isPin4(pin.value)) return toast('הסיסמה חייבת להיות 4 ספרות', 'bad');
    fire(store.updateTrip(id, { pinHash: await hashPin(id, pin.value) }));
    localStorage.removeItem(ACCESS_KEY(id)); // other devices keep their 3-day access until it expires
    pin.value = ''; toast('הסיסמה עודכנה', 'good');
  };

  const host = $('#a-cats');
  const draw = () => {
    $('#a-cat-title').textContent = `🏷️ קטגוריות (${categories.length})`;
    host.innerHTML = categories.map((c, i) => `<div class="cat-row" data-i="${i}">
      <span class="name">${L.categoryEmoji(c)} ${esc(c)}</span>
      <button class="mini" data-ren title="שינוי שם" aria-label="שינוי שם ${esc(c)}">✏️</button>
      <button class="mini del" data-rm title="מחיקה" aria-label="מחיקת ${esc(c)}">🗑️</button></div>`).join('');
    $$('.cat-row', host).forEach(row => {
      const name = categories[+row.dataset.i];
      $('[data-rm]', row).onclick = async () => {
        if (!await confirmBox('מחיקת קטגוריה', `למחוק את "${name}"? תנועות קיימות יעברו ל"${L.UNCATEGORIZED}".`, { ok: 'מחיקה', danger: true })) return;
        await fire(store.setCategories(categories.filter(c => c !== name)));
        const n = await store.recategorizeAll(name, L.UNCATEGORIZED).catch(reportError);
        toast(`נמחקה${n ? ` · ${n} תנועות עודכנו` : ''}`, 'good');
      };
      $('[data-ren]', row).onclick = () => {
        row.innerHTML = `<form style="display:flex;gap:8px;flex:1" novalidate><input value="${esc(name)}" maxlength="40" aria-label="שם חדש">
          <button class="btn primary sm">שמירה</button><button type="button" class="btn ghost sm" data-c>ביטול</button></form>`;
        const inp = $('input', row); inp.focus(); inp.select();
        $('[data-c]', row).onclick = draw;
        $('form', row).onsubmit = async e => {
          e.preventDefault();
          const nn = inp.value.trim();
          if (!nn || nn === name) return draw();
          if (categories.includes(nn)) return toast('כבר קיימת קטגוריה בשם הזה', 'bad');
          await fire(store.setCategories(categories.map(c => c === name ? nn : c)));
          const n = await store.recategorizeAll(name, nn).catch(reportError);
          toast(`השם עודכן${n ? ` · ${n} תנועות עודכנו` : ''}`, 'good');
        };
      };
    });
  };
  draw();
  catListeners.add(draw);
  cleanups.push(() => catListeners.delete(draw));
  $('#a-add').onsubmit = e => {
    e.preventDefault();
    const v = $('#a-new').value.trim();
    if (!v) return;
    if (categories.includes(v)) return toast('הקטגוריה כבר קיימת', 'bad');
    fire(store.addCategory(v));
    $('#a-new').value = ''; toast('נוספה', 'good');
  };
}

// ---------------------------------------------------------------- print / PDF
function printReport(st) {
  const t = st.trip, f = v => L.formatMoney(v, t.defaultCurrency);
  const s = L.summarize(t, st.expenses, todayIso());
  const cats = L.byCategory(st.expenses);
  const bal = L.balances(t.participants, st.expenses);
  const groups = L.cleanGroups(t.groups, t.participants);
  const tr = L.settleTransfers(L.groupBalances(bal, groups));
  const rows = L.sortTransactions(st.expenses).reverse();
  const n = v => `<td class="n">${esc(v)}</td>`;
  $('#print').innerHTML = `
    <h1>${esc(t.name)}</h1>
    <div>📍 ${esc(t.location)} · ${esc(dateRange(t.startDate, t.endDate))} · ${T('מטבע:')} ${esc(t.defaultCurrency)}</div>
    <div>${T('משתתפים:')} ${t.participants.map(esc).join(', ')}</div>
    ${groups.length ? `<div>${T('קבוצות:')} ${groups.map(g => `${esc(g.name)} (${g.members.map(esc).join(', ')})`).join(' · ')}</div>` : ''}
    <h2>${T('סיכום')}</h2>
    <div class="kpis">
      <div>${T('סה"כ הוצאות')}<b class="n">${esc(f(s.totalExpenses))}</b></div><div>${T('הכנסות / החזרים')}<b class="n">${esc(f(s.totalIncome))}</b></div>
      <div>${T('מאזן נטו')}<b class="n">${esc(f(s.net))}</b></div><div>${T('ממוצע ליום')} (${s.days})<b class="n">${esc(f(s.perDay))}</b></div>
      <div>${T('ממוצע לאדם')}<b class="n">${esc(f(s.perPerson))}</b></div>
      ${(b => b ? `<div>${T('תקציב ({p}% נוצל)', { p: Math.round(b.pct * 100) })}<b class="n">${esc(f(b.total))}</b></div><div>${b.left < 0 ? T('מעל התקציב') : T('נשאר בתקציב')}<b class="n">${esc(f(Math.abs(b.left)))}</b></div>` : '')(L.budgetSummary(t, st.expenses, todayIso()))}</div>
    <h2>${T('לפי קטגוריות')}</h2>
    <table><thead><tr><th>${T('קטגוריה')}</th><th>${T('תנועות')}</th><th>${T('סכום')}</th><th>%</th></tr></thead><tbody>
      ${cats.map(c => `<tr><td>${esc(T(c.name))}</td>${n(c.count)}${n(f(c.value))}${n(s.totalExpenses ? Math.round(c.value / s.totalExpenses * 100) + '%' : '')}</tr>`).join('')}</tbody></table>
    <h2>${T('התחשבנות')}</h2>
    <table><thead><tr><th>${T('משתתף')}</th><th>${T('שילם')}</th><th>${T('קיבל החזר')}</th><th>${T('חלקו')}</th><th>${T('יתרה')}</th></tr></thead><tbody>
      ${bal.map(b => `<tr><td>${esc(b.name)}</td>${n(f(b.paid))}${n(f(b.received))}${n(f(b.share))}${n(f(b.balance))}</tr>`).join('')}</tbody></table>
    ${tr.length ? `<p>${tr.map(x => `${esc(x.from)} ${fwdArrow()} ${esc(x.to)} <bdi>${esc(f(x.amount))}</bdi>`).join(' · ')}</p>` : `<p>${T('כולם מאוזנים.')}</p>`}
    <h2>${T('כל התנועות ({n})', { n: rows.length })}</h2>
    <table><thead><tr><th>${T('תאריך')}</th><th>${T('סוג')}</th><th>${T('קטגוריה')}</th><th>${T('פירוט')}</th><th>${T('הערה')}</th><th>${T('שילם')}</th><th>${T('סכום')}</th><th>${T('במטבע הטיול')}</th></tr></thead><tbody>
      ${rows.map(e => `<tr><td class="n">${esc(formatDate(e.date))}</td><td>${e.type === 'income' ? T('הכנסה') : T('הוצאה')}</td><td>${esc(T(e.category))}</td>
        <td>${esc(e.details)}${e.address ? `<br><small>📍 ${esc(e.address)}</small>` : ''}</td><td>${esc(e.comment || '')}</td><td>${esc(e.paidBy)}</td>${n(L.formatMoney(e.amount, e.currency))}${n(f(e.convertedAmount))}</tr>`).join('')}</tbody></table>
    <p style="margin-top:6mm;color:#666;font-size:9pt">${T('הופק בטיולון')} · ${esc(formatDate(todayIso(), { year: 'numeric' }))} ${esc(new Date().toTimeString().slice(0, 5))}</p>`;
  const title = document.title;
  document.title = `${T('טיולון')} - ${t.name}`; // becomes the PDF file name
  window.print();
  setTimeout(() => document.title = title, 500);
}
