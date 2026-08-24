-- Keep the vote RPC compatible with the service-role server action.
-- The caller already derives voter_id from Supabase Auth; the foreign key on
-- banger_votes validates that it is a real auth user without querying auth.users.
create or replace function public.vote_banger_post(p_post_id text, p_voter_id uuid, p_vote text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_vote not in ('banger', 'mid', 'stinker') then
    raise exception 'invalid vote';
  end if;
  if not exists (select 1 from public.banger_posts where id = p_post_id) then
    raise exception 'unknown post';
  end if;
  insert into public.banger_votes(post_id, voter_id, vote)
  values (p_post_id, p_voter_id, p_vote)
  on conflict (post_id, voter_id) do update set vote = excluded.vote;
end;
$$;
