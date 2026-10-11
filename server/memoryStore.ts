import type { Device, Store, Vault } from './core.js';
import type { ScheduledReminder } from './types.js';

/** In-memory store for tests and local development. */
export class MemoryStore implements Store {
  devices = new Map<string, Device>();
  reminders = new Map<string, Map<string, ScheduledReminder>>();
  scheduled = new Map<string, Set<string>>();
  vaults = new Map<string, Vault>();

  async getVault(id: string) { return this.vaults.get(id) ?? null; }
  async putVault(id: string, expected: number, blob: string) {
    const cur = this.vaults.get(id) ?? null;
    if ((cur?.version ?? 0) !== expected) return { ok: false as const, current: cur };
    const version = expected + 1;
    this.vaults.set(id, { version, blob, updatedAt: Date.now() });
    return { ok: true as const, version };
  }

  private rem(id: string) {
    if (!this.reminders.has(id)) this.reminders.set(id, new Map());
    if (!this.scheduled.has(id)) this.scheduled.set(id, new Set());
    return { all: this.reminders.get(id)!, sched: this.scheduled.get(id)! };
  }

  async getDevice(id: string) { return this.devices.get(id) ?? null; }
  async putDevice(id: string, d: Device) { this.devices.set(id, { ...d }); }
  async deleteDevice(id: string) { this.devices.delete(id); this.reminders.delete(id); this.scheduled.delete(id); }

  async replaceSchedule(id: string, list: ScheduledReminder[]) {
    const { all, sched } = this.rem(id);
    for (const k of sched) all.delete(k);
    sched.clear();
    for (const r of list) await this.addReminder(id, r);
  }
  async addReminder(id: string, r: ScheduledReminder) {
    const { all, sched } = this.rem(id);
    all.set(r.key, r);
    sched.add(r.key);
  }
  async keepSent(id: string, r: ScheduledReminder) { this.rem(id).all.set(r.key, r); }
  async getReminder(id: string, key: string) { return this.reminders.get(id)?.get(key) ?? null; }
  async removeReminder(id: string, key: string) {
    const { all, sched } = this.rem(id);
    all.delete(key);
    sched.delete(key);
  }
  async due(now: number, limit: number) {
    const out: { deviceId: string; reminder: ScheduledReminder }[] = [];
    for (const [deviceId, sched] of this.scheduled) {
      for (const k of sched) {
        const r = this.reminders.get(deviceId)!.get(k)!;
        if (r.fireAt <= now) out.push({ deviceId, reminder: r });
      }
    }
    return out.sort((a, b) => a.reminder.fireAt - b.reminder.fireAt).slice(0, limit);
  }
}
