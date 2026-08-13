-- Betting integration: admin_grant RPC — the one gap left by Task 9's
-- ruling that grantPoints() must not improvise a direct balance write.
-- Ported from c:\fpl_gambling\db\migrations\004_admin_rpcs.sql's
-- `admin_grant(p_actor text, p_target text, p_amount bigint, p_note text)`
-- with the usual renames: users -> betting_profiles, ledger ->
-- betting_ledger. Reuses `public._audit` from
-- 20260813000003_betting_market_rpcs.sql (no need to redefine). The ledger
-- reason stays 'admin_grant' verbatim from the source — deliberately not in
-- src/lib/betting/queries.ts's PROFIT_REASONS list (an admin correction
-- isn't gambling profit).
--
-- Controller ruling (same as every other betting RPC): service_role-only —
-- see the lockdown block at the end. Authorization lives in the app layer
-- (admin-actions.ts's requireBettingStaff() gate), not in this function.

create or replace function public.admin_grant(
  p_actor text, p_target text, p_amount bigint, p_note text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_balance bigint;
begin
  if p_amount = 0 then raise exception 'amount must be non-zero'; end if;
  if abs(p_amount) > 1000000000000 then raise exception 'amount too large'; end if;
  select balance into v_balance from betting_profiles where discord_id = p_target for update;
  if not found then raise exception 'unknown user %', p_target; end if;
  if v_balance + p_amount < 0 then raise exception 'grant would make balance negative'; end if;
  insert into betting_ledger(discord_id, delta, reason) values (p_target, p_amount, 'admin_grant');
  update betting_profiles set balance = balance + p_amount where discord_id = p_target;
  perform public._audit(p_actor, 'admin_grant', 'betting_profiles:' || p_target,
                 jsonb_build_object('balance', v_balance),
                 jsonb_build_object('balance', v_balance + p_amount, 'amount', p_amount, 'note', p_note));
  return v_balance + p_amount;
end;
$$;

revoke execute on function public.admin_grant(text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.admin_grant(text, text, bigint, text) to service_role;
