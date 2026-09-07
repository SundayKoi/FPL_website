-- The Gilded Road, priced: three signed cards, a thousand to three
-- thousand dollars. And insurance becomes weekly.
--
-- Two functions, each redefined exactly as it stood plus one rule:
--
--   launch_expedition (20260927000001): insurance is once an Eastern week,
--   twice for a patron. The count is taken off the runs already insured
--   since Monday, under the wallet lock the function already holds, and a
--   launch past the cap raises 'insurance used up'. The patron's free
--   policy (expedition_policies) is unchanged and is one of the two. The
--   convoy launch delegates here and picks it up.
--
--   resolve_expedition (20260916000001): the payout ceiling follows the
--   config. The Gilded Road's jackpot is now 3,000 base, so the most any
--   claim can write is 3000 x 1.5 (shine) x 1.2 (brief) x 2.5 (loot) x 1.2
--   (surge) + 75 (merchant) = 16,275 — maxExpeditionPayout(), which the
--   config test holds this file to. Nothing else in the body changes.
--
-- The gate itself (three signatures) and the dollars live in
-- src/lib/expeditions/config.ts, like every other tier's.

create or replace function public.launch_expedition(
  p_user text, p_season text, p_tier text, p_squad bigint[], p_shine int, p_hours int,
  p_forks int, p_insured boolean, p_fee bigint, p_fragments int, p_target bigint, p_policy_week date
) returns table(run_id bigint, resolves_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patron  boolean;
  v_balance bigint;
  v_owned   int;
  v_run_id  bigint;
  v_resolves timestamptz;
  v_have    int;
  v_insured int;
begin
  if p_tier not in ('scout', 'gilded', 'raid', 'legend', 'rescue', 'exorcism', 'legendary') then
    raise exception 'unknown tier';
  end if;
  if p_hours not between 1 and 96 then raise exception 'bad duration'; end if;
  if p_shine not between 0 and 60 then raise exception 'bad shine'; end if;
  if p_forks not between 0 and 6 then raise exception 'bad forks'; end if;
  if p_fee < 0 or p_fee > 5000 then raise exception 'bad fee'; end if;
  if p_fragments < 0 or p_fragments > 3 then raise exception 'bad fragments'; end if;
  if array_length(p_squad, 1) is distinct from 3
     or (select count(distinct s) from unnest(p_squad) s) <> 3 then
    raise exception 'squad must be three distinct cards';
  end if;

  -- Wallet lock serializes the fee (open_daily_pack pattern).
  select patron_until > now(), balance into v_patron, v_balance
    from betting_profiles where betting_profiles.discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  -- The patrons' road. The flame is the whole gate: no fee, no fragment,
  -- nothing a wallet can buy its way past.
  if p_tier = 'gilded' and not coalesce(v_patron, false) then
    raise exception 'patron road';
  end if;

  -- Insurance is weekly: one policy an Eastern week, two for a patron.
  -- Counted off the runs insured since Monday, under the wallet lock, so
  -- two launches racing for the last policy cannot both have it.
  if p_insured then
    select count(*) into v_insured from expedition_runs r
      where r.discord_id = p_user and r.insured and r.tier <> 'lost'
        and (r.started_at at time zone 'America/New_York')::date
            >= date_trunc('week', now() at time zone 'America/New_York')::date;
    if v_insured >= (case when coalesce(v_patron, false) then 2 else 1 end) then
      raise exception 'insurance used up';
    end if;
  end if;

  -- The tier slot. Holds ('lost') are not runs and never occupy one.
  if exists (
    select 1 from expedition_runs r
    where r.discord_id = p_user and r.tier = p_tier and r.claimed_at is null
  ) then
    raise exception 'tier already out';
  end if;

  select count(*) into v_owned from card_inventory ci
    where ci.id = any(p_squad) and ci.discord_id = p_user;
  if v_owned <> 3 then raise exception 'card not owned'; end if;

  -- Deployed OR lost: a hold is an unclaimed run, so the one scan covers
  -- both, and the message stays the one the board already knows.
  if exists (
    select 1 from expedition_runs r
    where r.claimed_at is null and r.squad && p_squad
  ) then
    raise exception 'card already deployed';
  end if;

  -- The bench. The stamp's `until` is the whole rule.
  if exists (
    select 1 from card_inventory ci
    where ci.id = any(p_squad)
      and (ci.card -> 'wounded' ->> 'until')::timestamptz > now()
  ) then
    raise exception 'card is wounded';
  end if;

  -- Consent: nothing one of one boards a route that can lose it. The
  -- app names the card; this is the law behind the sentence.
  if p_tier in ('legend', 'rescue', 'legendary') and exists (
    select 1 from card_inventory ci
    where ci.id = any(p_squad)
      and (ci.foil_type = 'eclipse' or ci.card ? 'moment' or ci.card ? 'champWin' or ci.card ? 'team')
  ) then
    raise exception 'card is one of one';
  end if;

  -- A Cursed card sent out again has a chance of not coming back (the
  -- app rolls it); a Cursed card cannot be RESCUED FOR, because the
  -- rescue would be the thing that lost it.
  if p_tier = 'rescue' then
    if p_target is null or not exists (
      select 1 from expedition_runs h
      where h.id = p_target and h.discord_id = p_user and h.tier = 'lost' and h.claimed_at is null
    ) then
      raise exception 'no such lost card';
    end if;
  elsif p_tier = 'exorcism' then
    if p_target is null or not (p_target = any(p_squad)) then
      raise exception 'target not in squad';
    end if;
    if not exists (
      select 1 from card_inventory ci
      where ci.id = p_target and ci.mutation in ('haunted', 'cursed')
    ) then
      raise exception 'card is not afflicted';
    end if;
  elsif p_target is not null then
    raise exception 'target not wanted';
  end if;

  -- Fragments open the Legendary route, and only it.
  if p_fragments > 0 then
    if p_tier <> 'legendary' then raise exception 'fragments not wanted'; end if;
    select fragments into v_have from expedition_supplies s
      where s.discord_id = p_user for update;
    if coalesce(v_have, 0) < p_fragments then raise exception 'not enough fragments'; end if;
    update expedition_supplies set fragments = fragments - p_fragments, updated_at = now()
      where expedition_supplies.discord_id = p_user;
  end if;

  -- The free policy: claimed by primary-key insert, so a week has one.
  if p_policy_week is not null then
    if not p_insured then raise exception 'policy without insurance'; end if;
    if not coalesce(v_patron, false) then raise exception 'policy is a patron perk'; end if;
    begin
      insert into expedition_policies (discord_id, week_start) values (p_user, p_policy_week);
    exception when unique_violation then
      raise exception 'policy already used';
    end;
  end if;

  v_resolves := now() + make_interval(hours => p_hours);
  insert into expedition_runs
    (discord_id, season, tier, squad, shine, resolves_at, forks, insured, target, fee, policy_week)
  values
    (p_user, p_season, p_tier, p_squad, p_shine, v_resolves, p_forks, p_insured, p_target, p_fee, p_policy_week)
  returning id into v_run_id;

  if p_policy_week is not null then
    update expedition_policies set run_id = v_run_id
      where expedition_policies.discord_id = p_user and week_start = p_policy_week;
  end if;

  -- The fee, last: everything above can still refuse without a refund.
  if p_fee > 0 then
    if v_balance < p_fee then raise exception 'insufficient balance'; end if;
    insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
    values (p_user, -p_fee, 'expedition_fee', 'expedition_runs', v_run_id);
    update betting_profiles set balance = betting_profiles.balance - p_fee
      where betting_profiles.discord_id = p_user;
  end if;

  return query select v_run_id, v_resolves;
end;
$$;

revoke all on function public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date)
  from public, anon, authenticated;
grant execute on function public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date)
  to service_role;

create or replace function public.resolve_expedition(p_user text, p_run bigint, p_outcome jsonb)
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
  if v_dollars not between 0 and 16275 then raise exception 'payout out of range'; end if;
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
