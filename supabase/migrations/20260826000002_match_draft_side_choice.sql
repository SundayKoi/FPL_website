alter table public.match_drafts
  add column if not exists blue_team_name text,
  add column if not exists red_team_name text;
