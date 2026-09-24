import { describe, expect, it } from "vitest";
import { GLOSSARY, GLOSSARY_KEYS, glossaryHits } from "./glossary";

describe("the board's glossary", () => {
  it("defines every word in two sentences at most, plain words first", () => {
    for (const key of GLOSSARY_KEYS) {
      const entry = GLOSSARY[key];
      expect(entry.label.length).toBeGreaterThan(0);
      // A sentence ends at a full stop followed by a space or the end; the
      // "$150" style figures and "e.g." never appear in these definitions.
      const sentences = entry.says.split(/\.(\s|$)/).filter((part) => part.trim().length > 1);
      expect(sentences.length, key).toBeLessThanOrEqual(2);
    }
  });

  it("spots the game words in running text", () => {
    expect(glossaryHits("The squad reached a fork")).toEqual(["fork"]);
    expect(glossaryHits("needs 20 shine and 3 map fragments")).toEqual(["shine", "fragment"]);
    expect(glossaryHits("Fog on the road")).toEqual(["weather"]);
    expect(glossaryHits("Pick three cards")).toEqual([]);
  });
});
