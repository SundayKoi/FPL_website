"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishPlayoffRound, savePlayoffPolicy, type PlayoffActionResult } from "@/app/schedule/actions";
import type { PlayoffPublishPayload } from "@/lib/schedule/previewPayload";
import type { PlayoffPolicy22, PlayoffPolicy40 } from "@/lib/schedule/playoffs";

export interface PlayoffAdminPreview {
  stage: "semifinals" | "finals";
  status: "ready" | "blocked";
  blockingReason: string | null;
  matches: { sortOrder: number; teamA: { name: string }; teamB: { name: string } }[];
  results: {
    fixtureId: string;
    status: "ready" | "blocked";
    winnerName: string | null;
    scoreA: number | null;
    scoreB: number | null;
    provisional: boolean;
    blockingReason: string | null;
    warnings: string[];
  }[];
}

export interface PlayoffRoundPanelData {
  preview: PlayoffAdminPreview;
  payload: PlayoffPublishPayload;
}

function resultLine(result: PlayoffAdminPreview["results"][number]) {
  if (result.status === "blocked") return `${result.fixtureId}: ${result.blockingReason}`;
  return `${result.fixtureId}: ${result.winnerName} wins ${result.scoreA}–${result.scoreB}${result.provisional ? " · provisional report" : ""}`;
}

function RoundPreview({
  title,
  data,
  disabled,
  onPublish,
}: {
  title: string;
  data: PlayoffRoundPanelData;
  disabled: boolean;
  onPublish: () => void;
}) {
  return (
    <section className="rounded border border-border-subtle/70 bg-canvas/50 p-4" aria-label={`${title} preview`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className={`mt-1 text-xs ${data.preview.status === "ready" ? "text-mint" : "text-amber-300"}`}>
            {data.preview.status === "ready" ? "Ready to publish" : data.preview.blockingReason}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || data.preview.status !== "ready"}
          onClick={onPublish}
          className="rounded-full bg-action-fill px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          Publish {title}
        </button>
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-xs text-muted">
        {data.preview.results.map((result) => <li key={result.fixtureId}>{resultLine(result)}</li>)}
      </ul>
      {data.preview.matches.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {data.preview.matches.map((match) => (
            <li key={match.sortOrder} className="rounded border border-border-subtle px-3 py-2 text-sm text-white">
              Match {match.sortOrder + 1}: {match.teamA.name} vs {match.teamB.name}
            </li>
          ))}
        </ul>
      ) : null}
      {data.preview.results.flatMap((result) => result.warnings.map((warning, index) => (
        <p key={`${result.fixtureId}-warning-${index}`} className="mt-2 text-xs text-amber-300">{warning}</p>
      )))}
    </section>
  );
}

export default function PlayoffAdminPanel({
  season,
  configVersion,
  pairing22,
  pairing40,
  semifinals,
  finals,
}: {
  season: string;
  configVersion: number;
  pairing22: PlayoffPolicy22 | null;
  pairing40: PlayoffPolicy40 | null;
  semifinals: PlayoffRoundPanelData;
  finals: PlayoffRoundPanelData;
}) {
  const router = useRouter();
  const [next22, setNext22] = useState<PlayoffPolicy22 | "">(pairing22 ?? "");
  const [next40, setNext40] = useState<PlayoffPolicy40 | "">(pairing40 ?? "");
  const [status, setStatus] = useState<PlayoffActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const savePolicy = () => startTransition(async () => {
    const result = await savePlayoffPolicy(season, next22 || null, next40 || null);
    setStatus(result);
    if (result.ok) router.refresh();
  });

  const publish = (data: PlayoffRoundPanelData) => startTransition(async () => {
    const result = await publishPlayoffRound(season, data.preview.stage, data.payload);
    setStatus(result);
    if (result.ok) router.refresh();
  });

  return (
    <section className="card-brand p-5" aria-labelledby="premier-playoffs-admin-heading">
      <span className="label-dash">Premier S5 · Playoffs</span>
      <h2 id="premier-playoffs-admin-heading" className="type-display mt-2 text-2xl">Review advancement</h2>
      <p className="mt-2 text-sm text-muted">Previews use frozen seeds and current fixture/report evidence. Publishing rechecks the preview atomically and preserves each scheduled fixture ID.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          2 Solari / 2 Lunari survivor policy
          <select value={next22} onChange={(event) => setNext22(event.target.value as PlayoffPolicy22 | "")} className="input-brand px-2 py-1.5 text-sm">
            <option value="">Needs league ruling</option>
            <option value="solari_high_vs_lunari_low">Top Solari vs lower Lunari; top Lunari vs lower Solari</option>
            <option value="solari_high_vs_lunari_high">Top seed from each division meet</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          4 same-division survivor policy
          <select value={next40} onChange={(event) => setNext40(event.target.value as PlayoffPolicy40 | "")} className="input-brand px-2 py-1.5 text-sm">
            <option value="">Needs league ruling</option>
            <option value="outer_seeds">Outer seeds (1 vs 4, 2 vs 3)</option>
            <option value="adjacent_seeds">Adjacent seeds (1 vs 2, 3 vs 4)</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={isPending} onClick={savePolicy} className="rounded-full border border-action-text/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-action-text disabled:opacity-50">
          Save pairing policy
        </button>
        <span className="text-xs text-muted">Configuration version {configVersion}</span>
      </div>

      {status ? <p role={status.ok ? "status" : "alert"} className={`mt-3 text-sm ${status.ok ? "text-mint" : "text-red-400"}`}>{status.message}</p> : null}
      <div className="mt-5 flex flex-col gap-3">
        <RoundPreview title="Semifinals" data={semifinals} disabled={isPending} onPublish={() => publish(semifinals)} />
        <RoundPreview title="Finals" data={finals} disabled={isPending} onPublish={() => publish(finals)} />
      </div>
    </section>
  );
}
