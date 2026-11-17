// Lists every Hebrew text the app shows, so each one has English and Russian.
// Texts in code: t('…'), T('…'), tr('…'), N('…'). Texts from logic.js shown with t(): categories, currencies, colours, errors, group labels.
import { readFileSync } from 'node:fs';
import * as L from '../app/js/logic.js';

const FILES = ['app.js', 'ui.js', 'charts.js', 'ocr.js', 'i18n.js'];
const CALL = /\b(?:t|T|tr|N)\(\s*'((?:[^'\\]|\\.)*)'/g;
const hebrew = s => /[֐-׿]/.test(s);

export function appKeys(root = new URL('../app/js/', import.meta.url)) {
  const keys = new Set();
  for (const f of FILES) {
    let src = readFileSync(new URL(f, root), 'utf8');
    if (f === 'app.js') src = src.slice(0, src.indexOf('function adminPage()')) + src.slice(src.indexOf('function printReport(')); // admin panel stays Hebrew
    for (const m of src.matchAll(CALL)) if (hebrew(m[1])) keys.add(m[1].replace(/\\'/g, "'"));
  }
  const errs = [...Object.values(L.validateTrip({ budget: { amount: 0 }, startDate: '2', endDate: '1', pin: '' })), ...Object.values(L.validateTrip({ budget: { amount: 5, per: 'day' } })),
    ...Object.values(L.validateExpense({}))];
  for (const k of [...L.DEFAULT_CATEGORIES, L.UNCATEGORIZED, ...L.CURRENCIES.map(c => c.name), ...L.TRIP_COLORS.map(c => c.name),
    L.NO_DATE, L.NO_TAG, L.MANY_COUNTRIES, L.NO_COUNTRY, ...errs]) keys.add(k);
  return [...keys];
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const keys = appKeys();
  console.log(JSON.stringify(keys, null, 1));
  console.error(keys.length + ' texts');
}

// Hebrew written in the code but NOT wrapped in t()/T()/tr()/N() (comments and the admin panel ignored).
export function unwrappedHebrew(root = new URL('../app/js/', import.meta.url)) {
  const out = [];
  for (const f of ['app.js', 'ui.js', 'charts.js', 'ocr.js']) {
    const lines = readFileSync(new URL(f, root), 'utf8').split('\n');
    let admin = false;
    lines.forEach((line, i) => {
      if (f === 'app.js' && /^function adminPage\(\)/.test(line)) admin = true;
      if (f === 'app.js' && /^function printReport\(/.test(line)) admin = false;
      if (admin) return;
      const code = line.replace(/\b(?:t|T|tr|N)\(\s*'(?:[^'\\]|\\.)*'/g, '').replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, '');
      if (/[֐-׿]/.test(code)) out.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return out;
}
