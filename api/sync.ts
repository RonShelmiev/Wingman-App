import { BadRequest, handleSync, validateSync } from '../server/core.js';
import { getStore, json } from '../server/env.js';

export async function POST(req: Request) {
  try {
    const body = validateSync(await req.json().catch(() => null));
    return json(await handleSync(getStore(), body, Date.now()));
  } catch (e) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
}
