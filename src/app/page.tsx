import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PreseasonHomePage from "@/components/home/PreseasonHomePage";
import RegularSeasonHomePage from "@/components/home/RegularSeasonHomePage";
import { fetchHomepageMode } from "@/lib/home/homepageSettings";
import { resolveHomepagePhase } from "@/lib/home/seasonState";
import { homeRedirect, LEAGUE_COOKIE } from "@/lib/league/preference";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function Home() {
  // An Academy player lands on their own league's home (src/lib/league/preference.ts).
  const target = await homeRedirect((await cookies()).get(LEAGUE_COOKIE)?.value, await createServerSupabase());
  if (target) redirect(target);
  const homepageMode = await fetchHomepageMode();
  return resolveHomepagePhase(homepageMode) === "preseason" ? <PreseasonHomePage /> : <RegularSeasonHomePage />;
}
