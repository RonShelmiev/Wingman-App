// Runs device sync: download the encrypted copy, merge, upload. See sync.ts for the data rules.
import { useSyncExternalStore } from 'react';
import { commit, getState, subscribe } from './store';
import { decrypt, encrypt, fingerprint, isValidCode, merge, newSyncCode, normalizeCode, toSynced, vaultId, type Synced } from './sync';
import { getServerStatus } from './push';

export interface SyncStatus {
  busy: boolean;
  error: string | null;
}
let status: SyncStatus = { busy: false, error: null };
const listeners = new Set<() => void>();
const setStatus = (p: Partial<SyncStatus>) => {
  status = { ...status, ...p };
  listeners.forEach((l) => l());
};
export const useSyncStatus = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => status);

interface Vault { version: number; blob: string }

async function fetchVault(id: string): Promise<Vault | null> {
  const res = await fetch(`/api/vault?id=${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sync server error (${res.status})`);
  return (await res.json()) as Vault;
}

let inFlight: Promise<void> | null = null;
let again = false;

/** Pull, merge and push. Concurrent calls collapse into one extra run. */
export function syncVault(): Promise<void> {
  if (inFlight) {
    again = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      do {
        again = false;
        await runOnce();
      } while (again);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function runOnce() {
  const link = getState().sync;
  if (!link || !getServerStatus().storage) return;
  setStatus({ busy: true });
  try {
    const id = await vaultId(link.code);
    let remote = await fetchVault(id);
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = getState();
      let merged = before;
      if (remote) {
        let theirs: Synced;
        try {
          theirs = await decrypt<Synced>(link.code, remote.blob);
        } catch {
          // Never overwrite data we can't read.
          throw new Error('Couldn’t unlock the synced data. Check the sync code.');
        }
        merged = merge(before, theirs);
      }
      const payload = toSynced(merged);
      const hash = fingerprint(payload);
      const base = remote?.version ?? 0;
      // Nothing new on either side: just record the sync.
      if (remote && hash === link.lastHash && base === link.version) {
        commit({ ...merged, sync: { ...link, lastSync: Date.now() } });
        setStatus({ busy: false, error: null });
        return;
      }
      const res = await fetch('/api/vault', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, version: base, blob: await encrypt(link.code, payload) }),
      });
      if (res.status === 409) {
        // Another device saved first: merge again with its version.
        remote = ((await res.json()) as { current: Vault | null }).current;
        continue;
      }
      if (!res.ok) throw new Error(`Sync server error (${res.status})`);
      const { version } = (await res.json()) as { version: number };
      const latest = getState();
      if (latest.sync?.code !== link.code) return setStatus({ busy: false }); // sync was turned off meanwhile
      // Keep anything changed on this device while we were uploading; it syncs on the next run.
      const changedMeanwhile = latest !== before;
      commit({ ...(changedMeanwhile ? merge(latest, payload) : merged), sync: { ...link, version, lastSync: Date.now(), lastHash: hash } });
      if (changedMeanwhile) again = true;
      setStatus({ busy: false, error: null });
      return;
    }
    throw new Error('Sync kept conflicting; will retry shortly.');
  } catch (e) {
    setStatus({ busy: false, error: e instanceof TypeError ? 'Offline — will sync when you’re back online' : (e as Error).message });
  }
}

/** Start syncing this device with a brand-new code. */
export async function enableSync() {
  commit({ ...getState(), sync: { code: newSyncCode(), version: 0, lastSync: null, lastHash: null } });
  await syncVault();
}

/** Join the sync group of another device. Its data is merged with what's here, nothing is lost. */
export async function linkWithCode(input: string): Promise<boolean> {
  if (!isValidCode(input)) {
    setStatus({ error: 'That code doesn’t look right. It has 32 letters and numbers.' });
    return false;
  }
  commit({ ...getState(), sync: { code: normalizeCode(input), version: 0, lastSync: null, lastHash: null } });
  await syncVault();
  return !status.error;
}

export function stopSync() {
  commit({ ...getState(), sync: null });
  setStatus({ error: null });
}

export function syncLink(code: string) {
  return `${location.origin}/#sync=${code}`;
}

let timer: number | undefined;
let started = false;
/** Call once the server status is known. */
export function startSyncEngine() {
  if (started) return;
  started = true;
  // Opened from a "use on another device" link?
  const m = location.hash.match(/sync=([A-Za-z2-7-]{32,48})/);
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);
    const code = normalizeCode(m[1]);
    if (getState().sync?.code !== code && confirm('Link this device to your Wingman sync? Your data on both devices will be combined.')) void linkWithCode(code);
  }
  void syncVault();
  subscribe(() => {
    const s = getState();
    if (!s.sync || fingerprint(toSynced(s)) === s.sync.lastHash) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void syncVault(), 3000);
  });
  window.setInterval(() => document.visibilityState === 'visible' && void syncVault(), 2 * 60_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void syncVault());
  window.addEventListener('online', () => void syncVault());
}
