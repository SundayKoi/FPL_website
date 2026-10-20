import { afterEach, describe, expect, it, vi } from "vitest";
import { IngestError, latestIngestRun, startIngest } from "./ingestRun";

const WORKFLOW = "https://api.github.com/repos/SundayKoi/FPL_website/actions/workflows/offseason-ingest.yml";

function answer(status: number, body?: unknown) {
  const fetch = vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("latestIngestRun", () => {
  it("reads the latest run started by hand, with the token", async () => {
    const fetch = answer(200, {
      workflow_runs: [
        { id: 7, status: "in_progress", conclusion: null, created_at: "2026-10-20T03:00:00Z", html_url: "https://github.com/run/7", name: "x" },
      ],
    });
    expect(await latestIngestRun("tok")).toEqual({
      id: 7,
      status: "in_progress",
      conclusion: null,
      createdAt: "2026-10-20T03:00:00Z",
      url: "https://github.com/run/7",
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${WORKFLOW}/runs?event=workflow_dispatch&per_page=1`);
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok", Accept: "application/vnd.github+json" });
    expect(init.cache).toBe("no-store");
  });

  it("is null before the first run", async () => {
    answer(200, { workflow_runs: [] });
    expect(await latestIngestRun("tok")).toBeNull();
  });

  it("says when GitHub refuses the token", async () => {
    answer(403, { message: "Resource not accessible" });
    const read = latestIngestRun("tok");
    await expect(read).rejects.toBeInstanceOf(IngestError);
    await expect(read).rejects.toThrow("GitHub refused the token (403): it needs Actions read and write on SundayKoi/FPL_website.");
  });
});

describe("startIngest", () => {
  it("starts the workflow on main for every pending game", async () => {
    const fetch = answer(204);
    await startIngest("tok");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${WORKFLOW}/dispatches`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ ref: "main", inputs: { game_id: "" } });
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok", "Content-Type": "application/json" });
  });

  it("passes on GitHub's other failures", async () => {
    answer(500);
    await expect(startIngest("tok")).rejects.toThrow("GitHub answered 500. Try again in a minute.");
  });
});
