# Snackchat

Log, rate and rank your snacks with friends. Snackchat is a web app (installable
on a phone's home screen) that runs entirely on Cloudflare.

## How it fits together

| Piece | Where | What it does |
| --- | --- | --- |
| Front end | `src/` (React + Vite) | The pages people see. Built into static files. |
| API | `worker/` (Hono on Cloudflare Workers) | Everything under `/api`: sign-up, log-in, and soon check-ins and leaderboards. |
| Database | D1 `snackchat-db`, schema in `migrations/` | Users, sessions, snacks, check-ins, groups, points. |
| Cache | KV `snackchat-cache` | Will hold cached leaderboards. |
| Photos | R2 `snackchat-photos` | Not created yet: R2 has to be switched on in the Cloudflare dashboard first. |
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
