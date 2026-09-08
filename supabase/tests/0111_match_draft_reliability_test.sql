-- Match-draft realtime ordering, catch-up, and reset contracts.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_column('public', 'match_drafts', 'revision', 'fixture draft rows carry a revision');
select has_column('public', 'open_drafts', 'revision', 'lobby draft rows carry a revision');
select has_column('public', 'match_draft_settings', 'revision', 'format settings carry a revision');
select ok((select relreplident = 'f' from pg_class where oid = 'public.match_drafts'::regclass),
  'fixture draft deletes include their old row identity');
select ok((select relreplident = 'f' from pg_class where oid = 'public.open_drafts'::regclass),
  'lobby draft deletes include their old row identity');
select ok((select relreplident = 'f' from pg_class where oid = 'public.match_draft_settings'::regclass),
  'format setting changes include their old row identity');
select ok(exists(
  select 1 from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public'
     and tablename = 'match_draft_settings'
), 'format settings are published to realtime subscribers');
select has_function('public', 'match_draft_server_time', array[]::text[], 'server time RPC exists for clock calibration');
select ok(has_function_privilege('anon', 'public.match_draft_server_time()', 'execute'),
  'spectators can calibrate their display clock');
select has_function('public', 'reset_match_draft', array['uuid', 'integer'], 'fixture reset RPC exists');
select has_function('public', 'reset_open_draft', array['text', 'integer'], 'lobby reset RPC exists');
select ok(has_function_privilege('anon', 'public.reset_open_draft(text, integer)', 'execute'),
  'captain links can reset lobby drafts');
select ok((select prosrc ilike '%actions = ''[]''::jsonb%' from pg_proc
             where oid = 'public.reset_open_draft(text,integer)'::regprocedure),
  'lobby reset publishes an authoritative empty draft state');
select ok((select prosrc ilike '%nextval%' from pg_proc
             where oid = 'public.assign_match_draft_revision()'::regprocedure),
  'row changes receive monotonically increasing revisions');

select * from finish();
rollback;
