import { useState } from 'react';
import { useStore } from '../lib/store';
import { isDoneOn, isRepeating, itemsOn } from '../lib/schedule';
import { moveAllToTomorrow, toggle } from '../lib/itemActions';
import { t, tn } from '../lib/i18n';
import { Sheet } from '../components/Sheet';
import { DoneCheck } from '../components/Icon';

/** Evening recap: tick off what got done, send the rest to tomorrow. */
export function Recap({ today, onClose }: { today: string; onClose: () => void }) {
  const items = useStore((s) => s.items);
  const areas = useStore((s) => s.areas);
  const day = itemsOn(items, today);
  const done = day.filter((i) => isDoneOn(i, today));
  const open = day.filter((i) => !isDoneOn(i, today) && !isRepeating(i));
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const moving = open.filter((i) => !keep.has(i.id));

  return (
    <Sheet label={t('Evening recap')} onClose={onClose}>
      <h1 style={{ fontSize: 26 }}>{t('Evening recap')}</h1>
      <p className="subtitle">
        {t('Done {done} of {total} today.', { done: done.length, total: day.length })}{' '}
        {open.length ? t('Here’s what’s left. Tick what you finished; the rest moves to tomorrow.') : t('Clean sweep! 🎉')}
      </p>
      {open.length > 0 && (
        <div className="list">
          {open.map((i) => {
            const area = areas.find((a) => a.id === i.areaId);
            const stays = keep.has(i.id);
            return (
              <div className="setting" key={i.id}>
                <button className="check" aria-label={`${t('Mark done')}: ${i.title}`} onClick={() => toggle(i, today)}>
                  {isDoneOn(i, today) ? <DoneCheck /> : <span className="ring" />}
                </button>
                <div className="txt">
                  <span className="t">{i.title}</span>
                  <span className="d">{[area?.name, i.start].filter(Boolean).join(' · ')}</span>
                </div>
                <button className="btn small" aria-pressed={!stays} onClick={() => setKeep((s) => { const n = new Set(s); if (stays) n.delete(i.id); else n.add(i.id); return n; })}>
                  {stays ? t('Keep today') : t('→ Tomorrow')}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="btn-row">
        <button className="btn" onClick={onClose}>{t('Close')}</button>
        {moving.length > 0 && (
          <button className="btn primary grow" onClick={() => { moveAllToTomorrow(moving, today); onClose(); }}>
            {tn(moving.length, 'Move {n} to tomorrow', 'Move {n} to tomorrow')}
          </button>
        )}
      </div>
    </Sheet>
  );
}
