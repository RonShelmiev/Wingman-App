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
