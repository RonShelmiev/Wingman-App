import { useCallback, useEffect, useState } from 'react';
import type { Item } from './lib/types';
import { actions, getState, useStore } from './lib/store';
import { dueReminders, inWindow, isDoneOn, itemsOn } from './lib/schedule';
import { timeToMin, toDateStr, toTimeStr } from './lib/dates';
import { showNotification, startAlarmSound, stopAlarmSound, unlockAudio } from './lib/notify';
import { Icon, AppMark } from './components/Icon';
import { Today } from './screens/Today';
import { Week } from './screens/Week';
import { Reminders } from './screens/Reminders';
import { Settings } from './screens/Settings';
import { QuickAdd } from './screens/QuickAdd';
import { Plan } from './screens/Plan';
import { AlarmOverlay } from './screens/AlarmOverlay';

type Tab = 'today' | 'week' | 'reminders' | 'settings';
interface Ring { item: Item; date: string; key: string; test?: boolean }
interface Toast { id: string; title: string; body: string }

export function App() {
  const [now, setNow] = useState(() => new Date());
  const [tab, setTab] = useState<Tab>('today');
  const [sheet, setSheet] = useState<{ type: 'add' } | { type: 'edit'; item: Item } | { type: 'plan' } | null>(null);
  const [rings, setRings] = useState<Ring[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const areas = useStore((s) => s.areas);
  const today = toDateStr(now);

  // Clock: tick every 5 seconds and whenever the app comes back to the foreground.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 5000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const toast = useCallback((title: string, body: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, title, body }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  }, []);

  // Reminder engine: on every tick, fire whatever is due.
  useEffect(() => {
    const st = getState();
    const quiet = inWindow(toTimeStr(now), st.settings.quietStart, st.settings.quietEnd);
    const canPush = st.settings.pushEnabled && !quiet;

    for (const due of dueReminders(st.items, now, today, st.fired, st.snoozes)) {
      actions.markFired(due.key);
      const { item } = due;
      const when = item.start ? `${item.start}` : 'Today';
      if (item.channel === 'alarm') {
        setRings((r) => (r.some((x) => x.key === due.key) ? r : [...r, { item, date: due.date, key: due.key }]));
        startAlarmSound();
        void showNotification(`⏰ ${item.title}`, `Alarm · ${when}`, due.key, true);
      } else if (item.channel !== 'silent' && canPush) {
        const lead = item.remindOffsetMin ? `Starts ${due.date === today ? 'at' : 'on ' + due.date + ' at'} ${item.start ?? '09:00'}` : when;
        void showNotification(item.title, lead, due.key);
        toast(item.title, lead);
      }
    }

    // Morning brief and evening recap, once a day, within 2 hours of the chosen time.
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const routine = (key: string, at: string, title: string, body: () => string) => {
      const k = `${key}@${today}`;
      if (st.fired[k] || nowMin < timeToMin(at) || nowMin - timeToMin(at) > 120) return;
      actions.markFired(k);
      if (canPush) {
        void showNotification(title, body(), k);
        toast(title, body());
      }
    };
    const day = itemsOn(st.items, today);
    routine('brief', st.settings.morningBrief, 'Your day with Wingman', () => {
      const first = day.find((i) => i.start);
      return day.length ? `${day.length} thing${day.length > 1 ? 's' : ''} today${first ? `, first at ${first.start}: ${first.title}` : ''}.` : 'Nothing planned yet. Add a few things for today.';
    });
    routine('recap', st.settings.eveningRecap, 'Evening recap', () => {
      const done = day.filter((i) => isDoneOn(i, today)).length;
      const left = day.length - done;
      return `Done ${done} of ${day.length}.${left ? ` ${left} left — open Wingman to move them to tomorrow.` : ' Clean sweep!'}`;
    });
  }, [now, today, toast]);

  const ring = rings[0];
  const closeRing = (fn?: () => void) => {
    fn?.();
    setRings((r) => {
      const rest = r.slice(1);
      if (!rest.length) stopAlarmSound();
      return rest;
    });
  };

  const testAlarm = () => {
    const item: Item = {
      id: 'test', title: 'Test alarm', kind: 'reminder', areaId: areas[0]?.id ?? 'work', date: today, start: toTimeStr(new Date()),
      durationMin: 0, remindOffsetMin: 0, channel: 'alarm', repeat: { type: 'none' }, done: false, doneDates: [], createdAt: '',
    };
    unlockAudio();
    setRings((r) => [...r, { item, date: today, key: 'test', test: true }]);
    startAlarmSound();
  };

  const closeSheet = useCallback(() => setSheet(null), []);
  const nav: [Tab, string, string][] = [['today', 'Today', 'today'], ['week', 'Week', 'week'], ['reminders', 'Reminders', 'bell'], ['settings', 'Settings', 'settings']];

  return (
    <div className="app">
      {tab === 'today' && <Today now={now} today={today} onEdit={(item) => setSheet({ type: 'edit', item })} onAdd={() => setSheet({ type: 'add' })} onPlan={() => setSheet({ type: 'plan' })} onSettings={() => setTab('settings')} />}
      {tab === 'week' && <Week today={today} onEdit={(item) => setSheet({ type: 'edit', item })} />}
      {tab === 'reminders' && <Reminders today={today} onEdit={(item) => setSheet({ type: 'edit', item })} />}
      {tab === 'settings' && <Settings today={today} onTestAlarm={testAlarm} />}

      <nav className="nav" aria-label="Main">
        {nav.slice(0, 2).map(([t, label, icon]) => (
          <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}><Icon name={icon} width={tab === t ? 2 : 1.8} />{label}</button>
        ))}
        <button className="fab" aria-label="Add task, event or reminder" onClick={() => setSheet({ type: 'add' })}><Icon name="plus" size={26} width={2.4} /></button>
        {nav.slice(2).map(([t, label, icon]) => (
          <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}><Icon name={icon} width={tab === t ? 2 : 1.8} />{label}</button>
        ))}
      </nav>

      {sheet?.type === 'add' && <QuickAdd editing={null} today={today} onClose={closeSheet} />}
      {sheet?.type === 'edit' && <QuickAdd editing={sheet.item} today={today} onClose={closeSheet} />}
      {sheet?.type === 'plan' && <Plan today={today} now={now} onClose={closeSheet} />}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <span className="app-ico"><AppMark /></span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span className="tt">{t.title}</span><span className="tb">{t.body}</span></div>
            <button className="x" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><Icon name="close" size={18} /></button>
          </div>
        ))}
      </div>

      {ring && (
        <AlarmOverlay item={ring.item} date={ring.date} area={areas.find((a) => a.id === ring.item.areaId)} now={now}
          onStop={() => closeRing()}
          onSnooze={(m) => closeRing(() => !ring.test && actions.snooze(ring.key, m))}
          onDone={() => closeRing(() => {
            if (ring.test) return;
            const cur = getState().items.find((i) => i.id === ring.item.id);
            if (cur && !isDoneOn(cur, ring.date)) actions.toggleDone(cur, ring.date);
          })} />
      )}
    </div>
  );
}
