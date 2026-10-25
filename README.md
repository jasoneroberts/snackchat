# Snackchat

Log, rate and rank your snacks with friends. Snackchat is a web app (installable
on a phone's home screen) that runs entirely on Cloudflare.

## How it fits together

| Piece | Where | What it does |
| --- | --- | --- |
| Front end | `src/` (React + Vite) | The pages people see. Built into static files. |
| API | `worker/` (Hono on Cloudflare Workers) | Everything under `/api`: sign-up, log-in, snacks, check-ins, photos, profiles. |
| Shared | `shared/` | Snack types, sliders, points rules and API types used by both sides. |
| Database | D1 `snackchat-db`, schema in `migrations/` | Users, sessions, snacks, check-ins, groups, points. |
| Cache | KV `snackchat-cache` | Will hold cached leaderboards. |
| Photos | R2 `snackchat-photos` | Check-in photos, shrunk in the browser to 1600px JPEG before upload. |
| Bot check | Turnstile | Checked on sign-up and log-in. |

One Worker serves both: requests to `/api/*` run the Hono app in
`worker/index.ts`, and every other path is served from the built front end
(see `assets` in `wrangler.jsonc`).

## Sign-up and log-in

- **Invite codes.** The beta is invite-only. Each code in `invite_codes` has a
  number of uses. Share a link like `https://<app>/signup?invite=CODE`.
- **Turnstile.** The browser solves the check and sends a token; the Worker
  confirms it with Cloudflare before doing anything else.
- **Rate limits.** Sign-up, log-in and resend-verification allow 10 requests a
  minute per IP address.
- **Passwords** are hashed with PBKDF2-SHA256 (100,000 rounds, random salt);
  the plain password is never stored. See `worker/lib/crypto.ts`.
- **Sessions** are a random token in an HttpOnly cookie. The database keeps only
  the token's SHA-256 hash, so a database leak does not leak log-ins.
- **Email verification.** A one-time link (valid 24 hours) is emailed on
  sign-up. Until Snackchat has its own domain, `EMAIL_MODE` is `log`: the link
  is written to the Worker logs instead of being emailed.

## Check-ins

| Route | What it does |
| --- | --- |
| `GET /api/snacks?q=` | Search snacks (popular ones when `q` is empty). |
| `POST /api/snacks` | Add a snack; it stays `pending` until approved. |
| `GET /api/snacks/:id` | Snack page: averages, slider averages, rank in its type, recent check-ins. |
| `GET /api/checkins` | The feed, 20 at a time (`?before=` for older). |
| `POST /api/checkins` | Form with `data` (JSON) and an optional `photo`. Awards points. |
| `DELETE /api/checkins/:id` | Delete your own check-in, its photo and its points. |
| `GET /api/photos/:id` | A check-in photo from R2. |
| `GET /api/users/:username` | Profile: stats, taste profile, recent check-ins. |

| `GET /api/groups` | Your groups with your rank in each. |
| `POST /api/groups` | Start a group (name, scoring mode, reset period, snack types). |
| `GET /api/groups/join/:code` | Preview the group an invite code belongs to. |
| `POST /api/groups/join` | Join with a code (rate limited). |
| `GET /api/groups/:id` | Members only: settings, invite code, this period's board, favourite snack. |
| `POST /api/groups/:id/leave` / `DELETE /api/groups/:id` | Leave, or delete if you're the owner. |
| `GET /api/avatars/:id` | A profile picture (signed-in users). |
| `POST /api/avatars` / `DELETE /api/avatars` | Set your profile picture (form field `photo`), or remove it. |
| `POST /api/auth/quick` | Quick sign-in when `QUICK_SIGNIN` is "on": `{ username, pin, inviteCode }`. A new name needs the invite code; after that, name and PIN. |
| `GET /api/admin/queue` | Admins: check-in photos and profile pictures waiting for approval. |
| `POST /api/admin/photos/:id` / `POST /api/admin/avatars/:userId` | Admins: `{ "action": "approve" }` or `"reject"`. Rejecting a check-in photo deletes it and takes back its photo points. |
| `GET` / `POST` / `DELETE /api/admin/demo` | Admins: demo data status, load it (8 people, check-ins, 2 groups), or remove it all. Everything demo has an id starting `demo-`. |
| `POST /api/admin/demo/photos/:snackId` | Admins: fetch one snack's pack photo from Open Food Facts for the demo check-ins. |
| `GET /api/boards/people` | Leaderboard of people. `scope` (global or a group id), `period` (week, month, all), `metric` (points, checkins, snacks). Top 50 plus you. |
| `GET /api/boards/snacks` | Top rated snacks by weighted rating. `scope`, `period`, optional `category`. |

Group boards are worked out on request from check-ins and the points ledger,
so changing a group's settings never loses history. Weekly boards run from
Monday 00:00 UTC, monthly ones from the 1st.

Points: 10 for a snack you haven't checked in before, 2 for a repeat, +3 for a
photo, +2 for a review of 50+ characters, at most 100 a day (UTC). The rules are
in `shared/catalogue.ts` and `worker/lib/checkin.ts`.

Schema changes go in a new file in `migrations/`. Workers Builds does not apply
them, so run `npm run db:migrate:remote` before (or right after) merging.

## Run it locally

```sh
npm install
cp .dev.vars.example .dev.vars        # Turnstile test secret (always passes)
cp .env.example .env                  # Turnstile test site key
npm run db:migrate:local
npx wrangler d1 execute snackchat-db --local \
  --command "INSERT INTO invite_codes (code, max_uses, created_at) VALUES ('SNACKTEST', 10, unixepoch())"
npm run dev                           # http://localhost:5173
```

Verification links appear in the terminal running `npm run dev`.

`npm test` runs the unit tests; `npm run typecheck` checks types.

## Deploy

Until step 1 is done the app runs in **Turnstile test mode**: the front end
uses Cloudflare's always-pass test site key and the Worker falls back to the
matching test secret, so sign-up works but the bot check blocks nothing.
`/api/health` reports `"turnstile": "test"` while this is the case. Invite codes
still gate sign-up. Do step 1 before inviting people beyond a few testers.

1. Create a Turnstile widget in the Cloudflare dashboard (Turnstile, Add widget,
   hostname `snackchat.<your-subdomain>.workers.dev`). Put its **site key** in
   `.env` as `VITE_TURNSTILE_SITE_KEY`, and set the **secret key** on the Worker:
   `npx wrangler secret put TURNSTILE_SECRET_KEY`.
2. Create the tables in the real database: `npm run db:migrate:remote`.
3. Add your first invite code:
   `npx wrangler d1 execute snackchat-db --remote --command "INSERT INTO invite_codes (code, max_uses, created_at) VALUES ('YOURCODE', 20, unixepoch())"`
4. `npm run deploy`.

To read verification links in production: `npx wrangler tail`, or the Worker's
Logs tab in the dashboard.

## Errors, alerts and backups

- **Crashes.** If a screen crashes, people see a "Something went wrong, reload" page instead of a blank one. Crashes on phones (sent to `POST /api/errors`) and server errors are written to `error_log`. Admins see them in Settings > Health.
- **Alerts.** Every hour a cron job counts the last hour's errors. At 10 or more it emails `ALERT_EMAIL` (or every admin with a real email address), then stays quiet for 6 hours. Until `EMAIL_MODE` is `resend`, the alert only goes to the Worker logs.
- **Admin changes.** Every admin action that changes something is written to `admin_audit_log`, shown in Settings > Health.
- **Backups.** At 03:00 UTC every table is copied to R2 as `backups/YYYY-MM-DD.json`, and the last 14 are kept. Photos already live in R2 and aren't copied. Download a backup from Settings > Health, then restore it like this:

  ```sh
  npm run backup:restore -- snackchat-2026-10-25.json > restore.sql
  npx wrangler d1 execute snackchat-db --remote --file restore.sql
  ```

  This replaces every table's rows with the backup's, so the tables must already exist (on a fresh database, run the migrations first). Add `--tables=users,checkins` to restore only some tables. D1 Time Travel can also roll the whole database back to any minute in the last 30 days: `npx wrangler d1 time-travel restore snackchat-db --timestamp=<when>`.
