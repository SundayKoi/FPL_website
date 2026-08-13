import PreseasonHomePage from "@/components/home/PreseasonHomePage";
import RegularSeasonHomePage from "@/components/home/RegularSeasonHomePage";
import { fetchHomepageMode } from "@/lib/home/homepageSettings";
import { resolveHomepagePhase } from "@/lib/home/seasonState";

export default async function Home() {
  const homepageMode = await fetchHomepageMode();
  return resolveHomepagePhase(homepageMode) === "preseason" ? <PreseasonHomePage /> : <RegularSeasonHomePage />;
}
