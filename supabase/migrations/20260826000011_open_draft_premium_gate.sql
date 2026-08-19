-- Lobby creation moves behind the site's premium Discord gate. Postgres
-- can't ask Discord about roles, so the create RPC is locked to
-- service_role and the Next.js server action (which checks the premium
-- guild + role via the bot token before calling it) becomes the only path.
-- Everything token-scoped — drafting, ready checks, skips, change requests,
-- role confirmation, winners, resets — stays open to link holders.

revoke execute on function public.create_open_draft_lobby(text, text, int, boolean, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_open_draft_lobby(text, text, int, boolean, jsonb, jsonb)
  to service_role;
