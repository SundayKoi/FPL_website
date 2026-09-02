import type { Metadata } from "next";
import Link from "next/link";
import CreateLobbyForm from "@/components/match-draft/CreateLobbyForm";
import { drafterAccess } from "@/lib/match-draft/access";

export const metadata: Metadata = {
  title: "Drafter — FPL",
  description: "Create a pick/ban lobby and draft with secret team links.",
};

export default async function DrafterLandingPage() {
  // Creating lobbies is a premium-member perk (the server action re-checks);
  // the lobby links themselves stay open to whoever holds them.
  const access = await drafterAccess();
  if (!access.signedIn) {
    return (
      <main className="page-backdrop flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Drafter</span>
        <h1 className="type-display text-3xl sm:text-4xl">Sign in to create draft lobbies</h1>
        <p className="max-w-md text-sm text-muted">
          The drafter is a perk for premium Discord members — sign in with Discord to check your access.
          Draft links you&apos;ve been sent still work without signing in.
        </p>
        <Link href="/login?redirect=/drafter" className="btn-pill mt-2">
          Sign in with Discord
        </Link>
      </main>
    );
  }
  if (!access.allowed) {
    return (
      <main className="page-backdrop flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Drafter</span>
        <h1 className="type-display text-3xl sm:text-4xl">Premium members only</h1>
        <p className="max-w-md text-sm text-muted">
          Creating draft lobbies is a perk for premium Discord members. Grab the premium role in the
          Discord and come back — draft links you&apos;ve been sent still work without it.
        </p>
      </main>
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 page-backdrop px-4 py-10 text-white">
      <header>
        <span className="label-dash">Pick / ban tool</span>
        <h1 className="type-display mt-2 text-4xl text-white">Drafter</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Run a full LCS-style pick/ban phase for any custom game. Create a lobby, send each captain
          their secret link, and share the spectator link with everyone else — ready checks, a 30
          second pick clock with skips, change requests, fearless mode, and live sync included.
          Whoever you send the links to needs no account at all.
        </p>
      </header>
      <CreateLobbyForm />
      <section className="card-brand p-5 text-sm text-muted" aria-label="How it works">
        <h2 className="type-display text-lg text-white">How it works</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Name the two teams and pick the series format (Bo1/Bo3/Bo5, fearless on or off).</li>
          <li>Send each captain their link — opening it lets them draft for that team only.</li>
          <li>Both captains ready up, then the draft runs on a 30 second clock; an expired turn is skipped.</li>
          <li>Misclicked? Ask for a change with ↺ — the other captain approves and the step reopens.</li>
          <li>Spectators (and OBS with <code>?overlay=1</code>) follow along live on the third link.</li>
        </ol>
      </section>
    </main>
  );
}
