-- The Signature Moment redesign: provenance columns + frozen-copy repair.
--
-- The new print shows WHERE the moment happened — the opponent and the
-- game clock — so card_moments learns both, the detector fills them for
-- new mints, and this migration backfills every moment already minted
-- from the raw_stats rows it was detected in.
--
-- Pulled copies are frozen json and stay frozen — but the redesign reads
-- three fields the old wrapper never wrote (triggerKey for the colorway,
-- opponent, durationMin) plus a copy serial. Backfilling those is a
-- repair of missing facts about the same performance, not a restat:
-- nothing a copy already says changes.

alter table public.card_moments
  add column if not exists opponent text,
  add column if not exists duration_min numeric;

-- ── Backfill card_moments from the games they were detected in ────────
update public.card_moments m
   set opponent = coalesce(m.opponent, sub.opponent),
       duration_min = coalesce(m.duration_min, sub.duration_min)
  from (
    select m2.id,
           (select r.team_name
              from public.raw_stats r
             where r.match_id = m2.match_id
               and r.team_name is not null
               and r.team_name is distinct from m2.team_name
             limit 1) as opponent,
           (select r.game_duration_min
              from public.raw_stats r
             where r.match_id = m2.match_id
               and r.game_duration_min is not null
             limit 1) as duration_min
      from public.card_moments m2
  ) sub
 where m.id = sub.id
   and (m.opponent is null or m.duration_min is null);

-- ── Repair pulled copies' frozen moment json ──────────────────────────
-- copySerial by acquisition order per moment, matching what open.ts now
-- stamps at pull time. The `triggerKey` guard keeps this idempotent and
-- keeps it off copies the new code already stamped.
with copies as (
  select ci.id,
         cm.trigger_key,
         cm.opponent,
         cm.duration_min,
         row_number() over (partition by ci.season, ci.slug order by ci.acquired_at, ci.id) as serial
    from public.card_inventory ci
    join public.card_moments cm
      on ci.slug = 'moment-' || cm.id
     and ci.season = cm.season
   where ci.card ? 'moment'
)
update public.card_inventory ci
   set card = jsonb_set(
         ci.card,
         '{moment}',
         (ci.card -> 'moment')
           || jsonb_build_object('triggerKey', c.trigger_key, 'copySerial', c.serial)
           || case when c.opponent is null then '{}'::jsonb
                   else jsonb_build_object('opponent', c.opponent) end
           || case when c.duration_min is null then '{}'::jsonb
                   else jsonb_build_object('durationMin', c.duration_min) end
       )
  from copies c
 where ci.id = c.id
   and not (ci.card -> 'moment') ? 'triggerKey';
