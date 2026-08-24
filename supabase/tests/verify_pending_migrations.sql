-- Read-only check: are the four hand-applied migrations actually on the
-- remote database? Paste this into the Supabase SQL editor. Every row
-- should read `t`; any `f` names a migration that still needs running.
--
--   f on positions/*                 -> 20260826000009_draft_role_positions.sql
--   f on winner_team, set_open_draft_winner -> 20260826000010_open_draft_winners.sql
--   f on lobby create locked down    -> 20260826000011_open_draft_premium_gate.sql
--   f on card_editions table         -> 20260827000003_card_editions.sql
--
-- Touches nothing: no DDL, no writes.

select 'positions on match_drafts'      as thing,
       to_regclass('public.match_drafts') is not null
         and exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='match_drafts'
                       and column_name='positions') as applied
union all
select 'positions on open_drafts',
       to_regclass('public.open_drafts') is not null
         and exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='open_drafts'
                       and column_name='positions')
union all
select 'winner_team on open_drafts',
       to_regclass('public.open_drafts') is not null
         and exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='open_drafts'
                       and column_name='winner_team')
union all
select 'set_match_draft_positions()',  to_regprocedure('public.set_match_draft_positions(uuid,int,text,jsonb)') is not null
union all
select 'set_open_draft_positions()',   to_regprocedure('public.set_open_draft_positions(text,int,text,jsonb)') is not null
union all
select 'set_open_draft_winner()',      to_regprocedure('public.set_open_draft_winner(text,int,text)') is not null
union all
select 'card_editions table',          to_regclass('public.card_editions') is not null
union all
select 'lobby create locked down',
       case when to_regprocedure('public.create_open_draft_lobby(text,text,int,boolean,jsonb,jsonb)') is null
            then false
            else not has_function_privilege('anon',
                   'public.create_open_draft_lobby(text,text,int,boolean,jsonb,jsonb)', 'execute')
       end
order by 1;
