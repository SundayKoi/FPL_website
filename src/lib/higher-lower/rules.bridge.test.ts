import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { difficultyForRound, HIGHER_LOWER_ROUNDS } from "./rules";

/**
 * The difficulty curve exists TWICE: once here in TypeScript and once in
 * PL/pgSQL, where the round is actually drawn. Nothing in production calls
 * the TypeScript copy — it is documentation that compiles — so the two can
 * drift silently, and the drift would show up as a game that gets harder
 * on a different schedule than the code says it does.
 *
 * The same shape as the expedition payout guard, which shipped a SQL
 * ceiling restating a TypeScript one and refused every Legend jackpot for
 * it. So: the SQL is parsed here and held to the constant.
 */
const MIGRATION = "supabase/migrations/20260830050000_higher_lower_forty_five_rounds.sql";

/** The `p_round between A and B then v_min_gap := X; v_max_gap := Y` ladder. */
function bandsFromSql(): { from: number; to: number; minGap: number; maxGap: number }[] {
  const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8");
  const pattern =
    /p_round between (\d+) and (\d+) then\s*\n\s*v_min_gap := (\d+); v_max_gap := (\d+);/g;
  const bands: { from: number; to: number; minGap: number; maxGap: number }[] = [];
  for (const match of sql.matchAll(pattern)) {
    bands.push({
      from: Number(match[1]),
      to: Number(match[2]),
      minGap: Number(match[3]),
      maxGap: Number(match[4]),
    });
  }
  return bands;
}

describe("the difficulty curve, in both languages", () => {
  it("agrees on every one of the 45 rounds", () => {
    const bands = bandsFromSql();
    for (let round = 1; round <= HIGHER_LOWER_ROUNDS; round += 1) {
      const sqlBand = bands.find((band) => round >= band.from && round <= band.to);
      expect(sqlBand, `SQL has no band for round ${round}`).toBeDefined();
      expect({ minGap: sqlBand!.minGap, maxGap: sqlBand!.maxGap }, `round ${round}`).toEqual(
        difficultyForRound(round),
      );
    }
  });

  it("covers the whole run with no gap and no overlap", () => {
    const bands = [...bandsFromSql()].sort((a, b) => a.from - b.from);
    expect(bands[0].from).toBe(1);
    expect(bands[bands.length - 1].to).toBe(HIGHER_LOWER_ROUNDS);
    for (let index = 1; index < bands.length; index += 1) {
      expect(bands[index].from).toBe(bands[index - 1].to + 1);
    }
  });

  it("only ever gets harder", () => {
    // The curve's whole promise: the gap narrows. A band that widened
    // would be a difficulty spike downward and almost certainly a typo.
    const bands = [...bandsFromSql()].sort((a, b) => a.from - b.from);
    for (let index = 1; index < bands.length; index += 1) {
      expect(bands[index].minGap).toBeLessThanOrEqual(bands[index - 1].minGap);
      expect(bands[index].maxGap).toBeLessThanOrEqual(bands[index - 1].maxGap);
    }
  });
});
