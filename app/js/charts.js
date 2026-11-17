// Small touch-friendly charts: a compact category breakdown, and day bars.
import { esc, formatDate } from './ui.js';
import { t } from './i18n.js';

export const PALETTE = ['#7DD3FC', '#C4B5FD', '#FDA4AF', '#6EE7B7', '#FCD34D', '#A5B4FC', '#F9A8D4', '#5EEAD4', '#FDBA74', '#BEF264'];

// Compact breakdown: one stacked bar + a row per item (top `top`, the rest behind "עוד").
// items: [{name, value, count}] sorted big→small, fmt: number -> string
// selected: name of the row to show as tapped; onSelect(name | null) is called when a row is tapped.
export function breakdown(host, items, { fmt, label = x => x, top = 5, selected = null, onSelect = null }) {
  const total = items.reduce((a, d) => a + d.value, 0);
  if (!items.length || total <= 0) {
    host.innerHTML = `<div class="empty-chart">${t('אין עדיין נתונים להצגה')}</div>`;
    return;
  }
  const max = items[0].value;
  const pct = v => Math.round(v / total * 100);
  const color = i => PALETTE[i % PALETTE.length];
  const hidden = items.length > top + 1 ? items.slice(top) : []; // never hide just one row
  const restSum = hidden.reduce((a, d) => a + d.value, 0);
  host.innerHTML = `
    <div class="bd-stack" aria-hidden="true">${items.map((d, i) => `<i style="flex:${d.value};background:${color(i)}"></i>`).join('')}</div>
    <div class="bd-rows">${items.map((d, i) => `<button type="button" class="bd-row${i >= items.length - hidden.length && hidden.length ? ' more-row' : ''}" data-i="${i}"${onSelect ? ' aria-pressed="false"' : ''}>
      <span class="bd-top"><span class="bd-name">${esc(label(d.name))}</span><bdi class="bd-amt money">${esc(fmt(d.value))}</bdi><span class="bd-pct num">${pct(d.value)}%</span></span>
      <span class="bd-track"><i style="width:${Math.max(d.value / max * 100, 1)}%;background:${color(i)}"></i></span>
      <span class="bd-info num" hidden>${t('{n} תנועות', { n: d.count })} · ${t('{p}% מהסה"כ', { p: pct(d.value) })}${onSelect ? ' · ' + t('ראשונות ברשימה') + ' ↓' : ''}</span></button>`).join('')}</div>
    ${hidden.length ? `<button type="button" class="bd-more" aria-expanded="false">${t('עוד {n}', { n: hidden.length })} (<span class="num">${pct(restSum)}%</span>) ▾</button>` : ''}`;
  const mark = b => {
    host.querySelectorAll('.bd-row').forEach(x => { x.classList.toggle('on', x === b); if (onSelect) x.setAttribute('aria-pressed', x === b); x.querySelector('.bd-info').hidden = x !== b; });
  };
  host.querySelectorAll('.bd-row').forEach(b => b.addEventListener('click', () => {
    const on = !b.classList.contains('on');
    mark(on ? b : null);
    if (onSelect) onSelect(on ? items[+b.dataset.i].name : null);
  }));
  const more = host.querySelector('.bd-more');
  const setOpen = open => {
    host.classList.toggle('bd-open', open);
    more.setAttribute('aria-expanded', open);
    more.innerHTML = open ? t('פחות') + ' ▴' : `${t('עוד {n}', { n: hidden.length })} (<span class="num">${pct(restSum)}%</span>) ▾`;
  };
  if (more) more.addEventListener('click', () => setOpen(more.getAttribute('aria-expanded') !== 'true'));
  else host.classList.remove('bd-open');
  const si = selected == null ? -1 : items.findIndex(d => d.name === selected);
  if (si >= 0) {
    mark(host.querySelector(`.bd-row[data-i="${si}"]`));
  }
  if (more) setOpen(host.classList.contains('bd-open'));
}

// days: [{name: 'YYYY-MM-DD', value, count}]
// selected: day (YYYY-MM-DD) to show as tapped; onSelect(day | null) is called when a bar is tapped.
export function bars(host, days, { fmt, total, selected = null, onSelect = null }) {
  if (!days.length) { host.innerHTML = `<div class="empty-chart">${t('אין עדיין נתונים להצגה')}</div>`; return; }
  const max = Math.max(...days.map(d => d.value));
  const short = iso => formatDate(iso, {}); // dd/mm
  host.innerHTML = `
    <div class="bars-scroll"><div class="bars" style="min-width:${days.length * 34}px">
      ${days.map((d, i) => `<button type="button" class="bar" data-i="${i}" aria-label="${short(d.name)}"${onSelect ? ' aria-pressed="false"' : ''}>
        <span class="bar-fill" style="height:${Math.max(d.value / max * 100, 2)}%"><b class="num">${Math.round(d.value)}</b></span>
        <span class="bar-lbl num">${short(d.name)}</span></button>`).join('')}
    </div></div>
    <div class="tip num">👆 ${t('לחצו על עמודה לפרטי היום')}</div>`;
  const tip = host.querySelector('.tip');
  let cur = -1;
  const show = () => {
    host.querySelectorAll('.bar').forEach(x => { x.classList.toggle('on', +x.dataset.i === cur); if (onSelect) x.setAttribute('aria-pressed', +x.dataset.i === cur); });
    if (cur < 0) { tip.textContent = '👆 ' + t('לחצו על עמודה לפרטי היום'); return; }
    const d = days[cur];
    const date = formatDate(d.name, { weekday: 'short' });
    tip.innerHTML = `${esc(date)} · <bdi class="money">${fmt(d.value)}</bdi> · ${t('{n} תנועות', { n: d.count })}${total > 0 ? ` · ${t('{p}% מהטיול', { p: Math.round(d.value / total * 100) })}` : ''}${onSelect ? ' · ' + t('ראשונות ברשימה') + ' ↓' : ''}`;
  };
  host.querySelectorAll('.bar').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i; cur = cur === i ? -1 : i;
    show();
    if (onSelect) onSelect(cur < 0 ? null : days[cur].name);
  }));
  cur = selected == null ? -1 : days.findIndex(d => d.name === selected);
  if (cur >= 0) show();
}
