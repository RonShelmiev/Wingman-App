# Hosting Wingman on Vercel — step by step

About 20–30 minutes, all free. At the end Wingman is installed on your iPhone and reminders arrive even when the app is closed.

You'll set up four free accounts/services:

| Service | What it does for Wingman | Cost |
|---|---|---|
| **Vercel** | Hosts the app and its small server (`/api`) | Free (Hobby) |
| **Upstash Redis** (inside Vercel) | Remembers your upcoming reminders on the server | Free tier |
| **cron-job.org** | Taps the server every minute: "anything due?" | Free |
| **Resend** *(optional)* | Sends email reminders | Free (100/day) |

> Why cron-job.org? Vercel's free plan only allows its built-in scheduler to run once a day. Reminders need a check every minute, so an outside scheduler does the ticking.

---

## Step 0 — Pick the branch

The app lives on the branch `claude/wingman-designs`. Vercel deploys `main` as your live site by default. Either:
- **Recommended:** merge the branch into `main` (ask Claude to open a pull request, then click **Merge** on GitHub), or
- after Step 2, go to Vercel → your project → **Settings → Git → Production Branch** and enter `claude/wingman-designs`.

## Step 1 — Make your secret keys

Wingman needs a key pair to sign push notifications (called VAPID keys) and one password for the minute-ticker.

On a computer with Node.js:

```bash
npx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**. Keep this window open, or paste them into a note.

Then make a random password for the ticker (any long random text works), e.g.:

```bash
openssl rand -hex 24
```

This is your **CRON_SECRET**.

> No computer handy? Ask Claude to generate both for you.
> Keep the private key and CRON_SECRET secret: never put them in the code or share them publicly.

## Step 2 — Put the app on Vercel

1. Go to **vercel.com** → **Sign Up** → **Continue with GitHub** (use the GitHub account that owns `Wingman-App`).
2. Click **Add New… → Project**.
3. Find **Wingman-App** → **Import**. If it's not listed, click **Adjust GitHub App Permissions** and give Vercel access to the repo.
4. Vercel detects **Vite** automatically. Leave the build settings as they are.
5. Click **Deploy**. After about a minute you get a link like `https://wingman-app-xyz.vercel.app`. The app already works there, but background reminders aren't connected yet.

## Step 3 — Add the database (Upstash Redis)

1. In your Vercel project, open the **Storage** tab.
2. Click **Create Database** (or **Browse Marketplace**) → choose **Upstash** → **Redis** → **Continue**.
3. Pick the free plan and a region close to you → **Create**.
4. When asked, **connect it to the Wingman project** for all environments.

This adds the database settings automatically (variables named `KV_REST_API_URL` / `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`; Wingman accepts either).

## Step 4 — Add your keys to Vercel

Project → **Settings → Environment Variables**. Add each of these (Environment: all):

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | the Public Key from Step 1 |
| `VAPID_PRIVATE_KEY` | the Private Key from Step 1 |
| `VAPID_SUBJECT` | `mailto:` followed by your email, e.g. `mailto:you@example.com` |
| `CRON_SECRET` | the random password from Step 1 |

**Optional, for email reminders:**
1. Sign up at **resend.com** → **API Keys → Create API Key** → copy it.
2. Add to Vercel:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | your Resend key |
| `EMAIL_FROM` | `Wingman <onboarding@resend.dev>` |

> With `onboarding@resend.dev`, Resend only delivers to the email address you signed up to Resend with. That's fine for personal use. To email other addresses, verify your own domain in Resend and use e.g. `Wingman <wingman@yourdomain.com>`.

## Step 5 — Redeploy

Environment variables only apply to new deployments. Go to **Deployments** → on the latest one click **⋯ → Redeploy**.

Check it worked: open `https://YOUR-APP.vercel.app/api/config`. You should see something like:

```json
{"publicKey":"BO...","email":true,"storage":true}
```

`storage: false` means Step 3 isn't connected; `publicKey: null` means Step 4 is missing or you didn't redeploy.

## Step 6 — Start the every-minute ticker (cron-job.org)

1. Sign up at **cron-job.org** (free).
2. **Cronjobs → Create cronjob**.
3. **Title:** `Wingman tick` · **URL:** `https://YOUR-APP.vercel.app/api/tick`
4. **Execution schedule:** **Every 1 minute**.
5. Open **Advanced** → **Headers** → add one:
   - Key: `Authorization`
   - Value: `Bearer YOUR_CRON_SECRET` (the word Bearer, a space, then your secret)
6. **Create**, then use **Test run**. A good result is status **200** with a body like `{"due":0,"sent":0,...}`. **401** means the header doesn't match `CRON_SECRET`.

## Step 7 — Install on your iPhone

1. Open your Vercel link in **Safari** (it must be Safari).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open **Wingman from the Home Screen icon** (web push on iPhone only works from the installed app, iOS 16.4 or newer).
4. Go to **Settings** → turn on **Push notifications** → **Allow**.
5. **When Wingman is closed** should say **On · synced …**. If it says "Tap Connect", tap **Connect**.

Android/Chrome: open the link → menu → **Install app**, then do steps 4–5.

## Step 8 — Test it

1. In Wingman, tap **+** and type something like `Test reminder at 3:42pm` (use a time ~3 minutes from now).
2. Close the app completely (swipe it away).
3. Within a minute of that time you should get the notification. Try **Remind me in 10 min** on it to test snoozing.
4. Do the same with `Wake me up at …` to test an alarm notification.

---

## Step 9 (optional) — Sync your phone and computer

No extra setup needed; sync uses the same database.
1. On your iPhone: **Settings → Sync & backup → Turn on sync**.
2. Tap **Share link** and send it to yourself (AirDrop, Messages, email).
3. Open the link on your computer and confirm. Both now share the same data, end-to-end encrypted.

Also tap **Download backup** once in a while and keep the file in iCloud Drive: it works even without the server.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Works once Wingman is hosted with its server" | `/api/config` isn't reachable or keys are missing. Re-check Steps 4–5. |
| "Server storage is not set up yet" | Connect Upstash to the project (Step 3), then redeploy. |
| No notifications on iPhone | Open Wingman from the Home Screen icon, not Safari. Check iPhone **Settings → Notifications → Wingman** is allowed and Focus mode isn't hiding it. |
| Notifications arrive a minute or two late | Normal: the ticker runs once a minute, and phones may delay delivery a little to save battery. |
| cron-job.org shows 401 | The header must be exactly `Authorization: Bearer <CRON_SECRET>`. |
| Sync says it couldn't unlock | The code was typed wrong. Use Share link instead, or check the code on the first device. |
| Emails don't arrive | Check `email: true` at `/api/config`, turn on Email in Wingman Settings with your Resend sign-up address, and check spam. |

## How it works (short version)

Your phone keeps the real data. Whenever something changes, Wingman sends the server a list of the reminders coming up in the next 14 days. Every minute, cron-job.org calls `/api/tick`, and the server sends a push notification (and email, if chosen) for anything due. If the app is open, it shows the reminder itself and tells the server so you don't get it twice. Open Wingman at least once every two weeks so repeating reminders keep being scheduled.
