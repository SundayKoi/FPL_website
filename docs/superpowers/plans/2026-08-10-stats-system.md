# Stats System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** League stats live in Supabase (335 historical games imported, Python ingester writes future games) and the Stats tab shows all nine legacy dashboard sections with numbers matching the old page.

**Architecture:** Migration for the 137-column `raw_stats` table + a views migration that pre-aggregates per section; the page fetches small per-tab results with the anon client. Legacy formulas (Power Rankings/MVP/Scouting) port from `docs/reference/FPL_Stats_legacy.html` into a tested TS module. Data loads via a committed JSON + tsx loader (local AND prod). Python ingester swaps Google Sheets for Supabase REST.

**Tech Stack:** Existing Next.js 16 + Tailwind brand system, Supabase (Postgres views, RLS), pgTAP, Vitest, Python 3 (requests + python-dotenv only).

**Spec:** `docs/superpowers/specs/2026-08-10-stats-system-design.md` — read first. Legacy formula reference: `docs/reference/FPL_Stats_legacy.html`.

## Global Constraints

- `raw_stats` schema comes from the repo-root `raw_stats.sql` file VERBATIM (137 columns, snake_case) — do not rename or retype columns; add `id` identity PK as in that file plus a UNIQUE index on `(match_id, summoner_name)`.
- RLS: public `select` for anon+authenticated; NO insert/update/delete for anon/authenticated (explicit revokes, matching migration 0007's least-privilege pattern); service_role retains full access via existing blanket grant.
- Views are named exactly: `stats_player_agg`, `stats_team_agg`, `stats_champion_agg`, `stats_records`, `stats_game_log` — all include `season` and `season_phase` columns for client filtering.
- Formulas must match the legacy page (`docs/reference/FPL_Stats_legacy.html`) — port, don't invent. Spot-check tolerance: exact for counts/sums, ±0.01 for rounded averages.
- Secrets: nothing hardcoded; `.env` gitignored; `.env.example` documents names only. The user's Riot key seen in `updated_stats.py` is compromised-by-history — note it in the README section, never commit it.
- Gates for every task: `npm run build` clean, `npm run lint` exit 0, `npm test` green, `npx supabase test db` green; `npm run e2e` must stay green (run in Tasks 4 and 8 which touch shared surface, plus final).
- New UI files live under `src/components/stats/` and `src/lib/stats/`; use existing brand utilities (`card-brand`, `label-dash`, `type-display`, tokens, chip pattern from PlayerPool).
- Commits: conventional style ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Production rollout happens ONLY in Task 9 (push migrations, load data) and targets project ref `tyywoneobreracfnujdk` exclusively. The "Draft League" project (`jmhgextkwsaodtnjtvvp`) must never be touched.

## File Structure

```
supabase/migrations/20260810100001_raw_stats.sql        (Task 1 — table+indexes+RLS)
supabase/migrations/20260810100002_stats_views.sql      (Task 2 — five views)
supabase/tests/0016_raw_stats_test.sql                  (Task 1)
supabase/tests/0017_stats_views_test.sql                (Task 2)
scripts/data/raw_stats.json                             (Task 1 — converted rows, committed)
scripts/convert-raw-stats.ts                            (Task 1 — one-shot sql→json converter, committed for provenance)
scripts/load-stats.ts                                   (Task 1 — batched loader, local+prod)
src/lib/stats/types.ts                                  (Task 3 — view row types)
src/lib/stats/formulas.ts                               (Task 3 — power ranking / MVP / scouting math)
src/lib/stats/formulas.test.ts                          (Task 3)
src/lib/stats/queries.ts                                (Task 4 — typed fetchers per view)
src/app/stats/page.tsx                                  (Task 4 — replaces ComingSoonPage)
src/components/stats/StatsTabs.tsx                      (Task 4 — tab bar + season/phase selector + tab routing)
src/components/stats/SeasonSelect.tsx                   (Task 4)
src/components/stats/LeaderboardTab.tsx                 (Task 4 — filters/sort/search/compare)
src/components/stats/CompareDrawer.tsx                  (Task 4)
src/components/stats/TeamsTab.tsx                       (Task 5)
src/components/stats/ChampionsTab.tsx                   (Task 5)
src/components/stats/RecordsTab.tsx                     (Task 5)
src/components/stats/MvpTab.tsx                         (Task 6)
src/components/stats/PowerRankingsTab.tsx               (Task 6)
src/components/stats/TimelineTab.tsx                    (Task 6)
src/components/stats/PlayerDetail.tsx                   (Task 7 — lookup + scouting)
scripts/riot_stats_ingest.py                            (Task 8 — replaces updated_stats.py)
```

Deleted along the way: repo-root `raw_stats.sql` (Task 1), repo-root `updated_stats.py` (Task 8).

---

### Task 1: `raw_stats` migration + data conversion + loader (local import)

**Files:**
- Create: `supabase/migrations/20260810100001_raw_stats.sql`, `scripts/convert-raw-stats.ts`, `scripts/data/raw_stats.json`, `scripts/load-stats.ts`
- Delete: `raw_stats.sql` (repo root, after conversion)
- Test: `supabase/tests/0016_raw_stats_test.sql`

**Interfaces:**
- Produces: table `public.raw_stats` (137 cols per root file + `id` PK, unique `(match_id, summoner_name)`); `scripts/load-stats.ts` runnable via `npx tsx scripts/load-stats.ts` (env-driven target, same resolveConfig pattern as `scripts/seed-demo.ts`; `--truncate` flag optional for reload); `scripts/data/raw_stats.json` = array of 3,360 objects keyed by column name.

- [ ] **Step 1: Failing pgTAP test** — `supabase/tests/0016_raw_stats_test.sql`, `plan(7)`: `has_table('public','raw_stats',…)`; `ok(has_table_privilege('anon','public.raw_stats','select'))`; `ok(not has_table_privilege('anon','public.raw_stats','insert'))`; `ok(not has_table_privilege('authenticated','public.raw_stats','insert'))`; RLS enabled check via `pg_class.relrowsecurity`; unique-index existence on `(match_id, summoner_name)` via `pg_indexes` LIKE check; `has_column('public','raw_stats','season',…)`. Run `npx supabase test db` → new file fails, existing 193 stay green.
- [ ] **Step 2: Migration** — copy the CREATE TABLE from root `raw_stats.sql` verbatim; append: `create unique index raw_stats_match_summoner_key on public.raw_stats (match_id, summoner_name);`, `alter table public.raw_stats enable row level security;`, `create policy raw_stats_public_read on public.raw_stats for select using (true);`, `grant select on public.raw_stats to anon, authenticated;`, `revoke insert, update, delete on public.raw_stats from anon, authenticated;`. `npx supabase db reset` + `npx supabase test db` → green (note: reset drops the ad-hoc table loaded during brainstorming — expected).
- [ ] **Step 3: Converter** — `scripts/convert-raw-stats.ts`: reads root `raw_stats.sql`, extracts the column list from the `insert into public.raw_stats (…) values` header and each parenthesized tuple (a real tokenizer over quotes/escapes — handle `''` escaping, `null`, booleans, numbers), emits `scripts/data/raw_stats.json`. Log row/column counts; assert 3360 rows × 137 cols, abort otherwise. Run it; commit the JSON.
- [ ] **Step 4: Loader** — `scripts/load-stats.ts`: resolveConfig (env `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, else `npx supabase status -o json`), reads the JSON, POSTs in batches of 500 to `/rest/v1/raw_stats` with `Prefer: resolution=ignore-duplicates` (needs the unique index — on-conflict dedupe), logs inserted/skipped totals, exits nonzero on any batch error. Run against LOCAL → verify `select count(*) from raw_stats` = 3360 via psql; run again → 0 new (idempotent). Delete root `raw_stats.sql`.
- [ ] **Step 5: Gates + commit** — full gates; commit `feat: raw_stats table, converter, loader; import historical stats locally`.

### Task 2: Stats views migration

**Files:**
- Create: `supabase/migrations/20260810100002_stats_views.sql`
- Test: `supabase/tests/0017_stats_views_test.sql`

**Interfaces:**
- Consumes: `raw_stats` (Task 1).
- Produces (columns the UI relies on — keep names exact):
  - `stats_player_agg`: summoner_name, tag, season, season_phase, role_mode (most-played role), games, wins, winrate_pct, avg_kills, avg_deaths, avg_assists, kda, avg_kp_pct, avg_cs_per_min, avg_gold_per_min, avg_dmg_per_min, avg_dmg_share_pct, avg_vision_per_min, avg_solo_kills, total_solo_kills, total_plates, total_doubles, total_triples, total_quadras, total_pentas, avg_cs_at_10, avg_gold_at_10, avg_xp_at_10, avg_dmg_taken_per_min, avg_kda_challenges, first_blood_involvements, avg_game_duration.
  - `stats_team_agg`: team_name, season, season_phase, games, wins, losses, winrate_pct, avg_duration_min, dragon_rate, baron_rate, first_blood_rate, first_tower_rate, avg_team_kills.
  - `stats_champion_agg`: champion, season, season_phase, picks, wins, winrate_pct, avg_kda, bans (count of games where champion appears in either team's ban_1..ban_5 — count per match_id, not per player row: derive from a per-game dedup CTE), games_in_scope (distinct match_id count for that season/phase), presence_pct ((picks/5 games… careful: picks is player-rows = games picked; presence = (games_picked + games_banned)/games_in_scope*100).
  - `stats_records`: category (text like 'Most Kills'), summoner_name, champion, team_name, season, season_phase, match_id, game_date, value (numeric) — top 5 per category via `row_number()` window, categories: kills, deaths, assists, kda, total_damage_to_champions, damage_per_min, cs, cs_per_min, gold_earned, vision_score, total_healing, damage_taken, solo_kills, largest_killing_spree, largest_multi_kill, turret_plates_destroyed.
  - `stats_game_log`: match_id, game_date, season, season_phase, duration_min, blue_team (team_name of side Blue), red_team, winner_team, total_kills.
- All averages `round(...::numeric, 2)`. Winrates `round(100.0*wins/games, 1)`.

- [ ] **Step 1: Failing pgTAP test** — `plan(10)`: five `has_view` checks; then math on fixture rows: insert (as superuser) 4 synthetic raw_stats rows in a temp season 'ZZ' (2 games, one summoner 'TestGuy' winning 1 of 2 → assert `stats_player_agg` games=2, winrate_pct=50.0; kda math check), champion ban counting (ban_1='Ahri' on both team rows of one game → `stats_champion_agg` bans for Ahri in 'ZZ' = 1 not 2), a records category presence check, game_log winner check. Run → fails (views missing).
- [ ] **Step 2: Write the views migration** — implement per Interfaces. Player agg groups by (summoner_name, tag, season, season_phase) plus an "All"-seasons variant NOT needed in SQL — client sends season filter or omits it; provide season-level rows only, the client aggregates "all seasons" by an extra view? NO — keep one view; for "All seasons" the client queries `stats_player_agg` without season filter and the page displays per-season rows summed client-side ONLY for the leaderboard count columns; averages use games-weighted means computed in `formulas.ts` (`combineSeasonRows`). Document this in the migration comment.
- [ ] **Step 3: Reset + tests green.** Reload data (`npx tsx scripts/load-stats.ts`) after reset. Sanity queries: top-5 by kda season S4 prints plausibly.
- [ ] **Step 4: Gates + commit** `feat: stats aggregate views`.

### Task 3: Formula module ported from legacy page

**Files:**
- Create: `src/lib/stats/types.ts`, `src/lib/stats/formulas.ts`
- Test: `src/lib/stats/formulas.test.ts`

**Interfaces:**
- Consumes: `docs/reference/FPL_Stats_legacy.html` — READ its `<script>` section first; locate the Power Rankings weights, MVP scoring, and Scouting derived metrics. Port exactly (weights, normalizations, minimum-game gates).
- Produces: `types.ts` exports `PlayerAggRow`, `TeamAggRow`, `ChampionAggRow`, `RecordRow`, `GameLogRow` (mirror Task 2 columns); `formulas.ts` exports `powerRanking(rows: PlayerAggRow[]): RankedPlayer[]`, `mvpScores(rows: PlayerAggRow[]): MvpEntry[]`, `scoutingProfile(row: PlayerAggRow): ScoutingProfile`, `combineSeasonRows(rows: PlayerAggRow[]): PlayerAggRow` (games-weighted merge for "All seasons"), each with doc comments citing the legacy source line ranges.

- [ ] **Step 1: Extract legacy formulas** — read the HTML's JS; write, in the test file as comments, the legacy formula snippets you're porting (traceability). Write failing tests: known-input synthetic rows with hand-computed expected outputs, PLUS one regression fixture: take 2 real players' aggregate rows (query local DB) and the ranking/MVP values the legacy page shows for them (compute by executing the legacy formula by hand on the same aggregates) — asserted to ±0.01.
- [ ] **Step 2: Implement.** `npm test` green.
- [ ] **Step 3: Gates + commit** `feat: stats formulas ported from legacy dashboard`.

### Task 4: Stats page shell + Leaderboard tab

**Files:**
- Create: `src/lib/stats/queries.ts`, `src/components/stats/StatsTabs.tsx`, `SeasonSelect.tsx`, `LeaderboardTab.tsx`, `CompareDrawer.tsx`
- Modify: `src/app/stats/page.tsx` (drop ComingSoonPage)

**Interfaces:**
- Consumes: views (Task 2), types/formulas (Task 3), brand utilities, `createClient` from `@/lib/supabase/client`.
- Produces: `queries.ts` exports `fetchPlayerAgg(season?: string, phase?: string): Promise<PlayerAggRow[]>` and same-shaped fetchers for the other four views; `StatsTabs` renders tab chips (Leaderboard · Teams · Champions · Records · MVP · Power Rankings · Timeline · Players) + `SeasonSelect` (seasons from `stats_game_log` distinct, default newest, plus "All seasons"; phase All/Regular/Playoffs) and passes `{season, phase}` to the active tab component. Tabs render lazily (only active tab fetches). NOTE: legacy's "Scouting"+"Player Lookup" merge into the "Players" tab (Task 7); Task 4 ships shell + Leaderboard with the other tabs stubbed as branded "Coming in this build" placeholders that Tasks 5–7 replace.
- Leaderboard requirements: min-games chips (1/3/5/8/10 — default 3), role filter chips (from role_mode), team filter dropdown, name search, sortable column headers (client sort), top/bottom-10 toggle, compare: row checkboxes (max 3) opening `CompareDrawer` (side-by-side stat table). Mobile: table inside `overflow-x-auto`.

- [ ] Steps: build queries.ts → shell → leaderboard → verify in browser against local data (screenshot; check a couple of numbers vs psql queries) → full gates incl. one `npm run e2e` → commit `feat: stats page shell and leaderboard`.

### Task 5: Teams, Champions, Records tabs

**Files:** Create `TeamsTab.tsx`, `ChampionsTab.tsx`, `RecordsTab.tsx`; wire into StatsTabs.

Teams: standings table (wins/losses/winrate, objective rates as %). Champions: sortable table (picks, bans, presence %, winrate, avg KDA) + min-picks filter (1/3/5). Records: category cards (grid, `card-brand`) each listing its top-5 with player/champion/date context, gold value highlight. Verify vs psql spot checks; screenshot; gates; commit `feat: stats teams, champions, records tabs`.

### Task 6: MVP, Power Rankings, Timeline tabs

**Files:** Create `MvpTab.tsx`, `PowerRankingsTab.tsx`, `TimelineTab.tsx`; wire in.

MVP + Power Rankings feed `stats_player_agg` rows through Task 3's formulas — ranked lists with score breakdown bars (title treatment for #1: `type-display` + gold). Timeline: `stats_game_log` grouped by game night (date), each night a `card-brand` with its games (blue vs red, winner gold, duration), newest first, season-filtered like all tabs. Verify + screenshot; gates; commit `feat: stats mvp, power rankings, timeline tabs`.

### Task 7: Players tab (lookup + scouting detail)

**Files:** Create `PlayerDetail.tsx`; modify `LeaderboardTab.tsx` (row click → detail) and `StatsTabs.tsx` (Players tab = searchable player list reusing leaderboard data, click → `PlayerDetail`).

PlayerDetail sections (single player, season-filtered): identity header (name#tag, team(s), role mode, games/winrate); core averages grid; laning block (CS@10/Gold@10/XP@10 vs season average of same role — deltas colored); scouting block from `scoutingProfile()` (strengths/weaknesses per legacy logic); records held (filter `stats_records` by player); recent games (from raw_stats last 10 rows for the player: date, champion, K/D/A, result — one direct `raw_stats` select with limit). Verify vs legacy page for 2 players; screenshot; gates; commit `feat: player detail with scouting profile`.

### Task 8: Python ingester → Supabase

**Files:** Create `scripts/riot_stats_ingest.py`; delete root `updated_stats.py`; modify `.env.example` (add `RIOT_API_KEY=`, `SUPABASE_URL=`, `SUPABASE_SERVICE_ROLE_KEY=` with comments).

Port from `updated_stats.py`: keep Riot fetching (match details, timeline parsing, bans, objectives, all 137 stat mappings — reuse its extraction functions, converting the row-array into a dict keyed by the migration's snake_case column names; Yes/No→bool, Win/Loss→bool win, ''→None). Remove gspread/credentials entirely. Add: env via python-dotenv (no hardcoded keys — REFUSE to run if env missing, printing which); CLI `python scripts/riot_stats_ingest.py NA1_123 …` and `--dates 2026-08-11 2026-08-18` mode (existing window logic); `--dry-run` prints the first row dict + row count instead of POSTing; writer POSTs to `{SUPABASE_URL}/rest/v1/raw_stats` in batches with `Prefer: resolution=ignore-duplicates`, service key headers; `--season S5 --phase Regular` args fill the season columns (they were manual in the sheet). Column-mapping correctness test: a pytest-style single file `scripts/test_riot_stats_ingest.py` (runnable `python -m pytest scripts/ -q` if pytest present, else plain `python scripts/test_riot_stats_ingest.py`) feeding a saved sample match JSON (construct a minimal synthetic match_data dict in the test) through the mapper asserting key columns land in the right fields. e2e + full gates (node side unaffected but run anyway); update README "Stats" section: how to run the ingester after game day + the Riot-key regeneration warning. Commit `feat: riot stats ingester writes to Supabase`.

### Task 9: Verification + production rollout

- [ ] Legacy comparison: open `docs/reference/FPL_Stats_legacy.html` in the scratch browser; record 3 players' leaderboard lines + top-3 power ranking; compare to local /stats — within tolerance (exact counts, ±0.01 averages). Any mismatch → fix formulas (they, not the views, are the likely culprit) before proceeding.
- [ ] Full gates + screenshot sweep of all 8 tabs + player detail (desktop + one mobile-width shot each for Leaderboard/Records).
- [ ] Production: `npx supabase db push` (verify link ref `tyywoneobreracfnujdk` FIRST via `npx supabase projects list`; NEVER `jmhgextkwsaodtnjtvvp`); then `npx tsx scripts/load-stats.ts` against prod (env: prod URL + service key via `npx supabase projects api-keys --project-ref tyywoneobreracfnujdk`); verify count 3360 via REST; visit the live /stats after Vercel deploys (auto on push) and spot-check one number.
- [ ] Commit any fixes; push main.

---

## Self-Review Notes

- Spec coverage: table+RLS (T1), data load local (T1) & prod (T9), five views (T2), formulas ported+tested (T3), all nine legacy sections → 8 tabs (Scouting+Lookup merged, per spec's "combined into one Players detail view") (T4–T7), season/phase selector default newest (T4), Python ingester env-driven with dry-run + season args (T8), Riot key warning (T8 README), empty-state tolerance (T4 shell renders branded empty state when a view returns no rows — leaderboard requirement), gates incl. e2e (T4, T8, T9), legacy number-match (T3 regression + T9 comparison), rollout order migration→data→page (T9; page ships earlier but tolerates empty prod table until T9 runs — acceptable since /stats currently shows Coming Soon in prod until this branch merges).
- Placeholder scan: Task 4–7 are prose-specced (UI tasks, consistent with prior plans' accepted style); all SQL and numeric contracts are explicit. No TBDs.
- Type consistency: view/column names in T2 Interfaces match T3 types and T4 queries; loader flags and env names consistent across T1/T8/T9.
