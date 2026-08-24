# Weekly Betting Market Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate the complete Premier and Academy betting slate every Tuesday at 1:00 AM Eastern from the following Monday's fixtures, matching the existing manual market defaults without duplicates or partial runs.

**Architecture:** Add explicit schedule bindings to reusable betting events and a unique fixture link to automated markets. A service-role-only transactional Postgres generator validates both leagues, maps fixture teams through the active drafts into the curated betting catalog, and inserts the complete slate; two UTC Supabase Cron jobs call a timezone-guarded wrapper so daylight-saving changes still produce one Eastern 1:00 AM run.

**Tech Stack:** PostgreSQL 17, Supabase migrations and Cron (`pg_cron`), pgTAP, Next.js 16.3 Server Actions and Client Components, React 19, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-24-weekly-betting-market-automation-design.md`

## Global Constraints

- Read the spec above, `README.md`, `docs/backend.md`, and the repository `AGENTS.md` before implementation.
- Before changing the admin Server Action or Client Component, re-read `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` and `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`; Next.js 16.3 behavior is authoritative.
- Follow `.agents/skills/supabase/SKILL.md` and `.agents/skills/supabase-postgres-best-practices/SKILL.md`, especially `schema-constraints.md`, `schema-foreign-key-indexes.md`, `query-partial-indexes.md`, `lock-advisory.md`, and `security-privileges.md`.
- This repository uses imperative, append-only migrations. Run `npx supabase migration new betting_schedule_links` and `npx supabase migration new weekly_betting_market_generator` before authoring their respective migrations; never edit an applied migration.
- The current migration sequence ends at `20260827000006`. After the CLI creates each empty migration, confirm the two exact destination names below do not exist, then rename the generated empty files to `20260827000007_betting_schedule_links.sql` and `20260827000008_weekly_betting_market_generator.sql` so fresh resets and deployed migration history stay monotonic.
- Preserve the unrelated working-tree changes currently in `src/app/support-devs/page.test.tsx`, `src/components/info/SupportDevSection.tsx`, `.agents/`, and `skills-lock.json`; never stage them with this feature.
- Keep `betting_events` and `betting_teams` curated. The generator must fail rather than create either catalog record.
- Reuse season events; do not create weekly events. Current backfills are `Premier S5 -> (premier, S5)` and `Academy S1 -> (academy, A1)`.
- Generated markets are zero-rake, no-draw, titled `CODE_A vs CODE_B`, scheduled at the fixture kickoff, and locked by the existing five-minute convention.
- One database transaction covers Premier and Academy. Any validation error must leave both leagues unchanged.
- No function added by this feature may be executable by `public`, `anon`, or `authenticated`; only `service_role` and the owning `postgres`/Cron context may execute it.
- Use strict TDD: write each behavioral test first, run it and observe the intended failure, then add the smallest production change that makes it pass.

## File Structure

- Create `supabase/migrations/20260827000007_betting_schedule_links.sql` for event binding columns, fixture provenance, constraints, indexes, and current-event backfills.
- Create `supabase/tests/0064_betting_schedule_links_test.sql` for schema, constraint, uniqueness, deletion, and privilege-independent data contracts.
- Create `supabase/migrations/20260827000008_weekly_betting_market_generator.sql` for the core generator, Eastern-time Cron wrapper, grants, and two Cron schedules.
- Create `supabase/tests/0065_weekly_betting_market_generator_test.sql` for generation, mapping, atomicity, idempotency, DST, mismatch, privilege, and Cron contracts.
- Modify `src/lib/betting/types.ts` to define the shared `BettingEvent` shape used at the server/client boundary.
- Modify `src/lib/betting/admin-actions.ts` and `src/lib/betting/admin-actions.test.ts` to validate, normalize, persist, and audit optional event schedule bindings.
- Modify `src/app/admin/betting/catalog/page.tsx` to pass complete `BettingEvent` rows into the interactive catalog.
- Modify `src/components/admin/betting/CatalogAdmin.tsx` and create `src/components/admin/betting/CatalogAdmin.test.tsx` for the binding controls and visible binding labels.
- Modify `docs/backend.md` for architecture and operations.

---

### Task 1: Add Schedule Linkage Contracts

**Files:**
- Create: `supabase/tests/0064_betting_schedule_links_test.sql`
- Create via Supabase CLI, then populate: `supabase/migrations/20260827000007_betting_schedule_links.sql`

**Interfaces:**
- Consumes: existing `public.betting_events`, `public.betting_markets`, and `public.fixtures` tables.
- Produces: `betting_events.league text`, `betting_events.schedule_season text`, and `betting_markets.fixture_id uuid`; unique partial indexes `betting_events_schedule_binding_uidx` and `betting_markets_fixture_id_uidx`.

- [ ] **Step 1: Confirm the local database is available and inspect CLI syntax**

Run:

```bash
npx supabase status
npx supabase migration new --help
npx supabase test db --help
```

Expected: the local stack reports healthy services, and the CLI confirms the migration/test commands before they are used.

- [ ] **Step 2: Write the failing schema contract test**

Create `supabase/tests/0064_betting_schedule_links_test.sql` with a transaction and literal pgTAP assertions covering the observable contracts:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select has_column('public', 'betting_events', 'league', 'betting events can bind to a league');
select has_column('public', 'betting_events', 'schedule_season', 'betting events can bind to a fixture season');
select has_column('public', 'betting_markets', 'fixture_id', 'betting markets record their source fixture');

insert into public.betting_events(name, league, schedule_season)
values ('Unbound event', null, null), ('Premier Test', 'premier', 'S99');

select lives_ok(
  $$ insert into public.betting_events(name) values ('Manual props') $$,
  'manual events remain unbound'
);
select throws_ok(
  $$ insert into public.betting_events(name, league) values ('Half bound', 'academy') $$,
  '23514', null, 'an event cannot bind only a league'
);
select throws_ok(
  $$ insert into public.betting_events(name, schedule_season) values ('Half bound', 'A99') $$,
  '23514', null, 'an event cannot bind only a season'
);
select throws_ok(
  $$ insert into public.betting_events(name, league, schedule_season) values ('Bad league', 'challenger', 'S99') $$,
  '23514', null, 'only Premier and Academy are accepted'
);
select throws_ok(
  $$ insert into public.betting_events(name, league, schedule_season) values ('Duplicate binding', 'premier', 'S99') $$,
  '23505', null, 'one event owns a league-season binding'
);

insert into public.fixtures(season, stage, team_a, team_b, scheduled_at, best_of)
values ('S99', 'week_1', 'Alpha', 'Bravo', '2026-09-08 00:00:00+00', 3)
returning id \gset source_
insert into public.betting_teams(name, short_code) values ('Alpha', 'ALP') returning id \gset a_
insert into public.betting_teams(name, short_code) values ('Bravo', 'BRV') returning id \gset b_
insert into public.betting_markets(event_id, team_a_id, team_b_id, title, game_at, lock_at, fixture_id)
select id, :a_id, :b_id, 'ALP vs BRV', '2026-09-08 00:00:00+00', '2026-09-07 23:55:00+00', :source_id
from public.betting_events where name = 'Premier Test';

select throws_ok(
  $$ insert into public.betting_markets(event_id, team_a_id, team_b_id, title, game_at, lock_at, fixture_id)
     select id, :a_id, :b_id, 'duplicate', '2026-09-08 00:00:00+00', '2026-09-07 23:55:00+00', :source_id
     from public.betting_events where name = 'Premier Test' $$,
  '23505', null, 'one automated market is allowed per fixture'
);

delete from public.fixtures where id = :source_id;
select is(
  (select fixture_id from public.betting_markets where title = 'ALP vs BRV'),
  null::uuid,
  'deleting a fixture preserves market history and clears provenance'
);
select ok(
  exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'betting_events_schedule_binding_uidx'),
  'event bindings have a partial unique index'
);
select ok(
  exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'betting_markets_fixture_id_uidx'),
  'fixture provenance has an indexed unique lookup'
);
select is(
  (select count(*) from public.betting_events where league is null and schedule_season is null and name in ('Unbound event', 'Manual props')),
  2::bigint,
  'unbound event rows remain valid'
);

select * from finish();
rollback;
```

Before running, count the assertions once and keep `plan(13)` synchronized if the final literal test body changes.

- [ ] **Step 3: Run the new pgTAP test and observe RED**

Run:

```bash
npx supabase test db --local supabase/tests/0064_betting_schedule_links_test.sql
```

Expected: FAIL because `betting_events.league`, `betting_events.schedule_season`, and `betting_markets.fixture_id` do not exist.

- [ ] **Step 4: Create the forward migration with the CLI**

Run:

```bash
npx supabase migration new betting_schedule_links
```

Expected: the CLI prints one newly created empty migration. Confirm `supabase/migrations/20260827000007_betting_schedule_links.sql` does not already exist, then rename only that printed empty file to the exact monotonic destination. Do not modify any older migration.

- [ ] **Step 5: Implement the minimal schema migration**

Populate `supabase/migrations/20260827000007_betting_schedule_links.sql` with:

```sql
alter table public.betting_events
  add column league text,
  add column schedule_season text;

alter table public.betting_events
  add constraint betting_events_league_check
    check (league is null or league in ('premier', 'academy')),
  add constraint betting_events_schedule_binding_complete_check
    check ((league is null) = (schedule_season is null)),
  add constraint betting_events_schedule_season_normalized_check
    check (schedule_season is null or (
      schedule_season = upper(trim(schedule_season)) and schedule_season <> ''
    ));

create unique index betting_events_schedule_binding_uidx
  on public.betting_events(league, schedule_season)
  where league is not null and schedule_season is not null;

alter table public.betting_markets
  add column fixture_id uuid references public.fixtures(id) on delete set null;

create unique index betting_markets_fixture_id_uidx
  on public.betting_markets(fixture_id)
  where fixture_id is not null;
```

Then add a data backfill driven by `league_settings`, not hard-coded event IDs:

```sql
update public.betting_events e
set league = 'premier', schedule_season = s.current_season
from public.league_settings s
where s.id = 1
  and lower(trim(e.name)) = lower('Premier ' || s.current_season)
  and e.league is null and e.schedule_season is null;

update public.betting_events e
set league = 'academy', schedule_season = s.academy_season
from public.league_settings s
where s.id = 1
  and lower(trim(e.name)) = lower('Academy S' || substring(s.academy_season from 2))
  and e.league is null and e.schedule_season is null;
```

Keep columns nullable so manual/prop events and markets continue to work. The partial unique `fixture_id` index also supplies the required index for the new foreign key.

- [ ] **Step 6: Reset the local database and verify GREEN**

Run:

```bash
npx supabase db reset
npx supabase test db --local supabase/tests/0064_betting_schedule_links_test.sql
```

Expected: reset succeeds and the new test reports all assertions passing.

- [ ] **Step 7: Review and commit the linkage contract**

Run:

```bash
git diff --check
git diff -- supabase/migrations/20260827000007_betting_schedule_links.sql supabase/tests/0064_betting_schedule_links_test.sql
git add supabase/migrations/20260827000007_betting_schedule_links.sql supabase/tests/0064_betting_schedule_links_test.sql
git commit -m "feat: link betting markets to schedule fixtures"
```

Expected: only the schema migration and its pgTAP test are committed.

---

### Task 2: Generate and Schedule the Complete Weekly Slate

**Files:**
- Create: `supabase/tests/0065_weekly_betting_market_generator_test.sql`
- Create via Supabase CLI, then populate: `supabase/migrations/20260827000008_weekly_betting_market_generator.sql`

**Interfaces:**
- Consumes: Task 1's event bindings and `betting_markets.fixture_id`; `league_settings(current_season, academy_season, featured_draft_id, academy_draft_id)`; active-draft `teams(name, abbreviation)`; curated non-prop `betting_teams(short_code)`.
- Produces: `generate_weekly_betting_markets(p_run_at timestamptz) returns jsonb` for service-role repair/test runs and `run_weekly_betting_market_cron(p_run_at timestamptz default now()) returns jsonb` for guarded Cron execution.
- Produces Cron jobs: `weekly-betting-markets-edt` at `0 5 * * 2` and `weekly-betting-markets-est` at `0 6 * * 2`.

- [ ] **Step 1: Write the failing happy-path and idempotency pgTAP scenarios**

Create `supabase/tests/0065_weekly_betting_market_generator_test.sql`. Start a transaction, include `helpers/_fixtures.sql.inc`, and build literal Premier/Academy data for an EDT Tuesday anchor:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc

select plan(32);

insert into public.drafts(name) values ('Automation Premier') returning id \gset premier_
insert into public.drafts(name) values ('Automation Academy') returning id \gset academy_
insert into public.teams(draft_id, name, abbreviation, nomination_position)
values
  (:'premier_id', 'Premier Alpha', 'PAL', 1),
  (:'premier_id', 'Premier Bravo', 'PBR', 2),
  (:'academy_id', 'Academy Alpha', 'AAL', 1),
  (:'academy_id', 'Academy Bravo', 'ABR', 2);

update public.league_settings
set current_season = 'S99', academy_season = 'A99',
    featured_draft_id = :'premier_id', academy_draft_id = :'academy_id'
where id = 1;

insert into public.betting_events(name, league, schedule_season)
values ('Premier Automation', 'premier', 'S99'), ('Academy Automation', 'academy', 'A99');
insert into public.betting_teams(name, short_code)
values
  ('Premier Alpha', 'PAL'), ('Premier Bravo', 'PBR'),
  ('Academy Alpha', 'AAL'), ('Academy Bravo', 'ABR');

insert into public.fixtures(season, stage, team_a, team_b, scheduled_at, best_of, sort_order)
values
  ('S99', 'week_1', 'Premier Alpha', 'Premier Bravo', '2026-09-01 00:00:00+00', 3, 1),
  ('A99', 'week_1', 'Academy Alpha', 'Academy Bravo', '2026-09-01 00:00:00+00', 3, 1);
```

Use literal assertions after `run_weekly_betting_market_cron('2026-08-25 05:00:00+00')` to prove:

- result status is `created`, target Monday is `2026-08-31`, candidates are `2`, created is `2`, existing is `0`;
- both fixture IDs are linked exactly once;
- Premier uses the Premier event and Academy uses the Academy event;
- titles are `PAL vs PBR` and `AAL vs ABR` in schedule order;
- `game_at` is `2026-09-01 00:00:00+00`, `lock_at` is `2026-08-31 23:55:00+00`, `rake_bps = 0`, and `draw_enabled = false`;
- rerunning `generate_weekly_betting_markets('2026-08-25 05:00:00+00')` returns created `0`, existing `2`, and leaves two linked markets.

Keep expected values literal; do not derive expected dates or titles with the production function.

- [ ] **Step 2: Add failing DST, validation, atomicity, and security scenarios**

Continue in the same pgTAP file with isolated savepoints and new target Mondays:

- call the Cron wrapper at `2026-08-25 06:00:00+00` and assert `{status: "skipped"}` because that is 2:00 AM EDT;
- create S99/A99 fixtures for `2026-11-10 01:00:00+00`, call the wrapper at `2026-11-03 06:00:00+00`, and assert both are created because that is 1:00 AM EST;
- create fixtures for Monday `2026-09-07`, delete one required betting-team mapping, assert `generate_weekly_betting_markets('2026-09-01 05:00:00+00')` throws `weekly betting: expected exactly one betting team`, and assert neither league's fixture received a market;
- restore the mapping, generate successfully, change one linked title to `WRONG`, rerun, and assert `weekly betting: linked market differs from fixture` without updating the title;
- set one active draft ID null inside a savepoint and assert `weekly betting: active Premier and Academy drafts are required`;
- null one selected fixture team/kickoff inside a savepoint and assert a complete-fixture validation error;
- delete one bound event inside a savepoint and assert the event-binding error;
- insert a second non-prop betting team with the same normalized code inside a savepoint and assert the exact-one-betting-team error;
- assert `anon` and `authenticated` lack execute privilege on both functions while `service_role` can execute both;
- assert both Cron rows exist with schedules `0 5 * * 2` and `0 6 * * 2`, and their command calls `run_weekly_betting_market_cron()`.

Each `throws_ok` must be followed by a row-count assertion that proves no partial market survived.

- [ ] **Step 3: Run the generator test and observe RED**

Run:

```bash
npx supabase test db --local supabase/tests/0065_weekly_betting_market_generator_test.sql
```

Expected: FAIL because neither generator function nor either Cron job exists.

- [ ] **Step 4: Create the generator migration with the CLI**

Run:

```bash
npx supabase migration new weekly_betting_market_generator
```

Expected: one new empty migration is printed. Confirm `supabase/migrations/20260827000008_weekly_betting_market_generator.sql` does not already exist, then rename only the printed file to that exact monotonic destination.

- [ ] **Step 5: Implement the core transactional generator**

In `supabase/migrations/20260827000008_weekly_betting_market_generator.sql`, create:

```sql
create or replace function public.generate_weekly_betting_markets(p_run_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
-- Declare the local target date, settings, event IDs, and candidate/created/existing counts.
-- Execute the twelve validation and insertion operations immediately below.
$$;
```

The body must:

1. Reject null `p_run_at`.
2. Acquire `pg_advisory_xact_lock(hashtext('weekly_betting_market_generator'))` so simultaneous repair/Cron calls serialize.
3. Compute the next Monday as `(date_trunc('week', p_run_at at time zone 'America/New_York')::date + 7)`.
4. Read the singleton settings row and reject null Premier/Academy season or draft IDs.
5. Count fixtures on that Eastern local date separately for both current seasons; reject zero in either league.
6. Reject fixtures with null kickoff/team fields.
7. For each selected fixture side, require exactly one normalized name match in the appropriate active draft.
8. For each matched abbreviation, require exactly one normalized code match in `betting_teams` with `coalesce(is_prop_outcome, false) = false`.
9. Require exactly one `betting_events` binding for each `(league, schedule_season)`.
10. Join any existing `fixture_id` market and compare with `IS DISTINCT FROM` against event, team IDs, `CODE_A vs CODE_B`, kickoff, kickoff minus five minutes, zero rake, and false draw; raise on any mismatch.
11. Insert missing candidates with one `INSERT ... SELECT`, leaving `created_by`, rules, and opening line null and relying on `open_at/status` defaults.
12. Return `jsonb_build_object('status','created','target_monday',v_target_date,'candidates',v_candidate_count,'created',v_created_count,'existing',v_existing_count)`.

Use normalized comparisons only at mapping boundaries:

```sql
lower(trim(public.teams.name)) = lower(trim(public.fixtures.team_a))
upper(trim(public.betting_teams.short_code)) = upper(trim(public.teams.abbreviation))
```

Do not silently choose `min(id)` or `limit 1`; the exact-count guards are what make ambiguous mappings fail safely.

- [ ] **Step 6: Implement the Eastern-time Cron wrapper and jobs**

Add the wrapper:

```sql
create or replace function public.run_weekly_betting_market_cron(p_run_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local timestamp := p_run_at at time zone 'America/New_York';
begin
  if extract(isodow from v_local) <> 2
     or extract(hour from v_local) <> 1
     or extract(minute from v_local) <> 0 then
    return jsonb_build_object('status', 'skipped', 'local_time', v_local);
  end if;
  return public.generate_weekly_betting_markets(p_run_at);
end;
$$;
```

Lock down both signatures explicitly:

```sql
revoke execute on function public.generate_weekly_betting_markets(timestamptz) from public, anon, authenticated;
revoke execute on function public.run_weekly_betting_market_cron(timestamptz) from public, anon, authenticated;
grant execute on function public.generate_weekly_betting_markets(timestamptz) to service_role;
grant execute on function public.run_weekly_betting_market_cron(timestamptz) to service_role;
```

Schedule idempotently, following the existing betting Cron migration pattern:

```sql
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'weekly-betting-markets-edt') then
    perform cron.schedule('weekly-betting-markets-edt', '0 5 * * 2',
      $cron$ select public.run_weekly_betting_market_cron(); $cron$);
  end if;
  if not exists (select 1 from cron.job where jobname = 'weekly-betting-markets-est') then
    perform cron.schedule('weekly-betting-markets-est', '0 6 * * 2',
      $cron$ select public.run_weekly_betting_market_cron(); $cron$);
  end if;
end;
$$;
```

- [ ] **Step 7: Reset and drive the pgTAP test to GREEN**

Run after each focused SQL change:

```bash
npx supabase db reset
npx supabase test db --local supabase/tests/0065_weekly_betting_market_generator_test.sql
```

Expected final result: all generator assertions pass with no pgTAP plan mismatch.

- [ ] **Step 8: Run the database suite and advisors**

Run:

```bash
npx supabase test db
npx supabase db advisors --local
npx supabase migration list --local
```

Expected: every pgTAP test passes, advisors report no new security/performance issue caused by these migrations, and both new versions appear after `20260827000006`.

- [ ] **Step 9: Review and commit the generator**

Run:

```bash
git diff --check
git diff -- supabase/migrations/20260827000008_weekly_betting_market_generator.sql supabase/tests/0065_weekly_betting_market_generator_test.sql
git add supabase/migrations/20260827000008_weekly_betting_market_generator.sql supabase/tests/0065_weekly_betting_market_generator_test.sql
git commit -m "feat: generate weekly betting markets from fixtures"
```

Expected: only the generator migration and its pgTAP test are committed.

---

### Task 3: Configure Event Bindings in the Betting Catalog

**Files:**
- Modify: `src/lib/betting/types.ts`
- Modify: `src/lib/betting/admin-actions.ts:371-405`
- Modify: `src/lib/betting/admin-actions.test.ts`
- Modify: `src/app/admin/betting/catalog/page.tsx:14-31`
- Modify: `src/components/admin/betting/CatalogAdmin.tsx:104-167`
- Create: `src/components/admin/betting/CatalogAdmin.test.tsx`

**Interfaces:**
- Consumes: Task 1's nullable `betting_events.league` and `schedule_season` columns; existing `requireBettingStaff`, service-role client, `_audit`, `useAdminRun`, and page refresh behavior.
- Produces: `BettingEvent` and `BettingEventLeague` types; `UpsertEventInput { id?, name, description?, league?, scheduleSeason? }`; catalog controls for bound/unbound events.

- [ ] **Step 1: Write failing Server Action tests**

Add an `upsertEvent` describe block to `src/lib/betting/admin-actions.test.ts` with four behaviors:

```ts
it("normalizes and persists a complete Academy schedule binding", async () => {
  const query = chainable({ data: { id: 12 }, error: null });
  from.mockImplementation((table: string) =>
    table === "betting_events" ? query : chainable({ data: null, error: null }),
  );

  const result = await upsertEvent({
    name: " Academy S2 ",
    league: "academy",
    scheduleSeason: " a2 ",
  });

  expect(query.insert).toHaveBeenCalledWith({
    name: "Academy S2",
    description: null,
    league: "academy",
    schedule_season: "A2",
  });
  expect(rpc).toHaveBeenCalledWith("_audit", expect.objectContaining({
    p_action: "event_upsert",
    p_after: { name: "Academy S2", league: "academy", schedule_season: "A2" },
  }));
  expect(result).toEqual({ ok: true, id: 12 });
});
```

Also assert:

- omitting both binding fields persists `league: null, schedule_season: null`;
- updating an existing bound event with `league: null, scheduleSeason: null` calls `update` with both database columns null, allowing staff to repair a bad binding without deleting an event that owns markets;
- supplying only one field returns `{ ok: false, error: "Choose both a league and schedule season, or leave both blank." }` without a table call;
- a runtime-invalid league (cast only in the test to bypass TypeScript) is rejected without a table call.

These tests exercise real validation/normalization and the emitted database row; do not assert only that a mock exists.

- [ ] **Step 2: Run the Server Action tests and observe RED**

Run:

```bash
npm test -- src/lib/betting/admin-actions.test.ts
```

Expected: FAIL because `UpsertEventInput` has no binding fields and `upsertEvent` does not persist them.

- [ ] **Step 3: Implement the shared event types and action validation**

Add to `src/lib/betting/types.ts`:

```ts
export type BettingEventLeague = "premier" | "academy";

export interface BettingEvent {
  id: number;
  name: string;
  description: string | null;
  league: BettingEventLeague | null;
  schedule_season: string | null;
}
```

Extend `UpsertEventInput` with `league?: BettingEventLeague | null` and `scheduleSeason?: string | null`. In `upsertEvent`:

- authorize first, preserving the existing non-staff early return;
- trim the two binding values;
- require both or neither;
- accept only `premier`/`academy` at runtime;
- normalize the canonical season with `toUpperCase()`;
- write `league` and `schedule_season` in the insert/update row;
- include the normalized fields in `_audit.p_after`;
- preserve current name, ID, database-error, and revalidation behavior.

- [ ] **Step 4: Run the Server Action test to GREEN**

Run:

```bash
npm test -- src/lib/betting/admin-actions.test.ts
```

Expected: all existing and new action tests pass.

- [ ] **Step 5: Write the failing catalog component tests**

Create `src/components/admin/betting/CatalogAdmin.test.tsx`. Mock only the server actions and `next/navigation` router boundary. Render real `CatalogAdmin` with one bound and one unbound event. Test these user-visible behaviors:

```tsx
it("submits a Premier fixture-season binding and shows existing bindings", async () => {
  upsertEvent.mockResolvedValue({ ok: true, id: 3 });
  render(
    <CatalogAdmin
      teams={[]}
      storeItems={[]}
      events={[
        { id: 1, name: "Premier S5", description: null, league: "premier", schedule_season: "S5" },
        { id: 2, name: "Props", description: null, league: null, schedule_season: null },
      ]}
    />,
  );

  expect(screen.getByText(/Premier · S5/i)).toBeTruthy();
  expect(screen.getByText(/Not linked to the schedule/i)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Event name"), { target: { value: "Premier S6" } });
  fireEvent.change(screen.getByLabelText("Schedule league"), { target: { value: "premier" } });
  fireEvent.change(screen.getByLabelText("Schedule season"), { target: { value: "S6" } });
  fireEvent.click(screen.getByRole("button", { name: "Add event" }));

  await waitFor(() => expect(upsertEvent).toHaveBeenCalledWith({
    name: "Premier S6",
    league: "premier",
    scheduleSeason: "S6",
  }));
});
```

Add a second test proving the default `Not schedule-linked` option hides/disables the season input and submits an unbound event without half-filled metadata.

Add a third test that clicks `Edit schedule binding` for the existing `Premier S5` row, chooses `Not schedule-linked`, saves, and observes:

```ts
expect(upsertEvent).toHaveBeenCalledWith({
  id: 1,
  name: "Premier S5",
  description: undefined,
  league: null,
  scheduleSeason: null,
});
```

- [ ] **Step 6: Run the component test and observe RED**

Run:

```bash
npm test -- src/components/admin/betting/CatalogAdmin.test.tsx
```

Expected: FAIL because the binding controls and labels do not exist.

- [ ] **Step 7: Implement the catalog controls and server/client type boundary**

In `src/app/admin/betting/catalog/page.tsx`, cast the full event query result to `BettingEvent[]` and pass it unchanged.

In `CatalogAdmin.tsx`:

- use the shared `BettingEvent`/`BettingEventLeague` types;
- add controlled `league` state initialized to `""` and `scheduleSeason` state initialized to `""`;
- label the inputs exactly `Event name`, `Schedule league`, and `Schedule season`;
- offer `Not schedule-linked`, `Premier`, and `Academy` choices;
- show/enable the season input only when a league is selected;
- disable submit when a league is selected without a nonblank season;
- call `upsertEvent({ name, league: league || undefined, scheduleSeason: league ? scheduleSeason : undefined })`;
- clear all three fields after success;
- render each existing event's binding as `Premier · S5`, `Academy · A1`, or `Not linked to the schedule`;
- give every event an `Edit schedule binding` control that loads its current values into a small row-level editor;
- save an existing row with `upsertEvent({ id, name, description: description ?? undefined, league: league || null, scheduleSeason: league ? scheduleSeason : null })`, using explicit nulls when the binding is cleared so the update persists both columns as null;
- label the row-level save control `Save schedule binding` and cancel control `Cancel binding edit`.

Do not move service-role reads into the Client Component and do not treat the controls as authorization; the existing Server Component and Server Action remain the trusted boundaries.

- [ ] **Step 8: Run focused UI/action tests to GREEN**

Run:

```bash
npm test -- src/lib/betting/admin-actions.test.ts src/components/admin/betting/CatalogAdmin.test.tsx
```

Expected: both files pass with no React act warnings or unhandled promise errors.

- [ ] **Step 9: Review and commit the catalog configuration**

Run:

```bash
git diff --check
git diff -- src/lib/betting/types.ts src/lib/betting/admin-actions.ts src/lib/betting/admin-actions.test.ts src/app/admin/betting/catalog/page.tsx src/components/admin/betting/CatalogAdmin.tsx src/components/admin/betting/CatalogAdmin.test.tsx
git add src/lib/betting/types.ts src/lib/betting/admin-actions.ts src/lib/betting/admin-actions.test.ts src/app/admin/betting/catalog/page.tsx src/components/admin/betting/CatalogAdmin.tsx src/components/admin/betting/CatalogAdmin.test.tsx
git commit -m "feat: configure betting event schedule bindings"
```

Expected: only the six catalog/type/action files are committed.

---

### Task 4: Document Operations and Verify the Complete Feature

**Files:**
- Modify: `docs/backend.md`

**Interfaces:**
- Consumes: completed database and catalog behavior from Tasks 1-3.
- Produces: operator guidance and fresh end-to-end repository verification evidence.

- [ ] **Step 1: Update backend architecture and operations documentation**

In `docs/backend.md`:

- add the weekly betting generator to the system-shape Supabase section;
- document `betting_events.league/schedule_season` and `betting_markets.fixture_id` in the betting domain map;
- state that Tuesday 05:00/06:00 UTC jobs are guarded to Tuesday 1:00 AM `America/New_York`;
- document next-Monday selection, active-draft name-to-abbreviation mapping, and curated betting-team code mapping;
- state the all-or-nothing validation and safe rerun/mismatch behavior;
- explain that operators inspect Supabase Cron runs/`cron.job_run_details`, correct missing catalog/event/schedule data, then call `generate_weekly_betting_markets()` through an authorized service-role context using the original Tuesday 1:00 AM Eastern anchor;
- state explicitly that the generator does not create teams/events or alter an already linked market.

- [ ] **Step 2: Run formatting and focused verification**

Run:

```bash
git diff --check
npx supabase db reset
npx supabase test db --local supabase/tests/0064_betting_schedule_links_test.sql
npx supabase test db --local supabase/tests/0065_weekly_betting_market_generator_test.sql
npm test -- src/lib/betting/admin-actions.test.ts src/components/admin/betting/CatalogAdmin.test.tsx
```

Expected: every focused command exits 0.

- [ ] **Step 3: Run the repository-wide checks required by README.md**

Run:

```bash
npx supabase test db
npm test
npm run lint
npm run build
npx supabase db advisors --local
npx supabase migration list --local
```

Expected: pgTAP and Vitest report zero failures, lint exits 0, the Next.js 16.3 production build exits 0, advisors show no issue introduced by this feature, and the two migrations are the final local versions.

- [ ] **Step 4: Perform a read-only local smoke query**

Against the reset local database after the pgTAP transaction has rolled back, seed a minimal Premier/Academy fixture set only if an existing repository seed already provides suitable current-season rows; otherwise rely on the pgTAP integration test rather than introducing ad-hoc persistent data. Read:

```sql
select jobname, schedule, command
from cron.job
where jobname in ('weekly-betting-markets-edt', 'weekly-betting-markets-est')
order by jobname;

select proname, proacl
from pg_proc
where proname in ('generate_weekly_betting_markets', 'run_weekly_betting_market_cron')
order by proname;
```

Expected: two expected jobs and no anon/authenticated execute ACL.

- [ ] **Step 5: Review requirements against the spec**

Read `docs/superpowers/specs/2026-08-24-weekly-betting-market-automation-design.md` line by line and confirm:

- Tuesday 1:00 AM Eastern and following-Monday selection;
- Premier plus Academy in one transaction;
- persistent season events;
- exact manual defaults and five-minute lock;
- curated catalog failure behavior;
- fixture idempotency and mismatch refusal;
- service-role/Cron-only execution;
- DST coverage and Cron observability;
- no automatic resolution, cancellation, weekly event creation, or Discord failure notification.

If any item is not proven by a test or documentation, add the missing focused assertion or documentation before committing.

- [ ] **Step 6: Commit documentation after verification**

Run:

```bash
git add docs/backend.md
git commit -m "docs: document weekly betting automation"
git status --short
```

Expected: the documentation commit succeeds; `git status --short` shows only the user's pre-existing unrelated changes, not uncommitted feature work.

## Deployment Runbook (execute only after implementation review)

1. Confirm the linked Supabase project is the new FPL project and not the prohibited `ocepp` project documented in `README.md`.
2. Run `npx supabase migration list` and verify production ends at `20260827000006` before pushing.
3. Inspect the current production events and confirm `Premier S5` and `Academy S1` are unique before applying the backfill.
4. Apply migrations with the repository-approved `npx supabase db push` workflow.
5. Query `betting_events` and confirm bindings are `(Premier S5, premier, S5)` and `(Academy S1, academy, A1)`.
6. Query `cron.job` and confirm both weekly jobs, schedules, and commands.
7. Run a service-role repair invocation with a known Tuesday 1:00 AM Eastern timestamp for a future slate only after checking that its target Monday fixtures are correct; inspect the returned candidate/created/existing counts.
8. Confirm the betting page shows the expected number of Premier and Academy markets with correct titles and lock times.
9. If generation fails, correct the missing/ambiguous event, draft team, betting team, or fixture data and rerun with the same Tuesday anchor. Never edit a fixture-linked market automatically once bets may exist.
