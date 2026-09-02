"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { stageMeta, teamLabel, hasResult } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";
import { buildCodeImportPreview, parseTournamentCodes, type CodeImportPreview } from "@/lib/captain/codeImport";

type Status =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "preview" }
  | { kind: "saving" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function unusedLabel(unusedCount: number): string {
  return `${unusedCount} unused code${unusedCount === 1 ? "" : "s"}`;
}

export default function AdminCodeImporter({
  fixtures,
  season,
}: {
  fixtures: FixtureRow[];
  season: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [preview, setPreview] = useState<CodeImportPreview | null>(null);
  const [parsedCodes, setParsedCodes] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileRequestToken = useRef(0);
  const saving = useRef(false);

  const hasTargets = fixtures.some((fixture) => !hasResult(fixture));
  const isBusy = status.kind === "parsing" || status.kind === "saving";

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (saving.current) return;

    const requestToken = ++fileRequestToken.current;
    const file = event.target.files?.[0];
    if (!file) {
      setPreview(null);
      setParsedCodes([]);
      setStatus({ kind: "idle" });
      return;
    }

    setStatus({ kind: "parsing" });

    try {
      const input = await file.text();
      if (requestToken !== fileRequestToken.current) return;

      const codes = parseTournamentCodes(input);
      const nextPreview = buildCodeImportPreview(fixtures, codes);

      if (nextPreview.fixtures.length === 0) {
        throw new Error("No open fixtures this season to import codes for.");
      }

      setParsedCodes(codes);
      setPreview(nextPreview);
      setStatus({ kind: "preview" });
    } catch (error) {
      if (requestToken !== fileRequestToken.current) return;

      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not parse the uploaded file.",
      });
    }
  };

  const handleConfirm = async () => {
    if (saving.current || status.kind === "parsing" || status.kind === "saving") return;

    if (!preview || parsedCodes.length === 0) {
      setStatus({ kind: "error", message: "Upload a file to preview before confirming the import." });
      return;
    }

    saving.current = true;
    setStatus({ kind: "saving" });

    const { data, error } = await supabase.rpc("bulk_replace_match_codes", {
      p_season: season,
      p_fixture_ids: preview.fixtures.map((fixture) => fixture.fixtureId),
      p_codes: parsedCodes,
    });
    saving.current = false;

    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }

    const inserted = (data as number | null) ?? 0;
    const fixtureCount = preview.fixtures.length;
    setStatus({
      kind: "success",
      message: `Populated ${fixtureCount} fixture${fixtureCount === 1 ? "" : "s"} with ${inserted} code${inserted === 1 ? "" : "s"}. ${unusedLabel(preview.unusedCount)} ${preview.unusedCount === 1 ? "was" : "were"} left unused.`,
    });
    router.refresh();
  };

  if (!hasTargets) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3 border-t border-border-subtle pt-3">
      <div className="flex flex-col gap-1">
        <h3 className="label-dash">Bulk code import</h3>
        <p className="text-xs text-muted">
          Upload a `.csv` or `.txt` file with tournament codes in order. We&apos;ll preview the open fixtures before
          replacing anything.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Upload tournament code file
        <input
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          disabled={isBusy}
          onChange={(event) => {
            void handleFileChange(event);
          }}
          className="rounded border border-dashed border-border-subtle bg-canvas px-2 py-2 text-sm text-white file:mr-3 file:rounded-full file:border-0 file:bg-action-fill file:px-3 file:py-1.5 file:text-xs file:font-semibold file:uppercase file:tracking-wide file:text-white"
        />
      </label>

      {status.kind === "parsing" && (
        <p role="status" className="text-sm text-muted">
          Parsing file…
        </p>
      )}

      {status.kind === "error" && (
        <p role="alert" className="text-sm text-red-400">
          {status.message}
        </p>
      )}

      {(status.kind === "success" || status.kind === "saving") && (
        <p role="status" className={status.kind === "success" ? "text-sm font-semibold text-success" : "text-sm text-muted"}>
          {status.kind === "success" ? status.message : "Saving imported codes…"}
        </p>
      )}

      {preview && (
        <div className="rounded border border-border-subtle/60 bg-canvas/40">
          <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle/60 px-3 py-2 text-xs text-muted">
            <span>
              {preview.fixtures.length} fixture{preview.fixtures.length === 1 ? "" : "s"} · {preview.requiredCodeCount} required
              codes
            </span>
            <span>{unusedLabel(preview.unusedCount)} will be ignored.</span>
          </div>
          <div className="overflow-x-auto">
            <table aria-label="Import preview" className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle/60">
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Fixture
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Matchup
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Codes
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.fixtures.map((fixture) => (
                  <tr key={fixture.fixtureId} className="border-t border-border-subtle/40 align-top">
                    <td className="px-3 py-2 text-white">{stageMeta(fixture.stage).label}</td>
                    <td className="px-3 py-2 text-muted">
                      {teamLabel(fixture.teamA)} vs {teamLabel(fixture.teamB)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-white">{fixture.codes.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border-subtle/60 px-3 py-3">
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={isBusy}
              className="w-fit rounded-full bg-action-fill px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
            >
              {status.kind === "saving" ? "Importing…" : "Confirm import"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
