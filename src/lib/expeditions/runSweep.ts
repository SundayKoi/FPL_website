import "server-only";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchInventoryByIds } from "@/lib/packs/queries";
import { GOLD, postCardsWebhook } from "@/lib/packs/announce";
import { EXPEDITION_TIERS, type CardCopy, type ExpeditionTierKey } from "./config";
import { fetchFixturesSince } from "./queries";
import { openFork, type RecordedChoice } from "./routes";
import { ARCHETYPE_RULES, traitsOf } from "./archetypes";
import { STORM_HOURS, encountersFor, latestJournalLine } from "./journal";
import { fetchCompany } from "./companyReads";
import { watchWeeksOf, weatherOfRun } from "./weather";
import { sweepLeagueGoals } from "./leagueSweep";
import { siteUrl } from "@/lib/site/url";
import { DAY_MS } from "./runShared";

// The cron's half of the expedition core (runs.ts is the barrel; the
// header there says why all of this is `server-only`).

/**
 * The sweep, hit by the cron every few minutes: pings every fork that has
 * opened since the last pass, and buries every lost card whose week ran
 * out. Neither needs a client present — silence is already a choice, and
 * the grave is the RPC's — so this is only the part that talks.
 */
export async function sweepExpeditions(now = new Date()): Promise<{ pinged: number; buried: number; storms: number; errors: string[] }> {
  const service = createBettingServiceClient();
  const errors: string[] = [];
  let buried = 0;
  let pinged = 0;
  let storms = 0;

  const { data: buriedCount, error: buryError } = await service.rpc("expire_lost_cards");
  if (buryError) errors.push(`expire: ${buryError.message}`);
  else buried = Number(buriedCount ?? 0);

  // The league goal of the week (leagueSweep.ts): before the forks read,
  // which returns early on an error, and fenced so a throw there is one
  // line in `errors` rather than a sweep that stops.
  try {
    errors.push(...(await sweepLeagueGoals(service, now)).errors);
  } catch (leagueError) {
    errors.push(`league: ${leagueError instanceof Error ? leagueError.message : String(leagueError)}`);
  }

  const { data, error } = await service
    .from("expedition_runs")
    .select("id, discord_id, season, tier, squad, shine, forks, choices, started_at, resolves_at, pinged, encounters, rules, convoy, road")
    .is("claimed_at", null)
    .gt("forks", 0)
    .limit(200);
  if (error) {
    errors.push(`forks: ${error.message}`);
    return { pinged, buried, storms, errors };
  }
  const site = siteUrl();
  // The playoff weeks, for the weather each run launched under — one read
  // for the whole sweep, from a day before the oldest run in the field.
  const rows = (data as { started_at: string }[]) ?? [];
  const oldest = rows.reduce((min, row) => Math.min(min, Date.parse(row.started_at)), now.getTime());
  const watchWeeks = rows.length > 0 ? watchWeeksOf(await fetchFixturesSince(service, new Date(oldest - DAY_MS).toISOString())) : new Set<string>();
  for (const row of (data as {
    id: number;
    discord_id: string;
    season: string;
    tier: string;
    squad: number[] | null;
    shine: number;
    forks: number;
    choices: RecordedChoice[] | null;
    started_at: string;
    resolves_at: string;
    pinged: number;
    encounters: { key: string; leg: number }[] | null;
    rules: number | null;
    convoy: number | null;
    /** A campaign's handed-down road, so the ping names its places. */
    road?: string[] | null;
  }[]) ?? []) {
    const tier = row.tier as ExpeditionTierKey;
    const rules = Number(row.rules ?? 1);
    let resolvesAt = row.resolves_at;
    // A storm whose hour has come holds the squad: the run's end moves out
    // (and every fork after it), once per storm.
    const applied = new Set((row.encounters ?? []).filter((entry) => entry.key === "storm").map((entry) => entry.leg));
    const road = { id: row.id, tier, startedAt: row.started_at, resolvesAt, forks: row.forks, rules, convoy: row.convoy };
    // The weather the run launched under weights the draw (more caches in a
    // Drought, rivals and ghosts under the Watch), and so moves which leg
    // draws the storm: the sweep reads the road in the same weather the
    // journal and the claim do, or it holds a squad for a storm its journal
    // never showed. The company is not needed here: it only names a rival or
    // turns a ghost into a cache, after the draw, and never makes or takes a
    // storm.
    const weather = weatherOfRun({ startedAt: row.started_at, rules }, watchWeeks);
    const sky = weather?.key ?? null;
    const due = (list: ReturnType<typeof encountersFor>) => list.filter((entry) => entry.key === "storm" && !applied.has(entry.leg) && entry.at.getTime() <= now.getTime());
    // A squad already home is past every storm on its road: a storm the
    // sweep never applied (a pass that missed its hour) must not pull a
    // finished run back into the field. Nothing is recorded for it — the
    // only record is delay_expedition's, which always moves the clock, and
    // the card reads it as "a storm held them". Once a run is out, only that
    // delay moves resolves_at, so the run stays home and every later pass
    // skips it here, before the squad read.
    const home = now.getTime() >= Date.parse(resolvesAt);
    let coming = home ? [] : due(encountersFor(road, null, sky));
    // In the same weather, the squad's traits only ever take a storm away (a
    // Speedrunner is past it; First Blood Merchant turned its beat), so the
    // squad is read only when a storm is due on a run stamped with edges —
    // the read the ping would make anyway. Unread, the storm waits for the
    // next pass rather than hold a squad its edges would have kept moving.
    let squadRead: CardCopy[] | null = null;
    if (coming.length > 0 && rules >= ARCHETYPE_RULES) {
      squadRead = await fetchInventoryByIds(service, row.discord_id, row.squad ?? []);
      if (squadRead.length !== (row.squad ?? []).length) {
        errors.push(`storm ${row.id}: squad unread`);
        coming = [];
        squadRead = null;
      } else {
        coming = due(encountersFor(road, null, sky, traitsOf(squadRead, rules)));
      }
    }
    for (const storm of coming) {
      const { data: delayed, error: delayError } = await service.rpc("delay_expedition", { p_run: row.id, p_leg: storm.leg, p_hours: STORM_HOURS });
      if (delayError) {
        errors.push(`storm ${row.id}: ${delayError.message}`);
        continue;
      }
      const delayedRow = (Array.isArray(delayed) ? delayed[0] : delayed) as { resolves_at: string } | null;
      if (delayedRow?.resolves_at) resolvesAt = delayedRow.resolves_at;
      storms += 1;
    }
    const open = openFork(
      { startedAt: row.started_at, resolvesAt, forks: row.forks, choices: row.choices ?? [] },
      now,
    );
    if (!open || open.index < Number(row.pinged ?? 0)) continue;
    const label = EXPEDITION_TIERS[tier]?.label ?? row.tier;
    const by = open.closesAt.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
    // The ping quotes the trail: the latest journal line, so the fork
    // arrives as the next line of a story rather than a bare deadline.
    const squad = squadRead ?? (await fetchInventoryByIds(service, row.discord_id, row.squad ?? []));
    // The ping names the same company the page does.
    const company = await fetchCompany(service, row.season, {
      id: row.id,
      discordId: row.discord_id,
      tier,
      shine: Number(row.shine ?? 0),
      startedAt: row.started_at,
      resolvesAt,
      forks: row.forks,
      rules,
      convoy: row.convoy,
      squadTeams: squad.map((copy) => copy.card?.teamName ?? null).filter((team): team is string => Boolean(team)),
    });
    const line = latestJournalLine({ id: row.id, tier, startedAt: row.started_at, resolvesAt, forks: row.forks, rules, convoy: row.convoy, choices: row.choices ?? [], company, weather: sky, road: row.road ?? null }, squad, now);
    try {
      await postCardsWebhook(
        {
          title: `${label} — the squad is at a fork`,
          description: `${line ? `"${line}"\n\n` : ""}Decide by ${by} ET or the squad takes the safe way. ${site ? `${site}/cards/expeditions` : ""}`.trim(),
          color: GOLD,
        },
        `<@${row.discord_id}> your ${label} has reached a fork.`,
      );
      const { error: markError } = await service
        .from("expedition_runs")
        .update({ pinged: open.index + 1 })
        .eq("id", row.id);
      if (markError) errors.push(`ping ${row.id}: ${markError.message}`);
      else pinged += 1;
    } catch (pingError) {
      errors.push(`ping ${row.id}: ${pingError instanceof Error ? pingError.message : String(pingError)}`);
    }
  }
  return { pinged, buried, storms, errors };
}
