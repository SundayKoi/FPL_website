import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { postCardsWebhook } = await import("./announce");

const embed = { title: "Test", description: "A committed event", color: 1 };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("postCardsWebhook", () => {
  it("bounds delivery and records a sanitized HTTP failure", async () => {
    vi.stubEnv("DISCORD_CARDS_WEBHOOK_URL", "https://discord.example/webhook/secret");
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<{ ok: boolean; status: number }>>()
      .mockResolvedValue({ ok: false, status: 503 });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    await postCardsWebhook(embed);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: expect.any(AbortSignal) });
    expect(error).toHaveBeenCalledWith("packs: cards announcement delivery failed", { category: "http", status: 503 });
    expect(JSON.stringify(error.mock.calls)).not.toContain("discord.example");
  });

  it("keeps timeout failures soft and does not expose the destination", async () => {
    vi.stubEnv("DISCORD_CARDS_WEBHOOK_URL", "https://discord.example/webhook/secret");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timed out", "TimeoutError"); }));

    await expect(postCardsWebhook(embed)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("packs: cards announcement delivery failed", { category: "timeout" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("discord.example");
  });
});
