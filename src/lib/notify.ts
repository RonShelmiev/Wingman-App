// System notifications, alarm sound and vibration.

export async function registerServiceWorker() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch {
      // Offline support is a nice-to-have.
    }
  }
}

export const notificationsSupported = () => typeof Notification !== 'undefined';
export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'denied');

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  return Notification.requestPermission();
}

export async function showNotification(title: string, body: string, tag: string, requireInteraction = false) {
  if (notificationPermission() !== 'granted') return;
  const opts: NotificationOptions = { body, tag, icon: '/icon.svg', badge: '/icon.svg', requireInteraction };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return void (await reg.showNotification(title, opts));
  } catch {
    // Fall through to a page notification.
  }
  new Notification(title, opts);
}

let ctx: AudioContext | null = null;
let timer: number | null = null;

/** Repeating two-tone beep until stopAlarmSound(). Uses Web Audio, so no sound file is needed. */
export function startAlarmSound() {
  stopAlarmSound();
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    return;
  }
  const beep = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 0.25, 0.5].forEach((offset, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'square';
      osc.frequency.value = i === 1 ? 1046 : 880;
      gain.gain.setValueAtTime(0.0001, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, t + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.2);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.22);
    });
    navigator.vibrate?.([300, 150, 300]);
  };
  beep();
  timer = window.setInterval(beep, 1500);
}

export function stopAlarmSound() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  navigator.vibrate?.(0);
}

/** Browsers only allow sound after a user gesture; call this from any tap to unlock audio early. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    // No audio available.
  }
}
