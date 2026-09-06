-- Provenance remembers what was printed.
--
-- The stats page counts copies HELD, because dust_card deletes the
-- inventory row and a melted copy leaves nothing behind to count. With
-- ~72% of everything ever minted now melted, the "1 in N" figures on that
-- page describe what the league chose to keep, not what packs give out:
-- people melt unsigned commons and keep the ink, so signed reads at 1 in
-- 66 off a 1-in-100 gate.
--
-- The `minted` provenance row already survives the delete (no FK, by
-- design). It now also carries the SEASON and a `print` — the flat facts
-- of the copy at mint: tier, foil and parallel, ink, alternate art, the
-- finishes, and which kind of card it was — so a true pull rate can be
-- read from provenance alone. Written by the same trigger that writes the
-- row, in the same statement as the insert, so nothing can mint without
-- being counted. Rows minted before this migration have no print and are
-- left out of the rates, which therefore start from the deploy.

alter table public.card_provenance
  add column if not exists season text,
  add column if not exists print  jsonb;

-- The one read the print serves: a season's mints, in pages by id.
create index if not exists card_provenance_minted_idx
  on public.card_provenance (season, id)
  where event = 'minted';

create or replace function public.record_card_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref   text;
  v_table text;
  v_id    bigint;
begin
  if tg_op = 'INSERT' then
    insert into public.card_provenance (inventory_id, event, to_discord, ref_table, ref_id, at, season, print)
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
              'edition_week', new.edition_week));
    return null;
  end if;
  if tg_op = 'DELETE' then
    insert into public.card_provenance (inventory_id, event, from_discord, season)
    values (old.id,
            case when nullif(current_setting('fpl.card_fate', true), '') = 'died' then 'died' else 'dusted' end,
            old.discord_id, old.season);
    return null;
  end if;
  v_ref := nullif(current_setting('fpl.provenance_ref', true), '');
  if v_ref ~ '^[a-z_]+:[0-9]+$' then
    v_table := split_part(v_ref, ':', 1);
    v_id := split_part(v_ref, ':', 2)::bigint;
  end if;
  insert into public.card_provenance (inventory_id, event, from_discord, to_discord, ref_table, ref_id, season)
  values (new.id, 'transferred', old.discord_id, new.discord_id, v_table, v_id, new.season);
  return null;
end;
$$;
