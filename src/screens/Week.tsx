import { useState } from 'react';
import type { Item } from '../lib/types';
import { actions, useStore } from '../lib/store';
import { itemsOn } from '../lib/schedule';
import { addDays, dayNum, dowLong, dowShort, monthShort, startOfWeek, timeToMin } from '../lib/dates';
import { ItemRow } from '../components/ItemRow';
import { Icon } from '../components/Icon';

export function Week({ today, onEdit }: { today: string; onEdit: (i: Item) => void }) {
  const items = useStore((s) => s.items);
  const areas = useStore((s) => s.areas);
  const settings = useStore((s) => s.settings);
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const [selected, setSelected] = useState(today);

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
  const label = weekStart === startOfWeek(today) ? 'This week' : weekStart > today ? (weekStart === addDays(startOfWeek(today), 7) ? 'Next week' : 'Ahead') : 'Earlier';
  const end = addDays(weekStart, 6);

  const go = (n: number) => {
    const ws = addDays(weekStart, 7 * n);
    setWeekStart(ws);
    setSelected(ws === startOfWeek(today) ? today : ws);
  };

  return (
    <main className="screen">
      <header className="header" style={{ alignItems: 'center' }}>
        <div>
          <div className="eyebrow">{monthShort(weekStart)} {dayNum(weekStart)} – {monthShort(end) !== monthShort(weekStart) ? `${monthShort(end)} ` : ''}{dayNum(end)}</div>
          <h1 className="title">{label}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn small" style={{ width: 44, height: 44, padding: 0 }} onClick={() => go(-1)} aria-label="Previous week"><Icon name="left" size={20} width={2} /></button>
          <button className="btn small" style={{ width: 44, height: 44, padding: 0 }} onClick={() => go(1)} aria-label="Next week"><Icon name="right" size={20} width={2} /></button>
        </div>
      </header>

      <section className="week" aria-label="How full each day is">
        {days.map((d) => {
          const load = Math.min(1, itemsOn(items, d).reduce((s, i) => s + minutes(i), 0) / capacity);
          return (
            <button key={d} className={`day${d === today ? ' today' : ''}`} aria-pressed={d === sel} onClick={() => setSelected(d)}
              aria-label={`${dowLong(d)} ${dayNum(d)}, ${Math.round(load * 100)}% booked`}>
              <span className="track"><span className="fill" style={{ height: Math.round(load * 72), background: load > 0.8 ? '#D24B1F' : '#2F55D4' }} /></span>
              <span className="dow">{dowShort(d)}</span>
              <span className="num">{dayNum(d)}</span>
            </button>
          );
        })}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row-between" style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
          <span>Where your time goes</span>
          <span>{Math.round(total / 60)} h planned</span>
        </div>
        <div className="split" role="img" aria-label={split.map((a) => `${a.name} ${Math.round((a.min / total) * 100)}%`).join(', ') || 'Nothing planned'}>
          {split.map((a) => <span key={a.id} style={{ flex: a.min, background: a.color }} />)}
        </div>
        {split.length > 0 && (
          <div className="legend">{split.map((a) => <span key={a.id}><span className="dot" style={{ background: a.color }} />{a.name}</span>)}</div>
        )}
      </section>

      <div className="row-between">
        <h2 className="section-title">{dowLong(sel)}, {monthShort(sel)} {dayNum(sel)}</h2>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{selItems.length} item{selItems.length === 1 ? '' : 's'}</span>
      </div>

      {selItems.length === 0 ? (
        <div className="empty card">Free day.</div>
      ) : (
        <div className="list">
          {selItems.map((i) => (
            <ItemRow key={i.id} item={i} date={sel} area={areas.find((a) => a.id === i.areaId)}
              meta={[i.start ?? 'Anytime', areas.find((a) => a.id === i.areaId)?.name].filter(Boolean).join(' · ')}
              onToggle={() => actions.toggleDone(i, sel)} onOpen={() => onEdit(i)} />
          ))}
        </div>
      )}
    </main>
  );
}
