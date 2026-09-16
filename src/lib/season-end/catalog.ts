export type AwardGroup = "Teamwork" | "Meme inserts" | "Season stories" | "Support & survival" | "Record breakers";
export type AwardScope = "player" | "pair" | "team";
export type MetricMode = "total" | "mean" | "minute" | "gold";
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
const special = (group: AwardGroup, title: string, description: string, scope: AwardScope = "player"): AwardDefinition =>
  ({ id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, ""), title, description, group, scope });
export const AWARD_GROUPS: AwardGroup[] = ["Teamwork", "Meme inserts", "Season stories", "Support & survival", "Record breakers"];
export const SEASON_AWARDS: AwardDefinition[] = [
  special("Teamwork", "Jungle–Mid Connection", "Jungle/mid pair with the most wins together, on the same team.", "pair"),
  special("Teamwork", "Fortress", "Fewest towers lost per team game, measured from the opposing team's towers destroyed.", "team"),
  special("Teamwork", "Dragon Hoard", "Most team dragons secured; counted once per team game.", "team"),
  special("Teamwork", "Baron Society", "Most team Barons secured; counted once per team game.", "team"),
  special("Teamwork", "Speedrunners", "Shortest average game duration in wins; at least three wins.", "team"),
  special("Teamwork", "Marathon Winners", "Most wins in games lasting strictly over 40 minutes.", "team"),
  special("Teamwork", "Clean Sweep", "Most completed, undefeated best-of-three or best-of-five series.", "team"),
  special("Teamwork", "The Starting Five", "Regular-season winning team: most series wins, then fewest losses. Commemorates its most-played complete five-player lineup; tied teams and lineups share the award.", "team"),
  metric("Meme inserts", "Question Mark Enthusiast", "Most enemy-missing pings. A little curiosity never hurt.", "enemy_missing_pings"),
  metric("Meme inserts", "On My Way", "Most on-my-way pings. Be there in a second.", "on_my_way_pings"),
  metric("Meme inserts", "Button Masher", "Most Q, W, E and R casts per minute.", "ability_casts", "minute", "casts/min"),
  metric("Meme inserts", "Retail Therapy", "Most item purchases. Just one more back.", "items_purchased"),
  metric("Meme inserts", "The Collector", "Most bounty gold earned.", "bounty_gold", "total", "gold"),
  metric("Meme inserts", "Last Hit, Best Hit", "Most nexus kills. The only last hit that ends it.", "nexus_kills"),
  special("Season stories", "Late Bloomer", "Highest mean role-relative performance in the final chronological third of league games; at least three games in that window."),
  special("Season stories", "Metronome", "Lowest performance standard deviation, with mean score at least 60 and every game at least 40 (out of 100)."),
  special("Season stories", "Hot Streak", "Longest consecutive winning run in a player's appearances."),
  special("Season stories", "Bloodline", "Longest consecutive run of appearances with at least one solo kill."),
  special("Season stories", "Unkillable Run", "Longest consecutive run of deathless appearances."),
  metric("Season stories", "Ironclad", "Most games with two or fewer deaths.", "low_deaths"),
  metric("Season stories", "Lane Landlord", "Highest mean gold lead at 15 against the unique opposing-role player.", "gold_diff_15", "mean", "gold"),
  metric("Season stories", "Farm Gap", "Highest mean CS lead at 15 against the unique opposing-role player.", "cs_diff_15", "mean", "CS"),
  metric("Season stories", "Fast Starter", "Most games strictly ahead of the opposing role in gold at 10.", "ahead_10"),
  metric("Season stories", "Comeback Artist", "Most wins while strictly behind the opposing role in gold at 15.", "comeback"),
  special("Season stories", "Giant Slayer", "Most player game wins against teams finishing above their team by series wins, then losses. Available after all regular-season fixtures finish."),
  special("Season stories", "Revenge Tour", "Most distinct opposing teams beaten after losing the player's first game against them."),
  metric("Season stories", "Carry the Banner", "Highest average share of team champion damage.", "damage_share_pct", "mean", "%"),
  metric("Season stories", "Low Budget, High Impact", "Highest average ratio of team damage share to team gold share.", "share_efficiency", "mean", "×"),
  special("Season stories", "Against the Grain", "Highest proportion of picks used in at most 5% of league games (all players' picks combined)."),
  special("Season stories", "World Tour", "Wins on champions from the most regions, using Riot Universe's associated faction. Unaffiliated champions add no region."),
  special("Season stories", "Full Arsenal", "Wins across the most Data Dragon champion classes; all listed classes count."),
  metric("Season stories", "Human Highlight Reel", "Most games with a triple kill or better.", "highlight_games"),
  metric("Season stories", "Everybody Eats", "Most games with at least ten assists.", "assist_games"),
  metric("Support & survival", "Force Field", "Most shielding on teammates.", "shielding_on_teammates"),
  metric("Support & survival", "Life Support", "Most combined healing and shielding on teammates.", "heal_shield"),
  metric("Support & survival", "The Wall", "Most damage mitigated.", "damage_mitigated"),
  metric("Support & survival", "Raid Boss", "Most damage taken per minute.", "damage_taken", "minute", "damage/min"),
  metric("Support & survival", "You Shall Not Pass", "Most seconds spent crowd-controlling enemies.", "time_ccing_others_s", "total", "seconds"),
  metric("Support & survival", "All-Seeing", "Highest vision score per minute.", "vision_score", "minute", "vision/min"),
  metric("Support & survival", "Lights Out", "Most wards destroyed.", "wards_killed"),
  metric("Support & survival", "Map Architect", "Most wards placed.", "wards_placed"),
  metric("Support & survival", "Control Freak", "Most control wards placed, not purchased.", "detector_wards_placed"),
  metric("Support & survival", "Always There", "Highest average kill participation.", "kill_participation_pct", "mean", "%"),
  metric("Support & survival", "Untouchable", "Lowest deaths per game among qualified players.", "deaths", "mean", "deaths/game", true),
  metric("Support & survival", "Clean Sheet", "Most deathless games.", "deathless_games"),
  metric("Support & survival", "Escape Artist", "Most skillshots dodged.", "skillshots_dodged"),
  ...([
    ["Body Count", "Most kills", "kills"],
    ["Helping Hands", "Most assists", "assists"],
    ["Duelist", "Most solo kills", "solo_kills"],
    ["First Strike", "Most first-blood kills", "first_blood_kill"],
    ["Opening Act", "Most first-blood assists", "first_blood_assist"],
    ["Double Trouble", "Most double kills", "double_kills"],
    ["Triple Threat", "Most triple kills", "triple_kills"],
    ["Four Horsemen", "Most quadra kills", "quadra_kills"],
    ["Penthouse", "Most pentakills", "penta_kills"],
    ["Damage Department", "Most champion damage", "total_damage_to_champions"],
    ["True Pain", "Most true damage to champions", "true_damage"],
    ["Demolition Crew", "Most turret takedowns", "turret_takedowns"],
    ["Wrecking Ball", "Most turret damage", "turret_damage"],
    ["Plate Collector", "Most turret plates", "turret_plates_destroyed"],
    ["Siege Engine", "Most inhibitor kills", "inhibitor_kills"],
    ["Objective Obsessed", "Most objective damage", "objective_damage"],
    ["Grand Theft Objective", "Most objective steals. Baron-specific steals are not recorded, so this award cannot be called Grand Theft Baron", "objectives_stolen"],
    ["Money Printer", "Most gold earned", "gold_earned"],
    ["Harvest Season", "Most CS", "cs"],
  ] as const).map(([title, description, field]) => metric("Record breakers", title, description, field)),
  metric("Record breakers", "Relentless", "Highest champion damage per minute.", "total_damage_to_champions", "minute", "damage/min"),
  metric("Record breakers", "Perfect Economy", "Highest CS per minute.", "cs", "minute", "CS/min"),
  metric("Record breakers", "Value Engine", "Highest total champion damage divided by total gold earned.", "total_damage_to_champions", "gold", "damage/gold"),
];
