// The 1200x630 flat render of a card, shared by both PNG routes:
//
//   /card/{slug}/card.png   the LIVE card (or an archived edition print) —
//                           a player as they stand, owned by nobody.
//   /copy/{id}/card.png     one OWNED copy out of card_inventory, with the
//                           cosmetics that copy actually printed.
//
// It lives here rather than in either route because the two pictures have
// to be the same picture. A copy image that laid its stats out differently
// would read as a different card of the same player, which is the one thing
// a collectible must never do — and the /card route's layout has already
// been tuned twice against real satori output (the bar-label width below is
// a fixed bug, not a guess). One layout, two callers, no drift.
//
// satori (next/og's renderer) knows flexbox and little else: no CSS 3D, no
// blend modes, no backdrop-filter, no animation — everything the live card
// wears its parallels with. So the cosmetics arrive here already reduced to
// flat marks by cardTreatment(): a named badge, a frame colour, a hallmark,
// a ribbon. See treatment.ts for which copy earns which.
//
// Every div with children carries an explicit `display: flex`, because
// satori has no default display and silently drops the rest otherwise.

import type { ReactElement } from "react";
import type { PlayerCardData } from "@/lib/cards/build";
import { cardTreatment } from "./treatment";

export const CARD_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export interface CardImageInput {
  /** The card as it should print — live, an archived edition, or the json
   *  frozen on an owned copy. */
  card: PlayerCardData;
  foil: boolean;
  foilType: string | null;
  signed: boolean;
  /** The ink itself, printed over the art. Validated in treatment.ts. */
  autograph: string | null;
  /** Replaces "FPL Player Card" on the eyebrow line — where a copy says
   *  which edition it came out of. Omitted for the live card, which came
   *  out of no edition. */
  label?: string;
  /** The art url, ALREADY RESOLVED. satori fetches images itself and has
   *  no onError to fall through, so the fallback chain the live card walks
   *  in the browser has to be finished before it gets here; a url that
   *  404s at render time breaks the whole unfurl. */
  splash: string | null;
}

/** The element to hand `new ImageResponse(...)`, at CARD_IMAGE_SIZE. */
export function renderCardImage({ card, foil, foilType, signed, autograph, label, splash }: CardImageInput): ReactElement {
  const look = cardTreatment({ tierKey: card.tier?.key, foil, foilType, signed, autograph, season: card.season });
  const tint = look.tint;
  // A pulled moment and a roster plate are ordinary card_inventory rows and
  // this route has to picture them. Their rating fields are placeholders
  // that are never shown on the real card, so the parts of this layout that
  // read a rating branch off these two before touching one.
  const moment = card.moment ?? null;
  const team = card.team ?? null;
  const subStats = card.subStats ?? [];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: look.ground,
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
          border: `6px solid ${look.border}`,
          overflow: "hidden",
          background: look.panel,
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
            {card.tier?.label ?? ""}
          </div>
          {/* The parallel, said out loud. A ladder nobody can see is not a
              ladder — half the point of pulling a Cracked Ice is knowing
              you did, and the live card's moving light does not survive
              satori, so the name is all there is. */}
          {look.badge ? (
            <div
              style={{
                position: "absolute",
                top: 62,
                left: 16,
                display: "flex",
                background: "rgba(11,20,32,0.82)",
                border: `2px solid ${look.accent}`,
                color: look.accent,
                borderRadius: 999,
                padding: "4px 14px",
                fontSize: 16,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: 2,
              }}
            >
              {look.badge}
            </div>
          ) : null}
          {/* The Eclipse hallmark takes the badge's place: on a real card
              the serial is what sells the rarity, and this one cannot be
              beaten. Square rather than a pill, so it reads as a stamp. */}
          {look.hallmark ? (
            <div
              style={{
                position: "absolute",
                top: 62,
                left: 16,
                display: "flex",
                background: "rgba(0,0,0,0.86)",
                border: `2px solid ${look.accent}`,
                color: look.accent,
                borderRadius: 6,
                padding: "4px 14px",
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: 4,
              }}
            >
              {look.hallmark}
            </div>
          ) : null}
          {/* A moment has no overall — that is the premise of the plate. */}
          {moment ? null : (
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
                border: `4px solid ${look.border}`,
                background: "rgba(11,20,32,0.9)",
              }}
            >
              <span style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{card.overall}</span>
              <span style={{ fontSize: 12, color: "#8fa3b8", letterSpacing: 2 }}>OVR</span>
            </div>
          )}
          {/* The ink, over the lower right of the art — the half of the
              band the name and role do not use, which is where it sits on
              the live card too. Flat: satori has no rotation to sign at an
              angle with and no drop-shadow to lift white ink off a bright
              splash, so it gets a dark plate to sit on instead. */}
          {look.ink ? (
            <div
              style={{
                position: "absolute",
                right: 10,
                bottom: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 200,
                height: 92,
                borderRadius: 10,
                background: "rgba(0,0,0,0.42)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={look.ink} alt="" width={188} height={80} style={{ objectFit: "contain" }} />
            </div>
          ) : null}
          {look.ribbon ? (
            <div
              style={{
                position: "absolute",
                left: 16,
                bottom: 16,
                display: "flex",
                background: "rgba(0,0,0,0.82)",
                border: "2px solid #e8c56a",
                color: "#e8c56a",
                borderRadius: 999,
                padding: "4px 14px",
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: 3,
              }}
            >
              {look.ribbon}
            </div>
          ) : null}
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
          {`${label ?? "FPL Player Card"} · Season ${card.season}`}
        </span>
        {/* A moment's whole content is its headline; its subStats are empty
            by construction, so this replaces the bars rather than crowding
            them. */}
        {moment ? (
          <span style={{ display: "flex", fontSize: 30, lineHeight: 1.3, color: "#e7eef6" }}>{moment.headline}</span>
        ) : null}
        {/* A roster plate's content is the five players on it. */}
        {team
          ? (team.slots ?? []).map((slot) => (
              <div key={slot.role} style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 24 }}>
                <span style={{ width: 130, flexShrink: 0, color: "#8fa3b8", textTransform: "uppercase", letterSpacing: 2, fontSize: 20 }}>
                  {slot.role}
                </span>
                <span style={{ flex: 1, fontWeight: 700 }}>{slot.name}</span>
                <span style={{ width: 48, fontWeight: 800, textAlign: "right" }}>{slot.overall}</span>
              </div>
            ))
          : null}
        {subStats.map((stat) => (
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
        {moment || team ? (
          // Neither has a win-loss record to print, and "0–0 · 0% WR" under
          // a moment is a lie about a card that never had a rating.
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", fontSize: 22, color: "#c6d2de" }}>
            <span>{moment ? moment.title : team?.teamName ?? ""}</span>
            <span>{moment ? moment.weekStart : team?.weekStart ?? ""}</span>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", fontSize: 22, color: "#c6d2de" }}>
            <span>
              {card.wins}–{card.losses} · {Math.round(card.winratePct)}% WR
            </span>
            {card.signature ? <span>Signature: {card.signature.champion}</span> : null}
            <span>LVL {card.level}</span>
          </div>
        )}
      </div>
    </div>
  );
}
