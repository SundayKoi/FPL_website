import type { Metadata } from "next";
import CreateLobbyForm from "@/components/match-draft/CreateLobbyForm";

export const metadata: Metadata = {
  title: "Drafter — FPL",
  description: "Create a free pick/ban lobby and draft with secret team links — no account needed.",
};

export default function DrafterLandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 bg-hash px-4 py-10 text-white">
      <header>
        <span className="label-dash">Pick / ban tool</span>
        <h1 className="type-display mt-2 text-4xl text-white">Drafter</h1>
        <p className="mt-3 max-w-2xl text-sm text-steel">
          Run a full LCS-style pick/ban phase for any custom game. Create a lobby, send each captain
          their secret link, and share the spectator link with everyone else — ready checks, a 30
          second pick clock with skips, change requests, fearless mode, and live sync included. No
          account needed.
        </p>
      </header>
      <CreateLobbyForm />
      <section className="card-brand p-5 text-sm text-steel" aria-label="How it works">
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
