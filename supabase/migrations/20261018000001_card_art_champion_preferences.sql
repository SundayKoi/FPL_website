-- Season Card artwork may follow any champion the player played in this
-- split.  The calculated signature champion stays a statistic; this nullable
-- preference is cosmetic only and is deliberately separate from it.

alter table public.card_art_prefs
  add column if not exists art_champion text;

-- raw_stats stores Riot/Data Dragon aliases (MonkeyKing, MissFortune, ...),
-- while the UI stores the canonical display name.  Keep this small normalizer
-- in the database so the write boundary and the application agree on aliases.
create or replace function public.card_art_champion_key(p_champion text)
returns text
language sql
immutable
set search_path = public
as $$
  case lower(trim(coalesce(p_champion, '')))
    when 'monkeyking' then 'wukong'
    when 'missfortune' then 'missfortune'
    when 'kaisa' then 'kaisa'
    when 'khazix' then 'khazix'
    when 'kogmaw' then 'kogmaw'
    when 'leblanc' then 'leblanc'
    when 'nunu' then 'nunuwillump'
    when 'jarvaniv' then 'jarvaniv'
    when 'reksai' then 'reksai'
    when 'tahmkench' then 'tahmkench'
    when 'twistedfate' then 'twistedfate'
    when 'velkoz' then 'velkoz'
    else regexp_replace(lower(trim(coalesce(p_champion, ''))), '[^a-z0-9]', '', 'g')
  end
$$;

create or replace function public.card_art_champion_display(p_champion text)
returns text
language sql
immutable
set search_path = public
as $$
  case regexp_replace(lower(trim(coalesce(p_champion, ''))), '[^a-z0-9]', '', 'g')
    when 'monkeyking' then 'Wukong'
    when 'chogath' then 'Cho''Gath'
    when 'drmundo' then 'Dr. Mundo'
    when 'jarvaniv' then 'Jarvan IV'
    when 'kaisa' then 'Kai''Sa'
    when 'khazix' then 'Kha''Zix'
    when 'kogmaw' then 'Kog''Maw'
    when 'leblanc' then 'LeBlanc'
    when 'missfortune' then 'Miss Fortune'
    when 'nunu' then 'Nunu & Willump'
    when 'reksai' then 'Rek''Sai'
    when 'tahmkench' then 'Tahm Kench'
    when 'twistedfate' then 'Twisted Fate'
    when 'velkoz' then 'Vel''Koz'
    when 'xinzhao' then 'Xin Zhao'
    when 'belveth' then 'Bel''Veth'
    when 'ksante' then 'K''Sante'
    else nullif(trim(coalesce(p_champion, '')), '')
  end
$$;

-- Reject direct table writes that name a champion the exact player did not
-- play in the same league/season scope.  The RPC below also checks this
-- before writing, but the trigger keeps a client or old script from bypassing
-- the rule by writing card_art_prefs directly.
create or replace function public.validate_card_art_preference()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.art_champion is not null then
    new.art_champion := public.card_art_champion_display(new.art_champion);
  end if;
  if new.art_champion is not null and not exists (
    select 1
    from public.raw_stats rs
    where rs.season = new.season
      and lower(trim(rs.summoner_name)) = lower(trim(new.summoner_name))
      and lower(trim(rs.tag)) = lower(trim(new.tag))
      and public.card_art_champion_key(rs.champion) = public.card_art_champion_key(new.art_champion)
  ) then
    raise exception 'ART_CHAMPION_NOT_PLAYED: the selected champion was not played by this identity in this season';
  end if;
  return new;
end
$$;

revoke all on function public.card_art_champion_key(text) from public, anon;
grant execute on function public.card_art_champion_key(text) to authenticated;
revoke all on function public.card_art_champion_display(text) from public, anon;
grant execute on function public.card_art_champion_display(text) to authenticated;
revoke all on function public.validate_card_art_preference() from public, anon, authenticated;

drop trigger if exists card_art_prefs_validate_champion on public.card_art_prefs;
create trigger card_art_prefs_validate_champion
  before insert or update on public.card_art_prefs
  for each row
  execute function public.validate_card_art_preference();

-- The application validates the selected skin against the current pinned Riot
-- catalog before calling this RPC.  Postgres owns authorization, exact
-- season/identity eligibility, and the atomic champion+skin write.
create or replace function public.save_card_art_preference(
  p_season text,
  p_summoner text,
  p_tag text,
  p_art_champion text,
  p_skin integer
)
returns public.card_art_prefs
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved public.card_art_prefs;
  v_art_champion text;
begin
  if auth.uid() is null or not public.can_edit_card_art(p_season, p_summoner, p_tag) then
    raise exception 'CARD_ART_FORBIDDEN: you may not edit this card';
  end if;

  if p_skin is null or p_skin < 0 or p_skin > 200 then
    raise exception 'SKIN_INVALID: the selected skin number is outside the supported range';
  end if;

  v_art_champion := public.card_art_champion_display(p_art_champion);

  if v_art_champion is not null and not exists (
    select 1
    from public.raw_stats rs
    where rs.season = p_season
      and lower(trim(rs.summoner_name)) = lower(trim(p_summoner))
      and lower(trim(rs.tag)) = lower(trim(p_tag))
      and public.card_art_champion_key(rs.champion) = public.card_art_champion_key(v_art_champion)
  ) then
    raise exception 'ART_CHAMPION_NOT_PLAYED: the selected champion was not played by this identity in this season';
  end if;

  insert into public.card_art_prefs (
    season, summoner_name, tag, art_champion, skin, updated_by, updated_at
  ) values (
    p_season, p_summoner, p_tag, v_art_champion, p_skin, auth.uid(), now()
  )
  on conflict (season, summoner_name, tag) do update
    set art_champion = excluded.art_champion,
        skin = excluded.skin,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
  returning * into saved;

  return saved;
end
$$;

revoke all on function public.save_card_art_preference(text, text, text, text, integer)
  from public, anon;
grant execute on function public.save_card_art_preference(text, text, text, text, integer)
  to authenticated;
