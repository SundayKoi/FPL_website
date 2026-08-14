# Nemesis Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the auction draft completes, captains take turns banishing another team to the opposite division until every team sits in Lunari or Solari — and forced auto-assignments become undoable.

**Architecture:** A single `nemesis_picks` table is the sole source of truth; phase, whose turn it is, and the next division are all derived from it, so undo cannot leave a stale turn pointer. Four `security definer` RPCs mutate it. The board renders a new phase driven by a pure derivation function plus a small realtime hook. Separately, forced auto-assignments get stamped with the lot that caused them so `undo_last_sale` can pull them back.

**Tech Stack:** Postgres/Supabase (RLS, `security definer` RPCs, Realtime), pgTAP, Next.js 16 App Router, React 19, Tailwind v4, Vitest + Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-14-nemesis-draft-design.md`. Read it before starting.
- Divisions are exactly `'Lunari'` and `'Solari'` (`src/lib/schedule/types.ts` exports `DIVISIONS` and `Division`).
- RPC errors use the `CODE: message` convention; the client extracts the code with `errCode()` from `src/lib/draft/types.ts`.
- Every new function: `revoke all on function ... from public;` then `grant execute ... to authenticated, service_role;`. Internal helpers get `revoke execute ... from public, anon, authenticated;`.
- New migrations are named `supabase/migrations/202608160000NN_<name>.sql` and must sort after `20260815000002`.
- New pgTAP tests start at `supabase/tests/0038_*.sql`. Every test file begins `begin;` / `create extension if not exists pgtap with schema extensions;` / `\ir helpers/_fixtures.sql.inc` and ends `select * from finish();` / `rollback;`.
- Never add `set row_security = off` to a test. It makes Postgres deny unconditionally, so denial assertions pass even when policies are broken.
- `react-hooks/set-state-in-effect` is an ESLint **error**. Adjust state during render instead — see `src/hooks/useCountdown.ts` and `src/components/admin/TeamEditor.tsx`.
- Gates before every commit: `npx supabase test db`, `npm test`, `npm run lint`, `npm run build`.
- The four-team pgTAP fixture (`tests.fixture()`) creates a draft in `setup` status with teams `Team A`–`Team D` at nomination positions 1–4, captains `tests.cap(1)`–`tests.cap(4)`, and admin `tests.admin_id()`. Nemesis tests must first `update public.drafts set status = 'complete'`.

---

### Task 1: The `nemesis_picks` table

**Files:**
- Create: `supabase/migrations/20260816000001_nemesis_picks.sql`
- Create: `supabase/tests/0038_nemesis_schema_test.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.nemesis_picks (id uuid, draft_id uuid, pick_number int, chooser_team_id uuid null, chosen_team_id uuid, division text, created_at timestamptz)`, readable by `anon` and `authenticated`, writable by nobody but `service_role` and the RPCs in Tasks 2–4.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0038_nemesis_schema_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(9);

select has_table('public', 'nemesis_picks', 'nemesis_picks table exists');
select col_is_pk('public', 'nemesis_picks', 'id', 'id is the primary key');

create temporary table t as select tests.fixture() as d;
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as a,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 2) as b;

insert into public.nemesis_picks (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
  values ((select d from t), 0, null, (select a from ids), 'Lunari');

prepare dup_pick_number as
  insert into public.nemesis_picks (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
  values ((select d from t), 0, (select a from ids), (select b from ids), 'Solari');
select throws_ok('dup_pick_number', '23505', null, 'a pick number cannot repeat within a draft');

prepare dup_chosen as
  insert into public.nemesis_picks (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
  values ((select d from t), 1, (select b from ids), (select a from ids), 'Solari');
select throws_ok('dup_chosen', '23505', null, 'a team cannot be placed twice in one draft');

prepare seed_with_chooser as
  insert into public.nemesis_picks (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
  values ((select d from t), 2, (select a from ids), (select b from ids), 'Solari');
select lives_ok('seed_with_chooser', 'a later pick may carry a chooser');

prepare later_without_chooser as
  insert into public.nemesis_picks (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
  values ((select d from t), 3, null, (select b from ids), 'Solari');
select throws_ok('later_without_chooser', '23514', null, 'only pick 0 may omit the chooser');

prepare bad_division as
  insert into public.nemesis_picks (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
  values ((select d from t), 4, (select a from ids), (select b from ids), 'Ionia');
select throws_ok('bad_division', '23514', null, 'division must be Lunari or Solari');

select ok(has_table_privilege('anon', 'public.nemesis_picks', 'select'),
          'spectators can read the nemesis chain');
select ok(not has_table_privilege('authenticated', 'public.nemesis_picks', 'insert'),
          'clients cannot insert picks directly');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.nemesis_picks" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260816000001_nemesis_picks.sql`:

```sql
-- Nemesis draft: after the auction completes, each team just placed banishes
-- another to the opposite division. This table is the whole state machine --
-- phase, whose turn it is, and the next division are all derived from it, so
-- an undo is a plain delete with no turn pointer left to correct.
--
-- pick_number 0 is the admin's seed: a team and the side it starts on, with no
-- chooser. Every later pick records who sent whom where.

create table public.nemesis_picks (
  id              uuid primary key default gen_random_uuid(),
  draft_id        uuid not null references public.drafts(id) on delete cascade,
  pick_number     int  not null,
  chooser_team_id uuid references public.teams(id) on delete cascade,
  chosen_team_id  uuid not null references public.teams(id) on delete cascade,
  division        text not null check (division in ('Lunari', 'Solari')),
  created_at      timestamptz not null default now(),
  unique (draft_id, pick_number),
  unique (draft_id, chosen_team_id),
  check ((pick_number = 0) = (chooser_team_id is null))
);

create index on public.nemesis_picks (draft_id, pick_number);

alter table public.nemesis_picks enable row level security;

-- Spectators watch the chain unfold; all writes go through the RPCs.
create policy nemesis_picks_public_read on public.nemesis_picks for select using (true);

grant select on public.nemesis_picks to anon, authenticated;
grant all on public.nemesis_picks to service_role;

alter publication supabase_realtime add table public.nemesis_picks;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: `0038_nemesis_schema_test.sql ... ok`, whole run `Result: PASS`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260816000001_nemesis_picks.sql supabase/tests/0038_nemesis_schema_test.sql
git commit -m "feat: add nemesis_picks table"
```

---

### Task 2: `nemesis_start`

**Files:**
- Create: `supabase/migrations/20260816000002_nemesis_start.sql`
- Create: `supabase/tests/0039_nemesis_start_test.sql`

**Interfaces:**
- Consumes: `public.nemesis_picks` (Task 1); `public._require_admin()`; `public._draft_system_message(uuid, text)`.
- Produces: `public.nemesis_start(p_draft_id uuid, p_team_id uuid, p_division text) returns void`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0039_nemesis_start_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(11);

select ok(not has_function_privilege('anon', 'public.nemesis_start(uuid,uuid,text)', 'execute'),
          'anon cannot start the nemesis draft');
select ok(has_function_privilege('authenticated', 'public.nemesis_start(uuid,uuid,text)', 'execute'),
          'authenticated callers reach the admin-gated start RPC');

create temporary table t as select tests.fixture() as d;
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as a,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 2) as b;

select tests.acting_as(tests.admin_id());
select throws_like($$ select public.nemesis_start(
  (select d from t), (select a from ids), 'Lunari') $$,
  'NEMESIS_INVALID%', 'cannot start while the auction draft is unfinished');

update public.drafts set status = 'complete' where id = (select d from t);
-- a leftover division from manual editing must not survive the start
update public.teams set division = 'Solari' where id = (select b from ids);

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.nemesis_start(
  (select d from t), (select a from ids), 'Lunari') $$,
  'NOT_ADMIN%', 'a captain cannot start the nemesis draft');

select tests.acting_as(tests.admin_id());
select throws_like($$ select public.nemesis_start(
  (select d from t), (select a from ids), 'Ionia') $$,
  'DIVISION_INVALID%', 'the seed division must be Lunari or Solari');

select lives_ok($$ select public.nemesis_start(
  (select d from t), (select a from ids), 'Lunari') $$,
  'admin seeds the first team and its division');
select is((select division from public.teams where id = (select a from ids)), 'Lunari',
          'the seeded team lands in the chosen division');
select is((select division from public.teams where id = (select b from ids)), null,
          'starting clears divisions left over from manual editing');
select is((select count(*) from public.nemesis_picks where draft_id = (select d from t)), 1::bigint,
          'the seed is stored as a single pick');
select ok((select chooser_team_id is null and pick_number = 0
             from public.nemesis_picks where draft_id = (select d from t)),
          'the seed is pick 0 with no chooser');

select throws_like($$ select public.nemesis_start(
  (select d from t), (select b from ids), 'Solari') $$,
  'NEMESIS_INVALID%', 'the nemesis draft cannot be started twice');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `function public.nemesis_start(uuid, uuid, text) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260816000002_nemesis_start.sql`:

```sql
-- Seed the nemesis draft: an admin names the first team and the side it starts
-- on. Everything after that is forced by the chain.

create function public.nemesis_start(
  p_draft_id uuid,
  p_team_id uuid,
  p_division text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_team public.teams;
  v_team_count int;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then
    raise exception 'DRAFT_INVALID: draft not found';
  end if;
  if v_draft.status <> 'complete' then
    raise exception 'NEMESIS_INVALID: finish the auction draft first';
  end if;
  if p_division is null or p_division not in ('Lunari', 'Solari') then
    raise exception 'DIVISION_INVALID: division must be Lunari or Solari';
  end if;
  if exists (select 1 from public.nemesis_picks where draft_id = p_draft_id) then
    raise exception 'NEMESIS_INVALID: the nemesis draft has already started';
  end if;

  select count(*) into v_team_count from public.teams where draft_id = p_draft_id;
  if v_team_count < 2 then
    raise exception 'NEMESIS_INVALID: need at least 2 teams';
  end if;

  select * into v_team from public.teams
    where id = p_team_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'TEAM_INVALID: team is not in this draft';
  end if;

  -- Divisions may have been set by hand before; the chain owns them now.
  update public.teams set division = null where draft_id = p_draft_id;

  insert into public.nemesis_picks
    (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
    values (p_draft_id, 0, null, v_team.id, p_division);
  update public.teams set division = p_division where id = v_team.id;

  perform public._draft_system_message(p_draft_id,
    '🗡️ Nemesis draft — ' || v_team.name || ' starts in ' || p_division || ' and picks first');
end $$;

revoke all on function public.nemesis_start(uuid, uuid, text) from public;
grant execute on function public.nemesis_start(uuid, uuid, text)
  to authenticated, service_role;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: `0039_nemesis_start_test.sql ... ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260816000002_nemesis_start.sql supabase/tests/0039_nemesis_start_test.sql
git commit -m "feat: seed the nemesis draft with an admin-chosen first team"
```

---

### Task 3: `nemesis_pick`

**Files:**
- Create: `supabase/migrations/20260816000003_nemesis_pick.sql`
- Create: `supabase/tests/0040_nemesis_chain_test.sql`

**Interfaces:**
- Consumes: `public.nemesis_picks` (Task 1); `public.nemesis_start` (Task 2).
- Produces: `public.nemesis_pick(p_draft_id uuid, p_chosen_team_id uuid) returns void`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0040_nemesis_chain_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(12);

select ok(not has_function_privilege('anon', 'public.nemesis_pick(uuid,uuid)', 'execute'),
          'anon cannot pick');

create temporary table t as select tests.fixture() as d;
update public.drafts set status = 'complete' where id = (select d from t);
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as a,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 2) as b,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 3) as c,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 4) as dd;

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.nemesis_pick((select d from t), (select b from ids)) $$,
  'NEMESIS_NOT_STARTED%', 'no picks before the draft is seeded');

select tests.acting_as(tests.admin_id());
select public.nemesis_start((select d from t), (select a from ids), 'Lunari');

-- Team A (cap 1) is on the clock; cap 2 is not.
select tests.acting_as(tests.cap(2));
select throws_like($$ select public.nemesis_pick((select d from t), (select c from ids)) $$,
  'NOT_YOUR_TURN%', 'only the team on the clock may pick');

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.nemesis_pick((select d from t), (select a from ids)) $$,
  'TEAM_PLACED%', 'an already-placed team cannot be picked again');

select lives_ok($$ select public.nemesis_pick((select d from t), (select b from ids)) $$,
  'the team on the clock banishes another team');
select is((select division from public.teams where id = (select b from ids)), 'Solari',
          'the chosen team lands opposite its chooser');

-- Team B is now on the clock; an admin may pick on their behalf.
select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.nemesis_pick((select d from t), (select c from ids)) $$,
  'an admin picks for the team on the clock');
select is((select division from public.teams where id = (select c from ids)), 'Lunari',
          'the third pick alternates back');

select tests.acting_as(tests.cap(3));
select public.nemesis_pick((select d from t), (select dd from ids));

select is(
  (select string_agg(t2.name, ',' order by np.pick_number)
     from public.nemesis_picks np
     join public.teams t2 on t2.id = np.chosen_team_id
    where np.draft_id = (select d from t) and np.division = 'Lunari'),
  'Team A,Team C',
  'Lunari holds the odd picks');
select is(
  (select string_agg(t2.name, ',' order by np.pick_number)
     from public.nemesis_picks np
     join public.teams t2 on t2.id = np.chosen_team_id
    where np.draft_id = (select d from t) and np.division = 'Solari'),
  'Team B,Team D',
  'Solari holds the even picks');

select tests.acting_as(tests.cap(4));
select throws_like($$ select public.nemesis_pick((select d from t), (select a from ids)) $$,
  'NEMESIS_COMPLETE%', 'no picks once every team is placed');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `function public.nemesis_pick(uuid, uuid) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260816000003_nemesis_pick.sql`:

```sql
-- One nemesis pick. The team on the clock is whoever was chosen last, and the
-- division is simply the opposite of that pick's side, so the chain alternates
-- and a 12-team league lands 6-6 without any cap logic.

create function public.nemesis_pick(
  p_draft_id uuid,
  p_chosen_team_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_last public.nemesis_picks;
  v_chooser public.teams;
  v_chosen public.teams;
  v_team_count int;
  v_pick_count int;
  v_division text;
  v_lunari text;
  v_solari text;
begin
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then
    raise exception 'DRAFT_INVALID: draft not found';
  end if;

  select * into v_last from public.nemesis_picks
    where draft_id = p_draft_id
    order by pick_number desc limit 1;
  if not found then
    raise exception 'NEMESIS_NOT_STARTED: the nemesis draft has not started';
  end if;

  select count(*) into v_team_count from public.teams where draft_id = p_draft_id;
  select count(*) into v_pick_count from public.nemesis_picks where draft_id = p_draft_id;
  if v_pick_count >= v_team_count then
    raise exception 'NEMESIS_COMPLETE: every team is already placed';
  end if;

  select * into v_chooser from public.teams where id = v_last.chosen_team_id;
  if not public.is_admin()
     and v_chooser.captain_profile_id is distinct from auth.uid() then
    raise exception 'NOT_YOUR_TURN: it is not your turn to pick';
  end if;

  select * into v_chosen from public.teams
    where id = p_chosen_team_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'TEAM_INVALID: team is not in this draft';
  end if;
  -- Covers picking yourself too: the chooser was placed by an earlier pick.
  if exists (
    select 1 from public.nemesis_picks
      where draft_id = p_draft_id and chosen_team_id = p_chosen_team_id
  ) then
    raise exception 'TEAM_PLACED: that team already has a division';
  end if;

  v_division := case when v_last.division = 'Lunari' then 'Solari' else 'Lunari' end;

  insert into public.nemesis_picks
    (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
    values (p_draft_id, v_last.pick_number + 1, v_chooser.id, v_chosen.id, v_division);
  update public.teams set division = v_division where id = v_chosen.id;

  perform public._draft_system_message(p_draft_id,
    '🗡️ ' || v_chooser.name || ' sent ' || v_chosen.name || ' to ' || v_division);

  if v_pick_count + 1 = v_team_count then
    select string_agg(t.name, ', ' order by np.pick_number) into v_lunari
      from public.nemesis_picks np join public.teams t on t.id = np.chosen_team_id
      where np.draft_id = p_draft_id and np.division = 'Lunari';
    select string_agg(t.name, ', ' order by np.pick_number) into v_solari
      from public.nemesis_picks np join public.teams t on t.id = np.chosen_team_id
      where np.draft_id = p_draft_id and np.division = 'Solari';
    perform public._draft_system_message(p_draft_id,
      '🏁 Nemesis draft complete — Lunari: ' || coalesce(v_lunari, '—') ||
      ' · Solari: ' || coalesce(v_solari, '—'));
  end if;
end $$;

revoke all on function public.nemesis_pick(uuid, uuid) from public;
grant execute on function public.nemesis_pick(uuid, uuid)
  to authenticated, service_role;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: `0040_nemesis_chain_test.sql ... ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260816000003_nemesis_pick.sql supabase/tests/0040_nemesis_chain_test.sql
git commit -m "feat: nemesis picks alternate divisions down the chain"
```

---

### Task 4: `nemesis_undo` and `nemesis_reset`

**Files:**
- Create: `supabase/migrations/20260816000004_nemesis_undo_reset.sql`
- Create: `supabase/tests/0041_nemesis_admin_test.sql`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `public.nemesis_undo(p_draft_id uuid) returns void`, `public.nemesis_reset(p_draft_id uuid) returns void`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0041_nemesis_admin_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(11);

select ok(not has_function_privilege('anon', 'public.nemesis_undo(uuid)', 'execute'),
          'anon cannot undo a nemesis pick');
select ok(not has_function_privilege('anon', 'public.nemesis_reset(uuid)', 'execute'),
          'anon cannot reset the nemesis draft');

create temporary table t as select tests.fixture() as d;
update public.drafts set status = 'complete' where id = (select d from t);
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as a,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 2) as b,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 3) as c;

select tests.acting_as(tests.admin_id());
select public.nemesis_start((select d from t), (select a from ids), 'Lunari');
select public.nemesis_pick((select d from t), (select b from ids));
select public.nemesis_pick((select d from t), (select c from ids));

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.nemesis_undo((select d from t)) $$,
  'NOT_ADMIN%', 'a captain cannot undo a pick');
select throws_like($$ select public.nemesis_reset((select d from t)) $$,
  'NOT_ADMIN%', 'a captain cannot reset the nemesis draft');

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.nemesis_undo((select d from t)) $$,
  'admin undoes the last pick');
select is((select division from public.teams where id = (select c from ids)), null,
          'the undone team loses its division');
select is((select max(pick_number) from public.nemesis_picks where draft_id = (select d from t)), 1,
          'the chain rewinds to the previous pick');

-- Team B is on the clock again and the chain carries on.
select tests.acting_as(tests.cap(2));
select lives_ok($$ select public.nemesis_pick((select d from t), (select c from ids)) $$,
  'the rewound clock lets the previous chooser pick again');

select tests.acting_as(tests.admin_id());
select public.nemesis_undo((select d from t));
select public.nemesis_undo((select d from t));
select throws_like($$ select public.nemesis_undo((select d from t)) $$,
  'NEMESIS_SEED%', 'undo refuses to unwind the seed');

select lives_ok($$ select public.nemesis_reset((select d from t)) $$,
  'admin resets the nemesis draft');
select ok(
  not exists (select 1 from public.nemesis_picks where draft_id = (select d from t))
  and not exists (select 1 from public.teams
                    where draft_id = (select d from t) and division is not null),
  'reset clears every pick and every division');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `function public.nemesis_undo(uuid) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260816000004_nemesis_undo_reset.sql`:

```sql
-- Admin corrections. Because the clock is derived from the last pick, undo is
-- a plain delete -- there is no turn pointer to rewind separately.

create function public.nemesis_undo(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_last public.nemesis_picks;
  v_chosen public.teams;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then
    raise exception 'DRAFT_INVALID: draft not found';
  end if;

  select * into v_last from public.nemesis_picks
    where draft_id = p_draft_id
    order by pick_number desc limit 1;
  if not found then
    raise exception 'NEMESIS_NOT_STARTED: the nemesis draft has not started';
  end if;
  if v_last.pick_number = 0 then
    raise exception 'NEMESIS_SEED: reset the nemesis draft to change who starts';
  end if;

  select * into v_chosen from public.teams where id = v_last.chosen_team_id for update;
  update public.teams set division = null where id = v_last.chosen_team_id;
  delete from public.nemesis_picks where id = v_last.id;

  perform public._draft_system_message(p_draft_id,
    '↩️ Admin undid the nemesis pick of ' || v_chosen.name);
end $$;

create function public.nemesis_reset(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then
    raise exception 'DRAFT_INVALID: draft not found';
  end if;

  delete from public.nemesis_picks where draft_id = p_draft_id;
  update public.teams set division = null where draft_id = p_draft_id;

  perform public._draft_system_message(p_draft_id,
    '🔄 Admin reset the nemesis draft — every division is cleared');
end $$;

revoke all on function public.nemesis_undo(uuid) from public;
revoke all on function public.nemesis_reset(uuid) from public;
grant execute on function public.nemesis_undo(uuid) to authenticated, service_role;
grant execute on function public.nemesis_reset(uuid) to authenticated, service_role;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: `0041_nemesis_admin_test.sql ... ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260816000004_nemesis_undo_reset.sql supabase/tests/0041_nemesis_admin_test.sql
git commit -m "feat: admins can undo a nemesis pick or reset the draft"
```

---

### Task 5: Pure nemesis derivation

**Files:**
- Create: `src/lib/draft/nemesis.ts`
- Create: `src/lib/draft/nemesis.test.ts`
- Modify: `src/lib/draft/types.ts` (append the `NemesisPick` interface)

**Interfaces:**
- Consumes: `Team` from `src/lib/draft/types.ts`, `Division` from `src/lib/schedule/types.ts`.
- Produces:
  - `interface NemesisPick { id: string; draft_id: string; pick_number: number; chooser_team_id: string | null; chosen_team_id: string; division: Division; created_at: string }` (exported from `src/lib/draft/types.ts`)
  - `type NemesisPhase = "not_started" | "live" | "complete"`
  - `interface NemesisState { phase: NemesisPhase; onTheClockTeamId: string | null; nextDivision: Division | null; placed: Team[]; unplaced: Team[]; byDivision: Record<Division, Team[]> }`
  - `function nemesisState(teams: Team[], picks: NemesisPick[]): NemesisState`
  - `function otherDivision(division: Division): Division`

- [ ] **Step 1: Write the failing test**

Create `src/lib/draft/nemesis.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nemesisState, otherDivision } from "./nemesis";
import type { NemesisPick, Team } from "./types";

const team = (id: string, name: string, captain: string | null = null): Team => ({
  id,
  draft_id: "d1",
  name,
  captain_profile_id: captain,
  abbreviation: name.slice(0, 2).toUpperCase(),
  image_url: null,
  banner_color: null,
  division: null,
  nomination_position: 1,
  budget_start: 100,
  points_remaining: 100,
});

const pick = (
  n: number,
  chosen: string,
  division: "Lunari" | "Solari",
  chooser: string | null
): NemesisPick => ({
  id: `p${n}`,
  draft_id: "d1",
  pick_number: n,
  chooser_team_id: chooser,
  chosen_team_id: chosen,
  division,
  created_at: "2026-08-14T00:00:00Z",
});

const teams = [team("a", "Alpha"), team("b", "Bravo"), team("c", "Charlie"), team("d", "Delta")];

describe("otherDivision", () => {
  it("flips sides", () => {
    expect(otherDivision("Lunari")).toBe("Solari");
    expect(otherDivision("Solari")).toBe("Lunari");
  });
});

describe("nemesisState", () => {
  it("reports not started with no picks", () => {
    const s = nemesisState(teams, []);
    expect(s.phase).toBe("not_started");
    expect(s.onTheClockTeamId).toBeNull();
    expect(s.nextDivision).toBeNull();
    expect(s.unplaced).toHaveLength(4);
  });

  it("puts the seeded team on the clock and aims at the other division", () => {
    const s = nemesisState(teams, [pick(0, "a", "Lunari", null)]);
    expect(s.phase).toBe("live");
    expect(s.onTheClockTeamId).toBe("a");
    expect(s.nextDivision).toBe("Solari");
    expect(s.byDivision.Lunari.map((t) => t.id)).toEqual(["a"]);
    expect(s.unplaced.map((t) => t.id)).toEqual(["b", "c", "d"]);
  });

  it("hands the clock to whoever was chosen last", () => {
    const s = nemesisState(teams, [pick(0, "a", "Lunari", null), pick(1, "b", "Solari", "a")]);
    expect(s.onTheClockTeamId).toBe("b");
    expect(s.nextDivision).toBe("Lunari");
  });

  it("alternates sides across a full chain and completes", () => {
    const s = nemesisState(teams, [
      pick(0, "a", "Lunari", null),
      pick(1, "b", "Solari", "a"),
      pick(2, "c", "Lunari", "b"),
      pick(3, "d", "Solari", "c"),
    ]);
    expect(s.phase).toBe("complete");
    expect(s.onTheClockTeamId).toBeNull();
    expect(s.nextDivision).toBeNull();
    expect(s.byDivision.Lunari.map((t) => t.id)).toEqual(["a", "c"]);
    expect(s.byDivision.Solari.map((t) => t.id)).toEqual(["b", "d"]);
    expect(s.unplaced).toHaveLength(0);
  });

  it("orders placed teams by pick number regardless of input order", () => {
    const s = nemesisState(teams, [pick(1, "b", "Solari", "a"), pick(0, "a", "Lunari", null)]);
    expect(s.placed.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("ignores picks naming a team the draft no longer holds", () => {
    const s = nemesisState(teams, [pick(0, "a", "Lunari", null), pick(1, "gone", "Solari", "a")]);
    expect(s.placed.map((t) => t.id)).toEqual(["a"]);
    expect(s.unplaced.map((t) => t.id)).toEqual(["b", "c", "d"]);
  });

  it("treats an empty draft as not started", () => {
    expect(nemesisState([], []).phase).toBe("not_started");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/draft/nemesis.test.ts`
Expected: FAIL — cannot resolve `./nemesis`.

- [ ] **Step 3: Add the `NemesisPick` type**

Append to `src/lib/draft/types.ts` (after the `Lot` interface):

```ts
export interface NemesisPick {
  id: string; draft_id: string; pick_number: number;
  chooser_team_id: string | null; chosen_team_id: string;
  division: Division; created_at: string;
}
```

- [ ] **Step 4: Write the derivation**

Create `src/lib/draft/nemesis.ts`:

```ts
import type { Division } from "@/lib/schedule/types";
import type { NemesisPick, Team } from "./types";

export type NemesisPhase = "not_started" | "live" | "complete";

export interface NemesisState {
  phase: NemesisPhase;
  onTheClockTeamId: string | null;
  nextDivision: Division | null;
  /** Placed teams in pick order, seed first. */
  placed: Team[];
  unplaced: Team[];
  byDivision: Record<Division, Team[]>;
}

export function otherDivision(division: Division): Division {
  return division === "Lunari" ? "Solari" : "Lunari";
}

/** Everything the board needs, derived from the picks alone. The clock is
 *  never stored, so an undone pick rewinds it by definition. */
export function nemesisState(teams: Team[], picks: NemesisPick[]): NemesisState {
  const inOrder = [...picks].sort((a, b) => a.pick_number - b.pick_number);
  const byId = new Map(teams.map((t) => [t.id, t]));

  const placed: Team[] = [];
  const byDivision: Record<Division, Team[]> = { Lunari: [], Solari: [] };
  for (const p of inOrder) {
    const t = byId.get(p.chosen_team_id);
    if (!t) continue; // a pick for a team since removed from the draft
    placed.push(t);
    byDivision[p.division].push(t);
  }

  const placedIds = new Set(placed.map((t) => t.id));
  const unplaced = teams.filter((t) => !placedIds.has(t.id));

  const last = inOrder.length ? inOrder[inOrder.length - 1] : null;
  const phase: NemesisPhase =
    inOrder.length === 0 ? "not_started" : placed.length >= teams.length ? "complete" : "live";

  return {
    phase,
    onTheClockTeamId: phase === "live" && last ? last.chosen_team_id : null,
    nextDivision: phase === "live" && last ? otherDivision(last.division) : null,
    placed,
    unplaced,
    byDivision,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/draft/nemesis.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/draft/nemesis.ts src/lib/draft/nemesis.test.ts src/lib/draft/types.ts
git commit -m "feat: derive nemesis draft state from the picks alone"
```

---

### Task 6: `NemesisBoard` component

**Files:**
- Create: `src/components/draft/NemesisBoard.tsx`
- Create: `src/components/draft/NemesisBoard.test.tsx`

**Interfaces:**
- Consumes: `nemesisState` (Task 5); RPCs `nemesis_start`, `nemesis_pick`, `nemesis_undo`, `nemesis_reset` (Tasks 2–4); `createClient` from `@/lib/supabase/client`; `errCode`/`errMessage` from `@/lib/draft/types`.
- Produces: default export `NemesisBoard`, props
  `{ draftId: string; teams: Team[]; picks: NemesisPick[]; myTeamId: string | null; isAdmin: boolean; onError: (msg: string) => void }`.
  It fetches nothing — the parent supplies `picks`.

Copy rules (tests assert these strings): the seed button reads `Start nemesis draft`; pick buttons read `Send <team> to <division>`; the not-started notice for non-admins reads `Nemesis draft hasn't started yet.`; admin buttons read `Undo last pick` and `Reset nemesis draft`.

- [ ] **Step 1: Write the failing test**

Create `src/components/draft/NemesisBoard.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NemesisPick, Team } from "@/lib/draft/types";
import NemesisBoard from "./NemesisBoard";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

const team = (id: string, name: string, captain: string | null = null): Team => ({
  id, draft_id: "d1", name, captain_profile_id: captain,
  abbreviation: name.slice(0, 2).toUpperCase(), image_url: null, banner_color: null,
  division: null, nomination_position: 1, budget_start: 100, points_remaining: 100,
});

const pick = (
  n: number, chosen: string, division: "Lunari" | "Solari", chooser: string | null
): NemesisPick => ({
  id: `p${n}`, draft_id: "d1", pick_number: n, chooser_team_id: chooser,
  chosen_team_id: chosen, division, created_at: "2026-08-14T00:00:00Z",
});

const teams = [team("a", "Alpha"), team("b", "Bravo"), team("c", "Charlie"), team("d", "Delta")];
const onError = vi.fn();
const props = { draftId: "d1", teams, picks: [] as NemesisPick[], myTeamId: null, isAdmin: false, onError };

afterEach(() => {
  cleanup();
  rpc.mockClear();
  rpc.mockResolvedValue({ error: null });
  onError.mockClear();
});

describe("NemesisBoard", () => {
  it("tells spectators the draft hasn't started", () => {
    render(<NemesisBoard {...props} />);

    expect(screen.getByText("Nemesis draft hasn't started yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start nemesis draft" })).toBeNull();
  });

  it("seeds the draft from the admin panel", async () => {
    render(<NemesisBoard {...props} isAdmin />);

    fireEvent.change(screen.getByLabelText("First team"), { target: { value: "c" } });
    fireEvent.change(screen.getByLabelText("Starting division"), { target: { value: "Solari" } });
    fireEvent.click(screen.getByRole("button", { name: "Start nemesis draft" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("nemesis_start", {
        p_draft_id: "d1", p_team_id: "c", p_division: "Solari",
      })
    );
  });

  it("shows who is on the clock without offering picks to other captains", () => {
    render(<NemesisBoard {...props} picks={[pick(0, "a", "Lunari", null)]} myTeamId="b" />);

    expect(screen.getByText(/Alpha is on the clock/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send Charlie to Solari" })).toBeNull();
  });

  it("lets the captain on the clock banish an unplaced team", async () => {
    render(<NemesisBoard {...props} picks={[pick(0, "a", "Lunari", null)]} myTeamId="a" />);

    fireEvent.click(screen.getByRole("button", { name: "Send Charlie to Solari" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("nemesis_pick", {
        p_draft_id: "d1", p_chosen_team_id: "c",
      })
    );
  });

  it("never offers an already-placed team", () => {
    render(<NemesisBoard {...props} picks={[pick(0, "a", "Lunari", null)]} myTeamId="a" />);

    expect(screen.queryByRole("button", { name: "Send Alpha to Solari" })).toBeNull();
  });

  it("lets an admin pick for the team on the clock", async () => {
    render(<NemesisBoard {...props} picks={[pick(0, "a", "Lunari", null)]} myTeamId={null} isAdmin />);

    fireEvent.click(screen.getByRole("button", { name: "Send Bravo to Solari" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("nemesis_pick", {
        p_draft_id: "d1", p_chosen_team_id: "b",
      })
    );
  });

  it("reports a rejected pick through onError", async () => {
    rpc.mockResolvedValue({ error: { message: "NOT_YOUR_TURN: it is not your turn to pick" } });
    render(<NemesisBoard {...props} picks={[pick(0, "a", "Lunari", null)]} myTeamId="a" />);

    fireEvent.click(screen.getByRole("button", { name: "Send Bravo to Solari" }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
  });

  it("undoes and resets from the admin controls", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<NemesisBoard {...props} picks={[pick(0, "a", "Lunari", null)]} isAdmin />);

    fireEvent.click(screen.getByRole("button", { name: "Undo last pick" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("nemesis_undo", { p_draft_id: "d1" }));

    fireEvent.click(screen.getByRole("button", { name: "Reset nemesis draft" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("nemesis_reset", { p_draft_id: "d1" }));
  });

  it("shows the final divisions and pick order when complete", () => {
    render(
      <NemesisBoard
        {...props}
        picks={[
          pick(0, "a", "Lunari", null),
          pick(1, "b", "Solari", "a"),
          pick(2, "c", "Lunari", "b"),
          pick(3, "d", "Solari", "c"),
        ]}
      />
    );

    expect(screen.getByText("Nemesis draft complete")).toBeTruthy();
    expect(screen.getByText("Bravo sent Charlie to Lunari")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Send / })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/draft/NemesisBoard.test.tsx`
Expected: FAIL — cannot resolve `./NemesisBoard`.

- [ ] **Step 3: Write the component**

Create `src/components/draft/NemesisBoard.tsx`:

```tsx
"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { errMessage, type NemesisPick, type Team } from "@/lib/draft/types";
import { DIVISIONS, type Division } from "@/lib/schedule/types";
import { nemesisState } from "@/lib/draft/nemesis";

/** Post-auction division draft. Renders from picks alone; the parent owns the
 *  realtime subscription that keeps them fresh. */
export default function NemesisBoard({
  draftId,
  teams,
  picks,
  myTeamId,
  isAdmin,
  onError,
}: {
  draftId: string;
  teams: Team[];
  picks: NemesisPick[];
  myTeamId: string | null;
  isAdmin: boolean;
  onError: (msg: string) => void;
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [seedTeam, setSeedTeam] = useState("");
  const [seedDivision, setSeedDivision] = useState<Division>("Lunari");

  const state = nemesisState(teams, picks);
  const onTheClock = teams.find((t) => t.id === state.onTheClockTeamId) ?? null;
  const myTurn = !!myTeamId && state.onTheClockTeamId === myTeamId;
  const canPick = state.phase === "live" && (myTurn || isAdmin);

  const run = async (fn: () => PromiseLike<{ error: unknown }>) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) onError(errMessage(error).replace(/^[A-Z_]+:\s*/, ""));
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";

  return (
    <section className="card-brand flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label-dash">Nemesis draft</h2>
        {state.phase === "live" && onTheClock && (
          // One text node, not styled spans: Testing Library's getByText only
          // sees an element's direct text children, so a split sentence is
          // unassertable without brittle container matching.
          <p className="type-display text-base not-italic text-gold">
            {`${onTheClock.name} is on the clock — their pick goes to ${state.nextDivision}`}
          </p>
        )}
        {state.phase === "complete" && (
          <p className="type-display text-base not-italic text-gold">Nemesis draft complete</p>
        )}
      </div>

      {state.phase === "not_started" &&
        (isAdmin ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-steel">
              First team
              <select
                value={seedTeam}
                onChange={(e) => setSeedTeam(e.target.value)}
                className="rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-gold focus:outline-none"
              >
                <option value="">— select team —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-steel">
              Starting division
              <select
                value={seedDivision}
                onChange={(e) => setSeedDivision(e.target.value as Division)}
                className="rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-gold focus:outline-none"
              >
                {DIVISIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !seedTeam}
              onClick={() =>
                run(() =>
                  supabase.rpc("nemesis_start", {
                    p_draft_id: draftId,
                    p_team_id: seedTeam,
                    p_division: seedDivision,
                  })
                )
              }
              className="rounded bg-gold px-3 py-1.5 text-xs font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
            >
              Start nemesis draft
            </button>
          </div>
        ) : (
          <p className="text-sm text-steel">Nemesis draft hasn&apos;t started yet.</p>
        ))}

      {state.phase !== "not_started" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DIVISIONS.map((division) => (
            <div key={division} className="rounded border border-line bg-navy/40 p-3">
              <h3 className="label-dash mb-2">{division}</h3>
              <ul className="flex flex-col gap-1">
                {state.byDivision[division].map((t) => (
                  <li key={t.id} className="text-sm text-white">
                    {t.name}
                  </li>
                ))}
                {state.byDivision[division].length === 0 && (
                  <li className="text-sm text-steel">Empty</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      {canPick && state.nextDivision && (
        <div className="flex flex-col gap-2">
          <h3 className="label-dash">
            {myTurn ? "Your pick" : `Picking for ${onTheClock?.name ?? ""}`}
          </h3>
          <div className="flex flex-wrap gap-2">
            {state.unplaced.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    supabase.rpc("nemesis_pick", {
                      p_draft_id: draftId,
                      p_chosen_team_id: t.id,
                    })
                  )
                }
                className="btn-pill text-sm disabled:opacity-40"
              >
                Send {t.name} to {state.nextDivision}
              </button>
            ))}
          </div>
        </div>
      )}

      {picks.length > 0 && (
        <ol className="flex flex-col gap-1 text-xs text-steel">
          {[...picks]
            .sort((a, b) => a.pick_number - b.pick_number)
            .map((p) => (
              <li key={p.id}>
                {p.chooser_team_id
                  ? `${nameOf(p.chooser_team_id)} sent ${nameOf(p.chosen_team_id)} to ${p.division}`
                  : `${nameOf(p.chosen_team_id)} started in ${p.division}`}
              </li>
            ))}
        </ol>
      )}

      {isAdmin && state.phase !== "not_started" && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!confirm("Undo the last nemesis pick?")) return;
              void run(() => supabase.rpc("nemesis_undo", { p_draft_id: draftId }));
            }}
            className="rounded border border-line px-2 py-1 text-xs font-semibold text-steel hover:text-gold disabled:opacity-40"
          >
            Undo last pick
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!confirm("Reset the nemesis draft? Every division is cleared.")) return;
              void run(() => supabase.rpc("nemesis_reset", { p_draft_id: draftId }));
            }}
            className="rounded border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-400 disabled:opacity-40"
          >
            Reset nemesis draft
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/draft/NemesisBoard.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run lint**

Run: `npx eslint src/components/draft/NemesisBoard.tsx src/lib/draft/nemesis.ts`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/components/draft/NemesisBoard.tsx src/components/draft/NemesisBoard.test.tsx
git commit -m "feat: nemesis board with seed panel, turn gating and admin controls"
```

---

### Task 7: `useNemesisPicks` hook and board wiring

**Files:**
- Create: `src/hooks/useNemesisPicks.ts`
- Modify: `src/components/draft/DraftBoard.tsx` (the `draft.status === "complete"` branch, currently line 99-100)
- Create: `src/hooks/useNemesisPicks.test.ts`

**Interfaces:**
- Consumes: `NemesisPick` (Task 5), `NemesisBoard` (Task 6).
- Produces: `function useNemesisPicks(draftId: string): { picks: NemesisPick[] }`.

The hook refetches the whole list on any change rather than patching rows individually. The list is at most one row per team, and `nemesis_reset` deletes every row at once — refetching avoids depending on what a DELETE payload carries.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useNemesisPicks.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNemesisPicks } from "./useNemesisPicks";

const { from, channel, on, subscribe, removeChannel, order, eq, select } = vi.hoisted(() => {
  const on = vi.fn();
  const subscribe = vi.fn();
  const order = vi.fn();
  const eq = vi.fn();
  const select = vi.fn();
  return {
    from: vi.fn(),
    channel: vi.fn(),
    on,
    subscribe,
    removeChannel: vi.fn(),
    order,
    eq,
    select,
  };
});

const rows = [
  {
    id: "p0", draft_id: "d1", pick_number: 0, chooser_team_id: null,
    chosen_team_id: "a", division: "Lunari", created_at: "2026-08-14T00:00:00Z",
  },
];

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from, channel, removeChannel }),
}));

select.mockReturnValue({ eq });
eq.mockReturnValue({ order });
order.mockResolvedValue({ data: rows });
from.mockReturnValue({ select });
on.mockReturnValue({ on, subscribe });
channel.mockReturnValue({ on, subscribe });

afterEach(() => {
  subscribe.mockReset();
  vi.clearAllMocks();
  select.mockReturnValue({ eq });
  eq.mockReturnValue({ order });
  order.mockResolvedValue({ data: rows });
  from.mockReturnValue({ select });
  on.mockReturnValue({ on, subscribe });
  channel.mockReturnValue({ on, subscribe });
});

describe("useNemesisPicks", () => {
  it("loads picks once the channel subscribes", async () => {
    subscribe.mockImplementation((cb: (status: string) => void) => {
      cb("SUBSCRIBED");
      return { on, subscribe };
    });

    const { result } = renderHook(() => useNemesisPicks("d1"));

    await waitFor(() => expect(result.current.picks).toHaveLength(1));
    expect(from).toHaveBeenCalledWith("nemesis_picks");
    expect(channel).toHaveBeenCalledWith("nemesis:d1");
  });

  it("stays empty until the channel is subscribed", () => {
    subscribe.mockImplementation(() => ({ on, subscribe }));

    const { result } = renderHook(() => useNemesisPicks("d1"));

    expect(result.current.picks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/useNemesisPicks.test.ts`
Expected: FAIL — cannot resolve `./useNemesisPicks`.

- [ ] **Step 3: Write the hook**

Create `src/hooks/useNemesisPicks.ts`:

```ts
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NemesisPick } from "@/lib/draft/types";

/** Live nemesis chain for a draft. Kept out of useDraftState, which already
 *  carries five tables. Refetches whole rather than patching rows: the list is
 *  tiny and a reset deletes every row at once. */
export function useNemesisPicks(draftId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [picks, setPicks] = useState<NemesisPick[]>([]);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("nemesis_picks")
      .select("*")
      .eq("draft_id", draftId)
      .order("pick_number");
    setPicks((data as NemesisPick[]) ?? []);
  }, [supabase, draftId]);

  useEffect(() => {
    const ch = supabase
      .channel(`nemesis:${draftId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nemesis_picks", filter: `draft_id=eq.${draftId}` },
        () => void refetch()
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") void refetch(); // initial load and reconnect catch-up
      });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, draftId, refetch]);

  return { picks };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/useNemesisPicks.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Wire it into the board**

In `src/components/draft/DraftBoard.tsx`:

Add the imports beside the existing ones:

```tsx
import { useNemesisPicks } from "@/hooks/useNemesisPicks";
import NemesisBoard from "./NemesisBoard";
```

Add the hook call directly below `const s = useDraftState(draftId);`:

```tsx
const { picks: nemesisPicks } = useNemesisPicks(draftId);
```

Replace the completed-draft branch:

```tsx
          {draft.status === "complete" ? (
            <FinalRosters teams={teams} players={players} myTeamId={myTeam?.id ?? null} />
          ) : (
```

with:

```tsx
          {draft.status === "complete" ? (
            <div className="flex flex-col gap-4">
              <NemesisBoard
                draftId={draftId}
                teams={teams}
                picks={nemesisPicks}
                myTeamId={myTeam?.id ?? null}
                isAdmin={s.isAdmin}
                onError={setToast}
              />
              <FinalRosters teams={teams} players={players} myTeamId={myTeam?.id ?? null} />
            </div>
          ) : (
```

Hooks must not be called conditionally, so `useNemesisPicks` sits at the top of the component with the other hooks even though the board only renders once the draft completes.

- [ ] **Step 6: Run the full suite, lint and build**

Run: `npm test && npm run lint && npm run build`
Expected: all pass, no new lint output.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useNemesisPicks.ts src/hooks/useNemesisPicks.test.ts src/components/draft/DraftBoard.tsx
git commit -m "feat: stream the nemesis chain onto the completed draft board"
```

---

### Task 8: Undoable forced auto-assignments

**Files:**
- Create: `supabase/migrations/20260816000005_undo_forced_auto_assign.sql`
- Create: `supabase/tests/0042_undo_forced_auto_assign_test.sql`

**Interfaces:**
- Consumes: `public._auto_assign_forced(uuid)` and `public._close_lot(uuid, boolean)` from `supabase/migrations/20260814000004_draft_forced_auto_assign.sql`; `public.undo_last_sale(uuid)` from `supabase/migrations/20260810000004_admin_assignment_integrity.sql`.
- Produces: column `public.players.auto_assigned_from_lot_id uuid`; `public._auto_assign_forced(p_draft_id uuid, p_lot_id uuid)` replacing the one-argument form; `undo_last_sale` reversing a sale together with the cascade it caused.

Read both source migrations before editing — the replacements below must preserve every rule they already enforce.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0042_undo_forced_auto_assign_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(7);

select has_column('public', 'players', 'auto_assigned_from_lot_id',
                  'players records the lot that forced an auto-assignment');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_auto_assign_forced'
     and pg_get_function_identity_arguments(p.oid) = 'uuid'
), 'the stale one-argument _auto_assign_forced overload is gone');

-- Four teams, each needing mid/adc/support. Sell mid and adc down to the last
-- support pair so the next close forces an auto-assignment.
create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));

create or replace function tests.sell_open_role(p_d uuid) returns void
language plpgsql as $f$
declare
  v_team public.teams; v_role public.lol_role; v_player_id uuid; v_lot uuid;
begin
  select t.* into v_team from public.teams t
    join public.drafts d on d.current_nominator_team_id = t.id where d.id = p_d;
  select r into v_role from unnest(public.open_roles(v_team.id)) as r limit 1;
  select p.id into v_player_id from public.players p
    where p.draft_id = p_d and p.role = v_role and p.team_id is null limit 1;
  perform tests.acting_as(v_team.captain_profile_id);
  v_lot := public.nominate(p_d, v_player_id);
  update public.lots set closes_at = now() - interval '1 second' where id = v_lot;
  perform public.close_lot(v_lot);
end $f$;

do $$
declare v_guard int := 0;
begin
  while (select status from public.drafts where id = (select d from t)) = 'live' loop
    v_guard := v_guard + 1;
    exit when v_guard > 12;
    perform tests.sell_open_role((select d from t));
  end loop;
end $$;

create temporary table forced as
  select * from public.players
   where draft_id = (select d from t) and auto_assigned_from_lot_id is not null;

select ok((select count(*) from forced) > 0,
          'closing the last contested lot forces at least one auto-assignment');

create temporary table before_undo as
  select p.id as player_id from forced p;

-- Compare league-wide totals, not per team: the sale being undone can refund
-- the very team that also received a forced assignment, so a per-team equality
-- would be off by the lot's winning bid.
create temporary table undo_target as
  select id, current_bid from public.lots
   where draft_id = (select d from t) and status = 'sold'
   order by coalesce(sale_action_sequence, 0) desc, closed_at desc, created_at desc
   limit 1;
create temporary table totals as
  select (select coalesce(sum(points_remaining), 0) from public.teams
           where draft_id = (select d from t)) as points,
         (select coalesce(sum(coalesce(price, 0)), 0) from forced) as forced_spend;

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.undo_last_sale((select d from t)) $$,
  'admin undoes the sale that triggered the cascade');

select is((select count(*) from public.players
            where id in (select player_id from before_undo)
              and (team_id is not null or auto_assigned_from_lot_id is not null)),
          0::bigint,
          'every auto-assigned player returns to the pool with the stamp cleared');
select is((select count(*) from public.players
            where id in (select player_id from before_undo)
              and (price is not null or acquisition is not null)),
          0::bigint,
          'returned auto-assigned players lose their price and acquisition');
select is(
  (select coalesce(sum(points_remaining), 0) from public.teams where draft_id = (select d from t)),
  (select points + forced_spend from totals) + (select current_bid from undo_target),
  'the league is refunded both the sale and every point its cascade cost');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `column "auto_assigned_from_lot_id" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260816000005_undo_forced_auto_assign.sql`:

```sql
-- Forced auto-assignments (20260814000004) hand out the last player in a role
-- with no lot behind them, which made them permanent: undo_last_sale only ever
-- reversed lots. Worse, undoing the sale that CAUSED a cascade left the
-- auto-assigned players on their teams -- a board state nothing else can reach.
--
-- Stamp each auto-assignment with the lot whose closure forced it, then reverse
-- the cascade with the sale.

alter table public.players
  add column auto_assigned_from_lot_id uuid references public.lots(id);

-- The parameter list changes, so this is a NEW function rather than a replace.
-- Drop the old one or _close_lot could keep calling a version that stamps
-- nothing, leaving auto-assignments unreversible while looking reversible.
drop function public._auto_assign_forced(uuid);

create function public._auto_assign_forced(p_draft_id uuid, p_lot_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role public.lol_role;
  v_player public.players;
  v_team public.teams;
  v_guard int := 0;
begin
  loop
    v_guard := v_guard + 1;
    exit when v_guard > 10;  -- 5 roles; cascade can never exceed the pool

    select r.role into v_role
      from (
        select p.role, count(*) as pool
          from public.players p
          where p.draft_id = p_draft_id and p.team_id is null
          group by p.role
      ) r
      where r.pool = 1
        and (select count(*) from public.teams t
             where t.draft_id = p_draft_id
               and r.role = any (public.open_roles(t.id))) = 1
      limit 1;
    exit when v_role is null;

    select * into v_player from public.players
      where draft_id = p_draft_id and team_id is null and role = v_role
      limit 1;
    select t.* into v_team from public.teams t
      where t.draft_id = p_draft_id and v_role = any (public.open_roles(t.id))
      limit 1;

    update public.players
      set team_id = v_team.id, price = 1, acquisition = 'auction',
          auto_assigned_from_lot_id = p_lot_id
      where id = v_player.id;
    update public.teams
      set points_remaining = points_remaining - 1
      where id = v_team.id;

    perform public._draft_system_message(p_draft_id,
      '⚡ ' || v_player.display_name || ' → ' || v_team.name ||
      ' for 1 point — last ' || upper(v_role::text) || ' on the board');
  end loop;
end $$;

revoke execute on function public._auto_assign_forced(uuid, uuid)
  from public, anon, authenticated;

create or replace function public._close_lot(p_lot_id uuid, p_force boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_lot   public.lots;
  v_draft public.drafts;
begin
  select d.* into v_draft from public.drafts d
    join public.lots l on l.draft_id = d.id
    where l.id = p_lot_id for update of d;
  if not found then return false; end if;
  if v_draft.status <> 'live' then return false; end if;

  select * into v_lot from public.lots where id = p_lot_id for update;
  if v_lot.status <> 'open' then return false; end if;
  if not p_force and now() < v_lot.closes_at then return false; end if;

  update public.lots set status = 'sold', closed_at = now() where id = p_lot_id;

  update public.players
    set team_id = v_lot.leading_team_id, price = v_lot.current_bid, acquisition = 'auction'
    where id = v_lot.player_id;

  update public.teams
    set points_remaining = points_remaining - v_lot.current_bid
    where id = v_lot.leading_team_id;

  perform public._auto_assign_forced(v_draft.id, p_lot_id);

  select * into v_draft from public.drafts where id = v_draft.id;  -- re-read post-sale
  perform public._advance_turn(v_draft);
  return true;
end $$;

create or replace function public.undo_last_sale(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_lot public.lots;
  v_forced text;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts
    where id = p_draft_id for update;
  if not found then
    raise exception 'DRAFT_INVALID: draft not found';
  end if;

  select * into v_lot from public.lots
    where draft_id = p_draft_id and status = 'sold'
    order by coalesce(sale_action_sequence, 0) desc,
             closed_at desc,
             created_at desc
    limit 1
    for update;
  if not found then
    raise exception 'LOT_CLOSED: nothing to undo';
  end if;
  if v_draft.last_direct_assignment_sequence is not null
     and v_draft.last_direct_assignment_sequence > coalesce(v_lot.sale_action_sequence, 0) then
    raise exception 'UNDO_BLOCKED_NEWER_ASSIGNMENT: a newer direct assignment must remain in place';
  end if;

  -- Reverse the cascade this sale forced, before the sale itself.
  select string_agg(display_name, ', ') into v_forced
    from public.players where auto_assigned_from_lot_id = v_lot.id;
  update public.teams t
    set points_remaining = t.points_remaining + coalesce(p.price, 0)
    from public.players p
    where p.auto_assigned_from_lot_id = v_lot.id and p.team_id = t.id;
  update public.players
    set team_id = null, price = null, acquisition = null, auto_assigned_from_lot_id = null
    where auto_assigned_from_lot_id = v_lot.id;
  if v_forced is not null then
    perform public._draft_system_message(p_draft_id,
      '↩️ Undo also returned ' || v_forced || ' to the pool');
  end if;

  update public.lots set status = 'cancelled' where id = v_lot.id;
  update public.players set team_id = null, price = null, acquisition = null
    where id = v_lot.player_id;
  update public.teams set points_remaining = points_remaining + v_lot.current_bid
    where id = v_lot.leading_team_id;
  update public.drafts
    set current_round = v_lot.round,
        current_nominator_team_id = v_lot.nominated_by_team_id,
        status = case when status in ('complete','live') then 'live' else status end
    where id = p_draft_id;
end $$;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: `0042_undo_forced_auto_assign_test.sql ... ok`, and `0009`, `0034` still `ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260816000005_undo_forced_auto_assign.sql supabase/tests/0042_undo_forced_auto_assign_test.sql
git commit -m "fix: undoing a sale also reverses the auto-assignments it forced"
```

---

### Task 9: Undo confirmation names the cascade

**Files:**
- Modify: `src/lib/draft/types.ts` (`Player` and `Lot` interfaces)
- Modify: `src/components/draft/AdminStrip.tsx` (the undo button, currently lines 68-76)
- Modify: `src/components/draft/DraftBoard.tsx` (pass `lots` to `AdminStrip`)
- Modify: `src/components/draft/AdminAssignmentPanel.test.tsx` — no change expected; run it to confirm.
- Create: `src/components/draft/AdminStrip.test.tsx`

**Interfaces:**
- Consumes: `auto_assigned_from_lot_id` (Task 8).
- Produces: `AdminStrip` gains a required `lots: Lot[]` prop.

- [ ] **Step 1: Extend the client types**

In `src/lib/draft/types.ts`, add to `Player`:

```ts
  auto_assigned_from_lot_id?: string | null;
```

and to `Lot`:

```ts
  sale_action_sequence?: number | null;
```

`sale_action_sequence` is how the server picks which sale to undo; sorting by anything else risks naming the wrong players in the prompt.

- [ ] **Step 2: Write the failing test**

Create `src/components/draft/AdminStrip.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Draft, Lot, Player, Team } from "@/lib/draft/types";
import AdminStrip from "./AdminStrip";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc, from: vi.fn() }) }));

const draft: Draft = {
  id: "d1", name: "Draft", status: "live", countdown_seconds: 30,
  round_minimums: [10, 5, 1], current_round: 1, current_nominator_team_id: "t1",
  paused_time_remaining: null, created_at: "2026-08-14T00:00:00Z",
};

const teams: Team[] = [{
  id: "t1", draft_id: "d1", name: "Alpha", captain_profile_id: null, abbreviation: "AL",
  image_url: null, banner_color: null, division: null, nomination_position: 1,
  budget_start: 100, points_remaining: 50,
}];

const lots: Lot[] = [{
  id: "lot-1", draft_id: "d1", player_id: "p1", nominated_by_team_id: "t1", round: 1,
  opening_bid: 10, current_bid: 12, leading_team_id: "t1",
  closes_at: "2026-08-14T00:00:10Z", status: "sold", created_at: "2026-08-14T00:00:00Z",
  closed_at: "2026-08-14T00:00:10Z", sale_action_sequence: 4,
}];

const players: Player[] = [
  { id: "p1", draft_id: "d1", display_name: "Mid One", role: "mid", rank: null, opgg_url: null,
    notes: null, team_id: "t1", price: 12, acquisition: "auction", auto_assigned_from_lot_id: null },
  { id: "p2", draft_id: "d1", display_name: "Jungle Two", role: "jungle", rank: null, opgg_url: null,
    notes: null, team_id: "t1", price: 1, acquisition: "auction", auto_assigned_from_lot_id: "lot-1" },
];

const onError = vi.fn();
const props = { draft, teams, players, lots, openLot: null, onError };

afterEach(() => {
  cleanup();
  rpc.mockClear();
  onError.mockClear();
  vi.restoreAllMocks();
});

describe("AdminStrip undo", () => {
  it("names the auto-assigned players the undo will also return", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminStrip {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Undo last sale" }));

    expect(confirmSpy.mock.calls[0][0]).toContain("Jungle Two");
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("undo_last_sale", { p_draft_id: "d1" }));
  });

  it("keeps the plain prompt when the sale forced nothing", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AdminStrip {...props} players={[players[0]]} />);

    fireEvent.click(screen.getByRole("button", { name: "Undo last sale" }));

    expect(confirmSpy.mock.calls[0][0]).not.toContain("also");
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/draft/AdminStrip.test.tsx`
Expected: FAIL — `AdminStrip` has no `lots` prop, and the prompt omits "Jungle Two".

- [ ] **Step 4: Implement**

In `src/components/draft/AdminStrip.tsx`, add `lots` to the props type and destructuring:

```tsx
  lots,
```
```tsx
  lots: Lot[];
```

Above the `return`, derive the prompt:

```tsx
  // The server undoes the sale with the highest sale_action_sequence; match it
  // exactly so the prompt cannot name the wrong players.
  const lastSold = lots
    .filter((l) => l.status === "sold")
    .sort((a, b) => (b.sale_action_sequence ?? 0) - (a.sale_action_sequence ?? 0))[0] ?? null;
  const cascaded = lastSold
    ? players.filter((p) => p.auto_assigned_from_lot_id === lastSold.id)
    : [];
  const undoLabel =
    cascaded.length > 0
      ? `Undo the last sale? ${cascaded.map((p) => p.display_name).join(", ")} ` +
        `${cascaded.length === 1 ? "was" : "were"} auto-assigned as a result and will also return to the pool.`
      : "Undo the last sale? The player returns to the pool and points are refunded.";
```

Replace the hard-coded label in the undo button's `run(...)` call with `undoLabel`.

In `src/components/draft/DraftBoard.tsx`, add `lots={lots}` to the `<AdminStrip ... />` element.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/draft/AdminStrip.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 6: Run every gate**

Run: `npx supabase test db && npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/draft/types.ts src/components/draft/AdminStrip.tsx src/components/draft/AdminStrip.test.tsx src/components/draft/DraftBoard.tsx
git commit -m "feat: undo prompt names the auto-assignments it will reverse"
```

---

### Task 10: Production check for unstamped auto-assignments

**Files:** none — this is a verification step whose result is reported to the user.

**Interfaces:** Consumes Task 8.

- [ ] **Step 1: Count affected rows**

The spec requires checking production rather than assuming. Auto-assignments made before Task 8's migration carry no lot id and cannot be reversed. Run against the linked project:

```sql
select count(*) from public.players
 where acquisition = 'auction'
   and auto_assigned_from_lot_id is null
   and id not in (select player_id from public.lots where status = 'sold');
```

- [ ] **Step 2: Report**

Report the count to the user. If it is zero, nothing more is needed. If it is not, list the affected players and teams and tell the user those specific rows must be corrected through the admin assignment panel rather than undo — do not attempt a backfill, since the lot that caused each assignment was never recorded.

---

## Self-Review Notes

- Spec coverage: chain rules (Tasks 1–4), derivation (5), UI states including seed panel, turn gating, admin controls and complete view (6–7), realtime (7), auto-assign undo (8–9), production check (10). The chat announcements are covered inside Tasks 2, 3, 4 and 8.
- Two defects found in review and fixed above: the on-the-clock banner was split across styled spans, which Testing Library's `getByText` cannot match (it reads only an element's direct text children); and Task 8's refund assertion compared points per team, which breaks whenever the undone sale refunds the same team that also received a forced assignment.
- `nemesis_pick` deliberately has no admin guard on the `for update` team lock: an admin picks *for* the team on the clock, which the `is_admin()` branch already permits.
- The `Division` type flows from `@/lib/schedule/types` everywhere; `byDivision` is keyed by it so a third division would be a type error rather than a silent bug.
