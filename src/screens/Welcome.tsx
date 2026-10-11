import { useState } from 'react';
import { AREA_NAMES, actions, useStore } from '../lib/store';
import { requestNotificationPermission, notificationsSupported } from '../lib/notify';
import { enableBackgroundPush, getServerStatus } from '../lib/push';
import { t } from '../lib/i18n';
import { AppMark, Icon } from '../components/Icon';

/** Three quick steps the first time Wingman opens. */
export function Welcome() {
  const settings = useStore((s) => s.settings);
  const areas = useStore((s) => s.areas);
  const [step, setStep] = useState(0);
  const [keep, setKeep] = useState<Set<string>>(() => new Set(areas.map((a) => a.id)));
  const [asked, setAsked] = useState(false);

  const finish = (sample: boolean) => {
    for (const a of areas) if (!keep.has(a.id) && keep.size > 0) actions.deleteArea(a.id);
    if (sample) actions.loadSample();
    actions.updateSettings({ onboarded: true });
  };

  return (
    <main className="welcome">
      <div className="welcome-dots" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className={i === step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <section className="welcome-step">
          <span className="welcome-logo"><AppMark size={40} /></span>
          <h1>{t('Welcome to Wingman')}</h1>
          <p>{t('Your day, reminders and alarms — all in one calm place.')}</p>
          <div className="field" style={{ width: '100%' }}>
            <span className="label" id="w-lang">{t('Language')}</span>
            <div className="seg" role="group" aria-labelledby="w-lang">
              <button aria-pressed={settings.language === 'en'} onClick={() => actions.setLanguage('en')}>English</button>
              <button aria-pressed={settings.language === 'he'} onClick={() => actions.setLanguage('he')}>עברית</button>
            </div>
          </div>
          <div className="field" style={{ width: '100%' }}>
            <label htmlFor="w-name">{t('What should Wingman call you?')}</label>
            <input id="w-name" className="input big" value={settings.name} autoComplete="given-name" placeholder={t('Your name')}
              onChange={(e) => actions.updateSettings({ name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && setStep(1)} />
          </div>
          <button className="btn primary welcome-next" onClick={() => setStep(1)}>{t('Continue')}</button>
        </section>
      )}

      {step === 1 && (
        <section className="welcome-step">
          <h1>{t('What do you look after?')}</h1>
          <p>{t('Pick your life areas. You can rename them or add more later.')}</p>
          <div className="chips" role="group" aria-label={t('Life areas')} style={{ justifyContent: 'center' }}>
            {areas.map((a) => (
              <button key={a.id} className="chip" aria-pressed={keep.has(a.id)} onClick={() => setKeep((s) => { const n = new Set(s); if (n.has(a.id)) { if (n.size > 1) n.delete(a.id); } else n.add(a.id); return n; })}>
                <span className="dot" style={{ background: a.color }} />{AREA_NAMES[settings.language][a.id] ?? a.name}
                {keep.has(a.id) && <Icon name="check" size={16} width={2.4} />}
              </button>
            ))}
          </div>
          <div className="btn-row welcome-next">
            <button className="btn" onClick={() => setStep(0)}>{t('Back')}</button>
            <button className="btn primary grow" onClick={() => setStep(2)}>{t('Continue')}</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="welcome-step">
          <span className="welcome-logo"><Icon name="bell" size={36} width={2} /></span>
          <h1>{t('Never miss a thing')}</h1>
          <p>{t('Allow notifications so Wingman can remind you and ring your alarms.')}</p>
          {notificationsSupported() ? (
            <button className="btn dark" style={{ width: '100%' }} disabled={asked} onClick={async () => {
              const p = await requestNotificationPermission();
              setAsked(true);
              if (p === 'granted' && getServerStatus().available) void enableBackgroundPush();
            }}>{asked ? t('Thanks!') : t('Allow notifications')}</button>
          ) : (
            <p className="note">{t('On iPhone, add Wingman to your Home Screen first (Share → Add to Home Screen), then allow notifications in Settings.')}</p>
          )}
          <div className="welcome-next" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            <button className="btn primary" onClick={() => finish(false)}>{t('Start planning')}</button>
            <button className="btn" onClick={() => finish(true)}>{t('Show me with a sample day')}</button>
          </div>
        </section>
      )}
    </main>
  );
}
