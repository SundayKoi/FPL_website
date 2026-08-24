#!/usr/bin/env bash
# Teaches the Supabase CLI what this project's remote database already has.
#
# Every migration in supabase/migrations/ has been applied by hand through
# the SQL editor, which does NOT write to supabase_migrations.schema_migrations.
# So the CLI believes the remote is empty and `supabase db push` tries to
# replay all of them from the top — which fails the moment it hits a
# `create table` for something that exists.
#
# This marks the already-applied ones as applied so `db push` only has real
# work left to do. It changes the history ledger only; it never runs DDL.
#
# Usage — pass the versions that are NOT yet applied, so they stay pushable:
#
#   ./scripts/repair-migration-history.sh 20260826000009 20260826000010 \
#     20260826000011 20260827000003
#
# Then check the result and push:
#
#   npx supabase migration list --linked
#   npx supabase db push
#
# With no arguments, EVERY local migration is marked applied — only correct
# when the remote schema is genuinely fully up to date.
set -euo pipefail

cd "$(dirname "$0")/.."

pending=" $* "
versions=()
for file in supabase/migrations/*.sql; do
  version="$(basename "$file")"
  version="${version%%_*}"
  [[ "$pending" == *" $version "* ]] && continue
  versions+=("$version")
done

if [[ ${#versions[@]} -eq 0 ]]; then
  echo "Nothing to repair."
  exit 0
fi

echo "Marking ${#versions[@]} migration(s) as applied; leaving${*:+ $*} pending."
# One call: the CLI takes many versions, and doing it in a single statement
# keeps the ledger consistent if something goes wrong halfway.
npx supabase migration repair --status applied "${versions[@]}"
