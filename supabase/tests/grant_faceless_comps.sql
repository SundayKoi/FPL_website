-- One-off: grant the Champion's Tribute — 2 free Faceless Packs each to
-- the S4 squad members on the site (2026-08, owner's call): 7gen,
-- spades2, shanedata.
--
-- Looks the three up by betting_profiles.username (case-insensitive).
-- Idempotent: a re-run inserts nothing new (on conflict do nothing), so
-- it can never double-grant.
--
-- Run in the Supabase SQL editor AFTER 20260830000001_card_pack_comps.

begin;

insert into public.card_pack_comps (discord_id, kind, remaining, granted, reason)
select bp.discord_id, 'champions', 2, 2, 'S4 Faceless squad — champions drop tribute'
  from public.betting_profiles bp
 where lower(bp.username) in ('7gen', 'spades2', 'shanedata')
on conflict (discord_id, kind) do nothing;

-- ── Report ────────────────────────────────────────────────────────────
-- Who now holds a tribute (expect three rows — one per name).
select c.discord_id, bp.username, c.remaining, c.granted
  from public.card_pack_comps c
  left join public.betting_profiles bp on bp.discord_id = c.discord_id
 where c.kind = 'champions'
 order by bp.username;

-- Names that matched no profile — any username printed here needs a
-- manual grant once you know their exact discord username or id:
--   insert into public.card_pack_comps (discord_id, kind, remaining, granted, reason)
--   values ('<discord_id>', 'champions', 2, 2, 'S4 Faceless squad — champions drop tribute');
select missing.username as unmatched_username
  from (values ('7gen'), ('spades2'), ('shanedata')) as missing(username)
 where not exists (
   select 1 from public.betting_profiles bp where lower(bp.username) = missing.username
 );

commit;
