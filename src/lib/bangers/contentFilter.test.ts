import { describe, expect, it } from "vitest";
import { sanitizeTweetText } from "./contentFilter";

describe("tweet content filter", () => {
  it("masks configured slurs while preserving the rest of the tweet", () => {
    expect(sanitizeTweetText("A nigger and a normal word")).toBe("A ****** and a normal word");
  });

  it("does not alter ordinary words that only contain a blocked term", () => {
    expect(sanitizeTweetText("The fagot bird is loud")).toBe("The fagot bird is loud");
  });
});
