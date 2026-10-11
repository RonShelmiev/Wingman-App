// Notices when a newer version of Wingman has been published and offers a one-tap refresh.
import { useSyncExternalStore } from 'react';

let available = false;
const listeners = new Set<() => void>();
export const useUpdateAvailable = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => available);

async function check() {
  if (available) return;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { id } = (await res.json()) as { id?: string };
    if (id && id !== __BUILD_ID__) {
      available = true;
      listeners.forEach((l) => l());
      // Fetch the new service worker too, so the refresh starts clean.
      void navigator.serviceWorker?.getRegistration().then((r) => r?.update());
    }
  } catch {
    // Offline: try again later.
  }
}

/** Check on start, whenever the app comes back to the screen, and every 30 minutes. */
export function startUpdateChecks() {
  if (!import.meta.env.PROD) return;
  void check();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void check());
  window.addEventListener('online', () => void check());
  window.setInterval(() => void check(), 30 * 60_000);
}

export function applyUpdate() {
  location.reload();
}
