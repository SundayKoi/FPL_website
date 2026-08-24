begin;
select plan(5);
select has_table('public', 'banger_board_settings', 'Banger Board settings exists');
select col_is_pk('public', 'banger_board_settings', 'id', 'settings use a singleton primary key');
select is((select hero_title from public.banger_board_settings where id = true), 'Stu''s Banger Board', 'hero title is seeded');
select ok((select relrowsecurity from pg_class where relname = 'banger_board_settings'), 'settings use RLS');
select ok((select count(*) from pg_policies where schemaname = 'public' and tablename = 'banger_board_settings' and policyname = 'Admins can edit Banger Board titles') = 1, 'admin update policy exists');
select * from finish();
rollback;
