import { useMemo, useState } from 'react';
import type { Channel, Item, Kind, Repeat } from '../lib/types';
import { actions, useStore } from '../lib/store';
import { parseQuick } from '../lib/parse';
import { parseDate } from '../lib/dates';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';

interface Props {
  editing: Item | null;
  today: string;
  onClose: () => void;
}

type RepeatKey = 'none' | 'daily' | 'weekly' | 'every2' | 'every3';
const REMIND_OPTIONS: [string, number | null][] = [['No reminder', null], ['At the time', 0], ['5 min before', 5], ['10 min before', 10], ['15 min before', 15], ['30 min before', 30], ['1 hour before', 60], ['2 hours before', 120], ['1 day before', 1440]];
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const CHANNELS: [Channel, string][] = [['push', 'Push'], ['email', 'Email'], ['alarm', 'Alarm'], ['silent', 'Silent']];

const repeatKey = (r: Repeat): RepeatKey =>
  r.type === 'everyNDays' ? (r.n === 2 ? 'every2' : 'every3') : r.type;

function toRepeat(k: RepeatKey, date: string | null): Repeat {
  switch (k) {
    case 'daily': return { type: 'daily' };
    case 'weekly': return { type: 'weekly', weekday: parseDate(date!).getDay() };
    case 'every2': return { type: 'everyNDays', n: 2 };
    case 'every3': return { type: 'everyNDays', n: 3 };
    default: return { type: 'none' };
  }
}

export function QuickAdd({ editing, today, onClose }: Props) {
  const areas = useStore((s) => s.areas);
  const [text, setText] = useState('');
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [f, setF] = useState(() => ({
    title: editing?.title ?? '',
    kind: (editing?.kind ?? 'task') as Kind,
    date: editing?.date ?? today,
    start: editing?.start ?? '',
    durationMin: editing?.durationMin ?? 30,
    remindOffsetMin: editing?.remindOffsetMin ?? null as number | null,
    channel: (editing?.channel ?? 'push') as Channel,
    repeat: editing ? repeatKey(editing.repeat) : ('none' as RepeatKey),
    areaId: editing?.areaId ?? areas[0]?.id ?? 'work',
  }));

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setTouched((t) => new Set(t).add(k));
    setF((p) => ({ ...p, [k]: v }));
  };

  // Re-read the sentence on every keystroke, but never override a field the user set by hand.
  const onType = (value: string) => {
    setText(value);
    const p = parseQuick(value, new Date());
    setF((prev) => {
      const next = { ...prev, title: p.title };
      const maybe = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { if (!touched.has(k)) next[k] = v; };
      maybe('kind', p.kind);
      maybe('date', p.date ?? today);
      maybe('start', p.start ?? '');
      maybe('durationMin', p.durationMin ?? 30);
      maybe('remindOffsetMin', p.remindOffsetMin ?? (p.kind === 'reminder' ? 0 : null));
      maybe('channel', p.channel ?? 'push');
      maybe('repeat', repeatKey(p.repeat));
      if (p.areaGuess && areas.some((a) => a.id === p.areaGuess)) maybe('areaId', p.areaGuess);
      return next;
    });
  };

  const needsTime = f.channel === 'alarm' && !f.start;
  const canSave = f.title.trim().length > 0 && !needsTime;

  const save = () => {
    if (!canSave) return;
    const data = {
      title: f.title.trim(),
      kind: f.kind,
      areaId: f.areaId,
      date: f.date || null,
      start: f.start || null,
      durationMin: f.durationMin,
      remindOffsetMin: f.channel === 'alarm' ? (f.remindOffsetMin ?? 0) : f.remindOffsetMin,
      channel: f.channel,
      repeat: f.date ? toRepeat(f.repeat, f.date) : { type: 'none' as const },
    };
    if (editing) actions.updateItem(editing.id, data);
    else actions.addItem(data);
    onClose();
  };

  const placeholder = useMemo(() => ['Gym tomorrow 7am for 1 hour', 'Wake me up at 6:30am', 'Pay rent Friday remind me a day before'][Math.floor(Math.random() * 3)], []);

  return (
    <Sheet label={editing ? 'Edit item' : 'New item'} onClose={onClose}>
      <div className="row-between" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24 }}>{editing ? 'Edit' : 'New'}</h1>
        <div className="seg dark" role="group" aria-label="Type">
          {(['task', 'event', 'reminder'] as Kind[]).map((k) => (
            <button key={k} aria-pressed={f.kind === k} onClick={() => set('kind', k)}>{k[0].toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
      </div>

      {editing ? (
        <div className="field">
          <label htmlFor="qa-title">Title</label>
          <input id="qa-title" className="input big" value={f.title} onChange={(e) => set('title', e.target.value)} />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="qa-input">Just type it — Wingman figures out the rest</label>
          <input id="qa-input" className="input big" value={text} placeholder={placeholder} autoComplete="off"
            onChange={(e) => onType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          {f.title && <span style={{ fontSize: 13, color: 'var(--muted-2)' }}>Saves as <strong>{f.title}</strong></span>}
        </div>
      )}

      <div className="inline-inputs">
        <div className="field">
          <label htmlFor="qa-date">Date</label>
          <input id="qa-date" type="date" className="input" value={f.date ?? ''} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="qa-time">Time {f.kind === 'task' && <span>(optional)</span>}</label>
          <input id="qa-time" type="time" className="input" value={f.start} onChange={(e) => set('start', e.target.value)} />
        </div>
      </div>

      <div className="inline-inputs">
        {f.kind !== 'reminder' ? (
          <div className="field">
            <label htmlFor="qa-dur">How long</label>
            <select id="qa-dur" className="input" value={f.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))}>
              {[...new Set([...DURATIONS, f.durationMin])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h`}</option>)}
            </select>
          </div>
        ) : <span />}
        <div className="field">
          <label htmlFor="qa-rep">Repeat</label>
          <select id="qa-rep" className="input" value={f.repeat} onChange={(e) => set('repeat', e.target.value as RepeatKey)}>
            <option value="none">Never</option>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
            <option value="every2">Every 2 days</option>
            <option value="every3">Every 3 days</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="qa-rem">Remind me</label>
        <select id="qa-rem" className="input" value={f.remindOffsetMin ?? ''} onChange={(e) => set('remindOffsetMin', e.target.value === '' ? null : Number(e.target.value))}>
          {REMIND_OPTIONS.map(([l, v]) => <option key={l} value={v ?? ''}>{l}</option>)}
          {f.remindOffsetMin !== null && !REMIND_OPTIONS.some(([, v]) => v === f.remindOffsetMin) && <option value={f.remindOffsetMin}>{f.remindOffsetMin} min before</option>}
        </select>
      </div>

      <div className="field">
        <span className="label" id="qa-ch">Notify me by</span>
        <div className="chips" role="group" aria-labelledby="qa-ch">
          {CHANNELS.map(([c, l]) => (
            <button key={c} className="chip" aria-pressed={f.channel === c} onClick={() => {
              set('channel', c);
              if (c === 'alarm' && f.remindOffsetMin === null) set('remindOffsetMin', 0);
            }}>
              {c === 'alarm' && <Icon name="alarm" size={18} />}{l}
            </button>
          ))}
        </div>
        {f.channel === 'alarm' && <span style={{ fontSize: 13, color: needsTime ? 'var(--danger)' : 'var(--muted-2)' }}>{needsTime ? 'Pick a time for the alarm.' : 'Rings full screen with sound until you stop or snooze it.'}</span>}
        {f.channel === 'email' && <span style={{ fontSize: 13, color: 'var(--muted-2)' }}>Sends an email and a notification. Turn on Email in Settings first.</span>}
      </div>

      <div className="field">
        <span className="label" id="qa-area">Life area</span>
        <div className="chips" role="group" aria-labelledby="qa-area">
          {areas.map((a) => (
            <button key={a.id} className="chip" aria-pressed={f.areaId === a.id} onClick={() => set('areaId', a.id)}>
              <span className="dot" style={{ background: a.color }} />{a.name}
            </button>
          ))}
        </div>
      </div>

      <div className="btn-row">
        {editing ? (
          <button className="btn" onClick={() => { actions.deleteItem(editing.id); onClose(); }} aria-label="Delete" style={{ color: 'var(--danger)' }}>Delete</button>
        ) : (
          <button className="btn" onClick={onClose}>Cancel</button>
        )}
        <button className="btn primary grow" onClick={save} disabled={!canSave} style={{ opacity: canSave ? 1 : 0.5 }}>{editing ? 'Save' : 'Add to my day'}</button>
      </div>
    </Sheet>
  );
}
