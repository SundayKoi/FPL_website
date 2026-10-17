-- Offseason card signing (see docs/offseason.md): every player in the event
-- can claim their offseason card and sign it. The signature goes on their
-- card on the site and on the signed copies people pull from offseason packs.
--
-- It lives in its own table, not on offseason_entrants, so the event's
-- ordinary reads don't carry an image per row. Like everything else in the
-- event it is public to read, and it goes when the offseason is removed.
--
-- A player signs through offseason_sign_card() only. Claiming is the same
-- Riot ID claim offseason_lock_in() makes: a player staff added by hand has
-- no account yet, so passing that row's Riot ID links it to the caller first.
-- The claim only happens if the signature saves.

create table public.offseason_signatures (
  entrant_id uuid primary key references public.offseason_entrants(id) on delete cascade,
  -- Matches card_art_prefs.signature: a small transparent PNG as a data URL.
  signature  text not null
    check (signature ~ '^data:image/png;base64,[A-Za-z0-9+/]+=*$' and char_length(signature) <= 80000),
  signed_by  uuid references public.profiles(id) on delete set null,
  signed_at  timestamptz not null default now()
);

alter table public.offseason_signatures enable row level security;

grant select on public.offseason_signatures to anon, authenticated;
grant all on public.offseason_signatures to service_role;

create policy offseason_signatures_public_read on public.offseason_signatures for select using (true);

-- Signs (or re-signs) the caller's own card in the event and returns their
-- entry's id.
create function public.offseason_sign_card(
  p_event_id uuid,
  p_signature text,
  p_riot_id text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_riot text := btrim(coalesce(p_riot_id, ''));
  v_event public.offseason_events;
  v_entrant public.offseason_entrants;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN: sign in to sign your card';
  end if;
  if p_signature is null
     or p_signature !~ '^data:image/png;base64,[A-Za-z0-9+/]+=*$'
     or char_length(p_signature) > 80000 then
    raise exception 'SIGNATURE_INVALID: draw your signature again';
  end if;
  select * into v_event from public.offseason_events where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND: no such event';
  end if;
  if v_event.status = 'complete' then
    raise exception 'EVENT_COMPLETE: the event is over';
  end if;

  select * into v_entrant from public.offseason_entrants
    where event_id = p_event_id and profile_id = v_uid for update;
  if not found then
    if v_riot = '' then
      raise exception 'NOT_ENTERED: you are not in this event';
    end if;
    select * into v_entrant from public.offseason_entrants
      where event_id = p_event_id and lower(riot_id) = lower(v_riot) for update;
    if not found then
      raise exception 'NOT_ENTERED: nobody in the event has that Riot ID';
    end if;
    if v_entrant.profile_id is not null then
      raise exception 'RIOT_ID_TAKEN: that Riot ID belongs to another account';
    end if;
    update public.offseason_entrants set profile_id = v_uid where id = v_entrant.id;
  end if;
  if v_entrant.status = 'withdrawn' then
    raise exception 'NOT_PLAYING: you withdrew from the event';
  end if;

  insert into public.offseason_signatures (entrant_id, signature, signed_by)
  values (v_entrant.id, p_signature, v_uid)
  on conflict (entrant_id) do update
    set signature = excluded.signature, signed_by = excluded.signed_by, signed_at = now();
  return v_entrant.id;
end $$;

revoke all on function public.offseason_sign_card(uuid, text, text) from public, anon;
grant execute on function public.offseason_sign_card(uuid, text, text) to authenticated;

-- The autograph a signed pack copy wears: the player's offseason signature,
-- or else their league autograph (card_art_prefs) for anyone who hasn't
-- signed their offseason card yet. Null when they have neither.
create function public._offseason_ink(p_entrant_id uuid, p_card jsonb) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.signature from public.offseason_signatures s where s.entrant_id = p_entrant_id),
    (select a.signature from public.card_art_prefs a
     where a.signature is not null
       and lower(btrim(a.summoner_name)) = lower(btrim(p_card ->> 'name'))
       and lower(btrim(a.tag)) = lower(btrim(p_card ->> 'tag'))
     order by a.updated_at desc
     limit 1)
  )
$$;

revoke all on function public._offseason_ink(uuid, jsonb) from public, anon, authenticated;

-- offseason_open_pack() from 20261112000001, unchanged except that a signed
-- copy's ink now comes from _offseason_ink().
create or replace function public.offseason_open_pack(p_request_id uuid) returns jsonb
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
    v_ink := public._offseason_ink(v_card.entrant_id, v_card.card);
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
