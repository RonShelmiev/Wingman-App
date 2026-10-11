import type { Item } from '../lib/types';
import { actions, useStore } from '../lib/store';
import { isDoneOn, itemsOn, overdueItems } from '../lib/schedule';
import { at, dowLong, formatDuration, monthShort, dayNum, relativeDay, timeToMin, toTimeStr } from '../lib/dates';
import { ItemRow } from '../components/ItemRow';
import { Icon } from '../components/Icon';
import { notificationPermission, requestNotificationPermission } from '../lib/notify';
import { useState } from 'react';

interface Props {
  now: Date;
  today: string;
  onEdit: (item: Item) => void;
  onAdd: () => void;
  onPlan: () => void;
  onSettings: () => void;
}

function greeting(h: number) {
  return h < 5 ? 'Late night' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
}

function Ring({ done, total }: { done: number; total: number }) {
  const c = 2 * Math.PI * 31;
  const frac = total ? done / total : 0;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`${done} of ${total} done`} style={{ flexShrink: 0 }}>
      <circle cx="38" cy="38" r="31" fill="none" stroke="var(--hero-track)" strokeWidth="9" />
      {frac > 0 && <circle cx="38" cy="38" r="31" fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${frac * c} ${c}`} transform="rotate(-90 38 38)" />}
      <text x="38" y="44" textAnchor="middle" fill="#fff" fontFamily="Bricolage Grotesque, sans-serif" fontSize="18" fontWeight="700">{done}/{total}</text>
    </svg>
  );
}

export function Today({ now, today, onEdit, onAdd, onPlan, onSettings }: Props) {
  const items = useStore((s) => s.items);
  const areas = useStore((s) => s.areas);
  const name = useStore((s) => s.settings.name);
  const timer = useStore((s) => s.timer);
  const timerItem = timer ? items.find((i) => i.id === timer.itemId) : undefined;
  const [perm, setPerm] = useState(notificationPermission());
  const areaOf = (i: Item) => areas.find((a) => a.id === i.areaId);

  const day = itemsOn(items, today);
  const timed = day.filter((i) => i.start);
  const anytime = day.filter((i) => !i.start);
  const overdue = overdueItems(items, today);
  const doneCount = day.filter((i) => isDoneOn(i, today)).length;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const current = timed.find((i) => !isDoneOn(i, today) && i.kind !== 'reminder' && timeToMin(i.start!) <= nowMin && nowMin < timeToMin(i.start!) + i.durationMin);
  const next = timed.find((i) => !isDoneOn(i, today) && timeToMin(i.start!) > nowMin);
  const untimedOpen = anytime.filter((i) => !isDoneOn(i, today) && i.repeat.type === 'none').length + overdue.length;
  const hasReminders = items.some((i) => i.remindOffsetMin !== null);

  const meta = (i: Item) => {
    if (i === current) {
      const left = timeToMin(i.start!) + i.durationMin - nowMin;
      return `${areaOf(i)?.name ?? ''} · now · ${formatDuration(left)} left`;
    }
    return undefined;
  };

  const row = (i: Item, opts: { date?: string; danger?: boolean } = {}) => (
    <ItemRow key={i.id} item={i} date={opts.date ?? today} area={areaOf(i)} meta={i === current ? meta(i) : opts.danger ? `${areaOf(i)?.name ?? ''} · ${relativeDay(i.date!, today)}` : undefined}
      current={i === current} danger={opts.danger} onToggle={() => actions.toggleDone(i, opts.date ?? today)} onOpen={() => onEdit(i)} />
  );

  return (
    <main className="screen">
      <header className="header">
        <div>
          <div className="eyebrow">{dowLong(today)}, {monthShort(today)} {dayNum(today)}</div>
          <h1 className="title">{greeting(now.getHours())}{name ? `, ${name}` : ''}</h1>
        </div>
        <button className="avatar" onClick={onSettings} aria-label="Settings">{name ? name[0].toUpperCase() : <Icon name="settings" size={22} />}</button>
      </header>

      {perm === 'default' && hasReminders && (
        <div className="banner">
          <span style={{ flexGrow: 1 }}>Allow notifications so Wingman can remind you.</span>
          <button className="btn primary" onClick={async () => setPerm(await requestNotificationPermission())}>Allow</button>
        </div>
      )}

      <section className="hero" aria-label="Today at a glance">
        <Ring done={doneCount} total={day.length} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          {next ? (
            <>
              <span className="label">Up next · {countdown(at(today, next.start!).getTime() - now.getTime())}</span>
              <span className="big">{next.title}</span>
              <span className="meta">{next.start}{next.kind !== 'reminder' ? ` – ${toTimeStr(new Date(at(today, next.start!).getTime() + next.durationMin * 60000))}` : ''}</span>
            </>
          ) : (
            <>
              <span className="label">{day.length ? 'Nothing else timed today' : 'Clear day'}</span>
              <span className="big">{day.length && doneCount === day.length ? 'All done. Nice work.' : untimedOpen ? `${untimedOpen} thing${untimedOpen > 1 ? 's' : ''} without a time` : 'Add something to get started'}</span>
            </>
          )}
        </div>
      </section>

      {overdue.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className="group-label danger">Overdue</h2>
          <div className="list">{overdue.map((i) => row(i, { date: i.date!, danger: true }))}</div>
        </section>
      )}

      {timer && timerItem && (
        <section className="focus" aria-label="Focus timer">
          <span className="focus-dot" aria-hidden="true" />
          <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="focus-label">Focusing · {formatDuration(Math.max(0, Math.floor((now.getTime() - new Date(timer.startedAt).getTime()) / 60000)))}</span>
            <span className="name" style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{timerItem.title}</span>
          </div>
          <button className="btn small" onClick={() => actions.stopTimer(false)}>Stop</button>
          <button className="btn small primary" onClick={() => actions.stopTimer(true)}>Done</button>
        </section>
      )}

      <div className="row-between">
        <h2 className="section-title">Your day</h2>
        {untimedOpen > 0 && <button className="link-btn" onClick={onPlan}>Plan with Wingman</button>}
      </div>

      {day.length === 0 ? (
        <div className="empty card">
          <span>Nothing planned yet. Tap + and just type, like “Gym tomorrow 7am”.</span>
          <div className="btn-row" style={{ width: '100%' }}>
            <button className="btn" onClick={() => actions.loadSample()}>Try a sample day</button>
            <button className="btn primary" onClick={onAdd}>Add something</button>
          </div>
        </div>
      ) : (
        <>
          <ol className="timeline">
            {timed.map((i) => (
              <li className="tl-row" key={i.id}>
                <span className={`tl-time${i === current ? ' now' : ''}`}>{i.start}</span>
                {row(i)}
              </li>
            ))}
          </ol>
          {anytime.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 className="group-label">Anytime today</h2>
              <div className="list">{anytime.map((i) => row(i))}</div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function countdown(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'now';
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  return `in ${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
}
