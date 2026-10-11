import { BadRequest, handleSnooze } from '../server/core.js';
import { getStore, json } from '../server/env.js';

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as { deviceId?: string; key?: string; minutes?: number };
    return json(await handleSnooze(getStore(), String(b.deviceId ?? ''), String(b.key ?? ''), Number(b.minutes ?? 10), Date.now()));
  } catch (e) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
}
