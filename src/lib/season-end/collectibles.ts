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

function encodedPart(value: string): string {
  // Percent encoding keeps the component boundaries unambiguous without
  // collapsing punctuation, Unicode, or case distinctions. Existing minted
  // rows are never rewritten; new revisions use this form.
  return encodeURIComponent(value.normalize("NFC").trim() || "unknown");
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
    "se1",
    encodedPart(input.releaseId),
    encodedPart(input.league),
    encodedPart(input.season),
    encodedPart(input.kind),
    encodedPart(input.awardId),
    encodedPart(input.subjectId),
    encodedPart(input.division ?? "global"),
  ].join(":");
}

/**
 * Use plain decimal notation for numbers so JSONB/numeric and JavaScript
 * produce the same canonical bytes. JSON.stringify uses exponent notation for
 * very small and very large values, while PostgreSQL's numeric output uses
 * decimal notation; expanding the exponent here makes the contract portable.
 */
function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) return "null";
  if (value === 0 || Object.is(value, -0)) return "0";

  const source = value.toString();
  const exponentIndex = source.search(/[eE]/);
  if (exponentIndex < 0) return source;

  const mantissa = source.slice(0, exponentIndex);
  const exponent = Number(source.slice(exponentIndex + 1));
  const negative = mantissa.startsWith("-");
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = whole + fraction;
  const decimalIndex = whole.length + exponent;
  const sign = negative ? "-" : "";

  if (decimalIndex <= 0) return `${sign}0.${"0".repeat(-decimalIndex)}${digits}`;
  if (decimalIndex >= digits.length) return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

/** JSON with sorted object keys and portable decimal numbers. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return typeof value === "number" ? canonicalNumber(value) : JSON.stringify(value) ?? "null";
}

// Small, dependency-free SHA-256 implementation. Season's End payloads are
// also rendered by client components, so pulling node:crypto into this module
// would poison the client bundle. TextEncoder gives every runtime the same
// UTF-8 bytes.
function sha256Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const words = new Uint32Array(64);
  const initial = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const round = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
    0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
    0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
    0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
    0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  // JavaScript cannot represent byte lengths beyond 2^32 safely here, and a
  // release payload is far smaller than that. The high word is therefore 0.
  view.setUint32(paddedLength - 8, 0);
  let [a, b, c, d, e, f, g, h] = initial;
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(words[i - 15], 7) ^ rotr(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = rotr(words[i - 2], 17) ^ rotr(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let [aa, bb, cc, dd, ee, ff, gg, hh] = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(ee, 6) ^ rotr(ee, 11) ^ rotr(ee, 25);
      const choose = (ee & ff) ^ (~ee & gg);
      const temp1 = (hh + s1 + choose + round[i] + words[i]) >>> 0;
      const s0 = rotr(aa, 2) ^ rotr(aa, 13) ^ rotr(aa, 22);
      const majority = (aa & bb) ^ (aa & cc) ^ (bb & cc);
      const temp2 = (s0 + majority) >>> 0;
      [hh, gg, ff, ee, dd, cc, bb, aa] = [gg, ff, ee, (dd + temp1) >>> 0, cc, bb, aa, (temp1 + temp2) >>> 0];
    }
    a = (a + aa) >>> 0; b = (b + bb) >>> 0; c = (c + cc) >>> 0; d = (d + dd) >>> 0;
    e = (e + ee) >>> 0; f = (f + ff) >>> 0; g = (g + gg) >>> 0; h = (h + hh) >>> 0;
  }
  return [a, b, c, d, e, f, g, h].map((word) => word.toString(16).padStart(8, "0")).join("");
}

/** Deterministic, runtime-independent SHA-256 catalog digest. */
export function catalogHash(designs: readonly SeasonEndCollectible[]): string {
  return sha256Hex(stableJson(designs).normalize("NFC"));
}

/** Digest the full immutable release contract, not only the design payload. */
export function releaseRevisionDigest(input: {
  catalog: Pick<SeasonEndCatalog, "releaseId" | "league" | "season" | "schemaVersion" | "rulesVersion" | "designs" | "withheldAwards">;
  price?: number;
  rules: unknown;
  signingBook: unknown;
  economy: unknown;
  calibration: unknown;
  reviewDecisions?: unknown;
}): string {
  return sha256Hex(stableJson({
    schema: "season-end-release-v1",
    catalog: {
      releaseId: input.catalog.releaseId,
      league: input.catalog.league,
      season: input.catalog.season,
      schemaVersion: input.catalog.schemaVersion,
      rulesVersion: input.catalog.rulesVersion,
      withheldAwards: input.catalog.withheldAwards,
      designs: [...input.catalog.designs].sort((left, right) => left.designId < right.designId ? -1 : left.designId > right.designId ? 1 : 0),
    },
    price: input.price ?? null,
    rules: input.rules,
    signingBook: input.signingBook,
    economy: input.economy,
    calibration: input.calibration,
    reviewDecisions: input.reviewDecisions ?? {},
  }).normalize("NFC"));
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

  if (!catalog || (catalog.league !== "premier" && catalog.league !== "academy") || typeof catalog.releaseId !== "string" || !catalog.releaseId || typeof catalog.season !== "string" || !catalog.season) {
    errors.push("catalog identity is invalid");
  }
  if (!Array.isArray(catalog?.designs)) return { ok: false, errors: [...errors, "catalog designs must be an array"], counts };

  const stringField = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
  const validArtwork = (artwork: unknown): boolean => {
    if (!artwork || typeof artwork !== "object") return false;
    const value = artwork as Record<string, unknown>;
    if (value.kind === "fallback") return stringField(value.label);
    if (value.kind === "single") return (value.primaryUrl === null || stringField(value.primaryUrl)) && (value.fallbackUrl === null || stringField(value.fallbackUrl)) && ["cropPositionX", "cropPositionY", "zoom"].every((key) => typeof value[key] === "number" && Number.isFinite(value[key] as number));
    if (value.kind === "pair") return Array.isArray(value.panels) && value.panels.length > 0 && value.panels.every((panel) => panel && typeof panel === "object" && stringField((panel as Record<string, unknown>).key) && stringField((panel as Record<string, unknown>).name));
    if (value.kind === "team") return stringField(value.teamName) && stringField(value.fallbackLabel) && (value.logoUrl === null || stringField(value.logoUrl));
    return false;
  };

  for (const rawDesign of catalog.designs as unknown[]) {
    if (!rawDesign || typeof rawDesign !== "object") {
      errors.push("catalog contains a non-object design");
      continue;
    }
    const design = rawDesign as SeasonEndCollectible;
    if (!(["season", "best_of", "accolade"] as string[]).includes(design.kind)) {
      errors.push("catalog contains an unsupported design family");
      continue;
    }
    const designId = typeof design.designId === "string" ? design.designId : "";
    if (!designId) errors.push("catalog contains a design without an id");
    const signatureEligible = Boolean(design.signatureEligible);
    counts[design.kind] += 1;
    if (design.releaseId !== catalog.releaseId) errors.push(`${designId}: release mismatch`);
    if (design.league !== catalog.league || design.season !== catalog.season) errors.push(`${designId}: league/season mismatch`);
    if (design.schemaVersion !== 1) errors.push(`${designId}: unsupported schema version`);
    if (ids.has(designId)) errors.push(`${designId}: duplicate design id`);
    ids.add(designId);
    if (!design.display || !stringField(design.display.title) || !stringField(design.display.subtitle) || !stringField(design.display.description) || !stringField(design.display.headline) || !stringField(design.display.evidence)) errors.push(`${designId}: incomplete display payload`);
    if (!validArtwork(design.artwork)) errors.push(`${designId}: invalid artwork payload`);
    if (!design.evidence || typeof design.evidence !== "object") errors.push(`${designId}: invalid evidence payload`);
    if (!Number.isInteger(design.baseSalvage) || design.baseSalvage <= 0) errors.push(`${designId}: invalid salvage value`);
    if (design.kind === "accolade") {
      if (signatureEligible) errors.push(`${designId}: accolade cannot be signable`);
      if (!design.subject || !["player", "pair", "team"].includes(design.subject.kind)) errors.push(`${designId}: invalid accolade subject`);
      if (design.source?.kind !== "season-accolade" || !design.source.awardId) errors.push(`${designId}: invalid accolade source`);
    } else {
      if (!signatureEligible) errors.push(`${designId}: player collectible must be signable`);
      if (!design.player || !stringField(design.player.key) || !stringField(design.player.name) || !stringField(design.player.tag) || !stringField(design.player.slug)) errors.push(`${designId}: invalid player identity`);
      if (design.kind === "season" && !design.card) errors.push(`${designId}: missing frozen player card`);
      if (design.kind === "best_of" && (!design.champion || !stringField(design.champion.id) || !stringField(design.champion.name) || !Number.isFinite(design.champion.games) || !Number.isFinite(design.champion.wins) || !Number.isFinite(design.champion.winRate))) errors.push(`${designId}: invalid champion payload`);
      if (design.source?.kind !== (design.kind === "best_of" ? "best-of-champion" : "cumulative-season-card")) errors.push(`${designId}: invalid player source`);
    }
  }

  if (counts.season < 2) errors.push("at least two Season Cards are required");
  if (counts.best_of < 1) errors.push("the Best Of family is empty");
  if (counts.accolade < 1) errors.push("the Accolade family is empty");
  if (catalog.designs.length < 5) errors.push("at least five unique designs are required");
  if (catalog.designs.filter((design) => design.kind === "best_of" || design.kind === "accolade").length < 2) errors.push("slots 3–4 need at least two award-family designs");

  return { ok: errors.length === 0, errors, counts };
}

/** The lock gate is stricter than preview/roller validation. */
export function validateSeasonEndCatalogForLock(catalog: Pick<SeasonEndCatalog, "releaseId" | "league" | "season" | "designs">): CatalogValidation {
  const result = validateSeasonEndCatalog(catalog);
  if (result.counts.best_of < 2) result.errors.push("at least two Best Of designs are required for slots 3–4");
  if (result.counts.accolade < 2) result.errors.push("at least two Accolade designs are required for slots 3–4");
  return { ...result, ok: result.errors.length === 0 };
}

export function designSubjectId(design: SeasonEndCollectible): string {
  if (design.kind === "season" || design.kind === "best_of") return design.player.key;
  if (design.subject.kind === "player") return design.subject.player.key;
  if (design.subject.kind === "team") return design.subject.team.key;
  return design.subject.members.map((member) => `${member.role ?? ""}=${member.key}`).join("|");
}
