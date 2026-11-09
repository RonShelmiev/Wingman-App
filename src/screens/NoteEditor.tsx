import { useEffect, useRef, useState } from 'react';
import { actions, getState } from '../lib/store';
import { undoable } from '../lib/undo';
import { isRtl, t } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { noteTitle } from './Notes';

/**
 * A note, as a full page (like Apple Notes) rather than a pop-up: iPhone Safari can misplace taps on
 * pop-up layers while the keyboard is open, which made "Done" unresponsive. Typing stays on this page
 * and is saved shortly after you pause, when you leave, and when the app goes to the background.
 * An untouched new note disappears when you leave.
 */
/** `onClose` saves and goes back; `onComplete` is "Done": the list strikes the note through and removes it. */
export function NoteEditor({ id, onClose, onComplete }: { id: string; onClose: () => void; onComplete: () => void }) {
  const initial = getState().notes.find((n) => n.id === id);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const draft = useRef({ title, body });
  draft.current = { title, body };
  const timer = useRef<number | undefined>(undefined);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const flush = () => {
    window.clearTimeout(timer.current);
    const n = getState().notes.find((x) => x.id === id);
    if (n && (n.title !== draft.current.title || n.body !== draft.current.body)) actions.updateNote(id, draft.current);
  };

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 600);
  }, [title, body]);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (!initial?.title && !initial?.body) bodyRef.current?.focus();
    const onHide = () => document.visibilityState === 'hidden' && flush();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('keydown', onKey);
      flush();
    };
  }, []);

  /** Save and leave. An empty note is removed; with `complete`, a written one is struck through and removed too. */
  const leave = (complete: boolean) => {
    (document.activeElement as HTMLElement | null)?.blur(); // put the keyboard away
    flush();
    const empty = !draft.current.title.trim() && !draft.current.body.trim();
    if (empty) actions.deleteNote(id);
    if (complete && !empty) onComplete();
    else onClose();
  };
  const close = () => leave(false);

  if (!initial) return null;
  return (
    <main className="note-page" aria-label={t('Note')}>
      <header className="note-bar">
        <button className="note-back" onClick={close} aria-label={t('Back to notes')}>
          <Icon name={isRtl() ? 'right' : 'left'} size={22} width={2.2} />{t('Notes')}
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn small" aria-pressed={pinned} aria-label={pinned ? t('Unpin') : t('Pin')} style={{ minHeight: 44, minWidth: 44, padding: 0 }}
            onClick={() => { setPinned(!pinned); actions.updateNote(id, { pinned: !pinned }); }}>
            <Icon name="pin" size={18} width={pinned ? 2.6 : 1.8} />
          </button>
          <button className="btn small" aria-label={t('Delete note')} style={{ color: 'var(--danger)', minHeight: 44, minWidth: 44, padding: 0 }}
            onClick={() => {
              flush();
              const name = noteTitle({ ...initial, ...draft.current });
              onClose();
              undoable(t('Deleted: {title}', { title: name }), () => actions.deleteNote(id));
            }}>
            <Icon name="trash" size={18} />
          </button>
          <button className="btn small primary" onClick={() => leave(true)} aria-label={t('Mark done')} style={{ minHeight: 44, minWidth: 72, gap: 6 }}>
            <Icon name="check" size={18} width={2.4} />{t('Done')}
          </button>
        </div>
      </header>
      <input className="note-title-input" dir="auto" placeholder={t('Title')} aria-label={t('Title')} value={title}
        autoComplete="off" onChange={(e) => setTitle(e.target.value)} />
      {/* The text box grows with its text (a hidden copy sets the height), so nothing jumps while typing. */}
      <div className="grow-wrap" data-value={body + ' '}>
        <textarea ref={bodyRef} className="note-body-input" dir="auto" placeholder={t('Write anything…')} aria-label={t('Note')} value={body}
          onChange={(e) => setBody(e.target.value)} />
      </div>
    </main>
  );
}
