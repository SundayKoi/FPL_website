begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

-- These assertions audit the one-time production backfill in
-- 20260812000005_link_existing_players.sql, which links a hardcoded list of
-- live FPL S5 draft rows to canonical player_pool rows. A freshly reset
-- database has none of those rows, so the audit is skipped there and runs for
-- real against a production restore.
create temporary table audited as
  select exists(
    select 1 from public.players
    where draft_id = '7645b3e2-5cb3-4f28-8442-a36c9367f6f6'::uuid
  ) as present;

select case when (select present from audited) then
  is(
    (
      select count(*)
      from public.players
      where draft_id = '7645b3e2-5cb3-4f28-8442-a36c9367f6f6'::uuid
        and canonical_player_id is not null
    ),
    59::bigint,
    'FPL S5 audited rows link 59 exact-or-alias matches'
  )
else skip('no audited FPL S5 draft in this database') end;

select case when (select present from audited) then
  is(
    (
      select canonical_player_id::text
      from public.players
      where id = '6be899a8-1f94-4f61-96a8-3f3bee79554d'::uuid
    ),
    'f82a82b6-b23a-47da-a103-309243219535',
    'alias row 08 Mitsu Eclipse links to Chime canonical player'
  )
else skip('no audited FPL S5 draft in this database') end;

select case when (select present from audited) then
  is(
    (
      select canonical_player_id::text
      from public.players
      where id = '80bf4b7c-107a-4fea-8227-6263f4db24df'::uuid
    ),
    '9eca3260-58a1-41a7-968a-5f6e9aae4dc1',
    'captain row Winter links to canonical captain record'
  )
else skip('no audited FPL S5 draft in this database') end;

select case when (select present from audited) then
  is(
    (
      select canonical_player_id::text
      from public.players
      where id = '0d3a8629-c406-459a-b256-01a9367b051f'::uuid
    ),
    null,
    'unmatched AcidStep remains unlinked'
  )
else skip('no audited FPL S5 draft in this database') end;

select case when (select present from audited) then
  is(
    (
      select count(*)
      from public.players
      where draft_id = '7645b3e2-5cb3-4f28-8442-a36c9367f6f6'::uuid
        and canonical_player_id is null
    ),
    1::bigint,
    'only one audited FPL S5 player remains unlinked'
  )
else skip('no audited FPL S5 draft in this database') end;

select case when (select present from audited) then
  is(
    (
      select canonical_player_id::text
      from public.players
      where id = 'e1629c0d-bb7e-4db5-9581-3b37a7bf9b8c'::uuid
    ),
    null,
    'non-audited S4 rows stay untouched by the S5 link migration'
  )
else skip('no audited FPL S5 draft in this database') end;

-- The delete cascade is schema behaviour, not backfill data, so it is checked
-- on rows this test creates and holds on any database, audited or not.
insert into public.drafts (id, name)
  values ('00000000-0000-0000-0000-0000000c0de0'::uuid, 'Cascade Test Draft');
insert into public.player_pool (id, season_key, normalized_name, display_name, role)
  values ('00000000-0000-0000-0000-0000000c0de1'::uuid,
          'cascade-test', 'cascade canonical', 'Cascade Canonical', 'mid');
insert into public.players (id, draft_id, display_name, role, canonical_player_id)
  values ('00000000-0000-0000-0000-0000000c0de2'::uuid,
          '00000000-0000-0000-0000-0000000c0de0'::uuid,
          'Cascade Draft Row', 'mid',
          '00000000-0000-0000-0000-0000000c0de1'::uuid);

delete from public.player_pool
where id = '00000000-0000-0000-0000-0000000c0de1'::uuid;

select ok(
  not exists(
    select 1
    from public.players
    where id = '00000000-0000-0000-0000-0000000c0de2'::uuid
      and canonical_player_id is not null
  ),
  'deleting a canonical player nulls the draft link instead of deleting the draft row'
);

select ok(
  exists(
    select 1
    from public.players
    where id = '00000000-0000-0000-0000-0000000c0de2'::uuid
      and display_name = 'Cascade Draft Row'
  ),
  'draft row still exists after canonical deletion'
);

select * from finish();
rollback;
