// The shareable PNG of a player card — what Discord/Twitter unfurl when a
// card link is pasted (wired via openGraph.images on the share page), and
// what the "Download PNG" button serves. A flat re-render of the card
// (satori has no CSS 3D), built from the same live card data.
//
// `?w=YYYY-MM-DD` pictures that week's ARCHIVED print instead of the live
// card. Two separate things go wrong without it, and /rip hit both:
//
//   1. A pull is FROM a week. Ripping a card out of the 18 August edition and
//      showing today's rating means the picture disagrees with the text of
//      the very message it sits in.
//   2. Discord's image proxy caches by URL. /card/doug-na1/card.png is the
//      same string every week forever, so the first render Discord ever saw
//      is the one it keeps serving — last week's card under this week's
//      text, which is exactly how this was reported. Putting the week in the
//      query string makes each edition its own URL, so correctness and cache
//      busting are the same change rather than two.

import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { fetchAllCardSeasons, fetchCardBySlug, fetchEditionCardBySlug } from "@/lib/cards/queries";
import { championCenteredUrl } from "@/lib/match-draft/champions";
import { resolvePrintArtUrl } from "@/lib/packs/skins";
import type { PlayerCardData } from "@/lib/cards/build";

export const runtime = "nodejs";

const TIER_COLORS: Record<PlayerCardData["tier"]["key"], string> = {
  bronze: "#b08d57",
  silver: "#c0c9d2",
  gold: "#e6c14b",
  platinum: "#4fd0bf",
  emerald: "#3fdc7f",
  diamond: "#8fd3ff",
  master: "#c78fff",
  challenger: "#ffd166",
};

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Validated rather than trusted: this goes straight into a query filter,
  // and a junk value should picture the live card rather than nothing.
  const requestedWeek = new URL(request.url).searchParams.get("w");
  const editionWeek = requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek) ? requestedWeek : null;
  // Anon client on purpose: this route renders for link unfurlers (Discord,
  // Twitter bots) with no cookies — everything it reads is public data.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  // Share URLs span both leagues — try Premier's season, then Academy's.
  let card: PlayerCardData | null = null;
  for (const { season } of await fetchAllCardSeasons(supabase)) {
    // An unarchived week falls through to the live card rather than 404ing:
    // a picture of the right player with the wrong week beats no picture.
    card = editionWeek ? await fetchEditionCardBySlug(supabase, season, editionWeek, slug) : null;
    card ??= await fetchCardBySlug(supabase, season, slug);
    if (card) break;
  }

  if (!card) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0b1420",
            color: "#8fa3b8",
            fontSize: 40,
          }}
        >
          FPL player card not found
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  const tint = TIER_COLORS[card.tier.key];
  // satori fetches the art itself and has no onError to fall back through,
  // so the whole chain the live card walks in the browser has to be resolved
  // here first: centered art for the skin, else its regular splash, else base
  // centered art. A url that 404s at render time breaks the whole unfurl.
  const splash = card.signature
    ? (await resolvePrintArtUrl(card.signature.champion, card.artSkin)) ??
      championCenteredUrl(card.signature.champion)
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0b1420",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Card panel */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 400,
            margin: 40,
            borderRadius: 24,
            border: `6px solid ${tint}`,
            overflow: "hidden",
            background: "#101c2c",
          }}
        >
          <div style={{ display: "flex", position: "relative", width: "100%", height: 300 }}>
            {splash ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={splash} alt="" width={388} height={300} style={{ objectFit: "cover", objectPosition: "center top" }} />
            ) : (
              <div style={{ display: "flex", width: "100%", height: "100%", background: "#16283e" }} />
            )}
            <div
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                display: "flex",
                background: tint,
                color: "#0b1420",
                borderRadius: 999,
                padding: "6px 16px",
                fontSize: 20,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: 3,
              }}
            >
              {card.tier.label}
            </div>
            <div
              style={{
                position: "absolute",
                top: 12,
                right: 16,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: 84,
                height: 84,
                borderRadius: 999,
                border: `4px solid ${tint}`,
                background: "rgba(11,20,32,0.9)",
              }}
            >
              <span style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{card.overall}</span>
              <span style={{ fontSize: 12, color: "#8fa3b8", letterSpacing: 2 }}>OVR</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "16px 20px", gap: 6 }}>
            <span style={{ fontSize: 40, fontWeight: 800 }}>{card.name}</span>
            <span style={{ fontSize: 18, color: "#8fa3b8", textTransform: "uppercase", letterSpacing: 2 }}>
              {card.role}
              {card.teamName ? ` · ${card.teamName}` : ""}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, color: tint }}>{card.archetype}</span>
          </div>
        </div>

        {/* Stats panel */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "56px 48px 40px 8px", gap: 18 }}>
          <span style={{ fontSize: 22, color: "#8fa3b8", textTransform: "uppercase", letterSpacing: 6 }}>
            FPL Player Card · Season {card.season}
          </span>
          {card.subStats.map((stat) => (
            <div key={stat.key} style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Same overflow as the live card's bar labels: "OBJECTIVES"
                  is ~146px at 20px + 2px tracking, past the old 130, and
                  satori wraps rather than clipping — which would push the
                  row's bar out of line in the unfurl. Widened with room to
                  spare (the panel has ~660px to give) and pinned to one
                  line. */}
              <span
                style={{
                  width: 168,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                  fontSize: 20,
                  color: "#c6d2de",
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                {stat.label}
              </span>
              <div style={{ display: "flex", flex: 1, height: 14, background: "rgba(255,255,255,0.12)", borderRadius: 999 }}>
                <div style={{ display: "flex", width: `${stat.value}%`, background: tint, borderRadius: 999 }} />
              </div>
              <span style={{ width: 48, fontSize: 24, fontWeight: 800, textAlign: "right" }}>{stat.value}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", fontSize: 22, color: "#c6d2de" }}>
            <span>
              {card.wins}–{card.losses} · {Math.round(card.winratePct)}% WR
            </span>
            {card.signature ? <span>Signature: {card.signature.champion}</span> : null}
            <span>LVL {card.level}</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
