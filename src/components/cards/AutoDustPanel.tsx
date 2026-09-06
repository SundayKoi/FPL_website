"use client";

// Auto-dust, on the collection page: a standing rule for what to melt
// without being asked, previewed live against the shelf before it is
// saved, and runnable on the spot. The preview and the server use the
// same selection code, so what it says it will take is what it takes.

import { useMemo, useState, useTransition } from "react";
import { fmtPoints } from "@/lib/betting/format";
import {
  MAX_KEEP_COPIES,
  selectAutoDust,
  TIER_LABELS,
  TIER_ORDER,
  type AutoDustCandidate,
  type AutoDustRule,
  type CardTierKey,
} from "@/lib/cards/autoDust";
import { runAutoDustAction, saveAutoDustRuleAction } from "@/lib/cards/autoDust-actions";
import { useAutoDisarm } from "@/lib/ui/useAutoDisarm";

export default function AutoDustPanel({ initialRule, candidates }: { initialRule: AutoDustRule; candidates: AutoDustCandidate[] }) {
  const [rule, setRule] = useState<AutoDustRule>(initialRule);
  const [saved, setSaved] = useState<AutoDustRule>(initialRule);
  const [open, setOpen] = useState(initialRule.enabled);
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useAutoDisarm(armed, () => setArmed(false));

  const preview = useMemo(() => selectAutoDust(candidates, { ...rule, enabled: true }), [candidates, rule]);
  const dirty = JSON.stringify(rule) !== JSON.stringify(saved);

  const set = <K extends keyof AutoDustRule>(key: K, value: AutoDustRule[K]) => {
    setRule((current) => ({ ...current, [key]: value }));
    setArmed(false);
    setMessage(null);
  };

  const save = () => {
    setError(null);
    start(async () => {
      const result = await saveAutoDustRuleAction(rule);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRule(result.rule);
      setSaved(result.rule);
      setMessage(result.rule.enabled ? "Saved. New pulls that match will be dusted as packs open." : "Saved. The rule is off.");
    });
  };

  const run = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setError(null);
    start(async () => {
      const result = await runAutoDustAction();
      setArmed(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(
        result.dusted === 0
          ? "Nothing on the shelf matches the rule."
          : `Dusted ${result.dusted} for +${fmtPoints(result.value)}${result.skipped > 0 ? ` · ${result.skipped} held back` : ""}${result.remaining > 0 ? ` · ${result.remaining} more next run` : ""}.`,
      );
    });
  };

  return (
    <section aria-label="Auto-dust" className="card-brand flex flex-col gap-3 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="label-dash">Auto-dust</span>
          <span className="text-xs text-steel">
            {saved.enabled
              ? `On · at or below ${TIER_LABELS[saved.maxTier]} and ${saved.maxOverall} OVR · keep ${saved.keepCopies} of each${saved.onRip ? " · applies as packs open" : ""}`
              : "Off · set a rarity and an overall, and extras below it melt on their own"}
          </span>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
          {open ? "Hide" : "Set up"}
        </button>
      </div>

      {open ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-white">
              <input type="checkbox" checked={rule.enabled} onChange={(event) => set("enabled", event.target.checked)} />
              Rule on
            </label>
            <label className="flex flex-col gap-1 text-xs text-steel">
              Dust at or below
              <select
                value={rule.maxTier}
                onChange={(event) => set("maxTier", event.target.value as CardTierKey)}
                className="rounded-md border border-line bg-black/20 px-2 py-1.5 text-sm text-white"
              >
                {TIER_ORDER.map((tier) => (
                  <option key={tier} value={tier}>
                    {TIER_LABELS[tier]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-steel">
              and at or below overall
              <input
                type="number"
                min={0}
                max={99}
                value={rule.maxOverall}
                onChange={(event) => set("maxOverall", Number(event.target.value))}
                className="rounded-md border border-line bg-black/20 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-steel">
              keep this many of each player
              <input
                type="number"
                min={0}
                max={MAX_KEEP_COPIES}
                value={rule.keepCopies}
                onChange={(event) => set("keepCopies", Number(event.target.value))}
                className="rounded-md border border-line bg-black/20 px-2 py-1.5 text-sm text-white"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-white">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={rule.onRip} onChange={(event) => set("onRip", event.target.checked)} />
              Also as packs open
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={rule.skipFoil} onChange={(event) => set("skipFoil", event.target.checked)} />
              Never foils
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={rule.skipSigned} onChange={(event) => set("skipSigned", event.target.checked)} />
              Never signed
            </label>
            <label className="flex items-center gap-2" title="A Shiny, or a copy with a StatTrak counter. Secrets and slabbed copies are never melted by a rule.">
              <input type="checkbox" checked={rule.skipFinishes} onChange={(event) => set("skipFinishes", event.target.checked)} />
              Never Shiny or StatTrak
            </label>
            <label className="flex items-center gap-2" title="Count the keep for each week's print of a player separately, so last week's print survives this week's.">
              <input type="checkbox" checked={rule.perEdition} onChange={(event) => set("perEdition", event.target.checked)} />
              Keep per week, not per player
            </label>
          </div>
          <p className="text-xs text-steel">
            Right now this rule would take <b className="text-white">{preview.length}</b> {preview.length === 1 ? "copy" : "copies"} off
            your shelf. It never touches an Eclipse, a moment, a relic, a plate, a mutated card, a Secret or a slabbed copy, and it
            keeps your best copy of a player first: signed, then foil, then the highest overall.{" "}
            {rule.perEdition
              ? "Each week's print of a player is counted on its own."
              : "Every week's print of a player counts as one group — turn on \"keep per week\" to keep one from each."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={pending || !dirty} className="btn-pill px-4 py-1.5 text-xs disabled:opacity-50">
              {pending ? "Saving…" : "Save rule"}
            </button>
            <button
              type="button"
              onClick={run}
              disabled={pending || !saved.enabled || dirty || preview.length === 0}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                armed ? "border-coral bg-coral/20 text-coral" : "border-line text-steel hover:border-coral hover:text-coral"
              }`}
              title={dirty ? "Save the rule first" : !saved.enabled ? "Turn the rule on and save it first" : undefined}
            >
              {armed ? `Really dust ${preview.length}?` : `Dust ${preview.length} now`}
            </button>
            {message ? <span className="text-xs text-mint">{message}</span> : null}
            {error ? <span className="text-xs text-coral">{error}</span> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
