import { useState } from 'react';
import type { Item } from '../lib/types';
import { useStore } from '../lib/store';
import { itemsOn } from '../lib/schedule';
import { addDays, dayNum, dowLong, dowShort, longDate, rangeLabel, startOfWeek, timeToMin } from '../lib/dates';
import { ItemRow, type SwipeAction } from '../components/ItemRow';
import { Icon } from '../components/Icon';
import { moveToTomorrow, postpone, remove, toggle } from '../lib/itemActions';
import { isRtl, t, tn } from '../lib/i18n';

export function Week({ today, onEdit }: { today: string; onEdit: (i: Item, date: string) => void }) {
  const items = useStore((s) => s.items);
  const areas = useStore((s) => s.areas);
  const settings = useStore((s) => s.settings);
  const ws0 = startOfWeek(today, settings.weekStart);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(today);
  const weekStart = addDays(ws0, offset * 7);

  const days = Array.from({ length: 7 }, (_, k) => addDays(weekStart, k));
  const capacity = Math.max(60, timeToMin(settings.dayEnd) - timeToMin(settings.dayStart));
  const minutes = (i: Item) => (i.kind === 'reminder' ? 0 : i.durationMin);

  const perArea = new Map<string, number>();
  let total = 0;
  for (const d of days) for (const i of itemsOn(items, d)) {
    perArea.set(i.areaId, (perArea.get(i.areaId) ?? 0) + minutes(i));
    total += minutes(i);
  }
  const split = areas.filter((a) => perArea.get(a.id)).map((a) => ({ ...a, min: perArea.get(a.id)! }));

  const sel = days.includes(selected) ? selected : weekStart;
  const selItems = itemsOn(items, sel);
  const label = offset === 0 ? t('This week') : offset === 1 ? t('Next week') : offset === -1 ? t('Last week') : offset > 0 ? t('Ahead') : t('Earlier');

  const go = (n: number) => {
    const next = offset + n;
    setOffset(next);
    setSelected(next === 0 ? today : addDays(ws0, next * 7));
  };
  const onAction = (i: Item) => (a: SwipeAction) => (a === 'later' ? postpone(i, sel, 60) : a === 'tomorrow' ? moveToTomorrow(i, sel) : void remove(i, sel));

  return (
    <main className="screen">
      <header className="header" style={{ alignItems: 'center' }}>
        <div>
          <div className="eyebrow">{rangeLabel(weekStart, addDays(weekStart, 6))}</div>
          <h1 className="title">{label}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn small" style={{ width: 44, height: 44, padding: 0 }} onClick={() => go(-1)} aria-label={t('Previous week')}><Icon name={isRtl() ? 'right' : 'left'} size={20} width={2} /></button>
          <button className="btn small" style={{ width: 44, height: 44, padding: 0 }} onClick={() => go(1)} aria-label={t('Next week')}><Icon name={isRtl() ? 'left' : 'right'} size={20} width={2} /></button>
        </div>
      </header>

      <section className="week" aria-label={t('How full each day is')}>
        {days.map((d) => {
          const load = Math.min(1, itemsOn(items, d).reduce((s, i) => s + minutes(i), 0) / capacity);
          return (
            <button key={d} className={`day${d === today ? ' today' : ''}`} aria-pressed={d === sel} onClick={() => setSelected(d)}
              aria-label={t('{day} {n}, {p}% booked', { day: dowLong(d), n: dayNum(d), p: Math.round(load * 100) })}>
              <span className="track"><span className="fill" style={{ height: Math.round(load * 72), background: load > 0.8 ? 'var(--accent)' : 'var(--blue-fill)' }} /></span>
              <span className="dow">{dowShort(d)}</span>
              <span className="num">{dayNum(d)}</span>
            </button>
          );
        })}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row-between" style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
          <span>{t('Where your time goes')}</span>
          <span>{t('{n} h planned', { n: Math.round(total / 60) })}</span>
        </div>
        <div className="split" role="img" aria-label={split.map((a) => `${a.name} ${Math.round((a.min / total) * 100)}%`).join(', ') || t('Nothing planned')}>
          {split.map((a) => <span key={a.id} style={{ flex: a.min, background: a.color }} />)}
        </div>
        {split.length > 0 && <div className="legend">{split.map((a) => <span key={a.id}><span className="dot" style={{ background: a.color }} />{a.name}</span>)}</div>}
      </section>

      <div className="row-between">
        <h2 className="section-title">{longDate(sel)}</h2>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{tn(selItems.length, '{n} item', '{n} items')}</span>
      </div>

      {selItems.length === 0 ? (
        <div className="empty card">{t('Free day.')}</div>
      ) : (
        <div className="list">
          {selItems.map((i) => (
            <ItemRow key={i.id} item={i} date={sel} area={areas.find((a) => a.id === i.areaId)}
              meta={[i.start ?? t('Anytime'), areas.find((a) => a.id === i.areaId)?.name].filter(Boolean).join(' · ')}
              onToggle={() => toggle(i, sel)} onOpen={() => onEdit(i, sel)} onAction={onAction(i)} />
          ))}
        </div>
      )}
    </main>
  );
}
