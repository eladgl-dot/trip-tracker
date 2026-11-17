// Receipt reading on the phone (Tesseract.js, owner Step 24: offline, no server).
// The library and the language files (~10 MB) download on the first scan; after that they come from the
// phone (service-worker cache + Tesseract's own IndexedDB copy), so scanning works on a plane too.
const LIB = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/';
const CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1';
const LANGS = ['eng', 'heb', 'rus']; // Latin receipts (Italian, French…), Hebrew, Cyrillic (Russian, Bulgarian)

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
  const w = window.Tesseract.createWorker(LANGS, 1, {
    workerPath: LIB + 'worker.min.js', corePath: CORE,
    logger: m => onStep?.(m)
  });
  worker = w.catch(err => { worker = null; throw err; });
  return worker;
}

// Grey, stretched contrast, at most 2000 px: thermal receipts read much better this way.
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const img = g.getImageData(0, 0, w, h), d = img.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = y; if (y < lo) lo = y; if (y > hi) hi = y;
  }
  const span = Math.max(1, hi - lo - 40);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, (d[i] - lo - 20) * 255 / span));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// progress(fraction 0..1, text) while it works. Returns the receipt text.
export async function readReceipt(file, progress = () => {}) {
  progress(0.02, 'מכין את התמונה…');
  const canvas = await prepare(file);
  const first = !worker;
  progress(0.05, first ? 'טוען את קבצי הזיהוי… (בפעם הראשונה ~10MB)' : 'קורא את הקבלה…');
  onStep = m => {
    if (m.status === 'recognizing text') progress(0.3 + 0.7 * (m.progress || 0), 'קורא את הקבלה…');
    else if (/load|initializ/.test(m.status || '')) progress(0.05 + 0.25 * (m.progress || 0), first ? 'טוען את קבצי הזיהוי… (בפעם הראשונה ~10MB)' : 'מכין…');
  };
  try {
    const w = await getWorker();
    const { data } = await w.recognize(canvas);
    return data.text || '';
  } finally { onStep = null; }
}
