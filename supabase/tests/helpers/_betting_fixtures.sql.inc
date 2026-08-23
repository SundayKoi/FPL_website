-- Shared transactional factories for the betting pgTAP suites. Each test
-- includes these inside its begin/rollback transaction, so the helper
-- functions and all rows they create disappear after that test file.

create or replace function test_profile(p_balance bigint default 0) returns text
language plpgsql as $$
declare v_id text := 'u_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20);
begin
  insert into betting_profiles(discord_id, username, balance) values (v_id, v_id, p_balance);
  if p_balance <> 0 then
    insert into betting_ledger(discord_id, delta, reason) values (v_id, p_balance, 'seed');
  end if;
  return v_id;
end;
$$;

create or replace function test_market(
  p_event bigint, p_team_a bigint, p_team_b bigint,
  p_rake_bps int default 0, p_lock_offset interval default interval '1 hour',
  p_status text default 'OPEN', p_draw_enabled boolean default false
) returns bigint
language sql as $$
  insert into betting_markets(event_id, team_a_id, team_b_id, status, game_at, lock_at, rake_bps, draw_enabled)
  values (p_event, p_team_a, p_team_b, p_status,
          now() + p_lock_offset + interval '5 minutes', now() + p_lock_offset,
          p_rake_bps, p_draw_enabled)
  returning id;
$$;

-- Creates an event night with n open markets and two unique teams per market.
create or replace function test_night(p_n int default 3) returns bigint
language plpgsql as $$
declare
  v_event bigint;
  v_a bigint;
  v_b bigint;
begin
  insert into betting_events(name) values ('Fixture Night') returning id into v_event;
  for i in 1..p_n loop
    insert into betting_teams(name, short_code) values ('T' || (2*i-1), 'A' || i) returning id into v_a;
    insert into betting_teams(name, short_code) values ('T' || (2*i), 'B' || i) returning id into v_b;
    perform test_market(v_event, v_a, v_b);
  end loop;
  return v_event;
end;
$$;
