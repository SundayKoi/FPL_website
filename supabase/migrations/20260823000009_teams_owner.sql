-- teams carries draft economics (budget_start, points_remaining) alongside
-- cosmetics (crest, banner colour, abbreviation). Rewriting a budget mid-draft
-- corrupts an auction, so the table becomes owner-write.
--
-- Cosmetics stay admin work through a narrow RPC. Per-column grants cannot
-- express this: owners and admins share the `authenticated` role, so a column
-- revoke would hit both.

drop policy if exists teams_admin_write on public.teams;

create policy teams_owner_write on public.teams
  for all using (public.is_owner()) with check (public.is_owner());

create or replace function public.set_team_identity(
  p_team_id uuid,
  p_image_url text,
  p_banner_color text,
  p_abbreviation text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_team_id is null then
    raise exception 'TEAM_INVALID: team id is required';
  end if;
  if p_abbreviation is not null
     and char_length(trim(p_abbreviation)) not between 1 and 5 then
    raise exception 'ABBREVIATION_INVALID: 1 to 5 characters';
  end if;

  -- banner_color is NOT NULL with a hex check constraint
  -- (20260811000004_team_banner_color.sql), so a null means "leave it alone"
  -- rather than "clear it", and a malformed value is rejected here with a
  -- readable error instead of a raw constraint violation.
  if p_banner_color is not null and p_banner_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'BANNER_COLOR_INVALID: expected #RRGGBB';
  end if;

  update public.teams
  set image_url    = p_image_url,
      banner_color = coalesce(p_banner_color, banner_color),
      abbreviation = coalesce(nullif(trim(p_abbreviation), ''), abbreviation)
  where id = p_team_id;

  if not found then
    raise exception 'TEAM_INVALID: team not found';
  end if;
end $$;

-- image_url is nullable, so it is assigned directly above -- passing null
-- legitimately clears a crest.

revoke all on function public.set_team_identity(uuid, text, text, text) from public;
grant execute on function public.set_team_identity(uuid, text, text, text)
  to authenticated, service_role;
