/**
 * A bare `42501` ("new row violates row-level security policy…") is
 * meaningless to a captain — it almost always means their profile isn't (or
 * isn't yet) a season-scoped captain in `league_team_captains`, which is a
 * fixable, nameable admin action rather than a generic failure. Any other
 * error still shows its real message (e.g. a duplicate match id's unique-
 * index violation), unchanged.
 */
export function friendlyErrorMessage(err: unknown, fallback: string): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === "42501") {
    return "Your account isn't set up as a captain for this season yet — ask an admin to run the captain sync.";
  }
  return err instanceof Error ? err.message : fallback;
}
