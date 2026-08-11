alter table public.teams
  add column if not exists banner_color text not null default '#083344';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.teams'::regclass
      and conname = 'teams_banner_color_hex_check'
  ) then
    alter table public.teams
      add constraint teams_banner_color_hex_check
      check (banner_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;
