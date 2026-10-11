import { useEffect, useRef, useState } from 'react';
import { dismissUndo, undo, useUndo } from '../lib/undo';
import { answer, useQuestion } from '../lib/ask';
import { useCelebration } from '../lib/celebrate';
import { t } from '../lib/i18n';
import { applyUpdate, useUpdateAvailable } from '../lib/update';
import { Sheet } from './Sheet';

/** "Done: Gym · Undo" bar above the navigation. */
export function UndoBar() {
  const p = useUndo();
  if (!p) return null;
  return (
    <div className="undo-bar" role="status" key={p.id}>
      <span style={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{p.label}</span>
      <button className="undo-btn" onClick={undo}>{t('Undo')}</button>
      <button className="undo-x" aria-label={t('Dismiss')} onClick={dismissUndo}>×</button>
    </div>
  );
}

/** "A new version is ready" bar at the top. */
export function UpdateBar() {
  const ready = useUpdateAvailable();
  const [hidden, setHidden] = useState(false);
  if (!ready || hidden) return null;
  return (
    <div className="update-bar" role="status">
      <span style={{ flexGrow: 1 }}>{t('A new version of Wingman is ready.')}</span>
      <button className="undo-btn" onClick={applyUpdate}>{t('Refresh')}</button>
      <button className="undo-x" aria-label={t('Later')} onClick={() => setHidden(true)}>×</button>
    </div>
  );
}

/** "Just this one or all?" for repeating items. */
export function ScopeDialog() {
  const q = useQuestion();
  if (!q) return null;
  return (
    <Sheet label={q.verb === 'delete' ? t('Delete repeating item') : t('Change repeating item')} onClose={() => answer(null)}>
      <h1 style={{ fontSize: 22 }}>{q.verb === 'delete' ? t('Delete “{title}”?', { title: q.title }) : t('Change “{title}”?', { title: q.title })}</h1>
      <p className="subtitle">{t('This repeats. Apply to:')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn dark" onClick={() => answer('one')}>{t('Just this one')}</button>
        <button className="btn" onClick={() => answer('all')} style={q.verb === 'delete' ? { color: 'var(--danger)' } : undefined}>{t('All of them')}</button>
        <button className="btn" onClick={() => answer(null)}>{t('Cancel')}</button>
      </div>
    </Sheet>
  );
}

const COLORS = ['#D24B1F', '#2F55D4', '#17805A', '#C2367A', '#B4690E', '#7044D6', '#0E7C86'];

/** Confetti + message when everything for today is done. */
export function Celebration() {
  const n = useCelebration();
  const [show, setShow] = useState(0);
  const first = useRef(n);
  useEffect(() => {
    if (n === first.current) return;
    setShow(n);
    navigator.vibrate?.([20, 60, 20, 60, 40]);
    const id = window.setTimeout(() => setShow(0), 3200);
    return () => window.clearTimeout(id);
  }, [n]);
  if (!show) return null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div className="celebrate" role="status" aria-live="polite">
      {!reduced && Array.from({ length: 48 }, (_, i) => (
        <span key={`${show}-${i}`} className="confetti" style={{
          insetInlineStart: `${(i * 37) % 100}%`, background: COLORS[i % COLORS.length],
          animationDelay: `${(i % 12) * 0.06}s`, animationDuration: `${1.8 + (i % 5) * 0.25}s`,
          transform: `rotate(${(i * 47) % 360}deg)`, borderRadius: i % 3 ? '2px' : '50%',
        }} />
      ))}
      <div className="celebrate-card">
        <span style={{ fontSize: 40 }} aria-hidden="true">🎉</span>
        <strong>{t('All done for today!')}</strong>
        <span>{t('Nice work. Enjoy the rest of your day.')}</span>
      </div>
    </div>
  );
}
