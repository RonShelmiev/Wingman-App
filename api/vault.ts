import { BadRequest, handleVaultGet, handleVaultPut } from '../server/core.js';
import { getStore, json, storageConfigured } from '../server/env.js';

// Encrypted sync storage. The id is a hash of the sync code; the blob is encrypted on the device.
export async function GET(req: Request) {
  if (!storageConfigured()) return json({ error: 'storage not configured' }, 503);
  try {
    const v = await handleVaultGet(getStore(), new URL(req.url).searchParams.get('id') ?? '');
    return v ? json(v) : json({ error: 'not found' }, 404);
  } catch (e) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
}

export async function PUT(req: Request) {
  if (!storageConfigured()) return json({ error: 'storage not configured' }, 503);
  try {
    const res = await handleVaultPut(getStore(), await req.json().catch(() => null));
    return res.ok ? json({ version: res.version }) : json({ error: 'conflict', current: res.current }, 409);
  } catch (e) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
}
