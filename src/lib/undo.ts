// "Undo" bar: remembers the state before an action for a few seconds.
import { useSyncExternalStore } from 'react';
import { actions, getState, type State } from './store';

interface Pending { id: number; label: string; before: State }
let pending: Pending | null = null;
let timer: number | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const useUndo = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => pending);

/** Run an action and offer to undo it. */
export function undoable(label: string, fn: () => void) {
  const before = getState();
  fn();
  window.clearTimeout(timer);
  pending = { id: Date.now(), label, before };
  emit();
  timer = window.setTimeout(dismissUndo, 6000);
}

export function undo() {
  if (!pending) return;
  actions.restore(pending.before);
  dismissUndo();
}

export function dismissUndo() {
  window.clearTimeout(timer);
  pending = null;
  emit();
}
