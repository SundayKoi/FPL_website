begin;
select plan(2);

select ok(
  has_table_privilege('anon', 'public.patrons_public', 'select'),
  'anonymous visitors can read the public patron view'
);

select is(
  (
    select array_agg(attribute.attname::text order by attribute.attnum)
    from pg_attribute as attribute
    where attribute.attrelid = 'public.patrons_public'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
  ),
  array['username', 'avatar_url', 'patron_until', 'patron_flame']::text[],
  'the public patron view exposes only the four display fields'
);

select * from finish();
rollback;
