import { describe, expect, it } from 'vitest';
import type { Item } from './types';
import { dueReminders, inWindow, isDoneOn, itemsOn, nextOccurrence, occursOn, overdueItems } from './schedule';
import { planDay } from './planner';

const item = (over: Partial<Item>): Item => ({
  id: over.id ?? 'x', title: 'T', kind: 'task', areaId: 'work', date: '2026-10-11', start: null, durationMin: 30,
  remindOffsetMin: null, channel: 'push', repeat: { type: 'none' }, done: false, doneDates: [], createdAt: '2026-10-01T00:00:00Z',
  ...over,
});

describe('occurrences', () => {
  it('handles each repeat type', () => {
    expect(occursOn(item({}), '2026-10-11')).toBe(true);
    expect(occursOn(item({}), '2026-10-12')).toBe(false);
    expect(occursOn(item({ repeat: { type: 'daily' } }), '2026-10-30')).toBe(true);
    expect(occursOn(item({ repeat: { type: 'daily' } }), '2026-10-10')).toBe(false);
    expect(occursOn(item({ repeat: { type: 'weekly', weekday: 0 } }), '2026-10-18')).toBe(true);
    expect(occursOn(item({ repeat: { type: 'weekly', weekday: 0 } }), '2026-10-19')).toBe(false);
    expect(occursOn(item({ repeat: { type: 'everyNDays', n: 3 } }), '2026-10-14')).toBe(true);
    expect(occursOn(item({ repeat: { type: 'everyNDays', n: 3 } }), '2026-10-15')).toBe(false);
    expect(nextOccurrence(item({ repeat: { type: 'weekly', weekday: 3 } }), '2026-10-11')).toBe('2026-10-14');
    expect(occursOn(item({ repeat: { type: 'weekdays' } }), '2026-10-12')).toBe(true); // Mon
    expect(occursOn(item({ repeat: { type: 'weekdays' } }), '2026-10-17')).toBe(false); // Sat
    expect(occursOn(item({ date: '2026-01-31', repeat: { type: 'monthly' } }), '2026-02-28')).toBe(true);
    expect(occursOn(item({ date: '2026-01-31', repeat: { type: 'monthly' } }), '2026-03-31')).toBe(true);
    expect(occursOn(item({ date: '2026-01-31', repeat: { type: 'monthly' } }), '2026-03-30')).toBe(false);
    const bday = item({ date: '2024-02-29', repeat: { type: 'yearly' } });
    expect(occursOn(bday, '2027-02-28')).toBe(true);
    expect(occursOn(bday, '2028-02-29')).toBe(true);
    expect(occursOn(bday, '2028-02-28')).toBe(false);
    expect(nextOccurrence(item({ date: '2025-10-01', repeat: { type: 'yearly' } }), '2026-10-11')).toBe('2027-10-01');
  });

  it('tracks done per occurrence for repeating items', () => {
    const r = item({ repeat: { type: 'daily' }, doneDates: ['2026-10-12'] });
    expect(isDoneOn(r, '2026-10-12')).toBe(true);
    expect(isDoneOn(r, '2026-10-13')).toBe(false);
  });

  it('sorts timed items first and finds overdue ones', () => {
    const list = [item({ id: 'a' }), item({ id: 'b', start: '15:00' }), item({ id: 'c', start: '09:00' })];
    expect(itemsOn(list, '2026-10-11').map((i) => i.id)).toEqual(['c', 'b', 'a']);
    expect(overdueItems([item({ id: 'old', date: '2026-10-09' }), item({ id: 'ok' })], '2026-10-11').map((i) => i.id)).toEqual(['old']);
  });
});

describe('dueReminders', () => {
  const now = new Date(2026, 9, 11, 17, 0);
  it('fires a day-before reminder and skips fired ones', () => {
    const dentist = item({ id: 'd', date: '2026-10-12', start: '16:30', remindOffsetMin: 1440 });
    expect(dueReminders([dentist], now, '2026-10-11', {}, {}).map((d) => d.key)).toEqual(['d@2026-10-12']);
    expect(dueReminders([dentist], now, '2026-10-11', { 'd@2026-10-12': true }, {})).toEqual([]);
  });
  it('waits for a snooze and ignores stale or done ones', () => {
    const call = item({ id: 'c', start: '16:50', remindOffsetMin: 0 });
    expect(dueReminders([call], now, '2026-10-11', {}, { 'c@2026-10-11': new Date(2026, 9, 11, 17, 5).toISOString() })).toEqual([]);
    expect(dueReminders([item({ id: 's', date: '2026-10-10', start: '01:00', remindOffsetMin: 0 })], now, '2026-10-11', {}, {})).toEqual([]);
    expect(dueReminders([{ ...call, done: true }], now, '2026-10-11', {}, {})).toEqual([]);
  });
  it('knows quiet hours across midnight', () => {
    expect(inWindow('23:00', '22:00', '07:00')).toBe(true);
    expect(inWindow('06:59', '22:00', '07:00')).toBe(true);
    expect(inWindow('12:00', '22:00', '07:00')).toBe(false);
  });
});

describe('planDay', () => {
  const opts = { dayStart: '08:00', dayEnd: '21:00', bufferMin: 15 };
  it('fits tasks into gaps around fixed items, overdue first', () => {
    const fixed = [item({ id: 'lunch', start: '12:30', durationMin: 60 }), item({ id: 'call', start: '18:00', durationMin: 30 })];
    const tasks = [item({ id: 'read', durationMin: 45 }), item({ id: 'bill', durationMin: 15 })];
    const { suggestions, unplaced } = planDay(fixed, tasks, { ...opts, notBeforeMin: 12 * 60 + 40, overdueIds: new Set(['bill']) });
    expect(unplaced).toEqual([]);
    expect(suggestions).toEqual([
      { itemId: 'bill', start: '13:45', durationMin: 15, reason: 'overdue, so first' },
      { itemId: 'read', start: '14:15', durationMin: 45, reason: 'next free slot' },
    ]);
  });
  it('reports tasks that do not fit', () => {
    const { unplaced } = planDay([item({ start: '08:00', durationMin: 780 })], [item({ id: 'big', durationMin: 120 })], opts);
    expect(unplaced.map((i) => i.id)).toEqual(['big']);
  });
});
