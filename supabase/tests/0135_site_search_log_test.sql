-- Site search logging (20261106000001): who may write and read, what the
-- writer keeps, and whether the summary counts right.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ── The doors ────────────────────────────────────────────────────────
select ok(has_function_privilege('anon', 'public.log_site_search(text, int, text)', 'execute'),
  'anyone may log a search — the search box works signed out');
select ok(has_function_privilege('authenticated', 'public.log_site_search(text, int, text)', 'execute'),
  'a signed-in member may log a search');
select ok(not has_table_privilege('anon', 'public.site_search_log', 'select'),
  'anon cannot read the log directly');
select ok(not has_table_privilege('authenticated', 'public.site_search_log', 'insert'),
  'nobody writes the table except through the function');
select ok(not has_function_privilege('anon', 'public.site_search_summary(int)', 'execute'),
  'anon may not read the summary');
select ok(not has_function_privilege('authenticated', 'public.site_search_summary(int)', 'execute'),
  'a member may not read the summary');
select ok(has_function_privilege('service_role', 'public.site_search_summary(int)', 'execute'),
  'service_role may, which is how the staff page reads it');
select hasnt_column('public', 'site_search_log', 'discord_id', 'the log keeps no identity');

-- ── What the writer keeps ────────────────────────────────────────────
create temporary table baseline as select count(*) as n from public.site_search_log;

select public.log_site_search('   Where   Is  The VAULT ', 0, 'academy');
select public.log_site_search('x', 3, 'premier');
select public.log_site_search(null, 3, 'premier');
select public.log_site_search(repeat('a', 200), -5, 'somewhere');

select is((select count(*) from public.site_search_log) - (select n from baseline), 2::bigint,
  'one- and zero-character searches are not kept');
select is((select query from public.site_search_log order by id desc offset 1 limit 1), 'where is the vault',
  'queries are trimmed, collapsed and lowercased');
select is((select league from public.site_search_log order by id desc offset 1 limit 1), 'academy',
  'the league is kept');
select is((select char_length(query) from public.site_search_log order by id desc limit 1), 80,
  'long queries are cut to 80 characters');
select is((select results from public.site_search_log order by id desc limit 1), 0,
  'a negative result count is floored at zero');
select is((select league from public.site_search_log order by id desc limit 1), 'premier',
  'an unknown league is filed as Premier');

-- ── The summary ──────────────────────────────────────────────────────
select public.log_site_search('zzz test standings', 4, 'premier');
select public.log_site_search('zzz test standings', 4, 'premier');
select public.log_site_search('zzz test nothing here', 0, 'premier');

select is(
  (select (t ->> 'searches')::int from jsonb_array_elements(public.site_search_summary(30) -> 'top') t
    where t ->> 'query' = 'zzz test standings'),
  2,
  'the summary counts repeat searches');
select ok(
  exists (select 1 from jsonb_array_elements(public.site_search_summary(30) -> 'unfound') t
    where t ->> 'query' = 'zzz test nothing here')
  and not exists (select 1 from jsonb_array_elements(public.site_search_summary(30) -> 'unfound') t
    where t ->> 'query' = 'zzz test standings'),
  'searches that found nothing are listed apart, and ones that found something are not');

select * from finish();
rollback;
