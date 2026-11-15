// DOM helpers: escaping, modals, toasts, confirm.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function formatDate(iso, opts = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('he-IL', opts);
}
export function dateRange(a, b) {
  if (!a && !b) return 'ללא תאריכים';
  if (a && b) return `${formatDate(a, { day: '2-digit', month: '2-digit' })} – ${formatDate(b)}`;
  return formatDate(a || b);
}
export const todayIso = () => {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

let toastTimer;
export function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast on ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = 'toast', 3200);
}

const openModals = new Set();
// Closes every open modal properly (listeners included). Used on navigation.
export const closeAll = () => [...openModals].forEach(close => close(undefined));

// Opens a modal. `build(el, close)` fills it. Returns a promise resolved with close(value).
export function modal(html, { sheet = false, label = '' } = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="${sheet ? 'sheet' : 'dialog'}" role="dialog" aria-modal="true" aria-label="${esc(label)}">${sheet ? '<div class="grab"></div>' : ''}${html}</div>`;
  document.body.appendChild(scrim);
  document.body.classList.add('modal-open');
  const el = scrim.firstElementChild;
  let done;
  const result = new Promise(r => done = r);
  const close = value => {
    if (!openModals.delete(close)) return; // already closed
    scrim.classList.remove('on');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { scrim.remove(); if (!$('.scrim')) document.body.classList.remove('modal-open'); }, 160);
    done(value);
  };
  openModals.add(close);
  const onKey = e => { if (e.key === 'Escape' && [...openModals].pop() === close) close(undefined); }; // only the top one
  document.addEventListener('keydown', onKey);
  scrim.addEventListener('mousedown', e => { if (e.target === scrim) close(undefined); });
  requestAnimationFrame(() => scrim.classList.add('on'));
  return { el, close, result };
}

export function confirmBox(title, text, { ok = 'אישור', danger = false } = {}) {
  const m = modal(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
    <div class="row2"><button class="btn ghost" data-x>ביטול</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button></div>`, { label: title });
  m.el.querySelector('[data-x]').onclick = () => m.close(false);
  m.el.querySelector('[data-ok]').onclick = () => m.close(true);
  m.el.querySelector('[data-ok]').focus();
  return m.result;
}

// A digits-only code prompt (trip PIN / admin code). check(code) -> true | false (async ok).
export function codePrompt({ title, text, length, check, note = '' }) {
  const m = modal(`<h2 class="center">${esc(title)}</h2><p class="muted center">${esc(text)}</p>
    <form novalidate>
      <input class="code num" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
        maxlength="${length}" aria-label="${esc(text)}" required>
      <p class="err center" aria-live="polite"></p>
      ${note ? `<p class="muted center small">${esc(note)}</p>` : ''}
      <div class="row2"><button type="button" class="btn ghost" data-x>ביטול</button><button class="btn primary">כניסה</button></div>
    </form>`, { label: title });
  const input = m.el.querySelector('input'), err = m.el.querySelector('.err');
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, length); err.textContent = ''; });
  m.el.querySelector('[data-x]').onclick = () => m.close(false);
  m.el.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    if (input.value.length !== length) { err.textContent = `יש להזין ${length} ספרות`; return; }
    if (await check(input.value)) m.close(true);
    else { err.textContent = 'קוד שגוי, נסו שוב'; input.select(); m.el.classList.add('shake'); setTimeout(() => m.el.classList.remove('shake'), 400); }
  };
  setTimeout(() => input.focus(), 60);
  return m.result;
}

// Show a store error without breaking the screen.
export function reportError(err) {
  console.error(err);
  const msg = String(err?.code || err?.message || err);
  if (msg.includes('permission')) toast('אין הרשאה למסד הנתונים. האם חוקי Firestore פורסמו?', 'bad');
  else toast('שגיאה: ' + msg, 'bad');
}
