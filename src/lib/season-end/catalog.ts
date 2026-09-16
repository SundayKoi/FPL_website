export type AwardGroup = "Teamwork" | "Meme inserts" | "Season stories" | "Support & survival" | "Record breakers";
export type AwardScope = "player" | "pair" | "team";
export type MetricMode = "total" | "perGame" | "rate" | "mean" | "minute" | "gold";
export interface AwardDefinition {
  id: string;
  title: string;
  description: string;
  group: AwardGroup;
  scope: AwardScope;
  field?: string;
  mode?: MetricMode;
  unit?: string;
  lower?: boolean;
}
const metric = (group: AwardGroup, title: string, description: string, field: string, mode: MetricMode = "total", unit = "", lower = false): AwardDefinition =>
  ({ id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, ""), title, description, group, scope: "player", field, mode, unit, lower });
const special = (group: AwardGroup, title: string, description: string, scope: AwardScope = "player", mode?: MetricMode, unit = ""): AwardDefinition =>
  ({ id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, ""), title, description, group, scope, ...(mode ? { mode, unit } : {}) });
export const AWARD_GROUPS: AwardGroup[] = ["Teamwork", "Meme inserts", "Season stories", "Support & survival", "Record breakers"];
export const SEASON_AWARDS: AwardDefinition[] = [
  special("Teamwork", "Jungle–Mid Connection", "Jungle/mid pair with the highest win rate together, on the same team.", "pair", "rate", "%"),
  special("Teamwork", "Fortress", "Fewest towers lost per team game, measured from the opposing team's towers destroyed.", "team"),
  special("Teamwork", "Dragon Hoard", "Most team dragons secured per team game.", "team", "perGame", "dragons/game"),
  special("Teamwork", "Baron Society", "Most team Barons secured per team game.", "team", "perGame", "Barons/game"),
  special("Teamwork", "Speedrunners", "Shortest average game duration in wins; at least three wins.", "team"),
  special("Teamwork", "Marathon Winners", "Highest rate of team wins in games lasting strictly over 40 minutes.", "team", "rate", "%"),
  special("Teamwork", "Clean Sweep", "Highest rate of completed, undefeated best-of-three or best-of-five series.", "team", "rate", "%"),
  special("Teamwork", "The Starting Five", "Regular-season winning team: most series wins, then fewest losses. Commemorates its most-played complete five-player lineup; tied teams and lineups share the award.", "team"),
  metric("Meme inserts", "Question Mark Enthusiast", "Most enemy-missing pings per game. A little curiosity never hurt.", "enemy_missing_pings", "perGame", "pings/game"),
  metric("Meme inserts", "On My Way", "Most on-my-way pings per game. Be there in a second.", "on_my_way_pings", "perGame", "pings/game"),
  metric("Meme inserts", "Button Masher", "Most Q, W, E and R casts per minute.", "ability_casts", "minute", "casts/min"),
  metric("Meme inserts", "Retail Therapy", "Most item purchases per game. Just one more back.", "items_purchased", "perGame", "purchases/game"),
  metric("Meme inserts", "The Collector", "Most bounty gold earned per game.", "bounty_gold", "perGame", "gold/game"),
  metric("Meme inserts", "Last Hit, Best Hit", "Most nexus kills per game. The only last hit that ends it.", "nexus_kills", "perGame", "kills/game"),
  special("Season stories", "Late Bloomer", "Highest mean role-relative performance in the final chronological third of league games; at least three games in that window."),
  special("Season stories", "Metronome", "Lowest performance standard deviation, with mean score at least 60 and every game at least 40 (out of 100)."),
  special("Season stories", "Bloodline", "Longest consecutive run of appearances with at least one solo kill."),
  special("Season stories", "Best of Champion", "One unique played champion assigned to each player, maximizing coverage before champion-specific performance."),
  metric("Season stories", "Lane Landlord", "Highest mean gold lead at 15 against the unique opposing-role player.", "gold_diff_15", "mean", "gold"),
  metric("Season stories", "Farm Gap", "Highest mean CS lead at 15 against the unique opposing-role player.", "cs_diff_15", "mean", "CS"),
  metric("Season stories", "Fast Starter", "Highest rate of games strictly ahead of the opposing role in gold at 10.", "ahead_10", "rate", "%"),
  metric("Season stories", "Carry the Banner", "Highest average share of team champion damage.", "damage_share_pct", "mean", "%"),
  metric("Season stories", "Low Budget, High Impact", "Highest average ratio of team damage share to team gold share.", "share_efficiency", "mean", "×"),
  special("Season stories", "Against the Grain", "Highest proportion of picks used in at most 5% of league games (all players' picks combined)."),
  special("Season stories", "World Tour", "Wins on champions from the most regions, using Riot Universe's associated faction. Unaffiliated champions add no region."),
  metric("Season stories", "Human Highlight Reel", "Highest rate of games with a triple kill or better.", "highlight_games", "rate", "%"),
  metric("Season stories", "Everybody Eats", "Highest rate of games with at least ten assists.", "assist_games", "rate", "%"),
  metric("Support & survival", "Force Field", "Most shielding on teammates per game.", "shielding_on_teammates", "perGame", "shielding/game"),
  metric("Support & survival", "Life Support", "Most combined healing and shielding on teammates per game.", "heal_shield", "perGame", "healing+shielding/game"),
  metric("Support & survival", "The Wall", "Most damage mitigated per game.", "damage_mitigated", "perGame", "damage/game"),
  metric("Support & survival", "Raid Boss", "Most damage taken per minute.", "damage_taken", "minute", "damage/min"),
  metric("Support & survival", "You Shall Not Pass", "Most seconds spent crowd-controlling enemies per game.", "time_ccing_others_s", "perGame", "seconds/game"),
  metric("Support & survival", "All-Seeing", "Highest vision score per minute.", "vision_score", "minute", "vision/min"),
  metric("Support & survival", "Lights Out", "Most wards destroyed per game.", "wards_killed", "perGame", "wards/game"),
  metric("Support & survival", "Map Architect", "Most wards placed per game.", "wards_placed", "perGame", "wards/game"),
  metric("Support & survival", "Control Freak", "Most control wards placed per game, not purchased.", "detector_wards_placed", "perGame", "wards/game"),
  metric("Support & survival", "Always There", "Highest average kill participation.", "kill_participation_pct", "mean", "%"),
  metric("Support & survival", "Untouchable", "Lowest deaths per game among qualified players.", "deaths", "mean", "deaths/game", true),
  metric("Support & survival", "Clean Sheet", "Highest rate of deathless games.", "deathless_games", "rate", "%"),
  metric("Support & survival", "Escape Artist", "Most skillshots dodged per game.", "skillshots_dodged", "perGame", "skillshots/game"),
  ...([
    ["Body Count", "Most kills per game", "kills", "kills/game"],
    ["Helping Hands", "Most assists per game", "assists", "assists/game"],
    ["Duelist", "Most solo kills per game", "solo_kills", "solo kills/game"],
    ["First Strike", "Most first-blood kills per game", "first_blood_kill", "first-blood kills/game"],
    ["Double Trouble", "Most double kills per game", "double_kills", "double kills/game"],
    ["Triple Threat", "Most triple kills per game", "triple_kills", "triple kills/game"],
    ["Four Horsemen", "Most quadra kills per game", "quadra_kills", "quadra kills/game"],
    ["Penthouse", "Most pentakills per game", "penta_kills", "pentakills/game"],
    ["Damage Department", "Most champion damage per game", "total_damage_to_champions", "damage/game"],
    ["True Pain", "Most true damage to champions per game", "true_damage", "true damage/game"],
    ["Demolition Crew", "Most turret takedowns per game", "turret_takedowns", "takedowns/game"],
    ["Wrecking Ball", "Most turret damage per game", "turret_damage", "damage/game"],
    ["Plate Collector", "Most turret plates per game", "turret_plates_destroyed", "plates/game"],
    ["Siege Engine", "Most inhibitor kills per game", "inhibitor_kills", "kills/game"],
    ["Objective Obsessed", "Most objective damage per game", "objective_damage", "damage/game"],
    ["Grand Theft Objective", "Most objective steals per game. Baron-specific steals are not recorded, so this award cannot be called Grand Theft Baron", "objectives_stolen", "steals/game"],
    ["Money Printer", "Most gold earned per game", "gold_earned", "gold/game"],
    ["Harvest Season", "Most CS per game", "cs", "CS/game"],
  ] as const).map(([title, description, field, unit]) => metric("Record breakers", title, description, field, "perGame", unit)),
  metric("Record breakers", "Relentless", "Highest champion damage per minute.", "total_damage_to_champions", "minute", "damage/min"),
  metric("Record breakers", "Perfect Economy", "Highest CS per minute.", "cs", "minute", "CS/min"),
  metric("Record breakers", "Value Engine", "Highest total champion damage divided by total gold earned.", "total_damage_to_champions", "gold", "damage/gold"),
];
