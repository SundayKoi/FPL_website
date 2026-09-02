import Link from "next/link";

/**
 * Branded "captains only" card shown to anyone who is signed out, or signed
 * in but neither a captain this season nor an admin. Always a 200, never a
 * 404 or redirect — see docs/superpowers/specs/2026-08-11-captains-page-
 * design.md ("Access model"): this doubles as discoverability for new
 * captains, since the nav shows "Captain" to every visitor.
 */
export default function CaptainGate({ signedIn }: { signedIn: boolean }) {
  return (
    <main className="page-backdrop flex flex-1 items-center justify-center px-4 py-16">
      <div className="card-brand flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <span className="label-dash">Captains only</span>
        <h1 className="type-display text-3xl sm:text-4xl">Locked to team captains</h1>
        <p className="text-sm leading-6 text-muted">
          {signedIn
            ? "Your account isn't on record as a captain this season. If that's wrong, ask your admin to add you."
            : "Next match info, tourney codes, and result reporting live here for team captains and admins. Sign in with the account your captain uses to see your team's page."}
        </p>
        <Link href="/login" className="btn-pill mt-2">
          {signedIn ? "Switch account" : "Sign in"}
        </Link>
        <Link href="/" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-white">
          Back home
        </Link>
      </div>
    </main>
  );
}
