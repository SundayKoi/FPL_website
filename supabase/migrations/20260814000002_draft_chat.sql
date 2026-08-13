-- Draft-night chat: any signed-in viewer (spectators included) can talk on
-- the board; everyone can read. profile_id null = system line (skip notices,
-- auto-assigns). Posting goes through post_draft_chat for the rate limit;
-- direct inserts stay closed to clients.

create table public.draft_chat (
  id          bigint generated always as identity primary key,
  draft_id    uuid not null references public.drafts(id) on delete cascade,
  profile_id  uuid references public.profiles(id),
  body        text not null check (char_length(body) between 1 and 300),
  created_at  timestamptz not null default now()
);
create index on public.draft_chat (draft_id, id);

alter table public.draft_chat enable row level security;

create policy draft_chat_public_read on public.draft_chat for select using (true);
-- admins moderate from the board
create policy draft_chat_admin_delete on public.draft_chat for delete
  using (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin));

grant select on public.draft_chat to anon, authenticated;
grant delete on public.draft_chat to authenticated;
grant all on public.draft_chat to service_role;

alter publication supabase_realtime add table public.draft_chat;

-- Rate-limited posting: one message per 2 seconds per person.
create function public.post_draft_chat(p_draft_id uuid, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_body text := trim(p_body);
  v_id bigint;
begin
  if v_uid is null then raise exception 'SIGN_IN: sign in to chat'; end if;
  if not exists (select 1 from public.drafts where id = p_draft_id) then
    raise exception 'NOT_FOUND: draft not found';
  end if;
  if v_body = '' or char_length(v_body) > 300 then
    raise exception 'BAD_BODY: message must be 1-300 characters';
  end if;
  if exists (
    select 1 from public.draft_chat
    where profile_id = v_uid and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'TOO_FAST: slow down a little';
  end if;
  insert into public.draft_chat (draft_id, profile_id, body)
    values (p_draft_id, v_uid, v_body)
    returning id into v_id;
  return v_id;
end $$;

-- Internal helper for engine notices (skips, auto-assigns) — never client-callable.
create function public._draft_system_message(p_draft_id uuid, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into public.draft_chat (draft_id, profile_id, body)
  values (p_draft_id, null, left(p_body, 300));
$$;

revoke execute on function public._draft_system_message(uuid, text)
  from public, anon, authenticated;
