import type { PlayerCardData } from "@/lib/cards/build";
import type { CardLeague } from "@/lib/cards/queries";
import type { Division } from "@/lib/schedule/types";

/** The three collectible families in a Season's End release. */
export type SeasonEndKind = "season" | "best_of" | "accolade";

export interface CanonicalPlayerIdentity {
  key: string;
  name: string;
  tag: string;
  slug: string;
}

export type CollectibleArtwork =
  | {
      kind: "single";
      primaryUrl: string | null;
      fallbackUrl: string | null;
      cropPositionX: number;
      cropPositionY: number;
      zoom: number;
    }
  | {
      kind: "pair";
      panels: Array<{
        key: string;
        name: string;
        role: string;
        championName: string | null;
        primaryUrl: string | null;
        fallbackUrl: string | null;
        cropPositionX: number;
        cropPositionY: number;
        zoom: number;
      }>;
    }
  | {
      kind: "team";
      teamName: string;
      logoUrl: string | null;
      fallbackLabel: string;
      bannerColor: string | null;
    }
  | { kind: "fallback"; label: string };

export interface CollectibleDisplay {
  title: string;
  subtitle: string;
  description: string;
  headline: string;
  evidence: string;
  /** Stored for renderers that do not have the live award definition nearby. */
  unit?: string;
}

export interface CollectibleEvidence {
  awardId?: string;
  winnerValue?: number;
  games?: number;
  total?: number;
  champion?: string;
  championGames?: number;
  record?: string;
  source?: string;
}

export interface CollectibleSubjectPlayer {
  kind: "player";
  player: CanonicalPlayerIdentity;
}

export interface CollectibleSubjectPair {
  kind: "pair";
  members: Array<CanonicalPlayerIdentity & { role?: string }>;
}

export interface CollectibleSubjectTeam {
  kind: "team";
  team: { key: string; name: string };
}

export type AccoladeSubject = CollectibleSubjectPlayer | CollectibleSubjectPair | CollectibleSubjectTeam;

interface CollectibleCommon {
  designId: string;
  releaseId: string;
  league: CardLeague;
  season: string;
  division: Division | null;
  schemaVersion: 1;
  artwork: CollectibleArtwork;
  display: CollectibleDisplay;
  evidence: CollectibleEvidence;
  baseSalvage: number;
}

export interface SeasonCollectible extends CollectibleCommon {
  kind: "season";
  player: CanonicalPlayerIdentity;
  card: PlayerCardData;
  signatureEligible: true;
  source: { kind: "cumulative-season-card"; games: number };
}

export interface BestOfCollectible extends CollectibleCommon {
  kind: "best_of";
  player: CanonicalPlayerIdentity;
  champion: { id: string; name: string; games: number; wins: number; winRate: number };
  signatureEligible: true;
  source: { kind: "best-of-champion"; awardId: string; selectionPass?: string };
}

export interface AccoladeCollectible extends CollectibleCommon {
  kind: "accolade";
  subject: AccoladeSubject;
  signatureEligible: false;
  source: { kind: "season-accolade"; awardId: string; scope: "player" | "pair" | "team" };
}

export type SeasonEndCollectible = SeasonCollectible | BestOfCollectible | AccoladeCollectible;

export interface WithheldAward {
  awardId: string;
  title: string;
  status: "unavailable" | "unearned";
  reason: string;
}

export interface SeasonEndCatalog {
  releaseId: string;
  league: CardLeague;
  season: string;
  schemaVersion: 1;
  rulesVersion: string;
  designs: SeasonEndCollectible[];
  withheldAwards: WithheldAward[];
  catalogHash: string;
  createdAt: string;
}

function normalizedPart(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

/** Stable IDs include every identity boundary that can change a design. */
export function seasonEndDesignId(input: {
  releaseId: string;
  league: CardLeague;
  season: string;
  kind: SeasonEndKind;
  awardId: string;
  subjectId: string;
  division?: Division | null;
}): string {
  return [
    "se",
    normalizedPart(input.releaseId),
    input.league,
    normalizedPart(input.season),
    input.kind,
    normalizedPart(input.awardId),
    normalizedPart(input.subjectId),
    normalizedPart(input.division ?? "global"),
  ].join(":");
}

/** JSON with sorted object keys is sufficient for a portable catalog hash. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Deterministic, runtime-independent hash for audit labels and idempotency. */
export function catalogHash(designs: readonly SeasonEndCollectible[]): string {
  let hash = 2166136261;
  for (const character of stableJson(designs).normalize("NFC")) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface CatalogValidation {
  ok: boolean;
  errors: string[];
  counts: Record<SeasonEndKind, number>;
}

/** Release locking is deliberately stricter than preview rendering. */
export function validateSeasonEndCatalog(catalog: Pick<SeasonEndCatalog, "releaseId" | "league" | "season" | "designs">): CatalogValidation {
  const errors: string[] = [];
  const counts: Record<SeasonEndKind, number> = { season: 0, best_of: 0, accolade: 0 };
  const ids = new Set<string>();

  for (const design of catalog.designs) {
    const designId = design.designId;
    const signatureEligible = Boolean(design.signatureEligible);
    counts[design.kind] += 1;
    if (design.releaseId !== catalog.releaseId) errors.push(`${designId}: release mismatch`);
    if (design.league !== catalog.league || design.season !== catalog.season) errors.push(`${designId}: league/season mismatch`);
    if (design.schemaVersion !== 1) errors.push(`${designId}: unsupported schema version`);
    if (ids.has(designId)) errors.push(`${designId}: duplicate design id`);
    ids.add(designId);
    if (!design.display.title.trim()) errors.push(`${designId}: missing display title`);
    if (!design.artwork || design.artwork.kind === "fallback" && !design.artwork.label.trim()) errors.push(`${designId}: missing artwork fallback`);
    if (design.kind === "accolade" && signatureEligible) errors.push(`${designId}: accolade cannot be signable`);
    if (design.kind !== "accolade" && !signatureEligible) errors.push(`${designId}: player collectible must be signable`);
  }

  if (counts.season < 2) errors.push("at least two Season Cards are required");
  if (counts.best_of < 1) errors.push("the Best Of family is empty");
  if (counts.accolade < 1) errors.push("the Accolade family is empty");
  if (catalog.designs.length < 5) errors.push("at least five unique designs are required");
  if (catalog.designs.filter((design) => design.kind === "best_of" || design.kind === "accolade").length < 2) {
    errors.push("slots 3–4 need at least two award-family designs");
  }

  return { ok: errors.length === 0, errors, counts };
}

export function designSubjectId(design: SeasonEndCollectible): string {
  if (design.kind === "season" || design.kind === "best_of") return design.player.key;
  if (design.subject.kind === "player") return design.subject.player.key;
  if (design.subject.kind === "team") return design.subject.team.key;
  return design.subject.members.map((member) => member.key).sort().join("+");
}
