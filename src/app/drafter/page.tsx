import type { Metadata } from "next";
import AccessWall from "@/components/access/AccessWall";
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
      <AccessWall
        section="Match Drafter"
        reason="signed-out"
        redirect="/drafter"
        title="Sign in to create draft lobbies"
        body="Running a pick / ban lobby is a member perk — sign in with Discord to check your access."
        note="Draft links you've been sent still work without signing in."
      />
    );
  }
  if (!access.allowed) {
    return (
      <AccessWall
        section="Match Drafter"
        reason="no-role"
        redirect="/drafter"
        body="Creating draft lobbies comes with the role. Join the Discord, grab it, and come back."
        note="Draft links you've been sent still work without it."
      />
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 page-backdrop px-4 py-10 text-white">
      <header>
        <span className="label-dash">Pick / ban tool</span>
        <h1 className="type-display mt-2 text-4xl text-white">Match Drafter</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Run a full LCS-style pick/ban phase for any custom game. Create a lobby, send each captain
          their secret link, and share the spectator link with everyone else — ready checks, a signed
          30 second clock, pick overtime, ban skips, change requests, fearless mode, and live sync included.
          Whoever you send the links to needs no account at all.
        </p>
      </header>
      <CreateLobbyForm />
      <section className="card-brand p-5 text-sm text-muted" aria-label="How it works">
        <h2 className="type-display text-lg text-white">How it works</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Name the two teams and pick the series format (Bo1/Bo3/Bo5, fearless on or off).</li>
          <li>Send each captain their link — opening it lets them draft for that team only.</li>
          <li>Both captains ready up, then each turn gets 30 seconds; picks stay selectable in overtime, while expired bans are skipped.</li>
          <li>Misclicked? Ask for a change with ↺ — the other captain approves and the step reopens.</li>
          <li>Spectators (and OBS with <code>?overlay=1</code>) follow along live on the third link.</li>
        </ol>
      </section>
    </main>
  );
}
