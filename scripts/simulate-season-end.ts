/**
 * Simulate one frozen Season's End release with the production roller.
 *
 * Read-only. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *
 *   npm run simulate:season-end -- --release=<uuid> --openings=100000
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { simulateSeasonEnd } from "../src/lib/season-end/simulator";
import { catalogHash, releaseRevisionDigest, stableJson, validateSeasonEndCatalogForLock, type SeasonEndCatalog, type SeasonEndCollectible } from "../src/lib/season-end/collectibles";
import { type SeasonEndRollRules } from "../src/lib/packs/season-end";
import { validateSeasonEndEconomy, type SeasonEndEconomyRules } from "../src/lib/season-end/release";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const releaseId = arg("release");
  const releaseQuery = client.from("season_end_releases").select("id, league, season, state, price, catalog_hash, revision_digest, rules_version, economy_version, rules_payload, economy_payload, signing_book, signature_calibration, source_completeness, withheld_awards, published_at");
  const { data: release, error: releaseError } = releaseId
    ? await releaseQuery.eq("id", releaseId).single()
    : await releaseQuery.eq("state", "public").order("published_at", { ascending: false }).limit(1).single();
  if (releaseError || !release) throw new Error(releaseError?.message ?? "No published Season's End release found");
  const rows: Array<{ design_id: string; payload: SeasonEndCollectible }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("season_end_designs").select("design_id, payload").eq("release_id", release.id).order("design_id").range(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = (data as Array<{ design_id: string; payload: SeasonEndCollectible }> | null) ?? [];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  const designs = rows.map((row) => ({ ...row.payload, designId: row.design_id }));
  const catalog: SeasonEndCatalog = {
    releaseId: String(release.id),
    league: release.league,
    season: String(release.season),
    schemaVersion: 1,
    rulesVersion: String(release.rules_version),
    designs,
    withheldAwards: Array.isArray(release.withheld_awards) ? release.withheld_awards : [],
    catalogHash: String(release.catalog_hash),
    createdAt: new Date().toISOString(),
  };
  const validation = validateSeasonEndCatalogForLock(catalog);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  if (catalogHash(designs) !== catalog.catalogHash) throw new Error("Catalog digest does not match the release");
  if (!release.revision_digest || !release.rules_payload || !release.economy_payload || !release.signature_calibration) throw new Error("The selected release has no complete frozen contract; run a compatibility audit first.");
  const rules = release.rules_payload as SeasonEndRollRules;
  const economy = release.economy_payload as SeasonEndEconomyRules;
  const economyErrors = validateSeasonEndEconomy(economy);
  if (economyErrors.length) throw new Error(economyErrors.join("; "));
  const signatures = new Map(((Array.isArray(release.signing_book) ? release.signing_book : []) as Array<{ playerKey: string; autograph: string }>).map((entry) => [entry.playerKey, entry.autograph]));
  const expectedDigest = releaseRevisionDigest({ catalog, price: Number(release.price), rules, signingBook: release.signing_book ?? [], economy, calibration: release.signature_calibration, reviewDecisions: {} });
  if (expectedDigest !== release.revision_digest) throw new Error("The selected release revision digest does not match its stored contract");
  const openings = Number(arg("openings") ?? 100_000);
  const collectorTrajectories = Number(arg("trajectories") ?? 10_000);
  if (!Number.isInteger(openings) || openings < 100_000) throw new Error("release evidence requires at least 100000 openings");
  if (!Number.isInteger(collectorTrajectories) || collectorTrajectories < 10_000) throw new Error("release evidence requires at least 10000 collector trajectories");
  const simulationOptions = { openings, seed: Number(arg("seed") ?? 0x51ea50), rules, economy, signaturesByPlayerKey: signatures, collectorTrajectories, packPrice: Number(release.price) };
  const requestedPatron = arg("patron");
  const standardReport = requestedPatron === "true" ? null : simulateSeasonEnd(catalog, { ...simulationOptions, patron: false });
  const patronReport = requestedPatron === "false" ? null : simulateSeasonEnd(catalog, { ...simulationOptions, patron: true });
  const exactOpenings: Array<{ opening_id: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: openingError } = await client.from("season_end_openings").select("opening_id").eq("release_id", release.id).eq("mode", "admin_test").eq("status", "fulfilled").eq("revision_digest", release.revision_digest).order("opening_id").range(from, from + 999);
    if (openingError) throw new Error(openingError.message);
    const batch = (data as Array<{ opening_id: string }> | null) ?? [];
    exactOpenings.push(...batch);
    if (batch.length < 1000) break;
  }
  const inputDigest = createHash("sha256").update(stableJson({ catalogHash: catalog.catalogHash, revisionDigest: release.revision_digest, rules, economy, signingBook: release.signing_book ?? [], signatureCalibration: release.signature_calibration })).digest("hex");
  const signatureCalibration = release.signature_calibration as { achievablePackProbability?: number } | null;
  const signatureTarget = Number(signatureCalibration?.achievablePackProbability ?? Number.NaN);
  const signatureTolerance = (scenario: NonNullable<typeof standardReport>) => Math.max(0.002, 4 * scenario.signatureProbabilityStandardError);
  const signatureGatePassed = Boolean(standardReport && patronReport && Number.isFinite(signatureTarget))
    && Math.abs(standardReport!.signatureProbability - signatureTarget) <= signatureTolerance(standardReport!)
    && Math.abs(patronReport!.signatureProbability - signatureTarget) <= signatureTolerance(patronReport!);
  const maximumPatronSalvageUpperBound = patronReport?.conservativeSalvageUpperBound ?? Number.POSITIVE_INFINITY;
  const evidence = {
    reportVersion: "season-end-verification-v1",
    revisionDigest: String(release.revision_digest),
    catalogHash: catalog.catalogHash,
    inputDigest,
    sampleSizes: { openings: simulationOptions.openings, collectorTrajectories: simulationOptions.collectorTrajectories },
    scenarios: { standard: standardReport, maximumPatron: patronReport },
    acceptance: { status: signatureGatePassed && maximumPatronSalvageUpperBound <= Number(release.price) * 0.5 && exactOpenings.length > 0 ? "passed" : "failed", signatureGatePassed, salvageGatePassed: maximumPatronSalvageUpperBound <= Number(release.price) * 0.5, maximumPatronSalvageUpperBound, exactRevisionOpeningCount: exactOpenings.length },
  };
  const reportDigest = createHash("sha256").update(stableJson(evidence)).digest("hex");
  const result = {
    reportDigest,
    evidence,
    release: {
      id: release.id,
      league: release.league,
      season: release.season,
      revisionDigest: String(release.revision_digest ?? ""),
      rulesVersion: String(release.rules_version ?? ""),
      economyVersion: String(release.economy_version ?? economy.version),
    },
    inputs: {
      catalogHash: catalog.catalogHash,
      signatureCalibration: release.signature_calibration ?? null,
      sourceCompleteness: release.source_completeness ?? null,
    },
  };
  const output = JSON.stringify(result, null, 2);
  const out = arg("out");
  if (out) {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${output}\n`, "utf8");
    const markdownPath = extname(out).toLowerCase() === ".json" ? `${out.slice(0, -5)}.md` : `${out}.md`;
    const readableReport = standardReport ?? patronReport;
    const patronReadableReport = patronReport;
    const completionRows = readableReport?.completion.map((entry) => `| ${entry.packs} | ${entry.trajectories.toLocaleString()} | ${entry.meanCompleted.toFixed(2)} | ${entry.p10Completed} | ${entry.medianCompleted} | ${entry.p90Completed} |`).join("\n") ?? "No complete scenario was requested.";
    const supplyRows = readableReport?.supply.map((entry) => `| ${entry.openings.toLocaleString()} | ${entry.family.season.toFixed(1)} | ${entry.family.accolade.toFixed(1)} | ${entry.family.best_of.toFixed(1)} |`).join("\n") ?? "No complete scenario was requested.";
    const scenarioSummary = [standardReport, patronReadableReport].filter((scenario): scenario is NonNullable<typeof standardReport> => Boolean(scenario)).map((scenario) => `- ${scenario.patron ? "Maximum patron" : "Standard"}: signature ${(scenario.signatureProbability * 100).toFixed(3)}% ± ${(scenario.signatureProbabilityStandardError * 100).toFixed(3)} pp; expected dust ${scenario.expectedDust.toFixed(2)}; conservative upper bound ${scenario.conservativeSalvageUpperBound.toFixed(2)}`).join("\n") || "- Diagnostic single-scenario run; not eligible for approval.";
    const markdown = `# Season's End simulation\n\n- Release: \`${release.id}\`\n- League/season: **${release.league} ${release.season}**\n- Revision digest: \`${result.release.revisionDigest || "missing"}\`\n- Catalog digest: \`${catalog.catalogHash}\`\n- Evidence digest: \`${result.reportDigest}\`\n- Simulator: \`${readableReport?.simulatorVersion ?? "missing"}\`\n- Seed: \`${readableReport?.seed ?? "missing"}\`\n- Openings: ${readableReport?.openings?.toLocaleString() ?? "missing"}\n- Economy: \`${readableReport?.economyVersion ?? "missing"}\`\n\n## Scenarios\n\n${scenarioSummary}\n\n## Collector completion\n\n| Packs | Trajectories | Mean designs | P10 | Median | P90 |\n| ---: | ---: | ---: | ---: | ---: | ---: |\n${completionRows}\n\n## Estimated supply\n\n| Openings | Season | Accolade | Best Of |\n| ---: | ---: | ---: | ---: |\n${supplyRows}\n\nThe JSON file beside this report contains the complete machine-readable evidence envelope, including both required scenarios when this run is eligible for approval.\n`;
    await writeFile(markdownPath, markdown, "utf8");
  }
  console.log(output);
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
