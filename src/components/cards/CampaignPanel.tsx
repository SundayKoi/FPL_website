"use client";

// The campaign panel: opt into one of the two campaigns, follow the one
// that is open (stage, the road the last stage set, what is in the
// field), or abandon it. The state is the server's (expedition_campaigns);
// this only shows it and calls the actions.

import { useState, useTransition } from "react";
import { EXPEDITION_TIERS } from "@/lib/expeditions/config";
import { CAMPAIGNS, CAMPAIGN_ORDER, nextTier, roadStory, type CampaignKey, type CampaignState } from "@/lib/expeditions/campaigns";
import { ROAD_RULES, forksFor } from "@/lib/expeditions/routes";

export default function CampaignPanel({
  campaign,
  onStart,
  onAbandon,
}: {
  /** The open campaign, or null. */
  campaign: CampaignState | null;
  onStart: (key: CampaignKey) => Promise<string | null>;
  onAbandon: (id: number) => Promise<string | null>;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start(key: CampaignKey) {
    setError(null);
    startTransition(async () => {
      setError(await onStart(key));
    });
  }

  function abandon(id: number) {
    if (!armed) {
      setArmed(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      setArmed(false);
      setError(await onAbandon(id));
    });
  }

  if (!campaign) {
    return (
      <section aria-label="Campaigns" data-testid="campaigns" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="type-display text-2xl sm:text-3xl">Campaigns</h2>
          <span className="text-xs text-steel">
            Three runs that tell one story. Each stage&apos;s luck sets the next stage&apos;s road; finish all three and the finale prints a
            relic of a survivor in the campaign&apos;s own frame.
          </span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {CAMPAIGN_ORDER.map((key) => {
            const def = CAMPAIGNS[key];
            return (
              <li key={key} data-testid={`campaign-${key}`} className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-3">
                <span className="type-display text-lg text-white" style={{ color: def.accent }}>
                  {def.label}
                </span>
                <span className="text-xs text-steel">{def.stages.map((tier) => EXPEDITION_TIERS[tier].label).join(" → ")}</span>
                <p className="text-xs text-steel">{def.blurb}</p>
                <button
                  type="button"
                  onClick={() => start(key)}
                  disabled={pending}
                  className="btn-pill w-fit px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  {pending ? "Opening…" : `Begin ${def.label}`}
                </button>
              </li>
            );
          })}
        </ul>
        {error ? (
          <p role="alert" className="text-xs text-coral">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  const def = CAMPAIGNS[campaign.key];
  const next = nextTier(campaign);
  const inField = campaign.runs.length > campaign.stage;
  const story = roadStory(campaign.key, campaign);
  const places = next && campaign.road ? forksFor(next, { runId: 0, rules: ROAD_RULES, places: campaign.road }) : [];
  return (
    <section aria-label="Campaigns" data-testid="campaigns" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">
          <span style={{ color: def.accent }}>{def.label}</span>
        </h2>
        <span data-testid="campaign-stage" className="text-xs text-steel">
          Stage {Math.min(3, campaign.stage + 1)} of 3{inField ? " — in the field" : next ? ` — send a ${EXPEDITION_TIERS[next].label}` : ""}
        </span>
      </div>
      <ol className="flex flex-wrap gap-2 text-xs">
        {def.stages.map((tier, index) => {
          const done = index < campaign.stage;
          const current = index === campaign.stage;
          return (
            <li
              key={tier}
              data-testid={`campaign-stage-${index}`}
              className={`rounded-md border px-3 py-1.5 ${done ? "border-mint/50 bg-mint/10 text-mint" : current ? "border-gold/50 bg-gold/10 text-white" : "border-line bg-panel text-steel"}`}
            >
              {index + 1}. {EXPEDITION_TIERS[tier].label}
              {done ? " ✓" : current && inField ? " · out" : ""}
            </li>
          );
        })}
      </ol>
      {story ? (
        <p data-testid="campaign-story" className="text-sm text-steel">
          {story}
          {places.length > 0 ? (
            <>
              {" "}
              The road ahead: <span className="text-white">{places.map((fork) => fork.title).join(" → ")}</span>.
            </>
          ) : null}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => abandon(campaign.id)}
          disabled={pending}
          data-testid="campaign-abandon"
          className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide transition disabled:opacity-50 ${
            armed ? "border-coral bg-coral/15 text-coral" : "border-line text-steel hover:text-white"
          }`}
        >
          {pending ? "…" : armed ? "Tap again to abandon the campaign" : "Abandon"}
        </button>
        {armed && !pending ? (
          <button type="button" onClick={() => setArmed(false)} className="text-xs text-steel underline-offset-4 hover:underline">
            keep going
          </button>
        ) : null}
        {error ? (
          <span role="alert" className="text-xs text-coral">
            {error}
          </span>
        ) : null}
      </div>
    </section>
  );
}
