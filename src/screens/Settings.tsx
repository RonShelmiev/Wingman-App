import { useState } from 'react';
import type { Area } from '../lib/types';
import { AREA_COLORS, actions, useStore } from '../lib/store';
import { isRepeating, occursOn, overdueItems } from '../lib/schedule';
import { notificationPermission, notificationsSupported, requestNotificationPermission } from '../lib/notify';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';

interface Props {
  today: string;
  onTestAlarm: () => void;
}

function Switch({ on, onChange, labelledBy, disabled }: { on: boolean; onChange: (v: boolean) => void; labelledBy: string; disabled?: boolean }) {
  return <button className="switch" role="switch" aria-checked={on} aria-labelledby={labelledBy} disabled={disabled} style={{ opacity: disabled ? 0.5 : 1 }} onClick={() => onChange(!on)} />;
}

export function Settings({ today, onTestAlarm }: Props) {
  const s = useStore((st) => st.settings);
  const areas = useStore((st) => st.areas);
  const items = useStore((st) => st.items);
  const [editing, setEditing] = useState<Area | 'new' | null>(null);
  const [perm, setPerm] = useState(notificationPermission());

  const areaMeta = (a: Area) => {
    const mine = items.filter((i) => i.areaId === a.id);
    const open = mine.filter((i) => isRepeating(i) || !i.done).length;
    const todayN = mine.filter((i) => occursOn(i, today)).length;
    const over = overdueItems(mine, today).length;
    return [`${open} open`, todayN ? `${todayN} today` : '', over ? `${over} overdue` : ''].filter(Boolean).join(' · ');
  };

  const togglePush = async (v: boolean) => {
    if (v && perm !== 'granted') setPerm(await requestNotificationPermission());
    actions.updateSettings({ pushEnabled: v });
  };

  const pushNote = !notificationsSupported()
    ? 'This browser does not support notifications. On iPhone, add Wingman to your Home Screen first.'
    : perm === 'denied'
      ? 'Notifications are blocked. Allow them for this site in your browser or phone settings.'
      : perm === 'default' ? 'Tap the switch to allow notifications.' : 'On this device, at the reminder time';

  return (
    <main className="screen">
      <header className="header"><h1 className="title">Settings</h1></header>

      <div className="field">
        <label htmlFor="st-name">Your name</label>
        <input id="st-name" className="input" value={s.name} placeholder="So Wingman can greet you" onChange={(e) => actions.updateSettings({ name: e.target.value })} />
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 className="section-title">Life areas</h2>
        <p className="subtitle">Everything you look after, in one place. Tap to rename or recolor.</p>
        <div className="areas">
          {areas.map((a) => (
            <button key={a.id} className="area" onClick={() => setEditing(a)} aria-label={`Edit area ${a.name}`}>
              <span className="swatch" style={{ background: a.color }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="n">{a.name}</span>
                <span className="m">{areaMeta(a)}</span>
              </span>
            </button>
          ))}
          <button className="area add" onClick={() => setEditing('new')}><Icon name="plus" width={2.2} />New area</button>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="group-label">Channels</h2>
        <div className="list">
          <div className="setting">
            <div className="txt"><span className="t" id="st-push">Push notifications</span><span className="d">{pushNote}</span></div>
            <Switch on={s.pushEnabled && perm === 'granted'} onChange={togglePush} labelledBy="st-push" disabled={!notificationsSupported() || perm === 'denied'} />
          </div>
          <div className="setting">
            <div className="txt"><span className="t" id="st-email">Email</span><span className="d">Coming in the next update</span></div>
            <Switch on={false} onChange={() => undefined} labelledBy="st-email" disabled />
          </div>
          <div className="setting">
            <div className="txt"><span className="t">Alarm</span><span className="d">Full screen with sound while Wingman is open</span></div>
            <button className="btn small" onClick={onTestAlarm}>Test</button>
          </div>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="group-label">Daily routine</h2>
        <div className="list">
          <TimeRow label="Morning brief" desc="Your plan for the day" value={s.morningBrief} onChange={(v) => actions.updateSettings({ morningBrief: v })} />
          <TimeRow label="Evening recap" desc="What's done, what's left" value={s.eveningRecap} onChange={(v) => actions.updateSettings({ eveningRecap: v })} />
          <div className="setting wrap">
            <div className="txt"><span className="t">Quiet hours</span><span className="d">No notifications. Alarms still ring.</span></div>
            <input type="time" className="time-input" aria-label="Quiet hours start" value={s.quietStart} onChange={(e) => actions.updateSettings({ quietStart: e.target.value })} />
            <input type="time" className="time-input" aria-label="Quiet hours end" value={s.quietEnd} onChange={(e) => actions.updateSettings({ quietEnd: e.target.value })} />
          </div>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="group-label">Planning</h2>
        <div className="list">
          <div className="setting wrap">
            <div className="txt"><span className="t">My day runs</span><span className="d">Plan with Wingman only suggests times in this window</span></div>
            <input type="time" className="time-input" aria-label="Day start" value={s.dayStart} onChange={(e) => actions.updateSettings({ dayStart: e.target.value })} />
            <input type="time" className="time-input" aria-label="Day end" value={s.dayEnd} onChange={(e) => actions.updateSettings({ dayEnd: e.target.value })} />
          </div>
          <div className="setting">
            <div className="txt"><span className="t">Breathing room</span><span className="d">Gap kept between items</span></div>
            <select className="time-input" aria-label="Breathing room" value={s.bufferMin} onChange={(e) => actions.updateSettings({ bufferMin: Number(e.target.value) })}>
              {[0, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </div>
      </section>

      <p className="note">
        <strong>Install Wingman:</strong> on iPhone, open this page in Safari → Share → Add to Home Screen. On Android/Chrome, use “Install app”. Your data stays on this device.
        Reminders and alarms go off while Wingman is open or running in the background; reminders with the app fully closed arrive in the next update.
      </p>

      <button className="btn" style={{ color: 'var(--danger)' }} onClick={() => {
        if (confirm('Erase all items? Life areas and settings stay.')) for (const i of items) actions.deleteItem(i.id);
      }}>Erase all items</button>

      {editing && <AreaSheet area={editing === 'new' ? null : editing} canDelete={areas.length > 1} onClose={() => setEditing(null)} />}
    </main>
  );
}

function TimeRow({ label, desc, value, onChange }: { label: string; desc: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="setting">
      <div className="txt"><span className="t">{label}</span><span className="d">{desc}</span></div>
      <input type="time" className="time-input" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function AreaSheet({ area, canDelete, onClose }: { area: Area | null; canDelete: boolean; onClose: () => void }) {
  const [name, setName] = useState(area?.name ?? '');
  const [color, setColor] = useState(area?.color ?? AREA_COLORS[7]);
  const save = () => {
    if (!name.trim()) return;
    if (area) actions.updateArea(area.id, { name: name.trim(), color });
    else actions.addArea(name.trim(), color);
    onClose();
  };
  return (
    <Sheet label={area ? 'Edit life area' : 'New life area'} onClose={onClose}>
      <h1 style={{ fontSize: 24 }}>{area ? 'Edit area' : 'New area'}</h1>
      <div className="field">
        <label htmlFor="ar-name">Name</label>
        <input id="ar-name" className="input big" value={name} placeholder="e.g. Side project, Pets, Travel" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
      <div className="field">
        <span className="label" id="ar-color">Color</span>
        <div className="swatches" role="group" aria-labelledby="ar-color">
          {AREA_COLORS.map((c) => <button key={c} className="swatch-btn" style={{ background: c }} aria-pressed={c === color} aria-label={`Color ${c}`} onClick={() => setColor(c)} />)}
        </div>
      </div>
      <div className="btn-row">
        {area && canDelete
          ? <button className="btn" style={{ color: 'var(--danger)' }} onClick={() => { actions.deleteArea(area.id); onClose(); }}>Delete</button>
          : <button className="btn" onClick={onClose}>Cancel</button>}
        <button className="btn primary grow" disabled={!name.trim()} style={{ opacity: name.trim() ? 1 : 0.5 }} onClick={save}>Save</button>
      </div>
      {area && canDelete && <span style={{ fontSize: 13, color: 'var(--muted-2)' }}>Deleting moves its items to your first area.</span>}
    </Sheet>
  );
}
