import { useState } from 'react';
import type { Area } from '../lib/types';
import { AREA_COLORS, actions, useStore } from '../lib/store';
import { isRepeating, occursOn, overdueItems } from '../lib/schedule';
import { notificationPermission, notificationsSupported, requestNotificationPermission } from '../lib/notify';
import { Sheet } from '../components/Sheet';
import { enableBackgroundPush, syncNow, useServerStatus } from '../lib/push';
import { insightLines } from '../lib/insights';
import { formatCode, makeBackup, merge, readBackup } from '../lib/sync';
import { enableSync, linkWithCode, stopSync, syncLink, syncVault, useSyncStatus } from '../lib/syncEngine';
import { commit, getState } from '../lib/store';
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
  const history = useStore((st) => st.history);
  const [editing, setEditing] = useState<Area | 'new' | null>(null);
  const [perm, setPerm] = useState(notificationPermission());

  const areaMeta = (a: Area) => {
    const mine = items.filter((i) => i.areaId === a.id);
    const open = mine.filter((i) => isRepeating(i) || !i.done).length;
    const todayN = mine.filter((i) => occursOn(i, today)).length;
    const over = overdueItems(mine, today).length;
    return [`${open} open`, todayN ? `${todayN} today` : '', over ? `${over} overdue` : ''].filter(Boolean).join(' · ');
  };

  const server = useServerStatus();

  const togglePush = async (v: boolean) => {
    let p = perm;
    if (v && p !== 'granted') setPerm((p = await requestNotificationPermission()));
    actions.updateSettings({ pushEnabled: v });
    if (v && p === 'granted' && server.available) await enableBackgroundPush();
  };

  const bgText = server.available === null ? 'Checking…'
    : !server.available ? (server.error ?? 'Works once Wingman is hosted with its server — see the hosting guide')
    : perm !== 'granted' || !s.pushEnabled ? 'Turn on push notifications above'
    : !server.subscribed ? 'Tap Connect to get reminders with the app closed'
    : server.error ?? (server.lastSync ? `On · synced ${Math.max(0, Math.round((Date.now() - server.lastSync) / 60000))} min ago` : 'On');
  const bgOn = !!server.available && server.subscribed && perm === 'granted' && s.pushEnabled;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.email.trim());

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

      <div className="field">
        <span className="label" id="st-theme">Appearance</span>
        <div className="seg" role="group" aria-labelledby="st-theme">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} aria-pressed={s.theme === t} onClick={() => actions.updateSettings({ theme: t })}>{t === 'system' ? 'Auto' : t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
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
            <div className="txt"><span className="t">When Wingman is closed</span><span className="d">{bgText}</span></div>
            {bgOn ? <span className="icon-muted" style={{ color: 'var(--ok)' }}><Icon name="check" size={22} width={2.4} label="On" /></span>
              : server.available && perm === 'granted' && s.pushEnabled && <button className="btn small" onClick={() => void enableBackgroundPush()}>Connect</button>}
          </div>
          <div className="setting wrap">
            <div className="txt" style={{ flexBasis: 'auto', flex: 1 }}>
              <span className="t" id="st-email">Email</span>
              <span className="d">{server.email ? 'For reminders set to “Email”' : 'Needs the email service set up on the server'}</span>
            </div>
            <Switch on={s.emailEnabled && server.email} onChange={(v) => actions.updateSettings({ emailEnabled: v })} labelledBy="st-email" disabled={!server.email} />
            {s.emailEnabled && server.email && (
              <input className="input" type="email" aria-label="Email address" placeholder="you@example.com" value={s.email} autoComplete="email"
                style={{ borderColor: s.email && !emailValid ? 'var(--danger)' : undefined }}
                onChange={(e) => actions.updateSettings({ email: e.target.value })} onBlur={() => void syncNow()} />
            )}
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

      <SyncSection storage={server.storage} checking={server.available === null} />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="group-label">What Wingman has learned</h2>
        {(() => {
          const lines = insightLines(history, areas);
          const timed = history.filter((c) => c.actualMin).length;
          return (
            <>
              {lines.length ? <ul className="learned">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
                : <p className="note">Nothing yet. Tick off tasks, and use “Start focus timer” on a task to teach Wingman how long things really take. Plan with Wingman then picks your best hours and pads tasks that usually run over.</p>}
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{history.length} finished task{history.length === 1 ? '' : 's'} · {timed} timed</span>
              {history.length > 0 && <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => confirm('Forget everything Wingman has learned?') && actions.resetLearning()}>Reset learning</button>}
            </>
          );
        })()}
      </section>

      <p className="note">
        <strong>Install Wingman:</strong> on iPhone, open this page in Safari → Share → Add to Home Screen. On Android/Chrome, use “Install app”. Your data stays on this device.
        With the app closed, reminders and alarms arrive as notifications from the Wingman server (iPhone: only after adding to Home Screen, iOS 16.4+).
      </p>

      <button className="btn" style={{ color: 'var(--danger)' }} onClick={() => {
        if (confirm('Erase all items? Life areas and settings stay.')) for (const i of items) actions.deleteItem(i.id);
      }}>Erase all items</button>

      {editing && <AreaSheet area={editing === 'new' ? null : editing} canDelete={areas.length > 1} onClose={() => setEditing(null)} />}
    </main>
  );
}

function ago(ms: number | null) {
  if (!ms) return 'not yet';
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function SyncSection({ storage, checking }: { storage: boolean; checking: boolean }) {
  const link = useStore((st) => st.sync);
  const sync = useSyncStatus();
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const [reveal, setReveal] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const download = () => {
    const blob = new Blob([JSON.stringify(makeBackup(getState()), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wingman-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg('Backup downloaded. Keep it somewhere safe, like iCloud Drive or email.');
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = readBackup(await file.text());
      commit(merge(getState(), data));
      setMsg(`Restored ${data.items.length} items from the backup (combined with what was already here).`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const share = async () => {
    const url = syncLink(link!.code);
    try {
      if (navigator.share) await navigator.share({ title: 'Wingman sync link', text: 'Open this on your other device to sync Wingman', url });
      else {
        await navigator.clipboard.writeText(url);
        setMsg('Link copied. Open it on your other device.');
      }
    } catch {
      // Share sheet dismissed.
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 className="group-label">Sync &amp; backup</h2>
      <div className="list">
        {checking ? (
          <div className="setting"><div className="txt"><span className="t">Sync between devices</span><span className="d">Checking…</span></div></div>
        ) : !storage ? (
          <div className="setting"><div className="txt"><span className="t">Sync between devices</span><span className="d">Works once Wingman is hosted with its server (see the hosting guide). Backups below work anyway.</span></div></div>
        ) : link ? (
          <>
            <div className="setting">
              <div className="txt">
                <span className="t">Sync is on</span>
                <span className="d" aria-live="polite">{sync.busy ? 'Syncing…' : sync.error ?? `Synced ${ago(link.lastSync)} · end-to-end encrypted`}</span>
              </div>
              <button className="btn small" onClick={() => void syncVault()} disabled={sync.busy}>Sync now</button>
            </div>
            <div className="setting wrap">
              <div className="txt"><span className="t">Add another device</span><span className="d">Open the link on it, or type the code in Settings → Sync on that device. Anyone with the code can see your data, so keep it private.</span></div>
              <code style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.04em', overflowWrap: 'anywhere' }}>{reveal ? formatCode(link.code) : `${formatCode(link.code).slice(0, 4)}-••••-••••-…`}</code>
              <div className="btn-row" style={{ width: '100%' }}>
                <button className="btn small" onClick={() => setReveal((r) => !r)}>{reveal ? 'Hide code' : 'Show code'}</button>
                <button className="btn small primary" onClick={() => void share()}>Share link</button>
              </div>
            </div>
            <div className="setting">
              <div className="txt"><span className="t">Stop syncing this device</span><span className="d">Your data stays here; other devices keep theirs.</span></div>
              <button className="btn small" style={{ color: 'var(--danger)' }} onClick={() => confirm('Stop syncing on this device?') && stopSync()}>Stop</button>
            </div>
          </>
        ) : joining ? (
          <div className="setting wrap">
            <div className="txt"><span className="t">Enter your sync code</span><span className="d">Find it on your other device under Settings → Sync &amp; backup → Show code.</span></div>
            <input className="input" aria-label="Sync code" placeholder="ABCD-EFGH-…" value={code} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} />
            {sync.error && <span style={{ fontSize: 13, color: 'var(--danger)' }}>{sync.error}</span>}
            <div className="btn-row" style={{ width: '100%' }}>
              <button className="btn small" onClick={() => setJoining(false)}>Cancel</button>
              <button className="btn small primary" disabled={sync.busy} onClick={async () => { if (await linkWithCode(code)) { setJoining(false); setCode(''); } }}>{sync.busy ? 'Linking…' : 'Link this device'}</button>
            </div>
          </div>
        ) : (
          <div className="setting wrap">
            <div className="txt"><span className="t">Sync between devices</span><span className="d">Use Wingman on your phone and computer with the same data. Encrypted on your device; the server can't read it.</span></div>
            <div className="btn-row" style={{ width: '100%' }}>
              <button className="btn small" onClick={() => setJoining(true)}>I have a code</button>
              <button className="btn small primary" disabled={sync.busy} onClick={() => void enableSync()}>Turn on sync</button>
            </div>
            {sync.error && <span style={{ fontSize: 13, color: 'var(--danger)' }}>{sync.error}</span>}
          </div>
        )}
        <div className="setting wrap">
          <div className="txt"><span className="t">Backup file</span><span className="d">Save everything to a file, or bring a backup back. Restoring combines it with what's here.</span></div>
          <div className="btn-row" style={{ width: '100%' }}>
            <label className="btn small" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              Restore
              <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <button className="btn small primary" onClick={download}>Download backup</button>
          </div>
        </div>
      </div>
      {msg && <p className="note" role="status">{msg}</p>}
    </section>
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
