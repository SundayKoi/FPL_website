"use client";

import { useMemo, useState } from "react";
import { ROLE_LABELS_SHORT, ROLE_ORDER } from "@/lib/draft/types";
import { createWeekDraftAction, setWeekEntriesAction } from "@/lib/offseason/actions";
import { compareByRating } from "@/lib/offseason/order";
import { planWeek, playablePlayers, proposeElimination, suggestCaptains } from "@/lib/offseason/planning";
import { ELIMINATION_START_WEEK, type OffseasonEntrant, type OffseasonWeek, type Tier } from "@/lib/offseason/types";
import {
  ActionMessage,
  buttonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  smallInputClass,
  useOffseasonAction,
  type OffseasonAdminData,
} from "./shared";

function CaptainPicker({
  label,
  seats,
  captains,
  pool,
  ratingOf,
  onChange,
  onSuggest,
}: {
  label: string;
  seats: number;
  captains: string[];
  pool: OffseasonEntrant[];
  ratingOf: (id: string) => number | null;
  onChange: (captains: string[]) => void;
  onSuggest: () => void;
}) {
  const byId = new Map(pool.map((entrant) => [entrant.id, entrant]));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          {label} captains ({seats} team{seats === 1 ? "" : "s"})
        </p>
        <button type="button" onClick={onSuggest} className={buttonClass} disabled={seats === 0}>
          Suggest top rated
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: seats }, (_, seat) => (
          <label key={seat} className={labelClass}>
            Seat {seat + 1}
            <select
              value={captains[seat] ?? ""}
              onChange={(e) => {
                const next = Array.from({ length: seats }, (_, i) => captains[i] ?? "");
                next[seat] = e.target.value;
                onChange(next);
              }}
              className={`${smallInputClass} w-48`}
            >
              <option value="">—</option>
              {pool.map((entrant) => (
                <option
                  key={entrant.id}
                  value={entrant.id}
                  disabled={!entrant.profile_id || (captains.includes(entrant.id) && captains[seat] !== entrant.id)}
                >
                  {entrant.assigned_role ? ROLE_LABELS_SHORT[entrant.assigned_role] : "?"} · {entrant.display_name}
                  {ratingOf(entrant.id) != null ? ` (${ratingOf(entrant.id)})` : ""}
                  {entrant.profile_id ? "" : " — no account"}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {captains.some((id) => id && !byId.has(id)) ? <p className="text-xs text-danger">A picked captain is no longer in this pool.</p> : null}
    </div>
  );
}

export function DraftCreator({ week, tier, disabled }: { week: OffseasonWeek; tier: Tier; disabled: boolean }) {
  const [budget, setBudget] = useState(100);
  const [countdown, setCountdown] = useState(15);
  const [minimums, setMinimums] = useState("10, 5, 1");
  const { pending, message, run } = useOffseasonAction();
  const parsedMinimums = minimums
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className={labelClass}>
        Budget
        <input type="number" min={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className={`${inputClass} w-20`} />
      </label>
      <label className={labelClass}>
        Timer (s)
        <input type="number" min={5} value={countdown} onChange={(e) => setCountdown(Number(e.target.value))} className={`${inputClass} w-20`} />
      </label>
      <label className={labelClass}>
        Round minimum bids
        <input value={minimums} onChange={(e) => setMinimums(e.target.value)} className={`${inputClass} w-28`} />
      </label>
      <button
        type="button"
        disabled={disabled || pending || parsedMinimums.length === 0 || budget < 1}
        className={primaryButtonClass}
        onClick={() =>
          run(
            () => createWeekDraftAction(week.id, tier, { budget, countdownSeconds: countdown, roundMinimums: parsedMinimums }),
            `${tier === "main" ? "Main" : "Elimination"} draft created.`,
          )
        }
      >
        Create {tier === "main" ? "main" : "elimination"} draft
      </button>
      <ActionMessage message={message} />
    </div>
  );
}

/** A week in setup: who is in the elimination tier, who captains, then the drafts. */
export default function WeekSetup({ data, week }: { data: OffseasonAdminData; week: OffseasonWeek }) {
  const ratings = useMemo(() => new Map(Object.entries(data.ratings)), [data.ratings]);
  const ratingOf = (id: string) => ratings.get(id)?.overall ?? null;
  const entries = data.entries.filter((entry) => entry.week_id === week.id);
  const locked = entries.length > 0;
  const hasDraft = Boolean(week.main_draft_id || week.elimination_draft_id);

  const seated = (tier: Tier) =>
    entries
      .filter((entry) => entry.tier === tier && entry.captain_seat !== null)
      .sort((a, b) => a.captain_seat! - b.captain_seat!)
      .map((entry) => entry.entrant_id);
  const [eliminationIds, setEliminationIds] = useState<Set<string>>(
    () => new Set(entries.filter((entry) => entry.tier === "elimination").map((entry) => entry.entrant_id)),
  );
  const [mainCaptains, setMainCaptains] = useState<string[]>(() => seated("main"));
  const [eliminationCaptains, setEliminationCaptains] = useState<string[]>(() => seated("elimination"));
  const [perRole, setPerRole] = useState(2);
  const { pending, message, run } = useOffseasonAction();

  const players = playablePlayers(data.entrants);
  const best = compareByRating(ratings);
  const mainPool = players.filter((entrant) => !eliminationIds.has(entrant.id)).sort(best);
  const eliminationPool = players.filter((entrant) => eliminationIds.has(entrant.id)).sort(best);
  const plan = planWeek({
    entrants: data.entrants,
    eliminationIds,
    mainCaptainIds: mainCaptains.filter(Boolean),
    eliminationCaptainIds: eliminationCaptains.filter(Boolean),
  });

  const propose = () => {
    const proposal = proposeElimination(data.entrants, ratings, perRole);
    setEliminationIds(proposal.ids);
    setEliminationCaptains([]);
  };
  const toggle = (id: string) => {
    const next = new Set(eliminationIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setEliminationIds(next);
    setMainCaptains(mainCaptains.filter((captain) => captain !== id));
    setEliminationCaptains(eliminationCaptains.filter((captain) => captain !== id));
  };
  const suggest = (pool: OffseasonEntrant[], count: number) => suggestCaptains(pool, ratings, count).map((entrant) => entrant.id);

  if (hasDraft) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Elimination tier</p>
          <label className={labelClass}>
            Bottom per role
            <input type="number" min={0} max={4} value={perRole} onChange={(e) => setPerRole(Number(e.target.value))} className={`${smallInputClass} w-16`} />
          </label>
          <button type="button" onClick={propose} className={buttonClass}>
            Propose lowest rated
          </button>
          <button type="button" onClick={() => setEliminationIds(new Set())} className={buttonClass} disabled={eliminationIds.size === 0}>
            Clear
          </button>
        </div>
        {week.week_number < ELIMINATION_START_WEEK ? (
          <p className="text-xs text-muted">The format starts the elimination tier in week {ELIMINATION_START_WEEK}; leave it empty until then.</p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {ROLE_ORDER.map((role) => (
            <div key={role} className="rounded border border-border-subtle p-2">
              <p className="mb-1 text-xs font-bold uppercase text-muted">{ROLE_LABELS_SHORT[role]}</p>
              <ul className="flex flex-col gap-1">
                {players
                  .filter((entrant) => entrant.assigned_role === role)
                  .sort(best)
                  .map((entrant) => (
                    <li key={entrant.id}>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={eliminationIds.has(entrant.id)} onChange={() => toggle(entrant.id)} />
                        <span className={eliminationIds.has(entrant.id) ? "flex-1 truncate text-prestige" : "flex-1 truncate text-content"}>
                          {entrant.display_name}
                        </span>
                        <span className="tabular-nums text-muted">{ratingOf(entrant.id) ?? "—"}</span>
                      </label>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <CaptainPicker
        label="Main"
        seats={plan.mainTeams}
        captains={mainCaptains}
        pool={mainPool}
        ratingOf={ratingOf}
        onChange={setMainCaptains}
        onSuggest={() => setMainCaptains(suggest(mainPool, plan.mainTeams))}
      />
      {eliminationIds.size > 0 ? (
        <CaptainPicker
          label="Elimination"
          seats={plan.eliminationTeams}
          captains={eliminationCaptains}
          pool={eliminationPool}
          ratingOf={ratingOf}
          onChange={setEliminationCaptains}
          onSuggest={() => setEliminationCaptains(suggest(eliminationPool, plan.eliminationTeams))}
        />
      ) : null}

      <div className="flex flex-col gap-2 rounded border border-border-subtle p-3 text-sm">
        <p>
          <span className="font-semibold text-white">{plan.mainTeams}</span> main team{plan.mainTeams === 1 ? "" : "s"}
          {eliminationIds.size > 0 ? (
            <>
              , <span className="font-semibold text-white">{plan.eliminationTeams}</span> elimination team{plan.eliminationTeams === 1 ? "" : "s"}
            </>
          ) : null}
          .{" "}
          {plan.sittingOut.length > 0 ? (
            <span className="text-muted">Sitting out (over-full roles, latest sign-ups): {plan.sittingOut.map((entrant) => entrant.display_name).join(", ")}.</span>
          ) : null}
        </p>
        {plan.problems.map((problem) => (
          <p key={problem} className="text-danger">
            {problem}
          </p>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || plan.problems.length > 0 || plan.mainTeams < 2}
            className={primaryButtonClass}
            onClick={() => run(() => setWeekEntriesAction(week.id, plan.entries), "Week locked. Create the drafts next.")}
          >
            {locked ? "Re-lock tiers" : "Lock tiers"}
          </button>
          {locked ? (
            <span className="text-xs text-muted">
              Locked: {entries.filter((entry) => entry.tier === "main").length} main,{" "}
              {entries.filter((entry) => entry.tier === "elimination").length} elimination, {entries.filter((entry) => entry.tier === "bench").length} sitting out.
            </span>
          ) : null}
        </div>
        <ActionMessage message={message} />
      </div>

      {locked ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Drafts</p>
          <DraftCreator week={week} tier="main" disabled={!entries.some((entry) => entry.tier === "main")} />
          {entries.some((entry) => entry.tier === "elimination") ? <DraftCreator week={week} tier="elimination" disabled={false} /> : null}
          <p className="text-xs text-muted">Creating a draft fixes this week&apos;s tiers. Each captain bids from their own account in the ordinary draft room.</p>
        </div>
      ) : null}
    </div>
  );
}
