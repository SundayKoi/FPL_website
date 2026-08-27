-- The Weekly Draw — every card copy is a raffle ticket.
--
-- One draw per (season, week): pick a card_inventory row uniformly at
-- random, stamp the copy's frozen json with the win, freeze a snapshot
-- (post-stamp, so history shows the laurel), pay the pot through the
-- ledger, and grant one standard pack comp. Uniform per copy is the
-- whole game: commons count, whales just hold more tickets — see
-- docs/superpowers/specs/2026-08-27-weekly-draw-design.md.
--
-- copy_id deliberately has NO foreign key: the copy may be melted later
-- and the draw record must outlive it (the jsonb snapshot is the record).

create table public.weekly_draws (
  season     text not null,
  week_start date not null,
  copy_id    bigint not null,
  discord_id text not null,
  card       jsonb not null,
  pot        bigint not null,
  drawn_at   timestamptz not null default now(),
  primary key (season, week_start)
);

alter table public.weekly_draws enable row level security;

-- The history page renders signed-out, same reasoning as fantasy_lineups.
create policy weekly_draws_public_read on public.weekly_draws
  for select using (true);

grant select on public.weekly_draws to anon, authenticated;
grant all on public.weekly_draws to service_role;

-- === run_weekly_draw =========================================================
-- The whole draw in one transaction. Idempotent: a second call for the
-- same (season, week) returns the recorded winner with already = true and
-- changes nothing — the cron can rerun safely (detect-moments pattern).
-- order by random() is fine at league scale (thousands of rows).

create or replace function public.run_weekly_draw(p_season text, p_week date, p_pot bigint)
returns table(copy_id bigint, discord_id text, already boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_copy   record;
  v_card   jsonb;
begin
  if p_pot < 0 then raise exception 'negative pot'; end if;

  -- Idempotency, layer one: the week is already drawn and committed, so
  -- report the winner on record. This is the ordinary rerun (cron retry,
  -- or an owner running the script by hand after it already fired).
  perform 1 from weekly_draws w
    where w.season = p_season and w.week_start = p_week;
  if found then
    return query select w.copy_id, w.discord_id, true
      from weekly_draws w
      where w.season = p_season and w.week_start = p_week;
    return;
  end if;

  select ci.id, ci.discord_id, ci.card into v_copy
    from card_inventory ci
    where ci.season = p_season
    order by random()
    limit 1;
  if v_copy.id is null then
    -- No cards minted in this season yet — nothing to draw. Not an error:
    -- the script runs for every season unconditionally.
    return;
  end if;

  -- Idempotency, layer two: the check above is not a lock, so a genuinely
  -- concurrent caller (a manual run overlapping the cron) can pass it too.
  -- Both then race to insert; the primary key lets exactly one win. The
  -- loser blocks on the unique index until the winner commits, takes a
  -- unique_violation, and is caught here — the sub-block rolls back its
  -- own stamp and it answers with the winner and already = true rather
  -- than surfacing a raw constraint error. The re-read sees the committed
  -- row because each statement takes a fresh snapshot under read
  -- committed; on a stricter isolation level the loser aborts with a
  -- serialization failure instead, which is a safe retry either way.
  begin
    -- Stamp the living copy, then freeze the stamped json as history.
    v_card := jsonb_set(v_copy.card, '{drawWin}', jsonb_build_object('weekStart', to_char(p_week, 'YYYY-MM-DD')));
    update card_inventory set card = v_card where id = v_copy.id;

    insert into weekly_draws (season, week_start, copy_id, discord_id, card, pot)
    values (p_season, p_week, v_copy.id, v_copy.discord_id, v_card, p_pot);
  exception when unique_violation then
    return query select w.copy_id, w.discord_id, true
      from weekly_draws w
      where w.season = p_season and w.week_start = p_week;
    return;
  end;

  -- Pay the pot: ledger row + balance, the vote_daily_banger pattern.
  -- Outside the sub-block above on purpose: only the draw insert may
  -- answer a unique_violation with already, never a payment failure.
  insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
  values (v_copy.discord_id, p_pot, 'weekly_draw', 'weekly_draws', null);
  update betting_profiles set balance = balance + p_pot
    where betting_profiles.discord_id = v_copy.discord_id;

  -- One standard pack comp, on top of the dollars. The conflict target is
  -- named by constraint rather than by column list: an inference list of
  -- (discord_id, kind) collides with this function's discord_id OUT
  -- parameter, which plpgsql rejects as an ambiguous column reference.
  insert into card_pack_comps (discord_id, kind, remaining, granted, reason)
  values (v_copy.discord_id, 'standard', 1, 1, 'weekly_draw ' || p_season || ' ' || p_week)
  on conflict on constraint card_pack_comps_pkey
  do update set remaining = card_pack_comps.remaining + 1,
                granted   = card_pack_comps.granted + 1;

  return query select v_copy.id, v_copy.discord_id, false;
end;
$$;

revoke all on function public.run_weekly_draw(text, date, bigint) from public, anon, authenticated;
grant execute on function public.run_weekly_draw(text, date, bigint) to service_role;
