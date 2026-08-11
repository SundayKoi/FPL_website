-- Current season/phase as a single admin-set source of truth, so automated
-- stats ingestion (e.g. a Discord bot invoking riot_stats_ingest.py with
-- just match ids) can label rows without being told --season/--phase on
-- every run. Admins flip these once per split / phase change; the script
-- reads them when its flags are omitted.
alter table public.league_settings
  add column current_season text not null default 'S5',
  add column current_phase text not null default 'Regular'
    check (current_phase in ('Regular', 'Playoffs'));

-- league_settings has no seed row (the featured-draft selector upserts
-- id=1 on first use) — create it so the ingest script's fallback read
-- always finds one.
insert into public.league_settings (id)
values (1)
on conflict (id) do nothing;
