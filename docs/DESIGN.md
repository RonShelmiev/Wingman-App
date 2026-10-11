# Wingman — Design

Eight phone screens (390 × 844). Live canvas: https://claude.ai/artifact/A8NuoAqrKRj9tuwXkK9r1r
Sources: `design/project/*.dc.html`.

## Look

| Token | Value | Use |
|---|---|---|
| Ground | `#F4F5F7` | App background |
| Ink | `#141826` | Text, primary dark surfaces |
| Muted | `#5B6175` | Secondary text |
| Accent | `#D24B1F` | Primary action (+ button, "Add to my day"), "Now" state |
| Work | `#2F55D4` | Life area |
| Home | `#B4690E` | Life area |
| Health | `#17805A` | Life area, "done" checks |
| Money | `#0E7C86` | Life area |
| Family & friends | `#C2367A` | Life area |
| Learning | `#4B5563` | Life area |
| Errands | `#7044D6` | Life area |

Type: **Bricolage Grotesque** (headings) + **DM Sans** (body). Rounded cards (16–24 px), touch targets ≥ 44 px.

## Screens

1. **Today** — greeting, a progress ring (tasks done / planned), an "Up next" card with a countdown, and a colour-coded timeline. The current item is outlined with a NOW badge; finished items fade and get a check.
2. **Week** — a 7-day strip where each day has a load bar (orange when > 80 % booked, so overloaded days pop), a "where your time goes" category split, and the selected day's items.
3. **Reminders** — filter (All / Repeating / Done) and groups: Overdue (highlighted, with Snooze), Today, Upcoming. Each row shows time, repeat rule and the delivery channel icon (push / email).
4. **Quick add** — a bottom sheet with one natural-language field ("Dentist Thursday 4:30pm remind me a day before"). Wingman shows how it understood it as editable chips (date, time, reminder offset), plus category and "Notify me by" (Push / Email / Silent).
5. **Notifications** — preview of how a push looks, channel switches (Push, Email), daily routine (Morning brief 07:30, Evening recap 21:00) and Quiet hours.

6. **Alarm ringing** (round 2) — full-screen, dark, big clock, pulsing halo. Snooze 5 / 10 / 30, Stop, or Stop & mark done.
7. **Plan with Wingman** (round 2) — untimed and overdue tasks are slotted into free gaps (dashed blue = suggestion), each with a reason. Keep/skip each, then Accept.
8. **Life areas** (round 2) — the fixed four categories became seven editable life areas (Work, Home, Health, Money, Family & friends, Learning, Errands) plus "New area".

Quick add also gained an **Alarm** option under "Notify me by".

Navigation: bottom bar — Today · Week · (+) · Reminders · Settings. Links between artboards work in the canvas's Play mode.

## Dark mode

All colors are theme tokens on `:root` with a dark set (deep navy `#0E1120` ground, `#181C2C` cards, light text). **Settings → Appearance: Auto / Light / Dark** (Auto follows the phone). The alarm screen is dark in both.

## Notifications approach (proposed)

- **Push notifications** are the primary channel (Web Push for a PWA, or native push if we go native).
- **Email** is optional, per reminder, plus the morning brief / evening recap. The app sends email *to* the user through a mail service; it does not need to read the Gmail inbox, so no Gmail access is required.

## Decisions (round 2 feedback)

- Platform: installable web app (PWA) — one codebase for phone and computer.
- Categories → editable **life areas**, so Wingman covers all of life, not just work.
- Plan with Wingman is in v1.
- Colors approved. Alarm added, like iPhone Reminders/Clock.
