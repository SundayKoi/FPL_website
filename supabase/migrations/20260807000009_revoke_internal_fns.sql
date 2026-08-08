-- Internal helpers must not be PostgREST-callable; only the SECURITY DEFINER
-- wrappers (close_lot, force_close_lot, admin RPCs) may reach them.
-- SECURITY DEFINER wrapper functions still work after this revoke: they
-- execute as the function owner, who retains privileges regardless of the
-- calling role's own grants.
revoke execute on function
  public._close_lot(uuid, boolean),
  public._advance_turn(public.drafts),
  public._require_admin(),
  public.handle_new_user()
from public, anon, authenticated;
