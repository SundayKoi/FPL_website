import { describe, expect, it } from "vitest";
import { activeBrief, cleanBrief, stripAiTells, type HomepageBrief } from "./brief";

const brief = (over: Partial<HomepageBrief>): HomepageBrief => ({
  id: "b", season: "S5", week: 1, recap: null, preview: null, players_note: null,
  teams_note: null, league_notes: null, model: "claude-sonnet-5", published: true,
  generated_at: "2026-09-01T00:00:00Z", ...over,
});

describe("activeBrief", () => {
  it("picks the newest published brief", () => {
    const chosen = activeBrief([
      brief({ id: "old", generated_at: "2026-09-01T00:00:00Z" }),
      brief({ id: "new", generated_at: "2026-09-08T00:00:00Z" }),
    ]);
    expect(chosen?.id).toBe("new");
  });

  it("falls back to the previous week when the newest is unpublished", () => {
    const chosen = activeBrief([
      brief({ id: "old", generated_at: "2026-09-01T00:00:00Z" }),
      brief({ id: "pulled", generated_at: "2026-09-08T00:00:00Z", published: false }),
    ]);
    expect(chosen?.id).toBe("old");
  });

  it("returns null when nothing is published", () => {
    expect(activeBrief([brief({ published: false })])).toBeNull();
    expect(activeBrief([])).toBeNull();
  });
});

describe("stripAiTells", () => {
  it("removes em and en dashes entirely", () => {
    const out = stripAiTells("Alpha won — barely — after a long game.");
    expect(out).not.toMatch(/[—–]/);
    expect(out).toBe("Alpha won, barely, after a long game.");
  });

  it("keeps scorelines readable as ranges", () => {
    expect(stripAiTells("They took it 2—0 in under 30 minutes.")).toBe(
      "They took it 2-0 in under 30 minutes."
    );
  });

  it("turns a dash inside a word into a hyphen", () => {
    expect(stripAiTells("They are a well—drilled roster.")).toBe(
      "They are a well-drilled roster."
    );
  });

  it("capitalises a sentence that a replacement left lowercase", () => {
    expect(stripAiTells("Alpha held on. When it comes to teamfights, they are best.")).toBe(
      "Alpha held on. For teamfights, they are best."
    );
  });

  it("rewrites the stock phrases", () => {
    expect(stripAiTells("When it comes to vision, they lead.")).toMatch(/^For vision/);
    expect(stripAiTells("A testament to their depth.")).toBe("Proof of their depth.");
    expect(stripAiTells("The roster boasts three carries.")).toBe(
      "The roster has three carries."
    );
  });

  it("drops filler openers without leaving stray punctuation", () => {
    expect(stripAiTells("It's worth noting that Bravo are unbeaten.")).toBe(
      "Bravo are unbeaten."
    );
  });

  it("leaves clean esports copy untouched", () => {
    const clean = "Bravo swept Delta 2-0 and moved top of Solari.";
    expect(stripAiTells(clean)).toBe(clean);
  });
});

describe("cleanBrief", () => {
  it("cleans every string section and leaves other fields alone", () => {
    const out = cleanBrief({
      recap: "Alpha won — just.",
      preview: "Bravo boasts form.",
      week: 3,
      published: true,
    });

    expect(out.recap).toBe("Alpha won, just.");
    expect(out.preview).toBe("Bravo has form.");
    expect(out.week).toBe(3);
    expect(out.published).toBe(true);
  });
});
