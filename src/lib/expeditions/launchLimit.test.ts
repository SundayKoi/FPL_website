import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DAILY_LAUNCHES, PATRON_DAILY_LAUNCHES } from "./config";
import { BASE_EXPEDITION_LAUNCHES, PATRON_EXPEDITION_LAUNCHES } from "@/lib/patron/perks";

/**
 * The daily launch limit was written down four times in TypeScript and
 * once more in PL/pgSQL, with nothing connecting any of them — the perks
 * copy even carried a comment explaining that it could not be imported.
 * The perks constants now derive from config; this holds the SQL, which is
 * the copy that actually enforces the rule, to the same numbers.
 */
function sqlLimits(): { patron: number; base: number } {
  // The LAST migration to define launch_expedition is the live one, so a
  // future rewrite is picked up rather than silently ignored.
  const dir = join(process.cwd(), "supabase/migrations");
  const live = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .filter((file) =>
      readFileSync(join(dir, file), "utf8").includes("function public.launch_expedition"),
    )
    .pop();
  expect(live, "no migration defines launch_expedition").toBeDefined();
  const sql = readFileSync(join(dir, live!), "utf8");
  const match = sql.match(/v_limit := case when coalesce\(v_patron, false\) then (\d+) else (\d+) end/);
  expect(match, "the launch limit is not where the test expects it").not.toBeNull();
  return { patron: Number(match![1]), base: Number(match![2]) };
}

describe("the expedition launch limit", () => {
  it("is the same number in TypeScript and in the SQL that enforces it", () => {
    const limits = sqlLimits();
    expect(limits.base).toBe(DAILY_LAUNCHES);
    expect(limits.patron).toBe(PATRON_DAILY_LAUNCHES);
  });

  it("has one TS source, not two", () => {
    // The perks page and the economy maths must quote the same limit as
    // the door: a perk advertising two launches against a door allowing
    // one is a support ticket, not a rounding error.
    expect(BASE_EXPEDITION_LAUNCHES).toBe(DAILY_LAUNCHES);
    expect(PATRON_EXPEDITION_LAUNCHES).toBe(PATRON_DAILY_LAUNCHES);
  });

  it("still pays patrons more than everyone else", () => {
    expect(PATRON_DAILY_LAUNCHES).toBeGreaterThan(DAILY_LAUNCHES);
    expect(DAILY_LAUNCHES).toBeGreaterThanOrEqual(1);
  });
});
