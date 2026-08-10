begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(12);

select has_column('public', 'teams', 'abbreviation', 'teams has abbreviation column');
select has_column('public', 'teams', 'image_url', 'teams has image_url column');
select tests.fixture();
select ok((select (to_jsonb(t)->>'abbreviation') = 'TA'
           from public.teams t where name = 'Team A'),
          'fixture Team A has abbreviation TA');
select ok((select (to_jsonb(t)->>'abbreviation') = 'TB'
           from public.teams t where name = 'Team B'),
          'fixture Team B has abbreviation TB');
select ok(exists(
  select 1
  from pg_constraint
  where conrelid = 'public.teams'::regclass
    and conname = 'teams_abbreviation_length_check'
), 'teams abbreviation length check exists');

select tests.acting_as(tests.admin_id());
update public.teams set captain_profile_id = null where name = 'Team B';
select lives_ok(
  $$update public.teams
    set abbreviation = 'ALP', name = 'Alpha Team',
        captain_profile_id = tests.cap(2), image_url = 'https://example.test/alpha'
    where name = 'Team A'$$,
  'admin can update team identity fields'
);

select tests.acting_as(tests.cap(1));
set local role authenticated;
set local row_security = off;
select throws_ok(
  $$update public.teams set name = 'Captain Team' where name = 'Team C'$$,
  '42501',
  null,
  'captain cannot update team identity fields'
);
reset role;

select ok((select public from storage.buckets where id = 'team-images'),
          'team-images bucket is public');
select ok((select file_size_limit = 2097152
                  and allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
           from storage.buckets where id = 'team-images'),
          'team-images bucket has required upload limits');
select ok(exists(
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'team_images_public_read'
), 'team-images public read policy exists');
select ok(exists(
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'team_images_admin_insert'
), 'team-images admin insert policy exists');
select ok(exists(
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'team_images_admin_delete'
), 'team-images admin delete policy exists');

select * from finish();
rollback;
