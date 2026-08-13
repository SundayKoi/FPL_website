-- Deleting a draft tripped over six FKs created without delete rules
-- ("update or delete on table teams violates bids_team_id_fkey"). The draft's
-- own children (teams/players/lots) already cascade from drafts, but the
-- cross-references between those children blocked the cascade's ordering.
--
-- Rules chosen:
--   CASCADE  where the child row is meaningless without the parent
--            (bids/lots die with their team/player anyway when a draft goes)
--   SET NULL where the row should outlive the reference (a draft survives
--            losing its current nominator). players.team_id must CASCADE,
--            not SET NULL: the players_check invariant ties team_id and
--            acquisition together, so a team's pre-filled rows go with it
--            (pool rows are untouched — they have no team).

alter table public.bids
  drop constraint bids_team_id_fkey,
  add constraint bids_team_id_fkey
    foreign key (team_id) references public.teams(id) on delete cascade;

alter table public.lots
  drop constraint lots_player_id_fkey,
  add constraint lots_player_id_fkey
    foreign key (player_id) references public.players(id) on delete cascade,
  drop constraint lots_leading_team_id_fkey,
  add constraint lots_leading_team_id_fkey
    foreign key (leading_team_id) references public.teams(id) on delete cascade,
  drop constraint lots_nominated_by_team_id_fkey,
  add constraint lots_nominated_by_team_id_fkey
    foreign key (nominated_by_team_id) references public.teams(id) on delete cascade;

alter table public.players
  drop constraint players_team_id_fkey,
  add constraint players_team_id_fkey
    foreign key (team_id) references public.teams(id) on delete cascade;

alter table public.drafts
  drop constraint drafts_current_nominator_fk,
  add constraint drafts_current_nominator_fk
    foreign key (current_nominator_team_id) references public.teams(id) on delete set null;
