// Shared between the app and the server.

export interface ScheduledReminder {
  /** Unique per occurrence, e.g. "<itemId>@2026-10-15" or "brief@2026-10-15". */
  key: string;
  /** Epoch milliseconds. */
  fireAt: number;
  title: string;
  body: string;
  alarm: boolean;
  email: boolean;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface SyncRequest {
  deviceId: string;
  subscription: PushSubscriptionJSON | null;
  email: string | null;
  reminders: ScheduledReminder[];
}

/** What the service worker receives in a push. */
export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  alarm: boolean;
  deviceId: string;
}

/** An unanswered alarm comes back after these many minutes (like an alarm that keeps ringing). */
export const ALARM_REPEAT_MIN = [1, 2, 3, 5, 8];

/** Keys of an alarm's repeat pushes: "<key>#r1"… */
export const alarmRepeatKeys = (key: string) => ALARM_REPEAT_MIN.map((_, i) => `${key}#r${i + 1}`);

/** The occurrence key a repeat push belongs to. */
export const baseKey = (key: string) => key.split('#')[0];
