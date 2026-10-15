import { useEffect, useRef, useState } from 'react';
import type { Area, Item } from '../lib/types';
import { prettyDate, toTimeStr } from '../lib/dates';
import { repeatLabel } from '../components/ItemRow';
import { Icon } from '../components/Icon';
import { t } from '../lib/i18n';
import { soundBlocked, unlockAudio } from '../lib/notify';

interface Props {
  item: Item;
  date: string;
  area?: Area;
  now: Date;
  onSnooze: (min: number) => void;
  onStop: () => void;
  onDone: () => void;
}

export function AlarmOverlay({ item, date, area, now, onSnooze, onStop, onDone }: Props) {
  const stopRef = useRef<HTMLButtonElement>(null);
  useEffect(() => stopRef.current?.focus(), []);
  // Opened from a notification, the browser hasn't allowed sound yet: any tap turns it on.
  const [muted, setMuted] = useState(soundBlocked);
  useEffect(() => {
    const id = window.setInterval(() => setMuted(soundBlocked()), 500);
    return () => window.clearInterval(id);
  }, []);
  const rep = repeatLabel(item);
  return (
    <div className="alarm" role="alertdialog" aria-modal="true" aria-labelledby="alarm-title" onPointerDown={unlockAudio}>
      <div className="halo" aria-hidden="true" />
      <span className="tag"><Icon name="alarm" size={18} width={2} />{t('ALARM')}</span>
      <span className="clock" dir="ltr">{toTimeStr(now)}</span>
      <span className="date">{prettyDate(date)}</span>
      {muted && <button className="sound-hint" onClick={unlockAudio}>{t('Tap anywhere to hear the alarm')}</button>}
      <h1 id="alarm-title">{item.title}</h1>
      <span className="area-line">
        {area && <span className="dot" style={{ background: area.color }} />}
        {[area?.name, item.start ? t('set for {time}', { time: item.start }) : null, rep?.toLowerCase()].filter(Boolean).join(' · ')}
      </span>
      <div className="actions">
        <div className="snoozes">
          <button onClick={() => onSnooze(5)}>{t('5 min')}</button>
          <button className="main" onClick={() => onSnooze(10)}>{t('Snooze 10')}</button>
          <button onClick={() => onSnooze(30)}>{t('30 min')}</button>
        </div>
        <button className="stop" ref={stopRef} onClick={onStop}>{t('Stop')}</button>
        <button className="done-link" onClick={onDone}>{t('Stop & mark done')}</button>
      </div>
    </div>
  );
}
