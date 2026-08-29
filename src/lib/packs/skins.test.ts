import { afterEach, describe, expect, it, vi } from "vitest";
import { SIGNED_ALT_SKIN_CHANCE } from "./config";
import { fetchChampionSkinNums, printArtExists, resolvePrintArtUrl, rollPrint, rollSkinNum } from "./skins";

/** Same scripted rand as rng.test.ts: throws when overrun, so a test that
 *  says "consumes one value" fails loudly if the roll consumes two. */
function scripted(values: number[]): () => number {
  let index = 0;
  return () => {
    if (index >= values.length) throw new Error(`scripted rand exhausted after ${values.length} values`);
    return values[index++];
  };
}

/** A champion.json body with the given skin nums, keyed the way Riot keys
 *  it — by Data Dragon id. */
function skinPayload(id: string, nums: number[]) {
  return { data: { [id]: { skins: nums.map((num) => ({ num })) } } };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rollSkinNum", () => {
  it("maps the roll uniformly across the catalog", () => {
    const nums = [0, 1, 8, 27];
    // Four skins, so each quarter of [0,1) is one skin.
    expect(rollSkinNum(nums, scripted([0]))).toBe(0);
    expect(rollSkinNum(nums, scripted([0.3]))).toBe(1);
    expect(rollSkinNum(nums, scripted([0.6]))).toBe(8);
    expect(rollSkinNum(nums, scripted([0.99]))).toBe(27);
  });

  it("consumes exactly one value per print", () => {
    expect(rollSkinNum([0, 4], scripted([0.9]))).toBe(4);
  });

  it("stays inside the catalog when the roll lands at the very top", () => {
    expect(rollSkinNum([0, 1, 2], scripted([1]))).toBe(2);
  });
});

describe("printArtExists", () => {
  /** A CDN that serves whichever urls `served` approves and 403s the rest.
   *  Every test below uses a champion + num pair of its own: the validity
   *  cache is module-level and deliberately never cleared. */
  const cdn = (served: (url: string) => boolean) =>
    vi.fn(async (url: string) => ({ ok: served(url) }));

  it("accepts a skin Riot never centered but did splash", async () => {
    // The gap this whole fallback exists for: /centered/ is missing for a
    // great many nums that /splash/ serves fine.
    const fetchMock = cdn((url) => url.includes("/splash/"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(printArtExists("Jhin", 64)).resolves.toBe(true);
    await expect(resolvePrintArtUrl("Jhin", 64)).resolves.toBe(
      "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jhin_64.jpg",
    );
    expect(fetchMock.mock.calls[0][0]).toContain("/centered/Jhin_64.jpg");
  });

  it("prefers the centered crop when the CDN has it", async () => {
    vi.stubGlobal("fetch", cdn(() => true));

    await expect(resolvePrintArtUrl("Jhin", 55)).resolves.toBe(
      "https://ddragon.leagueoflegends.com/cdn/img/champion/centered/Jhin_55.jpg",
    );
  });

  it("rejects a skin neither directory serves", async () => {
    vi.stubGlobal("fetch", cdn(() => false));

    await expect(printArtExists("Jhin", 47)).resolves.toBe(false);
    await expect(resolvePrintArtUrl("Jhin", 47)).resolves.toBeNull();
  });

  it("probes each url once, however many prints ask", async () => {
    const fetchMock = cdn((url) => url.includes("/splash/"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(printArtExists("Jhin", 37)).resolves.toBe(true);
    await expect(printArtExists("Jhin", 37)).resolves.toBe(true);
    await expect(printArtExists("Jhin", 37)).resolves.toBe(true);

    // One HEAD for the missing centered url, one for the splash that
    // answered — and nothing after that.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache a transient network failure", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    // First look: centered throws, splash is asked and throws nothing... the
    // rejection only kills the centered probe, so re-asking must re-probe it.
    await expect(printArtExists("Jhin", 23)).resolves.toBe(true);
    await expect(resolvePrintArtUrl("Jhin", 23)).resolves.toBe(
      "https://ddragon.leagueoflegends.com/cdn/img/champion/centered/Jhin_23.jpg",
    );
  });

  it("answers no art when the CDN serves neither directory", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(printArtExists("Not A Champion", 1)).resolves.toBe(false);
  });

  it("probes a name the bundled roster does not know, rather than assuming no art", async () => {
    // This used to short-circuit: a champion missing from CHAMPION_NAMES
    // was treated as having no art, without asking. That assumption is
    // exactly what left champions released since the last roster update
    // with a blank frame — their art exists, we just never looked. The
    // cost is a HEAD request for a genuinely bad name, which the per-URL
    // cache above collapses on repeats.
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(printArtExists("Zaheen", 1)).resolves.toBe(true);
    // HEAD, and cached: whether Riot serves a splash is fixed until they
    // publish new art, and probing it live put CDN latency between a click
    // and the cards.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ddragon.leagueoflegends.com/cdn/img/champion/centered/Zaheen_1.jpg",
      { method: "HEAD", next: { revalidate: 86_400 } },
    );
  });
});

describe("rollPrint", () => {
  // Riot's catalog lists nums whose splash was never uploaded to either
  // directory — the validator is what keeps those prints out of pulled
  // copies. The first scripted value is the ALT_SKIN_CHANCE gate
  // (< 0.3 = alternate).
  const validOnly = (valid: number[]) => async (_champion: string, num: number) => valid.includes(num);

  it("prints base when the chance gate misses — no validator call", async () => {
    const neverValid = async () => {
      throw new Error("validator must not run for base");
    };
    await expect(rollPrint("Jhin", [0, 7, 9], scripted([0.5]), neverValid)).resolves.toBe(0);
  });

  it("prints a validated alternate when the gate hits", async () => {
    // gate 0.1 -> alternate; index 0.5 over [1, 4] -> 4.
    await expect(rollPrint("Jhin", [0, 1, 4], scripted([0.1, 0.5]), validOnly([1, 4]))).resolves.toBe(4);
  });

  it("re-rolls off catalog nums whose art does not exist", async () => {
    // gate hits; first roll lands 13 (invalid, removed), second lands 4.
    await expect(rollPrint("Jhin", [0, 4, 13], scripted([0.1, 0.99, 0.99]), validOnly([4]))).resolves.toBe(4);
  });

  it("floors at base when nothing validates", async () => {
    await expect(
      rollPrint("Jhin", [3, 5, 9], scripted([0.1, 0.9, 0.9, 0.9]), validOnly([])),
    ).resolves.toBe(0);
  });

  it("prints base outright for a champion with no alternates", async () => {
    const neverValid = async () => {
      throw new Error("validator must not run");
    };
    // no rand consumed at all: scripted([]) would throw on any call
    await expect(rollPrint("Jhin", [0], scripted([]), neverValid)).resolves.toBe(0);
  });

  it("gates alternates on the caller's chance — signed copies roll rarer", async () => {
    const validOnlyAll = async () => true;
    // A roll that clears the signed gate would still clear the base gate…
    await expect(
      rollPrint("Jhin", [0, 4], scripted([SIGNED_ALT_SKIN_CHANCE - 0.001, 0]), validOnlyAll, SIGNED_ALT_SKIN_CHANCE),
    ).resolves.toBe(4);
    // …but one between the two chances prints base for a signed copy and an
    // alternate for an ordinary one.
    await expect(
      rollPrint("Jhin", [0, 4], scripted([SIGNED_ALT_SKIN_CHANCE + 0.01]), validOnlyAll, SIGNED_ALT_SKIN_CHANCE),
    ).resolves.toBe(0);
    await expect(
      rollPrint("Jhin", [0, 4], scripted([SIGNED_ALT_SKIN_CHANCE + 0.01, 0]), validOnlyAll),
    ).resolves.toBe(4);
  });

  it("answers base splash for an empty catalog", () => {
    expect(rollSkinNum([], scripted([0.5]))).toBe(0);
  });
});

describe("fetchChampionSkinNums", () => {
  it("reads Riot's skin nums, base included", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => skinPayload("Jhin", [0, 1, 2, 12]) }),
    );

    await expect(fetchChampionSkinNums("Jhin")).resolves.toEqual([0, 1, 2, 12]);
  });

  it("fetches once for a pack full of the same champion", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => skinPayload("Kaisa", [0, 3]) });
    vi.stubGlobal("fetch", fetchMock);

    // The display name and the Data Dragon id have to land on the same
    // cache entry — championByName resolves both spellings.
    await expect(fetchChampionSkinNums("Kai'Sa")).resolves.toEqual([0, 3]);
    await expect(fetchChampionSkinNums("Kaisa")).resolves.toEqual([0, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to base splash when the CDN is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));

    await expect(fetchChampionSkinNums("Ahri")).resolves.toEqual([0]);
  });

  it("falls back to base splash on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    await expect(fetchChampionSkinNums("Zed")).resolves.toEqual([0]);
  });

  it("falls back to base splash on a payload that isn't shaped like a champion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }));

    await expect(fetchChampionSkinNums("Lux")).resolves.toEqual([0]);
  });

  it("never asks the CDN about a champion it can't resolve", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchChampionSkinNums("Not A Champion")).resolves.toEqual([0]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
