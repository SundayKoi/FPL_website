-- Box Score freezes one completed current-season raw_stats game per UTC date
-- and league. All puzzle, target, and progress rows stay service-role-only;
-- the app returns a staged reveal DTO after its admin gate.

-- The existing shared daily reward is also claimed by Box Score.
alter table public.daily_game_rewards
  drop constraint if exists daily_game_rewards_source_check;

alter table public.daily_game_rewards
  add constraint daily_game_rewards_source_check
  check (source in ('fpldle', 'higher_lower', 'box_score'));

create or replace function public.claim_daily_game_reward(
  p_puzzle_date date,
  p_profile_id uuid,
  p_discord_id text,
  p_source text,
  p_source_id bigint
) returns table(amount bigint, balance bigint, already_claimed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward_id bigint;
  v_reward_amount bigint;
  v_balance bigint;
  v_already_claimed boolean := false;
begin
  if p_puzzle_date is null or p_profile_id is null or p_discord_id is null
     or p_source not in ('fpldle', 'higher_lower', 'box_score') then
    raise exception 'DAILY_GAME_REWARD_INVALID_CLAIM';
  end if;

  select bp.balance
    into v_balance
    from public.betting_profiles bp
   where bp.discord_id = p_discord_id
     and bp.profile_id = p_profile_id
     for update;
  if not found then raise exception 'DAILY_GAME_REWARD_UNKNOWN_WALLET'; end if;

  v_reward_amount := public.calculate_recurring_reward(p_discord_id, 200, 0, 1);

  insert into public.daily_game_rewards(
    puzzle_date, profile_id, discord_id, source, source_id, reward_amount
  ) values (
    p_puzzle_date, p_profile_id, p_discord_id, p_source, p_source_id, v_reward_amount
  )
  on conflict (puzzle_date, profile_id) do nothing
  returning id, reward_amount into v_reward_id, v_reward_amount;

  if v_reward_id is null then
    select reward.reward_amount
      into v_reward_amount
      from public.daily_game_rewards reward
     where reward.puzzle_date = p_puzzle_date
       and reward.profile_id = p_profile_id;
    v_already_claimed := true;
    return query select v_reward_amount, v_balance, v_already_claimed;
    return;
  end if;

  insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_discord_id, v_reward_amount, 'daily_game_reward', 'daily_game_rewards', v_reward_id);
  update public.betting_profiles bp
     set balance = bp.balance + v_reward_amount
   where bp.discord_id = p_discord_id
   returning bp.balance into v_balance;

  return query select v_reward_amount, v_balance, v_already_claimed;
end;
$$;

revoke all on function public.claim_daily_game_reward(date, uuid, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.claim_daily_game_reward(date, uuid, text, text, bigint)
  to service_role;

create table public.box_score_daily_candidates (
  puzzle_date       date not null,
  league            text not null check (league in ('premier', 'academy')),
  season            text not null,
  player_slug       text not null,
  player_name       text not null,
  player_tag        text not null,
  role              text not null,
  source_match_id   text not null,
  primary key (puzzle_date, league, player_slug)
);

create index box_score_daily_candidates_lookup_idx
  on public.box_score_daily_candidates (puzzle_date, league, player_name);

create table public.box_score_daily_puzzles (
  puzzle_date   date not null,
  league        text not null check (league in ('premier', 'academy')),
  season        text not null,
  answer_slug   text not null,
  target_stats  jsonb not null,
  target_game_id text not null,
  created_at    timestamptz not null default now(),
  reset_at      timestamptz not null,
  primary key (puzzle_date, league),
  foreign key (puzzle_date, league, answer_slug)
    references public.box_score_daily_candidates(puzzle_date, league, player_slug)
);

create table public.box_score_daily_progress (
  id                    bigint generated always as identity primary key,
  puzzle_date           date not null,
  league                text not null check (league in ('premier', 'academy')),
  profile_id            uuid not null references public.profiles(id) on delete cascade,
  discord_id            text not null references public.betting_profiles(discord_id) on delete cascade,
  guesses               text[] not null default '{}'::text[],
  status                text not null default 'playing' check (status in ('playing', 'won', 'lost')),
  completed_at          timestamptz,
  reward_amount         bigint not null default 0 check (reward_amount >= 0),
  reward_already_claimed boolean not null default false,
  created_at            timestamptz not null default now(),
  unique (puzzle_date, league, profile_id),
  constraint box_score_daily_progress_max_guesses check (cardinality(guesses) <= 5)
);

create index box_score_daily_progress_profile_date_idx
  on public.box_score_daily_progress (profile_id, puzzle_date desc);

alter table public.box_score_daily_candidates enable row level security;
alter table public.box_score_daily_puzzles enable row level security;
alter table public.box_score_daily_progress enable row level security;

revoke all on table public.box_score_daily_candidates from public, anon, authenticated;
revoke all on table public.box_score_daily_puzzles from public, anon, authenticated;
revoke all on table public.box_score_daily_progress from public, anon, authenticated;
grant all on table public.box_score_daily_candidates to service_role;
grant all on table public.box_score_daily_puzzles to service_role;
grant all on table public.box_score_daily_progress to service_role;
grant usage, select on sequence public.box_score_daily_progress_id_seq to service_role;

-- One transaction-level advisory lock owns lazy creation. The lock key includes
-- league, so Premier and Academy can initialize independently.
create or replace function public.ensure_box_score_daily_puzzle(
  p_puzzle_date date,
  p_league text,
  p_season text,
  p_candidates jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_answer_slug text;
  v_target_stats jsonb;
  v_target_game_id text;
begin
  if p_league not in ('premier', 'academy') then
    raise exception 'BOX_SCORE_INVALID_LEAGUE';
  end if;
  if p_season is null or nullif(trim(p_season), '') is null then
    raise exception 'BOX_SCORE_INVALID_SEASON';
  end if;
  if jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'BOX_SCORE_INVALID_CANDIDATES';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('box-score:' || p_puzzle_date::text || ':' || p_league)
  );

  if exists (
    select 1
      from public.box_score_daily_puzzles
     where puzzle_date = p_puzzle_date
       and league = p_league
  ) then
    return;
  end if;

  insert into public.box_score_daily_candidates(
    puzzle_date, league, season, player_slug, player_name, player_tag, role, source_match_id
  )
  select
    p_puzzle_date,
    p_league,
    p_season,
    candidate.player_slug,
    candidate.player_name,
    candidate.player_tag,
    candidate.role,
    candidate.source_match_id
    from jsonb_to_recordset(p_candidates) as candidate(
      player_slug text,
      player_name text,
      player_tag text,
      role text,
      source_match_id text
    )
   where nullif(trim(candidate.player_slug), '') is not null
     and nullif(trim(candidate.player_name), '') is not null
     and nullif(trim(candidate.player_tag), '') is not null
     and nullif(trim(candidate.role), '') is not null
     and nullif(trim(candidate.source_match_id), '') is not null
   on conflict (puzzle_date, league, player_slug) do nothing;

  -- Only a complete, non-early-surrender, sufficiently long raw_stats row can
  -- become a target. A second query below provides the one-row fallback when
  -- yesterday is the only otherwise eligible player.
  select candidate.player_slug,
         jsonb_build_object(
           'role', raw.role,
           'champion', raw.champion,
           'kills', raw.kills,
           'deaths', raw.deaths,
           'assists', raw.assists,
           'kda', raw.kda,
           'killParticipationPct', raw.kill_participation_pct,
           'totalDamage', raw.total_damage_to_champions,
           'damagePerMin', raw.damage_per_min,
           'damageSharePct', raw.damage_share_pct,
           'cs', raw.cs,
           'csPerMin', raw.cs_per_min,
           'gold', raw.gold_earned,
           'goldPerMin', raw.gold_per_min,
           'csAt10', raw.cs_at_10,
           'goldAt10', raw.gold_at_10,
           'team', raw.team_name,
           'date', to_char(raw.game_date, 'YYYY-MM-DD'),
           'result', case when raw.win then 'win' else 'loss' end,
           'side', raw.team_side,
           'durationMin', raw.game_duration_min,
           'visionScore', raw.vision_score,
           'objectives', raw.dragon_kills + raw.baron_kills + raw.objectives_stolen,
           'damageTaken', raw.damage_taken,
           'damageMitigated', raw.damage_mitigated,
           'healing', raw.total_healing,
           'multikills', jsonb_build_object(
             'doubles', raw.double_kills,
             'triples', raw.triple_kills,
             'quadras', raw.quadra_kills,
             'pentas', raw.penta_kills
           ),
           'soloKills', raw.solo_kills,
           'turretDamage', raw.turret_damage,
           'objectiveDamage', raw.objective_damage
         ),
         candidate.source_match_id
    into v_answer_slug, v_target_stats, v_target_game_id
    from public.box_score_daily_candidates candidate
    join public.raw_stats raw
      on raw.match_id = candidate.source_match_id
     and raw.summoner_name = candidate.player_name
     and raw.tag = candidate.player_tag
     and raw.season = p_season
   where candidate.puzzle_date = p_puzzle_date
     and candidate.league = p_league
     and raw.match_id is not null
     and raw.game_date is not null
     and raw.game_duration_min is not null
     and raw.game_duration_min >= 15
     and raw.game_ended_in_early_surrender is distinct from true
     and raw.team_side is not null
     and raw.team_name is not null
     and raw.summoner_name is not null
     and raw.tag is not null
     and raw.champion is not null
     and raw.role is not null
     and raw.win is not null
     and raw.kills is not null
     and raw.deaths is not null
     and raw.assists is not null
     and raw.kda is not null
     and raw.solo_kills is not null
     and raw.kill_participation_pct is not null
     and raw.double_kills is not null
     and raw.triple_kills is not null
     and raw.quadra_kills is not null
     and raw.penta_kills is not null
     and raw.total_damage_to_champions is not null
     and raw.damage_per_min is not null
     and raw.damage_share_pct is not null
     and raw.damage_taken is not null
     and raw.damage_mitigated is not null
     and raw.total_healing is not null
     and raw.gold_earned is not null
     and raw.gold_per_min is not null
     and raw.cs is not null
     and raw.cs_per_min is not null
     and raw.cs_at_10 is not null
     and raw.gold_at_10 is not null
     and raw.vision_score is not null
     and raw.dragon_kills is not null
     and raw.baron_kills is not null
     and raw.objectives_stolen is not null
     and raw.objective_damage is not null
     and raw.turret_damage is not null
     and not exists (
       select 1
         from public.box_score_daily_puzzles previous
        where previous.puzzle_date = p_puzzle_date - 1
          and previous.league = p_league
          and previous.answer_slug = candidate.player_slug
     )
   order by random()
   limit 1;

  if v_answer_slug is null then
    select candidate.player_slug,
           jsonb_build_object(
             'role', raw.role,
             'champion', raw.champion,
             'kills', raw.kills,
             'deaths', raw.deaths,
             'assists', raw.assists,
             'kda', raw.kda,
             'killParticipationPct', raw.kill_participation_pct,
             'totalDamage', raw.total_damage_to_champions,
             'damagePerMin', raw.damage_per_min,
             'damageSharePct', raw.damage_share_pct,
             'cs', raw.cs,
             'csPerMin', raw.cs_per_min,
             'gold', raw.gold_earned,
             'goldPerMin', raw.gold_per_min,
             'csAt10', raw.cs_at_10,
             'goldAt10', raw.gold_at_10,
             'team', raw.team_name,
             'date', to_char(raw.game_date, 'YYYY-MM-DD'),
             'result', case when raw.win then 'win' else 'loss' end,
             'side', raw.team_side,
             'durationMin', raw.game_duration_min,
             'visionScore', raw.vision_score,
             'objectives', raw.dragon_kills + raw.baron_kills + raw.objectives_stolen,
             'damageTaken', raw.damage_taken,
             'damageMitigated', raw.damage_mitigated,
             'healing', raw.total_healing,
             'multikills', jsonb_build_object(
               'doubles', raw.double_kills,
               'triples', raw.triple_kills,
               'quadras', raw.quadra_kills,
               'pentas', raw.penta_kills
             ),
             'soloKills', raw.solo_kills,
             'turretDamage', raw.turret_damage,
             'objectiveDamage', raw.objective_damage
           ),
           candidate.source_match_id
      into v_answer_slug, v_target_stats, v_target_game_id
      from public.box_score_daily_candidates candidate
      join public.raw_stats raw
        on raw.match_id = candidate.source_match_id
       and raw.summoner_name = candidate.player_name
       and raw.tag = candidate.player_tag
       and raw.season = p_season
     where candidate.puzzle_date = p_puzzle_date
       and candidate.league = p_league
       and raw.match_id is not null
       and raw.game_date is not null
       and raw.game_duration_min >= 15
       and raw.game_ended_in_early_surrender is distinct from true
       and raw.team_side is not null
       and raw.team_name is not null
       and raw.summoner_name is not null
       and raw.tag is not null
       and raw.champion is not null
       and raw.role is not null
       and raw.win is not null
       and raw.kills is not null
       and raw.deaths is not null
       and raw.assists is not null
       and raw.kda is not null
       and raw.solo_kills is not null
       and raw.kill_participation_pct is not null
       and raw.double_kills is not null
       and raw.triple_kills is not null
       and raw.quadra_kills is not null
       and raw.penta_kills is not null
       and raw.total_damage_to_champions is not null
       and raw.damage_per_min is not null
       and raw.damage_share_pct is not null
       and raw.damage_taken is not null
       and raw.damage_mitigated is not null
       and raw.total_healing is not null
       and raw.gold_earned is not null
       and raw.gold_per_min is not null
       and raw.cs is not null
       and raw.cs_per_min is not null
       and raw.cs_at_10 is not null
       and raw.gold_at_10 is not null
       and raw.vision_score is not null
       and raw.dragon_kills is not null
       and raw.baron_kills is not null
       and raw.objectives_stolen is not null
       and raw.objective_damage is not null
       and raw.turret_damage is not null
     order by random()
     limit 1;
  end if;

  if v_answer_slug is null or v_target_stats is null then
    raise exception 'BOX_SCORE_NO_CANDIDATES';
  end if;

  insert into public.box_score_daily_puzzles(
    puzzle_date, league, season, answer_slug, target_stats, target_game_id, reset_at
  ) values (
    p_puzzle_date,
    p_league,
    p_season,
    v_answer_slug,
    v_target_stats,
    v_target_game_id,
    ((p_puzzle_date + 1)::timestamp at time zone 'UTC')
  ) on conflict (puzzle_date, league) do nothing;
end;
$$;

revoke all on function public.ensure_box_score_daily_puzzle(date, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ensure_box_score_daily_puzzle(date, text, text, jsonb)
  to service_role;

create or replace function public.record_box_score_guess(
  p_puzzle_date date,
  p_league text,
  p_profile_id uuid,
  p_discord_id text,
  p_player_slug text
) returns table(
  accepted          boolean,
  correct           boolean,
  guess_count       integer,
  status            text,
  reward_amount     bigint,
  balance           bigint,
  already_rewarded  boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_answer_slug text;
  v_progress_id bigint;
  v_guesses text[];
  v_status text;
  v_completed_at timestamptz;
  v_reward_amount bigint := 0;
  v_balance bigint;
  v_already_rewarded boolean := false;
  v_correct boolean;
begin
  if p_league not in ('premier', 'academy')
     or p_profile_id is null
     or p_discord_id is null
     or p_player_slug is null
     or p_player_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'BOX_SCORE_INVALID_GUESS';
  end if;

  select puzzle.answer_slug
    into v_answer_slug
    from public.box_score_daily_puzzles puzzle
   where puzzle.puzzle_date = p_puzzle_date
     and puzzle.league = p_league;
  if not found then raise exception 'BOX_SCORE_PUZZLE_UNAVAILABLE'; end if;

  if not exists (
    select 1 from public.box_score_daily_candidates candidate
     where candidate.puzzle_date = p_puzzle_date
       and candidate.league = p_league
       and candidate.player_slug = p_player_slug
  ) then
    raise exception 'BOX_SCORE_UNKNOWN_PLAYER';
  end if;

  select bp.balance
    into v_balance
    from public.betting_profiles bp
   where bp.discord_id = p_discord_id
     and bp.profile_id = p_profile_id
   for update;
  if not found then raise exception 'BOX_SCORE_UNKNOWN_WALLET'; end if;

  insert into public.box_score_daily_progress(puzzle_date, league, profile_id, discord_id)
  values (p_puzzle_date, p_league, p_profile_id, p_discord_id)
  on conflict (puzzle_date, league, profile_id) do nothing;

  select progress.id,
         progress.guesses,
         progress.status,
         progress.completed_at,
         progress.reward_amount,
         progress.reward_already_claimed
    into v_progress_id,
         v_guesses,
         v_status,
         v_completed_at,
         v_reward_amount,
         v_already_rewarded
    from public.box_score_daily_progress progress
   where progress.puzzle_date = p_puzzle_date
     and progress.league = p_league
     and progress.profile_id = p_profile_id
   for update;

  if p_player_slug = any(v_guesses) then
    raise exception 'BOX_SCORE_DUPLICATE_GUESS';
  end if;
  if v_status <> 'playing' or cardinality(v_guesses) >= 5 then
    raise exception 'BOX_SCORE_GAME_COMPLETE';
  end if;

  v_guesses := array_append(v_guesses, p_player_slug);
  v_correct := p_player_slug = v_answer_slug;
  if v_correct then
    v_status := 'won';
    v_completed_at := now();
    select claim.amount, claim.balance, claim.already_claimed
      into v_reward_amount, v_balance, v_already_rewarded
      from public.claim_daily_game_reward(
        p_puzzle_date, p_profile_id, p_discord_id, 'box_score', v_progress_id
      ) claim;
  elsif cardinality(v_guesses) >= 5 then
    v_status := 'lost';
    v_completed_at := now();
  end if;

  update public.box_score_daily_progress
     set guesses = v_guesses,
         status = v_status,
         completed_at = v_completed_at,
         reward_amount = v_reward_amount,
         reward_already_claimed = v_already_rewarded
   where id = v_progress_id;

  return query select true,
                      v_correct,
                      cardinality(v_guesses),
                      v_status,
                      v_reward_amount,
                      v_balance,
                      v_already_rewarded;
end;
$$;

revoke all on function public.record_box_score_guess(date, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_box_score_guess(date, text, uuid, text, text)
  to service_role;

-- Reset clears attempts but leaves daily_game_rewards intact. A second solve
-- can therefore exercise a fresh answer without paying a second reward.
create or replace function public.reset_box_score_daily_puzzle(
  p_puzzle_date date,
  p_league text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_league not in ('premier', 'academy') then
    raise exception 'BOX_SCORE_INVALID_LEAGUE';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('box-score:' || p_puzzle_date::text || ':' || p_league)
  );

  update public.box_score_daily_progress
     set guesses = '{}'::text[],
         status = 'playing',
         completed_at = null,
         reward_amount = 0,
         reward_already_claimed = false
   where puzzle_date = p_puzzle_date
     and league = p_league;

  delete from public.box_score_daily_puzzles
   where puzzle_date = p_puzzle_date
     and league = p_league;
  delete from public.box_score_daily_candidates
   where puzzle_date = p_puzzle_date
     and league = p_league;
end;
$$;

revoke all on function public.reset_box_score_daily_puzzle(date, text)
  from public, anon, authenticated;
grant execute on function public.reset_box_score_daily_puzzle(date, text)
  to service_role;
