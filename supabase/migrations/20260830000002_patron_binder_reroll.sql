-- Patron perks, round three: the nine-slot binder and the weekly print
-- re-roll.
--
-- The slot check widens to 9 for everyone at the TABLE level — which cap
-- applies to a given user (6, or 9 for an active patron) is app logic in
-- src/lib/binder, the same place ownership is enforced. A lapsed patron
-- keeps what's pinned; they just can't pin past 6 again.
--
-- card_print_rerolls is the weekly die's ledger: one row per (user, week)
-- IS the spend, claimed by primary-key insert before the art moves
-- (burn-first, same discipline as signing links), so two clicks can never
-- re-roll twice in a week. Service-role only, like every comp table.

alter table public.card_binder_slots drop constraint if exists card_binder_slots_slot_check;
alter table public.card_binder_slots
  add constraint card_binder_slots_slot_check check (slot between 1 and 9);

create table if not exists public.card_print_rerolls (
  discord_id   text not null,
  -- Monday of the week the die was spent, same week key the drops use.
  week_start   date not null,
  inventory_id bigint,
  created_at   timestamptz not null default now(),
  primary key (discord_id, week_start)
);

alter table public.card_print_rerolls enable row level security;
grant all on public.card_print_rerolls to service_role;
