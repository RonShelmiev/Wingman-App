import { describe, expect, it } from 'vitest';
import type { Item } from './types';
import { addMonths, layoutDay, monthGrid, snapToHalfHour, untimedOn } from './calendar';

const item = (over: Partial<Item>): Item => ({
  id: over.id ?? 'x', title: 'T', kind: 'event', areaId: 'work', date: '2026-11-20', start: null, durationMin: 60,
  remindOffsetMin: null, channel: 'push', repeat: { type: 'none' }, done: false, doneDates: [], createdAt: '2026-10-01T00:00:00Z',
  ...over,
});

describe('calendar layout', () => {
  it('places overlapping items side by side and lone items full width', () => {
    const items = [
      item({ id: 'a', start: '09:00', durationMin: 60 }),
      item({ id: 'b', start: '09:30', durationMin: 60 }),
      item({ id: 'c', start: '10:00', durationMin: 30 }), // a ended, so c reuses column 0
      item({ id: 'd', start: '12:00', durationMin: 30 }),
      item({ id: 'e', start: null }),
    ];
    const p = Object.fromEntries(layoutDay(items, '2026-11-20').map((x) => [x.item.id, x]));
    expect(p.a).toMatchObject({ start: 540, end: 600, col: 0, cols: 2 });
    expect(p.b).toMatchObject({ col: 1, cols: 2 });
    expect(p.c).toMatchObject({ col: 0, cols: 2 });
    expect(p.d).toMatchObject({ col: 0, cols: 1 });
    expect(p.e).toBeUndefined();
    expect(untimedOn(items, '2026-11-20').map((i) => i.id)).toEqual(['e']);
  });

  it('gives reminders a minimum block and clips at midnight', () => {
    const [r] = layoutDay([item({ kind: 'reminder', start: '08:00', durationMin: 0 })], '2026-11-20');
    expect(r.end - r.start).toBe(30);
    const [late] = layoutDay([item({ start: '23:30', durationMin: 120 })], '2026-11-20');
    expect(late.end).toBe(1440);
  });

  it('builds a 6-week month grid starting on the week start', () => {
    const g = monthGrid('2026-11-20', 0);
    expect(g).toHaveLength(42);
    expect(g[0]).toBe('2026-11-01'); // Nov 1 2026 is a Sunday
    expect(monthGrid('2026-11-20', 1)[0]).toBe('2026-10-26');
  });

  it('moves by months and snaps taps to half hours', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-20', -11)).toBe('2025-12-20');
    expect(snapToHalfHour(9 * 60 + 47)).toBe(570);
    expect(snapToHalfHour(1439)).toBe(1410);
  });
});
