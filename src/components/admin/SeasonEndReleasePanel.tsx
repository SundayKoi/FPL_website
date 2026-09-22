"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveSeasonEndTestAction, createSeasonEndDraftAction, pauseSeasonEndReleaseAction, rebuildSeasonEndDraftAction, recordSeasonEndVerificationReportAction, setSeasonEndReleaseStateAction } from "@/lib/season-end/actions";
import SeasonEndPackShop from "@/components/cards/SeasonEndPackShop";
import type { SeasonEndCatalog } from "@/lib/season-end/collectibles";
import type { SeasonEndRelease } from "@/lib/season-end/release-queries";

export default function SeasonEndReleasePanel({
  league,
  season,
  release,
  catalog,
  viewerId = null,
}: {
  league: "premier" | "academy";
  season: string;
  release: SeasonEndRelease | null;
  catalog: SeasonEndCatalog | null;
  viewerId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reportJson, setReportJson] = useState("");
  const run = (task: () => Promise<{ ok: boolean; error?: string }>) => startTransition(async () => {
    const result = await task();
    if (!result.ok) window.alert(result.error ?? "The release action failed.");
    else router.refresh();
  });
  const recordReport = () => {
    let report: Record<string, unknown>;
    try {
      report = JSON.parse(reportJson) as Record<string, unknown>;
    } catch {
      window.alert("Paste a valid JSON report first.");
      return;
    }
    const reportDigest = typeof report.reportDigest === "string" ? report.reportDigest : "";
    run(() => recordSeasonEndVerificationReportAction({ releaseId: release?.id ?? "", revisionDigest: release?.revisionDigest ?? "", reportDigest, report }));
  };

  return (
    <section className="card-brand flex flex-col gap-4 p-5" data-testid="season-end-release-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-dash text-gold">Release control · {league} · {season}</p>
          <h2 className="type-display mt-2 text-3xl">Season&apos;s End pack release</h2>
          <p className="mt-2 max-w-3xl text-sm text-steel">Drafts are closed by default. Test openings use a virtual wallet and isolated inventory; publication is a separate, explicit staff action.</p>
        </div>
        {release ? <span className="rounded-full border border-gold/60 px-3 py-1 text-xs font-bold uppercase tracking-[.14em] text-gold">{release.state}{release.paused ? " · paused" : ""}</span> : null}
      </div>
      {!release ? (
        <button type="button" disabled={pending} onClick={() => run(() => createSeasonEndDraftAction({ league, season }))} className="w-fit rounded border border-gold px-4 py-2 text-sm text-gold disabled:opacity-50">{pending ? "Building catalog…" : "Build draft catalog"}</button>
      ) : (
        <>
          <div className="grid gap-3 text-sm text-steel sm:grid-cols-4">
            <p><span className="text-white">Price</span><br />{release.price.toLocaleString("en-US")} betting dollars</p>
            <p><span className="text-white">Catalog</span><br />{catalog?.designs.length ?? 0} designs</p>
            <p><span className="text-white">Hash</span><br /><code>{release.catalogHash || "not locked"}</code></p>
            <p><span className="text-white">Rules</span><br />{release.rulesVersion}</p>
          </div>
          <details className="text-sm text-steel">
            <summary className="cursor-pointer text-white">Frozen release evidence</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <p>Revision digest<br /><code className="break-all text-xs text-gold">{release.revisionDigest || "not recorded"}</code></p>
              <p>Economy contract<br /><code className="text-xs text-gold">{release.economyVersion || "not recorded"}</code></p>
              <p>Signing-book entries<br />{release.signingBook.length}</p>
              <p>Source completeness<br /><code className="text-xs text-gold">{JSON.stringify(release.sourceCompleteness)}</code></p>
            </div>
            {release.signatureCalibration ? <pre className="mt-3 max-h-56 overflow-auto rounded border border-line bg-panel p-3 text-[11px]">{JSON.stringify(release.signatureCalibration, null, 2)}</pre> : null}
            {release.verificationReport ? <pre className="mt-3 max-h-56 overflow-auto rounded border border-gold/40 bg-gold/5 p-3 text-[11px] text-gold">{JSON.stringify(release.verificationReport, null, 2)}</pre> : <p className="mt-3 text-coral">No exact-revision admin-test evidence has been recorded yet.</p>}
          </details>
          {catalog?.withheldAwards.length ? <details className="text-sm text-steel"><summary className="cursor-pointer text-coral">{catalog.withheldAwards.length} withheld awards</summary><ul className="mt-2 list-disc pl-5">{catalog.withheldAwards.map((award) => <li key={award.awardId}>{award.title}: {award.reason}</li>)}</ul></details> : null}
          <div className="flex flex-wrap gap-2">
            {release.state === "draft" ? <>
              <button type="button" disabled={pending} onClick={() => run(() => rebuildSeasonEndDraftAction(release.id))} className="rounded border border-line px-3 py-2 text-xs text-steel hover:border-gold hover:text-gold">Rebuild draft</button>
              <button type="button" disabled={pending} onClick={() => run(() => setSeasonEndReleaseStateAction({ releaseId: release.id, state: "admin_test", catalogHash: release.catalogHash, revisionDigest: release.revisionDigest }))} className="rounded border border-gold px-3 py-2 text-xs text-gold">Lock for admin test</button>
            </> : null}
            {release.state === "admin_test" ? <>
              <button type="button" disabled={pending} onClick={() => run(() => approveSeasonEndTestAction({ releaseId: release.id, revisionDigest: release.revisionDigest }))} className="rounded border border-gold px-3 py-2 text-xs text-gold">Approve tested revision</button>
              <button type="button" disabled={pending || !release.testApprovedAt} onClick={() => run(() => setSeasonEndReleaseStateAction({ releaseId: release.id, state: "public", catalogHash: release.catalogHash, revisionDigest: release.revisionDigest }))} className="rounded border border-coral px-3 py-2 text-xs text-coral disabled:opacity-50">Publish publicly</button>
            </> : null}
            {release.state !== "draft" ? <button type="button" disabled={pending} onClick={() => run(() => createSeasonEndDraftAction({ league, season }))} className="rounded border border-gold px-3 py-2 text-xs text-gold">Create new revision</button> : null}
            {release.state !== "draft" ? <button type="button" disabled={pending} onClick={() => run(() => pauseSeasonEndReleaseAction({ releaseId: release.id, paused: !release.paused }))} className="rounded border border-line px-3 py-2 text-xs text-steel hover:border-coral hover:text-coral">{release.paused ? "Resume purchases" : "Pause purchases"}</button> : null}
          </div>
          {release.state === "admin_test" ? <section className="rounded border border-line bg-panel/50 p-3"><label className="text-xs uppercase tracking-[.14em] text-steel">Verification report JSON <textarea value={reportJson} onChange={(event) => setReportJson(event.target.value)} placeholder='Paste the simulator report with reportDigest, acceptance, and exact-revision opening evidence.' className="mt-2 min-h-32 w-full rounded border border-line bg-panel p-2 font-mono text-[11px] text-white" /></label><button type="button" disabled={pending || !reportJson.trim()} onClick={recordReport} className="mt-2 rounded border border-gold px-3 py-2 text-xs text-gold disabled:opacity-50">Record report for this revision</button></section> : null}
          {release.state === "admin_test" && catalog ? <SeasonEndPackShop key={`${release.id}:${viewerId ?? "signed-out"}:admin_test`} league={league} season={season} release={release} catalog={catalog} adminTest viewerId={viewerId} /> : null}
        </>
      )}
    </section>
  );
}
