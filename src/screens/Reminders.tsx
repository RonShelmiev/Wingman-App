import type { ReactElement } from 'react';
import { useState } from 'react';
import type { Item } from '../lib/types';
import { actions, useStore } from '../lib/store';
import { isDoneOn, isRepeating, nextOccurrence, overdueItems, occursOn } from '../lib/schedule';
import { addDays, relativeDay } from '../lib/dates';
import { ItemRow, reminderLabel, repeatLabel } from '../components/ItemRow';

type Filter = 'all' | 'repeating' | 'done';

export function Reminders({ today, onEdit }: { today: string; onEdit: (i: Item) => void }) {
  const items = useStore((s) => s.items);
  const areas = useStore((s) => s.areas);
  const [filter, setFilter] = useState<Filter>('all');
  const areaOf = (i: Item) => areas.find((a) => a.id === i.areaId);

  // Everything you need to do or be reminded of; plain events without a reminder live on Today/Week.
  const relevant = items.filter((i) => i.kind !== 'event' || i.remindOffsetMin !== null);

  const meta = (i: Item, date: string | null) =>
    [date ? relativeDay(date, today) : 'No date', i.start, reminderLabel(i), repeatLabel(i)].filter(Boolean).join(' · ');

  const row = (i: Item, date: string | null, danger = false) => (
    <ItemRow key={i.id + (date ?? '')} item={i} date={date ?? today} area={areaOf(i)} meta={meta(i, date)} danger={danger}
      onToggle={() => actions.toggleDone(i, date ?? today)} onOpen={() => onEdit(i)}
      trailing={danger ? <button className="btn small" onClick={() => actions.updateItem(i.id, { date: today })}>Today</button> : undefined} />
  );

  let groups: { label: string; danger?: boolean; rows: ReactElement[] }[];
  if (filter === 'done') {
    const done = relevant.filter((i) => !isRepeating(i) && i.done);
    groups = [{ label: 'Done', rows: done.map((i) => row(i, i.date)) }];
  } else {
    const pool = filter === 'repeating' ? relevant.filter(isRepeating) : relevant;
    const overdue = filter === 'all' ? overdueItems(pool, today) : [];
    const todays = pool.filter((i) => occursOn(i, today));
    const upcoming = pool
      .filter((i) => !occursOn(i, today))
      .map((i) => ({ i, d: nextOccurrence(i, addDays(today, 1)) }))
      .filter((x): x is { i: Item; d: string } => !!x.d && x.d <= addDays(today, 30) && !(!isRepeating(x.i) && x.i.done))
      .sort((a, b) => (a.d + (a.i.start ?? '')).localeCompare(b.d + (b.i.start ?? '')));
    const someday = pool.filter((i) => !i.date && !i.done);
    groups = [
      { label: 'Overdue', danger: true, rows: overdue.map((i) => row(i, i.date, true)) },
      { label: 'Today', rows: todays.sort((a, b) => Number(isDoneOn(a, today)) - Number(isDoneOn(b, today))).map((i) => row(i, today)) },
      { label: 'Upcoming', rows: upcoming.map(({ i, d }) => row(i, d)) },
      { label: 'Someday', rows: someday.map((i) => row(i, null)) },
    ];
  }
  const shown = groups.filter((g) => g.rows.length);

  return (
    <main className="screen">
      <header className="header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
        <h1 className="title">Reminders</h1>
        <div className="seg" role="group" aria-label="Filter">
          {(['all', 'repeating', 'done'] as Filter[]).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
      </header>
      {shown.length === 0 && <div className="empty card">{filter === 'done' ? 'Nothing finished yet.' : 'No reminders. Tap + to add one.'}</div>}
      {shown.map((g) => (
        <section key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className={`group-label${g.danger ? ' danger' : ''}`}>{g.label}</h2>
          <div className="list">{g.rows}</div>
        </section>
      ))}
    </main>
  );
}
