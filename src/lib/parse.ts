import type { Channel, Kind, Repeat } from './types';
import { addDays, parseDate, toDateStr } from './dates';

export interface Parsed {
  title: string;
  date: string | null;
  start: string | null;
  durationMin: number | null;
  remindOffsetMin: number | null;
  channel: Channel | null;
  repeat: Repeat;
  kind: Kind;
  areaGuess: string | null;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WD = '(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?)';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MO = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const weekdayIndex = (s: string) => WEEKDAYS.findIndex((w) => w.startsWith(s.slice(0, 3).toLowerCase()));
const monthIndex = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase());

const UNIT_MIN: Record<string, number> = { m: 1, min: 1, mins: 1, minute: 1, minutes: 1, h: 60, hr: 60, hrs: 60, hour: 60, hours: 60, d: 1440, day: 1440, days: 1440 };
const num = (s: string) => (/^(a|an|one)$/i.test(s) ? 1 : parseFloat(s));
const UNIT = '(minutes?|mins?|m|hours?|hrs?|h|days?|d)';

/** Words that hint which life area an item belongs to (keys are the default area ids). */
const AREA_HINTS: Record<string, RegExp> = {
  health: /\b(gym|run|running|workout|yoga|doctor|dentist|vitamins?|meds|medicine|pills?|walk|swim|therapy|sleep)\b/i,
  money: /\b(pay|bill|bills|bank|rent|tax|taxes|invoice|budget|insurance|transfer)\b/i,
  family: /\b(mom|mum|dad|mother|father|family|birthday|friend|friends|kids?|grandma|grandpa|sister|brother|wife|husband|date night)\b/i,
  learning: /\b(read|study|course|learn|practice|homework|lesson|book club)\b/i,
  errands: /\b(pick up|buy|groceries|shop|shopping|post office|dry cleaning|return|drop off|pharmacy)\b/i,
  home: /\b(clean|laundry|dishes|fix|plants|vacuum|trash|repair|cook|organi[sz]e)\b/i,
  work: /\b(meeting|client|report|standup|stand-up|project|deadline|presentation|interview|email|review|sync)\b/i,
};

/**
 * Turn "Dentist Thursday 4:30pm remind me a day before" into structured fields.
 * Anything recognised is removed from the title; the rest becomes the title.
 */
export function parseQuick(input: string, now: Date): Parsed {
  let text = ` ${input.trim()} `;
  const today = toDateStr(now);
  const out: Parsed = { title: '', date: null, start: null, durationMin: null, remindOffsetMin: null, channel: null, repeat: { type: 'none' }, kind: 'task', areaGuess: null };

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (m) {
      fn(m);
      text = text.replace(m[0], ' ');
    }
    return !!m;
  };

  for (const [area, re] of Object.entries(AREA_HINTS)) {
    if (re.test(input)) {
      out.areaGuess = area;
      break;
    }
  }

  // Alarm
  take(/\b(set (an |the )?alarm|alarm|wake me( up)?)\b/i, () => (out.channel = 'alarm'));

  // Reminder offset: "remind me 10 min before", "a day before", "1h before"
  take(new RegExp(`\\b(?:remind me |notify me )?(\\d+(?:\\.\\d+)?|an?|one) ?${UNIT} (?:before|early|earlier)\\b`, 'i'), (m) => {
    out.remindOffsetMin = Math.round(num(m[1]) * UNIT_MIN[m[2].toLowerCase()]);
  });
  take(/\b(remind me|notify me|reminder)\b/i, () => (out.remindOffsetMin ??= 0));

  // Duration: "for 30 min", "for 1.5 hours"
  take(new RegExp(`\\bfor (\\d+(?:\\.\\d+)?|an?|one) ?${UNIT}\\b`, 'i'), (m) => {
    out.durationMin = Math.round(num(m[1]) * UNIT_MIN[m[2].toLowerCase()]);
  });

  // Repeat
  take(/\b(?:on |every )?(weekdays|every weekday|work ?days)\b/i, () => (out.repeat = { type: 'weekdays' }));
  take(/\b(every ?day|daily)\b/i, () => (out.repeat = { type: 'daily' }));
  take(/\b(every month|monthly)\b/i, () => (out.repeat = { type: 'monthly' }));
  take(/\b(every year|yearly|annually)\b/i, () => (out.repeat = { type: 'yearly' }));
  // Birthdays and anniversaries come back every year; the word stays in the title.
  if (out.repeat.type === 'none' && /\b(birthday|bday|anniversary)\b/i.test(input)) out.repeat = { type: 'yearly' };
  take(/\bevery (\d+) days\b/i, (m) => (out.repeat = { type: 'everyNDays', n: parseInt(m[1], 10) }));
  take(new RegExp(`\\bevery ${WD}s?\\b`, 'i'), (m) => {
    const wd = weekdayIndex(m[1]);
    out.repeat = { type: 'weekly', weekday: wd };
    out.date ??= nextWeekday(today, wd, true);
  });
  let weeklyNoDay = false;
  take(/\b(every week|weekly)\b/i, () => (weeklyNoDay = true));

  // Dates
  let defaultTime: string | null = null;
  take(/\b(today)\b/i, () => (out.date = today));
  take(/\b(tonight)\b/i, () => {
    out.date = today;
    defaultTime = '20:00';
  });
  take(/\b(tomorrow|tmrw|tmr)\b/i, () => (out.date = addDays(today, 1)));
  take(/\bin (\d+) days?\b/i, (m) => (out.date = addDays(today, parseInt(m[1], 10))));
  take(/\bin (a|one|\d+) weeks?\b/i, (m) => (out.date = addDays(today, 7 * num(m[1]))));
  take(new RegExp(`\\bnext ${WD}\\b`, 'i'), (m) => (out.date = nextWeekday(today, weekdayIndex(m[1]), false)));
  take(new RegExp(`\\b(?:on )?${WD}\\b`, 'i'), (m) => (out.date = nextWeekday(today, weekdayIndex(m[1]), true)));
  take(new RegExp(`\\b(?:on )?${MO} (\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), (m) => (out.date = monthDay(now, monthIndex(m[1]), parseInt(m[2], 10))));
  take(new RegExp(`\\b(?:on )?(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MO}\\b`, 'i'), (m) => (out.date = monthDay(now, monthIndex(m[2]), parseInt(m[1], 10))));

  // "on the 1st" (no month): the next date with that day of the month
  take(/\b(?:on )?the (\d{1,2})(?:st|nd|rd|th)\b/i, (m) => {
    const day = parseInt(m[1], 10);
    if (day < 1 || day > 31) return;
    let d = today;
    for (let i = 0; i < 62 && Number(d.slice(8, 10)) !== day; i++) d = addDays(d, 1);
    out.date = d;
  });

  // Times: "at 4:30pm", "4pm", "16:30", "at 9", "noon"
  take(/\b(?:at )?(\d{1,2})(?::(\d{2}))? ?(am|pm|a\.m\.|p\.m\.)/i, (m) => {
    let h = parseInt(m[1], 10) % 12;
    if (m[3].toLowerCase().startsWith('p')) h += 12;
    out.start = hhmm(h, parseInt(m[2] ?? '0', 10));
  }) ||
    take(/\b(?:at )?([01]?\d|2[0-3]):([0-5]\d)\b/i, (m) => (out.start = hhmm(parseInt(m[1], 10), parseInt(m[2], 10)))) ||
    take(/\bat (\d{1,2})\b/i, (m) => {
      const h = parseInt(m[1], 10);
      // "at 6" most likely means 6pm for 1–7, morning otherwise
      out.start = hhmm(h >= 1 && h <= 7 ? h + 12 : h % 24, 0);
    }) ||
    take(/\b(?:at )?noon\b/i, () => (out.start = '12:00')) ||
    take(/\b(?:at )?midnight\b/i, () => (out.start = '00:00')) ||
    take(/\b(?:in the |this )?morning\b/i, () => (defaultTime = '09:00')) ||
    take(/\b(?:in the |this )?afternoon\b/i, () => (defaultTime = '15:00')) ||
    take(/\b(?:in the |this )?evening\b/i, () => (defaultTime = '18:00'));

  out.start ??= defaultTime;

  if (weeklyNoDay) {
    out.date ??= today;
    out.repeat = { type: 'weekly', weekday: parseDate(out.date).getDay() };
  }
  if (out.repeat.type !== 'none') out.date ??= today;
  // A time with no date means today, or tomorrow if that time already passed.
  if (out.start && !out.date) {
    const [h, mi] = out.start.split(':').map(Number);
    out.date = h * 60 + mi > now.getHours() * 60 + now.getMinutes() ? today : addDays(today, 1);
  }
  if (out.channel === 'alarm') out.remindOffsetMin ??= 0;

  const special = /\b(birthday|bday|anniversary)\b/i.test(input);
  // Get a heads-up on the day (at 9:00 if there's no time).
  if (special) out.remindOffsetMin ??= 0;
  const eventy = special || /\b(meeting|lunch|dinner|breakfast|appointment|dentist|doctor|party|flight|class|interview|date)\b/i.test(input);
  out.kind =
    out.channel === 'alarm' ? 'reminder'
    : special ? 'event'
    : out.start && (out.durationMin !== null || eventy) ? 'event'
    : out.start || out.remindOffsetMin !== null ? 'reminder'
    : 'task';

  out.title = cleanTitle(text);
  // "Wake me up at 6:45am" leaves nothing behind once the alarm words and time are taken out.
  if (!out.title && out.channel === 'alarm') out.title = /\bwake\b/i.test(input) ? 'Wake up' : 'Alarm';
  return out;
}

function hhmm(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Next date with weekday `wd`; `includeToday` lets "thursday" on a Thursday mean today. */
function nextWeekday(today: string, wd: number, includeToday: boolean): string {
  const cur = parseDate(today).getDay();
  let diff = (wd - cur + 7) % 7;
  if (diff === 0 && !includeToday) diff = 7;
  return addDays(today, diff);
}

/** "Oct 15": this year, or next year if it already passed. */
function monthDay(now: Date, month: number, day: number): string {
  const d = new Date(now.getFullYear(), month, day);
  if (toDateStr(d) < toDateStr(now)) d.setFullYear(now.getFullYear() + 1);
  return toDateStr(d);
}

function cleanTitle(text: string): string {
  let t = text.replace(/\s+/g, ' ').trim();
  // Drop dangling connector words left behind by removed phrases.
  for (let i = 0; i < 3; i++) t = t.replace(/^(to|at|on|for|in|and|by|me)\s+/i, '').replace(/\s+(to|at|on|for|in|and|by|,)$/i, '').trim();
  t = t.replace(/^[,.\-\s]+|[,.\-\s]+$/g, '');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}
