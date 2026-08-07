create function public._require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: admin access required';
  end if;
end $$;

create function public.start_draft(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_bad text;
  r public.lol_role;
  v_need int; v_have int;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found or v_draft.status <> 'setup' then
    raise exception 'SETUP_INVALID: draft is not in setup';
  end if;

  if (select count(*) from public.teams where draft_id = p_draft_id) < 2 then
    raise exception 'SETUP_INVALID: need at least 2 teams';
  end if;

  select string_agg(t.name, ', ') into v_bad from public.teams t
    where t.draft_id = p_draft_id and t.captain_profile_id is null;
  if v_bad is not null then
    raise exception 'SETUP_INVALID: teams missing captains: %', v_bad;
  end if;

  select string_agg(t.name, ', ') into v_bad from public.teams t
    where t.draft_id = p_draft_id and cardinality(public.open_roles(t.id)) <> 3;
  if v_bad is not null then
    raise exception 'SETUP_INVALID: teams must have exactly 2 pre-filled roles: %', v_bad;
  end if;

  foreach r in array enum_range(null::public.lol_role) loop
    select count(*) into v_need from public.teams t
      where t.draft_id = p_draft_id and r = any(public.open_roles(t.id));
    select count(*) into v_have from public.players p
      where p.draft_id = p_draft_id and p.role = r and p.team_id is null;
    if v_have < v_need then
      raise exception 'SETUP_INVALID: pool has % % players but % teams need one', v_have, r, v_need;
    end if;
  end loop;

  update public.drafts
    set status = 'live',
        current_round = 1,
        current_nominator_team_id = (
          select id from public.teams where draft_id = p_draft_id
          order by nomination_position asc limit 1)
    where id = p_draft_id;
end $$;

create function public.pause_draft(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_draft public.drafts;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found or v_draft.status <> 'live' then
    raise exception 'NOT_LIVE: draft is not live';
  end if;
  update public.drafts set status = 'paused',
    paused_time_remaining = (
      select greatest(closes_at - now(), interval '3 seconds')
      from public.lots where draft_id = p_draft_id and status = 'open')
    where id = p_draft_id;
end $$;

create function public.resume_draft(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_draft public.drafts;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found or v_draft.status <> 'paused' then
    raise exception 'NOT_LIVE: draft is not paused';
  end if;
  update public.lots
    set closes_at = now() + coalesce(v_draft.paused_time_remaining,
                                     make_interval(secs => v_draft.countdown_seconds))
    where draft_id = p_draft_id and status = 'open';
  update public.drafts set status = 'live', paused_time_remaining = null
    where id = p_draft_id;
end $$;

create function public.update_draft_settings(p_draft_id uuid, p_countdown_seconds int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.drafts set countdown_seconds = p_countdown_seconds where id = p_draft_id;
  if not found then raise exception 'SETUP_INVALID: draft not found'; end if;
end $$;
