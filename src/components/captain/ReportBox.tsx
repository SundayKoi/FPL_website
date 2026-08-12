"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { parseReport } from "@/lib/matches/parseReport";
import type { LeagueTeam } from "@/lib/matches/types";
import { submitReport, type MyReportRow } from "@/lib/captain/queries";

const MATCH_ID_RE = /^NA1_\d+$/;
const PHASES = ["Regular", "Playoffs"] as const;

const inputClass =
  "rounded border border-line bg-navy px-2 py-1.5 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none";

const STATUS_STYLES: Record<string, string> = {
  pending: "border-steel/50 text-steel",
  ingested: "border-gold/50 text-gold",
  needs_sides: "border-amber-400/60 text-amber-300",
  needs_side: "border-amber-400/60 text-amber-300",
  failed: "border-red-400/60 text-red-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${STATUS_STYLES[status] ?? "border-line text-steel"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

interface GameFormRow {
  key: string;
  gameNumber: number;
  matchId: string;
  blueTeamId: string | null;
}

interface ReportForm {
  season: string;
  phase: string;
  teamAId: string;
  teamBId: string;
  scoreA: string;
  scoreB: string;
  draftUrl: string;
  games: GameFormRow[];
}

function makeKey(): string {
  return Math.random().toString(36).slice(2);
}

function emptyForm(defaults: {
  season: string;
  phase: string;
  teamAId: string | null;
  teamBId: string | null;
}): ReportForm {
  return {
    season: defaults.season,
    phase: defaults.phase,
    teamAId: defaults.teamAId ?? "",
    teamBId: defaults.teamBId ?? "",
    scoreA: "",
    scoreB: "",
    draftUrl: "",
    games: [],
  };
}

/**
 * Section 3 of the captain page: the Discord-paste parser + editable form
 * (Task 3's parseReport, pre-filled from the resolved fixture), plus the
 * captain's own reports with status badges and the needs-sides fixer. See
 * docs/superpowers/specs/2026-08-11-match-reporting-auto-ingest-design.md
 * ("Reporting UI" + "Side resolution") and the captains-page-design.md
 * ("Report result" section 3).
 */
export default function ReportBox({
  teams,
  defaultSeason,
  defaultPhase,
  fixtureId,
  prefillTeamAId,
  prefillTeamBId,
  myReports,
}: {
  teams: LeagueTeam[];
  defaultSeason: string;
  defaultPhase: string;
  fixtureId: string | null;
  prefillTeamAId: string | null;
  prefillTeamBId: string | null;
  myReports: MyReportRow[];
}) {
  const supabase = createClient();
  const router = useRouter();

  const [pasteText, setPasteText] = useState("");
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [form, setForm] = useState<ReportForm>(() =>
    emptyForm({ season: defaultSeason, phase: defaultPhase, teamAId: prefillTeamAId, teamBId: prefillTeamBId })
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fixerBusy, setFixerBusy] = useState<string | null>(null);

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "Unknown team";
  const teamAbbr = (id: string | null) => teams.find((t) => t.id === id)?.abbreviation ?? "—";

  const handleParse = () => {
    const parsed = parseReport(pasteText, teams);
    setForm((prev) => ({
      ...prev,
      teamAId: parsed.teamAId ?? prev.teamAId,
      teamBId: parsed.teamBId ?? prev.teamBId,
      scoreA: parsed.scoreA !== null ? String(parsed.scoreA) : prev.scoreA,
      scoreB: parsed.scoreB !== null ? String(parsed.scoreB) : prev.scoreB,
      draftUrl: parsed.draftUrl ?? prev.draftUrl,
      games:
        parsed.games.length > 0
          ? parsed.games.map((g) => ({ key: makeKey(), gameNumber: g.gameNumber, matchId: g.matchId, blueTeamId: null }))
          : prev.games,
    }));
    setParseWarnings(parsed.warnings);
    setErrors([]);
    setSuccess(false);
  };

  const updateGame = (key: string, patch: Partial<GameFormRow>) => {
    setForm((prev) => ({ ...prev, games: prev.games.map((g) => (g.key === key ? { ...g, ...patch } : g)) }));
  };

  const removeGame = (key: string) => {
    setForm((prev) => ({ ...prev, games: prev.games.filter((g) => g.key !== key) }));
  };

  const addGame = () => {
    setForm((prev) => ({
      ...prev,
      games: [...prev.games, { key: makeKey(), gameNumber: prev.games.length + 1, matchId: "", blueTeamId: null }],
    }));
  };

  const handleSubmit = async () => {
    const problems: string[] = [];
    if (!form.teamAId || !form.teamBId) problems.push("Pick both teams.");
    else if (form.teamAId === form.teamBId) problems.push("Teams must be different.");
    if (form.games.length === 0) problems.push("Add at least one game.");

    const trimmedIds = form.games.map((g) => g.matchId.trim());
    trimmedIds.forEach((id, i) => {
      if (!MATCH_ID_RE.test(id)) {
        problems.push(`Game ${form.games[i].gameNumber}: match id must look like NA1_1234567890.`);
      }
    });
    const dupes = Array.from(new Set(trimmedIds.filter((id, i) => id && trimmedIds.indexOf(id) !== i)));
    if (dupes.length > 0) problems.push(`Duplicate match id(s) in this form: ${dupes.join(", ")}.`);

    const scoreA = Number(form.scoreA);
    const scoreB = Number(form.scoreB);
    const scoresValid =
      form.scoreA.trim() !== "" &&
      form.scoreB.trim() !== "" &&
      Number.isInteger(scoreA) &&
      Number.isInteger(scoreB) &&
      scoreA >= 0 &&
      scoreB >= 0;
    if (!scoresValid) problems.push("Enter a whole-number score for each team.");

    if (problems.length === 0) {
      const [existingGames, existingStats] = await Promise.all([
        supabase.from("match_report_games").select("match_id").in("match_id", trimmedIds),
        supabase.from("raw_stats").select("match_id").in("match_id", trimmedIds),
      ]);
      const already = new Set([
        ...((existingGames.data ?? []) as { match_id: string }[]).map((r) => r.match_id),
        ...((existingStats.data ?? []) as { match_id: string }[]).map((r) => r.match_id),
      ]);
      if (already.size > 0) problems.push(`Already reported: ${Array.from(already).join(", ")}.`);
    }

    if (problems.length > 0) {
      setErrors(problems);
      setSuccess(false);
      return;
    }

    setSubmitting(true);
    setErrors([]);
    try {
      await submitReport(supabase, {
        season: form.season,
        phase: form.phase,
        teamAId: form.teamAId,
        teamBId: form.teamBId,
        scoreA,
        scoreB,
        draftUrl: form.draftUrl.trim() || null,
        fixtureId,
        games: form.games.map((g) => ({
          gameNumber: g.gameNumber,
          matchId: g.matchId.trim(),
          blueTeamId: g.blueTeamId,
        })),
      });
      setPasteText("");
      setParseWarnings([]);
      setForm(emptyForm({ season: defaultSeason, phase: defaultPhase, teamAId: prefillTeamAId, teamBId: prefillTeamBId }));
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setSuccess(false);
      setErrors([err instanceof Error ? err.message : "Could not submit the report."]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFixSide = async (gameId: string, blueTeamId: string) => {
    setFixerBusy(gameId);
    const { error } = await supabase
      .from("match_report_games")
      .update({ blue_team_id: blueTeamId, status: "pending" })
      .eq("id", gameId);
    setFixerBusy(null);
    if (!error) router.refresh();
  };

  return (
    <section className="card-brand p-5">
      <h2 className="label-dash">Report a result</h2>

      <div className="mt-3 flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs text-steel">
          Paste your Discord report
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder={"MIC 3-0 BBC\nhttps://drafter.lol/draft/T4cB_WHp?game=1 5568297187"}
            className={`${inputClass} font-mono`}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleParse}
            disabled={!pasteText.trim()}
            className="w-fit rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:text-white disabled:opacity-50"
          >
            Parse paste
          </button>
          <span className="text-xs text-steel">Fills in the form below — nothing is submitted yet.</span>
        </div>
        {parseWarnings.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs text-amber-300">
            {parseWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-steel">
          Season
          <input
            value={form.season}
            onChange={(e) => setForm((p) => ({ ...p, season: e.target.value }))}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Phase
          <select
            value={form.phase}
            onChange={(e) => setForm((p) => ({ ...p, phase: e.target.value }))}
            className={inputClass}
          >
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Team A
          <select
            value={form.teamAId}
            onChange={(e) => setForm((p) => ({ ...p, teamAId: e.target.value }))}
            className={inputClass}
          >
            <option value="">Select…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Team B
          <select
            value={form.teamBId}
            onChange={(e) => setForm((p) => ({ ...p, teamBId: e.target.value }))}
            className={inputClass}
          >
            <option value="">Select…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Score A
          <input
            inputMode="numeric"
            value={form.scoreA}
            onChange={(e) => setForm((p) => ({ ...p, scoreA: e.target.value }))}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Score B
          <input
            inputMode="numeric"
            value={form.scoreB}
            onChange={(e) => setForm((p) => ({ ...p, scoreB: e.target.value }))}
            className={inputClass}
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs text-steel">
          Draft URL (optional)
          <input
            value={form.draftUrl}
            onChange={(e) => setForm((p) => ({ ...p, draftUrl: e.target.value }))}
            placeholder="https://drafter.lol/draft/…"
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-steel">Games</p>
        {form.games.length === 0 && <p className="text-sm text-steel">No games yet — parse a paste or add one.</p>}
        {form.games.map((g) => (
          <div key={g.key} className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-steel">Game {g.gameNumber}</span>
            <input
              value={g.matchId}
              onChange={(e) => updateGame(g.key, { matchId: e.target.value })}
              placeholder="NA1_1234567890"
              className={`${inputClass} min-w-0 flex-1 font-mono`}
            />
            <select
              value={g.blueTeamId ?? ""}
              onChange={(e) => updateGame(g.key, { blueTeamId: e.target.value || null })}
              className={inputClass}
            >
              <option value="">Auto-detect</option>
              {form.teamAId && <option value={form.teamAId}>{teamName(form.teamAId)} blue</option>}
              {form.teamBId && <option value={form.teamBId}>{teamName(form.teamBId)} blue</option>}
            </select>
            <button
              type="button"
              onClick={() => removeGame(g.key)}
              className="shrink-0 text-xs font-semibold text-steel hover:text-red-400"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addGame}
          className="w-fit rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:text-white"
        >
          + Add game
        </button>
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="mt-3 flex flex-col gap-1 text-sm text-red-400">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {success && <p className="mt-3 text-sm font-semibold text-emerald-400">Report submitted.</p>}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting}
        className="mt-4 rounded-full bg-gold px-4 py-2 text-xs font-semibold uppercase tracking-wide text-navy disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit report"}
      </button>

      <div className="mt-6 border-t border-line pt-4">
        <h3 className="label-dash">My reports</h3>
        {myReports.length === 0 ? (
          <p className="mt-3 text-sm text-steel">No reports submitted yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {myReports.map((r) => (
              <li key={r.id} className="rounded border border-line/60 bg-navy/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-white">
                    {teamAbbr(r.team_a_id)} {r.score_a}–{r.score_b} {teamAbbr(r.team_b_id)}
                  </span>
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-steel">
                    {r.season_phase} · {r.season}
                  </span>
                </div>
                {r.error_text && <p className="mt-1 text-xs text-red-400">{r.error_text}</p>}
                {r.warning_text && <p className="mt-1 text-xs text-amber-300">{r.warning_text}</p>}
                <ul className="mt-2 flex flex-col gap-1.5">
                  {r.games.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="w-16 shrink-0 text-steel">Game {g.game_number}</span>
                      <code className="text-steel">{g.match_id}</code>
                      <StatusBadge status={g.status} />
                      {g.status === "needs_side" && (
                        <select
                          disabled={fixerBusy === g.id}
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) void handleFixSide(g.id, e.target.value);
                          }}
                          className="rounded border border-line bg-navy px-1.5 py-0.5 text-xs text-white"
                        >
                          <option value="" disabled>
                            Which side was blue?
                          </option>
                          <option value={r.team_a_id}>{teamName(r.team_a_id)}</option>
                          <option value={r.team_b_id}>{teamName(r.team_b_id)}</option>
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
