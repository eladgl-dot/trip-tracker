// TripTracker – screens and routing. Routes: #/ home · #/new · #/trip/<id> · #/admin
import { store } from './store.js';
import * as L from './logic.js';
import { esc, $, $$, toast, modal, confirmBox, codePrompt, reportError, formatDate, dateRange, todayIso, closeAll } from './ui.js';
import { breakdown, bars } from './charts.js';
import { hashPin, checkPin, hashAdmin } from './pin.js';
import { getRate, prefetchRates } from './rates.js';
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
const grantAccess = id => ls.set(ACCESS_KEY(id), String(Date.now() + L.ACCESS_MS));
const accessLeft = id => Number(ls.get(ACCESS_KEY(id))) - Date.now();
const isAdmin = () => sessionStorage.getItem('tt-admin') === '1';
const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };
// Writes resolve only after the server confirms; offline they are queued, so never block the UI on them.
const fire = p => Promise.resolve(p).catch(reportError);

// ---------------------------------------------------------------- boot
banners();
view.innerHTML = `<div class="wrap" style="padding-top:40px"><div class="skeleton"></div><div class="skeleton"></div></div>`;
try {
  await store.ready();
} catch (err) {
  console.error(err);
  view.innerHTML = `<div class="wrap" style="padding-top:40px"><div class="card center">
    <div style="font-size:48px">📡</div><h2>לא ניתן להתחבר</h2>
    <p class="muted">בפעם הראשונה צריך חיבור לאינטרנט. אם יש חיבור, ייתכן שההתחברות האנונימית ב-Firebase לא מופעלת.</p>
    <p class="muted small" dir="ltr">${esc(err.code || err.message)}</p>
    <div class="row2"><button class="btn primary" onclick="location.reload()">נסו שוב</button><a class="btn ghost" href="?demo">מצב הדגמה</a></div>
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
      if (!document.querySelector('.scrim')) location.reload(); else toast('גרסה חדשה מוכנה – היא תיטען ברענון הבא');
    });
  }
}

function banners() {
  const b = $('#banner');
  const draw = () => {
    b.innerHTML = (store.kind === 'demo' ? `<div class="demo-bar">🧪 מצב הדגמה: הנתונים נשמרים רק בדפדפן הזה · <a href="?demo=0">מעבר לנתונים האמיתיים</a></div>` : '')
      + (navigator.onLine ? '' : `<div class="offline">📴 אין חיבור. השינויים נשמרים ויסונכרנו כשהחיבור יחזור</div>`);
  };
  addEventListener('online', draw); addEventListener('offline', draw); draw();
}

function route() {
  cleanups.forEach(fn => fn()); cleanups = [];
  closeAll();
  window.scrollTo(0, 0);
  const h = location.hash.replace(/^#\/?/, '');
  const [page, id] = h.split('/');
  if (page === 'new') return createTripPage();
  if (page === 'trip' && id) return tripPage(id);
  if (page === 'admin') return isAdmin() ? adminPage() : (go('#/'), askAdmin());
  homePage();
}

// ---------------------------------------------------------------- WhatsApp share
const WA_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#25D366"/><path fill="#fff" d="M16 7.2a8.8 8.8 0 0 0-7.6 13.2L7.2 24.8l4.5-1.2A8.8 8.8 0 1 0 16 7.2Zm0 16a7.2 7.2 0 0 1-3.7-1l-.3-.2-2.6.7.7-2.5-.2-.3A7.2 7.2 0 1 1 16 23.2Zm4-5.4c-.2-.1-1.3-.6-1.5-.7s-.4-.1-.5.1-.6.7-.7.9-.3.2-.5.1a5.9 5.9 0 0 1-2.9-2.6c-.2-.4.2-.4.6-1.2a.4.4 0 0 0 0-.4l-.7-1.6c-.2-.4-.4-.4-.5-.4h-.4a.8.8 0 0 0-.6.3 2.5 2.5 0 0 0-.8 1.9 4.4 4.4 0 0 0 .9 2.3 10 10 0 0 0 3.8 3.4c1.4.6 2 .7 2.7.6a2.3 2.3 0 0 0 1.5-1.1 1.9 1.9 0 0 0 .1-1.1c0-.1-.2-.2-.5-.3Z"/></svg>`;
async function shareTrip(trip) {
  if (!trip) return;
  const link = location.origin + location.pathname + '#/trip/' + encodeURIComponent(trip.id);
  const m = modal(`<h2>שיתוף בוואטסאפ</h2>
    <p class="muted">לשתף גם את סיסמת הטיול באותה הודעה?<br>בלי הסיסמה, מי שמקבל את הקישור יצטרך לבקש אותה.</p>
    <div class="stack"><button class="btn wa-go" data-pin>כן, עם הסיסמה</button><button class="btn ghost" data-link>רק קישור</button></div>`, { label: 'שיתוף בוואטסאפ' });
  m.el.querySelector('[data-pin]').onclick = () => m.close('pin');
  m.el.querySelector('[data-link]').onclick = () => m.close('link');
  const how = await m.result;
  if (!how) return;
  let pin = '';
  if (how === 'pin') {
    const ok = await codePrompt({
      title: 'סיסמת הטיול', text: 'הקלידו את 4 הספרות כדי לצרף אותן להודעה', length: 4, ok: 'לשתף', okClass: 'wa-go',
      check: async code => { const good = await checkPin(trip, code); if (good) pin = code; return good; }
    });
    if (!ok) return;
  }
  const url = L.shareUrl(L.shareMessage(trip.name, link, pin));
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
  host.innerHTML = `<div class="install" role="region" aria-label="התקנה">
      <div class="ic" aria-hidden="true">🧳</div>
      <div class="txt"><b>להתקין כאפליקציה?</b><span class="muted">פותחים ממסך הבית, עובד גם בלי אינטרנט</span></div>
      <button class="btn primary sm" id="installGo">התקנה</button>
      <button class="x" id="installX" title="סגירה" aria-label="סגירה">✕</button></div>`;
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

// ---------------------------------------------------------------- home
function homePage() {
  view.innerHTML = `
    <header class="topbar">
      <div class="brand"><h1>🧳 טיולון</h1><span class="muted">הוצאות משותפות לטיול</span></div>
      <button class="icon-btn" id="adminBtn" title="פאנל ניהול" aria-label="פאנל ניהול">⚙️</button>
    </header>
    <div class="wrap">
      <div id="install"></div>
      <a class="btn primary block" href="#/new">+ טיול חדש</a>
      <div id="trips"><div class="skeleton"></div></div>
      <p class="version muted small center">גרסה <span class="num" dir="ltr">${esc(window.TT_VERSION || '?')}</span></p>
    </div>`;
  $('#adminBtn').onclick = askAdmin;
  drawInstall();
  addEventListener('tt-install', drawInstall); cleanups.push(() => removeEventListener('tt-install', drawInstall));
  const host = $('#trips');
  const closeMenus = e => { if (!e.target.closest('.kebab, .menu')) $$('.menu', host).forEach(m => m.remove()); };
  document.addEventListener('click', closeMenus);
  cleanups.push(() => document.removeEventListener('click', closeMenus));

  cleanups.push(store.onTrips(trips => {
    trips.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '') || (b.createdAtMs || 0) - (a.createdAtMs || 0));
    if (!trips.length) {
      host.innerHTML = `<div class="empty"><div class="big">🗺️</div><p>עוד אין טיולים.<br>לחצו על "+ טיול חדש" כדי להתחיל.</p></div>`;
      return;
    }
    host.style.display = 'grid'; host.style.gap = 'var(--s3)';
    host.innerHTML = trips.map(t => {
      const left = accessLeft(t.id);
      const days = Math.ceil(left / 86400000);
      return `<article class="card trip-card" style="background:${tripBg(t.color)}" data-id="${esc(t.id)}" tabindex="0" role="button" aria-label="${esc(t.name)}">
        <button class="kebab" title="אפשרויות" aria-label="אפשרויות">⋮</button>
        <h3>${esc(t.name)}</h3>
        <div class="muted">📍 ${esc(t.location)}</div>
        <div class="chips">
          <span class="chip sky num">${esc(dateRange(t.startDate, t.endDate))}</span>
          <span class="chip">👥 ${t.participants.length} משתתפים</span>
          <span class="chip mint">${esc(L.currencySymbol(t.defaultCurrency))} ${esc(t.defaultCurrency)}</span>
        </div>
        ${left > 0 ? `<div class="lock">🔓 ${days <= 1 ? 'מחר' : `עוד ${days} ימים`} צריך להזין את הסיסמא שוב</div>` : ''}
      </article>`;
    }).join('');
    $$('.trip-card', host).forEach(card => {
      const trip = trips.find(t => t.id === card.dataset.id);
      card.onclick = e => { if (!e.target.closest('.kebab, .menu')) openTrip(trip); };
      card.onkeydown = e => { if (e.key === 'Enter' && e.target === card) openTrip(trip); };
      $('.kebab', card).onclick = e => {
        e.stopPropagation();
        const had = $('.menu', card);
        $$('.menu', host).forEach(m => m.remove());
        if (had) return;
        card.insertAdjacentHTML('beforeend', `<div class="menu" role="menu"><button class="red" role="menuitem">🗑️ מחיקת טיול</button></div>`);
        $('.menu button', card).onclick = ev => { ev.stopPropagation(); $('.menu', card).remove(); deleteTripFlow(trip); };
      };
    });
  }, err => { host.innerHTML = `<div class="empty"><div class="big">🔒</div><p>אין גישה לנתונים.</p></div>`; reportError(err); }));
}

async function unlock(trip) {
  if (accessLeft(trip.id) > 0) return true;
  const ok = await codePrompt({
    title: '🔒 ' + trip.name, text: 'סיסמת הטיול (4 ספרות)', length: 4,
    note: 'הגישה תישמר במכשיר הזה ל-3 ימים', check: code => checkPin(trip, code)
  });
  if (ok) grantAccess(trip.id);
  return ok;
}
async function openTrip(trip) { if (await unlock(trip)) go('#/trip/' + trip.id); }

// Admin code check; a correct code also opens the admin session for this tab.
async function adminCode(title) {
  if (isAdmin()) return true;
  const ok = await codePrompt({ title, text: 'קוד מנהל (6 ספרות)', length: 6, check: async c => await hashAdmin(c) === ADMIN_HASH });
  if (ok) sessionStorage.setItem('tt-admin', '1');
  return ok;
}

async function deleteTripFlow(trip) {
  if (!await adminCode('🗑️ מחיקת טיול')) return;
  const ok = await confirmBox('מחיקת טיול', `למחוק לצמיתות את "${trip.name}" וכל התנועות שלו? אי אפשר לבטל.`, { ok: 'מחיקה סופית', danger: true });
  if (!ok) return;
  fire(store.deleteTrip(trip.id)).then(() => toast('הטיול נמחק'));
}

async function askAdmin() {
  if (await adminCode('⚙️ פאנל ניהול')) go('#/admin');
}

// ---------------------------------------------------------------- trip form (create + edit)
function currencyOptions(selected) {
  return L.CURRENCIES.map(c => `<option value="${c.code}" ${c.code === selected ? 'selected' : ''}>${c.code} ${c.symbol !== c.code ? c.symbol + ' ' : ''}– ${c.name}</option>`).join('');
}

function tripFormHtml(t, withPin) {
  return `
    <div class="field" data-f="name"><label class="lbl" for="f-name">שם הטיול *</label><input id="f-name" maxlength="80" value="${esc(t.name || '')}" autocomplete="off"><p class="err"></p></div>
    <div class="field" data-f="location"><label class="lbl" for="f-loc">מיקום / יעד *</label><input id="f-loc" maxlength="80" value="${esc(t.location || '')}" autocomplete="off"><p class="err"></p></div>
    <div class="row2 field" data-f="endDate">
      <div><label class="lbl" for="f-start">תאריך התחלה</label><input id="f-start" type="date" value="${esc(t.startDate || '')}"></div>
      <div><label class="lbl" for="f-end">תאריך סיום</label><input id="f-end" type="date" value="${esc(t.endDate || '')}"></div>
      <p class="err" style="grid-column:1/-1"></p>
    </div>
    <div class="field" data-f="defaultCurrency"><label class="lbl" for="f-cur">מטבע ברירת מחדל *</label><select id="f-cur">${currencyOptions(t.defaultCurrency || 'EUR')}</select><p class="err"></p></div>
    <div class="field"><span class="lbl" id="f-color-l">צבע הטיול</span>
      <div class="swatches" id="f-color" role="radiogroup" aria-labelledby="f-color-l">${L.TRIP_COLORS.map(c => `<button type="button" role="radio" class="sw"
        data-color="${c.key}" aria-checked="${L.tripColor(t.color).key === c.key}" aria-label="${c.name}" title="${c.name}" style="background:${tripBg(c.key)}"></button>`).join('')}</div></div>
    <div class="field" data-f="participants">
      <label class="lbl" for="f-person">משתתפים * <span class="small">(⭐ = ברירת המחדל ב"מי שילם"; לחיצה על שם הופכת אותו לראשון)</span></label>
      <div class="chips" id="f-chips" style="margin-bottom:8px"></div>
      <div class="chip-input"><input id="f-person" maxlength="30" placeholder="הקלידו שם ולחצו הוספה" autocomplete="off" enterkeyhint="done"><button type="button" class="btn ghost sm" id="f-add">הוספה</button></div>
      <p class="err"></p>
    </div>
    ${withPin ? `<div class="field" data-f="pin"><label class="lbl" for="f-pin">סיסמת טיול (4 ספרות) *</label>
      <input id="f-pin" class="code num" style="font-size:26px;letter-spacing:10px" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off"><p class="err"></p></div>` : ''}`;
}

// Wires the form. lockedNames: participants that can't be removed (they have transactions).
function bindTripForm(root, t, lockedNames = new Set()) {
  const people = [...(t.participants || [])];
  const chips = $('#f-chips', root), input = $('#f-person', root);
  const draw = () => {
    chips.innerHTML = people.map((p, i) => `<span class="chip ${i === 0 ? 'sky' : ''}">
      <button type="button" data-first="${i}" title="הפוך לברירת מחדל">${i === 0 ? '⭐ ' : ''}${esc(p)}</button>
      <button type="button" data-rm="${i}" aria-label="הסרת ${esc(p)}">✕</button></span>`).join('');
    $$('[data-rm]', chips).forEach(b => b.onclick = () => {
      const name = people[+b.dataset.rm];
      if (lockedNames.has(name)) return toast(`אי אפשר להסיר את ${name}: יש לו/ה תנועות בטיול`, 'bad');
      people.splice(+b.dataset.rm, 1); draw();
    });
    $$('[data-first]', chips).forEach(b => b.onclick = () => { const [p] = people.splice(+b.dataset.first, 1); people.unshift(p); draw(); });
  };
  const add = () => {
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (people.includes(name)) { toast('השם כבר ברשימה'); return; }
    people.push(name); input.value = ''; draw(); input.focus();
  };
  $('#f-add', root).onclick = add;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  let color = L.tripColor(t.color).key;
  $$('[data-color]', root).forEach(b => b.onclick = () => {
    color = b.dataset.color;
    $$('[data-color]', root).forEach(x => x.setAttribute('aria-checked', x === b));
  });
  const pin = $('#f-pin', root);
  if (pin) pin.addEventListener('input', () => pin.value = pin.value.replace(/\D/g, '').slice(0, 4));
  draw();

  return function read() {
    if (input.value.trim()) add(); // a typed name that wasn't added yet still counts
    const data = {
      name: $('#f-name', root).value.trim(), location: $('#f-loc', root).value.trim(),
      startDate: $('#f-start', root).value, endDate: $('#f-end', root).value,
      defaultCurrency: $('#f-cur', root).value, participants: [...people], color
    };
    if (pin) data.pin = pin.value;
    const errors = L.validateTrip(data);
    $$('[data-f]', root).forEach(f => { const e = errors[f.dataset.f]; f.classList.toggle('invalid', !!e); $('.err', f).textContent = e || ''; });
    const first = $('.invalid input, .invalid select', root);
    if (first) { first.focus(); return null; }
    return data;
  };
}

function createTripPage() {
  view.innerHTML = `
    <header class="topbar"><a class="icon-btn" href="#/" title="חזרה" aria-label="חזרה">→</a><h1>טיול חדש</h1><span style="width:44px"></span></header>
    <form class="wrap" novalidate><div class="card">${tripFormHtml({}, true)}
      <button class="btn primary block">יצירת טיול</button></div></form>`;
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
    toast('הטיול נוצר 🎉', 'good');
    go('#/trip/' + id);
  };
}

// ---------------------------------------------------------------- trip page
async function tripPage(id) {
  view.innerHTML = `<div class="wrap" style="padding-top:40px"><div class="skeleton"></div></div>`;
  if (accessLeft(id) <= 0) {
    const here = () => location.hash === '#/trip/' + id; // the user may have navigated away meanwhile
    const t = await store.getTrip(id).catch(() => null);
    if (!here()) return;
    if (!t) { toast('הטיול לא נמצא', 'bad'); return go('#/'); }
    const ok = await unlock(t);
    if (!here()) return;
    if (!ok) return go('#/');
  }
  const st = { trip: null, expenses: [], tab: 'list', search: '', chart: 'cat', focus: null, who: '', built: false };
  const fmt = v => L.formatMoney(v, st.trip.defaultCurrency);

  const build = () => {
    view.innerHTML = `
      <header class="tripbar" id="hero"></header>
      <header class="tripbar mini-bar" id="miniBar" aria-hidden="true"></header>
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="list">הוצאות וסיכומים</button>
        <button role="tab" data-tab="settle">התחשבנות</button>
      </div>
      <div id="tabList" class="wrap">
        <div class="stats" id="stats"></div>
        <div class="card"><div class="card-head"><h2>פילוח</h2>
          <div class="toggle" role="group"><button data-ch="cat">לפי קטגוריה</button><button data-ch="day">לפי יום</button></div></div>
          <div id="chart"></div></div>
        <div class="toolbar">
          <input class="search" id="search" type="search" placeholder="🔍 חיפוש: פירוט, הערה, קטגוריה, משלם" aria-label="חיפוש תנועות">
        </div>
        <div id="txList" style="display:grid;gap:var(--s3)"></div>
      </div>
      <div id="tabSettle" class="hidden">
        <div class="filter" id="who" role="group" aria-label="סינון לפי משתתף"></div>
        <div class="wrap" style="margin-top:var(--s3)" id="settle"></div>
      </div>
      <button class="fab" id="fab"><span aria-hidden="true">+</span>להוסיף הוצאה</button>`;
    // Material-style: when the big banner scrolls away, a slim bar stays at the top.
    const io = new IntersectionObserver(([en]) => {
      const show = !en.isIntersecting && en.boundingClientRect.top < 0;
      $('#miniBar').classList.toggle('on', show); $('#miniBar').setAttribute('aria-hidden', !show);
    });
    io.observe($('#hero')); cleanups.push(() => io.disconnect());
    const onClick = e => {
      if (e.target.closest('[data-edit-trip]')) editTripSheet(st);
      else if (e.target.closest('[data-people]')) peoplePopup(st);
      else if (e.target.closest('[data-groups]')) groupsSheet(st);
      else if (e.target.closest('#share')) shareTrip(st.trip);
      else if (e.target.closest('#pdf')) printReport(st);
      else if (e.target.closest('[data-unfocus]')) setFocus(null);
      else if (e.target.closest('[data-hide-banner]')) { try { localStorage.setItem('tt-grp-banner-' + st.trip.id, '0'); } catch {} drawSettle(); }
    };
    view.addEventListener('click', onClick); cleanups.push(() => view.removeEventListener('click', onClick));
    $('#fab').onclick = () => expenseSheet(st, null, 'expense');
    $$('[data-tab]').forEach(b => b.onclick = () => { st.tab = b.dataset.tab; drawTabs(); });
    $$('[data-ch]').forEach(b => b.onclick = () => { if (st.chart === b.dataset.ch) return; st.chart = b.dataset.ch; st.focus = null; drawChart(); drawList(); });
    $('#search').oninput = e => { st.search = e.target.value; drawList(); };
    st.built = true;
  };

  const drawTabs = () => {
    $$('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === st.tab));
    $('#tabList').classList.toggle('hidden', st.tab !== 'list');
    $('#tabSettle').classList.toggle('hidden', st.tab !== 'settle');
  };

  const drawHero = () => {
    const t = st.trip;
    const len = t.startDate && t.endDate ? L.daysBetween(t.startDate, t.endDate) : 0;
    const bg = tripBg(t.color);
    const btns = title => [`<a class="ib" href="#/" title="לכל הטיולים" aria-label="לכל הטיולים">→</a>`, title,
      `<button class="ib" data-edit-trip title="עריכת פרטי טיול" aria-label="עריכת פרטי טיול">✏️</button>`].join('');
    const hero = $('#hero');
    hero.style.background = bg;
    hero.innerHTML = `<div class="tb-row">${btns(`<h1>${esc(t.name)}</h1>`)}</div>
      <div class="tb-meta">📍 ${esc(t.location)} · <span class="num">${esc(dateRange(t.startDate, t.endDate))}</span>${len > 0 ? ` · ${len} ימים` : ''}</div>
      <div class="chips tb-chips"><button type="button" class="chip ppl" data-people title="משתתפים" aria-label="משתתפים (${t.participants.length})">👥 <span class="num">${t.participants.length}</span></button>
        <span class="chip mint">${esc(L.currencySymbol(t.defaultCurrency))} ${esc(t.defaultCurrency)}</span>
        <span class="tb-share"><button type="button" class="chip wa-chip" id="share" title="שיתוף בוואטסאפ">${WA_ICON}שיתוף</button>
          <button type="button" class="chip pdf-chip" id="pdf" title="ייצוא PDF">📄 PDF</button></span></div>`;
    const s = L.summarize(t, st.expenses, todayIso());
    const mini = $('#miniBar');
    mini.style.background = bg;
    mini.innerHTML = `<div class="tb-row">${btns(`<div class="tb-t"><b>${esc(t.name)}</b><span>${s.days} ימים · <bdi class="money">${esc(fmt(s.net))}</bdi></span></div>`)}</div>`;
  };

  const drawStats = () => {
    const s = L.summarize(st.trip, st.expenses, todayIso());
    $('#stats').innerHTML = `
      <div class="card stat big"><div><div class="muted">מאזן נטו (הוצאות פחות החזרים)</div><div class="v"><span class="money">${fmt(s.net)}</span></div></div>
        <span class="chip sky">${s.days} ימים · ${st.expenses.length} תנועות</span></div>
      <div class="card stat exp"><div class="muted">סה"כ הוצאות</div><div class="v neg"><span class="money">${fmt(s.totalExpenses)}</span></div></div>
      <div class="card stat inc"><div class="muted">הכנסות / החזרים</div><div class="v pos"><span class="money">+${fmt(s.totalIncome)}</span></div></div>
      <div class="card stat"><div class="muted">ממוצע ליום</div><div class="v"><span class="money">${fmt(s.perDay)}</span></div></div>
      <div class="card stat"><div class="muted">ממוצע לאדם</div><div class="v"><span class="money">${fmt(s.perPerson)}</span></div></div>`;
  };

  const drawChart = () => {
    $$('[data-ch]').forEach(b => b.setAttribute('aria-pressed', b.dataset.ch === st.chart));
    const host = $('#chart');
    const scrollX = host.querySelector('.bars-scroll')?.scrollLeft;
    const items = st.chart === 'cat' ? L.byCategory(st.expenses) : L.byDay(st.expenses);
    if (st.focus && !items.some(d => d.name === st.focus.name)) st.focus = null; // its last expense was deleted/moved
    const selected = st.focus?.name ?? null;
    const onSelect = name => { st.focus = name ? { kind: st.chart, name } : null; drawList(); };
    if (st.chart === 'cat') breakdown(host, items, { fmt, label: n => `${L.categoryEmoji(n)} ${n}`, selected, onSelect });
    else bars(host, items, { fmt, total: L.summarize(st.trip, st.expenses).totalExpenses, selected, onSelect });
    const sc = host.querySelector('.bars-scroll');
    if (sc && scrollX != null) sc.scrollLeft = scrollX;
  };
  const setFocus = f => { st.focus = f; drawChart(); drawList(); };

  const drawList = () => {
    const host = $('#txList');
    const focusPill = n => {
      const f = st.focus;
      if (!f) return '';
      const what = f.kind === 'cat' ? `${L.categoryEmoji(f.name)} <bdi>${esc(f.name)}</bdi>`
        : `📅 <bdi>${esc(formatDate(f.name, { weekday: 'short', day: '2-digit', month: '2-digit' }))}</bdi>`;
      return `<div class="focus-pill"><span>${what} · <span class="num">${n}</span> ראשונות</span>
          <button type="button" class="x" data-unfocus title="ביטול" aria-label="ביטול הסידור">✕</button></div>`;
    };
    const list = L.sortTransactions(st.expenses.filter(e => L.matchesSearch(e, st.search)));
    if (!st.expenses.length) {
      host.innerHTML = `<div class="empty"><div class="big">🧾</div><p>עדיין אין תנועות.<br>לחצו על + כדי להוסיף את ההוצאה הראשונה.</p></div>`; return;
    }
    if (!list.length) { host.innerHTML = focusPill(0) + `<div class="empty">לא נמצאו תנועות עבור "${esc(st.search)}"</div>`; return; }
    const card = (e, dim) => {
      const inc = e.type === 'income';
      const other = e.currency !== st.trip.defaultCurrency;
      return `<div class="card tx ${inc ? 'income' : ''}${dim ? ' dim' : ''}">
        <div class="ic" aria-hidden="true">${inc ? '↩️' : L.categoryEmoji(e.category)}</div>
        <div class="mid">
          <div class="t">${esc(e.details)}</div>
          <div class="muted">${esc(e.category)} · ${inc ? 'התקבל ע"י' : 'שולם ע"י'} ${esc(e.paidBy)}</div>
          ${e.comment ? `<div class="muted">💬 ${esc(e.comment)}</div>` : ''}
          ${e.location ? `<a class="geo-link" href="${esc(L.mapsUrl(e.location))}" target="_blank" rel="noopener">📍 ${esc(e.address || 'מיקום במפה')}</a>` : ''}
          <div class="acts"><button class="mini" data-edit="${esc(e.id)}" title="עריכה" aria-label="עריכה">✏️</button>
            ${e.photoIds?.length ? `<button class="mini pics" data-pics="${esc(e.id)}" title="תמונות" aria-label="${e.photoIds.length} תמונות">📷 ${e.photoIds.length}</button>` : ''}
            <button class="mini del" data-del="${esc(e.id)}" title="מחיקה" aria-label="מחיקה">🗑️</button></div>
        </div>
        <div class="amt ${inc ? 'pos' : 'neg'}"><span class="money">${inc ? '+' : ''}${esc(L.formatMoney(e.amount, e.currency))}</span>
          ${other ? `<small class="money">≈ ${esc(fmt(e.convertedAmount))}</small>` : ''}</div>
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
        + (rest.length ? `<div class="focus-sep">${f.kind === 'cat' ? 'לא בקטגוריה הנבחרת' : 'לא ביום הנבחר'} · <span class="num">${rest.length}</span></div>` + days(rest, true) : '');
    }
    host.innerHTML = html;
    $$('[data-edit]', host).forEach(b => b.onclick = () => expenseSheet(st, st.expenses.find(x => x.id === b.dataset.edit)));
    $$('[data-pics]', host).forEach(b => b.onclick = async () => {
      const pics = await store.getPhotos(st.trip.id, b.dataset.pics).catch(err => (reportError(err), []));
      const ok = pics.map(p => p.data).filter(L.isPhotoData);
      if (ok.length) photoViewer(ok, 0); else toast('התמונות עדיין לא סונכרנו למכשיר הזה');
    });
    $$('[data-del]', host).forEach(b => b.onclick = async () => {
      const e = st.expenses.find(x => x.id === b.dataset.del);
      if (await confirmBox('מחיקת תנועה', `למחוק את "${e.details}"?`, { ok: 'מחיקה', danger: true })) {
        fire(store.deleteExpense(st.trip.id, e.id, e.photoIds)); toast('נמחק');
      }
    });
  };

  const drawSettle = () => {
    const t = st.trip;
    if (st.who && !t.participants.includes(st.who)) st.who = '';
    $('#who').innerHTML = ['', ...t.participants].map(p => `<button data-who="${esc(p)}" aria-pressed="${st.who === p}">${p ? esc(p) : 'כולם'}</button>`).join('');
    $$('[data-who]').forEach(b => b.onclick = () => { st.who = b.dataset.who; drawSettle(); });

    const bal = L.balances(t.participants, st.expenses);
    const groups = L.cleanGroups(t.groups, t.participants);
    const units = L.groupBalances(bal, groups);
    const transfers = L.settleTransfers(units);
    const unitOf = Object.fromEntries(units.flatMap(u => u.members.map(p => [p, u.name])));
    const mine = st.who ? unitOf[st.who] : '';
    const shown = st.who ? transfers.filter(x => x.from === mine || x.to === mine) : transfers;
    const pieItems = st.who ? L.byCategory(st.expenses.filter(e => e.paidBy === st.who)) : L.byPayer(st.expenses);
    let bannerOn = true; try { bannerOn = localStorage.getItem('tt-grp-banner-' + t.id) !== '0'; } catch {}
    const solo = units.filter(u => !u.isGroup).length;
    const host = $('#settle');
    host.innerHTML = `
      ${groups.length ? `<div class="gbar"><span>👨‍👩‍👧 ${groups.length === 1 ? 'קבוצה אחת' : `${groups.length} קבוצות`}${solo ? ` · ${solo} לבד` : ''}</span>
          <button type="button" class="btn sm ghost" data-groups>עריכת קבוצות</button></div>`
        : bannerOn ? `<div class="grp-banner"><button type="button" class="x" data-hide-banner title="הסתרה" aria-label="הסתרת ההודעה">✕</button>
          <b>👨‍👩‍👧 יש בטיול זוגות או משפחות?</b>
          <p>אפשר לאחד אנשים לקבוצה, וההתחשבנות תהיה בין הקבוצות: מי מעביר למי – פעם אחת לכל זוג.</p>
          <button type="button" class="btn primary block" data-groups>לחלק את האנשים לקבוצות</button></div>` : ''}
      <div class="card"><h2>${st.who ? `ההוצאות ששילם/ה ${esc(st.who)} לפי קטגוריה` : 'מי שילם כמה'}</h2><div id="pie2"></div></div>
      <h2 style="margin:var(--s2) var(--s2) 0">יתרות</h2>
      ${units.map(u => {
        const cls = u.balance > 0.009 ? 'pos' : u.balance < -0.009 ? 'neg' : 'zero';
        const ini = u.isGroup ? u.members.slice(0, 3).map(p => [...p][0] || '?').join('+') : ([...u.name][0] || '?');
        const many = u.isGroup;
        return `<div class="card person ${many ? 'group' : ''} ${st.who && mine !== u.name ? 'dim' : ''}">
          <div class="ava ${many ? 'multi' : ''}" aria-hidden="true">${esc(ini)}</div>
          <div><b>${esc(u.name)}</b>${many ? `<div class="members">${u.members.map(esc).join(', ')}</div>` : ''}</div>
          <span class="bal ${cls}" title="${cls === 'pos' ? 'מגיע' : cls === 'neg' ? 'חייב' : 'מאוזן'}"><span class="money">${u.balance > 0.009 ? '+' : ''}${fmt(u.balance)}</span></span>
          <div class="muted"><span>${many ? 'שילמו' : 'שילם/ה'} <bdi class="money">${fmt(u.paid)}</bdi></span><span>${many ? 'חלקם' : 'חלקו/ה'} <bdi class="money">${fmt(u.share)}</bdi></span>
            ${u.received ? `<span>${many ? 'קיבלו' : 'קיבל/ה'} החזר <bdi class="money">${fmt(u.received)}</bdi></span>` : ''}</div>
        </div>`;
      }).join('')}
      <div class="card"><h2>💸 מי מעביר למי ${transfers.length ? `(${transfers.length} העברות)` : ''}</h2>
        ${!transfers.length ? `<p class="muted center">🎉 כולם מאוזנים, אין צורך בהעברות</p>` : !shown.length ? `<p class="muted center">ל${esc(st.who)} אין העברות</p>` :
          `<div style="display:grid;gap:var(--s2)">${shown.map(x => `<div class="xfer"><b>${esc(x.from)}</b> <span aria-hidden="true">←</span><span class="muted">${units.find(u => u.name === x.from)?.isGroup ? 'מעבירים ל' : 'מעביר/ה ל'}</span> <b>${esc(x.to)}</b>
            <span class="amt money">${fmt(x.amount)}</span></div>`).join('')}</div>`}
        ${st.who && mine !== st.who ? `<p class="hint">${esc(st.who)} בקבוצה "${esc(mine)}" – מוצגות ההעברות של הקבוצה</p>` : ''}
        <p class="hint">חלוקה שווה של ההוצאות נטו בין ${t.participants.length} המשתתפים${groups.length ? `, מקובצים ל-${units.length}` : ''}</p>
      </div>
      ${!groups.length && !bannerOn ? `<div class="center" style="margin-top:var(--s2)"><button type="button" class="btn ghost" data-groups>👨‍👩‍👧 לחלק את האנשים לקבוצות</button></div>` : ''}`;
    breakdown($('#pie2'), pieItems, { fmt, label: n => st.who ? `${L.categoryEmoji(n)} ${n}` : n });
  };

  const drawAll = () => {
    if (!st.trip) return;
    if (!st.built) build();
    drawHero(); drawTabs(); drawStats(); drawChart(); drawList(); drawSettle();
  };

  let gotExpenses = false;
  cleanups.push(store.onTrip(id, trip => {
    if (!trip) { toast('הטיול נמחק', 'bad'); return go('#/'); }
    st.trip = trip; if (gotExpenses) drawAll();
    prefetchRates(trip.defaultCurrency); // keep rates on the phone for offline (at most every 6 h)
  }, reportError));
  const onOnline = () => st.trip && prefetchRates(st.trip.defaultCurrency);
  addEventListener('online', onOnline); cleanups.push(() => removeEventListener('online', onOnline));
  cleanups.push(store.onExpenses(id, list => {
    st.expenses = list; gotExpenses = true; drawAll();
    fillAddresses(id, list, (tid, eid, patch) => fire(store.patchExpense(tid, eid, patch)));
  }, reportError));
}

// ---------------------------------------------------------------- trip color, participants, groups
function tripBg(key) { const c = L.tripColor(key); return `linear-gradient(135deg, ${c.from}, ${c.to})`; }

function peoplePopup(st) {
  const t = st.trip;
  const groupOf = Object.fromEntries(L.cleanGroups(t.groups, t.participants).flatMap(g => g.members.map(p => [p, g.name])));
  const m = modal(`<h2>👥 משתתפים (${t.participants.length})</h2>
    <ul class="people-list">${t.participants.map(p => `<li><span class="ava" aria-hidden="true">${esc([...p][0] || '?')}</span><span class="pn">${esc(p)}</span>
      ${groupOf[p] ? `<span class="chip">${esc(groupOf[p])}</span>` : ''}</li>`).join('')}</ul>
    <div class="row2"><button class="btn ghost" data-g>👨‍👩‍👧 לחלק לקבוצות</button><button class="btn primary" data-x>סגירה</button></div>`, { label: 'משתתפים' });
  $('[data-x]', m.el).onclick = () => m.close();
  $('[data-g]', m.el).onclick = () => { m.close(); groupsSheet(st); };
}

const GROUP_COLORS = ['#38BDF8', '#A78BFA', '#F472B6', '#34D399', '#FBBF24'];
function groupsSheet(st) {
  const t = st.trip;
  // Work on a copy. A name the user didn't type stays '', so the shown name follows the members.
  const inTrip = new Set(t.participants), seen = new Set();
  const groups = (t.groups || []).map(g => ({
    name: g.name || '',
    members: (g.members || []).filter(p => inTrip.has(p) && !seen.has(p) && seen.add(p))
  })).filter(g => g.members.length).slice(0, L.MAX_GROUPS);
  let active = 0;
  const m = modal(`<h2>חלוקה לקבוצות</h2><p class="muted" style="margin:-8px 0 var(--s3)">כל אדם יכול להיות בקבוצה אחת בלבד. מי שלא בקבוצה מתחשבן לבד.</p>
    <div id="g-body"></div>
    <div class="row2" style="margin-top:var(--s4)"><button class="btn ghost" data-x>ביטול</button><button class="btn primary" data-save>שמירה</button></div>`, { sheet: true, label: 'חלוקה לקבוצות' });
  const body = $('#g-body', m.el);
  const draw = () => {
    const used = new Set(groups.flatMap(g => g.members));
    const free = t.participants.filter(p => !used.has(p));
    active = Math.max(0, Math.min(active, groups.length - 1));
    body.innerHTML = `${groups.map((g, i) => `<div class="grp ${i === active ? 'on' : ''}" data-act="${i}" style="--g:${GROUP_COLORS[i]}">
        <div class="grp-head"><i aria-hidden="true"></i><input data-name="${i}" maxlength="40" value="${esc(g.name)}" placeholder="${esc(L.groupName(g.members) || `קבוצה ${i + 1}`)}" aria-label="שם הקבוצה">
          <button type="button" class="mini" data-delg="${i}" title="מחיקת קבוצה" aria-label="מחיקת קבוצה">🗑️</button></div>
        <div class="chips">${g.members.length ? g.members.map(p => `<span class="chip in"><span>${esc(p)}</span><button type="button" data-out="${esc(p)}" aria-label="הוצאת ${esc(p)} מהקבוצה">✕</button></span>`).join('')
          : `<span class="muted">${i === active ? 'לחצו על שם למטה כדי להוסיף' : 'לחצו כאן ואז על שם למטה'}</span>`}</div></div>`).join('')}
      <button type="button" class="add-grp" data-newg ${groups.length >= L.MAX_GROUPS ? 'disabled' : ''}>+ קבוצה חדשה (${groups.length} מתוך ${L.MAX_GROUPS})</button>
      <div class="pool"><div class="pool-l">${free.length ? (groups.length ? 'בלי קבוצה – לחיצה מוסיפה לקבוצה המסומנת' : 'בלי קבוצה – לחיצה פותחת קבוצה חדשה') : 'כולם בקבוצות 👍'}</div>
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
    m.close(); toast(out.length ? 'הקבוצות נשמרו' : 'הקבוצות נמחקו', 'good');
  };
}

function editTripSheet(st) {
  const t = st.trip;
  const locked = new Set(st.expenses.map(e => e.paidBy));
  const m = modal(`<h2>עריכת פרטי טיול</h2><form novalidate>${tripFormHtml(t, false)}
    <div class="row2"><button type="button" class="btn ghost" data-x>ביטול</button><button class="btn primary">שמירה</button></div></form>`, { sheet: true, label: 'עריכת פרטי טיול' });
  const read = bindTripForm(m.el, t, locked);
  $('[data-x]', m.el).onclick = () => m.close();
  $('form', m.el).onsubmit = async e => {
    e.preventDefault();
    const data = read(); if (!data) return;
    if (t.groups?.length) data.groups = t.groups // drop people who left the trip, and groups left empty
      .map(g => ({ name: g.name || '', members: (g.members || []).filter(p => data.participants.includes(p)) })).filter(g => g.members.length);
    const btn = $('button.primary', m.el);
    if (data.defaultCurrency !== t.defaultCurrency && st.expenses.length) {
      btn.disabled = true; btn.textContent = 'טוען שער…';
      let r;
      try { r = await getRate(t.defaultCurrency, data.defaultCurrency); }
      catch { btn.disabled = false; btn.textContent = 'שמירה'; return toast('אין שער המרה כרגע (אין חיבור?). נסו שוב מאוחר יותר', 'bad'); }
      btn.disabled = false; btn.textContent = 'שמירה';
      const ok = await confirmBox('החלפת מטבע הטיול',
        `כל ${st.expenses.length} התנועות יומרו מ-${t.defaultCurrency} ל-${data.defaultCurrency} לפי שער ${r.rate.toFixed(4)}${r.source === 'cache' ? ' (שער שמור)' : ''}. להמשיך?`);
      if (!ok) return;
      // Expenses first, the trip's currency only after they succeed, so the two never disagree.
      const { defaultCurrency, ...rest } = data;
      fire(store.updateTrip(t.id, rest));
      fire(store.updateExpenses(t.id, st.expenses.map(x => ({ id: x.id, patch: L.reconvert(x, defaultCurrency, r.rate) })))
        .then(() => store.updateTrip(t.id, { defaultCurrency })));
      m.close(); toast('הפרטים נשמרו', 'good');
      return;
    }
    fire(store.updateTrip(t.id, data));
    m.close(); toast('הפרטים נשמרו', 'good');
  };
}

// ---------------------------------------------------------------- add / edit transaction
function expenseSheet(st, existing, type = 'expense') {
  const t = st.trip;
  const e = existing || { type, currency: t.defaultCurrency, date: todayIso(), paidBy: t.participants[0], category: '', details: '', comment: '' };
  const r = { rate: existing ? existing.exchangeRateToTripDefault : 1, source: existing ? 'saved' : 'live', at: 0, manual: false };
  const m = modal(`
    <h2>${existing ? 'עריכת תנועה' : 'הוספת תנועה'}</h2>
    <form novalidate>
      <div class="type-toggle" role="group" aria-label="סוג תנועה">
        <button type="button" data-t="expense">הוצאה</button><button type="button" data-t="income">הכנסה / החזר</button></div>
      <div class="amount-row field">
        <div data-f="amount"><label class="lbl" for="x-amt">סכום *</label>
          <input id="x-amt" class="amount num" inputmode="decimal" autocomplete="off" placeholder="0" value="${existing ? e.amount : ''}"><p class="err"></p></div>
        <div><label class="lbl" for="x-cur">מטבע *</label><select id="x-cur">${L.CURRENCIES.map(c => `<option ${c.code === e.currency ? 'selected' : ''}>${c.code}</option>`).join('')}</select></div>
      </div>
      <div class="rate-box hidden" id="x-rate" aria-live="polite"></div>
      <div class="field" data-f="category"><label class="lbl" for="x-cat">קטגוריה *</label>
        <select id="x-cat"></select>
        <div class="newcat hidden" id="x-newcat">
          <input id="x-newcat-in" maxlength="40" autocomplete="off" enterkeyhint="done" placeholder="שם הקטגוריה החדשה" aria-label="שם הקטגוריה החדשה">
          <button type="button" class="btn primary sm" id="x-newcat-add">להוסיף</button>
          <button type="button" class="x" id="x-newcat-x" title="ביטול" aria-label="ביטול">✕</button>
        </div><p class="err"></p></div>
      <div class="row2 field">
        <div data-f="date"><label class="lbl" for="x-date">תאריך *</label><input id="x-date" type="date" value="${esc(e.date)}"><p class="err"></p></div>
        <div data-f="paidBy"><label class="lbl" for="x-who" id="x-who-lbl">מי שילם *</label><select id="x-who">${t.participants.map(p => `<option ${p === e.paidBy ? 'selected' : ''}>${esc(p)}</option>`).join('')}
          ${existing && !t.participants.includes(e.paidBy) ? `<option selected>${esc(e.paidBy)}</option>` : ''}</select><p class="err"></p></div>
      </div>
      <div class="field" data-f="details"><label class="lbl" for="x-det">פירוט *</label><input id="x-det" maxlength="120" placeholder='למשל: כרטיסים לרכבל' value="${esc(e.details)}"><p class="err"></p></div>
      <div class="field"><label class="lbl" for="x-com">הערה</label><input id="x-com" maxlength="200" placeholder="אופציונלי" value="${esc(e.comment || '')}"></div>
      <div class="geo-box" id="x-geo" aria-live="polite"></div>
      <div class="field"><span class="lbl">תמונות (עד ${L.MAX_PHOTOS})</span><div class="photos" id="x-photos"></div>
        <input type="file" id="x-cam" accept="image/*" capture="environment" hidden>
        <input type="file" id="x-gal" accept="image/*" multiple hidden></div>
      <div class="${existing ? 'row2' : ''}" style="${existing ? 'grid-template-columns:auto 1fr 1fr' : 'display:grid;grid-template-columns:1fr 1fr;gap:var(--s3)'}">
        ${existing ? '<button type="button" class="btn danger" data-del title="מחיקה">🗑️</button>' : ''}
        <button type="button" class="btn ghost" data-x>ביטול</button><button class="btn primary" id="x-save">שמירה</button>
      </div>
    </form>`, { sheet: true, label: existing ? 'עריכת תנועה' : 'הוספת תנועה' });
  const el = m.el;
  let kind = e.type;
  const amt = $('#x-amt', el), cur = $('#x-cur', el), box = $('#x-rate', el), cat = $('#x-cat', el);

  const drawType = () => {
    $$('[data-t]', el).forEach(b => b.setAttribute('aria-pressed', b.dataset.t === kind));
    $('#x-who-lbl', el).textContent = kind === 'income' ? 'מי קיבל *' : 'מי שילם *';
  };
  $$('[data-t]', el).forEach(b => b.onclick = () => { kind = b.dataset.t; drawType(); });
  drawType();

  // ---- rate box
  const drawRate = () => {
    if (cur.value === t.defaultCurrency) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden', 'warn');
    if (r.loading) { box.textContent = '💱 טוען שער יציג…'; return; }
    if (!(r.rate > 0)) {
      box.classList.add('warn');
      box.innerHTML = `⚠️ אין חיבור לשער חי ואין שער שמור. הזינו שער ידני: 1 ${cur.value} = <input id="x-man" inputmode="decimal" aria-label="שער ידני"> ${t.defaultCurrency}`;
      const man = $('#x-man', box);
      man.oninput = () => { r.rate = L.parseAmount(man.value); r.manual = true; r.keepBox = true; };
      man.onchange = drawRate;
      return;
    }
    const a = L.parseAmount(amt.value);
    const conv = a > 0 ? `<b class="money">≈ ${esc(L.formatMoney(L.convert(a, r.rate), t.defaultCurrency))}</b>` : '';
    const src = r.manual ? 'שער ידני' : r.source === 'saved' ? 'השער ששמור בתנועה' : r.source === 'cache' ? `שער שמור מ-${new Date(r.at).toLocaleDateString('he-IL')} (אין חיבור)` : 'שער יציג עדכני';
    box.innerHTML = `💱 <span class="money">1 ${cur.value} = ${r.rate.toFixed(4)} ${t.defaultCurrency}</span> · ${conv}
      <br><small>${src} · השער יישמר בתנועה ולא ישתנה בעתיד ·
      <button type="button" class="linkish" id="x-edit-rate" style="border:0;background:none;color:inherit;text-decoration:underline;padding:0">שינוי ידני</button>
      ${r.source === 'saved' ? ' · <button type="button" id="x-refresh" style="border:0;background:none;color:inherit;text-decoration:underline;padding:0">רענון לשער של היום</button>' : ''}</small>`;
    $('#x-edit-rate', box).onclick = () => {
      box.innerHTML = `💱 1 ${cur.value} = <input id="x-man" inputmode="decimal" value="${r.rate}" aria-label="שער ידני"> ${t.defaultCurrency}`;
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
    cat.innerHTML = `<option value="" disabled hidden>בחרו קטגוריה</option>
      <option value="${NEW_CAT}">➕ להוסיף קטגוריה חדשה</option>`
      + all.map(c => `<option value="${esc(c)}">${L.categoryEmoji(c)} ${esc(c)}</option>`).join('');
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
    const acc = loc ? L.formatAccuracy(loc.acc) : '';
    let html;
    if (geo === 'wait') html = `<span class="pulse" aria-hidden="true"></span> 📍 מאתר מיקום… ${linkBtn('g-skip', 'בלי מיקום')}`;
    else if (geo === 'fix') html = `<span class="pulse" aria-hidden="true"></span> 📍 מיקום נקלט <bdi class="num">${acc}</bdi> · מתעדכן עד השמירה ${linkBtn('g-skip', 'בלי מיקום')}`;
    else if (geo === 'denied') html = `📍 אין הרשאה למיקום. אפשר לאשר בהגדרות הדפדפן ${linkBtn('g-start', 'נסו שוב')}`;
    else if (loc) html = `📍 <a href="${esc(L.mapsUrl(loc))}" target="_blank" rel="noopener">${esc(!locChanged && existing?.address || 'מיקום במפה')}</a> <bdi class="num">${acc}</bdi> ${linkBtn('g-start', 'עדכון')} · ${linkBtn('g-del', 'הסרה')}`;
    else html = `📍 ללא מיקום ${linkBtn('g-start', 'הוספת מיקום')}`;
    geoBox.innerHTML = html;
    geoBox.classList.toggle('live', geo === 'wait' || geo === 'fix');
    const on = (id, fn) => { const b = $('#' + id, geoBox); if (b) b.onclick = fn; };
    on('g-start', startGeo);
    on('g-skip', () => { loc = existing?.location || null; locChanged = false; endGeo(existing ? 'saved' : 'off'); });
    on('g-del', () => { loc = null; locChanged = true; drawGeo(); });
  }
  if (existing) drawGeo(); else startGeo();
  m.result.then(() => stopGeo());

  // ---- photos (up to MAX_PHOTOS, shrunk on the phone)
  const pics = [], removed = [];
  let shrinking = 0;
  const picsBox = $('#x-photos', el);
  function drawPics() {
    picsBox.innerHTML = pics.map((p, i) => `<div class="thumb"><button type="button" class="open" data-open="${i}" aria-label="הצגת תמונה ${i + 1}"><img src="${L.isPhotoData(p.data) ? p.data : ''}" alt=""></button>
        <button type="button" class="x" data-rm="${i}" aria-label="הסרת תמונה ${i + 1}">✕</button></div>`).join('')
      + (shrinking ? `<div class="thumb busy">⏳</div>` : '')
      + (pics.length + shrinking < L.MAX_PHOTOS ? `<button type="button" class="btn ghost sm" data-cam>📷 צילום</button><button type="button" class="btn ghost sm" data-gal>🖼️ גלריה</button>` : '');
    $$('[data-open]', picsBox).forEach(b => b.onclick = () => photoViewer(pics.map(p => p.data), +b.dataset.open));
    $$('[data-rm]', picsBox).forEach(b => b.onclick = () => { const [p] = pics.splice(+b.dataset.rm, 1); if (p.id) removed.push(p.id); drawPics(); });
    const cam = $('[data-cam]', picsBox), gal = $('[data-gal]', picsBox);
    if (cam) cam.onclick = () => $('#x-cam', el).click();
    if (gal) gal.onclick = () => $('#x-gal', el).click();
  }
  const addFiles = async input => {
    const all = [...input.files];
    const files = all.slice(0, L.MAX_PHOTOS - pics.length - shrinking);
    input.value = '';
    if (all.length > files.length) toast(`אפשר עד ${L.MAX_PHOTOS} תמונות`);
    for (const f of files) {
      shrinking++; drawPics();
      try { pics.push({ data: await shrinkImage(f) }); } catch { toast('לא הצלחתי לקרוא את התמונה', 'bad'); }
      shrinking--; drawPics();
    }
  };
  $('#x-cam', el).onchange = ev => addFiles(ev.target);
  $('#x-gal', el).onchange = ev => addFiles(ev.target);
  drawPics();
  if (existing?.photoIds?.length) store.getPhotos(t.id, existing.id).then(list => {
    const saved = list.filter(p => existing.photoIds.includes(p.id) && L.isPhotoData(p.data));
    pics.unshift(...saved.map(p => ({ id: p.id, data: p.data }))); drawPics();
  }).catch(reportError);

  // ---- save / delete
  $('[data-x]', el).onclick = () => m.close();
  const del = $('[data-del]', el);
  if (del) del.onclick = async () => {
    if (await confirmBox('מחיקת תנועה', `למחוק את "${existing.details}"?`, { ok: 'מחיקה', danger: true })) {
      fire(store.deleteExpense(t.id, existing.id, existing.photoIds)); m.close(); toast('נמחק');
    }
  };
  $('form', el).onsubmit = async ev => {
    ev.preventDefault();
    if (r.loading) return toast('רגע, טוען שער…');
    if (shrinking) return toast('רגע, מעבד תמונה…');
    const amount = L.parseAmount(amt.value);
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
    const errors = L.validateExpense(x);
    $$('[data-f]', el).forEach(f => { const er = errors[f.dataset.f]; f.classList.toggle('invalid', !!er); $('.err', f).textContent = er || ''; });
    if (errors.rate) { toast('חסר שער המרה. הזינו שער ידני', 'bad'); return; }
    const bad = $('.invalid input, .invalid select', el);
    if (bad) { bad.focus(); return; }
    if (!categories.includes(x.category) && x.category !== L.UNCATEGORIZED) fire(store.addCategory(x.category));
    const eid = existing?.id || store.newExpenseId(t.id);
    const addPhotos = pics.filter(p => !p.id).map(p => ({ id: store.newPhotoId(t.id), data: p.data }));
    x.photoIds = L.nextPhotoIds(existing?.photoIds, removed, addPhotos.map(p => p.id));
    fire(store.saveExpense(t.id, eid, x, !existing, { addPhotos, removePhotos: removed }));
    m.close(); toast(existing ? 'עודכן' : 'נשמר ✓', 'good');
  };
  if (!existing) setTimeout(() => amt.focus(), 80);
}

// ---------------------------------------------------------------- admin
// Full-screen photo viewer with previous / next.
function photoViewer(list, start) {
  let i = start;
  const m = modal(`<div class="viewer"><img alt=""><div class="vbar">
      <button type="button" class="btn ghost sm" data-p aria-label="הקודמת">→</button>
      <span class="num" aria-live="polite"></span>
      <button type="button" class="btn ghost sm" data-n aria-label="הבאה">←</button>
      <button type="button" class="btn primary sm" data-x>סגירה</button></div></div>`, { label: 'תמונות' });
  m.el.classList.add('photo-dialog');
  const draw = () => {
    $('img', m.el).src = list[i];
    $('.vbar .num', m.el).textContent = `${i + 1} / ${list.length}`;
    $('[data-p]', m.el).disabled = i === 0; $('[data-n]', m.el).disabled = i === list.length - 1;
  };
  $('[data-p]', m.el).onclick = () => { if (i > 0) { i--; draw(); } };
  $('[data-n]', m.el).onclick = () => { if (i < list.length - 1) { i++; draw(); } };
  $('[data-x]', m.el).onclick = () => m.close();
  draw();
}

function adminPage() {
  view.innerHTML = `
    <header class="topbar"><a class="icon-btn" href="#/" title="חזרה" aria-label="חזרה">→</a><h1>⚙️ ניהול</h1>
      <button class="icon-btn" id="logout" title="יציאה מהניהול" aria-label="יציאה מהניהול">🚪</button></header>
    <div class="wrap">
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

  cleanups.push(store.onTrips(trips => {
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
    <div>📍 ${esc(t.location)} · ${esc(dateRange(t.startDate, t.endDate))} · מטבע: ${esc(t.defaultCurrency)}</div>
    <div>משתתפים: ${t.participants.map(esc).join(', ')}</div>
    ${groups.length ? `<div>קבוצות: ${groups.map(g => `${esc(g.name)} (${g.members.map(esc).join(', ')})`).join(' · ')}</div>` : ''}
    <h2>סיכום</h2>
    <div class="kpis">
      <div>סה"כ הוצאות<b class="n">${esc(f(s.totalExpenses))}</b></div><div>הכנסות / החזרים<b class="n">${esc(f(s.totalIncome))}</b></div>
      <div>מאזן נטו<b class="n">${esc(f(s.net))}</b></div><div>ממוצע ליום (${s.days})<b class="n">${esc(f(s.perDay))}</b></div>
      <div>ממוצע לאדם<b class="n">${esc(f(s.perPerson))}</b></div></div>
    <h2>לפי קטגוריות</h2>
    <table><thead><tr><th>קטגוריה</th><th>תנועות</th><th>סכום</th><th>%</th></tr></thead><tbody>
      ${cats.map(c => `<tr><td>${esc(c.name)}</td>${n(c.count)}${n(f(c.value))}${n(s.totalExpenses ? Math.round(c.value / s.totalExpenses * 100) + '%' : '')}</tr>`).join('')}</tbody></table>
    <h2>התחשבנות</h2>
    <table><thead><tr><th>משתתף</th><th>שילם</th><th>קיבל החזר</th><th>חלקו</th><th>יתרה</th></tr></thead><tbody>
      ${bal.map(b => `<tr><td>${esc(b.name)}</td>${n(f(b.paid))}${n(f(b.received))}${n(f(b.share))}${n(f(b.balance))}</tr>`).join('')}</tbody></table>
    ${tr.length ? `<p>${tr.map(x => `${esc(x.from)} מעביר/ה ל${esc(x.to)} <bdi>${esc(f(x.amount))}</bdi>`).join(' · ')}</p>` : '<p>כולם מאוזנים.</p>'}
    <h2>כל התנועות (${rows.length})</h2>
    <table><thead><tr><th>תאריך</th><th>סוג</th><th>קטגוריה</th><th>פירוט</th><th>הערה</th><th>שילם</th><th>סכום</th><th>במטבע הטיול</th></tr></thead><tbody>
      ${rows.map(e => `<tr><td class="n">${esc(formatDate(e.date))}</td><td>${e.type === 'income' ? 'הכנסה' : 'הוצאה'}</td><td>${esc(e.category)}</td>
        <td>${esc(e.details)}${e.address ? `<br><small>📍 ${esc(e.address)}</small>` : ''}</td><td>${esc(e.comment || '')}</td><td>${esc(e.paidBy)}</td>${n(L.formatMoney(e.amount, e.currency))}${n(f(e.convertedAmount))}</tr>`).join('')}</tbody></table>
    <p style="margin-top:6mm;color:#666;font-size:9pt">הופק בטיולון · ${esc(new Date().toLocaleString('he-IL'))}</p>`;
  const title = document.title;
  document.title = `טיולון - ${t.name}`; // becomes the PDF file name
  window.print();
  setTimeout(() => document.title = title, 500);
}
