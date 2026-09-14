# Migration and release contracts

Use this document when adding or reviewing migrations, reconciling database
history, or releasing database-dependent code. Branch and deployment mechanics
are in [README.md](../README.md#branches-and-releases).

## Migration history

- New versions must be unique and sort after every migration on the target
  branch and recorded in the deployment database. Recheck before merging:
  this repository contains future-dated versions.
- Never edit, rename, or delete migrations on the target branch or applied to
  a shared database. Correct them with a forward migration and pgTAP coverage.
- Check committed history with
  `node scripts/check-migrations.mjs <base-commit> [head-commit]`.
  This validates Git history, not the deployment database.

## Database-dependent release

Compare local and remote migration history, review the dry run, apply
backward-compatible migrations, and verify the required RPC signatures and
permissions before deploying dependent application code. Failed migrations or
unresolved history mismatches block that release.

Use the repository wrapper for the linked FPL database:

```sh
node scripts/supabase-migrations.mjs list
node scripts/supabase-migrations.mjs push --dry-run
node scripts/supabase-migrations.mjs push
```

The final command changes the linked database; verify the intended project and
existing release authorization first. The unrelated `ocepp` project is excluded.
See the [wrapper explanation](../README.md#ci-and-what-vercel-builds) for the
legacy duplicate versions it handles without changing source history.

Never mark a migration applied without verifying its SQL changes exist.
History repair does not execute SQL. `--include-all` is a reviewed recovery
option, not a way past duplicate-version warnings: older SQL can overwrite newer
definitions. Investigate a failed dry run before proceeding.
