import type { Item } from './types';
import { minToTime, timeToMin } from './dates';

export interface Suggestion {
  itemId: string;
  start: string;
  reason: string;
}

export interface PlanOptions {
  dayStart: string;
  dayEnd: string;
  bufferMin: number;
  /** Minutes since midnight to start planning from (now, for today). */
  notBeforeMin?: number;
  overdueIds?: Set<string>;
}

const roundUp5 = (m: number) => Math.ceil(m / 5) * 5;

/**
 * Fit untimed tasks into the free gaps between fixed items.
 * Overdue first, then longest first (big tasks are hardest to place); each goes in the earliest gap it fits.
 */
export function planDay(fixed: Item[], toPlace: Item[], opts: PlanOptions): { suggestions: Suggestion[]; unplaced: Item[] } {
  const buf = opts.bufferMin;
  const busy: [number, number][] = fixed
    .filter((i) => i.start)
    .map((i) => [timeToMin(i.start!) - buf, timeToMin(i.start!) + i.durationMin + buf]);

  const windowStart = roundUp5(Math.max(timeToMin(opts.dayStart), opts.notBeforeMin ?? 0));
  const windowEnd = timeToMin(opts.dayEnd);

  const order = [...toPlace].sort((a, b) => {
    const ao = opts.overdueIds?.has(a.id) ? 1 : 0;
    const bo = opts.overdueIds?.has(b.id) ? 1 : 0;
    return bo - ao || b.durationMin - a.durationMin;
  });

  const suggestions: Suggestion[] = [];
  const unplaced: Item[] = [];

  for (const task of order) {
    const sorted = [...busy].sort((a, b) => a[0] - b[0]);
    let cursor = windowStart;
    let placed: number | null = null;
    for (const [s, e] of [...sorted, [windowEnd, windowEnd] as [number, number]]) {
      if (s - cursor >= task.durationMin && cursor + task.durationMin <= windowEnd) {
        placed = cursor;
        break;
      }
      cursor = Math.max(cursor, roundUp5(e));
    }
    if (placed === null) {
      unplaced.push(task);
      continue;
    }
    busy.push([placed - buf, placed + task.durationMin + buf]);
    suggestions.push({
      itemId: task.id,
      start: minToTime(placed),
      reason: opts.overdueIds?.has(task.id) ? 'overdue, so first' : 'next free slot',
    });
  }

  suggestions.sort((a, b) => a.start.localeCompare(b.start));
  return { suggestions, unplaced };
}
