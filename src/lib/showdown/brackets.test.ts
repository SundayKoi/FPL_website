import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRACKET_KEYS, BRACKETS } from "./config";

/** The migration seeds showdown_brackets so showdown_sit can check a
 *  buy-in and a stack cap without trusting the app. This holds that seed
 *  to config.ts: change one and the test names the other. */
describe("the seeded brackets", () => {
  it("match config.ts", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const files = readdirSync(dir).filter((file) => readFileSync(join(dir, file), "utf8").includes("insert into public.showdown_brackets"));
    expect(files.length, "no migration seeds showdown_brackets").toBeGreaterThan(0);
    const sql = readFileSync(join(dir, files[files.length - 1]), "utf8");
    for (const key of BRACKET_KEYS) {
      const b = BRACKETS[key];
      const row = new RegExp(`\\('${key}',\\s*${b.smallBlind},\\s*${b.bigBlind},\\s*${b.minBuyIn},\\s*${b.maxBuyIn},\\s*${b.stackCap},\\s*${b.free}\\)`);
      expect(sql, `the ${key} bracket seed disagrees with config.ts`).toMatch(row);
    }
  });
});
