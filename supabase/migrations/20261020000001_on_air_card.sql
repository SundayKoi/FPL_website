-- The On Air card: the casters' print, and it only prints while the stream
-- is live.
--
-- Not a player and not the Dribb. Every profile an owner has marked
-- `is_broadcaster` gets a card of its own (src/lib/cards/onAir.ts), a 100
-- in every column, in broadcast colour bars. The roller
-- (src/lib/packs/open.ts) draws it once per standard pack at
-- ON_AIR_CHANCE and ONLY while a Live Drops window is open, picks the
-- caster with the fewest prints this season, and numbers the copy after
-- however many that caster already has. The five rules below are what make
-- the cap a fact rather than something the application is trusted to
-- remember.
--
-- RULE 0 — THE CASTERS' OWN SETTINGS. on_air_casters holds the champion the
-- card wears, the skin, the role word, the tagline and whether the caster
-- is in the pool. Readable by everyone (the card is not a secret), writable
-- by staff and by the caster themself. A broadcaster with NO row is in the
-- pool with the defaults, and a caster with no champion prints the colour-
-- bar test pattern where the art would be: no signal, which is the print
-- rather than a failure.
--
-- RULE 1 — TWENTY-FIVE PER CASTER PER SEASON, NUMBERED. A copy carries
-- card->'onAir'->>'number'; the check keeps it to 1..25 and the partial
-- unique index keeps each (season, caster, number) to one copy. Two packs
-- rolling the same number in the same instant: the second insert raises
-- 23505, the pack refunds, and the count is still right.
--
-- RULE 2 — IT CANNOT BE DUSTED. dust_card refuses it under the same lock as
-- the Eclipse and the Dribb, so numbers never free up. It can be traded.
--
-- RULE 3 — IT NEVER BOARDS A ROUTE THAT CAN LOSE IT. launch_expedition
-- treats it as it treats the Dribb and the relics. Redefined exactly as
-- 20261015000001 left it plus the one term; the convoy launch delegates.
--
-- RULE 4 — PROVENANCE REMEMBERS IT. The minted print carries `onAir`, so
-- the stats page counts the casters' prints apart from the player cards.

-- === Rule 0 ================================================================
create table if not exists public.on_air_casters (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  champion   text,
  skin       int not null default 0 check (skin between 0 and 99),
  role_label text not null default 'Caster' check (length(role_label) between 1 and 24),
  tagline    text check (tagline is null or length(tagline) <= 80),
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.on_air_casters is
  'One row per caster: the art, the words and the on/off for their On Air card. A broadcaster with no row is in the pool with these defaults.';

alter table public.on_air_casters enable row level security;

-- Public read, like profiles_public_read: the On Air card is announced, is
-- on the rarities page, and the admin desk draws every caster's preview.
drop policy if exists on_air_casters_public_read on public.on_air_casters;
create policy on_air_casters_public_read
  on public.on_air_casters for select using (true);

-- Staff run the desk; a caster may tune their own card and nobody else's.
drop policy if exists on_air_casters_staff_write on public.on_air_casters;
create policy on_air_casters_staff_write
  on public.on_air_casters for all
  using (
    public.is_owner() or public.is_admin()
    or (public.is_broadcaster() and profile_id = auth.uid())
  )
  with check (
    public.is_owner() or public.is_admin()
    or (public.is_broadcaster() and profile_id = auth.uid())
  );

grant select on public.on_air_casters to anon, authenticated;
grant insert, update, delete on public.on_air_casters to authenticated;
grant all on public.on_air_casters to service_role;

-- === Rule 1 ================================================================
alter table public.card_inventory
  drop constraint if exists card_inventory_on_air_number_ck;
alter table public.card_inventory
  add constraint card_inventory_on_air_number_ck check (
    not (card ? 'onAir')
    or ((card -> 'onAir' ->> 'number')::int between 1 and 25)
  );

create unique index if not exists card_inventory_one_on_air_per_number
  on public.card_inventory (
    season,
    ((card -> 'onAir' ->> 'profileId')),
    ((card -> 'onAir' ->> 'number')::int)
  )
  where card ? 'onAir';

comment on index public.card_inventory_one_on_air_per_number is
  'One On Air copy per caster per number per season, 1 through 25. This index IS the cap.';

-- === Rule 2 ================================================================
create or replace function public.dust_card(p_user text, p_inventory bigint, p_value bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   text;
  v_foil    text;
  v_card    jsonb;
  v_balance bigint;
begin
  if p_value < 1 or p_value > 10000 then raise exception 'invalid dust value'; end if;

  select discord_id, foil_type, card into v_owner, v_foil, v_card
    from card_inventory where id = p_inventory for update;
  if not found then raise exception 'unknown card %', p_inventory; end if;
  if v_owner <> p_user then raise exception 'card not owned'; end if;

  -- Checked under the same FOR UPDATE lock as the ownership test, and before
  -- anything is deleted or credited. A one-of-one is not a resource.
  if v_foil = 'eclipse' then raise exception 'eclipse cannot be dusted'; end if;
  -- Five in the world. Same lock, same reasoning.
  if v_card ? 'dribb' then raise exception 'dribb cannot be dusted'; end if;
  -- Twenty-five a caster a season, and only from the room. Same lock.
  if v_card ? 'onAir' then raise exception 'on air cannot be dusted'; end if;

  delete from card_inventory where id = p_inventory;

  -- ref_id points at a row that no longer exists, on purpose: the ledger is
  -- a history, and "inventory 412 was dusted" stays true after the copy is
  -- gone. Same reasoning as a settled bet's ref.
  perform 1 from betting_profiles where discord_id = p_user for update;
  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, p_value, 'card_dust', 'card_inventory', p_inventory);
  update betting_profiles set balance = balance + p_value where discord_id = p_user
    returning balance into v_balance;

  return v_balance;
end;
$$;

-- === Rule 3 ================================================================
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
  if p_tier not in ('scout', 'gilded', 'raid', 'legend', 'rescue', 'exorcism', 'legendary', 'mythic') then
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
  if p_tier in ('legend', 'rescue', 'legendary', 'mythic') and exists (
    select 1 from card_inventory ci
    where ci.id = any(p_squad)
      and (ci.foil_type = 'eclipse' or ci.card ? 'moment' or ci.card ? 'champWin' or ci.card ? 'team' or ci.card ? 'dribb' or ci.card ? 'onAir')
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

  -- The Mythic route's own gates: something Voidtouched in the squad, and
  -- a Legend mark somewhere on the shelf. The app names the card; this is
  -- the law behind the sentence.
  if p_tier = 'mythic' then
    if not exists (
      select 1 from card_inventory ci where ci.id = any(p_squad) and ci.mutation = 'voidtouched'
    ) then
      raise exception 'mythic needs a voidtouched card';
    end if;
    if not exists (
      select 1 from card_inventory ci where ci.discord_id = p_user and ci.card -> 'expedition' ->> 'mark' = 'legend'
    ) then
      raise exception 'mythic needs a legend mark';
    end if;
  end if;

  -- Fragments open the Legendary and Mythic routes, and only them.
  if p_fragments > 0 then
    if p_tier not in ('legendary', 'mythic') then raise exception 'fragments not wanted'; end if;
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

-- === Rule 4 ================================================================
create or replace function public.record_card_provenance()
returns trigger language plpgsql security definer set search_path = public as $$

declare
  v_ref   text;
  v_table text;
  v_id    bigint;
begin
  if tg_op = 'INSERT' then
    insert into public.card_provenance
      (inventory_id, event, to_discord, ref_table, ref_id, at, season, print, opening_id)
    values (new.id, 'minted', new.discord_id,
            case when new.pack_open_id is not null then 'card_pack_opens' end,
            new.pack_open_id, new.acquired_at, new.season,
            jsonb_build_object(
              'tier', new.tier,
              'foil', coalesce(new.foil, false),
              'foil_type', new.foil_type,
              'signed', coalesce(new.signed, false),
              'alt', coalesce((new.card ->> 'artSkin')::int, 0) > 0,
              'shiny', coalesce((new.card ->> 'shiny')::boolean, false),
              'secret', new.card ? 'secret',
              'stattrak', new.card ? 'stattrak',
              'moment', new.card ? 'moment',
              'team', new.card ? 'team',
              'champ', new.card ? 'champWin',
              'dribb', new.card ? 'dribb',
              'onAir', new.card ? 'onAir',
              'edition_week', new.edition_week),
            new.opening_id);
    return null;
  end if;
  if tg_op = 'DELETE' then
    insert into public.card_provenance (inventory_id, event, from_discord, season, opening_id)
    values (old.id,
            case when nullif(current_setting('fpl.card_fate', true), '') = 'died' then 'died' else 'dusted' end,
            old.discord_id, old.season, old.opening_id);
    return null;
  end if;
  v_ref := nullif(current_setting('fpl.provenance_ref', true), '');
  if v_ref ~ '^[a-z_]+:[0-9]+$' then
    v_table := split_part(v_ref, ':', 1);
    v_id := split_part(v_ref, ':', 2)::bigint;
  end if;
  insert into public.card_provenance
    (inventory_id, event, from_discord, to_discord, ref_table, ref_id, season, opening_id)
  values (new.id, 'transferred', old.discord_id, new.discord_id, v_table, v_id, new.season, new.opening_id);
  return null;
end;

$$;
