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
import { t, tn } from '../lib/i18n';
import { dowShort, weekdayName } from '../lib/dates';

// A Sunday to index weekday names from.
const dowShortOf = (d: number) => dowShort(`2026-10-${String(11 + d).padStart(2, '0')}`);

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
    return [t('{n} open', { n: open }), todayN ? t('{n} today', { n: todayN }) : '', over ? t('{n} overdue', { n: over }) : ''].filter(Boolean).join(' · ');
  };

  const server = useServerStatus();

  const togglePush = async (v: boolean) => {
    let p = perm;
    if (v && p !== 'granted') setPerm((p = await requestNotificationPermission()));
    actions.updateSettings({ pushEnabled: v });
    if (v && p === 'granted' && server.available) await enableBackgroundPush();
  };

  const bgText = server.available === null ? t('Checking…')
    : !server.available ? (server.error ? t(server.error) : t('Works once Wingman is hosted with its server — see the hosting guide'))
    : perm !== 'granted' || !s.pushEnabled ? t('Turn on push notifications above')
    : !server.subscribed ? t('Tap Connect to get reminders with the app closed')
    : server.error ? t(server.error) : server.lastSync ? t('On · synced {ago}', { ago: ago(server.lastSync) }) : t('On');
  const bgOn = !!server.available && server.subscribed && perm === 'granted' && s.pushEnabled;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.email.trim());

  const pushNote = !notificationsSupported()
    ? t('This browser does not support notifications. On iPhone, add Wingman to your Home Screen first.')
    : perm === 'denied'
      ? t('Notifications are blocked. Allow them for this site in your browser or phone settings.')
      : perm === 'default' ? t('Tap the switch to allow notifications.') : t('On this device, at the reminder time');

  return (
    <main className="screen">
      <header className="header"><h1 className="title">{t('Settings')}</h1></header>

      <div className="field">
        <label htmlFor="st-name">{t('Your name')}</label>
        <input id="st-name" className="input" value={s.name} placeholder={t('So Wingman can greet you')} onChange={(e) => actions.updateSettings({ name: e.target.value })} />
      </div>

      <div className="field">
        <span className="label" id="st-theme">{t('Appearance')}</span>
        <div className="seg" role="group" aria-labelledby="st-theme">
          {([['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']] as const).map(([th, l]) => (
            <button key={th} aria-pressed={s.theme === th} onClick={() => actions.updateSettings({ theme: th })}>{t(l)}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label" id="st-lang">{t('Language')}</span>
        <div className="seg" role="group" aria-labelledby="st-lang">
          <button aria-pressed={s.language === 'en'} onClick={() => actions.setLanguage('en')}>English</button>
          <button aria-pressed={s.language === 'he'} onClick={() => actions.setLanguage('he')}>עברית</button>
        </div>
      </div>

      <div className="field">
        <span className="label" id="st-week">{t('Week starts on')}</span>
        <div className="seg" role="group" aria-labelledby="st-week">
          <button aria-pressed={s.weekStart === 0} onClick={() => actions.updateSettings({ weekStart: 0 })}>{weekdayName(0)}</button>
          <button aria-pressed={s.weekStart === 1} onClick={() => actions.updateSettings({ weekStart: 1 })}>{weekdayName(1)}</button>
        </div>
      </div>

      <div className="field">
        <span className="label" id="st-work">{t('Work days')}</span>
        <div className="chips" role="group" aria-labelledby="st-work">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <button key={d} className="chip" aria-pressed={s.workDays.includes(d)} aria-label={weekdayName(d)}
              onClick={() => actions.updateSettings({ workDays: s.workDays.includes(d) ? s.workDays.filter((x) => x !== d) : [...s.workDays, d].sort() })}>
              {dowShortOf(d)}
            </button>
          ))}
        </div>
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 className="section-title">{t('Life areas')}</h2>
        <p className="subtitle">{t('Everything you look after, in one place. Tap to rename or recolor.')}</p>
        <div className="areas">
          {areas.map((a) => (
            <button key={a.id} className="area" onClick={() => setEditing(a)} aria-label={t('Edit area {name}', { name: a.name })}>
              <span className="swatch" style={{ background: a.color }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="n">{a.name}</span>
                <span className="m">{areaMeta(a)}</span>
              </span>
            </button>
          ))}
          <button className="area add" onClick={() => setEditing('new')}><Icon name="plus" width={2.2} />{t('New area')}</button>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="group-label">{t('Channels')}</h2>
        <div className="list">
          <div className="setting">
            <div className="txt"><span className="t" id="st-push">{t('Push notifications')}</span><span className="d">{pushNote}</span></div>
            <Switch on={s.pushEnabled && perm === 'granted'} onChange={togglePush} labelledBy="st-push" disabled={!notificationsSupported() || perm === 'denied'} />
          </div>
          <div className="setting">
            <div className="txt"><span className="t">{t('When Wingman is closed')}</span><span className="d">{bgText}</span></div>
            {bgOn ? <span className="icon-muted" style={{ color: 'var(--ok)' }}><Icon name="check" size={22} width={2.4} label={t('On')} /></span>
              : server.available && perm === 'granted' && s.pushEnabled && <button className="btn small" onClick={() => void enableBackgroundPush()}>{t('Connect')}</button>}
          </div>
          <div className="setting wrap">
            <div className="txt" style={{ flexBasis: 'auto', flex: 1 }}>
              <span className="t" id="st-email">{t('Email')}</span>
              <span className="d">{server.email ? t('For reminders set to “Email”') : t('Needs the email service set up on the server')}</span>
            </div>
            <Switch on={s.emailEnabled && server.email} onChange={(v) => actions.updateSettings({ emailEnabled: v })} labelledBy="st-email" disabled={!server.email} />
            {s.emailEnabled && server.email && (
              <input className="input" type="email" aria-label={t('Email address')} placeholder="you@example.com" value={s.email} autoComplete="email"
                style={{ borderColor: s.email && !emailValid ? 'var(--danger)' : undefined }}
                onChange={(e) => actions.updateSettings({ email: e.target.value })} onBlur={() => void syncNow()} />
            )}
          </div>
          <div className="setting">
            <div className="txt"><span className="t">{t('Alarm')}</span><span className="d">{t('Full screen with sound while Wingman is open')}</span></div>
            <button className="btn small" onClick={onTestAlarm}>{t('Test')}</button>
          </div>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="group-label">{t('Daily routine')}</h2>
        <div className="list">
          <TimeRow label={t('Morning brief')} desc={t('Your plan for the day')} value={s.morningBrief} onChange={(v) => actions.updateSettings({ morningBrief: v })} />
          <TimeRow label={t('Evening recap')} desc={t('What\'s done, what\'s left')} value={s.eveningRecap} onChange={(v) => actions.updateSettings({ eveningRecap: v })} />
          <div className="setting wrap">
            <div className="txt"><span className="t">{t('Quiet hours')}</span><span className="d">{t('No notifications. Alarms still ring.')}</span></div>
            <input type="time" className="time-input" aria-label={t('Quiet hours start')} value={s.quietStart} onChange={(e) => actions.updateSettings({ quietStart: e.target.value })} />
            <input type="time" className="time-input" aria-label={t('Quiet hours end')} value={s.quietEnd} onChange={(e) => actions.updateSettings({ quietEnd: e.target.value })} />
          </div>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="group-label">{t('Planning')}</h2>
        <div className="list">
          <div className="setting wrap">
            <div className="txt"><span className="t">{t('My day runs')}</span><span className="d">{t('Plan with Wingman only suggests times in this window')}</span></div>
            <input type="time" className="time-input" aria-label={t('Day start')} value={s.dayStart} onChange={(e) => actions.updateSettings({ dayStart: e.target.value })} />
            <input type="time" className="time-input" aria-label={t('Day end')} value={s.dayEnd} onChange={(e) => actions.updateSettings({ dayEnd: e.target.value })} />
          </div>
          <div className="setting">
            <div className="txt"><span className="t">{t('Breathing room')}</span><span className="d">{t('Gap kept between items')}</span></div>
            <select className="time-input" aria-label={t('Breathing room')} value={s.bufferMin} onChange={(e) => actions.updateSettings({ bufferMin: Number(e.target.value) })}>
              {[0, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{t('{n} min', { n: m })}</option>)}
            </select>
          </div>
        </div>
      </section>

      <SyncSection storage={server.storage} checking={server.available === null} />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="group-label">{t('What Wingman has learned')}</h2>
        {(() => {
          const lines = insightLines(history, areas);
          const timed = history.filter((c) => c.actualMin).length;
          return (
            <>
              {lines.length ? <ul className="learned">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
                : <p className="note">{t('Nothing yet. Tick off tasks, and use “Start focus timer” on a task to teach Wingman how long things really take. Plan with Wingman then picks your best hours and pads tasks that usually run over.')}</p>}
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{tn(history.length, '{n} finished task', '{n} finished tasks')} · {t('{n} timed', { n: timed })}</span>
              {history.length > 0 && <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => confirm(t('Forget everything Wingman has learned?')) && actions.resetLearning()}>{t('Reset learning')}</button>}
            </>
          );
        })()}
      </section>

      <p className="note">
        <strong>{t('Install Wingman:')}</strong> {t('on iPhone, open this page in Safari → Share → Add to Home Screen. On Android/Chrome, use “Install app”. Your data stays on this device. With the app closed, reminders and alarms arrive as notifications from the Wingman server (iPhone: only after adding to Home Screen, iOS 16.4+).')}
      </p>

      <button className="btn" style={{ color: 'var(--danger)' }} onClick={() => {
        if (confirm(t('Erase all items? Life areas and settings stay.'))) for (const i of items) actions.deleteItem(i.id);
      }}>{t('Erase all items')}</button>

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', margin: 0 }}>{t('Version {v}', { v: __BUILD_ID__ })}</p>

      {editing && <AreaSheet area={editing === 'new' ? null : editing} canDelete={areas.length > 1} onClose={() => setEditing(null)} />}
    </main>
  );
}

function ago(ms: number | null) {
  if (!ms) return t('not yet');
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? t('just now') : m < 60 ? t('{n} min ago', { n: m }) : t('{n} h ago', { n: Math.round(m / 60) });
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
    setMsg(t('Backup downloaded. Keep it somewhere safe, like iCloud Drive or email.'));
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = readBackup(await file.text());
      commit(merge(getState(), data));
      setMsg(t('Restored {n} items from the backup (combined with what was already here).', { n: data.items.length }));
    } catch (e) {
      setMsg(t((e as Error).message));
    }
  };

  const share = async () => {
    const url = syncLink(link!.code);
    try {
      if (navigator.share) await navigator.share({ title: t('Wingman sync link'), text: t('Open this on your other device to sync Wingman'), url });
      else {
        await navigator.clipboard.writeText(url);
        setMsg(t('Link copied. Open it on your other device.'));
      }
    } catch {
      // Share sheet dismissed.
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 className="group-label">{t('Sync & backup')}</h2>
      <div className="list">
        {checking ? (
          <div className="setting"><div className="txt"><span className="t">{t('Sync between devices')}</span><span className="d">{t('Checking…')}</span></div></div>
        ) : !storage ? (
          <div className="setting"><div className="txt"><span className="t">{t('Sync between devices')}</span><span className="d">{t('Works once Wingman is hosted with its server (see the hosting guide). Backups below work anyway.')}</span></div></div>
        ) : link ? (
          <>
            <div className="setting">
              <div className="txt">
                <span className="t">{t('Sync is on')}</span>
                <span className="d" aria-live="polite">{sync.busy ? t('Syncing…') : sync.error ? t(sync.error) : t('Synced {ago} · end-to-end encrypted', { ago: ago(link.lastSync) })}</span>
              </div>
              <button className="btn small" onClick={() => void syncVault()} disabled={sync.busy}>{t('Sync now')}</button>
            </div>
            <div className="setting wrap">
              <div className="txt"><span className="t">{t('Add another device')}</span><span className="d">{t('Open the link on it, or type the code in Settings → Sync on that device. Anyone with the code can see your data, so keep it private.')}</span></div>
              <code style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.04em', overflowWrap: 'anywhere' }}>{reveal ? formatCode(link.code) : `${formatCode(link.code).slice(0, 4)}-••••-••••-…`}</code>
              <div className="btn-row" style={{ width: '100%' }}>
                <button className="btn small" onClick={() => setReveal((r) => !r)}>{reveal ? t('Hide code') : t('Show code')}</button>
                <button className="btn small primary" onClick={() => void share()}>{t('Share link')}</button>
              </div>
            </div>
            <div className="setting">
              <div className="txt"><span className="t">{t('Stop syncing this device')}</span><span className="d">{t('Your data stays here; other devices keep theirs.')}</span></div>
              <button className="btn small" style={{ color: 'var(--danger)' }} onClick={() => confirm(t('Stop syncing on this device?')) && stopSync()}>{t('Stop')}</button>
            </div>
          </>
        ) : joining ? (
          <div className="setting wrap">
            <div className="txt"><span className="t">{t('Enter your sync code')}</span><span className="d">{t('Find it on your other device under Settings → Sync & backup → Show code.')}</span></div>
            <input className="input" aria-label={t('Sync code')} placeholder="ABCD-EFGH-…" value={code} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} />
            {sync.error && <span style={{ fontSize: 13, color: 'var(--danger)' }}>{t(sync.error)}</span>}
            <div className="btn-row" style={{ width: '100%' }}>
              <button className="btn small" onClick={() => setJoining(false)}>{t('Cancel')}</button>
              <button className="btn small primary" disabled={sync.busy} onClick={async () => { if (await linkWithCode(code)) { setJoining(false); setCode(''); } }}>{sync.busy ? t('Linking…') : t('Link this device')}</button>
            </div>
          </div>
        ) : (
          <div className="setting wrap">
            <div className="txt"><span className="t">{t('Sync between devices')}</span><span className="d">{t('Use Wingman on your phone and computer with the same data. Encrypted on your device; the server can\'t read it.')}</span></div>
            <div className="btn-row" style={{ width: '100%' }}>
              <button className="btn small" onClick={() => setJoining(true)}>{t('I have a code')}</button>
              <button className="btn small primary" disabled={sync.busy} onClick={() => void enableSync()}>{t('Turn on sync')}</button>
            </div>
            {sync.error && <span style={{ fontSize: 13, color: 'var(--danger)' }}>{t(sync.error)}</span>}
          </div>
        )}
        <div className="setting wrap">
          <div className="txt"><span className="t">{t('Backup file')}</span><span className="d">{t('Save everything to a file, or bring a backup back. Restoring combines it with what\'s here.')}</span></div>
          <div className="btn-row" style={{ width: '100%' }}>
            <label className="btn small" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              {t('Restore')}
              <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <button className="btn small primary" onClick={download}>{t('Download backup')}</button>
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
    <Sheet label={area ? t('Edit life area') : t('New life area')} onClose={onClose}>
      <h1 style={{ fontSize: 24 }}>{area ? t('Edit area') : t('New area')}</h1>
      <div className="field">
        <label htmlFor="ar-name">{t('Name')}</label>
        <input id="ar-name" className="input big" value={name} placeholder={t('e.g. Side project, Pets, Travel')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
      <div className="field">
        <span className="label" id="ar-color">{t('Color')}</span>
        <div className="swatches" role="group" aria-labelledby="ar-color">
          {AREA_COLORS.map((c) => <button key={c} className="swatch-btn" style={{ background: c }} aria-pressed={c === color} aria-label={t('Color {c}', { c })} onClick={() => setColor(c)} />)}
        </div>
      </div>
      <div className="btn-row">
        {area && canDelete
          ? <button className="btn" style={{ color: 'var(--danger)' }} onClick={() => { actions.deleteArea(area.id); onClose(); }}>{t('Delete')}</button>
          : <button className="btn" onClick={onClose}>{t('Cancel')}</button>}
        <button className="btn primary grow" disabled={!name.trim()} style={{ opacity: name.trim() ? 1 : 0.5 }} onClick={save}>{t('Save')}</button>
      </div>
      {area && canDelete && <span style={{ fontSize: 13, color: 'var(--muted-2)' }}>{t('Deleting moves its items to your first area.')}</span>}
    </Sheet>
  );
}
