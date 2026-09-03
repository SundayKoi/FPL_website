-- Auto-dust: a standing rule per collector for what to melt without
-- being asked. "Dust anything at or below this rarity and this overall,
-- once I already hold N copies of the player; skip foils and signed
-- copies; and do it to new pulls as the pack opens."
--
-- The rule is read and applied by the app (src/lib/cards/autoDust.ts is
-- the pure selection, autoDustServer.ts applies it through dust_card,
-- the same door every manual dust uses — so every lock, the Eclipse
-- refusal and the ledger discipline hold for an automatic dust exactly
-- as for a tapped one). Deny-all like card_inventory: the service role
-- reads and writes it on behalf of the session.

create table if not exists public.card_auto_dust (
  discord_id   text primary key references public.betting_profiles(discord_id) on delete cascade,
  enabled      boolean not null default false,
  -- The highest rarity the rule touches.
  max_tier     text not null default 'silver'
    check (max_tier in ('bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'challenger')),
  -- The highest overall the rule touches.
  max_overall  int not null default 60 check (max_overall between 0 and 99),
  -- Copies of a player kept before extras are dusted; 0 dusts them all.
  keep_copies  int not null default 1 check (keep_copies between 0 and 10),
  -- Apply to a pack's pulls as it opens.
  on_rip       boolean not null default true,
  skip_foil    boolean not null default true,
  skip_signed  boolean not null default true,
  updated_at   timestamptz not null default now()
);

alter table public.card_auto_dust enable row level security;
grant all on public.card_auto_dust to service_role;
