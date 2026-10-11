export type Kind = 'task' | 'event' | 'reminder';
export type Channel = 'push' | 'email' | 'alarm' | 'silent';

export type Repeat =
  | { type: 'none' }
  | { type: 'daily' }
  | { type: 'weekly'; weekday: number } // 0 = Sunday
  | { type: 'everyNDays'; n: number };

export interface Area {
  id: string;
  name: string;
  color: string;
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
  createdAt: string;
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
}
