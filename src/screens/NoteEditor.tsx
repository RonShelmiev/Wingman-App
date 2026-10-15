import { useEffect, useRef, useState } from 'react';
import { actions, getState } from '../lib/store';
import { undoable } from '../lib/undo';
import { t } from '../lib/i18n';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { noteTitle } from './Notes';

/**
 * Write a note. Typing stays in this screen (so the keyboard is never interrupted) and is saved
 * shortly after you pause, and always when you close. An untouched new note disappears on close.
 */
export function NoteEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const initial = getState().notes.find((n) => n.id === id);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const draft = useRef({ title, body });
  draft.current = { title, body };
  const timer = useRef<number | undefined>(undefined);

  const flush = () => {
    window.clearTimeout(timer.current);
    const n = getState().notes.find((x) => x.id === id);
    if (n && (n.title !== draft.current.title || n.body !== draft.current.body)) actions.updateNote(id, draft.current);
  };

  // Save 600 ms after the last keystroke, and whenever the editor goes away (closing, app hidden).
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 600);
  }, [title, body]);
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, []);

  const close = () => {
    flush();
    if (!draft.current.title.trim() && !draft.current.body.trim()) actions.deleteNote(id);
    onClose();
  };

  if (!initial) return null;
  return (
    <Sheet label={t('Note')} onClose={close}>
      <div className="row-between" style={{ alignItems: 'center' }}>
        <button className="btn small" aria-pressed={pinned} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', minHeight: 44 }}
          onClick={() => { setPinned(!pinned); actions.updateNote(id, { pinned: !pinned }); }}>
          <Icon name="pin" size={16} width={2} />{pinned ? t('Unpin') : t('Pin')}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn small" aria-label={t('Delete note')} style={{ color: 'var(--danger)', minHeight: 44 }}
            onClick={() => {
              flush();
              const name = noteTitle({ ...initial, ...draft.current });
              onClose();
              undoable(t('Deleted: {title}', { title: name }), () => actions.deleteNote(id));
            }}>
            <Icon name="trash" size={18} />
          </button>
          <button className="btn small primary" onClick={close} style={{ minHeight: 44 }}>{t('Done')}</button>
        </div>
      </div>
      <input className="note-title-input" dir="auto" placeholder={t('Title')} aria-label={t('Title')} value={title}
        autoComplete="off" onChange={(e) => setTitle(e.target.value)} />
      <textarea className="note-body-input" dir="auto" placeholder={t('Write anything…')} aria-label={t('Note')} value={body}
        data-autofocus={!initial.title && !initial.body ? '' : undefined} onChange={(e) => setBody(e.target.value)} />
    </Sheet>
  );
}
