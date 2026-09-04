import { NextResponse } from "next/server";
import { sweepExpeditions } from "@/lib/expeditions/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The expedition sweep, hit by the Vercel cron every five minutes
 * (vercel.json). A fork that opened while nobody was looking needs its
 * ping, and a lost card whose week ran out needs its grave; neither has a
 * client present to do it. Silence at a fork needs nothing — it is already
 * a choice.
 *
 * Vercel signs its cron calls with CRON_SECRET; nothing else may call
 * this. With no secret configured the route refuses rather than run open.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await sweepExpeditions();
  return NextResponse.json(result);
}
