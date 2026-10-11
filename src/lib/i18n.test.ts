import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HE } from './he';
import { setLang, t, tn } from './i18n';
import { formatDuration, longDate, prettyDate, startOfWeek } from './dates';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(f) && !f.includes('.test.') ? [p] : [];
  });
}

// Strings passed to t() through a variable (option lists, error messages).
const INDIRECT = [
  'No reminder', 'At the time', '5 min before', '10 min before', '15 min before', '30 min before', '1 hour before', '2 hours before', '1 day before',
  'Push', 'Email', 'Alarm', 'Silent', 'Task', 'Event', 'Reminder', 'Auto', 'Light', 'Dark',
  'Couldn’t unlock the synced data. Check the sync code.', 'Offline — will sync when you’re back online',
  'That code doesn’t look right. It has 32 letters and numbers.', 'Sync kept conflicting; will retry shortly.',
  'Server storage is not set up yet', 'This file is not a Wingman backup.',
];

describe('Hebrew translations', () => {
  it('cover every string the app shows', () => {
    const keys = new Set(INDIRECT);
    for (const f of sources(join(__dirname, '..'))) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
      for (const m of s.matchAll(/\btn\([^,]+,\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'/g)) {
        keys.add(m[1].replace(/\\'/g, "'"));
        keys.add(m[2].replace(/\\'/g, "'"));
      }
    }
    const missing = [...keys].filter((k) => !(k in HE));
    expect(missing).toEqual([]);
  });

  it('keep the same {placeholders}', () => {
    const bad = Object.entries(HE).filter(([en, he]) => {
      const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
      // Hebrew may drop {n} when it spells out "one" (e.g. "פריט אחד").
      return ph(he) !== ph(en) && !(ph(en) === 'n' && ph(he) === '');
    });
    expect(bad).toEqual([]);
  });

  it('formats dates and durations in Hebrew', () => {
    setLang('he');
    try {
      expect(t('Today')).toBe('היום');
      expect(tn(3, '{n} item', '{n} items')).toBe('3 פריטים');
      expect(longDate('2026-10-11')).toBe('יום ראשון, 11 באוקטובר');
      expect(prettyDate('2026-10-15')).toBe('ה׳, 15 באוקטובר');
      expect(formatDuration(90)).toBe('שעה ו-30 דק׳');
      expect(formatDuration(120)).toBe('שעתיים');
    } finally {
      setLang('en');
    }
    expect(startOfWeek('2026-10-14', 0)).toBe('2026-10-11');
    expect(startOfWeek('2026-10-14', 1)).toBe('2026-10-12');
  });
});
