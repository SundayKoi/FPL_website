begin;
select plan(1);

select like(
  pg_get_functiondef('public.vote_daily_banger(text,uuid,text,text)'::regprocedure),
  '%balance = balance + 200%',
  'daily banger votes award 200 betting dollars'
);

select * from finish();
rollback;
