-- Increase the daily banger check reward from 100 to 200 betting dollars.

create or replace function public.vote_daily_banger(p_post_id text, p_voter_id uuid, p_discord_id text, p_vote text)
returns table(balance bigint, already_voted boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_date date := timezone('utc', now())::date;
  v_inserted boolean;
  v_balance bigint;
begin
  if p_vote not in ('banger', 'mid', 'stinker') then raise exception 'invalid vote'; end if;
  perform 1 from public.betting_profiles where discord_id = p_discord_id for update;
  if not found then raise exception 'unknown betting user'; end if;
  if not exists (select 1 from public.daily_banger_checks where check_date = v_date and post_id = p_post_id) then
    raise exception 'daily check has changed';
  end if;
  insert into public.daily_banger_votes(check_date, post_id, voter_id, discord_id, vote)
  values (v_date, p_post_id, p_voter_id, p_discord_id, p_vote)
  on conflict (check_date, voter_id) do nothing;
  v_inserted := found;
  if v_inserted then
    insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_discord_id, 200, 'daily_banger_vote', 'daily_banger_checks', null);
    update public.betting_profiles set balance = balance + 200 where discord_id = p_discord_id returning balance into v_balance;
  else
    select balance into v_balance from public.betting_profiles where discord_id = p_discord_id;
  end if;
  return query select v_balance, not v_inserted;
end;
$$;

grant execute on function public.vote_daily_banger(text, uuid, text, text) to service_role;
