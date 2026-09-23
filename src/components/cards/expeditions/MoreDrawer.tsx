"use client";

// The drawer — everything that is not "what do I do now": the log, the
// season's table, campaigns, the graveyard and the rulebook. One panel
// mounted at a time, the log by default, so a visit is not eleven
// sections deep.
//
// Later phases register here rather than adding sections to the board:
// one entry in `tabs` (key, label, when to show, what to render), with its
// props passed down from ExpeditionBoard — the camp (Phase 3), the league
// goal (Phase 4) and the atlas (Phase 6).

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { flushSync } from "react-dom";
import { fmtPoints } from "@/lib/betting/format";
import { mutationByKey } from "@/lib/cards/mutations";
import { tierLabel } from "@/lib/cards/tier";
import type { CampaignKey, CampaignState } from "@/lib/expeditions/campaigns";
import type { Rivalry } from "@/lib/expeditions/company";
import { EXPEDITION_TIERS, SURGE_BONUS, type CardCopy, type ExpeditionTierKey } from "@/lib/expeditions/config";
import type { ExpeditionRun, Grave } from "@/lib/expeditions/queries";
import type { CardFate } from "@/lib/expeditions/routes";
import { ACCOLADES, accoladesOf, rankStandings, type Accolade, type StandingRow } from "@/lib/expeditions/standings";
import { milesOf, trailTitleOf } from "@/lib/expeditions/trail";
import CampaignPanel from "../CampaignPanel";
import ExpeditionRules from "../ExpeditionRules";
import { OPEN_RULES_EVENT } from "./Term";

const FATE_LABEL: Record<CardFate["fate"], string> = { home: "Home", wounded: "Wounded", lost: "Lost", dead: "Dead" };
const FATE_CLASS: Record<CardFate["fate"], string> = { home: "text-mint", wounded: "text-gold", lost: "text-coral", dead: "text-red-300" };

type TabKey = "log" | "standings" | "campaigns" | "graveyard" | "rules";

interface Tab {
  key: TabKey;
  label: string;
  /** Hidden when there is nothing it could show. */
  when: boolean;
  render: () => ReactNode;
}

function LogPanel({ finished, byId }: { finished: ExpeditionRun[]; byId: Map<number, CardCopy> }) {
  return (
    <section aria-label="Finished expeditions" className="flex flex-col gap-2">
      {finished.length === 0 ? (
        <p className="text-sm text-steel">Every run you bring home is listed here, with what it paid and who came back changed.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {finished.map((run) => (
            <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-panel px-3 py-2 text-xs">
              <span className="font-semibold text-white">{EXPEDITION_TIERS[run.tier as ExpeditionTierKey]?.label ?? run.tier}</span>
              <span className="text-steel">
                {new Date(run.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}
              </span>
              {run.outcome ? (
                <>
                  <span className="font-mono font-bold text-mint">{fmtPoints(run.outcome.dollars)}</span>
                  {run.outcome.pushes > 0 ? (
                    <span className="text-steel">
                      went for it {run.outcome.pushes} time{run.outcome.pushes === 1 ? "" : "s"} · ×{run.outcome.lootMultiplier}
                    </span>
                  ) : null}
                  {run.outcome.surge.length > 0 ? <span className="text-mint">match day ×{1 + SURGE_BONUS}</span> : null}
                  {run.outcome.comp ? <span className="text-gold">free pack</span> : null}
                  {run.outcome.echo ? <span className="text-gold">a moment echoed</span> : null}
                  {run.outcome.fragments > 0 ? <span className="text-purple-200">map fragment</span> : null}
                  {run.outcome.mark ? (
                    <span className="text-gold">
                      {run.outcome.mark} mark
                      {run.outcome.bearer !== null && byId.get(run.outcome.bearer) ? ` — ${byId.get(run.outcome.bearer)!.playerName}` : ""}
                    </span>
                  ) : null}
                  {run.outcome.fates
                    .filter((fate) => fate.fate !== "home" || fate.mutation)
                    .map((fate) => (
                      <span key={fate.id} className={FATE_CLASS[fate.fate]}>
                        {byId.get(fate.id)?.playerName ?? `#${fate.id}`}{" "}
                        {fate.mutation ? mutationByKey(fate.mutation)?.label.toLowerCase() : FATE_LABEL[fate.fate].toLowerCase()}
                      </span>
                    ))}
                  {run.outcome.rescued === true && run.outcome.rescueMissed !== true ? <span className="text-mint">rescued</span> : null}
                  {run.outcome.rescued === true && run.outcome.rescueMissed === true ? <span className="text-coral">too late</span> : null}
                  {run.outcome.rescued === false ? <span className="text-coral">rescue failed</span> : null}
                </>
              ) : (
                <span className="text-steel">claimed</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StandingsPanel({
  standings,
  accolades,
  viewerId,
  rivalries,
}: {
  standings: StandingRow[];
  accolades: Accolade[];
  viewerId: string | null;
  rivalries: Rivalry[];
}) {
  const ranked = rankStandings(standings);
  const top = ranked.slice(0, 8);
  const mine = viewerId ? ranked.findIndex((row) => row.discordId === viewerId) : -1;
  const shown = mine >= top.length ? [...top, ranked[mine]] : top;
  return (
    <div className="flex flex-col gap-5">
      {standings.length === 0 ? (
        <p className="text-sm text-steel">Nobody has brought a squad home this season yet. The table fills in as runs are claimed.</p>
      ) : (
        <section aria-label="Season standings" data-testid="standings" className="flex flex-col gap-3">
          <p className="text-xs text-steel">
            Miles walked, loot brought home, Legendary routes brought home whole, rivals beaten. At season close the top of each is marked —
            Pathfinder, Plunderer, Survivor. Marks only.
          </p>
          {accolades.length > 0 ? (
            <ul data-testid="accolades" className="flex flex-wrap gap-2 text-xs">
              {accolades.map((accolade) => (
                <li key={accolade.kind} data-testid={`accolade-${accolade.kind}`} className="rounded-md border border-gold/40 bg-gold/5 px-3 py-1.5">
                  <span className="font-semibold" style={{ color: ACCOLADES[accolade.kind].accent }}>
                    {ACCOLADES[accolade.kind].glyph} {ACCOLADES[accolade.kind].label}
                  </span>{" "}
                  <span className="text-white">{accolade.username}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {/* One table; under 640px each row becomes a ranked card with
              its figures labelled in two columns, instead of a table that
              scrolls sideways. */}
          <table className="block w-full text-xs tabular-nums sm:table">
            <thead className="hidden text-left text-[10px] uppercase tracking-[0.14em] text-steel sm:table-header-group">
              <tr>
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Collector</th>
                <th className="py-1 pr-2">Miles</th>
                <th className="py-1 pr-2">Loot</th>
                <th className="py-1 pr-2">Homecomings</th>
                <th className="py-1 pr-2">Rivals beaten</th>
              </tr>
            </thead>
            <tbody className="flex flex-col gap-1.5 sm:table-row-group">
              {shown.map((row) => {
                const rank = ranked.indexOf(row) + 1;
                const held = accoladesOf(accolades, row.discordId);
                const cell = "sm:table-cell sm:py-1.5 sm:pr-2 before:mr-1 before:text-steel/70 before:content-[attr(data-label)] sm:before:content-none";
                return (
                  <tr
                    key={row.discordId}
                    data-testid={`standing-${row.discordId}`}
                    className={`grid grid-cols-[1.5rem_1fr_1fr] items-baseline gap-x-3 gap-y-0.5 rounded-md border px-3 py-2 sm:table-row sm:rounded-none sm:border-0 sm:border-t sm:px-0 ${
                      row.discordId === viewerId ? "border-gold/40 bg-gold/10 text-white" : "border-line text-steel sm:border-line/60"
                    }`}
                  >
                    <td className="row-span-3 font-mono text-sm font-bold text-white sm:table-cell sm:py-1.5 sm:pr-2 sm:text-xs sm:font-normal">{rank}</td>
                    <td className="col-span-2 min-w-0 font-semibold text-white sm:table-cell sm:py-1.5 sm:pr-2">
                      {row.username}
                      {held.map((def) => (
                        <span key={def.key} title={`${def.label} — ${def.does}`} className="ml-1" style={{ color: def.accent }}>
                          {def.glyph}
                        </span>
                      ))}
                    </td>
                    <td data-label="Miles" className={cell}>{row.miles}</td>
                    <td data-label="Loot" className={cell}>{fmtPoints(row.loot)}</td>
                    <td data-label="Home whole" className={cell}>{row.survivals}</td>
                    <td data-label="Rivals beaten" className={cell}>{row.rivalsBeaten}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {rivalries.length > 0 ? (
        <section aria-label="Rivalries" data-testid="rivalries" className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Rivalries</h3>
          <p className="text-xs text-steel">Squads yours has raced for a spot this season. More power gets there first.</p>
          <ul className="flex flex-wrap gap-2">
            {rivalries.map((rivalry) => (
              <li key={rivalry.who} data-testid={`rivalry-${rivalry.who}`} className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-xs">
                <span className="font-semibold text-white">{rivalry.name}</span>
                <span
                  className={`font-mono font-bold ${rivalry.beaten > rivalry.beatenBy ? "text-mint" : rivalry.beaten < rivalry.beatenBy ? "text-coral" : "text-steel"}`}
                >
                  {rivalry.beaten}–{rivalry.beatenBy}
                </span>
                <span className="text-steel">
                  {rivalry.beaten === rivalry.beatenBy ? "level" : rivalry.beaten > rivalry.beatenBy ? "yours ahead" : "theirs ahead"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function GraveyardPanel({ graves, ledgerHref }: { graves: Grave[]; ledgerHref: string }) {
  return (
    <section aria-label="Fallen cards" className="flex flex-col gap-3">
      {graves.length === 0 ? (
        <p className="text-sm text-steel">None of your cards has fallen. A card that dies on the deepest routes, or is lost and never brought back, rests here.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {graves.map((grave) => (
            <li key={grave.id} data-testid={`grave-${grave.id}`} className="flex flex-col rounded-lg border border-red-500/40 bg-black/40 px-3 py-2 text-xs text-steel">
              <span className="text-sm font-semibold text-white">{grave.playerName}</span>
              <span>
                {tierLabel(grave.tier)}
                {grave.foil ? " · foil" : ""}
                {grave.signed ? " · signed" : ""}
              </span>
              <span className="text-red-300">
                {grave.cause === "route" ? "Fell on the Legendary route" : "Lost, and nobody came"} ·{" "}
                {new Date(grave.diedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}
              </span>
              {milesOf(grave) > 0 ? (
                <span data-testid={`grave-miles-${grave.id}`}>
                  {milesOf(grave)} mile{milesOf(grave) === 1 ? "" : "s"} walked{trailTitleOf(grave) ? ` · ${trailTitleOf(grave)!.label}` : ""}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Link href={ledgerHref} className="inline-flex min-h-11 w-fit items-center text-sm text-coral underline-offset-4 hover:underline">
        The league&apos;s ledger of the fallen and the found →
      </Link>
    </section>
  );
}

export default function MoreDrawer({
  finished,
  byId,
  standings,
  accolades,
  viewerId,
  rivalries,
  graves,
  campaign,
  ledgerHref,
  onStartCampaign,
  onAbandonCampaign,
}: {
  finished: ExpeditionRun[];
  byId: Map<number, CardCopy>;
  standings: StandingRow[];
  accolades: Accolade[];
  viewerId: string | null;
  rivalries: Rivalry[];
  graves: Grave[];
  campaign: CampaignState | null;
  ledgerHref: string;
  onStartCampaign: (key: CampaignKey) => Promise<string | null>;
  onAbandonCampaign: (id: number) => Promise<string | null>;
}) {
  const [active, setActive] = useState<TabKey>("log");
  const section = useRef<HTMLElement | null>(null);
  const strip = useRef<HTMLDivElement | null>(null);

  const tabs: Tab[] = [
    { key: "log", label: "Log", when: true, render: () => <LogPanel finished={finished} byId={byId} /> },
    {
      key: "standings",
      label: "Standings",
      when: true,
      render: () => <StandingsPanel standings={standings} accolades={accolades} viewerId={viewerId} rivalries={rivalries} />,
    },
    {
      key: "campaigns",
      label: "Campaigns",
      when: true,
      render: () => <CampaignPanel campaign={campaign} onStart={onStartCampaign} onAbandon={onAbandonCampaign} />,
    },
    // Phase 3 registers "camp", Phase 4 "league", Phase 6 "atlas" here.
    { key: "graveyard", label: "Graveyard", when: true, render: () => <GraveyardPanel graves={graves} ledgerHref={ledgerHref} /> },
    {
      key: "rules",
      label: "Rules",
      when: true,
      render: () => (
        <div data-testid="expedition-rules-fold">
          <ExpeditionRules />
        </div>
      ),
    },
  ];
  const shown = tabs.filter((tab) => tab.when);
  const current = shown.find((tab) => tab.key === active) ?? shown[0];

  // "More in the rules" from any Term, or a #expedition-rules link: open
  // the Rules tab, and bring it into view once it has mounted — flushSync,
  // because the rulebook only exists after the tab switch has rendered.
  useEffect(() => {
    const open = () => {
      flushSync(() => setActive("rules"));
      const target = document.getElementById("expedition-rules") ?? section.current;
      if (typeof target?.scrollIntoView === "function") target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const onHash = () => {
      if (window.location.hash === "#expedition-rules") open();
    };
    window.addEventListener(OPEN_RULES_EVENT, open);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener(OPEN_RULES_EVENT, open);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = shown.findIndex((tab) => tab.key === current.key);
    const next = shown[(index + (event.key === "ArrowRight" ? 1 : shown.length - 1)) % shown.length];
    setActive(next.key);
    strip.current?.querySelector<HTMLButtonElement>(`[data-testid="tab-${next.key}"]`)?.focus();
  }

  return (
    <section ref={section} aria-labelledby="more-title" data-testid="more-drawer" className="flex flex-col gap-3">
      <h2 id="more-title" className="label-dash">
        More
      </h2>
      <div ref={strip} role="tablist" aria-label="More about expeditions" data-testid="more-tabs" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {shown.map((tab) => {
          const selected = tab.key === current.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`tab-${tab.key}-button`}
              data-testid={`tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.key)}
              onKeyDown={onKey}
              className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold transition ${
                selected ? "border-coral text-white" : "border-transparent text-steel hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`panel-${current.key}`} aria-labelledby={`tab-${current.key}-button`} className="pt-1">
        {current.render()}
      </div>
    </section>
  );
}
