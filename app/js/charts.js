// Small touch-friendly SVG charts: a donut with a tappable legend, and day bars.
import { esc } from './ui.js';

export const PALETTE = ['#7DD3FC', '#C4B5FD', '#FDA4AF', '#6EE7B7', '#FCD34D', '#A5B4FC', '#F9A8D4', '#5EEAD4', '#FDBA74', '#BEF264'];

// items: [{name, value, count}], fmt: number -> string
export function donut(host, items, { title, fmt, label = x => x }) {
  const total = items.reduce((a, d) => a + d.value, 0);
  if (!items.length || total <= 0) {
    host.innerHTML = `<div class="empty-chart">אין עדיין נתונים להצגה</div>`;
    return;
  }
  // Fold a long tail into "אחר" so the legend stays readable.
  let list = items;
  if (items.length > 8) {
    const rest = items.slice(7);
    list = [...items.slice(0, 7), { name: 'אחר', value: rest.reduce((a, d) => a + d.value, 0), count: rest.reduce((a, d) => a + d.count, 0), other: true }];
  }
  let acc = 0;
  const slices = list.map((d, i) => {
    const p = d.value / total * 100;
    const gap = list.length > 1 ? 0.6 : 0;
    const s = `<circle class="slice" data-i="${i}" cx="21" cy="21" r="15.915" stroke="${PALETTE[i % PALETTE.length]}"
      stroke-dasharray="${Math.max(p - gap, 0.01)} ${100 - p + gap}" stroke-dashoffset="${-acc}"><title>${esc(label(d.name))}</title></circle>`;
    acc += p; return s;
  }).join('');
  host.innerHTML = `
    <div class="donut-wrap">
      <div class="donut"><svg viewBox="0 0 42 42" role="img" aria-label="${esc(title)}">
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--track)" stroke-width="6.5"/>${slices}</svg>
        <div class="donut-center"></div></div>
      <ul class="legend">${list.map((d, i) => `<li><button type="button" data-i="${i}"><i style="background:${PALETTE[i % PALETTE.length]}"></i>
        <span class="lg-name">${esc(label(d.name))}</span><span class="lg-pct num">${Math.round(d.value / total * 100)}%</span></button></li>`).join('')}</ul>
    </div>
    <p class="hint">👆 לחיצה על פרוסה או שורה מציגה סכום, אחוז ומספר תנועות</p>`;
  const box = host.querySelector('.donut'), center = host.querySelector('.donut-center');
  let current = -1;
  const show = i => {
    current = i;
    box.classList.toggle('sel', i >= 0);
    host.querySelectorAll('.slice').forEach(c => c.classList.toggle('on', +c.dataset.i === i));
    host.querySelectorAll('.legend button').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
    if (i < 0) center.innerHTML = `<span>${esc(title)}</span><b class="money">${fmt(total)}</b>`;
    else {
      const d = list[i];
      center.innerHTML = `<span>${esc(label(d.name))}</span><b class="money">${fmt(d.value)}</b><span class="num">${Math.round(d.value / total * 100)}% · ${d.count} תנועות</span>`;
    }
  };
  const toggle = i => show(current === i ? -1 : i);
  host.querySelectorAll('.slice').forEach(c => c.addEventListener('click', () => toggle(+c.dataset.i)));
  host.querySelectorAll('.legend button').forEach(b => b.addEventListener('click', () => toggle(+b.dataset.i)));
  show(-1);
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
