-- Offseason packs (see docs/offseason.md): a separate pack of the
-- tournament's own cards. Staff publish a fresh set each week, built from
-- the event's games by the site's card engine (the site sends the frozen
-- card JSON; this only stores it). Anyone signed in opens packs from the
-- latest set with a weekly allowance that has nothing to do with the
-- league's wallet: $2,000 a week (Monday to Monday, Eastern), $100 a pack.
--
-- Copies live here, not in card_inventory, so they never reach the league's
-- packs, market, dust, sets, lineups or expeditions, and they go when the
-- offseason is removed.
--
-- A pulled card can be foil (one finish), shiny, or signed. Signed uses the
-- player's own saved autograph (card_art_prefs) and only players who have
-- one can roll it; a signed card is always foil, as in the league's packs.

create table public.offseason_card_sets (
  event_id     uuid not null references public.offseason_events(id) on delete cascade,
  week_number  int not null check (week_number >= 1),
  published_at timestamptz not null default now(),
  primary key (event_id, week_number)
);

create table public.offseason_cards (
  event_id    uuid not null,
  week_number int not null,
  entrant_id  uuid not null references public.offseason_entrants(id) on delete cascade,
  card        jsonb not null,
  primary key (event_id, week_number, entrant_id),
  foreign key (event_id, week_number) references public.offseason_card_sets (event_id, week_number) on delete cascade
);

create table public.offseason_pack_openings (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null unique,
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  event_id       uuid not null references public.offseason_events(id) on delete cascade,
  week_number    int not null,
  allowance_week date not null,
  price          int not null check (price > 0),
  created_at     timestamptz not null default now()
);
create index offseason_pack_openings_owner_week_idx on public.offseason_pack_openings (owner_id, allowance_week);

create table public.offseason_card_copies (
  id          bigint generated always as identity primary key,
  opening_id  uuid not null references public.offseason_pack_openings(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  event_id    uuid not null references public.offseason_events(id) on delete cascade,
  week_number int not null,
  -- The card JSON is frozen, so a copy outlives its player leaving the event.
  entrant_id  uuid references public.offseason_entrants(id) on delete set null,
  slot        int not null check (slot between 1 and 5),
  foil        boolean not null default false,
  shiny       boolean not null default false,
  signed      boolean not null default false,
  card        jsonb not null,
  created_at  timestamptz not null default now(),
  unique (opening_id, slot)
);
create index offseason_card_copies_owner_idx on public.offseason_card_copies (owner_id, created_at desc);

-- Sets are public; openings and copies are their owner's. Every write goes
-- through the functions below.
alter table public.offseason_card_sets     enable row level security;
alter table public.offseason_cards         enable row level security;
alter table public.offseason_pack_openings enable row level security;
alter table public.offseason_card_copies   enable row level security;

grant select on public.offseason_card_sets, public.offseason_cards to anon, authenticated;
grant select on public.offseason_pack_openings, public.offseason_card_copies to authenticated;
grant all on public.offseason_card_sets, public.offseason_cards, public.offseason_pack_openings,
  public.offseason_card_copies to service_role;

create policy offseason_card_sets_public_read on public.offseason_card_sets for select using (true);
create policy offseason_cards_public_read on public.offseason_cards for select using (true);
create policy offseason_pack_openings_own_read on public.offseason_pack_openings
  for select to authenticated using (owner_id = auth.uid());
create policy offseason_card_copies_own_read on public.offseason_card_copies
  for select to authenticated using (owner_id = auth.uid());

-- Staff publish (or republish) a week's set: the cards replace whatever that
-- week had. Each card names a player in the event.
create function public.offseason_publish_card_set(p_event_id uuid, p_week_number int, p_cards jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  perform public._offseason_require_staff();
  if not exists (select 1 from public.offseason_weeks where event_id = p_event_id and week_number = p_week_number) then
    raise exception 'WEEK_NOT_FOUND: week % is not open', p_week_number;
  end if;
  if jsonb_typeof(p_cards) is distinct from 'array' or jsonb_array_length(p_cards) = 0 then
    raise exception 'CARDS_EMPTY: nobody has a rated game yet';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_cards) c
    where jsonb_typeof(c -> 'card') is distinct from 'object'
       or not exists (
         select 1 from public.offseason_entrants e
         where e.id::text = c ->> 'entrant_id' and e.event_id = p_event_id
       )
  ) then
    raise exception 'CARDS_INVALID: every card needs a player from this event';
  end if;

  insert into public.offseason_card_sets (event_id, week_number) values (p_event_id, p_week_number)
    on conflict (event_id, week_number) do update set published_at = now();
  delete from public.offseason_cards where event_id = p_event_id and week_number = p_week_number;
  insert into public.offseason_cards (event_id, week_number, entrant_id, card)
  select p_event_id, p_week_number, (c ->> 'entrant_id')::uuid, c -> 'card'
  from jsonb_array_elements(p_cards) c;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.offseason_publish_card_set(uuid, int, jsonb) from public, anon;
grant execute on function public.offseason_publish_card_set(uuid, int, jsonb) to authenticated;

-- The current Monday (Eastern) that the weekly allowance counts from.
create function public._offseason_allowance_week() returns date
language sql stable set search_path = public as $$
  select (date_trunc('week', now() at time zone 'America/New_York'))::date
$$;

-- An opening and its copies, as the site shows them, with what is left of
-- that week's allowance.
create function public._offseason_pack_result(p_opening_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'opening_id', o.id,
    'week_number', o.week_number,
    'remaining', 2000 - (select coalesce(sum(x.price), 0) from public.offseason_pack_openings x
                          where x.owner_id = o.owner_id and x.allowance_week = o.allowance_week),
    'cards', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', c.id, 'slot', c.slot, 'foil', c.foil, 'shiny', c.shiny, 'signed', c.signed, 'card', c.card)
                order by c.slot), '[]'::jsonb)
              from public.offseason_card_copies c where c.opening_id = o.id)
  )
  from public.offseason_pack_openings o where o.id = p_opening_id
$$;

revoke all on function public._offseason_allowance_week() from public, anon, authenticated;
revoke all on function public._offseason_pack_result(uuid) from public, anon, authenticated;

-- Opens one pack for the caller: charges $100 of this week's $2,000, draws
-- five different players from the latest set, and rolls each one's finish.
-- The request id makes a retry return the same pack instead of a second one.
create function public.offseason_open_pack(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_opening public.offseason_pack_openings;
  v_event uuid;
  v_week_number int;
  v_allowance_week date := public._offseason_allowance_week();
  v_spent int;
  v_slot int := 0;
  v_card record;
  v_ink text;
  v_foil boolean;
  v_shiny boolean;
  v_signed boolean;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN: sign in to open packs';
  end if;
  if p_request_id is null then
    raise exception 'REQUEST_INVALID: missing request id';
  end if;
  -- One purchase at a time per member, so two tabs can't overspend.
  perform pg_advisory_xact_lock(hashtextextended('offseason_pack:' || v_uid::text, 0));

  select * into v_opening from public.offseason_pack_openings where request_id = p_request_id;
  if found then
    if v_opening.owner_id <> v_uid then
      raise exception 'REQUEST_INVALID: that request belongs to someone else';
    end if;
    return public._offseason_pack_result(v_opening.id);
  end if;

  select s.event_id, s.week_number into v_event, v_week_number
  from public.offseason_card_sets s
  join public.offseason_events e on e.id = s.event_id
  where e.status <> 'complete'
  order by e.created_at desc, s.week_number desc
  limit 1;
  if v_event is null then
    raise exception 'NO_CARDS_YET: the first set drops once week 1''s games are in';
  end if;

  select coalesce(sum(price), 0) into v_spent
  from public.offseason_pack_openings
  where owner_id = v_uid and allowance_week = v_allowance_week;
  if v_spent + 100 > 2000 then
    raise exception 'ALLOWANCE_SPENT: this week''s $2,000 is spent; it resets on Monday';
  end if;

  insert into public.offseason_pack_openings (request_id, owner_id, event_id, week_number, allowance_week, price)
  values (p_request_id, v_uid, v_event, v_week_number, v_allowance_week, 100)
  returning * into v_opening;

  for v_card in
    select c.entrant_id, c.card from public.offseason_cards c
    where c.event_id = v_event and c.week_number = v_week_number
    order by random()
    limit 5
  loop
    v_slot := v_slot + 1;
    v_ink := (
      select a.signature from public.card_art_prefs a
      where a.signature is not null
        and lower(btrim(a.summoner_name)) = lower(btrim(v_card.card ->> 'name'))
        and lower(btrim(a.tag)) = lower(btrim(v_card.card ->> 'tag'))
      order by a.updated_at desc
      limit 1
    );
    v_signed := v_ink is not null and random() < 0.05;
    v_foil := v_signed or random() < 0.10;
    v_shiny := random() < 0.05;
    insert into public.offseason_card_copies
      (opening_id, owner_id, event_id, week_number, entrant_id, slot, foil, shiny, signed, card)
    values (
      v_opening.id, v_uid, v_event, v_week_number, v_card.entrant_id, v_slot, v_foil, v_shiny, v_signed,
      v_card.card || jsonb_build_object('shiny', v_shiny, 'autograph', case when v_signed then v_ink end)
    );
  end loop;

  return public._offseason_pack_result(v_opening.id);
end $$;

revoke all on function public.offseason_open_pack(uuid) from public, anon;
grant execute on function public.offseason_open_pack(uuid) to authenticated;

-- What the caller has left this week; $2,000 for anyone not signed in.
create function public.offseason_pack_wallet()
returns table (spent int, remaining int, week_start date)
language sql stable security definer set search_path = public as $$
  select s.spent, 2000 - s.spent, public._offseason_allowance_week()
  from (
    select coalesce(sum(price), 0)::int as spent
    from public.offseason_pack_openings
    where owner_id = auth.uid() and allowance_week = public._offseason_allowance_week()
  ) s
$$;

revoke all on function public.offseason_pack_wallet() from public;
grant execute on function public.offseason_pack_wallet() to anon, authenticated;
