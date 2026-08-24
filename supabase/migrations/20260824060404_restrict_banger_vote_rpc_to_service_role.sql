-- vote_banger_post accepts an explicit voter id and runs as its owner, so it
-- must remain a trusted-server fallback rather than a public Data API surface.
revoke execute on function public.vote_banger_post(text, uuid, text) from public, anon, authenticated;
grant execute on function public.vote_banger_post(text, uuid, text) to service_role;
