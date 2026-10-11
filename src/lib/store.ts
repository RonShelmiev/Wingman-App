import { useSyncExternalStore } from 'react';
import type { Area, Item, Settings } from './types';
import { addDays, toDateStr } from './dates';
import { isRepeating } from './schedule';

export interface State {
  items: Item[];
  areas: Area[];
  settings: Settings;
  /** Occurrence keys whose reminder already went off. */
  fired: Record<string, true>;
  /** Occurrence key -> ISO time the snoozed reminder fires again. */
  snoozes: Record<string, string>;
}

export const DEFAULT_AREAS: Area[] = [
  { id: 'work', name: 'Work', color: '#2F55D4' },
  { id: 'home', name: 'Home', color: '#B4690E' },
  { id: 'health', name: 'Health', color: '#17805A' },
  { id: 'money', name: 'Money', color: '#0E7C86' },
  { id: 'family', name: 'Family & friends', color: '#C2367A' },
  { id: 'learning', name: 'Learning', color: '#4B5563' },
  { id: 'errands', name: 'Errands', color: '#7044D6' },
];

export const AREA_COLORS = ['#2F55D4', '#B4690E', '#17805A', '#0E7C86', '#C2367A', '#4B5563', '#7044D6', '#D24B1F', '#8A6D00', '#1F6FB2'];

const DEFAULT_SETTINGS: Settings = {
  pushEnabled: true,
  emailEnabled: false,
  morningBrief: '07:30',
  eveningRecap: '21:00',
  quietStart: '22:00',
  quietEnd: '07:00',
  dayStart: '08:00',
  dayEnd: '21:00',
  bufferMin: 15,
  name: '',
  email: '',
};

const KEY = 'wingman:v1';

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<State>;
      return {
        items: s.items ?? [],
        areas: s.areas?.length ? s.areas : DEFAULT_AREAS,
        settings: { ...DEFAULT_SETTINGS, ...s.settings },
        fired: s.fired ?? {},
        snoozes: s.snoozes ?? {},
      };
    }
  } catch {
    // Storage unavailable or corrupt: start fresh.
  }
  return { items: [], areas: DEFAULT_AREAS, settings: DEFAULT_SETTINGS, fired: {}, snoozes: {} };
}

let state: State = load();
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota or private mode: keep working in memory.
  }
  listeners.forEach((l) => l());
}

export const getState = () => state;

/** Listen to every state change (used to keep the server's schedule in sync). */
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const actions = {
  addItem(item: Omit<Item, 'id' | 'createdAt' | 'done' | 'doneDates'>) {
    set({ ...state, items: [...state.items, { ...item, id: newId(), createdAt: new Date().toISOString(), done: false, doneDates: [] }] });
  },
  updateItem(id: string, patch: Partial<Item>) {
    // Changing when something happens re-arms its reminders.
    const resetReminders = 'date' in patch || 'start' in patch || 'remindOffsetMin' in patch;
    set({
      ...state,
      items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      fired: resetReminders ? dropKeys(state.fired, id) : state.fired,
      snoozes: resetReminders ? dropKeys(state.snoozes, id) : state.snoozes,
    });
  },
  deleteItem(id: string) {
    set({ ...state, items: state.items.filter((i) => i.id !== id), fired: dropKeys(state.fired, id), snoozes: dropKeys(state.snoozes, id) });
  },
  toggleDone(item: Item, date: string) {
    const patch: Partial<Item> = isRepeating(item)
      ? { doneDates: item.doneDates.includes(date) ? item.doneDates.filter((d) => d !== date) : [...item.doneDates, date] }
      : { done: !item.done };
    set({ ...state, items: state.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)) });
  },
  addArea(name: string, color: string) {
    set({ ...state, areas: [...state.areas, { id: newId(), name, color }] });
  },
  updateArea(id: string, patch: Partial<Area>) {
    set({ ...state, areas: state.areas.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  },
  deleteArea(id: string) {
    const rest = state.areas.filter((a) => a.id !== id);
    if (!rest.length) return;
    set({ ...state, areas: rest, items: state.items.map((i) => (i.areaId === id ? { ...i, areaId: rest[0].id } : i)) });
  },
  updateSettings(patch: Partial<Settings>) {
    set({ ...state, settings: { ...state.settings, ...patch } });
  },
  markFired(key: string) {
    const { [key]: _, ...snoozes } = state.snoozes;
    set({ ...state, fired: { ...state.fired, [key]: true }, snoozes });
  },
  snooze(key: string, minutes: number) {
    const { [key]: _, ...fired } = state.fired;
    set({ ...state, fired, snoozes: { ...state.snoozes, [key]: new Date(Date.now() + minutes * 60_000).toISOString() } });
  },
  loadSample() {
    const today = toDateStr(new Date());
    const base = { durationMin: 30, remindOffsetMin: null, channel: 'push' as const, repeat: { type: 'none' as const } };
    const sample: Omit<Item, 'id' | 'createdAt' | 'done' | 'doneDates'>[] = [
      { ...base, title: 'Morning run', kind: 'event', areaId: 'health', date: today, start: '07:30' },
      { ...base, title: 'Deep work: Q4 report', kind: 'event', areaId: 'work', date: today, start: '10:00', durationMin: 90 },
      { ...base, title: 'Lunch with Dana', kind: 'event', areaId: 'family', date: today, start: '12:30', durationMin: 60, remindOffsetMin: 20 },
      { ...base, title: 'Call mom', kind: 'reminder', areaId: 'family', date: today, start: '18:00', remindOffsetMin: 0, channel: 'alarm', repeat: { type: 'weekly', weekday: new Date().getDay() } },
      { ...base, title: 'Pay electricity bill', kind: 'task', areaId: 'money', date: addDays(today, -1), start: null, durationMin: 15 },
      { ...base, title: 'Read 30 pages', kind: 'task', areaId: 'learning', date: today, start: null, durationMin: 45 },
      { ...base, title: 'Take vitamins', kind: 'reminder', areaId: 'health', date: today, start: '08:00', remindOffsetMin: 0, repeat: { type: 'daily' } },
      { ...base, title: 'Dentist', kind: 'event', areaId: 'health', date: addDays(today, 4), start: '16:30', durationMin: 60, remindOffsetMin: 1440 },
    ];
    set({ ...state, items: [...state.items, ...sample.map((s) => ({ ...s, id: newId(), createdAt: new Date().toISOString(), done: false, doneDates: [] }))] });
  },
};

function dropKeys<T>(rec: Record<string, T>, itemId: string): Record<string, T> {
  return Object.fromEntries(Object.entries(rec).filter(([k]) => !k.startsWith(itemId + '@')));
}
