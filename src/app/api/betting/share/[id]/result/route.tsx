// Resolved-market share card — the image discord-announcer
// (supabase/functions/discord-announcer/index.ts) embeds on its resolved
// post, at `${SITE_URL}/api/betting/share/${id}/result`. Content ported
// from c:\fpl_gambling\api\share.py's render_result_card: winner banner (or
// "IT'S A DRAW"), plus a payout stat line built by resultSummaryLine()
// (share.ts) — same math as discord-announcer's resolveSummary().
import { ImageResponse } from "next/og";
import { shareModel, resultHeadline, resultSummaryLine } from "@/lib/betting/share";
import { CARD_SIZE, CardFrame, CardFooter, PALETTE } from "@/lib/betting/share-render";

export const alt = "Betting result";
export const size = CARD_SIZE;
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const marketId = Number(id);
  if (!Number.isInteger(marketId)) return new Response("not found", { status: 404 });

  const model = await shareModel(marketId);
  if (!model) return new Response("not found", { status: 404 });

  // This route is only ever linked from an already-resolved market's
  // announcement, but a bare/early request (or a market that regresses out
  // of RESOLVED) shouldn't crash — fall back to a neutral "pending" card.
  const resolve = model.resolve;

  return new ImageResponse(
    (
      <CardFrame tag="RESULT" tagColor="#7cc4ff">
        {resolve ? (
          <>
            <div style={{ display: "flex", fontSize: 58, fontWeight: 700, color: resolve.drawn ? PALETTE.win : (resolve.winner?.color ?? PALETTE.white) }}>
              {resultHeadline(resolve)}
            </div>
            {!resolve.drawn && resolve.winner && (
              <div style={{ display: "flex", fontSize: 32, color: PALETTE.steel, marginTop: 12 }}>
                def. {resolve.winner.id === model.team_a.id ? model.team_b.name : model.team_a.name}
              </div>
            )}
            {resolve.drawn && (
              <div style={{ display: "flex", fontSize: 32, color: PALETTE.steel, marginTop: 12 }}>
                {model.team_a.name} vs {model.team_b.name}
              </div>
            )}
            <div
              style={{
                display: "flex",
                marginTop: 48,
                padding: "20px 40px",
                backgroundColor: PALETTE.panel,
                border: `1px solid ${PALETTE.line}`,
                borderRadius: 8,
                fontSize: 30,
                fontWeight: 600,
                color: PALETTE.white,
              }}
            >
              {resultSummaryLine(resolve)}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: PALETTE.steel }}>Result pending</div>
        )}
        <CardFooter text={model.title} />
      </CardFrame>
    ),
    { ...size }
  );
}
