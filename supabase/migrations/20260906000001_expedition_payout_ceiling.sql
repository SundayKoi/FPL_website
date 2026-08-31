-- The payout ceiling the claim guard should always have had.
--
-- claim_expedition guards p_dollars the way open_card_pack guards p_cost:
-- a caller may only write a number the config could actually produce. It
-- shipped as a flat 2,000 — which is the Legend Hunt jackpot's BASE, not
-- its maximum. The app pays base x (1 + shine bonus) x (1 + brief bonus),
-- so a legend jackpot from a squad ONE point over the gate rolled 2,060,
-- tripped the guard, and surfaced as "Something went wrong with that
-- expedition."
--
-- Worse than a dead end: rollOutcome re-rolls on every attempt, so a
-- player who clicked again was paid a lower grade and the run closed.
-- The rarest outcome in the feature was the one outcome that could not
-- be paid, and retrying quietly destroyed it.
--
-- 3,600 is the real ceiling, derived in src/lib/expeditions/config.ts as
-- maxExpeditionPayout(): the best base (2,000) times the shine cap (+50%)
-- times the brief bonus (+20%). A test reads this file and fails if the
-- two ever disagree again, which is the actual lesson — the bug was a
-- TypeScript constant and a SQL literal drifting apart with nothing
-- holding them together.
--
-- Nothing else about the function changes. Runs stuck by the old guard
-- were never written (claimed_at is untouched), so they are still
-- claimable and simply work on the next attempt.

create or replace function public.claim_expedition(
  p_user text, p_run bigint, p_grade text, p_dollars bigint, p_comp boolean, p_mark text, p_bearer bigint
) returns table(balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run     expedition_runs%rowtype;
  v_current text;
  v_rank    int;
  v_new_rank int;
  v_balance bigint;
begin
  if p_grade not in ('poor', 'solid', 'jackpot') then raise exception 'unknown grade'; end if;
  if p_dollars not between 1 and 3600 then raise exception 'payout out of range'; end if;
  if p_mark is not null and p_mark not in ('trail', 'sigil', 'legend') then raise exception 'unknown mark'; end if;

  select * into v_run from expedition_runs r
    where r.id = p_run and r.discord_id = p_user for update;
  if not found then raise exception 'unknown run'; end if;
  if v_run.claimed_at is not null then raise exception 'already claimed'; end if;
  if v_run.resolves_at > now() then raise exception 'expedition still out'; end if;

  if p_mark is not null then
    if p_bearer is null or not (p_bearer = any(v_run.squad)) then
      raise exception 'bearer not in squad';
    end if;
    -- Replace only upward: trail(1) < sigil(2) < legend(3). An equal or
    -- lower roll keeps the copy's existing mark; the dollars still pay.
    select ci.card -> 'expedition' ->> 'mark' into v_current
      from card_inventory ci where ci.id = p_bearer;
    v_rank := case v_current when 'trail' then 1 when 'sigil' then 2 when 'legend' then 3 else 0 end;
    v_new_rank := case p_mark when 'trail' then 1 when 'sigil' then 2 when 'legend' then 3 end;
    if v_new_rank > v_rank then
      update card_inventory
        set card = jsonb_set(card, '{expedition}', jsonb_build_object(
          'mark', p_mark, 'tier', v_run.tier, 'date', to_char(now() at time zone 'utc', 'YYYY-MM-DD')))
        where id = p_bearer;
    end if;
  end if;

  update expedition_runs
    set outcome = jsonb_build_object('grade', p_grade, 'dollars', p_dollars, 'comp', p_comp,
                                     'mark', p_mark, 'bearer', p_bearer),
        claimed_at = now()
    where id = p_run;

  insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
  values (p_user, p_dollars, 'expedition', 'expedition_runs', p_run);
  update betting_profiles set balance = betting_profiles.balance + p_dollars
    where betting_profiles.discord_id = p_user
    returning betting_profiles.balance into v_balance;

  -- The conflict target is named by constraint rather than by column list,
  -- the run_weekly_draw ruling: an inference list is an expression context
  -- where plpgsql substitutes this function's OUT parameters, so naming the
  -- primary key keeps the upsert immune to any future OUT-param rename.
  if p_comp then
    insert into card_pack_comps (discord_id, kind, remaining, granted, reason)
    values (p_user, 'standard', 1, 1, 'expedition run ' || p_run)
    on conflict on constraint card_pack_comps_pkey
    do update set remaining = card_pack_comps.remaining + 1,
                  granted   = card_pack_comps.granted + 1;
  end if;

  return query select v_balance;
end;
$$;

revoke all on function public.claim_expedition(text, bigint, text, bigint, boolean, text, bigint) from public, anon, authenticated;
grant execute on function public.claim_expedition(text, bigint, text, bigint, boolean, text, bigint) to service_role;
