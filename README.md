# Wingman

A real-life assistant app: plan your day, set reminders and alarms, see your time clearly, and get notified so nothing slips.

## Status

- **Phase 1 — Design** ✅ 8 screens. Live canvas: https://claude.ai/artifact/A8NuoAqrKRj9tuwXkK9r1r (private until shared from its Share menu)
- **Phase 2 — App logic** ✅ working installable web app (PWA): Today, Week, Reminders, Settings, Quick add, Plan with Wingman, alarms.
- **Phase 3 — Background delivery** ✅ push notifications (and optional email) while the app is closed, via a small server on Vercel.
- **Phase 4 — Your main planner** ✅ yearly/monthly/weekday repeats (birthdays!), backup & encrypted sync between devices, smarter planning that learns from you, dark mode.
- **Hosting** 📖 step-by-step guide: [`docs/HOSTING_VERCEL.md`](docs/HOSTING_VERCEL.md)

Docs: [`docs/DESIGN.md`](docs/DESIGN.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`CHANGELOG.md`](CHANGELOG.md) (every push is documented)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (also serves /api with in-memory storage, so sync works locally)
npm test           # unit tests (parser, scheduler, planner, server)
npm run build      # production build in dist/
npm run preview    # serve the build (service worker + install enabled)
```

## Repository layout

```
src/lib/          Logic: types, dates, parser, scheduler, planner, store, notifications
src/screens/      Today, Week, Reminders, Settings, QuickAdd, Plan, AlarmOverlay
src/components/   Icons, item row, bottom sheet
public/           PWA manifest, service worker (push + offline), icon
api/              Vercel serverless routes: config, sync, tick, snooze, ack, vault
server/           Server logic, Redis/in-memory storage, push + email senders
design/project/   Design canvas sources (.dc.html per screen + canvas.json)
docs/             Design and architecture notes
```
