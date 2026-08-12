begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

select is(
  (
    select count(*)
    from public.players
    where draft_id = '7645b3e2-5cb3-4f28-8442-a36c9367f6f6'::uuid
      and canonical_player_id is not null
  ),
  59::bigint,
  'FPL S5 audited rows link 59 exact-or-alias matches'
);

select is(
  (
    select canonical_player_id::text
    from public.players
    where id = '6be899a8-1f94-4f61-96a8-3f3bee79554d'::uuid
  ),
  'f82a82b6-b23a-47da-a103-309243219535',
  'alias row 08 Mitsu Eclipse links to Chime canonical player'
);

select is(
  (
    select canonical_player_id::text
    from public.players
    where id = '80bf4b7c-107a-4fea-8227-6263f4db24df'::uuid
  ),
  '9eca3260-58a1-41a7-968a-5f6e9aae4dc1',
  'captain row Winter links to canonical captain record'
);

select is(
  (
    select canonical_player_id::text
    from public.players
    where id = '0d3a8629-c406-459a-b256-01a9367b051f'::uuid
  ),
  null,
  'unmatched AcidStep remains unlinked'
);

select is(
  (
    select count(*)
    from public.players
    where draft_id = '7645b3e2-5cb3-4f28-8442-a36c9367f6f6'::uuid
      and canonical_player_id is null
  ),
  1::bigint,
  'only one audited FPL S5 player remains unlinked'
);

select is(
  (
    select canonical_player_id::text
    from public.players
    where id = 'e1629c0d-bb7e-4db5-9581-3b37a7bf9b8c'::uuid
  ),
  null,
  'non-audited S4 rows stay untouched by the S5 link migration'
);

delete from public.player_pool
where id = 'f82a82b6-b23a-47da-a103-309243219535'::uuid;

select ok(
  exists(
    select 1
    from public.players
    where id = '6be899a8-1f94-4f61-96a8-3f3bee79554d'::uuid
      and canonical_player_id is null
  ),
  'deleting a canonical player nulls the draft link instead of deleting the draft row'
);

select ok(
  exists(
    select 1
    from public.players
    where id = '6be899a8-1f94-4f61-96a8-3f3bee79554d'::uuid
      and display_name = '08 Mitsu Eclipse'
  ),
  'draft row still exists after canonical deletion'
);

select * from finish();
rollback;
