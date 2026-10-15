import { useSyncExternalStore } from 'react';
import type { Area, Completion, FocusTimer, Item, Note, Settings } from './types';
import { HISTORY_LIMIT } from './insights';
import { setLang, t } from './i18n';
import { addDays, toDateStr } from './dates';
import { isRepeating } from './schedule';

export interface State {
  items: Item[];
  notes: Note[];
  areas: Area[];
  settings: Settings;
  /** Occurrence keys whose reminder already went off. */
  fired: Record<string, true>;
  /** Occurrence key -> ISO time the snoozed reminder fires again. */
  snoozes: Record<string, string>;
  /** Finished tasks, for learning (newest last). */
  history: Completion[];
  /** Running focus timer, if any (this device only). */
  timer: FocusTimer | null;
  /** id -> ISO time it was deleted, so deletions carry over to other devices. */
  deleted: Record<string, string>;
  settingsUpdatedAt: string;
  /** "Reset learning" time; older history from other devices is ignored. */
  historyClearedAt: string | null;
  /** Sync link for this device (never synced itself). */
  sync: SyncLink | null;
}

export interface SyncLink {
  code: string;
  version: number;
  lastSync: number | null;
  /** Fingerprint of what was last uploaded, to skip no-op syncs. */
  lastHash: string | null;
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

/** Default area names per language (ids stay the same). */
export const AREA_NAMES: Record<'en' | 'he', Record<string, string>> = {
  en: { work: 'Work', home: 'Home', health: 'Health', money: 'Money', family: 'Family & friends', learning: 'Learning', errands: 'Errands' },
  he: { work: 'עבודה', home: 'בית', health: 'בריאות', money: 'כסף', family: 'משפחה וחברים', learning: 'לימודים', errands: 'סידורים' },
};

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
  theme: 'system',
  language: 'en',
  weekStart: 1,
  workDays: [1, 2, 3, 4, 5],
  onboarded: false,
};

const KEY = 'wingman:v1';
export const EPOCH = '1970-01-01T00:00:00.000Z';

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<State>;
      // People who used Wingman before the welcome screens existed don't need them.
      const onboarded = s.settings?.onboarded ?? (s.items?.length ?? 0) > 0;
      return {
        items: s.items ?? [],
        notes: s.notes ?? [],
        areas: s.areas?.length ? s.areas : DEFAULT_AREAS,
        settings: { ...DEFAULT_SETTINGS, ...s.settings, onboarded },
        fired: s.fired ?? {},
        snoozes: s.snoozes ?? {},
        history: s.history ?? [],
        timer: s.timer ?? null,
        deleted: s.deleted ?? {},
        settingsUpdatedAt: s.settingsUpdatedAt ?? EPOCH,
        historyClearedAt: s.historyClearedAt ?? null,
        sync: s.sync ?? null,
      };
    }
  } catch {
    // Storage unavailable or corrupt: start fresh.
  }
  return { items: [], notes: [], areas: DEFAULT_AREAS, settings: DEFAULT_SETTINGS, fired: {}, snoozes: {}, history: [], timer: null, deleted: {}, settingsUpdatedAt: EPOCH, historyClearedAt: null, sync: null };
}

let state: State = load();
setLang(state.settings.language);
const listeners = new Set<() => void>();

/** Commit a change made on this device: stamps what changed so other devices can merge it. */
function set(next: State) {
  const now = new Date().toISOString();
  const prevItems = new Map(state.items.map((i) => [i.id, i]));
  const prevAreas = new Map(state.areas.map((a) => [a.id, a]));
  const prevNotes = new Map(state.notes.map((n) => [n.id, n]));
  let deleted = next.deleted;
  const stamp = <T extends { id: string; updatedAt?: string }>(list: T[], prev: Map<string, T>): T[] =>
    list.map((x) => (prev.get(x.id) === x ? x : { ...x, updatedAt: now }));
  const items = next.items === state.items ? next.items : stamp(next.items, prevItems);
  const areas = next.areas === state.areas ? next.areas : stamp(next.areas, prevAreas);
  const notes = next.notes === state.notes ? next.notes : stamp(next.notes, prevNotes);
  const keep = new Set([...items.map((i) => i.id), ...areas.map((a) => a.id), ...notes.map((n) => n.id)]);
  for (const id of [...prevItems.keys(), ...prevAreas.keys(), ...prevNotes.keys()]) if (!keep.has(id)) deleted = { ...deleted, [id]: now };
  commit({
    ...next,
    items,
    areas,
    notes,
    deleted,
    settingsUpdatedAt: next.settings === state.settings ? next.settingsUpdatedAt : now,
  });
}

/** Write state as-is (used when applying a merge from another device). */
export function commit(next: State) {
  state = next;
  setLang(state.settings.language);
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
  toggleDone(item: Item, date: string, actualMin: number | null = null) {
    const wasDone = isRepeating(item) ? item.doneDates.includes(date) : item.done;
    const patch: Partial<Item> = isRepeating(item)
      ? { doneDates: wasDone ? item.doneDates.filter((d) => d !== date) : [...item.doneDates, date] }
      : { done: !item.done };
    const now = new Date();
    // Learn from finished tasks; un-ticking forgets that completion.
    const history = wasDone
      ? state.history.filter((c) => !(c.itemId === item.id && c.date === date))
      : [...state.history, { id: newId(), itemId: item.id, date, title: item.title, areaId: item.areaId, at: now.toISOString(), hour: now.getHours(), plannedMin: item.durationMin, actualMin }].slice(-HISTORY_LIMIT);
    const timer = state.timer?.itemId === item.id ? null : state.timer;
    set({ ...state, items: state.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)), history, timer });
  },
  startTimer(item: Item, date: string) {
    set({ ...state, timer: { itemId: item.id, date, startedAt: new Date().toISOString() } });
  },
  /** Stop the focus timer; with `done`, tick the task off and remember how long it really took. */
  stopTimer(done: boolean) {
    const t = state.timer;
    if (!t) return;
    const item = state.items.find((i) => i.id === t.itemId);
    if (!done || !item) return set({ ...state, timer: null });
    const actual = Math.max(1, Math.round((Date.now() - new Date(t.startedAt).getTime()) / 60_000));
    if (isRepeating(item) ? item.doneDates.includes(t.date) : item.done) return set({ ...state, timer: null });
    actions.toggleDone(item, t.date, actual);
  },
  resetLearning() {
    set({ ...state, history: [], historyClearedAt: new Date().toISOString() });
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
  /** Switch language; also sets the usual week for it and renames untouched default areas. */
  setLanguage(language: 'en' | 'he') {
    const from = language === 'he' ? AREA_NAMES.en : AREA_NAMES.he;
    const to = AREA_NAMES[language];
    set({
      ...state,
      settings: { ...state.settings, language, weekStart: language === 'he' ? 0 : 1, workDays: language === 'he' ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5] },
      areas: state.areas.map((a) => (from[a.id] && a.name === from[a.id] ? { ...a, name: to[a.id] } : a)),
    });
  },
  /** Remove one occurrence of a repeating item ("just this one"). */
  skipOccurrence(item: Item, date: string) {
    set({ ...state, items: state.items.map((i) => (i.id === item.id ? { ...i, skipDates: [...(i.skipDates ?? []), date] } : i)) });
  },
  /** Change one occurrence of a repeating item: it's skipped, and a one-off copy takes its place. */
  editOccurrence(item: Item, date: string, patch: Partial<Item>) {
    const copy: Item = {
      ...item, ...patch, id: newId(), repeat: { type: 'none' }, done: false, doneDates: [], skipDates: [],
      date: patch.date ?? date, createdAt: new Date().toISOString(),
    };
    set({
      ...state,
      items: [...state.items.map((i) => (i.id === item.id ? { ...i, skipDates: [...(i.skipDates ?? []), date] } : i)), copy],
    });
  },
  /** Push to tomorrow (one-offs move; a repeating item's occurrence becomes a one-off tomorrow). */
  moveToTomorrow(item: Item, date: string) {
    const tomorrow = addDays(date, 1);
    if (isRepeating(item)) actions.editOccurrence(item, date, { date: tomorrow });
    else actions.updateItem(item.id, { date: tomorrow });
  },
  moveAllToTomorrow(list: Item[], date: string) {
    const tomorrow = addDays(date, 1);
    const ids = new Set(list.filter((i) => !isRepeating(i)).map((i) => i.id));
    set({ ...state, items: state.items.map((i) => (ids.has(i.id) ? { ...i, date: tomorrow } : i)), fired: Object.fromEntries(Object.entries(state.fired).filter(([k]) => !ids.has(k.split('@')[0]))) });
  },
  /** Put back items, areas and history from before an action (Undo). */
  restore(before: State) {
    set({ ...state, items: before.items.map((i) => ({ ...i })), notes: before.notes.map((n) => ({ ...n })), areas: before.areas.map((a) => ({ ...a })), history: before.history, timer: before.timer });
  },
  /** Create an empty note and return its id. */
  addNote(): string {
    const id = newId();
    set({ ...state, notes: [{ id, title: '', body: '', pinned: false, createdAt: new Date().toISOString() }, ...state.notes] });
    return id;
  },
  updateNote(id: string, patch: Partial<Note>) {
    set({ ...state, notes: state.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  },
  deleteNote(id: string) {
    set({ ...state, notes: state.notes.filter((n) => n.id !== id) });
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
      { ...base, title: t('Morning run'), kind: 'event', areaId: 'health', date: today, start: '07:30' },
      { ...base, title: t('Deep work: Q4 report'), kind: 'event', areaId: 'work', date: today, start: '10:00', durationMin: 90 },
      { ...base, title: t('Lunch with Dana'), kind: 'event', areaId: 'family', date: today, start: '12:30', durationMin: 60, remindOffsetMin: 20 },
      { ...base, title: t('Call mom'), kind: 'reminder', areaId: 'family', date: today, start: '18:00', remindOffsetMin: 0, channel: 'alarm', repeat: { type: 'weekly', weekday: new Date().getDay() } },
      { ...base, title: t('Pay electricity bill'), kind: 'task', areaId: 'money', date: addDays(today, -1), start: null, durationMin: 15 },
      { ...base, title: t('Read 30 pages'), kind: 'task', areaId: 'learning', date: today, start: null, durationMin: 45 },
      { ...base, title: t('Take vitamins'), kind: 'reminder', areaId: 'health', date: today, start: '08:00', remindOffsetMin: 0, repeat: { type: 'daily' } },
      { ...base, title: t('Dentist'), kind: 'event', areaId: 'health', date: addDays(today, 4), start: '16:30', durationMin: 60, remindOffsetMin: 1440 },
    ];
    set({ ...state, items: [...state.items, ...sample.map((s) => ({ ...s, id: newId(), createdAt: new Date().toISOString(), done: false, doneDates: [] }))] });
  },
};

function dropKeys<T>(rec: Record<string, T>, itemId: string): Record<string, T> {
  return Object.fromEntries(Object.entries(rec).filter(([k]) => !k.startsWith(itemId + '@')));
}
