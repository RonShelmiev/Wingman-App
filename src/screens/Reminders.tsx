import { useState, type ReactElement } from 'react';
import type { Item } from '../lib/types';
import { actions, useStore } from '../lib/store';
import { isDoneOn, isRepeating, nextOccurrence, overdueItems, occursOn } from '../lib/schedule';
import { addDays, relativeDay } from '../lib/dates';
import { ItemRow, reminderLabel, repeatLabel, type SwipeAction } from '../components/ItemRow';
import { moveToTomorrow, postpone, remove, toggle } from '../lib/itemActions';
import { undoable } from '../lib/undo';
import { t } from '../lib/i18n';

type Filter = 'all' | 'repeating' | 'done';

export function Reminders({ today, onEdit }: { today: string; onEdit: (i: Item, date: string) => void }) {
  const items = useStore((s) => s.items);
  const areas = useStore((s) => s.areas);
  const [filter, setFilter] = useState<Filter>('all');
  const areaOf = (i: Item) => areas.find((a) => a.id === i.areaId);

  // Everything you need to do or be reminded of; plain events without a reminder live on Today/Week.
  const relevant = items.filter((i) => i.kind !== 'event' || i.remindOffsetMin !== null || i.repeat.type === 'yearly');

  const meta = (i: Item, date: string | null) =>
    [date ? relativeDay(date, today) : t('No date'), i.start, reminderLabel(i), repeatLabel(i)].filter(Boolean).join(' · ');

  const row = (i: Item, date: string | null, danger = false) => {
    const d = date ?? today;
    const onAction = (a: SwipeAction) => (a === 'later' ? postpone(i, d, 60) : a === 'tomorrow' ? moveToTomorrow(i, d) : void remove(i, d));
    return (
      <ItemRow key={i.id + (date ?? '')} item={i} date={d} area={areaOf(i)} meta={meta(i, date)} danger={danger}
        onToggle={() => toggle(i, d)} onOpen={() => onEdit(i, d)} onAction={onAction}
        trailing={danger ? <button className="btn small" onClick={() => undoable(t('Moved to today'), () => actions.updateItem(i.id, { date: today }))}>{t('Today')}</button> : undefined} />
    );
  };

  let groups: { label: string; danger?: boolean; rows: ReactElement[] }[];
  if (filter === 'done') {
    const done = relevant.filter((i) => !isRepeating(i) && i.done);
    groups = [{ label: t('Done'), rows: done.map((i) => row(i, i.date)) }];
  } else {
    const pool = filter === 'repeating' ? relevant.filter(isRepeating) : relevant;
    const overdue = filter === 'all' ? overdueItems(pool, today) : [];
    const todays = pool.filter((i) => occursOn(i, today));
    const ahead = pool
      .filter((i) => !occursOn(i, today))
      .map((i) => ({ i, d: nextOccurrence(i, addDays(today, 1)) }))
      .filter((x): x is { i: Item; d: string } => !!x.d && !(!isRepeating(x.i) && x.i.done))
      .sort((a, b) => (a.d + (a.i.start ?? '')).localeCompare(b.d + (b.i.start ?? '')));
    const soon = addDays(today, 30);
    const someday = pool.filter((i) => !i.date && !i.done);
    groups = [
      { label: t('Overdue'), danger: true, rows: overdue.map((i) => row(i, i.date, true)) },
      { label: t('Today'), rows: todays.sort((a, b) => Number(isDoneOn(a, today)) - Number(isDoneOn(b, today))).map((i) => row(i, today)) },
      { label: t('Upcoming'), rows: ahead.filter((x) => x.d <= soon).map(({ i, d }) => row(i, d)) },
      { label: t('Later'), rows: ahead.filter((x) => x.d > soon).map(({ i, d }) => row(i, d)) },
      { label: t('Someday'), rows: someday.map((i) => row(i, null)) },
    ];
  }
  const shown = groups.filter((g) => g.rows.length);
  const names: Record<Filter, string> = { all: t('All'), repeating: t('Repeating'), done: t('Done') };

  return (
    <main className="screen">
      <header className="header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
        <h1 className="title">{t('Reminders')}</h1>
        <div className="seg" role="group" aria-label={t('Filter')}>
          {(['all', 'repeating', 'done'] as Filter[]).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{names[f]}</button>
          ))}
        </div>
      </header>
      {shown.length === 0 && <div className="empty card">{filter === 'done' ? t('Nothing finished yet.') : t('No reminders. Tap + to add one.')}</div>}
      {shown.map((g) => (
        <section key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className={`group-label${g.danger ? ' danger' : ''}`}>{g.label}</h2>
          <div className="list">{g.rows}</div>
        </section>
      ))}
    </main>
  );
}
