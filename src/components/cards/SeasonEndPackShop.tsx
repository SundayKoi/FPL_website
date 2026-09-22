"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openSeasonEndPackAction, type SeasonEndOpenPackResult, type SeasonEndPullResult } from "@/lib/packs/season-end-actions";
import { getMuted, getMutedServer, subscribeMuted } from "@/lib/packs/sounds";
import type { RarityClass } from "@/lib/packs/config";
import type { SeasonEndRelease } from "@/lib/season-end/release-queries";
import type { SeasonEndCatalog } from "@/lib/season-end/collectibles";
import CollectibleRenderer from "./CollectibleRenderer";
import PackOpening, { type OpenResult, type Pull } from "./PackOpening";

type PurchaseState = "not_started" | "pending" | "fulfilled" | "refunded";

const PENDING_STORAGE_VERSION = "2";

function requestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readIntent(key: string, legacyKey: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey);
  } catch {
    return null;
  }
}

function saveIntent(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The server request id remains retryable in this tab when storage is
    // unavailable because of private browsing or a full quota.
  }
}

function clearIntent(key: string, legacyKey: string): void {
  try {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(legacyKey);
  } catch {
    // Do not turn a confirmed terminal response into a new charge if storage
    // refuses the acknowledgement; in-memory state remains terminal.
  }
}

function slotCopy(slot: number): string {
  if (slot < 2) return "Season Card";
  if (slot < 4) return "Accolade or Best Of";
  return "Guaranteed foil from any family";
}

/** Season's End has no player-card tier, but the shared opening stage still
 * uses its back aura as a quiet hint. The guaranteed foil is the brightest
 * back and stays in the server-defined fifth position. */
function backRarity(pull: SeasonEndPullResult): RarityClass {
  if (pull.guaranteedFoil) return "legendary";
  if (pull.foil) return "epic";
  return pull.design.kind === "accolade" ? "rare" : "common";
}

function openingPull(pull: SeasonEndPullResult): Pull {
  return {
    card: null,
    foil: pull.foil,
    foilType: pull.foilType,
    signed: pull.signed,
    inventoryId: pull.inventoryId,
    displayName: pull.design.display.title,
    newKey: pull.design.designId,
    backRarity: backRarity(pull),
    renderFace: <CollectibleRenderer pull={pull} showBestOfDescription={false} />,
  };
}

function openingResult(result: SeasonEndOpenPackResult): OpenResult {
  if (!result.ok) return result;
  return {
    ok: true,
    cards: result.cards.map(openingPull),
    balance: result.balance,
    openingId: result.openingId,
    revealOrder: result.revealOrder,
    preserveOrder: true,
  };
}

export default function SeasonEndPackShop({
  league,
  season,
  release,
  catalog,
  ownedDesignIds = [],
  adminTest = false,
  viewerId = null,
  initialRequestId = null,
  recoveryOnly = false,
}: {
  league: "premier" | "academy";
  season: string;
  release: SeasonEndRelease;
  catalog: SeasonEndCatalog | null;
  ownedDesignIds?: string[];
  adminTest?: boolean;
  viewerId?: string | null;
  initialRequestId?: string | null;
  recoveryOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [pulls, setPulls] = useState<SeasonEndPullResult[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  const [purchaseState, setPurchaseState] = useState<PurchaseState>("not_started");
  const muted = useSyncExternalStore(subscribeMuted, getMuted, getMutedServer);
  const activeRequest = useRef<string | null>(null);
  const mode = adminTest ? "admin_test" : "public";
  const pendingKey = `season-end-pending:v${PENDING_STORAGE_VERSION}:${viewerId ?? "signed-out"}:${release.id}:${mode}`;
  const legacyPendingKey = `season-end-pending:${viewerId ?? "signed-out"}:${release.id}:${mode}`;

  async function resolve(request: string): Promise<SeasonEndOpenPackResult | null> {
    activeRequest.current = request;
    setIntent(request);
    setPurchaseState("pending");
    try {
      const result: SeasonEndOpenPackResult = await openSeasonEndPackAction({ league, season, releaseId: release.id, mode, requestId: request });
      if (activeRequest.current !== request) return null;
      if (!result.ok) {
        setPurchaseState(result.code === "refunded" ? "refunded" : "pending");
        // Pending, transport, and terminal responses keep the same UUID. Only
        // an explicit terminal acknowledgement clears it.
        setError(result.error);
        return result;
      }
      setPurchaseState("fulfilled");
      setPulls(result.cards);
      setBalance(result.balance);
      setError(null);
      router.refresh();
      return result;
    } catch (caught) {
      if (activeRequest.current !== request) return null;
      setPurchaseState("pending");
      const message = caught instanceof Error ? `${caught.message} The same purchase intent is still saved; retry recovery.` : "The opening request was interrupted. The same purchase intent is still saved; retry recovery.";
      setError(message);
      return { ok: false, error: message, code: "pending" };
    }
  }

  useEffect(() => {
    activeRequest.current = null;
    if (!viewerId) return;
    const stored = readIntent(pendingKey, legacyPendingKey) ?? initialRequestId;
    if (!stored) return;
    saveIntent(pendingKey, stored);
    startTransition(async () => {
      await resolve(stored);
    });
    // The request is scoped to the exact account, release, and mode. A changed
    // account gets a different key and cannot resume the old intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRequestId, legacyPendingKey, pendingKey, viewerId]);

  function open() {
    if (pending || purchaseState === "fulfilled") return;
    if (intent) {
      setError(null);
      startTransition(async () => { await resolve(intent); });
      return;
    }
    if (recoveryOnly) return;
    setError(null);
    const request = requestId();
    saveIntent(pendingKey, request);
    setIntent(request);
    startTransition(async () => {
      await resolve(request);
    });
  }

  function openAnother() {
    clearIntent(pendingKey, legacyPendingKey);
    activeRequest.current = null;
    setIntent(null);
    setPurchaseState("not_started");
    setPulls(null);
    setBalance(null);
    setError(null);
  }

  async function openAnotherFromStage(): Promise<OpenResult> {
    const request = requestId();
    clearIntent(pendingKey, legacyPendingKey);
    saveIntent(pendingKey, request);
    const result = await resolve(request);
    return result ? openingResult(result) : { ok: false, error: "The opening request was interrupted. Retry recovery." };
  }

  const owned = new Set(ownedDesignIds);
  const baseDesigns = catalog?.designs ?? [];
  const showRecoveryAction = Boolean(intent) || purchaseState === "refunded";
  const primaryAction = purchaseState === "refunded" ? openAnother : open;
  const resolving = pending && purchaseState === "pending";
  const primaryLabel = purchaseState === "refunded"
      ? "Open another pack"
      : resolving
        ? "Resolving…"
      : intent
        ? "Retry recovery"
        : adminTest
          ? "Open test pack"
          : `Open for ${release.price.toLocaleString("en-US")} betting dollars`;

  return (
    <section className="card-brand flex flex-col gap-5 p-5" data-testid="season-end-pack-shop">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-dash text-gold">Season&apos;s End · {league === "academy" ? "Academy" : "Premier"} · {season}</p>
          <h2 className="type-display mt-2 text-3xl">Season&apos;s End Pack</h2>
          <p className="mt-2 max-w-2xl text-sm text-steel">Five frozen collectibles: two Season Cards, two independently selected Accolade/Best Of cards, then one guaranteed foil. The finish is guaranteed; signatures are only eligible on Season Cards and Best Of.</p>
        </div>
        {!recoveryOnly || showRecoveryAction ? <button type="button" disabled={resolving || purchaseState === "fulfilled" || (release.paused && !intent && purchaseState !== "refunded")} onClick={primaryAction} className="rounded-lg border border-gold bg-gold px-5 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-50">
          {primaryLabel}
        </button> : null}
      </div>
      <div className="grid gap-2 text-sm text-steel sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((slot) => <div key={slot} className="rounded border border-line p-3"><span className="font-mono text-gold">{slot + 1}</span><p className="mt-1">{slotCopy(slot)}</p></div>)}
      </div>
      {release.signatureCalibration ? <p className="text-xs text-steel">Measured signature rate: {((Number(release.signatureCalibration.achievablePackProbability ?? 0)) * 100).toFixed(2)}% per pack; per-copy chance is capped at 5% when the signing book is sparse.</p> : <p className="text-xs text-coral">Signature calibration is not recorded; this release cannot be opened until staff completes the test rules.</p>}
      {release.paused ? <p className="text-sm text-coral">Purchases are paused. Existing charged openings retain their frozen terms.</p> : null}
      {recoveryOnly && purchaseState === "not_started" ? <p className="text-sm text-steel">This account can recover its existing Season&apos;s End opening. A new pack requires active membership.</p> : null}
      {error ? <p role="alert" className="text-sm text-coral">{error}</p> : null}
      {balance !== null ? <p className="text-xs text-steel">Balance after opening: {balance.toLocaleString("en-US")}</p> : null}
      {pulls ? (
        <PackOpening
          pulls={pulls.map(openingPull)}
          balance={balance ?? 0}
          packCost={release.price}
          ownedSlugs={ownedDesignIds}
          muted={muted}
          preserveOrder
          packLabel="Season&apos;s End pack"
          packValue={null}
          summaryNote="Guaranteed foil · protected from auto-dust"
          onOpenAnother={openAnotherFromStage}
          onExit={() => {
            clearIntent(pendingKey, legacyPendingKey);
            activeRequest.current = null;
            setPulls(null);
            setPurchaseState("not_started");
            setIntent(null);
            router.refresh();
          }}
        />
      ) : null}
      <div>
        <p className="text-xs uppercase tracking-[.18em] text-steel">Base-design checklist · {baseDesigns.filter((design) => owned.has(design.designId)).length}/{baseDesigns.length}</p>
        <div className="mt-2 flex flex-wrap gap-2">{baseDesigns.map((design) => <span key={design.designId} className={`rounded-full border px-3 py-1 text-xs ${owned.has(design.designId) ? "border-gold text-gold" : "border-line text-steel"}`}>{owned.has(design.designId) ? "✓ " : ""}{design.display.title}</span>)}</div>
      </div>
    </section>
  );
}
