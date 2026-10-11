import { createECDH, randomBytes } from 'node:crypto';
import { describe, expect, it, beforeAll } from 'vitest';
import webpush from 'web-push';
import { GET as config } from '../api/config';
import { POST as sync } from '../api/sync';
import { GET as tick } from '../api/tick';
import { POST as snooze } from '../api/snooze';

const DEV = 'dev_abcdefghijklmnop1234';
const post = (path: string, body: unknown) => new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

describe('API routes (in-memory store)', () => {
  beforeAll(() => {
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.CRON_SECRET = 'test-secret-123';
  });

  it('reports config', async () => {
    const res = await config();
    expect(await res.json()).toMatchObject({ publicKey: process.env.VAPID_PUBLIC_KEY, email: false, storage: false });
  });

  it('validates sync and protects tick', async () => {
    expect((await sync(post('/api/sync', { deviceId: 'x' }))).status).toBe(400);
    expect((await sync(post('/api/sync', { deviceId: DEV, subscription: null, email: null, reminders: [{ key: 'a', fireAt: Date.now() - 1000, title: 'Hi', body: '', alarm: false, email: false }] }))).status).toBe(200);
    expect((await tick(new Request('http://localhost/api/tick'))).status).toBe(401);
    expect((await tick(new Request('http://localhost/api/tick?secret=wrong-secret-12'))).status).toBe(401);
    const ok = await tick(new Request('http://localhost/api/tick', { headers: { authorization: 'Bearer test-secret-123' } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ due: 1 });
    expect(await (await snooze(post('/api/snooze', { deviceId: DEV, key: 'a', minutes: 5 }))).json()).toEqual({ snoozed: true });
  });

  it('builds a valid encrypted, VAPID-signed push request', () => {
    // A real browser subscription key pair, so encryption is exercised end to end.
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: ecdh.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url') } };
    const details = webpush.generateRequestDetails(sub, JSON.stringify({ title: 'Hi' }), {
      vapidDetails: { subject: 'mailto:a@b.co', publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! }, TTL: 900, urgency: 'high',
    });
    expect(details.headers.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(details.headers['Content-Encoding']).toBe('aes128gcm');
    expect(details.headers.Urgency).toBe('high');
    expect((details.body as Buffer).length).toBeGreaterThan(80);
  });
});
