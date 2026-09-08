-- Backfill approved Academy card claims into the canonical roster identity
-- table. The Academy pool was added after the original card-claim backfill
-- ran, so those approved card spots were left card-only.
--
-- This is deliberately narrower than the general historical sync helper:
-- current Academy card claims are matched to one active canonical roster row
-- by the approved claim's game name, with the one verified Doki -> dokiftw
-- roster alias. Unknown, ambiguous, and conflicting identities remain
-- untouched for explicit administrator review.

create or replace function public.sync_approved_academy_card_claim_identities()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  inserted_count integer := 0;
begin
  for candidate in
    select
      cc.season,
      cc.summoner_name,
      cc.tag,
      cc.profile_id,
      cc.created_at,
      cc.decided_by,
      cc.decided_at,
      (array_agg(distinct p.canonical_player_id))[1] as player_pool_id,
      (array_agg(distinct lt.id))[1] as league_team_id
    from public.card_claims cc
    join public.league_settings settings on settings.id = 1
    join public.players p
      on p.draft_id = settings.academy_draft_id
     and p.team_id is not null
     and p.canonical_player_id is not null
    join public.player_pool pp on pp.id = p.canonical_player_id
    join public.teams t
      on t.id = p.team_id
     and t.draft_id = p.draft_id
    join public.league_teams lt
      on lower(trim(lt.name)) = lower(trim(t.name))
     and lt.active
    where cc.status = 'approved'
      and cc.season = settings.academy_season
      and cc.decided_by is not null
      and cc.decided_at is not null
      and (
        pp.normalized_name = lower(regexp_replace(trim(cc.summoner_name), '[[:space:]]+', ' ', 'g'))
        or (
          lower(trim(cc.summoner_name)) = 'doki'
          and lower(trim(cc.tag)) = '0001'
          and pp.normalized_name = 'dokiftw'
        )
      )
      and (
        cc.player_pool_id is null
        or cc.player_pool_id = p.canonical_player_id
      )
    group by
      cc.season,
      cc.summoner_name,
      cc.tag,
      cc.profile_id,
      cc.player_pool_id,
      cc.created_at,
      cc.decided_by,
      cc.decided_at
    having count(distinct row(p.canonical_player_id, lt.id)) = 1
  loop
    -- Never overwrite either side of a canonical identity. A conflict needs
    -- an explicit administrator decision, not a migration guess.
    if exists (
      select 1
      from public.player_identity_links pil
      where pil.league = 'academy'
        and pil.season = candidate.season
        and (
          pil.player_pool_id = candidate.player_pool_id
          or pil.profile_id = candidate.profile_id
        )
    ) then
      continue;
    end if;

    update public.card_claims
    set player_pool_id = candidate.player_pool_id
    where season = candidate.season
      and summoner_name = candidate.summoner_name
      and tag = candidate.tag
      and player_pool_id is distinct from candidate.player_pool_id;

    insert into public.player_identity_links (
      player_pool_id,
      profile_id,
      league_team_id,
      league,
      season,
      status,
      source,
      requested_by,
      requested_at,
      decided_by,
      decided_at
    ) values (
      candidate.player_pool_id,
      candidate.profile_id,
      candidate.league_team_id,
      'academy',
      candidate.season,
      'approved',
      'card',
      candidate.profile_id,
      candidate.created_at,
      candidate.decided_by,
      candidate.decided_at
    );

    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end
$$;

revoke all on function public.sync_approved_academy_card_claim_identities()
  from public, anon, authenticated;
grant execute on function public.sync_approved_academy_card_claim_identities()
  to service_role;

-- Run once at deployment so the already-approved Academy card spots gain
-- their roster identities immediately. The helper is idempotent for retries.
select public.sync_approved_academy_card_claim_identities();
