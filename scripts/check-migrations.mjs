import { execFileSync } from "node:child_process";

// Compare committed trees, including the synthetic merge commit used by PR CI.
// No database credentials or database writes are needed.
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

function migrations(ref) {
  const tree = git("ls-tree", "-r", "--full-tree", ref, "--", "supabase/migrations/");
  return new Map(tree ? tree.split("\n").map((line) => {
    const [metadata, path] = line.split("\t");
    return [path, metadata];
  }) : []);
}

// Migrations already on the release branch. A file that reached main is, by
// the release contract, already applied to the shared database, so bringing
// it down to develop is not a new migration even when its version sorts
// behind develop's newest — re-versioning it would be exactly the mistake
// the ordering rule exists to prevent. Only a byte-identical file counts.
// The ref is optional: a fixture repo or a checkout without the remote has
// no released set, and MIGRATION_RELEASED= (empty) turns it off.
function released(ref) {
  if (!ref) return new Map();
  try {
    return migrations(ref);
  } catch {
    return new Map();
  }
}

// These files were restored to develop after their versions had already been
// applied to the linked FPL database. Pin the Git blob IDs so this exception
// cannot admit a changed file or an unrelated backdated migration. Verified
// against the remote migration list on 2026-09-23.
const restoredApplied = new Map([
  ["supabase/migrations/20260922052204_rebuild_season_end_draft_after_hash_fix.sql", "100644 blob 787088fc1e1a149e165de22cb592c09b26cd7144"],
  ["supabase/migrations/20261026000001_repair_current_season_end_draft_hashes.sql", "100644 blob db141107626a78ad84a858a8bb70e0230bb1c8ab"],
]);

// Reviewed replay repairs are permitted only for their exact previous/current
// Git blob pairs. The first file references a table created later in migration
// order, so fresh databases fail before reaching its missing-table guard. The
// second file's deployed SQL functions have SELECT CASE bodies, while the
// tracked migration omitted SELECT and could not replay. Pin both sides so
// these remain narrow exceptions, not path-wide migration exemptions.
const authorizedReplayRepairs = new Map([
  ["supabase/migrations/20260922052204_rebuild_season_end_draft_after_hash_fix.sql", {
    previous: "100644 blob 787088fc1e1a149e165de22cb592c09b26cd7144",
    current: "100644 blob ced3709037e6667ec5894ada0fdb4be91d35adf7",
  }],
  ["supabase/migrations/20261018000001_card_art_champion_preferences.sql", {
    previous: "100644 blob adbe558c876189cfefe2702c5792c608e77e1490",
    current: "100644 blob 70cc593739bb010d65bc10d37a458cf17292aaa5",
  }],
]);

try {
  const base = process.argv[2];
  const head = process.argv[3] || "HEAD";
  if (!base || /^0+$/.test(base)) throw new Error("Supply a valid comparison commit: node scripts/check-migrations.mjs <base> [head]");
  const previous = migrations(base);
  const current = migrations(head);
  const onRelease = released(process.env.MIGRATION_RELEASED ?? "origin/main");
  // Known history: on the comparison branch, released unchanged, or a pinned
  // restoration whose version was verified on the linked database.
  const known = (path) => previous.has(path)
    || (onRelease.has(path) && onRelease.get(path) === current.get(path))
    || restoredApplied.get(path) === current.get(path);
  const authorizedReplayRepair = (path) => {
    const repair = authorizedReplayRepairs.get(path);
    return repair !== undefined && previous.get(path) === repair.previous && current.get(path) === repair.current;
  };
  const errors = [];
  const versions = new Map();
  const pattern = /^supabase\/migrations\/(\d{14})_[a-zA-Z0-9_-]+\.sql$/;
  const highest = [...previous.keys()].map((path) => path.match(pattern)?.[1] || "").sort().at(-1) || "";

  for (const [path, metadata] of previous) {
    if (current.get(path) !== metadata && !authorizedReplayRepair(path)) {
      errors.push(`${path}: existing migrations must not be modified, renamed, or deleted; add a forward migration.`);
    }
  }
  for (const [path] of current) {
    if (!path.endsWith(".sql")) continue;
    const version = path.match(pattern)?.[1];
    if (!version) {
      errors.push(`${path}: expected <14-digit-version>_<name>.sql.`);
      continue;
    }
    if (versions.has(version)) {
      const other = versions.get(version);
      const message = `${path}: duplicate version ${version} (also ${other}).`;
      if (known(path) && known(other)) {
        console.warn(`Existing migration history warning: ${message}`);
      } else {
        errors.push(message);
      }
    }
    versions.set(version, path);
    if (!known(path) && version <= highest) errors.push(`${path}: new version must sort after ${highest} on the comparison branch. Re-version only migrations never applied to any shared database.`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Migration history check passed (${base} → ${head}).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
