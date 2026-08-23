-- Card claims: letting a player prove the card is theirs.
--
-- Cards are keyed by Riot identity (summoner_name + tag), and nothing in the
-- database ties that identity back to a Discord login. The signup form asks
-- for a Discord handle and a Riot ID as free text and doesn't even require an
-- account (20260812000002), so the two sides never meet — which is why until
-- now only admins and roster captains could restyle a card (can_edit_card_art,
-- 20260826000013). The player whose card it actually is had no way in.
--
-- So: the player asks, and a human who already knows the answer says yes. The
-- approvers are exactly the people who can already edit the card — an admin,
-- or the captain of the roster the player sits on — because they are the ones
-- who can tell "that really is our mid laner" from a stranger grabbing a card.
-- No new trust is introduced; an approval only hands out an authority the
-- approver already held.
--
-- A rejection DELETES the row rather than parking it in a 'rejected' state.
-- One claim per card per season keeps the table honest (primary key), and a
-- tombstoned rejection would lock the card out of ever being claimed again by
-- the right person — a captain who mis-clicks, or a player who claims before
-- their roster row lands. Deleting makes the card claimable again, which is
-- also exactly what "withdraw" and "revoke" want to do.

create table public.card_claims (
  season text not null,
  summoner_name text not null,
  tag text not null,
  profile_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','approved')),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  primary key (season, summoner_name, tag)
);

-- The old can_edit_card_art body, lifted verbatim into its own name: site
-- admins, or a captain whose team roster (this season) contains the player's
-- Riot account. It is now the *moderation* predicate — who may rule on a
-- claim — and stays the first half of the editing predicate below.
create or replace function public.can_moderate_card(p_season text, p_summoner text, p_tag text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
    from public.roster_memberships rm
    join public.riot_accounts ra on ra.id = rm.riot_account_id
    join public.league_team_captains ltc
      on ltc.league_team_id = rm.league_team_id
     and ltc.season = rm.season
    where ltc.profile_id = auth.uid()
      and lower(trim(ra.game_name)) = lower(trim(p_summoner))
      and lower(trim(ra.tag_line)) = lower(trim(p_tag))
  )
$$;

grant execute on function public.can_moderate_card(text, text, text) to authenticated;

-- Editing widens to include the card's approved owner. Every card_art_prefs
-- policy already calls this function (20260826000013, plus the motto and
-- signature columns that ride the same table), so an approved claimant picks
-- up skin/motto/signature rights the moment the claim flips — no policy
-- changes anywhere. Matching is case- and whitespace-insensitive on both
-- sides, the same way the captain join above matches riot_accounts.
create or replace function public.can_edit_card_art(p_season text, p_summoner text, p_tag text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_moderate_card(p_season, p_summoner, p_tag) or exists (
    select 1 from public.card_claims c
    where c.season = p_season
      and lower(trim(c.summoner_name)) = lower(trim(p_summoner))
      and lower(trim(c.tag)) = lower(trim(p_tag))
      and c.profile_id = auth.uid()
      and c.status = 'approved'
  )
$$;

grant execute on function public.can_edit_card_art(text, text, text) to authenticated;

alter table public.card_claims enable row level security;

-- Public read: the share page renders the claim state to everyone ("claim
-- pending", "✓ Claimed by …"), and it is the same public information the
-- card itself already is.
create policy card_claims_public_read on public.card_claims
  for select using (true);

-- You may only ever claim a card for yourself, and only as a pending request
-- — self-approval would make the whole flow decorative.
create policy card_claims_insert on public.card_claims
  for insert to authenticated
  with check (profile_id = auth.uid() and status = 'pending' and decided_by is null);

-- Approving is a moderator act (the with check keeps a moderator from moving
-- a claim onto a card they don't moderate).
create policy card_claims_update on public.card_claims
  for update to authenticated
  using (public.can_moderate_card(season, summoner_name, tag))
  with check (public.can_moderate_card(season, summoner_name, tag));

-- Delete covers three doors that all land in the same place: the claimant
-- withdrawing, a moderator rejecting, and a moderator revoking an approval.
create policy card_claims_delete on public.card_claims
  for delete to authenticated
  using (profile_id = auth.uid() or public.can_moderate_card(season, summoner_name, tag));

grant select on public.card_claims to anon, authenticated;
grant insert, update, delete on public.card_claims to authenticated;
grant all on public.card_claims to service_role;
