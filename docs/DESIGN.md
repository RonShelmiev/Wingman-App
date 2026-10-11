# Wingman — Design v1

Five core phone screens (390 × 844). Live canvas: https://claude.ai/artifact/A8NuoAqrKRj9tuwXkK9r1r
Sources: `design/project/*.dc.html`.

## Look

| Token | Value | Use |
|---|---|---|
| Ground | `#F4F5F7` | App background |
| Ink | `#141826` | Text, primary dark surfaces |
| Muted | `#5B6175` | Secondary text |
| Accent | `#D24B1F` | Primary action (+ button, "Add to my day"), "Now" state |
| Work | `#2F55D4` | Category |
| Personal | `#D24B1F` | Category |
| Health | `#17805A` | Category, "done" checks |
| Errands | `#7044D6` | Category |

Type: **Bricolage Grotesque** (headings) + **DM Sans** (body). Rounded cards (16–24 px), touch targets ≥ 44 px.

## Screens

1. **Today** — greeting, a progress ring (tasks done / planned), an "Up next" card with a countdown, and a colour-coded timeline. The current item is outlined with a NOW badge; finished items fade and get a check.
2. **Week** — a 7-day strip where each day has a load bar (orange when > 80 % booked, so overloaded days pop), a "where your time goes" category split, and the selected day's items.
3. **Reminders** — filter (All / Repeating / Done) and groups: Overdue (highlighted, with Snooze), Today, Upcoming. Each row shows time, repeat rule and the delivery channel icon (push / email).
4. **Quick add** — a bottom sheet with one natural-language field ("Dentist Thursday 4:30pm remind me a day before"). Wingman shows how it understood it as editable chips (date, time, reminder offset), plus category and "Notify me by" (Push / Email / Silent).
5. **Notifications** — preview of how a push looks, channel switches (Push, Email), daily routine (Morning brief 07:30, Evening recap 21:00) and Quiet hours.

Navigation: bottom bar — Today · Week · (+) · Reminders · Settings. Links between artboards work in the canvas's Play mode.

## Notifications approach (proposed)

- **Push notifications** are the primary channel (Web Push for a PWA, or native push if we go native).
- **Email** is optional, per reminder, plus the morning brief / evening recap. The app sends email *to* the user through a mail service; it does not need to read the Gmail inbox, so no Gmail access is required.

## Open questions for feedback

- Platform: installable web app (PWA, works on phone + desktop) vs native iOS/Android?
- Do the four categories fit, or should they be user-defined?
- Should Wingman auto-suggest time slots ("Plan with Wingman") in v1, or later?
