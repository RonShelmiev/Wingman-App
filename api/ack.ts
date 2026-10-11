import { BadRequest, handleAck } from '../server/core.js';
import { getStore, json } from '../server/env.js';

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as { deviceId?: string; keys?: string[] };
    return json(await handleAck(getStore(), String(b.deviceId ?? ''), b.keys ?? []));
  } catch (e) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
}
