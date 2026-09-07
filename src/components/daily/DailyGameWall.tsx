import AccessWall from "@/components/access/AccessWall";

/**
 * The wall a daily game shows instead of bouncing. FPL'dle and Guess the
 * Card used to `redirect("/premium")` on a refusal, throwing away the
 * sentence the server had already written; a visitor was teleported and
 * had to guess why. This says it, and it tells a signed-out visitor to
 * sign in rather than to buy something they may already have.
 */
export default function DailyGameWall({
  league,
  game,
  redirect,
  message,
  testing = false,
}: {
  league: string;
  game: string;
  /** Where to come back to after signing in. */
  redirect: string;
  /** The server's own refusal, when it has one. A message that starts
   *  with "Sign in" is the signed-out case. */
  message?: string | null;
  /** Still in admin testing — say so instead of selling it. */
  testing?: boolean;
}) {
  const signedOut = Boolean(message && /^sign in/i.test(message));
  if (testing && !signedOut) {
    return (
      <AccessWall
        section={`${league} daily · ${game}`}
        reason="no-role"
        redirect={redirect}
        title={`${game} is still in testing`}
        body="Staff are playing it first. It opens to every member the moment it is ready, and it will be announced when it does."
        browse="/premium"
        browseLabel="Back to Premium HQ →"
      />
    );
  }
  return (
    <AccessWall
      section={`${league} daily · ${game}`}
      reason={signedOut ? "signed-out" : "no-role"}
      redirect={redirect}
      title={signedOut ? `Sign in to play ${game}` : undefined}
      body={
        signedOut
          ? `${game} is one of the daily games for FPL Premium members — sign in with Discord to check your access.`
          : `${game} is one of the daily games that come with FPL Premium. One shared reward a day across all of them, reset at midnight Eastern.`
      }
      browse={signedOut ? "/premium" : undefined}
      browseLabel="What FPL Premium is, and how to get it →"
    />
  );
}
