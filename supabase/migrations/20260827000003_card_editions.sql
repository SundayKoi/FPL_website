-- Every week's cards, frozen — so no edition is ever unattainable.
--
-- Cards have no table of their own: they are recomputed from season stats
-- on every request (src/lib/cards/queries.ts), and those ratings are
-- season-to-DATE, so a player's card drifts every week the league plays.
-- That made each week's version a one-week minting window: once Tuesday's
-- ingest landed, the previous week's print could never be pulled again.
--
-- This table is the archive that fixes it. The weekly drop writes the
-- complete card json for every player each week, and a pack can then be
-- bought for ANY past week and mint that week's cards exactly.
--
-- Storing the whole card (not just overall/tier, which card_rating_history
-- already keeps for the share page's journey strip) is deliberate: an
-- archived pull has to reproduce the archetype, sub-stats, signature
-- champion and serial the card carried THAT week, not this week's values
-- wearing an old rating.

create table if not exists public.card_editions (
  season       text not null,
  edition_week date not null,
  slug         text not null,
  player_name  text not null,
  role         text not null,
  overall      int not null,
  tier         text not null,
  card         jsonb not null,
  taken_at     timestamptz not null default now(),
  primary key (season, edition_week, slug)
);

-- The pack shop lists the weeks on offer, newest first.
create index if not exists card_editions_week_idx
  on public.card_editions (season, edition_week desc);

-- Publicly readable: these are just cards, and the shop renders the week
-- list for signed-out visitors. Writes are service-role only (the weekly
-- drop), so there is no insert/update policy at all.
alter table public.card_editions enable row level security;

drop policy if exists card_editions_public_read on public.card_editions;
create policy card_editions_public_read on public.card_editions
  for select using (true);

grant select on public.card_editions to anon, authenticated;
grant all on public.card_editions to service_role;
