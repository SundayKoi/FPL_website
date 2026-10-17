"use client";

import { useMemo, useState } from "react";
import { ROLE_LABELS_SHORT, ROLE_ORDER } from "@/lib/draft/types";
import { createWeekDraftAction, setWeekEntriesAction } from "@/lib/offseason/actions";
import { compareByRating } from "@/lib/offseason/order";
import { planWeek, playablePlayers, proposeElimination, suggestCaptains, suggestEliminationCaptains } from "@/lib/offseason/planning";
import { ELIMINATION_PER_ROLE, ELIMINATION_START_WEEK, type OffseasonEntrant, type OffseasonWeek, type Tier } from "@/lib/offseason/types";
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
  suggestLabel = "Suggest top rated",
}: {
  label: string;
  seats: number;
  captains: string[];
  pool: OffseasonEntrant[];
  ratingOf: (id: string) => number | null;
  onChange: (captains: string[]) => void;
  onSuggest: () => void;
  suggestLabel?: string;
}) {
  const byId = new Map(pool.map((entrant) => [entrant.id, entrant]));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          {label} captains ({seats} team{seats === 1 ? "" : "s"})
        </p>
        <button type="button" onClick={onSuggest} className={buttonClass} disabled={seats === 0}>
          {suggestLabel}
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

/** A tier's captains in seat order, as the draft will seat them. */
function seatedCaptains(data: OffseasonAdminData, week: OffseasonWeek, tier: Tier): OffseasonEntrant[] {
  const byId = new Map(data.entrants.map((entrant) => [entrant.id, entrant]));
  return data.entries
    .filter((entry) => entry.week_id === week.id && entry.tier === tier && entry.captain_seat !== null)
    .sort((a, b) => a.captain_seat! - b.captain_seat!)
    .flatMap((entry) => byId.get(entry.entrant_id) ?? []);
}

export function DraftCreator({ data, week, tier, disabled }: { data: OffseasonAdminData; week: OffseasonWeek; tier: Tier; disabled: boolean }) {
  const [budget, setBudget] = useState(100);
  const [countdown, setCountdown] = useState(15);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const { pending, message, run } = useOffseasonAction();
  const captains = seatedCaptains(data, week, tier);
  const costOf = (id: string) => Number(costs[id]);
  // Each captain costs at least 1 and leaves a point for each of the other four roles.
  const validCost = (id: string) => (costs[id] ?? "").trim() !== "" && Number.isInteger(costOf(id)) && costOf(id) >= 1 && costOf(id) <= budget - 4;
  const allValid = captains.length > 0 && captains.every((captain) => validCost(captain.id));
  const typedInvalid = captains.some((captain) => (costs[captain.id] ?? "").trim() !== "" && !validCost(captain.id));
  const first = captains[0];
  return (
    <div className="flex flex-col gap-3 rounded border border-border-subtle p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{tier === "main" ? "Main" : "Elimination"} draft</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className={labelClass}>
          Budget
          <input type="number" min={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className={`${inputClass} w-20`} />
        </label>
        <label className={labelClass}>
          Timer (s)
          <input type="number" min={5} value={countdown} onChange={(e) => setCountdown(Number(e.target.value))} className={`${inputClass} w-20`} />
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Captain costs</p>
          {first && validCost(first.id) && captains.length > 1 ? (
            <button
              type="button"
              className={buttonClass}
              onClick={() => setCosts(Object.fromEntries(captains.map((captain) => [captain.id, costs[first.id]])))}
            >
              Use {costs[first.id]} for all
            </button>
          ) : null}
        </div>
        {captains.length === 0 ? (
          <p className="text-xs text-muted">Lock this tier&apos;s captains first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {captains.map((captain, seat) => (
              <label key={captain.id} className={labelClass}>
                <span>
                  Seat {seat + 1} · {captain.assigned_role ? ROLE_LABELS_SHORT[captain.assigned_role] : "?"} · {captain.display_name}
                </span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, budget - 4)}
                  value={costs[captain.id] ?? ""}
                  onChange={(e) => setCosts({ ...costs, [captain.id]: e.target.value })}
                  placeholder="e.g. 15"
                  aria-label={`Cost for ${captain.display_name}`}
                  aria-invalid={(costs[captain.id] ?? "").trim() !== "" && !validCost(captain.id)}
                  className={`${inputClass} w-24`}
                />
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled || pending || budget < 1 || !allValid}
          className={primaryButtonClass}
          onClick={() =>
            run(
              () =>
                createWeekDraftAction(week.id, tier, {
                  budget,
                  countdownSeconds: countdown,
                  captainCosts: Object.fromEntries(captains.map((captain) => [captain.id, costOf(captain.id)])),
                }),
              `${tier === "main" ? "Main" : "Elimination"} draft created.`,
            )
          }
        >
          Create {tier === "main" ? "main" : "elimination"} draft
        </button>
      </div>
      {typedInvalid ? (
        <p className="text-xs text-danger">Each captain costs at least 1 point and must leave 1 for each of the other four roles.</p>
      ) : (
        <p className="text-xs text-muted">Each captain is bought for their own cost before the auction, so their team starts with the budget less it.</p>
      )}
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
  const [perRole, setPerRole] = useState(ELIMINATION_PER_ROLE);
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

  const suggest = (pool: OffseasonEntrant[], count: number) => suggestCaptains(pool, ratings, count).map((entrant) => entrant.id);
  const suggestByRole = (pool: OffseasonEntrant[], count: number) =>
    suggestEliminationCaptains(pool, ratings, count).map((entrant) => entrant.id);
  // The format: the lowest rated in each role play the elimination tier. The
  // main tier is captained by its highest rated overall, the elimination tier
  // by the highest rated of each of its roles.
  const propose = () => {
    const ids = proposeElimination(data.entrants, ratings, perRole).ids;
    const teams = planWeek({ entrants: data.entrants, eliminationIds: ids, mainCaptainIds: [], eliminationCaptainIds: [] });
    setEliminationIds(ids);
    setMainCaptains(suggest(players.filter((entrant) => !ids.has(entrant.id)), teams.mainTeams));
    setEliminationCaptains(suggestByRole(players.filter((entrant) => ids.has(entrant.id)), teams.eliminationTeams));
  };
  const toggle = (id: string) => {
    const next = new Set(eliminationIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setEliminationIds(next);
    setMainCaptains(mainCaptains.filter((captain) => captain !== id));
    setEliminationCaptains(eliminationCaptains.filter((captain) => captain !== id));
  };

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
          <button type="button" onClick={propose} className={buttonClass} disabled={week.week_number < ELIMINATION_START_WEEK}>
            Propose tiers and captains
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
          onSuggest={() => setEliminationCaptains(suggestByRole(eliminationPool, plan.eliminationTeams))}
          suggestLabel="Suggest best per role"
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
            disabled={pending || plan.problems.length > 0}
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
          <DraftCreator data={data} week={week} tier="main" disabled={!entries.some((entry) => entry.tier === "main")} />
          {entries.some((entry) => entry.tier === "elimination") ? <DraftCreator data={data} week={week} tier="elimination" disabled={false} /> : null}
          <p className="text-xs text-muted">Creating a draft fixes this week&apos;s tiers. Each captain bids from their own account in the ordinary draft room.</p>
        </div>
      ) : null}
    </div>
  );
}
