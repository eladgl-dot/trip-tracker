// Languages: Hebrew (the source text), English, Russian. t('עברית') returns the text in the chosen language.
// The Hebrew text itself is the key; translations live in i18n-dict.js. Missing ones fall back to Hebrew.
// Chosen per phone with the 🌐 pill on home; the first time: the phone's language if he/en/ru, otherwise Hebrew.
import { EN, RU } from './i18n-dict.js';

export const LANGS = [
  { code: 'he', short: 'עב', name: 'עברית' },
  { code: 'en', short: 'EN', name: 'English' },
  { code: 'ru', short: 'RU', name: 'Русский' },
];
const KEY = 'tt-lang';
const DICT = { en: EN, ru: RU };

export function pickLang(saved, phoneLangs = []) {
  if (LANGS.some(l => l.code === saved)) return saved;
  for (const p of phoneLangs) {
    const c = String(p || '').toLowerCase().slice(0, 2);
    if (c === 'iw' || c === 'he') return 'he';
    if (c === 'en' || c === 'ru') return c;
  }
  return 'he';
}

let saved = null;
try { saved = localStorage.getItem(KEY); } catch {}
export let lang = pickLang(saved, typeof navigator === 'undefined' ? [] : navigator.languages || [navigator.language]);

export function setLang(code) {
  if (!LANGS.some(l => l.code === code)) return;
  lang = code;
  try { localStorage.setItem(KEY, code); } catch {}
  applyDir();
}
export const isRtl = () => lang === 'he';
export const locale = () => ({ he: 'he-IL', en: 'en-GB', ru: 'ru-RU' })[lang];

// For tests: translate in a given language.
export function tIn(code, he, vars) {
  let s = code === 'he' ? he : DICT[code]?.[he] ?? he;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}
let held = false; // the admin panel shows Hebrew whatever the chosen language
export const t = (he, vars) => tIn(held ? 'he' : lang, he, vars);
export function holdHebrew(on) {
  held = !!on;
  if (typeof document === 'undefined') return;
  if (held) { document.documentElement.dir = 'rtl'; document.documentElement.lang = 'he'; } else applyDir();
}

// Arrows that point "back" / "forward" in reading direction.
export const backArrow = () => (isRtl() ? '→' : '←');
export const fwdArrow = () => (isRtl() ? '←' : '→');

export function applyDir() {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.lang = lang; html.dir = isRtl() ? 'rtl' : 'ltr';
  document.title = t('טיולון – הוצאות טיול');
}
applyDir();
// Marks a text that is translated later, when it is shown (tests/i18n-keys.mjs finds it).
export const N = s => s;
