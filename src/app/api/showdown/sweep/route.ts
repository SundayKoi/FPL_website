import { NextResponse } from "next/server";
import { sweepTables } from "@/lib/showdown/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Showdown sweep, hit by the Vercel cron every minute (vercel.json).
 * A table nobody has open still needs its clock run and its next hand
 * dealt; this does exactly what a watching client's sync would.
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
  const result = await sweepTables();
  return NextResponse.json(result);
}
