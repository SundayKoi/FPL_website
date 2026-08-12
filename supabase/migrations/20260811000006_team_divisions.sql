alter table public.teams
  add column if not exists division text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.teams'::regclass
      and conname = 'teams_division_check'
  ) then
    alter table public.teams
      add constraint teams_division_check
      check (division in ('Lunari', 'Solari') or division is null);
  end if;
end $$;
