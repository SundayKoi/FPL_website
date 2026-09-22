import { cardPlayerKey, type PlayerCardData } from "@/lib/cards/build";
import { MOMENT_PULL_CHANCE } from "@/lib/cards/moments";
import { TEAM_PULL_CHANCE } from "@/lib/cards/teamCards";
import { applyAutographs } from "@/lib/packs/signatures";
import { rollPack } from "@/lib/packs/rng";
import { signedChance } from "@/lib/packs/signatures";

export interface StandardSignatureReferencePool {
  kind: "edition" | "current-week";
  editionWeek: string | null;
  /** Captured source identity, recorded when the live loader can provide it. */
  league?: "premier" | "academy";
  season?: string;
}

export interface StandardSignatureReferenceSubstitutions {
  /** The production opener only considers these branches for an edition. */
  editionWeek: string | null;
  momentPoolSize: number;
  teamPoolSize: number;
  momentChance?: number;
  teamChance?: number;
}

export interface StandardSignatureReference {
  packs: number;
  signedPacks: number;
  signedCopies: number;
  packProbability: number;
  perCopyProbability: number;
  signingCoverage: number;
  seed: number;
  branch: "ordinary-standard-excluding-god-pack";
  pool: StandardSignatureReferencePool;
  substitutions: Required<StandardSignatureReferenceSubstitutions>;
  signatureScope: "cross-season";
}

/**
 * Measure the same ordinary standard-pack player pipeline used by the
 * production opener. The pool and signature book are supplied by the caller
 * because they are live sources, while the pure roll below keeps the evidence
 * deterministic for a captured input. God Packs are excluded, but the
 * ordinary moment/team last-slot substitutions are included: either can remove
 * a signature that was applied to the original fifth pull.
 */
export function measureStandardSignatureReference(input: {
  cards: readonly PlayerCardData[];
  signaturesByPlayerKey: ReadonlyMap<string, string>;
  samples?: number;
  seed?: number;
  pool?: StandardSignatureReferencePool;
  substitutions?: StandardSignatureReferenceSubstitutions;
}): StandardSignatureReference {
  const samples = input.samples ?? 100_000;
  if (!Number.isInteger(samples) || samples < 1) throw new Error("standard signature samples must be positive");
  const pool = input.pool ?? { kind: "current-week", editionWeek: null };
  const substitutions = {
    editionWeek: input.substitutions?.editionWeek ?? pool.editionWeek,
    momentPoolSize: input.substitutions?.momentPoolSize ?? 0,
    teamPoolSize: input.substitutions?.teamPoolSize ?? 0,
    momentChance: input.substitutions?.momentChance ?? MOMENT_PULL_CHANCE,
    teamChance: input.substitutions?.teamChance ?? TEAM_PULL_CHANCE,
  };
  if (!Number.isInteger(substitutions.momentPoolSize) || substitutions.momentPoolSize < 0) throw new Error("moment substitution pool size must be a non-negative integer");
  if (!Number.isInteger(substitutions.teamPoolSize) || substitutions.teamPoolSize < 0) throw new Error("team substitution pool size must be a non-negative integer");
  if (!Number.isFinite(substitutions.momentChance) || substitutions.momentChance < 0 || substitutions.momentChance > 1) throw new Error("moment substitution chance must be between 0 and 1");
  if (!Number.isFinite(substitutions.teamChance) || substitutions.teamChance < 0 || substitutions.teamChance > 1) throw new Error("team substitution chance must be between 0 and 1");
  const signatures = new Map(input.cards
    .filter((card) => input.signaturesByPlayerKey.has(cardPlayerKey(card.name, card.tag)))
    .map((card) => [card.slug, input.signaturesByPlayerKey.get(cardPlayerKey(card.name, card.tag))!]));
  let state = (input.seed ?? 0x5ea50) >>> 0;
  const rand = () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 2 ** 32;
  };
  const chance = signedChance(input.cards, signatures);
  let signedPacks = 0;
  let signedCopies = 0;
  for (let pack = 0; pack < samples; pack += 1) {
    const pulls = applyAutographs([...rollPack([...input.cards], rand)], signatures, rand, chance);
    let substituted = false;
    // This mirrors openPackFor: a moment gets the last slot first and blocks
    // the team substitution branch for that pack. The extra rand call in each
    // branch is the selection from the live substitution pool, even though
    // only the signature count matters here.
    if (substitutions.editionWeek && substitutions.momentPoolSize > 0 && rand() < substitutions.momentChance) {
      rand();
      substituted = true;
    }
    if (substitutions.editionWeek && !substituted && substitutions.teamPoolSize > 0 && rand() < substitutions.teamChance) {
      rand();
      substituted = true;
    }
    if (substituted && pulls.length > 0) {
      const last = pulls[pulls.length - 1];
      pulls[pulls.length - 1] = { ...last, signed: false, autograph: null };
    }
    const signed = pulls.filter((pull) => pull.signed).length;
    signedCopies += signed;
    if (signed > 0) signedPacks += 1;
  }
  return {
    packs: samples,
    signedPacks,
    signedCopies,
    packProbability: signedPacks / samples,
    perCopyProbability: signedCopies / (samples * 5),
    signingCoverage: input.cards.length ? signatures.size / input.cards.length : 0,
    seed: input.seed ?? 0x5ea50,
    branch: "ordinary-standard-excluding-god-pack",
    pool,
    substitutions,
    signatureScope: "cross-season",
  };
}
