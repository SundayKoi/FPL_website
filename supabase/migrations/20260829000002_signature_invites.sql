-- One-time signing links.
--
-- Two of the S4 champions aren't site members, and a champions card only
-- ever comes autographed with REAL ink. An invite is a bearer token the
-- owner mints for one (season, summoner, tag) identity and sends over
-- Discord; the holder opens /sign/<token>, draws on the same pad members
-- use, and the stroke lands in card_art_prefs under that identity — no
-- account, no signup, one shot.
--
-- Service-role only on both tables' paths: the token IS the
-- authorization, checked by the server action, so PostgREST never reads
-- or writes this table directly.

create table if not exists public.signature_invites (
  -- 32 hex chars of CSPRNG — the bearer credential.
  token        text primary key,
  season       text not null,
  summoner_name text not null,
  tag          text not null,
  -- What the signing page greets them as ("king of spades").
  display_name text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz
);

alter table public.signature_invites enable row level security;
grant all on public.signature_invites to service_role;
