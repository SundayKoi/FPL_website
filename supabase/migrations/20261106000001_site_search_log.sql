-- What people type into site search, so staff can see what they could not
-- find.
--
-- WHY. People said the site was too complicated and that things were hard
-- to find, and nobody could say which things. The search box is where a
-- lost visitor goes; what they type there, and especially what finds
-- nothing, is the list the navigation is failing.
--
-- WHAT IS KEPT. The query (trimmed, lowercased, collapsed, at most 80
-- characters), how many results it found, which league the visitor was in,
-- and when. Never who: no user, no Discord id, no IP. A search box is
-- where people type things they would not put their name to.
--
-- WHO MAY WRITE. Anyone, through log_site_search() only — the table grants
-- nothing and has no policies. The function cleans the input and refuses
-- anything under two characters. A spammed row costs a dashboard line, not
-- data or money.
--
-- WHO MAY READ. service_role only, through site_search_summary(), which
-- the staff analytics page calls with the service client.

create table if not exists public.site_search_log (
  id bigint generated always as identity primary key,
  query text not null check (char_length(query) between 2 and 80),
  results integer not null check (results >= 0),
  league text not null check (league in ('premier', 'academy')),
  searched_at timestamptz not null default now()
);

create index if not exists site_search_log_searched_idx on public.site_search_log (searched_at);

alter table public.site_search_log enable row level security;
revoke all on public.site_search_log from public, anon, authenticated;

create or replace function public.log_site_search(p_query text, p_results int, p_league text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := left(lower(btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g'))), 80);
begin
  if char_length(v_query) < 2 then
    return;
  end if;
  insert into public.site_search_log (query, results, league)
  values (
    v_query,
    greatest(coalesce(p_results, 0), 0),
    case when p_league = 'academy' then 'academy' else 'premier' end
  );
end;
$$;

comment on function public.log_site_search(text, int, text) is
  'Records one site search (query, result count, league) with no identity. See migration 20261106000001.';

revoke all on function public.log_site_search(text, int, text) from public;
grant execute on function public.log_site_search(text, int, text) to anon, authenticated;

create or replace function public.site_search_summary(p_days int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select query, results
    from public.site_search_log
    where searched_at >= now() - make_interval(days => greatest(least(coalesce(p_days, 30), 365), 1))
  )
  select jsonb_build_object(
    'days', greatest(least(coalesce(p_days, 30), 365), 1),
    'total', (select count(*) from recent),
    -- What people look for most.
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('query', query, 'searches', searches, 'found', found) order by searches desc, query)
      from (
        select query, count(*) as searches, bool_or(results > 0) as found
        from recent group by query order by count(*) desc, query limit 25
      ) t
    ), '[]'::jsonb),
    -- What people look for and never find: the navigation's to-do list.
    'unfound', coalesce((
      select jsonb_agg(jsonb_build_object('query', query, 'searches', searches) order by searches desc, query)
      from (
        select query, count(*) as searches
        from recent group by query having bool_and(results = 0)
        order by count(*) desc, query limit 25
      ) t
    ), '[]'::jsonb)
  );
$$;

comment on function public.site_search_summary(int) is
  'Staff read of site searches: the most searched queries and the ones that found nothing. service_role only.';

revoke all on function public.site_search_summary(int) from public, anon, authenticated;
grant execute on function public.site_search_summary(int) to service_role;
