-- Weekly offseason MVP (see docs/offseason.md): anyone signed in votes for
-- one player per week, and can change that vote while voting is open. Nobody
-- can vote for themselves.
--
-- Voting on a week opens when its games start and closes when the next
-- week's games start, or when the event ends. Only one week is open at a
-- time: the newest week that has reached 'playing'. A week's count stays
-- hidden until voting on it closes, so early votes don't steer later ones.
--
-- Votes are their voter's own to read. Everyone reads the totals through
-- offseason_mvp_results(), and votes change through offseason_vote_mvp()
-- only.

create table public.offseason_mvp_votes (
  week_id    uuid not null references public.offseason_weeks(id) on delete cascade,
  voter_id   uuid not null references public.profiles(id) on delete cascade,
  entrant_id uuid not null references public.offseason_entrants(id) on delete cascade,
  voted_at   timestamptz not null default now(),
  primary key (week_id, voter_id)
);
create index offseason_mvp_votes_week_idx on public.offseason_mvp_votes (week_id, entrant_id);

alter table public.offseason_mvp_votes enable row level security;

grant select on public.offseason_mvp_votes to authenticated;
grant all on public.offseason_mvp_votes to service_role;

create policy offseason_mvp_votes_own_read on public.offseason_mvp_votes
  for select to authenticated using (voter_id = auth.uid());

-- The week voting is open on in the event, or null.
create function public._offseason_mvp_open_week(p_event_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select w.id
  from public.offseason_weeks w
  join public.offseason_events e on e.id = w.event_id
  where w.event_id = p_event_id and e.status <> 'complete' and w.status in ('playing', 'complete')
  order by w.week_number desc
  limit 1
$$;

revoke all on function public._offseason_mvp_open_week(uuid) from public, anon, authenticated;

-- Casts or changes the caller's vote for a week's MVP. The pick has to be on
-- one of that week's teams.
create function public.offseason_vote_mvp(p_week_id uuid, p_entrant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_week public.offseason_weeks;
  v_entrant public.offseason_entrants;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN: sign in to vote';
  end if;
  select * into v_week from public.offseason_weeks where id = p_week_id;
  if not found then
    raise exception 'WEEK_NOT_FOUND: no such week';
  end if;
  if public._offseason_mvp_open_week(v_week.event_id) is distinct from v_week.id then
    raise exception 'VOTING_CLOSED: voting on week % is closed', v_week.week_number;
  end if;
  select * into v_entrant from public.offseason_entrants where id = p_entrant_id and event_id = v_week.event_id;
  if not found or not exists (
    select 1 from public.offseason_team_members m
    join public.offseason_teams t on t.id = m.team_id
    where t.week_id = v_week.id and m.entrant_id = v_entrant.id
  ) then
    raise exception 'NOT_PLAYING: they did not play in week %', v_week.week_number;
  end if;
  if v_entrant.profile_id = v_uid then
    raise exception 'SELF_VOTE: you can''t vote for yourself';
  end if;

  insert into public.offseason_mvp_votes (week_id, voter_id, entrant_id)
  values (v_week.id, v_uid, v_entrant.id)
  on conflict (week_id, voter_id) do update
    set entrant_id = excluded.entrant_id, voted_at = now();
end $$;

revoke all on function public.offseason_vote_mvp(uuid, uuid) from public, anon;
grant execute on function public.offseason_vote_mvp(uuid, uuid) to authenticated;

-- Every week's MVP count in the event. A closed week has a row per player who
-- got a vote; the open week has a single row with no player and its total so
-- far.
create function public.offseason_mvp_results(p_event_id uuid)
returns table (week_id uuid, entrant_id uuid, votes int, final boolean)
language sql stable security definer set search_path = public as $$
  with open_week as (select public._offseason_mvp_open_week(p_event_id) as id)
  select v.week_id, v.entrant_id, count(*)::int, true
  from public.offseason_mvp_votes v
  join public.offseason_weeks w on w.id = v.week_id
  where w.event_id = p_event_id and v.week_id is distinct from (select id from open_week)
  group by v.week_id, v.entrant_id
  union all
  select o.id, null, (select count(*)::int from public.offseason_mvp_votes v where v.week_id = o.id), false
  from open_week o
  where o.id is not null
$$;

revoke all on function public.offseason_mvp_results(uuid) from public;
grant execute on function public.offseason_mvp_results(uuid) to anon, authenticated;
