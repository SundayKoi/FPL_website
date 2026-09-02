// The render is satori's to rasterize, so these tests read the element tree
// rather than pixels: which strings print, which images are asked for, and
// — the one that has actually bitten — that no style value came out
// "undefined", which is how a missing tier colour reaches satori as
// `6px solid undefined` and fails the whole picture instead of one border.

import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { renderCardImage } from "./cardImage";
import { ECLIPSE_GOLD, TIER_COLORS } from "./treatment";
import { FOIL_TYPE_LABELS } from "@/lib/packs/config";
import type { PlayerCardData } from "@/lib/cards/build";

const INK = "data:image/png;base64,aGVsbG8=";

function playerCard(overrides: Partial<PlayerCardData> = {}): PlayerCardData {
  return {
    slug: "doug-na1",
    name: "Doug",
    tag: "NA1",
    teamName: "The Faceless",
    teamImageUrl: null,
    role: "Mid",
    overall: 87,
    tier: { key: "gold", label: "Gold" },
    archetype: "Carry",
    signature: { champion: "Ahri", games: 12 },
    artSkin: 0,
    motto: null,
    serial: 3,
    collectionSize: 40,
    topChampions: [],
    form: [],
    subStats: [
      { key: "damage", label: "Damage", value: 71 },
      { key: "objectives", label: "Objectives", value: 44 },
    ],
    highlights: [],
    badges: [],
    standout: false,
    wins: 12,
    losses: 3,
    winratePct: 80,
    level: 15,
    pentas: 0,
    season: "2026",
    ...overrides,
  } as PlayerCardData;
}

/** Every string and number that prints, flattened. */
function texts(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) texts(child, out);
    return out;
  }
  const element = node as ReactElement<{ children?: unknown }>;
  if (element.props) texts(element.props.children, out);
  return out;
}

/** Every element in the tree, so images and styles can be inspected. */
function nodes(node: unknown, out: ReactElement<Record<string, unknown>>[] = []) {
  if (Array.isArray(node)) {
    for (const child of node) nodes(child, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const element = node as ReactElement<{ children?: unknown }>;
  out.push(element as ReactElement<Record<string, unknown>>);
  if (element.props) nodes(element.props.children, out);
  return out;
}

function styleValues(tree: unknown): string[] {
  return nodes(tree)
    .flatMap((element) => Object.values((element.props.style ?? {}) as Record<string, unknown>))
    .map((value) => String(value));
}

function imageSources(tree: unknown): string[] {
  return nodes(tree)
    .filter((element) => element.type === "img")
    .map((element) => String(element.props.src));
}

const plainInput = {
  foil: false,
  foilType: null,
  signed: false,
  autograph: null,
  splash: "https://cdn.example/ahri.jpg",
};

describe("renderCardImage", () => {
  it("prints the card the share image has always printed", () => {
    const printed = texts(renderCardImage({ card: playerCard(), ...plainInput })).join(" | ");

    expect(printed).toContain("Doug");
    expect(printed).toContain("Gold");
    expect(printed).toContain("Carry");
    expect(printed).toContain("FPL Player Card · Season 2026");
    expect(printed).toContain("Damage");
    expect(printed).toContain("Signature:");
    expect(printed).toContain("Ahri");
    // The win-loss footer, whose pieces are separate text children.
    expect(printed).toContain("12");
    expect(printed).toContain("80");
  });

  it("wears no copy cosmetics when nobody owns it", () => {
    const printed = texts(renderCardImage({ card: playerCard(), ...plainInput })).join(" | ");
    expect(printed).not.toContain("SIGNED");
    expect(printed).not.toContain("1 OF 1");
    for (const label of Object.values(FOIL_TYPE_LABELS)) expect(printed).not.toContain(label);
    expect(imageSources(renderCardImage({ card: playerCard(), ...plainInput }))).toEqual([
      "https://cdn.example/ahri.jpg",
    ]);
  });

  it("lets a copy say which edition it came out of", () => {
    const printed = texts(
      renderCardImage({ card: playerCard(), ...plainInput, label: "WK Aug 24 edition" }),
    ).join(" | ");
    expect(printed).toContain("WK Aug 24 edition · Season 2026");
    expect(printed).not.toContain("FPL Player Card");
  });

  it("names the parallel a copy printed", () => {
    const printed = texts(
      renderCardImage({ card: playerCard(), ...plainInput, foil: true, foilType: "ice" }),
    ).join(" | ");
    expect(printed).toContain(FOIL_TYPE_LABELS.ice);
  });

  it("gives an Eclipse its hallmark and its gold frame", () => {
    const tree = renderCardImage({ card: playerCard(), ...plainInput, foil: true, foilType: "eclipse" });
    expect(texts(tree).join(" | ")).toContain("1 OF 1");
    expect(styleValues(tree)).toContain(`6px solid ${ECLIPSE_GOLD}`);
    // Not the tier frame it would otherwise wear.
    expect(styleValues(tree)).not.toContain(`6px solid ${TIER_COLORS.gold}`);
  });

  it("prints the ribbon and the ink on a signed copy", () => {
    const tree = renderCardImage({
      card: playerCard({ autograph: INK }),
      ...plainInput,
      signed: true,
      autograph: INK,
    });
    expect(texts(tree).join(" | ")).toContain("SIGNED");
    expect(imageSources(tree)).toContain(INK);
  });

  it("keeps a junk autograph away from satori", () => {
    // satori fetches an <img src> itself, so a url that is not the ink
    // would fail the whole render rather than just the signature.
    const tree = renderCardImage({
      card: playerCard(),
      ...plainInput,
      signed: true,
      autograph: "https://evil.example/slow.png",
    });
    expect(imageSources(tree)).not.toContain("https://evil.example/slow.png");
    // The copy is still a signed copy and still says so.
    expect(texts(tree).join(" | ")).toContain("SIGNED");
  });

  it("renders a pulled moment without inventing a rating for it", () => {
    const card = playerCard({
      moment: {
        id: 9,
        title: "Baron Steal",
        headline: "Stole Baron at 31:04 to flip the series",
        summonerName: "Doug",
        champion: "Ahri",
        teamName: "The Faceless",
        weekStart: "2026-08-24",
        playerSlug: "doug-na1",
      },
      overall: 0,
      tier: { key: "gold", label: "Moment" },
      subStats: [],
      wins: 0,
      losses: 0,
      winratePct: 0,
      level: 0,
      signature: null,
    });
    const printed = texts(renderCardImage({ card, ...plainInput, splash: null })).join(" | ");

    expect(printed).toContain("Stole Baron at 31:04 to flip the series");
    expect(printed).toContain("Baron Steal");
    // No OVR ring and no win-loss line: a moment never had either.
    expect(printed).not.toContain("OVR");
    expect(printed).not.toContain("WR");
  });

  it("renders a roster plate whose tier is not a rating tier at all", () => {
    const card = playerCard({
      team: {
        teamName: "The Faceless",
        imageUrl: null,
        monogram: "FLS",
        abbr: "FLS",
        bannerColor: "#123456",
        overall: 82,
        tierKey: "team",
        tierLabel: "Roster",
        slots: [
          { role: "Top", name: "Ash", slug: "ash-na1", overall: 80, champion: "Ornn", standout: false, autograph: null },
          { role: "Mid", name: "Doug", slug: "doug-na1", overall: 87, champion: "Ahri", standout: true, autograph: null },
        ],
        weekStart: "2026-08-24",
      },
      tier: { key: "team", label: "Roster" },
      subStats: [],
      signature: null,
    } as unknown as Partial<PlayerCardData>);
    const tree = renderCardImage({ card, ...plainInput, splash: null });
    const printed = texts(tree).join(" | ");

    expect(printed).toContain("Ash");
    expect(printed).toContain("Doug");
    expect(printed).toContain("The Faceless");
    // The bug this guards: "team" is not in TIER_COLORS, and reading it
    // straight paints `6px solid undefined`.
    for (const value of styleValues(tree)) expect(value).not.toContain("undefined");
  });
});
