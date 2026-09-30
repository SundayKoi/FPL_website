// The route inside a run: the forks that pause it, what each choice risks
// and earns, and what the squad looks like when it comes home.
//
// config.ts owns the money (grade, base dollars, comps, marks). This module
// owns everything the redesign added on top: the checkpoints, the choices,
// the harm ladder (wounded → lost → dead), the mutations, insurance and
// the rescue roll. Pure, like config.ts — `rand` is injected, the clock is
// passed in — so every table below is unit-testable and the server's
// CSPRNG is a drop-in.
//
// The rules, in the order a player meets them:
//   1. A run with N forks pauses N times, at evenly spaced checkpoints.
//      Each fork is open until the next checkpoint (or the end of the run).
//      Silence is a choice: an unanswered fork camps, the safe option.
//   2. Pushing adds to the loot multiplier and rolls one harm on one card.
//      Camping is safe on the ladder — except where the story says it is
//      not (the Legend Hunt's second checkpoint haunts; every Legendary
//      fork bites even a camper; a toll fork charges the careful).
//   3. A card can die only on the Legendary route and only once the squad
//      has pushed twice. Insurance turns lost into wounded and dead into
//      lost. One-of-ones never board a route that can lose them.
//   4. Mutations are one per copy and permanent. A roll that lands on an
//      already-mutated card does nothing.
//   5. The road is drawn per run (ROAD_RULES). Each checkpoint is one of
//      several places, picked from the run's own seed, so two Deep Raids
//      do not walk the same valley — and a convoy walks the host's draw,
//      because two squads on one clock must stand at one fork.
//   6. The squad's roles each have a call of their own, once a run: a Top
//      holds, a Jungle scouts, a Mid roams, a Bot kites, a Support wards.
//      A Veteran (trail.ts) makes its role's call sharper.
//   7. A run remembers itself: a toll paid at one fork buys free passage
//      at the next, and a scout at one fork means the squad knows where
//      not to camp at the next.
//   9. The week has weather (WEATHER_RULES, weather.ts): under Fog every
//      fork is dark, under a Drought the scouting gamble pays half, under
//      a Harvest the tolls are waived, under the Watch they cost double.
//      A run keeps the weather it launched under.
//   8. The road has company (COMPANY_RULES, company.ts): a rival squad is
//      another collector's run and the spot goes to the squad with more
//      shine; a road with nobody on it holds a cache where the rival
//      would have been; and a card that died on the Legendary route
//      walks the Legend and Legendary roads as a ghost — camp at the next
//      fork and the haunting is doubled, push and it is harmless, carry
//      its old team's colours and it stands aside and leaves a cache.
//  10. Every card's title is an edge (ARCHETYPE_RULES, archetypes.ts): one
//      edge of each kind counts per squad, fixed at launch, and each bends
//      the road in one named place — a guard softens a harm roll, a camp
//      edge pays for the night, a finale edge settles the bag. A card that
//      dies takes its edge with it from that point. The base camp's tent
//      is read here too, under the same rulebook.
//
// routes.ts is the front door: every caller imports from here, and the
// rules above live in four files beside it, each re-exported by name —
//   roads.ts         the places, the fixed road and the per-run draw
//   routeEdges.ts    the edges the road reads, and who makes a role call
//   forkOptions.ts   the choices at a fork, and what the edges do to them
//   resolveRoute.ts  the walk that settles every card, draw by draw
// They import one another directly, never through this file: ROADS, FORKS
// and the edge lists are built at load, and a cycle through here could
// reach them before they exist.

// The client-safe half of the road — the words at a fork, the clock, the
// role calls, the route sizes, the numbers the rules page quotes, the
// consent line — lives in forks.ts so the board can hold it without
// holding ROADS. Re-exported here so every server caller keeps importing
// it from routes.ts as before.
export {
  CACHE_LOOT,
  COMPANY_RULES,
  CURSED_AGAIN_LOST,
  DEAD_NEEDS_PUSHES,
  FORK_CHOICES,
  FRAGMENT_CHANCE,
  GHOST_HAUNT,
  GHOST_HAUNT_FLOOR,
  HOLD_LOOT,
  // The trail's numbers are journal.ts' (and re-exported there); here too so
  // every name forks.ts exports is also routes.ts', binding for binding.
  HUNTER_FRAGMENT_CHANCE,
  MOMENTUM_BONUS,
  MOMENTUM_DEATH,
  MUTATION_SOURCES,
  RIVAL_LOSS_LOOT,
  RIVAL_WIN_LOOT,
  ROAD_ENCOUNTER_CHANCE,
  ROAD_RULES,
  ROAD_SIZES,
  ROLE_CALLS,
  ROLE_CALL_BY_CHOICE,
  SCOUTED_CAMP_RISK,
  SHRINE_RISK,
  STORM_HOURS,
  STRANDED_BOUNTY,
  TOLL_LOOT,
  VETERAN_HOLD_LOOT,
  VETERAN_TEASE,
  choiceSheet,
  consentLine,
  forkViews,
  forkWindows,
  isCampChoice,
  isRoleCall,
  openFork,
} from "./forks";
export type {
  ForkChoice,
  ForkEdge,
  ForkOption,
  ForkStatus,
  ForkView,
  ForkWindow,
  MutationSource,
  RecordedChoice,
  RoadRef,
  RoleCall,
  RoleCallDef,
} from "./forks";

export { FORKS, FRAGMENT_CAP, ROADS, forksFor, tollCost, underWeather } from "./roads";
export type { ForkDef } from "./roads";
export { EDGE_TITLE } from "./routeEdges";
export { VETERAN_SHAPE, choiceAllowed, forkOptions, squadAbilities } from "./forkOptions";
export type { SquadAbilities } from "./forkOptions";
export {
  RESCUE_BASE,
  RESCUE_CAP,
  RESCUE_FAIL_LOST,
  RESCUE_FAIL_WOUNDED,
  RESCUE_PER_SHINE,
  RESCUE_PUSH_BONUS,
  VOIDTOUCHED_SECOND_CHANCE,
  rescueChance,
  resolveRoute,
} from "./resolveRoute";
export type { CardFate, CardFateKind, RouteEncounter, RouteEvent, RouteInput, RouteResult } from "./resolveRoute";
