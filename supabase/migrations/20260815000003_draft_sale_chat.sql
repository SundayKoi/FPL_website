-- Announce completed auction sales in the shared draft chat. The deferred
-- trigger runs after the lot and player updates in _close_lot, so it can
-- include the final team and sale price without changing the close flow.

create function public._announce_draft_sale() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_player public.players;
  v_team public.teams;
begin
  select * into v_player
    from public.players
    where id = new.player_id;

  select * into v_team
    from public.teams
    where id = v_player.team_id;

  if v_player.team_id is not null and v_team.id is not null then
    perform public._draft_system_message(
      new.draft_id,
      '💰 ' || v_player.display_name || ' → ' || v_team.name ||
      ' for ' || new.current_bid || ' points'
    );
  end if;

  return new;
end $$;

revoke execute on function public._announce_draft_sale()
  from public, anon, authenticated;

create constraint trigger lots_announce_draft_sale
  after update of status on public.lots
  deferrable initially deferred
  for each row
  when (old.status is distinct from new.status and new.status = 'sold')
  execute function public._announce_draft_sale();
