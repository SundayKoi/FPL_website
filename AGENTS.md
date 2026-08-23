<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repository-specific guidance

- Read [README.md](README.md) for setup, operations, and test commands.
- Read [docs/backend.md](docs/backend.md) before changing database behavior,
  authorization, realtime flows, betting, stats ingestion, or scheduled jobs.
- Treat `supabase/migrations/` and `supabase/tests/` as the database source of
  truth. Add forward migrations and matching pgTAP coverage; do not edit an
  already-applied migration.
- Use the correct Supabase boundary: browser/server anon clients for normal
  user-scoped work, and the service-role client only in trusted server code or
  scripts. Service-role keys must never reach client bundles.
- UI access flags are presentation only. RLS, grants, and RPC checks must
  enforce permissions and state transitions.
- Preserve unrelated working-tree changes. Before claiming completion, run
  the narrow relevant tests plus the broader checks documented in the README.
