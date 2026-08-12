-- Current season/phase as a single admin-set source of truth, so automated
-- stats ingestion (e.g. a Discord bot invoking riot_stats_ingest.py with
-- just match ids) can label rows without being told --season/--phase on
-- every run. Admins flip these once per split / phase change; the script
-- reads them when its flags are omitted.
alter table public.league_settings
  add column if not exists current_season text default 'S5',
  add column if not exists current_phase text default 'Regular';

update public.league_settings
set
  current_season = coalesce(current_season, 'S5'),
  current_phase = coalesce(current_phase, 'Regular');

alter table public.league_settings
  alter column current_season set default 'S5',
  alter column current_season set not null,
  alter column current_phase set default 'Regular',
  alter column current_phase set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.league_settings'::regclass
      and conname = 'league_settings_current_phase_check'
  ) then
    alter table public.league_settings
      add constraint league_settings_current_phase_check
      check (current_phase in ('Regular', 'Playoffs'));
  end if;
end $$;

-- league_settings has no seed row (the featured-draft selector upserts
-- id=1 on first use) — create it so the ingest script's fallback read
-- always finds one.
insert into public.league_settings (id)
values (1)
on conflict (id) do nothing;
