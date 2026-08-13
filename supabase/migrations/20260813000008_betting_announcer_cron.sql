-- Betting integration: pg_cron jobs that drive the discord-announcer edge
-- function (supabase/functions/discord-announcer/index.ts) — the
-- Discord-posting half of the gateway bot's lifecycle/ledger-watchdog loops
-- (c:\fpl_gambling\bot\main.py's `lifecycle`/`ledger_watchdog` task loops).
-- The pure-SQL half already runs every minute as its own job
-- (betting-lifecycle, 20260813000005_betting_lifecycle_cron.sql); this
-- migration adds the two HTTP-posting jobs:
--   betting-announcer — every minute, drains the announcement queues
--   betting-watchdog  — hourly, posts the ledger-drift alert if any exists
--
-- Controller ruling: this file is 20260813000008 (not ...000007 — that
-- filename was already taken by 20260813000007_betting_admin_grant.sql).
--
-- The function URL + shared secret live in Vault (`vault.decrypted_secrets`,
-- names 'announcer_url'/'announcer_secret') rather than being hardcoded here,
-- so a deploy only has to seed two secrets — no migration edit needed to
-- point at a given project's function URL or to rotate the secret. Both jobs
-- are guarded the same idempotent way as Task 5's betting-lifecycle job:
-- re-running this migration (e.g. via `db reset`) must not error or
-- double-schedule.

create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'betting-announcer') then
    perform cron.schedule('betting-announcer', '* * * * *', $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'announcer_url'),
        headers := jsonb_build_object('x-announcer-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'announcer_secret')),
        body := '{"job":"announce"}'::jsonb)
    $cron$);
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'betting-watchdog') then
    perform cron.schedule('betting-watchdog', '0 * * * *', $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'announcer_url'),
        headers := jsonb_build_object('x-announcer-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'announcer_secret')),
        body := '{"job":"watchdog"}'::jsonb)
    $cron$);
  end if;
end;
$$;
