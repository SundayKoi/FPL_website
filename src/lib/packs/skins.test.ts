import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchChampionSkinNums, rollPrint, rollSkinNum } from "./skins";

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

describe("rollPrint", () => {
  // Riot's catalog lists nums whose centered splash was never uploaded —
  // the validator is what keeps those prints out of pulled copies.
  const validOnly = (valid: number[]) => async (_champion: string, num: number) => valid.includes(num);

  it("returns a validated alternate print", async () => {
    await expect(rollPrint("Jhin", [0, 1, 4], scripted([0.5]), validOnly([1, 4]))).resolves.toBe(1);
  });

  it("re-rolls off catalog nums whose art does not exist", async () => {
    // First roll hits 13 (invalid, removed), second lands on 4.
    await expect(rollPrint("Jhin", [0, 4, 13], scripted([0.99, 0.99]), validOnly([4]))).resolves.toBe(4);
  });

  it("returns base without consulting the validator", async () => {
    const neverValid = async () => {
      throw new Error("validator must not run for base");
    };
    await expect(rollPrint("Jhin", [0, 7], scripted([0.1]), neverValid)).resolves.toBe(0);
  });

  it("floors at base when nothing validates", async () => {
    await expect(
      rollPrint("Jhin", [3, 5, 9], scripted([0.9, 0.9, 0.9]), validOnly([])),
    ).resolves.toBe(0);
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
