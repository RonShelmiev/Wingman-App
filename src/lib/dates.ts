import { getLang, t } from './i18n';

// Small local-time date helpers. Dates are 'YYYY-MM-DD', times 'HH:MM', both in the device's time zone.

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeStr(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minToTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function at(date: string, time: string): Date {
  const d = parseDate(date);
  d.setMinutes(timeToMin(time));
  return d;
}

/** Weekdays from `from` to `to` inclusive (0 = Sunday), wrapping past Saturday: Sun–Thu → [0..4], Fri–Sun → [5, 6, 0]. */
export function dayRange(from: number, to: number): number[] {
  const out = [from];
  for (let d = from; d !== to; ) out.push((d = (d + 1) % 7));
  return out.sort((a, b) => a - b);
}

/** First day of the week containing `s` (weekStart: 0 = Sunday, 1 = Monday). */
export function startOfWeek(s: string, weekStart: 0 | 1 = 1): string {
  const dow = parseDate(s).getDay();
  return addDays(s, -((dow - weekStart + 7) % 7));
}

const EN = {
  dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  dowLong: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  mon: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const HEB = {
  dow: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'],
  dowLong: ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'],
  mon: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'],
};
const L = () => (getLang() === 'he' ? HEB : EN);

export const dowShort = (s: string) => L().dow[parseDate(s).getDay()];
export const dowLong = (s: string) => L().dowLong[parseDate(s).getDay()];
export const weekdayName = (n: number) => L().dowLong[n];
export const weekdayShort = (n: number) => L().dow[n];
export const monthShort = (s: string) => L().mon[parseDate(s).getMonth()];
export const dayNum = (s: string) => parseDate(s).getDate();
/** "Oct 20" / "20 באוקטובר" */
export const monthDay = (s: string) => (getLang() === 'he' ? `${dayNum(s)} ב${monthShort(s)}` : `${monthShort(s)} ${dayNum(s)}`);
/** "Thu, Oct 15" / "ה׳, 15 באוקטובר" */
export const prettyDate = (s: string) => `${dowShort(s)}, ${monthDay(s)}`;
/** "Sunday, Oct 11" / "יום ראשון, 11 באוקטובר" */
export const longDate = (s: string) => `${dowLong(s)}, ${monthDay(s)}`;

export function rangeLabel(a: string, b: string): string {
  if (getLang() === 'he') return monthShort(a) === monthShort(b) ? `${dayNum(a)}–${dayNum(b)} ב${monthShort(b)}` : `${monthDay(a)} – ${monthDay(b)}`;
  return `${monthShort(a)} ${dayNum(a)} – ${monthShort(b) !== monthShort(a) ? `${monthShort(b)} ` : ''}${dayNum(b)}`;
}

export function relativeDay(s: string, today: string): string {
  const diff = daysBetween(today, s);
  if (diff === 0) return t('Today');
  if (diff === 1) return t('Tomorrow');
  if (diff === -1) return t('Yesterday');
  return prettyDate(s);
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (getLang() === 'he') {
    if (min < 60) return `${min} דק׳`;
    const hours = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
    return m ? `${hours} ו-${m} דק׳` : hours;
  }
  if (min < 60) return `${min} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
