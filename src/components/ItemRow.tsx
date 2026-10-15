import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Area, Item } from '../lib/types';
import { isDoneOn, isRepeating } from '../lib/schedule';
import { formatDuration, monthDay, weekdayName, weekdayShort } from '../lib/dates';
import { getLang, isRtl, t } from '../lib/i18n';
import { DoneCheck, Icon } from './Icon';

const ordinal = (n: number) => (getLang() === 'he' ? String(n) : n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'));

export function repeatLabel(item: Item): string | null {
  const r = item.repeat;
  if (r.type === 'daily') return t('Daily');
  if (r.type === 'weekly') return t('Every {day}', { day: weekdayName(r.weekday) });
  if (r.type === 'everyNDays') return t('Every {n} days', { n: r.n });
  if (r.type === 'weekdays') return daysLabel(r.days ?? [1, 2, 3, 4, 5]);
  if (r.type === 'monthly' && item.date) return t('Monthly on the {nth}', { nth: ordinal(Number(item.date.slice(8, 10))) });
  if (r.type === 'yearly' && item.date) return t('Every year on {date}', { date: monthDay(item.date) });
  return null;
}

/** "Sun–Thu" for a run of days (wrapping past Saturday), otherwise "Mon, Wed, Fri". */
export function daysLabel(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return t('Daily');
  // A run has exactly one day whose previous day isn't chosen; start there.
  const starts = [...set].filter((d) => !set.has((d + 6) % 7));
  if (starts.length === 1 && set.size >= 3) {
    let end = starts[0];
    while (set.has((end + 1) % 7)) end = (end + 1) % 7;
    return `${weekdayShort(starts[0])}–${weekdayShort(end)}`;
  }
  return [...set].sort((a, b) => a - b).map(weekdayShort).join(', ');
}

export function reminderLabel(item: Item): string | null {
  const o = item.remindOffsetMin;
  if (o === null) return null;
  if (o === 0) return item.channel === 'alarm' ? t('Alarm') : t('At time');
  if (o % 1440 === 0) return o === 1440 ? t('1 day before') : t('{n} days before', { n: o / 1440 });
  if (o % 60 === 0) return o === 60 ? t('1 hour before') : t('{n}h before', { n: o / 60 });
  return t('{n} min before', { n: o });
}

export function ChannelIcon({ item }: { item: Item }) {
  if (item.remindOffsetMin === null) return null;
  const map = { alarm: ['alarm', t('Alarm')], push: ['bell', t('Notification')], email: ['mail', t('Email')], silent: null } as const;
  const v = map[item.channel];
  if (!v) return null;
  return <span className="icon-muted"><Icon name={v[0]} size={20} label={v[1]} /></span>;
}

export type SwipeAction = 'later' | 'tomorrow' | 'delete';

interface Props {
  item: Item;
  date: string;
  area?: Area;
  meta?: string;
  current?: boolean;
  danger?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAction?: (a: SwipeAction) => void;
  trailing?: ReactNode;
}

const DONE_AT = 90;
const ACTION_W = 72;

export function ItemRow({ item, date, area, meta, current, danger, onToggle, onOpen, onAction, trailing }: Props) {
  const done = isDoneOn(item, date);
  const parts = meta ?? [area?.name, item.kind !== 'reminder' ? formatDuration(item.durationMin) : null, repeatLabel(item)].filter(Boolean).join(' · ');
  const actions: SwipeAction[] = onAction ? [...(item.start && !done ? (['later'] as const) : []), 'tomorrow', 'delete'] : [];
  const openW = actions.length * ACTION_W;

  // Swipe: toward the reading end = done; toward the start = reveal actions. Mirrored in Hebrew.
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const drag = useRef<{ x: number; y: number; base: number; swiping: boolean; moved: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const dir = isRtl() ? -1 : 1;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setOpen(false);
        setDx(0);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!onAction || e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, base: open ? -openW * dir : 0, swiping: false, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.swiping) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) return (drag.current = null);
      if (Math.abs(mx) < 10) return;
      d.swiping = true;
      d.moved = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    const logical = (d.base + mx) * dir;
    setDx(Math.max(-openW - 30, Math.min(DONE_AT + 30, logical)) * dir);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.swiping) return;
    const logical = dx * dir;
    if (logical >= DONE_AT) {
      setOpen(false);
      setDx(0);
      onToggle();
    } else if (logical <= -openW / 2) {
      setOpen(true);
      setDx(-openW * dir);
    } else {
      setOpen(false);
      setDx(0);
    }
    // Swallow the click that follows a swipe.
    if (d.moved) {
      const stop = (ev: Event) => ev.stopPropagation();
      root.current?.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => root.current?.removeEventListener('click', stop, { capture: true }), 50);
    }
  };

  const act = (a: SwipeAction) => {
    setOpen(false);
    setDx(0);
    onAction?.(a);
  };
  const logical = dx * dir;

  return (
    <div className="swipe" ref={root}>
      {onAction && (
        <>
          <div className="swipe-done" aria-hidden="true" style={{ opacity: Math.min(1, Math.max(0, logical / DONE_AT)), visibility: logical > 0 ? 'visible' : 'hidden' }}>
            <Icon name="check" size={22} width={2.6} />
          </div>
          <div className="swipe-actions" aria-hidden={!open} style={{ width: openW, visibility: logical < 0 ? 'visible' : 'hidden' }}>
            {actions.map((a) => (
              <button key={a} className={`swipe-btn ${a}`} tabIndex={open ? 0 : -1} onClick={() => act(a)}>
                <Icon name={a === 'delete' ? 'trash' : a === 'later' ? 'today' : 'right'} size={20} />
                {a === 'later' ? t('+1 hour') : a === 'tomorrow' ? t('Tomorrow') : t('Delete')}
              </button>
            ))}
          </div>
        </>
      )}
      <div
        className={`item${current ? ' current' : ''}${done && !isRepeating(item) ? ' faded' : ''}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: drag.current?.swiping ? 'none' : undefined }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      >
        <span className="bar" style={{ background: area?.color ?? 'var(--ring-idle)' }} aria-hidden="true" />
        <button className="body" onClick={onOpen} aria-label={t('Edit {title}', { title: item.title })}>
          <span className={`name${done ? ' done' : ''}`}>{item.title}</span>
          {parts && <span className="sub">{parts}</span>}
        </button>
        {current && !done && <span className="badge">{t('NOW')}</span>}
        {trailing ?? <ChannelIcon item={item} />}
        <button className="check" onClick={onToggle} aria-pressed={done} aria-label={`${done ? t('Mark not done') : t('Mark done')}: ${item.title}`}>
          {done ? <DoneCheck /> : <span className={`ring${danger ? ' danger' : ''}`} />}
        </button>
      </div>
    </div>
  );
}
