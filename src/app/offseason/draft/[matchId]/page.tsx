import type { Metadata } from "next";
import Link from "next/link";
import MatchDraftBoard from "@/components/match-draft/MatchDraftBoard";
import { fetchLiveChampions } from "@/lib/match-draft/liveRoster";
import { overlaySlotWidthFrom } from "@/lib/match-draft/overlaySlot";
import { draftGameParam, draftLayoutParam } from "@/lib/match-draft/params";
import type { MatchDraftBestOf } from "@/lib/match-draft/types";
import { draftStates, fetchMatchDrafts, matchHref, matchLabel, viewerCaptainOf } from "@/lib/offseason/drafts";
import { loadOffseasonPage } from "@/lib/offseason/page";
import { fetchMatchCodes } from "@/lib/offseason/queries";
import { firstParam, type SearchParamValue } from "@/lib/searchParams";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Offseason Draft — FPL",
  description: "Pick and ban for an offseason tournament match.",
};

/**
 * One offseason match's champion draft. The two captains draft, staff can act
 * for either side, and anyone else watches. The board is the league's; the
 * offseason_draft_* RPCs check every move again.
 */
export default async function OffseasonDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const [{ matchId }, query] = await Promise.all([params, searchParams]);
  const { view, userId, isStaff } = await loadOffseasonPage();
  const match = view?.matches.find((candidate) => candidate.id === matchId);
  if (!view || !match) {
    return (
      <main className="page-container page-spacing flex flex-1 items-center justify-center page-backdrop">
        <section className="card-brand max-w-md p-6 text-center">
          <h1 className="type-display text-2xl text-white">Match not found</h1>
          <p className="mt-2 text-sm text-muted">This draft link doesn&apos;t match an offseason match.</p>
          <Link href="/offseason/schedule" className="btn-pill mt-4 inline-block px-4 py-2 text-sm">
            Back to the schedule
          </Link>
        </section>
      </main>
    );
  }

  const supabase = await createServerSupabase();
  // Codes come back only for the two teams' players and staff (RLS).
  const [rows, champions, codes] = await Promise.all([
    fetchMatchDrafts(supabase, [match.id]),
    fetchLiveChampions(),
    fetchMatchCodes(supabase, [match.id]).catch(() => []),
  ]);
  const captainOf = viewerCaptainOf(view, match, userId);
  const overlay = firstParam(query.overlay) === "1";
  const layout = draftLayoutParam(firstParam(query.layout)) ?? (captainOf || isStaff ? "board" : "stage");
  const { states, games } = draftStates({ view, match, rows, layout });
  const gameNumber = draftGameParam(firstParam(query.game), match.best_of as MatchDraftBestOf);
  const tourneyCodes = Object.fromEntries(codes.filter((code) => code.game_number !== null).map((code) => [code.game_number!, code.code]));

  return (
    <>
      <MatchDraftBoard
        initialState={states[gameNumber - 1] ?? states[0]}
        initialStates={states}
        viewerTeamName={captainOf?.name ?? null}
        overlay={overlay}
        champions={champions}
        games={games}
        seriesFormat={{ bestOf: match.best_of as MatchDraftBestOf, fearless: true }}
        canReset={isStaff}
        offseasonMatchId={match.id}
        followLive={overlay && firstParam(query.game) === undefined}
        overlayTransparent={firstParam(query.bg) === "transparent"}
        overlaySlotWidth={overlaySlotWidthFrom(firstParam(query.slot))}
        tourneyCodes={tourneyCodes}
        eyebrow={`${view.event.name} · ${matchLabel(view, match, false)}`}
      />
      {overlay ? null : (
        <p className="page-container pb-6 text-sm">
          <Link href={matchHref(match.id)} className="font-semibold text-action-text hover:underline">
            Match history
          </Link>
          <span className="text-muted"> · </span>
          <Link href="/offseason/schedule" className="font-semibold text-action-text hover:underline">
            Schedule
          </Link>
        </p>
      )}
    </>
  );
}
