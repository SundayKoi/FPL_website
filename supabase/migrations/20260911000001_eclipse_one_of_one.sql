-- ---------------------------------------------------------------------------
-- Eclipse: the one-of-one, made real.
--
-- Until now Eclipse could be rendered but never minted — it sat outside the
-- foil ladder with no weight for the roll to draw. This is the decision that
-- turns it on, and the two rules that make "1 of 1" a fact rather than a
-- promise the application is trusted to keep.
--
-- WHAT IT IS. An Eclipse can only ever fall on a Card of the Week: the
-- highest-rated card in each role, five per edition week. Everything else is
-- ineligible, so the chase is always aimed at the cards the league is already
-- arguing about.
--
-- RULE 1 — ONE PER CARD, PER WEEK, FOREVER. Enforced by the partial unique
-- index below rather than by application logic, because "there is only one"
-- is exactly the kind of claim that must survive a race, a retry, a second
-- server, and whatever someone writes next year. Two people rolling the same
-- Eclipse in the same instant is astronomically unlikely at the drop rate —
-- and if it ever happened, two 1/1s of the same card is not a bug you can
-- apologise your way out of. The database says no.
--
-- The index is scoped to (season, edition_week, slug), so each week's five
-- Cards of the Week each have their own Eclipse to be found. An unclaimed
-- one stays claimable forever through that week's packs: the back catalogue
-- of unminted Eclipses grows every week, which is the whole economy.
--
-- RULE 2 — IT CANNOT BE DUSTED. A 1/1 fed to the dust grinder for a few
-- hundred dollars is a piece of the league's history deleted for pocket
-- change, usually by accident, usually within a minute of being pulled. It
-- can still be TRADED — that is the point of owning one — but it cannot be
-- destroyed. Guarded inside dust_card so no caller can route around it.
-- ---------------------------------------------------------------------------

-- === Letting one exist at all ==============================================
-- card_inventory_foil_type_ck (20260827000010) whitelists the four ladder
-- parallels and nothing else, which is what has been keeping Eclipse
-- unmintable at the storage layer as well as in the roller. Widening it is
-- the actual switch being thrown here; everything below is the two rules
-- that make the result a one-of-one rather than just another parallel.
--
-- The whitelist shape is kept deliberately. A free-text foil_type would let
-- a typo mint a card that renders as nothing at all.
alter table public.card_inventory
  drop constraint if exists card_inventory_foil_type_ck;
alter table public.card_inventory
  add constraint card_inventory_foil_type_ck check (
    (foil is true and foil_type is not null
      and foil_type in ('prisma', 'aurora', 'refractor', 'ice', 'eclipse'))
    or
    (foil is not true and foil_type is null)
  );

-- === Rule 1 ================================================================
-- Partial, so it costs nothing on the overwhelming majority of rows that are
-- not Eclipses. A duplicate insert raises 23505, which the pack opener reads
-- as "someone beat you to it" rather than as a failure.
create unique index if not exists card_inventory_one_eclipse_per_print
  on public.card_inventory (season, edition_week, slug)
  where foil_type = 'eclipse';

comment on index public.card_inventory_one_eclipse_per_print is
  'One Eclipse per card per edition week, forever. This index IS the 1-of-1 guarantee.';

-- === Rule 2 ================================================================
-- Re-declared in full rather than patched: dust_card is short, and a reader
-- comparing it against 20260826000018 should see one function, not a diff.
-- Everything below the eclipse check is unchanged from that migration.
create or replace function public.dust_card(p_user text, p_inventory bigint, p_value bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   text;
  v_foil    text;
  v_balance bigint;
begin
  if p_value < 1 or p_value > 10000 then raise exception 'invalid dust value'; end if;

  select discord_id, foil_type into v_owner, v_foil
    from card_inventory where id = p_inventory for update;
  if not found then raise exception 'unknown card %', p_inventory; end if;
  if v_owner <> p_user then raise exception 'card not owned'; end if;

  -- Checked under the same FOR UPDATE lock as the ownership test, and before
  -- anything is deleted or credited. A one-of-one is not a resource.
  if v_foil = 'eclipse' then raise exception 'eclipse cannot be dusted'; end if;

  delete from card_inventory where id = p_inventory;

  -- ref_id points at a row that no longer exists, on purpose: the ledger is
  -- a history, and "inventory 412 was dusted" stays true after the copy is
  -- gone. Same reasoning as a settled bet's ref.
  perform 1 from betting_profiles where discord_id = p_user for update;
  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, p_value, 'card_dust', 'card_inventory', p_inventory);
  update betting_profiles set balance = balance + p_value where discord_id = p_user
    returning balance into v_balance;

  return v_balance;
end;
$$;
