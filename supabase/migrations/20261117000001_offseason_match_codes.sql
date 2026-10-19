-- Offseason tournament codes (see docs/offseason.md): staff paste a batch of
-- Riot tournament codes into the event, and every game on the schedule gets
-- one, in schedule order. The players on a match's two teams read its codes;
-- nobody else but staff does.
--
-- Codes not needed yet wait in the event's pool, in the order they were
-- pasted, and go to matches as they are scheduled. A decided match hands the
-- codes of games it never played back to the pool, so a Bo5 won 3-0 doesn't
-- waste two. A game that has been played keeps its code.

create table public.offseason_match_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.offseason_events(id) on delete cascade,
  -- Paste order, which is the order the pool hands codes out.
  seq bigint generated always as identity,
  code text not null unique check (code ~ '^[A-Za-z0-9-]{1,100}$'),
  -- In the pool while match_id is null; game_number only means something with
  -- it. Deleting a match returns its codes to the pool.
  match_id uuid references public.offseason_matches(id) on delete set null,
  game_number int check (game_number between 1 and 5),
  created_at timestamptz not null default now(),
  check (match_id is null or game_number is not null),
  unique (match_id, game_number)
);
create index offseason_match_codes_pool_idx on public.offseason_match_codes (event_id, seq) where match_id is null;

alter table public.offseason_match_codes enable row level security;

revoke all on public.offseason_match_codes from anon, authenticated;
grant select on public.offseason_match_codes to authenticated;
grant all on public.offseason_match_codes to service_role;

-- Staff read every code, the pool included. A player reads the codes of the
-- matches their team plays, by the account their entry is linked to.
create policy offseason_match_codes_read on public.offseason_match_codes
  for select to authenticated using (
    public.offseason_is_staff()
    or exists (
      select 1
      from public.offseason_matches m
      join public.offseason_team_members tm on tm.team_id in (m.team_a_id, m.team_b_id)
      join public.offseason_entrants e on e.id = tm.entrant_id
      where m.id = offseason_match_codes.match_id and e.profile_id = (select auth.uid())
    )
  );

-- Takes back the codes of games a decided match never played, then gives each
-- game that still needs a code the next one in the pool: weeks in order, then
-- each week's schedule, then game by game. Only weeks still to finish get
-- codes. Returns how many it gave out.
create function public._offseason_fill_match_codes(p_event_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_slot record;
  v_code uuid;
  v_given int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('offseason_match_codes:' || p_event_id::text));

  update public.offseason_match_codes c
     set match_id = null, game_number = null
    from public.offseason_matches m
   where c.event_id = p_event_id and c.match_id = m.id
     and (c.game_number > m.best_of
          or (m.winner_team_id is not null
              and not exists (select 1 from public.offseason_games g
                               where g.match_id = m.id and g.game_number = c.game_number)));

  if exists (select 1 from public.offseason_events where id = p_event_id and status = 'complete') then
    return 0;
  end if;

  for v_slot in
    select m.id as match_id, n.game_number
    from public.offseason_matches m
    join public.offseason_weeks w on w.id = m.week_id
    cross join lateral generate_series(1, m.best_of) as n(game_number)
    where w.event_id = p_event_id and w.status <> 'complete' and m.winner_team_id is null
      and not exists (select 1 from public.offseason_match_codes c
                       where c.match_id = m.id and c.game_number = n.game_number)
      and not exists (select 1 from public.offseason_games g
                       where g.match_id = m.id and g.game_number = n.game_number)
    order by w.week_number, m.sort_order, m.id, n.game_number
  loop
    select id into v_code from public.offseason_match_codes
     where event_id = p_event_id and match_id is null
     order by seq limit 1;
    exit when v_code is null;
    update public.offseason_match_codes
       set match_id = v_slot.match_id, game_number = v_slot.game_number
     where id = v_code;
    v_given := v_given + 1;
  end loop;
  return v_given;
end $$;

revoke all on function public._offseason_fill_match_codes(uuid) from public, anon, authenticated;

-- New matches, a changed length and a decided (or reopened) match all
-- rebalance the event's codes.
create function public._offseason_match_codes_on_schedule() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._offseason_fill_match_codes((select event_id from public.offseason_weeks where id = new.week_id));
  return null;
end $$;

revoke all on function public._offseason_match_codes_on_schedule() from public, anon, authenticated;

create trigger offseason_match_codes_on_insert
  after insert on public.offseason_matches
  for each row execute function public._offseason_match_codes_on_schedule();
create trigger offseason_match_codes_on_update
  after update of best_of, winner_team_id on public.offseason_matches
  for each row
  when (old.best_of is distinct from new.best_of or old.winner_team_id is distinct from new.winner_team_id)
  execute function public._offseason_match_codes_on_schedule();

-- Staff paste codes into the event's pool; they go straight to any game that
-- needs one. Blank entries are ignored and codes already stored are skipped.
create function public.offseason_add_match_codes(p_event_id uuid, p_codes text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_added int := 0;
  v_skipped int := 0;
  v_given int;
begin
  perform public._offseason_require_staff();
  if not exists (select 1 from public.offseason_events where id = p_event_id) then
    raise exception 'EVENT_NOT_FOUND: no such event';
  end if;
  if coalesce(cardinality(p_codes), 0) > 500 then
    raise exception 'CODES_TOO_MANY: paste at most 500 codes at a time';
  end if;
  perform pg_advisory_xact_lock(hashtext('offseason_match_codes:' || p_event_id::text));

  foreach v_code in array coalesce(p_codes, '{}') loop
    v_code := btrim(coalesce(v_code, ''));
    continue when v_code = '';
    if v_code !~ '^[A-Za-z0-9-]{1,100}$' then
      raise exception 'CODE_INVALID: "%" is not a tournament code', left(v_code, 40);
    end if;
    insert into public.offseason_match_codes (event_id, code) values (p_event_id, v_code)
      on conflict (code) do nothing;
    if found then v_added := v_added + 1; else v_skipped := v_skipped + 1; end if;
  end loop;

  v_given := public._offseason_fill_match_codes(p_event_id);
  return jsonb_build_object(
    'added', v_added,
    'skipped', v_skipped,
    'assigned', v_given,
    'pooled', (select count(*) from public.offseason_match_codes where event_id = p_event_id and match_id is null)
  );
end $$;

revoke all on function public.offseason_add_match_codes(uuid, text[]) from public, anon;
grant execute on function public.offseason_add_match_codes(uuid, text[]) to authenticated;

-- Staff throw a code away, e.g. one that doesn't work. Its game takes the
-- next code in the pool.
create function public.offseason_remove_match_code(p_code_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_event uuid;
begin
  perform public._offseason_require_staff();
  select event_id into v_event from public.offseason_match_codes where id = p_code_id;
  if v_event is null then
    raise exception 'CODE_NOT_FOUND: no such code';
  end if;
  perform pg_advisory_xact_lock(hashtext('offseason_match_codes:' || v_event::text));
  delete from public.offseason_match_codes where id = p_code_id;
  perform public._offseason_fill_match_codes(v_event);
end $$;

revoke all on function public.offseason_remove_match_code(uuid) from public, anon;
grant execute on function public.offseason_remove_match_code(uuid) to authenticated;
