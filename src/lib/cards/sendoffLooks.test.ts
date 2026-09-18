import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SENDOFF_STAGES, type SendoffMark, type SendoffStage } from "./sendoff";
import { SENDOFF_LOOKS, sendoffLookChip, sendoffLookOverlay, type SendoffLook } from "./sendoffLooks";

const mark = (stage: SendoffStage, overrides: Partial<SendoffMark> = {}): SendoffMark => ({
  stage,
  exit: stage === "gauntlet" ? "gauntlet_r2" : stage === "champion" || stage === "finalist" ? "finals" : "semifinals",
  team: "Mocha",
  series: stage === "champion" ? "3–1" : "1–3",
  week: "2026-09-14",
  ...overrides,
});

/** Every class name a look can put on the card, one per entry — a `front`
 *  entry may carry more than one (the look's layer plus the stage's word
 *  and rung), because they all land on the same div. */
function classesOf(look: SendoffLook): string[] {
  const entries = [
    ...look.front,
    ...(look.back ?? []),
    ...(look.artEcho ? [look.artEcho] : []),
    ...SENDOFF_STAGES.flatMap((stage) => {
      const byStage = look.byStage?.[stage];
      return [...(byStage?.front ?? []), ...(byStage?.artEcho ? [byStage.artEcho] : [])];
    }),
  ];
  return entries.flatMap((entry) => entry.split(/\s+/).filter(Boolean));
}

/** The five that are still mockups — everything about a layer stack is
 *  asked of these. The shipped look has no layers by design. */
const MOCKUPS = SENDOFF_LOOKS.filter((look) => !look.shipped);

describe("the send-off looks", () => {
  it("are six distinct looks, each with something to draw and something to say", () => {
    expect(SENDOFF_LOOKS).toHaveLength(6);
    expect(new Set(SENDOFF_LOOKS.map((look) => look.key)).size).toBe(SENDOFF_LOOKS.length);
    for (const look of SENDOFF_LOOKS) {
      expect(look.blurb.length, look.key).toBeGreaterThan(40);
      expect(look.feel.length, look.key).toBeGreaterThan(20);
      expect(look.ladder.length, look.key).toBeGreaterThan(20);
      expect(look.accent, look.key).toMatch(/^#[0-9a-f]{6}$/i);
    }
    for (const look of MOCKUPS) {
      // A look with neither a layer nor an echo draws nothing at all, which
      // on a mockup page reads as a working design that is simply subtle.
      expect(look.front.length > 0 || Boolean(look.artEcho), look.key).toBe(true);
    }
  });

  it("ships exactly one look, and that one draws nothing here", () => {
    // Newsprint won. PlayerCard3D draws it off `card.sendoff` now, so its
    // entry keeps the words and hands over the layers: an overlay left on it
    // would print a second masthead over the card's own.
    const shipped = SENDOFF_LOOKS.filter((look) => look.shipped);
    expect(shipped.map((look) => look.key)).toEqual(["newsprint"]);
    const newsprint = shipped[0];
    expect(newsprint.front).toEqual([]);
    expect(newsprint.artEcho).toBeUndefined();
    expect(newsprint.byStage).toBeUndefined();
    expect(newsprint.back).toBeUndefined();
    expect(newsprint.blurb).toMatch(/SHIPPED/);
    for (const stage of SENDOFF_STAGES) {
      expect(sendoffLookOverlay(newsprint, mark(stage)).front, stage).toEqual([]);
    }
  });

  it("draws the shipped treatment out of globals.css, not out of a layer stack", () => {
    // The renderer names these utilities verbatim (PlayerCard3D), and
    // Tailwind only emits a utility it can read verbatim in source. One
    // missing here is a masthead, a stamp or a stub that renders as nothing.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const cls of [
      "card-sendoff-paper",
      "card-sendoff-screen",
      "card-sendoff-ink",
      "card-sendoff-ink-colour",
      "card-sendoff-masthead",
      "card-sendoff-masthead-title",
      "card-sendoff-masthead-sub",
      "card-sendoff-foil",
      "card-sendoff-serial",
      "card-sendoff-stamp",
      "card-sendoff-stub",
      "card-sendoff-stub-line",
      "card-sendoff-admit",
      "card-sendoff-facts",
    ]) {
      expect(css.includes(`@utility ${cls} {`), cls).toBe(true);
    }
    // ...and the mockup it was built from is gone, so nothing draws it twice.
    expect(css).not.toContain("card-ov-so-newsprint");
  });

  it("draws every one of the five stages in every look that is still a mockup", () => {
    for (const look of MOCKUPS) {
      for (const stage of SENDOFF_STAGES) {
        const overlay = sendoffLookOverlay(look, mark(stage));
        expect(overlay.front.length, `${look.key}/${stage}`).toBeGreaterThan(0);
        expect(overlay.accent, `${look.key}/${stage}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(overlay.chip, `${look.key}/${stage}`).toBeTruthy();
      }
    }
  });

  it("names nothing outside its own card-ov-so- namespace", () => {
    // The looks share globals.css with the foil ladder, the mutations and
    // the other overlay proposals. A layer that reached into one of those
    // would look right here and change something that ships.
    for (const look of SENDOFF_LOOKS) {
      for (const cls of classesOf(look)) {
        expect(cls.startsWith("card-ov-so-"), `${look.key}: ${cls}`).toBe(true);
      }
    }
  });

  it("only names CSS layers that globals.css actually defines", () => {
    // A layer class with no utility behind it renders as nothing, and a
    // mockup page that shows nothing looks like a finished design that is
    // simply restrained. Every class named here has to exist. Tailwind only
    // emits a utility it can read verbatim in source, so the class must
    // also be spelled out in full in sendoffLooks.ts — which is what
    // reading the data (rather than building names) checks here.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const look of SENDOFF_LOOKS) {
      for (const cls of classesOf(look)) {
        const defined =
          css.includes(`@utility ${cls} `) || css.includes(`@utility ${cls}\n`) || css.includes(`@utility ${cls}{`);
        expect(defined, `${look.key}: ${cls}`).toBe(true);
      }
    }
  });

  it("puts anything that animates in the reduced-motion list", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const block = css.slice(css.indexOf("── The Send-off looks."), css.indexOf("── God Pack ceremony"));
    expect(block.length).toBeGreaterThan(1000);
    const animated = [...block.matchAll(/@utility (card-ov-so-[a-z-]+) \{([^@]*)/g)]
      .filter(([, , body]) => body.includes("animation:") && !body.includes("animation: none"))
      .map(([, name]) => name);
    const reduced = block.slice(block.indexOf("prefers-reduced-motion"));
    for (const name of animated) expect(reduced, name).toContain(`.${name}`);
  });

  it("gives the Champion a different card from the Finalist in every look", () => {
    for (const look of MOCKUPS) {
      const finalist = sendoffLookOverlay(look, mark("finalist"));
      const champion = sendoffLookOverlay(look, mark("champion"));
      expect(JSON.stringify(champion), look.key).not.toBe(JSON.stringify(finalist));
      // ...and not only because the chip says a different word.
      expect(
        JSON.stringify({ ...champion, chip: "" }),
        look.key,
      ).not.toBe(JSON.stringify({ ...finalist, chip: "" }));
    }
  });

  it("keeps the base layers and adds the stage's on top", () => {
    const look = MOCKUPS[0];
    const overlay = sendoffLookOverlay(look, mark("champion"));
    expect(overlay.front.slice(0, look.front.length)).toEqual(look.front);
    expect(overlay.front.length).toBeGreaterThan(look.front.length);
  });

  it("writes the chip as the stamp, the series and the round", () => {
    expect(sendoffLookChip(mark("champion"))).toBe("CHAMPION · 3–1 · FINALS");
    expect(sendoffLookChip(mark("semifinalist"))).toBe("SEMIFINALIST · 1–3 · SEMIFINALS");
    expect(sendoffLookChip(mark("gauntlet"))).toBe("GAUNTLET · 1–3 · GAUNTLET");
    // A fixture with no scores carries no series, and the chip says so
    // rather than inventing one.
    expect(sendoffLookChip(mark("finalist", { series: null }))).toBe("FINALIST · — · FINALS");
  });
});
