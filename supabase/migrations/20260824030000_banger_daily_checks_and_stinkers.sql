-- Three-way community ratings plus the once-per-UTC-day rewarded check.

alter table public.banger_votes drop constraint if exists banger_votes_vote_check;
alter table public.banger_votes add constraint banger_votes_vote_check check (vote in ('banger', 'mid', 'stinker'));

create table public.daily_banger_checks (
  check_date date primary key,
  post_id text not null references public.banger_posts(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint daily_banger_checks_window check (ends_at > starts_at),
  unique (check_date, post_id)
);

create table public.daily_banger_votes (
  check_date date not null references public.daily_banger_checks(check_date) on delete cascade,
  post_id text not null references public.banger_posts(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  discord_id text not null references public.betting_profiles(discord_id) on delete cascade,
  vote text not null check (vote in ('banger', 'mid', 'stinker')),
  created_at timestamptz not null default now(),
  primary key (check_date, voter_id),
  unique (check_date, discord_id),
  foreign key (check_date, post_id) references public.daily_banger_checks(check_date, post_id)
);

alter table public.daily_banger_checks enable row level security;
alter table public.daily_banger_votes enable row level security;
grant select on public.daily_banger_checks to anon, authenticated;
grant select on public.daily_banger_votes to authenticated;

create policy "Anyone can read daily banger checks"
  on public.daily_banger_checks for select to anon, authenticated using (true);
create policy "Users can read their daily banger votes"
  on public.daily_banger_votes for select to authenticated
  using ((select auth.uid()) = voter_id);

create or replace function public.get_banger_vote_counts()
returns table(post_id text, banger_votes bigint, mid_votes bigint, stinker_votes bigint)
language sql stable security definer set search_path = public
as $$
  select p.id,
    count(v.*) filter (where v.vote = 'banger'),
    count(v.*) filter (where v.vote = 'mid'),
    count(v.*) filter (where v.vote = 'stinker')
  from public.banger_posts p
  left join public.banger_votes v on v.post_id = p.id
  group by p.id;
$$;
grant execute on function public.get_banger_vote_counts() to anon, authenticated;

create or replace function public.get_or_create_daily_banger()
returns table(check_date date, post_id text, body text, published_at timestamptz, x_url text, starts_at timestamptz, ends_at timestamptz,
              banger_votes bigint, mid_votes bigint, stinker_votes bigint)
language plpgsql security definer set search_path = public
as $$
declare
  v_date date := timezone('utc', now())::date;
  v_start timestamptz := v_date::timestamptz;
  v_end timestamptz := (v_date + 1)::timestamptz;
  v_post text;
begin
  perform pg_advisory_xact_lock(hashtext('daily_banger_check'));
  select d.post_id into v_post from public.daily_banger_checks d where d.check_date = v_date;
  if v_post is null then
    select p.id into v_post from public.banger_posts p order by random() limit 1;
    if v_post is not null then
      insert into public.daily_banger_checks(check_date, post_id, starts_at, ends_at)
      values (v_date, v_post, v_start, v_end);
    end if;
  end if;
  return query
    select d.check_date, p.id, p.body, p.published_at, p.x_url, d.starts_at, d.ends_at,
      count(v.*) filter (where v.vote = 'banger'),
      count(v.*) filter (where v.vote = 'mid'),
      count(v.*) filter (where v.vote = 'stinker')
    from public.daily_banger_checks d
    join public.banger_posts p on p.id = d.post_id
    left join public.daily_banger_votes v on v.check_date = d.check_date
    where d.check_date = v_date
    group by d.check_date, p.id, d.starts_at, d.ends_at;
end;
$$;
grant execute on function public.get_or_create_daily_banger() to anon, authenticated;

create or replace function public.vote_banger_post(p_post_id text, p_voter_id uuid, p_vote text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_vote not in ('banger', 'mid', 'stinker') then raise exception 'invalid vote'; end if;
  if not exists (select 1 from auth.users where id = p_voter_id) then raise exception 'unknown voter'; end if;
  insert into public.banger_votes(post_id, voter_id, vote)
  values (p_post_id, p_voter_id, p_vote)
  on conflict (post_id, voter_id) do update set vote = excluded.vote;
end;
$$;
grant execute on function public.vote_banger_post(text, uuid, text) to service_role;

create or replace function public.vote_daily_banger(p_post_id text, p_voter_id uuid, p_discord_id text, p_vote text)
returns table(balance bigint, already_voted boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_date date := timezone('utc', now())::date;
  v_inserted boolean;
  v_balance bigint;
begin
  if p_vote not in ('banger', 'mid', 'stinker') then raise exception 'invalid vote'; end if;
  perform 1 from public.betting_profiles where discord_id = p_discord_id for update;
  if not found then raise exception 'unknown betting user'; end if;
  if not exists (select 1 from public.daily_banger_checks where check_date = v_date and post_id = p_post_id) then
    raise exception 'daily check has changed';
  end if;
  insert into public.daily_banger_votes(check_date, post_id, voter_id, discord_id, vote)
  values (v_date, p_post_id, p_voter_id, p_discord_id, p_vote)
  on conflict (check_date, voter_id) do nothing;
  v_inserted := found;
  if v_inserted then
    insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_discord_id, 100, 'daily_banger_vote', 'daily_banger_checks', null);
    update public.betting_profiles set balance = balance + 100 where discord_id = p_discord_id returning balance into v_balance;
  else
    select balance into v_balance from public.betting_profiles where discord_id = p_discord_id;
  end if;
  return query select v_balance, not v_inserted;
end;
$$;
grant execute on function public.vote_daily_banger(text, uuid, text, text) to service_role;
