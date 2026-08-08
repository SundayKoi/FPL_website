-- array_agg(r) had no ORDER BY, so open_roles() returned roles in a
-- nondeterministic order, causing flaky array-equality assertions (e.g. the
-- pgTAP fixture test). Order by r so the result follows enum definition
-- order (top, jungle, mid, adc, support), matching the UI's ROLE_ORDER.
create or replace function public.open_roles(p_team_id uuid) returns public.lol_role[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(r order by r), '{}')
  from unnest(enum_range(null::public.lol_role)) as r
  where not exists (
    select 1 from public.players p where p.team_id = p_team_id and p.role = r
  )
$$;
