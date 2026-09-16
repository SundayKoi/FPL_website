import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sweepTables } = vi.hoisted(() => ({ sweepTables: vi.fn(async () => ({ looked: 2, moved: 1, errors: [] })) }));
vi.mock("@/lib/showdown/server", () => ({ sweepTables }));

import { GET } from "./route";

beforeEach(() => {
  sweepTables.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("the sweep route", () => {
  it("refuses to run with no secret configured", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    const response = await GET(new Request("http://x/api/showdown/sweep"));
    expect(response.status).toBe(503);
    expect(sweepTables).not.toHaveBeenCalled();
  });

  it("refuses a caller without the secret, and sweeps for the cron", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const bad = await GET(new Request("http://x/api/showdown/sweep", { headers: { authorization: "Bearer nope" } }));
    expect(bad.status).toBe(401);
    const good = await GET(new Request("http://x/api/showdown/sweep", { headers: { authorization: "Bearer s3cret" } }));
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ looked: 2, moved: 1, errors: [] });
  });
});
