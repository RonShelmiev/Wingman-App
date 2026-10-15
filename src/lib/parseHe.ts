// Hebrew Quick add: "רופא שיניים ביום חמישי ב-16:30 תזכיר לי יום לפני".
// JavaScript's \b doesn't see Hebrew letters, so phrases are bounded by spaces/punctuation explicitly.
import type { Parsed } from './parse';
import { addDays, dayRange, parseDate, toDateStr } from './dates';

const S = '(?<=^|[\\s,.!?()\\-–])';
const E = '(?=$|[\\s,.!?()\\-–])';
const re = (body: string) => new RegExp(`${S}(?:${body})${E}`);

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
const DAY = `(${DAYS.join('|')})`;
/** All seven days, Saturday included (index = weekday). */
const ALL_DAYS = [...DAYS, 'שבת'];
const ANY_DAY = `(${ALL_DAYS.join('|')})`;
/** Day letters as in א׳–ה׳ (ש = Saturday). */
const DAY_LETTERS = 'אבגדהוש';
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const MONTH = `(${MONTHS.join('|')}|מרס)`;
const monthIndex = (m: string) => (m === 'מרס' ? 2 : MONTHS.indexOf(m));
const PART = '(בבוקר|בצהריים|בצהרים|אחה["״\']?צ|אחרי הצהריים|אחר הצהריים|בערב|בלילה)';

/** Units in minutes; words that carry their own number (שעתיים = 2 hours). */
const UNIT = '(רבע שעה|חצי שעה|שעה וחצי|דקות|דקה|דק[\'׳]?|שעתיים|שעות|שעה|יומיים|ימים|יום|שבועיים|שבוע)';
function unitMinutes(n: string | undefined, unit: string): number {
  const fixed: Record<string, number> = { 'רבע שעה': 15, 'חצי שעה': 30, 'שעה וחצי': 90, 'שעתיים': 120, 'יומיים': 2880, 'שבועיים': 20160 };
  if (fixed[unit]) return fixed[unit];
  const k = n ? parseFloat(n) : 1;
  if (/^דק/.test(unit)) return Math.round(k);
  if (/^שע/.test(unit)) return Math.round(k * 60);
  if (/^(יום|ימים)$/.test(unit)) return Math.round(k * 1440);
  return Math.round(k * 10080); // שבוע
}

const AREA_HINTS: [string, string[]][] = [
  ['health', ['רופא', 'רופאת', 'שיניים', 'חדר כושר', 'אימון', 'ריצה', 'יוגה', 'ויטמינ', 'תרופ', 'כדור', 'פיזיותרפיה', 'טיפול', 'הליכה', 'שחייה', 'ספורט', 'מים']],
  ['money', ['לשלם', 'תשלום', 'חשבון', 'בנק', 'שכירות', 'שכר דירה', 'מס ', 'מסים', 'ארנונה', 'חשמל', 'ביטוח', 'העברה', 'משכנתא', 'חשבונית']],
  ['family', ['אמא', 'אבא', 'סבתא', 'סבא', 'משפחה', 'יום הולדת', 'יומולדת', 'חבר', 'ילדים', 'אחות', 'אחי', 'אח ', 'אשתי', 'בעלי', 'חתונה', 'יום נישואין']],
  ['learning', ['לקרוא', 'ללמוד', 'קורס', 'שיעורי בית', 'מבחן', 'שיעור', 'הרצאה', 'ספר']],
  ['errands', ['לקנות', 'קניות', 'סופר', 'דואר', 'לאסוף', 'מכבסה', 'בית מרקחת', 'להחזיר', 'מוסך']],
  ['home', ['לנקות', 'ניקיון', 'כביסה', 'כלים', 'לתקן', 'צמחים', 'להשקות', 'לבשל', 'זבל', 'לסדר']],
  ['work', ['פגישה', 'ישיבה', 'לקוח', 'דוח', 'דו"ח', 'מצגת', 'פרויקט', 'דדליין', 'ראיון', 'מייל', 'עבודה']],
];

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (h: number, m: number) => `${pad(((h % 24) + 24) % 24)}:${pad(m)}`;

function applyPart(h: number, part: string | undefined): number {
  if (!part) return h >= 1 && h <= 7 ? h + 12 : h; // "ב-6" most likely means 18:00
  if (part === 'בבוקר') return h === 12 ? 0 : h;
  if (part.startsWith('בצהר')) return h < 5 ? h + 12 : h;
  if (part === 'בלילה') return h === 12 ? 0 : h >= 6 && h < 12 ? h + 12 : h;
  return h < 12 ? h + 12 : h; // אחה"צ, בערב
}

function nextWeekday(today: string, wd: number, includeToday: boolean): string {
  let diff = (wd - parseDate(today).getDay() + 7) % 7;
  if (diff === 0 && !includeToday) diff = 7;
  return addDays(today, diff);
}

function monthDayDate(now: Date, month: number, day: number, year?: number): string {
  const d = new Date(year ?? now.getFullYear(), month, day);
  if (year === undefined && toDateStr(d) < toDateStr(now)) d.setFullYear(now.getFullYear() + 1);
  return toDateStr(d);
}

export function parseHebrew(input: string, now: Date, workDays: number[]): Parsed {
  let text = ` ${input.trim()} `;
  const today = toDateStr(now);
  const out: Parsed = { title: '', date: null, start: null, durationMin: null, remindOffsetMin: null, channel: null, repeat: { type: 'none' }, kind: 'task', areaGuess: null };
  const take = (r: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(r);
    if (m) {
      fn(m);
      text = text.replace(m[0], ' ');
    }
    return !!m;
  };

  for (const [area, words] of AREA_HINTS) {
    if (words.some((w) => input.includes(w))) {
      out.areaGuess = area;
      break;
    }
  }

  // Alarm
  take(re('שעון מעורר|ת?עיר(?:י)? אותי|להעיר אותי|השכמה|אזעקה'), () => (out.channel = 'alarm'));

  // Reminder offset ("יום לפני", "10 דקות לפני"), then the reminder words themselves.
  take(re(`(?:(\\d+(?:\\.\\d+)?)\\s*)?${UNIT}\\s+(?:לפני|מראש)`), (m) => (out.remindOffsetMin = unitMinutes(m[1], m[2])));
  take(re('תזכיר(?:י)? לי|להזכיר לי|תזכורת'), () => (out.remindOffsetMin ??= 0));

  // Duration ("למשך שעה וחצי")
  take(re(`למשך\\s+(?:(\\d+(?:\\.\\d+)?)\\s*)?${UNIT}`), (m) => (out.durationMin = unitMinutes(m[1], m[2])));

  // Repeats
  let defaultTime: string | null = null;
  take(re('כל יום (?:חול|עבודה)|בימי (?:חול|עבודה)|בימי השבוע'), () => (out.repeat = { type: 'weekdays', days: workDays }));
  // Chosen days: "ראשון עד חמישי", "מראשון עד חמישי", "א׳-ה׳", "בימים שני ורביעי"
  take(re(`(?:כל |בימים |בימי |ימים )?(?:מ|מיום |יום )?${ANY_DAY}\\s*(?:עד|-|–)\\s*(?:יום )?${ANY_DAY}`), (m) => {
    out.repeat = { type: 'weekdays', days: dayRange(ALL_DAYS.indexOf(m[1]), ALL_DAYS.indexOf(m[2])) };
  }) ||
    take(re(`([${DAY_LETTERS}])['׳]\\s*[-–]\\s*([${DAY_LETTERS}])['׳]`), (m) => {
      out.repeat = { type: 'weekdays', days: dayRange(DAY_LETTERS.indexOf(m[1]), DAY_LETTERS.indexOf(m[2])) };
    }) ||
    take(re(`(?:כל |בימים |בימי )(?:יום )?${ANY_DAY}(?:(?:\\s*,\\s*|\\s+)ו?${ANY_DAY})+`), (m) => {
      const days = ALL_DAYS.map((d, i) => (new RegExp(`(?:^|[\\s,ו])${d}(?=$|[\\s,])`).test(m[0]) ? i : -1)).filter((i) => i >= 0);
      out.repeat = { type: 'weekdays', days };
    });
  take(re(`כל (?:יום )?${DAY}|כל שבת`), (m) => {
    const wd = m[1] ? DAYS.indexOf(m[1]) : 6;
    out.repeat = { type: 'weekly', weekday: wd };
    out.date ??= nextWeekday(today, wd, true);
  });
  take(re('כל (\\d+|יומיים) ימים'), (m) => (out.repeat = { type: 'everyNDays', n: m[1] === 'יומיים' ? 2 : parseInt(m[1], 10) }));
  take(re('כל יום|יומי|כל בוקר|כל ערב'), (m) => {
    out.repeat = { type: 'daily' };
    if (m[0] === 'כל בוקר') defaultTime = '09:00';
    if (m[0] === 'כל ערב') defaultTime = '20:00';
  });
  let weeklyNoDay = false;
  take(re('כל שבוע|שבועי|פעם בשבוע'), () => (weeklyNoDay = true));
  take(re('כל חודש|חודשי|פעם בחודש'), () => (out.repeat = { type: 'monthly' }));
  take(re('כל שנה|שנתי|פעם בשנה'), () => (out.repeat = { type: 'yearly' }));
  const special = /(יום הולדת|יומולדת|יום נישואין)/.test(input);
  if (special && out.repeat.type === 'none') out.repeat = { type: 'yearly' };

  // Dates
  take(re('ב-?(\\d{1,2}) ל?חודש'), (m) => {
    const day = parseInt(m[1], 10);
    let d = today;
    for (let i = 0; i < 62 && Number(d.slice(8, 10)) !== day; i++) d = addDays(d, 1);
    out.date = d;
  });
  take(re('היום'), () => (out.date = today));
  take(re('הערב'), () => {
    out.date = today;
    defaultTime = '20:00';
  });
  take(re('מחרתיים'), () => (out.date = addDays(today, 2)));
  take(re('[וול]?מחר'), () => (out.date = addDays(today, 1)));
  take(re('בעוד (\\d+) (?:ימים|יום)|בעוד (יומיים|שבוע|שבועיים|חודש)'), (m) => {
    const n = m[1] ? parseInt(m[1], 10) : ({ 'יומיים': 2, 'שבוע': 7, 'שבועיים': 14, 'חודש': 30 } as Record<string, number>)[m[2]];
    out.date = addDays(today, n);
  });
  take(re(`(?:ב?יום |ב)${DAY}(?: הבא)?|(?:ב)?שבת(?: הבאה)?`), (m) => {
    const wd = m[1] ? DAYS.indexOf(m[1]) : 6;
    out.date = nextWeekday(today, wd, !/הבא/.test(m[0]));
  });
  take(re(`(?:ב-?|ה-?)?(\\d{1,2})\\s*(?:ב|ל)?${MONTH}`), (m) => (out.date = monthDayDate(now, monthIndex(m[2]), parseInt(m[1], 10))));
  // Day/month the Israeli way: 5/11 or 5.11 (optionally /2027)
  take(re('(?:ב-?)?(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?'), (m) => {
    const y = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : undefined;
    out.date = monthDayDate(now, parseInt(m[2], 10) - 1, parseInt(m[1], 10), y);
  });

  // Times
  take(re(`(?:ב-?|בשעה\\s*)?(\\d{1,2}):(\\d{2})(?:\\s*${PART})?`), (m) => {
    const h = parseInt(m[1], 10);
    out.start = hhmm(m[3] ? applyPart(h, m[3]) : h, parseInt(m[2], 10));
  }) ||
    take(re(`(?:ב-?|בשעה\\s*)(\\d{1,2})(?:\\s*${PART})?`), (m) => (out.start = hhmm(applyPart(parseInt(m[1], 10), m[2]), 0))) ||
    take(re(`(\\d{1,2})\\s*${PART}`), (m) => (out.start = hhmm(applyPart(parseInt(m[1], 10), m[2]), 0))) ||
    take(re('ב?חצות'), () => (out.start = '00:00')) ||
    take(re(PART), (m) => {
      const p = m[1];
      defaultTime = p === 'בבוקר' ? '09:00' : p.startsWith('בצהר') ? '12:00' : p === 'בערב' ? '18:00' : p === 'בלילה' ? '21:00' : '15:00';
    });

  out.start ??= defaultTime;
  if (weeklyNoDay) {
    out.date ??= today;
    out.repeat = { type: 'weekly', weekday: parseDate(out.date).getDay() };
  }
  if (out.repeat.type !== 'none') out.date ??= today;
  if (out.start && !out.date) {
    const [h, mi] = out.start.split(':').map(Number);
    out.date = h * 60 + mi > now.getHours() * 60 + now.getMinutes() ? today : addDays(today, 1);
  }
  if (out.channel === 'alarm') out.remindOffsetMin ??= 0;
  if (special) out.remindOffsetMin ??= 0;

  const eventy = special || /(פגישה|ישיבה|ארוחת|רופא|תור |מסיבה|טיסה|שיעור|ראיון|חתונה|הופעה)/.test(input);
  out.kind =
    out.channel === 'alarm' ? 'reminder'
    : special ? 'event'
    : out.start && (out.durationMin !== null || eventy) ? 'event'
    : out.start || out.remindOffsetMin !== null ? 'reminder'
    : 'task';

  out.title = cleanTitle(text);
  if (!out.title && out.channel === 'alarm') out.title = 'השכמה';
  return out;
}

function cleanTitle(text: string): string {
  let t = text.replace(/\s+/g, ' ').trim();
  const dangling = '(?:ב|ל|ב-|ל-|עד|את|ו|ש|גם|של|עם|-|,)';
  for (let i = 0; i < 3; i++) {
    t = t.replace(new RegExp(`^${dangling}\\s+`), '').replace(new RegExp(`\\s+${dangling}$`), '').trim();
  }
  return t.replace(/^[,.\-–\s]+|[,.\-–\s]+$/g, '');
}
