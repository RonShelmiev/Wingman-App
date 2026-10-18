import { useCallback, useEffect, useState } from 'react';
import type { Item } from './lib/types';
import { actions, getState, useStore } from './lib/store';
import { dueReminders, inWindow, isDoneOn, itemsOn } from './lib/schedule';
import { timeToMin, toDateStr, toTimeStr } from './lib/dates';
import { showNotification, startAlarmSound, stopAlarmSound, unlockAudio } from './lib/notify';
import { ackShown } from './lib/push';
import { Icon, AppMark } from './components/Icon';
import { Celebration, ScopeDialog, UndoBar, UpdateBar } from './components/Overlays';
import { Recap } from './screens/Recap';
import { Welcome } from './screens/Welcome';
import { Notes } from './screens/Notes';
import { NoteEditor } from './screens/NoteEditor';
import { t, tn } from './lib/i18n';
import { prettyDate } from './lib/dates';
import { Today } from './screens/Today';
import { Week } from './screens/Week';
import { Reminders } from './screens/Reminders';
import { Settings } from './screens/Settings';
import { QuickAdd } from './screens/QuickAdd';
import { Plan } from './screens/Plan';
import { AlarmOverlay } from './screens/AlarmOverlay';

type Tab = 'today' | 'week' | 'reminders' | 'notes' | 'settings';
interface Ring { item: Item; date: string; key: string; test?: boolean }
interface Toast { id: string; title: string; body: string; action?: { label: string; run: () => void } }
type SheetState = { type: 'add' } | { type: 'edit'; item: Item; date: string } | { type: 'plan' } | { type: 'recap' } | { type: 'note'; id: string } | null;

export function App() {
  const [now, setNow] = useState(() => new Date());
  const [tab, setTab] = useState<Tab>('today');
  // Opened from the evening-recap notification?
  const [sheet, setSheet] = useState<SheetState>(() => (new URLSearchParams(location.search).has('recap') ? { type: 'recap' } : null));
  const [rings, setRings] = useState<Ring[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const areas = useStore((s) => s.areas);
  const theme = useStore((s) => s.settings.theme);
  const language = useStore((s) => s.settings.language);
  const onboarded = useStore((s) => s.settings.onboarded);
  const today = toDateStr(now);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
    if (location.search.includes('recap')) history.replaceState(null, '', location.pathname);
  }, [language]);

  // Appearance: "system" follows the phone; light/dark override it.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const paint = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E1120' : '#F4F5F7');
    };
    paint();
    mq.addEventListener('change', paint);
    return () => mq.removeEventListener('change', paint);
  }, [theme]);

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

  const toast = useCallback((title: string, body: string, action?: Toast['action']) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, title, body, action }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 8000);
  }, []);

  // Reminder engine: on every tick, fire whatever is due.
  useEffect(() => {
    const st = getState();
    const quiet = inWindow(toTimeStr(now), st.settings.quietStart, st.settings.quietEnd);
    const canPush = st.settings.pushEnabled && !quiet;

    const shown: string[] = [];
    for (const due of dueReminders(st.items, now, today, st.fired, st.snoozes)) {
      actions.markFired(due.key);
      // Older than 10 minutes means the app was closed when it was due: the server already
      // delivered it as a push, so don't ring or notify late.
      if (now.getTime() - due.fireAt.getTime() > 10 * 60_000) continue;
      shown.push(due.key);
      const { item } = due;
      const when = item.start ? `${item.start}` : t('Today');
      if (item.channel === 'alarm') {
        setRings((r) => (r.some((x) => x.key === due.key) ? r : [...r, { item, date: due.date, key: due.key }]));
        startAlarmSound();
        void showNotification(`⏰ ${item.title}`, `${t('Alarm')} · ${when}`, due.key, true);
      } else if (item.channel !== 'silent' && canPush) {
        const time = item.start ?? '09:00';
        const lead = item.remindOffsetMin ? (due.date === today ? t('Starts at {time}', { time }) : t('{date} at {time}', { date: prettyDate(due.date), time })) : when;
        void showNotification(item.title, lead, due.key);
        toast(item.title, lead);
      }
    }

    ackShown(shown);

    // Morning brief and evening recap, once a day, within 2 hours of the chosen time.
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const routine = (key: string, at: string, title: string, body: () => string, action?: Toast['action']) => {
      const k = `${key}@${today}`;
      if (st.fired[k] || nowMin < timeToMin(at)) return;
      actions.markFired(k);
      if (nowMin - timeToMin(at) > 10) return; // missed while closed; the server sent it
      ackShown([k]);
      if (canPush) {
        void showNotification(title, body(), k);
        toast(title, body(), action);
      }
    };
    const day = itemsOn(st.items, today);
    routine('brief', st.settings.morningBrief, t('Your day with Wingman'), () => briefText(day));
    routine('recap', st.settings.eveningRecap, t('Evening recap'), () => {
      const done = day.filter((i) => isDoneOn(i, today)).length;
      const left = day.length - done;
      return t('Done {done} of {total}.', { done, total: day.length }) + ' ' + (left ? tn(left, '{n} left — tap Review to move it to tomorrow.', '{n} left — tap Review to move them to tomorrow.') : t('Clean sweep!'));
    }, { label: t('Review'), run: () => setSheet({ type: 'recap' }) });
  }, [now, today, toast]);

  // Tapped an alarm notification: open the ringing screen (from a fresh start via ?alarm=…, or a message if already open).
  useEffect(() => {
    const open = (raw: string) => {
      const key = raw.split('#')[0];
      const [id, date] = key.split('@');
      const item = getState().items.find((i) => i.id === id);
      if (!item || !date || isDoneOn(item, date)) return;
      actions.markFired(key);
      ackShown([key]);
      setRings((r) => (r.some((x) => x.key === key) ? r : [...r, { item, date, key }]));
      startAlarmSound();
    };
    const param = new URLSearchParams(location.search).get('alarm');
    if (param) {
      history.replaceState(null, '', location.pathname);
      open(param);
    }
    const onMessage = (e: MessageEvent) => e.data?.type === 'alarm' && typeof e.data.key === 'string' && open(e.data.key);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

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
      id: 'test', title: t('Test alarm'), kind: 'reminder', areaId: areas[0]?.id ?? 'work', date: today, start: toTimeStr(new Date()),
      durationMin: 0, remindOffsetMin: 0, channel: 'alarm', repeat: { type: 'none' }, done: false, doneDates: [], createdAt: '',
    };
    unlockAudio();
    setRings((r) => [...r, { item, date: today, key: 'test', test: true }]);
    startAlarmSound();
  };

  const closeSheet = useCallback(() => setSheet(null), []);
  const nav: [Tab, string, string][] = [['today', t('Today'), 'today'], ['week', t('Week'), 'week'], ['reminders', t('Reminders'), 'bell'], ['notes', t('Notes'), 'note'], ['settings', t('Settings'), 'settings']];
  const newNote = () => setSheet({ type: 'note', id: actions.addNote() });
  const onEdit = (item: Item, date: string) => setSheet({ type: 'edit', item, date });

  if (!onboarded) return <><Welcome /><UpdateBar /></>;

  // A note opens as its own page (no bottom bar, no pop-up layer).
  if (sheet?.type === 'note') {
    return (
      <div className="app" style={{ paddingBottom: 0 }}>
        <NoteEditor key={sheet.id} id={sheet.id} onClose={() => { setSheet(null); setTab('notes'); }} />
        <UndoBar />
        <UpdateBar />
      </div>
    );
  }

  return (
    <div className="app">
      {tab === 'today' && <Today now={now} today={today} onEdit={onEdit} onAdd={() => setSheet({ type: 'add' })} onPlan={() => setSheet({ type: 'plan' })} onSettings={() => setTab('settings')} />}
      {tab === 'week' && <Week today={today} onEdit={onEdit} />}
      {tab === 'reminders' && <Reminders today={today} onEdit={onEdit} />}
      {tab === 'notes' && <Notes today={today} onOpen={(id) => setSheet({ type: 'note', id })} onNew={newNote} />}
      {tab === 'settings' && <Settings today={today} onTestAlarm={testAlarm} />}

      <nav className="nav" aria-label={t('Main')}>
        {nav.slice(0, 2).map(([id, label, icon]) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon name={icon} width={tab === id ? 2 : 1.8} />{label}</button>
        ))}
        <button className="fab" aria-label={tab === 'notes' ? t('New note') : t('Add task, event or reminder')} onClick={() => (tab === 'notes' ? newNote() : setSheet({ type: 'add' }))}><Icon name="plus" size={26} width={2.4} /></button>
        {nav.slice(2).map(([id, label, icon]) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon name={icon} width={tab === id ? 2 : 1.8} />{label}</button>
        ))}
      </nav>

      {sheet?.type === 'add' && <QuickAdd editing={null} occurrence={null} today={today} onClose={closeSheet} />}
      {sheet?.type === 'edit' && <QuickAdd key={sheet.item.id + sheet.date} editing={sheet.item} occurrence={sheet.date} today={today} onClose={closeSheet} />}
      {sheet?.type === 'plan' && <Plan today={today} now={now} onClose={closeSheet} />}
      {sheet?.type === 'recap' && <Recap today={today} onClose={closeSheet} />}

      <UpdateBar />
      <UndoBar />
      <ScopeDialog />
      <Celebration />

      <div className="toasts" aria-live="polite">
        {toasts.map((ts) => (
          <div className="toast" key={ts.id}>
            <span className="app-ico"><AppMark /></span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1, minWidth: 0 }}>
              <span className="tt">{ts.title}</span><span className="tb">{ts.body}</span>
              {ts.action && <button className="btn small primary" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => { ts.action!.run(); setToasts((x) => x.filter((y) => y.id !== ts.id)); }}>{ts.action.label}</button>}
            </div>
            <button className="x" aria-label={t('Dismiss')} onClick={() => setToasts((x) => x.filter((y) => y.id !== ts.id))}><Icon name="close" size={18} /></button>
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

/** Morning brief text, shared wording with the server schedule. */
export function briefText(day: Item[]): string {
  const first = day.find((i) => i.start);
  if (!day.length) return t('Nothing planned yet. Add a few things for today.');
  return tn(day.length, '{n} thing today', '{n} things today') + (first ? t(', first at {time}: {title}', { time: first.start!, title: first.title }) : '') + '.';
}
