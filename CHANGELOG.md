# Changelog

Every push is documented here: what changed and why. Newest first.

## 2026-10-11 — Notifications when the app is closed (Phase 3) + Vercel guide

**Added**
- Small server as Vercel functions (`api/`): `config`, `sync`, `tick`, `snooze`, `ack`, with logic in `server/` and Upstash Redis storage.
- The app keeps the server updated with the next 14 days of reminders, the morning brief and the evening recap (respecting quiet hours, push on/off and done items).
- Service worker shows server pushes even when Wingman is closed; alarms stay on screen until dismissed; a "Snooze 10 min" button works right from the notification.
- Optional email reminders through Resend; Settings has an email switch and address field.
- Settings shows the status of "When Wingman is closed" (checking / connect / on · synced).
- `vercel.json`, and `docs/HOSTING_VERCEL.md`, a step-by-step hosting tutorial (Vercel + Upstash + cron-job.org + optional Resend + iPhone install).

**Changed**
- If the app reopens after a reminder was due more than 10 minutes ago, it no longer rings or notifies late (the server already delivered it); the app tells the server about reminders it showed itself so you don't get them twice.

**Fixed during development**
- Copies of sent reminders (kept so Snooze works) would have been sent again a day later; they're now stored outside the schedule.

**Verified**
- `npm test` 29/29 (new: server delivery, stale/duplicate handling, snooze, dead subscriptions, email, API auth, real VAPID-signed + encrypted push request, schedule builder), typecheck and build clean, browser regression run with no console errors.
- Not verified here: delivery through a real phone's push service. That needs the deployed app (Step 8 of the guide tests it).

## 2026-10-11 — Design round 2 + working app (Phase 2)

**Design (canvas updated)**
- New screens: Alarm ringing, Plan with Wingman, Life areas.
- Categories replaced by seven editable life areas; Quick add gains an "Alarm" option.

**App (new)**
- Installable web app (PWA): React + TypeScript + Vite, manifest, offline service worker.
- Screens: Today (progress ring, up next, overdue, timeline), Week (load bars, time split, day list), Reminders (overdue / today / upcoming / someday; repeating and done filters), Settings (name, life areas editor, channels, daily routine, quiet hours, planning window).
- Quick add with natural-language parsing; the same sheet edits and deletes items.
- Plan with Wingman: suggests times for untimed and overdue tasks; keep or skip each, then accept.
- Alarms: full-screen ringing with sound + vibration, snooze 5/10/30, stop, stop & mark done; "Test" button in Settings.
- Reminder engine with push notifications, quiet hours, morning brief and evening recap.
- "Try a sample day" button for a quick tour.
- 17 unit tests (parser, scheduler, planner).

**Fixed during testing**
- "Wake me up at 6:45am" produced an empty title and could not be saved; it now saves as "Wake up".
- Settings rows with two time pickers were cramped on phones; times now wrap below the label.

**Verified**
- `npm test` 17/17, `npm run build` clean, and a scripted browser run: sample day → plan → add alarm → alarm rang on time → snooze → rang again 10 min later, no console errors.

**Next (Phase 3)**
- Reminders and email while the app is fully closed (Web Push server + email sender).

## 2026-10-11 — Design v1 (Phase 1)

**Added**
- Design canvas with 5 core screens: Today, Week, Reminders, Quick add, Notifications (`design/project/`).
- `docs/DESIGN.md` — colours, typography, screen-by-screen notes, proposed notification approach and open questions.
- README with project status and layout.

**Why**
- Agreed order of work: designs first, logic after feedback. No app code yet.

**Next**
- Collect feedback on the designs, pick a platform, then start the app logic (data model, scheduling, reminders, notifications).
