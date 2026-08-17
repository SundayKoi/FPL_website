begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_table('public','profiles','profiles exists');
select has_table('public','drafts','drafts exists');
select has_table('public','teams','teams exists');
select has_table('public','players','players exists');
select has_table('public','lots','lots exists');
select has_table('public','bids','bids exists');
select has_type('public','lol_role','lol_role enum exists');
select has_function('public','is_admin','is_admin() exists');
select has_function('public','open_roles', array['uuid'], 'open_roles(uuid) exists');
select has_function('public','get_server_time','get_server_time() exists');

-- RLS is on everywhere
select ok((select relrowsecurity from pg_class where oid='public.drafts'::regclass), 'drafts RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.lots'::regclass), 'lots RLS enabled');

-- anon can read drafts (public spectating)
-- drafts_owner_write since 20260823000008: draft setup is owner-tier, while
-- the live draft RPCs stay admin (SECURITY DEFINER, so they bypass this).
select policies_are('public','drafts', array['drafts_public_read','drafts_owner_write'], 'draft policies as designed');

-- realtime publication covers lots
select ok(exists(select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='lots'),
  'lots in realtime publication');

select * from finish();
rollback;
