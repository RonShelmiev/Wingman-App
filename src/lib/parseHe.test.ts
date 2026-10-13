import { describe, expect, it } from 'vitest';
import { parseQuick } from './parse';

// Sunday, Oct 11 2026, 10:00
const NOW = new Date(2026, 9, 11, 10, 0);
const IL = { workDays: [0, 1, 2, 3, 4] };
const p = (s: string) => parseQuick(s, NOW, IL);

describe('Hebrew quick add', () => {
  it('birthdays repeat every year', () => {
    expect(p('יום הולדת לאמא 20 באוקטובר')).toMatchObject({ title: 'יום הולדת לאמא', date: '2026-10-20', repeat: { type: 'yearly' }, kind: 'event', remindOffsetMin: 0, areaGuess: 'family' });
  });
  it('appointment with a day-before reminder', () => {
    expect(p('רופא שיניים ביום חמישי ב-16:30 תזכיר לי יום לפני')).toMatchObject({ title: 'רופא שיניים', date: '2026-10-15', start: '16:30', remindOffsetMin: 1440, kind: 'event', areaGuess: 'health' });
  });
  it('alarm', () => {
    expect(p('תעיר אותי מחר ב-6:45')).toMatchObject({ title: 'השכמה', channel: 'alarm', date: '2026-10-12', start: '06:45', kind: 'reminder' });
  });
  it('weekly on a day', () => {
    expect(p('להתקשר לאמא כל יום שישי ב-18:00')).toMatchObject({ title: 'להתקשר לאמא', repeat: { type: 'weekly', weekday: 5 }, date: '2026-10-16', start: '18:00', areaGuess: 'family' });
  });
  it('daily with a part of day', () => {
    expect(p('ויטמינים כל יום ב-8 בבוקר')).toMatchObject({ title: 'ויטמינים', repeat: { type: 'daily' }, start: '08:00', areaGuess: 'health' });
  });
  it('meeting with a duration', () => {
    expect(p('פגישה עם לקוח מחר ב-10 למשך שעה וחצי')).toMatchObject({ title: 'פגישה עם לקוח', date: '2026-10-12', start: '10:00', durationMin: 90, kind: 'event', areaGuess: 'work' });
  });
  it('monthly on the 1st', () => {
    expect(p('לשלם שכירות כל חודש ב-1 לחודש')).toMatchObject({ title: 'לשלם שכירות', repeat: { type: 'monthly' }, date: '2026-11-01', areaGuess: 'money' });
  });
  it('plain task', () => {
    expect(p('לקנות חלב')).toMatchObject({ title: 'לקנות חלב', date: null, start: null, kind: 'task', areaGuess: 'errands' });
  });
  it('work days follow the Israeli week', () => {
    expect(p('ישיבת צוות בימי חול ב-9:30')).toMatchObject({ title: 'ישיבת צוות', start: '09:30', repeat: { type: 'weekdays', days: [0, 1, 2, 3, 4] } });
  });
  it('evening hours and in N days', () => {
    expect(p('ספורט ב-7 בערב')).toMatchObject({ title: 'ספורט', start: '19:00', date: '2026-10-11' });
    expect(p('תזכורת לשתות מים בעוד 3 ימים')).toMatchObject({ title: 'לשתות מים', date: '2026-10-14', remindOffsetMin: 0 });
  });
  it('day/month dates and next week', () => {
    expect(p('חתונה 5/11 ב-20:00')).toMatchObject({ title: 'חתונה', date: '2026-11-05', start: '20:00', kind: 'event' });
    expect(p('לשלם ארנונה ביום ראשון הבא')).toMatchObject({ title: 'לשלם ארנונה', date: '2026-10-18' });
    expect(p('לשלם ארנונה ביום ראשון').date).toBe('2026-10-11');
  });
  it('chosen days in Hebrew', () => {
    expect(p('חדר כושר ראשון עד חמישי ב-7 בבוקר')).toMatchObject({ title: 'חדר כושר', start: '07:00', date: '2026-10-11', repeat: { type: 'weekdays', days: [0, 1, 2, 3, 4] } });
    expect(p('להשקות צמחים מראשון עד חמישי').repeat).toEqual({ type: 'weekdays', days: [0, 1, 2, 3, 4] });
    expect(p('ספורט א׳-ה׳ ב-18:00')).toMatchObject({ title: 'ספורט', start: '18:00', repeat: { type: 'weekdays', days: [0, 1, 2, 3, 4] } });
    expect(p('טיול שישי עד שבת').repeat).toEqual({ type: 'weekdays', days: [5, 6] });
    expect(p('שיעור פסנתר בימים שני ורביעי ב-17:00')).toMatchObject({ title: 'שיעור פסנתר', start: '17:00', repeat: { type: 'weekdays', days: [1, 3] } });
    expect(p('להתקשר לאמא כל יום שישי ב-18:00').repeat).toEqual({ type: 'weekly', weekday: 5 });
  });
  it('reminder offsets in Hebrew', () => {
    expect(p('טיסה מחר ב-14:00 תזכיר לי שעתיים לפני').remindOffsetMin).toBe(120);
    expect(p('שיחה עם הבנק מחר ב-11 חצי שעה לפני').remindOffsetMin).toBe(30);
  });
});
