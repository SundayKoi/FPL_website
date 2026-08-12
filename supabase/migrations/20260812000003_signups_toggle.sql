-- Signup window toggle: staff open/close signups per split without
-- touching code. Enforced at the database, not just the UI — the signups
-- INSERT policy checks the flag, so a closed window rejects direct POSTs
-- too, not merely hides the form.
alter table public.league_settings
  add column signups_open boolean not null default true;

-- league_settings is public-read (see 20260810000001_teams_featured.sql),
-- so this subquery evaluates fine under anon.
drop policy if exists signups_public_insert on public.signups;
create policy signups_public_insert on public.signups
  for insert with check (
    (select signups_open from public.league_settings where id = 1)
  );
