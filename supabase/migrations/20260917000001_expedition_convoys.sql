-- Expeditions: convoys.
--
-- Two collectors send squads on the same route at the same time and share
-- one set of forks. The host launches as normal and gets a code; a partner
-- joins with it before the first checkpoint, and their run is written on
-- the host's clock (same started_at, same resolves_at) so every fork opens
-- and closes for both at once. Each answers their own run's forks; at the
-- claim the app reads both sheets and a fork only pushes when BOTH pushed
-- (src/lib/expeditions/convoy.ts) — silence, or one camper, camps the
-- convoy. Each run still rolls its own loot and its own harm.
--
-- A convoy nobody joins is just a run: the host's expedition is launched
-- either way and walks its forks alone if the code is never used.

create table if not exists public.expedition_convoys (
  id         bigint generated always as identity primary key,
  code       text not null unique,
  season     text not null,
  tier       text not null,
  host_id    text not null references public.betting_profiles(discord_id),
  host_run   bigint not null references public.expedition_runs(id),
  guest_id   text references public.betting_profiles(discord_id),
  guest_run  bigint references public.expedition_runs(id),
  created_at timestamptz not null default now(),
  check ((guest_id is null) = (guest_run is null))
);

alter table public.expedition_convoys enable row level security;

create policy expedition_convoys_member_read on public.expedition_convoys
  for select using (
    host_id in (select p.discord_id from public.profiles p where p.id = auth.uid())
    or guest_id in (select p.discord_id from public.profiles p where p.id = auth.uid())
  );

grant select on public.expedition_convoys to authenticated;
grant all on public.expedition_convoys to service_role;

alter table public.expedition_runs
  add column if not exists convoy bigint references public.expedition_convoys(id);

create index if not exists expedition_runs_convoy_idx on public.expedition_runs (convoy) where convoy is not null;

-- Six characters from an alphabet with no 0/O or 1/I, so a code read out
-- loud in Discord survives the trip.
create or replace function public.expedition_convoy_code()
returns text
language sql
volatile
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

-- === launch_expedition v4: p_convoy ==========================================
-- null launches alone; 'new' launches and opens a convoy; anything else is
-- a code to join. Everything the 12-argument launch checked is unchanged —
-- the tier slot, the daily limit, ownership, the lock, the bench, the
-- one-of-ones, the fee — and joining adds: the convoy exists, has room, is
-- not your own, is the same route, and has not reached its first fork.

create or replace function public.launch_expedition(
  p_user text, p_season text, p_tier text, p_squad bigint[], p_shine int, p_hours int,
  p_forks int, p_insured boolean, p_fee bigint, p_fragments int, p_target bigint, p_policy_week date,
  p_convoy text
) returns table(run_id bigint, resolves_at timestamptz, convoy_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id   bigint;
  v_resolves timestamptz;
  v_convoy   expedition_convoys%rowtype;
  v_host     expedition_runs%rowtype;
  v_code     text;
  v_opens    timestamptz;
begin
  -- Joining is checked BEFORE the launch writes anything, so a refused
  -- join costs nothing: no run, no fee, no daily slot.
  if p_convoy is not null and p_convoy <> 'new' then
    select * into v_convoy from expedition_convoys c where c.code = upper(trim(p_convoy)) for update;
    if not found then raise exception 'no such convoy'; end if;
    if v_convoy.guest_run is not null then raise exception 'convoy is full'; end if;
    if v_convoy.host_id = p_user then raise exception 'cannot join your own convoy'; end if;
    if v_convoy.tier <> p_tier then raise exception 'convoy is another route'; end if;
    select * into v_host from expedition_runs r where r.id = v_convoy.host_run;
    if not found or v_host.claimed_at is not null then raise exception 'convoy has moved on'; end if;
    select w.opens_at into v_opens
      from expedition_fork_window(v_host.started_at, v_host.resolves_at, v_host.forks, 0) w;
    if v_host.forks = 0 or now() >= v_opens then raise exception 'convoy has moved on'; end if;
  end if;

  select l.run_id, l.resolves_at into v_run_id, v_resolves
    from public.launch_expedition(p_user, p_season, p_tier, p_squad, p_shine, p_hours,
                                  p_forks, p_insured, p_fee, p_fragments, p_target, p_policy_week) l;

  if p_convoy = 'new' then
    -- A fresh code, retried on the vanishingly rare collision.
    loop
      v_code := expedition_convoy_code();
      begin
        insert into expedition_convoys (code, season, tier, host_id, host_run)
        values (v_code, p_season, p_tier, p_user, v_run_id)
        returning * into v_convoy;
        exit;
      exception when unique_violation then
        -- draw again
      end;
    end loop;
    update expedition_runs set convoy = v_convoy.id where id = v_run_id;
  elsif p_convoy is not null then
    -- The partner's run rides the host's clock: same start, same end, so
    -- the same fork windows.
    update expedition_runs
      set started_at = v_host.started_at, resolves_at = v_host.resolves_at, convoy = v_convoy.id
      where id = v_run_id;
    update expedition_convoys set guest_id = p_user, guest_run = v_run_id where id = v_convoy.id;
    v_resolves := v_host.resolves_at;
  end if;

  return query select v_run_id, v_resolves, v_convoy.code;
end;
$$;

revoke all on function public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date, text)
  from public, anon, authenticated;
grant execute on function public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date, text)
  to service_role;
