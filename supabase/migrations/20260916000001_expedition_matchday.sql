-- Expeditions: the match-day surge and the moment's echo.
--
-- Two additions to the claim, both decided in src/lib/expeditions/runs.ts
-- and written here once:
--
--   * The SURGE. A squad with a card whose team plays on the launch day
--     brings home 20% more. It multiplies the dollars after the forks and
--     before the merchant's flat, so the payout ceiling rises with it:
--     best base x shine cap x brief x loot cap x surge + merchant =
--     2500 x 1.2 x 1.2 x 2.5 x 1.2 + 75 = 13575 (maxExpeditionPayout()).
--     The teams are recorded in the outcome (`surge`) for the log.
--
--   * The ECHO. A moment card on the squad may echo: the route drops a copy
--     of a card from the game the moment happened in. The claim names the
--     edition (season, week, slug) and the moment copy that echoed; this
--     function mints the copy off card_editions — a real print, stamped
--     with a print number and a 'minted' provenance row by the existing
--     triggers — and returns its id. `card.echo` says which run and which
--     moment, cosmetic provenance only: nothing prices it.
--
-- The return type gains a column, which CREATE OR REPLACE cannot do, so the
-- function is dropped and re-declared. Nothing else calls it by signature.
--
-- THE RULEBOOK VERSION. A squad already in the field resolves under the
-- rules it launched with. `rules` says which: every row that exists when
-- this migration runs is stamped 1 (forks, hazards, mutations — the routes
-- release), and every launch from here on defaults to 2 (the trail:
-- encounters, storms, the stranded bounty, the match-day surge, the echo,
-- the rival fork). src/lib/expeditions reads the number before applying
-- any of those; a version-1 run walks its forks and pays exactly as it
-- would have the day it set out.

alter table public.expedition_runs
  add column if not exists rules smallint not null default 1;
alter table public.expedition_runs
  alter column rules set default 2;

drop function if exists public.resolve_expedition(text, bigint, jsonb);

create function public.resolve_expedition(p_user text, p_run bigint, p_outcome jsonb)
returns table(balance bigint, fragments int, echo_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run       expedition_runs%rowtype;
  v_hold      expedition_runs%rowtype;
  v_grade     text := p_outcome ->> 'grade';
  v_dollars   bigint := coalesce((p_outcome ->> 'dollars')::bigint, 0);
  v_comp      boolean := coalesce((p_outcome ->> 'comp')::boolean, false);
  v_mark      text := p_outcome ->> 'mark';
  v_bearer    bigint := (p_outcome ->> 'bearer')::bigint;
  v_frags     int := coalesce((p_outcome ->> 'fragments')::int, 0);
  v_rescued   boolean := (p_outcome ->> 'rescued')::boolean;
  v_cleansed  bigint := (p_outcome ->> 'cleansed')::bigint;
  v_stranded  bigint := (p_outcome ->> 'stranded')::bigint;
  v_bounty    bigint := coalesce((p_outcome ->> 'bounty')::bigint, 0);
  v_echo_slug text := p_outcome -> 'echo' ->> 'slug';
  v_echo_week date := (p_outcome -> 'echo' ->> 'week')::date;
  v_echo_from bigint := (p_outcome -> 'echo' ->> 'moment')::bigint;
  v_echo_id   bigint;
  v_fate      jsonb;
  v_id        bigint;
  v_kind      text;
  v_mut       text;
  v_until     timestamptz;
  v_current   text;
  v_rank      int;
  v_new_rank  int;
  v_balance   bigint;
  v_have      int := 0;
  v_seen      bigint[] := '{}';
  v_stamp     date := (now() at time zone 'utc')::date;
begin
  if v_grade not in ('poor', 'solid', 'jackpot') then raise exception 'unknown grade'; end if;
  if v_dollars not between 0 and 13575 then raise exception 'payout out of range'; end if;
  if v_bounty not between 0 and 500 then raise exception 'bad bounty'; end if;
  if v_mark is not null and v_mark not in ('trail', 'sigil', 'legend') then raise exception 'unknown mark'; end if;
  if v_frags not between 0 and 3 then raise exception 'bad fragments'; end if;
  if jsonb_typeof(p_outcome -> 'fates') is distinct from 'array' then raise exception 'bad fates'; end if;
  if p_outcome ? 'surge' and jsonb_typeof(p_outcome -> 'surge') <> 'array' then raise exception 'bad surge'; end if;

  select * into v_run from expedition_runs r
    where r.id = p_run and r.discord_id = p_user for update;
  if not found then raise exception 'unknown run'; end if;
  if v_run.tier = 'lost' then raise exception 'unknown run'; end if;
  if v_run.claimed_at is not null then raise exception 'already claimed'; end if;
  if v_run.resolves_at > now() then raise exception 'expedition still out'; end if;

  for v_fate in select * from jsonb_array_elements(p_outcome -> 'fates') loop
    v_id := (v_fate ->> 'id')::bigint;
    v_kind := v_fate ->> 'fate';
    v_mut := v_fate ->> 'mutation';
    if v_id is null or not (v_id = any(v_run.squad)) then raise exception 'fate not in squad'; end if;
    if v_id = any(v_seen) then raise exception 'fate repeated'; end if;
    v_seen := v_seen || v_id;
    if v_kind not in ('home', 'wounded', 'lost', 'dead') then raise exception 'unknown fate'; end if;
    if v_mut is not null and v_mut not in ('irradiated', 'hardened', 'haunted', 'cursed', 'voidtouched') then
      raise exception 'unknown mutation';
    end if;
    if v_kind = 'dead' and v_run.tier <> 'legendary' then raise exception 'fate beyond route'; end if;
    if v_kind = 'lost' and v_run.tier not in ('legend', 'rescue', 'legendary') then raise exception 'fate beyond route'; end if;
    if v_kind = 'wounded' and v_run.tier in ('scout', 'exorcism') then raise exception 'fate beyond route'; end if;
    if v_mut is not null and v_run.tier in ('scout', 'exorcism', 'rescue') then raise exception 'mutation beyond route'; end if;
    if v_mut = 'voidtouched' and v_run.tier <> 'legendary' then raise exception 'mutation beyond route'; end if;
  end loop;

  if v_mark is not null then
    if v_bearer is null or not (v_bearer = any(v_run.squad)) then raise exception 'bearer not in squad'; end if;
  end if;

  -- The stranded card must be a real, open hold that is not the caller's:
  -- their own lost cards come home by Rescue or ransom, never by luck.
  if v_stranded is not null then
    select * into v_hold from expedition_runs h where h.id = v_stranded for update;
    if not found or v_hold.tier <> 'lost' or v_hold.claimed_at is not null or v_hold.discord_id = p_user then
      raise exception 'no such stranded card';
    end if;
  end if;

  -- An echo comes off a moment that actually went out on THIS run.
  if p_outcome ? 'echo' then
    if v_echo_from is null or not (v_echo_from = any(v_run.squad)) then raise exception 'echo not in squad'; end if;
    if v_echo_slug is null or v_echo_week is null then raise exception 'bad echo'; end if;
    perform 1 from card_inventory ci
      where ci.id = v_echo_from and ci.discord_id = p_user and ci.card -> 'moment' is not null;
    if not found then raise exception 'echo needs a moment'; end if;
  end if;

  update expedition_runs
    set outcome = p_outcome, claimed_at = now()
    where id = p_run;

  if v_mark is not null then
    select ci.card -> 'expedition' ->> 'mark' into v_current
      from card_inventory ci where ci.id = v_bearer;
    v_rank := case v_current when 'trail' then 1 when 'sigil' then 2 when 'legend' then 3 else 0 end;
    v_new_rank := case v_mark when 'trail' then 1 when 'sigil' then 2 when 'legend' then 3 end;
    if v_new_rank > v_rank then
      update card_inventory
        set card = jsonb_set(card, '{expedition}', jsonb_build_object(
          'mark', v_mark, 'tier', v_run.tier, 'date', to_char(v_stamp, 'YYYY-MM-DD')))
        where id = v_bearer;
    end if;
  end if;

  for v_fate in select * from jsonb_array_elements(p_outcome -> 'fates') loop
    v_id := (v_fate ->> 'id')::bigint;
    v_kind := v_fate ->> 'fate';
    v_mut := v_fate ->> 'mutation';
    if v_mut is not null and v_kind <> 'dead' then
      update card_inventory
        set card = jsonb_set(card, '{mutation}', jsonb_build_object('key', v_mut, 'date', to_char(v_stamp, 'YYYY-MM-DD'), 'run', p_run))
        where id = v_id and card -> 'mutation' is null;
    end if;
    if v_kind = 'wounded' then
      v_until := coalesce((v_fate ->> 'until')::timestamptz, now() + interval '72 hours');
      if v_until > now() + interval '8 days' then raise exception 'bad bench'; end if;
      update card_inventory
        set card = jsonb_set(card, '{wounded}', jsonb_build_object('until', v_until, 'run', p_run))
        where id = v_id;
    elsif v_kind = 'lost' then
      insert into expedition_runs (discord_id, season, tier, squad, shine, resolves_at, forks, target)
      values (p_user, v_run.season, 'lost', array[v_id], 0, now() + interval '7 days', 0, p_run);
    elsif v_kind = 'dead' then
      insert into expedition_graveyard
        (discord_id, inventory_id, season, slug, player_name, tier, foil, foil_type, signed, card, run_id, cause)
      select ci.discord_id, ci.id, ci.season, ci.slug, ci.player_name, ci.tier, ci.foil, ci.foil_type, ci.signed,
             ci.card, p_run, 'route'
        from card_inventory ci where ci.id = v_id and ci.discord_id = p_user;
      perform set_config('fpl.card_fate', 'died', true);
      delete from card_inventory where id = v_id and discord_id = p_user;
      perform set_config('fpl.card_fate', '', true);
    end if;
  end loop;

  if v_run.tier = 'rescue' then
    if v_rescued is null then raise exception 'rescue needs a verdict'; end if;
    if v_rescued then
      update expedition_runs
        set claimed_at = now(), outcome = jsonb_build_object('rescued', true, 'by', p_run)
        where id = v_run.target and discord_id = p_user and tier = 'lost' and claimed_at is null;
      if not found then raise exception 'no such lost card'; end if;
      update card_inventory
        set card = jsonb_set(card, '{wounded}', jsonb_build_object('until', now() + interval '72 hours', 'run', p_run))
        where id = (select h.squad[1] from expedition_runs h where h.id = v_run.target);
    end if;
  end if;

  if v_run.tier = 'exorcism' then
    if v_cleansed is null or v_cleansed <> v_run.target then raise exception 'cleansed not the target'; end if;
    update card_inventory set card = card - 'mutation' where id = v_cleansed and discord_id = p_user;
  end if;

  -- The stranger's card goes home wounded; the rescuer is paid by the house.
  if v_stranded is not null then
    update expedition_runs
      set claimed_at = now(), outcome = jsonb_build_object('rescued', true, 'by', p_run, 'stranger', p_user)
      where id = v_stranded;
    update card_inventory
      set card = jsonb_set(card, '{wounded}', jsonb_build_object('until', now() + interval '72 hours', 'run', p_run))
      where id = v_hold.squad[1];
    if v_bounty > 0 then
      insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
      values (p_user, v_bounty, 'expedition_bounty', 'expedition_runs', v_stranded);
    end if;
  end if;

  -- The echo: a print off the edition the moment's game was in. A matte,
  -- unsigned copy — the route found it, nobody pulled it — with its own
  -- print number from the trigger. Refused when that edition was never
  -- archived, in which case the claim should not have offered it.
  if p_outcome ? 'echo' then
    insert into card_inventory
      (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, foil_type, signed, card, pack_open_id)
    select p_user, e.season, e.slug, e.player_name, e.role, e.edition_week, e.overall, e.tier, false, null, false,
           jsonb_set(e.card, '{echo}', jsonb_build_object('run', p_run, 'moment', v_echo_from, 'date', to_char(v_stamp, 'YYYY-MM-DD'))),
           null
      from card_editions e
      where e.season = v_run.season and e.edition_week = v_echo_week and e.slug = v_echo_slug
      returning id into v_echo_id;
    if v_echo_id is null then raise exception 'no such echo'; end if;
  end if;

  perform 1 from betting_profiles where betting_profiles.discord_id = p_user for update;
  if v_dollars > 0 then
    insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
    values (p_user, v_dollars, 'expedition', 'expedition_runs', p_run);
  end if;
  if v_dollars + v_bounty > 0 then
    update betting_profiles set balance = betting_profiles.balance + v_dollars + (case when v_stranded is not null then v_bounty else 0 end)
      where betting_profiles.discord_id = p_user;
  end if;
  select betting_profiles.balance into v_balance from betting_profiles where betting_profiles.discord_id = p_user;

  if v_comp then
    insert into card_pack_comps (discord_id, kind, remaining, granted, reason)
    values (p_user, 'standard', 1, 1, 'expedition run ' || p_run)
    on conflict on constraint card_pack_comps_pkey
    do update set remaining = card_pack_comps.remaining + 1,
                  granted   = card_pack_comps.granted + 1;
  end if;

  if v_frags > 0 then
    insert into expedition_supplies (discord_id, fragments) values (p_user, v_frags)
    on conflict on constraint expedition_supplies_pkey
    do update set fragments = expedition_supplies.fragments + v_frags, updated_at = now();
  end if;
  select s.fragments into v_have from expedition_supplies s where s.discord_id = p_user;

  return query select v_balance, coalesce(v_have, 0), v_echo_id;
end;
$$;

revoke all on function public.resolve_expedition(text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_expedition(text, bigint, jsonb) to service_role;

-- The ledger of the fallen and the found is a public page: the graveyard
-- and the holds are read league-wide by the service client, which bypasses
-- RLS, so no policy changes. Nothing here widens what a signed-in user's
-- own client can read.
