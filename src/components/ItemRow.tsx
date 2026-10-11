import type { ReactNode } from 'react';
import type { Area, Item } from '../lib/types';
import { isDoneOn, isRepeating } from '../lib/schedule';
import { dayNum, formatDuration, monthShort, weekdayName } from '../lib/dates';

const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
import { DoneCheck, Icon } from './Icon';

export function repeatLabel(item: Item): string | null {
  const r = item.repeat;
  if (r.type === 'daily') return 'Daily';
  if (r.type === 'weekly') return `Every ${weekdayName(r.weekday)}`;
  if (r.type === 'everyNDays') return `Every ${r.n} days`;
  if (r.type === 'weekdays') return 'Weekdays';
  if (r.type === 'monthly' && item.date) return `Monthly on the ${ordinal(Number(item.date.slice(8, 10)))}`;
  if (r.type === 'yearly' && item.date) return `Every year on ${monthShort(item.date)} ${dayNum(item.date)}`;
  return null;
}

export function reminderLabel(item: Item): string | null {
  const o = item.remindOffsetMin;
  if (o === null) return null;
  if (o === 0) return item.channel === 'alarm' ? 'Alarm' : 'At time';
  if (o % 1440 === 0) return `${o / 1440} day${o === 1440 ? '' : 's'} before`;
  if (o % 60 === 0) return `${o / 60}h before`;
  return `${o} min before`;
}

export function ChannelIcon({ item }: { item: Item }) {
  if (item.remindOffsetMin === null) return null;
  const map = { alarm: ['alarm', 'Alarm'], push: ['bell', 'Notification'], email: ['mail', 'Email'], silent: null } as const;
  const v = map[item.channel];
  if (!v) return null;
  return <span className="icon-muted"><Icon name={v[0]} size={20} label={v[1]} /></span>;
}

interface Props {
  item: Item;
  date: string;
  area?: Area;
  meta?: string;
  current?: boolean;
  danger?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  trailing?: ReactNode;
}

export function ItemRow({ item, date, area, meta, current, danger, onToggle, onOpen, trailing }: Props) {
  const done = isDoneOn(item, date);
  const parts = meta ?? [area?.name, item.kind !== 'reminder' ? formatDuration(item.durationMin) : null, repeatLabel(item)].filter(Boolean).join(' · ');
  return (
    <div className={`item${current ? ' current' : ''}${done && !isRepeating(item) ? ' faded' : ''}`}>
      <span className="bar" style={{ background: area?.color ?? 'var(--ring-idle)' }} aria-hidden="true" />
      <button className="body" onClick={onOpen} aria-label={`Edit ${item.title}`}>
        <span className={`name${done ? ' done' : ''}`}>{item.title}</span>
        {parts && <span className="sub">{parts}</span>}
      </button>
      {current && !done && <span className="badge">NOW</span>}
      {trailing ?? <ChannelIcon item={item} />}
      <button className="check" onClick={onToggle} aria-pressed={done} aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${item.title}`}>
        {done ? <DoneCheck /> : <span className={`ring${danger ? ' danger' : ''}`} />}
      </button>
    </div>
  );
}
