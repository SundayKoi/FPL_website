-- Complimentary packs — the Champion's Tribute.
--
-- Members of the S4 Faceless squad get free Faceless Packs; a comp row
-- says how many remain. Deliberately no FK to betting_profiles: a comp
-- can be granted before its holder has ever logged in (the open flow
-- still requires a real profile to mint into, so nothing dangles).
--
-- Service-role only, like signature_invites: comps are granted by owner
-- scripts and spent inside the server's open flow — PostgREST never
-- touches them. Spending is a compare-and-swap on `remaining` in app
-- code; the check constraint is the backstop that a race can never
-- drive it negative.

create table if not exists public.card_pack_comps (
  discord_id text not null,
  -- Which shelf the comp buys from ('champions' today; a future drop can
  -- reuse the table without DDL).
  kind       text not null default 'champions',
  remaining  int not null check (remaining >= 0),
  granted    int not null check (granted > 0),
  -- Why they hold it — printed nowhere, kept for the audit trail.
  reason     text,
  created_at timestamptz not null default now(),
  primary key (discord_id, kind)
);

alter table public.card_pack_comps enable row level security;
grant all on public.card_pack_comps to service_role;
