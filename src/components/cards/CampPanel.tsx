"use client";

// The base camp (src/lib/expeditions/camp.ts, spec §2): what a collector
// builds between runs and keeps — a second scouting squad, a tent, a forge
// and a trophy wall — and the forge's one product, a forged policy.
//
// Self-contained and prop-driven, so the board can mount it as the drawer's
// Camp tab (`when: camp !== null`) and put ForgedPolicyToggle on the route
// card, both from the one `camp` the page reads (fetchCamp). A null camp —
// the read failed, or the base camp migration is not applied — renders
// nothing, which is how the tab and the toggle stay hidden.
//
// Presentation only. Every price is the database's to charge
// (upgrade_expedition_camp re-prices the level under a lock), every limit
// is the database's to hold, and a forged policy is spent inside the
// 14-argument launch_expedition. What this adds is the sentence before the
// click: plain words first and the game's word second, every price and
// effect spelled out, and every disabled button with its reason beside it.

import { useId, useState, useTransition, type ReactNode } from "react";
import { fmtPoints } from "@/lib/betting/format";
import {
  CAMP_PRICES,
  CAMP_UPGRADES,
  FORGED_PER_WEEK,
  FORGE_HOLD,
  POLICY_LINE,
  campLine,
  forgedPolicyState,
  levelOf,
  maxLevel,
  nextPurchase,
  priceLine,
  purchaseBlocks,
  type CampLevelCopy,
  type CampPurchase,
  type CampState,
  type CampUpgrade,
  type WallLandmark,
  type WallRelic,
  type WallRoad,
} from "@/lib/expeditions/camp";
import { EXPEDITION_TIERS, type ExpeditionTierKey } from "@/lib/expeditions/config";
import { ACCOLADES, type Accolade } from "@/lib/expeditions/standings";

export interface CampPanelProps {
  /** The collector's camp (fetchCamp). Null hides the panel. */
  camp: CampState | null;
  /** Map fragments held (fetchFragments). */
  fragments: number;
  /** The wallet, in dollars. */
  balance: number;
  /** Campaign relics on the shelf (wallRelics(copies)). */
  relics?: WallRelic[];
  /** The viewer's OWN season marks — the board filters accolades to
   *  viewerId before passing them. */
  accolades?: Accolade[];
  /** Landmarks the viewer named first. Leave undefined until the atlas
   *  (Phase 6) reads them: the wall then leaves the row out rather than
   *  promising an empty one. */
  landmarks?: WallLandmark[];
  /** Roads the viewer walked end to end; undefined until the atlas. */
  roads?: WallRoad[];
  /** Forged launches sent this Eastern week (fetchForgedThisWeek); null
   *  when it could not be read. */
  forgedThisWeek?: number | null;
  /** Builds the next level of an upgrade — `level` is the level shown.
   *  Resolves to the error sentence, or null on success. The board wires
   *  upgradeCampAction and refreshes on success. */
  onUpgrade: (upgrade: CampUpgrade, level: number) => Promise<string | null>;
  /** Forges one policy — `held` is the count shown. forgePolicyAction. */
  onForge: (held: number) => Promise<string | null>;
}

/** "A tent: the first time…" — the plain name, then what it does. */
function sentence(copy: CampLevelCopy): string {
  return `${copy.title}: ${copy.does.charAt(0).toLowerCase()}${copy.does.slice(1)}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The purchases in the order the panel lists them; the first one that
 *  can be bought right now is the panel's one primary action. */
const PURCHASE_ORDER: readonly CampPurchase[] = ["slot", "tent", "forge", "policy", "wall"];

function BuyButton({
  label,
  reasons,
  primary,
  busy,
  disabled,
  onClick,
  testId,
}: {
  label: string;
  reasons: string[];
  primary: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}) {
  const reasonId = useId();
  const blocked = reasons.length > 0;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        disabled={blocked || disabled}
        aria-describedby={blocked ? reasonId : undefined}
        className={`${primary ? "btn-coral px-4" : "btn-pill"} min-h-11 w-full text-sm sm:w-fit disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {busy ? "Building…" : label}
      </button>
      {blocked ? (
        <p id={reasonId} data-reason data-testid={`${testId}-reason`} className="text-xs text-gold">
          {reasons.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

export default function CampPanel({
  camp,
  fragments,
  balance,
  relics = [],
  accolades = [],
  landmarks,
  roads,
  forgedThisWeek = null,
  onUpgrade,
  onForge,
}: CampPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<CampPurchase | null>(null);
  const [pending, startTransition] = useTransition();

  if (!camp) return null;
  // Named once, so the closures below see a camp and never a null.
  const current: CampState = camp;

  const wallet = { balance, fragments };
  const blocksOf = (purchase: CampPurchase) => purchaseBlocks(current, purchase, wallet);
  const primary = PURCHASE_ORDER.find((purchase) => nextPurchase(current, purchase) !== null && blocksOf(purchase).length === 0) ?? null;

  function buy(purchase: CampPurchase, run: () => Promise<string | null>) {
    setError(null);
    setBusy(purchase);
    startTransition(async () => {
      const message = await run();
      setError(message);
      setBusy(null);
    });
  }

  function upgradeCard(upgrade: CampUpgrade) {
    const level = levelOf(current, upgrade);
    const max = maxLevel(upgrade);
    const next = nextPurchase(current, upgrade);
    const nextCopy = next ? campLine(upgrade, next.level) : null;
    const built = Array.from({ length: level }, (_, index) => campLine(upgrade, index + 1));
    const name = campLine(upgrade, Math.max(1, level)).title;
    return (
      <li
        key={upgrade}
        data-testid={`camp-${upgrade}`}
        className={`card-brand flex flex-col gap-2 p-4 ${level >= max ? "border-mint/50" : ""}`}
      >
        <div className="flex flex-col gap-0.5">
          <h3 className="type-display text-lg text-white">{name}</h3>
          <span data-testid={`camp-${upgrade}-level`} className="text-xs text-steel">
            {campLine(upgrade, 1).term} · {level === 0 ? "not built yet" : `level ${level} of ${max}`}
          </span>
        </div>

        {built.length > 0 ? (
          <ul data-testid={`camp-${upgrade}-built`} className="flex flex-col gap-1 text-sm text-mint">
            {built.map((copy) => (
              <li key={copy.title}>
                <span className="font-semibold">Built.</span> <span className="text-white">{sentence(copy)}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {next && nextCopy ? (
          <>
            <p data-testid={`camp-${upgrade}-next`} className="text-sm text-white">
              {level > 0 ? <span className="font-semibold text-gold">Next: </span> : null}
              {sentence(nextCopy)}
            </p>
            <p className="text-xs text-steel">
              Costs <span className="font-semibold text-white">{priceLine(next.price)}</span>
            </p>
            <BuyButton
              testId={`camp-buy-${upgrade}`}
              label={`Build ${nextCopy.title.charAt(0).toLowerCase()}${nextCopy.title.slice(1)} — ${priceLine(next.price)}`}
              reasons={blocksOf(upgrade)}
              primary={primary === upgrade}
              busy={pending && busy === upgrade}
              disabled={pending}
              onClick={() => buy(upgrade, () => onUpgrade(upgrade, next.level))}
            />
          </>
        ) : (
          <p data-testid={`camp-${upgrade}-done`} className="text-xs text-steel">
            Fully built — nothing more to buy here.
          </p>
        )}

        {upgrade === "forge" && current.forge >= 1 ? forgeBlock() : null}
        {upgrade === "wall" ? wallBlock() : null}
      </li>
    );
  }

  function forgeBlock() {
    const held = current.forgedPolicies;
    const spent = forgedThisWeek !== null && forgedThisWeek >= FORGED_PER_WEEK;
    return (
      <div data-testid="camp-policy" className="mt-1 flex flex-col gap-2 rounded-md border border-line bg-panel p-3">
        <p className="text-sm text-white">{sentence(POLICY_LINE)}</p>
        <p data-testid="camp-policy-held" className="text-xs text-steel">
          You hold <span className="font-semibold text-white">{held}</span> of {FORGE_HOLD} forged policies.{" "}
          {spent
            ? "This week's forged launch is used; the next can go out Monday (Eastern)."
            : held > 0
              ? "To use one, tick “Use a forged policy” on a route that can hurt a card."
              : ""}
        </p>
        <BuyButton
          testId="camp-buy-policy"
          label={`Forge a policy — ${priceLine(CAMP_PRICES.policy[0])}`}
          reasons={blocksOf("policy")}
          primary={primary === "policy"}
          busy={pending && busy === "policy"}
          disabled={pending}
          onClick={() => buy("policy", () => onForge(held))}
        />
      </div>
    );
  }

  function wallBlock() {
    if (current.wall < 1) {
      const waiting = [
        relics.length > 0 ? plural(relics.length, "campaign relic") : null,
        accolades.length > 0 ? plural(accolades.length, "season mark") : null,
        landmarks && landmarks.length > 0 ? plural(landmarks.length, "landmark") : null,
        roads && roads.length > 0 ? plural(roads.length, "finished road") : null,
      ].filter((part): part is string => part !== null);
      return waiting.length > 0 ? (
        <p data-testid="camp-wall-waiting" className="text-xs text-steel">
          Waiting to go up: {waiting.join(", ")}.
        </p>
      ) : null;
    }
    return (
      <div data-testid="camp-wall-contents" className="mt-1 flex flex-col gap-3 rounded-md border border-line bg-panel p-3 text-sm">
        <WallRow
          label="Campaign relics"
          testId="camp-wall-relics"
          empty="None yet. Finish a campaign and its finale prints a relic of a survivor."
          items={relics.map((relic) => (
            <li key={relic.id}>
              <span className="text-white">{relic.name}</span> <span className="text-steel">· {relic.campaign}</span>
            </li>
          ))}
        />
        <WallRow
          label="Season marks"
          testId="camp-wall-marks"
          empty="None yet. When a season closes, the most miles, the most loot and the most Legendary homecomings each take a mark."
          items={accolades.map((accolade) => (
            <li key={`${accolade.kind}-${accolade.awardedAt}`}>
              <span className="text-gold">{ACCOLADES[accolade.kind].glyph}</span>{" "}
              <span className="text-white">{ACCOLADES[accolade.kind].label}</span>{" "}
              <span className="text-steel">· {ACCOLADES[accolade.kind].does}</span>
            </li>
          ))}
        />
        {landmarks ? (
          <WallRow
            label="Landmarks you named"
            testId="camp-wall-landmarks"
            empty="None yet. The first squad to reach a landmark names it."
            items={landmarks.map((landmark) => (
              <li key={landmark.key} className="text-white">
                {landmark.title}
              </li>
            ))}
          />
        ) : null}
        {roads ? (
          <WallRow
            label="Roads you finished"
            testId="camp-wall-roads"
            empty="None yet. Walk every place on a route's road to finish it."
            items={roads.map((road) => (
              <li key={road.tier} className="text-white">
                {EXPEDITION_TIERS[road.tier].label}
              </li>
            ))}
          />
        ) : null}
        {current.wall >= 2 ? (
          <p data-testid="camp-wall-plaque" className="text-xs text-mint">
            Your plaque is up: landmarks you named carry your crest.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section aria-label="Base camp" data-testid="camp" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="label-dash">Upgrades you buy once and keep</span>
        <h2 className="type-display text-2xl sm:text-3xl">Base camp</h2>
        <p className="text-sm text-steel">
          Your camp stays yours every season and in both leagues. It is paid for with dollars and map fragments.
        </p>
        <p data-testid="camp-wallet" className="text-sm text-white">
          You have <span className="font-semibold">{fmtPoints(balance)}</span> and{" "}
          <span className="font-semibold">{plural(fragments, "map fragment")}</span>.
          {camp.spent > 0 ? <span className="text-steel"> Your camp has cost {fmtPoints(camp.spent)} so far.</span> : null}
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">{CAMP_UPGRADES.map((upgrade) => upgradeCard(upgrade))}</ul>

      {error ? (
        <p role="alert" data-testid="camp-error" className="text-sm text-coral">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function WallRow({ label, testId, empty, items }: { label: string; testId: string; empty: string; items: ReactNode[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-dash">{label}</span>
      {items.length > 0 ? (
        <ul data-testid={testId} className="flex flex-col gap-0.5">
          {items}
        </ul>
      ) : (
        <p data-testid={`${testId}-empty`} className="text-xs text-steel">
          {empty}
        </p>
      )}
    </div>
  );
}

/**
 * "Use a forged policy" for the route card, from the same `camp`. Renders
 * nothing when there is nothing to offer: no camp, no policy held, or a
 * route that cannot hurt a card. Ticking it is a request — the launch
 * passes `forged: true` and the 14-argument launch_expedition spends the
 * policy under the wallet lock. When it cannot be ticked the reason is
 * printed beside it. It stands in for "Insure this run": the board unticks
 * one when the other is ticked.
 */
export function ForgedPolicyToggle({
  camp,
  forgedThisWeek,
  tier,
  checked,
  onChange,
}: {
  camp: CampState | null;
  forgedThisWeek: number | null;
  tier: ExpeditionTierKey;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const reasonId = useId();
  const state = forgedPolicyState(camp, forgedThisWeek, tier);
  if (!state) return null;
  const blocked = state.reason !== null;
  return (
    <div data-testid="forged-policy" className="flex flex-col gap-1">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          data-testid="forged-policy-toggle"
          checked={checked && !blocked}
          disabled={blocked}
          aria-describedby={blocked ? reasonId : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span>
          <span className="text-white">Use a forged policy</span>{" "}
          <span className="text-xs text-steel">
            free insurance from your forge: no fee, and this week&apos;s policy stays unused · {plural(state.held, "forged policy", "forged policies")}{" "}
            held · lost becomes wounded, dead becomes lost
          </span>
        </span>
      </label>
      {blocked ? (
        <p id={reasonId} data-reason data-testid="forged-policy-reason" className="text-xs text-gold">
          {state.reason}
        </p>
      ) : null}
    </div>
  );
}
