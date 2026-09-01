-- ---------------------------------------------------------------------------
-- One function for a Riot rename, instead of one hand-written script per name.
--
-- Three renames have gone through this codebase by hand — Imperialarcher to
-- Archêr, YWGI to Icy Rain, and a team swap that touched the same tables —
-- and every one of them missed something different. The first missed nothing
-- visible for a week and then fantasy scored a zero. The second missed the
-- inked signature. Each miss was found by a person noticing something wrong
-- on the site, which is the worst way to find it.
--
-- The list of places a player's identity is written down is the thing that
-- keeps growing, so it belongs in one place that grows with it. When a table
-- with a name, tag or slug in it is added, add it HERE and every future
-- rename picks it up.
--
--     select * from public.rename_player('YWGI', 'Rain', 'Icy Rain', 'YWGI');
--
-- To look before leaping — recommended, always:
--
--     select * from public.preview_player_rename('YWGI', 'Rain', 'Icy Rain', 'YWGI');
--
-- Or wrap the real thing and read its report before deciding:
--
--     begin;
--     select * from public.rename_player('YWGI', 'Rain', 'Icy Rain', 'YWGI');
--     rollback;   -- or commit;
--
-- RENAME OR MERGE, AUTOMATICALLY. If the new identity has no rows, this is a
-- rename. If it already has some — which is what happens when a stats ingest
-- runs between the rename and the fix, filing the player's newest games under
-- the new name while the rest stay under the old — it is a merge, and the two
-- halves are folded together. That situation is not exotic; it happened
-- within days of the last rename.
-- ---------------------------------------------------------------------------

-- === card_slug ==============================================================
-- MUST match cardSlug() in src/lib/cards/build.ts exactly: a card's url, its
-- inventory rows and its archive are all keyed on this, so a slug that
-- disagrees with the application's by one character silently splits a player
-- in two. The pgTAP suite asserts the same case table the TypeScript test
-- uses (supabase/tests/0082_rename_player_test.sql).
--
--   name-tag -> NFKD -> drop combining marks -> lowercase
--            -> every run of non-alphanumerics becomes one hyphen
--            -> trim leading/trailing hyphens
--
-- chr(768)-chr(879) is U+0300-U+036F, the combining diacritical marks block —
-- Postgres regexes have no \u escape, so the class is built from chr().
create or replace function public.card_slug(p_name text, p_tag text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(
    lower(regexp_replace(
      normalize(coalesce(p_name, '') || '-' || coalesce(p_tag, ''), NFKD),
      '[' || chr(768) || '-' || chr(879) || ']', '', 'g'
    )),
    '[^a-z0-9]+', '-', 'g'
  ))
$$;

comment on function public.card_slug(text, text) is
  'Card slug for a name#tag. Mirrors cardSlug() in src/lib/cards/build.ts — keep the two identical.';


-- === preview_player_rename ==================================================
-- Read-only. Counts what sits on each side, so you can tell a plain rename
-- from a merge, and spot the one case that must stop everything: the two
-- identities being two different people.
create or replace function public.preview_player_rename(
  p_old_name text, p_old_tag text,
  p_new_name text, p_new_tag text
) returns table (step text, detail text, rows_affected bigint)
language plpgsql stable as $$
declare
  v_old_slug text := public.card_slug(p_old_name, p_old_tag);
  v_new_slug text := public.card_slug(p_new_name, p_new_tag);
begin
  return query select 'slugs', v_old_slug || ' -> ' || v_new_slug, 0::bigint;

  return query
    select 'raw_stats (old)', p_old_name || '#' || p_old_tag, count(*)
      from public.raw_stats
     where lower(summoner_name) = lower(p_old_name) and lower(tag) = lower(p_old_tag);
  return query
    select 'raw_stats (new)', p_new_name || '#' || p_new_tag, count(*)
      from public.raw_stats
     where lower(summoner_name) = lower(p_new_name) and lower(tag) = lower(p_new_tag);

  -- The stopper. Two identities in one game on DIFFERENT teams are two
  -- people, and folding them would merge two players' careers.
  return query
    select 'SAME GAME, DIFFERENT TEAMS — must be 0', 'two people if not zero', count(*)
      from public.raw_stats a
      join public.raw_stats b on b.match_id = a.match_id
     where lower(a.summoner_name) = lower(p_old_name) and lower(a.tag) = lower(p_old_tag)
       and lower(b.summoner_name) = lower(p_new_name) and lower(b.tag) = lower(p_new_tag)
       and a.team_name is distinct from b.team_name;

  return query
    select 'card_inventory', v_old_slug || ' copies to re-slug', count(*)
      from public.card_inventory where slug = v_old_slug;
  return query
    select 'card_editions', v_old_slug || ' archived weeks', count(*)
      from public.card_editions where slug = v_old_slug;
  return query
    select 'fantasy_lineups', 'lineups fielding ' || v_old_slug, count(*)
      from public.fantasy_lineups where slots::text like '%"' || v_old_slug || '"%';
  return query
    select 'card_claims (old)', 'claims to carry over', count(*)
      from public.card_claims
     where lower(summoner_name) = lower(p_old_name) and lower(tag) = lower(p_old_tag);
  return query
    select 'signature', 'ink under the old identity', count(*)
      from public.card_art_prefs
     where lower(summoner_name) = lower(p_old_name) and lower(tag) = lower(p_old_tag)
       and signature is not null;
end;
$$;


-- === rename_player ==========================================================
create or replace function public.rename_player(
  p_old_name text, p_old_tag text,
  p_new_name text, p_new_tag text
) returns table (step text, detail text, rows_affected bigint)
language plpgsql as $$
declare
  v_old_slug text := public.card_slug(p_old_name, p_old_tag);
  v_new_slug text := public.card_slug(p_new_name, p_new_tag);
  v_display  text := p_new_name || '#' || p_new_tag;
  v_bad      bigint;
  v_n        bigint;
begin
  if coalesce(trim(p_new_name), '') = '' or coalesce(trim(p_new_tag), '') = '' then
    raise exception 'The new name and tag are both required.';
  end if;
  if lower(p_old_name) = lower(p_new_name) and lower(p_old_tag) = lower(p_new_tag) then
    raise exception 'Old and new identity are the same. Nothing to do.';
  end if;
  if v_new_slug = '' then
    raise exception 'The new name and tag produce an empty slug.';
  end if;

  -- ── The one check that stops everything ────────────────────────────
  select count(*) into v_bad
    from public.raw_stats a
    join public.raw_stats b on b.match_id = a.match_id
   where lower(a.summoner_name) = lower(p_old_name) and lower(a.tag) = lower(p_old_tag)
     and lower(b.summoner_name) = lower(p_new_name) and lower(b.tag) = lower(p_new_tag)
     and a.team_name is distinct from b.team_name;
  if v_bad > 0 then
    raise exception
      '% and % appear in % game(s) on DIFFERENT teams. These are two people, not one rename. Nothing changed.',
      p_old_name || '#' || p_old_tag, v_display, v_bad;
  end if;

  -- A claim is a person. Two claims by the same profile are one person
  -- twice; by different profiles, someone else holds the new identity and
  -- deleting either takes a card off a real player.
  select count(*) into v_bad
    from public.card_claims old_c
    join public.card_claims new_c on new_c.season = old_c.season
   where lower(old_c.summoner_name) = lower(p_old_name) and lower(old_c.tag) = lower(p_old_tag)
     and lower(new_c.summoner_name) = lower(p_new_name) and lower(new_c.tag) = lower(p_new_tag)
     and new_c.profile_id is distinct from old_c.profile_id;
  if v_bad > 0 then
    raise exception
      'Both identities are claimed by DIFFERENT profiles in % season(s). Sort the claims out first. Nothing changed.',
      v_bad;
  end if;

  -- ── raw_stats: the source everything else derives from ─────────────
  -- A match recorded under both names is one game ingested twice. Drop the
  -- old copy first, or the rename trips raw_stats_match_summoner_key.
  delete from public.raw_stats a
   where lower(a.summoner_name) = lower(p_old_name) and lower(a.tag) = lower(p_old_tag)
     and exists (select 1 from public.raw_stats b
                  where b.match_id = a.match_id
                    and lower(b.summoner_name) = lower(p_new_name)
                    and lower(b.tag) = lower(p_new_tag));
  get diagnostics v_n = row_count;
  return query select 'raw_stats', 'duplicate games dropped', v_n;

  update public.raw_stats set summoner_name = p_new_name, tag = p_new_tag
   where lower(summoner_name) = lower(p_old_name) and lower(tag) = lower(p_old_tag);
  get diagnostics v_n = row_count;
  return query select 'raw_stats', 'games moved', v_n;

  -- ── Identity ───────────────────────────────────────────────────────
  -- The old riot_accounts row is what roster_memberships point at, so it is
  -- the one that survives; a row created under the new name is a stub and
  -- goes only once proven unreferenced.
  delete from public.riot_accounts ra
   where lower(ra.game_name) = lower(p_new_name) and lower(ra.tag_line) = lower(p_new_tag)
     and exists (select 1 from public.riot_accounts o
                  where lower(o.game_name) = lower(p_old_name) and lower(o.tag_line) = lower(p_old_tag))
     and not exists (select 1 from public.roster_memberships rm where rm.riot_account_id = ra.id);

  update public.riot_accounts
     set game_name = p_new_name, tag_line = p_new_tag,
         display_name = case when display_name is null then null
                             when display_name like '%#%' then v_display
                             else p_new_name end
   where lower(game_name) = lower(p_old_name) and lower(tag_line) = lower(p_old_tag);
  get diagnostics v_n = row_count;
  return query select 'riot_accounts', 'renamed', v_n;

  delete from public.player_pool pp
   where lower(pp.normalized_name) = lower(p_new_name)
     and exists (select 1 from public.player_pool o
                  where lower(o.normalized_name) = lower(p_old_name) and o.season_key = pp.season_key)
     and not exists (select 1 from public.player_identity_links l where l.player_pool_id = pp.id)
     and not exists (select 1 from public.players p where p.canonical_player_id = pp.id);

  update public.player_pool
     set display_name = case when display_name like '%#%' then v_display else p_new_name end,
         normalized_name = lower(p_new_name)
   where lower(normalized_name) = lower(p_old_name);
  get diagnostics v_n = row_count;
  return query select 'player_pool', 'renamed', v_n;

  update public.players
     set display_name = case when display_name like '%#%' then v_display else p_new_name end
   where lower(trim(split_part(display_name, '#', 1))) = lower(p_old_name);
  get diagnostics v_n = row_count;
  return query select 'players', 'draft roster entries renamed', v_n;

  update public.free_agency_avg_bids
     set player_name = p_new_name
   where lower(trim(split_part(player_name, '#', 1))) = lower(p_old_name)
     and not exists (select 1 from public.free_agency_avg_bids b where b.player_name = p_new_name);

  -- ── Card cosmetics ─────────────────────────────────────────────────
  -- BOTH sides can hold real content: skin and motto were set under the old
  -- name, but a signature may have been inked AFTER the rename and exists
  -- only on the new side. Ink is not recoverable, so fold field by field
  -- before collapsing — the new side wins whatever it actually filled
  -- (set later), the old side supplies the rest. skin 0 is "no preference",
  -- so it counts as empty rather than as a choice.
  update public.card_art_prefs o
     set signature = coalesce(n.signature, o.signature),
         motto     = coalesce(n.motto, o.motto),
         skin      = case when n.skin <> 0 then n.skin else o.skin end
    from public.card_art_prefs n
   where lower(o.summoner_name) = lower(p_old_name) and lower(o.tag) = lower(p_old_tag)
     and lower(n.summoner_name) = lower(p_new_name) and lower(n.tag) = lower(p_new_tag)
     and n.season = o.season;

  delete from public.card_art_prefs n
   where lower(n.summoner_name) = lower(p_new_name) and lower(n.tag) = lower(p_new_tag)
     and exists (select 1 from public.card_art_prefs o
                  where lower(o.summoner_name) = lower(p_old_name) and lower(o.tag) = lower(p_old_tag)
                    and o.season = n.season);

  update public.card_art_prefs set summoner_name = p_new_name, tag = p_new_tag
   where lower(summoner_name) = lower(p_old_name) and lower(tag) = lower(p_old_tag);
  get diagnostics v_n = row_count;
  return query select 'card_art_prefs', 'skin/motto/signature carried', v_n;

  delete from public.card_claims n
   where lower(n.summoner_name) = lower(p_new_name) and lower(n.tag) = lower(p_new_tag)
     and exists (select 1 from public.card_claims o
                  where lower(o.summoner_name) = lower(p_old_name) and lower(o.tag) = lower(p_old_tag)
                    and o.season = n.season);

  update public.card_claims set summoner_name = p_new_name, tag = p_new_tag
   where lower(summoner_name) = lower(p_old_name) and lower(tag) = lower(p_old_tag);
  get diagnostics v_n = row_count;
  return query select 'card_claims', 'claims carried (profile_id untouched)', v_n;

  update public.signature_invites
     set summoner_name = p_new_name, tag = p_new_tag,
         display_name = case when display_name like '%#%' then v_display else p_new_name end
   where lower(summoner_name) = lower(p_old_name) and lower(tag) = lower(p_old_tag);

  -- ── Cards ──────────────────────────────────────────────────────────
  -- No unique key on card_inventory.slug, so both sides simply become one.
  -- Nothing is dropped: every copy anyone pulled survives.
  update public.card_inventory
     set slug = v_new_slug, player_name = p_new_name,
         card = jsonb_set(jsonb_set(card, '{name}', to_jsonb(p_new_name)),
                          '{slug}', to_jsonb(v_new_slug))
   where slug = v_old_slug;
  get diagnostics v_n = row_count;
  return query select 'card_inventory', 'owned copies re-slugged', v_n;

  update public.card_inventory
     set card = jsonb_set(jsonb_set(card, '{moment,summonerName}', to_jsonb(p_new_name)),
                          '{moment,playerSlug}', to_jsonb(v_new_slug))
   where card -> 'moment' ->> 'playerSlug' = v_old_slug;

  -- The archive is keyed (season, edition_week, slug), so a week that
  -- archived BOTH halves has two rows no rename can reconcile. Drop the old
  -- one; re-run the edition archive afterwards to rebuild from merged stats.
  delete from public.card_editions o
   where o.slug = v_old_slug
     and exists (select 1 from public.card_editions n
                  where n.slug = v_new_slug and n.season = o.season
                    and n.edition_week = o.edition_week);

  update public.card_editions
     set slug = v_new_slug, player_name = p_new_name,
         card = jsonb_set(jsonb_set(card, '{name}', to_jsonb(p_new_name)),
                          '{slug}', to_jsonb(v_new_slug))
   where slug = v_old_slug;
  get diagnostics v_n = row_count;
  return query select 'card_editions', 'archived prints re-slugged', v_n;

  update public.card_editions
     set card = jsonb_set(jsonb_set(card, '{moment,summonerName}', to_jsonb(p_new_name)),
                          '{moment,playerSlug}', to_jsonb(v_new_slug))
   where card -> 'moment' ->> 'playerSlug' = v_old_slug;

  delete from public.card_snapshots n
   where n.slug = v_new_slug
     and exists (select 1 from public.card_snapshots o
                  where o.slug = v_old_slug and o.season = n.season);
  update public.card_snapshots set slug = v_new_slug where slug = v_old_slug;

  delete from public.card_rating_history n
   where n.slug = v_new_slug
     and exists (select 1 from public.card_rating_history o
                  where o.slug = v_old_slug and o.season = n.season and o.taken_at = n.taken_at);
  update public.card_rating_history set slug = v_new_slug where slug = v_old_slug;

  update public.card_moments
     set slug = v_new_slug, summoner_name = p_new_name, tag = p_new_tag
   where slug = v_old_slug
      or (lower(summoner_name) = lower(p_old_name) and lower(tag) = lower(p_old_tag));

  update public.card_chases
     set criteria = jsonb_set(criteria, '{slug}', to_jsonb(v_new_slug))
   where criteria ->> 'slug' = v_old_slug;

  -- ── Fantasy ────────────────────────────────────────────────────────
  -- A lineup slot is a snapshot taken at submit time and it carries the
  -- SLUG. Scoring resolves through card_inventory now, so a stale slug no
  -- longer costs anyone points — but the stored rows are what a manager
  -- reads back, and leaving a name nobody recognises in them is how the last
  -- rename looked like it had worked when it had not.
  update public.fantasy_lineups l
     set slots = (
       select jsonb_object_agg(e.k,
         case when e.v ->> 'slug' = v_old_slug
              then e.v || jsonb_build_object('slug', v_new_slug, 'playerName', p_new_name)
              else e.v end)
       from jsonb_each(l.slots) as e(k, v))
   where l.slots::text like '%"' || v_old_slug || '"%';
  get diagnostics v_n = row_count;
  return query select 'fantasy_lineups', 'lineups repointed', v_n;

  update public.fantasy_lineups l
     set breakdown = (
       select jsonb_object_agg(e.k,
         case when e.v ->> 'slug' = v_old_slug
              then e.v || jsonb_build_object('slug', v_new_slug, 'playerName', p_new_name)
              else e.v end)
       from jsonb_each(l.breakdown) as e(k, v))
   where l.breakdown is not null
     and l.breakdown::text like '%"' || v_old_slug || '"%';

  -- ── Daily games ────────────────────────────────────────────────────
  -- Display fields only. player_slug is a primary key AND the target of the
  -- puzzles' answer_slug foreign key with no ON UPDATE CASCADE, and every
  -- future puzzle regenerates from the live cards regardless.
  update public.fpldle_daily_candidates
     set player_name = p_new_name, player_tag = p_new_tag
   where lower(player_name) = lower(p_old_name) and lower(player_tag) = lower(p_old_tag);

  update public.box_score_daily_candidates
     set player_name = p_new_name, player_tag = p_new_tag
   where lower(player_name) = lower(p_old_name) and lower(player_tag) = lower(p_old_tag);

  update public.higher_lower_daily_candidates
     set player_name = p_new_name, card = jsonb_set(card, '{name}', to_jsonb(p_new_name))
   where player_slug = v_old_slug and player_name <> p_new_name;

  -- ── Leftovers ──────────────────────────────────────────────────────
  -- Every rename so far was declared done and then found not to be. This
  -- number is the answer to "did it work": anything but zero means a table
  -- above did not take.
  select
      (select count(*) from public.raw_stats
        where lower(summoner_name) = lower(p_old_name) and lower(tag) = lower(p_old_tag))
    + (select count(*) from public.card_inventory where slug = v_old_slug)
    + (select count(*) from public.card_editions where slug = v_old_slug)
    + (select count(*) from public.card_claims
        where lower(summoner_name) = lower(p_old_name) and lower(tag) = lower(p_old_tag))
    + (select count(*) from public.card_art_prefs
        where lower(summoner_name) = lower(p_old_name) and lower(tag) = lower(p_old_tag))
    + (select count(*) from public.fantasy_lineups
        where slots::text like '%"' || v_old_slug || '"%')
    into v_bad;
  return query select 'LEFTOVERS UNDER THE OLD IDENTITY', 'must be 0', v_bad;

  return query select 'REMINDER', 'Re-run the edition archive (Rebuild every week) — packs mint from card_editions', 0::bigint;
end;
$$;

comment on function public.rename_player(text, text, text, text) is
  'Move a player from one Riot name#tag to another everywhere the site records identity. Merges instead of renaming when the new identity already has rows. Refuses when the two are demonstrably different people.';

-- Staff-only: these rewrite identity across the whole site.
revoke all on function public.card_slug(text, text) from public;
revoke all on function public.preview_player_rename(text, text, text, text) from public, anon, authenticated;
revoke all on function public.rename_player(text, text, text, text) from public, anon, authenticated;
grant execute on function public.card_slug(text, text) to anon, authenticated, service_role;
grant execute on function public.preview_player_rename(text, text, text, text) to service_role;
grant execute on function public.rename_player(text, text, text, text) to service_role;
