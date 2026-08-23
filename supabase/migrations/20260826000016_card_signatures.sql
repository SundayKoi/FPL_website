-- Autographed pulls: a player inks a signature once, and from then on a
-- tiny fraction of that player's pack pulls come out signed — the autograph
-- frozen onto that specific copy forever.
--
-- The signature rides card_art_prefs like the skin and the motto before it,
-- so the existing can_edit_card_art policies and the anon/authenticated
-- grants cover the new column automatically (20260826000013): a captain can
-- sign their own roster's cards, an admin can sign anyone's, everyone can
-- read. It is a small transparent PNG drawn on a canvas rather than free
-- text — the check pins the data-URI format so nothing else can be smuggled
-- into an <img src>, and caps the size because these rows are read on every
-- card render.
alter table public.card_art_prefs
  add column if not exists signature text
    check (signature is null or (signature like 'data:image/png;base64,%' and char_length(signature) <= 80000));

-- Which copies came out autographed. Pure collector rarity — no stat
-- effect — rolled per pull in src/lib/packs/signatures.ts and stored
-- alongside `foil`, the other cosmetic that rides a pulled copy. The
-- autograph image itself lives inside the frozen `card` json, so a copy
-- keeps the signature it was pulled with even if the player redraws it.
alter table public.card_inventory
  add column if not exists signed boolean not null default false;
