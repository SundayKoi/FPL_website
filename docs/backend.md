# Backend architecture

This document is the short architectural map for agents working on the FPL
League Platform. It describes the infrastructure that exists in this repo;
the migrations and source code are the final authority when this document and
the implementation disagree.

## System shape

There is no separate application server. The deployed system is a Next.js App
Router application backed by Supabase:

```text
Browser
  ├─ Next.js pages, Server Components, Server Actions, and API routes
  └─ Supabase browser client ── Auth / Postgres Data API / Realtime

Supabase
  ├─ Auth (Discord OAuth and local email/password)
  ├─ Postgres (tables, views, RLS, grants, triggers, and RPCs)
  ├─ Realtime (draft, chat, and match-draft state)
  └─ Deno Edge Function (betting Discord announcements/watchdog)

GitHub Actions and local scripts
  ├─ Riot match-stat ingestion
  ├─ weekly homepage briefs
  └─ weekly player-card snapshots and Discord post
```

External services are Discord (OAuth, guild-role checks, interactions, and
webhooks), Riot (match data), Twitch (live-channel status), Anthropic (weekly
brief prose), Vercel (hosting), and Supabase Cloud (production data).

## Request and data boundaries

### Supabase clients

- `src/lib/supabase/client.ts` creates the browser client with the public
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Use it in
  Client Components for public reads, authenticated browser reads, Realtime,
  and ordinary user-scoped RPCs. RLS still applies.
- `src/lib/supabase/server.ts` creates the cookie-bound server client with the
  same public key pair. Use it in Server Components, server-side queries, and
  Server Actions when the current Supabase Auth session should be visible.
- `src/lib/betting/service-client.ts` creates a `service_role` client and is
  marked `server-only`. It bypasses RLS and must never be imported by a Client
  Component or sent to the browser.
- Scripts use `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` when they need
  trusted automation access. `SUPABASE_URL` is deliberately distinct from the
  browser-facing `NEXT_PUBLIC_SUPABASE_URL` even when both point at the same
  project.

### Next.js boundaries

- Route pages live under `src/app/**/page.tsx`; most page-level reads happen
  directly through the server Supabase client.
- Server Actions currently include `src/lib/betting/actions.ts`,
  `src/lib/betting/admin-actions.ts`, `src/lib/auth/actions.ts`, and
  `src/lib/match-draft/lobbyActions.ts`.
- API routes are narrow integration boundaries:
  - `src/app/auth/callback/route.ts` exchanges the Supabase OAuth code and
    redirects to a safe path on the canonical site origin.
  - `src/app/api/discord/interactions/route.ts` verifies Discord Ed25519
    signatures and replay timestamps, then dispatches commands, buttons, and
    modals through `src/lib/betting/discord/`.
  - `src/app/api/betting/share/[id]/open/route.tsx` and `result/route.tsx`
    render Discord share cards with `next/og`.
  - `src/app/card/[slug]/card.png/route.tsx` renders player-card images.
- The Discord interactions route explicitly uses the Node runtime because
  signature verification relies on WebCrypto behavior in that environment.

Keep integration-specific authorization at the boundary that owns it, then
let the database enforce the final state transition. Do not add a new general
API layer just to proxy a Supabase query.

## Authentication and authorization

Supabase Auth owns the session. Discord is the production sign-in provider;
the local login page additionally exposes password sign-in so seeded test and
demo users can be used without Discord.

Authorization has several independent dimensions:

- `profiles.is_admin` and `profiles.is_owner` provide site staff tiers.
- `league_team_captains` maps a profile to a league team and season.
- Database helper functions such as `is_admin()`, `is_owner()`,
  `is_captain()`, and `is_captain_of(...)` are used by policies and RPCs.
- Betting access checks Discord guild membership and roles in
  `src/lib/betting/access.ts`; staff and owner checks are separate from normal
  member access.
- Public token drafts use the token as their capability and keep lobby reads
  and mutations scoped to the lobby/game in the corresponding RPCs.
- Public open-lobby creation is intentionally different from lobby usage:
  `src/lib/match-draft/lobbyActions.ts` checks the premium Discord gate and
  calls the service-role RPC, while the database revokes direct public access
  to `create_open_draft_lobby`.

Presentation helpers such as `fetchStaffTier()` are not security boundaries.
When changing permissions, update the RLS policy, grant/revoke, or RPC check
that actually protects the data and add a database test where appropriate.

## Database organization

The schema is organized by feature, but all domains share the same Supabase
Postgres database and public schema:

| Domain | Main tables/views | Backend behavior |
| --- | --- | --- |
| League and identity | `profiles`, `league_settings`, `league_teams`, `teams`, `riot_accounts`, `roster_memberships`, `league_team_captains`, `fixtures` | Season, tier, roster, captain, team, and schedule configuration. |
| Auction draft | `drafts`, `players`, `lots`, `bids` | Nomination, bidding, countdown settlement, admin overrides, roster assignment, chat, and Nemesis picks are protected by RPCs and RLS. |
| Canonical players and free agency | `player_pool`, `free_agency_avg_bids`, `signups`, `info_resources` | Cross-draft player metadata, free-agency data, signups, and editable information resources. |
| Match reporting and stats | `match_reports`, `match_report_games`, `match_codes`, `raw_stats`, `stats_*` views | Captains report series; the Riot ingester writes raw rows; views provide player, team, champion, record, and game-log aggregates. |
| Betting | `betting_profiles`, `betting_teams`, `betting_events`, `betting_markets`, `betting_bets`, `betting_ledger`, pick'em/store/season tables | Service-role RPCs handle wallet, bet, lock, resolve, cancel, and audit transitions after app-layer Discord/staff checks. |
| Fixture match drafts | `match_drafts`, `match_draft_settings` | Captains draft champions for scheduled fixtures; actions, ready checks, side choice, change requests, winners, and role positions are database-backed. |
| Public match-draft lobbies | `open_draft_lobbies`, `open_drafts` | Token-scoped champion drafts for external/public links, with a premium-gated creation path. |
| Player cards | `card_art_prefs`, `card_snapshots`, `card_rating_history` | User/admin art and motto preferences plus service-written weekly rating baselines/history. |
| Homepage and announcements | `homepage_briefs`, `homepage_featured_settings`, `announcements`, `draft_chat` | Curated or generated homepage copy, featured matchups, operational announcements, and draft chat. |

The exact schema is the ordered SQL in `supabase/migrations/`. Migrations are
append-only: add a new migration for a schema, policy, grant, view, trigger,
or RPC change instead of editing an already-applied migration. Put the
corresponding contract/authorization coverage in `supabase/tests/`.

Important RPC families include:

- Auction: `nominate`, `place_bid`, `close_lot`, `start_draft`,
  `pause_draft`, `resume_draft`, `cancel_lot`, `force_close_lot`, and admin
  assignment/undo functions.
- Stats/reporting: report and side-resolution functions plus the
  `stats_player_agg`, `stats_team_agg`, `stats_champion_agg`, `stats_records`,
  and `stats_game_log` views.
- Betting: `place_bet`, `cashout_bet`, lifecycle/lock functions, and the
  admin create/resolve/cancel/grant functions.
- Match drafts: `apply_match_draft_action`, `set_match_draft_ready`,
  `choose_match_draft_blue`, change/undo/reset functions, and their
  `open_draft_*` token equivalents.

## Realtime behavior

Realtime is a synchronization mechanism, not the authority for a state
transition. The database write/RPC commits first; clients then receive the
change and update their local state.

- `src/hooks/useDraftState.ts` initially fetches the auction rows, subscribes
  to `drafts`, `teams`, `players`, `lots`, and `bids`, and refetches after a
  reconnect. The first client to observe an expired lot may call
  `close_lot`; the RPC is safe to retry and only the database can settle it.
- `src/components/draft/DraftChat.tsx` subscribes to draft-chat inserts and
  deletes.
- `src/components/match-draft/MatchDraftBoard.tsx` combines presence,
  broadcast intent messages, and Postgres changes for fixture and public-lobby
  draft state.
- Realtime tests should assert both the mutation and the other client seeing
  the resulting state. Avoid relying on optimistic UI as proof that a write
  succeeded.

## Scheduled and trusted workflows

| Workflow | Entry point | Writes/side effects |
| --- | --- | --- |
| Nightly match stats | `.github/workflows/ingest-stats.yml` → `scripts/riot_stats_ingest.py --from-reports` | Reads pending reports, fetches Riot matches, writes `raw_stats` with the service key, resolves sides, and marks report games ingested/failed. |
| Weekly Premier brief | `.github/workflows/weekly-brief-premier.yml` → `scripts/generate-homepage-brief.ts --league premier` | Computes facts from Supabase, asks Anthropic for constrained prose, cleans it, and writes `homepage_briefs`. |
| Weekly Academy brief | `.github/workflows/weekly-brief-academy.yml` → same script with `--league academy` | Same flow, narrowed to the Academy season and teams. |
| Weekly cards | `.github/workflows/weekly-card-drop.yml` → `scripts/weekly-card-drop.ts` | Reads current ratings, writes `card_snapshots`/`card_rating_history`, and posts movement/showcase content to Discord. |
| Betting lifecycle | Supabase cron migrations → `supabase/functions/discord-announcer/index.ts` | Locks/resolves/announces betting markets and pick'ems, posts Discord messages, and runs a ledger-drift watchdog. |

Trusted jobs use service-role credentials because they operate across users or
write tables with no normal-user write policy. Keep their secrets in GitHub
Actions/Vercel/Supabase configuration, not in source or client bundles.

## Agent workflow by task type

1. **UI or page change:** start in the route under `src/app/` and its nearby
   component/domain folder. Follow existing server-vs-client boundaries and
   add the focused Vitest/component test next to the implementation.
2. **Business-rule change:** find the domain module in `src/lib/` and its
   tests. If the rule protects shared state or money, confirm whether the
   authoritative check belongs in a Postgres RPC as well.
3. **Database or permission change:** inspect the latest related migration,
   add a new migration and pgTAP test, then verify grants/RLS for anon,
   authenticated, and service-role callers.
4. **Realtime change:** inspect the subscription and initial-fetch path
   together. Test reconnect/catch-up and the behavior of a second browser.
5. **External or scheduled integration:** update the script/Edge Function,
   its workflow/configuration, the required secret list, and a safe local
   or unit test path.

Before handing off, run the narrow tests first, then `npm run lint`, `npm test`,
`npm run build`, and `npx supabase test db` when the change touches the
database. Run `npm run e2e` for auction, betting, or other multi-browser
flows when Docker/Supabase is available.

## Common pitfalls

- Never use `SUPABASE_SERVICE_ROLE_KEY` in a Client Component or a
  `NEXT_PUBLIC_*` variable.
- Do not treat an `is_admin` value fetched for display as authorization; the
  database policy/RPC must enforce the operation.
- Do not write betting balance/ledger transitions as a sequence of ordinary
  table updates. Use the existing betting RPCs and service-client/auth gates.
- Do not bypass the RPC for auction or match-draft state transitions just to
  make a UI action appear faster.
- Do not edit an old migration to repair a cloud database. Add a forward
  migration and a regression test.
- When a stats row has no `team_name`, the stats views intentionally handle it
  as unknown rather than inventing a team. Use the report-side resolution or
  the documented `--team-map`/backfill path.
- Keep `playwright.config.ts` at one worker: the e2e fixtures share one local
  database and the auction test relies on two browser contexts.
