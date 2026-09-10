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

try {
  const base = process.argv[2];
  const head = process.argv[3] || "HEAD";
  if (!base || /^0+$/.test(base)) throw new Error("Supply a valid comparison commit: node scripts/check-migrations.mjs <base> [head]");
  const previous = migrations(base);
  const current = migrations(head);
  const onRelease = released(process.env.MIGRATION_RELEASED ?? "origin/main");
  // Known history: on the comparison branch, or released unchanged.
  const known = (path) => previous.has(path) || (onRelease.has(path) && onRelease.get(path) === current.get(path));
  const errors = [];
  const versions = new Map();
  const pattern = /^supabase\/migrations\/(\d{14})_[a-zA-Z0-9_-]+\.sql$/;
  const highest = [...previous.keys()].map((path) => path.match(pattern)?.[1] || "").sort().at(-1) || "";

  for (const [path, metadata] of previous) {
    if (current.get(path) !== metadata) errors.push(`${path}: existing migrations must not be modified, renamed, or deleted; add a forward migration.`);
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
