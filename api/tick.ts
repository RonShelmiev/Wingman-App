import { processDue } from '../server/core.js';
import { cronAuthorized, getSenders, getStore, json } from '../server/env.js';

// Called every minute by an external scheduler (see docs/HOSTING_VERCEL.md).
async function tick(req: Request) {
  if (!cronAuthorized(req)) return json({ error: 'unauthorized' }, 401);
  try {
    const result = await processDue(getStore(), getSenders(), Date.now());
    if (result.due) console.log('tick', JSON.stringify(result));
    return json(result);
  } catch (e) {
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
}

export const GET = tick;
export const POST = tick;
