import { describe, expect, it } from 'vitest';
import type { Item } from './types';
import type { State } from './store';
import { decrypt, encrypt, fingerprint, formatCode, isValidCode, merge, newSyncCode, normalizeCode, readBackup, makeBackup, toSynced, vaultId } from './sync';

const T = (h: number) => new Date(Date.UTC(2026, 9, 11, h)).toISOString();
const item = (id: string, updatedAt: string, over: Partial<Item> = {}): Item => ({
  id, title: id, kind: 'task', areaId: 'work', date: '2026-10-11', start: null, durationMin: 30, remindOffsetMin: null, channel: 'push',
  repeat: { type: 'none' }, done: false, doneDates: [], createdAt: T(0), updatedAt, ...over,
});
const base = (over: Partial<State> = {}): State => ({
  items: [], areas: [{ id: 'work', name: 'Work', color: '#000', updatedAt: T(0) }],
  settings: { pushEnabled: true, emailEnabled: false, morningBrief: '07:30', eveningRecap: '21:00', quietStart: '22:00', quietEnd: '07:00', dayStart: '08:00', dayEnd: '21:00', bufferMin: 15, name: '', email: '', theme: 'system', language: 'en', weekStart: 1, workDays: [1, 2, 3, 4, 5], onboarded: true },
  fired: {}, snoozes: {}, history: [], timer: null, deleted: {}, settingsUpdatedAt: T(0), historyClearedAt: null, sync: null, ...over,
});
const NOW = new Date(Date.UTC(2026, 9, 11, 12));

describe('merge', () => {
  it('keeps the newest version of each item and adds items from both sides', () => {
    const phone = base({ items: [item('a', T(2), { title: 'phone edit' }), item('b', T(1))] });
    const laptop = base({ items: [item('a', T(3), { title: 'laptop edit' }), item('c', T(1))] });
    const m = merge(phone, toSynced(laptop), NOW);
    expect(m.items.map((i) => [i.id, i.title]).sort()).toEqual([['a', 'laptop edit'], ['b', 'b'], ['c', 'c']]);
    // Merging is symmetric and repeatable.
    expect(merge(laptop, toSynced(phone), NOW).items.map((i) => i.title).sort()).toEqual(m.items.map((i) => i.title).sort());
    expect(merge(m, toSynced(m), NOW).items).toHaveLength(3);
  });

  it('carries deletions over, unless the item was edited after', () => {
    const phone = base({ items: [item('a', T(1)), item('b', T(5))] });
    const laptop = base({ deleted: { a: T(2), b: T(3) } });
    const m = merge(phone, toSynced(laptop), NOW);
    expect(m.items.map((i) => i.id)).toEqual(['b']);
    expect(m.deleted.a).toBe(T(2));
  });

  it('syncs settings by recency but keeps device-only ones', () => {
    const phone = base({ settings: { ...base().settings, name: 'Ron', theme: 'dark', pushEnabled: false }, settingsUpdatedAt: T(1) });
    const laptop = base({ settings: { ...base().settings, name: 'Ronnie', morningBrief: '06:45' }, settingsUpdatedAt: T(2) });
    const m = merge(phone, toSynced(laptop), NOW);
    expect(m.settings).toMatchObject({ name: 'Ronnie', morningBrief: '06:45', theme: 'dark', pushEnabled: false });
  });

  it('unions history (respecting resets), fired and snoozes; moves items off deleted areas', () => {
    const c = (id: string, at: string) => ({ id, itemId: 'x', date: '2026-10-11', title: 't', areaId: 'work', at, hour: 9, plannedMin: 30, actualMin: null });
    const phone = base({ history: [c('1', T(1)), c('2', T(4))], fired: { 'x@2026-10-11': true, 'old@2026-08-01': true }, items: [item('z', T(1), { areaId: 'gone' })] });
    const laptop = base({ history: [c('3', T(5))], historyClearedAt: T(3), snoozes: { 'y@2026-10-11': T(6) } });
    const m = merge(phone, toSynced(laptop), NOW);
    expect(m.history.map((h) => h.id)).toEqual(['2', '3']);
    expect(m.fired).toEqual({ 'x@2026-10-11': true });
    expect(m.snoozes).toEqual({ 'y@2026-10-11': T(6) });
    expect(m.items[0].areaId).toBe('work');
  });
});

describe('codes, encryption and backups', () => {
  it('makes 160-bit codes and normalises typed ones', () => {
    const code = newSyncCode();
    expect(code).toMatch(/^[A-Z2-7]{32}$/);
    expect(normalizeCode(formatCode(code).toLowerCase())).toBe(code);
    expect(isValidCode('abc')).toBe(false);
  });

  it('encrypts so only the same code can read it', async () => {
    const code = newSyncCode();
    const blob = await encrypt(code, { hello: 'world' });
    expect(blob).not.toContain('world');
    expect(await decrypt(code, blob)).toEqual({ hello: 'world' });
    await expect(decrypt(newSyncCode(), blob)).rejects.toThrow();
    expect(await vaultId(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(await vaultId(code)).not.toContain(code.toLowerCase());
  });

  it('round-trips a backup file and rejects other files', () => {
    const s = base({ items: [item('a', T(1))] });
    const data = readBackup(JSON.stringify(makeBackup(s)));
    expect(fingerprint(data)).toBe(fingerprint(toSynced(s)));
    expect(() => readBackup('{"hello":1}')).toThrow('not a Wingman backup');
  });
});
