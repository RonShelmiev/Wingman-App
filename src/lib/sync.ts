// Backup and end-to-end encrypted sync between your devices.
//
// A device gets a random sync code. The server only stores an encrypted blob under a hash of that code,
// so it can't read your data. Every device with the code downloads the blob, merges it with what it has
// (newest change wins per item; deletions carry over) and uploads the result.
import type { Area, Completion, Item, Note, Settings } from './types';
import { HISTORY_LIMIT } from './insights';
import { addDays, toDateStr } from './dates';
import { DEFAULT_AREAS, EPOCH, type State } from './store';

/** Settings that belong to one device and never sync. */
const LOCAL_SETTINGS = ['pushEnabled', 'theme'] as const;

export interface Synced {
  items: Item[];
  /** Missing in copies made before notes existed. */
  notes?: Note[];
  areas: Area[];
  settings: Omit<Settings, (typeof LOCAL_SETTINGS)[number]>;
  settingsUpdatedAt: string;
  history: Completion[];
  historyClearedAt: string | null;
  deleted: Record<string, string>;
  fired: Record<string, true>;
  snoozes: Record<string, string>;
}

export function toSynced(s: State): Synced {
  const settings = { ...s.settings } as Partial<Settings>;
  for (const k of LOCAL_SETTINGS) delete settings[k];
  return {
    items: s.items, notes: s.notes, areas: s.areas, settings: settings as Synced['settings'], settingsUpdatedAt: s.settingsUpdatedAt,
    history: s.history, historyClearedAt: s.historyClearedAt, deleted: s.deleted, fired: s.fired, snoozes: s.snoozes,
  };
}

const stampOf = (x: { updatedAt?: string; createdAt?: string }) => x.updatedAt ?? x.createdAt ?? EPOCH;
const later = (a: string | null | undefined, b: string | null | undefined) => ((a ?? '') >= (b ?? '') ? a ?? null : b ?? null);

function mergeById<T extends { id: string; updatedAt?: string; createdAt?: string }>(a: T[], b: T[], deleted: Record<string, string>): T[] {
  const out = new Map<string, T>();
  for (const x of [...a, ...b]) {
    const cur = out.get(x.id);
    if (!cur || stampOf(x) > stampOf(cur)) out.set(x.id, x);
  }
  // A deletion wins over any edit made before it.
  return [...out.values()].filter((x) => !(deleted[x.id] && deleted[x.id] >= stampOf(x)));
}

/** Combine this device's state with another device's copy. Pure; safe to run repeatedly. */
export function merge(local: State, remote: Synced, now = new Date()): State {
  const cutoff = addDays(toDateStr(now), -60);
  const deleted: Record<string, string> = {};
  for (const [id, at] of [...Object.entries(local.deleted), ...Object.entries(remote.deleted ?? {})]) {
    if (at.slice(0, 10) >= cutoff && (!deleted[id] || at > deleted[id])) deleted[id] = at;
  }

  const items = mergeById(local.items, remote.items ?? [], deleted);
  const notes = mergeById(local.notes, remote.notes ?? [], deleted);
  let areas = mergeById(local.areas, remote.areas ?? [], deleted);
  if (!areas.length) areas = DEFAULT_AREAS;
  // Items whose area was deleted elsewhere move to the first area.
  const areaIds = new Set(areas.map((a) => a.id));
  const fixedItems = items.map((i) => (areaIds.has(i.areaId) ? i : { ...i, areaId: areas[0].id }));

  const remoteNewer = (remote.settingsUpdatedAt ?? EPOCH) > local.settingsUpdatedAt;
  const settings = remoteNewer ? { ...local.settings, ...remote.settings } : local.settings;

  const historyClearedAt = later(local.historyClearedAt, remote.historyClearedAt);
  const seen = new Map<string, Completion>();
  for (const c of [...local.history, ...(remote.history ?? [])]) if (!historyClearedAt || c.at > historyClearedAt) seen.set(c.id, c);
  const history = [...seen.values()].sort((x, y) => x.at.localeCompare(y.at)).slice(-HISTORY_LIMIT);

  // Reminder bookkeeping: keep the last 30 days.
  const recent = addDays(toDateStr(now), -30);
  const fired: Record<string, true> = {};
  for (const k of [...Object.keys(local.fired), ...Object.keys(remote.fired ?? {})]) {
    const date = k.split('@')[1] ?? '';
    if (date >= recent) fired[k] = true;
  }
  const snoozes: Record<string, string> = {};
  for (const [k, v] of [...Object.entries(local.snoozes), ...Object.entries(remote.snoozes ?? {})]) {
    if (!fired[k] && (!snoozes[k] || v > snoozes[k])) snoozes[k] = v;
  }

  return {
    ...local,
    items: fixedItems,
    notes,
    areas,
    settings,
    settingsUpdatedAt: later(local.settingsUpdatedAt, remote.settingsUpdatedAt) ?? EPOCH,
    history,
    historyClearedAt,
    deleted,
    fired,
    snoozes,
  };
}

// ---- Sync codes and encryption ----

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out; // 32 characters, 160 bits
}

export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z2-7]/g, '');
export const formatCode = (code: string) => code.match(/.{1,4}/g)!.join('-');
export const isValidCode = (s: string) => normalizeCode(s).length === 32;

const enc = new TextEncoder();
const toB64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const sha256 = (s: string) => crypto.subtle.digest('SHA-256', enc.encode(s));

export async function vaultId(code: string): Promise<string> {
  return [...new Uint8Array(await sha256(`wingman-vault:${code}`))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function vaultKey(code: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', await sha256(`wingman-key:${code}`), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(code: string, data: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await vaultKey(code), enc.encode(JSON.stringify(data)));
  return `v1.${toB64(iv)}.${toB64(ct)}`;
}

export async function decrypt<T>(code: string, blob: string): Promise<T> {
  const [v, iv, ct] = blob.split('.');
  if (v !== 'v1' || !iv || !ct) throw new Error('Unknown backup format');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await vaultKey(code), fromB64(ct));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** Cheap fingerprint of what would be uploaded (FNV-1a over the JSON). */
export function fingerprint(s: Synced): string {
  const str = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16) + ':' + str.length;
}

// ---- Backup file ----

export interface BackupFile {
  app: 'wingman';
  version: 1;
  exportedAt: string;
  data: Synced;
}

export function makeBackup(s: State): BackupFile {
  return { app: 'wingman', version: 1, exportedAt: new Date().toISOString(), data: toSynced(s) };
}

export function readBackup(text: string): Synced {
  const f = JSON.parse(text) as Partial<BackupFile>;
  if (f?.app !== 'wingman' || f.version !== 1 || !f.data || !Array.isArray(f.data.items) || !Array.isArray(f.data.areas)) {
    throw new Error('This file is not a Wingman backup.');
  }
  return f.data;
}
