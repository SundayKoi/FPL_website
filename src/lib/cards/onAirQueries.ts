// The two reads the On Air roll cannot do in pure code: who the casters
// are right now, and how many prints each of them already has this season.
//
// Server-side, and framework-free apart from that: both take the client, so
// the pack roller can pass its service client and the admin desk its
// cookie-bound one. Neither writes, and neither is the cap — the partial
// unique index in 20261020000001 is. A count read a moment before a mint is
// a courtesy that keeps the common case off the error path.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OnAirCaster } from "./onAir";

/** `on_air_casters` defaults, which is exactly what a broadcaster who has
 *  never opened the desk prints as. Kept here rather than in the column
 *  defaults' shadow so the no-row case and the row case agree in one place. */
const DEFAULT_ROLE_LABEL = "Caster";

interface BroadcasterRow {
  id: string;
  display_name: string | null;
}

interface CasterSettingsRow {
  profile_id: string;
  champion: string | null;
  skin: number | null;
  role_label: string | null;
  tagline: string | null;
  active: boolean | null;
}

/** One broadcaster as the admin desk sees them: their card's settings, and
 *  whether they are switched on. `hasRow` is what tells the desk apart a
 *  caster who chose the defaults from one who has never opened the page. */
export interface OnAirDeskRow {
  caster: OnAirCaster;
  active: boolean;
  hasRow: boolean;
}

/**
 * Every profile an owner has marked `is_broadcaster`, with its settings row
 * where it has one — switched off ones included, because the desk is where
 * they get switched back on.
 *
 * Two queries rather than a join, because a broadcaster with NO row is in
 * the pool with the defaults — an outer join in PostgREST would have to be
 * read the same way anyway, and this keeps "no row means in, with defaults"
 * a single visible line.
 *
 * Fails soft, both times: an environment without the migration applied
 * yields an empty desk, and the pack opens with no On Air roll rather than
 * erroring out of a mint that has already been charged for.
 */
export async function fetchOnAirDesk(client: SupabaseClient): Promise<OnAirDeskRow[]> {
  const { data: profiles, error } = await client
    .from("profiles")
    .select("id, display_name")
    .eq("is_broadcaster", true)
    .order("display_name");
  if (error) return [];
  const broadcasters = ((profiles as BroadcasterRow[]) ?? []).filter((row) => Boolean(row.display_name));
  if (broadcasters.length === 0) return [];

  const { data: settings } = await client
    .from("on_air_casters")
    .select("profile_id, champion, skin, role_label, tagline, active");
  const byProfile = new Map(
    ((settings as CasterSettingsRow[]) ?? []).map((row) => [row.profile_id, row] as const),
  );

  return broadcasters.map((row) => {
    const settingsRow = byProfile.get(row.id);
    return {
      caster: {
        profileId: row.id,
        name: row.display_name as string,
        champion: settingsRow?.champion?.trim() || null,
        skin: settingsRow?.skin ?? 0,
        roleLabel: settingsRow?.role_label?.trim() || DEFAULT_ROLE_LABEL,
        tagline: settingsRow?.tagline?.trim() || null,
      },
      active: settingsRow?.active !== false,
      hasRow: Boolean(settingsRow),
    };
  });
}

/** The pool the roller draws from: the desk, minus anyone switched off. */
export async function fetchOnAirCasters(client: SupabaseClient): Promise<OnAirCaster[]> {
  return (await fetchOnAirDesk(client)).filter((row) => row.active).map((row) => row.caster);
}

/**
 * How many copies each caster has printed this SEASON — the tally the next
 * copy's number comes off, and the one the cap is counted against. Keyed by
 * profiles.id; a caster with no copies is simply absent.
 *
 * One select of the stamped profile id, tallied in TS: at twenty-five a
 * caster this is tens of rows, and counting them here keeps the query the
 * same shape as the count the roller already runs for the Dribb.
 */
export async function countOnAirThisSeason(
  client: SupabaseClient,
  season: string,
): Promise<Record<string, number>> {
  const { data, error } = await client
    .from("card_inventory")
    .select("profileId:card->onAir->>profileId")
    .eq("season", season)
    .not("card->onAir", "is", null);
  if (error) return {};
  const found: Record<string, number> = {};
  for (const row of ((data as { profileId: string | null }[]) ?? [])) {
    if (!row.profileId) continue;
    found[row.profileId] = (found[row.profileId] ?? 0) + 1;
  }
  return found;
}
