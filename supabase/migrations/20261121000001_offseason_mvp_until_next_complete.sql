-- Offseason MVP voting stays open longer (see docs/offseason.md): a week's
-- vote now runs from when staff mark the week complete until the next week is
-- complete, so members can still vote while the next week drafts and plays.
-- Until now it closed as soon as the next week reached 'playing'.
--
-- The open week is the newest complete week, while the event isn't complete.
-- offseason_vote_mvp() and offseason_mvp_results() both ask this function, so
-- they follow it: the closed week's count shows once the next week completes.
-- CREATE OR REPLACE keeps the function's grants (none to clients).

create or replace function public._offseason_mvp_open_week(p_event_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select w.id
  from public.offseason_weeks w
  join public.offseason_events e on e.id = w.event_id
  where w.event_id = p_event_id and e.status <> 'complete' and w.status = 'complete'
  order by w.week_number desc
  limit 1
$$;
