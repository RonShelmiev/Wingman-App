export type Kind = 'task' | 'event' | 'reminder';
export type Channel = 'push' | 'email' | 'alarm' | 'silent';

export type Repeat =
  | { type: 'none' }
  | { type: 'daily' }
  | { type: 'weekly'; weekday: number } // 0 = Sunday
  | { type: 'everyNDays'; n: number }
  | { type: 'weekdays'; days?: number[] } // work days; default Monday–Friday (Israel: Sunday–Thursday)
  | { type: 'monthly' } // same day of month as `date` (last day if the month is shorter)
  | { type: 'yearly' }; // same day and month as `date` (birthdays, anniversaries)

/** A plain note: no date, no time. */
export interface Note {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  /** Last change, for sorting and merging between devices. */
  updatedAt?: string;
}

export interface Area {
  id: string;
  name: string;
  color: string;
  /** Last change, for merging between devices. */
  updatedAt?: string;
}

export interface Item {
  id: string;
  title: string;
  kind: Kind;
  areaId: string;
  /** Local date YYYY-MM-DD. For repeating items, the first occurrence. Null = no date yet (inbox). */
  date: string | null;
  /** Local time HH:MM. Null = no fixed time (Plan with Wingman can suggest one). */
  start: string | null;
  durationMin: number;
  /** Minutes before `start` to remind. Null = no reminder. */
  remindOffsetMin: number | null;
  channel: Channel;
  repeat: Repeat;
  /** Non-repeating items: done or not. */
  done: boolean;
  /** Repeating items: dates (YYYY-MM-DD) completed. */
  doneDates: string[];
  /** Repeating items: occurrences removed or moved one at a time ("just this one"). */
  skipDates?: string[];
  createdAt: string;
  /** Last change, for merging between devices. */
  updatedAt?: string;
}

/** A finished task, used to learn durations and productive hours. */
export interface Completion {
  id: string;
  itemId: string;
  date: string; // occurrence date
  title: string;
  areaId: string;
  at: string; // ISO time it was ticked off
  hour: number; // local hour it was ticked off
  plannedMin: number;
  /** From the focus timer; null when ticked off without it. */
  actualMin: number | null;
}

export interface FocusTimer {
  itemId: string;
  date: string;
  startedAt: string;
}

export interface Settings {
  pushEnabled: boolean;
  emailEnabled: boolean;
  morningBrief: string; // HH:MM
  eveningRecap: string; // HH:MM
  quietStart: string; // HH:MM
  quietEnd: string; // HH:MM
  dayStart: string; // planner window
  dayEnd: string;
  bufferMin: number;
  name: string;
  email: string;
  theme: 'system' | 'light' | 'dark';
  language: 'en' | 'he';
  /** 0 = weeks start on Sunday, 1 = Monday. */
  weekStart: 0 | 1;
  /** Days counted as work days for "weekdays" repeats (0 = Sunday). */
  workDays: number[];
  /** Finished the welcome screens. */
  onboarded: boolean;
}
