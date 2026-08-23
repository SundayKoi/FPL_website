-- Card flair round two: a player-chosen motto on the card back, and an
-- append-only rating history so the share page can show a season journey.
--
-- The motto rides card_art_prefs (same ownership rules as the skin — the
-- existing can_edit_card_art policies cover the new column automatically).
--
-- card_rating_history differs from card_snapshots on purpose: snapshots
-- are the single latest baseline the weekly Discord drop diffs against
-- (one row per card, overwritten), while history keeps every weekly
-- reading so the journey strip can plot the whole season.

alter table public.card_art_prefs
  add column if not exists motto text check (motto is null or char_length(motto) <= 60);

create table if not exists public.card_rating_history (
  season text not null,
  slug text not null,
  overall int not null,
  tier text not null,
  taken_at timestamptz not null default now(),
  primary key (season, slug, taken_at)
);

alter table public.card_rating_history enable row level security;

create policy card_rating_history_public_read on public.card_rating_history
  for select using (true);

grant select on public.card_rating_history to anon, authenticated;
grant all on public.card_rating_history to service_role;
