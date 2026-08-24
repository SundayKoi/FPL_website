-- The binder: a handful of cards a collector chooses to show the world.
--
-- card_inventory has no public read policy — a collection is private, and
-- the pack flow reads it with the service role. A binder is the opt-in
-- opposite: the owner picks a few copies, and those become visible to
-- anyone holding the link.
--
-- Two tables rather than a `binder_slot` column on card_inventory, because
-- copies change hands. A traded card carrying its pin to its new owner
-- would be wrong, and a trigger to clear it on every transfer is a rule
-- that has to be remembered in each of the trade paths. Pinning by
-- inventory id and re-checking ownership at render time is correct without
-- anyone having to remember anything: a card you no longer own simply
-- stops appearing.

create table if not exists public.card_binders (
  discord_id text primary key,
  -- The share link IS the permission, same shape as open_draft_lobbies:
  -- unguessable, and it means binders can't be enumerated by walking user
  -- ids. Rotatable by deleting the row; a new one is minted on next use.
  token uuid not null default gen_random_uuid() unique,
  title text,
  updated_at timestamptz not null default now()
);

create table if not exists public.card_binder_slots (
  discord_id text not null references public.card_binders(discord_id) on delete cascade,
  -- Six slots: enough to say something about a collection, few enough that
  -- choosing is an actual decision.
  slot int not null check (slot between 1 and 6),
  inventory_id bigint not null references public.card_inventory(id) on delete cascade,
  primary key (discord_id, slot)
);

-- One copy can't fill two slots of the same binder.
create unique index if not exists card_binder_slots_unique_copy
  on public.card_binder_slots (discord_id, inventory_id);

-- Deny-all, like card_inventory: every read and write goes through server
-- code holding the service role, which is where the ownership check lives.
-- There is no policy at all, so anon/authenticated see nothing directly.
alter table public.card_binders enable row level security;
alter table public.card_binder_slots enable row level security;

revoke all on public.card_binders from anon, authenticated;
revoke all on public.card_binder_slots from anon, authenticated;
grant all on public.card_binders to service_role;
grant all on public.card_binder_slots to service_role;
