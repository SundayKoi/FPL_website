-- Widen the card art skin range.
--
-- 20260826000013 capped card_art_prefs.skin at 30, on the assumption that a
-- skin number is roughly a count of a champion's skins. It isn't: Riot's
-- skin nums are sparse ids handed out per champion, and they run far past
-- the number of skins that champion actually has — Jhin's catalog includes
-- 23, 37, 47, 55 and 64. The old check rejected every one of those, so the
-- customizer could show art it could not save.
--
-- 200 is headroom, not a real limit either; the column is only a pointer
-- into Riot's catalog, and the app validates a num against the CDN before
-- it renders (src/lib/packs/skins.ts). The check stays only to keep
-- nonsense out of the column.

alter table public.card_art_prefs
  drop constraint if exists card_art_prefs_skin_check;

alter table public.card_art_prefs
  add constraint card_art_prefs_skin_check check (skin >= 0 and skin <= 200);
