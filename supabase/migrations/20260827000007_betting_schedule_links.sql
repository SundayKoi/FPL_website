-- Weekly betting generation needs two durable identities:
--   * reusable season events declare which fixture season they own;
--   * generated markets retain the fixture that produced them.
-- Manual/prop events and markets stay nullable and continue to work as before.

alter table public.betting_events
  add column league text,
  add column schedule_season text;

alter table public.betting_events
  add constraint betting_events_league_check
    check (league is null or league in ('premier', 'academy')),
  add constraint betting_events_schedule_binding_complete_check
    check ((league is null) = (schedule_season is null)),
  add constraint betting_events_schedule_season_normalized_check
    check (
      schedule_season is null
      or (schedule_season = upper(trim(schedule_season)) and schedule_season <> '')
    );

create unique index betting_events_schedule_binding_uidx
  on public.betting_events(league, schedule_season)
  where league is not null and schedule_season is not null;

alter table public.betting_markets
  add column fixture_id uuid references public.fixtures(id) on delete set null;

create unique index betting_markets_fixture_id_uidx
  on public.betting_markets(fixture_id)
  where fixture_id is not null;

-- The live catalog already contains these season events. Bind by their stable
-- display convention, never by environment-specific identity values. The
-- Academy event intentionally displays S1 while its fixture season key is A1.
update public.betting_events e
set league = 'premier', schedule_season = s.current_season
from public.league_settings s
where s.id = 1
  and lower(trim(e.name)) = lower('Premier ' || s.current_season)
  and e.league is null
  and e.schedule_season is null;

update public.betting_events e
set league = 'academy', schedule_season = s.academy_season
from public.league_settings s
where s.id = 1
  and lower(trim(e.name)) = lower('Academy S' || substring(s.academy_season from 2))
  and e.league is null
  and e.schedule_season is null;
