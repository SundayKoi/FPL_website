import { execFileSync } from "node:child_process";

async function main() {
  const puzzleDate = new Date().toISOString().slice(0, 10);
  const containers = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .trim()
    .split("\n");
  const database = containers.find((name) => name.startsWith("supabase_db_"));
  if (!database) throw new Error("Could not find the local Supabase database container.");

  const sql = `
delete from public.fpldle_daily_puzzles where puzzle_date = '${puzzleDate}' and league in ('premier', 'academy');
delete from public.fpldle_daily_candidates where puzzle_date = '${puzzleDate}' and league in ('premier', 'academy');
insert into public.card_editions (season, edition_week, slug, player_name, role, overall, tier, card)
values
  ('S5', '2026-08-24', 'fpldle-premier-smoke', 'Premier Smoke', 'Mid', 84, 'gold', '{"slug":"fpldle-premier-smoke","name":"Premier Smoke","tag":"NA1","teamName":"Smoke FC","role":"Mid","overall":84,"signature":{"champion":"Ahri","games":10}}'::jsonb),
  ('A1', '2026-08-24', 'fpldle-academy-smoke', 'Academy Smoke', 'Support', 78, 'gold', '{"slug":"fpldle-academy-smoke","name":"Academy Smoke","tag":"NA1","teamName":"Smoke Academy","role":"Support","overall":78,"signature":{"champion":"Lulu","games":8}}'::jsonb)
on conflict (season, edition_week, slug) do update
set player_name = excluded.player_name, role = excluded.role, overall = excluded.overall, tier = excluded.tier, card = excluded.card;
`;

  execFileSync("docker", [
    "exec", "-i", database, "psql", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-f", "/dev/stdin",
  ], { input: sql, stdio: ["pipe", "inherit", "inherit"] });
  console.log(`Seeded FPL'dle smoke cards for ${puzzleDate}`);
}

void main();
