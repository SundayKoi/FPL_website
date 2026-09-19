import { championCenteredUrl, championSplashUrl } from "@/lib/match-draft/champions";
import { cardPlayerKey, teamBadgeKey, type PlayerCardData } from "@/lib/cards/build";
import type { CardLeague } from "@/lib/cards/queries";
import type { Division } from "@/lib/schedule/types";
import { catalogHash, seasonEndDesignId, type AccoladeCollectible, type AccoladeSubject, type BestOfCollectible, type CanonicalPlayerIdentity, type CollectibleArtwork, type CollectibleDisplay, type SeasonCollectible, type SeasonEndCatalog, type SeasonEndCollectible, type WithheldAward } from "./collectibles";
import type { AwardWinner, SeasonAward, SeasonEndResult } from "./derive";
import { formatAwardPresentation } from "./presentation";
import type { SeasonEndTeamIdentityMap } from "./queries";
import { championArtCrop } from "./championArt";

export const SEASON_END_RULES_VERSION = "season-end-2026-09-v1";

function canonicalPlayerFromCard(card: PlayerCardData): CanonicalPlayerIdentity {
  return { key: cardPlayerKey(card.name, card.tag), name: card.name, tag: card.tag, slug: card.slug };
}

function canonicalPlayerFromName(name: string, key?: string): CanonicalPlayerIdentity {
  const separator = name.lastIndexOf("#");
  const playerName = separator > 0 ? name.slice(0, separator) : name;
  const tag = separator > 0 ? name.slice(separator + 1) : "UNKNOWN";
  return {
    key: key ?? cardPlayerKey(playerName, tag),
    name: playerName.trim() || "Unknown player",
    tag: tag.trim() || "UNKNOWN",
    slug: `${playerName}-${tag}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "unknown"),
  };
}

function cardForWinner(winner: AwardWinner, cardsByPlayer: ReadonlyMap<string, PlayerCardData>): PlayerCardData | null {
  const key = winner.playerKeys?.[0];
  return key ? cardsByPlayer.get(key) ?? null : null;
}

function pairRoleLabel(role: string): string {
  return ({ TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support" } as Record<string, string>)[role] ?? role;
}

function teamMonogram(teamName: string): string {
  return teamName.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase() || "TEAM";
}

function singleArtwork(card: PlayerCardData | null, champion: string | null): CollectibleArtwork {
  const name = champion ?? card?.signature?.champion ?? null;
  const crop = name ? championArtCrop(name, 0) : null;
  return name && crop
    ? { kind: "single", primaryUrl: championCenteredUrl(name, 0), fallbackUrl: championSplashUrl(name, 0), ...crop }
    : { kind: "fallback", label: "Season's End" };
}

function pairArtwork(winner: AwardWinner): CollectibleArtwork {
  const members = winner.evidence?.duo?.members ?? winner.pairMembers ?? [];
  if (!members.length) return { kind: "fallback", label: "Pair award" };
  return {
    kind: "pair",
    panels: members.map((member) => ({
      key: member.playerKey,
      name: member.name,
      role: pairRoleLabel(member.role),
      championName: member.champion ? "champion" in member.champion ? member.champion.champion : member.champion.name : null,
      primaryUrl: member.champion ? championCenteredUrl("champion" in member.champion ? member.champion.champion : member.champion.name, 0) : null,
      fallbackUrl: member.champion ? championSplashUrl("champion" in member.champion ? member.champion.champion : member.champion.name, 0) : null,
      ...(member.champion ? championArtCrop("champion" in member.champion ? member.champion.champion : member.champion.name, 0) : { cropPositionX: 50, cropPositionY: 50, zoom: 1 }),
    })),
  };
}

function subjectForAccolade(
  award: SeasonAward,
  winner: AwardWinner,
  cardsByPlayer: ReadonlyMap<string, PlayerCardData>,
): AccoladeSubject {
  if (award.scope === "team") {
    return { kind: "team", team: { key: teamBadgeKey(winner.team), name: winner.team } };
  }
  if (award.scope === "pair") {
    const members = winner.evidence?.duo?.members ?? winner.pairMembers ?? [];
    return {
      kind: "pair",
      members: (members.length ? members : (winner.playerKeys ?? []).map((key) => ({ playerKey: key, name: key, role: undefined }))).map((member) => {
        const card = cardsByPlayer.get(member.playerKey);
        return { ...(card ? canonicalPlayerFromCard(card) : canonicalPlayerFromName(member.name, member.playerKey)), ...(member.role ? { role: member.role } : {}) };
      }),
    };
  }
  const card = cardForWinner(winner, cardsByPlayer);
  return { kind: "player", player: card ? canonicalPlayerFromCard(card) : canonicalPlayerFromName(winner.name, winner.playerKeys?.[0]) };
}

function displayFor(award: SeasonAward, winner: AwardWinner) {
  const presentation = formatAwardPresentation(award, winner);
  return {
    title: winner.title ?? award.title,
    subtitle: award.group,
    description: award.description,
    headline: presentation.headline,
    evidence: presentation.evidence,
    unit: presentation.unit,
  };
}

function common(input: {
  designId: string;
  releaseId: string;
  league: CardLeague;
  season: string;
  division: Division | null;
  artwork: CollectibleArtwork;
  display: CollectibleDisplay;
  evidence: SeasonEndCollectible["evidence"];
  baseSalvage: number;
}) {
  return { ...input, schemaVersion: 1 as const };
}

function buildSeasonDesign(
  card: PlayerCardData,
  releaseId: string,
  league: CardLeague,
  season: string,
): SeasonCollectible {
  const player = canonicalPlayerFromCard(card);
  return {
    ...common({
      designId: seasonEndDesignId({ releaseId, league, season, kind: "season", awardId: "season-card", subjectId: player.key }),
      releaseId,
      league,
      season,
      division: null,
      artwork: singleArtwork(card, card.artChampion ?? card.signature?.champion ?? null),
      display: {
        title: "Card of the Season",
        subtitle: "Cumulative Season Card",
        description: "A frozen cumulative card for a regular-season contributor.",
        headline: `${card.overall} OVR`,
        evidence: `${card.level} games · ${card.wins}–${card.losses} · ${card.winratePct}% win rate`,
      },
      evidence: { source: "cumulative-season-card", games: card.level },
      baseSalvage: 20,
    }),
    kind: "season",
    player,
    card,
    signatureEligible: true,
    source: { kind: "cumulative-season-card", games: card.level },
  };
}

function buildBestOfDesign(
  award: SeasonAward,
  winner: AwardWinner,
  card: PlayerCardData | null,
  releaseId: string,
  league: CardLeague,
  season: string,
): BestOfCollectible {
  const player = card ? canonicalPlayerFromCard(card) : canonicalPlayerFromName(winner.name, winner.playerKeys?.[0]);
  const champion = {
    id: winner.championId ?? winner.champion?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "unknown",
    name: winner.champion ?? "Unknown champion",
    games: winner.championGames ?? 0,
    wins: winner.evidence?.bestOf?.wins ?? 0,
    winRate: winner.evidence?.bestOf?.winRate ?? 0,
  };
  return {
    ...common({
      designId: seasonEndDesignId({ releaseId, league, season, kind: "best_of", awardId: award.id, subjectId: `${player.key}:${champion.id}`, division: winner.division }),
      releaseId,
      league,
      season,
      division: winner.division ?? null,
      artwork: singleArtwork(card, champion.name),
      display: displayFor(award, winner),
      evidence: { awardId: award.id, winnerValue: winner.value, games: winner.games, champion: champion.name, championGames: champion.games, source: "best-of" },
      baseSalvage: 30,
    }),
    kind: "best_of",
    player,
    champion,
    signatureEligible: true,
    source: { kind: "best-of-champion", awardId: award.id, selectionPass: winner.evidence?.bestOf?.selectionPass },
  };
}

function buildAccoladeDesign(
  award: SeasonAward,
  winner: AwardWinner,
  cardsByPlayer: ReadonlyMap<string, PlayerCardData>,
  teamIdentities: SeasonEndTeamIdentityMap,
  releaseId: string,
  league: CardLeague,
  season: string,
): AccoladeCollectible {
  const subject = subjectForAccolade(award, winner, cardsByPlayer);
  const artwork: CollectibleArtwork = award.scope === "pair"
    ? pairArtwork(winner)
    : award.scope === "team"
      ? (() => {
          const identity = teamIdentities[teamBadgeKey(winner.team)];
          return { kind: "team", teamName: identity?.name ?? winner.team, logoUrl: identity?.imageUrl ?? null, fallbackLabel: identity?.abbreviation ?? teamMonogram(winner.team), bannerColor: identity?.bannerColor ?? null };
        })()
      : singleArtwork(cardForWinner(winner, cardsByPlayer), winner.champion ?? null);
  const subjectId = subject.kind === "player" ? subject.player.key : subject.kind === "team" ? subject.team.key : subject.members.map((member) => member.key).sort().join("+");
  return {
    ...common({
      designId: seasonEndDesignId({ releaseId, league, season, kind: "accolade", awardId: award.id, subjectId, division: winner.division }),
      releaseId,
      league,
      season,
      division: winner.division ?? null,
      artwork,
      display: displayFor(award, winner),
      evidence: { awardId: award.id, winnerValue: winner.value, games: winner.games, total: winner.total, source: "accolade" },
      baseSalvage: 30,
    }),
    kind: "accolade",
    subject,
    signatureEligible: false,
    source: { kind: "season-accolade", awardId: award.id, scope: award.scope },
  };
}

export function buildDraftSeasonEndCatalog(input: {
  releaseId: string;
  league: CardLeague;
  season: string;
  seasonCards: readonly PlayerCardData[];
  result: SeasonEndResult;
  teamIdentities?: SeasonEndTeamIdentityMap;
  rulesVersion?: string;
  createdAt?: string;
}): SeasonEndCatalog {
  const cardsByPlayer = new Map(input.seasonCards.map((card) => [cardPlayerKey(card.name, card.tag), card]));
  const designs: SeasonEndCollectible[] = input.seasonCards
    .filter((card) => card.level > 5)
    .map((card) => buildSeasonDesign(card, input.releaseId, input.league, input.season));
  const withheldAwards: WithheldAward[] = [];

  for (const award of input.result.awards) {
    if (award.status !== "ready" || award.winners.length === 0) {
      withheldAwards.push({ awardId: award.id, title: award.title, status: award.status === "unavailable" ? "unavailable" : "unearned", reason: award.note ?? "No complete qualifying result." });
      continue;
    }
    for (const winner of award.winners) {
      designs.push(
        award.id === "best-of-champion"
          ? buildBestOfDesign(award, winner, cardForWinner(winner, cardsByPlayer), input.releaseId, input.league, input.season)
          : buildAccoladeDesign(award, winner, cardsByPlayer, input.teamIdentities ?? {}, input.releaseId, input.league, input.season),
      );
    }
  }

  const ordered = designs.slice().sort((left, right) => left.designId.localeCompare(right.designId));
  return {
    releaseId: input.releaseId,
    league: input.league,
    season: input.season,
    schemaVersion: 1,
    rulesVersion: input.rulesVersion ?? SEASON_END_RULES_VERSION,
    designs: ordered,
    withheldAwards,
    catalogHash: catalogHash(ordered),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
