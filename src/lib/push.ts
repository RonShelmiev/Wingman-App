// Background delivery: keeps the server's copy of upcoming reminders in sync so they arrive
// as push notifications (and email) even when Wingman is closed.
import { useSyncExternalStore } from 'react';
import type { ScheduledReminder } from '../../server/types';
import type { State } from './store';
import { getState, subscribe } from './store';
import { addDays, at, toDateStr, toTimeStr } from './dates';
import { inWindow, isDoneOn, itemsOn, occurrenceKey, occursOn, reminderTime } from './schedule';
import { t, tn } from './i18n';
import { prettyDate } from './dates';

export const SCHEDULE_DAYS = 14;
const MAX = 500;

/** Every reminder that should go off in the next two weeks, as the server needs it. */
export function buildSchedule(s: State, now: Date, opts: { email: boolean }): ScheduledReminder[] {
  const out: ScheduledReminder[] = [];
  const today = toDateStr(now);
  const { settings } = s;
  const quiet = (d: Date) => inWindow(toTimeStr(d), settings.quietStart, settings.quietEnd);

  for (let k = 0; k <= SCHEDULE_DAYS; k++) {
    const date = addDays(today, k);
    for (const item of s.items) {
      if (item.remindOffsetMin === null || item.channel === 'silent') continue;
      if (!occursOn(item, date) || isDoneOn(item, date)) continue;
      const key = occurrenceKey(item, date);
      if (s.fired[key]) continue;
      const fireAt = s.snoozes[key] ? new Date(s.snoozes[key]) : reminderTime(item, date)!;
      if (fireAt.getTime() <= now.getTime()) continue;
      const alarm = item.channel === 'alarm';
      const email = item.channel === 'email' && opts.email && settings.emailEnabled && !!settings.email;
      if (!alarm && (quiet(fireAt) || (!settings.pushEnabled && !email))) continue;
      const time = item.start ?? '09:00';
      out.push({
        key,
        fireAt: fireAt.getTime(),
        title: alarm ? `⏰ ${item.title}` : item.title,
        body: alarm ? `${t('Alarm')} · ${time}` : item.remindOffsetMin ? (date === toDateStr(fireAt) ? t('Starts at {time}', { time }) : t('{date} at {time}', { date: prettyDate(date), time })) : time,
        alarm,
        email,
      });
    }

    if (!settings.pushEnabled) continue;
    const dayItems = itemsOn(s.items, date);
    const brief = at(date, settings.morningBrief);
    if (brief > now && !s.fired[`brief@${date}`] && !quiet(brief)) {
      const first = dayItems.find((i) => i.start);
      out.push({
        key: `brief@${date}`, fireAt: brief.getTime(), title: t('Your day with Wingman'), alarm: false, email: false,
        body: dayItems.length ? tn(dayItems.length, '{n} thing today', '{n} things today') + (first ? t(', first at {time}: {title}', { time: first.start!, title: first.title }) : '') + '.' : t('Nothing planned yet. Add a few things for today.'),
      });
    }
    const recap = at(date, settings.eveningRecap);
    if (recap > now && !s.fired[`recap@${date}`] && !quiet(recap) && dayItems.length) {
      out.push({ key: `recap@${date}`, fireAt: recap.getTime(), title: t('Evening recap'), body: t('Tap to tick off today and move what’s left to tomorrow.'), alarm: false, email: false });
    }
  }
  return out.sort((a, b) => a.fireAt - b.fireAt).slice(0, MAX);
}

// ---- Server status (for Settings) ----

export interface ServerStatus {
  /** null = still checking */
  available: boolean | null;
  /** Server has storage (needed for sync), even if push keys are missing. */
  storage: boolean;
  email: boolean;
  subscribed: boolean;
  lastSync: number | null;
  error: string | null;
}
let status: ServerStatus = { available: null, storage: false, email: false, subscribed: false, lastSync: null, error: null };
const statusListeners = new Set<() => void>();
const setStatus = (p: Partial<ServerStatus>) => {
  status = { ...status, ...p };
  statusListeners.forEach((l) => l());
};
export const getServerStatus = () => status;
export const onServerStatus = (l: () => void) => (statusListeners.add(l), () => statusListeners.delete(l));
export const useServerStatus = () =>
  useSyncExternalStore((l) => (statusListeners.add(l), () => statusListeners.delete(l)), () => status);

// ---- Device + subscription ----

export function deviceId(): string {
  try {
    let id = localStorage.getItem('wingman:device');
    if (!id) {
      const bytes = crypto.getRandomValues(new Uint8Array(24));
      id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem('wingman:device', id);
    }
    return id;
  } catch {
    return 'ephemeral-' + Math.random().toString(36).slice(2, 18);
  }
}

let publicKey: string | null = null;

function urlBase64ToUint8Array(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask the browser for a push subscription. Needs notification permission and the service worker. */
export async function enableBackgroundPush(): Promise<boolean> {
  if (!publicKey || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
    setStatus({ subscribed: !!sub });
    await syncNow();
    return !!sub;
  } catch (e) {
    setStatus({ error: (e as Error).message });
    return false;
  }
}

export async function syncNow() {
  if (!status.available) return;
  const s = getState();
  const sub = await currentSubscription();
  setStatus({ subscribed: !!sub });
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: deviceId(),
        subscription: sub ? sub.toJSON() : null,
        email: s.settings.emailEnabled && s.settings.email ? s.settings.email : null,
        reminders: buildSchedule(s, new Date(), { email: status.email }),
      }),
    });
    setStatus(res.ok ? { lastSync: Date.now(), error: null } : { error: `Sync failed (${res.status})` });
  } catch {
    setStatus({ error: 'Offline — will sync when you’re back online' });
  }
}

/** Tell the server the app already showed these, so it doesn't push them again. */
export function ackShown(keys: string[]) {
  if (!status.available || !keys.length) return;
  void fetch('/api/ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: deviceId(), keys }) }).catch(() => undefined);
}

let timer: number | undefined;
/** Find the server, then re-sync after every change (debounced), every 15 minutes, and when back online. */
export async function startBackgroundSync() {
  try {
    const res = await fetch('/api/config');
    const cfg = res.ok && res.headers.get('content-type')?.includes('json') ? ((await res.json()) as { publicKey: string | null; email: boolean; storage: boolean }) : null;
    publicKey = cfg?.publicKey ?? null;
    setStatus({ available: !!(cfg?.publicKey && cfg.storage), storage: !!cfg?.storage, email: !!cfg?.email, error: cfg && !cfg.storage ? 'Server storage is not set up yet' : null });
  } catch {
    setStatus({ available: false });
  }
  if (!status.available) return;
  // Already allowed notifications earlier? Make sure there's a push subscription.
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && !(await currentSubscription())) await enableBackgroundPush();
  void syncNow();
  subscribe(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void syncNow(), 2000);
  });
  window.setInterval(() => void syncNow(), 15 * 60_000);
  window.addEventListener('online', () => void syncNow());
}
