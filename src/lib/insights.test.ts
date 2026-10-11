import { describe, expect, it } from 'vitest';
import type { Completion, Item } from './types';
import { areaFactor, durationForTitle, insightLines, learnedDuration, preferenceFor, productiveHours } from './insights';
import { planDay } from './planner';

let n = 0;
const done = (over: Partial<Completion>): Completion => ({
  id: String(n++), itemId: 'i', date: '2026-10-11', title: 'Task', areaId: 'work', at: '', hour: 10, plannedMin: 30, actualMin: null, ...over,
});
const item = (over: Partial<Item>): Item => ({
  id: 'x', title: 'Task', kind: 'task', areaId: 'work', date: '2026-10-11', start: null, durationMin: 30, remindOffsetMin: null,
  channel: 'push', repeat: { type: 'none' }, done: false, doneDates: [], createdAt: '', ...over,
});

describe('learning durations', () => {
  it('uses the median timed duration for the same title (2+ sessions)', () => {
    const h = [done({ title: 'Read 30 pages', actualMin: 50 }), done({ title: 'read 30 pages!', actualMin: 40 }), done({ title: 'Read 30 pages', actualMin: 70 })];
    expect(durationForTitle(h, 'Read 30 Pages')).toBe(50);
    expect(durationForTitle(h.slice(0, 1), 'Read 30 pages')).toBeNull();
    expect(learnedDuration(h, item({ title: 'Read 30 pages', durationMin: 30 }))).toEqual({ min: 50, note: 'usually takes you 50 min' });
  });

  it('pads by area when tasks in that area usually run over', () => {
    const h = [40, 45, 36].map((a) => done({ title: `t${a}`, actualMin: a, plannedMin: 30 }));
    expect(areaFactor(h, 'work')).toBeCloseTo(40 / 30);
    expect(learnedDuration(h, item({ title: 'New thing', durationMin: 60 }))).toMatchObject({ min: 80 });
    expect(learnedDuration(h, item({ title: 'New thing', areaId: 'home' }))).toBeNull();
  });
});

describe('productive hours', () => {
  const morning = Array.from({ length: 10 }, (_, k) => done({ hour: k < 7 ? 9 : 15 }));
  it('needs enough history', () => {
    expect(productiveHours(morning.slice(0, 5))).toBeNull();
    expect(productiveHours(morning)![9]).toBe(1);
  });

  it('steers the planner to your best hours, but not for overdue tasks', () => {
    const opts = { dayStart: '08:00', dayEnd: '18:00', bufferMin: 0, preference: preferenceFor(morning) };
    const { suggestions } = planDay([], [item({ id: 'a', durationMin: 30 })], opts);
    expect(suggestions[0]).toMatchObject({ start: '09:00', reason: 'when you usually get this done' });
    const late = planDay([], [item({ id: 'b' })], { ...opts, overdueIds: new Set(['b']) });
    expect(late.suggestions[0].start).toBe('08:00');
  });

  it('summarises what it learned', () => {
    const lines = insightLines([...morning, ...[40, 45, 36].map((a) => done({ actualMin: a }))], [{ id: 'work', name: 'Work', color: '' }]);
    expect(lines[0]).toBe('You get the most done between 09:00 and 11:00.');
    expect(lines[1]).toBe('Work takes you 1.3× longer than planned.');
  });
});
