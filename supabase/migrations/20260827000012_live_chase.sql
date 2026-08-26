-- Live Drops and the Weekly Chase.
--
-- LIVE DROPS: an admin opens a window (usually broadcast night); packs
-- opened inside it roll foil at a boosted rate and every card in them is
-- stamped LIVE with the window's label — a mark you can only get by being
-- there while the games run. The window lives on league_settings, which is
-- already the single-row, admin-writable, publicly-readable place for
-- league state; a banner can therefore show it to signed-out visitors too.
--
-- WEEKLY CHASE: one print named per week ("this week's chase: any foil
-- Naafiri jungle"). The FIRST pull matching it takes a betting-dollar
-- bounty and a CHASE stamp frozen into the copy. First-ness is decided
-- here, in one atomic UPDATE — two packs opened in the same second must
-- produce exactly one winner, and an app-side check-then-write would
-- produce two.

alter table public.league_settings
  add column if not exists live_until timestamptz,
  add column if not exists live_label text;

create table if not exists public.card_chases (
  id           bigint generated always as identity primary key,
  season       text not null,
  -- The edition week this chase applies to. Only packs bought FOR this
  -- week can win it, which is what makes the chase drive that week's
  -- packs rather than whichever vintage is cheapest to snipe from.
  week         date not null,
  title        text not null,
  -- What has to come out of the pack: any of slug / tier / foil /
  -- foil_type / signed, matched in the app (src/lib/packs/chase.ts).
  -- jsonb rather than columns so a new criterion never needs DDL.
  criteria     jsonb not null default '{}'::jsonb,
  bounty       bigint not null default 0 check (bounty >= 0),
  created_at   timestamptz not null default now(),
  claimed_by   text references public.betting_profiles(discord_id),
  claimed_at   timestamptz,
  claimed_inventory_id bigint references public.card_inventory(id) on delete set null
);

-- The packs page shows the current chase to everyone — a chase nobody can
-- see is not a chase. Writes stay service/admin-side.
alter table public.card_chases enable row level security;
create policy card_chases_public_read on public.card_chases for select using (true);
grant select on public.card_chases to anon, authenticated;
grant all on public.card_chases to service_role;

-- One chase per season+week keeps "this week's chase" a sentence with one
-- referent. Re-running an insert for the same week fails loudly instead of
-- quietly arming two bounties.
create unique index if not exists card_chases_week_uidx on public.card_chases (season, week);

-- === claim_card_chase ========================================================
-- Atomically claim a chase for p_user and pay its bounty. Returns true to
-- exactly ONE caller ever: the WHERE claimed_by IS NULL makes the update
-- the race arbiter, so the app can check criteria optimistically and let
-- this decide who was first. The bounty follows the money invariant —
-- ledger row and balance move together, reason 'chase_bounty' kept out of
-- PROFIT_REASONS like admin_grant so a bounty never reads as gambling
-- profit.

create or replace function public.claim_card_chase(p_chase bigint, p_user text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounty bigint;
begin
  update card_chases
     set claimed_by = p_user, claimed_at = now()
   where id = p_chase and claimed_by is null
   returning bounty into v_bounty;
  if not found then return false; end if;

  if v_bounty > 0 then
    perform 1 from betting_profiles where discord_id = p_user for update;
    insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (p_user, v_bounty, 'chase_bounty', 'card_chases', p_chase);
    update betting_profiles set balance = balance + v_bounty where discord_id = p_user;
  end if;

  return true;
end;
$$;

-- Same lockdown as the pack RPCs: the app authorizes, PostgREST must not.
revoke all on function public.claim_card_chase(bigint, text) from public, anon, authenticated;
grant execute on function public.claim_card_chase(bigint, text) to service_role;
