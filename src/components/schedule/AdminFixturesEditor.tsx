"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CollapsibleAdminSection, { adminInputClass as inputClass } from "@/components/matches/CollapsibleAdminSection";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/teams/errorMessage";
import { STAGE_META, stageMeta } from "@/lib/schedule/format";
import { DIVISIONS, type Division, type FixtureRow, type FixtureStage } from "@/lib/schedule/types";
import { findScopedFixture, scopedFixtures } from "@/lib/schedule/editorScope";
import { useScheduleManagement } from "./ScheduleManagementContext";

type FormStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

interface FixtureForm {
  season: string;
  stage: FixtureStage;
  division: "" | Division;
  teamA: string;
  teamB: string;
  scheduledAt: string; // datetime-local value, ET wall-clock
  bestOf: 1 | 3 | 5;
  scoreA: string;
  scoreB: string;
}

const EMPTY_FORM: FixtureForm = {
  season: "",
  stage: "week_1",
  division: "",
  teamA: "",
  teamB: "",
  scheduledAt: "",
  bestOf: 3,
  scoreA: "",
  scoreB: "",
};

function messageFor(error: unknown): string {
  return errorMessage(error, "The fixture could not be saved.");
}

/**
 * The datetime-local input has no timezone; league scheduling is done in ET
 * (Mondays 8pm per the rulebook), so the entered wall-clock is interpreted
 * as America/New_York and converted to a UTC ISO string for timestamptz.
 */
export function etInputToIso(value: string): string | null {
  if (!value) return null;
  const asUtc = new Date(`${value}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  // Offset for that date in New York (handles EST vs EDT): render the same
  // instant in both zones and diff them.
  const inNy = new Date(asUtc.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const inUtc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = inUtc.getTime() - inNy.getTime();
  return new Date(asUtc.getTime() + offsetMs).toISOString();
}

/** Inverse of etInputToIso: ISO instant -> ET wall-clock for datetime-local. */
export function isoToEtInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function formFor(row: FixtureRow): FixtureForm {
  return {
    season: row.season,
    stage: row.stage,
    division: row.division ?? "",
    teamA: row.team_a ?? "",
    teamB: row.team_b ?? "",
    scheduledAt: isoToEtInput(row.scheduled_at),
    bestOf: row.best_of,
    scoreA: row.score_a === null ? "" : String(row.score_a),
    scoreB: row.score_b === null ? "" : String(row.score_b),
  };
}

function payloadFor(form: FixtureForm) {
  const scoreA = form.scoreA.trim() === "" ? null : Number(form.scoreA);
  const scoreB = form.scoreB.trim() === "" ? null : Number(form.scoreB);
  return {
    // Blank season falls back to the column default (current split).
    ...(form.season.trim() === "" ? {} : { season: form.season.trim() }),
    stage: form.stage,
    division: form.division === "" ? null : form.division,
    team_a: form.teamA.trim() === "" ? null : form.teamA.trim(),
    team_b: form.teamB.trim() === "" ? null : form.teamB.trim(),
    scheduled_at: etInputToIso(form.scheduledAt),
    best_of: form.bestOf,
    score_a: scoreA,
    score_b: scoreB,
  };
}

function validate(form: FixtureForm, expectedSeason?: string | null): string | null {
  if (expectedSeason !== undefined && (!expectedSeason || form.season.trim() !== expectedSeason)) return "The fixture season must match the selected schedule season.";
  const a = form.scoreA.trim();
  const b = form.scoreB.trim();
  if ((a === "") !== (b === "")) return "Enter both scores, or neither.";
  if (a !== "" && (!/^\d+$/.test(a) || !/^\d+$/.test(b))) return "Scores must be whole numbers.";
  return null;
}

const buttonClass =
  "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-50";

function FixtureFields({
  form,
  onChange,
  lockSeason = false,
}: {
  form: FixtureForm;
  onChange: (next: FixtureForm) => void;
  lockSeason?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Season
        <input
          type="text"
          value={form.season}
          onChange={(e) => onChange({ ...form, season: e.target.value })}
          readOnly={lockSeason}
          placeholder="S5"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Stage
        <select
          value={form.stage}
          onChange={(e) => {
            const stage = e.target.value as FixtureStage;
            // New stage implies the rulebook's series length for that stage;
            // keep any explicit override the admin already typed? No — the
            // stage's Bo is a format rule, not a per-fixture choice.
            onChange({ ...form, stage, bestOf: stageMeta(stage).bestOf });
          }}
          className={inputClass}
        >
          {STAGE_META.map((meta) => (
            <option key={meta.stage} value={meta.stage}>
              {meta.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Division
        <select
          value={form.division}
          onChange={(e) => onChange({ ...form, division: e.target.value as FixtureForm["division"] })}
          className={inputClass}
        >
          <option value="">Cross-division</option>
          {DIVISIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Team A
        <input
          type="text"
          value={form.teamA}
          onChange={(e) => onChange({ ...form, teamA: e.target.value })}
          placeholder="TBD"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Team B
        <input
          type="text"
          value={form.teamB}
          onChange={(e) => onChange({ ...form, teamB: e.target.value })}
          placeholder="TBD"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Date &amp; time (ET)
        <input
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(e) => onChange({ ...form, scheduledAt: e.target.value })}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Best of
        <select
          value={form.bestOf}
          onChange={(e) => onChange({ ...form, bestOf: Number(e.target.value) as 1 | 3 | 5 })}
          className={inputClass}
        >
          {[1, 3, 5].map((n) => (
            <option key={n} value={n}>
              Bo{n}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Score A
        <input
          type="text"
          inputMode="numeric"
          value={form.scoreA}
          onChange={(e) => onChange({ ...form, scoreA: e.target.value })}
          placeholder="—"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Score B
        <input
          type="text"
          inputMode="numeric"
          value={form.scoreB}
          onChange={(e) => onChange({ ...form, scoreB: e.target.value })}
          placeholder="—"
          className={inputClass}
        />
      </label>
    </div>
  );
}

export default function AdminFixturesEditor({
  fixtures,
  season,
  isOwner,
  mode = "collapsible",
  defaultStages,
  initialSelectedFixtureId = null,
}: {
  fixtures: FixtureRow[];
  season: string | null;
  isOwner: boolean;
  /** Keep the older collapsible presentation available to any existing caller. */
  mode?: "collapsible" | "drawer";
  /** The current phase/week. The explicit All season filter exposes every scoped row. */
  defaultStages?: readonly FixtureStage[];
  initialSelectedFixtureId?: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const management = useScheduleManagement();
  const inDrawer = mode === "drawer" && management !== null;
  const scoped = scopedFixtures(fixtures, season);
  const [localEditingId, setLocalEditingId] = useState<string | null>(initialSelectedFixtureId);
  const [allSeason, setAllSeason] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const resetRevision = management?.resetRevision ?? 0;
  const editingId = inDrawer ? management.selectedFixtureId : localEditingId;
  const selectedFixture = findScopedFixture(scoped, season, editingId);
  const isScopeMismatch = Boolean(inDrawer && management.scopeMismatch);
  const addKey = `${season ?? ""}:${resetRevision}`;
  const editKey = `${season ?? ""}:${editingId ?? "none"}:${resetRevision}`;
  const [addFormState, setAddFormState] = useState<{ key: string; form: FixtureForm }>({
    key: addKey,
    form: { ...EMPTY_FORM, season: season ?? "" },
  });
  const [addStatusState, setAddStatusState] = useState<{ key: string; status: FormStatus }>({
    key: addKey,
    status: { kind: "idle" },
  });
  const [editFormState, setEditFormState] = useState<{ key: string; form: FixtureForm }>({
    key: "",
    form: EMPTY_FORM,
  });
  const [editStatusState, setEditStatusState] = useState<{ key: string; status: FormStatus }>({
    key: "",
    status: { kind: "idle" },
  });

  const canKeepAddFormDuringScopeChange = isScopeMismatch && addFormState.key.endsWith(`:${resetRevision}`);
  const addForm = addFormState.key === addKey || canKeepAddFormDuringScopeChange ? addFormState.form : { ...EMPTY_FORM, season: season ?? "" };
  const addStatus = addStatusState.key === addKey ? addStatusState.status : { kind: "idle" as const };
  const canKeepEditFormDuringScopeChange = isScopeMismatch && editingId !== null && editFormState.key.endsWith(`:${editingId}:${resetRevision}`);
  const editForm = editFormState.key === editKey || canKeepEditFormDuringScopeChange ? editFormState.form : selectedFixture ? formFor(selectedFixture) : EMPTY_FORM;
  const editStatus = editStatusState.key === editKey ? editStatusState.status : { kind: "idle" as const };
  const setAddForm = (form: FixtureForm) => setAddFormState({ key: addKey, form });
  const setAddStatus = (status: FormStatus) => setAddStatusState({ key: addKey, status });
  const setEditForm = (form: FixtureForm) => setEditFormState({ key: editKey, form });
  const setEditStatus = (status: FormStatus) => setEditStatusState({ key: editKey, status });

  const handleAdd = async () => {
    if (addStatus.kind === "saving" || isScopeMismatch) return;
    const invalid = validate(addForm, inDrawer ? season : undefined);
    if (invalid) {
      setAddStatus({ kind: "error", message: invalid });
      return;
    }
    setAddStatus({ kind: "saving" });
    const { error } = await supabase.from("fixtures").insert(payloadFor(addForm));
    if (error) {
      setAddStatus({ kind: "error", message: messageFor(error) });
      return;
    }
    const savedSeason = addForm.season;
    setAddForm({ ...EMPTY_FORM, season: savedSeason });
    setAddStatus({ kind: "saved" });
    setAnnouncement("Fixture added.");
    management?.markClean(true);
    router.refresh();
  };

  const handleSave = async () => {
    if (!editingId || !selectedFixture || editStatus.kind === "saving" || isScopeMismatch) return;
    // Only update an ID from the selected season's already-authorized list.
    const scopedTarget = findScopedFixture(scoped, season, editingId);
    if (!scopedTarget) {
      setEditStatus({ kind: "error", message: "That fixture is no longer in the selected season." });
      return;
    }
    const invalid = validate(editForm, inDrawer ? season : undefined);
    if (invalid) {
      setEditStatus({ kind: "error", message: invalid });
      return;
    }
    setEditStatus({ kind: "saving" });
    const { data, error } = await supabase
      .from("fixtures")
      .update(payloadFor(editForm))
      .eq("id", scopedTarget.id)
      .select("id")
      .single();
    if (error || data?.id !== scopedTarget.id) {
      setEditStatus({
        kind: "error",
        message: error ? messageFor(error) : "No matching fixture row was updated.",
      });
      return;
    }
    setEditStatus({ kind: "saved" });
    setAnnouncement("Fixture saved.");
    setLocalEditingId(null);
    management?.markClean(true);
    management?.clearFixtureSelection();
    router.refresh();
  };

  const handleDelete = async (row: FixtureRow) => {
    if (!isOwner || editStatus.kind === "saving" || isScopeMismatch || !findScopedFixture(scoped, season, row.id)) return;
    const fixtureName = `${row.team_a ?? "TBD"} vs ${row.team_b ?? "TBD"}`;
    if (!window.confirm(`Delete ${fixtureName} from ${row.season}? This cannot be undone.`)) return;
    setEditStatus({ kind: "saving" });
    const { data, error } = await supabase.from("fixtures").delete().eq("id", row.id).select("id").single();
    if (error || data?.id !== row.id) {
      setEditStatus({ kind: "error", message: error ? messageFor(error) : "No matching fixture row was deleted." });
      return;
    }
    setEditStatus({ kind: "saved" });
    setAnnouncement(`${fixtureName} deleted from ${row.season}.`);
    setLocalEditingId(null);
    management?.markClean(true);
    management?.clearFixtureSelection();
    router.refresh();
  };

  const visibleFixtures = allSeason || !defaultStages?.length
    ? scoped
    : scoped.filter((fixture) => defaultStages.includes(fixture.stage));

  const body = (
    <div className="flex flex-col gap-6">
      {announcement ? <p role="status" className="text-sm text-success">{announcement}</p> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-dash">Browse / edit fixtures</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{season ?? "No season selected"}</h3>
          <p className="mt-1 text-xs text-muted">Changes use the current schedule season and published fixture IDs.</p>
        </div>
        {scoped.length > 0 ? (
          <label className="flex flex-col gap-1 text-xs text-muted">
            Fixture list
            <select value={allSeason ? "all" : "selected"} onChange={(event) => setAllSeason(event.target.value === "all")} className={inputClass}>
              <option value="selected">Selected phase / week</option>
              <option value="all">All season</option>
            </select>
          </label>
        ) : null}
      </div>

      {editingId ? (
        selectedFixture || canKeepEditFormDuringScopeChange ? (
          <section className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-canvas/50 p-3" aria-labelledby="editing-fixture-heading">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="label-dash">Edit fixture</p>
                <h4 id="editing-fixture-heading" className="mt-1 font-semibold text-white">{editForm.teamA || "TBD"} vs {editForm.teamB || "TBD"}</h4>
                <p className="text-xs text-muted">{editForm.season || "Selected season"} · {stageMeta(editForm.stage).label}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (inDrawer) management?.requestNavigation({ section: "fixtures", panelId: "browse", fixtureId: null });
                  else setLocalEditingId(null);
                }}
                className={`${buttonClass} border border-border-subtle bg-surface text-muted hover:text-white`}
              >
                Cancel edit
              </button>
            </div>
            <FixtureFields form={editForm} lockSeason={inDrawer} onChange={(next) => { setEditForm(next); management?.markDirty(true); }} />
            {editStatus.kind === "error" ? <p role="alert" className="text-sm text-red-400">{editStatus.message}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleSave} disabled={editStatus.kind === "saving" || isScopeMismatch} className={`${buttonClass} bg-action-fill text-white`}>
                {editStatus.kind === "saving" ? "Saving…" : "Save fixture"}
              </button>
              {isOwner && selectedFixture ? <button type="button" onClick={() => void handleDelete(selectedFixture)} disabled={editStatus.kind === "saving" || isScopeMismatch} className={`${buttonClass} border border-red-400/40 bg-red-500/10 text-red-400`}>Delete fixture</button> : null}
            </div>
          </section>
        ) : (
          <p role="status" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            This fixture ID is missing or outside the selected season. Choose a fixture from the current season list.
          </p>
        )
      ) : null}

      {!editingId && isOwner ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-canvas/50 p-3" aria-labelledby="add-fixture-heading">
          <div><p className="label-dash">Owner tool</p><h4 id="add-fixture-heading" className="mt-1 font-semibold text-white">Add fixture</h4></div>
          <FixtureFields form={addForm} lockSeason={inDrawer} onChange={(next) => { setAddForm(next); management?.markDirty(true); }} />
          {addStatus.kind === "error" ? <p role="alert" className="text-sm text-red-400">{addStatus.message}</p> : null}
          {addStatus.kind === "saved" ? <p role="status" className="text-sm text-success">Fixture added.</p> : null}
          <button type="button" onClick={handleAdd} disabled={addStatus.kind === "saving" || isScopeMismatch} className={`${buttonClass} w-fit bg-action-fill text-white`}>
            {addStatus.kind === "saving" ? "Adding…" : "Add fixture"}
          </button>
        </section>
      ) : null}

      <section className="flex flex-col gap-2" aria-label="Fixtures in the selected season">
        <div className="flex items-center justify-between gap-2"><h4 className="font-semibold text-white">Existing fixtures</h4><span className="text-xs text-muted">{visibleFixtures.length} shown</span></div>
        {visibleFixtures.length === 0 ? (
          <p className="rounded border border-dashed border-border-subtle p-3 text-sm text-muted">{scoped.length === 0 ? "No fixtures are published in this season yet." : "No fixtures in the selected phase or week."}</p>
        ) : (
          visibleFixtures.map((fixture) => (
            <div key={fixture.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border-subtle/70 bg-canvas/60 p-3">
              <span className="min-w-0 text-sm text-muted"><span className="font-semibold text-white">{stageMeta(fixture.stage).label}</span>{" · "}{fixture.team_a ?? "TBD"} vs {fixture.team_b ?? "TBD"}</span>
              <button
                type="button"
                onClick={() => {
                  if (inDrawer) management?.requestNavigation({ section: "fixtures", panelId: "browse", fixtureId: fixture.id });
                  else {
                    setLocalEditingId(fixture.id);
                    setEditForm(formFor(fixture));
                    setEditStatus({ kind: "idle" });
                  }
                }}
                disabled={isScopeMismatch}
                className={`${buttonClass} border border-border-subtle bg-surface text-muted hover:text-white`}
              >
                Edit
              </button>
              {!inDrawer && isOwner ? <button type="button" onClick={() => void handleDelete(fixture)} disabled={editStatus.kind === "saving"} className={`${buttonClass} border border-red-400/40 bg-red-500/10 text-red-400`}>Delete</button> : null}
            </div>
          ))
        )}
      </section>
      {!inDrawer && !isOwner ? <p className="text-sm text-muted">Adding and deleting fixtures are owner-only.</p> : null}
    </div>
  );

  return mode === "drawer" ? body : (
    <CollapsibleAdminSection title="Admin — manage fixtures" contentGapClass="gap-6">{body}</CollapsibleAdminSection>
  );
}
