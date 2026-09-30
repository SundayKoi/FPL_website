import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postWebhookEmbed } from "./discord";

describe("postWebhookEmbed", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sentBody(): unknown {
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return JSON.parse(init.body as string);
  }

  it("posts a single embed with a footer when one is given", async () => {
    await postWebhookEmbed("https://discord.test/hook", { title: "Drop", description: "Lines", color: 0xf5b62e, footer: "S6" });

    expect(fetchMock).toHaveBeenCalledWith("https://discord.test/hook", expect.objectContaining({ method: "POST" }));
    expect(sentBody()).toEqual({
      embeds: [{ title: "Drop", description: "Lines", color: 0xf5b62e, footer: { text: "S6" } }],
    });
  });

  it("omits the footer and truncates the description to Discord's limit", async () => {
    await postWebhookEmbed("https://discord.test/hook", { title: "Draw", description: "x".repeat(4100), color: 0xe8c14b });

    expect(sentBody()).toEqual({ embeds: [{ title: "Draw", description: "x".repeat(4000), color: 0xe8c14b }] });
  });

  it("throws with the status and response text on failure", async () => {
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));

    await expect(
      postWebhookEmbed("https://discord.test/hook", { title: "Draw", description: "", color: 0 }),
    ).rejects.toThrow("Discord webhook failed: HTTP 429: rate limited");
  });
});
