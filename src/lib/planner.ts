import type { Item } from './types';
import { minToTime, timeToMin } from './dates';
import { t } from './i18n';

export interface Suggestion {
  itemId: string;
  start: string;
  /** Minutes blocked out; may differ from the item's own estimate when Wingman has learned better. */
  durationMin: number;
  reason: string;
}

export interface PlanOptions {
  dayStart: string;
  dayEnd: string;
  bufferMin: number;
  /** Minutes since midnight to start planning from (now, for today). */
  notBeforeMin?: number;
  overdueIds?: Set<string>;
  /** Learned duration for a task, if Wingman knows better than the estimate. */
  estimate?: (item: Item) => { min: number; note: string } | null;
  /** How good a start time is for this task, 0–1 (e.g. from the hours you usually get things done). */
  preference?: (item: Item, startMin: number, durationMin: number) => number | null;
}

const roundUp5 = (m: number) => Math.ceil(m / 5) * 5;
const STEP = 30;

/**
 * Fit untimed tasks into the free gaps between fixed items.
 * Overdue first, then longest first (big tasks are hardest to place). Overdue tasks take the earliest slot;
 * others take the slot that best matches when you usually get things done, falling back to the earliest.
 */
export function planDay(fixed: Item[], toPlace: Item[], opts: PlanOptions): { suggestions: Suggestion[]; unplaced: Item[] } {
  const buf = opts.bufferMin;
  const busy: [number, number][] = fixed
    .filter((i) => i.start)
    .map((i) => [timeToMin(i.start!) - buf, timeToMin(i.start!) + i.durationMin + buf]);

  const windowStart = roundUp5(Math.max(timeToMin(opts.dayStart), opts.notBeforeMin ?? 0));
  const windowEnd = timeToMin(opts.dayEnd);

  const est = new Map(toPlace.map((t) => [t.id, opts.estimate?.(t) ?? null]));
  const dur = (t: Item) => est.get(t.id)?.min ?? t.durationMin;

  const order = [...toPlace].sort((a, b) => {
    const ao = opts.overdueIds?.has(a.id) ? 1 : 0;
    const bo = opts.overdueIds?.has(b.id) ? 1 : 0;
    return bo - ao || dur(b) - dur(a);
  });

  const suggestions: Suggestion[] = [];
  const unplaced: Item[] = [];

  for (const task of order) {
    const d = dur(task);
    const overdue = opts.overdueIds?.has(task.id) ?? false;

    // Every start that fits: each gap's start, then every 30 minutes inside the gap.
    const candidates: number[] = [];
    const sorted = [...busy].sort((a, b) => a[0] - b[0]);
    let cursor = windowStart;
    for (const [s, e] of [...sorted, [windowEnd, windowEnd] as [number, number]]) {
      const gapEnd = Math.min(s, windowEnd);
      for (let t = cursor; t + d <= gapEnd; t = t === cursor ? roundUp5(Math.floor(cursor / STEP + 1) * STEP) : t + STEP) candidates.push(t);
      cursor = Math.max(cursor, roundUp5(e));
    }
    if (!candidates.length) {
      unplaced.push(task);
      continue;
    }

    let placed = candidates[0];
    let productive = false;
    if (!overdue && opts.preference) {
      let best = opts.preference(task, placed, d) ?? -1;
      for (const c of candidates.slice(1)) {
        const score = opts.preference(task, c, d) ?? -1;
        // Only move later for a clearly better time.
        if (score > best + 0.1) {
          best = score;
          placed = c;
        }
      }
      productive = best >= 0.6;
    }

    busy.push([placed - buf, placed + d + buf]);
    const note = est.get(task.id)?.note;
    suggestions.push({
      itemId: task.id,
      start: minToTime(placed),
      durationMin: d,
      reason: [overdue ? t('overdue, so first') : productive ? t('when you usually get this done') : t('next free slot'), note].filter(Boolean).join(' · '),
    });
  }

  suggestions.sort((a, b) => a.start.localeCompare(b.start));
  return { suggestions, unplaced };
}
