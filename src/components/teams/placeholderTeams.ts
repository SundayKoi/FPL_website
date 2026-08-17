import { ROLE_ORDER, type RosterTeamView } from "@/lib/draft/types";
import type { Division } from "@/lib/schedule/types";
import { normalizeBannerColor } from "@/lib/teams/bannerColor";

const placeholderTeamSeeds = [
  ["Northstar Collective", "Astra Vale", "NS", "bg-cyan-950", "#083344", "Lunari"],
  ["Ember Union", "Rook Mercer", "EU", "bg-red-950", "#450a0a", "Lunari"],
  ["Moonlit Circuit", "Nyx Calder", "MC", "bg-violet-950", "#2e1065", "Lunari"],
  ["Ironwood Guild", "Bramble Knox", "IG", "bg-mint", "#022c22", "Lunari"],
  ["Solaris House", "Sol Reyes", "SH", "bg-amber-950", "#451a03", "Solari"],
  ["Cloudbreak", "Mira Quill", "CB", "bg-sky-950", "#082f49", "Solari"],
  ["Riftbound", "Jett Rowan", "RB", "bg-fuchsia-950", "#4a044e", "Solari"],
  ["Obsidian Tide", "Vesper Hart", "OT", "bg-slate-800", "#1e293b", "Solari"],
  ["Wildsignal", "Kade Orion", "WS", "bg-lime-950", "#1a2e05", null],
  ["Neon Bastion", "Echo Lane", "NB", "bg-blue-950", "#172554", null],
  ["Hollow Crown", "Sable Wynn", "HC", "bg-stone-800", "#292524", null],
  ["Aurora Division", "Finn Mercer", "AD", "bg-teal-950", "#042f2e", null],
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
  ([name, captainName, abbreviation, accentClass, bannerColor, division], teamIndex) => ({
    id: `placeholder-team-${teamIndex + 1}`,
    isPlaceholder: true,
    name,
    captainName,
    abbreviation,
    imageUrl: null,
    bannerColor: normalizeBannerColor(bannerColor),
    division: division as Division | null,
    monogram: abbreviation,
    accentClass,
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
