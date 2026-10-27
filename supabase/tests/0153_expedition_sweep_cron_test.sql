-- The expedition sweep's pg_cron job (20261123000001_expedition_sweep_cron.sql).
-- The route runs on Vercel and isn't reachable from pgTAP; this asserts the
-- job is scheduled, reads its URL and secret from Vault, and sends nothing
-- while they're missing.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

select ok(exists(select 1 from cron.job where jobname = 'expedition-sweep'), 'expedition-sweep cron job is scheduled');
select is((select schedule from cron.job where jobname = 'expedition-sweep'), '*/5 * * * *', 'it runs every five minutes');
select ok((select command from cron.job where jobname = 'expedition-sweep') like '%net.http_get%', 'it calls the sweep over HTTP');
select ok((select command from cron.job where jobname = 'expedition-sweep') like '%expedition_sweep_url%cron_secret%',
          'with the URL and secret from Vault');

-- No secrets in the test database: running the job queues no request.
create temporary table queued_before as select count(*) as n from net.http_request_queue;
do $$ begin execute (select command from cron.job where jobname = 'expedition-sweep'); end $$;
select is((select count(*) from net.http_request_queue), (select n from queued_before),
          'without its Vault secrets the job sends nothing');

select * from finish();
rollback;
