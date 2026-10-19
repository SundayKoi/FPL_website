-- Offseason MVP voting waits for the week (see docs/offseason.md): voting on
-- a week now opens only once staff mark it complete, so nobody votes while
-- its games are still being played. It still closes when the next week's
-- games start, or when the event ends.
--
-- The open week is the newest week that has reached 'playing', as before,
-- but only while that week is 'complete'. offseason_vote_mvp() and
-- offseason_mvp_results() both ask this function, so they follow it.

create or replace function public._offseason_mvp_open_week(p_event_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select current_week.id
  from (
    select w.id, w.status
    from public.offseason_weeks w
    join public.offseason_events e on e.id = w.event_id
    where w.event_id = p_event_id and e.status <> 'complete' and w.status in ('playing', 'complete')
    order by w.week_number desc
    limit 1
  ) current_week
  where current_week.status = 'complete'
$$;

revoke all on function public._offseason_mvp_open_week(uuid) from public, anon, authenticated;
