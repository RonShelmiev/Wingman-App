// Calendar layout: month grids and the day/week time grid (like Google Calendar).
import type { Item } from './types';
import { addDays, parseDate, startOfWeek, timeToMin, toDateStr } from './dates';
import { itemsOn } from './schedule';

/** Shortest block drawn in the time grid, so 0-minute reminders and short tasks stay tappable. */
export const MIN_BLOCK_MIN = 30;

export interface Placed {
  item: Item;
  /** Minutes from midnight. */
  start: number;
  /** Minutes from midnight; clipped to the end of the day. */
  end: number;
  /** Column inside its overlap group, and how many columns that group has. */
  col: number;
  cols: number;
}

/** How long an item takes on the grid. Reminders have no length, so they get the minimum block. */
const blockMin = (i: Item) => Math.max(MIN_BLOCK_MIN, i.kind === 'reminder' ? 0 : i.durationMin);

/**
 * Timed items on `date`, placed side by side where they overlap.
 * Items that overlap (directly or through a chain) form a group; each takes the first free column.
 */
export function layoutDay(items: Item[], date: string): Placed[] {
  const timed = itemsOn(items, date)
    .filter((i) => i.start)
    .map((item) => {
      const start = timeToMin(item.start!);
      return { item, start, end: Math.min(24 * 60, start + blockMin(item)), col: 0, cols: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const out: Placed[] = [];
  let group: Placed[] = [];
  let colEnds: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    for (const p of group) p.cols = colEnds.length;
    out.push(...group);
    group = [];
    colEnds = [];
  };
  for (const p of timed) {
    if (p.start >= groupEnd && group.length) flush();
    let col = colEnds.findIndex((end) => end <= p.start);
    if (col === -1) col = colEnds.push(0) - 1;
    colEnds[col] = p.end;
    p.col = col;
    group.push(p);
    groupEnd = Math.max(groupEnd, p.end);
  }
  if (group.length) flush();
  return out;
}

/** Items on `date` with no time (shown in the all-day row). */
export const untimedOn = (items: Item[], date: string) => itemsOn(items, date).filter((i) => !i.start);

/** The 6 weeks (42 days) shown for the month containing `date`. */
export function monthGrid(date: string, weekStart: 0 | 1): string[] {
  const first = `${date.slice(0, 8)}01`;
  const start = startOfWeek(first, weekStart);
  return Array.from({ length: 42 }, (_, k) => addDays(start, k));
}

/** Same day in the month `n` months away (Jan 31 + 1 month → Feb 28). */
export function addMonths(date: string, n: number): string {
  const d = parseDate(date);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return toDateStr(target);
}

/** Minutes from midnight rounded down to the half hour, for "tap an empty slot to add". */
export const snapToHalfHour = (min: number) => Math.max(0, Math.min(23 * 60 + 30, Math.floor(min / 30) * 30));
