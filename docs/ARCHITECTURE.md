# Wingman — Architecture

React 19 + TypeScript + Vite, built as a PWA. No backend yet: all data lives in the browser (`localStorage`, key `wingman:v1`).

## Logic modules (`src/lib/`)

| Module | What it does |
|---|---|
| `types.ts` | `Item` (task / event / reminder), `Area`, `Settings`, repeat rules, notify channels (push, email, alarm, silent). |
| `dates.ts` | Local-time helpers. Dates are `YYYY-MM-DD`, times `HH:MM`. |
| `parse.ts` | Natural-language Quick add: dates (today, tomorrow, weekdays, "Oct 20", "in 3 days"), times (4:30pm, 16:30, noon, "at 6"), durations ("for 1 hour"), reminders ("remind me a day before"), alarms ("wake me up at 6:45"), repeats (daily, every Sunday, every 3 days), and a life-area guess from keywords. |
| `schedule.ts` | Which items happen on a day, repeats, per-occurrence done state, overdue items, reminder fire times, and `dueReminders()` (what should go off now, honouring snoozes and already-fired keys). |
| `planner.ts` | Plan with Wingman: fits untimed tasks into free gaps between fixed items, inside your day window, with breathing room. Overdue first, then longest first; earliest gap that fits. |
| `store.ts` | App state + persistence + actions; React hook `useStore()`. |
| `notify.ts` | Service-worker registration, system notifications, alarm sound (Web Audio, no sound file) and vibration. |

## Reminder engine (`App.tsx`)

Every 5 seconds (and when the app returns to the foreground) the app asks `dueReminders()` what is due, marks each one fired, then:

- **Alarm** → full-screen ringing screen with looping sound + vibration + a system notification. Snooze re-arms it.
- **Push** (and **Email**, until email ships) → system notification + in-app banner, unless quiet hours.
- **Silent** → nothing.

It also sends the **morning brief** and **evening recap** once a day at the times set in Settings.

## Known limits (honest)

- Reminders fire while Wingman is open or running in the background. With the app **fully closed**, a web app can't wake itself, so Phase 3 adds a small push server (Web Push) and an email sender. iPhone supports web push only for apps added to the Home Screen (iOS 16.4+).
- A web alarm can't override the phone's silent switch the way the built-in Clock app can.
- Data is per device until sync arrives.

## Tests

`npm test` — parser, scheduling/repeats/reminders/quiet hours, and planner (`src/lib/*.test.ts`).
