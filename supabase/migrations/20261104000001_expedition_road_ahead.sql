-- The road ahead is earned: a squad knows the checkpoints it has reached,
-- the ones its trail, its scout and its edges let it see, and — for one
-- map fragment — the whole road.
-- Spec: docs/superpowers/specs/2026-09-23-expeditions-next-level-design.md §4.
--
-- The fog itself is presentation and lives in the app: the road is derived
-- from the run's seed (src/lib/expeditions/routes.ts), what the squad knows
-- of it is derived from the run and the squad (reveal.ts), and the page — a
-- server component — hands the board only the known places (views.ts). The
-- database keeps the one thing that is genuinely state, because it is paid
-- for: that a collector spent a fragment to see a run's road.
--
--   1. expedition_reveals — one row per run whose road was revealed, keyed
--      by the run, so a road is paid for once. Owner read, like
--      expedition_supplies; written only by the RPC below.
--
--   2. reveal_expedition_road(p_user, p_run) — the spend. Service role
--      only: the app's server action establishes who is calling and passes
--      the Discord id, the way every expedition RPC is called. Under the
--      locks it checks that the run is the caller's and still walking, that
--      there is a road left to see, that nobody has paid for this road yet
--      (a convoy's two squads walk ONE road, so the partner's reveal counts
--      and the convoy's row is the lock that stops both paying), and that
--      the caller holds the fragment; then it takes the fragment and writes
--      the row in the same transaction. Fragments are not dollars: no
--      betting_ledger row, as for every other fragment spent.
--
-- What the RPC refuses, and why each is a refusal rather than a wasted
-- fragment:
--   'unknown run'         not the caller's run (or no such run).
--   'already claimed'     the squad is home and the road is walked.
--   'nothing to reveal'   a hold, or a run with no checkpoints (a rite).
--   'road already known'  a campaign handed the road down (run.road): the
--                         squad set out with the map.
--   'road already walked' the last checkpoint has opened: every place on
--                         the road is already known.
--   'already revealed'    this run's road, or its convoy partner's.
--   'not enough fragments'
-- The app also hides the button when the squad already knows every place
-- ahead (a Wayfarer, Jungle Diff on a short road); that knowledge is the
-- app's derivation, so it is not restated here.
--
-- League isolation: the row is keyed by the run, and a run belongs to one
-- season (one league); a convoy is one route in one season. The fragment
-- comes out of the season-blind pouch the collector already has
-- (expedition_supplies is keyed by discord_id alone, as for the Legendary
-- route's fee and the league goal's reward).
--
-- Deploy safety: the app reads expedition_reveals through a fail-soft
-- query (a missing table hides the reveal button; the fog still applies),
-- and the server action maps a missing function to "nothing was spent", so
-- the code can ship ahead of this migration. It depends on no data.
--
-- Lock order: the convoy row (when there is one), then the run, then the
-- supplies row. The convoy join (launch_expedition, expedition_convoys) takes
-- the convoy first too, and nothing that locks a run then a convoy exists.

-- === 1. the paid reveals =====================================================

create table if not exists public.expedition_reveals (
  run_id      bigint primary key references public.expedition_runs(id),
  discord_id  text not null references public.betting_profiles(discord_id),
  revealed_at timestamptz not null default now()
);

create index if not exists expedition_reveals_discord_id_idx on public.expedition_reveals (discord_id);

alter table public.expedition_reveals enable row level security;

drop policy if exists expedition_reveals_owner_read on public.expedition_reveals;
create policy expedition_reveals_owner_read on public.expedition_reveals
  for select using (
    discord_id in (select p.discord_id from public.profiles p where p.id = auth.uid())
  );

grant select on public.expedition_reveals to authenticated;
grant all on public.expedition_reveals to service_role;

-- === 2. the spend ============================================================

create or replace function public.reveal_expedition_road(p_user text, p_run bigint)
returns table(fragments int)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- REVEAL_FRAGMENTS in src/lib/expeditions/reveal.ts; reveal.test.ts reads
  -- this line and holds the two equal.
  v_cost   constant int := 1;
  v_convoy bigint;
  v_run    expedition_runs%rowtype;
  v_last   timestamptz;
  v_have   int;
begin
  if p_user is null or p_run is null then raise exception 'unknown run'; end if;

  -- The convoy first: two squads on one road share one map, and its row
  -- serialises the two partners' reveals.
  select r.convoy into v_convoy from expedition_runs r where r.id = p_run and r.discord_id = p_user;
  if not found then raise exception 'unknown run'; end if;
  if v_convoy is not null then
    perform 1 from expedition_convoys c where c.id = v_convoy for update;
  end if;

  select * into v_run from expedition_runs r where r.id = p_run and r.discord_id = p_user for update;
  if not found then raise exception 'unknown run'; end if;
  if v_run.claimed_at is not null then raise exception 'already claimed'; end if;
  if v_run.tier = 'lost' or v_run.forks <= 0 then raise exception 'nothing to reveal'; end if;
  if jsonb_typeof(v_run.road) = 'array' and jsonb_array_length(v_run.road) > 0 then
    raise exception 'road already known';
  end if;

  -- The last checkpoint's window, as decide_expedition_fork reads it: once
  -- it has opened, the squad has reached every place on the road.
  select w.opens_at into v_last
    from expedition_fork_window(v_run.started_at, v_run.resolves_at, v_run.forks, v_run.forks - 1) w;
  if now() >= v_last then raise exception 'road already walked'; end if;

  if exists (
    select 1
    from expedition_reveals v
    join expedition_runs r on r.id = v.run_id
    where r.id = v_run.id or (v_run.convoy is not null and r.convoy = v_run.convoy)
  ) then
    raise exception 'already revealed';
  end if;

  select s.fragments into v_have from expedition_supplies s where s.discord_id = p_user for update;
  if coalesce(v_have, 0) < v_cost then raise exception 'not enough fragments'; end if;

  update expedition_supplies s
    set fragments = s.fragments - v_cost, updated_at = now()
    where s.discord_id = p_user;
  insert into expedition_reveals (run_id, discord_id) values (v_run.id, p_user);

  return query select v_have - v_cost;
end;
$$;

revoke all on function public.reveal_expedition_road(text, bigint) from public, anon, authenticated;
grant execute on function public.reveal_expedition_road(text, bigint) to service_role;
