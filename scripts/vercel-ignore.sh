#!/usr/bin/env bash
# Vercel's Ignored Build Step (vercel.json → ignoreCommand). Exit 0 skips the
# build and keeps the last deployment; exit 1 builds.
#
# Two rules, because builds were 71% of the bill and most of them were
# building nothing anyone looked at:
#
#   1. Previews are off. Every push to a PR branch used to build a preview
#      URL nobody opened, and the branch reset after each merge built a
#      second one identical to main. Push a branch named preview/<anything>
#      when you actually want a preview URL.
#   2. Production builds only when something the site ships changed. A
#      merge that only touched docs, migrations, scripts or workflows keeps
#      the deployment it already has.
set -u

if [ "${VERCEL_ENV:-}" != "production" ]; then
  case "${VERCEL_GIT_COMMIT_REF:-}" in
    preview/*) echo "Building: ${VERCEL_GIT_COMMIT_REF} asked for a preview."; exit 1 ;;
  esac
  echo "Skipping: previews are off. Push a preview/* branch to get one."
  exit 0
fi

if ! git rev-parse --verify --quiet 'HEAD^' >/dev/null; then
  echo "Building: no parent commit to compare against."
  exit 1
fi

# Everything that changes what `next build` produces. Root config files are
# listed by name so a docs-only or migration-only merge does not count.
SHIPPED=(
  src
  public
  package.json
  package-lock.json
  next.config.ts
  tsconfig.json
  postcss.config.mjs
  vercel.json
)

if git diff --quiet 'HEAD^' HEAD -- "${SHIPPED[@]}"; then
  echo "Skipping: nothing the site ships changed since the last deployment."
  exit 0
fi

echo "Building: shipped files changed."
exit 1
