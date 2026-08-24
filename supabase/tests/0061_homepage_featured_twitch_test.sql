begin;

select plan(4);

select has_column(
  'public',
  'homepage_featured_settings',
  'twitch_url',
  'homepage featured settings stores a Twitch URL'
);

select ok(
  (select is_nullable = 'YES'
     from information_schema.columns
    where table_schema = 'public'
      and table_name = 'homepage_featured_settings'
      and column_name = 'twitch_url'),
  'Twitch URL is optional so existing homepage rows retain the fallback channel'
);

select ok(
  exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'homepage_featured_settings'
       and policyname = 'homepage_featured_settings_public_read'
  ),
  'homepage featured settings remain publicly readable'
);

select ok(
  exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'homepage_featured_settings'
       and policyname = 'homepage_featured_settings_owner_or_admin_write'
  ),
  'homepage featured settings remain admin/owner writable'
);

select * from finish();
rollback;
