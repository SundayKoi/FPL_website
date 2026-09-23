import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ExpeditionBoard from "@/components/cards/ExpeditionBoard";
import ExpeditionsHeader from "@/components/cards/expeditions/ExpeditionsHeader";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { PERSONAS, PERSONA_LABELS, boardFixture, isPersona } from "@/lib/expeditions/boardFixtures";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Expedition board preview — FPL Admin",
};

/**
 * PREVIEW ONLY. The expedition page as three collectors see it — brand
 * new, mid-game with a fork open, a veteran — drawn from fixtures
 * (boardFixtures.ts) through the same ExpeditionBoard the live page
 * renders, with every action stubbed so nothing is read or written. Each
 * run's view (what its squad knows of the road) is derived here, on the
 * server, by the same buildRunViews the live page calls.
 *
 * Staff only, except in development: `npm run dev` opens it without a
 * staff profile, so the persona screenshots (e2e/expedition-board.spec.ts)
 * need no sign-in and no seeding. There is nothing behind it to protect —
 * no reads, no writes — the gate only keeps a design table off the site.
 */
export default async function ExpeditionBoardPreviewPage({ searchParams }: { searchParams: Promise<{ persona?: string }> }) {
  if (process.env.NODE_ENV !== "development") {
    const { isAdmin, isOwner } = await fetchStaffTier(await createServerSupabase());
    if (!isAdmin && !isOwner) redirect("/admin");
  }
  const { persona: requested } = await searchParams;
  const persona = isPersona(requested) ? requested : "new";
  const fixture = boardFixture(persona, new Date());

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <ExpeditionsHeader league="premier" season={fixture.season} base={fixture.base} />
      <ExpeditionBoard {...fixture} preview />
      {/* Below the board, so the page above the fold is the page a
          collector sees. */}
      <nav aria-label="Preview personas" data-testid="preview-personas" className="card-brand flex flex-wrap items-center gap-2 p-4 text-sm">
        <span className="label-dash mr-2">Staff preview · fixtures · nothing is sent</span>
        {PERSONAS.map((key) => (
          <Link
            key={key}
            href={`/admin/expedition-board?persona=${key}`}
            aria-current={key === persona ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 ${key === persona ? "border-coral text-white" : "border-line text-steel hover:text-white"}`}
          >
            {PERSONA_LABELS[key]}
          </Link>
        ))}
        <Link href="/admin" className="ml-auto inline-flex min-h-11 items-center text-steel hover:text-coral">
          ← Admin
        </Link>
      </nav>
    </main>
  );
}
