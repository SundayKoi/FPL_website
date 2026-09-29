import Link from "next/link";
import { redirect } from "next/navigation";
import AdminSectionContext from "@/components/admin/AdminSectionContext";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminReportsQueue from "@/components/captain/AdminReportsQueue";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { resolveAdminLeagueSeason } from "@/lib/admin/scope";
import { createServerSupabase } from "@/lib/supabase/server";
import type { MatchReport, MatchReportGame, LeagueTeam } from "@/lib/matches/types";

export const metadata = { title: "Reviews — FPL Admin" };

const PAGE_SIZE = 20;
const REPORT_STATUSES = ["pending", "needs_sides", "failed"] as const;

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  const params = await searchParams;
  const context = await resolveAdminLeagueSeason(supabase, params);
  const requestedPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = requestedPage && /^\d+$/.test(requestedPage) ? Math.max(1, Number(requestedPage)) : 1;
  const reportId = Array.isArray(params.report) ? params.report[0] : params.report;
  const selectedReportId = reportId && /^[0-9a-f-]{36}$/i.test(reportId) ? reportId : undefined;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [reportsPageResult, reportCountResult, cardCountResult, identityCountResult] = await Promise.all([
    supabase.from("match_reports").select("*").eq("season", context.season).in("status", [...REPORT_STATUSES]).order("submitted_at", { ascending: false }).range(from, to),
    supabase.from("match_reports").select("id", { count: "exact", head: true }).eq("season", context.season).in("status", [...REPORT_STATUSES]),
    supabase.from("card_claims").select("id", { count: "exact", head: true }).eq("season", context.season).eq("status", "pending"),
    supabase.from("player_identity_links").select("id", { count: "exact", head: true }).eq("league", context.league).eq("season", context.season).eq("status", "pending"),
  ]);
  let reports = (reportsPageResult.data as MatchReport[] | null) ?? [];
  if (selectedReportId && !reports.some((report) => report.id === selectedReportId)) {
    const selectedResult = await supabase.from("match_reports").select("*").eq("id", selectedReportId).eq("season", context.season).maybeSingle();
    const selected = selectedResult.data as MatchReport | null;
    if (selected) reports = [selected, ...reports];
  }
  const reportIds = reports.map((report) => report.id);
  const [gamesResult, teamsResult] = await Promise.all([
    reportIds.length ? supabase.from("match_report_games").select("*").in("report_id", reportIds).order("game_number") : Promise.resolve({ data: [], error: null }),
    supabase.from("league_teams").select("id, name, abbreviation, active").order("name"),
  ]);
  const countsUnavailable = Boolean(reportCountResult.error || cardCountResult.error || identityCountResult.error || reportCountResult.count === null || cardCountResult.count === null || identityCountResult.count === null);
  const reportUnavailable = Boolean(reportsPageResult.error || gamesResult.error || teamsResult.error || reportCountResult.error);
  const reportCount = reportCountResult.count ?? 0;
  const cardCount = cardCountResult.count ?? 0;
  const identityCount = identityCountResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(reportCount / PAGE_SIZE));
  const queryContext = `league=${context.league}&season=${encodeURIComponent(context.season)}`;

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 text-content sm:px-6 lg:px-8">
      <AdminSectionHeader title="Reviews" description="Review match reports, card ownership requests, and roster identity requests. Counts are authoritative totals for the selected league and season; each queue has its own workflow.">
        <AdminSectionContext league={context.league} season={context.season} seasonOptions={context.seasonOptions} defaultSeasons={context.defaultSeasons} />
      </AdminSectionHeader>

      {countsUnavailable ? <p role="status" className="card-brand p-3 text-sm text-muted">One or more queue totals are unavailable. No unavailable count is shown as zero.</p> : null}
      <nav aria-label="Review queues" className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
        {[
          ["Match reports", countsUnavailable ? "Unavailable" : reportCount.toLocaleString("en-US"), "Retry ingestion, correct game sides, or remove a report.", `/admin/reviews?${queryContext}`],
          ["Card ownership", countsUnavailable ? "Unavailable" : cardCount.toLocaleString("en-US"), "Verify claims against the matching player card.", `/admin/claims?${queryContext}`],
          ["Roster identity", countsUnavailable ? "Unavailable" : identityCount.toLocaleString("en-US"), "Confirm identity requests against current roster spots.", `/admin/reviews/identity?${queryContext}`],
        ].map(([label, count, detail, href]) => (
          <Link key={label} href={href} className="card-brand flex min-h-32 flex-col justify-between gap-3 p-4 transition hover:border-border-strong">
            <span className="label-dash">{label}</span>
            <span className="type-display text-3xl text-content">{count}</span>
            <span className="text-xs text-muted">{detail} <span className="text-action-text">Open queue →</span></span>
          </Link>
        ))}
      </nav>

      <section className="flex flex-col gap-3" aria-labelledby="report-queue-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-dash">{context.league === "academy" ? "Academy" : "Premier"} · {context.season}</p>
            <h2 id="report-queue-heading" className="type-display mt-1 text-2xl">Match report queue</h2>
          </div>
          {!reportUnavailable ? <span className="text-xs text-muted">Page {page} of {pageCount} · {reportCount.toLocaleString("en-US")} pending</span> : null}
        </div>
        {reportUnavailable ? (
          <p role="alert" className="card-brand p-4 text-sm text-red-300">Match report review is unavailable right now. Refresh after the report service recovers.</p>
        ) : (
          <>
            <AdminReportsQueue
              reports={reports}
              games={(gamesResult.data as MatchReportGame[] | null) ?? []}
              teams={(teamsResult.data as LeagueTeam[] | null) ?? []}
              initiallyOpen
              selectedReportId={selectedReportId}
              label="Match report review"
            />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Showing {reports.length} of {reportCount.toLocaleString("en-US")} unresolved reports</span>
              <span className="flex gap-3">
                {page > 1 ? <Link href={`/admin/reviews?${queryContext}&page=${page - 1}`} className="text-action-text underline underline-offset-4">← Newer</Link> : null}
                {page < pageCount ? <Link href={`/admin/reviews?${queryContext}&page=${page + 1}`} className="text-action-text underline underline-offset-4">Older →</Link> : null}
              </span>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
