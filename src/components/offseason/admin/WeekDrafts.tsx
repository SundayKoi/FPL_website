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

/**
 * A week's auctions: links into the ordinary draft tools, and importing the
 * result. Creating either tier's draft takes the week out of setup, so the
 * other tier's draft is created here, whichever came first.
 */
export default function WeekDrafts({ data, week }: { data: OffseasonAdminData; week: OffseasonWeek }) {
  const hasTier = (tier: Tier) => data.entries.some((entry) => entry.week_id === week.id && entry.tier === tier);
  if (!week.main_draft_id && !week.elimination_draft_id) return null;
  const draft = (tier: Tier, draftId: string | null) =>
    draftId ? (
      <DraftRow data={data} week={week} tier={tier} draftId={draftId} />
    ) : hasTier(tier) && week.status !== "complete" ? (
      <DraftCreator data={data} week={week} tier={tier} disabled={false} />
    ) : null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">Drafts</p>
      {draft("main", week.main_draft_id)}
      {draft("elimination", week.elimination_draft_id)}
    </div>
  );
}
