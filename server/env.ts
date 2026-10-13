import webpush from 'web-push';
import { Redis } from '@upstash/redis';
import type { Senders, Store } from './core.js';
import { MemoryStore } from './memoryStore.js';
import { RedisStore } from './redisStore.js';
import { UrlRedisStore } from './urlRedisStore.js';

const env = (k: string) => process.env[k]?.trim() || undefined;

let store: Store | null = null;
export function getStore(): Store {
  if (store) return store;
  // Vercel's Upstash integration sets KV_REST_API_*; a direct Upstash database sets UPSTASH_REDIS_REST_*.
  const url = env('KV_REST_API_URL') ?? env('UPSTASH_REDIS_REST_URL');
  const token = env('KV_REST_API_TOKEN') ?? env('UPSTASH_REDIS_REST_TOKEN');
  // Vercel's "Redis" integration (and most other Redis hosts) set a plain REDIS_URL instead.
  const redisUrl = env('REDIS_URL');
  store = url && token ? new RedisStore(new Redis({ url, token })) : redisUrl ? new UrlRedisStore(redisUrl) : new MemoryStore();
  return store;
}

export const storageConfigured = () =>
  env('WINGMAN_DEV_MEMORY') === '1' ||
  !!((env('KV_REST_API_URL') ?? env('UPSTASH_REDIS_REST_URL')) && (env('KV_REST_API_TOKEN') ?? env('UPSTASH_REDIS_REST_TOKEN'))) ||
  !!env('REDIS_URL');
export const vapidPublicKey = () => env('VAPID_PUBLIC_KEY') ?? null;
export const emailConfigured = () => !!(env('RESEND_API_KEY') && env('EMAIL_FROM'));

export function getSenders(): Senders {
  const pub = env('VAPID_PUBLIC_KEY');
  const priv = env('VAPID_PRIVATE_KEY');
  if (pub && priv) webpush.setVapidDetails(env('VAPID_SUBJECT') ?? 'mailto:admin@example.com', pub, priv);
  return {
    async push(sub, payload) {
      if (!pub || !priv) return 'error';
      try {
        // Urgency "high" and a short TTL: a reminder that arrives an hour late is useless.
        await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 900, urgency: 'high' });
        return 'ok';
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        return code === 404 || code === 410 ? 'gone' : 'error';
      }
    },
    email: emailConfigured()
      ? async (to, subject, text) => {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: env('EMAIL_FROM'), to, subject: `Wingman: ${subject}`, text }),
          });
          return res.ok;
        }
      : null,
  };
}

/** Constant-time-ish check of the cron secret from a Bearer header or ?secret= query. */
export function cronAuthorized(req: Request): boolean {
  const secret = env('CRON_SECRET');
  if (!secret) return false;
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? new URL(req.url).searchParams.get('secret') ?? '';
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
