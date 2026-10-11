// What Wingman learns from what you finish: how long things really take, and when you get things done.
import type { Area, Completion, Item } from './types';
import { formatDuration } from './dates';
import { t } from './i18n';

export const HISTORY_LIMIT = 400;

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-zÀ-ɏ֐-׿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/** How long you usually need for this title, from past timed sessions (needs 2+). */
export function durationForTitle(history: Completion[], title: string): number | null {
  const key = normTitle(title);
  if (!key) return null;
  const xs = history.filter((c) => c.actualMin && normTitle(c.title) === key).map((c) => c.actualMin!);
  return xs.length >= 2 ? round5(median(xs)) : null;
}

/** Actual ÷ planned time for an area (needs 3+ timed sessions), clamped to 0.6–2×. */
export function areaFactor(history: Completion[], areaId: string): number | null {
  const xs = history.filter((c) => c.areaId === areaId && c.actualMin && c.plannedMin > 0).map((c) => c.actualMin! / c.plannedMin);
  return xs.length >= 3 ? Math.min(2, Math.max(0.6, median(xs))) : null;
}

/** A better duration for planning this item, with a short note — or null if Wingman doesn't know better. */
export function learnedDuration(history: Completion[], item: Item): { min: number; note: string } | null {
  const byTitle = durationForTitle(history, item.title);
  if (byTitle && byTitle !== item.durationMin) return { min: byTitle, note: t('usually takes you {d}', { d: formatDuration(byTitle) }) };
  const f = areaFactor(history, item.areaId);
  if (f && Math.abs(f - 1) >= 0.15) {
    const min = round5(item.durationMin * f);
    if (min !== item.durationMin) return { min, note: f > 1 ? t('padded to {d}, you tend to run over', { d: formatDuration(min) }) : t('shortened to {d}, you tend to finish early', { d: formatDuration(min) }) };
  }
  return null;
}

/** Share of completions per hour of day (0–1, busiest hour = 1). Uses the area's own history once it has 5+. */
export function productiveHours(history: Completion[], areaId?: string): number[] | null {
  const own = areaId ? history.filter((c) => c.areaId === areaId) : [];
  const pool = own.length >= 5 ? own : history;
  if (pool.length < 8) return null;
  const counts = new Array(24).fill(0);
  for (const c of pool) counts[c.hour]++;
  const max = Math.max(...counts);
  return counts.map((n) => n / max);
}

/** Planner preference: average productivity over the hours a task would cover. */
export function preferenceFor(history: Completion[]) {
  const cache = new Map<string, number[] | null>();
  return (item: Item, startMin: number, durationMin: number): number | null => {
    if (!cache.has(item.areaId)) cache.set(item.areaId, productiveHours(history, item.areaId));
    const w = cache.get(item.areaId);
    if (!w) return null;
    let sum = 0, n = 0;
    for (let m = startMin; m < startMin + Math.max(durationMin, 1); m += 15) {
      sum += w[Math.floor(m / 60) % 24];
      n++;
    }
    return sum / n;
  };
}

/** Short sentences for the Settings "What Wingman has learned" card. */
export function insightLines(history: Completion[], areas: Area[]): string[] {
  const lines: string[] = [];
  const w = productiveHours(history);
  if (w) {
    // Best two-hour window.
    let best = 0, at = 0;
    for (let h = 0; h < 23; h++) if (w[h] + w[h + 1] > best) [best, at] = [w[h] + w[h + 1], h];
    lines.push(t('You get the most done between {from} and {to}.', { from: `${String(at).padStart(2, '0')}:00`, to: `${String(at + 2).padStart(2, '0')}:00` }));
  }
  for (const a of areas) {
    const f = areaFactor(history, a.id);
    if (f && Math.abs(f - 1) >= 0.15) lines.push(f > 1 ? t('{area} takes you {x}× longer than planned.', { area: a.name, x: f.toFixed(1) }) : t('{area} takes you {p}% less time than planned.', { area: a.name, p: Math.round((1 - f) * 100) }));
  }
  return lines;
}
