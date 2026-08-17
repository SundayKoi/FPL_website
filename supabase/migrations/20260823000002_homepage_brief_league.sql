-- Briefs are now written for two leagues, so each row records which homepage
-- it belongs to. Existing rows are Premier: it was the only league with a
-- homepage brief when they were generated.

alter table public.homepage_briefs
  add column if not exists league text not null default 'premier';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.homepage_briefs'::regclass
      and conname = 'homepage_briefs_league_check'
  ) then
    alter table public.homepage_briefs
      add constraint homepage_briefs_league_check
      check (league in ('premier', 'academy'));
  end if;
end $$;

-- fetchActiveBrief reads (league, published, generated_at desc); the existing
-- index leads with season, which that query no longer filters on.
create index if not exists homepage_briefs_league_published_idx
  on public.homepage_briefs (league, published, generated_at desc);
