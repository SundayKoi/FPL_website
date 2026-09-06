-- StatTrak counts the player's Fantasy Pts, game by game.
--
-- The counter used to take a Fantasy LINEUP's slot points, which only
-- moved when the copy was fielded. It now counts the pictured player's
-- Fantasy Pts — the stats tab's own tally (src/lib/stats/fantasyPoints.ts)
-- — for every game they play while the copy is held, fielded or not.
--
-- Idempotent by construction: `stattrak.through` is the game_date of the
-- last game counted, and a bump lands only when it carries a later one.
-- The weekly drop can be re-run as often as it likes. A transfer still
-- zeroes the count and restarts `since`, and drops `through` with it, so
-- the new owner's window opens at the hand-off.

drop function if exists public.bump_stattrak(bigint, numeric);

create or replace function public.bump_stattrak(p_id bigint, p_points numeric, p_through timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_points is null or p_through is null then return false; end if;
  update card_inventory
  set card = jsonb_set(
    jsonb_set(card, '{stattrak,points}',
      to_jsonb(round(coalesce((card -> 'stattrak' ->> 'points')::numeric, 0) + p_points, 1)), false),
    '{stattrak,through}', to_jsonb(to_char(p_through at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), true)
  where id = p_id
    and card ? 'stattrak'
    and p_through > coalesce(
      (card -> 'stattrak' ->> 'through')::timestamptz,
      (card -> 'stattrak' ->> 'since')::timestamptz,
      '-infinity'::timestamptz);
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.bump_stattrak(bigint, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.bump_stattrak(bigint, numeric, timestamptz) to service_role;
