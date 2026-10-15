import { useMemo, useState } from 'react';
import type { Channel, Item, Kind, Repeat } from '../lib/types';
import { actions, useStore } from '../lib/store';
import { parseQuick } from '../lib/parse';
import { durationForTitle } from '../lib/insights';
import { isDoneOn, isRepeating } from '../lib/schedule';
import { formatDuration, parseDate, weekdayName, weekdayShort } from '../lib/dates';
import { moveToTomorrow, remove, saveEdit } from '../lib/itemActions';
import { getLang, t } from '../lib/i18n';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';

interface Props {
  editing: Item | null;
  /** The occurrence that was tapped (matters for repeating items). */
  occurrence: string | null;
  today: string;
  onClose: () => void;
}

type RepeatKey = 'none' | 'daily' | 'weekdays' | 'days' | 'weekly' | 'every2' | 'every3' | 'monthly' | 'yearly';
const REMIND_OPTIONS: [string, number | null][] = [['No reminder', null], ['At the time', 0], ['5 min before', 5], ['10 min before', 10], ['15 min before', 15], ['30 min before', 30], ['1 hour before', 60], ['2 hours before', 120], ['1 day before', 1440]];
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const CHANNELS: [Channel, string][] = [['push', 'Push'], ['email', 'Email'], ['alarm', 'Alarm'], ['silent', 'Silent']];
const KINDS: [Kind, string][] = [['task', 'Task'], ['event', 'Event'], ['reminder', 'Reminder']];

const sameDays = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** "Work days" when the days match Settings, "Custom days" for any other choice. */
const repeatKey = (r: Repeat, workDays: number[]): RepeatKey =>
  r.type === 'everyNDays' ? (r.n === 2 ? 'every2' : 'every3')
  : r.type === 'weekdays' ? (sameDays(r.days ?? [1, 2, 3, 4, 5], workDays) ? 'weekdays' : 'days')
  : r.type;

function toRepeat(k: RepeatKey, date: string, workDays: number[], days: number[]): Repeat {
  switch (k) {
    case 'daily': return { type: 'daily' };
    case 'weekly': return { type: 'weekly', weekday: parseDate(date).getDay() };
    case 'every2': return { type: 'everyNDays', n: 2 };
    case 'every3': return { type: 'everyNDays', n: 3 };
    case 'weekdays': return { type: 'weekdays', days: workDays };
    case 'days': return { type: 'weekdays', days: [...days].sort((a, b) => a - b) };
    case 'monthly': return { type: 'monthly' };
    case 'yearly': return { type: 'yearly' };
    default: return { type: 'none' };
  }
}

export function QuickAdd({ editing, occurrence, today, onClose }: Props) {
  const areas = useStore((s) => s.areas);
  const history = useStore((s) => s.history);
  const timer = useStore((s) => s.timer);
  const workDays = useStore((s) => s.settings.workDays);
  const weekStart = useStore((s) => s.settings.weekStart);
  const occ = occurrence ?? editing?.date ?? today;
  const [learnedHint, setLearnedHint] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [f, setF] = useState(() => ({
    title: editing?.title ?? '',
    kind: (editing?.kind ?? 'task') as Kind,
    // A repeating item shows the day you tapped, not the day the series started.
    date: editing ? (isRepeating(editing) ? occ : editing.date ?? '') : today,
    start: editing?.start ?? '',
    durationMin: editing?.durationMin ?? 30,
    remindOffsetMin: editing?.remindOffsetMin ?? (null as number | null),
    channel: (editing?.channel ?? 'push') as Channel,
    repeat: editing ? repeatKey(editing.repeat, workDays) : ('none' as RepeatKey),
    /** Days for "Custom days" (0 = Sunday). */
    days: editing?.repeat.type === 'weekdays' ? editing.repeat.days ?? [1, 2, 3, 4, 5] : workDays,
    areaId: editing?.areaId ?? areas[0]?.id ?? 'work',
  }));

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setTouched((s) => new Set(s).add(k));
    setF((p) => ({ ...p, [k]: v }));
  };

  // Re-read the sentence on every keystroke, but never override a field the user set by hand.
  const onType = (value: string) => {
    setText(value);
    const p = parseQuick(value, new Date(), { workDays });
    setF((prev) => {
      const next = { ...prev, title: p.title };
      const maybe = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { if (!touched.has(k)) next[k] = v; };
      maybe('kind', p.kind);
      maybe('date', p.date ?? today);
      maybe('start', p.start ?? '');
      const learned = p.durationMin === null ? durationForTitle(history, p.title) : null;
      setLearnedHint(learned && !touched.has('durationMin') ? t('You usually need {d} for this', { d: formatDuration(learned) }) : null);
      maybe('durationMin', p.durationMin ?? learned ?? 30);
      maybe('remindOffsetMin', p.remindOffsetMin ?? (p.kind === 'reminder' ? 0 : null));
      maybe('channel', p.channel ?? 'push');
      maybe('repeat', repeatKey(p.repeat, workDays));
      if (p.repeat.type === 'weekdays' && p.repeat.days) maybe('days', p.repeat.days);
      if (p.areaGuess && areas.some((a) => a.id === p.areaGuess)) maybe('areaId', p.areaGuess);
      return next;
    });
  };

  const needsTime = f.channel === 'alarm' && !f.start;
  // Timing a repeating item counts for the tapped occurrence.
  const focusDate = editing && !isRepeating(editing) && editing.date ? editing.date : occ;
  // These repeats already say which days, so there's no date to pick: they start today (or keep the series start).
  const dateless = f.repeat === 'daily' || f.repeat === 'weekdays' || f.repeat === 'days';
  const canSave = f.title.trim().length > 0 && !needsTime && !(f.repeat === 'days' && !f.days.length);

  const save = async () => {
    if (!canSave) return;
    const date = f.date || (f.repeat !== 'none' ? today : '');
    const data = {
      title: f.title.trim(),
      kind: f.kind,
      areaId: f.areaId,
      date: date || null,
      start: f.start || null,
      durationMin: f.durationMin,
      remindOffsetMin: f.channel === 'alarm' ? (f.remindOffsetMin ?? 0) : f.remindOffsetMin,
      channel: f.channel,
      repeat: date ? toRepeat(f.repeat, date, workDays, f.days) : ({ type: 'none' } as Repeat),
    };
    if (!editing) {
      actions.addItem(data);
      return onClose();
    }
    // Unchanged date on a repeating item keeps the series where it started.
    if (isRepeating(editing) && data.date === occ) {
      data.date = editing.date;
      if (repeatKey(data.repeat, workDays) === repeatKey(editing.repeat, workDays) && !touched.has('days')) data.repeat = editing.repeat;
    }
    if (await saveEdit(editing, occ, data)) onClose();
  };

  const placeholder = useMemo(() => {
    const ex = getLang() === 'he'
      ? ['חדר כושר מחר ב-7 בבוקר למשך שעה', 'תעיר אותי ב-6:30', 'לשלם שכירות ביום שישי תזכיר לי יום לפני', 'יום הולדת לאמא 20 באוקטובר']
      : ['Gym tomorrow 7am for 1 hour', 'Wake me up at 6:30am', 'Pay rent Friday remind me a day before', "Mom's birthday Oct 20"];
    return ex[Math.floor(Math.random() * ex.length)];
  }, []);

  const done = editing ? isDoneOn(editing, occ) : false;

  return (
    <Sheet label={editing ? t('Edit item') : t('New item')} onClose={onClose}>
      <div className="row-between" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24 }}>{editing ? t('Edit') : t('New')}</h1>
        <div className="seg dark" role="group" aria-label={t('Type')}>
          {KINDS.map(([k, l]) => <button key={k} aria-pressed={f.kind === k} onClick={() => set('kind', k)}>{t(l)}</button>)}
        </div>
      </div>

      {editing ? (
        <div className="field">
          <label htmlFor="qa-title">{t('Title')}</label>
          <input id="qa-title" className="input big" value={f.title} onChange={(e) => set('title', e.target.value)} />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="qa-input">{t('Just type it — Wingman figures out the rest')}</label>
          <input id="qa-input" className="input big" value={text} placeholder={placeholder} autoComplete="off" dir="auto"
            onChange={(e) => onType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
          {f.title && <span style={{ fontSize: 13, color: 'var(--muted-2)' }}>{t('Saves as')} <strong>{f.title}</strong></span>}
        </div>
      )}

      <div className="inline-inputs">
        {!dateless && (
          <div className="field">
            <label htmlFor="qa-date">{f.repeat === 'weekly' || f.repeat === 'every2' || f.repeat === 'every3' ? t('Start date') : t('Date')}</label>
            <input id="qa-date" type="date" className="input" value={f.date ?? ''} onChange={(e) => set('date', e.target.value)} />
          </div>
        )}
        <div className="field" style={dateless ? { gridColumn: '1 / -1' } : undefined}>
          <label htmlFor="qa-time">{t('Time')} {f.kind === 'task' && <span>({t('optional')})</span>}</label>
          <input id="qa-time" type="time" className="input" value={f.start} onChange={(e) => set('start', e.target.value)} />
        </div>
      </div>

      <div className="inline-inputs">
        {f.kind !== 'reminder' ? (
          <div className="field">
            <label htmlFor="qa-dur">{t('How long')}</label>
            <select id="qa-dur" className="input" value={f.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))}>
              {[...new Set([...DURATIONS, f.durationMin])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{formatDuration(d)}</option>)}
            </select>
            {learnedHint && <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>{learnedHint}</span>}
          </div>
        ) : <span />}
        <div className="field">
          <label htmlFor="qa-rep">{t('Repeat')}</label>
          <select id="qa-rep" className="input" value={f.repeat} onChange={(e) => set('repeat', e.target.value as RepeatKey)}>
            <option value="none">{t('Never')}</option>
            <option value="daily">{t('Every day')}</option>
            <option value="weekdays">{t('Work days')}</option>
            <option value="days">{t('Custom days…')}</option>
            <option value="weekly">{t('Every week')}</option>
            <option value="every2">{t('Every 2 days')}</option>
            <option value="every3">{t('Every 3 days')}</option>
            <option value="monthly">{t('Every month')}</option>
            <option value="yearly">{t('Every year')}</option>
          </select>
        </div>
      </div>

      {f.repeat === 'days' && (
        <div className="field">
          <span className="label" id="qa-days">{t('Repeat on')}</span>
          <div className="chips" role="group" aria-labelledby="qa-days">
            {[0, 1, 2, 3, 4, 5, 6].map((k) => (k + weekStart) % 7).map((d) => (
              <button key={d} className="chip" aria-pressed={f.days.includes(d)} aria-label={weekdayName(d)}
                onClick={() => set('days', f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d])}>
                {weekdayShort(d)}
              </button>
            ))}
          </div>
          {!f.days.length && <span style={{ fontSize: 13, color: 'var(--danger)' }}>{t('Pick at least one day.')}</span>}
        </div>
      )}

      <div className="field">
        <label htmlFor="qa-rem">{t('Remind me')}</label>
        <select id="qa-rem" className="input" value={f.remindOffsetMin ?? ''} onChange={(e) => set('remindOffsetMin', e.target.value === '' ? null : Number(e.target.value))}>
          {REMIND_OPTIONS.map(([l, v]) => <option key={l} value={v ?? ''}>{t(l)}</option>)}
          {f.remindOffsetMin !== null && !REMIND_OPTIONS.some(([, v]) => v === f.remindOffsetMin) && <option value={f.remindOffsetMin}>{t('{n} min before', { n: f.remindOffsetMin })}</option>}
        </select>
      </div>

      <div className="field">
        <span className="label" id="qa-ch">{t('Notify me by')}</span>
        <div className="chips" role="group" aria-labelledby="qa-ch">
          {CHANNELS.map(([c, l]) => (
            <button key={c} className="chip" aria-pressed={f.channel === c} onClick={() => {
              set('channel', c);
              if (c === 'alarm' && f.remindOffsetMin === null) set('remindOffsetMin', 0);
            }}>
              {c === 'alarm' && <Icon name="alarm" size={18} />}{t(l)}
            </button>
          ))}
        </div>
        {f.channel === 'alarm' && <span style={{ fontSize: 13, color: needsTime ? 'var(--danger)' : 'var(--muted-2)' }}>{needsTime ? t('Pick a time for the alarm.') : t('Rings full screen with sound until you stop or snooze it.')}</span>}
        {f.channel === 'email' && <span style={{ fontSize: 13, color: 'var(--muted-2)' }}>{t('Sends an email and a notification. Turn on Email in Settings first.')}</span>}
      </div>

      <div className="field">
        <span className="label" id="qa-area">{t('Life area')}</span>
        <div className="chips" role="group" aria-labelledby="qa-area">
          {areas.map((a) => (
            <button key={a.id} className="chip" aria-pressed={f.areaId === a.id} onClick={() => set('areaId', a.id)}>
              <span className="dot" style={{ background: a.color }} />{a.name}
            </button>
          ))}
        </div>
      </div>

      {editing && !done && (
        <div className="btn-row">
          {editing.kind !== 'reminder' && timer?.itemId !== editing.id && (
            <button className="btn" onClick={() => { actions.startTimer(editing, focusDate); onClose(); }}>{t('Start focus timer')}</button>
          )}
          <button className="btn" onClick={() => { moveToTomorrow(editing, occ); onClose(); }}>{t('Move to tomorrow')}</button>
        </div>
      )}

      <div className="btn-row">
        {editing ? (
          <button className="btn" onClick={async () => { if (await remove(editing, occ)) onClose(); }} style={{ color: 'var(--danger)' }}>{t('Delete')}</button>
        ) : (
          <button className="btn" onClick={onClose}>{t('Cancel')}</button>
        )}
        <button className="btn primary grow" onClick={() => void save()} disabled={!canSave} style={{ opacity: canSave ? 1 : 0.5 }}>{editing ? t('Save') : t('Add to my day')}</button>
      </div>
    </Sheet>
  );
}
