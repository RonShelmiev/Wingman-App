# Wingman — Architecture

React 19 + TypeScript + Vite, built as a PWA. Your data lives in the browser (`localStorage`, key `wingman:v1`). A small server on Vercel only holds the next 14 days of reminders so it can deliver them when the app is closed.

## Logic modules (`src/lib/`)

| Module | What it does |
|---|---|
| `types.ts` | `Item` (task / event / reminder), `Area`, `Settings`, repeat rules, notify channels (push, email, alarm, silent). |
| `dates.ts` | Local-time helpers. Dates are `YYYY-MM-DD`, times `HH:MM`. |
| `parse.ts` | Natural-language Quick add: dates (today, tomorrow, weekdays, "Oct 20", "in 3 days"), times (4:30pm, 16:30, noon, "at 6"), durations ("for 1 hour"), reminders ("remind me a day before"), alarms ("wake me up at 6:45"), repeats (daily, every Sunday, every 3 days), and a life-area guess from keywords. |
| `schedule.ts` | Which items happen on a day, repeats, per-occurrence done state, overdue items, reminder fire times, and `dueReminders()` (what should go off now, honouring snoozes and already-fired keys). |
| `planner.ts` | Plan with Wingman: fits untimed tasks into free gaps between fixed items, inside your day window, with breathing room. Overdue first, then longest first; earliest gap that fits. |
| `store.ts` | App state + persistence + actions; React hook `useStore()`. |
| `push.ts` | Builds the 14-day reminder schedule, keeps it synced to the server (debounced on every change, every 15 min, when back online), manages the push subscription, and acks reminders the app already showed. |
| `insights.ts` | Learning: durations from focus-timer sessions (per title, then per life area) and productive hours from when you tick things off. Feeds the planner and the Settings "learned" card. |
| `sync.ts` | Device sync rules (merge: newest change per item wins, deletions carry over, device-only settings stay local), sync codes, AES-GCM encryption, backup file format. |
| `syncEngine.ts` | Runs sync: download → decrypt → merge → encrypt → upload with version check; retries on conflicts; triggered on change, every 2 min, on focus and when back online. |
| `i18n.ts`, `he.ts` | Translations: English text is the key, `HE` holds Hebrew; `t()`/`tn()`; a test fails if any string lacks Hebrew. Dates/durations in `dates.ts` follow the language. |
| `parseHe.ts` | Hebrew Quick add (bounded by spaces/punctuation because JS `\b` doesn't see Hebrew letters). `parseQuick` picks it when the text contains Hebrew. |
| `itemActions.ts` | Tick, delete, move, postpone, save-edit — one place, so every screen behaves the same; wraps them in Undo and asks "just this one or all" for repeating items. |
| `undo.ts`, `ask.ts`, `celebrate.ts` | Undo bar state, the scope question (as a promise), and the all-done celebration trigger. |
| `notify.ts` | Service-worker registration, system notifications, alarm sound (Web Audio, no sound file) and vibration. |

## Reminder engine (`App.tsx`)

Every 5 seconds (and when the app returns to the foreground) the app asks `dueReminders()` what is due, marks each one fired, then:

- **Alarm** → full-screen ringing screen with looping sound + vibration + a system notification. Snooze re-arms it.
- **Push** (and **Email**, until email ships) → system notification + in-app banner, unless quiet hours.
- **Silent** → nothing.

It also sends the **morning brief** and **evening recap** once a day at the times set in Settings.

## Background delivery (server)

```
phone (Wingman app) ──POST /api/sync──▶ Vercel function ──▶ Upstash Redis
                                                     ▲
cron-job.org ──every minute──▶ /api/tick ────────────┘──▶ Web Push service ──▶ phone notification
                                                       └──▶ Resend (email, optional)
```

| Route | Purpose |
|---|---|
| `GET /api/config` | VAPID public key + whether storage and email are configured. |
| `POST /api/sync` | Replace this device's schedule (subscription, optional email, ≤500 reminders). |
| `GET/POST /api/tick` | Send everything due. Needs `Authorization: Bearer $CRON_SECRET`. Drops reminders >15 min late. |
| `POST /api/snooze` | From the notification's "Snooze" button: re-schedule in 10 min. |
| `POST /api/ack` | The open app already showed it, so don't push it. |
| `GET/PUT /api/vault` | Encrypted sync copy. `id` = SHA-256 of the sync code; `PUT` only succeeds if the version matches (compare-and-set via a Redis Lua script), otherwise 409 with the current copy. |

- Devices are identified by a random 24-byte ID generated on the phone (works as a bearer secret); no accounts.
- Logic is in `server/core.ts` behind a `Store` interface (`RedisStore` in production, `MemoryStore` in tests).
- Dead subscriptions (HTTP 404/410 from the push service) are cleared automatically; devices unseen for 60 days expire.
- The app ignores reminders more than 10 minutes old when it reopens (the server already delivered them), so alarms never ring late.

## Sync & backup

- **Sync code**: 32 characters (160 random bits), created on the device. The server stores only `SHA-256("wingman-vault:"+code)` as the id and an AES-GCM blob encrypted with a key derived from the code. It cannot read your data. Anyone with the code can, so it's shown masked.
- **Linking**: "Share link" opens `https://…/#sync=CODE` on the other device (the part after `#` is never sent to the server), or type the code.
- **Merging**: every item/area carries `updatedAt` (stamped centrally in the store); deletions leave a tombstone for 60 days; settings sync by recency except `pushEnabled` and `theme` (per device); learning history and reminder bookkeeping are unioned.
- **Backup file**: Settings → Download backup / Restore (restore merges, never wipes). Works without the server.

## Smarter planning

- Ticking a task off records a completion (time of day, planned minutes). The focus timer (edit sheet → Start focus timer) also records actual minutes.
- After 2 timed sessions of the same task, Quick add and the planner use your real duration; after 3 in a life area, tasks there are padded if you usually run over (0.6–2×).
- After 8 completions, Plan with Wingman prefers the hours you usually get things done (per life area once it has 5+), but overdue tasks still go first.

## Repeating items: "just this one"

Each repeating item can carry `skipDates`. Deleting one occurrence adds its date; changing one occurrence adds its date **and** creates a one-off copy with the change. "All of them" edits the series itself.

## Known limits (honest)

- With the app closed, delivery depends on the server and the minute ticker; expect up to ~1 minute delay. iPhone supports web push only for apps added to the Home Screen (iOS 16.4+).
- With the app closed, an alarm arrives as a persistent notification with the phone's notification sound, not a ringing full-screen alarm.
- The server schedules 14 days ahead; open the app at least once every two weeks.
- A web alarm can't override the phone's silent switch the way the built-in Clock app can.
- Sync merges whole items: if the same item is edited on two devices before they sync, the later edit wins.
- The Redis compare-and-set script is tested only through the in-memory store here; it runs for real on Upstash after deployment.

## Tests

`npm test` — parser, scheduling/repeats/reminders/quiet hours, planner, schedule builder (`src/lib/*.test.ts`), and server logic + API routes + push encryption (`server/*.test.ts`).
