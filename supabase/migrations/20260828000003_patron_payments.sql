-- The patron payment log.
--
-- Patronage money arrives over Venmo and is granted by hand; this table is
-- the receipt book — who paid, how much, when, and how many days it bought —
-- so renewals are a lookup instead of a memory, and "how much has patronage
-- covered of the hosting bill" is one SUM.
--
-- PRIVATE by design: who pays real money is nobody's business but the
-- admins'. RLS is enabled with NO policies — service_role (and the SQL
-- editor) can read and write, PostgREST callers see nothing. The public
-- face of patronage stays patrons_public, which shows status, never money.

create table if not exists public.patron_payments (
  id           bigint generated always as identity primary key,
  discord_id   text not null references public.betting_profiles(discord_id),
  amount_usd   numeric(6, 2) not null check (amount_usd > 0),
  method       text not null default 'venmo',
  -- Handle, memo line, anything that helps match the payment later.
  note         text,
  days_granted int not null default 30 check (days_granted > 0),
  paid_at      timestamptz not null default now()
);

create index if not exists patron_payments_user_idx
  on public.patron_payments (discord_id, paid_at desc);

alter table public.patron_payments enable row level security;
grant all on public.patron_payments to service_role;
