// Shared layout/styling for the three next/og ImageResponse renders that
// consume shareModel() (share.ts): the market page's opengraph-image, and
// the Discord announcer's /open + /result cards
// (src/app/betting/market/[id]/opengraph-image.tsx,
// src/app/api/betting/share/[id]/{open,result}/route.tsx). Kept here so the
// 1200x630 frame (brand bar + footer) is defined once instead of three
// times. Content ported from c:\fpl_gambling\api\share.py's render_*_card
// functions — colors/text only, not the PIL drawing itself; laid out with
// flexbox divs for Satori (next/og's renderer) instead.
//
// No external fonts or images: next/og falls back to its own bundled sans
// font when no `fonts` option is passed to ImageResponse, and colors come
// from two sources duplicated here as hex (ImageResponse can't read CSS
// custom properties, and discord/respond.ts's colors are 0xRRGGBB ints, not
// CSS strings): navy/panel/line/steel/gold/white are globals.css's `@theme`
// tokens; win/lose match discord/respond.ts's GREEN/RED (0x34e98a/0xff5063)
// — both ported from the same c:\fpl_gambling\bot\main.py source, so they
// coincide, but they're independent constants for two different concerns
// (Discord embed colors vs. this card's palette) and aren't imported from
// there: respond.ts has no CSS-string form of its ints, and keeping these
// hardcoded means an unrelated future change to Discord's embed color can't
// silently reflow this card's palette.

import type { ReactNode } from "react";

export const CARD_SIZE = { width: 1200, height: 630 };

export const PALETTE = {
  navy: "#001f34",
  panel: "#0a2a47",
  line: "#1b4263",
  steel: "#a7c0d8",
  gold: "#f5b62e",
  white: "#ffffff",
  win: "#34e98a",
  lose: "#ff5063",
} as const;

const FONT_STACK = "system-ui, -apple-system, Segoe UI, sans-serif";

/** The 1200x630 outer frame every card shares: navy background, a brand bar
 * with "FPL DRAFT LEAGUE" on the left and a status tag on the right, and the
 * caller's content filling the rest. */
export function CardFrame({
  tag,
  tagColor,
  children,
}: {
  tag: string;
  tagColor: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: PALETTE.navy,
        fontFamily: FONT_STACK,
        color: PALETTE.white,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 96,
          padding: "0 48px",
          backgroundColor: PALETTE.panel,
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: 1 }}>FPL DRAFT LEAGUE</div>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: tagColor }}>{tag}</div>
      </div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

/** The muted center-bottom footer line every card ends with. */
export function CardFooter({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        bottom: 44,
        left: 0,
        right: 0,
        justifyContent: "center",
        fontSize: 28,
        color: PALETTE.steel,
      }}
    >
      {text}
    </div>
  );
}
