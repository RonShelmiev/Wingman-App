import type { Item } from './types';
import { addDays, at, daysBetween, parseDate } from './dates';

/** Does this item happen on `date`? */
export function occursOn(item: Item, date: string): boolean {
  if (!item.date || date < item.date) return false;
  const r = item.repeat;
  switch (r.type) {
    case 'none':
      return date === item.date;
    case 'daily':
      return true;
    case 'weekly':
      return parseDate(date).getDay() === r.weekday;
    case 'everyNDays':
      return daysBetween(item.date, date) % Math.max(1, r.n) === 0;
  }
}

export const isRepeating = (item: Item) => item.repeat.type !== 'none';

export function isDoneOn(item: Item, date: string): boolean {
  return isRepeating(item) ? item.doneDates.includes(date) : item.done;
}

/** Items happening on `date`, timed ones first (by time), then untimed. */
export function itemsOn(items: Item[], date: string): Item[] {
  return items
    .filter((i) => occursOn(i, date))
    .sort((a, b) => {
      if (a.start && b.start) return a.start.localeCompare(b.start);
      if (a.start) return -1;
      if (b.start) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

/** Non-repeating, not done, dated before today. */
export function overdueItems(items: Item[], today: string): Item[] {
  return items
    .filter((i) => !isRepeating(i) && !i.done && i.date !== null && i.date < today && i.kind !== 'event')
    .sort((a, b) => (a.date! + (a.start ?? '')).localeCompare(b.date! + (b.start ?? '')));
}

/** Next date (>= from) this item occurs, within a year. */
export function nextOccurrence(item: Item, from: string): string | null {
  if (!item.date) return null;
  let d = from < item.date ? item.date : from;
  for (let i = 0; i < 366; i++, d = addDays(d, 1)) if (occursOn(item, d)) return d;
  return null;
}

export const DEFAULT_REMINDER_TIME = '09:00';

/** When the reminder for the occurrence on `date` fires, or null if it has none. */
export function reminderTime(item: Item, date: string): Date | null {
  if (item.remindOffsetMin === null) return null;
  const base = at(date, item.start ?? DEFAULT_REMINDER_TIME);
  return new Date(base.getTime() - item.remindOffsetMin * 60_000);
}

export const occurrenceKey = (item: Item, date: string) => `${item.id}@${date}`;

export interface DueReminder {
  item: Item;
  date: string;
  key: string;
  fireAt: Date;
}

/** Reminders that should go off now: fire time passed, not yet fired, not done, and not stale (>12h old). */
export function dueReminders(
  items: Item[],
  now: Date,
  today: string,
  fired: Record<string, true>,
  snoozes: Record<string, string>,
): DueReminder[] {
  const due: DueReminder[] = [];
  for (const item of items) {
    if (item.remindOffsetMin === null) continue;
    // An offset of N days means occurrences up to N+1 days ahead can fire today.
    const ahead = Math.ceil(item.remindOffsetMin / 1440) + 1;
    for (let k = -1; k <= ahead; k++) {
      const date = addDays(today, k);
      if (!occursOn(item, date) || isDoneOn(item, date)) continue;
      const key = occurrenceKey(item, date);
      if (fired[key]) continue;
      const fireAt = snoozes[key] ? new Date(snoozes[key]) : reminderTime(item, date)!;
      const age = now.getTime() - fireAt.getTime();
      if (age >= 0 && age < 12 * 3600_000) due.push({ item, date, key, fireAt });
    }
  }
  return due.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

/** True when `time` falls in [start, end), handling windows that wrap past midnight. */
export function inWindow(time: string, start: string, end: string): boolean {
  if (start === end) return false;
  return start < end ? time >= start && time < end : time >= start || time < end;
}
