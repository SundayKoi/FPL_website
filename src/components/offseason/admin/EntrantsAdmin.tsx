"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { ROLE_LABELS, ROLE_LABELS_SHORT, ROLE_ORDER, type LolRole } from "@/lib/draft/types";
import { addEntrantAction, applyRolesAction, deleteEntrantAction, setLockInAction, updateEntrantAction } from "@/lib/offseason/actions";
import { lockInCounts, lockInState } from "@/lib/offseason/lockIn";
import { planRoles } from "@/lib/offseason/roles";
import { TEAM_SIZE, type OffseasonEntrant } from "@/lib/offseason/types";
import { RANK_OPTIONS } from "@/lib/signup/ranks";
import {
  ActionMessage,
  buttonClass,
  dangerButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  smallInputClass,
  useOffseasonAction,
  type OffseasonAdminData,
} from "./shared";

type Assignment = { role: LolRole | null; status: "active" | "benched" };

const assignable = (entrant: OffseasonEntrant) => entrant.status === "active" || entrant.status === "benched";

function initialAssignments(entrants: OffseasonEntrant[]): Record<string, Assignment> {
  return Object.fromEntries(
    entrants
      .filter(assignable)
      .map((entrant) => [entrant.id, { role: entrant.assigned_role, status: entrant.status as Assignment["status"] }]),
  );
}

function RoleSelect({
  value,
  onChange,
  allowNone = false,
  className = smallInputClass,
}: {
  value: LolRole | null;
  onChange: (role: LolRole | null) => void;
  allowNone?: boolean;
  className?: string;
}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as LolRole | null)} className={className}>
      {allowNone ? <option value="">—</option> : null}
      {ROLE_ORDER.map((role) => (
        <option key={role} value={role}>
          {ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  );
}

function AddEntrantForm({ eventId }: { eventId: string }) {
  const empty = { displayName: "", riotId: "", currentRank: "", opggUrl: "", primaryRole: "top" as LolRole, secondaryRole: null as LolRole | null };
  const [form, setForm] = useState(empty);
  const { pending, message, run } = useOffseasonAction();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addEntrantAction(eventId, form), `${form.displayName} added.`, () => setForm(empty));
      }}
    >
      <label className={labelClass}>
        Name
        <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className={`${inputClass} w-36`} />
      </label>
      <label className={labelClass}>
        Riot ID
        <input value={form.riotId} onChange={(e) => setForm({ ...form, riotId: e.target.value })} placeholder="Name#TAG" className={`${inputClass} w-40`} />
      </label>
      <label className={labelClass}>
        Rank
        <select value={form.currentRank} onChange={(e) => setForm({ ...form, currentRank: e.target.value })} className={inputClass}>
          <option value="">—</option>
          {RANK_OPTIONS.map((rank) => (
            <option key={rank} value={rank}>
              {rank}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Primary
        <RoleSelect value={form.primaryRole} onChange={(role) => setForm({ ...form, primaryRole: role ?? "top" })} className={inputClass} />
      </label>
      <label className={labelClass}>
        Secondary
        <RoleSelect value={form.secondaryRole} onChange={(role) => setForm({ ...form, secondaryRole: role })} allowNone className={inputClass} />
      </label>
      <label className={labelClass}>
        op.gg
        <input value={form.opggUrl} onChange={(e) => setForm({ ...form, opggUrl: e.target.value })} className={`${inputClass} w-44`} />
      </label>
      <button type="submit" disabled={pending || !form.displayName.trim() || !form.riotId.trim()} className={buttonClass}>
        Add player
      </button>
      <ActionMessage message={message} />
      <p className="basis-full text-xs text-muted">
        For players without a site account. If they sign up later with the same Riot ID, the row becomes theirs and keeps its place in line.
        Captains need an account: the draft room seats them by it.
      </p>
    </form>
  );
}

function EntrantEditor({ entrant, onClose }: { entrant: OffseasonEntrant; onClose: () => void }) {
  const [form, setForm] = useState({
    display_name: entrant.display_name,
    riot_id: entrant.riot_id,
    primary_role: entrant.primary_role,
    secondary_role: entrant.secondary_role,
  });
  const { pending, message, run } = useOffseasonAction();
  return (
    <div className="flex flex-wrap items-end gap-2 bg-canvas/60 p-3">
      <label className={labelClass}>
        Name
        <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className={`${inputClass} w-36`} />
      </label>
      <label className={labelClass}>
        Riot ID
        <input value={form.riot_id} onChange={(e) => setForm({ ...form, riot_id: e.target.value })} className={`${inputClass} w-40`} />
      </label>
      <label className={labelClass}>
        Primary
        <RoleSelect value={form.primary_role} onChange={(role) => setForm({ ...form, primary_role: role ?? form.primary_role })} className={inputClass} />
      </label>
      <label className={labelClass}>
        Secondary
        <RoleSelect value={form.secondary_role} onChange={(role) => setForm({ ...form, secondary_role: role })} allowNone className={inputClass} />
      </label>
      <button
        type="button"
        disabled={pending || form.secondary_role === form.primary_role}
        className={buttonClass}
        onClick={() => run(() => updateEntrantAction(entrant.id, { ...form, display_name: form.display_name.trim(), riot_id: form.riot_id.trim() }), undefined, onClose)}
      >
        Save
      </button>
      <button type="button" className={buttonClass} onClick={onClose}>
        Cancel
      </button>
      <ActionMessage message={message} />
    </div>
  );
}

/** Whether the player has confirmed their saved role; staff can record or clear it. */
function LockInCell({ entrant, pending, run }: { entrant: OffseasonEntrant; pending: boolean; run: ReturnType<typeof useOffseasonAction>["run"] }) {
  const state = lockInState(entrant);
  if (state === "not_playing" || state === "no_role") return <span className="text-xs text-muted">—</span>;
  const role = entrant.assigned_role!;
  return (
    <div className="flex items-center gap-1.5">
      {state === "locked" ? (
        <span className="text-xs font-semibold text-success" title={entrant.locked_in_at ? new Date(entrant.locked_in_at).toLocaleString() : undefined}>
          Locked in
        </span>
      ) : state === "role_changed" ? (
        <span className="text-xs font-semibold text-danger">Was {ROLE_LABELS_SHORT[entrant.locked_in_role!]}</span>
      ) : (
        <span className="text-xs text-muted">Not yet</span>
      )}
      {state === "locked" ? (
        <button type="button" disabled={pending} className={buttonClass} onClick={() => run(() => setLockInAction(entrant.id, null), `${entrant.display_name}'s lock-in cleared.`)}>
          Clear
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          className={buttonClass}
          title={`Record that ${entrant.display_name} confirmed ${ROLE_LABELS[role]}, e.g. in Discord`}
          onClick={() => run(() => setLockInAction(entrant.id, role), `${entrant.display_name} locked in as ${ROLE_LABELS[role]}.`)}
        >
          Mark
        </button>
      )}
    </div>
  );
}

export default function EntrantsAdmin({ data }: { data: OffseasonAdminData }) {
  const { event, entrants } = data;
  const [assignments, setAssignments] = useState(() => initialAssignments(entrants));
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const { pending, message, run } = useOffseasonAction();
  const drafted = useMemo(() => new Set(data.entries.map((entry) => entry.entrant_id)), [data.entries]);

  // Server data wins after a save: reset local edits whenever the rows change.
  const [seen, setSeen] = useState(entrants);
  if (seen !== entrants) {
    setSeen(entrants);
    setAssignments(initialAssignments(entrants));
  }

  const original = initialAssignments(entrants);
  const dirty = Object.entries(assignments).some(
    ([id, row]) => original[id] && (original[id].role !== row.role || original[id].status !== row.status),
  );
  const activeByRole = Object.fromEntries(
    ROLE_ORDER.map((role) => [role, Object.values(assignments).filter((row) => row.status === "active" && row.role === role).length]),
  ) as Record<LolRole, number>;
  const teams = Math.min(...ROLE_ORDER.map((role) => activeByRole[role]));
  const invalid = Object.values(assignments).some((row) => row.status === "active" && !row.role);
  const lockIns = lockInCounts(entrants);

  const autoAssign = () => {
    const plan = planRoles(entrants);
    const next: Record<string, Assignment> = { ...assignments };
    for (const row of plan.rows) next[row.entrantId] = { role: row.role, status: row.status };
    setAssignments(next);
    const moved = plan.rows.filter((row) => row.onSecondary).length;
    const out = plan.rows.filter((row) => row.status === "benched").length;
    setPlanNote(
      `${plan.teamCount} full team${plan.teamCount === 1 ? "" : "s"}: ${plan.teamCount * TEAM_SIZE} playing, ${moved} on their secondary, ${out} sitting out. Review, then save.`,
    );
  };

  const save = () =>
    run(
      () =>
        applyRolesAction(
          event.id,
          Object.entries(assignments).map(([entrantId, row]) => ({ entrantId, role: row.role, status: row.status })),
        ),
      "Roles saved.",
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={autoAssign} disabled={pending} className={buttonClass}>
          Auto-assign roles
        </button>
        <button type="button" onClick={save} disabled={pending || !dirty || invalid} className={primaryButtonClass}>
          Save roles
        </button>
        <span className="flex flex-wrap gap-2 text-xs text-muted">
          {ROLE_ORDER.map((role) => (
            <span key={role}>
              {ROLE_LABELS_SHORT[role]} <span className="tabular-nums text-white">{activeByRole[role]}</span>
            </span>
          ))}
          <span>→ {Number.isFinite(teams) ? teams : 0} full teams</span>
        </span>
        {lockIns.playing > 0 ? (
          <span className="text-xs text-muted">
            Locked in <span className="tabular-nums text-white">{lockIns.locked}</span> of{" "}
            <span className="tabular-nums text-white">{lockIns.playing}</span> playing
          </span>
        ) : null}
      </div>
      {planNote ? <p className="text-sm text-muted">{planNote}</p> : null}
      {invalid ? <p className="text-sm text-danger">Every active player needs a role.</p> : null}
      <ActionMessage message={message} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[62rem] border-collapse text-left text-sm">
          <thead>
            <tr className="text-[0.7rem] uppercase tracking-wide text-muted">
              <th className="border-b border-border-subtle px-2 py-2">#</th>
              <th className="border-b border-border-subtle px-2 py-2">Player</th>
              <th className="border-b border-border-subtle px-2 py-2">Rank</th>
              <th className="border-b border-border-subtle px-2 py-2">Wants</th>
              <th className="border-b border-border-subtle px-2 py-2">Plays</th>
              <th className="border-b border-border-subtle px-2 py-2">Status</th>
              <th className="border-b border-border-subtle px-2 py-2">Lock-in</th>
              <th className="border-b border-border-subtle px-2 py-2 text-right">OVR</th>
              <th className="border-b border-border-subtle px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {entrants.map((entrant, index) => {
              const row = assignments[entrant.id];
              const rating = data.ratings[entrant.id];
              return (
                <Fragment key={entrant.id}>
                  <tr className={row ? undefined : "opacity-60"}>
                    <td className="border-b border-border-subtle/60 px-2 py-1.5 tabular-nums text-muted">{index + 1}</td>
                    <td className="border-b border-border-subtle/60 px-2 py-1.5">
                      <Link href={`/offseason/players/${entrant.id}`} className="font-semibold text-white hover:text-action-text">
                        {entrant.display_name}
                      </Link>
                      <span className="block text-xs text-muted">
                        {entrant.riot_id}
                        {entrant.profile_id ? "" : " · no account"}
                      </span>
                    </td>
                    <td className="border-b border-border-subtle/60 px-2 py-1.5 text-xs text-muted">{entrant.current_rank ?? "—"}</td>
                    <td className="border-b border-border-subtle/60 px-2 py-1.5 text-xs">
                      {ROLE_LABELS_SHORT[entrant.primary_role]}
                      {entrant.secondary_role ? <span className="text-muted"> / {ROLE_LABELS_SHORT[entrant.secondary_role]}</span> : null}
                    </td>
                    <td className="border-b border-border-subtle/60 px-2 py-1.5">
                      {row ? (
                        <RoleSelect
                          value={row.role}
                          allowNone
                          onChange={(role) => setAssignments({ ...assignments, [entrant.id]: { ...row, role } })}
                        />
                      ) : (
                        <span className="text-xs">{entrant.assigned_role ? ROLE_LABELS_SHORT[entrant.assigned_role] : "—"}</span>
                      )}
                    </td>
                    <td className="border-b border-border-subtle/60 px-2 py-1.5">
                      {row ? (
                        <select
                          value={row.status}
                          onChange={(e) => setAssignments({ ...assignments, [entrant.id]: { ...row, status: e.target.value as Assignment["status"] } })}
                          className={smallInputClass}
                        >
                          <option value="active">Playing</option>
                          <option value="benched">Sitting out</option>
                        </select>
                      ) : (
                        <span className={entrant.status === "eliminated" ? "text-xs font-semibold text-danger" : "text-xs text-muted"}>
                          {entrant.status === "eliminated" ? `Out W${entrant.eliminated_week}` : "Withdrawn"}
                        </span>
                      )}
                    </td>
                    <td className="border-b border-border-subtle/60 px-2 py-1.5">
                      <LockInCell entrant={entrant} pending={pending} run={run} />
                    </td>
                    <td className="border-b border-border-subtle/60 px-2 py-1.5 text-right tabular-nums">{rating?.overall ?? "—"}</td>
                    <td className="border-b border-border-subtle/60 px-2 py-1.5">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" className={buttonClass} onClick={() => setEditing(editing === entrant.id ? null : entrant.id)}>
                          Edit
                        </button>
                        {entrant.status === "withdrawn" ? (
                          <button type="button" disabled={pending} className={buttonClass} onClick={() => run(() => updateEntrantAction(entrant.id, { status: "benched" }), `${entrant.display_name} is back (sitting out until given a role).`)}>
                            Reinstate
                          </button>
                        ) : entrant.status !== "eliminated" ? (
                          <button type="button" disabled={pending} className={dangerButtonClass} onClick={() => run(() => updateEntrantAction(entrant.id, { status: "withdrawn" }), `${entrant.display_name} withdrawn.`)}>
                            Withdraw
                          </button>
                        ) : null}
                        {!drafted.has(entrant.id) ? (
                          <button
                            type="button"
                            disabled={pending}
                            className={dangerButtonClass}
                            onClick={() => {
                              if (window.confirm(`Delete ${entrant.display_name}'s sign-up?`)) run(() => deleteEntrantAction(entrant.id), "Deleted.");
                            }}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {editing === entrant.id ? (
                    <tr>
                      <td colSpan={9} className="border-b border-border-subtle/60">
                        <EntrantEditor entrant={entrant} onClose={() => setEditing(null)} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddEntrantForm eventId={event.id} />
    </div>
  );
}
