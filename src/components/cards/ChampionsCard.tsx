// One card of the Dealer's Hand — the Faceless S4 champions print.
//
// Not a PlayerCard3D and not a MomentPlate: a champions card is a playing
// card from the winners' own deck. Black felt with embers rising off it,
// the champion's real splash dimmed beneath, corner rank indices, and the
// team's mark seated above the wordmark (the obsidian spade pip stands in
// when no logo exists). The Joker inverts to bone.
//
// Server-renderable — no hooks, no handlers. Foil parallels reuse the
// exact overlay layers player cards wear (FOIL_LAYERS), held at a fixed
// opacity since there is no pointer to chase. Ink is script type, not a
// drawn PNG: S4 names may never sign in to draw one, and a relic's
// autograph should read like a signing-day sharpie anyway.

import { championSplashUrl } from "@/lib/match-draft/champions";
import { mintOrdinal } from "@/lib/cards/moments";
import { FOIL_TYPE_LABELS, foilTypeOf, type FoilType } from "@/lib/packs/config";
import type { PlayerCardData } from "@/lib/cards/build";

/** Same layer classes PlayerCard3D composes for each parallel. */
const FOIL_LAYERS: Record<FoilType, { className: string; blend: "color-dodge" | "screen" }> = {
  prisma: { className: "card-foil-holo", blend: "color-dodge" },
  aurora: { className: "card-foil-aurora", blend: "screen" },
  refractor: { className: "card-foil-refractor", blend: "color-dodge" },
  ice: { className: "card-foil-ice", blend: "color-dodge" },
};

/**
 * The center logo draws at ~145px CSS (290px on retina), and most stored
 * team marks are small avatars — upscaling is why the first cut looked
 * blurry. Discord's CDN serves any size on request, so those URLs get
 * asked for 1024px; anything else passes through untouched (a storage
 * transform endpoint we can't verify would 404 into a blank mark).
 * Exported for tests.
 */
export function hiResLogoUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "cdn.discordapp.com" || parsed.hostname === "media.discordapp.net") {
      parsed.searchParams.set("size", "1024");
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}

const SPADE_PATH =
  "M50 4 C60 30 92 44 92 66 C92 84 76 94 60 88 C62 100 68 108 76 114 L24 114 C32 108 38 100 40 88 C24 94 8 84 8 66 8 44 40 30 50 4 Z";
const GLOSS_PATH =
  "M50 10 C57 30 82 43 84 60 C70 48 58 40 50 22 C46 34 38 44 24 54 30 40 45 28 50 10 Z";

/** The obsidian pip (bone for the Joker). Gradient ids are namespaced per
 *  variant — five cards render on one page and duplicate ids would make
 *  every pip resolve to the first card's gradient. Two variants is fine:
 *  identical defs collapse to identical paint. */
function SpadePip({ joker }: { joker: boolean }) {
  const grad = joker ? "champPipBone" : "champPipObsidian";
  return (
    <span className={`champ-pipwrap ${joker ? "champ-pipwrap-joker" : ""}`} aria-hidden>
      <svg viewBox="0 0 100 120">
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
            {joker ? (
              <>
                <stop offset="0" stopColor="#fdfaf3" />
                <stop offset="0.55" stopColor="#ded6c5" />
                <stop offset="1" stopColor="#a89f8c" />
              </>
            ) : (
              <>
                <stop offset="0" stopColor="#3a3a44" />
                <stop offset="0.5" stopColor="#111116" />
                <stop offset="1" stopColor="#050507" />
              </>
            )}
          </linearGradient>
          <linearGradient id="champPipGloss" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="0.45" stopColor="rgba(255,255,255,0.07)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <path
          d={SPADE_PATH}
          fill={`url(#${grad})`}
          stroke={joker ? "rgba(214,31,44,0.8)" : "rgba(240,234,235,0.75)"}
          strokeWidth="1.6"
        />
        <path d={GLOSS_PATH} fill="url(#champPipGloss)" opacity="0.85" />
      </svg>
    </span>
  );
}

/** A corner index: rank over the suit. The Joker spells itself vertically
 *  and carries no suit — it is the wild card. */
function CornerIndex({ rank, flipped }: { rank: string; flipped?: boolean }) {
  const joker = rank === "JOKER";
  return (
    <span
      className={`absolute flex flex-col items-center leading-none ${
        flipped ? "bottom-[18px] right-[18px] rotate-180" : "left-[18px] top-[18px]"
      }`}
    >
      <span
        className={`font-engrave font-black text-[#f4eff0] ${joker ? "champ-idx-joker text-[0.72rem] tracking-[0.1em]" : "text-2xl"}`}
      >
        {rank}
      </span>
      {joker ? null : <span className="text-base leading-none text-[#d61f2c]">♠</span>}
    </span>
  );
}

export default function ChampionsCard({
  card,
  foil = false,
  foilType = null,
  signed = false,
  className = "",
}: {
  card: PlayerCardData;
  foil?: boolean;
  foilType?: string | null;
  signed?: boolean;
  className?: string;
}) {
  const print = card.champWin;
  if (!print) return null;
  const splash = championSplashUrl(print.champion, 0);
  const parallel = foilTypeOf(foilType);
  const foilLayer = FOIL_LAYERS[parallel];

  return (
    <article
      aria-label={`${print.team} ${print.seasonWon} champions — ${print.rank}, ${card.name}`}
      className={`champ-felt relative flex aspect-[5/7] w-full flex-col overflow-hidden rounded-xl ${className}`}
    >
      {/* The champion, beneath the felt: real splash, dimmed and scrimmed
          so the spade stays the subject. */}
      {splash ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={splash}
          alt=""
          className="absolute inset-[10px] h-[calc(100%-20px)] w-[calc(100%-20px)] rounded-lg object-cover object-top opacity-55"
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <span className="champ-scrim absolute inset-[10px] rounded-lg" aria-hidden />

      {/* Embers off the felt: two parallax layers of sparks rising the
          full face, pure CSS (champ-embers), masked to be born above the
          bottom rail's red glow and die out below the sky. Under every
          index, name and autograph so nothing legible ever burns. */}
      <span className="champ-embers absolute inset-[10px] rounded-lg" aria-hidden data-testid="champ-embers" />

      {/* Double card edge: bone outer, red inner. */}
      <span className="pointer-events-none absolute inset-[9px] rounded-lg border-[1.5px] border-[#ece7e8]/85" aria-hidden>
        <span className="absolute inset-[3px] rounded-md border border-[#d61f2c]/70" />
      </span>

      <CornerIndex rank={print.rank} />
      <CornerIndex rank={print.rank} flipped />

      {/* The center mark, seated directly above the wordmark: the team's
          own logo when we hold one (edge-fade mask so no square boundary
          reads as a sticker, the pip's red under-glow), the spade pip as
          the fallback — never a hole. A notch smaller than the first
          center cut so the champion's splash still breathes around it. */}
      {card.teamImageUrl ? (
        <span className="champ-logowrap" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hiResLogoUrl(card.teamImageUrl)} alt="" className="champ-logo" loading="lazy" decoding="async" />
        </span>
      ) : (
        <SpadePip joker={print.joker} />
      )}

      <span className="champ-wordmark absolute inset-x-0 top-[58.5%] text-center text-[1.7rem] leading-none">
        {print.team.toUpperCase()}
      </span>

      <div className="absolute inset-x-0 bottom-[21%] text-center">
        <span className="font-engrave text-xl font-bold text-white">{card.name}</span>
      </div>
      <p className="absolute inset-x-0 bottom-[16.5%] text-center font-mono text-[0.56rem] uppercase tracking-[0.18em] text-[#c46671]">
        {print.champion} · most played
      </p>
      <p className="absolute inset-x-[16%] bottom-[4.5%] text-center text-[0.54rem] font-semibold uppercase tracking-[0.16em] text-[#8d8388]">
        {print.seasonWon} Champions · The Hand · {print.setIndex} of {print.setSize}
        {print.copySerial ? ` · ${mintOrdinal(print.copySerial)} mint` : ""}
      </p>

      {/* Which parallel, said out loud — same rule as player cards: Prisma
          is the base and goes unbadged. */}
      {foil && parallel !== "prisma" ? (
        <span className="absolute right-[18px] top-[18px] rounded-full border border-white/45 bg-black/60 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-white">
          {FOIL_TYPE_LABELS[parallel]}
        </span>
      ) : null}

      {signed ? (
        // Up in the open sky above the center mark — the one region with
        // neither text nor art. REAL INK ONLY in production: the mint
        // rolls autographs solely for champions whose drawn signature is
        // on file, and that PNG renders here exactly as it does on player
        // cards. The script fallback exists for the owner preview, where
        // no mint has happened.
        card.autograph ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.autograph}
            alt={`${card.name}'s autograph`}
            data-testid="champ-autograph"
            decoding="async"
            className="pointer-events-none absolute right-[8%] top-[7%] w-[45%] -rotate-[8deg] object-contain"
            style={{ filter: "drop-shadow(0 1px 3px rgb(0 0 0 / 0.95)) drop-shadow(0 0 8px rgb(255 255 255 / 0.35))" }}
          />
        ) : (
          <span className="champ-ink absolute right-[10%] top-[9%] -rotate-[8deg] text-[1.75rem]" aria-label="Autographed">
            {card.name}
          </span>
        )
      ) : null}

      {foil ? (
        <div aria-hidden data-testid="champ-foil" className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl" style={{ opacity: 0.5 }}>
          <div className={foilLayer.className} style={{ mixBlendMode: foilLayer.blend }} />
          <div className="card-foil-cosmos" style={{ mixBlendMode: "screen" }} />
        </div>
      ) : null}
    </article>
  );
}
