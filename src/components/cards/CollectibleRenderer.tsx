"use client";

/* Season's End artwork is frozen remote art and delegates fallback handling to the shared preview artwork component. */

import type { AwardArtworkProps } from "@/components/admin/AwardArtwork";
import BestOfChampionCard from "@/components/admin/BestOfChampionCard";
import SeasonEndAwardFace from "@/components/admin/SeasonEndAwardFace";
import { SEASON_AWARDS, type AwardDefinition } from "@/lib/season-end/catalog";
import type { AccoladeCollectible, CollectibleArtwork, SeasonEndCollectible } from "@/lib/season-end/collectibles";
import type { AwardWinner, SeasonAward } from "@/lib/season-end/derive";
import type { SeasonEndPullResult } from "@/lib/packs/season-end-actions";
import PlayerCard3D from "./PlayerCard3D";
import awardStyles from "@/components/admin/SeasonEndAwardCard.module.css";
import styles from "./CollectibleRenderer.module.css";

function titleId(designId: string): string {
  return `season-end-${designId.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

type AwardDesign = Extract<SeasonEndCollectible, { kind: "best_of" | "accolade" }>;

function awardForDesign(design: AwardDesign): SeasonAward {
  const awardId = design.source.awardId;
  const definition: AwardDefinition = SEASON_AWARDS.find((award) => award.id === awardId) ?? {
    id: awardId,
    title: design.display.title,
    description: design.display.description,
    group: "Season stories",
    scope: design.kind === "best_of" ? "player" : design.source.scope,
    partition: design.division ? "division" : "league",
  };
  return { ...definition, description: design.display.description, status: "ready", winners: [] };
}

function bestOfWinner(design: Extract<SeasonEndCollectible, { kind: "best_of" }>): AwardWinner {
  const wins = design.champion.wins;
  const games = design.evidence.games ?? design.champion.games;
  return {
    name: `${design.player.name}#${design.player.tag}`,
    team: "",
    value: design.evidence.winnerValue ?? wins,
    games,
    division: design.division ?? undefined,
    champion: design.champion.name,
    championId: design.champion.id,
    championGames: design.champion.games,
    title: design.display.title,
    evidence: {
      bestOf: {
        wins,
        losses: Math.max(0, design.champion.games - wins),
        winRate: design.champion.winRate,
        meanPerformance: 0,
        seasonGames: games,
        championGames: design.champion.games,
      },
    },
  };
}

function accoladeSubjectName(design: AccoladeCollectible): string {
  if (design.subject.kind === "player") return `${design.subject.player.name}#${design.subject.player.tag}`;
  if (design.subject.kind === "team") return design.subject.team.name;
  return design.subject.members.map((member) => `${member.name}#${member.tag}`).join(" + ");
}

function artworkForAccolade(artwork: CollectibleArtwork): AwardArtworkProps {
  if (artwork.kind === "single") {
    return {
      variant: "single",
      primaryUrl: artwork.primaryUrl,
      fallbackUrl: artwork.fallbackUrl,
      cropPositionX: artwork.cropPositionX,
      cropPositionY: artwork.cropPositionY,
      zoom: artwork.zoom,
    };
  }
  if (artwork.kind === "pair") {
    return { variant: "pair", panels: artwork.panels.map((panel) => ({ ...panel })) };
  }
  if (artwork.kind === "team") {
    return {
      variant: "team",
      teamName: artwork.teamName,
      logoUrl: artwork.logoUrl,
      fallbackLabel: artwork.fallbackLabel,
      bannerColor: artwork.bannerColor,
    };
  }
  return { variant: "empty" };
}

function displayUnit(design: AccoladeCollectible, award: SeasonAward): string {
  if (design.display.unit !== undefined) return design.display.unit;
  if (design.display.headline.endsWith(" total") && award.totalUnit) return award.totalUnit;
  return award.scope === "pair" ? "Duo Impact" : award.unit ?? "";
}

function FrozenBestOf({ pull, design, compact, showDescription }: { pull: SeasonEndPullResult; design: Extract<SeasonEndCollectible, { kind: "best_of" }>; compact: boolean; showDescription: boolean }) {
  const winner = bestOfWinner(design);
  const award = awardForDesign(design);
  const crop = design.artwork.kind === "single"
    ? { cropPositionX: design.artwork.cropPositionX, cropPositionY: design.artwork.cropPositionY, zoom: design.artwork.zoom }
    : null;
  return (
    <div className={`${styles.collectible} ${compact ? styles.compact : ""}`} data-testid="season-end-best_of-renderer" data-card-format="standard" data-compact={compact ? "true" : "false"} data-foil={pull.foil ? "true" : "false"} data-foil-type={pull.foil ? pull.foilType ?? "foil" : "matte"} aria-label={`${design.display.title}. Finish: ${pull.foil ? pull.foilType ?? "foil" : "matte"}`}>
      <BestOfChampionCard
        award={award}
        winner={winner}
        season={design.season}
        league={design.league}
        headingId={titleId(design.designId)}
        division={design.division ?? undefined}
        autograph={pull.autograph}
        frozenArtwork={design.artwork.kind === "single" ? { primaryUrl: design.artwork.primaryUrl, fallbackUrl: design.artwork.fallbackUrl } : undefined}
        foil={pull.foil}
        foilType={pull.foilType}
        crop={crop}
        displayOverride={{ headline: design.display.headline, evidence: design.display.evidence }}
        showAdminDetails={false}
        showDescription={showDescription}
      />
    </div>
  );
}

function FrozenAccolade({ pull, design, compact }: { pull: SeasonEndPullResult; design: AccoladeCollectible; compact: boolean }) {
  const award = awardForDesign(design);
  const unit = displayUnit(design, award);
  const duo = design.source.scope === "pair";
  return (
    <article
      aria-labelledby={titleId(design.designId)}
      className={`${awardStyles.card} ${styles.collectible} ${compact ? styles.compact : ""}`}
      data-testid="season-end-accolade-renderer"
      data-card-format="standard"
      data-compact={compact ? "true" : "false"}
      data-foil={pull.foil ? "true" : "false"}
      data-foil-type={pull.foil ? pull.foilType ?? "foil" : "matte"}
    >
      <SeasonEndAwardFace
        titleId={titleId(design.designId)}
        title={design.display.title}
        description={duo ? undefined : design.display.description}
        category={design.display.subtitle}
        artwork={artworkForAccolade(design.artwork)}
        season={design.season}
        league={design.league}
        division={design.division ?? undefined}
        foil={pull.foil}
        foilType={pull.foilType}
        result={(
          <div className={awardStyles.resultPanel}>
            <div className={awardStyles.resultGrid}>
              <p className={awardStyles.name}>{accoladeSubjectName(design)}</p>
              <div className={awardStyles.value}>
                {unit === "$" ? "$" : ""}{design.display.headline}
                {unit && unit !== "$" ? (
                  <span className={`${awardStyles.unit} ${unit.length <= 2 ? awardStyles.unitInline : ""}`}>
                    {duo ? "· " : ""}{unit}
                  </span>
                ) : null}
              </div>
              <p className={awardStyles.evidence}>{design.display.evidence}</p>
            </div>
          </div>
        )}
      />
    </article>
  );
}

export default function CollectibleRenderer({ pull, compact = false, showBestOfDescription = true }: { pull: SeasonEndPullResult; compact?: boolean; showBestOfDescription?: boolean }) {
  if (pull.design.kind === "season") {
    return (
      <div className={`${styles.collectible} ${compact ? styles.compact : ""}`} data-testid="season-end-season-renderer" data-card-format="standard" data-compact={compact ? "true" : "false"}>
        <PlayerCard3D
          card={{ ...pull.design.card, autograph: pull.autograph }}
          forceFoil={pull.foil}
          foilType={pull.foilType}
          edition="season"
          interactive={false}
          className={styles.fluidCard}
        />
      </div>
    );
  }
  if (pull.design.kind === "best_of") return <FrozenBestOf pull={pull} design={pull.design} compact={compact} showDescription={showBestOfDescription} />;
  return <FrozenAccolade pull={pull} design={pull.design} compact={compact} />;
}
