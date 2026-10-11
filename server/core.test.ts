import { describe, expect, it } from 'vitest';
import { BadRequest, handleAck, handleSnooze, handleSync, processDue, validateSync, type Senders } from './core';
import { MemoryStore } from './memoryStore';
import type { PushPayload } from './types';

const DEV = 'dev_abcdefghijklmnop1234';
const SUB = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } };
const T = 1_800_000_000_000;
const rem = (key: string, fireAt: number, extra = {}) => ({ key, fireAt, title: key, body: 'b', alarm: false, email: false, ...extra });

function fakeSenders(result: 'ok' | 'gone' = 'ok') {
  const pushes: PushPayload[] = [];
  const emails: string[] = [];
  const s: Senders = {
    push: async (_sub, p) => (pushes.push(p), result),
    email: async (to, subject) => (emails.push(`${to}:${subject}`), true),
  };
  return { s, pushes, emails };
}

describe('validateSync', () => {
  it('rejects bad input', () => {
    expect(() => validateSync(null)).toThrow(BadRequest);
    expect(() => validateSync({ deviceId: 'short', reminders: [] })).toThrow(BadRequest);
    expect(() => validateSync({ deviceId: DEV, subscription: { endpoint: 'http://x', keys: {} }, reminders: [] })).toThrow(BadRequest);
    expect(() => validateSync({ deviceId: DEV, reminders: new Array(501).fill(rem('k', T)) })).toThrow(BadRequest);
  });
  it('trims fields and drops invalid emails', () => {
    const r = validateSync({ deviceId: DEV, subscription: SUB, email: 'nope', reminders: [rem('k', T, { title: 'x'.repeat(300) })] });
    expect(r.email).toBeNull();
    expect(r.reminders[0].title).toHaveLength(200);
  });
});

describe('processDue', () => {
  it('sends due reminders once, skips future and stale ones', async () => {
    const store = new MemoryStore();
    await handleSync(store, { deviceId: DEV, subscription: SUB, email: null, reminders: [rem('now', T - 1000), rem('later', T + 60_000), rem('stale', T - 14 * 60_000)] }, T - 20 * 60_000);
    const { s, pushes } = fakeSenders();
    // At T+2min, 'stale' is 16 min late (dropped) while 'later' is due.
    const res = await processDue(store, s, T + 2 * 60_000);
    expect(res).toMatchObject({ due: 3, sent: 2, stale: 1 });
    expect(pushes.map((p) => p.tag).sort()).toEqual(['later', 'now']);
    expect((await processDue(store, s, T + 3 * 60_000)).due).toBe(0);
  });

  it('emails when asked and forgets dead subscriptions', async () => {
    const store = new MemoryStore();
    await handleSync(store, { deviceId: DEV, subscription: SUB, email: 'me@example.com', reminders: [rem('a', T, { email: true }), rem('b', T + 1)] }, T - 1000);
    const { s, emails } = fakeSenders('gone');
    const res = await processDue(store, s, T + 1000);
    expect(emails).toEqual(['me@example.com:a']);
    expect(res.gone).toBe(1);
    expect((await store.getDevice(DEV))?.subscription).toBeNull();
  });

  it('a resync replaces the schedule but keeps sent copies for snooze', async () => {
    const store = new MemoryStore();
    await handleSync(store, { deviceId: DEV, subscription: SUB, email: null, reminders: [rem('a', T), rem('b', T + 3600_000)] }, T - 1000);
    const { s, pushes } = fakeSenders();
    await processDue(store, s, T + 1000);
    await handleSync(store, { deviceId: DEV, subscription: SUB, email: null, reminders: [] }, T + 2000);
    expect(await processDue(store, s, T + 7200_000)).toMatchObject({ due: 0 });

    expect(await handleSnooze(store, DEV, 'a', 10, T + 5000)).toEqual({ snoozed: true });
    await processDue(store, s, T + 5000 + 10 * 60_000);
    expect(pushes.map((p) => p.tag)).toEqual(['a', 'a']);
    expect(await handleSnooze(store, DEV, 'never', 10, T)).toEqual({ snoozed: false });
  });

  it('ack stops a reminder the app already showed', async () => {
    const store = new MemoryStore();
    await handleSync(store, { deviceId: DEV, subscription: SUB, email: null, reminders: [rem('a', T)] }, T - 1000);
    await handleAck(store, DEV, ['a']);
    expect((await processDue(store, fakeSenders().s, T + 1000)).due).toBe(0);
  });
});
