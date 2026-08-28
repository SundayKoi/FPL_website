-- Supabase's existing default privileges may explicitly grant EXECUTE to
-- anon/authenticated, so revoke those roles directly rather than relying on
-- REVOKE FROM PUBLIC alone.
revoke all on function public.ensure_fpldle_daily_puzzle(date, text, text, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.ensure_fpldle_daily_puzzle(date, text, text, date, jsonb)
  to service_role;

revoke all on function public.reset_fpldle_daily_puzzle(date, text)
  from public, anon, authenticated;
grant execute on function public.reset_fpldle_daily_puzzle(date, text)
  to service_role;
