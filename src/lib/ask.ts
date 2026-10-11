// "Just this one or all?" for repeating items, as a promise the UI resolves.
import { useSyncExternalStore } from 'react';

export type Scope = 'one' | 'all';
interface Question { title: string; verb: 'edit' | 'delete'; resolve: (s: Scope | null) => void }
let current: Question | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const useQuestion = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => current);

export function askScope(title: string, verb: 'edit' | 'delete'): Promise<Scope | null> {
  return new Promise((resolve) => {
    current = { title, verb, resolve };
    emit();
  });
}

export function answer(s: Scope | null) {
  const q = current;
  current = null;
  emit();
  q?.resolve(s);
}
