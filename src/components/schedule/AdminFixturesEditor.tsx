"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STAGE_META, stageMeta } from "@/lib/schedule/format";
import { DIVISIONS, type Division, type FixtureRow, type FixtureStage } from "@/lib/schedule/types";

type FormStatus =
  | { kind: "idle" }
  | { kind: "saving" }
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
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return (error as { message?: string } | null)?.message ?? "The fixture could not be saved.";
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

function validate(form: FixtureForm): string | null {
  const a = form.scoreA.trim();
  const b = form.scoreB.trim();
  if ((a === "") !== (b === "")) return "Enter both scores, or neither.";
  if (a !== "" && (!/^\d+$/.test(a) || !/^\d+$/.test(b))) return "Scores must be whole numbers.";
  return null;
}

const inputClass =
  "rounded border border-line bg-navy px-2 py-1.5 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none";
const buttonClass =
  "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-50";

function FixtureFields({
  form,
  onChange,
}: {
  form: FixtureForm;
  onChange: (next: FixtureForm) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <label className="flex flex-col gap-1 text-xs text-steel">
        Season
        <input
          type="text"
          value={form.season}
          onChange={(e) => onChange({ ...form, season: e.target.value })}
          placeholder="S5"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-steel">
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
      <label className="flex flex-col gap-1 text-xs text-steel">
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
      <label className="flex flex-col gap-1 text-xs text-steel">
        Team A
        <input
          type="text"
          value={form.teamA}
          onChange={(e) => onChange({ ...form, teamA: e.target.value })}
          placeholder="TBD"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-steel">
        Team B
        <input
          type="text"
          value={form.teamB}
          onChange={(e) => onChange({ ...form, teamB: e.target.value })}
          placeholder="TBD"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-steel">
        Date &amp; time (ET)
        <input
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(e) => onChange({ ...form, scheduledAt: e.target.value })}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-steel">
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
      <label className="flex flex-col gap-1 text-xs text-steel">
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
      <label className="flex flex-col gap-1 text-xs text-steel">
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
}: {
  fixtures: FixtureRow[];
  season: string | null;
  isOwner: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Prefill new fixtures with the season currently being viewed so adding
  // to an old split from its filtered view does the expected thing.
  const [addForm, setAddForm] = useState<FixtureForm>({ ...EMPTY_FORM, season: season ?? "" });
  const [addStatus, setAddStatus] = useState<FormStatus>({ kind: "idle" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FixtureForm>(EMPTY_FORM);
  const [editStatus, setEditStatus] = useState<FormStatus>({ kind: "idle" });

  const handleAdd = async () => {
    const invalid = validate(addForm);
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
    setAddForm({ ...EMPTY_FORM, season: addForm.season });
    setAddStatus({ kind: "idle" });
    router.refresh();
  };

  const handleSave = async () => {
    if (!editingId) return;
    const invalid = validate(editForm);
    if (invalid) {
      setEditStatus({ kind: "error", message: invalid });
      return;
    }
    setEditStatus({ kind: "saving" });
    const { data, error } = await supabase
      .from("fixtures")
      .update(payloadFor(editForm))
      .eq("id", editingId)
      .select("id")
      .single();
    if (error || data?.id !== editingId) {
      setEditStatus({
        kind: "error",
        message: error ? messageFor(error) : "No matching fixture row was updated.",
      });
      return;
    }
    setEditingId(null);
    setEditStatus({ kind: "idle" });
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    setEditStatus({ kind: "saving" });
    const { error } = await supabase.from("fixtures").delete().eq("id", id);
    if (error) {
      setEditStatus({ kind: "error", message: messageFor(error) });
      return;
    }
    if (editingId === id) setEditingId(null);
    setEditStatus({ kind: "idle" });
    router.refresh();
  };

  return (
    <div className="card-brand overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="label-dash">Admin — manage fixtures</span>
        <span aria-hidden="true" className="text-steel">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-6 border-t border-line px-4 py-4">
          {isOwner ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-white">Add fixture</p>
              <FixtureFields form={addForm} onChange={setAddForm} />
              {addStatus.kind === "error" && (
                <p role="alert" className="text-sm text-red-400">
                  {addStatus.message}
                </p>
              )}
              <button
                type="button"
                onClick={handleAdd}
                disabled={addStatus.kind === "saving"}
                className={`${buttonClass} w-fit bg-gold text-navy`}
              >
                {addStatus.kind === "saving" ? "Adding…" : "Add fixture"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-steel">Some league configuration is owner-only.</p>
          )}

          {fixtures.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-white">Existing fixtures</p>
              {fixtures.map((fixture) => {
                const meta = stageMeta(fixture.stage);
                const isEditing = editingId === fixture.id;
                return (
                  <div key={fixture.id} className="rounded border border-line/60 bg-navy/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-steel">
                        <span className="font-semibold text-white">{meta.label}</span>
                        {" · "}
                        {fixture.team_a ?? "TBD"} vs {fixture.team_b ?? "TBD"}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingId(null);
                            } else {
                              setEditingId(fixture.id);
                              setEditForm(formFor(fixture));
                              setEditStatus({ kind: "idle" });
                            }
                          }}
                          className={`${buttonClass} border border-line bg-panel text-steel hover:text-white`}
                        >
                          {isEditing ? "Cancel" : "Edit"}
                        </button>
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => void handleDelete(fixture.id)}
                            disabled={editStatus.kind === "saving"}
                            className={`${buttonClass} border border-red-400/40 bg-red-500/10 text-red-400`}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    {isEditing && (
                      <div className="mt-3 flex flex-col gap-3">
                        <FixtureFields form={editForm} onChange={setEditForm} />
                        {editStatus.kind === "error" && (
                          <p role="alert" className="text-sm text-red-400">
                            {editStatus.message}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={editStatus.kind === "saving"}
                          className={`${buttonClass} w-fit bg-gold text-navy`}
                        >
                          {editStatus.kind === "saving" ? "Saving…" : "Save fixture"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
