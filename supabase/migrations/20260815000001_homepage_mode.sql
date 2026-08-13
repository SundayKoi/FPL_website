alter table public.league_settings
  add column if not exists homepage_mode text default 'auto';

update public.league_settings
set homepage_mode = 'auto'
where homepage_mode is null;

alter table public.league_settings
  alter column homepage_mode set default 'auto',
  alter column homepage_mode set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.league_settings'::regclass
      and conname = 'league_settings_homepage_mode_check'
  ) then
    alter table public.league_settings
      add constraint league_settings_homepage_mode_check
      check (homepage_mode in ('auto', 'preseason', 'regular'));
  end if;
end;
$$;
