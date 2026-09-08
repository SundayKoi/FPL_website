-- Revisioned match-draft synchronization.
--
-- A single sequence orders game rows and series settings. The trigger advances
-- it for every insert/update, including admin writes, so a snapshot that
-- arrives after a realtime event can never replace newer state. Deletes are
-- delivered with their old row identity and are handled as scoped resets by
-- the client.

create sequence if not exists public.match_draft_revision_seq;

alter table public.match_drafts
  add column if not exists revision bigint not null default nextval('public.match_draft_revision_seq');

alter table public.open_drafts
  add column if not exists revision bigint not null default nextval('public.match_draft_revision_seq');

alter table public.match_draft_settings
  add column if not exists revision bigint not null default nextval('public.match_draft_revision_seq');

-- Revisions are assigned by the trigger below. Dropping the defaults keeps
-- direct authenticated/anonymous inserts from needing sequence privileges.
alter table public.match_drafts alter column revision drop default;
alter table public.open_drafts alter column revision drop default;
alter table public.match_draft_settings alter column revision drop default;

create or replace function public.assign_match_draft_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.revision := nextval('public.match_draft_revision_seq');
  return new;
end
$$;

drop trigger if exists assign_match_draft_revision on public.match_drafts;
create trigger assign_match_draft_revision
before insert or update on public.match_drafts
for each row execute function public.assign_match_draft_revision();

drop trigger if exists assign_open_draft_revision on public.open_drafts;
create trigger assign_open_draft_revision
before insert or update on public.open_drafts
for each row execute function public.assign_match_draft_revision();

drop trigger if exists assign_match_draft_settings_revision on public.match_draft_settings;
create trigger assign_match_draft_settings_revision
before insert or update on public.match_draft_settings
for each row execute function public.assign_match_draft_revision();

-- Realtime can filter DELETE events only when the old row is available.
alter table public.match_drafts replica identity full;
alter table public.open_drafts replica identity full;
alter table public.match_draft_settings replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.match_draft_settings;
exception
  when duplicate_object then null;
end
$$;

-- The client uses a low-RTT request midpoint to estimate server clock offset.
create or replace function public.match_draft_server_time()
returns timestamptz
language sql
volatile
as $$
  select clock_timestamp()
$$;

revoke all on function public.match_draft_server_time() from public;
grant execute on function public.match_draft_server_time() to anon, authenticated;

-- Keep routine resets as versioned updates. That gives every subscriber a
-- scoped authoritative reset event and avoids a delete/recreate gap.
drop function if exists public.reset_match_draft(uuid, int);
create function public.reset_match_draft(
  p_fixture uuid,
  p_game int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY: only admins can reset a fixture draft';
  end if;
  update public.match_drafts
     set status = 'drafting'::public.match_draft_status,
         current_step_index = 0,
         turn_started_at = null,
         turn_deadline_at = null,
         turn_allowance_seconds = null,
         blue_pending_overtime_seconds = 0,
         red_pending_overtime_seconds = 0,
         blue_team_name = null,
         red_team_name = null,
         blue_ready = false,
         red_ready = false,
         change_request = null,
         positions = null,
         winner_team = null,
         actions = '[]'::jsonb
   where fixture_id = p_fixture
     and (p_game is null or game_number = p_game);
end
$$;

revoke all on function public.reset_match_draft(uuid, int) from public, anon;
grant execute on function public.reset_match_draft(uuid, int) to authenticated;

-- Existing public-lobby reset calls used DELETE, which leaves subscribers
-- dependent on a follow-up page load. Preserve rows and publish a reset update.
create or replace function public.reset_open_draft(
  p_token text,
  p_game int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lobby public.open_draft_lobbies;
begin
  v_lobby := public.open_draft_captain_lobby(p_token, coalesce(p_game, 1));
  update public.open_drafts
     set status = 'drafting'::public.match_draft_status,
         current_step_index = 0,
         turn_started_at = null,
         turn_deadline_at = null,
         turn_allowance_seconds = null,
         blue_pending_overtime_seconds = 0,
         red_pending_overtime_seconds = 0,
         blue_team_name = null,
         red_team_name = null,
         blue_ready = false,
         red_ready = false,
         change_request = null,
         positions = null,
         winner_team = null,
         actions = '[]'::jsonb
   where lobby_id = v_lobby.id
     and (p_game is null or game_number = p_game);
end
$$;

grant execute on function public.reset_open_draft(text, int) to anon, authenticated;
