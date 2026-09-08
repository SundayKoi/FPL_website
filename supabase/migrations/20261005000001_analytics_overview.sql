-- The staff analytics read: one function, one round trip, everything
-- aggregated in the database.
--
-- WHY A FUNCTION AND NOT A VIEW PER NUMBER. PostgREST cannot GROUP BY, so
-- every "per week, per mode" figure on the dashboard would otherwise be
-- the application paging a table down the wire and counting rows in
-- JavaScript. card_inventory alone is tens of thousands of copies; the
-- ledger is larger. This does the counting where the rows are and hands
-- back one jsonb document.
--
-- WHO MAY CALL IT. Nobody, by default: execute is revoked from public,
-- anon and authenticated, and granted only to service_role. The dashboard
-- is a staff-gated server page that calls it with the service client, so
-- the gate is the page's session check plus this grant — a signed-in
-- member cannot reach it by guessing the RPC name, which matters because
-- the answer contains every player's spend.
--
-- THE WEEK. Monday in America/New_York, the same week the rest of the
-- site runs on (src/lib/cards/currentWeek.ts, the Gauntlet's week_start,
-- the daily reset). Never UTC weeks — a Sunday-night rip belongs to the
-- week the league thinks it does.
--
-- WHAT IT DELIBERATELY DOES NOT DO. It never writes, it never names a
-- Discord handle it did not have to (the chase roll call is the one place
-- a discord_id appears, because "who has the Dribb" is the question), and
-- it computes no rates: observed counts go up, and the page divides them
-- against the constants in src/lib/packs/config.ts. A rate baked in here
-- would drift from the config the moment either changed.

create or replace function public.analytics_overview(p_weeks int default 8)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_weeks int := greatest(1, least(52, coalesce(p_weeks, 8)));
  v_since date := (date_trunc('week', (now() at time zone 'America/New_York')) - make_interval(weeks => v_weeks - 1))::date;
  v_result jsonb;
begin
  with
  -- Every Monday in the window, so a quiet week is a zero rather than a
  -- gap the page would draw as if it never happened.
  weeks as (
    select generate_series(v_since, (date_trunc('week', (now() at time zone 'America/New_York')))::date, '7 days')::date as week
  ),

  -- ── Packs ────────────────────────────────────────────────────────────
  opens as (
    select
      date_trunc('week', (created_at at time zone 'America/New_York'))::date as week,
      discord_id, source, variant, status
    from card_pack_openings
    where created_at >= v_since and status = 'fulfilled'
  ),
  pack_week as (
    select
      w.week,
      count(o.*)                                            as opens,
      count(*) filter (where o.source = 'paid')             as paid,
      count(*) filter (where o.source = 'daily')            as daily,
      count(*) filter (where o.source = 'comp')             as comp,
      count(*) filter (where o.variant = 'god')             as god_packs,
      count(distinct o.discord_id)                          as rippers
    from weeks w left join opens o on o.week = w.week
    group by w.week order by w.week
  ),

  -- ── Copies minted, and what they printed as ──────────────────────────
  -- The observed side of the pull rates. Windowed, so a rate change is
  -- visible as the week it changed in rather than averaged into all
  -- history.
  copies as (
    select
      date_trunc('week', (acquired_at at time zone 'America/New_York'))::date as week,
      tier, foil, coalesce(foil_type, 'matte') as foil_type,
      signed as signed_copy,
      (card ? 'shiny')    as shiny,
      (card ? 'stattrak') as stattrak,
      (card ? 'secret')   as secret,
      (card ? 'moment')   as moment,
      (card ? 'team')     as team,
      (card ? 'champWin') as champ,
      (card ? 'dribb')    as dribb,
      (foil_type = 'eclipse') as eclipse
    from card_inventory
    where acquired_at >= v_since
  ),
  pull_week as (
    select
      w.week,
      count(c.*)                                   as copies,
      count(*) filter (where c.foil)               as foil,
      count(*) filter (where c.signed_copy)        as signed_copies,
      count(*) filter (where c.shiny)              as shiny,
      count(*) filter (where c.stattrak)           as stattrak,
      count(*) filter (where c.secret)             as secret,
      count(*) filter (where c.eclipse)            as eclipse,
      count(*) filter (where c.moment)             as moment,
      count(*) filter (where c.team)               as team,
      count(*) filter (where c.champ)              as champ,
      count(*) filter (where c.dribb)              as dribb
    from weeks w left join copies c on c.week = w.week
    group by w.week order by w.week
  ),
  tier_mix as (
    select tier, count(*) as copies from copies group by tier order by count(*) desc
  ),
  parallel_mix as (
    select foil_type, count(*) as copies from copies where foil group by foil_type order by count(*) desc
  ),

  -- ── The chases, all time ─────────────────────────────────────────────
  -- Not windowed: "how many Eclipses exist" is a question about the world,
  -- not about the last eight weeks.
  chases as (
    select
      count(*) filter (where foil_type = 'eclipse')                     as eclipses,
      count(*) filter (where card ? 'dribb')                            as dribbs,
      count(*) filter (where card ? 'secret')                           as secrets,
      count(*) filter (where card ? 'shiny')                            as shinies,
      count(*) filter (where card ? 'stattrak')                         as stattraks,
      count(*)                                                          as copies_all_time
    from card_inventory
  ),
  -- Which of the five are out, and who holds them. The one place a holder
  -- is named, because that IS the question staff ask about this card.
  dribb_roll as (
    select
      ((card -> 'dribb' ->> 'number')::int) as number,
      discord_id, season, acquired_at
    from card_inventory
    where card ? 'dribb'
    order by 1
  ),

  -- ── People ───────────────────────────────────────────────────────────
  new_profiles as (
    select
      w.week,
      count(p.*) as joined
    from weeks w
    left join betting_profiles p
      on date_trunc('week', (p.created_at at time zone 'America/New_York'))::date = w.week
    group by w.week order by w.week
  ),
  -- One row per person per week they did anything, from every mode that
  -- stamps a user and a time. A union, not a join: somebody who only
  -- played a daily game is as active as somebody who only ripped.
  activity as (
    select date_trunc('week', (created_at at time zone 'America/New_York'))::date as week, discord_id, 'packs' as mode
      from card_pack_openings where created_at >= v_since and discord_id is not null
    union all
    select date_trunc('week', (started_at at time zone 'America/New_York'))::date, discord_id, 'expeditions'
      from expedition_runs where started_at >= v_since and discord_id is not null
    union all
    select date_trunc('week', (created_at at time zone 'America/New_York'))::date, discord_id, 'gauntlet'
      from gauntlet_runs where created_at >= v_since and discord_id is not null
    union all
    select date_trunc('week', (created_at at time zone 'America/New_York'))::date, discord_id, 'betting'
      from betting_bets where created_at >= v_since and discord_id is not null
    union all
    select date_trunc('week', (created_at at time zone 'America/New_York'))::date, discord_id, 'daily_games'
      from daily_game_rewards where created_at >= v_since and discord_id is not null
    union all
    select date_trunc('week', (created_at at time zone 'America/New_York'))::date, seller_discord, 'market'
      from card_listings where created_at >= v_since and seller_discord is not null
  ),
  active_week as (
    select
      w.week,
      count(distinct a.discord_id)                                                   as active,
      count(distinct a.discord_id) filter (where a.mode = 'packs')                   as packs,
      count(distinct a.discord_id) filter (where a.mode = 'expeditions')             as expeditions,
      count(distinct a.discord_id) filter (where a.mode = 'gauntlet')                as gauntlet,
      count(distinct a.discord_id) filter (where a.mode = 'betting')                 as betting,
      count(distinct a.discord_id) filter (where a.mode = 'daily_games')             as daily_games,
      count(distinct a.discord_id) filter (where a.mode = 'market')                  as market
    from weeks w left join activity a on a.week = w.week
    group by w.week order by w.week
  ),

  -- ── Modes ────────────────────────────────────────────────────────────
  expedition_week as (
    select
      w.week,
      count(r.*)                                                as launched,
      count(*) filter (where r.outcome is not null)             as resolved,
      count(*) filter (where r.tier = 'lost')                   as lost,
      count(distinct r.discord_id)                              as players
    from weeks w
    left join expedition_runs r
      on date_trunc('week', (r.started_at at time zone 'America/New_York'))::date = w.week
    group by w.week order by w.week
  ),
  expedition_tier as (
    select tier, count(*) as runs
    from expedition_runs where started_at >= v_since
    group by tier order by count(*) desc
  ),
  gauntlet_week as (
    select
      w.week,
      count(r.*)                                        as runs,
      count(distinct r.discord_id)                      as players,
      count(*) filter (where r.status = 'cleared')      as cleared,
      count(*) filter (where r.status = 'fallen')       as fallen,
      count(*) filter (where r.status = 'banked')       as banked,
      coalesce(round(avg(r.round) filter (where r.status <> 'active'))::int, 0) as avg_round
    from weeks w
    left join gauntlet_runs r
      on date_trunc('week', (r.created_at at time zone 'America/New_York'))::date = w.week
    group by w.week order by w.week
  ),
  showdown_week as (
    select
      w.week,
      count(h.*)                            as hands,
      count(distinct h.table_id)            as tables,
      coalesce(sum(h.pot), 0)::bigint       as pot,
      coalesce(sum(h.rake), 0)::bigint      as rake
    from weeks w
    left join showdown_hands h
      on date_trunc('week', (h.played_at at time zone 'America/New_York'))::date = w.week
    group by w.week order by w.week
  ),
  -- Built from the rows rather than from the week list: a game×week grid
  -- would be mostly empty cells, and "no daily game was played that week"
  -- is better said by the row's absence than by a placeholder game.
  daily_week as (
    select
      date_trunc('week', (created_at at time zone 'America/New_York'))::date as week,
      source                                    as game,
      count(*)                                  as plays,
      count(distinct discord_id)                as players,
      coalesce(sum(reward_amount), 0)::bigint   as paid_out
    from daily_game_rewards
    where created_at >= v_since
    group by 1, 2 order by 1, 2
  ),
  betting_week as (
    select
      w.week,
      count(b.*)                             as bets,
      count(distinct b.discord_id)           as players,
      coalesce(sum(b.amount), 0)::bigint     as staked,
      coalesce(sum(b.payout), 0)::bigint     as paid
    from weeks w
    left join betting_bets b
      on date_trunc('week', (b.created_at at time zone 'America/New_York'))::date = w.week
    group by w.week order by w.week
  ),
  market_week as (
    select
      w.week,
      count(l.*)                                                     as listed,
      count(*) filter (where l.status = 'sold')                      as sold,
      coalesce(sum(l.ask) filter (where l.status = 'sold'), 0)::bigint as volume
    from weeks w
    left join card_listings l
      on date_trunc('week', (l.created_at at time zone 'America/New_York'))::date = w.week
    group by w.week order by w.week
  ),

  -- ── The economy ──────────────────────────────────────────────────────
  -- Grouped on whatever reasons the ledger actually holds, not on a list
  -- kept here: a new reason shipped next month shows up on its own.
  ledger_reason as (
    select
      reason,
      count(*)                                              as entries,
      coalesce(sum(delta) filter (where delta > 0), 0)::bigint as paid_in,
      coalesce(sum(delta) filter (where delta < 0), 0)::bigint as paid_out,
      coalesce(sum(delta), 0)::bigint                        as net
    from betting_ledger
    where created_at >= v_since
    group by reason order by count(*) desc
  ),
  ledger_week as (
    select
      w.week,
      coalesce(sum(l.delta) filter (where l.delta > 0), 0)::bigint as paid_in,
      coalesce(sum(l.delta) filter (where l.delta < 0), 0)::bigint as paid_out
    from weeks w
    left join betting_ledger l
      on date_trunc('week', (l.created_at at time zone 'America/New_York'))::date = w.week
    group by w.week order by w.week
  ),
  wallets as (
    select
      count(*)                                                          as profiles,
      count(*) filter (where patron_until is not null and patron_until > now()) as patrons,
      coalesce(sum(balance), 0)::bigint                                 as in_circulation,
      coalesce(round(avg(balance))::bigint, 0)                          as avg_balance
    from betting_profiles
  )

  select jsonb_build_object(
    'generated_at', now(),
    'weeks', v_weeks,
    'since', v_since,
    'people', jsonb_build_object(
      'profiles',   (select profiles from wallets),
      'patrons',    (select patrons from wallets),
      'joined',     (select coalesce(jsonb_agg(jsonb_build_object('week', week, 'joined', joined) order by week), '[]'::jsonb) from new_profiles),
      'active',     (select coalesce(jsonb_agg(to_jsonb(active_week) order by week), '[]'::jsonb) from active_week)
    ),
    'packs', jsonb_build_object(
      'by_week',    (select coalesce(jsonb_agg(to_jsonb(pack_week) order by week), '[]'::jsonb) from pack_week)
    ),
    'pulls', jsonb_build_object(
      'by_week',    (select coalesce(jsonb_agg(to_jsonb(pull_week) order by week), '[]'::jsonb) from pull_week),
      'tiers',      (select coalesce(jsonb_agg(to_jsonb(tier_mix)), '[]'::jsonb) from tier_mix),
      'parallels',  (select coalesce(jsonb_agg(to_jsonb(parallel_mix)), '[]'::jsonb) from parallel_mix),
      'chases',     (select to_jsonb(chases) from chases),
      'dribb',      (select coalesce(jsonb_agg(to_jsonb(dribb_roll) order by number), '[]'::jsonb) from dribb_roll)
    ),
    'modes', jsonb_build_object(
      'expeditions',      (select coalesce(jsonb_agg(to_jsonb(expedition_week) order by week), '[]'::jsonb) from expedition_week),
      'expedition_tiers', (select coalesce(jsonb_agg(to_jsonb(expedition_tier)), '[]'::jsonb) from expedition_tier),
      'gauntlet',         (select coalesce(jsonb_agg(to_jsonb(gauntlet_week) order by week), '[]'::jsonb) from gauntlet_week),
      'showdown',         (select coalesce(jsonb_agg(to_jsonb(showdown_week) order by week), '[]'::jsonb) from showdown_week),
      'daily_games',      (select coalesce(jsonb_agg(to_jsonb(daily_week) order by week), '[]'::jsonb) from daily_week),
      'betting',          (select coalesce(jsonb_agg(to_jsonb(betting_week) order by week), '[]'::jsonb) from betting_week),
      'market',           (select coalesce(jsonb_agg(to_jsonb(market_week) order by week), '[]'::jsonb) from market_week)
    ),
    'economy', jsonb_build_object(
      'in_circulation', (select in_circulation from wallets),
      'avg_balance',    (select avg_balance from wallets),
      'by_reason',      (select coalesce(jsonb_agg(to_jsonb(ledger_reason)), '[]'::jsonb) from ledger_reason),
      'by_week',        (select coalesce(jsonb_agg(to_jsonb(ledger_week) order by week), '[]'::jsonb) from ledger_week)
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.analytics_overview(int) is
  'Staff dashboard read: every mode aggregated per Eastern week, in one jsonb document. service_role only.';

revoke all on function public.analytics_overview(int) from public, anon, authenticated;
grant execute on function public.analytics_overview(int) to service_role;

-- Two indexes the dashboard leans on. Both are ordinary btrees on a
-- timestamp already being filtered; neither changes any write path.
create index if not exists card_pack_openings_created_idx on public.card_pack_openings (created_at);
create index if not exists card_inventory_acquired_idx on public.card_inventory (acquired_at);
