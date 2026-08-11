# League Stats System — Supabase + Stats Tab

**Date:** 2026-08-10
**Status:** Approved (Option A: SQL views + thin client)
**Scope:** Phase 1: import historical stats into Supabase and build the full Stats tab (all nine legacy sections). Phase 2 (same spec): rewrite the Python ingester to write to Supabase. Phase 3 (Discord automation) is OUT of scope — separate spec later.

## Source data (verified)

- `raw_stats.sql` (repo root, uncommitted): CREATE TABLE `public.raw_stats` (137 snake_case columns) + 3,360 insert rows = 335 games, 182 summoners, 8 FPL teams, seasons S1–S4 with phases Regular/Playoffs, dates 2025-08-11 → 2026-04-27. `team_name`, `season`, `season_phase` are populated.
- `updated_stats.py` (repo root, uncommitted): Riot API extractor (match ids → 137-col rows). Currently writes to Google Sheets. **Line 30 hardcodes a Riot API key — the user must regenerate it; the key never gets committed.**
- Legacy dashboard (formula reference): `docs/reference/FPL_Stats_legacy.html` (downloaded copy of the GitHub Pages site). Its JavaScript defines the exact formulas for Power Rankings, MVP, Scouting metrics, etc. **Port formulas from it; do not invent.**
- Decision: **Supabase becomes the source of truth.** Google Sheet retires after import.

## Architecture (Option A)

- **Migration** `supabase/migrations/<ts>_raw_stats.sql`: the `raw_stats` table exactly as in the user's file (schema only, no data), match_id + summoner_name indexes, a unique index on `(match_id, summoner_name)` (the ingester's dedupe key), RLS enabled with public `select` policy, no write policies (service_role only via its blanket grant; explicitly revoke insert/update/delete from anon/authenticated per the project's least-privilege grants pattern).
- **Views** (their own migration, after the table migration): one SQL view per dashboard concern, each grouping by season/phase so the client filters cheaply:
  - `stats_player_agg` — per summoner+season+phase (+role mode): games, winrate, avg K/D/A, KDA, KP%, CS/min, gold/min, dmg/min, dmg share, vision/min, solo kills, plates, multikills, etc. (every stat the legacy Leaderboard/Player Lookup/Comparison sections display).
  - `stats_team_agg` — per team_name+season+phase: games, wins, losses, winrate, avg game length, objective rates (dragons/barons/towers/first-blood %).
  - `stats_champion_agg` — per champion+season+phase: picks, wins, winrate, avg KDA, plus ban counts (from ban_1..ban_5, counted per game not per player-row) and pick+ban rate against games played.
  - `stats_records` — single-game bests (top N rows per stat category: kills, damage, CS, vision, healing, tanking, multikills, KDA, gold…), with player/champion/match context.
  - `stats_game_log` — per match_id: date, teams, sides, winner, duration, season/phase (feeds Timeline).
  - Power Rankings / MVP / Scouting read from `stats_player_agg` + dedicated views only if the legacy formulas need columns the aggregate lacks; the weighting math ports into a typed TS module `src/lib/stats/formulas.ts` (unit-tested against legacy numbers) so the weights are visible and tweakable.
- **Data load**: one-time conversion of `raw_stats.sql`'s insert rows into `scripts/data/raw_stats.json` (committed; compresses well in git), then `scripts/load-stats.ts` (tsx) bulk-inserts that JSON via the service key in batches of 500 with on-conflict-do-nothing on (match_id, summoner_name). The same loader works for local dev and production (env-driven, same resolveConfig pattern as seed-demo.ts). After conversion, `raw_stats.sql` is deleted from the repo root — its schema lives in the migration, its data in the JSON.
- **Stats page** `/stats`: replaces the ComingSoonPage. Brand-styled tab bar (same chip pattern as PlayerPool filters): Leaderboard · Teams · Champions · Records · MVP · Power Rankings · Timeline · Scouting · Player Lookup. Shared season/phase selector (defaults to newest season, "All seasons" option). Each tab is a focused client component fetching its view via the anon client (public read). Tables use the brand table styling (steel headers, line separators, gold highlights for leaders); mobile gets horizontal-scroll containers.
  - Leaderboard: min-games filter (1/3/5/8/10), role filter, team filter, name search, sortable columns, top/bottom-10 toggle, compare-up-to-3-players drawer.
  - Player Lookup & Scouting: per-player deep dive (all aggregates + laning: CS@10/gold@10/xp@10 diffs, plates, level-6 timing) — combined into one "Players" detail view reached from Leaderboard row click, matching legacy content.
  - MVP & Power Rankings: computed in `formulas.ts` from fetched aggregates, weights identical to legacy.
  - Timeline: game-night narrative — game log grouped by date with winners/notable records.
- **Python ingester rewrite** (`updated_stats.py`, moved to `scripts/riot_stats_ingest.py`): Google Sheets code (gspread, credentials.json) removed; writes rows to Supabase REST `raw_stats` (service key) with on-conflict-ignore; keys from env (`RIOT_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) via python-dotenv; match ids come from CLI args (`python scripts/riot_stats_ingest.py NA1_123 NA1_456`) or `--dates 2026-08-11 …` mode; column mapping mirrors the migration's 137 columns; Yes/No → boolean, Win/Loss → boolean, blanks → null. A `--dry-run` flag prints instead of writing. requirements comment at top (requests, python-dotenv, supabase not needed — plain REST).
- **Secrets:** `.env` stays gitignored; `.env.example` gains the two new names (values blank). The old hardcoded Riot key is called out for regeneration.

## Constraints

- Existing app untouched except: `/stats` page + nav already exists (tab in SiteNavigation — no nav changes needed), new components under `src/components/stats/`, new lib under `src/lib/stats/`.
- Gates: `npm run build`, `npm run lint` exit 0, `npm test`, `npx supabase test db` (new pgTAP file for view math on fixture rows), `npm run e2e` untouched and green.
- Numbers must match legacy: spot-check at least 3 players' leaderboard lines and 1 power ranking against `docs/reference/FPL_Stats_legacy.html` rendered locally.
- Production rollout order: migration push → data load → Vercel auto-deploy of the page (page tolerates empty table with a branded empty state).

## Out of scope

Discord match-report automation (phase 3); stats for drafts run on this site (auction data is separate); editing stats via UI; per-game detail pages beyond what Timeline/records show; Riot key rotation mechanics.
