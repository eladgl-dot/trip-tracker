// Receipt reading on the phone (Tesseract.js, owner Step 24: offline, no server).
// The library and the language files download on the first scan; after that they come from the
// phone (service-worker cache + Tesseract's own IndexedDB copy), so scanning works on a plane too.
import { t } from './i18n.js';
const LIB = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/';
const CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1';
const LANGS = ['eng', 'heb', 'rus']; // Latin receipts (Italian, French…), Hebrew, Cyrillic (Russian, Bulgarian)
export const OCR_CFG = { langPath: undefined, cachePath: undefined, prep: { crop: true, mode: 'flat' } }; // the bench changes these
// Step 26 bench (fake phone photos, Hebrew + Italian): crop + shadow removed ('flat') + table painted white read the most
// words (hard set 28% → 73%). Black/white per area (Bradley), Tesseract's straightening and the larger Hebrew model did not help.

let lib = null, worker = null, onStep = null;

function loadLib() {
  if (window.Tesseract) return Promise.resolve();
  return lib ||= new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = LIB + 'tesseract.min.js'; s.crossOrigin = 'anonymous';
    s.onload = ok; s.onerror = () => { lib = null; s.remove(); bad(new Error('ocr-load')); };
    document.head.append(s);
  });
}

async function getWorker() {
  if (worker) return worker;
  await loadLib();
  const opts = { workerPath: LIB + 'worker.min.js', corePath: CORE, logger: m => onStep?.(m) };
  if (OCR_CFG.langPath) { opts.langPath = OCR_CFG.langPath; opts.cachePath = OCR_CFG.cachePath || OCR_CFG.langPath; }
  const w = window.Tesseract.createWorker(LANGS, 1, opts);
  worker = w.catch(err => { worker = null; throw err; });
  return worker;
}
export async function resetWorker() { const w = await worker?.catch(() => null); worker = null; await w?.terminate(); }

const luma = (d, i) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;

// Otsu: the grey level that best splits dark from light, with the mean of each side.
function otsu(grey) {
  const hist = new Array(256).fill(0);
  for (const v of grey) hist[Math.min(255, v | 0)]++;
  const n = grey.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = -1, th = 128, dark = 0, light = 255;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break;
    sB += i * hist[i];
    const mB = sB / wB, mF = (sum - sB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; th = i; dark = mB; light = mF; }
  }
  return { th, dark, light };
}
// The longest run of true values in a list → [start, end] (end exclusive).
function longestRun(flags) {
  let best = [0, 0], s = -1;
  flags.forEach((f, i) => { if (f && s < 0) s = i; if ((!f || i === flags.length - 1) && s >= 0) { const e = f ? i + 1 : i; if (e - s > best[1] - best[0]) best = [s, e]; s = -1; } });
  return best;
}
// Where the paper is: the light area that stands out from a darker table. null = the photo is (almost) all receipt.
// The line between paper and table sits low (a third of the way from table to paper), so a shadow on the paper still counts as paper.
function findPaper(bmp) {
  const k = Math.min(1, 300 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h; // (OffscreenCanvas is missing on older iPhones)
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, grey = new Float32Array(w * h);
  for (let i = 0; i < grey.length; i++) grey[i] = luma(d, i * 4);
  const { dark, light: lightMean } = otsu(grey);
  if (lightMean - dark < 40) return null; // no clear paper on a table
  const th = dark + (lightMean - dark) / 3;
  const light = i => grey[i] > th;
  const cols = []; for (let x = 0; x < w; x++) { let n = 0; for (let y = 0; y < h; y++) n += light(y * w + x); cols.push(n / h > 0.15); }
  const [x0, x1] = longestRun(cols);
  const rows = []; for (let y = 0; y < h; y++) { let n = 0; for (let x = x0; x < x1; x++) n += light(y * w + x); rows.push(n / Math.max(1, x1 - x0) > 0.3); }
  const [y0, y1] = longestRun(rows);
  const area = (x1 - x0) * (y1 - y0) / (w * h);
  if (area < 0.06 || area > 0.85) return null;
  const m = 0.04 * Math.max(w, h);
  const X0 = Math.max(0, x0 - m), Y0 = Math.max(0, y0 - m), X1 = Math.min(w, x1 + m), Y1 = Math.min(h, y1 + m);
  // the table: dark pixels reached from the photo's edge (text is closed in by paper, so it is never reached)
  const table = new Uint8Array(w * h), todo = [];
  const push = i => { if (!table[i] && !light(i)) { table[i] = 1; todo.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (todo.length) { const i = todo.pop(), x = i % w; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (i >= w) push(i - w); if (i < w * (h - 1)) push(i + w); }
  return { x: X0 / k, y: Y0 / k, w: (X1 - X0) / k, h: (Y1 - Y0) / k, table, tw: w, k };
}
// Sum of a box of pixels from a summed-area table.
function boxMean(grey, w, h, r) {
  const I = new Float64Array((w + 1) * (h + 1)), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += grey[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
      out[y * w + x] = (I[yb * (w + 1) + xb] - I[ya * (w + 1) + xb] - I[yb * (w + 1) + xa] + I[ya * (w + 1) + xa]) / ((xb - xa) * (yb - ya));
    }
  }
  return out;
}
// The paper's brightness around each pixel, worked out on a 4× smaller copy (easy on a phone's memory).
function background(grey, w, h, r) {
  const s = 4, sw = Math.ceil(w / s), sh = Math.ceil(h / s), small = new Float32Array(sw * sh), n = new Uint8Array(sw * sh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = (y >> 2) * sw + (x >> 2); small[j] += grey[y * w + x]; n[j]++; }
  for (let j = 0; j < small.length; j++) small[j] /= n[j] || 1;
  return { m: boxMean(small, sw, sh, Math.max(2, Math.round(r / s))), sw };
}
// mode 'gray': grey + stretched contrast (Step 24). 'flat': the paper's shading divided out, so a shadow or faded corner
// becomes white paper again; Tesseract then turns it black/white itself.
function clean(d, w, h, mode) {
  const v = new Float32Array(w * h);
  for (let i = 0; i < v.length; i++) v[i] = luma(d, i * 4);
  if (mode === 'flat') {
    const { m, sw } = background(v, w, h, Math.round(Math.max(w, h) / 20)), sh = m.length / sw;
    for (let y = 0; y < h; y++) {
      // blend the 4 nearest small pixels (no blocky steps)
      const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / 4 - 0.5)), y0 = fy | 0, y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < w; x++) {
        const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / 4 - 0.5)), x0 = fx | 0, x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
        const top = m[y0 * sw + x0] * (1 - tx) + m[y0 * sw + x1] * tx, bot = m[y1 * sw + x0] * (1 - tx) + m[y1 * sw + x1] * tx;
        const i = y * w + x; v[i] = Math.min(255, 255 * v[i] / Math.max(1, top * (1 - ty) + bot * ty));
      }
    }
  }
  { // stretch: the darkest 1% → black, the paper → white
    const hist = new Array(256).fill(0); for (let i = 0; i < v.length; i++) hist[Math.min(255, v[i] | 0)]++;
    let lo = 0, acc = 0; while (lo < 255 && (acc += hist[lo]) < v.length * 0.01) lo++;
    let hi = 255; acc = 0; while (hi > lo + 1 && (acc += hist[hi]) < v.length * 0.3) hi--;
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < v.length; i++) v[i] = Math.max(0, Math.min(255, (v[i] - lo) * 255 / span));
  }
  for (let i = 0; i < v.length; i++) { const j = i * 4; d[j] = d[j + 1] = d[j + 2] = v[i]; }
}
// Crop to the receipt (when it lies on a darker table) and clean it. At most 2000 px.
export async function prepare(file, { crop = true, mode = 'flat' } = {}) {
  const bmp = await createImageBitmap(file);
  const box = (crop && findPaper(bmp)) || { x: 0, y: 0, w: bmp.width, h: bmp.height };
  const k = Math.min(crop ? 2 : 1, 2000 / Math.max(box.w, box.h));
  const w = Math.round(box.w * k), h = Math.round(box.h * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, box.x, box.y, box.w, box.h, 0, 0, w, h); bmp.close?.();
  const img = g.getImageData(0, 0, w, h);
  clean(img.data, w, h, mode);
  if (box.table) { // paint the table (and the paper's shadow on it) white
    const d = img.data, th = box.table.length / box.tw;
    for (let y = 0; y < h; y++) {
      const sy = Math.min(th - 1, Math.floor((box.y + y / k) * box.k));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(box.tw - 1, Math.floor((box.x + x / k) * box.k));
        if (box.table[sy * box.tw + sx]) { const j = (y * w + x) * 4; d[j] = d[j + 1] = d[j + 2] = 255; }
      }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Every word with its line number and its box in image pixels: b = [x0, y0, x1, y1].
function wordsOf(data) {
  const out = []; let line = -1;
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    line++;
    for (const w of l.words || []) {
      const text = (w.text || '').trim(); if (!text) continue;
      const { x0, y0, x1, y1 } = w.bbox;
      out.push({ text, line, b: [x0, y0, x1, y1] });
    }
  }
  return out;
}

// progress(fraction 0..1, text) while it works.
// Returns { text, words, image, w, h }: image (w × h px) is the picture the words' boxes belong to (shown on the check screen).
export async function readReceipt(file, progress = () => {}) {
  progress(0.02, t('מכין את התמונה…'));
  const canvas = await prepare(file, OCR_CFG.prep);
  const first = !worker;
  progress(0.05, first ? t('טוען את קבצי הזיהוי… (בפעם הראשונה ~10MB)') : t('קורא את הקבלה…'));
  onStep = m => {
    if (m.status === 'recognizing text') progress(0.3 + 0.7 * (m.progress || 0), t('קורא את הקבלה…'));
    else if (/load|initializ/.test(m.status || '')) progress(0.05 + 0.25 * (m.progress || 0), first ? t('טוען את קבצי הזיהוי… (בפעם הראשונה ~10MB)') : t('מכין…'));
  };
  try {
    const w = await getWorker();
    const { data } = await w.recognize(canvas, {}, { text: true, blocks: true });
    return { text: data.text || '', words: wordsOf(data), image: canvas.toDataURL('image/jpeg', 0.8), w: canvas.width, h: canvas.height };
  } finally { onStep = null; }
}
