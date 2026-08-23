// Composite roster cards: one card per team, rated by its five best player
// cards. Server-renderable (no interactivity) — the flex here is the crest,
// the tier frame, and the rated roster list.

import { tierFor, type PlayerCardData } from "@/lib/cards/build";

const TIER_ACCENTS: Record<string, { frame: string; text: string }> = {
  bronze: { frame: "linear-gradient(160deg,#7c5334,#3e2a1a 45%,#8a5c38)", text: "#b08d57" },
  silver: { frame: "linear-gradient(160deg,#9ba8b5,#4a5560 45%,#aab7c4)", text: "#c0c9d2" },
  gold: { frame: "linear-gradient(160deg,#d4af37,#6b5518 45%,#e6c75a)", text: "#e6c14b" },
  platinum: { frame: "linear-gradient(160deg,#3ec6b5,#155e56 45%,#5cd6c6)", text: "#4fd0bf" },
  emerald: { frame: "linear-gradient(160deg,#2ecc71,#0e5c31 45%,#58e08e)", text: "#3fdc7f" },
  diamond: { frame: "linear-gradient(160deg,#6ec6ff,#1e4d75 45%,#9ad9ff)", text: "#8fd3ff" },
  master: { frame: "linear-gradient(160deg,#b06ef0,#4a1e75 45%,#cf9aff)", text: "#c78fff" },
  challenger: { frame: "linear-gradient(160deg,#ffd166,#f0637a 35%,#5cc8ff 70%,#ffd166)", text: "#ffd166" },
};

export interface TeamCardEntry {
  teamName: string;
  imageUrl: string | null;
  overall: number;
  tier: ReturnType<typeof tierFor>;
  players: PlayerCardData[];
}

/** Group player cards into team cards — rated by the top five overalls so a
 *  sub or one-game stand-in doesn't drag the roster's number down. */
export function buildTeamCards(cards: PlayerCardData[]): TeamCardEntry[] {
  const byTeam = new Map<string, PlayerCardData[]>();
  for (const card of cards) {
    if (!card.teamName) continue;
    const list = byTeam.get(card.teamName) ?? [];
    list.push(card);
    byTeam.set(card.teamName, list);
  }
  return [...byTeam.entries()]
    .map(([teamName, players]) => {
      const rated = [...players].sort((a, b) => b.overall - a.overall);
      const core = rated.slice(0, 5);
      const overall = Math.round(core.reduce((sum, player) => sum + player.overall, 0) / core.length);
      return {
        teamName,
        imageUrl: rated.find((player) => player.teamImageUrl)?.teamImageUrl ?? null,
        overall,
        tier: tierFor(overall),
        players: rated,
      };
    })
    .sort((a, b) => b.overall - a.overall || a.teamName.localeCompare(b.teamName));
}

export default function TeamCardsSection({
  cards,
  showHeading = true,
}: {
  cards: PlayerCardData[];
  /** false when the hosting page provides its own header (/cards/teams). */
  showHeading?: boolean;
}) {
  const teams = buildTeamCards(cards);
  if (teams.length === 0) return null;
  return (
    <section className="flex flex-col gap-4" aria-label="Team cards">
      {showHeading ? (
        <div>
          <span className="label-dash">Team cards</span>
          <p className="mt-1 text-sm text-steel">Rosters rated by their five best cards.</p>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {teams.map((team) => {
          const accent = TIER_ACCENTS[team.tier.key];
          return (
            <div key={team.teamName} className="rounded-2xl p-[4px]" style={{ background: accent.frame }}>
              <div className="flex h-full flex-col gap-3 rounded-xl bg-navy p-4">
                <div className="flex items-center gap-3">
                  {team.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={team.imageUrl} alt="" className="h-12 w-12 rounded object-contain" loading="lazy" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded border border-line text-lg font-bold text-steel">
                      {team.teamName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-xl font-bold not-italic text-white">{team.teamName}</h3>
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent.text }}>
                      {team.tier.label} roster
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-black text-white">{team.overall}</span>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-steel">Team OVR</span>
                  </div>
                </div>
                <ul className="flex flex-col gap-1">
                  {team.players.slice(0, 7).map((player) => (
                    <li key={player.slug} className="flex items-center gap-2 text-sm">
                      <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-steel">{player.role}</span>
                      <a href={`/card/${player.slug}`} className="min-w-0 flex-1 truncate font-semibold text-white underline-offset-4 hover:text-coral hover:underline">
                        {player.name}
                      </a>
                      {player.standout ? <span title="Card of the Week" className="text-gold">★</span> : null}
                      <span className="rounded border border-line px-1.5 font-mono text-xs font-bold" style={{ color: accent.text }}>
                        {player.overall}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
