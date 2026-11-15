// Small touch-friendly charts: a compact category breakdown, and day bars.
import { esc } from './ui.js';

export const PALETTE = ['#7DD3FC', '#C4B5FD', '#FDA4AF', '#6EE7B7', '#FCD34D', '#A5B4FC', '#F9A8D4', '#5EEAD4', '#FDBA74', '#BEF264'];

// Compact breakdown: one stacked bar + a row per item (top `top`, the rest behind "עוד").
// items: [{name, value, count}] sorted big→small, fmt: number -> string
export function breakdown(host, items, { fmt, label = x => x, top = 5 }) {
  const total = items.reduce((a, d) => a + d.value, 0);
  if (!items.length || total <= 0) {
    host.innerHTML = `<div class="empty-chart">אין עדיין נתונים להצגה</div>`;
    return;
  }
  const max = items[0].value;
  const pct = v => Math.round(v / total * 100);
  const color = i => PALETTE[i % PALETTE.length];
  const hidden = items.length > top + 1 ? items.slice(top) : []; // never hide just one row
  const restSum = hidden.reduce((a, d) => a + d.value, 0);
  host.innerHTML = `
    <div class="bd-stack" aria-hidden="true">${items.map((d, i) => `<i style="flex:${d.value};background:${color(i)}"></i>`).join('')}</div>
    <div class="bd-rows">${items.map((d, i) => `<button type="button" class="bd-row${i >= items.length - hidden.length && hidden.length ? ' more-row' : ''}" data-i="${i}">
      <span class="bd-top"><span class="bd-name">${esc(label(d.name))}</span><bdi class="bd-amt money">${esc(fmt(d.value))}</bdi><span class="bd-pct num">${pct(d.value)}%</span></span>
      <span class="bd-track"><i style="width:${Math.max(d.value / max * 100, 1)}%;background:${color(i)}"></i></span>
      <span class="bd-info num" hidden>${d.count} תנועות · ${pct(d.value)}% מהסה"כ</span></button>`).join('')}</div>
    ${hidden.length ? `<button type="button" class="bd-more" aria-expanded="false">עוד ${hidden.length} (<span class="num">${pct(restSum)}%</span>) ▾</button>` : ''}`;
  host.querySelectorAll('.bd-row').forEach(b => b.addEventListener('click', () => {
    const on = !b.classList.contains('on');
    host.querySelectorAll('.bd-row').forEach(x => { x.classList.remove('on'); x.querySelector('.bd-info').hidden = true; });
    b.classList.toggle('on', on); b.querySelector('.bd-info').hidden = !on;
  }));
  const more = host.querySelector('.bd-more');
  if (more) more.addEventListener('click', () => {
    const open = more.getAttribute('aria-expanded') !== 'true';
    host.classList.toggle('bd-open', open);
    more.setAttribute('aria-expanded', open);
    more.innerHTML = open ? 'פחות ▴' : `עוד ${hidden.length} (<span class="num">${pct(restSum)}%</span>) ▾`;
  });
}

// days: [{name: 'YYYY-MM-DD', value, count}]
export function bars(host, days, { fmt, total }) {
  if (!days.length) { host.innerHTML = `<div class="empty-chart">אין עדיין נתונים להצגה</div>`; return; }
  const max = Math.max(...days.map(d => d.value));
  const short = iso => { const [, m, d] = iso.split('-'); return `${+d}.${+m}`; };
  host.innerHTML = `
    <div class="bars-scroll"><div class="bars" style="min-width:${days.length * 34}px">
      ${days.map((d, i) => `<button type="button" class="bar" data-i="${i}" aria-label="${short(d.name)}">
        <span class="bar-fill" style="height:${Math.max(d.value / max * 100, 2)}%"><b class="num">${Math.round(d.value)}</b></span>
        <span class="bar-lbl num">${short(d.name)}</span></button>`).join('')}
    </div></div>
    <div class="tip num">👆 לחצו על עמודה לפרטי היום</div>`;
  const tip = host.querySelector('.tip');
  let cur = -1;
  host.querySelectorAll('.bar').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i; cur = cur === i ? -1 : i;
    host.querySelectorAll('.bar').forEach(x => x.classList.toggle('on', +x.dataset.i === cur));
    if (cur < 0) { tip.textContent = '👆 לחצו על עמודה לפרטי היום'; return; }
    const d = days[cur];
    const date = new Date(d.name + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
    tip.innerHTML = `${esc(date)} · <bdi class="money">${fmt(d.value)}</bdi> · ${d.count} תנועות${total > 0 ? ` · ${Math.round(d.value / total * 100)}% מהטיול` : ''}`;
  }));
}
