import type { PushPayload, PushSubscriptionJSON, ScheduledReminder, SyncRequest } from './types.js';
import { ALARM_REPEAT_MIN, alarmRepeatKeys, baseKey } from './types.js';

export interface Device {
  subscription: PushSubscriptionJSON | null;
  email: string | null;
  updatedAt: number;
}

export interface Store {
  getDevice(id: string): Promise<Device | null>;
  putDevice(id: string, device: Device): Promise<void>;
  deleteDevice(id: string): Promise<void>;
  /** Replace every scheduled reminder for a device (sent copies are kept). */
  replaceSchedule(id: string, reminders: ScheduledReminder[]): Promise<void>;
  addReminder(id: string, reminder: ScheduledReminder): Promise<void>;
  /** Remember a sent reminder (not scheduled) so a later "Snooze" tap can re-schedule it. Survives replaceSchedule. */
  keepSent(id: string, reminder: ScheduledReminder): Promise<void>;
  getReminder(id: string, key: string): Promise<ScheduledReminder | null>;
  removeReminder(id: string, key: string): Promise<void>;
  /** Reminders with fireAt <= now, oldest first. */
  due(now: number, limit: number): Promise<{ deviceId: string; reminder: ScheduledReminder }[]>;
  getVault(id: string): Promise<Vault | null>;
  /** Save only if the stored version still equals `expected` (0 = doesn't exist yet). */
  putVault(id: string, expected: number, blob: string): Promise<{ ok: true; version: number } | { ok: false; current: Vault | null }>;
}

/** An encrypted copy of one person's data. The server never sees the key. */
export interface Vault {
  version: number;
  blob: string;
  updatedAt: number;
}

export const VAULT_MAX = 2_000_000;
const VAULT_ID = /^[0-9a-f]{64}$/;

export async function handleVaultGet(store: Store, id: string) {
  if (!VAULT_ID.test(id)) throw new BadRequest('bad id');
  return store.getVault(id);
}

export async function handleVaultPut(store: Store, body: unknown) {
  const b = body as { id?: unknown; version?: unknown; blob?: unknown } | null;
  if (!b || typeof b.id !== 'string' || !VAULT_ID.test(b.id)) throw new BadRequest('bad id');
  if (typeof b.version !== 'number' || !Number.isInteger(b.version) || b.version < 0) throw new BadRequest('bad version');
  if (typeof b.blob !== 'string' || !b.blob.startsWith('v1.') || b.blob.length > VAULT_MAX) throw new BadRequest('bad blob');
  return store.putVault(b.id, b.version, b.blob);
}

export interface Senders {
  /** Resolves 'gone' when the push service says the subscription no longer exists. */
  push(sub: PushSubscriptionJSON, payload: PushPayload): Promise<'ok' | 'gone' | 'error'>;
  email: ((to: string, subject: string, text: string) => Promise<boolean>) | null;
}

export const LIMITS = { reminders: 500, title: 200, body: 500 };
/** A reminder more than this late (missed ticks) is dropped instead of sent. */
export const STALE_MS = 15 * 60_000;

const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export class BadRequest extends Error {}

export function validateSync(body: unknown): SyncRequest {
  const b = body as Partial<SyncRequest> | null;
  if (!b || typeof b !== 'object') throw new BadRequest('JSON body required');
  if (typeof b.deviceId !== 'string' || !DEVICE_ID.test(b.deviceId)) throw new BadRequest('bad deviceId');
  let subscription: PushSubscriptionJSON | null = null;
  if (b.subscription) {
    const s = b.subscription;
    if (typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://') || s.endpoint.length > 1000 || typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string') {
      throw new BadRequest('bad subscription');
    }
    subscription = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) } };
  }
  const email = typeof b.email === 'string' && EMAIL.test(b.email.trim()) ? b.email.trim() : null;
  if (!Array.isArray(b.reminders) || b.reminders.length > LIMITS.reminders) throw new BadRequest('bad reminders');
  const reminders = b.reminders.map((r): ScheduledReminder => {
    if (!r || typeof r.key !== 'string' || r.key.length > 120 || typeof r.fireAt !== 'number' || !Number.isFinite(r.fireAt)) throw new BadRequest('bad reminder');
    return {
      key: r.key,
      fireAt: Math.round(r.fireAt),
      title: String(r.title ?? '').slice(0, LIMITS.title),
      body: String(r.body ?? '').slice(0, LIMITS.body),
      alarm: !!r.alarm,
      email: !!r.email,
    };
  });
  return { deviceId: b.deviceId, subscription, email, reminders };
}

export async function handleSync(store: Store, req: SyncRequest, now: number) {
  await store.putDevice(req.deviceId, { subscription: req.subscription, email: req.email, updatedAt: now });
  await store.replaceSchedule(req.deviceId, req.reminders.filter((r) => r.fireAt > now - STALE_MS));
  return { scheduled: req.reminders.length };
}

export async function handleSnooze(store: Store, deviceId: string, key: string, minutes: number, now: number) {
  if (!DEVICE_ID.test(deviceId) || typeof key !== 'string' || key.length > 120) throw new BadRequest('bad request');
  const m = Math.min(24 * 60, Math.max(1, Math.round(minutes || 10)));
  key = baseKey(key);
  // Snoozing an alarm silences its pending repeats; the snoozed alarm repeats again if ignored.
  for (const k of alarmRepeatKeys(key)) await store.removeReminder(deviceId, k);
  const original = await store.getReminder(deviceId, `sent:${key}`);
  if (!original) return { snoozed: false };
  const fireAt = now + m * 60_000;
  await store.addReminder(deviceId, { ...original, key, fireAt });
  if (original.alarm) {
    const keys = alarmRepeatKeys(key);
    for (let i = 0; i < keys.length; i++) await store.addReminder(deviceId, { ...original, key: keys[i], fireAt: fireAt + ALARM_REPEAT_MIN[i] * 60_000 });
  }
  return { snoozed: true };
}

/** The app already showed this reminder itself, so the server shouldn't push it too. */
export async function handleAck(store: Store, deviceId: string, keys: string[]) {
  if (!DEVICE_ID.test(deviceId) || !Array.isArray(keys)) throw new BadRequest('bad request');
  // Acknowledging an alarm also stops its repeats.
  const all = keys.slice(0, 50).filter((k): k is string => typeof k === 'string' && k.length <= 120);
  for (const k of new Set([...all, ...all.flatMap((k) => alarmRepeatKeys(baseKey(k)))])) await store.removeReminder(deviceId, k);
  return { ok: true };
}

/** Send everything that's due. Called every minute by an external cron. */
export async function processDue(store: Store, senders: Senders, now: number) {
  const due = await store.due(now, 200);
  let sent = 0, stale = 0, emailed = 0, gone = 0, failed = 0, noSubscription = 0;
  const deviceCache = new Map<string, Device | null>();
  for (const { deviceId, reminder } of due) {
    await store.removeReminder(deviceId, reminder.key);
    if (now - reminder.fireAt > STALE_MS) {
      stale++;
      continue;
    }
    if (!deviceCache.has(deviceId)) deviceCache.set(deviceId, await store.getDevice(deviceId));
    const device = deviceCache.get(deviceId);
    if (!device) continue;
    // Keep a copy so a "Snooze" tap on the notification can re-schedule it.
    await store.keepSent(deviceId, { ...reminder, key: `sent:${reminder.key}` });
    if (device.subscription) {
      const res = await senders.push(device.subscription, { title: reminder.title, body: reminder.body, tag: baseKey(reminder.key), alarm: reminder.alarm, deviceId });
      if (res === 'ok') sent++;
      if (res === 'error') failed++;
      if (res === 'gone') {
        gone++;
        device.subscription = null;
        await store.putDevice(deviceId, device);
      }
    } else noSubscription++;
    if (reminder.email && device.email && senders.email) {
      if (await senders.email(device.email, reminder.title, `${reminder.body}\n\n— Wingman`)) emailed++;
    }
  }
  return { due: due.length, sent, emailed, stale, gone, failed, noSubscription };
}
