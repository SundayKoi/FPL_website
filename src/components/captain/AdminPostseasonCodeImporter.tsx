"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { stageMeta, teamLabel } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";
import type { LeagueTeam } from "@/lib/matches/types";
import type { MatchCode } from "@/lib/captain/queries";
import type { LeagueKey } from "@/lib/players/identity";
import {
  buildPostseasonCodePreview,
  parseTournamentCodes,
  type PostseasonCodePreview,
  type PostseasonCodeScope,
  type PostseasonExistingCodeSnapshot,
  type PostseasonSkipReason,
} from "@/lib/captain/codeImport";

type Status =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "preview" }
  | { kind: "saving" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

type RpcSummary = {
  inserted_count?: number;
  fixture_count?: number;
};

const SCOPE_LABELS: Record<PostseasonCodeScope, string> = {
  gauntlet: "Gauntlet",
  playoffs: "Playoffs",
  "all-postseason": "Both",
};

function leagueLabel(league: LeagueKey): string {
  return league === "academy" ? "Academy" : "Premier";
}

function codeList(codes: { gameNumber: number; code: string }[]): string {
  return codes.length === 0 ? "—" : codes.map((code) => `G${code.gameNumber}: ${code.code}`).join(", ");
}

function skippedReason(reason: PostseasonSkipReason): string {
  if (reason === "scored") return "Scored fixture";
  if (reason === "tbd-opponent") return "TBD opponent";
  return "All game slots already assigned";
}

function existingSnapshot(codes: MatchCode[]): PostseasonExistingCodeSnapshot[] {
  return codes
    .filter((code): code is MatchCode & { fixture_id: string } => Boolean(code.fixture_id))
    .map((code) => ({ id: code.id, fixtureId: code.fixture_id, gameNumber: code.game_number, code: code.code }));
}

export default function AdminPostseasonCodeImporter({
  fixtures,
  teams,
  codes,
  league,
  season,
}: {
  fixtures: FixtureRow[];
  teams: LeagueTeam[];
  codes: MatchCode[];
  league: LeagueKey;
  season: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [scope, setScope] = useState<PostseasonCodeScope>("all-postseason");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PostseasonCodePreview | null>(null);
  const [parsedCodes, setParsedCodes] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileRequestToken = useRef(0);
  const saving = useRef(false);
  const isBusy = status.kind === "parsing" || status.kind === "saving";

  const runPreview = (input: string) => {
    try {
      const parsed = parseTournamentCodes(input);
      const nextPreview = buildPostseasonCodePreview(
        fixtures,
        existingSnapshot(codes),
        parsed,
        scope,
        teams,
      );
      setParsedCodes(parsed);
      setPreview(nextPreview);
      setStatus({ kind: "preview" });
    } catch (error) {
      setPreview(null);
      setParsedCodes([]);
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not build the preview." });
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (saving.current) return;
    const requestToken = ++fileRequestToken.current;
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus({ kind: "parsing" });
    try {
      const input = await file.text();
      if (requestToken !== fileRequestToken.current) return;
      setText(input);
      runPreview(input);
    } catch (error) {
      if (requestToken !== fileRequestToken.current) return;
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not read the uploaded file." });
    }
  };

  const handleScopeChange = (nextScope: PostseasonCodeScope) => {
    setScope(nextScope);
    setPreview(null);
    setParsedCodes([]);
    setStatus({ kind: "idle" });
  };

  const handleSave = async () => {
    if (saving.current || !preview || parsedCodes.length === 0 || preview.assignments.length === 0) return;

    saving.current = true;
    setStatus({ kind: "saving" });
    const { data, error } = await supabase.rpc("populate_postseason_match_codes", {
      p_league: league,
      p_season: season,
      p_scope: preview.scope,
      p_expected_fixtures: preview.fixtureSnapshot,
      p_expected_codes: preview.existingCodeSnapshot,
      p_assignments: preview.assignments,
      p_codes: parsedCodes,
      p_expected_missing_slots: preview.requiredCodeCount,
    });
    saving.current = false;

    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }

    const summary = (data as RpcSummary | null) ?? {};
    const inserted = summary.inserted_count ?? preview.assignments.length;
    const fixturesWritten = summary.fixture_count ?? new Set(preview.assignments.map((assignment) => assignment.fixtureId)).size;
    setStatus({
      kind: "success",
      message: `Populated ${inserted} game code${inserted === 1 ? "" : "s"} across ${fixturesWritten} fixture${fixturesWritten === 1 ? "" : "s"}. ${preview.unusedCount} unused code${preview.unusedCount === 1 ? " was" : "s were"} left unused. Match codes refreshed.`,
    });
    router.refresh();
  };

  return (
    <section className="flex flex-col gap-3 border-t border-border-subtle pt-4" aria-labelledby="postseason-code-title">
      <div className="flex flex-col gap-1">
        <h3 id="postseason-code-title" className="label-dash">Populate postseason codes</h3>
        <p className="text-xs text-muted">
          {leagueLabel(league)} · {season || "No season configured"}. Assigns only missing game slots for the selected
          postseason rounds and preserves every code already issued.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Rounds
          <select
            value={scope}
            disabled={isBusy}
            onChange={(event) => handleScopeChange(event.target.value as PostseasonCodeScope)}
            className="input-brand px-2 py-1.5 text-sm"
          >
            {(Object.keys(SCOPE_LABELS) as PostseasonCodeScope[]).map((value) => (
              <option key={value} value={value}>{SCOPE_LABELS[value]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Upload `.txt` or `.csv`
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            disabled={isBusy}
            onChange={(event) => { void handleFileChange(event); }}
            className="rounded border border-dashed border-border-subtle bg-canvas px-2 py-2 text-sm text-white file:mr-3 file:rounded-full file:border-0 file:bg-action-fill file:px-3 file:py-1.5 file:text-xs file:font-semibold file:uppercase file:tracking-wide file:text-white"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Tournament codes
        <textarea
          value={text}
          disabled={isBusy}
          onChange={(event) => {
            setText(event.target.value);
            setPreview(null);
            setParsedCodes([]);
            setStatus({ kind: "idle" });
          }}
          rows={5}
          placeholder={"Paste one code per line, or comma-separated CSV values"}
          className="rounded border border-border-strong bg-canvas px-2 py-1.5 font-mono text-sm text-white placeholder:text-muted/60 focus:border-action-text focus:outline-none"
        />
      </label>

      {status.kind === "parsing" && <p role="status" className="text-sm text-muted">Parsing file…</p>}
      {status.kind === "error" && <p role="alert" className="text-sm text-red-400">{status.message}</p>}
      {status.kind === "success" && <p role="status" className="text-sm font-semibold text-success">{status.message}</p>}
      {status.kind === "saving" && <p role="status" className="text-sm text-muted">Saving reviewed assignments…</p>}

      <button
        type="button"
        disabled={isBusy || !text.trim()}
        onClick={() => runPreview(text)}
        className="w-fit rounded-full border border-action-text/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-action-text disabled:opacity-50"
      >
        Preview assignments
      </button>

      {preview && (
        <div className="rounded border border-border-subtle/60 bg-canvas/40">
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border-subtle/60 px-3 py-2 text-xs text-muted">
            <span>{leagueLabel(league)} · {season}</span>
            <span>{SCOPE_LABELS[preview.scope]}</span>
            <span>{preview.requiredCodeCount} missing slots</span>
            <span>{preview.existingCodeCount} existing assignments</span>
            <span>{preview.unusedCount} unused input codes</span>
          </div>

          <div className="overflow-x-auto">
            <table aria-label="Postseason assignment preview" className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle/60">
                  {['Round', 'Matchup', 'Format', 'Existing', 'Missing', 'New assignments'].map((heading) => (
                    <th key={heading} className="px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.fixtures.map((fixture) => (
                  <tr key={fixture.fixtureId} className="border-t border-border-subtle/40 align-top">
                    <td className="px-3 py-2 text-white">{stageMeta(fixture.stage).label}</td>
                    <td className="px-3 py-2 text-muted">{teamLabel(fixture.teamA)} vs {teamLabel(fixture.teamB)}</td>
                    <td className="px-3 py-2 text-muted">Bo{fixture.bestOf}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">{codeList(fixture.existing)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gold">{fixture.missingGameNumbers.length ? fixture.missingGameNumbers.map((game) => `G${game}`).join(", ") : "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-white">{codeList(fixture.assignments)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.skippedFixtures.length > 0 && (
            <div className="border-t border-border-subtle/60 px-3 py-3">
              <p className="label-dash">Skipped fixtures</p>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
                {preview.skippedFixtures.map((fixture) => (
                  <li key={fixture.fixtureId}>
                    {stageMeta(fixture.stage).label} · {teamLabel(fixture.teamA)} vs {teamLabel(fixture.teamB)} · {skippedReason(fixture.reason)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-border-subtle/60 px-3 py-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isBusy || preview.assignments.length === 0}
              className="w-fit rounded-full bg-action-fill px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
            >
              {status.kind === "saving" ? "Populating…" : "Populate codes"}
            </button>
            {preview.assignments.length === 0 && <p className="mt-2 text-xs text-muted">There are no missing eligible slots in this selection.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
