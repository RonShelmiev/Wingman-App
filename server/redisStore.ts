import { Redis } from '@upstash/redis';
import type { Device, Store, Vault } from './core.js';
import type { ScheduledReminder } from './types.js';

// Layout:
//   dev:<id>   JSON Device
//   rem:<id>   hash  key -> JSON ScheduledReminder   (scheduled + "sent:" copies)
//   due        sorted set  "<id>|<key>" scored by fireAt  (scheduled only)
const DEVICE_TTL = 60 * 24 * 3600; // forget devices not seen for 60 days
const VAULT_TTL = 400 * 24 * 3600; // keep synced data for a year after the last change

// Compare-and-set in one step, so two devices saving at once can't overwrite each other.
const PUT_VAULT = `
local cur = redis.call('GET', KEYS[1])
local version = 0
if cur then version = cjson.decode(cur).version end
if version ~= tonumber(ARGV[1]) then return {0, cur or ''} end
local nextv = version + 1
redis.call('SET', KEYS[1], cjson.encode({version = nextv, blob = ARGV[2], updatedAt = tonumber(ARGV[3])}), 'EX', tonumber(ARGV[4]))
return {1, tostring(nextv)}
`;

export class RedisStore implements Store {
  constructor(private r: Redis) {}

  async getVault(id: string) {
    const v = await this.r.get<Vault | string>(`vault:${id}`);
    return v ? (typeof v === 'string' ? (JSON.parse(v) as Vault) : v) : null;
  }
  async putVault(id: string, expected: number, blob: string) {
    const [ok, val] = (await this.r.eval(PUT_VAULT, [`vault:${id}`], [String(expected), blob, String(Date.now()), String(VAULT_TTL)])) as [number, string | Vault];
    if (ok === 1) return { ok: true as const, version: Number(val) };
    const current = !val ? null : typeof val === 'string' ? (JSON.parse(val) as Vault) : val;
    return { ok: false as const, current };
  }

  async getDevice(id: string) { return (await this.r.get<Device>(`dev:${id}`)) ?? null; }
  async putDevice(id: string, d: Device) {
    await this.r.set(`dev:${id}`, d, { ex: DEVICE_TTL });
    await this.r.expire(`rem:${id}`, DEVICE_TTL);
  }
  async deleteDevice(id: string) {
    const keys = Object.keys((await this.r.hgetall<Record<string, ScheduledReminder>>(`rem:${id}`)) ?? {});
    if (keys.length) await this.r.zrem('due', ...keys.map((k) => `${id}|${k}`));
    await this.r.del(`dev:${id}`, `rem:${id}`);
  }

  async replaceSchedule(id: string, list: ScheduledReminder[]) {
    const old = Object.keys((await this.r.hgetall<Record<string, ScheduledReminder>>(`rem:${id}`)) ?? {}).filter((k) => !k.startsWith('sent:'));
    const p = this.r.pipeline();
    if (old.length) {
      p.zrem('due', ...old.map((k) => `${id}|${k}`));
      p.hdel(`rem:${id}`, ...old);
    }
    if (list.length) {
      p.hset(`rem:${id}`, Object.fromEntries(list.map((r) => [r.key, JSON.stringify(r)])));
      for (const r of list) p.zadd('due', { score: r.fireAt, member: `${id}|${r.key}` });
      p.expire(`rem:${id}`, DEVICE_TTL);
    }
    await p.exec();
  }
  async addReminder(id: string, r: ScheduledReminder) {
    await this.r.hset(`rem:${id}`, { [r.key]: JSON.stringify(r) });
    await this.r.zadd('due', { score: r.fireAt, member: `${id}|${r.key}` });
  }
  async keepSent(id: string, r: ScheduledReminder) {
    await this.r.hset(`rem:${id}`, { [r.key]: JSON.stringify(r) });
  }
  async getReminder(id: string, key: string) {
    const v = await this.r.hget<ScheduledReminder | string>(`rem:${id}`, key);
    return v ? (typeof v === 'string' ? (JSON.parse(v) as ScheduledReminder) : v) : null;
  }
  async removeReminder(id: string, key: string) {
    await this.r.zrem('due', `${id}|${key}`);
    await this.r.hdel(`rem:${id}`, key);
  }
  async due(now: number, limit: number) {
    const members = await this.r.zrange<string[]>('due', 0, now, { byScore: true, offset: 0, count: limit });
    const out: { deviceId: string; reminder: ScheduledReminder }[] = [];
    for (const m of members) {
      const i = m.indexOf('|');
      const deviceId = m.slice(0, i);
      const reminder = await this.getReminder(deviceId, m.slice(i + 1));
      if (reminder) out.push({ deviceId, reminder });
      else await this.r.zrem('due', m); // orphan
    }
    return out;
  }
}
