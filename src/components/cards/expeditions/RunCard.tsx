"use client";

// Zone C — one card per squad in the field: where it is, in plain words
// ("Walking · next fork opens 3:10 PM ET"), who went and the edge each one
// carries, the route with the squad on it, and the journal's latest line
// with the rest folded under it. The button that brings a squad home lives
// in Right now, at the top of the page, so there is one of it.

import { abilityOf } from "@/lib/expeditions/archetypes";
import { EXPEDITION_TIERS, type CardCopy, type ExpeditionTierKey } from "@/lib/expeditions/config";
import { journalFor } from "@/lib/expeditions/journal";
import { roadOf, type ConvoyView, type ExpeditionRun } from "@/lib/expeditions/queries";
import { forkViews } from "@/lib/expeditions/routes";
import { WEATHERS } from "@/lib/expeditions/weather";
import ExpeditionIcon from "../expeditionIcons";
import RouteMap from "../RouteMap";
import { easternClock, untilLabel, useClock } from "./clock";
import { SquadThumb } from "./RightNow";

const CHIP = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]";

export default function RunCard({
  run,
  byId,
  convoy = null,
}: {
  run: ExpeditionRun;
  byId: Map<number, CardCopy>;
  convoy?: ConvoyView | null;
}) {
  const now = useClock();
  const tier = run.tier as ExpeditionTierKey;
  const def = EXPEDITION_TIERS[tier];
  const label = def?.label ?? run.tier;
  const squad = run.squad.map((id) => byId.get(id)).filter((copy): copy is CardCopy => Boolean(copy));
  // Before the clock is up (the server render), the road reads from the
  // start: no fork is open, nothing has happened, and the status says
  // only what needs no clock.
  const clock = new Date(now === 0 ? Date.parse(run.startedAt) : now);
  const views = forkViews(run, clock);
  const due = now !== 0 && Date.parse(run.resolvesAt) <= now;
  const open = views.find((fork) => fork.status === "open") ?? null;
  const pending = views.find((fork) => fork.status === "pending") ?? null;
  const start = Date.parse(run.startedAt);
  const end = Date.parse(run.resolvesAt);
  const progress = now === 0 ? null : Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));
  const journal = journalFor(
    {
      id: run.id,
      tier,
      startedAt: run.startedAt,
      resolvesAt: run.resolvesAt,
      forks: run.forks,
      claimedAt: run.claimedAt,
      rules: run.rules,
      convoy: run.convoy,
      choices: run.choices,
      company: run.company ?? null,
      weather: run.weather ?? null,
    },
    squad,
    clock,
  );
  const latest = journal[journal.length - 1] ?? null;
  const stormed = run.encounters.some((entry) => entry.key === "storm");

  const status = now === 0
    ? { icon: "away" as const, tone: "text-steel", text: "On the road" }
    : due
      ? { icon: "home" as const, tone: "text-mint", text: "Home — waiting to be brought in" }
      : open
        ? { icon: "fork" as const, tone: "text-gold", text: `At a fork · choose by ${easternClock(open.closesAt)} ET` }
        : pending
          ? { icon: "away" as const, tone: "text-steel", text: `Walking · next fork opens ${easternClock(pending.opensAt)} ET` }
          : { icon: "away" as const, tone: "text-steel", text: "Walking · no more forks, just the road home" };

  return (
    <li data-testid={`run-${run.id}`} className="card-brand flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="type-display text-xl">{label}</h3>
          <p className={`mt-0.5 flex items-center gap-1.5 text-sm ${status.tone}`}>
            <ExpeditionIcon name={status.icon} />
            {status.text}
          </p>
        </div>
        {due ? (
          <a href="#right-now" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-mint underline-offset-4 hover:underline">
            Bring them home ↑
          </a>
        ) : (
          <p className="flex min-h-11 items-center text-sm font-semibold text-white">
            {now === 0 ? `Back ${easternClock(run.resolvesAt)} ET` : `Back in ${untilLabel(end - now)}`}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex gap-2">
          {run.squad.map((id) => {
            const copy = byId.get(id);
            return (
              <SquadThumb key={id} id={id} copy={copy}>
                {copy ? (
                  <span data-edge-title className="flex w-full items-center justify-center gap-0.5 truncate text-[10px] text-gold/90" title={abilityOf(copy).does}>
                    <ExpeditionIcon name="edge" size={10} />
                    <span className="truncate">{abilityOf(copy).title}</span>
                  </span>
                ) : null}
              </SquadThumb>
            );
          })}
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <RouteMap
            tier={tier}
            road={roadOf(run)}
            progress={progress}
            forks={views.map((fork) => ({ status: fork.status, pushed: fork.choice !== null && fork.choice !== "camp" && fork.choice !== "hold" }))}
          />
        </div>
      </div>

      {run.insured || stormed || (run.weather && run.weather !== "clear") || convoy ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {run.insured ? (
            <span className={`${CHIP} border-mint/40 text-mint`}>
              <ExpeditionIcon name="safe" size={11} />
              insured
            </span>
          ) : null}
          {stormed ? <span className={`${CHIP} border-line text-steel`}>a storm held them</span> : null}
          {run.weather && run.weather !== "clear" ? (
            <span data-testid={`weather-${run.id}`} className={`${CHIP} border-line text-steel`}>
              <span aria-hidden>{WEATHERS[run.weather].glyph}</span> under {WEATHERS[run.weather].label.toLowerCase()}
            </span>
          ) : null}
          {convoy ? (
            <span data-testid={`convoy-${run.id}`} className={`${CHIP} border-gold/50 text-gold`}>
              <ExpeditionIcon name="convoy" size={11} />
              {convoy.partner ? `Convoy with ${convoy.partner.username}` : `Convoy code ${convoy.code} — waiting for a partner`}
            </span>
          ) : null}
        </div>
      ) : null}

      {latest ? (
        <div data-testid={`journal-${run.id}`} className="flex flex-col gap-1 border-t border-line/60 pt-3">
          <p className={`text-sm ${latest.kind === "encounter" ? "text-gold" : "text-white"}`}>
            <span className="mr-2 font-mono text-[11px] text-steel">{easternClock(latest.at)}</span>
            {latest.text}
          </p>
          {journal.length > 1 ? (
            <details className="group">
              <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-steel hover:text-white">
                <ExpeditionIcon name="chevron" size={12} className="transition group-open:rotate-90" />
                Read the journal ({journal.length})
              </summary>
              <ol className="flex flex-col gap-1 pb-1">
                {journal.map((entry, index) => (
                  <li
                    key={`${entry.at.getTime()}-${index}`}
                    className={`text-xs ${entry.kind === "encounter" ? "text-gold" : entry.kind === "arrive" || entry.kind === "home" ? "text-white" : "text-steel"}`}
                  >
                    <span className="mr-1.5 font-mono text-[10px] text-steel/70">{easternClock(entry.at)}</span>
                    {entry.text}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="border-t border-line/60 pt-3 text-sm text-steel">The squad has just set out. The first word comes back in a few hours.</p>
      )}
    </li>
  );
}
