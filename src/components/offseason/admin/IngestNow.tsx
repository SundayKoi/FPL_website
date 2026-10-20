"use client";

// Ingest now: starts the stats ingest on GitHub and follows the run until it
// finishes, then reloads the page so the results, ratings and subs show. The
// server actions check the caller is staff again.

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ingestStatusAction, runIngestAction, type IngestStatusResult } from "@/lib/offseason/actions";
import { ActionMessage, primaryButtonClass, type ActionMessageState, type OffseasonAdminData } from "./shared";

/** How long GitHub gets to list a run the button started before we stop waiting. */
const START_GRACE_MS = 60_000;

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function IngestNow({ data, pollMs = 5000 }: { data: OffseasonAdminData; pollMs?: number }) {
  const router = useRouter();
  const waiting = data.games.filter((game) => game.riot_match_id && !game.ingested_at).length;
  const [status, setStatus] = useState<IngestStatusResult | null>(null);
  // Set from a click until GitHub lists the new run: the id of the run before it, and when.
  const [started, setStarted] = useState<{ before: number | null; at: number } | null>(null);
  const [clicking, setClicking] = useState(false);
  const [message, setMessage] = useState<ActionMessageState>(null);

  const run = status?.ok ? status.run : null;
  const starting = started !== null && (run?.id ?? null) === started.before;
  const running = starting || (run !== null && run.status !== "completed");

  useEffect(() => {
    let live = true;
    ingestStatusAction().then((next) => live && setStatus(next));
    return () => {
      live = false;
    };
  }, []);

  // Follow a run until it completes, then reload the page's data.
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(async () => {
      const next = await ingestStatusAction();
      setStatus(next);
      if (!next.ok) {
        // The summary shows the error.
        setStarted(null);
        return;
      }
      const latest = next.run;
      if (started && (latest?.id ?? null) === started.before) {
        if (Date.now() - started.at > START_GRACE_MS) {
          setStarted(null);
          setMessage({ kind: "error", text: "GitHub hasn't started the run. Check the Actions page." });
        }
        return;
      }
      setStarted(null);
      if (latest && latest.status === "completed") {
        setMessage(
          latest.conclusion === "success"
            ? { kind: "done", text: "Stats are in." }
            : { kind: "error", text: "The ingest didn't finish cleanly. A game that failed says why on its row." },
        );
        router.refresh();
      }
    }, pollMs);
    return () => window.clearTimeout(timer);
  }, [status, running, started, router, pollMs]);

  const start = async () => {
    setClicking(true);
    setMessage(null);
    const result = await runIngestAction();
    setClicking(false);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    setStarted({ before: run?.id ?? null, at: Date.now() });
  };

  let summary: ReactNode;
  if (!status) summary = "Checking the last run…";
  else if (!status.ok) summary = <span className="text-danger">{status.error}</span>;
  else if (!status.configured)
    summary = (
      <>
        The button needs GITHUB_ACTIONS_TOKEN on the site. Until then, run{" "}
        <a href={status.workflowUrl} target="_blank" rel="noreferrer" className="text-action-text hover:text-white">
          Ingest offseason games
        </a>{" "}
        on GitHub.
      </>
    );
  else if (starting) summary = "Starting on GitHub…";
  else if (running) summary = "Running on GitHub, usually a minute or two. The page updates when it's done.";
  else
    summary = `${waiting === 0 ? "No games" : waiting === 1 ? "1 game" : `${waiting} games`} waiting for stats.${
      run ? ` Last run ${run.conclusion === "success" ? "succeeded" : (run.conclusion ?? "ended")} ${when(run.createdAt)}.` : ""
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <button
        type="button"
        disabled={!status?.ok || !status.configured || clicking || running || waiting === 0}
        className={primaryButtonClass}
        onClick={start}
      >
        {running ? "Ingesting…" : "Ingest now"}
      </button>
      <span className="text-xs text-muted">{summary}</span>
      {run ? (
        <a href={run.url} target="_blank" rel="noreferrer" className="text-xs text-action-text hover:text-white">
          View run
        </a>
      ) : null}
      <ActionMessage message={message} />
    </div>
  );
}
