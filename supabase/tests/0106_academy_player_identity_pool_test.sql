begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(11);

select has_function(
  'public',
  '_sync_academy_player_pool',
  array[]::text[],
  'the Academy player pool sync helper exists'
);
select has_function(
  'public',
  'sync_academy_player_pool',
  array[]::text[],
  'the admin Academy player pool sync wrapper exists'
);

create temporary table academy_fixture as
with draft_row as (
  insert into public.drafts (name) values ('Academy Canonical Pool Test') returning id
), team_rows as (
  insert into public.teams (
    draft_id, name, abbreviation, nomination_position, budget_start, points_remaining
  )
  select id, name, abbreviation, position, 100, 100
  from draft_row
  cross join (values
    ('Academy Canonical Alpha', 'ACAA', 1),
    ('Academy Canonical Bravo', 'ACAB', 2),
    ('Academy Canonical Charlie', 'ACAC', 3),
    ('Academy Canonical Delta', 'ACAD', 4)
  ) as teams(name, abbreviation, position)
  returning id, nomination_position
)
select
  (select id from draft_row) as draft_id,
  (select id from team_rows where nomination_position = 1) as alpha_id,
  (select id from team_rows where nomination_position = 2) as bravo_id,
  (select id from team_rows where nomination_position = 3) as charlie_id,
  (select id from team_rows where nomination_position = 4) as delta_id;

update public.league_settings
set academy_draft_id = (select draft_id from academy_fixture),
    academy_season = 'TEST-A1'
where id = 1;

insert into public.players (
  draft_id, display_name, role, rank, opgg_url, team_id, price, acquisition
) values
  (
    (select draft_id from academy_fixture),
    'Captain: Academy Canonical Top#TEST', 'top', 'D2',
    'https://op.gg/lol/summoners/na/Academy-Top',
    (select alpha_id from academy_fixture), 1, 'auction'
  ),
  (
    (select draft_id from academy_fixture),
    'Academy Canonical Mid#TEST', 'mid', 'D3', null,
    (select bravo_id from academy_fixture), 1, 'auction'
  ),
  (
    (select draft_id from academy_fixture),
    'Academy Canonical Support', 'support', 'E1', null,
    (select charlie_id from academy_fixture), 1, 'auction'
  ),
  (
    (select draft_id from academy_fixture),
    'Academy Duplicate#ONE', 'adc', 'E2', null,
    (select delta_id from academy_fixture), 1, 'auction'
  ),
  (
    (select draft_id from academy_fixture),
    'academy duplicate#TWO', 'jungle', 'E2', null,
    (select alpha_id from academy_fixture), 1, 'auction'
  );

insert into public.league_teams (name, abbreviation)
values ('Academy Canonical Bravo', 'ACB');

select is(
  public._sync_academy_player_pool(),
  3,
  'the sync links only unambiguous Academy players'
);

select is(
  (select count(*) from public.player_pool
   where season_key = 'academy-1'
     and normalized_name in ('academy canonical top', 'academy canonical mid', 'academy canonical support')),
  3::bigint,
  'unambiguous Academy players are seeded in the canonical pool'
);

select is(
  (select canonical_player_id is not null
   from public.players
   where display_name = 'Captain: Academy Canonical Top#TEST'),
  true,
  'Captain prefix and Riot tag normalize when linking'
);

select is(
  (select canonical_player_id is not null
   from public.players
   where display_name = 'Academy Canonical Mid#TEST'),
  true,
  'a tagged Academy player receives a canonical FK'
);

select is(
  (select canonical_player_id is not null
   from public.players
   where display_name = 'Academy Canonical Support'),
  true,
  'a bare Academy player receives a canonical FK'
);

select is(
  (select count(*) from public.player_pool
   where season_key = 'academy-1' and normalized_name = 'academy duplicate'),
  0::bigint,
  'ambiguous base names are not seeded'
);

select is(
  (select count(*) from public.players
   where display_name in ('Academy Duplicate#ONE', 'academy duplicate#TWO')
     and canonical_player_id is null),
  2::bigint,
  'ambiguous Academy players remain unlinked'
);

select is(
  public._sync_academy_player_pool(),
  0,
  'the Academy player pool sync is idempotent'
);

select ok(
  public.is_player_rostered_on_team(
    (
      select canonical_player_id
      from public.players
      where display_name = 'Academy Canonical Mid#TEST'
    ),
    (select id from public.league_teams where name = 'Academy Canonical Bravo'),
    'academy',
    'TEST-A1'
  ),
  'the seeded identity resolves through the Academy league and season checks'
);

select * from finish();
rollback;
