-- Expedition roads: the road is drawn per run, and the squad's roles each
-- have a call of their own at a fork.
--
-- Almost all of this release lives in the app (src/lib/expeditions):
-- each checkpoint is now one of several places, picked from the run's own
-- seed (ROADS / forksFor in routes.ts), the trail has four more
-- encounters (a cache, a rival squad, a shrine, a relic hunter), forks can
-- turn up a map fragment or a free pack, the careful way can carry a
-- toll, and the journal draws from wider pools in each role's own voice.
-- None of that is stored — the same seed gives the page, the ping and the
-- claim the same road — so the database learns two things only:
--
--   1. decide_expedition_fork learns five more words. A fork's answer used
--      to be one of camp / push / favour / light / rally; the role calls
--      add hold (Top), scout (Jungle), roam (Mid), kite (Bot) and ward
--      (Support). The RPC still only knows the words: whether THIS squad
--      can make THIS call (a Jungle in the squad, unspent this run) is
--      checked by decideForkFor before the write, as favour/light/rally
--      always were. The function body is otherwise exactly 20260914's.
--
--   2. THE RULEBOOK VERSION moves to 3. A squad already in the field
--      resolves under the rules it launched with: every run stamped 1 or 2
--      keeps the fixed forks, the five words and the trail it set out on,
--      and every launch from here on walks a drawn road. The claim reads
--      the number before drawing anything (ROAD_RULES in routes.ts).
--
-- Nothing about the money moves. Every road-side gain lands inside the
-- loot multiplier, which LOOT_MULT_CAP already caps, so resolve_expedition's
-- payout ceiling (16275, 20260928) is untouched; a fragment found on the
-- road counts toward the same 0–3 that function already refuses more than.

create or replace function public.decide_expedition_fork(
  p_user text, p_run bigint, p_index int, p_choice text
) returns table(closes_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run   expedition_runs%rowtype;
  v_open  timestamptz;
  v_close timestamptz;
begin
  if p_choice not in ('camp', 'push', 'favour', 'light', 'rally', 'hold', 'scout', 'roam', 'kite', 'ward') then
    raise exception 'unknown choice';
  end if;

  select * into v_run from expedition_runs r
    where r.id = p_run and r.discord_id = p_user for update;
  if not found then raise exception 'unknown run'; end if;
  if v_run.claimed_at is not null then raise exception 'already claimed'; end if;
  if p_index < 0 or p_index >= v_run.forks then raise exception 'no such fork'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_run.choices) c where (c ->> 'index')::int = p_index
  ) then
    raise exception 'fork already decided';
  end if;

  select w.opens_at, w.closes_at into v_open, v_close
    from expedition_fork_window(v_run.started_at, v_run.resolves_at, v_run.forks, p_index) w;
  if now() < v_open then raise exception 'fork not open'; end if;
  if now() >= v_close then raise exception 'fork closed'; end if;

  update expedition_runs
    set choices = choices || jsonb_build_array(jsonb_build_object('index', p_index, 'choice', p_choice, 'at', now()))
    where id = p_run;

  return query select v_close;
end;
$$;

revoke all on function public.decide_expedition_fork(text, bigint, int, text) from public, anon, authenticated;
grant execute on function public.decide_expedition_fork(text, bigint, int, text) to service_role;

-- Every launch from here on is under the road rules. Rows already in the
-- field keep the number they were stamped with.
alter table public.expedition_runs
  alter column rules set default 3;
