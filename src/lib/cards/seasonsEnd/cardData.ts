import { buildSeasonCards, cardPlayerKey, type CardGameMeta, type CardGameRow, type PlayerCardData } from "@/lib/cards/build";
import { aggregateWeeklyPlayerRows, type WeeklyRawStatRow } from "@/lib/stats/weekly";
import type { SeasonRow, Winner } from "./awards";

/** The query selects full raw rows, then the award validator restricts this
 * input to complete regular-season games. Use the shared aggregation and card
 * engine with the entire league cohort, before applying the six-game cutoff. */
export function buildPreviewCards(rows: SeasonRow[]): PlayerCardData[] {
  const games = rows as (SeasonRow & WeeklyRawStatRow & CardGameRow)[];
  const gamesByPlayer = new Map<string, CardGameRow[]>();
  const gameLog = new Map<string, CardGameMeta>();
  for (const row of games) {
    const key = cardPlayerKey(row.summoner_name, row.tag);
    const group = gamesByPlayer.get(key) ?? [];
    group.push(row);
    gamesByPlayer.set(key, group);
    gameLog.set(row.match_id, {durationMin: row.game_duration_min ?? 0, blueTeam: null, redTeam: null});
  }
  return buildSeasonCards({cohort:aggregateWeeklyPlayerRows(games),gamesByPlayer,gameLog})
    .map(card => ({...card,standout:false}));
}

/** Award labels decorate the normal season card without inventing an OVR or
 * changing its bars. The chosen champion's actual sample appears on its front. */
export function awardPlayerCard(card: PlayerCardData, winner: Winner, title: string, seasonCard = false): PlayerCardData {
  return {
    ...card,
    archetype: seasonCard ? card.archetype : winner.title ?? title,
    motto: seasonCard ? card.motto : winner.evidence,
    ...(winner.championGames && winner.champion ? {
      signature: {champion:winner.champion,games:winner.championGames}, artSkin:0,
    } : {}),
  };
}
