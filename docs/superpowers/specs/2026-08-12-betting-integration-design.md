# Betting integration: FPL Exchange → fpl-draft-league

**Date:** 2026-08-12
**Status:** Approved design, pending implementation plan

## Goal

Fold the FPL Exchange betting product (currently a separate FastAPI + Vite + Postgres + Discord-gateway-bot stack at `SundayKoi/fpl-betting`, live on a Hetzner box) into this Next.js + Supabase project, serve its Discord features serverlessly, then decommission the Hetzner server. The two other bots on that server (inhouse-bot, ticketbot) move to a new minimal Hetzner VPS.

## Decisions already made

- **Full merge** into this app + this Supabase project (not a second app, not lift-and-shift).
- **Discord side survives, serverless**: slash commands and bet buttons via Discord HTTP interactions; announcements + market lifecycle via Supabase pg_cron + an Edge Function. No gateway process anywhere.
- **Fresh start on data** — nothing migrates from the exchange DB. Everyone starts at 1000 points again.
- **Access gate**: betting (site + Discord) requires the **FPL Better** role (`1534319130675642378`) in the FPL Premium guild (`1534318803318739146`). Draft-league features keep their current, ungated behavior.
- **No domain coupling**: internal links relative; the only absolute URL (Discord embeds) reads `SITE_URL` from env. fplexchange.com lapses; a new domain gets attached later by config only.
- **Feature set** carried over: match markets (with draws, auto-void one-sided, cashout, opening lines), pick'em cards with jackpot carryover, leaderboard (balance + profit), profile stats/badges, store + purchases (Discord role fulfillment), daily streak bonus, tips, seasons (close/reset/podium), admin tools (markets, pick'em, teams, events, store, users, grants, audit), share images for announcements. The casino games (flip/blackjack/duels) stay removed.

## Architecture

### Data layer (Supabase migrations)

- Port the exchange schema + RPCs as new timestamped migrations in `supabase/migrations` (consolidated: schema, money RPCs, admin RPCs, bot RPCs; excluding flip/blackjack/duel tables and functions).
- Money engine unchanged in spirit: integer points only; append-only `ledger`; invariant `sum(ledger.delta) = betting_profiles.balance` per user; every money move is a `security definer` PL/pgSQL RPC (`grant_signup_bonus`, `place_bet`, `cashout`, `resolve_market_admin`, `claim_daily_streak`, `tip`, pick'em RPCs, `close_season_admin`, …).
- Betting tables prefixed or grouped to coexist with draft tables (final naming in the implementation plan; prefer `betting_`-prefixed tables where names would collide, e.g. `teams`/`events` → `betting_teams`/`betting_events`).
- RLS everywhere: public/authenticated read where the UI needs it; **no direct writes** — clients only call the exposed RPCs; internal helpers revoked from `anon`/`authenticated` (same pattern as `20260807000009_revoke_internal_fns.sql`).
- **Identity**: `betting_profiles(discord_id text pk, auth_user_id uuid null unique references auth.users, username, avatar_url, role, balance, last_daily, created_at)`. Site logins upsert by the Discord ID from the Supabase Discord identity and link `auth_user_id`; Discord interactions upsert by Discord ID alone. One wallet either way. Signup bonus (1000) granted on first touch from either door, idempotent.
- Scheduled SQL (pg_cron, 1-min): `lock_due_markets`, `void_one_sided_markets`, pick'em lock/resolve — pure SQL, no HTTP.

### Web app

- Route group `src/app/betting/`: index (events + open markets), `market/[id]`, `leaderboard`, `profile`. Admin: a betting area under the existing `/admin` (markets, pick'em, teams, events, store, users, grants, audit, seasons).
- Server components + server actions through the existing `createServerSupabase` helper; no separate API layer. Service-role usage only where RLS-exempt work is unavoidable (e.g. the interactions endpoint and cron-adjacent admin actions).
- Live updates via Supabase Realtime on markets/bets (replaces the old SSE broker) — same pattern as the auction board.
- Port the existing React components' logic (BetPanel, OddsBar, PickemPanel, MatchCard, LockCountdown, Ticker, TopBets, Celebration, ConfirmDialog) restyled with Tailwind v4 to the site's look.
- Role gate on betting routes: server-side check that the logged-in user's Discord ID holds FPL Better in the guild (bot-token member lookup, short-lived cache). Staff/admin for betting admin mapped from the same member lookup (Staff role `1534320670916476978`) at login/check time — the old gateway-event staff sync becomes check-at-login semantics.

### Discord, serverless

- **Interactions endpoint** `src/app/api/discord/interactions/route.ts`: verifies ed25519 signatures (reject → 401), handles PING, slash commands (`/daily`, `/balance`, `/bets`, `/tip`, `/leaderboard`, `/exchange`, `/store`, `/buy`), bet buttons (`bet:<market>:<team>:<code>` custom IDs kept), and the stake modal. Role gate reads `member.roles` from the payload. Each handler calls the same RPCs as the site. Command registration script included (`scripts/register-discord-commands.ts`).
- **Announcements**: Supabase Edge Function on a 1-minute schedule drains the `announcements` queue (open with bet buttons / last-call / resolved / cancelled / pick'em / season close) and posts via Discord REST (bot token) to the announce channel (`1534323284194103538`). Failures leave items queued (at-least-once, like today's loop). Ledger-drift watchdog runs here too (hourly) and posts alerts.
- Share images (`/share/market/[id]/open.png`, `result.png`) become Next.js OG-image routes so embeds keep their card images.

### Env (Vercel + Supabase function secrets)

`DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APP_ID`, `DISCORD_GUILD_ID`, `DISCORD_REQUIRED_ROLE_ID`, `DISCORD_STAFF_ROLE_ID`, `DISCORD_ANNOUNCE_CHANNEL_ID`, `SITE_URL`, existing Supabase vars, `SUPABASE_SERVICE_ROLE_KEY` (server-only).

## Testing

- **pgTAP** (in `supabase/tests`, like the auction engine): ledger invariant, bet place/resolve/refund/cashout, draws, one-sided void, daily streak, idempotent signup bonus, tip, pick'em resolve/carryover, season close.
- **vitest**: interactions endpoint (signature verify happy/reject paths, handler routing), server actions, key components.
- **Playwright**: login-gated bet flow — place bet, balance drops, admin resolves, payout appears.

## Cutover (nothing dies before its replacement is verified)

1. **Ship betting** in this app (Supabase migrations applied, Vercel deployed) while the old exchange keeps running.
2. **Flip Discord**: set the interactions endpoint URL on the Discord application (atomically moves all interactions off the gateway bot), run command registration, enable pg_cron + the announcement function, stop the `fpl-bot` container on Hetzner. Reversible by clearing the endpoint URL and restarting the container.
3. **Move bots**: new minimal Hetzner VPS (~€4/mo) with docker; stop `inhouse-bot` + `ticketbot`, rsync `/opt/inhouse-bot` and `/opt/ticketbot` (code, `.env`, `data/`, `backups/`, `service_account.json`), compose up on the new box, verify both in Discord.
4. **Decommission**: final `pg_dump` of the exchange DB downloaded locally (plus `/opt/fpl-backups`), optional server snapshot, delete the old server. Update `SundayKoi/fpl-betting` README to point here as the successor.

## Out of scope

- No data migration from the exchange DB (fresh start).
- No changes to draft-league features or their auth semantics.
- Casino games stay gone.
- New domain purchase/attachment (config-only later).
