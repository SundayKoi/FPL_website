"use client";

import Link from "next/link";
import { importWeekDraftAction } from "@/lib/offseason/actions";
import type { OffseasonWeek, Tier } from "@/lib/offseason/types";
import { ActionMessage, buttonClass, primaryButtonClass, useOffseasonAction, type OffseasonAdminData } from "./shared";
import { DraftCreator } from "./WeekSetup";

const DRAFT_STATUS: Record<string, string> = { setup: "Not started", live: "Live", paused: "Paused", complete: "Finished" };

function DraftRow({ data, week, tier, draftId }: { data: OffseasonAdminData; week: OffseasonWeek; tier: Tier; draftId: string }) {
  const { pending, message, run } = useOffseasonAction();
  const draft = data.drafts[draftId];
  const imported = data.teams.some((team) => team.week_id === week.id && team.tier === tier);
  return (
    <div className="flex flex-col gap-2 rounded border border-border-subtle p-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold text-white">{draft?.name ?? `${tier === "main" ? "Main" : "Elimination"} draft`}</span>
        <span className="text-xs uppercase tracking-wide text-muted">{draft ? DRAFT_STATUS[draft.status] ?? draft.status : "Deleted"}</span>
        <Link href={`/draft/${draftId}`} className="text-xs font-semibold text-action-text hover:underline">
          Draft room →
        </Link>
        <Link href={`/admin/${draftId}`} className="text-xs font-semibold text-action-text hover:underline">
          Draft admin (start, schedule, fix) →
        </Link>
      </div>
      {imported ? (
        <p className="text-xs text-success">Teams imported.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !draft}
            className={draft?.status === "complete" ? primaryButtonClass : buttonClass}
            onClick={() => run(() => importWeekDraftAction(week.id, tier), "Teams imported.")}
          >
            Import teams
          </button>
          <span className="text-xs text-muted">Once every team has all five roles.</span>
        </div>
      )}
      <ActionMessage message={message} />
    </div>
  );
}

/** A week's auctions: links into the ordinary draft tools, and importing the result. */
export default function WeekDrafts({ data, week }: { data: OffseasonAdminData; week: OffseasonWeek }) {
  const hasEliminationTier = data.entries.some((entry) => entry.week_id === week.id && entry.tier === "elimination");
  if (!week.main_draft_id && !week.elimination_draft_id) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">Drafts</p>
      {week.main_draft_id ? <DraftRow data={data} week={week} tier="main" draftId={week.main_draft_id} /> : null}
      {week.elimination_draft_id ? (
        <DraftRow data={data} week={week} tier="elimination" draftId={week.elimination_draft_id} />
      ) : hasEliminationTier && week.status !== "complete" ? (
        <DraftCreator week={week} tier="elimination" disabled={false} />
      ) : null}
    </div>
  );
}
