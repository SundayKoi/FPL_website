-- Betting integration: discord-announcer pg_cron jobs
-- (20260813000008_betting_announcer_cron.sql). The announcer edge function
-- itself runs under Deno and isn't reachable from pgTAP — this only asserts
-- the two cron jobs that drive it are scheduled correctly (same scope as
-- 0027_betting_lifecycle_test.sql's betting-lifecycle assertions).
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

select ok(exists(select 1 from cron.job where jobname = 'betting-announcer'), 'betting-announcer cron job is scheduled');
select is((select schedule from cron.job where jobname = 'betting-announcer'), '* * * * *', 'betting-announcer runs every minute');

select ok(exists(select 1 from cron.job where jobname = 'betting-watchdog'), 'betting-watchdog cron job is scheduled');
select is((select schedule from cron.job where jobname = 'betting-watchdog'), '0 * * * *', 'betting-watchdog runs hourly');

select * from finish();
rollback;
