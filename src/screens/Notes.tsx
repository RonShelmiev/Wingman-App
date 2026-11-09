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

/** The pen crosses text at a calm speed (px per ms), one row after another; long notes speed up to finish within MAX_PEN_MS. */
const PEN_SPEED = 0.4;
const MAX_PEN_MS = 1600;
const ROW_GAP_MS = 60;
const FADE_MS = 350;

/** One crossed-out row: where it sits in the card, and when the pen draws it. */
interface Stroke { top: number; left: number; right: number; width: number; delay: number; duration: number; rtl: boolean }
interface Leaving { strokes: Stroke[]; total: number }

/** Measure each wrapped row of the note's text, in reading order, and time the pen across them. */
function measureStrokes(li: HTMLElement): Leaving {
  const box = li.getBoundingClientRect();
  const rows = [...li.querySelectorAll<HTMLElement>('.strike')].flatMap((el) => {
    const rtl = getComputedStyle(el).direction === 'rtl';
    return [...el.getClientRects()].filter((r) => r.width >= 1).map((r) => ({ r, rtl }));
  });
  const ink = rows.reduce((sum, { r }) => sum + r.width, 0);
  const speed = Math.max(PEN_SPEED, ink / Math.max(600, MAX_PEN_MS - ROW_GAP_MS * rows.length));
  const strokes: Stroke[] = [];
  let at = 0;
  for (const { r, rtl } of rows) {
    const duration = Math.max(140, r.width / speed);
    strokes.push({ top: r.top - box.top + r.height * 0.55, left: r.left - box.left, right: box.right - r.right, width: r.width, delay: at, duration, rtl });
    at += duration + ROW_GAP_MS;
  }
  return { strokes, total: Math.max(0, at - ROW_GAP_MS) };
}

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
  const [leaving, setLeaving] = useState<Map<string, Leaving>>(new Map());
  const cards = useRef(new Map<string, HTMLLIElement>());
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((x) => window.clearTimeout(x)), []);

  /** Done: strike the note through, fade it out, then remove it (with Undo). */
  const complete = (n: Note) => {
    if (leaving.has(n.id)) return;
    haptic();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const li = cards.current.get(n.id);
    const plan = li && !reduced ? measureStrokes(li) : { strokes: [], total: 0 };
    setLeaving((s) => new Map(s).set(n.id, plan));
    timers.current.push(window.setTimeout(() => {
      undoable(t('Done: {title}', { title: noteTitle(n) }), () => actions.deleteNote(n.id));
      setLeaving((s) => {
        const next = new Map(s);
        next.delete(n.id);
        return next;
      });
    }, reduced ? 150 : plan.total + 120 + FADE_MS));
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
    const plan = leaving.get(n.id);
    const gone = !!plan;
    return (
      <li key={n.id} ref={(el) => { if (el) cards.current.set(n.id, el); else cards.current.delete(n.id); }}
        className={`note-item${gone ? ' leaving' : ''}`} style={{ ['--strike-total' as string]: `${(plan?.total ?? 0) + 120}ms` }}>
        {/* The card follows the app's direction (the tick's space stays on its side); the text follows its own language. */}
        <button className="note-card" onClick={() => onOpen(n.id)} disabled={gone}>
          <span className="note-title" dir="auto">{n.pinned && <Icon name="pin" size={14} width={2.2} label={t('Pinned')} />}<span><span className="strike">{title}</span></span></span>
          {preview && <span className="note-preview" dir="auto"><span className="strike">{preview}</span></span>}
          <span className="note-when">{relativeDay(when, today)}</span>
        </button>
        {plan?.strokes.map((s, i) => (
          <span key={i} className={`pen-stroke${s.rtl ? ' rtl' : ''}`} aria-hidden="true"
            // Anchored where reading starts (right for Hebrew), so the line grows the way the pen moves.
            style={{ top: s.top, ...(s.rtl ? { right: s.right } : { left: s.left }), ['--w' as string]: `${s.width}px`, animationDelay: `${s.delay}ms`, animationDuration: `${s.duration}ms` }} />
        ))}
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
