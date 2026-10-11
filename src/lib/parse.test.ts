import { describe, expect, it } from 'vitest';
import { parseQuick } from './parse';

// Sunday, Oct 11 2026, 10:00
const NOW = new Date(2026, 9, 11, 10, 0);

describe('parseQuick', () => {
  it('parses the design example', () => {
    const p = parseQuick('Dentist Thursday 4:30pm remind me a day before', NOW);
    expect(p.title).toBe('Dentist');
    expect(p.date).toBe('2026-10-15');
    expect(p.start).toBe('16:30');
    expect(p.remindOffsetMin).toBe(1440);
    expect(p.kind).toBe('event');
    expect(p.areaGuess).toBe('health');
  });

  it('handles tomorrow, 24h time and duration', () => {
    const p = parseQuick('Client review tomorrow at 9:30 for 1 hour', NOW);
    expect(p).toMatchObject({ title: 'Client review', date: '2026-10-12', start: '09:30', durationMin: 60, kind: 'event', areaGuess: 'work' });
  });

  it('sets an alarm', () => {
    const p = parseQuick('Wake me up at 6:45am tomorrow', NOW);
    expect(p).toMatchObject({ channel: 'alarm', start: '06:45', date: '2026-10-12', remindOffsetMin: 0, kind: 'reminder', title: 'Wake up' });
    expect(parseQuick('alarm 7am', NOW).title).toBe('Alarm');
  });

  it('repeats weekly on a weekday', () => {
    const p = parseQuick('Call mom every sunday 6pm', NOW);
    expect(p).toMatchObject({ title: 'Call mom', start: '18:00', date: '2026-10-11', repeat: { type: 'weekly', weekday: 0 }, areaGuess: 'family' });
  });

  it('repeats daily and every N days', () => {
    expect(parseQuick('Take vitamins daily at 8am', NOW).repeat).toEqual({ type: 'daily' });
    expect(parseQuick('Water the plants every 3 days', NOW).repeat).toEqual({ type: 'everyNDays', n: 3 });
  });

  it('rolls a passed time with no date to tomorrow', () => {
    expect(parseQuick('Stretch at 8am', NOW).date).toBe('2026-10-12');
    expect(parseQuick('Stretch at 8pm', NOW).date).toBe('2026-10-11');
  });

  it('reads month dates and minute offsets', () => {
    const p = parseQuick('Renew passport on Oct 20 remind me 30 min before', NOW);
    expect(p).toMatchObject({ title: 'Renew passport', date: '2026-10-20', remindOffsetMin: 30 });
  });

  it('keeps a plain task plain', () => {
    const p = parseQuick('Buy milk', NOW);
    expect(p).toMatchObject({ title: 'Buy milk', date: null, start: null, kind: 'task', areaGuess: 'errands' });
  });

  it('treats "next friday" as the friday after this one', () => {
    expect(parseQuick('Pay rent next friday', NOW).date).toBe('2026-10-16');
    expect(parseQuick('Pay rent friday', NOW).date).toBe('2026-10-16');
  });
});
