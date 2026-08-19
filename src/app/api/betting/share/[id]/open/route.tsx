// "Betting open" share card — the image discord-announcer
// (supabase/functions/discord-announcer/index.ts) embeds on its open-market
// post, at `${SITE_URL}/api/betting/share/${id}/open`. Odds-free by design:
// Discord fetches this once at post time and caches it on its CDN, so
// showing live pool odds here would only ever go stale (same reasoning as
// c:\fpl_gambling\api\share.py's render_matchup_card, whose content this
// ports — teams + "VS", no PIL/logo rendering).
import { ImageResponse } from "next/og";
import { shareModel } from "@/lib/betting/share";
import { CARD_SIZE, CardFrame, CardFooter, PALETTE } from "@/lib/betting/share-render";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const marketId = Number(id);
  if (!Number.isInteger(marketId)) return new Response("not found", { status: 404 });

  const model = await shareModel(marketId);
  if (!model) return new Response("not found", { status: 404 });

  return new ImageResponse(
    (
      <CardFrame tag="BETTING OPEN" tagColor={PALETTE.win}>
        <div style={{ display: "flex", fontSize: 60, fontWeight: 700, color: model.team_a.color }}>{model.team_a.name}</div>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: PALETTE.white, margin: "18px 0" }}>VS</div>
        <div style={{ display: "flex", fontSize: 60, fontWeight: 700, color: model.team_b.color }}>{model.team_b.name}</div>
        <CardFooter text="place your bet now" />
      </CardFrame>
    ),
    { ...CARD_SIZE }
  );
}
