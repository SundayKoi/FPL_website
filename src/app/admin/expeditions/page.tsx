import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fmtPoints } from "@/lib/betting/format";
import { fetchAccolades, fetchStandings } from "@/lib/expeditions/queries";
import { ACCOLADES, ACCOLADE_ORDER, accoladeLine, leaderOf, rankStandings, type Accolade, type StandingRow } from "@/lib/expeditions/standings";
import CloseExpeditionSeasonButton from "@/components/admin/CloseExpeditionSeasonButton";

export const metadata: Metadata = { title: "Expedition seasons · Admin" };

const LEAGUES: { league: CardLeague; label: string }[] = [
  { league: "premier", label: "Premier" },
  { league: "academy", label: "Academy" },
];

function SeasonBlock({ label, season, standings, accolades }: { label: string; season: string; standings: StandingRow[]; accolades: Accolade[] }) {
  const ranked = rankStandings(standings);
  const closed = accolades.length > 0;
  return (
    <section aria-label={`${label} ${season}`} data-testid={`season-${season}`} className="card-brand flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="type-display text-2xl">
          {label} — {season}
        </h2>
        <span className="text-xs text-muted">
          {ranked.length} collector{ranked.length === 1 ? "" : "s"} with a claimed run.{closed ? " Closed." : " Open."}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-white">{closed ? "The marks" : "Who would take each mark today"}</h3>
        <ul className="flex flex-wrap gap-2 text-xs">
          {ACCOLADE_ORDER.map((kind) => {
            const held = accolades.find((accolade) => accolade.kind === kind);
            const leader = held ? null : leaderOf(ranked, kind);
            return (
              <li key={kind} data-testid={`mark-${season}-${kind}`} className="rounded-md border border-line bg-panel px-3 py-1.5">
                {held
                  ? accoladeLine(held)
                  : leader
                    ? accoladeLine({ kind, username: leader.username, value: leader[ACCOLADES[kind].stat] })
                    : `${ACCOLADES[kind].glyph} ${ACCOLADES[kind].label} — nobody yet`}
              </li>
            );
          })}
        </ul>
      </div>

      <CloseExpeditionSeasonButton season={season} closed={closed} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm tabular-nums">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-1">#</th>
              <th className="py-1">Collector</th>
              <th className="py-1">Runs</th>
              <th className="py-1">Miles</th>
              <th className="py-1">Loot</th>
              <th className="py-1">Homecomings</th>
              <th className="py-1">Rivals beaten</th>
            </tr>
          </thead>
          <tbody>
            {ranked.slice(0, 25).map((row, index) => (
              <tr key={row.discordId} className="border-t border-line/60">
                <td className="py-1 text-muted">{index + 1}</td>
                <td className="py-1 font-semibold text-white">{row.username}</td>
                <td className="py-1">{row.runs}</td>
                <td className="py-1">{row.miles}</td>
                <td className="py-1">{fmtPoints(row.loot)}</td>
                <td className="py-1">{row.survivals}</td>
                <td className="py-1">{row.rivalsBeaten}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function ExpeditionSeasonsPage() {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  const service = createBettingServiceClient();
  const blocks = await Promise.all(
    LEAGUES.map(async ({ league, label }) => {
      const season = await fetchCardSeason(service, league);
      if (!season) return null;
      const [standings, accolades] = await Promise.all([fetchStandings(service, season), fetchAccolades(service, season)]);
      return { label, season, standings, accolades };
    }),
  );

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <Link href="/admin" className="label-dash w-fit hover:text-action-text">
          ← Admin
        </Link>
        <h1 className="type-display text-4xl sm:text-5xl">Expedition seasons</h1>
        <p className="max-w-2xl text-sm text-muted">
          The season&apos;s standings — miles walked, loot brought home, Legendary homecomings, rivals beaten — and the
          close that awards Pathfinder, Plunderer and Survivor. Marks only, once per season, for good.
        </p>
      </header>
      {blocks.filter((block): block is NonNullable<typeof block> => block !== null).map((block) => (
        <SeasonBlock key={block.season} {...block} />
      ))}
    </main>
  );
}
