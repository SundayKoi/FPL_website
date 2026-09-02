import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sweepTables } = vi.hoisted(() => ({ sweepTables: vi.fn(async () => ({ looked: 2, moved: 1, errors: [] })) }));
vi.mock("@/lib/showdown/server", () => ({ sweepTables }));

import { GET } from "./route";

const original = process.env.CRON_SECRET;
beforeEach(() => {
  sweepTables.mockClear();
});
afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe("the sweep route", () => {
  it("refuses to run with no secret configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new Request("http://x/api/showdown/sweep"));
    expect(response.status).toBe(503);
    expect(sweepTables).not.toHaveBeenCalled();
  });

  it("refuses a caller without the secret, and sweeps for the cron", async () => {
    process.env.CRON_SECRET = "s3cret";
    const bad = await GET(new Request("http://x/api/showdown/sweep", { headers: { authorization: "Bearer nope" } }));
    expect(bad.status).toBe(401);
    const good = await GET(new Request("http://x/api/showdown/sweep", { headers: { authorization: "Bearer s3cret" } }));
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ looked: 2, moved: 1, errors: [] });
  });
});
