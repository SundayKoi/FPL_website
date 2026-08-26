-- === grant_patron ============================================================
-- Records one patron payment and extends patron_until, atomically — the
-- same pairing grant_patron.sql's DO block does by hand, packaged so the
-- owner panel (/admin/patrons) can do it in one click. No receipt without
-- a grant, no grant without a receipt.
--
-- Returns the new patron_until. Unknown users fail on the receipt's FK
-- before anything is written.

create or replace function public.grant_patron(
  p_user text,
  p_amount numeric,
  p_days int,
  p_note text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_days < 1 or p_days > 365 then raise exception 'days out of range'; end if;

  insert into patron_payments (discord_id, amount_usd, days_granted, note)
    values (p_user, p_amount, p_days, nullif(trim(p_note), ''));

  -- Extends an active patronage from its current end (paying early never
  -- costs days); starts from now for a lapsed or first-time patron.
  update betting_profiles
     set patron_until = greatest(coalesce(patron_until, now()), now()) + make_interval(days => p_days)
   where discord_id = p_user
   returning patron_until into v_until;
  if v_until is null then raise exception 'unknown user %', p_user; end if;

  return v_until;
end;
$$;

-- Same lockdown as every hand-money RPC: the app authorizes (owner-only
-- server action), PostgREST must not.
revoke all on function public.grant_patron(text, numeric, int, text) from public, anon, authenticated;
grant execute on function public.grant_patron(text, numeric, int, text) to service_role;
