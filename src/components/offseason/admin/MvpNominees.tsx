"use client";

import { useState } from "react";
import { ROLE_LABELS_SHORT, ROLE_ORDER } from "@/lib/draft/types";
import { setMvpNomineesAction } from "@/lib/offseason/actions";
import type { OffseasonWeek } from "@/lib/offseason/types";
import { ActionMessage, buttonClass, primaryButtonClass, useOffseasonAction, type OffseasonAdminData } from "./shared";

const SUGGESTED = 3;
const MOST = 5;

/** A week's saved nominees, in voters' order. */
export function savedNominees(data: OffseasonAdminData, weekId: string): string[] {
  return data.mvp.nominees
    .filter((row) => row.week_id === weekId)
    .sort((a, b) => a.position - b.position)
    .map((row) => row.entrant_id);
}

/** Pick the two to five players a week's MVP vote is between. */
export default function MvpNominees({ data, week }: { data: OffseasonAdminData; week: OffseasonWeek }) {
  const saved = savedNominees(data, week.id);
  const [picked, setPicked] = useState<string[]>(saved);
  const { pending, message, run } = useOffseasonAction();
  const lines = data.mvp.lines[week.id] ?? {};
  const names = new Map(data.entrants.map((entrant) => [entrant.id, entrant.display_name]));
  const teams = data.teams.filter((team) => team.week_id === week.id);
  const changed = picked.join() !== saved.join();
  const valid = picked.length === 0 || (picked.length >= 2 && picked.length <= MOST);

  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((other) => other !== id) : current.length >= MOST ? current : [...current, id]));
  const suggest = () =>
    setPicked(
      teams
        .flatMap((team) => data.members.filter((member) => member.team_id === team.id).map((member) => member.entrant_id))
        .filter((id) => lines[id]?.overall != null)
        .sort((a, b) => lines[b].overall! - lines[a].overall! || lines[b].wins - lines[a].wins || lines[a].losses - lines[b].losses)
        .slice(0, SUGGESTED),
    );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">MVP nominees</p>
      <p className="text-xs text-muted">
        Pick two to five players; three is the usual. Voters see them side by side, in the order you tick them, with their numbers for
        the week. Voting opens when the week is complete. Taking someone off drops the votes they had.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} className={buttonClass} onClick={suggest}>
          Suggest top {SUGGESTED}
        </button>
        <button
          type="button"
          disabled={pending || !changed || !valid}
          className={primaryButtonClass}
          onClick={() => run(() => setMvpNomineesAction(week.id, picked), picked.length ? "Nominees saved." : "Nominees cleared.")}
        >
          {picked.length || !saved.length ? "Save nominees" : "Clear nominees"}
        </button>
        <span className="text-xs text-muted">
          {picked.length === 0 ? "None picked." : `${picked.length} picked: ${picked.map((id) => names.get(id) ?? "?").join(", ")}`}
          {picked.length === 1 ? " Pick at least one more." : ""}
        </span>
        <ActionMessage message={message} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <div key={team.id} className="rounded border border-border-subtle p-2 text-xs">
            <p className="mb-1 font-semibold text-white">{team.name}</p>
            <ul className="flex flex-col gap-1">
              {data.members
                .filter((member) => member.team_id === team.id)
                .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
                .map((member) => {
                  const line = lines[member.entrant_id];
                  const order = picked.indexOf(member.entrant_id);
                  const name = names.get(member.entrant_id) ?? "?";
                  return (
                    <li key={member.entrant_id}>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={order >= 0} onChange={() => toggle(member.entrant_id)} aria-label={`Nominate ${name}`} />
                        <span className="min-w-0 truncate">
                          <span className="text-muted">{ROLE_LABELS_SHORT[member.role]}</span> <span className="text-content">{name}</span>
                        </span>
                        <span className="ml-auto shrink-0 tabular-nums text-muted">
                          {line?.overall ?? "—"} OVR · {line?.games ?? 0} {line?.games === 1 ? "game" : "games"}
                        </span>
                        {order >= 0 ? <span className="shrink-0 font-bold text-gold">#{order + 1}</span> : null}
                      </label>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
