import { useEffect, useRef, useState, type ReactNode } from 'react';

/** The part of the screen not covered by the on-screen keyboard (iPhone Safari moves things around otherwise). */
function useVisibleArea() {
  const [area, setArea] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setArea({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return area;
}

export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the open/close effect: callers often pass a new
  // function every render, and re-running it would steal focus from the field being typed in.
  const close = useRef(onClose);
  close.current = onClose;
  const area = useVisibleArea();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const root = ref.current;
    // Focus a field the sheet asked for, else the first text field, else the first button.
    (root?.querySelector<HTMLElement>('[data-autofocus]') ?? root?.querySelector<HTMLElement>('input, textarea') ?? root?.querySelector<HTMLElement>('button'))?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, []);

  return (
    <div className="scrim" style={area ? { top: area.top, height: area.height, bottom: 'auto' } : undefined}
      onClick={(e) => e.target === e.currentTarget && close.current()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} ref={ref}
        // While typing, a tap on a button should press it on the first try — not just close the keyboard.
        onMouseDown={(e) => {
          const typing = document.activeElement?.matches('input, textarea');
          if (typing && (e.target as HTMLElement).closest('button')) e.preventDefault();
        }}>
        <span className="grabber" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
