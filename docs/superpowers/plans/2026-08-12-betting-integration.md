# Betting Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the FPL Exchange betting product (markets, pick'em, wallet economy, admin tools, Discord bot) into this Next.js + Supabase app, serverlessly, per `docs/superpowers/specs/2026-08-12-betting-integration-design.md`.

**Architecture:** Betting schema + money engine as `security definer` PL/pgSQL RPCs in Supabase migrations (ported from the exchange repo at `c:\fpl_gambling`); `/betting` App Router pages calling RPCs via `createServerSupabase`; one signature-verified Discord HTTP-interactions route on Vercel; market lifecycle via pg_cron and a Supabase Edge Function that drains an announcements queue to Discord REST.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres/RPCs/Realtime/Edge Functions, pg_cron + pg_net), Tailwind v4, pgTAP, vitest, Playwright. No new npm runtime deps (ed25519 via WebCrypto).

**Spec:** `docs/superpowers/specs/2026-08-12-betting-integration-design.md`

**Source repo (port from):** `c:\fpl_gambling` — SQL in `db/migrations/`, API logic in `api/`, bot logic in `bot/`. Excluded features: flip, blackjack, duels (migrations 015, 016, 019, 020), SSE realtime (007), signin audit (009).

## Global Constraints

- Integer points only — `bigint`, never floats. Every money move is a `security definer` PL/pgSQL RPC writing a `betting_ledger` row. Invariant: `sum(ledger.delta) = betting_profiles.balance` per wallet.
- All betting tables are prefixed `betting_`. RPC functions keep their exchange names (no collisions with draft RPCs — verify with `\df` before merging each SQL task).
- RLS on every betting table: reads via policies, **no direct client writes** — internal helpers revoked from `public, anon, authenticated` (pattern: `supabase/migrations/20260807000009_revoke_internal_fns.sql`).
- No hardcoded domain anywhere. Absolute URLs only from `process.env.SITE_URL` (Discord embeds) — everything else relative.
- Discord config via env: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APP_ID`, `DISCORD_GUILD_ID`, `DISCORD_REQUIRED_ROLE_ID` (FPL Better), `DISCORD_STAFF_ROLE_ID`, `DISCORD_ANNOUNCE_CHANNEL_ID`, plus `SUPABASE_SERVICE_ROLE_KEY` (server-only), `SITE_URL`.
- This is Next.js 16 — before writing any App Router code, read the relevant guide under `node_modules/next/dist/docs/` (per AGENTS.md).
- Migration filenames continue the repo's `YYYYMMDDHHMMSS_name.sql` sequence; pgTAP tests continue the `NNNN_name_test.sql` sequence in `supabase/tests/` and run with `npx supabase test db`.
- Run vitest with `npm test`, e2e with `npm run e2e`. Commit after every green task.

---

### Task 1: Betting schema migration + RLS/grants

**Files:**
- Create: `supabase/migrations/20260813000001_betting_schema.sql`
- Test: `supabase/tests/0023_betting_schema_test.sql`

**Interfaces:**
- Produces tables (all `public.`): `betting_profiles(discord_id text pk, profile_id uuid unique references profiles(id), username text not null, avatar_url text, role text not null default 'member', balance bigint not null default 0 check (balance >= 0), last_daily timestamptz, created_at timestamptz default now())`; `betting_ledger(id bigint identity pk, discord_id text references betting_profiles, delta bigint, reason text, ref_table text, ref_id bigint, created_at)`; `betting_teams(id, name, short_code, color, logo_url)`; `betting_events(id, name, description)`; `betting_markets` (port columns from `c:\fpl_gambling\db\migrations\001_schema.sql:38-56` + `draw_enabled boolean` and `opening_*` columns from `014_opening_line.sql` + `018_draws.sql`); `betting_bets` (from `001_schema.sql:58-69`, `team_id bigint` where -1 = draw); `betting_store_items`, `betting_purchases`, `betting_admin_audit` (from `001_schema.sql:71-100`); `betting_announcements` (from `008_announcements.sql`); pick'em tables (from `010_pickem_cashout.sql:12-50`); `betting_seasons`, `betting_season_results` (from `011_seasons.sql:6-25`).
- All FKs that referenced `users(discord_id)` now reference `betting_profiles(discord_id)`; `teams`→`betting_teams`, `markets`→`betting_markets`, etc.

- [ ] **Step 1: Write the failing pgTAP test** — `supabase/tests/0023_betting_schema_test.sql`:

```sql
begin;
select plan(8);
select has_table('public', 'betting_profiles', 'betting_profiles exists');
select has_table('public', 'betting_ledger',   'betting_ledger exists');
select has_table('public', 'betting_markets',  'betting_markets exists');
select has_table('public', 'betting_bets',     'betting_bets exists');
select has_table('public', 'betting_pickems',  'betting_pickems exists');
select col_is_pk('public', 'betting_profiles', 'discord_id', 'wallet keyed by discord id');
select ok((select relrowsecurity from pg_class where relname='betting_markets'), 'RLS on betting_markets');
select ok((select relrowsecurity from pg_class where relname='betting_ledger'), 'RLS on betting_ledger');
select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails** — `npx supabase test db` → FAIL (tables missing).
- [ ] **Step 3: Write the migration.** Port the table DDL from the source files listed in Interfaces, applying the renames. Then RLS + grants, following the repo's pattern:

```sql
alter table public.betting_profiles enable row level security;
-- ...enable on every betting_ table...
create policy betting_public_read on public.betting_markets for select using (true);
-- same public-read policy for: betting_teams, betting_events, betting_bets,
-- betting_pickems, betting_pickem_legs, betting_pickem_cards, betting_pickem_bank,
-- betting_store_items, betting_seasons, betting_season_results, betting_profiles
-- (profiles read exposes username/balance for leaderboard — matches the old site)
-- NO read policy on: betting_ledger, betting_admin_audit, betting_purchases,
-- betting_announcements (server/RPC only)
grant select on public.betting_markets, public.betting_teams, public.betting_events,
  public.betting_bets, public.betting_profiles, public.betting_pickems,
  public.betting_pickem_legs, public.betting_pickem_cards, public.betting_pickem_bank,
  public.betting_store_items, public.betting_seasons, public.betting_season_results
  to anon, authenticated;
grant all on all tables in schema public to service_role;
alter publication supabase_realtime add table public.betting_markets, public.betting_bets;
```

No insert/update/delete grants to anon/authenticated on any betting table.
- [ ] **Step 4: Run to verify pass** — `npx supabase db reset && npx supabase test db` → PASS (all suites, not just 0023).
- [ ] **Step 5: Commit** — `git add supabase && git commit -m "feat(betting): schema, RLS, grants"`

---

### Task 2: Wallet + economy RPCs (signup bonus, daily streak, tip)

**Files:**
- Create: `supabase/migrations/20260813000002_betting_wallet_rpcs.sql`
- Test: `supabase/tests/0024_betting_wallet_test.sql`

**Interfaces:**
- Produces RPCs: `grant_signup_bonus(p_user text, p_username text, p_avatar text, p_amount bigint, p_profile_id uuid default null) returns void` (port from `c:\fpl_gambling\db\migrations\003_signup_bonus.sql`, extended: when `p_profile_id` is not null, also `update betting_profiles set profile_id = p_profile_id where discord_id = p_user and profile_id is null`); `claim_daily_streak(p_user text, p_amount bigint, p_step bigint, p_max int) returns table(amount bigint, balance bigint, streak int)` and `daily_next_at(p_user text)` (port from `002_rpcs.sql` + `017_daily_next.sql`); `tip_points(p_from text, p_to text, p_amount bigint) returns bigint` (port from `012_social.sql`; ledger reasons `tip_send`/`tip_recv`).
- All table references rewritten `users`→`betting_profiles`, `ledger`→`betting_ledger`.

- [ ] **Step 1: Write the failing pgTAP test** (representative cases — port assertions from `c:\fpl_gambling\tests\test_signup_bonus.py` and `test_claim_daily.py`):

```sql
begin;
select plan(6);
select grant_signup_bonus('d1', 'Alice', null, 1000);
select grant_signup_bonus('d1', 'Alice2', null, 1000);  -- idempotent
select is((select balance from betting_profiles where discord_id='d1'), 1000::bigint, 'bonus once');
select is((select username from betting_profiles where discord_id='d1'), 'Alice2', 'profile refreshed');
select is((select sum(delta) from betting_ledger where discord_id='d1'), 1000::numeric, 'ledger matches');
select is((select amount from claim_daily_streak('d1', 250, 50, 7)), 250::bigint, 'first daily = base');
select throws_like('select claim_daily_streak(''d1'', 250, 50, 7)', '%already claimed%', 'no double daily');
select is((select tip_points('d1', 'd2', 100)), (select balance from betting_profiles where discord_id='d1'), 'tip returns sender balance')
  from (select grant_signup_bonus('d2','Bob',null,1000)) _;
select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails** — `npx supabase test db`.
- [ ] **Step 3: Port the RPCs** from the source files with the table renames; end the migration with the revoke pattern for any internal helper added.
- [ ] **Step 4: Run to verify pass** — full `npx supabase test db`.
- [ ] **Step 5: Commit.**

---

### Task 3: Markets engine RPCs

**Files:**
- Create: `supabase/migrations/20260813000003_betting_market_rpcs.sql`
- Test: `supabase/tests/0025_betting_markets_test.sql`

**Interfaces:**
- Produces RPCs (ported with table renames from `c:\fpl_gambling\db\migrations\002_rpcs.sql`, `004_admin_rpcs.sql`, `005_bot_rpcs.sql`, `006_delete_rpcs.sql`, `013_lock_warn.sql`, `014_opening_line.sql`, `018_draws.sql`): `place_bet(p_user text, p_market bigint, p_team bigint, p_amount bigint) returns bigint` (team -1 = draw when enabled), `cashout_bet(p_user text, p_bet bigint) returns bigint`, `lock_due_markets() returns setof bigint`, `void_one_sided_markets() returns setof bigint`, `resolve_market_admin(p_actor text, p_market bigint, p_winner bigint) returns void` (winner -1 = draw), `cancel_market_admin(p_actor text, p_market bigint) returns void`, `create_market_admin(...)` with the same argument list as the source, `delete_market_admin`, plus the `_audit(...)` helper writing `betting_admin_audit` and the market/odds read views the source defines.
- Ledger reasons preserved verbatim: `bet_place`, `bet_payout`, `cashout`, `refund`.

- [ ] **Step 1: Write the failing pgTAP test** — port the core assertions of `c:\fpl_gambling\tests\test_place_bet.py`, `test_resolve_market.py`, `test_cancel_market.py`, `test_draws.py`, `test_invariants.py`. Must cover: stake debits balance; insufficient funds throws; betting on locked market throws; resolve pays pro-rata from the pool and marks bets settled; nobody-on-winner → full refunds; cancel refunds all stakes; draw resolution when `draw_enabled`; and the invariant check `sum(betting_ledger.delta) = balance` for every touched wallet at the end.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Port the RPCs** (largest SQL task — go function by function; after each, re-run the test file).
- [ ] **Step 4: Full `npx supabase test db` green.**
- [ ] **Step 5: Commit.**

---

### Task 4: Pick'em, store, seasons RPCs

**Files:**
- Create: `supabase/migrations/20260813000004_betting_pickem_store_seasons.sql`
- Test: `supabase/tests/0026_betting_pickem_store_seasons_test.sql`

**Interfaces:**
- Pick'em RPCs from `010_pickem_cashout.sql` (place card, lock due, resolve with jackpot carryover via `betting_pickem_bank`, cancel/refund, near-miss + summary reads). Ledger reasons: `pickem_place`, `pickem_payout`, `pickem_refund`, `pickem_cancel`.
- Store RPCs from `002_rpcs.sql`/`004_admin_rpcs.sql`: `start_purchase(p_user text, p_item bigint)`, `fulfill_purchase(p_purchase bigint, p_ref text)`, `refund_purchase(p_purchase bigint) returns bigint`, store admin CRUD.
- Seasons from `011_seasons.sql`: `create_season_admin(p_actor text, p_name text) returns bigint`, `close_season_admin(p_actor text, p_season bigint, p_reset_to bigint, p_top int default 10)` (blocks while open markets/pick'ems exist; snapshots `betting_season_results`; soft-reset through ledger reason `season_reset`).

- [ ] **Step 1: Failing pgTAP test** — port assertions from `tests/test_pickem_cashout.py`, `test_purchase_item.py`, `test_seasons.py`: pick'em perfect-card split; no-winner rollover into `betting_pickem_bank`; purchase debits and refund restores; season close blocked with open market; season close snapshots + resets to 1000 and ledger invariant holds.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Port the RPCs.**
- [ ] **Step 4: Full test-db run green.**
- [ ] **Step 5: Commit.**

---

### Task 5: Announcements queue, lifecycle SQL, pg_cron

**Files:**
- Create: `supabase/migrations/20260813000005_betting_lifecycle_cron.sql`
- Test: `supabase/tests/0027_betting_lifecycle_test.sql`

**Interfaces:**
- Produces (from `008_announcements.sql`, `005_bot_rpcs.sql`, `013_lock_warn.sql`): `unannounced_markets(p_kind text) returns setof ...`, `mark_announced(p_market bigint, p_kind text)`, pick'em equivalents, `markets_locking_soon()`, `unannounced_closed_seasons()`/`mark_season_announced`, and `ledger_drift() returns table(discord_id text, username text, balance bigint, ledger_total bigint)`.
- Produces `betting_lifecycle_tick() returns void` — one function running: `void_one_sided_markets()`, `lock_due_markets()`, pick'em lock + resolve loop. (The announcer edge function handles the HTTP half; this is the pure-SQL half.)
- Schedules (idempotent, guarded with `where not exists (select 1 from cron.job where jobname = ...)`):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('betting-lifecycle', '* * * * *', $$select public.betting_lifecycle_tick()$$);
-- announcer + hourly watchdog HTTP calls are added in Task 12 (needs the function URL)
```

- [ ] **Step 1: Failing pgTAP test** — market past `lock_at` flips to LOCKED after `betting_lifecycle_tick()`; one-sided market voids with refunds; resolved market appears once in `unannounced_markets('resolved')` and not after `mark_announced`; `ledger_drift()` returns zero rows on healthy data and one row after a raw `update betting_profiles set balance = balance + 1`.
- [ ] **Step 2–4:** fail → port → green (`npx supabase db reset && npx supabase test db`).
- [ ] **Step 5: Commit.**

---

### Task 6: `src/lib/betting` — access gate, wallet helper, types

**Files:**
- Create: `src/lib/betting/access.ts`, `src/lib/betting/access.test.ts`, `src/lib/betting/wallet.ts`, `src/lib/betting/types.ts`, `src/lib/betting/format.ts` (+ `format.test.ts`)

**Interfaces:**
- Produces:
  - `fetchGuildMember(discordId: string): Promise<{ inGuild: boolean; roles: string[] } | null>` — GET `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${id}` with `Bot` token; 200→roles, 404→`{inGuild:false, roles:[]}`, other→`null` (inconclusive). Module-level `Map` cache, 60s TTL.
  - `bettingAccess(discordId: string): Promise<{ allowed: boolean; staff: boolean; inconclusive: boolean }>` — allowed iff roles include `DISCORD_REQUIRED_ROLE_ID`; staff iff `DISCORD_STAFF_ROLE_ID`; inconclusive (Discord down) → `allowed: true` fail-open, matching the exchange's policy.
  - `getBettingUser()` (server-only, in `wallet.ts`): `createServerSupabase` → `auth.getUser()` → discord id from `user.identities.find(i => i.provider === 'discord').id` → calls RPC `grant_signup_bonus(discordId, username, avatar, 1000, user.id)` → returns `{ discordId, profileId, username, balance, allowed, staff }` or `null` when signed out.
  - `fmtPoints(n: number): string` → `"$1,234"` (port of the exchange's `fmt`).
- Consumes: RPCs from Task 2.

- [ ] **Step 1: Write failing vitest tests** for `fetchGuildMember` (mock `global.fetch`: 200/404/500 paths + cache hit = single fetch call) and `bettingAccess` (role present/absent/inconclusive) and `fmtPoints`.
- [ ] **Step 2: Run** `npm test -- access` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: `npm test` green.**
- [ ] **Step 5: Commit.**

---

### Task 7: Betting pages — index, market detail, realtime odds

**Files:**
- Create: `src/app/betting/page.tsx`, `src/app/betting/market/[id]/page.tsx`, `src/app/betting/layout.tsx` (gate + nav), `src/lib/betting/actions.ts` (server actions), `src/components/betting/BetPanel.tsx`, `src/components/betting/OddsBar.tsx`, `src/components/betting/LockCountdown.tsx`, `src/components/betting/MarketCard.tsx` + colocated `.test.tsx` files

**Interfaces:**
- Consumes: `getBettingUser`, `bettingAccess` (Task 6); RPCs `place_bet`, `cashout_bet` (Task 3).
- Produces server actions in `actions.ts`: `placeBet(marketId: number, teamId: number, amount: number): Promise<{ ok: true; balance: number } | { ok: false; error: string }>`; `cashoutBet(betId: number)` same shape. Both re-derive the discord id server-side from the session (never trust client ids) and `revalidatePath('/betting')`.
- `layout.tsx` server component: `getBettingUser()`; not signed in → sign-in prompt reusing `/login`'s Discord flow; signed in without FPL Better → "FPL Better members only" message. Children render only when allowed.
- Port the UI logic (not the CSS) of `c:\fpl_gambling\web\src\components\{BetPanel,OddsBar,LockCountdown,MatchCard}.tsx` and pages `EventsIndex`/`MarketPage`; style with Tailwind v4 matching this site. Odds/pool live-update via a `"use client"` hook subscribing to Supabase Realtime `postgres_changes` on `betting_bets` (insert) and `betting_markets` (update) — pattern: the auction board's realtime hook.

- [ ] **Step 1: Write failing component tests** — port the assertions of `c:\fpl_gambling\web\src\components\BetPanel.test.tsx` and `OddsBar.test.tsx` (stake validation, quick-stake buttons, odds bar proportions, locked state disables betting).
- [ ] **Step 2: `npm test` → FAIL.**
- [ ] **Step 3: Implement pages, actions, components.** Check `node_modules/next/dist/docs/` for server-action + revalidate conventions first.
- [ ] **Step 4: `npm test` green; `npm run lint` clean; manual check via `npm run dev` with `npx supabase start`.**
- [ ] **Step 5: Commit.**

---

### Task 8: Pick'em UI, leaderboard, profile

**Files:**
- Create: `src/app/betting/leaderboard/page.tsx`, `src/app/betting/profile/page.tsx`, `src/components/betting/PickemPanel.tsx` (+ tests), extend `src/lib/betting/actions.ts` (`placePickemCard(pickemId: number, picks: number[])`, `cashoutPickem(cardId: number)`)
- Modify: `src/app/betting/page.tsx` (render open pick'em above markets)

**Interfaces:**
- Consumes: pick'em RPCs (Task 4); profit/stats queries ported from `c:\fpl_gambling\api\stats.py` — reimplement `PROFIT_REASONS` (minus `duel_*`/`bj_*`) and the wins/streak derivation as a SQL view `betting_leaderboard` in a small migration `supabase/migrations/20260813000006_betting_leaderboard_view.sql` (rank by balance and by profit).
- Produces: leaderboard page (balance + profit tabs, badges 🔥/🎯 per source logic), profile page (record, profit, biggest win, streaks, recent bets).

- [ ] **Step 1: Failing tests** — pgTAP for the view (profit nets stake+payout and excludes daily/tips; port `test_stats.py` core cases) + vitest for `PickemPanel` (must pick every leg to submit; locked card shows results).
- [ ] **Step 2: fail → Step 3: implement → Step 4: green (`npx supabase test db` + `npm test`).**
- [ ] **Step 5: Commit.**

---

### Task 9: Admin betting area

**Files:**
- Create: `src/app/admin/betting/page.tsx` (markets: create/lock/resolve/cancel with confirm), `src/app/admin/betting/pickems/page.tsx`, `src/app/admin/betting/catalog/page.tsx` (teams + events + store CRUD), `src/app/admin/betting/users/page.tsx` (balances, grant/deduct with reason, audit trail), `src/app/admin/betting/seasons/page.tsx`, `src/lib/betting/admin-actions.ts` (+ tests)
- Modify: `src/app/admin/page.tsx` (link to the betting admin), `src/lib/betting/access.ts` (export `requireBettingStaff()` helper)

**Interfaces:**
- Consumes: admin RPCs (Tasks 3–5). Actions all call `requireBettingStaff()` first: betting staff = Discord Staff role via `bettingAccess` **or** `profiles.is_admin` (site admins are betting admins).
- Produces `admin-actions.ts`: `createMarket(input: { eventId: number; teamAId: number; teamBId: number; title: string; gameAt: string; lockAt: string; drawEnabled: boolean })`, `resolveMarket(marketId: number, winnerTeamId: number)`, `cancelMarket(marketId: number)`, `createPickem(...)` / `resolvePickem(...)` mirroring source admin routes (`c:\fpl_gambling\api\routes_admin.py`), `grantPoints(discordId: string, delta: number, reason: string)`, team/event/store CRUD, `createSeason(name: string)` / `closeSeason(seasonId: number, resetTo: number)`.

- [ ] **Step 1: Failing vitest tests** for `admin-actions.ts` authorization (non-staff rejected before any RPC call — mock `bettingAccess`) and input validation (resolve requires winner among the market's teams or -1).
- [ ] **Step 2: fail → Step 3: implement pages + actions → Step 4: green + lint.**
- [ ] **Step 5: Commit.**

---

### Task 10: Discord interactions endpoint — verification + router

**Files:**
- Create: `src/app/api/discord/interactions/route.ts`, `src/lib/betting/discord/verify.ts`, `src/lib/betting/discord/respond.ts`, `src/lib/betting/discord/verify.test.ts`, `src/lib/betting/discord/route.test.ts`

**Interfaces:**
- Produces:
  - `verifyDiscordSignature(publicKeyHex: string, signatureHex: string, timestamp: string, rawBody: string): Promise<boolean>` using WebCrypto:

```ts
export async function verifyDiscordSignature(
  publicKeyHex: string, signatureHex: string, timestamp: string, rawBody: string,
): Promise<boolean> {
  const hex = (s: string) => Uint8Array.from(s.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const key = await crypto.subtle.importKey("raw", hex(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify("Ed25519", key, hex(signatureHex),
    new TextEncoder().encode(timestamp + rawBody));
}
```

  - `respond.ts` helpers: `msg(content: string, ephemeral?: boolean)`, `embed(e: object, ephemeral?: boolean)` → interaction response type 4; `modal(customId: string, title: string, fields: ...)` → type 9; `updateMessage(...)` → type 7. Plus `errEmbed(message: string)` (red, ❌ prefix — port of the bot's `err_embed`).
  - `route.ts` POST handler: read raw body text FIRST (signature is over raw bytes), verify `X-Signature-Ed25519`/`X-Signature-Timestamp` against `DISCORD_PUBLIC_KEY` → 401 on failure; `type === 1` (PING) → `{ type: 1 }`; dispatch table for command names / component custom ids / modal ids (handlers filled by Tasks 11–12); unknown → ephemeral error. Role gate before every handler: `member.roles.includes(process.env.DISCORD_REQUIRED_ROLE_ID!)` from the payload → else ephemeral "FPL Better members only" message.
- Consumes: nothing yet — handlers arrive next tasks.

- [ ] **Step 1: Failing tests** — `verify.test.ts`: generate a real Ed25519 keypair in-test (`crypto.subtle.generateKey`), sign a body, assert verify true; tampered body → false. `route.test.ts`: unsigned request → 401; signed PING → `{type:1}`; signed command from a member without the role → ephemeral denial (mock env role ids).
- [ ] **Step 2: `npm test` → FAIL. Step 3: implement. Step 4: green.**
- [ ] **Step 5: Commit.**

---

### Task 11: Slash-command handlers + registration script

**Files:**
- Create: `src/lib/betting/discord/commands.ts` (+ `commands.test.ts`), `scripts/register-discord-commands.ts`
- Modify: `src/app/api/discord/interactions/route.ts` (wire dispatch table)

**Interfaces:**
- Consumes: RPCs via a service-role client (`createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` — interactions have no cookie session), `fmtPoints`, respond helpers.
- Produces handlers, each `(interaction) => Promise<InteractionResponse>`, porting the bot's command logic from `c:\fpl_gambling\bot\main.py` (embed text preserved): `/balance` (ephemeral wallet + record), `/daily` (streak claim, "come back <t:...:R>" on repeat), `/bets` (open + recent settled, ephemeral), `/leaderboard` (top 10 public embed), `/tip user amount` (public embed on success), `/exchange` (link to `${SITE_URL}/betting` + open markets list, ephemeral), `/store` and `/buy item` (ephemeral; `discord_role` items granted via Discord REST `PUT /guilds/{gid}/members/{uid}/roles/{roleId}`, refund on failure via `refund_purchase`).
- `scripts/register-discord-commands.ts` (run with `npx tsx`): PUT `https://discord.com/api/v10/applications/${DISCORD_APP_ID}/guilds/${DISCORD_GUILD_ID}/commands` with the full command array (names/descriptions/options copied from the source bot's `@tree.command` decorators).
- Every wallet-touching handler first calls `grant_signup_bonus(discordId, username, avatar, 1000)` (the ensure-user pattern).

- [ ] **Step 1: Failing tests** — `/balance` returns ephemeral embed with formatted balance (mock supabase RPC); `/daily` repeat-claim returns the "already claimed" error embed; `/tip` to self rejected before any RPC.
- [ ] **Step 2: fail. Step 3: implement handlers + registration script. Step 4: green.**
- [ ] **Step 5: Commit.**

---

### Task 12: Bet buttons, stake modal, announcer edge function

**Files:**
- Create: `src/lib/betting/discord/components.ts` (+ test), `supabase/functions/discord-announcer/index.ts`, `supabase/migrations/20260813000007_betting_announcer_cron.sql`
- Modify: `src/app/api/discord/interactions/route.ts` (component/modal dispatch)

**Interfaces:**
- Components: button custom id `bet:<marketId>:<teamId>:<code>` (same wire format as the old bot, so old messages keep working) → responds with stake modal custom id `betmodal:<marketId>:<teamId>:<code>`; modal submit parses amount (strip `,`/`$`, integer > 0), ensures wallet, calls `place_bet`, ephemeral confirmation + public "🎲 X bet $N on CODE!" follow-up (POST to the channel via REST, port of the bot's public shout).
- `discord-announcer` (Deno): service-role Supabase client; drains, in order, `unannounced_markets('open'|'resolved'|'cancelled')`, `markets_locking_soon()`, pick'em queues, `unannounced_closed_seasons()`; builds the same embeds as `c:\fpl_gambling\bot\main.py:lifecycle` (titles/copy preserved; open-market messages carry the bet-button action row; embed URLs use `SITE_URL`); posts via `POST /api/v10/channels/${DISCORD_ANNOUNCE_CHANNEL_ID}/messages`; marks announced only after a 2xx. Also: when invoked with `{ "job": "watchdog" }`, runs `ledger_drift()` and posts the 🚨 alert embed if non-empty.
- Cron migration (announcer every minute, watchdog hourly) via pg_net; function URL + secret from Vault or hardcoded project-ref URL with the function's verify-JWT disabled and a shared secret header checked in-function:

```sql
select cron.schedule('betting-announcer', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'announcer_url'),
    headers := jsonb_build_object('x-announcer-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'announcer_secret')),
    body := '{"job":"announce"}'::jsonb)
$$);
select cron.schedule('betting-watchdog', '0 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'announcer_url'),
    headers := jsonb_build_object('x-announcer-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'announcer_secret')),
    body := '{"job":"watchdog"}'::jsonb)
$$);
```

- [ ] **Step 1: Failing tests** — components: button press returns modal response; modal submit with `"1,500"` calls `place_bet` with 1500; non-numeric → error embed, no RPC (mock supabase + fetch).
- [ ] **Step 2: fail. Step 3: implement** (announcer is Deno — test locally with `npx supabase functions serve discord-announcer` against a seeded local DB; assert a queued open market gets posted to a mocked Discord URL via `DISCORD_API_BASE` env override, then is marked announced).
- [ ] **Step 4: vitest green + manual local announcer run clean. Step 5: Commit.**

---

### Task 13: Share images (OG cards for embeds)

**Files:**
- Create: `src/app/betting/market/[id]/opengraph-image.tsx`, `src/app/api/betting/share/[id]/result/route.tsx` (ImageResponse)

**Interfaces:**
- Consumes: market + resolve-summary reads (Task 3 views). Announcer (Task 12) sets embed image URLs to `${SITE_URL}/api/betting/share/${id}/result` for resolved posts; open posts rely on the market page's `opengraph-image`.
- Port the card content (teams, title, pool/winner line) from `c:\fpl_gambling\api\share.py`; render with `next/og` `ImageResponse`, site colors, no external fonts (bundle or system).

- [ ] **Step 1:** Failing vitest test for the data-shaping helper (`shareModel(marketId)` returns title/teams/winner strings; mock supabase).
- [ ] **Step 2–4:** fail → implement → green; verify images render via `npm run dev` in a browser.
- [ ] **Step 5: Commit.**

---

### Task 14: e2e + full-suite gate

**Files:**
- Create: `e2e/betting.spec.ts`
- Modify: `scripts/seed-demo.ts` (seed a betting fixture: two teams, one open market, one admin + one member wallet)

**Interfaces:** Consumes everything. Uses the repo's existing e2e auth pattern (dev email/password login path from the README) with the role gate bypassed via env `BETTING_GATE_DISABLED=1` honored ONLY when `NODE_ENV !== 'production'` (add to `bettingAccess` in this task — guard-tested).

- [ ] **Step 1: Write the e2e**: seeded member logs in → `/betting` → opens market → stakes 100 → balance chip drops by 100 → seeded admin resolves via `/admin/betting` → member's profile shows the payout and the ledger-derived profit updates.
- [ ] **Step 2:** `npm run e2e` → FAIL. **Step 3:** wire seed + gate bypass. **Step 4:** `npm run e2e`, `npm test`, `npx supabase test db`, `npm run lint`, `npx tsc --noEmit` — all green.
- [ ] **Step 5: Commit.**

---

## Cutover runbook (operator tasks — run by Claude with the user, in order, each verified before the next)

### Task 15: Production deploy
- [ ] `npx supabase link` + `npx supabase db push` to the production project; `npx supabase functions deploy discord-announcer`; set Vault secrets (`announcer_url`, `announcer_secret`) and function env (`DISCORD_BOT_TOKEN`, `DISCORD_ANNOUNCE_CHANNEL_ID`, `SITE_URL`, service key).
- [ ] Vercel env vars (Global Constraints list) added; deploy; smoke-check `/betting` gated + working in prod.
- [ ] Run `npx tsx scripts/register-discord-commands.ts` against the FPL Premium guild.

### Task 16: Discord flip (instantly reversible)
- [ ] In the Discord developer portal set the app's **Interactions Endpoint URL** to `https://<vercel-domain>/api/discord/interactions` (portal verifies with a PING — must save green).
- [ ] Verify in Discord: `/balance`, `/daily`, a bet button on a fresh announcement.
- [ ] `ssh fpl "cd /opt/fpl && docker compose -f docker-compose.prod.yml stop bot"` — old gateway bot off. Rollback = clear the endpoint URL + `start bot`.

### Task 17: Move inhouse-bot + ticketbot
- [ ] Create smallest Hetzner VPS (Docker preinstalled or `apt install docker.io docker-compose-plugin`), add SSH config `fpl2`.
- [ ] `ssh fpl "docker stop inhouse-bot ticket-bot"` → `rsync -az /opt/inhouse-bot /opt/ticketbot fpl2:/opt/` (includes `.env`, `data/`, `backups/`, `service_account.json`) → on fpl2: `docker compose up -d --build` in each dir.
- [ ] Verify both bots respond in their Discord guild; watch logs for a clean lifecycle tick.

### Task 18: Decommission
- [ ] Final backup: `ssh fpl "docker compose -f /opt/fpl/docker-compose.prod.yml exec -T db pg_dump -U lx league_exchange | gzip" > fpl-exchange-final-$(date +%F).sql.gz` (download locally); also pull `/opt/fpl-backups/`.
- [ ] Optional Hetzner snapshot of the old server; then **delete the old server** in the Hetzner console; let fplexchange.com lapse.
- [ ] Update `SundayKoi/fpl-betting` README: archived, superseded by FPL_website; archive the repo on GitHub.
- [ ] Update memory notes (`fpl-exchange-progress.md`, `betting-migration-to-vercel.md`) to the end state.
