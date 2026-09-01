-- The market: a board where a copy has a price on it, and a board where a
-- price is waiting for a copy.
--
-- Trading (20260826000018_card_trading.sql) already moves cards and dollars
-- atomically, but it only works between two people who have already found
-- each other and agreed on everything at once. That is a bad fit for the
-- most common thing a collector actually wants to do: "I have four of him,
-- somebody give me five hundred dollars", or "I will pay eight hundred for
-- any copy of her". Those are standing offers to nobody in particular, and
-- an offer to nobody in particular is a listing, not a trade.
--
-- Two tables, because the two directions are not the same object:
--
--   card_listings  names a SPECIFIC COPY and a price. A buyer clicks and it
--                  is theirs. The copy is not escrowed — nothing here holds
--                  a card, exactly like card_trades — so the sale re-checks
--                  ownership at buy time and fails as stale otherwise.
--   card_wants     names a SLUG and a bounty. Anybody holding a matching
--                  copy this season can fill it. There is no copy to point
--                  at when the want is written, which is the whole point.
--
-- Money invariant (20260813000001_betting_schema.sql): every balance change
-- writes a betting_ledger row, so ledger_drift() stays at zero. A sale is
-- two rows, reason 'card_sale', ref'd at the LISTING or WANT that caused it
-- rather than at the copy — the ledger answers "why did I lose 500?", and
-- "listing 41" is that answer where "inventory 8123" is a riddle.
--
-- Both wallets are locked in least/greatest order before either moves, the
-- house shape from tip_points and accept_card_trade: two collectors buying
-- from each other at the same instant must queue, not deadlock.
--
-- Authorization is the app's, same controller ruling as the rest of the
-- betting RPC surface. These functions check ownership of the CARD and the
-- state of the LISTING (they have to — a sale is only valid if the seller
-- still holds what they advertised) but never verify the caller is who they
-- claim. So nothing here is reachable from PostgREST by anon or
-- authenticated (lockdown at the bottom); server actions derive the Discord
-- id from the session and call through the service-role client.
--
-- One thing this migration deliberately does NOT do: notice that a listing
-- has run out of time. There is no sweeper and no cron. `expires_at` is
-- read at buy time (the RPC refuses a stale one) and by the board query,
-- and the 'expired' status exists so the app can retire a lapsed row when
-- the seller next lists something — see createListing in
-- src/lib/market/actions.ts. A status nobody writes is a lie; a status
-- written lazily by the one path that cares is merely quiet.

-- === card_listings ===========================================================
-- One copy, one price, fourteen days.
--
-- inventory_id carries no foreign key, and that is the same call
-- card_trades made: a listing is a snapshot of an intent, not a claim on
-- the card. The copy can be dusted or traded away underneath it, and the
-- listing must survive that as a dead row the board marks stale rather than
-- as a constraint violation on somebody else's unrelated dust.
--
-- buyer_discord and decided_at stay null until a sale lands, so the row is
-- also the receipt: who bought it, for how much, when.

create table if not exists public.card_listings (
  id             bigint generated always as identity primary key,
  season         text not null,
  inventory_id   bigint not null,
  seller_discord text not null references public.betting_profiles(discord_id),
  -- The ceiling mirrors MAX_LISTING_ASK in src/lib/market/config.ts, which
  -- a vitest bridge test reads out of this file — a limit written twice
  -- drifts, so the two are held together by a test rather than by hope.
  ask            bigint not null check (ask between 1 and 100000),
  note           text check (char_length(note) <= 80),
  status         text not null default 'open'
                   check (status in ('open', 'sold', 'cancelled', 'expired')),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '14 days',
  decided_at     timestamptz,
  buyer_discord  text references public.betting_profiles(discord_id)
);

-- The one rule the database owns here: a copy is on the market once or not
-- at all. Two open listings for the same card would let two buyers pay for
-- it, and only one of them could be given the card — the second's money
-- would have to be walked back by hand. A partial index rather than a plain
-- unique one, because a copy that has been sold, cancelled or expired must
-- be listable again.
create unique index if not exists card_listings_one_open_per_copy
  on public.card_listings (inventory_id) where status = 'open';

-- The board reads (season, status) and pages on id; the seller's own shelf
-- reads by seller.
create index if not exists card_listings_board_idx
  on public.card_listings (season, status, id);
create index if not exists card_listings_seller_idx
  on public.card_listings (seller_discord, status);

alter table public.card_listings enable row level security;

grant all on public.card_listings to service_role;

-- === card_wants ==============================================================
-- A bounty on a player, fillable by any copy of them from this season.
--
-- Matched on slug rather than on a card id for the obvious reason — the
-- point of a want is that you do not know which copy will answer it — and
-- season is part of the match because a slug is only unique within one.
--
-- Nothing escrows the bounty either. A want whose poster has since spent
-- their balance simply fails at fill time as 'insufficient balance', which
-- is the same shape every other unfunded promise on this site takes.

create table if not exists public.card_wants (
  id                  bigint generated always as identity primary key,
  season              text not null,
  discord_id          text not null references public.betting_profiles(discord_id),
  slug                text not null,
  bounty              bigint not null check (bounty between 1 and 100000),
  note                text check (char_length(note) <= 80),
  status              text not null default 'open'
                        check (status in ('open', 'filled', 'cancelled')),
  created_at          timestamptz not null default now(),
  decided_at          timestamptz,
  filled_inventory_id bigint,
  filled_by           text references public.betting_profiles(discord_id)
);

create index if not exists card_wants_board_idx
  on public.card_wants (season, status, id);
create index if not exists card_wants_poster_idx
  on public.card_wants (discord_id, status);

alter table public.card_wants enable row level security;

grant all on public.card_wants to service_role;

-- === execute_card_sale =======================================================
-- One copy, one price, two wallets — the atom both boards are built out of.
--
-- Factored out rather than written twice because a listing sale and a want
-- fill differ only in who names the price and which row gets marked
-- afterwards. Everything that could go wrong with money going one way and a
-- card the other is in here, once.
--
-- p_price is untrusted input in the same sense dust_card's p_value is: the
-- callers below read it off a row they just locked, but the range guard
-- means a forged or buggy call can at worst mis-price one card inside a
-- sane band rather than mint a balance.
--
-- Lock order, and it matters: the copy first, then the two wallets in
-- least/greatest order. Both callers take their listing/want row before
-- calling in, so the whole family locks board row → copy → wallets, and two
-- concurrent sales never take the same pair of resources in opposite
-- orders.
--
-- The provenance stamp is set just before the ownership update so the
-- AFTER UPDATE trigger from 20260912000002_card_provenance.sql can record
-- WHICH listing or want moved the card. set_config's third argument is
-- true, i.e. transaction-local: the setting dies with the transaction and
-- cannot leak into the next statement on a pooled connection.
--
-- A copy that is away on an expedition is refused by
-- card_inventory_expedition_guard (20260901000001) under the ownership
-- update — 'card is on expedition' propagates out of here unchanged, and
-- the whole sale rolls back with it. That is the correct outcome and is
-- deliberately not caught: the seller listed a card they cannot deliver.

create or replace function public.execute_card_sale(
  p_inventory bigint,
  p_seller    text,
  p_buyer     text,
  p_price     bigint,
  p_ref_table text,
  p_ref_id    bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   text;
  v_first   text;
  v_second  text;
  v_balance bigint;
begin
  if p_price < 1 or p_price > 100000 then raise exception 'invalid sale price'; end if;
  if p_buyer = p_seller then raise exception 'cannot buy your own listing'; end if;

  -- The copy, held for the rest of the transaction. A missing row and a row
  -- that has changed hands since the listing was written collapse into one
  -- refusal on purpose: both mean "the thing advertised is not there", and
  -- the app says so in one sentence.
  select discord_id into v_owner from card_inventory where id = p_inventory for update;
  if not found then raise exception 'card not owned'; end if;
  if v_owner <> p_seller then raise exception 'card not owned'; end if;

  v_first := least(p_seller, p_buyer);
  v_second := greatest(p_seller, p_buyer);
  perform 1 from betting_profiles where discord_id = v_first for update;
  perform 1 from betting_profiles where discord_id = v_second for update;

  select balance into v_balance from betting_profiles where discord_id = p_buyer;
  if v_balance is null then raise exception 'unknown user %', p_buyer; end if;
  if v_balance < p_price then raise exception 'insufficient balance'; end if;

  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_buyer, -p_price, 'card_sale', p_ref_table, p_ref_id);
  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_seller, p_price, 'card_sale', p_ref_table, p_ref_id);
  update betting_profiles set balance = balance - p_price where discord_id = p_buyer;
  update betting_profiles set balance = balance + p_price where discord_id = p_seller;

  perform set_config('fpl.provenance_ref', p_ref_table || ':' || p_ref_id, true);
  update card_inventory set discord_id = p_buyer where id = p_inventory;
end;
$$;

-- === buy_card_listing ========================================================
-- Take a listing at its asking price.
--
-- The listing row is locked before anything is read off it, which is what
-- serializes two buyers clicking the same card in the same second: the
-- second one waits, then finds status = 'sold' and is refused. Without that
-- lock both would read 'open', both would pay, and only one could be given
-- the card.
--
-- Expiry is checked here rather than trusted from the board: the page that
-- rendered the Buy button may have been sitting open for a week.

create or replace function public.buy_card_listing(p_listing bigint, p_buyer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing card_listings%rowtype;
begin
  select * into v_listing from card_listings where id = p_listing for update;
  if not found then raise exception 'unknown listing %', p_listing; end if;
  if v_listing.status <> 'open' then raise exception 'listing is not open'; end if;
  if v_listing.expires_at <= now() then raise exception 'listing expired'; end if;
  if v_listing.seller_discord = p_buyer then raise exception 'cannot buy your own listing'; end if;

  perform execute_card_sale(
    v_listing.inventory_id,
    v_listing.seller_discord,
    p_buyer,
    v_listing.ask,
    'card_listings',
    p_listing
  );

  update card_listings
     set status = 'sold', buyer_discord = p_buyer, decided_at = now()
   where id = p_listing;
end;
$$;

-- === fill_card_want ==========================================================
-- Answer a bounty with a copy you own.
--
-- The mirror image of a purchase: the poster is the buyer, the filler is
-- the seller, and the price was set by the person paying rather than the
-- person delivering. The extra work over buy_card_listing is the match —
-- the want names a slug and a season, and the copy offered has to be that
-- player, in that season. A want for a Premier copy must not be filled with
-- an Academy one that happens to share a slug.

create or replace function public.fill_card_want(
  p_want      bigint,
  p_seller    text,
  p_inventory bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_want   card_wants%rowtype;
  v_copy   card_inventory%rowtype;
begin
  select * into v_want from card_wants where id = p_want for update;
  if not found then raise exception 'unknown want %', p_want; end if;
  if v_want.status <> 'open' then raise exception 'want is not open'; end if;
  if v_want.discord_id = p_seller then raise exception 'cannot fill your own want'; end if;

  -- Read the copy under the same lock execute_card_sale will hold, so the
  -- slug this is matched against is the slug that gets sold.
  select * into v_copy from card_inventory where id = p_inventory for update;
  if not found then raise exception 'card not owned'; end if;
  if v_copy.discord_id <> p_seller then raise exception 'card not owned'; end if;
  if v_copy.slug <> v_want.slug or v_copy.season <> v_want.season then
    raise exception 'card does not match the want';
  end if;

  perform execute_card_sale(
    p_inventory,
    p_seller,
    v_want.discord_id,
    v_want.bounty,
    'card_wants',
    p_want
  );

  update card_wants
     set status = 'filled', decided_at = now(),
         filled_inventory_id = p_inventory, filled_by = p_seller
   where id = p_want;
end;
$$;

-- === lockdown: service_role only =============================================
-- All three move money and none of them authenticates its caller — same
-- ruling as dust_card and accept_card_trade.

revoke execute on function
  public.execute_card_sale(bigint, text, text, bigint, text, bigint),
  public.buy_card_listing(bigint, text),
  public.fill_card_want(bigint, text, bigint)
from public, anon, authenticated;

grant execute on function
  public.execute_card_sale(bigint, text, text, bigint, text, bigint),
  public.buy_card_listing(bigint, text),
  public.fill_card_want(bigint, text, bigint)
to service_role;
