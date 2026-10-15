import { useEffect, useRef } from 'react';
import { actions, getState, useStore } from '../lib/store';
import { undoable } from '../lib/undo';
import { t } from '../lib/i18n';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { noteTitle } from './Notes';

/** Write a note. Saves as you type; an untouched new note disappears on close. */
export function NoteEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const note = useStore((s) => s.notes.find((n) => n.id === id));
  const body = useRef<HTMLTextAreaElement>(null);

  // Grow the text box with its content.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(220, el.scrollHeight)}px`;
  }, [note?.body]);

  const close = () => {
    const n = getState().notes.find((x) => x.id === id);
    if (n && !n.title.trim() && !n.body.trim()) actions.deleteNote(id);
    onClose();
  };

  if (!note) return null;
  return (
    <Sheet label={t('Note')} onClose={close}>
      <div className="row-between" style={{ alignItems: 'center' }}>
        <button className="btn small" aria-pressed={note.pinned} onClick={() => actions.updateNote(id, { pinned: !note.pinned })} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', minHeight: 44 }}>
          <Icon name="pin" size={16} width={2} />{note.pinned ? t('Unpin') : t('Pin')}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn small" aria-label={t('Delete note')} style={{ color: 'var(--danger)', minHeight: 44 }}
            onClick={() => { const title = noteTitle(note); onClose(); undoable(t('Deleted: {title}', { title }), () => actions.deleteNote(id)); }}>
            <Icon name="trash" size={18} />
          </button>
          <button className="btn small primary" onClick={close} style={{ minHeight: 44 }}>{t('Done')}</button>
        </div>
      </div>
      <input className="note-title-input" dir="auto" placeholder={t('Title')} aria-label={t('Title')} value={note.title}
        onChange={(e) => actions.updateNote(id, { title: e.target.value })} />
      <textarea ref={body} className="note-body-input" dir="auto" placeholder={t('Write anything…')} aria-label={t('Note')} value={note.body}
        autoFocus={!note.body && !note.title} onChange={(e) => actions.updateNote(id, { body: e.target.value })} />
    </Sheet>
  );
}
