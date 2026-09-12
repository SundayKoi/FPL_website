<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working in this repository

FPL serves paired Premier and Academy leagues. Keep league/season isolation
and server-enforced access intact when changing shared features.

## Find the relevant context

- [README.md](README.md): setup, commands, and operations; use the relevant section.
- [docs/backend.md](docs/backend.md): client/server boundaries and domain contracts;
  read the affected sections for database, authorization, realtime, betting,
  ingestion, or scheduled-job changes.
- [docs/testing.md](docs/testing.md): checks appropriate to the change and local fixtures.
- [docs/releases.md](docs/releases.md): migration ordering and database-dependent releases;
  read when adding/reviewing migrations or preparing a release.
- [CONTEXT.md](CONTEXT.md): terminology for daily games.
- `docs/superpowers/`: dated plans and designs for historical context. Verify
  their assumptions against current code; their workflow boilerplate does not
  require skills, delegation, approval checkpoints, or task-by-task execution.

## Constraints

- Preserve unrelated working-tree changes.
- Browser and cookie-bound server clients handle normal user-scoped work.
  Service-role clients belong only in trusted server code/scripts, with caller
  authorization at that boundary; keys must never reach client bundles.
- UI access flags are presentation only. RLS, grants, and RPC checks enforce
  permissions and state transitions. Keep shared-state and money transitions
  atomic in their authoritative RPCs.
- `supabase/migrations/` and `supabase/tests/` are the database source of truth.
  Add forward migrations and matching pgTAP coverage. Never edit, rename, or
  delete migrations on the target branch or applied to a shared database.
- Failed migrations or unresolved local/remote history mismatches block release
  of dependent code. History repair does not execute SQL.

## Completion

Carry the requested change through implementation and relevant verification,
fixing failures it introduces. Routine local edits and checks do not need a
separate approval. Use judgment for implementation choices; ask when missing
information changes the intended result or a consequential action lacks authorization.
Report the result, verification evidence, and any remaining blocker. A local
implementation request does not itself authorize production operations.
