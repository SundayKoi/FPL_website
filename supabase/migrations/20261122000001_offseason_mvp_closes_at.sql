-- Offseason MVP voting deadline (see docs/offseason.md): staff can end a
-- week's vote at a set time, e.g. midnight Sunday Eastern, instead of when the
-- next week is complete. offseason_weeks.mvp_closes_at holds it; null keeps
-- the vote open until the next week is complete, as before.
--
-- The open week is still the newest complete week while the event isn't
-- complete, but only until its deadline passes. An older week never reopens.
-- offseason_vote_mvp() and offseason_mvp_results() both ask this function, so
-- they follow it: once the deadline passes the week's count shows. Staff set
-- the deadline through the existing staff write policy on offseason_weeks.

alter table public.offseason_weeks add column mvp_closes_at timestamptz;

create or replace function public._offseason_mvp_open_week(p_event_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select current_week.id
  from (
    select w.id, w.mvp_closes_at
    from public.offseason_weeks w
    join public.offseason_events e on e.id = w.event_id
    where w.event_id = p_event_id and e.status <> 'complete' and w.status = 'complete'
    order by w.week_number desc
    limit 1
  ) current_week
  where current_week.mvp_closes_at is null or current_week.mvp_closes_at > now()
$$;
