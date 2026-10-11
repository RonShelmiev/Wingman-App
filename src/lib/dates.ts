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

/** Monday of the week containing `s`. */
export function startOfWeek(s: string): string {
  const dow = parseDate(s).getDay();
  return addDays(s, -((dow + 6) % 7));
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const dowShort = (s: string) => DOW[parseDate(s).getDay()];
export const dowLong = (s: string) => DOW_LONG[parseDate(s).getDay()];
export const weekdayName = (n: number) => DOW_LONG[n];
export const monthShort = (s: string) => MON[parseDate(s).getMonth()];
export const dayNum = (s: string) => parseDate(s).getDate();
export const prettyDate = (s: string) => `${dowShort(s)}, ${monthShort(s)} ${dayNum(s)}`;

export function relativeDay(s: string, today: string): string {
  const diff = daysBetween(today, s);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return prettyDate(s);
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
