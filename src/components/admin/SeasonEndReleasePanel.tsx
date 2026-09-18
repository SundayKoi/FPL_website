"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveSeasonEndTestAction, createSeasonEndDraftAction, pauseSeasonEndReleaseAction, rebuildSeasonEndDraftAction, setSeasonEndReleaseStateAction } from "@/lib/season-end/actions";
import SeasonEndPackShop from "@/components/cards/SeasonEndPackShop";
import type { SeasonEndCatalog } from "@/lib/season-end/collectibles";
import type { SeasonEndRelease } from "@/lib/season-end/release-queries";

export default function SeasonEndReleasePanel({
  league,
  season,
  release,
  catalog,
}: {
  league: "premier" | "academy";
  season: string;
  release: SeasonEndRelease | null;
  catalog: SeasonEndCatalog | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<{ ok: boolean; error?: string }>) => startTransition(async () => {
    const result = await task();
    if (!result.ok) window.alert(result.error ?? "The release action failed.");
    else router.refresh();
  });

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
          {catalog?.withheldAwards.length ? <details className="text-sm text-steel"><summary className="cursor-pointer text-coral">{catalog.withheldAwards.length} withheld awards</summary><ul className="mt-2 list-disc pl-5">{catalog.withheldAwards.map((award) => <li key={award.awardId}>{award.title}: {award.reason}</li>)}</ul></details> : null}
          <div className="flex flex-wrap gap-2">
            {release.state === "draft" ? <>
              <button type="button" disabled={pending} onClick={() => run(() => rebuildSeasonEndDraftAction(release.id))} className="rounded border border-line px-3 py-2 text-xs text-steel hover:border-gold hover:text-gold">Rebuild draft</button>
              <button type="button" disabled={pending} onClick={() => run(() => setSeasonEndReleaseStateAction({ releaseId: release.id, state: "admin_test" }))} className="rounded border border-gold px-3 py-2 text-xs text-gold">Lock for admin test</button>
            </> : null}
            {release.state === "admin_test" ? <>
              <button type="button" disabled={pending} onClick={() => run(() => approveSeasonEndTestAction(release.id))} className="rounded border border-gold px-3 py-2 text-xs text-gold">Approve tested revision</button>
              <button type="button" disabled={pending || !release.testApprovedAt} onClick={() => run(() => setSeasonEndReleaseStateAction({ releaseId: release.id, state: "public" }))} className="rounded border border-coral px-3 py-2 text-xs text-coral disabled:opacity-50">Publish publicly</button>
            </> : null}
            {release.state !== "draft" ? <button type="button" disabled={pending} onClick={() => run(() => pauseSeasonEndReleaseAction({ releaseId: release.id, paused: !release.paused }))} className="rounded border border-line px-3 py-2 text-xs text-steel hover:border-coral hover:text-coral">{release.paused ? "Resume purchases" : "Pause purchases"}</button> : null}
          </div>
          {release.state === "admin_test" && catalog ? <SeasonEndPackShop league={league} season={season} release={release} catalog={catalog} adminTest /> : null}
        </>
      )}
    </section>
  );
}
