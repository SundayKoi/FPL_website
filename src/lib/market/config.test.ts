import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LISTING_DAYS,
  MAX_LISTING_ASK,
  MAX_NOTE_CHARS,
  MAX_WANT_BOUNTY,
  normalizeNote,
  validPrice,
} from "./config";

const MIGRATION = "supabase/migrations/20260912000003_card_market.sql";

function sql(): string {
  return readFileSync(join(process.cwd(), MIGRATION), "utf8");
}

/**
 * The bridge tests. Three numbers in this feature are written twice — once as
 * a TypeScript constant the forms and the actions read, once as a CHECK
 * constraint or a DEFAULT the database enforces — and there is nothing in
 * either language that makes the pair agree.
 *
 * When they disagree, the smaller one wins and the larger one becomes a lie
 * the UI keeps telling: a form that offers a 200,000 ask against a CHECK of
 * 100,000 fails with a raw Postgres error, and the person filling it in has
 * no way to know which number was the real one. Raising a cap now fails here
 * until the other half follows.
 */
describe("the caps the database also states", () => {
  it("asks no more than the migration's CHECK allows", () => {
    const match = sql().match(/ask\s+bigint not null check \(ask between 1 and (\d+)\)/);
    expect(match, "the ask CHECK is not where this test expects it").not.toBeNull();
    expect(Number(match![1])).toBe(MAX_LISTING_ASK);
  });

  it("bounties no more than the migration's CHECK allows", () => {
    const match = sql().match(/bounty\s+bigint not null check \(bounty between 1 and (\d+)\)/);
    expect(match, "the bounty CHECK is not where this test expects it").not.toBeNull();
    expect(Number(match![1])).toBe(MAX_WANT_BOUNTY);
  });

  it("keeps notes to the length both tables allow", () => {
    const lengths = [...sql().matchAll(/char_length\(note\) <= (\d+)/g)].map((m) => Number(m[1]));
    // Both boards, and both agreeing with the constant.
    expect(lengths.length).toBe(2);
    for (const length of lengths) expect(length).toBe(MAX_NOTE_CHARS);
  });

  it("expires a listing after exactly the configured number of days", () => {
    const match = sql().match(/expires_at\s+timestamptz not null default now\(\) \+ interval '(\d+) days'/);
    expect(match, "the expiry default is not where this test expects it").not.toBeNull();
    expect(Number(match![1])).toBe(LISTING_DAYS);
  });

  it("guards the price the sale RPC will accept at the same ceiling", () => {
    // execute_card_sale takes p_price as untrusted input, the way dust_card
    // takes p_value. Its band has to be the listing band or a legitimate
    // maximum-price sale dies inside the RPC.
    const match = sql().match(/p_price < 1 or p_price > (\d+)/);
    expect(match, "the sale price guard is not where this test expects it").not.toBeNull();
    expect(Number(match![1])).toBe(Math.max(MAX_LISTING_ASK, MAX_WANT_BOUNTY));
  });
});

describe("validPrice", () => {
  it("takes whole numbers from one to the cap", () => {
    expect(validPrice(1, MAX_LISTING_ASK)).toBe(true);
    expect(validPrice(MAX_LISTING_ASK, MAX_LISTING_ASK)).toBe(true);
  });

  it("refuses zero, negatives, fractions, the cap plus one and non-numbers", () => {
    expect(validPrice(0, MAX_LISTING_ASK)).toBe(false);
    expect(validPrice(-5, MAX_LISTING_ASK)).toBe(false);
    expect(validPrice(1.5, MAX_LISTING_ASK)).toBe(false);
    expect(validPrice(MAX_LISTING_ASK + 1, MAX_LISTING_ASK)).toBe(false);
    expect(validPrice("500", MAX_LISTING_ASK)).toBe(false);
    expect(validPrice(Number.NaN, MAX_LISTING_ASK)).toBe(false);
  });
});

describe("normalizeNote", () => {
  it("treats blank and missing alike — a note is optional", () => {
    expect(normalizeNote(undefined)).toBeNull();
    expect(normalizeNote(null)).toBeNull();
    expect(normalizeNote("")).toBeNull();
    expect(normalizeNote("   ")).toBeNull();
  });

  it("trims what it keeps", () => {
    expect(normalizeNote("  will take offers  ")).toBe("will take offers");
  });

  it("refuses a note the database would refuse", () => {
    expect(normalizeNote("x".repeat(MAX_NOTE_CHARS))).toBe("x".repeat(MAX_NOTE_CHARS));
    expect(normalizeNote("x".repeat(MAX_NOTE_CHARS + 1))).toBeUndefined();
    expect(normalizeNote(42)).toBeUndefined();
  });
});
