import { createClient } from 'redis';
import type { Device, Store, Vault } from './core.js';
import type { ScheduledReminder } from './types.js';
import { DEVICE_TTL, PUT_VAULT, VAULT_TTL } from './redisStore.js';

// Same layout as RedisStore, over a plain redis:// connection (REDIS_URL, e.g. Vercel's "Redis" integration).
//   dev:<id>   JSON Device
//   rem:<id>   hash  key -> JSON ScheduledReminder   (scheduled + "sent:" copies)
//   due        sorted set  "<id>|<key>" scored by fireAt  (scheduled only)

type Client = ReturnType<typeof createClient>;

export class UrlRedisStore implements Store {
  private client: Client;
  private ready: Promise<unknown> | null = null;

  constructor(url: string) {
    this.client = createClient({ url });
    // Without a listener, a dropped connection would crash the function; the client reconnects on its own.
    this.client.on('error', (e) => console.error('redis', e));
  }

  /** Connect once per function instance and reuse the connection. */
  private async r(): Promise<Client> {
    this.ready ??= this.client.connect().catch((e) => {
      this.ready = null;
      throw e;
    });
    await this.ready;
    return this.client;
  }

  async close() {
    if (this.ready) await this.client.close();
    this.ready = null;
  }

  async getVault(id: string) {
    const v = await (await this.r()).get(`vault:${id}`);
    return v ? (JSON.parse(String(v)) as Vault) : null;
  }
  async putVault(id: string, expected: number, blob: string) {
    const res = (await (await this.r()).eval(PUT_VAULT, {
      keys: [`vault:${id}`],
      arguments: [String(expected), blob, String(Date.now()), String(VAULT_TTL)],
    })) as [number, string];
    if (Number(res[0]) === 1) return { ok: true as const, version: Number(res[1]) };
    return { ok: false as const, current: res[1] ? (JSON.parse(String(res[1])) as Vault) : null };
  }

  async getDevice(id: string) {
    const v = await (await this.r()).get(`dev:${id}`);
    return v ? (JSON.parse(String(v)) as Device) : null;
  }
  async putDevice(id: string, d: Device) {
    const r = await this.r();
    await r.set(`dev:${id}`, JSON.stringify(d), { expiration: { type: 'EX', value: DEVICE_TTL } });
    await r.expire(`rem:${id}`, DEVICE_TTL);
  }
  async deleteDevice(id: string) {
    const r = await this.r();
    const keys = Object.keys(await r.hGetAll(`rem:${id}`));
    if (keys.length) await r.zRem('due', keys.map((k) => `${id}|${k}`));
    await r.del([`dev:${id}`, `rem:${id}`]);
  }

  async replaceSchedule(id: string, list: ScheduledReminder[]) {
    const r = await this.r();
    const old = Object.keys(await r.hGetAll(`rem:${id}`)).filter((k) => !k.startsWith('sent:'));
    const m = r.multi();
    if (old.length) {
      m.zRem('due', old.map((k) => `${id}|${k}`));
      m.hDel(`rem:${id}`, old);
    }
    if (list.length) {
      m.hSet(`rem:${id}`, Object.fromEntries(list.map((x) => [x.key, JSON.stringify(x)])));
      m.zAdd('due', list.map((x) => ({ score: x.fireAt, value: `${id}|${x.key}` })));
      m.expire(`rem:${id}`, DEVICE_TTL);
    }
    await m.exec();
  }
  async addReminder(id: string, x: ScheduledReminder) {
    const r = await this.r();
    await r.hSet(`rem:${id}`, x.key, JSON.stringify(x));
    await r.zAdd('due', { score: x.fireAt, value: `${id}|${x.key}` });
  }
  async keepSent(id: string, x: ScheduledReminder) {
    await (await this.r()).hSet(`rem:${id}`, x.key, JSON.stringify(x));
  }
  async getReminder(id: string, key: string) {
    const v = await (await this.r()).hGet(`rem:${id}`, key);
    return v ? (JSON.parse(String(v)) as ScheduledReminder) : null;
  }
  async removeReminder(id: string, key: string) {
    const r = await this.r();
    await r.zRem('due', `${id}|${key}`);
    await r.hDel(`rem:${id}`, key);
  }
  async due(now: number, limit: number) {
    const r = await this.r();
    const members = await r.zRange('due', 0, now, { BY: 'SCORE', LIMIT: { offset: 0, count: limit } });
    const out: { deviceId: string; reminder: ScheduledReminder }[] = [];
    for (const m of members.map(String)) {
      const i = m.indexOf('|');
      const deviceId = m.slice(0, i);
      const reminder = await this.getReminder(deviceId, m.slice(i + 1));
      if (reminder) out.push({ deviceId, reminder });
      else await r.zRem('due', m); // orphan
    }
    return out;
  }
}
