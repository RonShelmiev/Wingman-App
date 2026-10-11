import { useMemo, useState } from 'react';
import type { Item } from '../lib/types';
import { actions, useStore } from '../lib/store';
import { isDoneOn, itemsOn, overdueItems } from '../lib/schedule';
import { addDays, formatDuration } from '../lib/dates';
import { planDay, type Suggestion } from '../lib/planner';
import { learnedDuration, preferenceFor } from '../lib/insights';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { t, tn } from '../lib/i18n';

export function Plan({ today, now, onClose }: { today: string; now: Date; onClose: () => void }) {
  const items = useStore((s) => s.items);
  const areas = useStore((s) => s.areas);
  const settings = useStore((s) => s.settings);
  const history = useStore((s) => s.history);
  const [which, setWhich] = useState<'today' | 'tomorrow'>('today');
  const day = which === 'today' ? today : addDays(today, 1);

  const { fixed, suggestions, unplaced, byId } = useMemo(() => {
    const onDay = itemsOn(items, day).filter((i) => !isDoneOn(i, day));
    const fixed = onDay.filter((i) => i.start);
    const overdue = overdueItems(items, today);
    // Repeating items keep their own schedule; only one-off untimed tasks get moved.
    const toPlace = [...onDay.filter((i) => !i.start && i.repeat.type === 'none'), ...overdue];
    const res = planDay(fixed.filter((i) => i.kind !== 'reminder'), toPlace, {
      dayStart: settings.dayStart,
      dayEnd: settings.dayEnd,
      bufferMin: settings.bufferMin,
      notBeforeMin: which === 'today' ? now.getHours() * 60 + now.getMinutes() + 5 : 0,
      overdueIds: new Set(overdue.map((i) => i.id)),
      estimate: (i) => learnedDuration(history, i),
      preference: preferenceFor(history),
    });
    return { fixed, ...res, byId: new Map(toPlace.map((i) => [i.id, i])) };
  }, [items, day, today, which, settings, now, history]);

  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const accepted = suggestions.filter((s) => !rejected.has(s.itemId));
  const areaOf = (i: Item) => areas.find((a) => a.id === i.areaId);

  const rows: { t: string; fixed?: Item; s?: Suggestion }[] = [
    ...fixed.map((i) => ({ t: i.start!, fixed: i })),
    ...suggestions.map((s) => ({ t: s.start, s })),
  ].sort((a, b) => a.t.localeCompare(b.t));

  const apply = () => {
    for (const s of accepted) actions.updateItem(s.itemId, { date: day, start: s.start, durationMin: s.durationMin });
    onClose();
  };

  return (
    <Sheet label={t('Plan with Wingman')} onClose={onClose}>
      <div className="row-between" style={{ alignItems: 'center' }}>
        <h1 style={{ fontSize: 26 }}>{t('Plan with Wingman')}</h1>
        <button className="btn small" onClick={onClose} aria-label={t('Close')} style={{ width: 44, height: 44, padding: 0 }}><Icon name="close" size={20} /></button>
      </div>
      <div className="seg" role="group" aria-label={t('Day to plan')}>
        <button aria-pressed={which === 'today'} onClick={() => { setWhich('today'); setRejected(new Set()); }}>{t('Today')}</button>
        <button aria-pressed={which === 'tomorrow'} onClick={() => { setWhich('tomorrow'); setRejected(new Set()); }}>{t('Tomorrow')}</button>
      </div>
      <p className="subtitle">
        {suggestions.length
          ? tn(suggestions.length, '{n} task without a time. Here’s where it fits — tap ✓ to keep or skip.', '{n} tasks without a time. Here’s where they fit — tap ✓ to keep or skip each.')
          : unplaced.length ? t('No free gap is long enough. Try tomorrow, or shorten a task.') : t('Everything already has a time.')}
      </p>

      <ol className="timeline">
        {rows.map((r) => r.fixed ? (
          <li className="tl-row" key={r.fixed.id}>
            <span className="tl-time">{r.t}</span>
            <div className="item"><span className="bar" style={{ background: areaOf(r.fixed)?.color }} /><span className="body"><span className="name">{r.fixed.title}</span></span></div>
          </li>
        ) : (() => {
          const i = byId.get(r.s!.itemId)!;
          const on = !rejected.has(i.id);
          return (
            <li className="tl-row" key={i.id}>
              <span className="tl-time" style={{ color: 'var(--blue)', fontWeight: 700 }}>{r.t}</span>
              <div className="suggested" style={{ opacity: on ? 1 : 0.55 }}>
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span className="name">{i.title}</span>
                  <span className="sub">{areaOf(i)?.name} · {formatDuration(r.s!.durationMin)} · {r.s!.reason}</span>
                </div>
                <button className="accept" aria-pressed={on} aria-label={`${on ? t('Skip') : t('Keep')}: ${i.title} · ${r.t}`}
                  onClick={() => setRejected((s) => { const n = new Set(s); if (on) n.add(i.id); else n.delete(i.id); return n; })}>
                  <Icon name="check" size={18} width={2.4} />
                </button>
              </div>
            </li>
          );
        })())}
      </ol>

      {unplaced.length > 0 && <p className="note">{t('Didn’t fit:')} {unplaced.map((i) => i.title).join(', ')}.</p>}
      <span style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted-2)' }}>{t('Keeps {n} min breathing room between items · plans {from}–{to}', { n: settings.bufferMin, from: settings.dayStart, to: settings.dayEnd })}</span>
      <div className="btn-row">
        <button className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn primary grow" disabled={!accepted.length} style={{ opacity: accepted.length ? 1 : 0.5 }} onClick={apply}>
          {accepted.length ? t('Accept {n}', { n: accepted.length }) : t('Nothing to accept')}
        </button>
      </div>
    </Sheet>
  );
}
