// The roster plate: a whole team as one card.
//
// Five champion splashes side by side read as NOISE — five unrelated art
// styles fighting over one frame. The thing that turns them into a team is
// the wash: every panel tinted toward the roster's own banner colour with
// a `color` blend, which keeps each splash's light and throws away its
// hue. Five champions become one object, and the same card built for a
// cyan team looks like a different card rather than a recolour.
//
// The other two decisions:
//   · the crest sits ON the seams, so the eye lands somewhere before it
//     starts reading names, and the card stops reading as five strips;
//   · the team name is engraved in Cinzel — the face the champions cards
//     use for their rank indices — so a team card reads as a sibling of
//     the Dealer's Hand rather than an oversized player card.
//
// Server-renderable: no interactivity, no client bundle.

import { championCenteredUrl } from "@/lib/match-draft/champions";
import { foilTypeOf, type FoilType } from "@/lib/packs/config";
import type { TeamCardEntry, TeamPrint } from "@/lib/cards/teamCards";
import { hiResLogoUrl } from "./ChampionsCard";

/** The same overlays player cards wear, held at a fixed opacity — there
 *  is no pointer to chase on a server-rendered plate. */
const FOIL_LAYERS: Record<FoilType, { className: string; blend: "color-dodge" | "screen" }> = {
  prisma: { className: "card-foil-holo", blend: "color-dodge" },
  aurora: { className: "card-foil-aurora", blend: "screen" },
  refractor: { className: "card-foil-refractor", blend: "color-dodge" },
  ice: { className: "card-foil-ice", blend: "screen" },
};

/** Frame treatments by roster tier — the same ladder the player cards
 *  climb, so a team's frame says what its five are worth at a glance. */
const TIER_FRAME: Record<string, string> = {
  bronze: "linear-gradient(160deg,#7c5334,#3e2a1a 45%,#8a5c38)",
  silver: "linear-gradient(160deg,#9ba8b5,#4a5560 45%,#aab7c4)",
  gold: "linear-gradient(160deg,#d4af37,#6b5518 45%,#e6c75a)",
  platinum: "linear-gradient(160deg,#3ec6b5,#155e56 45%,#5cd6c6)",
  emerald: "linear-gradient(160deg,#2ecc71,#0e5c31 45%,#58e08e)",
  diamond: "linear-gradient(160deg,#6ec6ff,#1e4d75 45%,#9ad9ff)",
  master: "linear-gradient(160deg,#b06ef0,#4a1e75 45%,#cf9aff)",
  challenger: "linear-gradient(160deg,#ffd166,#f0637a 35%,#5cc8ff 70%,#ffd166)",
};

function Panel({ slot, color }: { slot: TeamCardEntry["slots"][number]; color: string }) {
  const art = slot.champion ? championCenteredUrl(slot.champion, 0) : null;
  return (
    <div className="relative overflow-hidden border-l border-white/15 first:border-l-0">
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={art}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[center_18%]"
        />
      ) : (
        <span aria-hidden className="absolute inset-0 bg-panel" />
      )}
      {/* The wash — the whole reason this reads as one team. */}
      <span aria-hidden className="absolute inset-0 mix-blend-color" style={{ background: color, opacity: 0.62 }} />
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,10,20,.14) 0 36%, rgba(0,10,20,.6) 72%, rgba(0,10,20,.92) 100%)",
        }}
      />
      <span className="absolute inset-x-0 bottom-0 z-[3] px-1 pb-2 text-center">
        <span
          className="block text-[7.5px] font-bold uppercase tracking-[0.2em]"
          style={{ color, filter: "brightness(1.75)" }}
        >
          {slot.role}
        </span>
        <span className="block truncate font-display text-[11.5px] font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {slot.name}
          {slot.standout ? <span className="ml-0.5 text-gold">★</span> : null}
        </span>
        <span className="block truncate text-[8.5px] text-steel">{slot.champion ?? "—"}</span>
      </span>
      {/* A signed player signs their OWN panel. A roster where four of the
          five have inked is a different object from one where nobody has,
          and this is the only place that difference can show. */}
      {slot.autograph ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slot.autograph}
          alt=""
          aria-hidden
          loading="lazy"
          className="pointer-events-none absolute inset-x-[6%] bottom-[15%] z-[4] max-h-[22%] w-[88%] object-contain opacity-90 mix-blend-screen drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]"
        />
      ) : null}
    </div>
  );
}

export default function TeamCard({
  team,
  foil = false,
  foilType = null,
}: {
  team: TeamCardEntry | TeamPrint;
  foil?: boolean;
  foilType?: string | null;
}) {
  const color = team.bannerColor;
  const foilLayer = foil ? FOIL_LAYERS[foilTypeOf(foilType)] : null;
  const signed = team.slots.filter((slot) => slot.autograph).length;
  return (
    <article
      aria-label={`${team.teamName} — ${team.tierLabel} roster, team overall ${team.overall}`}
      className="relative aspect-[5/7] w-full overflow-hidden rounded-2xl bg-navy p-[4px]"
      style={{ background: TIER_FRAME[team.tierKey] ?? TIER_FRAME.gold }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#00172a]">
        <div className="absolute inset-0 grid grid-cols-5">
          {team.slots.map((slot) => (
            <Panel key={slot.role} slot={slot} color={color} />
          ))}
        </div>

        {/* The crest, seated on the seams. */}
        <div
          className="absolute left-1/2 top-[45%] z-[4] grid aspect-square w-[31%] -translate-x-1/2 -translate-y-1/2 place-content-center overflow-hidden rounded-full"
          style={{
            background: `radial-gradient(circle at 50% 34%, ${color}, color-mix(in srgb, ${color} 55%, #000))`,
            boxShadow: `0 0 0 3px rgba(255,255,255,.9), 0 0 0 5px color-mix(in srgb, ${color} 70%, #000), 0 12px 30px -8px #000`,
          }}
        >
          {team.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hiResLogoUrl(team.imageUrl)}
              alt=""
              aria-hidden
              loading="lazy"
              className="h-full w-full object-contain p-[14%]"
            />
          ) : (
            <span className="font-engrave text-xl font-black text-white drop-shadow">{team.monogram}</span>
          )}
        </div>

        {/* Team OVR, opposite the serial, so the number the frame promises
            is legible without hunting. */}
        <span className="absolute left-3 top-2.5 z-[7] flex flex-col items-center leading-none">
          <span className="font-display text-2xl font-black text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            {team.overall}
          </span>
          <span className="text-[7px] font-bold uppercase tracking-[0.16em] text-steel">Team OVR</span>
        </span>

        {/* The engraved plate. */}
        <div
          className="absolute inset-x-0 bottom-0 z-[5] px-3 pb-3 pt-3 text-center"
          style={{
            background: "linear-gradient(180deg, transparent, rgba(0,8,16,.88) 42%)",
            borderTop: `1px solid color-mix(in srgb, ${color} 60%, transparent)`,
          }}
        >
          <span className="block truncate font-engrave text-lg font-black uppercase leading-none tracking-[0.14em] text-white sm:text-xl">
            {team.teamName}
          </span>
          <span
            className="mt-1 block text-[8px] font-semibold uppercase tracking-[0.28em]"
            style={{ color: `color-mix(in srgb, ${color} 55%, #a7c0d8)` }}
          >
            {team.tierLabel} roster
          </span>
        </div>

        {/* Foil rides above the art and under the frame, so the plate
            shines without washing out a name. */}
        {foilLayer ? (
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-0 z-[5] ${foilLayer.className}`}
            style={{ mixBlendMode: foilLayer.blend, opacity: 0.55 }}
          />
        ) : null}

        {/* How much of this roster actually signed — the one number that
            separates two copies of the same team-week. */}
        {signed > 0 ? (
          <span className="absolute right-3 top-2.5 z-[7] flex flex-col items-end leading-none">
            <span className="font-display text-sm font-black text-gold drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
              {signed}/5
            </span>
            <span className="text-[7px] font-bold uppercase tracking-[0.16em] text-steel">signed</span>
          </span>
        ) : null}

        {/* Double edge, the champions-card treatment in the team's colour. */}
        <span aria-hidden className="pointer-events-none absolute inset-[7px] z-[6] rounded-lg border-[1.5px] border-[#ece7e8]/80">
          <span
            className="absolute inset-[3px] rounded-md border"
            style={{ borderColor: `color-mix(in srgb, ${color} 72%, transparent)` }}
          />
        </span>
      </div>
    </article>
  );
}
