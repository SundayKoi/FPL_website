-- Automatic betting settlement from verified Riot stats.
--
-- The caller supplies a candidate derived from raw_stats, but this function
-- repeats the source-of-truth checks while holding the market lock. Captain
-- entered scores, odds, and report status are deliberately not consulted as
-- winning evidence.

alter table public.betting_markets
  add column if not exists settlement_run_id uuid,
  add column if not exists settlement_evidence jsonb;

comment on column public.betting_markets.settlement_run_id is
  'Automation run that paid this stats-verified market, when applicable.';
comment on column public.betting_markets.settlement_evidence is
  'Immutable stats evidence used by automatic settlement; retained for retry and conflict review.';

create index if not exists betting_markets_settlement_run_idx
  on public.betting_markets (settlement_run_id)
  where settlement_run_id is not null;

-- _audit requires an existing betting_profiles row because its actor column
-- is a foreign key. Keep one zero-balance system actor for trusted jobs; it is
-- not a user wallet and is only used for the existing audit mechanism.
insert into public.betting_profiles(discord_id, username, role, balance)
values ('__stats_settlement__', 'Stats settlement automation', 'system', 0)
on conflict (discord_id) do nothing;

create or replace function public.settle_betting_market_from_stats(
  p_market bigint,
  p_fixture uuid,
  p_winning_team bigint,
  p_evidence jsonb,
  p_run_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market public.betting_markets%rowtype;
  v_fixture public.fixtures%rowtype;
  v_league text;
  v_schedule_season text;
  v_fixture_team_a_id bigint;
  v_fixture_team_b_id bigint;
  v_fixture_team_a_count int;
  v_fixture_team_b_count int;
  v_report record;
  v_report_count int;
  v_report_ids text[];
  v_match_ids text[];
  v_evidence_report_ids text[];
  v_evidence_match_ids text[];
  v_forfeit_team uuid;
  v_forfeit_count int := 0;
  v_nonforfeit_count int := 0;
  v_match_id text;
  v_row_count int;
  v_team_a_rows int;
  v_team_b_rows int;
  v_team_a_win boolean;
  v_team_b_win boolean;
  v_score_a int := 0;
  v_score_b int := 0;
  v_game_count int := 0;
  v_threshold int;
  v_winner_id bigint;
  v_winner_name text;
  v_forfeit_name text;
  v_verified_evidence jsonb;
  v_reason text;
begin
  if p_run_id is null then
    raise exception 'settlement run id is required';
  end if;

  -- The row lock is the idempotency and concurrency boundary. _resolve_market
  -- takes the same lock again, which is harmless and keeps that helper's
  -- existing direct callers safe.
  select * into v_market
    from public.betting_markets
   where id = p_market
   for update;
  if not found then
    raise exception 'unknown market %', p_market;
  end if;
  if v_market.fixture_id is distinct from p_fixture then
    raise exception 'validation conflict: market % is not linked to fixture %', p_market, p_fixture;
  end if;

  -- A cancelled market is terminal and must never be revived. A market that
  -- this automation already resolved is checked against its frozen evidence
  -- so later changed stats are flagged without reversing a payout.
  if v_market.status = 'CANCELLED' then
    return jsonb_build_object('status', 'cancelled', 'market_id', p_market);
  end if;
  if v_market.status = 'RESOLVED' then
    if v_market.settlement_evidence is null then
      return jsonb_build_object('status', 'already_resolved', 'market_id', p_market);
    end if;
    if coalesce(p_evidence->>'validation_status', '') <> 'ready'
       or p_evidence is distinct from v_market.settlement_evidence then
      perform public._audit(
        '__stats_settlement__',
        'market_stats_conflict',
        'betting_markets:' || p_market,
        jsonb_build_object('status', 'RESOLVED', 'settlement_run_id', v_market.settlement_run_id),
        jsonb_build_object(
          'automation_run_id', p_run_id,
          'fixture_id', p_fixture,
          'reason', coalesce(p_evidence->>'reason', 'stats no longer match settled evidence'),
          'evidence', p_evidence
        )
      );
      return jsonb_build_object('status', 'conflict', 'market_id', p_market,
                                'reason', coalesce(p_evidence->>'reason', 'stats conflict after payout'));
    end if;
    return jsonb_build_object('status', 'already_resolved', 'market_id', p_market);
  end if;
  if v_market.status not in ('OPEN', 'LOCKED') then
    raise exception 'market % has unsupported status %', p_market, v_market.status;
  end if;
  if v_market.draw_enabled then
    raise exception 'validation conflict: draw-enabled market is not a team-winner market';
  end if;

  -- A non-ready candidate cannot authorize money movement. The script logs
  -- these outcomes and continues with independent fixtures.
  if coalesce(p_evidence->>'validation_status', '') = 'pending' then
    return jsonb_build_object('status', 'pending', 'market_id', p_market,
                              'reason', coalesce(p_evidence->>'reason', 'evidence is incomplete'));
  end if;
  if coalesce(p_evidence->>'validation_status', '') = 'conflict' then
    return jsonb_build_object('status', 'conflict', 'market_id', p_market,
                              'reason', coalesce(p_evidence->>'reason', 'evidence conflicts'));
  end if;
  if coalesce(p_evidence->>'validation_status', '') <> 'ready' then
    raise exception 'validation conflict: evidence validation_status must be ready';
  end if;

  select f.* into v_fixture
    from public.fixtures f
   where f.id = p_fixture;
  if not found then
    raise exception 'validation conflict: unknown fixture %', p_fixture;
  end if;
  if v_fixture.season is null or v_fixture.team_a is null or v_fixture.team_b is null
     or lower(trim(v_fixture.team_a)) = lower(trim(v_fixture.team_b)) then
    raise exception 'validation conflict: fixture % has incomplete participants or season', p_fixture;
  end if;
  if v_fixture.best_of not in (1, 3, 5) then
    raise exception 'validation conflict: fixture % has unsupported best_of %', p_fixture, v_fixture.best_of;
  end if;

  select e.league, e.schedule_season
    into v_league, v_schedule_season
    from public.betting_events e
   where e.id = v_market.event_id;
  if v_league not in ('premier', 'academy') then
    raise exception 'validation conflict: market event is not a Premier or Academy event';
  end if;
  if v_schedule_season is distinct from v_fixture.season then
    raise exception 'validation conflict: event season % does not match fixture season %',
      v_schedule_season, v_fixture.season;
  end if;

  -- The generated market catalog maps fixture participant names to exactly
  -- one non-prop betting team. Accept either side order, but never a partial
  -- or ambiguous map.
  select count(*)::int, min(t.id)
    into v_fixture_team_a_count, v_fixture_team_a_id
    from public.betting_teams t
   where coalesce(t.is_prop_outcome, false) = false
     and lower(trim(t.name)) = lower(trim(v_fixture.team_a));
  select count(*)::int, min(t.id)
    into v_fixture_team_b_count, v_fixture_team_b_id
    from public.betting_teams t
   where coalesce(t.is_prop_outcome, false) = false
     and lower(trim(t.name)) = lower(trim(v_fixture.team_b));
  if v_fixture_team_a_count <> 1 or v_fixture_team_b_count <> 1 then
    raise exception 'validation conflict: fixture participants do not map to exactly one betting team';
  end if;
  if not ((v_market.team_a_id = v_fixture_team_a_id and v_market.team_b_id = v_fixture_team_b_id)
       or (v_market.team_a_id = v_fixture_team_b_id and v_market.team_b_id = v_fixture_team_a_id)) then
    raise exception 'validation conflict: market teams do not match fixture participants';
  end if;

  select count(distinct r.id)::int,
         coalesce(array_agg(distinct r.id::text order by r.id::text), '{}'::text[]),
         coalesce(array_agg(distinct g.match_id order by g.match_id)
                    filter (where g.match_id is not null), '{}'::text[])
    into v_report_count, v_report_ids, v_match_ids
    from public.match_reports r
    left join public.match_report_games g on g.report_id = r.id
   where r.fixture_id = p_fixture;
  if exists (
    select 1
      from public.match_reports r
     where r.fixture_id = p_fixture
       and not exists (select 1 from public.match_report_games g where g.report_id = r.id)
  ) then
    if v_report_count > 1 then
      raise exception 'validation conflict: linked reports include a report with no games';
    end if;
    return jsonb_build_object('status', 'pending', 'market_id', p_market,
                              'reason', 'linked report has no verified games');
  end if;
  if v_report_count = 0 or cardinality(v_match_ids) = 0 then
    return jsonb_build_object('status', 'pending', 'market_id', p_market,
                              'reason', 'fixture has no linked match-report games');
  end if;

  -- Report status is intentionally not used here. Every linked report still
  -- has to agree on season and participants; reversed side entry is fine.
  for v_report in
    select r.id, r.season, r.team_a_id, r.team_b_id, r.forfeit_team_id,
           ta.name as team_a_name, tb.name as team_b_name
      from public.match_reports r
      left join public.league_teams ta on ta.id = r.team_a_id
      left join public.league_teams tb on tb.id = r.team_b_id
     where r.fixture_id = p_fixture
  loop
    if v_report.season is distinct from v_fixture.season
       or v_report.team_a_name is null or v_report.team_b_name is null
       or not (
         (lower(trim(v_report.team_a_name)) = lower(trim(v_fixture.team_a))
          and lower(trim(v_report.team_b_name)) = lower(trim(v_fixture.team_b)))
         or
         (lower(trim(v_report.team_a_name)) = lower(trim(v_fixture.team_b))
          and lower(trim(v_report.team_b_name)) = lower(trim(v_fixture.team_a)))
       ) then
      raise exception 'validation conflict: report % disagrees with fixture season or participants', v_report.id;
    end if;
    if v_report.forfeit_team_id is null then
      v_nonforfeit_count := v_nonforfeit_count + 1;
    else
      v_forfeit_count := v_forfeit_count + 1;
      if v_forfeit_team is null then
        v_forfeit_team := v_report.forfeit_team_id;
      elsif v_forfeit_team is distinct from v_report.forfeit_team_id then
        raise exception 'validation conflict: reports declare different forfeiting teams';
      end if;
    end if;
  end loop;
  if v_forfeit_count > 0 and v_nonforfeit_count > 0 then
    raise exception 'validation conflict: reports disagree about whether the fixture was forfeited';
  end if;
  -- Require the candidate to enumerate the complete report/game source set.
  if jsonb_typeof(p_evidence->'source_report_ids') <> 'array'
     or jsonb_typeof(p_evidence->'source_match_ids') <> 'array' then
    raise exception 'validation conflict: evidence source ids are not arrays';
  end if;
  select coalesce(array_agg(x.value order by x.value), '{}'::text[])
    into v_evidence_report_ids
    from jsonb_array_elements_text(p_evidence->'source_report_ids') x(value);
  select coalesce(array_agg(x.value order by x.value), '{}'::text[])
    into v_evidence_match_ids
    from jsonb_array_elements_text(p_evidence->'source_match_ids') x(value);
  if (select count(*) from jsonb_array_elements_text(p_evidence->'source_report_ids'))
       <> cardinality(v_evidence_report_ids)
     or (select count(*) from jsonb_array_elements_text(p_evidence->'source_match_ids'))
       <> cardinality(v_evidence_match_ids) then
    raise exception 'validation conflict: evidence contains duplicate source ids';
  end if;
  if v_evidence_report_ids is distinct from v_report_ids
     or v_evidence_match_ids is distinct from v_match_ids then
    raise exception 'validation conflict: evidence source ids do not match linked reports';
  end if;

  -- Count one game per distinct match_id. Each game must have both expected
  -- team names, non-null win flags, and one consistent winner. This is the
  -- only winning evidence used by the function.
  foreach v_match_id in array v_match_ids loop
    select count(*)::int into v_row_count
      from public.raw_stats s where s.match_id = v_match_id;
    if v_row_count = 0 then
      return jsonb_build_object('status', 'pending', 'market_id', p_market,
                                'reason', 'raw stats missing for match ' || v_match_id);
    end if;
    if exists (select 1 from public.raw_stats s
               where s.match_id = v_match_id and s.season is distinct from v_fixture.season) then
      raise exception 'validation conflict: raw stats season mismatch for match %', v_match_id;
    end if;
    if exists (select 1 from public.raw_stats s
               where s.match_id = v_match_id and (s.team_name is null or trim(s.team_name) = '')) then
      return jsonb_build_object('status', 'pending', 'market_id', p_market,
                                'reason', 'raw stats team mapping incomplete for match ' || v_match_id);
    end if;
    if exists (select 1 from public.raw_stats s
               where s.match_id = v_match_id and s.win is null) then
      return jsonb_build_object('status', 'pending', 'market_id', p_market,
                                'reason', 'raw stats winner flag incomplete for match ' || v_match_id);
    end if;
    if exists (select 1 from public.raw_stats s
               where s.match_id = v_match_id
                 and lower(trim(s.team_name)) not in (lower(trim(v_fixture.team_a)), lower(trim(v_fixture.team_b)))) then
      raise exception 'validation conflict: raw stats contain an unexpected team for match %', v_match_id;
    end if;

    select count(*)::int into v_team_a_rows
      from public.raw_stats s
     where s.match_id = v_match_id and lower(trim(s.team_name)) = lower(trim(v_fixture.team_a));
    select count(*)::int into v_team_b_rows
      from public.raw_stats s
     where s.match_id = v_match_id and lower(trim(s.team_name)) = lower(trim(v_fixture.team_b));
    if v_team_a_rows = 0 or v_team_b_rows = 0 then
      return jsonb_build_object('status', 'pending', 'market_id', p_market,
                                'reason', 'raw stats contain only one fixture side for match ' || v_match_id);
    end if;
    if (select count(distinct s.win) from public.raw_stats s
        where s.match_id = v_match_id and lower(trim(s.team_name)) = lower(trim(v_fixture.team_a))) <> 1
       or (select count(distinct s.win) from public.raw_stats s
           where s.match_id = v_match_id and lower(trim(s.team_name)) = lower(trim(v_fixture.team_b))) <> 1 then
      raise exception 'validation conflict: raw stats have conflicting winners for match %', v_match_id;
    end if;
    select bool_and(s.win) into v_team_a_win
      from public.raw_stats s
     where s.match_id = v_match_id and lower(trim(s.team_name)) = lower(trim(v_fixture.team_a));
    select bool_and(s.win) into v_team_b_win
      from public.raw_stats s
     where s.match_id = v_match_id and lower(trim(s.team_name)) = lower(trim(v_fixture.team_b));
    if v_team_a_win = v_team_b_win then
      raise exception 'validation conflict: match % does not have exactly one winning team', v_match_id;
    elsif v_team_a_win then
      v_score_a := v_score_a + 1;
    else
      v_score_b := v_score_b + 1;
    end if;
    v_game_count := v_game_count + 1;
  end loop;

  if v_game_count > v_fixture.best_of then
    raise exception 'validation conflict: fixture has % verified games but best_of is %',
      v_game_count, v_fixture.best_of;
  end if;
  v_threshold := floor(v_fixture.best_of / 2.0)::int + 1;
  if v_score_a >= v_threshold and v_score_b >= v_threshold then
    raise exception 'validation conflict: both fixture sides reached the winning threshold';
  elsif v_score_a >= v_threshold then
    v_winner_id := v_fixture_team_a_id;
    v_winner_name := v_fixture.team_a;
  elsif v_score_b >= v_threshold then
    v_winner_id := v_fixture_team_b_id;
    v_winner_name := v_fixture.team_b;
  else
    if v_forfeit_team is not null then
      select name into v_forfeit_name from public.league_teams where id = v_forfeit_team;
      if lower(trim(coalesce(v_forfeit_name, ''))) = lower(trim(v_fixture.team_a)) then
        v_reason := format('forfeit has only %s verified played wins; needs %s', v_score_b, v_threshold);
      else
        v_reason := format('forfeit has only %s verified played wins; needs %s', v_score_a, v_threshold);
      end if;
      return jsonb_build_object('status', 'pending', 'market_id', p_market, 'reason', v_reason);
    end if;
    return jsonb_build_object('status', 'pending', 'market_id', p_market,
                              'reason', format('incomplete series: verified score %s-%s needs %s wins',
                                               v_score_a, v_score_b, v_threshold));
  end if;

  if v_forfeit_team is not null then
    select name into v_forfeit_name from public.league_teams where id = v_forfeit_team;
    if lower(trim(coalesce(v_forfeit_name, ''))) = lower(trim(v_winner_name)) then
      raise exception 'validation conflict: forfeiting team cannot be the verified series winner';
    end if;
  end if;

  if p_winning_team is distinct from v_winner_id then
    raise exception 'validation conflict: supplied winner does not match raw stats';
  end if;
  if p_evidence->>'fixture_id' is distinct from p_fixture::text
     or p_evidence->>'season' is distinct from v_fixture.season
     or p_evidence->'series_score'->>'fixture_team_a' is distinct from v_score_a::text
     or p_evidence->'series_score'->>'fixture_team_b' is distinct from v_score_b::text
     or p_evidence->>'winner_betting_team_id' is distinct from v_winner_id::text
     or p_evidence->>'winner_team_name' is distinct from v_winner_name then
    raise exception 'validation conflict: supplied evidence does not match raw stats';
  end if;

  v_verified_evidence := jsonb_build_object(
    'validation_status', 'ready',
    'fixture_id', p_fixture,
    'season', v_fixture.season,
    'source_report_ids', to_jsonb(v_report_ids),
    'source_match_ids', to_jsonb(v_match_ids),
    'series_score', jsonb_build_object('fixture_team_a', v_score_a, 'fixture_team_b', v_score_b),
    'winner_betting_team_id', v_winner_id,
    'winner_team_name', v_winner_name
  );
  if p_evidence is distinct from v_verified_evidence then
    raise exception 'validation conflict: evidence is not the canonical verified evidence';
  end if;

  perform public._resolve_market(p_market, v_winner_id);
  update public.betting_markets
     set settlement_run_id = p_run_id,
         settlement_evidence = v_verified_evidence
   where id = p_market;
  perform public._audit(
    '__stats_settlement__',
    'market_auto_resolve_stats',
    'betting_markets:' || p_market,
    jsonb_build_object('status', v_market.status, 'fixture_id', p_fixture),
    v_verified_evidence || jsonb_build_object(
      'status', 'RESOLVED',
      'automation_run_id', p_run_id,
      'fixture_id', p_fixture
    )
  );
  return jsonb_build_object('status', 'settled', 'market_id', p_market,
                            'fixture_id', p_fixture, 'winner_betting_team_id', v_winner_id,
                            'series_score', jsonb_build_object('fixture_team_a', v_score_a,
                                                               'fixture_team_b', v_score_b));
end;
$$;

revoke execute on function public.settle_betting_market_from_stats(bigint, uuid, bigint, jsonb, uuid)
from public, anon, authenticated;
grant execute on function public.settle_betting_market_from_stats(bigint, uuid, bigint, jsonb, uuid)
to service_role;
