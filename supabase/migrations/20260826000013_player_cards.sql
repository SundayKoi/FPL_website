-- Player-card extras: chosen card art (skin) and weekly rating snapshots.
--
-- card_art_prefs: which champion skin a player's card wears. Keyed by the
-- player's Riot identity (summoner_name + tag, matching raw_stats), not by
-- slug, so the RLS policy can join it against riot_accounts. Editable by
-- admins and by captains whose current roster contains the player.
--
-- card_snapshots: one row per card per season, refreshed by the weekly
-- card-drop script (scripts/weekly-card-drop.ts, service role) so the
-- Discord post can report movement since the previous run.

create table if not exists public.card_art_prefs (
  season text not null,
  summoner_name text not null,
  tag text not null,
  skin int not null default 0 check (skin >= 0 and skin <= 30),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (season, summoner_name, tag)
);

alter table public.card_art_prefs enable row level security;

create policy card_art_prefs_public_read on public.card_art_prefs
  for select using (true);

-- Who may set a card's art: site admins, or a captain whose team roster
-- (this season) contains the player's Riot account.
create or replace function public.can_edit_card_art(p_season text, p_summoner text, p_tag text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
    from public.roster_memberships rm
    join public.riot_accounts ra on ra.id = rm.riot_account_id
    join public.league_team_captains ltc
      on ltc.league_team_id = rm.league_team_id
     and ltc.season = rm.season
    where ltc.profile_id = auth.uid()
      and lower(trim(ra.game_name)) = lower(trim(p_summoner))
      and lower(trim(ra.tag_line)) = lower(trim(p_tag))
  )
$$;

grant execute on function public.can_edit_card_art(text, text, text) to authenticated;

create policy card_art_prefs_insert on public.card_art_prefs
  for insert to authenticated
  with check (public.can_edit_card_art(season, summoner_name, tag));

create policy card_art_prefs_update on public.card_art_prefs
  for update to authenticated
  using (public.can_edit_card_art(season, summoner_name, tag))
  with check (public.can_edit_card_art(season, summoner_name, tag));

grant select on public.card_art_prefs to anon, authenticated;
grant insert, update on public.card_art_prefs to authenticated;
grant all on public.card_art_prefs to service_role;

-- Weekly snapshots — written only by the service-role script (no
-- authenticated write policy on purpose).
create table if not exists public.card_snapshots (
  season text not null,
  slug text not null,
  overall int not null,
  tier text not null,
  taken_at timestamptz not null default now(),
  primary key (season, slug)
);

alter table public.card_snapshots enable row level security;

create policy card_snapshots_public_read on public.card_snapshots
  for select using (true);

grant select on public.card_snapshots to anon, authenticated;
grant all on public.card_snapshots to service_role;
