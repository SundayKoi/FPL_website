-- ---------------------------------------------------------------------------
-- Print-run numbers: every copy gets a serial, and every print knows how
-- many it has stamped.
--
-- A pack economy already has scarcity — a Cracked Ice is rare because the
-- roll is rare — but it has no *ordinality*. Two identical Doug prints are
-- interchangeable, and "I pulled the first one" is a claim nobody can check.
-- This is the ledger that makes it checkable: card_print_runs counts what a
-- print has ever stamped, card_inventory.print_number records which stamp a
-- copy got, and the number is assigned by the database at insert time so no
-- caller can pick its own.
--
-- WHY MINTED-TO-DATE, NOT CURRENTLY-HELD, IS THE DENOMINATOR.
--
-- The obvious "of N" is a count: `select count(*) from card_inventory where
-- (season, edition_week, slug) = …`. It is also wrong, and wrong in a way
-- that quietly rewrites history.
--
-- Copies leave. dust_card DELETEs the row; a copy fed to the grinder is
-- gone. If N were the live count, then every dust would renumber the
-- world: the copy stamped "#7 of 43" would become "#7 of 42" overnight, and
-- eventually "#7 of 6" — a serial larger than the run it belongs to, which
-- is not a printing, it is a contradiction. Worse, the denominator would
-- fall while the numerator could not, so the same physical card would
-- describe itself differently every week depending on what strangers did
-- with THEIR copies.
--
-- So `minted` only ever goes up. A dusted copy retires its number: #7 is
-- spent forever, the run keeps counting from 43 to 44, and nothing already
-- stamped ever has to be restated. That is how a print run works on paper —
-- the press ran 43 times, and burning one does not un-run the press — and
-- it is the only reading under which "#7 of 43" is a fact about the copy
-- rather than a snapshot of the market. Scarcity is still legible: a run
-- with 43 minted and 6 alive is a print people melted, and both halves of
-- that story are recoverable (the count is one query away) precisely
-- because the counter refused to move.
--
-- The counter is also what makes the number RACE-PROOF. It is bumped by an
-- `insert … on conflict do update … returning`, one statement, which takes
-- a row lock on the print's counter row and hands back the post-increment
-- value. Two packs opened in the same millisecond on two servers serialize
-- on that row: one gets 44, the other 45, and neither can read a stale
-- count and stamp a duplicate the way a `select max(print_number) + 1`
-- would. The cost is one narrow row lock per minted card, held for the rest
-- of the inserting transaction — packs insert five rows across five
-- different prints, so the contention is per-print, not per-pack.
--
-- Eclipse comes out of this as "#1 of 1" for free, by construction rather
-- than by a special case: card_inventory_one_eclipse_per_print
-- (20260911000001) already guarantees a print can hold at most one Eclipse,
-- and an Eclipse's own print — the (season, edition_week, slug) it counts
-- against — is shared with its ordinary copies. So an Eclipse is #1 of 1
-- only when it is the first thing that print ever stamped. The honest
-- reading, and the one the UI wants, is the copy's number against its own
-- print's total; the "1 of 1" hallmark belongs to the foil type, which
-- already says it.
-- ---------------------------------------------------------------------------

-- === The counter ============================================================
-- One row per print — (season, edition_week, slug) is exactly the key
-- card_inventory's Eclipse index uses, and exactly what a copy names.
-- `minted` is a running total, never a live count; see the header.
create table if not exists public.card_print_runs (
  season       text not null,
  edition_week date not null,
  slug         text not null,
  minted       int  not null default 0,
  primary key (season, edition_week, slug)
);

comment on column public.card_print_runs.minted is
  'Copies this print has EVER stamped. Monotonic: dusting retires a number, it does not free one.';

-- === The serial =============================================================
-- Nullable, because rows minted before this migration are numbered by the
-- backfill below and because a column that can never be null is a promise
-- the backfill has to keep for every environment at once. Every row written
-- from here on gets one from the trigger.
alter table public.card_inventory add column if not exists print_number int;

comment on column public.card_inventory.print_number is
  'This copy''s stamp within its print. Assigned by card_inventory_print_number; never chosen by a caller.';

-- === Backfill ===============================================================
-- Existing copies are numbered in the order they were actually pulled.
-- acquired_at alone is not a total order — five cards out of one pack share
-- it to the microsecond — so id breaks the tie, which is also the order
-- they were inserted in. The numbering is therefore the same one the
-- trigger would have produced had it existed all along.
--
-- Guarded on print_number being unset so a re-run cannot renumber a
-- collection: this migration is append-only history, and a second
-- application must be a no-op rather than a reshuffle.
with numbered as (
  select id,
         row_number() over (
           partition by season, edition_week, slug
           order by acquired_at, id
         ) as n
    from public.card_inventory
)
update public.card_inventory ci
   set print_number = numbered.n
  from numbered
 where numbered.id = ci.id
   and ci.print_number is null;

-- Counters start at the high-water mark of what is already stamped — not at
-- the number of rows alive, which for a print that has already lost copies
-- to the grinder would hand the next pull a number somebody is holding.
insert into public.card_print_runs (season, edition_week, slug, minted)
select season, edition_week, slug, max(print_number)
  from public.card_inventory
 where print_number is not null
 group by season, edition_week, slug
    on conflict (season, edition_week, slug)
    do update set minted = greatest(card_print_runs.minted, excluded.minted);

-- === The stamp ==============================================================
-- BEFORE INSERT so the number is part of the row being written rather than
-- a second UPDATE against it — one statement, one visibility, and nothing
-- can observe a copy that exists without a serial.
--
-- security definer with a pinned search_path for expedition_guard's reason:
-- the guarantee must hold whoever issues the insert, and a definer function
-- that resolves `card_print_runs` through the caller's search_path is a
-- guarantee about the caller's session, not about the data.
create or replace function public.stamp_print_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minted int;
begin
  -- One statement, so the read and the write of the counter cannot be
  -- separated by another transaction. The DO UPDATE branch reads
  -- card_print_runs.minted (the stored value), not excluded.minted (the 1
  -- we proposed) — writing `excluded.minted` here would pin every print at
  -- 1 forever.
  insert into public.card_print_runs (season, edition_week, slug, minted)
  values (new.season, new.edition_week, new.slug, 1)
      on conflict (season, edition_week, slug)
      do update set minted = card_print_runs.minted + 1
   returning card_print_runs.minted into v_minted;

  new.print_number := v_minted;
  return new;
end;
$$;

create trigger card_inventory_print_number
  before insert on public.card_inventory
  for each row execute function public.stamp_print_number();

-- === Grants =================================================================
-- card_inventory stays service-role only; the COUNTS do not. "43 of these
-- exist" is a fact about the print, not about anyone's shelf — it is
-- printed on every card that shows a serial, including the ones a
-- signed-out visitor sees on a public binder — so the counter table is
-- world-readable with a permissive select policy and no write grant at all.
-- Every write to it comes from the trigger, which runs as its definer.
alter table public.card_print_runs enable row level security;

create policy card_print_runs_public_read on public.card_print_runs
  for select using (true);

grant select on public.card_print_runs to anon, authenticated;
grant all on public.card_print_runs to service_role;
