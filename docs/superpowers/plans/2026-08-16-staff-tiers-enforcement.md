# Staff Tiers and Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make owner-only league controls physically unreachable by a regular admin, enforced in the database and the betting action layer rather than hidden in the UI.

**Architecture:** Reuse the existing `profiles.is_owner` tier. Trim the owner set to two people, then swap the RLS policies on dangerous tables from `is_admin()` to `is_owner()`. Where the tier line falls *within* a row rather than between commands, the table becomes owner-write-only and admins get a narrow `SECURITY DEFINER` RPC for their slice. Betting has no RLS on writes at all, so it is gated in its server actions instead.

**Tech Stack:** Postgres/Supabase RLS, pgTAP, Next.js server actions, supabase-js, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-admin-console-tiers-design.md`

## Global Constraints

- Migrations live in `supabase/migrations/` named `YYYYMMDDNNNNNN_snake_case.sql`. Continue the `20260823` date prefix; the last used is `20260823000005`.
- Every migration must survive `npx supabase db reset` on an empty database. No migration may assume a draft, profile, or league row exists.
- pgTAP tests live in `supabase/tests/` named `NNNN_snake_case_test.sql`, wrapped in `begin; … rollback;` with an explicit `select plan(N);`. The last used number is `0050`.
- Test helpers come from `\ir helpers/_fixtures.sql.inc`: `tests.admin_id()`, `tests.cap(n)`, `tests.acting_as(uuid)`, `tests.fixture()`.
- `_require_admin()` raises `NOT_ADMIN: admin access required`. New owner guard must mirror that shape.
- `service_role` bypasses RLS everywhere and must keep working — the nightly ingest and betting actions depend on it.
- Do not run `npx supabase db push`. It is blocked in this environment; production migration is a manual step by the user.
- Run `npx supabase db reset` then `npx supabase test db` after each migration task.

---

### Task 1: Owner guard and owner-set demotion

**Files:**
- Create: `supabase/migrations/20260823000006_owner_guard_and_demotion.sql`
- Create: `supabase/tests/0051_owner_tier_test.sql`

**Interfaces:**
- Consumes: `public.is_owner()` from `20260817000001_admin_owners.sql`.
- Produces: `public._require_owner() returns void`, raising `NOT_OWNER: owner access required`. Every later task uses this.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0051_owner_tier_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(4);

insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(41), 'dribb',   true, true),
       (tests.cap(42), 'spiesss', true, true)
on conflict (id) do update set display_name = excluded.display_name,
  is_admin = excluded.is_admin, is_owner = excluded.is_owner;

select has_function('public', '_require_owner', 'the owner guard exists');

-- An owner passes, an admin does not.
select tests.acting_as(tests.cap(41));
select lives_ok($$ select public._require_owner() $$, 'an owner passes the guard');

insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(43), 'helper', true, false) on conflict (id) do nothing;
select tests.acting_as(tests.cap(43));
select throws_like($$ select public._require_owner() $$, 'NOT_OWNER%',
                   'a plain admin is refused');

-- The demotion left exactly the two creators as owners.
select is((select count(*) from public.profiles where is_owner), 2::bigint,
          'only the two creators are owners');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db 2>&1 | Select-String "0051|Result:"`
Expected: FAIL — `function public._require_owner() does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260823000006_owner_guard_and_demotion.sql`:

```sql
-- Staff tiers, step 1: the owner guard, and trimming the owner set.
--
-- 20260817000001 seeded every then-current admin as an owner, so "owner" does
-- not yet mean what it should. This demotes everyone except the two site
-- creators. is_admin is deliberately untouched: a demoted owner keeps every
-- admin power, they just stop being able to change league-shaping config.

create or replace function public._require_owner() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'NOT_OWNER: owner access required';
  end if;
end $$;

revoke all on function public._require_owner() from public;
grant execute on function public._require_owner() to authenticated, service_role;

do $$
declare v_owners int;
begin
  -- A database with no profiles at all (a fresh reset) has nothing to demote.
  if not exists (select 1 from public.profiles where is_owner) then
    raise notice 'No owners present; skipping demotion.';
    return;
  end if;

  update public.profiles
  set is_owner = false
  where is_owner
    and lower(trim(display_name)) not in ('dribb', 'spiesss');

  select count(*) into v_owners from public.profiles where is_owner;
  if v_owners <> 2 then
    raise exception
      'Expected exactly 2 owners after demotion, found %. Check profiles.display_name for dribb and spiesss.',
      v_owners;
  end if;
end $$;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase db reset; npx supabase test db 2>&1 | Select-String "0051|Result:"`
Expected: PASS.

Note the fresh-reset path takes the `return` branch (no profiles exist during migration), and the test inserts its own two owners. That is why the count assertion lives in the test rather than only in the migration.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260823000006_owner_guard_and_demotion.sql supabase/tests/0051_owner_tier_test.sql
git commit -m "feat: add owner guard and trim the owner set to the site creators"
```

---

### Task 2: League settings become owner-only, signups toggle moves to an RPC

**Files:**
- Create: `supabase/migrations/20260823000007_league_settings_owner.sql`
- Create: `supabase/tests/0052_league_settings_tier_test.sql`
- Modify: `src/components/signup/AdminSignupsToggle.tsx`

**Interfaces:**
- Consumes: `public._require_owner()` (Task 1).
- Produces: `public.set_signups_open(p_open boolean) returns void`. Task 4's console page calls this; nothing else may write `league_settings` as an admin.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0052_league_settings_tier_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(5);

insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(41), 'dribb', true, true),
       (tests.cap(43), 'helper', true, false)
on conflict (id) do update set is_admin = excluded.is_admin, is_owner = excluded.is_owner;
insert into public.league_settings (id) values (1) on conflict (id) do nothing;

select has_function('public', 'set_signups_open', 'the signups RPC exists');

-- A plain admin cannot change the season.
select tests.acting_as(tests.cap(43));
update public.league_settings set current_season = 'HACKED' where id = 1;
select is((select current_season from public.league_settings where id = 1), 'S5',
          'an admin cannot change the season');

-- An owner can.
select tests.acting_as(tests.cap(41));
update public.league_settings set current_season = 'S6' where id = 1;
select is((select current_season from public.league_settings where id = 1), 'S6',
          'an owner can change the season');

-- The admin's own slice still works, through the RPC.
select tests.acting_as(tests.cap(43));
select lives_ok($$ select public.set_signups_open(false) $$, 'an admin may toggle signups');
select is((select signups_open from public.league_settings where id = 1), false,
          'and the toggle takes effect');

select * from finish();
rollback;
```

RLS silently filters a disallowed `UPDATE` to zero rows rather than raising, which is why the admin case asserts the value is unchanged instead of using `throws_ok`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db 2>&1 | Select-String "0052|Result:"`
Expected: FAIL — `function public.set_signups_open(boolean) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260823000007_league_settings_owner.sql`:

```sql
-- league_settings holds the league's shape: season codes, which drafts are
-- live, homepage mode. Mislabelling a season corrupts every stat row ingested
-- under it, so writes become owner-only.
--
-- signups_open is the one routine column, but per-column tiers are impossible
-- with grants: Supabase gives every logged-in user the same `authenticated`
-- role, so revoking a column from admins revokes it from owners too. Admins
-- get a narrow SECURITY DEFINER RPC instead.

drop policy if exists league_settings_admin_write on public.league_settings;

create policy league_settings_owner_write on public.league_settings
  for all using (public.is_owner()) with check (public.is_owner());

create or replace function public.set_signups_open(p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_open is null then
    raise exception 'SIGNUPS_INVALID: pass true or false';
  end if;
  insert into public.league_settings (id, signups_open)
  values (1, p_open)
  on conflict (id) do update set signups_open = excluded.signups_open,
                                 updated_at = now();
end $$;

revoke all on function public.set_signups_open(boolean) from public;
grant execute on function public.set_signups_open(boolean) to authenticated, service_role;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase db reset; npx supabase test db 2>&1 | Select-String "0052|Result:"`
Expected: PASS.

- [ ] **Step 5: Point the signups toggle at the RPC**

In `src/components/signup/AdminSignupsToggle.tsx`, replace the `league_settings` upsert with the RPC. Find the call that upserts `{ id: 1, signups_open: next }` and change it to:

```ts
const { error } = await supabase.rpc("set_signups_open", { p_open: next });
```

Leave the surrounding busy/error/router.refresh handling exactly as it is.

- [ ] **Step 6: Verify the app still builds and its tests pass**

Run: `npx tsc --noEmit; npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260823000007_league_settings_owner.sql supabase/tests/0052_league_settings_tier_test.sql src/components/signup/AdminSignupsToggle.tsx
git commit -m "feat: make league settings owner-only, move signups toggle to an RPC"
```

---

### Task 3: Drafts, players and avg bids become owner-only

**Files:**
- Create: `supabase/migrations/20260823000008_drafts_owner.sql`
- Create: `supabase/tests/0053_drafts_tier_test.sql`

**Interfaces:**
- Consumes: `public.is_owner()`.
- Produces: nothing new. Draft-room RPCs keep working untouched — they are `SECURITY DEFINER` with `_require_admin()`, so they bypass these policies by design.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0053_drafts_tier_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(4);

create temporary table t as select tests.fixture() as d;
insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(41), 'dribb', true, true),
       (tests.cap(43), 'helper', true, false)
on conflict (id) do update set is_admin = excluded.is_admin, is_owner = excluded.is_owner;

-- A plain admin cannot create or rename a draft.
select tests.acting_as(tests.cap(43));
select throws_ok($$ insert into public.drafts (name) values ('Sneaky') $$, '42501', null,
                 'an admin cannot create a draft');
update public.drafts set name = 'Renamed' where id = (select d from t);
select isnt((select name from public.drafts where id = (select d from t)), 'Renamed',
            'an admin cannot rename a draft');

-- An owner can.
select tests.acting_as(tests.cap(41));
select lives_ok($$ insert into public.drafts (name) values ('Owner Draft') $$,
                'an owner can create a draft');

-- Running a live draft is still admin work: the RPC is SECURITY DEFINER and
-- bypasses the policy above.
select tests.acting_as(tests.cap(43));
select lives_ok($$ select public.start_draft((select d from t)) $$,
                'an admin can still start a draft');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db 2>&1 | Select-String "0053|Result:"`
Expected: FAIL — the admin insert succeeds, so `throws_ok` fails.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260823000008_drafts_owner.sql`:

```sql
-- Setting a draft up is owner work; running one is admin work.
--
-- Deleting a draft cascades to its teams and players, and the player pool and
-- free-agency averages are the draft's economics. The live draft actions
-- (start, pause, nominate, place_bid, close_lot, admin assignment, undo) are
-- SECURITY DEFINER RPCs guarded by _require_admin(), so they bypass these
-- policies and keep working for any admin. That split is deliberate.

drop policy if exists drafts_admin_write  on public.drafts;
drop policy if exists players_admin_write on public.players;

create policy drafts_owner_write on public.drafts
  for all using (public.is_owner()) with check (public.is_owner());
create policy players_owner_write on public.players
  for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists free_agency_avg_bids_admin_write on public.free_agency_avg_bids;
create policy free_agency_avg_bids_owner_write on public.free_agency_avg_bids
  for all using (public.is_owner()) with check (public.is_owner());
```

Policy names verified against `20260807000001_schema.sql` (`drafts_admin_write`, `players_admin_write`) and `20260812000001_free_agency_avg_bids.sql` (`free_agency_avg_bids_admin_write`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase db reset; npx supabase test db 2>&1 | Select-String "0053|Result:"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260823000008_drafts_owner.sql supabase/tests/0053_drafts_tier_test.sql
git commit -m "feat: make draft setup owner-only, leaving the live draft room to admins"
```

---

### Task 4: Teams become owner-only, identity editing moves to an RPC

**Files:**
- Create: `supabase/migrations/20260823000009_teams_owner.sql`
- Create: `supabase/tests/0054_teams_tier_test.sql`
- Modify: `src/components/teams/AdminTeamEditor.tsx`

**Interfaces:**
- Consumes: `public._require_admin()`, `public.is_owner()`.
- Produces: `public.set_team_identity(p_team_id uuid, p_image_url text, p_banner_color text, p_abbreviation text) returns void`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0054_teams_tier_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(5);

create temporary table t as select tests.fixture() as d;
create temporary table tm as
  select id from public.teams where draft_id = (select d from t) and nomination_position = 1;

insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(41), 'dribb', true, true),
       (tests.cap(43), 'helper', true, false)
on conflict (id) do update set is_admin = excluded.is_admin, is_owner = excluded.is_owner;

select has_function('public', 'set_team_identity', 'the identity RPC exists');

-- An admin cannot change a team's budget directly.
select tests.acting_as(tests.cap(43));
update public.teams set points_remaining = 9999 where id = (select id from tm);
select isnt((select points_remaining from public.teams where id = (select id from tm)), 9999,
            'an admin cannot rewrite a team budget');

-- But can set cosmetic identity through the RPC.
select lives_ok(
  $$ select public.set_team_identity((select id from tm), 'https://x/y.png', '#123456', 'ZZZ') $$,
  'an admin may set team identity');
select is((select abbreviation from public.teams where id = (select id from tm)), 'ZZZ',
          'and it takes effect');

-- An owner can still write the team directly.
select tests.acting_as(tests.cap(41));
update public.teams set points_remaining = 42 where id = (select id from tm);
select is((select points_remaining from public.teams where id = (select id from tm)), 42,
          'an owner can rewrite a team budget');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db 2>&1 | Select-String "0054|Result:"`
Expected: FAIL — `function public.set_team_identity(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260823000009_teams_owner.sql`:

```sql
-- teams carries draft economics (budget_start, points_remaining) alongside
-- cosmetics (crest, banner colour, abbreviation). Rewriting a budget mid-draft
-- corrupts an auction, so the table becomes owner-write.
--
-- Cosmetics stay admin work through a narrow RPC. Per-column grants cannot
-- express this: owners and admins share the `authenticated` role, so a column
-- revoke would hit both.

drop policy if exists teams_admin_write on public.teams;

create policy teams_owner_write on public.teams
  for all using (public.is_owner()) with check (public.is_owner());

create or replace function public.set_team_identity(
  p_team_id uuid,
  p_image_url text,
  p_banner_color text,
  p_abbreviation text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_team_id is null then
    raise exception 'TEAM_INVALID: team id is required';
  end if;
  if p_abbreviation is not null
     and char_length(trim(p_abbreviation)) not between 1 and 5 then
    raise exception 'ABBREVIATION_INVALID: 1 to 5 characters';
  end if;

  -- banner_color is NOT NULL with a hex check constraint
  -- (20260811000004_team_banner_color.sql), so a null means "leave it alone"
  -- rather than "clear it", and a malformed value is rejected here with a
  -- readable error instead of a raw constraint violation.
  if p_banner_color is not null and p_banner_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'BANNER_COLOR_INVALID: expected #RRGGBB';
  end if;

  update public.teams
  set image_url    = p_image_url,
      banner_color = coalesce(p_banner_color, banner_color),
      abbreviation = coalesce(nullif(trim(p_abbreviation), ''), abbreviation)
  where id = p_team_id;

  if not found then
    raise exception 'TEAM_INVALID: team not found';
  end if;
end $$;
```

`image_url` is nullable, so it is assigned directly — passing null legitimately
clears a crest.

```sql

revoke all on function public.set_team_identity(uuid, text, text, text) from public;
grant execute on function public.set_team_identity(uuid, text, text, text)
  to authenticated, service_role;
```

Column names verified: `image_url` (`20260810000005_team_identity.sql`), `banner_color` (`20260811000004_team_banner_color.sql`), `abbreviation` (`20260810000005_team_identity.sql`). Existing policy name is `teams_admin_write` (`20260807000001_schema.sql`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase db reset; npx supabase test db 2>&1 | Select-String "0054|Result:"`
Expected: PASS.

- [ ] **Step 5: Point the team identity editor at the RPC**

In `src/components/teams/AdminTeamEditor.tsx`, replace the direct `supabase.from("teams").update(...)` of identity fields with:

```ts
const { error } = await supabase.rpc("set_team_identity", {
  p_team_id: teamId,
  p_image_url: imageUrl,
  p_banner_color: bannerColor,
  p_abbreviation: abbreviation,
});
```

Keep the existing upload flow, busy state and error handling. The storage policy for `team-images` is unchanged and stays admin-writable.

- [ ] **Step 6: Verify the app still builds and its tests pass**

Run: `npx tsc --noEmit; npx vitest run`
Expected: PASS. If `AdminTeamEditor.test.tsx` asserts on the `from("teams").update` call, update it to assert on the `rpc` call instead.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260823000009_teams_owner.sql supabase/tests/0054_teams_tier_test.sql src/components/teams/AdminTeamEditor.tsx
git commit -m "feat: make teams owner-only, move identity editing to an RPC"
```

---

### Task 5: League teams become owner-only

**Files:**
- Create: `supabase/migrations/20260823000010_league_teams_owner.sql`
- Create: `supabase/tests/0055_league_teams_tier_test.sql`

**Interfaces:**
- Consumes: `public.is_owner()`.
- Produces: nothing new. The sync RPCs stay admin-callable.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0055_league_teams_tier_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(3);

create temporary table t as select tests.fixture() as d;
insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(41), 'dribb', true, true),
       (tests.cap(43), 'helper', true, false)
on conflict (id) do update set is_admin = excluded.is_admin, is_owner = excluded.is_owner;

-- Retiring a team by hand is what stranded Astronauts and Wildcats.
select tests.acting_as(tests.cap(43));
select throws_ok($$ insert into public.league_teams (name, abbreviation)
                    values ('Freehand', 'FRH') $$, '42501', null,
                 'an admin cannot add a league team by hand');

select tests.acting_as(tests.cap(41));
select lives_ok($$ insert into public.league_teams (name, abbreviation)
                   values ('Freehand', 'FRH') $$,
                'an owner can add a league team');

-- The guided, idempotent path stays admin work: it is SECURITY DEFINER.
update public.league_settings set featured_draft_id = (select d from t) where id = 1;
select tests.acting_as(tests.cap(43));
select lives_ok($$ select public.sync_league_teams_from_draft() $$,
                'an admin can still sync teams from the draft');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db 2>&1 | Select-String "0055|Result:"`
Expected: FAIL — the admin insert succeeds.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260823000010_league_teams_owner.sql`:

```sql
-- league_teams accumulates every name the league has ever used and drives
-- captaincy, reporting and roster identity. Editing it by hand is what left
-- Astronauts and Wildcats retired while their captains could not report.
--
-- The freehand editor becomes owner-only. The guided sync functions stay
-- admin-callable: they are SECURITY DEFINER, idempotent, and only ever bring
-- the table into line with a draft, which is the safe path.

drop policy if exists league_teams_admin_write on public.league_teams;

create policy league_teams_owner_write on public.league_teams
  for all using (public.is_owner()) with check (public.is_owner());
```

Policy name verified as `league_teams_admin_write` (`20260811100001_league_config.sql:56`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase db reset; npx supabase test db 2>&1 | Select-String "0055|Result:"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260823000010_league_teams_owner.sql supabase/tests/0055_league_teams_tier_test.sql
git commit -m "feat: make freehand league team edits owner-only"
```

---

### Task 6: Fixtures split by operation

**Files:**
- Create: `supabase/migrations/20260823000011_fixtures_tier.sql`
- Create: `supabase/tests/0056_fixtures_tier_test.sql`

**Interfaces:**
- Consumes: `public.is_owner()`, `public.is_admin()`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0056_fixtures_tier_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(4);

insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(41), 'dribb', true, true),
       (tests.cap(43), 'helper', true, false)
on conflict (id) do update set is_admin = excluded.is_admin, is_owner = excluded.is_owner;

insert into public.fixtures (season, stage, team_a, team_b, best_of, sort_order)
values ('S5', 'week_1', 'Alpha', 'Beta', 3, 1);

-- Admins enter results.
select tests.acting_as(tests.cap(43));
update public.fixtures set score_a = 2, score_b = 1 where team_a = 'Alpha';
select is((select score_a from public.fixtures where team_a = 'Alpha'), 2,
          'an admin can report a score');

-- But cannot change the season's structure.
select throws_ok($$ insert into public.fixtures (season, stage, team_a, team_b, best_of)
                    values ('S5', 'week_2', 'Alpha', 'Beta', 3) $$, '42501', null,
                 'an admin cannot create a fixture');
delete from public.fixtures where team_a = 'Alpha';
select is((select count(*) from public.fixtures where team_a = 'Alpha'), 1::bigint,
          'an admin cannot delete a fixture');

select tests.acting_as(tests.cap(41));
select lives_ok($$ insert into public.fixtures (season, stage, team_a, team_b, best_of)
                   values ('S5', 'week_2', 'Alpha', 'Beta', 3) $$,
                'an owner can create a fixture');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db 2>&1 | Select-String "0056|Result:"`
Expected: FAIL — the admin insert succeeds.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260823000011_fixtures_tier.sql`:

```sql
-- Fixtures split by operation, which is the one place RLS expresses the tier
-- line natively: admins report results every week, owners decide what the
-- season looks like. Creating and deleting fixtures detaches tourney codes and
-- match reports (both reference fixture_id with on delete set null).
--
-- Accepted limit: an admin UPDATE covers the whole row, so an admin can edit a
-- fixture's teams or date as well as its score. Freezing those columns needs an
-- OLD/NEW trigger; deliberately not done, since admins are trusted staff and a
-- wrong team name is trivially reversible.

drop policy if exists fixtures_admin_write on public.fixtures;

create policy fixtures_admin_update on public.fixtures
  for update using (public.is_admin()) with check (public.is_admin());
create policy fixtures_owner_insert on public.fixtures
  for insert with check (public.is_owner());
create policy fixtures_owner_delete on public.fixtures
  for delete using (public.is_owner());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase db reset; npx supabase test db 2>&1 | Select-String "0056|Result:"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260823000011_fixtures_tier.sql supabase/tests/0056_fixtures_tier_test.sql
git commit -m "feat: split fixture writes so admins report scores and owners set structure"
```

---

### Task 7: Betting settlement and balances become owner work

**Files:**
- Modify: `src/lib/betting/access.ts`
- Modify: `src/lib/betting/admin-actions.ts`
- Test: `src/lib/betting/admin-actions.test.ts`

**Interfaces:**
- Consumes: the existing `requireBettingStaff()` in `src/lib/betting/access.ts`.
- Produces: `requireBettingOwner(): Promise<{ discordId: string }>`, throwing for a non-owner. Used only inside `admin-actions.ts`.

Betting has no RLS on writes: `20260813000001_betting_schema.sql` grants `authenticated` only `select`, and every write goes through a server action using a `service_role` client. So this tier is enforced in the action layer, and no migration is involved.

- [ ] **Step 1: Read the existing access module**

Read `src/lib/betting/access.ts` in full and note how `requireBettingStaff()` resolves the caller (it returns `{ discordId }`). `requireBettingOwner()` must reuse that resolution and add an owner check against `profiles.is_owner` for the same user, throwing on failure in the same style.

- [ ] **Step 2: Write the failing test**

Add to `src/lib/betting/admin-actions.test.ts`, following the file's existing authorization-suite patterns for mocking `requireBettingStaff`:

```ts
describe("owner-tier betting actions", () => {
  const ownerOnly = [
    ["resolveMarket", () => resolveMarket(1, 2)],
    ["cancelMarket", () => cancelMarket(1)],
    ["deleteMarket", () => deleteMarket(1)],
    ["resolvePickem", () => resolvePickem(1)],
    ["cancelPickem", () => cancelPickem(1)],
    ["createSeason", () => createSeason("S6")],
    ["closeSeason", () => closeSeason(1, 1000)],
    ["grantPoints", () => grantPoints("123", 50, "test")],
  ] as const;

  it.each(ownerOnly)("%s refuses a staff caller who is not an owner", async (_name, run) => {
    mockOwner(false);
    const result = await run();
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Owner") });
    expect(serviceClientMock.rpc).not.toHaveBeenCalled();
  });

  it("createMarket still allows a non-owner admin", async () => {
    mockOwner(false);
    const result = await createMarket(validCreateMarketInput);
    expect(result).not.toEqual({ ok: false, error: expect.stringContaining("Owner") });
  });
});
```

Define `mockOwner(isOwner: boolean)` alongside the file's existing staff mock so it controls what `requireBettingOwner` sees. Reuse whatever fixture the file already uses for `validCreateMarketInput`; if none exists, build one from `CreateMarketInput`'s fields.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/betting/admin-actions.test.ts`
Expected: FAIL — the owner-only actions currently succeed for a non-owner.

- [ ] **Step 4: Add the owner guard**

In `src/lib/betting/access.ts`, add below `requireBettingStaff`:

```ts
/** Staff who may also settle markets, close seasons and move balances. These
 *  pay out and cannot be undone, so they are owner-tier — see
 *  docs/superpowers/specs/2026-08-16-admin-console-tiers-design.md. */
export async function requireBettingOwner(): Promise<{ discordId: string }> {
  const ctx = await requireBettingStaff();
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_owner")
    .eq("id", userData.user?.id ?? "")
    .single();
  if (!profile?.is_owner) throw new Error("Owner only.");
  return ctx;
}
```

Import `createServerSupabase` from `@/lib/supabase/server` if the module does not already.

- [ ] **Step 5: Apply it to the owner-tier actions**

In `src/lib/betting/admin-actions.ts`, add an `ownerOnly()` helper mirroring the existing `staffOnly()`:

```ts
async function ownerOnly(): Promise<{ discordId: string } | { ok: false; error: string }> {
  try {
    return await requireBettingOwner();
  } catch {
    return { ok: false, error: "Owner only." };
  }
}
```

Then swap `staffOnly()` for `ownerOnly()` in exactly these eight exports, leaving every other action untouched: `resolveMarket`, `cancelMarket`, `deleteMarket`, `resolvePickem`, `cancelPickem`, `createSeason`, `closeSeason`, `grantPoints`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/betting/admin-actions.test.ts; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/betting/access.ts src/lib/betting/admin-actions.ts src/lib/betting/admin-actions.test.ts
git commit -m "feat: restrict betting settlement, seasons and balances to owners"
```

---

### Task 8: Full-suite verification

**Files:**
- Modify: any test revealed as stale by the run below.

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: a green suite proving no existing admin flow was broken.

- [ ] **Step 1: Reset and run the database suite**

Run: `npx supabase db reset; npx supabase test db`
Expected: PASS, with tests `0051`-`0056` present.

- [ ] **Step 2: Run the app suite, typecheck, lint and build**

Run: `npx tsc --noEmit; npx eslint; npx vitest run; npx next build`
Expected: all PASS.

- [ ] **Step 3: Fix anything stale**

Any failure here is a real regression: a component still writing to a now-owner-only table as an admin. Fix by routing it through the appropriate RPC from Tasks 2 and 4, not by loosening a policy.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: verify staff tier enforcement across the suite"
```

---

## Handoff to the console page

This plan delivers steps 1 and 2 of the spec's rollout: the tiers are real and enforced. The spec's steps 3 and 4 — the consolidated `/admin` console and stripping admin panels from feature pages — are a separate plan, written after this one lands so its tasks can reference the real signatures of `set_signups_open`, `set_team_identity` and `requireBettingOwner`.

Nothing in this plan changes what any admin sees. Controls stay where they are; the dangerous ones simply stop working for non-owners. That is deliberate: it makes this plan safe to ship on its own and independently verifiable before any UI moves.
