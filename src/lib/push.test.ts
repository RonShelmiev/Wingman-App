import { describe, expect, it } from 'vitest';
import { buildSchedule } from './push';
import type { State } from './store';
import type { Item } from './types';

const item = (over: Partial<Item>): Item => ({
  id: 'x', title: 'T', kind: 'reminder', areaId: 'work', date: '2026-10-11', start: '18:00', durationMin: 30,
  remindOffsetMin: 0, channel: 'push', repeat: { type: 'none' }, done: false, doneDates: [], createdAt: '', ...over,
});

const state = (items: Item[], settings: Partial<State['settings']> = {}): State => ({
  items, areas: [], fired: {}, snoozes: {},
  settings: { pushEnabled: true, emailEnabled: false, morningBrief: '07:30', eveningRecap: '21:00', quietStart: '22:00', quietEnd: '07:00', dayStart: '08:00', dayEnd: '21:00', bufferMin: 15, name: '', email: '', ...settings },
});

const NOW = new Date(2026, 9, 11, 10, 0);

describe('buildSchedule', () => {
  it('schedules future reminders, repeats and the daily brief/recap', () => {
    const s = state([item({ id: 'call' }), item({ id: 'vit', start: '08:00', repeat: { type: 'daily' } })]);
    const keys = buildSchedule(s, NOW, { email: false }).map((r) => r.key);
    expect(keys).toContain('call@2026-10-11');
    expect(keys).not.toContain('vit@2026-10-11'); // 08:00 already passed
    expect(keys).toContain('vit@2026-10-12');
    expect(keys).toContain('vit@2026-10-25'); // 14 days ahead
    expect(keys).toContain('recap@2026-10-11');
    expect(keys).not.toContain('brief@2026-10-11');
    expect(keys).toContain('brief@2026-10-12');
  });

  it('respects quiet hours except for alarms, and skips done/fired/silent', () => {
    const s = state([
      item({ id: 'late', start: '23:00' }),
      item({ id: 'wake', start: '06:30', date: '2026-10-12', channel: 'alarm' }),
      item({ id: 'done', done: true }),
      item({ id: 'quiet', channel: 'silent' }),
    ]);
    s.fired['x@2026-10-11'] = true;
    const r = buildSchedule(s, NOW, { email: false });
    const keys = r.map((x) => x.key);
    expect(keys).not.toContain('late@2026-10-11');
    expect(keys).toContain('wake@2026-10-12');
    expect(r.find((x) => x.key === 'wake@2026-10-12')).toMatchObject({ alarm: true, title: '⏰ T' });
    expect(keys.filter((k) => /^(done|quiet)@/.test(k))).toEqual([]);
  });

  it('uses snoozes and flags email only when enabled', () => {
    const s = state([item({ id: 'm', channel: 'email', start: '12:00' })], { emailEnabled: true, email: 'me@example.com' });
    s.snoozes['m@2026-10-11'] = new Date(2026, 9, 11, 12, 30).toISOString();
    const r = buildSchedule(s, NOW, { email: true }).find((x) => x.key === 'm@2026-10-11')!;
    expect(new Date(r.fireAt).getHours() * 60 + new Date(r.fireAt).getMinutes()).toBe(12 * 60 + 30);
    expect(r.email).toBe(true);
    expect(buildSchedule(s, NOW, { email: false }).find((x) => x.key === 'm@2026-10-11')!.email).toBe(false);
  });
});
