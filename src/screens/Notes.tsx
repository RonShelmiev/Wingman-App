import { useEffect, useMemo, useRef, useState } from 'react';
import type { Note } from '../lib/types';
import { actions, useStore } from '../lib/store';
import { relativeDay, toDateStr } from '../lib/dates';
import { t, tn } from '../lib/i18n';
import { DoneCheck, Icon } from '../components/Icon';
import { undoable } from '../lib/undo';
import { haptic } from '../lib/celebrate';

/** First line of the text when a note has no title. */
export const noteTitle = (n: Note) => n.title.trim() || n.body.trim().split('\n')[0] || t('Empty note');

/** Strike-through, then fade out, then the note is removed. */
const STRIKE_MS = 450;
const LEAVE_MS = 850;

interface Props {
  today: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  /** A note just marked done in the editor: play its strike-through here. */
  completing?: string | null;
  onCompleted?: () => void;
}

export function Notes({ today, onOpen, onNew, completing, onCompleted }: Props) {
  const notes = useStore((s) => s.notes);
  const [q, setQ] = useState('');
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((x) => window.clearTimeout(x)), []);

  /** Done: strike the note through, fade it out, then remove it (with Undo). */
  const complete = (n: Note) => {
    if (leaving.has(n.id)) return;
    haptic();
    setLeaving((s) => new Set(s).add(n.id));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timers.current.push(window.setTimeout(() => {
      undoable(t('Done: {title}', { title: noteTitle(n) }), () => actions.deleteNote(n.id));
      setLeaving((s) => {
        const next = new Set(s);
        next.delete(n.id);
        return next;
      });
    }, reduced ? 150 : LEAVE_MS));
  };

  useEffect(() => {
    if (!completing) return;
    const n = notes.find((x) => x.id === completing);
    onCompleted?.();
    // Let the list paint first, so the line is seen drawing.
    if (n) timers.current.push(window.setTimeout(() => complete(n), 120));
  }, [completing]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return notes
      .filter((n) => !needle || `${n.title}\n${n.body}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  }, [notes, q]);
  const pinned = shown.filter((n) => n.pinned);
  const rest = shown.filter((n) => !n.pinned);

  const card = (n: Note) => {
    const title = noteTitle(n);
    // Don't repeat the first line as preview when it's already the title.
    const preview = n.title.trim() ? n.body.trim() : n.body.trim().split('\n').slice(1).join('\n').trim();
    const when = toDateStr(new Date(n.updatedAt ?? n.createdAt));
    const gone = leaving.has(n.id);
    return (
      <li key={n.id} className={`note-item${gone ? ' leaving' : ''}`} style={{ ['--strike-ms' as string]: `${STRIKE_MS}ms` }}>
        <button className="note-card" onClick={() => onOpen(n.id)} dir="auto" disabled={gone}>
          <span className="note-title">{n.pinned && <Icon name="pin" size={14} width={2.2} label={t('Pinned')} />}<span className="strike">{title}</span></span>
          {preview && <span className="note-preview"><span className="strike">{preview}</span></span>}
          <span className="note-when">{relativeDay(when, today)}</span>
        </button>
        <button className="check note-check" aria-pressed={gone} aria-label={`${t('Mark done')}: ${title}`} onClick={() => complete(n)}>
          {gone ? <DoneCheck /> : <span className="ring" />}
        </button>
      </li>
    );
  };

  return (
    <main className="screen">
      <header className="header" style={{ alignItems: 'center' }}>
        <div>
          <div className="eyebrow">{tn(notes.length, '{n} note', '{n} notes')}</div>
          <h1 className="title">{t('Notes')}</h1>
        </div>
        <button className="btn small primary" onClick={onNew} style={{ minHeight: 44 }}>{t('New note')}</button>
      </header>

      {notes.length > 0 && (
        <input className="input" type="search" dir="auto" placeholder={t('Search notes')} aria-label={t('Search notes')} value={q} onChange={(e) => setQ(e.target.value)} />
      )}

      {notes.length === 0 ? (
        <div className="empty card">
          <span>{t('Notes are for anything without a date: ideas, lists, things to remember.')}</span>
          <button className="btn primary" style={{ width: '100%' }} onClick={onNew}>{t('Write your first note')}</button>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty card">{t('No notes match “{q}”.', { q })}</div>
      ) : (
        <>
          {pinned.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 className="group-label">{t('Pinned')}</h2>
              <ul className="notes-grid">{pinned.map(card)}</ul>
            </section>
          )}
          {rest.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pinned.length > 0 && <h2 className="group-label">{t('Other notes')}</h2>}
              <ul className="notes-grid">{rest.map(card)}</ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
