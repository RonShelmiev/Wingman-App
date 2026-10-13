import { afterAll, describe, expect, it } from 'vitest';
import { handleAck, handleSnooze, handleSync, processDue, type Senders } from './core';
import { UrlRedisStore } from './urlRedisStore';

// Runs against a real Redis only when TEST_REDIS_URL is set, e.g.
//   docker run --rm -p 6390:6379 redis:7 & TEST_REDIS_URL=redis://localhost:6390 npm test
const url = process.env.TEST_REDIS_URL;
const DEV = `dev_test${Date.now()}abcdefgh`;
const SUB = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } };
const T = 1_800_000_000_000;
const rem = (key: string, fireAt: number) => ({ key, fireAt, title: key, body: 'b', alarm: false, email: false });

describe.skipIf(!url)('UrlRedisStore (real Redis)', () => {
  const store = new UrlRedisStore(url ?? '');
  afterAll(async () => {
    await store.deleteDevice(DEV);
    await store.close();
  });

  it('schedules, sends once, snoozes and acks', async () => {
    await handleSync(store, { deviceId: DEV, subscription: SUB, email: null, reminders: [rem('now', T - 1000), rem('later', T + 60_000), rem('acked', T - 500)] }, T - 60_000);
    expect(await store.getDevice(DEV)).toMatchObject({ subscription: SUB });
    await handleAck(store, DEV, ['acked']);

    const pushed: string[] = [];
    const s: Senders = { push: async (_sub, p) => (pushed.push(p.tag), 'ok'), email: null };
    expect(await processDue(store, s, T)).toMatchObject({ sent: 1 });
    expect(await processDue(store, s, T)).toMatchObject({ due: 0 });
    expect(pushed).toEqual(['now']);

    // A re-sync replaces the schedule but keeps the sent copy, so Snooze still works.
    await handleSync(store, { deviceId: DEV, subscription: SUB, email: null, reminders: [rem('later', T + 60_000)] }, T);
    expect(await handleSnooze(store, DEV, 'now', 10, T)).toEqual({ snoozed: true });
    expect(await processDue(store, s, T + 11 * 60_000)).toMatchObject({ sent: 2 });
    expect(pushed.sort()).toEqual(['later', 'now', 'now']);
  });

  it('saves the vault only when the version matches', async () => {
    const id = 'f'.repeat(48) + Date.now().toString(16).padStart(16, '0');
    expect(await store.getVault(id)).toBeNull();
    expect(await store.putVault(id, 0, 'v1.a')).toEqual({ ok: true, version: 1 });
    expect(await store.putVault(id, 0, 'v1.b')).toMatchObject({ ok: false, current: { version: 1, blob: 'v1.a' } });
    expect(await store.putVault(id, 1, 'v1.c')).toEqual({ ok: true, version: 2 });
    expect(await store.getVault(id)).toMatchObject({ version: 2, blob: 'v1.c' });
  });
});
