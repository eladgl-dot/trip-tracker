// Makes fake "phone photos" of Hebrew/Latin receipts: tilted paper on a dark table, a shadow, slight blur.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] || './ocr-img'; const HARD = process.argv[3] === 'hard'; mkdirSync(OUT, { recursive: true });
export const RECEIPTS = [
  { id: 'cafe', font: 'Miriam Fixed', rot: -4, shadow: 0.45, lines: ['קפה לנדוור', 'דיזנגוף 112 תל אביב', 'ע.מ 514233891', '17/11/2026  14:32', 'הפוך גדול        18.00', 'כריך טונה        42.90', 'מים מינרלים      12.00', 'טיפ              11.00', 'סה"כ לתשלום      84.90', 'אשראי ****4471', 'תודה ולהתראות!'], amount: 84.9, date: '2026-11-17', place: 'קפה לנדוור' },
  { id: 'super', font: 'Arial', rot: 3, shadow: 0.3, lines: ['שופרסל דיל', 'סניף רחובות', 'קופה 3   16/11/26 19:05', 'חלב תנובה 3%      6.90', 'לחם אחיד          8.50', 'עגבניות           12.40', 'גבינה צהובה       29.90', 'ביצים L 12        14.90', 'סה"כ              72.60', 'מזומן             100.00', 'עודף              27.40'], amount: 72.6, date: '2026-11-16', place: 'שופרסל דיל' },
  { id: 'pharm', font: 'David', rot: -2, shadow: 0.55, lines: ['סופר-פארם', 'קניון עזריאלי', 'תאריך: 15.11.2026', 'אקמול 20 טב׳     24.90', 'קרם הגנה SPF50    59.90', 'מברשת שיניים     14.90', 'סך הכל לתשלום    99.70', 'כולל מע"מ 17%', 'כרטיס אשראי'], amount: 99.7, date: '2026-11-15', place: 'סופר-פארם' },
  { id: 'rest', font: 'Courier New', rot: 5, shadow: 0.4, lines: ['מסעדת הדייג', 'נמל יפו', '14/11/2026', 'שולחן 7  סועדים 2', 'דג ים בגריל       118.00', 'סלט ירוק           38.00', 'לימונדה x2         32.00', 'סה"כ             188.00', 'שירות לא כלול'], amount: 188, date: '2026-11-14', place: 'מסעדת הדייג' },
  { id: 'it', font: 'Courier New', rot: -3, shadow: 0.35, lines: ['BAR PASTICCERIA ROMA', 'Via Garibaldi 12', 'P.IVA 01234567890', '13/11/2026 10:21', 'CAPPUCCINO        1,80', 'CORNETTO          1,50', 'SPREMUTA          3,50', 'TOTALE EURO       6,80', 'CONTANTI         10,00', 'RESTO             3,20'], amount: 6.8, date: '2026-11-13', place: 'BAR PASTICCERIA ROMA' },
  { id: 'gas', font: 'Arial', rot: 1.5, shadow: 0.6, lines: ['פז יילו', 'תחנת דלק גלילות', '12/11/2026 07:48', 'בנזין 95', 'ליטרים  41.20', 'מחיר לליטר  7.32', 'לתשלום         301.58', 'אשראי ****8812'], amount: 301.58, date: '2026-11-12', place: 'פז יילו' },
];
const html = r => `<!doctype html><html><body style="margin:0;width:900px;height:1400px;background:radial-gradient(circle at 30% 20%,#6b5a48,#2b241d);display:flex;align-items:center;justify-content:center;overflow:hidden">
<div style="position:relative;transform:rotate(${r.rot}deg);background:#f7f5ee;padding:40px 44px 60px;width:470px;box-shadow:0 20px 50px rgba(0,0,0,.6);font:${HARD ? 19 : 26}px/1.45 '${r.font}';color:${HARD ? '#6a6a6a' : '#2a2a2a'};direction:rtl;filter:blur(${HARD ? 1.1 : 0.6}px)">
${r.lines.map((l, i) => `<div style="white-space:pre;${i === 0 ? 'text-align:center;font-weight:700;font-size:32px' : ''}" dir="auto">${l}</div>`).join('')}
${HARD ? `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:.35;mix-blend-mode:multiply"><filter id=n><feTurbulence baseFrequency=".9" numOctaves="2"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>` : ''}<div style="position:absolute;inset:0;background:linear-gradient(115deg,rgba(0,0,0,0) 35%,rgba(0,0,0,${r.shadow}) 100%)"></div></div></body></html>`;
const b = await chromium.launch({ channel: 'msedge', headless: true });
const p = await b.newPage({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: HARD ? 3 : 1 });
for (const r of RECEIPTS) { await p.setContent(html(r)); await p.screenshot({ path: `${OUT}/${r.id}.jpg`, type: 'jpeg', quality: HARD ? 60 : 80 }); }
writeFileSync(`${OUT}/truth.json`, JSON.stringify(RECEIPTS.map(({ id, amount, date, place, lines }) => ({ id, amount, date, place, lines }))));
await b.close(); console.log('made', RECEIPTS.length);
