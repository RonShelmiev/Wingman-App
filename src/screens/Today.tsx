import { useState } from 'react';
import type { Item } from '../lib/types';
import { actions, useStore } from '../lib/store';
import { comingUp, isDoneOn, isRepeating, itemsOn, overdueItems } from '../lib/schedule';
import { at, dowLong, formatDuration, longDate, relativeDay, timeToMin, toTimeStr } from '../lib/dates';
import { ItemRow, type SwipeAction } from '../components/ItemRow';
import { Icon } from '../components/Icon';
import { notificationPermission, requestNotificationPermission } from '../lib/notify';
import { moveAllToTomorrow, moveToTomorrow, postpone, remove, toggle } from '../lib/itemActions';
import { undoable } from '../lib/undo';
import { t, tn } from '../lib/i18n';

interface Props {
  now: Date;
  today: string;
  onEdit: (item: Item, date: string) => void;
  onAdd: () => void;
  onPlan: () => void;
  onSettings: () => void;
}

function greeting(h: number) {
  return h < 5 ? t('Late night') : h < 12 ? t('Morning') : h < 18 ? t('Afternoon') : t('Evening');
}

function Ring({ done, total }: { done: number; total: number }) {
  const c = 2 * Math.PI * 31;
  const frac = total ? done / total : 0;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={t('{done} of {total} done', { done, total })} style={{ flexShrink: 0 }}>
      <circle cx="38" cy="38" r="31" fill="none" stroke="var(--hero-track)" strokeWidth="9" />
      {frac > 0 && <circle cx="38" cy="38" r="31" fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${frac * c} ${c}`} transform="rotate(-90 38 38)" style={{ transition: 'stroke-dasharray .4s ease' }} />}
      <text x="38" y="44" textAnchor="middle" fill="#fff" fontFamily="Bricolage Grotesque, sans-serif" fontSize="18" fontWeight="700" direction="ltr">{done}/{total}</text>
    </svg>
  );
}

function countdown(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return t('now');
  if (m < 60) return t('in {n} min', { n: m });
  const h = Math.floor(m / 60);
  return m % 60 ? t('in {h}h {m}m', { h, m: m % 60 }) : t('in {h}h', { h });
}

function inDaysLabel(n: number, date: string) {
  if (n === 1) return t('Tomorrow');
  if (n < 7) return dowLong(date);
  return t('in {n} days', { n });
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
  const upcoming = comingUp(items, today);

  const current = timed.find((i) => !isDoneOn(i, today) && i.kind !== 'reminder' && timeToMin(i.start!) <= nowMin && nowMin < timeToMin(i.start!) + i.durationMin);
  const next = timed.find((i) => !isDoneOn(i, today) && timeToMin(i.start!) > nowMin);
  const untimedOpen = anytime.filter((i) => !isDoneOn(i, today) && i.repeat.type === 'none').length + overdue.length;
  const hasReminders = items.some((i) => i.remindOffsetMin !== null);
  // Unfinished one-offs whose time has passed (or untimed), offered for tomorrow — always after 17:00.
  const leftover = day.filter((i) => !isRepeating(i) && !isDoneOn(i, today) && (nowMin >= 17 * 60 || !i.start || timeToMin(i.start) + i.durationMin < nowMin));

  const onAction = (i: Item, date: string) => (a: SwipeAction) => {
    if (a === 'later') postpone(i, date, 60);
    else if (a === 'tomorrow') moveToTomorrow(i, date);
    else void remove(i, date);
  };

  const row = (i: Item, opts: { date?: string; danger?: boolean } = {}) => {
    const date = opts.date ?? today;
    const meta = i === current
      ? `${areaOf(i)?.name ?? ''} · ${t('now')} · ${t('{left} left', { left: formatDuration(timeToMin(i.start!) + i.durationMin - nowMin) })}`
      : opts.danger ? `${areaOf(i)?.name ?? ''} · ${relativeDay(i.date!, today)}` : undefined;
    return (
      <ItemRow key={i.id} item={i} date={date} area={areaOf(i)} meta={meta} current={i === current} danger={opts.danger}
        onToggle={() => toggle(i, date)} onOpen={() => onEdit(i, date)} onAction={onAction(i, date)} />
    );
  };

  return (
    <main className="screen">
      <header className="header">
        <div>
          <div className="eyebrow">{longDate(today)}</div>
          <h1 className="title">{greeting(now.getHours())}{name ? `, ${name}` : ''}</h1>
        </div>
        <button className="avatar" onClick={onSettings} aria-label={t('Settings')}>{name ? name[0].toUpperCase() : <Icon name="settings" size={22} />}</button>
      </header>

      {perm === 'default' && hasReminders && (
        <div className="banner">
          <span style={{ flexGrow: 1 }}>{t('Allow notifications so Wingman can remind you.')}</span>
          <button className="btn primary" onClick={async () => setPerm(await requestNotificationPermission())}>{t('Allow')}</button>
        </div>
      )}

      <section className="hero" aria-label={t('Today at a glance')}>
        <Ring done={doneCount} total={day.length} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          {next ? (
            <>
              <span className="label">{t('Up next')} · {countdown(at(today, next.start!).getTime() - now.getTime())}</span>
              <span className="big">{next.title}</span>
              <span className="meta" dir="ltr" style={{ textAlign: 'start' }}>{next.start}{next.kind !== 'reminder' ? ` – ${toTimeStr(new Date(at(today, next.start!).getTime() + next.durationMin * 60000))}` : ''}</span>
            </>
          ) : (
            <>
              <span className="label">{day.length ? t('Nothing else timed today') : t('Clear day')}</span>
              <span className="big">{day.length && doneCount === day.length ? t('All done. Nice work.') : untimedOpen ? tn(untimedOpen, '{n} thing without a time', '{n} things without a time') : t('Add something to get started')}</span>
            </>
          )}
        </div>
      </section>

      {upcoming.length > 0 && (
        <section className="coming" aria-label={t('Coming up')}>
          <h2 className="group-label">{t('Coming up')}</h2>
          <ul>
            {upcoming.map(({ item, date, inDays }) => (
              <li key={item.id}>
                <button onClick={() => onEdit(item, date)}>
                  <span className="dot" style={{ background: areaOf(item)?.color }} />
                  <span className="c-title">{item.title}</span>
                  <span className="c-when">{inDaysLabel(inDays, date)}{item.start ? ` · ${item.start}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {overdue.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row-between">
            <h2 className="group-label danger">{t('Overdue')}</h2>
            <button className="link-btn" style={{ padding: 0 }} onClick={() => undoable(t('Moved {n} to today', { n: overdue.length }), () => overdue.forEach((i) => actions.updateItem(i.id, { date: today })))}>{t('Move all to today')}</button>
          </div>
          <div className="list">{overdue.map((i) => row(i, { date: i.date!, danger: true }))}</div>
        </section>
      )}

      {timer && timerItem && (
        <section className="focus" aria-label={t('Focus timer')}>
          <span className="focus-dot" aria-hidden="true" />
          <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="focus-label">{t('Focusing')} · {formatDuration(Math.max(0, Math.floor((now.getTime() - new Date(timer.startedAt).getTime()) / 60000)))}</span>
            <span className="name" style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{timerItem.title}</span>
          </div>
          <button className="btn small" onClick={() => actions.stopTimer(false)}>{t('Stop')}</button>
          <button className="btn small primary" onClick={() => actions.stopTimer(true)}>{t('Done')}</button>
        </section>
      )}

      <div className="row-between">
        <h2 className="section-title">{t('Your day')}</h2>
        {untimedOpen > 0 && <button className="link-btn" onClick={onPlan}>{t('Plan with Wingman')}</button>}
      </div>

      {day.length === 0 ? (
        <div className="empty card">
          <span>{t('Nothing planned yet. Tap + and just type, like “Gym tomorrow 7am”.')}</span>
          <div className="btn-row" style={{ width: '100%' }}>
            <button className="btn" onClick={() => actions.loadSample()}>{t('Try a sample day')}</button>
            <button className="btn primary" onClick={onAdd}>{t('Add something')}</button>
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
              <h2 className="group-label">{t('Anytime today')}</h2>
              <div className="list">{anytime.map((i) => row(i))}</div>
            </section>
          )}
          {leftover.length > 0 && (
            <button className="btn" onClick={() => moveAllToTomorrow(leftover, today)}>
              {tn(leftover.length, 'Move {n} unfinished to tomorrow', 'Move {n} unfinished to tomorrow')}
            </button>
          )}
          <p className="hint">{t('Tip: swipe an item to mark it done, or the other way for more.')}</p>
        </>
      )}
    </main>
  );
}
