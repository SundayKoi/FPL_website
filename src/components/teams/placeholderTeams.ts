import { ROLE_ORDER, type RosterTeamView } from "@/lib/draft/types";

const placeholderTeamSeeds = [
  ["Northstar Collective", "Astra Vale", "NS", "bg-cyan-950", 64],
  ["Ember Union", "Rook Mercer", "EU", "bg-red-950", 58],
  ["Moonlit Circuit", "Nyx Calder", "MC", "bg-violet-950", 71],
  ["Ironwood Guild", "Bramble Knox", "IG", "bg-emerald-950", 52],
  ["Solaris House", "Sol Reyes", "SH", "bg-amber-950", 67],
  ["Cloudbreak", "Mira Quill", "CB", "bg-sky-950", 49],
  ["Riftbound", "Jett Rowan", "RB", "bg-fuchsia-950", 61],
  ["Obsidian Tide", "Vesper Hart", "OT", "bg-slate-800", 55],
  ["Wildsignal", "Kade Orion", "WS", "bg-lime-950", 73],
  ["Neon Bastion", "Echo Lane", "NB", "bg-blue-950", 46],
  ["Hollow Crown", "Sable Wynn", "HC", "bg-stone-800", 63],
  ["Aurora Division", "Finn Mercer", "AD", "bg-teal-950", 57],
] as const;

const playerNames = [
  ["Vale", "Morrow", "Serein", "Ash", "Coda"],
  ["Mercer", "Hale", "Voss", "Rook", "Pike"],
  ["Calder", "Lumen", "Wisp", "Nox", "Iris"],
  ["Knox", "Thorn", "Briar", "Oak", "Flint"],
  ["Reyes", "Solace", "Dawn", "Helio", "Sundown"],
  ["Quill", "Drift", "Skye", "Nimbus", "Rain"],
  ["Rowan", "Jinx", "Fable", "Riven", "Bolt"],
  ["Hart", "Vanta", "Slate", "Murk", "Tide"],
  ["Orion", "Scout", "Pulse", "Grove", "Signal"],
  ["Lane", "Pixel", "Prism", "Flux", "Glitch"],
  ["Wynn", "Hush", "Regal", "Velvet", "Crest"],
  ["Mercer", "Halo", "Boreal", "Frost", "Comet"],
] as const;

const roleLabels = ["TOP", "JG", "MID", "ADC", "SUP"] as const;
const placeholderPrices = [0, 12, 18, 14, 9] as const;

export const PLACEHOLDER_TEAMS: RosterTeamView[] = placeholderTeamSeeds.map(
  ([name, captainName, monogram, accentClass, pointsRemaining], teamIndex) => ({
    id: `placeholder-team-${teamIndex + 1}`,
    name,
    captainName,
    monogram,
    accentClass,
    pointsRemaining,
    players: ROLE_ORDER.map((role, roleIndex) => ({
      id: `placeholder-player-${teamIndex + 1}-${role}`,
      role,
      displayName:
        roleIndex === 0
          ? captainName
          : `${playerNames[teamIndex][roleIndex]} ${roleLabels[roleIndex]}`,
      price: placeholderPrices[roleIndex],
      acquisition: roleIndex === 0 ? "captain" : "auction",
    })),
  }),
);
