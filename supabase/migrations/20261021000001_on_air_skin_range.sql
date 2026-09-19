-- The On Air skin num: 0..200, not 0..99.
--
-- 20261020000001 created `on_air_casters.skin` with an inline
-- `check (skin between 0 and 99)`, which assumed Riot's skin nums are small.
-- They are not: they are sparse and they run well past a hundred for the
-- champions with many skins and chromas, so a caster's card could not be set
-- to a skin that exists. 200 is the ceiling the card-art path already uses —
-- `save_card_art_preference` (20261018000001) refuses anything outside
-- 0..200 — so this only brings the casters' desk into line with it.
--
-- Nothing else changes: the column stays `not null default 0`, and the desk
-- (src/components/admin/OnAirCasterForm.tsx, through the staff-gated
-- fetchOnAirSkinCatalogAction) still refuses a num that is not one of the
-- champion's published skins before it ever reaches the upsert. This check
-- is the floor under that, not the whole of it.

alter table public.on_air_casters drop constraint if exists on_air_casters_skin_check;
alter table public.on_air_casters
  add constraint on_air_casters_skin_check check (skin between 0 and 200);
