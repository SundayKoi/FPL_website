begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc

select plan(11);

create temporary table t as select tests.fixture() as d;

-- signed-in member can post
select tests.acting_as(tests.cap(1));
select ok(
  (select public.post_draft_chat((select d from t), '  glhf everyone 🔥  ')) is not null,
  'a signed-in viewer can post');

select is(
  (select body from public.draft_chat order by id desc limit 1),
  'glhf everyone 🔥', 'body is trimmed, emoji intact');

-- rate limit: a second message inside 2s is rejected
select throws_like(
  format($$select public.post_draft_chat('%s', 'again!')$$, (select d from t)),
  '%TOO_FAST%', 'a second message inside 2 seconds is rejected');

-- after the window passes, posting works again
update public.draft_chat set created_at = now() - interval '3 seconds';
select ok(
  (select public.post_draft_chat((select d from t), 'ok now')) is not null,
  'posting works once the rate window passes');

-- another user is not blocked by the first user's rate window
select tests.acting_as(tests.cap(2));
select ok(
  (select public.post_draft_chat((select d from t), 'different captain here')) is not null,
  'the rate limit is per-person');

-- empty and oversized bodies are rejected
select throws_like(
  format($$select public.post_draft_chat('%s', '   ')$$, (select d from t)),
  '%BAD_BODY%', 'whitespace-only body is rejected');
select throws_like(
  format($$select public.post_draft_chat('%s', repeat('x', 301))$$, (select d from t)),
  '%BAD_BODY%', 'a 301-char body is rejected');

-- signed-out posting is rejected
select set_config('request.jwt.claims', null, true);
select throws_like(
  format($$select public.post_draft_chat('%s', 'anon?')$$, (select d from t)),
  '%SIGN_IN%', 'signed-out posting is rejected');

-- system messages carry no profile
select public._draft_system_message((select d from t), 'engine notice');
select ok(
  exists (select 1 from public.draft_chat where profile_id is null and body = 'engine notice'),
  'system messages have a null profile');

-- privileges: the poster RPC is client-callable, the system helper is not
select ok(
  has_function_privilege('authenticated', 'public.post_draft_chat(uuid, text)', 'execute'),
  'authenticated can call post_draft_chat');
select ok(
  not has_function_privilege('authenticated', 'public._draft_system_message(uuid, text)', 'execute'),
  'clients cannot forge system messages');

select * from finish();
rollback;
