// The market page's own link-preview image (Next's opengraph-image file
// convention — auto-linked into this route segment's <head> as
// og:image/twitter:image). Distinct from the Discord announcer's /open and
// /result cards (src/app/api/betting/share/[id]/{open,result}/route.tsx):
// those are fetched once at announce time and cached forever by Discord, so
// they deliberately hide live odds; this image is refetched by whichever
// platform renders the link preview each time the market URL is shared, so
// it can show the market's current state — including a live odds bar while
// OPEN/LOCKED, ported from c:\fpl_gambling\api\share.py's render_market_card.
import { ImageResponse } from "next/og";
import { shareModel, resultHeadline, resultSummaryLine } from "@/lib/betting/share";
import { CARD_SIZE, CardFrame, CardFooter, PALETTE } from "@/lib/betting/share-render";

export const alt = "FPL Draft League betting market";
export const size = CARD_SIZE;
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const STATUS_TAG: Record<string, { tag: string; color: string }> = {
  OPEN: { tag: "BETTING OPEN", color: PALETTE.win },
  LOCKED: { tag: "LOCKED", color: PALETTE.gold },
  RESOLVED: { tag: "RESULT", color: "#7cc4ff" },
  CANCELLED: { tag: "CANCELLED", color: PALETTE.lose },
};

function OddsBar({ model }: { model: NonNullable<Awaited<ReturnType<typeof shareModel>>> }) {
  const total = model.pool_a + model.pool_b + model.pool_draw;
  const pctA = total > 0 ? Math.round((100 * model.pool_a) / total) : 50;
  return (
    <div style={{ display: "flex", width: 960, height: 56, marginTop: 40, borderRadius: 6, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: `${pctA}%`,
          height: "100%",
          backgroundColor: model.team_a.color,
          paddingLeft: 16,
          fontSize: 26,
          fontWeight: 700,
          color: PALETTE.navy,
        }}
      >
        {model.team_a.short_code} {pctA}%
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          width: `${100 - pctA}%`,
          height: "100%",
          backgroundColor: model.team_b.color,
          paddingRight: 16,
          fontSize: 26,
          fontWeight: 700,
          color: PALETTE.navy,
        }}
      >
        {100 - pctA}% {model.team_b.short_code}
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const marketId = Number(id);
  const model = Number.isInteger(marketId) ? await shareModel(marketId) : null;

  // Same null->404 contract as the /open and /result routes (share.ts's
  // shareModel returns null for an unknown market): the page itself 404s
  // for a missing market, so a graceful "not found" card here would just
  // paper over that with a misleading 200.
  if (!model) return new Response("not found", { status: 404 });

  const { tag, color } = STATUS_TAG[model.status] ?? { tag: model.status, color: PALETTE.steel };

  return new ImageResponse(
    (
      <CardFrame tag={tag} tagColor={color}>
        {model.status === "RESOLVED" && model.resolve ? (
          <>
            <div
              style={{
                display: "flex",
                fontSize: 58,
                fontWeight: 700,
                color: model.resolve.drawn ? PALETTE.win : (model.resolve.winner?.color ?? PALETTE.white),
              }}
            >
              {resultHeadline(model.resolve)}
            </div>
            <div style={{ display: "flex", fontSize: 30, color: PALETTE.steel, marginTop: 40 }}>{resultSummaryLine(model.resolve)}</div>
          </>
        ) : model.status === "CANCELLED" ? (
          <>
            <div style={{ display: "flex", fontSize: 52, fontWeight: 700, color: PALETTE.lose }}>MARKET CANCELLED</div>
            <div style={{ display: "flex", fontSize: 30, color: PALETTE.steel, marginTop: 20 }}>Every stake was refunded</div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", fontSize: 54, fontWeight: 700 }}>
              <span style={{ color: model.team_a.color }}>{model.team_a.name}</span>
              <span style={{ color: PALETTE.steel, margin: "0 20px" }}>vs</span>
              <span style={{ color: model.team_b.color }}>{model.team_b.name}</span>
            </div>
            <OddsBar model={model} />
          </>
        )}
        <CardFooter text={model.title} />
      </CardFrame>
    ),
    { ...size }
  );
}
