import { NextResponse } from "next/server";
import { HigherLowerError, getHigherLowerLeaderboard } from "@/lib/higher-lower/server";

export async function GET(request: Request) {
  const league = new URL(request.url).searchParams.get("league");

  try {
    const weeklyLeaderboard = await getHigherLowerLeaderboard(league);
    return NextResponse.json({ weeklyLeaderboard });
  } catch (error) {
    if (error instanceof HigherLowerError && error.code === "FORBIDDEN") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Higher or Lower leaderboard unavailable." }, { status: 500 });
  }
}
