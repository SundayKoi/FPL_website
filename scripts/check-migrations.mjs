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

try {
  const base = process.argv[2];
  const head = process.argv[3] || "HEAD";
  if (!base || /^0+$/.test(base)) throw new Error("Supply a valid comparison commit: node scripts/check-migrations.mjs <base> [head]");
  const previous = migrations(base);
  const current = migrations(head);
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
      if (previous.has(path) && previous.has(other)) {
        console.warn(`Existing migration history warning: ${message}`);
      } else {
        errors.push(message);
      }
    }
    versions.set(version, path);
    if (!previous.has(path) && version <= highest) errors.push(`${path}: new version must sort after ${highest} on the comparison branch. Re-version only migrations never applied to any shared database.`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Migration history check passed (${base} → ${head}).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
