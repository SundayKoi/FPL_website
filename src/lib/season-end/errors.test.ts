import { describe, expect, it } from "vitest";
import { formatSeasonEndCatalogActionError, seasonEndSourceReadinessError } from "./errors";

describe("Season's End catalog errors", () => {
  it("explains which local sources must be seeded before an empty rebuild", () => {
    expect(seasonEndSourceReadinessError("premier", "S5", { games: 0, players: 0, cards: 0 }, "rebuild")).toBe(
      "Cannot rebuild the S5 Season's End catalog: regular-season raw_stats for S5 and season card source rows for S5 are empty. Import or seed the S5 stats and fixtures, refresh the season card aggregates, and configure league_settings.featured_draft_id before retrying.",
    );
  });

  it("turns a missing draft mapping into an actionable message", () => {
    expect(formatSeasonEndCatalogActionError(new Error("Season's End team identity source is not scoped to the requested season"), "rebuild", "S5")).toContain("Set the matching league_settings draft id");
  });

  it("does not expose unexpected server errors to the admin UI", () => {
    expect(formatSeasonEndCatalogActionError(new Error("database connection details"), "rebuild", "S5")).toBe(
      "The draft catalog could not be rebuilt. Check the S5 source data and server logs, then retry.",
    );
  });
});
