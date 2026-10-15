// Translations. English text is the key; Hebrew comes from HE (src/lib/he.ts). Missing keys fall back to English.
import { HE } from './he';

export type Lang = 'en' | 'he';
let lang: Lang = 'en';

export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
}

/** Translate, filling {name} placeholders. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = lang === 'he' ? HE[key] ?? key : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      // In Hebrew, keep times like 06:30 left-to-right so "ל-06:30" doesn't flip to "06:30-ל".
      const val = lang === 'he' && /^\d{1,2}:\d{2}/.test(String(v)) ? `\u2066${v}\u2069` : String(v);
      s = s.split(`{${k}}`).join(val);
    }
  }
  return s;
}

/** Singular/plural: tn(3, '{n} item', '{n} items'). */
export function tn(n: number, one: string, many: string, vars?: Record<string, string | number>): string {
  return t(n === 1 ? one : many, { n, ...vars });
}

export const isRtl = () => lang === 'he';
