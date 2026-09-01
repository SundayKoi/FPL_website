begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(25);
grant usage on schema tests to authenticated;

select has_function(
  'public', 'swap_roster_players', array['uuid', 'uuid'],
  'roster swap RPC still exposes its original interface'
);

-- Build one configured Premier draft with canonical teams, canonical players,
-- identity links, and Riot memberships on opposite sides of the trade.
create temporary table trade_draft as select tests.fixture() as id;
update public.teams
set name = case nomination_position
  when 1 then 'Trade Alpha'
  when 2 then 'Trade Bravo'
  else name
end
where draft_id = (select id from trade_draft)
  and nomination_position in (1, 2);

insert into public.league_teams (id, name, abbreviation) values
  ('68000000-0000-0000-0000-000000000001', 'Trade Alpha', 'TAL'),
  ('68000000-0000-0000-0000-000000000002', 'Trade Bravo', 'TBR');

update public.league_settings
set current_season = 'TRADE-S1',
    featured_draft_id = (select id from trade_draft)
where id = 1;

insert into public.player_pool (
  id, season_key, normalized_name, display_name, role, opgg_url
) values
  (
    '68000000-0000-0000-0000-000000000010', 'trade', 'trade-left', 'Trade Left', 'mid',
    'https://op.gg/lol/summoners/na/Trade%20Left-LFT1'
  ),
  (
    '68000000-0000-0000-0000-000000000011', 'trade', 'trade-right', 'Trade Right', 'mid',
    'https://op.gg/lol/summoners/na/Trade%20Right-RGT1'
  );

update public.players p
set team_id = t.id,
    price = case p.display_name when 'Mid1' then 12 else 17 end,
    acquisition = 'auction',
    canonical_player_id = case p.display_name
      when 'Mid1' then '68000000-0000-0000-0000-000000000010'::uuid
      when 'Mid2' then '68000000-0000-0000-0000-000000000011'::uuid
    end,
    opgg_url = case p.display_name
      when 'Mid1' then null
      when 'Mid2' then 'https://op.gg/lol/summoners/na/Trade%20Right-RGT1'
    end
from public.teams t
where p.draft_id = (select id from trade_draft)
  and p.display_name in ('Mid1', 'Mid2')
  and t.draft_id = p.draft_id
  and t.nomination_position = case p.display_name when 'Mid1' then 1 else 2 end;

insert into public.player_identity_links (
  player_pool_id, profile_id, league_team_id, league, season,
  status, source, requested_by, decided_by, decided_at
) values
  (
    '68000000-0000-0000-0000-000000000010', tests.cap(1),
    '68000000-0000-0000-0000-000000000001', 'premier', 'TRADE-S1',
    'approved', 'admin', tests.admin_id(), tests.admin_id(), now()
  ),
  (
    '68000000-0000-0000-0000-000000000011', tests.cap(2),
    '68000000-0000-0000-0000-000000000002', 'premier', 'TRADE-S1',
    'approved', 'admin', tests.admin_id(), tests.admin_id(), now()
  ),
  (
    '68000000-0000-0000-0000-000000000010', tests.cap(1),
    '68000000-0000-0000-0000-000000000001', 'premier', 'TRADE-OLD',
    'approved', 'admin', tests.admin_id(), tests.admin_id(), now()
  );

insert into public.riot_accounts (id, game_name, tag_line, display_name) values
  ('68000000-0000-0000-0000-000000000020', 'Trade Left', 'LFT1', 'Trade Left'),
  ('68000000-0000-0000-0000-000000000021', 'Trade Right', 'RGT1', 'Trade Right'),
  ('68000000-0000-0000-0000-000000000022', 'Mid1', 'NOPE', 'Mid1');

insert into public.roster_memberships (riot_account_id, season, league_team_id) values
  (
    '68000000-0000-0000-0000-000000000020', 'TRADE-S1',
    '68000000-0000-0000-0000-000000000001'
  ),
  (
    '68000000-0000-0000-0000-000000000021', 'TRADE-S1',
    '68000000-0000-0000-0000-000000000002'
  ),
  (
    '68000000-0000-0000-0000-000000000022', 'TRADE-S1',
    '68000000-0000-0000-0000-000000000001'
  ),
  (
    '68000000-0000-0000-0000-000000000020', 'TRADE-OLD',
    '68000000-0000-0000-0000-000000000001'
  );

create temporary table trade_players as
select
  (
    select p.id
    from public.players p
    where p.draft_id = (select id from trade_draft)
      and p.display_name = 'Mid1'
  ) as left_id,
  (
    select p.id
    from public.players p
    where p.draft_id = (select id from trade_draft)
      and p.display_name = 'Mid2'
  ) as right_id;

select tests.acting_as(tests.cap(3));
set local role authenticated;
select throws_like(
  $$select public.swap_roster_players(
    (select left_id from trade_players),
    (select right_id from trade_players)
  )$$,
  'NOT_ADMIN%',
  'non-admin cannot call the roster swap RPC'
);
reset role;

select is(
  (select team_id from public.players where id = (select left_id from trade_players)),
  (select id from public.teams where draft_id = (select id from trade_draft) and nomination_position = 1),
  'authorization failure leaves left player in place'
);

select tests.acting_as(tests.cap(1));
set local role authenticated;
select ok(
  public.is_approved_team_member(
    '68000000-0000-0000-0000-000000000001', 'TRADE-S1'
  ),
  'left identity has old-team permission before trade'
);
select ok(
  not public.is_approved_team_member(
    '68000000-0000-0000-0000-000000000002', 'TRADE-S1'
  ),
  'left identity lacks new-team permission before trade'
);
reset role;

select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok(
  $$select public.swap_roster_players(
    (select left_id from trade_players),
    (select right_id from trade_players)
  )$$,
  'admin swaps current-roster players'
);
reset role;

select is(
  (select team_id from public.players where id = (select left_id from trade_players)),
  (select id from public.teams where draft_id = (select id from trade_draft) and nomination_position = 2),
  'left player moves to right draft team'
);
select is(
  (select team_id from public.players where id = (select right_id from trade_players)),
  (select id from public.teams where draft_id = (select id from trade_draft) and nomination_position = 1),
  'right player moves to left draft team'
);
select is(
  (select price from public.players where id = (select left_id from trade_players)),
  12,
  'left player price remains unchanged'
);
select is(
  (select price from public.players where id = (select right_id from trade_players)),
  17,
  'right player price remains unchanged'
);
select is(
  (select league_team_id from public.player_identity_links
    where player_pool_id = '68000000-0000-0000-0000-000000000010'
      and season = 'TRADE-S1'),
  '68000000-0000-0000-0000-000000000002'::uuid,
  'left current identity moves to right canonical team'
);
select is(
  (select league_team_id from public.player_identity_links
    where player_pool_id = '68000000-0000-0000-0000-000000000011'
      and season = 'TRADE-S1'),
  '68000000-0000-0000-0000-000000000001'::uuid,
  'right current identity moves to left canonical team'
);
select is(
  (select league_team_id from public.roster_memberships
    where riot_account_id = '68000000-0000-0000-0000-000000000020'
      and season = 'TRADE-S1'),
  '68000000-0000-0000-0000-000000000002'::uuid,
  'left exact OP.GG Riot membership moves to right team'
);
select is(
  (select league_team_id from public.roster_memberships
    where riot_account_id = '68000000-0000-0000-0000-000000000021'
      and season = 'TRADE-S1'),
  '68000000-0000-0000-0000-000000000001'::uuid,
  'right exact OP.GG Riot membership moves to left team'
);
select is(
  (select league_team_id from public.roster_memberships
    where riot_account_id = '68000000-0000-0000-0000-000000000022'
      and season = 'TRADE-S1'),
  '68000000-0000-0000-0000-000000000001'::uuid,
  'display-name-only Riot membership stays on old team'
);
select is(
  (select league_team_id from public.player_identity_links
    where player_pool_id = '68000000-0000-0000-0000-000000000010'
      and season = 'TRADE-OLD'),
  '68000000-0000-0000-0000-000000000001'::uuid,
  'historical identity link stays on historical team'
);
select is(
  (select league_team_id from public.roster_memberships
    where riot_account_id = '68000000-0000-0000-0000-000000000020'
      and season = 'TRADE-OLD'),
  '68000000-0000-0000-0000-000000000001'::uuid,
  'historical Riot membership stays on historical team'
);

select tests.acting_as(tests.cap(1));
set local role authenticated;
select ok(
  not public.is_approved_team_member(
    '68000000-0000-0000-0000-000000000001', 'TRADE-S1'
  ),
  'left identity loses old-team permission after trade'
);
select ok(
  public.is_approved_team_member(
    '68000000-0000-0000-0000-000000000002', 'TRADE-S1'
  ),
  'left identity gains new-team permission after trade'
);
reset role;

select tests.acting_as(tests.cap(2));
set local role authenticated;
select ok(
  not public.is_approved_team_member(
    '68000000-0000-0000-0000-000000000002', 'TRADE-S1'
  ),
  'right identity loses old-team permission after trade'
);
select ok(
  public.is_approved_team_member(
    '68000000-0000-0000-0000-000000000001', 'TRADE-S1'
  ),
  'right identity gains new-team permission after trade'
);
reset role;

-- Force a failure after reference rows have changed. PostgreSQL must roll the
-- whole RPC back, including the player and every dependent update.
create or replace function tests.fail_trade_after_player_update()
returns trigger
language plpgsql
as $failure$
begin
  raise exception 'TRADE_TEST_FAILURE';
end
$failure$;
create trigger trade_test_failure
after update of team_id on public.players
for each row
when (new.team_id is not null)
execute function tests.fail_trade_after_player_update();

select tests.acting_as(tests.admin_id());
set local role authenticated;
select throws_like(
  $$select public.swap_roster_players(
    (select right_id from trade_players),
    (select left_id from trade_players)
  )$$,
  'TRADE_TEST_FAILURE%',
  'failure during player update rolls back the whole trade'
);
reset role;
drop trigger trade_test_failure on public.players;
drop function tests.fail_trade_after_player_update();

select is(
  (select team_id from public.players where id = (select left_id from trade_players)),
  (select id from public.teams where draft_id = (select id from trade_draft) and nomination_position = 2),
  'rollback preserves left player team'
);
select is(
  (select league_team_id from public.player_identity_links
    where player_pool_id = '68000000-0000-0000-0000-000000000010'
      and season = 'TRADE-S1'),
  '68000000-0000-0000-0000-000000000002'::uuid,
  'rollback preserves left identity team'
);
select is(
  (select league_team_id from public.roster_memberships
    where riot_account_id = '68000000-0000-0000-0000-000000000020'
      and season = 'TRADE-S1'),
  '68000000-0000-0000-0000-000000000002'::uuid,
  'rollback preserves left Riot membership team'
);

select * from finish();
rollback;
