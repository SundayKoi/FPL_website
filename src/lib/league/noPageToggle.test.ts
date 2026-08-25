import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

const routedSources = [
  "src/components/home/PreseasonHomePage.tsx",
  "src/components/home/HomeDashboard.tsx",
  "src/components/players/PlayersDirectory.tsx",
  "src/components/teams/TeamsDirectory.tsx",
  "src/app/stats/page.tsx",
  "src/app/academy/stats/page.tsx",
  "src/app/schedule/page.tsx",
  "src/app/academy/schedule/page.tsx",
  "src/app/my-team/view.tsx",
  "src/app/my-team/scouting/view.tsx",
];

it("does not import the removed page-level league toggle", async () => {
  for (const sourcePath of routedSources) {
    const source = await readFile(sourcePath, "utf8");
    expect(source, sourcePath).not.toContain("@/components/LeaguePageToggle");
  }
});
