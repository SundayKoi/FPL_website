-- The expedition sweep every five minutes, from the database (see
-- docs/backend.md). Vercel's Hobby plan runs a cron at most once a day and
-- refuses to deploy a project that asks for more, so vercel.json keeps only a
-- daily call as a backstop and pg_cron makes the five-minute one, the same way
-- the betting announcer is driven (20260813000008_betting_announcer_cron.sql).
--
-- The route still checks CRON_SECRET (src/app/api/expeditions/sweep/route.ts).
-- The URL and the secret live in Vault rather than here:
--   expedition_sweep_url  https://<site>/api/expeditions/sweep
--   cron_secret           the same value as CRON_SECRET on Vercel
-- Until both exist the job selects nothing and sends nothing. Guarded so a
-- replay (db reset) never schedules it twice.

create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'expedition-sweep') then
    perform cron.schedule('expedition-sweep', '*/5 * * * *', $cron$
      select net.http_get(
        url := s.url,
        headers := jsonb_build_object('Authorization', 'Bearer ' || s.secret),
        timeout_milliseconds := 30000)
      from (
        select
          (select decrypted_secret from vault.decrypted_secrets where name = 'expedition_sweep_url') as url,
          (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret') as secret
      ) s
      where s.url is not null and s.secret is not null
    $cron$);
  end if;
end;
$$;
