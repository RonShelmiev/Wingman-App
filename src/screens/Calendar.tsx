import { useLayoutEffect, useRef, useState, type TouchEvent } from 'react';
import type { Area, Item } from '../lib/types';
import { useStore } from '../lib/store';
import { isDoneOn, itemsOn } from '../lib/schedule';
import { addMonths, layoutDay, monthGrid, snapToHalfHour, untimedOn } from '../lib/calendar';
import { addDays, dayNum, dowShort, longDate, minToTime, monthYear, rangeLabel, startOfWeek, timeToMin, weekdayShort } from '../lib/dates';
import { Icon } from '../components/Icon';
import { isRtl, t, tn } from '../lib/i18n';
import { Week } from './Week';

type View = 'day' | 'week' | 'month' | 'overview';
const VIEWS: [View, string][] = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['overview', 'Overview']];
const VIEW_KEY = 'wingman:calview';

function savedView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v && VIEWS.some(([k]) => k === v)) return v as View;
  } catch {
    // Storage unavailable: use the default.
  }
  return 'week';
}

interface Props {
  today: string;
  now: Date;
  onEdit: (item: Item, date: string) => void;
  /** Tapped an empty slot: add something then (time is null for the all-day row or a month day). */
  onAddAt: (date: string, time: string | null) => void;
}

export function Calendar({ today, now, onEdit, onAddAt }: Props) {
  const items = useStore((s) => s.items);
  const areas = useStore((s) => s.areas);
  const weekStart = useStore((s) => s.settings.weekStart);
  const [view, setViewState] = useState<View>(savedView);
  const [cursor, setCursor] = useState(today);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Only a convenience.
    }
  };

  const switcher = (
    <div className="seg" role="group" aria-label={t('Calendar view')}>
      {VIEWS.map(([v, l]) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{t(l)}</button>)}
    </div>
  );

  // The overview is the original week screen (how full each day is, where your time goes).
  if (view === 'overview') return <Week today={today} onEdit={onEdit} top={switcher} />;

  const go = (n: number) => setCursor((c) => (view === 'month' ? addMonths(c, n) : addDays(c, n * (view === 'week' ? 7 : 1))));
  const ws = startOfWeek(cursor, weekStart);
  const days = view === 'day' ? [cursor] : Array.from({ length: 7 }, (_, k) => addDays(ws, k));
  const eyebrow = view === 'day' ? longDate(cursor) : view === 'week' ? rangeLabel(days[0], days[6]) : '';
  const showsToday = view === 'month' ? cursor.slice(0, 7) === today.slice(0, 7) : days.includes(today);
  const prevLabel = view === 'month' ? t('Previous month') : view === 'week' ? t('Previous week') : t('Previous day');
  const nextLabel = view === 'month' ? t('Next month') : view === 'week' ? t('Next week') : t('Next day');

  // Swipe sideways to move on, like a paper calendar. In Hebrew time runs right to left, so it flips.
  const onTouchStart = (e: TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go((dx < 0 ? 1 : -1) * (isRtl() ? -1 : 1));
  };

  return (
    <main className="screen cal-screen">
      <header className="header" style={{ alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1 className="title">{monthYear(view === 'week' ? days[3] : cursor)}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {!showsToday || (view === 'day' && cursor !== today) ? (
            <button className="btn small" style={{ height: 44 }} onClick={() => setCursor(today)}>{t('Today')}</button>
          ) : null}
          <button className="btn small icon-btn" onClick={() => go(-1)} aria-label={prevLabel}><Icon name={isRtl() ? 'right' : 'left'} size={20} width={2} /></button>
          <button className="btn small icon-btn" onClick={() => go(1)} aria-label={nextLabel}><Icon name={isRtl() ? 'left' : 'right'} size={20} width={2} /></button>
        </div>
      </header>

      {switcher}

      <div className="cal-frame" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {view === 'month' ? (
          <MonthView cursor={cursor} today={today} items={items} areas={areas} weekStart={weekStart}
            onPick={(d) => { setCursor(d); setView('day'); }} />
        ) : (
          <TimeGrid key={view} days={days} today={today} now={now} items={items} areas={areas} onEdit={onEdit} onAddAt={onAddAt}
            onPickDay={view === 'week' ? (d) => { setCursor(d); setView('day'); } : undefined} />
        )}
      </div>
    </main>
  );
}

const HOUR_PX = 48;

function TimeGrid({ days, today, now, items, areas, onEdit, onAddAt, onPickDay }: {
  days: string[]; today: string; now: Date; items: Item[]; areas: Area[];
  onEdit: (item: Item, date: string) => void; onAddAt: (date: string, time: string | null) => void; onPickDay?: (d: string) => void;
}) {
  const dayStart = useStore((s) => s.settings.dayStart);
  const scroller = useRef<HTMLDivElement>(null);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const color = (i: Item) => areas.find((a) => a.id === i.areaId)?.color ?? 'var(--blue-fill)';
  const cols = `44px repeat(${days.length}, minmax(0, 1fr))`;
  const single = days.length === 1;

  // Open at the start of your day, or a little before now when today is on screen.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const fromMin = days.includes(today) ? nowMin - 90 : timeToMin(dayStart) - 30;
    el.scrollTop = Math.max(0, (fromMin / 60) * HOUR_PX);
    // Only when the screen opens or moves to other days, not on every clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]]);

  const allDay = days.map((d) => untimedOn(items, d));
  const hasAllDay = allDay.some((l) => l.length);

  return (
    <div className={`cal-grid${single ? '' : ' multi'}`}>
      <div className="cal-head" style={{ gridTemplateColumns: cols }}>
        <span />
        {days.map((d) => {
          const label = `${dowShort(d)} ${dayNum(d)}`;
          const inner = <><span className="dow">{dowShort(d)}</span><span className={`num${d === today ? ' today' : ''}`}>{dayNum(d)}</span></>;
          return onPickDay
            ? <button key={d} className="cal-day-head" onClick={() => onPickDay(d)} aria-label={t('Open {day}', { day: label })}>{inner}</button>
            : <div key={d} className="cal-day-head">{inner}</div>;
        })}
      </div>

      {hasAllDay && (
        <div className="cal-allday" style={{ gridTemplateColumns: cols }}>
          <span className="cal-gutter-label">{t('Any time')}</span>
          {days.map((d, k) => {
            const list = allDay[k];
            const shown = list.slice(0, single ? 6 : 2);
            return (
              <div key={d} className="cal-allday-cell">
                {shown.map((i) => (
                  <button key={i.id} className={`cal-chip${isDoneOn(i, d) ? ' done' : ''}`} style={{ background: color(i) }} onClick={() => onEdit(i, d)}>{i.title}</button>
                ))}
                {list.length > shown.length && (
                  <button className="cal-more" onClick={() => onPickDay?.(d)}>{t('+{n} more', { n: list.length - shown.length })}</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="cal-scroll" ref={scroller}>
        <div className="cal-body" style={{ gridTemplateColumns: cols, height: 24 * HOUR_PX }}>
          <div className="cal-hours" aria-hidden="true">
            {Array.from({ length: 23 }, (_, h) => <span key={h} style={{ top: (h + 1) * HOUR_PX }} dir="ltr">{minToTime((h + 1) * 60)}</span>)}
          </div>
          {days.map((d) => (
            <div key={d} className={`cal-col${d === today ? ' is-today' : ''}`} style={{ backgroundSize: `100% ${HOUR_PX}px` }}
              aria-label={longDate(d)} role="group"
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                onAddAt(d, minToTime(snapToHalfHour((y / HOUR_PX) * 60)));
              }}>
              {layoutDay(items, d).map((p) => {
                const h = ((p.end - p.start) / 60) * HOUR_PX;
                const done = isDoneOn(p.item, d);
                const end = p.item.kind === 'reminder' ? '' : `–${minToTime(p.start + p.item.durationMin)}`;
                return (
                  <button key={p.item.id} className={`cal-event${done ? ' done' : ''}${h < 34 ? ' short' : ''}`}
                    style={{
                      top: (p.start / 60) * HOUR_PX, height: Math.max(18, h - 2), background: color(p.item),
                      insetInlineStart: `calc(${(p.col / p.cols) * 100}% + 1px)`, width: `calc(${100 / p.cols}% - 3px)`,
                    }}
                    onClick={() => onEdit(p.item, d)}
                    aria-label={`${p.item.title}, ${p.item.start}${end}${done ? `, ${t('done')}` : ''}`}>
                    <span className="ev-title">{p.item.channel === 'alarm' && <Icon name="alarm" size={11} width={2.4} />}{p.item.title}</span>
                    {h >= 34 && <span className="ev-time" dir="ltr">{p.item.start}{single ? end : ''}</span>}
                  </button>
                );
              })}
              {d === today && <span className="cal-now" style={{ top: (nowMin / 60) * HOUR_PX }} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthView({ cursor, today, items, areas, weekStart, onPick }: {
  cursor: string; today: string; items: Item[]; areas: Area[]; weekStart: 0 | 1; onPick: (d: string) => void;
}) {
  const grid = monthGrid(cursor, weekStart);
  const month = cursor.slice(0, 7);
  const color = (i: Item) => areas.find((a) => a.id === i.areaId)?.color ?? 'var(--blue-fill)';
  return (
    <div className="cal-month">
      <div className="cal-dows" aria-hidden="true">
        {Array.from({ length: 7 }, (_, k) => <span key={k}>{weekdayShort((k + weekStart) % 7)}</span>)}
      </div>
      <div className="cal-cells">
        {grid.map((d) => {
          const list = itemsOn(items, d);
          const shown = list.slice(0, 3);
          return (
            <button key={d} className={`cal-cell${d.slice(0, 7) !== month ? ' other' : ''}`} onClick={() => onPick(d)}
              aria-label={`${longDate(d)}, ${tn(list.length, '{n} item', '{n} items')}`}>
              <span className={`num${d === today ? ' today' : ''}`}>{dayNum(d)}</span>
              {shown.map((i) => (
                <span key={i.id} className={`cal-chip${isDoneOn(i, d) ? ' done' : ''}`} style={{ background: color(i) }}>{i.title}</span>
              ))}
              {list.length > shown.length && <span className="cal-more">+{list.length - shown.length}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
