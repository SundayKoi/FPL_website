import PreseasonHomePage from "@/components/home/PreseasonHomePage";
import RegularSeasonHomePage from "@/components/home/RegularSeasonHomePage";
import { getHomepagePhase } from "@/lib/home/seasonState";

export default function Home() {
  return getHomepagePhase() === "preseason" ? <PreseasonHomePage /> : <RegularSeasonHomePage />;
}
