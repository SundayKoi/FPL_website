import { DEFAULT_FOIL_TYPE, FOIL_CHANCE, FOIL_TYPE_WEIGHTS, SIGNED_CHANCE_CAP, type MintableFoilType } from "./config";
import { validateSeasonEndCatalog, type SeasonEndCatalog, type SeasonEndCollectible, type SeasonEndKind } from "@/lib/season-end/collectibles";

export const SEASON_END_PACK_SIZE = 5;
export const SEASON_END_PRICE = 500;

export interface SeasonEndRollRules {
  foilChance: number;
  slot34FamilyWeights: Record<"accolade" | "best_of", number>;
  slot5FamilyWeights: Record<SeasonEndKind, number>;
  guaranteedSlot: 5;
  signatureChance: number;
  signatureChanceCap: number;
  foilTypeWeights: Record<MintableFoilType, number>;
}

export const DEFAULT_SEASON_END_RULES: SeasonEndRollRules = {
  foilChance: FOIL_CHANCE,
  slot34FamilyWeights: { accolade: 50, best_of: 50 },
  slot5FamilyWeights: { season: 50, accolade: 25, best_of: 25 },
  guaranteedSlot: 5,
  signatureChance: 0,
  signatureChanceCap: SIGNED_CHANCE_CAP,
  foilTypeWeights: { ...FOIL_TYPE_WEIGHTS },
};

export interface SeasonEndPull {
  design: SeasonEndCollectible;
  foil: boolean;
  foilType: MintableFoilType | null;
  signed: boolean;
  autograph: string | null;
  guaranteedFoil: boolean;
}

function boundedRandom(rand: () => number): number {
  const value = rand();
  return Number.isFinite(value) ? Math.min(0.999999999999, Math.max(0, value)) : 0;
}

function pickWeighted<T extends string>(items: readonly T[], weights: Readonly<Record<string, number>>, rand: () => number): T {
  if (!items.length) throw new Error("cannot draw from an empty weighted pool");
  const total = items.reduce((sum, item) => sum + Math.max(0, weights[item] ?? 0), 0);
  if (total <= 0) return items[Math.min(items.length - 1, Math.floor(boundedRandom(rand) * items.length))];
  let ticket = boundedRandom(rand) * total;
  for (const item of items) {
    ticket -= Math.max(0, weights[item] ?? 0);
    if (ticket < 0) return item;
  }
  return items[items.length - 1];
}

function uniform<T>(items: readonly T[], rand: () => number): T {
  if (!items.length) throw new Error("cannot draw from an empty pool");
  return items[Math.min(items.length - 1, Math.floor(boundedRandom(rand) * items.length))];
}

function rollFoilTypeWithWeights(rand: () => number, weights: Readonly<Record<MintableFoilType, number>>): MintableFoilType {
  return pickWeighted(["prisma", "aurora", "refractor", "ice"], weights, rand);
}

function remainingByFamily(designs: readonly SeasonEndCollectible[], used: ReadonlySet<string>): Record<SeasonEndKind, SeasonEndCollectible[]> {
  return {
    season: designs.filter((design) => design.kind === "season" && !used.has(design.designId)),
    accolade: designs.filter((design) => design.kind === "accolade" && !used.has(design.designId)),
    best_of: designs.filter((design) => design.kind === "best_of" && !used.has(design.designId)),
  };
}

function pickFamily(
  byFamily: Record<SeasonEndKind, SeasonEndCollectible[]>,
  families: readonly SeasonEndKind[],
  weights: Readonly<Record<string, number>>,
  rand: () => number,
): SeasonEndKind {
  const available = families.filter((family) => byFamily[family].length > 0);
  if (!available.length) throw new Error("season-end catalog does not have a design for the requested slot");
  return pickWeighted(available, weights, rand);
}

/** Draw only design IDs. Kept separate so odds calibration can inspect K. */
export function selectSeasonEndDesigns(
  catalog: Pick<SeasonEndCatalog, "designs" | "releaseId" | "league" | "season">,
  rand: () => number,
  rules: Pick<SeasonEndRollRules, "slot34FamilyWeights" | "slot5FamilyWeights"> = DEFAULT_SEASON_END_RULES,
): SeasonEndCollectible[] {
  const validation = validateSeasonEndCatalog(catalog);
  if (!validation.ok) throw new Error(`invalid Season's End catalog: ${validation.errors.join("; ")}`);

  const used = new Set<string>();
  const selected: SeasonEndCollectible[] = [];
  const seasonPool = catalog.designs.filter((design) => design.kind === "season");
  if (seasonPool.length < 2) throw new Error("Season's End requires two Season Cards");
  for (let slot = 0; slot < 2; slot += 1) {
    const available = seasonPool.filter((design) => !used.has(design.designId));
    const design = uniform(available, rand);
    selected.push(design);
    used.add(design.designId);
  }

  for (let slot = 0; slot < 2; slot += 1) {
    const byFamily = remainingByFamily(catalog.designs, used);
    const family = pickFamily(byFamily, ["accolade", "best_of"], rules.slot34FamilyWeights, rand);
    const design = uniform(byFamily[family], rand);
    selected.push(design);
    used.add(design.designId);
  }

  const byFamily = remainingByFamily(catalog.designs, used);
  const family = pickFamily(byFamily, ["season", "accolade", "best_of"], rules.slot5FamilyWeights, rand);
  selected.push(uniform(byFamily[family], rand));
  return selected;
}

function finishDesigns(designs: readonly SeasonEndCollectible[], rand: () => number, rules: SeasonEndRollRules): Array<Omit<SeasonEndPull, "signed" | "autograph">> {
  return designs.map((design, index) => {
    const guaranteedFoil = index === 4;
    const foil = guaranteedFoil || boundedRandom(rand) < rules.foilChance;
    const foilType = foil ? rollFoilTypeWithWeights(rand, rules.foilTypeWeights) : null;
    return { design, foil, foilType, guaranteedFoil };
  });
}

export function applySeasonEndAutographs(
  pulls: readonly Omit<SeasonEndPull, "signed" | "autograph">[],
  signaturesByPlayerKey: ReadonlyMap<string, string>,
  rand: () => number,
  chance: number,
  chanceCap = SIGNED_CHANCE_CAP,
): SeasonEndPull[] {
  const cappedChance = Math.min(chanceCap, Math.max(0, chance));
  return pulls.map((pull) => {
    const player = pull.design.kind === "season" || pull.design.kind === "best_of" ? pull.design.player : null;
    const signature = player ? signaturesByPlayerKey.get(player.key) ?? null : null;
    const signed = Boolean(signature && boundedRandom(rand) < cappedChance);
    return {
      ...pull,
      foil: pull.foil || signed,
      foilType: pull.foilType ?? (signed ? DEFAULT_FOIL_TYPE : null),
      signed,
      autograph: signed ? signature : null,
    };
  });
}

export function validateSeasonEndPack(pulls: readonly SeasonEndPull[]): void {
  if (pulls.length !== SEASON_END_PACK_SIZE) throw new Error("a Season's End pack must contain exactly five cards");
  const ids = new Set(pulls.map((pull) => pull.design.designId));
  if (ids.size !== SEASON_END_PACK_SIZE) throw new Error("Season's End packs cannot contain duplicate designs");
  if (pulls.slice(0, 2).some((pull) => pull.design.kind !== "season")) throw new Error("Season's End slots 1–2 must be Season Cards");
  if (pulls.slice(2, 4).some((pull) => !["accolade", "best_of"].includes(pull.design.kind))) throw new Error("Season's End slots 3–4 must be Accolade or Best Of cards");
  if (!pulls[4].guaranteedFoil || !pulls[4].foil || !pulls[4].foilType) throw new Error("Season's End slot 5 must be a guaranteed foil");
  if (pulls.some((pull) => pull.design.kind === "accolade" && (pull.signed || pull.autograph))) throw new Error("accolades cannot be signed");
}

export function rollSeasonEndPack(
  catalog: SeasonEndCatalog,
  rand: () => number,
  signaturesByPlayerKey: ReadonlyMap<string, string> = new Map(),
  rules: SeasonEndRollRules = DEFAULT_SEASON_END_RULES,
): SeasonEndPull[] {
  const designs = selectSeasonEndDesigns(catalog, rand, rules);
  const finished = finishDesigns(designs, rand, rules);
  const pulls = applySeasonEndAutographs(finished, signaturesByPlayerKey, rand, rules.signatureChance, rules.signatureChanceCap);
  validateSeasonEndPack(pulls);
  return pulls;
}

export interface SignatureCalibrationInput {
  /** Probability that a reference standard five-card pack has at least one signature. */
  referencePackProbability: number;
  /** Distribution of K, the number of signable copies selected by one Season's End pack. */
  signableCopyDistribution: ReadonlyMap<number, number>;
  maxPerCopy?: number;
}

export interface SignatureCalibration {
  targetPackProbability: number;
  calibratedPerCopyChance: number;
  achievablePackProbability: number;
  capped: boolean;
  shortfall: number;
  method: "exact-distribution";
}

function probabilityAt(distribution: ReadonlyMap<number, number>, chance: number): number {
  return [...distribution.entries()].reduce((total, [copies, weight]) => total + weight * (1 - Math.pow(1 - chance, copies)), 0);
}

export function calibrateSeasonEndSignatures(input: SignatureCalibrationInput): SignatureCalibration {
  const target = Math.min(1, Math.max(0, input.referencePackProbability));
  const cap = Math.min(SIGNED_CHANCE_CAP, Math.max(0, input.maxPerCopy ?? SIGNED_CHANCE_CAP));
  const achievable = probabilityAt(input.signableCopyDistribution, cap);
  const capped = achievable + 1e-12 < target;
  let low = 0;
  let high = cap;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const middle = (low + high) / 2;
    if (probabilityAt(input.signableCopyDistribution, middle) < target) low = middle;
    else high = middle;
  }
  const chance = capped ? cap : high;
  const actual = probabilityAt(input.signableCopyDistribution, chance);
  return {
    targetPackProbability: target,
    calibratedPerCopyChance: chance,
    achievablePackProbability: actual,
    capped,
    shortfall: Math.max(0, target - actual),
    method: "exact-distribution",
  };
}

/** Exact by simulation of the finite selection distribution, not a purchase-path roll. */
export function signableCopyDistribution(
  catalog: SeasonEndCatalog,
  samples = 20_000,
  seed = 0x5eed,
  signaturesByPlayerKey?: ReadonlyMap<string, string>,
): Map<number, number> {
  if (!Number.isInteger(samples) || samples < 1) throw new Error("samples must be a positive integer");
  let state = seed >>> 0;
  const rand = () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 2 ** 32;
  };
  const distribution = new Map<number, number>();
  for (let sample = 0; sample < samples; sample += 1) {
    const selected = selectSeasonEndDesigns(catalog, rand);
    const signable = selected.filter((design) => {
      if (!design.signatureEligible || (design.kind !== "season" && design.kind !== "best_of")) return false;
      return !signaturesByPlayerKey || signaturesByPlayerKey.has(design.player.key);
    }).length;
    distribution.set(signable, (distribution.get(signable) ?? 0) + 1 / samples);
  }
  return distribution;
}

export function seasonEndDesignLabel(design: SeasonEndCollectible): string {
  return `${design.display.title} · ${designSubjectLabel(design)}`;
}

function designSubjectLabel(design: SeasonEndCollectible): string {
  if (design.kind === "season" || design.kind === "best_of") return design.player.name;
  if (design.subject.kind === "player") return design.subject.player.name;
  if (design.subject.kind === "team") return design.subject.team.name;
  return design.subject.members.map((member) => member.name).join(" + ");
}
