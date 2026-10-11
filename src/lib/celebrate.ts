// Fires when the last thing for today gets ticked off.
import { useSyncExternalStore } from 'react';

let burst = 0;
const listeners = new Set<() => void>();
export const useCelebration = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => burst);
export function celebrate() {
  burst++;
  listeners.forEach((l) => l());
}

/** A short tap of vibration (Android; iPhones ignore web vibration). */
export const haptic = (ms = 12) => navigator.vibrate?.(ms);
