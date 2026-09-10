-- Capture the hand-applied production fix: later print metadata migrations
-- must preserve the durable pack opening link on mint, transfer, and retirement.
create or replace function public.record_card_provenance()
returns trigger language plpgsql security definer set search_path = public as $$

declare
  v_ref   text;
  v_table text;
  v_id    bigint;
begin
  if tg_op = 'INSERT' then
    insert into public.card_provenance
      (inventory_id, event, to_discord, ref_table, ref_id, at, season, print, opening_id)
    values (new.id, 'minted', new.discord_id,
            case when new.pack_open_id is not null then 'card_pack_opens' end,
            new.pack_open_id, new.acquired_at, new.season,
            jsonb_build_object(
              'tier', new.tier,
              'foil', coalesce(new.foil, false),
              'foil_type', new.foil_type,
              'signed', coalesce(new.signed, false),
              'alt', coalesce((new.card ->> 'artSkin')::int, 0) > 0,
              'shiny', coalesce((new.card ->> 'shiny')::boolean, false),
              'secret', new.card ? 'secret',
              'stattrak', new.card ? 'stattrak',
              'moment', new.card ? 'moment',
              'team', new.card ? 'team',
              'champ', new.card ? 'champWin',
              'dribb', new.card ? 'dribb',
              'edition_week', new.edition_week),
            new.opening_id);
    return null;
  end if;
  if tg_op = 'DELETE' then
    insert into public.card_provenance (inventory_id, event, from_discord, season, opening_id)
    values (old.id,
            case when nullif(current_setting('fpl.card_fate', true), '') = 'died' then 'died' else 'dusted' end,
            old.discord_id, old.season, old.opening_id);
    return null;
  end if;
  v_ref := nullif(current_setting('fpl.provenance_ref', true), '');
  if v_ref ~ '^[a-z_]+:[0-9]+$' then
    v_table := split_part(v_ref, ':', 1);
    v_id := split_part(v_ref, ':', 2)::bigint;
  end if;
  insert into public.card_provenance
    (inventory_id, event, from_discord, to_discord, ref_table, ref_id, season, opening_id)
  values (new.id, 'transferred', old.discord_id, new.discord_id, v_table, v_id, new.season, new.opening_id);
  return null;
end;

$$;

-- RLS already denies player access; make the intended service-only grant
-- explicit even on projects with permissive default table privileges.
revoke all on table public.card_auto_dust from public, anon, authenticated;
grant all on table public.card_auto_dust to service_role;

-- Showdown mutations trust server-supplied user IDs and must be service-only.
revoke all on table public.showdown_secrets, public.showdown_seated_cards,
  public.showdown_hands, public.showdown_rake from public, anon, authenticated;
grant all on table public.showdown_secrets, public.showdown_seated_cards,
  public.showdown_hands, public.showdown_rake to service_role;
revoke all on function public.showdown_sit(bigint,text,int,bigint,bigint[],boolean),
  public.showdown_stand(bigint,text),
  public.showdown_commit(bigint,bigint,text,int,jsonb,jsonb,jsonb,bigint,jsonb,timestamptz)
  from public, anon, authenticated;
grant execute on function public.showdown_sit(bigint,text,int,bigint,bigint[],boolean),
  public.showdown_stand(bigint,text),
  public.showdown_commit(bigint,bigint,text,int,jsonb,jsonb,jsonb,bigint,jsonb,timestamptz)
  to service_role;
