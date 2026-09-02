/**
 * Simulate packs against a real edition and compare with what was pulled.
 *
 * When people say "everyone is hitting rare things back to back", this is
 * the answer in numbers rather than in reassurance. It does three things:
 *
 *   1. Loads a real edition's cards (the newest, or --week=YYYY-MM-DD) and
 *      rolls N packs through the SAME code the shop runs — rollPack, the
 *      autograph pass, the Eclipse gate — with the same CSPRNG. This gives
 *      the EXPECTED rates for that league's actual shape, including how
 *      often a Card of the Week turns up (which is what the Eclipse odds
 *      ride on, and which depends on how many cards share its class).
 *   2. Reads every copy in card_inventory for the season and counts what
 *      ACTUALLY came out: foils, each parallel, signed, crowned pulls,
 *      Eclipses, and the longest streak of foils in a row by pull order.
 *   3. Prints the two side by side, with how many pulls the observed number
 *      rests on, so a gap can be read as noise or as a bug.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Read-only.
 *
 *   npm run simulate:packs -- [--league=premier|academy] [--week=YYYY-MM-DD] [--packs=100000]
 */

import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCardData } from "../src/lib/cards/build";
import { fetchCardEditionWeeks, fetchCardSeason, fetchEditionCards, type CardLeague } from "../src/lib/cards/queries";
import {
  ECLIPSE_CHANCE,
  ECLIPSE_FOIL_TYPE,
  FOIL_CHANCE,
  FOIL_TYPES,
  PACK_SIZE,
  RARITY_ORDER,
  rarityOf,
  SIGNED_CHANCE,
} from "../src/lib/packs/config";
import { rollEclipseCandidates } from "../src/lib/packs/eclipse";
import { rollPack } from "../src/lib/packs/rng";
import { applyAutographs } from "../src/lib/packs/signatures";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const pct = (n: number, d: number) => (d === 0 ? "—" : `${((100 * n) / d).toFixed(3)}%`);
const oneIn = (n: number, d: number) => (n === 0 ? "—" : `1 in ${Math.round(d / n).toLocaleString()}`);

interface PullRow {
  id: number;
  discord_id: string;
  slug: string;
  foil: boolean;
  foil_type: string | null;
  signed: boolean | null;
  edition_week: string;
  pack_open_id: number | null;
  acquired_at: string;
  standout: string | null;
}

interface Observed {
  copies: number;
  foil: number;
  byType: Record<string, number>;
  signed: number;
  crowned: number;
  eclipse: number;
  longestFoilRun: number;
  byWeek: Map<string, { copies: number; crowned: number; eclipse: number }>;
  /** Per player: every copy, and how many of them came out signed. */
  bySlug: Map<string, { copies: number; signed: number; eclipses: number }>;
  /** Every signed copy and every Eclipse, in pull order. */
  signedRows: PullRow[];
  eclipseRows: PullRow[];
  /** (pack open, slug) pairs that minted the same print signed twice —
   *  the one thing here that would be a bug rather than luck. */
  duplicateSigned: { packOpenId: number; slug: string; copies: number }[];
}

/** Every copy in the season, paged on id so PostgREST's 1000-row cap
 *  cannot quietly truncate the count. */
async function observe(supabase: SupabaseClient, season: string): Promise<Observed> {
  const out: Observed = {
    copies: 0,
    foil: 0,
    byType: {},
    signed: 0,
    crowned: 0,
    eclipse: 0,
    longestFoilRun: 0,
    byWeek: new Map(),
    bySlug: new Map(),
    signedRows: [],
    eclipseRows: [],
    duplicateSigned: [],
  };
  const signedPerPack = new Map<string, number>();
  let after = 0;
  let run = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("card_inventory")
      .select("id, discord_id, slug, foil, foil_type, signed, edition_week, pack_open_id, acquired_at, card->>standout")
      .eq("season", season)
      .gt("id", after)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) throw error;
    const rows = (data ?? []) as PullRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      out.copies += 1;
      const per = out.bySlug.get(row.slug) ?? { copies: 0, signed: 0, eclipses: 0 };
      per.copies += 1;
      if (row.signed) {
        per.signed += 1;
        out.signedRows.push(row);
        if (row.pack_open_id !== null) {
          const key = `${row.pack_open_id}:${row.slug}`;
          signedPerPack.set(key, (signedPerPack.get(key) ?? 0) + 1);
        }
      }
      if (row.foil_type === ECLIPSE_FOIL_TYPE) {
        per.eclipses += 1;
        out.eclipseRows.push(row);
      }
      out.bySlug.set(row.slug, per);
      if (row.foil) {
        out.foil += 1;
        run += 1;
        out.longestFoilRun = Math.max(out.longestFoilRun, run);
      } else run = 0;
      if (row.foil_type) out.byType[row.foil_type] = (out.byType[row.foil_type] ?? 0) + 1;
      if (row.signed) out.signed += 1;
      const crowned = row.standout === "true";
      if (crowned) out.crowned += 1;
      const eclipse = row.foil_type === ECLIPSE_FOIL_TYPE;
      if (eclipse) out.eclipse += 1;
      const week = out.byWeek.get(row.edition_week) ?? { copies: 0, crowned: 0, eclipse: 0 };
      week.copies += 1;
      if (crowned) week.crowned += 1;
      if (eclipse) week.eclipse += 1;
      out.byWeek.set(row.edition_week, week);
    }
    after = rows[rows.length - 1].id;
  }
  for (const [key, copies] of signedPerPack) {
    if (copies > 1) {
      const [packOpenId, slug] = key.split(":");
      out.duplicateSigned.push({ packOpenId: Number(packOpenId), slug, copies });
    }
  }
  const byTime = (a: PullRow, b: PullRow) => a.acquired_at.localeCompare(b.acquired_at) || a.id - b.id;
  out.signedRows.sort(byTime);
  out.eclipseRows.sort(byTime);
  return out;
}

/** "3m 12s" between two pulls, or "—" for the first. */
function gap(prev: PullRow | undefined, row: PullRow): string {
  if (!prev) return "—";
  const seconds = Math.round((new Date(row.acquired_at).getTime() - new Date(prev.acquired_at).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/** A Discord id shortened for a log nobody should be able to read back. */
const who = (id: string) => `…${id.slice(-4)}`;

async function main() {
  const league = (arg("league") ?? "premier") as CardLeague;
  const packs = Number(arg("packs") ?? 100_000);
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const season = await fetchCardSeason(supabase, league);
  if (!season) throw new Error(`No season configured for ${league}`);
  const weeks = await fetchCardEditionWeeks(supabase, season);
  const week = arg("week") ?? weeks[0];
  if (!week) throw new Error("No archived edition to simulate");
  const cards: PlayerCardData[] = await fetchEditionCards(supabase, season, week);
  if (cards.length === 0) throw new Error(`No cards archived for ${week}`);

  // Which players have ink on file — the autograph pass only rolls for them.
  const { data: prefs } = await supabase.from("card_art_prefs").select("summoner_name, tag, signature").eq("season", season);
  const inked = new Set(
    ((prefs ?? []) as { summoner_name: string; tag: string; signature: string | null }[])
      .filter((row) => row.signature)
      .map((row) => `${row.summoner_name}#${row.tag}`.toLowerCase()),
  );
  const signatures = new Map(cards.filter((c) => inked.has(`${c.name}#${c.tag}`.toLowerCase())).map((c) => [c.slug, "ink"]));

  // ── The league's shape ──────────────────────────────────────────────
  console.log(`\n${league} · season ${season} · edition ${week} · ${cards.length} cards`);
  for (const rarity of RARITY_ORDER) {
    const inClass = cards.filter((c) => rarityOf(c.tier.key) === rarity);
    const crowned = inClass.filter((c) => c.standout).length;
    console.log(`  ${rarity.padEnd(9)} ${String(inClass.length).padStart(3)} cards${crowned ? ` · ${crowned} Card${crowned === 1 ? "" : "s"} of the Week` : ""}`);
  }
  console.log(`  ${signatures.size} of ${cards.length} players have a signature on file`);

  // ── Expected: roll it ───────────────────────────────────────────────
  const rand = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
  let slots = 0;
  let foil = 0;
  const byType: Record<string, number> = {};
  let signed = 0;
  let crownedPulls = 0;
  let eclipseHits = 0;
  let packsWithCrown = 0;
  const seen = new Map<string, number>();
  for (let i = 0; i < packs; i += 1) {
    const pulls = applyAutographs(rollPack(cards, rand), signatures, rand);
    slots += pulls.length;
    let crownHere = false;
    for (const pull of pulls) {
      if (pull.foil) foil += 1;
      if (pull.foilType) byType[pull.foilType] = (byType[pull.foilType] ?? 0) + 1;
      if (pull.signed) signed += 1;
      if (pull.card.standout) {
        crownedPulls += 1;
        crownHere = true;
      }
      seen.set(pull.card.slug, (seen.get(pull.card.slug) ?? 0) + 1);
    }
    if (crownHere) packsWithCrown += 1;
    eclipseHits += rollEclipseCandidates(pulls, rand).length;
  }

  console.log(`\nExpected, from ${packs.toLocaleString()} simulated packs (${slots.toLocaleString()} pulls):`);
  console.log(`  foil            ${pct(foil, slots).padStart(9)}   config ${(FOIL_CHANCE * 100).toFixed(2)}%`);
  for (const type of FOIL_TYPES) console.log(`    ${type.padEnd(12)}  ${pct(byType[type] ?? 0, slots).padStart(9)}`);
  console.log(`  signed          ${pct(signed, slots).padStart(9)}   config ${(SIGNED_CHANCE * 100).toFixed(2)}% of pulls with ink on file`);
  console.log(`  Card of the Week${pct(crownedPulls, slots).padStart(9)} of pulls · in ${pct(packsWithCrown, packs)} of packs`);
  console.log(`  Eclipse gate    ${pct(eclipseHits, slots).padStart(9)} of pulls · ${oneIn(eclipseHits, packs)} packs   (config ${(ECLIPSE_CHANCE * 100).toFixed(2)}% of Card-of-the-Week pulls)`);
  const top = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`  most-pulled: ${top.map(([slug, n]) => `${slug} ${pct(n, slots)}`).join(" · ")}`);

  // ── Observed: what actually came out ────────────────────────────────
  const obs = await observe(supabase, season);
  console.log(`\nObserved, from every copy minted this season (${obs.copies.toLocaleString()} copies, all editions):`);
  console.log(`  foil            ${pct(obs.foil, obs.copies).padStart(9)}   (signed copies always print foil, so a touch above config is right)`);
  for (const type of FOIL_TYPES) console.log(`    ${type.padEnd(12)}  ${pct(obs.byType[type] ?? 0, obs.copies).padStart(9)}`);
  console.log(`  signed          ${pct(obs.signed, obs.copies).padStart(9)}`);
  console.log(`  Card of the Week${pct(obs.crowned, obs.copies).padStart(9)} of copies`);
  console.log(`  Eclipse         ${String(obs.eclipse).padStart(9)} minted · ${pct(obs.eclipse, obs.crowned)} of crowned copies (config ${(ECLIPSE_CHANCE * 100).toFixed(2)}%) · ${oneIn(obs.eclipse, Math.round(obs.copies / PACK_SIZE))} packs`);
  console.log(`  longest run of foils in a row, by pull order: ${obs.longestFoilRun}`);
  console.log(`\n  signed copies by player (signed / all copies of that player — expect ~1% where ink is on file, 0% elsewhere):`);
  const inkedSlugs = [...obs.bySlug.entries()].filter(([, per]) => per.signed > 0).sort((a, b) => b[1].signed - a[1].signed);
  for (const [slug, per] of inkedSlugs) {
    console.log(`    ${slug.padEnd(24)} ${String(per.signed).padStart(4)} / ${String(per.copies).padStart(5)}  ${pct(per.signed, per.copies).padStart(8)}${per.eclipses ? `  · ${per.eclipses} Eclipse${per.eclipses === 1 ? "" : "s"}` : ""}`);
  }
  console.log(`\n  last ${Math.min(40, obs.signedRows.length)} signed copies in pull order (holder · card · edition · pack open · gap since the previous signed copy):`);
  const recentSigned = obs.signedRows.slice(-40);
  recentSigned.forEach((row, i) => {
    const prev = i === 0 ? obs.signedRows[obs.signedRows.length - recentSigned.length - 1] : recentSigned[i - 1];
    console.log(`    ${row.acquired_at.slice(0, 19).replace("T", " ")}  ${who(row.discord_id)}  ${row.slug.padEnd(24)} ${row.edition_week}  pack ${String(row.pack_open_id ?? "—").padStart(6)}  +${gap(prev, row)}`);
  });
  console.log(`\n  every Eclipse in pull order:`);
  obs.eclipseRows.forEach((row, i) => {
    console.log(`    ${row.acquired_at.slice(0, 19).replace("T", " ")}  ${who(row.discord_id)}  ${row.slug.padEnd(24)} ${row.edition_week}${row.signed ? "  signed" : ""}  +${gap(obs.eclipseRows[i - 1], row)}`);
  });
  console.log(
    `\n  same pack open minting the same print signed twice (must be none): ${
      obs.duplicateSigned.length === 0 ? "none" : obs.duplicateSigned.map((d) => `pack ${d.packOpenId} ${d.slug} ×${d.copies}`).join(", ")
    }`,
  );
  console.log(`\n  by edition (copies · crowned · Eclipses):`);
  for (const [w, row] of [...obs.byWeek.entries()].sort()) {
    console.log(`    ${w}  ${String(row.copies).padStart(7)}  ${String(row.crowned).padStart(5)}  ${String(row.eclipse).padStart(3)}`);
  }
  console.log(
    `\nReading it: a rate a few tenths of a percent off with fewer than ~10,000 copies is noise. The Eclipse line is the one that matters — ` +
      `it should sit near ${(ECLIPSE_CHANCE * 100).toFixed(1)}% of crowned copies, and a thin top class makes the same crowned card show up often, which is what a streak looks like.\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
